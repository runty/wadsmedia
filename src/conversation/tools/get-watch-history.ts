import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schema.js";
import { defineTool } from "../tools.js";

export const getWatchHistoryTool = defineTool(
  "get_watch_history",
  "Get recent watch history from Tautulli/Plex. Shows what has been watched recently, including title, date, and duration. Use when the user asks 'what have I been watching', 'what did I watch recently', or 'my watch history'.",
  z.object({
    mediaType: z
      .enum(["movie", "episode"])
      .optional()
      .describe("Filter by media type: movie or episode (TV). Omit for all types."),
    limit: z
      .number()
      .min(1)
      .max(25)
      .optional()
      .describe("Number of recent items to return (default 10, max 25)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.tautulli) {
      return { error: "Tautulli is not configured" };
    }

    // Look up the user's linked Plex account for per-user filtering
    let plexUserId: number | undefined;
    if (context.db) {
      const user = context.db
        .select({ plexUserId: users.plexUserId })
        .from(users)
        .where(eq(users.id, context.userId))
        .get();
      if (user?.plexUserId) {
        plexUserId = user.plexUserId;
      }
    }

    const history = await context.tautulli.getHistory({
      userId: plexUserId,
      mediaType: args.mediaType,
      length: args.limit ?? 10,
    });

    if (!history.data || history.data.length === 0) {
      return { results: [], message: "No recent watch history found" };
    }

    const results = history.data.map((entry) => ({
      title: entry.full_title,
      mediaType: entry.media_type,
      watchedDate: entry.date,
      duration: entry.duration,
      user: entry.friendly_name,
      platform: entry.platform,
      player: entry.player,
      percentComplete: entry.percent_complete,
    }));

    return { results };
  },
);
