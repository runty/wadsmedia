import { z } from "zod";

export const BraveSearchResultSchema = z
  .object({
    title: z.string(),
    url: z.string(),
    description: z.string(),
  })
  .passthrough();

export const BraveSearchResponseSchema = z
  .object({
    web: z
      .object({
        results: z.array(BraveSearchResultSchema),
      })
      .optional(),
    query: z
      .object({
        original: z.string(),
      })
      .optional(),
  })
  .passthrough();
