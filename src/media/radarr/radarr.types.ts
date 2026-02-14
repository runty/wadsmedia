import type { z } from "zod";
import type {
  MovieLookupSchema,
  QualityProfileSchema,
  QueuePageSchema,
  QueueRecordSchema,
  RootFolderSchema,
} from "./radarr.schemas.js";

export type MovieLookupResult = z.infer<typeof MovieLookupSchema>;

/** Alias for MovieLookupResult -- identical schema, id is non-zero after add. */
export type Movie = MovieLookupResult;

export type QualityProfile = z.infer<typeof QualityProfileSchema>;
export type RootFolder = z.infer<typeof RootFolderSchema>;
export type QueueRecord = z.infer<typeof QueueRecordSchema>;
export type QueuePage = z.infer<typeof QueuePageSchema>;

/**
 * Input for adding a movie to Radarr.
 * This is a request body, not a response -- no Zod schema needed.
 */
export interface AddMovieInput {
  title: string;
  tmdbId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  minimumAvailability: "announced" | "inCinemas" | "released";
  titleSlug?: string;
  tags?: number[];
  images?: Array<{ coverType: string; remoteUrl?: string; url?: string }>;
  addOptions?: {
    searchForMovie?: boolean;
    monitor?: "movieOnly" | "movieAndCollection" | "none";
  };
}
