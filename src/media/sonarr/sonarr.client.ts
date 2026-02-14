import { z } from "zod";
import type { HttpRequestOptions } from "../http.js";
import { apiRequest, apiRequestVoid } from "../http.js";
import {
  EpisodeSchema,
  QualityProfileSchema,
  QueuePageSchema,
  RootFolderSchema,
  SeriesLookupSchema,
} from "./sonarr.schemas.js";
import type {
  AddSeriesInput,
  Episode,
  QualityProfile,
  QueuePage,
  RootFolder,
  Series,
  SeriesLookupResult,
} from "./sonarr.types.js";

export class SonarrClient {
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

  /** Search for series by term. Uses a longer timeout since search proxies to TheTVDB. */
  async searchSeries(term: string): Promise<SeriesLookupResult[]> {
    return this.request("series/lookup", z.array(SeriesLookupSchema), {
      query: { term },
      timeoutMs: 30_000,
    });
  }

  /** Get all series currently in Sonarr. */
  async getSeries(): Promise<Series[]> {
    return this.request("series", z.array(SeriesLookupSchema));
  }

  /** Add a series to Sonarr. */
  async addSeries(input: AddSeriesInput): Promise<Series> {
    return this.request("series", SeriesLookupSchema, {
      method: "POST",
      body: input,
    });
  }

  /** Remove a series by ID, optionally deleting files. */
  async removeSeries(
    id: number,
    opts?: { deleteFiles?: boolean; addImportListExclusion?: boolean },
  ): Promise<void> {
    const query: Record<string, string | number | boolean> = {};
    if (opts?.deleteFiles) {
      query.deleteFiles = true;
    }
    if (opts?.addImportListExclusion) {
      query.addImportListExclusion = true;
    }
    return this.requestVoid(`series/${id}`, {
      method: "DELETE",
      query,
    });
  }

  /** Get calendar episodes for a date range. */
  async getCalendar(start: string, end: string): Promise<Episode[]> {
    return this.request("calendar", z.array(EpisodeSchema), {
      query: { start, end, includeSeries: true },
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
      },
    });
  }

  /** Get all quality profiles configured in Sonarr. */
  async getQualityProfiles(): Promise<QualityProfile[]> {
    return this.request("qualityprofile", z.array(QualityProfileSchema));
  }

  /** Get all root folders configured in Sonarr. */
  async getRootFolders(): Promise<RootFolder[]> {
    return this.request("rootfolder", z.array(RootFolderSchema));
  }
}
