import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

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
      { preHandler: validateTwilioSignature },
      async (request, reply) => {
        const message = fastify.messaging.parseInbound(request.body as Record<string, string>);
        request.log.info({ from: message.from, body: message.body }, "Incoming message");

        // Phase 2: acknowledge receipt; later phases add conversation logic
        const twimlResponse = fastify.messaging.formatEmptyReply();
        reply.type("text/xml").send(twimlResponse);
      },
    );
  },
  { name: "webhook", dependencies: ["messaging"] },
);
