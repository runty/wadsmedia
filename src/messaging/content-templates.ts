/**
 * Twilio Content Template management via the Content REST API.
 *
 * The Twilio Node SDK does not have complete helpers for Content Template
 * card creation, so we use native fetch() following the project's
 * zero-dependency API client pattern.
 *
 * API docs: https://www.twilio.com/docs/content/content-api-resources
 */

const CONTENT_API_BASE = "https://content.twilio.com/v1/Content";

export interface ContentTemplate {
  sid: string;
  friendly_name: string;
  language: string;
  date_created: string;
  date_updated: string;
}

interface ContentListResponse {
  contents: ContentTemplate[];
  meta: {
    page: number;
    page_size: number;
    first_page_url: string;
    previous_page_url: string | null;
    url: string;
    next_page_url: string | null;
    key: string;
  };
}

function basicAuth(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

/**
 * Search result card template body definition.
 * 4 variables: title, year, overview, posterUrl
 * 3 quick-reply buttons: Add this, Next result, Check Plex
 */
function searchResultTemplateBody(options: { includeMedia: boolean }) {
  return {
    friendly_name: options.includeMedia
      ? "wadsmedia_search_result"
      : "wadsmedia_search_result_text",
    language: "en",
    variables: {
      "1": "Title",
      "2": "Year",
      "3": "Overview text...",
      ...(options.includeMedia
        ? { "4": "https://image.tmdb.org/t/p/w500/placeholder.jpg" }
        : {}),
    },
    types: {
      "twilio/card": {
        title: "{{1}} ({{2}})",
        body: "{{3}}",
        ...(options.includeMedia ? { media: ["{{4}}"] } : {}),
        actions: [
          { type: "QUICK_REPLY", title: "Add this", id: "add_media" },
          { type: "QUICK_REPLY", title: "Next result", id: "next_result" },
          { type: "QUICK_REPLY", title: "Check Plex", id: "check_plex" },
        ],
      },
      "twilio/text": {
        body: "{{1}} ({{2}})\n{{3}}",
      },
    },
  };
}

/**
 * Create a search result card template with poster image media.
 * Variables: 1=title, 2=year, 3=overview, 4=posterUrl
 * Returns the ContentSid (HXxxxx format).
 */
export async function createSearchResultTemplate(
  accountSid: string,
  authToken: string,
): Promise<string> {
  const body = searchResultTemplateBody({ includeMedia: true });

  const response = await fetch(CONTENT_API_BASE, {
    method: "POST",
    headers: {
      Authorization: basicAuth(accountSid, authToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to create search result template: ${response.status} ${text}`,
    );
  }

  const result = (await response.json()) as ContentTemplate;
  return result.sid;
}

/**
 * Create a text-only search result card template (no poster image).
 * For results where posterUrl is null.
 * Variables: 1=title, 2=year, 3=overview
 * Returns the ContentSid (HXxxxx format).
 */
export async function createSearchResultTextOnlyTemplate(
  accountSid: string,
  authToken: string,
): Promise<string> {
  const body = searchResultTemplateBody({ includeMedia: false });

  const response = await fetch(CONTENT_API_BASE, {
    method: "POST",
    headers: {
      Authorization: basicAuth(accountSid, authToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to create text-only search result template: ${response.status} ${text}`,
    );
  }

  const result = (await response.json()) as ContentTemplate;
  return result.sid;
}

/**
 * Fetch a content template by SID.
 * Returns null if not found (404).
 */
export async function getTemplate(
  accountSid: string,
  authToken: string,
  contentSid: string,
): Promise<ContentTemplate | null> {
  const response = await fetch(`${CONTENT_API_BASE}/${contentSid}`, {
    method: "GET",
    headers: {
      Authorization: basicAuth(accountSid, authToken),
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to get template ${contentSid}: ${response.status} ${text}`,
    );
  }

  return (await response.json()) as ContentTemplate;
}

/**
 * List all content templates for the account.
 */
export async function listTemplates(
  accountSid: string,
  authToken: string,
): Promise<ContentTemplate[]> {
  const response = await fetch(CONTENT_API_BASE, {
    method: "GET",
    headers: {
      Authorization: basicAuth(accountSid, authToken),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list templates: ${response.status} ${text}`);
  }

  const result = (await response.json()) as ContentListResponse;
  return result.contents;
}

/**
 * Idempotent helper: find or create the search result template.
 * Looks for friendly_name "wadsmedia_search_result"; creates if not found.
 * This is the primary entry point for the conversation engine.
 */
export async function ensureSearchResultTemplate(
  accountSid: string,
  authToken: string,
): Promise<string> {
  const templates = await listTemplates(accountSid, authToken);
  const existing = templates.find(
    (t) => t.friendly_name === "wadsmedia_search_result",
  );

  if (existing) {
    return existing.sid;
  }

  return createSearchResultTemplate(accountSid, authToken);
}
