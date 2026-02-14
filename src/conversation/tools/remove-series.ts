import { z } from "zod";
import { defineTool } from "../tools.js";

export const removeSeriesTool = defineTool(
  "remove_series",
  "Remove a TV show from the library. Uses the Sonarr library ID (the libraryId from search results, NOT the tvdbId). This is a destructive action requiring user confirmation. Use when the user wants to remove, delete, or get rid of a TV show or series from their library.",
  z.object({
    id: z
      .number()
      .describe(
        "The Sonarr library ID of the series (the 'libraryId' from search results, NOT the tvdbId)",
      ),
    deleteFiles: z.boolean().optional().describe("Also delete downloaded files (default: false)"),
  }),
  "destructive",
  async (args, context) => {
    if (!context.sonarr) {
      return { error: "TV server (Sonarr) is not configured" };
    }

    await context.sonarr.removeSeries(args.id, {
      deleteFiles: args.deleteFiles ?? false,
      addImportListExclusion: false,
    });

    return {
      success: true,
      message: args.deleteFiles
        ? "Series removed and files deleted"
        : "Series removed from library (files kept on disk)",
    };
  },
);
