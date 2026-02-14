import { z } from "zod";
import { defineTool } from "../tools.js";

export const getUpcomingEpisodesTool = defineTool(
  "get_upcoming_episodes",
  "Get upcoming TV episodes airing soon. Shows series name, episode title, season/episode numbers, and air date. Use when the user asks about upcoming episodes, what's airing, TV schedule, or 'what's on'.",
  z.object({
    days: z.number().min(1).max(30).optional().describe("Number of days to look ahead (default 7)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.sonarr) {
      return { error: "TV server (Sonarr) is not configured" };
    }

    const days = args.days ?? 7;
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [episodes, seriesList] = await Promise.all([
      context.sonarr.getCalendar(start, end),
      context.sonarr.getSeries(),
    ]);

    const seriesMap = new Map<number, string>(seriesList.map((s) => [s.id, s.title]));

    if (episodes.length === 0) {
      return { episodes: [], message: "No upcoming episodes" };
    }

    const results = episodes.map((ep) => ({
      seriesTitle: seriesMap.get(ep.seriesId) ?? "Unknown Series",
      title: ep.title ?? null,
      seasonNumber: ep.seasonNumber,
      episodeNumber: ep.episodeNumber,
      airDateUtc: ep.airDateUtc ?? null,
      hasFile: ep.hasFile ?? false,
    }));

    return { episodes: results };
  },
);

export const getUpcomingMoviesTool = defineTool(
  "get_upcoming_movies",
  "Get upcoming movie releases (theatrical, digital, or physical). Shows title, year, release dates, and status. Use when the user asks about upcoming movies, new releases, or movie schedules.",
  z.object({
    days: z
      .number()
      .min(1)
      .max(90)
      .optional()
      .describe("Number of days to look ahead (default 30)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Movie server (Radarr) is not configured" };
    }

    const days = args.days ?? 30;
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const movies = await context.radarr.getUpcoming(start, end);

    if (movies.length === 0) {
      return { movies: [], message: "No upcoming movies" };
    }

    const results = movies.map((movie) => ({
      title: movie.title,
      year: movie.year,
      inCinemas: movie.inCinemas ?? null,
      physicalRelease: movie.physicalRelease ?? null,
      digitalRelease: movie.digitalRelease ?? null,
      status: movie.status,
      overview:
        movie.overview && movie.overview.length > 100
          ? `${movie.overview.slice(0, 100)}...`
          : movie.overview,
    }));

    return { movies: results };
  },
);
