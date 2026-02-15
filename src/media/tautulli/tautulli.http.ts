import { z } from "zod";
import { ConnectionError, MediaServerError, ValidationError } from "../errors.js";

export interface TautulliRequestOptions {
  baseUrl: string;
  apiKey: string;
  cmd: string;
  params?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

/**
 * Zod schema for the Tautulli API response wrapper.
 * All Tautulli responses follow: { response: { result, message, data } }
 */
const TautulliResponseWrapper = z.object({
  response: z.object({
    result: z.string(),
    message: z.string().nullable().optional(),
    data: z.unknown(),
  }),
});

/**
 * Perform a GET request to the Tautulli API v2, validating the response against a Zod schema.
 *
 * - Uses `apikey` query parameter for authentication
 * - Uses `cmd` query parameter to specify the API command
 * - Base path: /api/v2
 * - CRITICAL: Tautulli always returns HTTP 200 even on errors; success is determined by response.result
 * - Classifies errors into ConnectionError, MediaServerError, or ValidationError
 */
export async function tautulliRequest<T>(
  options: TautulliRequestOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const { baseUrl, apiKey, cmd, params, timeoutMs = 10_000 } = options;

  const url = new URL("/api/v2", baseUrl);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("cmd", cmd);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    if (err instanceof TypeError) {
      throw new ConnectionError("Tautulli API is unreachable.");
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ConnectionError("Tautulli API did not respond within the timeout period.");
    }
    throw err;
  }

  // Check for proxy/network-level HTTP errors (Tautulli itself always returns 200)
  if (!response.ok) {
    throw new MediaServerError(response.status, await response.text());
  }

  // Parse and validate the wrapper structure
  const json: unknown = await response.json();
  const wrapperResult = TautulliResponseWrapper.safeParse(json);
  if (!wrapperResult.success) {
    throw new ValidationError(cmd, wrapperResult.error);
  }

  const wrapper = wrapperResult.data;

  // Tautulli returns result !== "success" on API errors (but still HTTP 200)
  if (wrapper.response.result !== "success") {
    throw new MediaServerError(
      200,
      `Tautulli command '${cmd}' failed: ${wrapper.response.message ?? "Unknown error"}`,
    );
  }

  // Validate the actual data against the provided schema
  const dataResult = schema.safeParse(wrapper.response.data);
  if (!dataResult.success) {
    throw new ValidationError(cmd, dataResult.error);
  }

  return dataResult.data;
}
