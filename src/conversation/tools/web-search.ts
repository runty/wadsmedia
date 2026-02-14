import { z } from "zod";
import { defineTool } from "../tools.js";

export const webSearchTool = defineTool(
  "web_search",
  "Search the web for media information when TMDB structured search cannot find what the user is looking for. Best for vague descriptions like 'that movie where the guy relives the same day' or 'show about a chemistry teacher who becomes a drug dealer'. Returns web page titles and descriptions.",
  z.object({
    query: z
      .string()
      .describe("Web search query. Include 'movie' or 'TV show' in the query for better results."),
  }),
  "safe",
  async (args, context) => {
    if (!context.brave) {
      return {
        error: "Web search is not configured (set BRAVE_SEARCH_API_KEY)",
      };
    }

    const results = await context.brave.search(args.query, 5);

    return {
      results: results.map((r) => ({
        title: r.title,
        url: r.url,
        description: r.description,
      })),
      query: args.query,
    };
  },
);
