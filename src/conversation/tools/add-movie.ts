import { z } from "zod";
import { defineTool } from "../tools.js";

export const addMovieTool = defineTool(
  "add_movie",
  "Add a movie to the wanted/download list by its TMDB ID. Automatically applies sensible quality and path defaults. Searches for the movie immediately after adding. Use when the user wants to add, download, get, or request a movie.",
  z.object({
    tmdbId: z.number().describe("The TMDB ID of the movie to add (from search_movies results)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Movie server (Radarr) is not configured" };
    }

    const movie = await context.radarr.lookupByTmdbId(args.tmdbId);

    if (movie.id > 0) {
      return {
        alreadyInLibrary: true,
        title: movie.title,
        year: movie.year,
        message: `${movie.title} (${movie.year}) is already in your library`,
      };
    }

    const qualityProfile = context.radarr.qualityProfiles[0];
    const rootFolder = context.radarr.rootFolders[0];

    if (!qualityProfile || !rootFolder) {
      return {
        error: "Radarr configuration incomplete (no quality profiles or root folders configured)",
      };
    }

    const added = await context.radarr.addMovie({
      title: movie.title,
      tmdbId: movie.tmdbId,
      qualityProfileId: qualityProfile.id,
      rootFolderPath: rootFolder.path,
      monitored: true,
      minimumAvailability: "announced",
      addOptions: { searchForMovie: true },
    });

    return {
      success: true,
      title: added.title,
      year: added.year,
      qualityProfile: qualityProfile.name,
      message: `Added ${added.title} (${added.year}) and searching for downloads`,
    };
  },
);
