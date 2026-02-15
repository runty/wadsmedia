import { z } from "zod";
import { tautulliRequest } from "./tautulli.http.js";
import {
  TautulliHistoryDataSchema,
  TautulliUserSchema,
  TautulliWatchTimeStatSchema,
} from "./tautulli.schemas.js";
import type { TautulliHistoryData, TautulliUser, TautulliWatchTimeStat } from "./tautulli.types.js";

export class TautulliClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  /**
   * Get recent watch history from Tautulli.
   * Phase 11 uses global history; per-user filtering deferred to Phase 12.
   */
  async getHistory(opts?: {
    userId?: number;
    mediaType?: "movie" | "episode";
    length?: number;
    startDate?: string;
  }): Promise<TautulliHistoryData> {
    const params: Record<string, string | number | boolean> = {};
    if (opts?.userId !== undefined) params.user_id = opts.userId;
    if (opts?.mediaType) params.media_type = opts.mediaType;
    if (opts?.length !== undefined) params.length = opts.length;
    if (opts?.startDate) params.start_date = opts.startDate;

    return tautulliRequest(
      { baseUrl: this.baseUrl, apiKey: this.apiKey, cmd: "get_history", params },
      TautulliHistoryDataSchema,
    );
  }

  /**
   * Get list of Tautulli users.
   */
  async getUsers(): Promise<TautulliUser[]> {
    return tautulliRequest(
      { baseUrl: this.baseUrl, apiKey: this.apiKey, cmd: "get_users" },
      z.array(TautulliUserSchema),
    );
  }

  /**
   * Get watch time stats for a specific user (7-day, 30-day, all-time).
   */
  async getUserWatchTimeStats(userId: number): Promise<TautulliWatchTimeStat[]> {
    return tautulliRequest(
      {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        cmd: "get_user_watch_time_stats",
        params: { user_id: userId, query_days: "7,30,0" },
      },
      z.array(TautulliWatchTimeStatSchema),
    );
  }

  /**
   * Health check using the Tautulli "arnold" easter egg command.
   * Returns true if the API is reachable and the key is valid.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await tautulliRequest(
        { baseUrl: this.baseUrl, apiKey: this.apiKey, cmd: "arnold", timeoutMs: 5_000 },
        z.unknown(),
      );
      return true;
    } catch {
      return false;
    }
  }
}
