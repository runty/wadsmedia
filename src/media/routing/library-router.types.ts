export interface RoutingDecision {
  rootFolderPath: string;
  qualityProfileId: number;
  seriesType?: "standard" | "daily" | "anime";
  reason: string;
}

export interface SeriesRoutingMetadata {
  genres: string[];
  originalLanguage?: string;
  network?: string | null;
}

export interface MovieRoutingMetadata {
  originalLanguage: string;
  genres: string[];
}

export interface RoutingConfig {
  animeRootFolderHint?: string;
  cmoviesRootFolderHint?: string;
  defaultQualityHint?: string;
}
