import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../db/schema.js";
import { mediaTracking } from "../db/schema.js";

type DB = BetterSQLite3Database<typeof schema>;

export interface TrackingRecord {
  userId: number;
  mediaType: "movie" | "series";
  title: string;
  year: number | null;
  externalId: string;
  sonarrRadarrId: number | null;
}

export function insertMediaTracking(db: DB, record: TrackingRecord) {
  return db
    .insert(mediaTracking)
    .values({
      userId: record.userId,
      mediaType: record.mediaType,
      title: record.title,
      year: record.year,
      externalId: record.externalId,
      sonarrRadarrId: record.sonarrRadarrId,
    })
    .run();
}
