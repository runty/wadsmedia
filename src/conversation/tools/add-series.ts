import { z } from "zod";
import { defineTool } from "../tools.js";

export const addSeriesTool = defineTool(
  "add_series",
  "Add a TV show to the wanted/download list by its TVDB ID. Automatically applies sensible quality, path, and monitoring defaults. Searches for missing episodes immediately. Use when the user wants to add, download, get, or request a TV show or series.",
  z.object({
    tvdbId: z.number().describe("The TVDB ID of the series to add (from search_series results)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.sonarr) {
      return { error: "TV server (Sonarr) is not configured" };
    }

    const results = await context.sonarr.searchSeries(`tvdb:${args.tvdbId}`);
    const series = results.find((s) => s.tvdbId === args.tvdbId);

    if (!series) {
      return { error: "Could not find series with that TVDB ID" };
    }

    if (series.id && series.id > 0) {
      return {
        alreadyInLibrary: true,
        title: series.title,
        year: series.year,
        message: `${series.title} (${series.year}) is already in your library`,
      };
    }

    const qualityProfile = context.sonarr.qualityProfiles[0];
    const rootFolder = context.sonarr.rootFolders[0];

    if (!qualityProfile || !rootFolder) {
      return {
        error: "Sonarr configuration incomplete (no quality profiles or root folders configured)",
      };
    }

    const added = await context.sonarr.addSeries({
      title: series.title,
      tvdbId: series.tvdbId,
      qualityProfileId: qualityProfile.id,
      rootFolderPath: rootFolder.path,
      titleSlug: series.titleSlug,
      images: series.images,
      seasons: series.seasons,
      monitored: true,
      seasonFolder: true,
      addOptions: { searchForMissingEpisodes: true, monitor: "all" },
    });

    return {
      success: true,
      title: added.title,
      year: added.year,
      seasonCount: added.seasons.length,
      qualityProfile: qualityProfile.name,
      message: `Added ${added.title} (${added.year}) and searching for episodes`,
    };
  },
);
