import type {
  MovieRoutingMetadata,
  RoutingConfig,
  RoutingDecision,
  SeriesRoutingMetadata,
} from "./library-router.types.js";

interface QualityProfile {
  id: number;
  name: string;
}

interface RootFolder {
  id: number;
  path: string;
}

/** ISO 639-1 codes for Asian languages routed to CMovies folder. */
const ASIAN_LANGUAGE_CODES = new Set([
  "ja",
  "ko",
  "zh",
  "th",
  "hi",
  "ta",
  "te",
  "vi",
  "ms",
  "tl",
  "id",
]);

/** Full English names for Asian languages (for Radarr language name matching). */
const ASIAN_LANGUAGE_NAMES = new Set([
  "japanese",
  "korean",
  "chinese",
  "mandarin",
  "cantonese",
  "thai",
  "hindi",
  "tamil",
  "telugu",
  "vietnamese",
  "malay",
  "tagalog",
  "indonesian",
]);

/**
 * Find a quality profile matching the hint substring (case-insensitive).
 * Falls back to the first profile if no match found.
 */
export function findQualityProfile(profiles: QualityProfile[], hint?: string): number {
  if (hint) {
    const lower = hint.toLowerCase();
    const match = profiles.find((p) => p.name.toLowerCase().includes(lower));
    if (match) return match.id;
  }
  const first = profiles[0];
  if (!first) throw new Error("No quality profiles available");
  return first.id;
}

/**
 * Find a root folder whose path includes the hint (case-insensitive).
 * Falls back to the first folder if no match found.
 */
function findRootFolder(rootFolders: RootFolder[], hint?: string): RootFolder {
  if (hint) {
    const lower = hint.toLowerCase();
    const match = rootFolders.find((f) => f.path.toLowerCase().includes(lower));
    if (match) return match;
  }
  const first = rootFolders[0];
  if (!first) throw new Error("No root folders available");
  return first;
}

/**
 * Detect whether a series is anime based on genre and language signals.
 *
 * Anime detection requires TWO signals:
 * 1. originalLanguage === "ja" AND genres includes "animation" (case-insensitive)
 * OR: genres includes "anime" (case-insensitive) regardless of language (strong TheTVDB signal)
 */
function isAnime(metadata: SeriesRoutingMetadata): boolean {
  const genresLower = metadata.genres.map((g) => g.toLowerCase());

  // Strong signal: explicit "anime" genre from TheTVDB
  if (genresLower.includes("anime")) return true;

  // Two-signal rule: Japanese language + Animation genre
  if (metadata.originalLanguage === "ja" && genresLower.includes("animation")) return true;

  return false;
}

/**
 * Check if a language string (ISO code or full name) is an Asian language.
 */
function isAsianLanguage(language: string): boolean {
  const lower = language.toLowerCase();
  return ASIAN_LANGUAGE_CODES.has(lower) || ASIAN_LANGUAGE_NAMES.has(lower);
}

/**
 * Route a series to the appropriate root folder and quality profile.
 * Handles anime detection and folder assignment.
 */
export function routeSeries(
  metadata: SeriesRoutingMetadata,
  rootFolders: RootFolder[],
  qualityProfiles: QualityProfile[],
  config: RoutingConfig,
): RoutingDecision {
  const qualityProfileId = findQualityProfile(qualityProfiles, config.defaultQualityHint);
  const anime = isAnime(metadata);

  if (anime) {
    const folder = findRootFolder(rootFolders, config.animeRootFolderHint);
    return {
      rootFolderPath: folder.path,
      qualityProfileId,
      seriesType: "anime",
      reason: `Detected as anime (${metadata.originalLanguage === "ja" ? "Japanese language + Animation genre" : "explicit Anime genre"}), routed to ${folder.path}`,
    };
  }

  const folder = findRootFolder(rootFolders);
  return {
    rootFolderPath: folder.path,
    qualityProfileId,
    seriesType: "standard",
    reason: `Standard series, routed to default folder ${folder.path}`,
  };
}

/**
 * Route a movie to the appropriate root folder and quality profile.
 * Handles Asian-language detection for CMovies routing.
 */
export function routeMovie(
  metadata: MovieRoutingMetadata,
  rootFolders: RootFolder[],
  qualityProfiles: QualityProfile[],
  config: RoutingConfig,
): RoutingDecision {
  const qualityProfileId = findQualityProfile(qualityProfiles, config.defaultQualityHint);

  if (isAsianLanguage(metadata.originalLanguage) && config.cmoviesRootFolderHint) {
    const folder = findRootFolder(rootFolders, config.cmoviesRootFolderHint);
    return {
      rootFolderPath: folder.path,
      qualityProfileId,
      reason: `Asian-language movie (${metadata.originalLanguage}), routed to ${folder.path}`,
    };
  }

  const folder = findRootFolder(rootFolders);
  return {
    rootFolderPath: folder.path,
    qualityProfileId,
    reason: `Standard movie, routed to default folder ${folder.path}`,
  };
}
