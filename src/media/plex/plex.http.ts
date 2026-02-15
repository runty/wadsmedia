import type { z } from "zod";
import { ConnectionError, MediaServerError, ValidationError } from "../errors.js";

export interface PlexRequestOptions {
  baseUrl: string;
  token: string;
  path: string;
  query?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

/**
 * Perform a GET request to a Plex Media Server, validating the response against a Zod schema.
 *
 * - Uses `X-Plex-Token` query/header for authentication
 * - Sends `Accept: application/json` (Plex defaults to XML without this)
 * - Includes client identification headers
 * - Classifies errors into ConnectionError, MediaServerError, or ValidationError
 */
export async function plexRequest<T>(
  options: PlexRequestOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const { baseUrl, token, path, query, timeoutMs = 15_000 } = options;

  const url = new URL(`${baseUrl}/${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Plex-Token": token,
        Accept: "application/json",
        "X-Plex-Client-Identifier": "wadsmedia",
        "X-Plex-Product": "WadsMedia",
        "X-Plex-Version": "2.0.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    if (err instanceof TypeError) {
      throw new ConnectionError("Plex server is unreachable.");
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ConnectionError("Plex server did not respond within the timeout period.");
    }
    throw err;
  }

  if (response.status === 401) {
    throw new MediaServerError(401, "Plex authentication failed. Check your PLEX_TOKEN.");
  }

  if (!response.ok) {
    throw new MediaServerError(response.status, await response.text());
  }

  const json: unknown = await response.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ValidationError(path, result.error);
  }
  return result.data;
}
