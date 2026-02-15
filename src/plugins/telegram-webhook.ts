import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { processConversation } from "../conversation/engine.js";
import { handleOnboarding } from "../users/onboarding.js";
import { createUser, findUserByTelegramChatId } from "../users/user.service.js";

export default fp(
  async (fastify: FastifyInstance) => {
    if (!fastify.telegramMessaging) {
      fastify.log.info("Telegram webhook not registered (provider not configured)");
      return;
    }

    const validateTelegramWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
      const isValid = fastify.telegramMessaging!.validateWebhook({
        headers: request.headers as Record<string, string | string[] | undefined>,
        url: "",
        body: request.body,
      });

      if (!isValid) {
        request.log.warn("Invalid Telegram webhook signature");
        reply.code(403).send({ error: "Invalid signature" });
        return;
      }
    };

    fastify.post(
      "/webhook/telegram",
      { config: { rawBody: false }, preHandler: [validateTelegramWebhook] },
      async (request, reply) => {
        // Immediately respond 200 OK -- Telegram expects fast acknowledgment
        reply.code(200).send({ ok: true });

        // Parse the update
        const message = fastify.telegramMessaging!.parseInbound(request.body);

        // If message.from is empty (neither message nor callback_query), nothing to process
        if (!message.from) {
          return;
        }

        // Handle callback_query: answer immediately to dismiss loading spinner
        const rawBody = request.body as Record<string, unknown>;
        const isCallbackQuery = !!rawBody.callback_query;

        if (isCallbackQuery) {
          fastify.telegramMessaging!
            .answerCallbackQuery(message.providerMessageId)
            .catch((err) => request.log.error({ err }, "Failed to answer callback query"));
        }

        // Filter: only process private chats
        const chatType = isCallbackQuery
          ? (rawBody.callback_query as Record<string, unknown> & { message?: { chat?: { type?: string } } })
              ?.message?.chat?.type
          : (rawBody.message as Record<string, unknown> & { chat?: { type?: string } })?.chat?.type;

        if (chatType !== "private") {
          request.log.debug({ chatType }, "Ignoring non-private chat message");
          return;
        }

        // Resolve user by telegramChatId
        const chatId = message.from; // String(chat.id) from parseInbound
        let user = findUserByTelegramChatId(fastify.db, chatId);

        if (!user) {
          // Extract name from Telegram update for auto-onboarding
          const tgUser =
            (rawBody.message as Record<string, unknown> & { from?: { first_name?: string; username?: string } })
              ?.from ??
            (rawBody.callback_query as Record<string, unknown> & { from?: { first_name?: string; username?: string } })
              ?.from;
          const firstName = tgUser?.first_name ?? "Telegram User";
          const username = tgUser?.username ?? null;

          user = createUser(fastify.db, null, {
            telegramChatId: chatId,
            telegramUsername: username ?? undefined,
            displayName: firstName, // Telegram provides name automatically
            status: "pending",
          });

          request.log.info({ chatId, name: firstName }, "New Telegram user created");

          // Notify admin about new Telegram user
          const adminMsg = `New Telegram user: ${firstName}${username ? ` (@${username})` : ""} (chat: ${chatId}). Approve via admin dashboard.`;

          if (fastify.telegramMessaging && fastify.config.ADMIN_TELEGRAM_CHAT_ID) {
            fastify.telegramMessaging
              .send({ to: fastify.config.ADMIN_TELEGRAM_CHAT_ID, body: adminMsg })
              .catch(() => {});
          } else if (fastify.messaging && fastify.config.ADMIN_PHONE) {
            fastify.messaging
              .send({ to: fastify.config.ADMIN_PHONE, body: adminMsg })
              .catch(() => {});
          }
        }

        // Route based on user status
        if (user.status === "active") {
          // Send typing indicator (fire-and-forget)
          fastify.telegramMessaging!.sendChatAction(chatId, "typing").catch(() => {});

          // Process conversation with Telegram provider
          if (fastify.llm && fastify.toolRegistry) {
            try {
              await processConversation({
                userId: user.id,
                replyAddress: chatId,
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
                messaging: fastify.telegramMessaging!,
                config: fastify.config,
                log: request.log,
              });
            } catch (err) {
              request.log.error({ err }, "Telegram conversation processing failed");
              fastify.telegramMessaging!
                .send({ to: chatId, body: "Sorry, something went wrong." })
                .catch((sendErr) => {
                  request.log.error({ err: sendErr }, "Failed to send error message");
                });
            }
          } else {
            fastify.telegramMessaging!
              .send({
                to: chatId,
                body: "The conversation engine is not configured yet. Please set LLM_API_KEY and LLM_MODEL environment variables.",
              })
              .catch((sendErr) => {
                request.log.error({ err: sendErr }, "Failed to send config message");
              });
          }
        } else if (user.status === "pending") {
          const onboardingReply = await handleOnboarding({
            user,
            messageBody: message.body,
            db: fastify.db,
            messaging: fastify.telegramMessaging!,
            config: fastify.config,
            log: request.log,
          });

          if (onboardingReply) {
            await fastify.telegramMessaging!
              .send({ to: chatId, body: onboardingReply })
              .catch((sendErr) => {
                request.log.error({ err: sendErr }, "Failed to send onboarding message");
              });
          }
        } else if (user.status === "blocked") {
          await fastify.telegramMessaging!
            .send({ to: chatId, body: "Sorry, your access has been revoked." })
            .catch((sendErr) => {
              request.log.error({ err: sendErr }, "Failed to send blocked message");
            });
        }
      },
    );
  },
  { name: "telegram-webhook", dependencies: ["database", "telegram-messaging"] },
);
