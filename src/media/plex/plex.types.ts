import type { z } from "zod";
import type { PlexSectionSchema } from "./plex.schemas.js";

/** Plex library section (inferred from schema). */
export type PlexLibrarySection = z.infer<typeof PlexSectionSchema>;

/** Normalized library item stored in the cache. */
export interface PlexLibraryItem {
  ratingKey: string;
  title: string;
  year?: number;
  type: "movie" | "show";
  sectionTitle: string;
  leafCount?: number;
  viewedLeafCount?: number;
}

/** Season availability for a TV show. */
export interface SeasonAvailability {
  seasonNumber: number;
  episodeCount: number;
  viewedCount: number;
  title: string;
}
