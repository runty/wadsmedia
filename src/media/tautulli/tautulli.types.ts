import type { z } from "zod";
import type {
  TautulliHistoryDataSchema,
  TautulliHistoryItemSchema,
  TautulliUserSchema,
  TautulliWatchTimeStatSchema,
} from "./tautulli.schemas.js";

export type TautulliHistoryItem = z.infer<typeof TautulliHistoryItemSchema>;
export type TautulliHistoryData = z.infer<typeof TautulliHistoryDataSchema>;
export type TautulliUser = z.infer<typeof TautulliUserSchema>;
export type TautulliWatchTimeStat = z.infer<typeof TautulliWatchTimeStatSchema>;
