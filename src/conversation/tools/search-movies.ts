import { z } from "zod";
import { defineTool } from "../tools.js";

export const searchMoviesTool = defineTool(
  "search_movies",
  "Search for movies by title. Returns matching movies with title, year, overview, and whether they are already in the user's library. Use when the user wants to find, look up, or search for a movie.",
  z.object({ query: z.string().describe("The movie title to search for") }),
  "safe",
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Movie server (Radarr) is not configured" };
    }

    const [searchResults, libraryMovies] = await Promise.all([
      context.radarr.searchMovies(args.query),
      context.radarr.getMovies(),
    ]);

    const libraryMovieMap = new Map(libraryMovies.map((m) => [m.tmdbId, m]));

    if (searchResults.length === 0) {
      return { results: [], message: "No movies found" };
    }

    const results = searchResults.slice(0, 10).map((movie) => {
      const libraryMovie = libraryMovieMap.get(movie.tmdbId);
      return {
        title: movie.title,
        year: movie.year,
        tmdbId: movie.tmdbId,
        overview:
          movie.overview && movie.overview.length > 150
            ? `${movie.overview.slice(0, 150)}...`
            : movie.overview,
        inLibrary: !!libraryMovie,
        libraryId: libraryMovie?.id ?? null,
        status: movie.status,
        studio: movie.studio ?? null,
      };
    });

    return { results };
  },
);
