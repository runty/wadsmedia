import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { processConversation } from "../conversation/engine.js";
import { handleOnboarding } from "../users/onboarding.js";
import { createUser, findUserByTelegramChatId } from "../users/user.service.js";

// --- Group chat activation detection helpers ---

/**
 * Check if the message text contains an @mention of the bot.
 * Also checks Telegram's entities array for mention entities (more reliable than text matching).
 */
export function isBotMention(
  text: string,
  botUsername: string,
  entities?: Array<{ type: string; offset: number; length: number }>,
): boolean {
  // Check Telegram entities first (more reliable)
  if (entities) {
    const mentionText = `@${botUsername}`.toLowerCase();
    for (const entity of entities) {
      if (entity.type === "mention") {
        const entityText = text.slice(entity.offset, entity.offset + entity.length).toLowerCase();
        if (entityText === mentionText) return true;
      }
    }
  }
  // Fallback: text matching (case-insensitive)
  return text.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
}

/**
 * Check if this update is a reply to one of the bot's own messages.
 */
export function isReplyToBot(update: Record<string, unknown>, botUsername: string): boolean {
  // Callback queries are always directed at the bot
  if (update.callback_query) return true;

  const message = update.message as Record<string, unknown> | undefined;
  if (!message) return false;

  const replyTo = message.reply_to_message as Record<string, unknown> | undefined;
  if (!replyTo) return false;

  const from = replyTo.from as Record<string, unknown> | undefined;
  if (!from) return false;

  return String(from.username ?? "").toLowerCase() === botUsername.toLowerCase();
}

/**
 * Detect if the message text looks like an obvious media request.
 * Leans toward precision over recall -- false negatives are acceptable
 * (users can always @mention the bot), but false positives waste API calls.
 */
export function isObviousMediaRequest(text: string): boolean {
  const lower = text.toLowerCase();

  const patterns: RegExp[] = [
    // Action verbs that imply a media request
    /\bsearch\s+for\b/i,
    /\bfind\s+me\b/i,
    /\blook\s+up\b/i,
    /\badd\s+\S/i,
    /\bdownload\s+\S/i,
    /\bgrab\s+\S/i,
    // Direct query patterns
    /\bhave\s+you\s+seen\b/i,
    /\banyone\s+seen\b/i,
    /\bis\s+.+\s+on\s+plex\b/i,
    /\bwhat\s+about\s+\S/i,
    // Media nouns combined with action context
    /\b(?:search|find|add|download|grab|get)\b.*\b(?:movie|show|series|anime|film)\b/i,
    /\b(?:movie|show|series|anime|film)\b.*\b(?:search|find|add|download|grab|get)\b/i,
  ];

  return patterns.some((p) => p.test(lower));
}

/**
 * Single activation gate for group messages.
 * Returns true if the bot should respond to this message.
 */
export function shouldActivateInGroup(
  text: string,
  update: Record<string, unknown>,
  botUsername: string,
  entities?: Array<{ type: string; offset: number; length: number }>,
): boolean {
  return (
    isBotMention(text, botUsername, entities) ||
    isReplyToBot(update, botUsername) ||
    isObviousMediaRequest(text)
  );
}

/**
 * Remove @botUsername from message text so the LLM doesn't see it as part of the query.
 */
export function stripBotMention(text: string, botUsername: string): string {
  // Remove all variations of the mention (case-insensitive)
  return text.replace(new RegExp(`@${botUsername}`, "gi"), "").trim();
}

