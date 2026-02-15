import { z } from "zod";
import { defineTool } from "../tools.js";

export const checkPlexLibraryTool = defineTool(
  "check_plex_library",
  "Check if a movie or TV show exists in the user's Plex library. For TV shows, shows which seasons and episodes are available. Use when the user asks 'do I have...', 'is ... in my library', 'what seasons of ... do I have', or before suggesting the user add something they might already have.",
  z.object({
    title: z.string().describe("The title to check for"),
    type: z.enum(["movie", "show"]).describe("Whether to check for a movie or TV show"),
    tmdbId: z.number().optional().describe("TMDB ID for precise matching (for movies)"),
    tvdbId: z.number().optional().describe("TVDB ID for precise matching (for TV shows)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.plex) {
      return { error: "Plex is not configured" };
    }

    if (!context.plex.isCacheReady) {
      return { error: "Plex library cache is still loading. Try again in a moment." };
    }

    const { title, type, tmdbId, tvdbId } = args;

    // Try ID-based lookup
    let item = type === "movie" && tmdbId ? context.plex.findByTmdbId(tmdbId) : undefined;

    if (!item && type === "show" && tvdbId) {
      item = context.plex.findByTvdbId(tvdbId);
    }

    // Fallback: try TMDB ID for shows (some shows have TMDB GUIDs)
    if (!item && type === "show" && tmdbId) {
      item = context.plex.findByTmdbId(tmdbId);
    }

    if (!item) {
      return {
        found: false,
        title,
        type,
        message: `${title} was not found in your Plex library`,
      };
    }

    if (type === "movie") {
      return {
        found: true,
        title: item.title,
        year: item.year,
        type: "movie",
        library: item.sectionTitle,
        message: `${item.title} (${item.year ?? "unknown year"}) is in your Plex library`,
      };
    }

    // TV show -- try to get season availability
    try {
      const seasons = await context.plex.getShowAvailability(item.ratingKey);
      // Filter out specials (season 0)
      const regularSeasons = seasons.filter((s) => s.seasonNumber > 0);

      const totalSeasons = regularSeasons.length;
      const totalEpisodes = regularSeasons.reduce((sum, s) => sum + s.episodeCount, 0);

      return {
        found: true,
        title: item.title,
        year: item.year,
        type: "show",
        library: item.sectionTitle,
        seasons: regularSeasons.map((s) => ({
          season: s.seasonNumber,
          episodes: s.episodeCount,
          watched: s.viewedCount,
          title: s.title,
        })),
        totalSeasons,
        totalEpisodes,
      };
    } catch {
      // Season fetch failed -- return basic info
      return {
        found: true,
        title: item.title,
        year: item.year,
        type: "show",
        library: item.sectionTitle,
        message: `${item.title} is in your Plex library (season details unavailable)`,
      };
    }
  },
);
