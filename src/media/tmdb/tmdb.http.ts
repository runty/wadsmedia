import type { z } from "zod";
import { ConnectionError, MediaServerError, ValidationError } from "../errors.js";

export interface TmdbRequestOptions {
  accessToken: string;
  path: string;
  query?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

/**
 * Perform a GET request to the TMDB API v3, validating the response against a Zod schema.
 *
 * - Uses `Authorization: Bearer {accessToken}` header
 * - Base URL: https://api.themoviedb.org/3
 * - Path is appended directly (e.g. "search/person", "discover/movie")
 * - Classifies errors into ConnectionError, MediaServerError, or ValidationError
 */
export async function tmdbRequest<T>(
  options: TmdbRequestOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const { accessToken, path, query, timeoutMs = 10_000 } = options;

  const url = new URL(`${TMDB_BASE_URL}/${path}`);
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
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    if (err instanceof TypeError) {
      throw new ConnectionError("TMDB API is unreachable.");
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ConnectionError("TMDB API did not respond within the timeout period.");
    }
    throw err;
  }

  if (response.status === 429) {
    throw new MediaServerError(429, "TMDB rate limit exceeded. Retry shortly.");
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
