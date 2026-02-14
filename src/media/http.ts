import type { z } from "zod";
import {
  ConnectionError,
  MediaServerError,
  ValidationError,
} from "./errors.js";

export interface HttpRequestOptions {
  baseUrl: string;
  apiKey: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

/**
 * Perform an API request to a media server, validating the response against a Zod schema.
 *
 * - Injects the API key via `X-Api-Key` header
 * - Uses `AbortSignal.timeout()` for request timeouts
 * - Classifies errors into ConnectionError, MediaServerError, or ValidationError
 */
export async function apiRequest<T>(
  options: HttpRequestOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const {
    baseUrl,
    apiKey,
    path,
    method = "GET",
    body,
    query,
    timeoutMs = 10_000,
  } = options;

  const url = new URL(`/api/v3/${path}`, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    const hostname = new URL(baseUrl).hostname;
    if (
      err instanceof TypeError
    ) {
      throw new ConnectionError(
        `${hostname} is unreachable. Check that the server is running and the URL is correct.`,
      );
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ConnectionError(
        `${hostname} did not respond within the timeout period.`,
      );
    }
    throw err;
  }

  if (!response.ok) {
    throw new MediaServerError(response.status, await response.text());
  }

  if (method === "DELETE") {
    return undefined as T;
  }

  const json: unknown = await response.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ValidationError(path, result.error);
  }
  return result.data;
}

/**
 * Perform an API request that returns no body (e.g. DELETE operations).
 *
 * Does not parse the response body. Still checks response.ok and throws
 * MediaServerError on non-2xx responses.
 */
export async function apiRequestVoid(
  options: HttpRequestOptions,
): Promise<void> {
  const {
    baseUrl,
    apiKey,
    path,
    method = "DELETE",
    body,
    query,
    timeoutMs = 10_000,
  } = options;

  const url = new URL(`/api/v3/${path}`, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    const hostname = new URL(baseUrl).hostname;
    if (
      err instanceof TypeError
    ) {
      throw new ConnectionError(
        `${hostname} is unreachable. Check that the server is running and the URL is correct.`,
      );
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ConnectionError(
        `${hostname} did not respond within the timeout period.`,
      );
    }
    throw err;
  }

  if (!response.ok) {
    throw new MediaServerError(response.status, await response.text());
  }
}
