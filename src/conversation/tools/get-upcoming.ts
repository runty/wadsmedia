import { z } from "zod";
import { defineTool } from "../tools.js";

/** Format a Date as YYYY-MM-DD in the local timezone (avoids UTC date-shift). */
function localYMD(d: Date): string {
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return d.toLocaleDateString("en-CA", { timeZone: tz }); // en-CA → YYYY-MM-DD
}

export const getUpcomingEpisodesTool = defineTool(
  "get_upcoming_episodes",
  "Get upcoming TV episodes airing soon from shows ALREADY in Sonarr (already scheduled for automatic download). Shows series name, episode title, season/episode numbers, air date, and whether the file has been downloaded yet. Use when the user asks about upcoming episodes, what's airing, TV schedule, what's on the schedule, or 'what's on'. These are NOT suggestions to add -- they are already being tracked and will download automatically.",
  z.object({
    days: z.number().min(1).max(30).optional().describe("Number of days to look ahead (default 7)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.sonarr) {
      return { error: "TV server (Sonarr) is not configured" };
    }

    const days = args.days ?? 7;
    const start = localYMD(new Date());
    const end = localYMD(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

    const [episodes, seriesList] = await Promise.all([
      context.sonarr.getCalendar(start, end),
      context.sonarr.getSeries(),
    ]);

    const seriesMap = new Map<number, string>(seriesList.map((s) => [s.id, s.title]));

    if (episodes.length === 0) {
      return { episodes: [], message: "No upcoming episodes" };
    }

    const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const results = episodes.map((ep) => {
      let airDateLocal: string | null = null;
      if (ep.airDateUtc) {
        const d = new Date(ep.airDateUtc);
        airDateLocal = d.toLocaleString("en-US", {
          timeZone: tz,
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        });
      }
      return {
        seriesTitle: seriesMap.get(ep.seriesId) ?? "Unknown Series",
        title: ep.title ?? null,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        airDate: airDateLocal,
        hasFile: ep.hasFile ?? false,
      };
    });

    return { episodes: results };
  },
);

export const getUpcomingMoviesTool = defineTool(
  "get_upcoming_movies",
  "Get upcoming digital movie releases for movies ALREADY in Radarr (already being monitored for automatic download). Shows title, year, digital release date, and status. Use when the user asks about upcoming movies, new releases, or movie schedules. These are NOT suggestions to add -- they are already being tracked.",
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
    const start = localYMD(new Date());
    const end = localYMD(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

    const movies = await context.radarr.getUpcoming(start, end);

    if (movies.length === 0) {
      return { movies: [], message: "No upcoming movies" };
    }

    const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fmtDate = (iso: string | null | undefined): string | null => {
      if (!iso) return null;
      return new Date(iso).toLocaleDateString("en-US", {
        timeZone: tz,
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };

    const today = start; // YYYY-MM-DD local
    const results = movies
      .filter((movie) => movie.digitalRelease && movie.digitalRelease.slice(0, 10) >= today)
      .map((movie) => ({
        title: movie.title,
        year: movie.year,
        digitalRelease: fmtDate(movie.digitalRelease),
        status: movie.status,
        overview:
          movie.overview && movie.overview.length > 100
            ? `${movie.overview.slice(0, 100)}...`
            : movie.overview,
      }));

    if (results.length === 0) {
      return { movies: [], message: "No upcoming digital releases" };
    }

    return { movies: results };
  },
);
