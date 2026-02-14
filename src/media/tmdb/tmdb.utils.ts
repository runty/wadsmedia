const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

const VALID_SIZES = ["w92", "w154", "w185", "w342", "w500", "w780", "original"] as const;
export type ValidSize = (typeof VALID_SIZES)[number];

/**
 * Build a full TMDB image URL from a partial path.
 *
 * @param path - The partial image path from TMDB (e.g. "/kqjL17yufvn9OVLyXYpvtyrFfak.jpg")
 * @param size - Image size preset (default: "w500")
 * @returns Full URL or null if path is null/undefined
 */
export function tmdbImageUrl(
  path: string | null | undefined,
  size: ValidSize = "w500",
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
