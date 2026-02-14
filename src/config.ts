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

  // LLM (optional in Phase 1, required starting Phase 5)
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().default("gpt-4o"),

  // Sonarr/Radarr (optional in Phase 1, required starting Phase 4)
  SONARR_URL: z.string().url().optional(),
  SONARR_API_KEY: z.string().min(1).optional(),
  RADARR_URL: z.string().url().optional(),
  RADARR_API_KEY: z.string().min(1).optional(),

  // Users (optional in Phase 1, required starting Phase 3)
  PHONE_WHITELIST: z
    .string()
    .transform((val) => val.split(","))
    .pipe(z.array(z.string().min(1)))
    .optional(),
  ADMIN_PHONE: z.string().min(1).optional(),
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
