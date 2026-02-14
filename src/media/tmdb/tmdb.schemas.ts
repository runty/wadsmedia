import { z } from "zod";

/** Paginated response wrapper used by search and discover endpoints. */
const PaginatedSchema = <T extends z.ZodType>(resultSchema: T) =>
  z.object({
    page: z.number(),
    results: z.array(resultSchema),
    total_pages: z.number(),
    total_results: z.number(),
  });

/** Genre object from genre list endpoint. */
export const GenreSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const GenreListSchema = z.object({
  genres: z.array(GenreSchema),
});

/** Movie result from discover/movie or search/movie. */
export const DiscoverMovieItemSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    original_title: z.string().optional(),
    overview: z.string().nullable(),
    release_date: z.string().nullable().optional(),
    genre_ids: z.array(z.number()),
    original_language: z.string(),
    vote_average: z.number(),
    vote_count: z.number(),
    poster_path: z.string().nullable(),
    backdrop_path: z.string().nullable().optional(),
    popularity: z.number(),
    adult: z.boolean().optional(),
  })
  .passthrough();

export const DiscoverMovieResponseSchema = PaginatedSchema(DiscoverMovieItemSchema);

/** TV result from discover/tv or search/tv. */
export const DiscoverTvItemSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    original_name: z.string().optional(),
    overview: z.string().nullable(),
    first_air_date: z.string().nullable().optional(),
    genre_ids: z.array(z.number()),
    original_language: z.string(),
    origin_country: z.array(z.string()),
    vote_average: z.number(),
    vote_count: z.number(),
    poster_path: z.string().nullable(),
    backdrop_path: z.string().nullable().optional(),
    popularity: z.number(),
  })
  .passthrough();

export const DiscoverTvResponseSchema = PaginatedSchema(DiscoverTvItemSchema);

/** Person from search/person. */
export const PersonSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    popularity: z.number(),
    profile_path: z.string().nullable().optional(),
    known_for_department: z.string().optional(),
  })
  .passthrough();

export const PersonSearchResponseSchema = PaginatedSchema(PersonSchema);

/** Movie detail (for routing metadata). */
export const MovieDetailSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    original_language: z.string(),
    genres: z.array(GenreSchema),
    overview: z.string().nullable(),
    release_date: z.string().nullable().optional(),
    vote_average: z.number(),
    vote_count: z.number(),
    poster_path: z.string().nullable(),
    production_countries: z
      .array(
        z.object({
          iso_3166_1: z.string(),
          name: z.string(),
        }),
      )
      .optional(),
    spoken_languages: z
      .array(
        z.object({
          iso_639_1: z.string(),
          name: z.string(),
        }),
      )
      .optional(),
  })
  .passthrough();

/** TV series detail (for routing metadata). */
export const TvDetailSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    original_language: z.string(),
    origin_country: z.array(z.string()),
    genres: z.array(GenreSchema),
    overview: z.string().nullable(),
    first_air_date: z.string().nullable().optional(),
    vote_average: z.number(),
    vote_count: z.number(),
    poster_path: z.string().nullable(),
    number_of_seasons: z.number().optional(),
  })
  .passthrough();
