import { tmdbRequest } from "./tmdb.http.js";
import {
  DiscoverMovieResponseSchema,
  DiscoverTvResponseSchema,
  GenreListSchema,
  MovieDetailSchema,
  PersonSearchResponseSchema,
  TvDetailSchema,
} from "./tmdb.schemas.js";
import type {
  DiscoverMovieResult,
  DiscoverTvResult,
  GenreMap,
  MovieDetail,
  PersonSearchResult,
  TvDetail,
} from "./tmdb.types.js";

export class TmdbClient {
  private readonly accessToken: string;

  /** Cached movie genre map: lowercase name -> TMDB genre ID */
  movieGenres: GenreMap = new Map();
  /** Cached TV genre map: lowercase name -> TMDB genre ID */
  tvGenres: GenreMap = new Map();

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /** Load genre ID maps at startup. Called once by the Fastify plugin. */
  async loadGenres(): Promise<void> {
    const [movieGenres, tvGenres] = await Promise.all([
      tmdbRequest({ accessToken: this.accessToken, path: "genre/movie/list" }, GenreListSchema),
      tmdbRequest({ accessToken: this.accessToken, path: "genre/tv/list" }, GenreListSchema),
    ]);
    this.movieGenres = new Map(movieGenres.genres.map((g) => [g.name.toLowerCase(), g.id]));
    this.tvGenres = new Map(tvGenres.genres.map((g) => [g.name.toLowerCase(), g.id]));
  }

  /** Resolve a genre name to a TMDB genre ID. Tries exact match first, then fuzzy (includes). */
  resolveGenreId(name: string, type: "movie" | "tv"): number | undefined {
    const map = type === "movie" ? this.movieGenres : this.tvGenres;
    const lower = name.toLowerCase();
    return map.get(lower) ?? [...map.entries()].find(([k]) => k.includes(lower))?.[1];
  }

  /** Search for a person by name, return top match or null. */
  async searchPerson(query: string): Promise<PersonSearchResult | null> {
    const result = await tmdbRequest(
      { accessToken: this.accessToken, path: "search/person", query: { query } },
      PersonSearchResponseSchema,
    );
    return result.results[0] ?? null;
  }

  /** Discover movies with structured filters. */
  async discoverMovies(params: {
    withGenres?: string;
    withCast?: string;
    primaryReleaseYear?: number;
    primaryReleaseDateGte?: string;
    primaryReleaseDateLte?: string;
    withOriginalLanguage?: string;
    sortBy?: string;
    voteCountGte?: number;
    page?: number;
  }): Promise<DiscoverMovieResult> {
    const query: Record<string, string | number | boolean> = {};
    if (params.withGenres) query.with_genres = params.withGenres;
    if (params.withCast) query.with_cast = params.withCast;
    if (params.primaryReleaseYear) query.primary_release_year = params.primaryReleaseYear;
    if (params.primaryReleaseDateGte)
      query["primary_release_date.gte"] = params.primaryReleaseDateGte;
    if (params.primaryReleaseDateLte)
      query["primary_release_date.lte"] = params.primaryReleaseDateLte;
    if (params.withOriginalLanguage) query.with_original_language = params.withOriginalLanguage;
    if (params.sortBy) query.sort_by = params.sortBy;
    if (params.voteCountGte) query["vote_count.gte"] = params.voteCountGte;
    if (params.page) query.page = params.page;

    return tmdbRequest(
      { accessToken: this.accessToken, path: "discover/movie", query },
      DiscoverMovieResponseSchema,
    );
  }

  /** Discover TV shows with structured filters. */
  async discoverTv(params: {
    withGenres?: string;
    withNetworks?: string;
    firstAirDateYear?: number;
    firstAirDateGte?: string;
    firstAirDateLte?: string;
    withOriginalLanguage?: string;
    sortBy?: string;
    voteCountGte?: number;
    page?: number;
  }): Promise<DiscoverTvResult> {
    const query: Record<string, string | number | boolean> = {};
    if (params.withGenres) query.with_genres = params.withGenres;
    if (params.withNetworks) query.with_networks = params.withNetworks;
    if (params.firstAirDateYear) query.first_air_date_year = params.firstAirDateYear;
    if (params.firstAirDateGte) query["first_air_date.gte"] = params.firstAirDateGte;
    if (params.firstAirDateLte) query["first_air_date.lte"] = params.firstAirDateLte;
    if (params.withOriginalLanguage) query.with_original_language = params.withOriginalLanguage;
    if (params.sortBy) query.sort_by = params.sortBy;
    if (params.voteCountGte) query["vote_count.gte"] = params.voteCountGte;
    if (params.page) query.page = params.page;

    return tmdbRequest(
      { accessToken: this.accessToken, path: "discover/tv", query },
      DiscoverTvResponseSchema,
    );
  }

  /** Get movie details (for routing metadata). */
  async getMovieDetails(tmdbId: number): Promise<MovieDetail> {
    return tmdbRequest(
      { accessToken: this.accessToken, path: `movie/${tmdbId}` },
      MovieDetailSchema,
    );
  }

  /** Get TV details (for routing metadata). */
  async getTvDetails(tmdbId: number): Promise<TvDetail> {
    return tmdbRequest({ accessToken: this.accessToken, path: `tv/${tmdbId}` }, TvDetailSchema);
  }
}
