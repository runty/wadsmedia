import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { processConversation } from "../conversation/engine.js";
import { handleOnboarding } from "../users/onboarding.js";

export default fp(
  async (fastify: FastifyInstance) => {
    const validateWebhookSignature = async (request: FastifyRequest, reply: FastifyReply) => {
      // Reconstruct the URL the provider used (handle reverse proxy / SSL termination)
      const protocol = (request.headers["x-forwarded-proto"] as string) ?? "http";
      const host = request.headers.host ?? "localhost";
      const url = `${protocol}://${host}${request.url}`;

      const isValid = fastify.messaging.validateWebhook({
        headers: request.headers as Record<string, string | string[] | undefined>,
        url,
        body: request.body,
      });

      if (!isValid) {
        request.log.warn("Invalid webhook signature");
        reply.code(403).send({ error: "Invalid signature" });
        return;
      }
    };

    fastify.post(
      "/webhook/twilio",
      { preHandler: [validateWebhookSignature, fastify.resolveUser] },
      async (request, reply) => {
        const message = fastify.messaging.parseInbound(request.body);
        request.log.info({ from: message.from, body: message.body }, "Incoming message");

        const user = request.user;

        // If user resolution failed (no From field), acknowledge silently
        if (!user) {
          return reply.type("text/xml").send(fastify.messaging.formatWebhookResponse());
        }

        // Active users: respond immediately with empty response, then process async
        if (user.status === "active") {
          // Respond immediately to avoid provider timeout
          reply.type("text/xml").send(fastify.messaging.formatWebhookResponse());

          // Twilio webhook users always have a phone number
          const replyAddress = user.phone as string;

          // Process conversation asynchronously (fire-and-forget from provider's perspective)
          // Only if conversation engine is configured
          if (fastify.llm && fastify.toolRegistry) {
            processConversation({
              userId: user.id,
              replyAddress,
              displayName: user.displayName,
              isAdmin: user.isAdmin,
              messageBody: message.body,
              db: fastify.db,
              llmClient: fastify.llm,
              registry: fastify.toolRegistry,
              sonarr: fastify.sonarr,
              radarr: fastify.radarr,
              tmdb: fastify.tmdb,
              brave: fastify.brave,
              plex: fastify.plex,
              tautulli: fastify.tautulli,
              messaging: fastify.messaging,
              telegramMessaging: fastify.telegramMessaging,
              config: fastify.config,
              log: request.log,
            }).catch((err) => {
              request.log.error({ err }, "Conversation processing failed");
              fastify.messaging
                .send({
                  to: replyAddress,
                  body: "Sorry, something went wrong. Please try again.",
                })
                .catch((sendErr) => {
                  request.log.error({ err: sendErr }, "Failed to send error message");
                });
            });
          } else {
            // LLM not configured -- send a helpful message
            fastify.messaging
              .send({
                to: replyAddress,
                body: "The conversation engine is not configured yet. Please set LLM_API_KEY and LLM_MODEL environment variables.",
              })
              .catch((sendErr) => {
                request.log.error({ err: sendErr }, "Failed to send config message");
              });
          }

          return;
        }

        // Non-active users: route through onboarding
        const onboardingReply = await handleOnboarding({
          user,
          messageBody: message.body,
          db: fastify.db,
          messaging: fastify.messaging,
          config: fastify.config,
          log: request.log,
        });

        if (onboardingReply) {
          return reply
            .type("text/xml")
            .send(fastify.messaging.formatWebhookResponse(onboardingReply));
        }

        // Fallback (should not reach here)
        return reply.type("text/xml").send(fastify.messaging.formatWebhookResponse());
      },
    );
  },
  { name: "webhook", dependencies: ["messaging", "user-resolver"] },
);
