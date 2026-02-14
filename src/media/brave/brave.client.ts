import { ConnectionError, MediaServerError, ValidationError } from "../errors.js";
import { BraveSearchResponseSchema } from "./brave.schemas.js";
import type { BraveSearchResult } from "./brave.types.js";

const BRAVE_BASE_URL = "https://api.search.brave.com/res/v1/web/search";

export class BraveSearchClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, count = 5): Promise<BraveSearchResult[]> {
    const url = new URL(BRAVE_BASE_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "X-Subscription-Token": this.apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err: unknown) {
      if (err instanceof TypeError) {
        throw new ConnectionError("Brave Search API is unreachable.");
      }
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new ConnectionError("Brave Search API did not respond within timeout.");
      }
      throw err;
    }

    if (!response.ok) {
      throw new MediaServerError(response.status, await response.text());
    }

    const json: unknown = await response.json();
    const result = BraveSearchResponseSchema.safeParse(json);
    if (!result.success) {
      throw new ValidationError("brave/web/search", result.error);
    }

    return result.data.web?.results ?? [];
  }
}
