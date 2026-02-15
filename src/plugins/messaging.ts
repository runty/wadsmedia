import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { TwilioMessagingProvider } from "../messaging/twilio-provider.js";

declare module "fastify" {
  interface FastifyInstance {
    messaging: import("../messaging/types.js").MessagingProvider;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_MESSAGING_SERVICE_SID } =
      fastify.config;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
    }

    const provider = new TwilioMessagingProvider(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_PHONE_NUMBER ?? "",
      TWILIO_MESSAGING_SERVICE_SID,
    );
    fastify.decorate("messaging", provider);

    fastify.log.info("Messaging provider registered (Twilio)");
  },
  { name: "messaging" },
);
