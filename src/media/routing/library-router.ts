import type { RoutingConfig, RoutingDecision, SeriesRoutingMetadata, MovieRoutingMetadata } from "./library-router.types.js";

interface QualityProfile {
  id: number;
  name: string;
}

interface RootFolder {
  id: number;
  path: string;
}

export function findQualityProfile(_profiles: QualityProfile[], _hint?: string): number {
  throw new Error("Not implemented");
}

export function routeSeries(
  _metadata: SeriesRoutingMetadata,
  _rootFolders: RootFolder[],
  _qualityProfiles: QualityProfile[],
  _config: RoutingConfig,
): RoutingDecision {
  throw new Error("Not implemented");
}

export function routeMovie(
  _metadata: MovieRoutingMetadata,
  _rootFolders: RootFolder[],
  _qualityProfiles: QualityProfile[],
  _config: RoutingConfig,
): RoutingDecision {
  throw new Error("Not implemented");
}
