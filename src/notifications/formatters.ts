import type { RadarrWebhookPayload, SonarrWebhookPayload } from "./types.js";

export function formatSonarrNotification(payload: SonarrWebhookPayload): string | null {
  switch (payload.eventType) {
    case "Download": {
      const series = payload.series?.title ?? "Unknown Show";
      const ep = payload.episodes?.[0];
      const epLabel = ep
        ? `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
        : "";
      const epTitle = ep?.title ? ` - ${ep.title}` : "";
      const prefix = payload.isUpgrade ? "Upgraded" : "Downloaded";
      return `${prefix}: ${series} ${epLabel}${epTitle}`;
    }
    case "Grab": {
      const series = payload.series?.title ?? "Unknown Show";
      const ep = payload.episodes?.[0];
      const epLabel = ep
        ? `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
        : "";
      return `Grabbing: ${series} ${epLabel}`;
    }
    default:
      return null;
  }
}

export function formatRadarrNotification(payload: RadarrWebhookPayload): string | null {
  switch (payload.eventType) {
    case "Download": {
      const title = payload.movie?.title ?? "Unknown Movie";
      const year = payload.movie?.year ? ` (${payload.movie.year})` : "";
      const prefix = payload.isUpgrade ? "Upgraded" : "Downloaded";
      return `${prefix}: ${title}${year}`;
    }
    case "Grab": {
      const title = payload.movie?.title ?? "Unknown Movie";
      return `Grabbing: ${title}`;
    }
    default:
      return null;
  }
}
