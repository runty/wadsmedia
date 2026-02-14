import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { formatRadarrNotification, formatSonarrNotification } from "../notifications/formatters.js";
import { notifyAllActiveUsers } from "../notifications/notify.js";
import type { RadarrWebhookPayload, SonarrWebhookPayload } from "../notifications/types.js";

export default fp(
  async (fastify: FastifyInstance) => {
    // Skip registration if messaging is not configured (same graceful-skip pattern as sonarr/radarr plugins)
    if (!fastify.config.TWILIO_PHONE_NUMBER) {
      fastify.log.warn("Notifications disabled: TWILIO_PHONE_NUMBER not configured");
      return;
    }

    const notificationSecret = fastify.config.NOTIFICATION_SECRET;

    // Token validation preHandler
    const validateToken = async (request: FastifyRequest, reply: FastifyReply) => {
      if (notificationSecret) {
        const token = (request.query as Record<string, string>).token;
        if (token !== notificationSecret) {
          request.log.warn("Invalid notification webhook token");
          reply.code(403).send({ error: "Invalid token" });
          return;
        }
      }
    };

    // POST /webhook/sonarr -- receives Sonarr event notifications
    fastify.post("/webhook/sonarr", { preHandler: [validateToken] }, async (request, reply) => {
      const payload = request.body as SonarrWebhookPayload;
      const message = formatSonarrNotification(payload);

      if (message) {
        // Fire-and-forget: don't block the webhook response
        notifyAllActiveUsers(
          fastify.db,
          fastify.messaging,
          fastify.config,
          message,
          request.log,
        ).catch((err) => request.log.error({ err }, "Sonarr notification dispatch failed"));
      }

      reply.code(200).send({ ok: true });
    });

    // POST /webhook/radarr -- receives Radarr event notifications
    fastify.post("/webhook/radarr", { preHandler: [validateToken] }, async (request, reply) => {
      const payload = request.body as RadarrWebhookPayload;
      const message = formatRadarrNotification(payload);

      if (message) {
        notifyAllActiveUsers(
          fastify.db,
          fastify.messaging,
          fastify.config,
          message,
          request.log,
        ).catch((err) => request.log.error({ err }, "Radarr notification dispatch failed"));
      }

      reply.code(200).send({ ok: true });
    });

    fastify.log.info({ secured: !!notificationSecret }, "Notification webhook routes registered");
  },
  { name: "notifications", dependencies: ["database", "messaging"] },
);
