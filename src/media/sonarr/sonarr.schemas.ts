import { z } from "zod";

export const ImageSchema = z
  .object({
    coverType: z.string(),
    remoteUrl: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough();

export const SeasonSchema = z
  .object({
    seasonNumber: z.number(),
    monitored: z.boolean(),
  })
  .passthrough();

export const SeriesLookupSchema = z
  .object({
    title: z.string(),
    sortTitle: z.string(),
    status: z.string(),
    overview: z.string().nullable(),
    network: z.string().nullable(),
    year: z.number(),
    runtime: z.number(),
    tvdbId: z.number(),
    imdbId: z.string().nullable(),
    tvMazeId: z.number().optional(),
    titleSlug: z.string(),
    images: z.array(ImageSchema),
    seasons: z.array(SeasonSchema),
    genres: z.array(z.string()),
    certification: z.string().nullable().optional(),
    firstAired: z.string().nullable().optional(),
    added: z.string().optional(),
    ratings: z.object({}).passthrough().optional(),
    id: z.number(),
  })
  .passthrough();

/**
 * SeriesSchema is an alias for SeriesLookupSchema.
 * After POST, the id field will be non-zero. The schema is identical
 * since .passthrough() tolerates any additional fields.
 */
export const SeriesSchema = SeriesLookupSchema;

export const QualityProfileSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    upgradeAllowed: z.boolean().optional(),
    cutoff: z.number().optional(),
  })
  .passthrough();

export const RootFolderSchema = z
  .object({
    id: z.number(),
    path: z.string(),
    freeSpace: z.number().optional(),
  })
  .passthrough();

export const EpisodeSchema = z
  .object({
    id: z.number(),
    seriesId: z.number(),
    seasonNumber: z.number(),
    episodeNumber: z.number(),
    title: z.string().nullable().optional(),
    airDateUtc: z.string().nullable().optional(),
    hasFile: z.boolean().optional(),
    monitored: z.boolean().optional(),
  })
  .passthrough();

export const QueueRecordSchema = z
  .object({
    id: z.number(),
    seriesId: z.number().optional(),
    episodeId: z.number().optional(),
    title: z.string().nullable().optional(),
    size: z.number().optional(),
    sizeleft: z.number().optional(),
    status: z.string().optional(),
    trackedDownloadStatus: z.string().nullable().optional(),
    trackedDownloadState: z.string().nullable().optional(),
    timeleft: z.string().nullable().optional(),
    estimatedCompletionTime: z.string().nullable().optional(),
  })
  .passthrough();

export const QueuePageSchema = z
  .object({
    page: z.number(),
    pageSize: z.number(),
    totalRecords: z.number(),
    records: z.array(QueueRecordSchema),
  })
  .passthrough();
