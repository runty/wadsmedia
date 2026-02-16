import { z } from "zod";
import { defineTool } from "../tools.js";

export const searchSeriesTool = defineTool(
  "search_series",
  "Search for TV shows by title via Sonarr. Returns matching shows with title, year, network, seasons, overview, and whether they are already monitored in Sonarr (inSonarr). Use when the user wants to find, look up, or search for a TV show, series, or program.",
  z.object({ query: z.string().describe("The TV show title to search for") }),
  "safe",
  async (args, context) => {
    if (!context.sonarr) {
      return { error: "TV server (Sonarr) is not configured" };
    }

    const [searchResults, librarySeries] = await Promise.all([
      context.sonarr.searchSeries(args.query),
      context.sonarr.getSeries(),
    ]);

    const librarySeriesMap = new Map(librarySeries.map((s) => [s.tvdbId, s]));

    if (searchResults.length === 0) {
      return { results: [], message: "No TV shows found" };
    }

    const results = searchResults.slice(0, 10).map((series) => {
      const librarySerie = librarySeriesMap.get(series.tvdbId);
      const posterImage = series.images?.find((img) => img.coverType === "poster");
      return {
        title: series.title,
        year: series.year,
        tvdbId: series.tvdbId,
        network: series.network ?? null,
        seasonCount: series.seasons.length,
        overview:
          series.overview && series.overview.length > 150
            ? `${series.overview.slice(0, 150)}...`
            : series.overview,
        inSonarr: !!librarySerie,
        libraryId: librarySerie?.id ?? null,
        status: series.status,
        posterUrl: posterImage?.remoteUrl ?? null,
      };
    });

    return { results };
  },
);
