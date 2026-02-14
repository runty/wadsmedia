import { z } from "zod";
import { routeSeries } from "../../media/routing/library-router.js";
import type { SeriesRoutingMetadata } from "../../media/routing/library-router.types.js";
import { defineTool } from "../tools.js";

export const addSeriesTool = defineTool(
  "add_series",
  "Add a TV show to the wanted/download list by its TVDB ID. Automatically applies sensible quality, path, and monitoring defaults. Searches for missing episodes immediately. Use when the user wants to add, download, get, or request a TV show or series.",
  z.object({
    tvdbId: z.number().describe("The TVDB ID of the series to add (from search_series results)"),
    libraryOverride: z
      .enum(["anime", "tv"])
      .optional()
      .describe(
        "Override auto-detected library routing. Use 'anime' to force anime library, 'tv' to force regular TV library.",
      ),
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

    if (context.sonarr.qualityProfiles.length === 0 || context.sonarr.rootFolders.length === 0) {
      return {
        error: "Sonarr configuration incomplete (no quality profiles or root folders configured)",
      };
    }

    // Build routing metadata from Sonarr lookup data
    const routingMeta: SeriesRoutingMetadata = {
      genres: series.genres,
      network: series.network ?? null,
    };

    const config = context.config;
    let rootFolderPath: string;
    let qualityProfileId: number;
    let seriesType: "standard" | "daily" | "anime" | undefined;
    let routingReason: string;

    // Safe to assert: length was checked above
    const defaultFolder = context.sonarr.rootFolders[0] as (typeof context.sonarr.rootFolders)[0];

    if (args.libraryOverride) {
      // User override bypasses auto-detection
      const { findQualityProfile } = await import("../../media/routing/library-router.js");
      qualityProfileId = findQualityProfile(
        context.sonarr.qualityProfiles,
        config?.DEFAULT_QUALITY_PROFILE_HINT,
      );

      if (args.libraryOverride === "anime") {
        const hint = config?.SONARR_ANIME_ROOT_FOLDER_HINT ?? "anime";
        const folder = context.sonarr.rootFolders.find((f) =>
          f.path.toLowerCase().includes(hint.toLowerCase()),
        );
        rootFolderPath = folder?.path ?? defaultFolder.path;
        seriesType = "anime";
        routingReason = "User override: anime library";
      } else {
        rootFolderPath = defaultFolder.path;
        seriesType = "standard";
        routingReason = "User override: regular TV library";
      }
    } else {
      // Automatic routing
      const routing = routeSeries(
        routingMeta,
        context.sonarr.rootFolders,
        context.sonarr.qualityProfiles,
        {
          animeRootFolderHint: config?.SONARR_ANIME_ROOT_FOLDER_HINT,
          defaultQualityHint: config?.DEFAULT_QUALITY_PROFILE_HINT,
        },
      );
      rootFolderPath = routing.rootFolderPath;
      qualityProfileId = routing.qualityProfileId;
      seriesType = routing.seriesType;
      routingReason = routing.reason;
    }

    const added = await context.sonarr.addSeries({
      title: series.title,
      tvdbId: series.tvdbId,
      qualityProfileId,
      rootFolderPath,
      titleSlug: series.titleSlug,
      images: series.images,
      seasons: series.seasons,
      monitored: true,
      seasonFolder: true,
      seriesType,
      addOptions: { searchForMissingEpisodes: true, monitor: "all" },
    });

    const profileName = context.sonarr.qualityProfiles.find((p) => p.id === qualityProfileId)?.name;

    return {
      success: true,
      title: added.title,
      year: added.year,
      seasonCount: added.seasons.length,
      qualityProfile: profileName,
      rootFolder: rootFolderPath,
      routing: routingReason,
      message: `Added ${added.title} (${added.year}) and searching for episodes`,
    };
  },
);