// --- Rate limiting for group chats ---
const groupMessageTimestamps = new Map<string, number[]>();

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

        // Determine chat type for routing
        const chatType = isCallbackQuery
          ? (rawBody.callback_query as Record<string, unknown> & { message?: { chat?: { type?: string } } })
              ?.message?.chat?.type
          : (rawBody.message as Record<string, unknown> & { chat?: { type?: string } })?.chat?.type;

        if (chatType === "private") {
          // === PRIVATE CHAT (DM) HANDLING ===
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
              displayName: firstName,
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
            fastify.telegramMessaging!.sendChatAction(chatId, "typing").catch(() => {});

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
                  telegramMessaging: fastify.telegramMessaging,
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
        } else if (chatType === "group" || chatType === "supergroup") {
          // === GROUP CHAT HANDLING ===

          // Extract raw message object for group-specific fields
          const rawMessage = isCallbackQuery
            ? (rawBody.callback_query as Record<string, unknown>)?.message as Record<string, unknown> | undefined
            : rawBody.message as Record<string, unknown> | undefined;

          if (!rawMessage) return;

          const groupChatId = String((rawMessage.chat as Record<string, unknown>)?.id ?? "");
          const messageId = String(rawMessage.message_id ?? "");

          if (!groupChatId) return;

          // Extract sender identity from from.id (NOT chat.id -- chat.id is the group)
          const senderFrom = isCallbackQuery
            ? (rawBody.callback_query as Record<string, unknown>)?.from as Record<string, unknown> | undefined
            : (rawBody.message as Record<string, unknown>)?.from as Record<string, unknown> | undefined;

          if (!senderFrom) return;

          const senderId = String(senderFrom.id ?? "");
          const senderFirstName = String(senderFrom.first_name ?? "Group User");
          const senderUsername = senderFrom.username ? String(senderFrom.username) : null;

          if (!senderId) return;

          // Activation check -- bot only responds to relevant messages in groups
          const botUsername = fastify.config.TELEGRAM_BOT_USERNAME;
          if (!botUsername) {
            request.log.warn("TELEGRAM_BOT_USERNAME not configured -- skipping group message processing");
            return;
          }

          // Extract entities for mention detection
          const entities = isCallbackQuery
            ? undefined
            : ((rawBody.message as Record<string, unknown>)?.entities as Array<{ type: string; offset: number; length: number }> | undefined);

          if (!shouldActivateInGroup(message.body, rawBody, botUsername, entities)) {
            return; // Silently ignore non-activated group messages
          }

          // Strip @mention from message body before sending to LLM
          const strippedMessage = stripBotMention(message.body, botUsername);

          // Rate limiting: max 15 messages per 60 seconds per group (leaves buffer below 20/min Telegram limit)
          const now = Date.now();
          const timestamps = groupMessageTimestamps.get(groupChatId) ?? [];
          const recentTimestamps = timestamps.filter((t) => now - t < 60_000);

          if (recentTimestamps.length >= 15) {
            request.log.warn({ groupChatId, count: recentTimestamps.length }, "Group rate limit hit");
            fastify.telegramMessaging!
              .send({
                to: groupChatId,
                body: "Slow down! I can only handle so many requests at once in a group. Try again in a minute.",
                replyToMessageId: messageId,
              })
              .catch((sendErr) => {
                request.log.error({ err: sendErr }, "Failed to send rate limit message");
              });
            return;
          }

          recentTimestamps.push(now);
          groupMessageTimestamps.set(groupChatId, recentTimestamps);

          // Resolve user by sender's Telegram user ID (from.id), not the group chat ID
          request.log.info({ senderId, senderFirstName, groupChatId }, "Group message from user");

          let user = findUserByTelegramChatId(fastify.db, senderId);

          if (!user) {
            user = createUser(fastify.db, null, {
              telegramChatId: senderId,
              telegramUsername: senderUsername ?? undefined,
              displayName: senderFirstName,
              status: "pending",
            });
            request.log.info({ senderId, name: senderFirstName, groupChatId }, "New Telegram user created from group");
          }

          // Non-active users get a status-appropriate reply threaded to their message
          if (user.status === "pending") {
            fastify.telegramMessaging!
              .send({
                to: groupChatId,
                body: "You need to be approved before I can help you. Ask an admin to approve your account.",
                replyToMessageId: messageId,
              })
              .catch((sendErr) => {
                request.log.error({ err: sendErr }, "Failed to send pending message in group");
              });
            return;
          }

          if (user.status === "blocked") {
            fastify.telegramMessaging!
              .send({
                to: groupChatId,
                body: "Sorry, your access has been revoked.",
                replyToMessageId: messageId,
              })
              .catch((sendErr) => {
                request.log.error({ err: sendErr }, "Failed to send blocked message in group");
              });
            return;
          }

          // Process conversation in group mode
          if (fastify.llm && fastify.toolRegistry) {
            // Send typing indicator to the GROUP chat
            fastify.telegramMessaging!.sendChatAction(groupChatId, "typing").catch(() => {});

            try {
              await processConversation({
                userId: user.id,
                replyAddress: groupChatId,
                displayName: user.displayName,
                isAdmin: user.isAdmin,
                messageBody: strippedMessage,
                groupChatId,
                senderDisplayName: senderFirstName,
                replyToMessageId: messageId,
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
                telegramMessaging: fastify.telegramMessaging,
                config: fastify.config,
                log: request.log,
              });
            } catch (err) {
              request.log.error({ err, groupChatId, senderId }, "Group conversation processing failed");
              fastify.telegramMessaging!
                .send({
                  to: groupChatId,
                  body: "Sorry, something went wrong.",
                  replyToMessageId: messageId,
                })
                .catch((sendErr) => {
                  request.log.error({ err: sendErr }, "Failed to send error message in group");
                });
            }
          }
        } else {
          // Channel or unknown chat type -- ignore
          request.log.debug({ chatType }, "Ignoring unsupported chat type");
        }
      },
    );
  },
  { name: "telegram-webhook", dependencies: ["database", "telegram-messaging"] },
);
