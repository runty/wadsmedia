import { z } from "zod";
import { plexRequest } from "./plex.http.js";
import {
  PlexChildrenResponseSchema,
  PlexLibraryItemsResponseSchema,
  PlexSectionsResponseSchema,
} from "./plex.schemas.js";
import type { PlexLibraryItem, SeasonAvailability } from "./plex.types.js";

/** Regex to extract provider and ID from Plex GUID strings like "tmdb://12345". */
const GUID_REGEX = /^(\w+):\/\/(.+)$/;

export class PlexClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private libraryCache = new Map<string, PlexLibraryItem>();
  private _cacheReady = false;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  /**
   * Load (or reload) the entire Plex library into an in-memory cache keyed by
   * provider GUID (e.g. "tmdb:12345", "tvdb:67890") for O(1) lookup.
   *
   * Steps:
   * 1. Fetch all library sections
   * 2. Filter to movie and show sections only
   * 3. Fetch all items from each section concurrently
   * 4. Parse GUIDs and index into cache map
   * 5. Atomically swap the cache reference
   */
  async loadLibraryCache(): Promise<void> {
    const sectionsResponse = await plexRequest(
      { baseUrl: this.baseUrl, token: this.token, path: "library/sections" },
      PlexSectionsResponseSchema,
    );

    const mediaSections = sectionsResponse.MediaContainer.Directory.filter(
      (s) => s.type === "movie" || s.type === "show",
    );

    const newCache = new Map<string, PlexLibraryItem>();

    const results = await Promise.allSettled(
      mediaSections.map(async (section) => {
        const itemsResponse = await plexRequest(
          {
            baseUrl: this.baseUrl,
            token: this.token,
            path: `library/sections/${section.key}/all`,
            query: { includeGuids: 1 },
            timeoutMs: 30_000,
          },
          PlexLibraryItemsResponseSchema,
        );

        const items = itemsResponse.MediaContainer.Metadata ?? [];
        for (const item of items) {
          const libraryItem: PlexLibraryItem = {
            ratingKey: item.ratingKey,
            title: item.title,
            year: item.year,
            type: section.type as "movie" | "show",
            sectionTitle: section.title,
            leafCount: item.leafCount,
            viewedLeafCount: item.viewedLeafCount,
          };

          // Index by each GUID provider (tmdb, tvdb, imdb, etc.)
          if (item.Guid) {
            for (const guid of item.Guid) {
              const match = GUID_REGEX.exec(guid.id);
              if (match) {
                const [, provider, id] = match;
                newCache.set(`${provider}:${id}`, libraryItem);
              }
            }
          }
        }
      }),
    );

    // Log rejected sections but don't fail the whole cache load
    for (const result of results) {
      if (result.status === "rejected") {
        // Caller (plugin) will handle logging
      }
    }

    // Atomic swap
    this.libraryCache = newCache;
    this._cacheReady = true;
  }

  /** Look up a library item by TMDB ID. */
  findByTmdbId(tmdbId: number): PlexLibraryItem | undefined {
    return this.libraryCache.get(`tmdb:${tmdbId}`);
  }

  /** Look up a library item by TVDB ID. */
  findByTvdbId(tvdbId: number): PlexLibraryItem | undefined {
    return this.libraryCache.get(`tvdb:${tvdbId}`);
  }

  /** Title search across cached library items. Tries type-filtered first, then any type. */
  findByTitle(title: string, type?: "movie" | "show"): PlexLibraryItem | undefined {
    const needle = title.toLowerCase();
    // Try with type filter first
    if (type) {
      for (const item of this.libraryCache.values()) {
        if (item.type === type && item.title.toLowerCase() === needle) return item;
      }
    }
    // Fallback: search all types (LLM often guesses wrong type)
    for (const item of this.libraryCache.values()) {
      if (item.title.toLowerCase() === needle) return item;
    }
    return undefined;
  }

  /**
   * Get season-level availability for a TV show by its Plex ratingKey.
   * Returns an array of season info (season number, episode count, viewed count).
   */
  async getShowAvailability(ratingKey: string): Promise<SeasonAvailability[]> {
    const response = await plexRequest(
      {
        baseUrl: this.baseUrl,
        token: this.token,
        path: `library/metadata/${ratingKey}/children`,
      },
      PlexChildrenResponseSchema,
    );

    const metadata = response.MediaContainer.Metadata ?? [];
    return metadata.map((child) => ({
      seasonNumber: child.index ?? 0,
      episodeCount: child.leafCount ?? 0,
      viewedCount: child.viewedLeafCount ?? 0,
      title: child.title,
    }));
  }

  /** Check if the Plex server is reachable and responding. */
  async healthCheck(): Promise<boolean> {
    try {
      await plexRequest(
        { baseUrl: this.baseUrl, token: this.token, path: "", timeoutMs: 5_000 },
        z.object({}).passthrough(),
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Whether the library cache has been loaded at least once. */
  get isCacheReady(): boolean {
    return this._cacheReady;
  }

  /** Number of items (by GUID key) in the library cache. */
  get cacheSize(): number {
    return this.libraryCache.size;
  }
}
