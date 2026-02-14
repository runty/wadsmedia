import { z } from "zod";
import type { HttpRequestOptions } from "../http.js";
import { apiRequest, apiRequestVoid } from "../http.js";
import {
  MovieLookupSchema,
  QualityProfileSchema,
  QueuePageSchema,
  RootFolderSchema,
} from "./radarr.schemas.js";
import type {
  AddMovieInput,
  Movie,
  MovieLookupResult,
  QualityProfile,
  QueuePage,
  RootFolder,
} from "./radarr.types.js";

export class RadarrClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private request<T>(
    path: string,
    schema: z.ZodType<T>,
    opts?: Partial<Omit<HttpRequestOptions, "baseUrl" | "apiKey" | "path">>,
  ): Promise<T> {
    return apiRequest(
      {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        path,
        ...opts,
      },
      schema,
    );
  }

  private requestVoid(
    path: string,
    opts?: Partial<Omit<HttpRequestOptions, "baseUrl" | "apiKey" | "path">>,
  ): Promise<void> {
    return apiRequestVoid({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      path,
      ...opts,
    });
  }

  /** Search for movies by term. Uses a longer timeout since search proxies to TMDB. */
  async searchMovies(term: string): Promise<MovieLookupResult[]> {
    return this.request("movie/lookup", z.array(MovieLookupSchema), {
      query: { term },
      timeoutMs: 30_000,
    });
  }

  /** Look up a single movie by TMDB ID. */
  async lookupByTmdbId(tmdbId: number): Promise<MovieLookupResult> {
    return this.request("movie/lookup/tmdb", MovieLookupSchema, {
      query: { tmdbId },
      timeoutMs: 30_000,
    });
  }

  /** Get all movies currently in Radarr. */
  async getMovies(): Promise<Movie[]> {
    return this.request("movie", z.array(MovieLookupSchema));
  }

  /** Add a movie to Radarr. */
  async addMovie(input: AddMovieInput): Promise<Movie> {
    return this.request("movie", MovieLookupSchema, {
      method: "POST",
      body: input,
    });
  }

  /** Remove a movie by ID, optionally deleting files and adding import exclusion. */
  async removeMovie(
    id: number,
    opts?: { deleteFiles?: boolean; addImportExclusion?: boolean },
  ): Promise<void> {
    const query: Record<string, string | number | boolean> = {};
    if (opts?.deleteFiles) {
      query.deleteFiles = true;
    }
    if (opts?.addImportExclusion) {
      query.addImportExclusion = true;
    }
    return this.requestVoid(`movie/${id}`, {
      method: "DELETE",
      query,
    });
  }

  /** Get upcoming movies for a date range. */
  async getUpcoming(start: string, end: string): Promise<Movie[]> {
    return this.request("calendar", z.array(MovieLookupSchema), {
      query: { start, end, unmonitored: false },
    });
  }

  /** Get the download queue with pagination. */
  async getQueue(opts?: { page?: number; pageSize?: number }): Promise<QueuePage> {
    return this.request("queue", QueuePageSchema, {
      query: {
        page: opts?.page ?? 1,
        pageSize: opts?.pageSize ?? 20,
        sortKey: "timeleft",
        sortDirection: "ascending",
        includeUnknownMovieItems: false,
      },
    });
  }

  /** Get all quality profiles configured in Radarr. */
  async getQualityProfiles(): Promise<QualityProfile[]> {
    return this.request("qualityprofile", z.array(QualityProfileSchema));
  }

  /** Get all root folders configured in Radarr. */
  async getRootFolders(): Promise<RootFolder[]> {
    return this.request("rootfolder", z.array(RootFolderSchema));
  }
}
