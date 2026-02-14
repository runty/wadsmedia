import { z } from "zod";
import { routeMovie } from "../../media/routing/library-router.js";
import type { MovieRoutingMetadata } from "../../media/routing/library-router.types.js";
import { defineTool } from "../tools.js";

export const addMovieTool = defineTool(
  "add_movie",
  "Add a movie to the wanted/download list by its TMDB ID. Automatically applies sensible quality and path defaults. Searches for the movie immediately after adding. Use when the user wants to add, download, get, or request a movie.",
  z.object({
    tmdbId: z.number().describe("The TMDB ID of the movie to add (from search_movies results)"),
    libraryOverride: z
      .enum(["movies", "cmovies"])
      .optional()
      .describe(
        "Override auto-detected library routing. Use 'cmovies' to force Asian movies library, 'movies' to force regular movies library.",
      ),
  }),
  "safe",
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Movie server (Radarr) is not configured" };
    }

    const movie = await context.radarr.lookupByTmdbId(args.tmdbId);

    if (movie.id && movie.id > 0) {
      return {
        alreadyInLibrary: true,
        title: movie.title,
        year: movie.year,
        message: `${movie.title} (${movie.year}) is already in your library`,
      };
    }

    if (context.radarr.qualityProfiles.length === 0 || context.radarr.rootFolders.length === 0) {
      return {
        error: "Radarr configuration incomplete (no quality profiles or root folders configured)",
      };
    }

    // Resolve original language for routing
    // Prefer TMDB ISO 639-1 code if available, fall back to Radarr language name
    let langForRouting: string;
    if (context.tmdb) {
      try {
        const tmdbDetails = await context.tmdb.getMovieDetails(args.tmdbId);
        langForRouting = tmdbDetails.original_language; // ISO 639-1 code
      } catch {
        langForRouting = movie.originalLanguage?.name ?? "English";
      }
    } else {
      langForRouting = movie.originalLanguage?.name ?? "English";
    }

    const routingMeta: MovieRoutingMetadata = {
      originalLanguage: langForRouting,
      genres: movie.genres,
    };

    const config = context.config;
    let rootFolderPath: string;
    let qualityProfileId: number;
    let routingReason: string;

    // Safe to assert: length was checked above
    const defaultFolder = context.radarr.rootFolders[0] as (typeof context.radarr.rootFolders)[0];

    if (args.libraryOverride) {
      // User override bypasses auto-detection
      const { findQualityProfile } = await import("../../media/routing/library-router.js");
      qualityProfileId = findQualityProfile(
        context.radarr.qualityProfiles,
        config?.DEFAULT_QUALITY_PROFILE_HINT,
      );

      if (args.libraryOverride === "cmovies") {
        const hint = config?.RADARR_CMOVIES_ROOT_FOLDER_HINT ?? "cmovies";
        const folder = context.radarr.rootFolders.find((f) =>
          f.path.toLowerCase().includes(hint.toLowerCase()),
        );
        rootFolderPath = folder?.path ?? defaultFolder.path;
        routingReason = "User override: Asian movies library";
      } else {
        rootFolderPath = defaultFolder.path;
        routingReason = "User override: regular movies library";
      }
    } else {
      // Automatic routing
      const routing = routeMovie(
        routingMeta,
        context.radarr.rootFolders,
        context.radarr.qualityProfiles,
        {
          cmoviesRootFolderHint: config?.RADARR_CMOVIES_ROOT_FOLDER_HINT,
          defaultQualityHint: config?.DEFAULT_QUALITY_PROFILE_HINT,
        },
      );
      rootFolderPath = routing.rootFolderPath;
      qualityProfileId = routing.qualityProfileId;
      routingReason = routing.reason;
    }

    const added = await context.radarr.addMovie({
      title: movie.title,
      tmdbId: movie.tmdbId,
      qualityProfileId,
      rootFolderPath,
      monitored: true,
      minimumAvailability: "announced",
      addOptions: { searchForMovie: true },
    });

    const profileName = context.radarr.qualityProfiles.find((p) => p.id === qualityProfileId)?.name;

    return {
      success: true,
      title: added.title,
      year: added.year,
      qualityProfile: profileName,
      rootFolder: rootFolderPath,
      routing: routingReason,
      message: `Added ${added.title} (${added.year}) and searching for downloads`,
    };
  },
);
