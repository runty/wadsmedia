import { z } from "zod";

/** GUID entry from Plex metadata (e.g., { id: "tmdb://12345" }). */
export const PlexGuidSchema = z.object({ id: z.string() }).passthrough();

/** Library section (directory) from /library/sections. */
export const PlexSectionSchema = z
  .object({
    key: z.string(),
    title: z.string(),
    type: z.string(),
    agent: z.string().optional(),
    scanner: z.string().optional(),
  })
  .passthrough();

/** Response from GET /library/sections. */
export const PlexSectionsResponseSchema = z.object({
  MediaContainer: z
    .object({
      Directory: z.array(PlexSectionSchema),
    })
    .passthrough(),
});

/** Individual library item (movie or show) from section/all. */
export const PlexLibraryItemSchema = z
  .object({
    ratingKey: z.string(),
    title: z.string(),
    year: z.number().optional(),
    type: z.string().optional(),
    leafCount: z.number().optional(),
    viewedLeafCount: z.number().optional(),
    Guid: z.array(PlexGuidSchema).optional(),
  })
  .passthrough();

/** Response from GET /library/sections/{key}/all. */
export const PlexLibraryItemsResponseSchema = z.object({
  MediaContainer: z
    .object({
      Metadata: z.array(PlexLibraryItemSchema).optional(),
      size: z.number().optional(),
    })
    .passthrough(),
});

/** Child item (season) from show metadata children. */
export const PlexChildItemSchema = z
  .object({
    ratingKey: z.string(),
    title: z.string(),
    index: z.number().optional(),
    leafCount: z.number().optional(),
    viewedLeafCount: z.number().optional(),
    type: z.string().optional(),
  })
  .passthrough();

/** Response from GET /library/metadata/{ratingKey}/children. */
export const PlexChildrenResponseSchema = z.object({
  MediaContainer: z
    .object({
      Metadata: z.array(PlexChildItemSchema).optional(),
      size: z.number().optional(),
    })
    .passthrough(),
});
