import { z } from "zod";

export const TautulliHistoryItemSchema = z
  .object({
    date: z.number(),
    duration: z.number(),
    friendly_name: z.string(),
    full_title: z.string(),
    grandparent_rating_key: z.number().optional(),
    media_type: z.string(),
    platform: z.string(),
    player: z.string(),
    rating_key: z.number(),
    started: z.number(),
    stopped: z.number(),
    title: z.string(),
    user: z.string().optional(),
    user_id: z.number().optional(),
    watched_status: z.number().optional(),
    percent_complete: z.number().optional(),
    transcode_decision: z.string().optional(),
    ip_address: z.string().optional(),
  })
  .passthrough();

export const TautulliHistoryDataSchema = z.object({
  recordsFiltered: z.number(),
  recordsTotal: z.number(),
  data: z.array(TautulliHistoryItemSchema),
  draw: z.number().optional(),
  filter_duration: z.string().optional(),
  total_duration: z.string().optional(),
});

export const TautulliUserSchema = z
  .object({
    user_id: z.number(),
    username: z.string(),
    friendly_name: z.string(),
    email: z.string().optional(),
    is_active: z.number(),
    is_admin: z.number().optional(),
    thumb: z.string().optional(),
    shared_libraries: z.string().optional(),
  })
  .passthrough();

export const TautulliWatchTimeStatSchema = z.object({
  query_days: z.number(),
  total_plays: z.number(),
  total_time: z.number(),
});
