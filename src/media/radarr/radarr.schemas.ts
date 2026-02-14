import { z } from "zod";

export const ImageSchema = z
  .object({
    coverType: z.string(),
    remoteUrl: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough();

export const MovieLookupSchema = z
  .object({
    title: z.string(),
    originalTitle: z.string().optional(),
    sortTitle: z.string(),
    status: z.string(),
    overview: z.string().nullable(),
    year: z.number(),
    runtime: z.number(),
    tmdbId: z.number(),
    imdbId: z.string().nullable(),
    titleSlug: z.string(),
    cleanTitle: z.string().optional(),
    images: z.array(ImageSchema),
    genres: z.array(z.string()),
    ratings: z.object({}).passthrough().optional(),
    certification: z.string().nullable().optional(),
    studio: z.string().nullable().optional(),
    youTubeTrailerId: z.string().nullable().optional(),
    inCinemas: z.string().nullable().optional(),
    physicalRelease: z.string().nullable().optional(),
    digitalRelease: z.string().nullable().optional(),
    id: z.number(),
  })
  .passthrough();

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

export const QueueRecordSchema = z
  .object({
    id: z.number(),
    movieId: z.number().optional(),
    title: z.string().nullable().optional(),
    size: z.number().optional(),
    sizeleft: z.number().optional(),
    status: z.string().optional(),
    trackedDownloadStatus: z.string().nullable().optional(),
    trackedDownloadState: z.string().nullable().optional(),
    timeleft: z.string().nullable().optional(),
    estimatedCompletionTime: z.string().nullable().optional(),
    protocol: z.string().nullable().optional(),
    downloadClient: z.string().nullable().optional(),
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
