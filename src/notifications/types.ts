export interface SonarrWebhookPayload {
  eventType: string;
  instanceName?: string;
  series?: {
    id: number;
    title: string;
    path?: string;
    tvdbId?: number;
  };
  episodes?: Array<{
    id: number;
    episodeNumber: number;
    seasonNumber: number;
    title?: string;
  }>;
  release?: {
    quality?: string;
    releaseTitle?: string;
    size?: number;
  };
  isUpgrade?: boolean;
  downloadClient?: string;
}

export interface RadarrWebhookPayload {
  eventType: string;
  instanceName?: string;
  movie?: {
    id: number;
    title: string;
    year?: number;
    tmdbId?: number;
    imdbId?: string;
  };
  release?: {
    quality?: string;
    releaseTitle?: string;
    size?: number;
  };
  isUpgrade?: boolean;
  downloadClient?: string;
}
