import { z } from "zod";
import { defineTool } from "../tools.js";

export const removeMovieTool = defineTool(
  "remove_movie",
  "Remove a movie from the library. Uses the Radarr library ID (the libraryId from search results, NOT the tmdbId). This is a destructive action requiring user confirmation. Use when the user wants to remove, delete, or get rid of a movie from their library.",
  z.object({
    id: z
      .number()
      .describe(
        "The Radarr library ID of the movie (the 'libraryId' from search results, NOT the tmdbId)",
      ),
    deleteFiles: z.boolean().optional().describe("Also delete downloaded files (default: false)"),
  }),
  "destructive",
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Movie server (Radarr) is not configured" };
    }

    await context.radarr.removeMovie(args.id, {
      deleteFiles: args.deleteFiles ?? false,
      addImportExclusion: false,
    });

    return {
      success: true,
      message: args.deleteFiles
        ? "Movie removed and files deleted"
        : "Movie removed from library (files kept on disk)",
    };
  },
);
