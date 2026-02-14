import { describe, expect, it } from "vitest";
import { findQualityProfile, routeMovie, routeSeries } from "../src/media/routing/library-router.js";

const TV_ROOT_FOLDERS = [
  { id: 1, path: "/tv", name: "TV" },
  { id: 2, path: "/tv/anime", name: "Anime" },
];

const MOVIE_ROOT_FOLDERS = [
  { id: 1, path: "/movies", name: "Movies" },
  { id: 2, path: "/movies/cmovies", name: "CMovies" },
];

const QUALITY_PROFILES = [
  { id: 1, name: "Any" },
  { id: 2, name: "HD-1080p" },
];

describe("routeSeries", () => {
  it("routes anime (Japanese + Animation genre) to anime folder", () => {
    const result = routeSeries(
      { genres: ["Animation", "Action"], originalLanguage: "ja" },
      TV_ROOT_FOLDERS,
      QUALITY_PROFILES,
      { animeRootFolderHint: "anime", defaultQualityHint: "1080" },
    );
    expect(result.rootFolderPath).toBe("/tv/anime");
    expect(result.seriesType).toBe("anime");
  });

  it("routes non-anime to default folder", () => {
    const result = routeSeries(
      { genres: ["Drama"], originalLanguage: "en" },
      TV_ROOT_FOLDERS,
      QUALITY_PROFILES,
      { animeRootFolderHint: "anime", defaultQualityHint: "1080" },
    );
    expect(result.rootFolderPath).toBe("/tv");
    expect(result.seriesType).toBe("standard");
  });

  it("does not misclassify Animation without Japanese language", () => {
    const result = routeSeries(
      { genres: ["Animation"], originalLanguage: "en" },
      TV_ROOT_FOLDERS,
      QUALITY_PROFILES,
      { animeRootFolderHint: "anime", defaultQualityHint: "1080" },
    );
    expect(result.rootFolderPath).toBe("/tv");
    expect(result.seriesType).toBe("standard");
  });

  it("does not misclassify Japanese without Animation genre", () => {
    const result = routeSeries(
      { genres: ["Drama", "Action"], originalLanguage: "ja" },
      TV_ROOT_FOLDERS,
      QUALITY_PROFILES,
      { animeRootFolderHint: "anime", defaultQualityHint: "1080" },
    );
    expect(result.rootFolderPath).toBe("/tv");
    expect(result.seriesType).toBe("standard");
  });

  it("falls back to first folder when anime hint folder not found", () => {
    const result = routeSeries(
      { genres: ["Animation", "Action"], originalLanguage: "ja" },
      [{ id: 1, path: "/tv", name: "TV" }],
      QUALITY_PROFILES,
      { animeRootFolderHint: "animefolder", defaultQualityHint: "1080" },
    );
    expect(result.rootFolderPath).toBe("/tv");
    expect(result.seriesType).toBe("anime");
  });

  it("detects anime from explicit 'Anime' genre string regardless of language", () => {
    const result = routeSeries(
      { genres: ["Anime", "Action"], originalLanguage: "en" },
      TV_ROOT_FOLDERS,
      QUALITY_PROFILES,
      { animeRootFolderHint: "anime", defaultQualityHint: "1080" },
    );
    expect(result.rootFolderPath).toBe("/tv/anime");
    expect(result.seriesType).toBe("anime");
  });
});

describe("routeMovie", () => {
  it("routes Japanese movie to CMovies folder", () => {
    const result = routeMovie(
      { originalLanguage: "ja", genres: ["Action"] },
      MOVIE_ROOT_FOLDERS,
      QUALITY_PROFILES,
      { cmoviesRootFolderHint: "cmovies", defaultQualityHint: "1080" },
    );
    expect(result.rootFolderPath).toBe("/movies/cmovies");
  });

  it("routes Korean movie to CMovies folder", () => {
    const result = routeMovie(
      { originalLanguage: "ko", genres: ["Drama"] },
      MOVIE_ROOT_FOLDERS,
      QUALITY_PROFILES,
      { cmoviesRootFolderHint: "cmovies", defaultQualityHint: "1080" },
    );
    expect(result.rootFolderPath).toBe("/movies/cmovies");
  });

  it("routes Chinese movie to CMovies folder", () => {
    const result = routeMovie(
      { originalLanguage: "zh", genres: ["Action"] },
      MOVIE_ROOT_FOLDERS,
      QUALITY_PROFILES,
      { cmoviesRootFolderHint: "cmovies", defaultQualityHint: "1080" },
    );
    expect(result.rootFolderPath).toBe("/movies/cmovies");
  });

  it("routes English movie to default folder", () => {
    const result = routeMovie(
      { originalLanguage: "en", genres: ["Drama"] },
      MOVIE_ROOT_FOLDERS,
      QUALITY_PROFILES,
      { cmoviesRootFolderHint: "cmovies", defaultQualityHint: "1080" },
    );
    expect(result.rootFolderPath).toBe("/movies");
  });

  it("falls back to first folder when CMovies hint folder not found", () => {
    const result = routeMovie(
      { originalLanguage: "ja", genres: ["Action"] },
      [{ id: 1, path: "/movies", name: "Movies" }],
      QUALITY_PROFILES,
      { cmoviesRootFolderHint: "cmovies", defaultQualityHint: "1080" },
    );
    expect(result.rootFolderPath).toBe("/movies");
  });

  it("routes Thai, Hindi, Tamil, Telugu, Vietnamese, Malay, Tagalog, Indonesian to CMovies", () => {
    const asianLanguages = ["th", "hi", "ta", "te", "vi", "ms", "tl", "id"];
    for (const lang of asianLanguages) {
      const result = routeMovie(
        { originalLanguage: lang, genres: ["Drama"] },
        MOVIE_ROOT_FOLDERS,
        QUALITY_PROFILES,
        { cmoviesRootFolderHint: "cmovies", defaultQualityHint: "1080" },
      );
      expect(result.rootFolderPath, `Expected ${lang} to route to CMovies`).toBe("/movies/cmovies");
    }
  });

  it("routes by full language name (Japanese, Korean, etc.)", () => {
    const asianNames = ["Japanese", "Korean", "Chinese", "Thai", "Hindi", "Tamil", "Telugu", "Vietnamese", "Malay", "Tagalog", "Indonesian"];
    for (const name of asianNames) {
      const result = routeMovie(
        { originalLanguage: name, genres: ["Drama"] },
        MOVIE_ROOT_FOLDERS,
        QUALITY_PROFILES,
        { cmoviesRootFolderHint: "cmovies", defaultQualityHint: "1080" },
      );
      expect(result.rootFolderPath, `Expected "${name}" to route to CMovies`).toBe("/movies/cmovies");
    }
  });
});

describe("findQualityProfile", () => {
  it("selects profile matching '1080' hint", () => {
    const result = findQualityProfile(
      [{ id: 1, name: "Any" }, { id: 2, name: "HD-1080p" }],
      "1080",
    );
    expect(result).toBe(2);
  });

  it("falls back to first profile when hint not found", () => {
    const result = findQualityProfile(
      [{ id: 1, name: "Any" }],
      "4K",
    );
    expect(result).toBe(1);
  });

  it("matches case-insensitively", () => {
    const result = findQualityProfile(
      [{ id: 1, name: "HD-1080P" }],
      "1080p",
    );
    expect(result).toBe(1);
  });
});
