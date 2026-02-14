import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { processConversation } from "../conversation/engine.js";
import { handleOnboarding } from "../users/onboarding.js";

export default fp(
  async (fastify: FastifyInstance) => {
    const validateTwilioSignature = async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = request.headers["x-twilio-signature"];
      if (typeof signature !== "string") {
        reply.code(403).send({ error: "Missing Twilio signature" });
        return;
      }

      // Reconstruct the URL Twilio used (handle reverse proxy / SSL termination)
      const protocol = (request.headers["x-forwarded-proto"] as string) ?? "http";
      const host = request.headers.host ?? "localhost";
      const url = `${protocol}://${host}${request.url}`;

      const isValid = fastify.messaging.validateWebhook({
        signature,
        url,
        body: request.body as Record<string, string>,
      });

      if (!isValid) {
        request.log.warn("Invalid Twilio webhook signature");
        reply.code(403).send({ error: "Invalid signature" });
        return;
      }
    };

    fastify.post(
      "/webhook/twilio",
      { preHandler: [validateTwilioSignature, fastify.resolveUser] },
      async (request, reply) => {
        const message = fastify.messaging.parseInbound(request.body as Record<string, string>);
        request.log.info({ from: message.from, body: message.body }, "Incoming message");

        const user = request.user;

        // If user resolution failed (no From field), acknowledge silently
        if (!user) {
          return reply.type("text/xml").send(fastify.messaging.formatEmptyReply());
        }

        // Active users: respond immediately with empty TwiML, then process async
        if (user.status === "active") {
          // Respond immediately to Twilio to avoid 15-second timeout
          reply.type("text/xml").send(fastify.messaging.formatEmptyReply());

          // Process conversation asynchronously (fire-and-forget from Twilio's perspective)
          // Only if conversation engine is configured
          if (fastify.llm && fastify.toolRegistry) {
            processConversation({
              userId: user.id,
              userPhone: user.phone,
              displayName: user.displayName,
              messageBody: message.body,
              db: fastify.db,
              llmClient: fastify.llm,
              registry: fastify.toolRegistry,
              sonarr: fastify.sonarr,
              radarr: fastify.radarr,
              tmdb: fastify.tmdb,
              brave: fastify.brave,
              messaging: fastify.messaging,
              config: fastify.config,
              log: request.log,
            }).catch((err) => {
              request.log.error({ err }, "Conversation processing failed");
              fastify.messaging
                .send({
                  to: user.phone,
                  body: "Sorry, something went wrong. Please try again.",
                  from: fastify.config.TWILIO_PHONE_NUMBER,
                })
                .catch((sendErr) => {
                  request.log.error({ err: sendErr }, "Failed to send error message");
                });
            });
          } else {
            // LLM not configured -- send a helpful message
            fastify.messaging
              .send({
                to: user.phone,
                body: "The conversation engine is not configured yet. Please set LLM_API_KEY and LLM_MODEL environment variables.",
                from: fastify.config.TWILIO_PHONE_NUMBER,
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
          return reply.type("text/xml").send(fastify.messaging.formatReply(onboardingReply));
        }

        // Fallback (should not reach here)
        return reply.type("text/xml").send(fastify.messaging.formatEmptyReply());
      },
    );
  },
  { name: "webhook", dependencies: ["messaging", "user-resolver"] },
);
