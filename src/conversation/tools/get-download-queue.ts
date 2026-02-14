import { z } from "zod";
import { defineTool } from "../tools.js";

export const getDownloadQueueTool = defineTool(
  "get_download_queue",
  "Check the current download queue for active and pending downloads. Shows what media is being downloaded, progress, and estimated time remaining. Use when the user asks about download status, queue, what's downloading, or progress.",
  z.object({}),
  "safe",
  async (_args, context) => {
    if (!context.sonarr && !context.radarr) {
      return { error: "No media servers configured" };
    }

    const errors: string[] = [];
    let episodes: Array<{
      title: string | null | undefined;
      series: string;
      status: string | undefined;
      trackedDownloadState: string | null | undefined;
      progress: number | null;
      timeleft: string | null | undefined;
      estimatedCompletionTime: string | null | undefined;
    }> = [];
    let movies: Array<{
      title: string | null | undefined;
      status: string | undefined;
      trackedDownloadState: string | null | undefined;
      progress: number | null;
      timeleft: string | null | undefined;
      estimatedCompletionTime: string | null | undefined;
    }> = [];

    if (context.sonarr) {
      try {
        const [queue, seriesList] = await Promise.all([
          context.sonarr.getQueue({ pageSize: 20 }),
          context.sonarr.getSeries(),
        ]);

        const seriesMap = new Map<number, string>(seriesList.map((s) => [s.id, s.title]));

        episodes = queue.records.map((record) => ({
          title: record.title,
          series: seriesMap.get(record.seriesId ?? 0) ?? "Unknown Series",
          status: record.status,
          trackedDownloadState: record.trackedDownloadState,
          progress:
            record.size && record.sizeleft != null
              ? Math.round(((record.size - record.sizeleft) / record.size) * 100)
              : null,
          timeleft: record.timeleft,
          estimatedCompletionTime: record.estimatedCompletionTime,
        }));
      } catch {
        errors.push("Could not reach TV server (Sonarr)");
      }
    }

    if (context.radarr) {
      try {
        const queue = await context.radarr.getQueue({ pageSize: 20 });

        movies = queue.records.map((record) => ({
          title: record.title,
          status: record.status,
          trackedDownloadState: record.trackedDownloadState,
          progress:
            record.size && record.sizeleft != null
              ? Math.round(((record.size - record.sizeleft) / record.size) * 100)
              : null,
          timeleft: record.timeleft,
          estimatedCompletionTime: record.estimatedCompletionTime,
        }));
      } catch {
        errors.push("Could not reach movie server (Radarr)");
      }
    }

    const result: Record<string, unknown> = {};

    if (episodes.length > 0) {
      result.episodes = episodes;
    }
    if (movies.length > 0) {
      result.movies = movies;
    }
    if (errors.length > 0) {
      result.errors = errors;
    }

    if (episodes.length === 0 && movies.length === 0 && errors.length === 0) {
      return { message: "No active downloads" };
    }

    return result;
  },
);
