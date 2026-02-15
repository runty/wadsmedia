import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

// --- In-memory sliding-window error rate tracker ---
const errorTimestamps: number[] = [];
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5-minute window

/** Manually record an error timestamp (for caught errors that don't produce 5xx). */
export function recordError(): void {
  errorTimestamps.push(Date.now());
}

/** Get recent error count within the sliding window, pruning old entries. */
function getRecentErrorRate(): { count: number; windowMinutes: number } {
  const cutoff = Date.now() - ERROR_WINDOW_MS;
  // Prune old entries in-place
  let i = 0;
  while (i < errorTimestamps.length && (errorTimestamps[i] ?? 0) < cutoff) {
    i++;
  }
  if (i > 0) {
    errorTimestamps.splice(0, i);
  }
  return { count: errorTimestamps.length, windowMinutes: 5 };
}

export default fp(
  async (fastify: FastifyInstance) => {
    // Track 5xx responses
    fastify.addHook("onResponse", (_request, reply, done) => {
      if (reply.statusCode >= 500) {
        errorTimestamps.push(Date.now());
      }
      done();
    });

    // Track caught errors (even if response isn't 5xx)
    fastify.addHook("onError", (_request, _reply, _error, done) => {
      errorTimestamps.push(Date.now());
      done();
    });

    fastify.get("/health", async (_request, reply) => {
      // 1. Database check (synchronous)
      let dbStatus = "ok";
      try {
        fastify.db.run(sql`SELECT 1`);
      } catch {
        dbStatus = "error";
      }

      // 2. Telegram webhook check
      type WebhookCheck = {
        status: "ok" | "misconfigured" | "error" | "not_configured";
        url?: string;
        pending_update_count?: number;
        last_error_message?: string | null;
        detail?: string;
      };

      async function checkWebhook(): Promise<WebhookCheck> {
        if (!fastify.telegramMessaging) {
          return { status: "not_configured" };
        }
        try {
          const info = await Promise.race([
            fastify.telegramMessaging.getWebhookInfo(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Webhook check timed out")), 5000),
            ),
          ]);
          const expectedUrl = fastify.config.TELEGRAM_WEBHOOK_URL;
          if (!info.url) {
            return {
              status: "misconfigured",
              url: "",
              pending_update_count: info.pending_update_count,
              last_error_message: info.last_error_message ?? null,
              detail: "Webhook URL is empty",
            };
          }
          if (expectedUrl && info.url !== expectedUrl) {
            return {
              status: "misconfigured",
              url: info.url,
              pending_update_count: info.pending_update_count,
              last_error_message: info.last_error_message ?? null,
              detail: `URL mismatch: expected ${expectedUrl}`,
            };
          }
          return {
            status: "ok",
            url: info.url,
            pending_update_count: info.pending_update_count,
            last_error_message: info.last_error_message ?? null,
          };
        } catch (err) {
          return {
            status: "error",
            detail: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // 3. LLM check
      type LlmCheck = {
        status: "ok" | "error" | "not_configured";
        detail?: string;
      };

      async function checkLlm(): Promise<LlmCheck> {
        if (!fastify.hasDecorator("llm")) {
          return { status: "not_configured" };
        }
        try {
          await fastify.llm.models.list({ timeout: 5000, maxRetries: 0 });
          return { status: "ok" };
        } catch (err) {
          return {
            status: "error",
            detail: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // Run webhook and LLM checks in parallel
      const [webhookResult, llmResult] = await Promise.allSettled([checkWebhook(), checkLlm()]);

      const telegramWebhook: WebhookCheck =
        webhookResult.status === "fulfilled"
          ? webhookResult.value
          : { status: "error", detail: String(webhookResult.reason) };

      const llm: LlmCheck =
        llmResult.status === "fulfilled"
          ? llmResult.value
          : { status: "error", detail: String(llmResult.reason) };

      // 4. Error rate check
      const errorRate = getRecentErrorRate();
      const errorRateStatus = errorRate.count > 10 ? "elevated" : "normal";

      // Overall status: "ok" if database ok AND all configured services ok AND error rate normal
      const configuredChecks = [
        dbStatus,
        telegramWebhook.status !== "not_configured" ? telegramWebhook.status : "ok",
        llm.status !== "not_configured" ? llm.status : "ok",
        errorRateStatus === "normal" ? "ok" : "elevated",
      ];
      const overallStatus = configuredChecks.every((s) => s === "ok") ? "ok" : "degraded";
      const statusCode = overallStatus === "ok" ? 200 : 503;

      return reply.code(statusCode).send({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          database: dbStatus,
          telegram_webhook: telegramWebhook,
          llm,
          error_rate: {
            status: errorRateStatus,
            count: errorRate.count,
            window_minutes: errorRate.windowMinutes,
          },
        },
      });
    });
  },
  { name: "health" },
);
