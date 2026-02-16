import type { RadarrWebhookPayload, SonarrWebhookPayload } from "./types.js";

export interface FormattedNotification {
  /** Telegram HTML format */
  html: string;
  /** SMS plain text format */
  plain: string;
}

export function formatSonarrNotification(
  payload: SonarrWebhookPayload,
): FormattedNotification | null {
  switch (payload.eventType) {
    case "Download": {
      const series = payload.series?.title ?? "Unknown Show";
      const ep = payload.episodes?.[0];
      const epLabel = ep
        ? `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
        : "";
      const epTitle = ep?.title ? ` - ${ep.title}` : "";
      const prefix = payload.isUpgrade ? "Upgraded" : "Downloaded";
      const plain = `${prefix}: ${series} ${epLabel}${epTitle}`;
      const htmlEpTitle = ep?.title ? ` <i>- ${ep.title}</i>` : "";
      const html = `<b>${prefix}</b>: <b>${series}</b> ${epLabel ? `<code>${epLabel}</code>` : ""}${htmlEpTitle}`;
      return { html, plain };
    }
    case "Grab": {
      const series = payload.series?.title ?? "Unknown Show";
      const ep = payload.episodes?.[0];
      const epLabel = ep
        ? `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
        : "";
      const plain = `Grabbing: ${series} ${epLabel}`;
      const html = `<b>Grabbing</b>: <b>${series}</b> ${epLabel ? `<code>${epLabel}</code>` : ""}`;
      return { html, plain };
    }
    default:
      return null;
  }
}

export function formatRadarrNotification(
  payload: RadarrWebhookPayload,
): FormattedNotification | null {
  switch (payload.eventType) {
    case "Download": {
      const title = payload.movie?.title ?? "Unknown Movie";
      const year = payload.movie?.year ? ` (${payload.movie.year})` : "";
      const prefix = payload.isUpgrade ? "Upgraded" : "Downloaded";
      const plain = `${prefix}: ${title}${year}`;
      const html = `<b>${prefix}</b>: <b>${title}</b>${year}`;
      return { html, plain };
    }
    case "Grab": {
      const title = payload.movie?.title ?? "Unknown Movie";
      const plain = `Grabbing: ${title}`;
      const html = `<b>Grabbing</b>: <b>${title}</b>`;
      return { html, plain };
    }
    default:
      return null;
  }
}
