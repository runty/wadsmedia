import type { z } from "zod";
import type {
  DiscoverMovieItemSchema,
  DiscoverMovieResponseSchema,
  DiscoverTvItemSchema,
  DiscoverTvResponseSchema,
  MovieDetailSchema,
  PersonSchema,
  PersonSearchResponseSchema,
  TvDetailSchema,
} from "./tmdb.schemas.js";

/** Lowercase genre name -> TMDB genre ID */
export type GenreMap = Map<string, number>;

export type DiscoverMovieItem = z.infer<typeof DiscoverMovieItemSchema>;
export type DiscoverMovieResult = z.infer<typeof DiscoverMovieResponseSchema>;

export type DiscoverTvItem = z.infer<typeof DiscoverTvItemSchema>;
export type DiscoverTvResult = z.infer<typeof DiscoverTvResponseSchema>;

export type PersonSearchResult = z.infer<typeof PersonSchema>;
export type PersonSearchResponse = z.infer<typeof PersonSearchResponseSchema>;

export type MovieDetail = z.infer<typeof MovieDetailSchema>;
export type TvDetail = z.infer<typeof TvDetailSchema>;
