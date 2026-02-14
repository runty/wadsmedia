import type { z } from "zod";
import type {
  EpisodeSchema,
  QualityProfileSchema,
  QueuePageSchema,
  QueueRecordSchema,
  RootFolderSchema,
  SeriesLookupSchema,
  SeriesSchema,
} from "./sonarr.schemas.js";

export type SeriesLookupResult = z.infer<typeof SeriesLookupSchema>;

/** Series in library -- id is always present. */
export type Series = z.infer<typeof SeriesSchema>;

export type QualityProfile = z.infer<typeof QualityProfileSchema>;
export type RootFolder = z.infer<typeof RootFolderSchema>;
export type Episode = z.infer<typeof EpisodeSchema>;
export type QueueRecord = z.infer<typeof QueueRecordSchema>;
export type QueuePage = z.infer<typeof QueuePageSchema>;

/**
 * Input for adding a series to Sonarr.
 * This is a request body, not a response -- no Zod schema needed.
 */
export interface AddSeriesInput {
  title: string;
  tvdbId: number;
  qualityProfileId: number;
  rootFolderPath: string;
  titleSlug: string;
  images: Array<{ coverType: string; remoteUrl?: string; url?: string }>;
  seasons: Array<{ seasonNumber: number; monitored: boolean }>;
  monitored: boolean;
  seasonFolder?: boolean;
  seriesType?: "standard" | "daily" | "anime";
  tags?: number[];
  addOptions?: {
    searchForMissingEpisodes?: boolean;
    monitor?:
      | "all"
      | "future"
      | "missing"
      | "existing"
      | "pilot"
      | "firstSeason"
      | "lastSeason"
      | "none";
  };
}
