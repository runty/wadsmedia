import type { z } from "zod";
import type { BraveSearchResponseSchema, BraveSearchResultSchema } from "./brave.schemas.js";

export type BraveSearchResult = z.infer<typeof BraveSearchResultSchema>;
export type BraveSearchResponse = z.infer<typeof BraveSearchResponseSchema>;
