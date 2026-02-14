import type { z } from "zod";

/**
 * Thrown when the media server API returns a non-2xx status code.
 */
export class MediaServerError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(statusCode: number, responseBody: string) {
    super(`Media server returned ${statusCode}: ${responseBody}`);
    this.name = "MediaServerError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/**
 * Thrown when the media server is unreachable or the request times out.
 */
export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

/**
 * Thrown when the API response fails Zod schema validation.
 */
export class ValidationError extends Error {
  readonly endpoint: string;
  readonly zodError: z.ZodError;

  constructor(endpoint: string, zodError: z.ZodError) {
    super(
      `Unexpected response from ${endpoint}: ${zodError.message}`,
    );
    this.name = "ValidationError";
    this.endpoint = endpoint;
    this.zodError = zodError;
  }
}
