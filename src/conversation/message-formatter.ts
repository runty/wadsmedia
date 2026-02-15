import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { OutboundMessage } from "../messaging/types.js";
import { ensureSearchResultTemplate } from "../messaging/content-templates.js";

interface RichCardContext {
  accountSid: string;
  authToken: string;
  messagingServiceSid?: string;
  phoneNumber?: string;
}

interface RichCardResult {
  outboundMessage: OutboundMessage;
  textFallback: string; // The LLM's original text reply (for history)
}

interface SearchResultData {
  title: string;
  year: number | string | null;
  overview: string | null;
  posterUrl: string | null;
}

/**
 * Scan messages from the end backward looking for the most recent tool result
 * that contains search/discover data (results array with title + tmdbId/tvdbId).
 */
export function extractLatestSearchResult(
  messages: ChatCompletionMessageParam[],
): SearchResultData | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as ChatCompletionMessageParam | undefined;
    if (!msg || msg.role !== "tool" || typeof msg.content !== "string") continue;

    try {
      const parsed = JSON.parse(msg.content);
      // Check for results array pattern (search_movies, search_series, discover_media)
      if (Array.isArray(parsed.results) && parsed.results.length > 0) {
        const top = parsed.results[0];
        if (top.title && (top.tmdbId !== undefined || top.tvdbId !== undefined)) {
          return {
            title: top.title,
            year: top.year ?? null,
            overview: top.overview ?? null,
            posterUrl: top.posterUrl ?? null,
          };
        }
      }
    } catch {
      // Not JSON or not the expected shape -- skip
    }
  }
  return null;
}

/**
 * Attempt to format the most recent search/discover result as a rich card.
 * Returns null if no rich card is appropriate (no search results, no template config, etc).
 */
export async function formatAsRichCard(
  messagesConsumed: ChatCompletionMessageParam[],
  textReply: string,
  to: string,
  richContext: RichCardContext,
): Promise<RichCardResult | null> {
  // 1. Find the last tool result message that looks like search/discover output
  const searchResult = extractLatestSearchResult(messagesConsumed);
  if (!searchResult) return null;

  // 2. Ensure content template exists (idempotent)
  let contentSid: string;
  try {
    contentSid = await ensureSearchResultTemplate(
      richContext.accountSid,
      richContext.authToken,
    );
  } catch {
    // Template creation failed -- fall back to plain text
    return null;
  }

  // 3. Build content variables
  const variables: Record<string, string> = {
    "1": searchResult.title,
    "2": String(searchResult.year ?? ""),
    "3": searchResult.overview ?? "",
  };
  if (searchResult.posterUrl) {
    variables["4"] = searchResult.posterUrl;
  }

  // 4. Build the OutboundMessage
  const outboundMessage: OutboundMessage = {
    to,
    contentSid,
    contentVariables: JSON.stringify(variables),
    ...(richContext.messagingServiceSid
      ? { messagingServiceSid: richContext.messagingServiceSid }
      : { from: richContext.phoneNumber }),
  };

  return { outboundMessage, textFallback: textReply };
}
