import { z } from "zod";
import { tmdbImageUrl } from "../../media/tmdb/tmdb.utils.js";
import { defineTool } from "../tools.js";

export const discoverMediaTool = defineTool(
  "discover_media",
  "Discover movies or TV shows by genre, actor, year, language, or keyword. Use for requests like 'sci-fi movies from the 90s', 'what has Oscar Isaac been in', or 'Korean dramas'. NOT for title search -- use search_movies/search_series for title lookups.",
  z.object({
    type: z.enum(["movie", "tv"]).describe("Whether to discover movies or TV shows"),
    genre: z
      .string()
      .optional()
      .describe("Genre name (e.g. 'sci-fi', 'comedy', 'horror', 'drama', 'animation')"),
    actor: z.string().optional().describe("Actor name (e.g. 'Oscar Isaac', 'Florence Pugh')"),
    yearFrom: z.number().optional().describe("Earliest year (e.g. 1990)"),
    yearTo: z.number().optional().describe("Latest year (e.g. 1999)"),
    language: z
      .string()
      .optional()
      .describe("Original language ISO 639-1 code (e.g. 'ko' for Korean, 'ja' for Japanese)"),
    keyword: z.string().optional().describe("Theme or keyword (e.g. 'time travel', 'zombies')"),
  }),
  "safe",
  async (args, context) => {
    if (!context.tmdb) {
      return { error: "TMDB is not configured (set TMDB_ACCESS_TOKEN)" };
    }

    // Resolve genre name to ID
    let genreId: string | undefined;
    if (args.genre) {
      const id = context.tmdb.resolveGenreId(args.genre, args.type);
      if (id) genreId = String(id);
      // If genre not found, silently omit -- better than error for close-enough names
    }

    // Resolve actor name to person ID
    let castId: string | undefined;
    if (args.actor) {
      const person = await context.tmdb.searchPerson(args.actor);
      if (person) castId = String(person.id);
      else return { error: `Could not find actor "${args.actor}" on TMDB` };
    }

    if (args.type === "movie") {
      const results = await context.tmdb.discoverMovies({
        withGenres: genreId,
        withCast: castId,
        primaryReleaseDateGte: args.yearFrom ? `${args.yearFrom}-01-01` : undefined,
        primaryReleaseDateLte: args.yearTo ? `${args.yearTo}-12-31` : undefined,
        withOriginalLanguage: args.language,
        sortBy: "popularity.desc",
        voteCountGte: 50,
      });

      return {
        results: results.results.slice(0, 8).map((m) => ({
          title: m.title,
          year: m.release_date?.split("-")[0] ?? null,
          tmdbId: m.id,
          overview:
            m.overview && m.overview.length > 150 ? `${m.overview.slice(0, 150)}...` : m.overview,
          rating: m.vote_average,
          posterUrl: tmdbImageUrl(m.poster_path),
          language: m.original_language,
        })),
        totalResults: results.total_results,
      };
    }

    // TV discovery
    const results = await context.tmdb.discoverTv({
      withGenres: genreId,
      firstAirDateGte: args.yearFrom ? `${args.yearFrom}-01-01` : undefined,
      firstAirDateLte: args.yearTo ? `${args.yearTo}-12-31` : undefined,
      withOriginalLanguage: args.language,
      sortBy: "popularity.desc",
      voteCountGte: 50,
    });

    return {
      results: results.results.slice(0, 8).map((s) => ({
        title: s.name,
        year: s.first_air_date?.split("-")[0] ?? null,
        tmdbId: s.id,
        overview:
          s.overview && s.overview.length > 150 ? `${s.overview.slice(0, 150)}...` : s.overview,
        rating: s.vote_average,
        posterUrl: tmdbImageUrl(s.poster_path),
        language: s.original_language,
        originCountry: s.origin_country,
      })),
      totalResults: results.total_results,
    };
  },
);
