import { z } from "zod";

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),

  // Database
  DATABASE_PATH: z.string().default("/data/wadsmedia.db"),

  // Twilio (optional in Phase 1, required starting Phase 2)
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_PHONE_NUMBER: z.string().min(1).optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().min(1).optional(),

  // LLM (optional in Phase 1, required starting Phase 5)
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().default("gpt-4o"),

  // Sonarr/Radarr (optional in Phase 1, required starting Phase 4)
  SONARR_URL: z.string().url().optional(),
  SONARR_API_KEY: z.string().min(1).optional(),
  RADARR_URL: z.string().url().optional(),
  RADARR_API_KEY: z.string().min(1).optional(),

  // TMDB (optional, for media discovery)
  TMDB_ACCESS_TOKEN: z.string().min(1).optional(),

  // Brave Search (optional, for web search fallback)
  BRAVE_SEARCH_API_KEY: z.string().min(1).optional(),

  // Plex (optional, for library awareness)
  PLEX_URL: z.string().url().optional(),
  PLEX_TOKEN: z.string().min(1).optional(),

  // Tautulli (optional, for watch history)
  TAUTULLI_URL: z.string().url().optional(),
  TAUTULLI_API_KEY: z.string().min(1).optional(),

  // Notifications (optional, for webhook security)
  NOTIFICATION_SECRET: z.string().min(1).optional(),

  // Admin dashboard (optional, dashboard is opt-in)
  ADMIN_SESSION_SECRET: z.string().min(32).optional(),
  ADMIN_PASSWORD: z.string().min(1).optional(),

  // Library routing hints
  SONARR_ANIME_ROOT_FOLDER_HINT: z.string().default("anime"),
  RADARR_CMOVIES_ROOT_FOLDER_HINT: z.string().default("cmovies"),
  DEFAULT_QUALITY_PROFILE_HINT: z.string().default("1080"),

  // Users (required starting Phase 3)
  ADMIN_PHONE: z.string().min(1),
  PHONE_WHITELIST: z
    .string()
    .transform((val) => val.split(","))
    .pipe(z.array(z.string().min(1)))
    .optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment configuration:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
