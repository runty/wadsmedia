# Feature Research: Telegram Bot Integration

**Domain:** Telegram bot UX for conversational media library management (second messaging provider)
**Researched:** 2026-02-14
**Confidence:** HIGH (Telegram Bot API docs verified, existing media bots analyzed, codebase MessagingProvider interface examined)

**Scope:** This research covers ONLY Telegram-specific features and UX patterns. All core functionality (search, add, remove, discovery, Plex, notifications, etc.) already exists and works via SMS. The goal is mapping existing features to Telegram-native UX patterns and identifying Telegram-exclusive capabilities that improve the experience.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any Telegram bot user assumes exist. Missing these makes the bot feel broken or amateurish.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `/start` command with welcome message | Every Telegram bot responds to /start. It is the universal entry point. Users who open the bot for the first time and get silence will think it is broken. | LOW | Telegram sends `/start` when user first opens conversation with bot. Must trigger onboarding flow (existing logic). Can include deep link payload for registration codes: `t.me/botname?start=invite_abc123`. |
| `/help` command listing capabilities | Standard bot convention. Users type /help to understand what the bot can do. BotFather registers this in the command menu. | LOW | Return a formatted summary of capabilities. Use HTML parse_mode for clean formatting (bold, newlines). Should mirror existing system prompt capabilities list but formatted for Telegram. |
| Bot command menu (BotFather) | Telegram shows registered commands in a menu button next to the text input. Users expect this on any non-trivial bot. | LOW | Register commands via BotFather or `setMyCommands` API: /start, /help, /search, /status, /upcoming, /history. Different command sets for admin vs regular users via command scopes. |
| Inline keyboard buttons for actions | Every media bot on Telegram (Searcharr, Addarr, Botdarr) uses inline keyboards for "Add", "Next", "Skip" actions. Users will expect tappable buttons, not typed commands. | MEDIUM | `InlineKeyboardMarkup` attached to search result messages. Buttons: "Add this", "Next result", "Check Plex", "More info". Callback data limited to 64 bytes -- use short codes like `add:tmdb:12345` or `next:s:3` (search index). Must call `answerCallbackQuery` on every button press. |
| Callback query handling | When users tap inline keyboard buttons, the bot must respond. Telegram shows a loading spinner until `answerCallbackQuery` is called. Not calling it makes the bot appear frozen. | MEDIUM | Every callback query must be answered, even with an empty response. Can show a brief toast notification ("Adding to library...") or just acknowledge silently. Handle stale callbacks gracefully (button on an old message). |
| Photo messages with poster images | SMS cannot send inline images natively (MMS is a workaround). Telegram can send photos with captions and buttons as a single rich unit. Users expect visual search results. | MEDIUM | Use `sendPhoto` with TMDB poster URL, caption containing title/year/overview, and `reply_markup` containing inline keyboard. Caption supports HTML or MarkdownV2 formatting. Max caption: 1024 characters. This directly replaces the RCS rich card pattern from SMS. |
| Typing indicator (chat action) | When the bot is processing (LLM thinking, API calls), users expect to see "typing..." indicator. Without it, the bot appears dead during the 3-10 second LLM response time. | LOW | Call `sendChatAction` with action `"typing"` before processing. Telegram shows typing for ~5 seconds per call, so repeat for long operations. Fire-and-forget, no need to wait for response. Can use webhook reply optimization for this call. |
| Proper message formatting | Telegram supports rich text (bold, italic, code, links). Plain text with no formatting looks lazy compared to other Telegram bots. | LOW-MEDIUM | Use HTML parse_mode (not MarkdownV2 -- see Anti-Features). Bold titles, italic years, monospace for IDs/status codes. System prompt must instruct LLM to use HTML tags instead of plain text or markdown. Example: `<b>Breaking Bad</b> (2008) - 5 seasons on AMC`. |
| Webhook-based message receiving | Bot must receive messages via Telegram webhook, not polling. The app already runs a Fastify HTTP server for Twilio webhooks. | LOW | New route: `POST /webhook/telegram`. Telegram sends JSON updates (not form-encoded like Twilio). Validate via secret token in webhook URL or `X-Telegram-Bot-Api-Secret-Token` header. No TwiML equivalent -- respond with 200 OK and send replies via Bot API calls. |
| User identity via Telegram chat ID | SMS identifies users by phone number. Telegram identifies by `chat.id` (numeric). The user model must support both. | MEDIUM | Users table currently uses `phone` as unique identifier. Need to add `telegramChatId` column (or generalize to a provider-agnostic identifier). User resolution must work for both `phone` (SMS) and `chatId` (Telegram). A single user could potentially have both. |
| Confirmation dialogs for destructive actions | Existing system asks "Are you sure?" for removes. On Telegram, this should use inline keyboard buttons ("Yes, remove" / "Cancel") instead of expecting typed "yes"/"no". | LOW | Replace text-based confirmation with inline keyboard on the confirmation prompt message. Callback data: `confirm:remove_movie:123` / `deny:remove_movie:123`. More natural on Telegram than typing "yes". |

### Differentiators (Competitive Advantage)

Features that set WadsMedia's Telegram bot apart from existing media bots (Searcharr, Addarr, Botdarr). These leverage the natural language LLM approach -- something no existing Telegram media bot has.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Natural language conversation (not command-based) | Searcharr requires `/movie Breaking Bad`. WadsMedia lets you say "hey have you heard of Breaking Bad?" or "find me something like Stranger Things" -- the LLM understands intent. This is THE core differentiator. | LOW (already exists) | No new work needed for the capability itself. Telegram just delivers the text. The differentiator is that existing Telegram media bots are command-driven, while WadsMedia is conversational. System prompt needs minor adaptation for Telegram context (HTML formatting instead of "you are sending SMS"). |
| Message editing for progressive results | Telegram can edit sent messages. When processing a search, send "Searching..." first, then edit the message to show results. Avoids the dead silence while LLM processes. | MEDIUM | Use `sendMessage` for initial "thinking" message, then `editMessageText` or `editMessageMedia` to replace with actual results. Can also edit inline keyboard buttons (e.g., grey out "Add" after successful add). Not possible with SMS. |
| Inline keyboard state management | After a user taps "Add this", update the button row to show "Added!" (greyed out) and remove the "Add" option. Provides visual feedback without sending a new message. | MEDIUM | Use `editMessageReplyMarkup` to update button states after callback query. Example: after add, change keyboard from ["Add this", "Next", "Check Plex"] to ["Added!", "Next", "Check Plex"]. Requires tracking message_id for each sent result. |
| Photo with caption + buttons as rich card | Combine poster image, formatted caption (title, year, overview, rating), and action buttons in a single message unit. This is the Telegram-native equivalent of RCS rich cards but better -- no Content Template management needed. | MEDIUM | `sendPhoto` with `caption` (HTML formatted) and `reply_markup` (InlineKeyboardMarkup). Poster from TMDB: `https://image.tmdb.org/t/p/w500/{poster_path}`. Buttons below the image: "Add this", "Next result", "Check Plex". Much simpler than Twilio Content Templates. |
| Reply-to threading for context | Bot can reply to the user's specific message, maintaining visual conversation thread. Helps in busy chats and makes it clear which response goes with which request. | LOW | Use `reply_parameters` with `message_id` of the user's original message. Creates a visual thread in the chat. Especially useful in group chats where multiple users might be messaging. |
| Fun personality with emoji and formatting | The existing "Wads" personality uses emojis extensively. Telegram natively renders all emoji and even supports custom emoji in bot messages. Much richer than SMS emoji support. | LOW (already exists) | No change needed to personality. Telegram emoji rendering is superior to SMS. The personality actually shines more on Telegram. System prompt tweak: allow slightly longer responses since Telegram has no character limits like SMS. |
| Group chat support | Users can add the bot to a Telegram group. Multiple users can interact with it in a shared space -- "hey Wads, search for Dune" in a movie-night planning group. | HIGH | Privacy mode: bot only receives messages starting with `/` or mentioning `@botname`. Disable privacy mode via BotFather to receive all messages, OR require @mention/command prefix in groups. User resolution per message sender (not per chat). Group chat IDs are negative numbers. Must handle multiple users in same chat with separate conversation contexts. |
| Admin commands with scope restrictions | Telegram's `setMyCommands` supports different command menus for different users/chats. Admins see /users, /stats; regular users do not. | LOW | Use `setMyCommands` with `scope: BotCommandScopeChat` for admin chat to show admin-only commands. Regular users get the basic command set. Already have role system in DB. |
| Deep linking for user onboarding | Admin can generate invite links: `t.me/WadsBot?start=invite_abc123`. When a new user clicks, the bot receives the invite code and can auto-approve or fast-track onboarding. | LOW-MEDIUM | The `/start` payload is hidden from the user but received by the bot. Generate invite codes in admin dashboard, store in DB. When user sends `/start invite_xyz`, validate code and activate user. Replaces the current "text us your name and wait for admin approval" flow with a one-click invite. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| MarkdownV2 parse_mode | Seems like the "right" choice -- Markdown is developer-friendly and supports more formatting than HTML. | MarkdownV2 is notoriously painful. 20+ special characters must be escaped (`_*[]()~>#+\-=\|{}.!`). The LLM generates text with these characters constantly (movie titles with colons, parentheses for years, dashes). Every unescaped character causes a 400 error. Escaping inside entities is not allowed -- must close and reopen. Community consensus: MarkdownV2 is a "footgun." | Use HTML parse_mode exclusively. HTML is simpler (`<b>`, `<i>`, `<code>`, `<a href>`), only requires escaping `<`, `>`, `&` (standard HTML entities). LLMs already know HTML. Far fewer edge cases. |
| Inline mode (@bot query in any chat) | Let users type `@WadsBot breaking bad` in any chat to search. Results appear inline without opening the bot's chat. | Massive API surface addition (InlineQuery handler, InlineQueryResult types, article/photo result formatting). Does not support the conversational multi-turn flow (search -> add -> confirm). Only useful for one-shot queries. The bot's value is the conversation, not one-off lookups. | Support @mention in group chats instead. Full conversational flow in DMs and groups. |
| Custom reply keyboards (ReplyKeyboardMarkup) | Persistent keyboard at bottom of chat for common actions. | Replaces the user's keyboard with bot buttons. Feels intrusive. Takes up screen space permanently. Not appropriate for a conversational bot -- users should type naturally. Inline keyboards (attached to messages) are the right pattern. | Use InlineKeyboardMarkup on bot messages. User's keyboard stays normal for natural language input. |
| Slash commands for every action | `/search`, `/add`, `/remove`, `/status`, `/upcoming`, `/plex`, `/history` -- make every tool a command. | Defeats the purpose of a natural language assistant. Searcharr and Addarr are command-based because they lack LLM understanding. WadsMedia's advantage IS the conversational interface. Commands should be shortcuts, not the primary interface. | Register a minimal command set (/start, /help, /search as a shortcut). All other interactions via natural language. Commands are training wheels, not the product. |
| Full group chat integration (all messages) | Disable privacy mode so bot receives every message in a group. Process everything. | Privacy violation -- bot reads all group messages. Resource waste -- processes irrelevant messages through LLM. Cost -- every message incurs LLM API cost. Confusion -- bot might respond to messages not intended for it. | Keep privacy mode ON. Bot receives: (1) messages starting with `/`, (2) messages mentioning `@botname`, (3) replies to bot's messages. Users explicitly address the bot when they want it. |
| Telegram Payments API integration | "Let users pay for premium features." | WadsMedia is a personal/friends media server manager, not a SaaS product. Adding payments adds enormous complexity (Stripe integration, subscription state, feature gating) for zero value in this context. | No payment features. The bot serves the server owner and their trusted users. |
| Webhook on a separate port/server | Run Telegram webhook on a different port to isolate from Twilio. | Unnecessary infrastructure complexity. Fastify already handles multiple route prefixes cleanly. Both webhooks are lightweight HTTP POST handlers. | Single Fastify server, separate route prefixes: `/webhook/twilio` (existing) and `/webhook/telegram` (new). |
| Bot API local server for large files | Self-host Telegram Bot API for 2GB upload support instead of 50MB. | Massive operational overhead (additional server, different API semantics). WadsMedia sends poster images (100-300KB) and text. Never needs to send files > 50MB. | Use standard Bot API. Poster images from TMDB are well under 50MB. If file sending is ever needed, 50MB is plenty. |

---

## Detailed Feature Analysis

### 1. Photo + Caption + Inline Keyboard (Rich Result Cards)

**What it is:** The Telegram-native equivalent of RCS rich cards. Send a poster image with a formatted caption and action buttons as a single message.

**How it works:**
1. Search tool returns results with `posterUrl` (already exists in tool responses)
2. Bot calls `sendPhoto` with:
   - `photo`: TMDB poster URL (`https://image.tmdb.org/t/p/w500/{poster_path}`)
   - `caption`: HTML-formatted title, year, overview, rating
   - `parse_mode`: `"HTML"`
   - `reply_markup`: `InlineKeyboardMarkup` with action buttons
3. User taps a button -> bot receives `callback_query` -> processes action

**Example message structure:**
```
[Movie Poster Image]

<b>Dune: Part Two</b> (2024)
<i>Sci-Fi, Adventure</i> | Rating: 8.2/10

Follow-up of the acclaimed Dune based on the second half
of Frank Herbert's novel...

[Add this] [Next result] [Check Plex]
```

**Why this is better than SMS/RCS:**
- No Content Template management (Twilio requires pre-registered templates)
- Image, text, and buttons in one atomic message (RCS sometimes splits)
- No 20-character button label limit (Telegram allows longer labels)
- No per-template approval process
- Edit after sending (update buttons after action)

**Callback data design (64-byte limit):**
- `add:m:12345` -- add movie with TMDB ID 12345 (13 bytes)
- `add:s:67890` -- add series with TVDB ID (13 bytes)
- `nxt:s:3` -- next search result, index 3 (7 bytes)
- `plx:m:12345` -- check Plex for movie (13 bytes)
- `cfm:rm:123` -- confirm remove, library ID 123 (11 bytes)
- `dny:rm:123` -- deny/cancel remove (11 bytes)
- Short codes keep us well within 64 bytes.

**Complexity:** MEDIUM -- `sendPhoto` is straightforward, but requires:
- New method on MessagingProvider interface (or Telegram-specific send logic)
- Callback query handler route/middleware
- State tracking for which message corresponds to which search result
- `answerCallbackQuery` call on every button press

**Confidence:** HIGH -- Telegram Bot API sendPhoto with reply_markup is well-documented and used by every media bot.

### 2. Message Editing for Progressive UX

**What it is:** Instead of showing nothing while the LLM processes (3-10 seconds), send an immediate "thinking" message, then edit it to show the actual result.

**Flow:**
1. User sends "find me sci-fi movies from the 90s"
2. Bot immediately sends: "Searching for sci-fi movies from the 90s..." (with typing indicator)
3. LLM processes, tool calls happen
4. Bot edits the message to show: photo + formatted results + inline keyboard

**Methods needed:**
- `sendChatAction(chat_id, "typing")` -- show typing indicator
- `sendMessage(chat_id, "Searching...")` -- immediate feedback, returns `message_id`
- `editMessageText(chat_id, message_id, result_text)` -- replace with results
- OR `deleteMessage` + `sendPhoto` if switching from text to photo (cannot edit text message to photo)

**Important limitation:** You cannot edit a text message into a photo message. If the final result should include a poster image, either:
- (a) Send a placeholder photo first (generic "searching" image), then `editMessageMedia` + `editMessageCaption`
- (b) Send a text "Searching..." message, delete it, then send the photo result

Option (b) is simpler and recommended.

**Complexity:** MEDIUM -- the editing itself is simple, but the message lifecycle management (tracking message_id, knowing when to edit vs delete+resend) adds state.

**Confidence:** HIGH -- `editMessageText`, `editMessageMedia`, and `deleteMessage` are stable API methods.

### 3. Webhook Integration with Fastify

**What it is:** Receive Telegram updates via HTTP webhook, integrated into the existing Fastify server.

**How Telegram webhooks differ from Twilio:**
- Twilio: form-encoded POST body, TwiML response required, signature validation via header
- Telegram: JSON POST body, respond with 200 OK (no response body needed), validate via secret token header

**Implementation:**
1. Register webhook with Telegram: `setWebhook(url, secret_token)`
2. New route: `POST /webhook/telegram`
3. Validate `X-Telegram-Bot-Api-Secret-Token` header matches stored secret
4. Parse update JSON -> extract message, callback_query, or other update type
5. Resolve user by `message.from.id` (Telegram user ID) or `message.chat.id`
6. Route to conversation engine (same `processConversation` call)
7. Reply via Bot API calls (`sendMessage`, `sendPhoto`, etc.) -- NOT via HTTP response body

**Key difference from Twilio flow:** Twilio expects an immediate TwiML response via HTTP. Telegram does not -- you respond 200 OK immediately and send replies separately via Bot API HTTP calls. This actually simplifies the flow (no `formatReply`/`formatEmptyReply` needed).

**MessagingProvider interface impact:**
- `send()`: calls Telegram Bot API instead of Twilio API
- `validateWebhook()`: checks secret token header
- `parseInbound()`: extracts from Telegram Update JSON
- `formatReply()` / `formatEmptyReply()`: NOT NEEDED for Telegram (no response body format)

The existing `MessagingProvider` interface has `formatReply`/`formatEmptyReply` methods that are Twilio-specific (TwiML). The Telegram provider would return empty strings or throw "not applicable." Consider whether the interface needs refactoring or if no-op implementations suffice.

**Complexity:** LOW-MEDIUM -- straightforward HTTP handler. The nuance is adapting the existing messaging flow to handle the "no response body" pattern.

**Confidence:** HIGH.

### 4. User Identity Generalization

**What it is:** Extend the user model to support Telegram chat IDs alongside phone numbers.

**Current state:**
- `users.phone` is the unique identifier (TEXT, NOT NULL, UNIQUE)
- `findUserByPhone(db, phone)` is the user resolution function
- Phone number comes from Twilio webhook `From` field
- All notifications, replies, etc. use `user.phone` as the address

**Telegram user identification:**
- `message.from.id`: Telegram user ID (stable numeric ID, never changes)
- `message.chat.id`: Chat ID where message was sent (same as user ID in DMs, different in groups)
- `message.from.username`: Optional, can change, NOT reliable for identification
- `message.from.first_name` / `last_name`: Display name (can change)

**Schema change options:**

Option A: Add `telegramChatId` column
```sql
ALTER TABLE users ADD COLUMN telegram_chat_id TEXT UNIQUE;
```
- Simple, additive, non-breaking
- User resolution: try phone first (SMS), then telegram_chat_id (Telegram)
- A user with both phone and telegram_chat_id can use either channel
- Admin dashboard links Telegram to existing user OR creates new user

Option B: Generalize to `provider` + `providerId`
```sql
CREATE TABLE user_identities (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  provider TEXT NOT NULL, -- 'sms', 'telegram', 'discord'
  provider_id TEXT NOT NULL, -- phone number or chat ID
  UNIQUE(provider, provider_id)
);
```
- More extensible (Discord, Signal later)
- More complex (join table, multiple lookups)
- Over-engineering if only SMS + Telegram are planned

**Recommendation:** Option A. Add `telegramChatId` column. Simple, sufficient, non-breaking. If Discord/Signal come later, refactor then. YAGNI until proven otherwise.

**Complexity:** MEDIUM -- schema migration is simple, but every place that uses `user.phone` for sending messages needs to be provider-aware (send to phone via Twilio OR send to chatId via Telegram).

**Confidence:** HIGH.

### 5. Group Chat Support

**What it is:** Allow the bot to function in Telegram group chats, enabling shared media management for households or friend groups.

**How it should work:**
- Bot stays in Privacy Mode (default) -- only receives:
  - Messages starting with `/` (commands)
  - Messages mentioning `@WadsMediaBot`
  - Replies to the bot's own messages
- Each user in the group is identified individually by `message.from.id`
- Bot responds in the group chat with `reply_to` referencing the user's message
- Each user has their own conversation history and permissions

**Group-specific considerations:**
- **Chat ID:** Group chat IDs are negative numbers (e.g., `-1001234567890`). Bot sends to the group chat ID, not individual user IDs.
- **Multi-user context:** User A asks "search for Dune", User B asks "search for Inception" -- both in same group. Each user has separate conversation context tracked by `from.id`, but replies go to the same group chat.
- **Privacy:** In a group, all members see bot responses. This is a feature (collaborative discovery) not a bug. But watch history should probably not be shared in groups -- redirect those queries to DM.
- **Rate limiting:** Groups have a 20 messages/minute limit from bots. If multiple users are active, throttling needed.
- **Mention requirement:** In groups, require `@WadsMediaBot` prefix or reply-to-bot for activation. Prevents accidental triggers from casual conversation.

**Complexity:** HIGH -- group chat introduces:
- Multi-user state in a single chat
- Privacy considerations (what to show publicly vs redirect to DM)
- Rate limiting per group
- Reply-to threading to maintain clarity
- Different activation patterns (mention/@, reply-to, commands)

**Confidence:** MEDIUM -- group chat patterns are well-documented in Telegram Bot API, but the multi-user conversation management with LLM context is novel.

### 6. Onboarding via Deep Linking

**What it is:** Replace the current SMS onboarding flow ("What's your name?" -> admin approval) with a simpler link-based flow for Telegram.

**Current SMS flow:**
1. Unknown number texts bot
2. Bot asks for name
3. User provides name
4. Admin notified, manually adds to whitelist
5. User activated on next message

**Telegram deep link flow:**
1. Admin generates invite link in dashboard: `https://t.me/WadsBot?start=inv_abc123`
2. Admin shares link with new user (via Telegram, email, text, etc.)
3. User clicks link -> Telegram opens bot -> user taps START
4. Bot receives `/start inv_abc123`
5. Bot validates invite code -> auto-activates user
6. Bot sends welcome message with capabilities

**Advantages:**
- One-click onboarding (no back-and-forth)
- No phone number needed (Telegram users might not want to share phone)
- Invite codes can be single-use or multi-use
- Admin controls who gets access without knowing their phone number

**Schema:**
```sql
CREATE TABLE invite_codes (
  code TEXT PRIMARY KEY,
  created_by INTEGER REFERENCES users(id),
  max_uses INTEGER DEFAULT 1,
  uses INTEGER DEFAULT 0,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
```

**Complexity:** LOW-MEDIUM -- the deep linking mechanism is built into Telegram. The new part is invite code generation/validation and the admin dashboard UI for managing codes.

**Confidence:** HIGH -- Telegram deep linking is well-documented and widely used for this exact purpose.

---

## Feature Dependencies

```
[Telegram Provider (MessagingProvider impl)]
    |
    +--requires--> [Bot token env var (TELEGRAM_BOT_TOKEN)]
    +--requires--> [Webhook route (/webhook/telegram)]
    +--requires--> [User identity generalization (telegramChatId column)]
    |
    +--enables--> [All Telegram features below]

[Inline Keyboards + Callback Queries]
    |
    +--requires--> [Telegram Provider]
    +--requires--> [Callback query handler in webhook route]
    +--requires--> [State tracking: message_id <-> search result mapping]
    |
    +--enables--> [Rich result cards (photo + caption + buttons)]
    +--enables--> [Confirmation dialogs via buttons]
    +--enables--> [Message editing for button state updates]

[Photo Messages (Rich Result Cards)]
    |
    +--requires--> [Telegram Provider]
    +--requires--> [TMDB poster URLs (ALREADY EXISTS in tool responses)]
    |
    +--enhances--> [Search results presentation]
    +--enhances--> [Discovery results presentation]

[Message Editing]
    |
    +--requires--> [Telegram Provider]
    +--requires--> [Message ID tracking per sent message]
    |
    +--enhances--> [Progressive "Searching..." -> results UX]
    +--enhances--> [Inline keyboard state updates]

[Typing Indicator]
    |
    +--requires--> [Telegram Provider]
    |
    +--enhances--> [Processing feedback during LLM calls]

[Group Chat Support]
    |
    +--requires--> [Telegram Provider]
    +--requires--> [Per-user context in shared chat (from.id resolution)]
    +--requires--> [Reply-to threading]
    |
    +--enhances--> [Collaborative media discovery]
    +--conflicts(partially)--> [Private data queries (watch history)]

[Deep Link Onboarding]
    |
    +--requires--> [Telegram Provider]
    +--requires--> [Invite code table + validation logic]
    +--enhances--> [Admin dashboard (invite code management UI)]

[Bot Command Menu]
    |
    +--requires--> [Telegram Provider]
    +--requires--> [BotFather configuration OR setMyCommands API call]
    |
    +--enhances--> [Discoverability of features]

[HTML Formatting in Responses]
    |
    +--requires--> [System prompt adaptation for Telegram context]
    +--requires--> [HTML escape utility for dynamic content]
    |
    +--enhances--> [All text responses]
```

### Dependency Notes

- **Telegram Provider is foundational:** Everything depends on the basic provider implementation. Build this first.
- **Inline keyboards require callback handler:** The webhook route must handle both `message` updates and `callback_query` updates. Build together.
- **Photo messages and inline keyboards are independent:** Can send photos without buttons and buttons without photos. But combining them is the target UX.
- **Message editing requires ID tracking:** Must store the `message_id` returned from `sendMessage`/`sendPhoto` calls to edit later. This is new state that SMS does not have.
- **Group chat is the highest complexity feature:** Deferred to later phase. DM-first, group-second.
- **Deep link onboarding enhances but does not replace:** Keep the name-based onboarding as fallback for users who text the bot directly without an invite link.

---

## Build Phase Recommendations

### Phase 1: Core Telegram Provider (Foundation)
- TelegramMessagingProvider implementing MessagingProvider interface
- Webhook route with secret token validation
- User identity generalization (telegramChatId column on users table)
- Telegram user resolution (findUserByTelegramId)
- `/start` and `/help` command handling
- Bot command menu registration (setMyCommands)
- Typing indicator on message receipt
- HTML formatting in system prompt and response processing
- Basic text message sending (no images/keyboards yet)

**Rationale:** Get a working text-only Telegram bot first. Validates the MessagingProvider abstraction, webhook handling, and user model changes. All subsequent features build on this.

### Phase 2: Rich Media and Interactivity
- sendPhoto with poster images for search/discovery results
- Inline keyboard buttons on result messages
- Callback query handling and routing
- Confirmation dialogs via inline keyboard buttons
- Message editing for button state updates ("Added!" feedback)
- Progressive "Searching..." -> result message flow

**Rationale:** This is where Telegram becomes meaningfully better than SMS. Photo + buttons + editing create the rich interactive experience. Depends entirely on Phase 1 provider.

### Phase 3: Telegram-Specific Enhancements
- Deep link onboarding with invite codes
- Group chat support (Privacy mode, @mention activation, reply-to threading)
- Admin command scopes (different menu for admin users)
- Notification delivery via Telegram (proactive messages to Telegram users)

**Rationale:** These are polish and expansion features. Group chat is the highest complexity item and benefits from a stable DM experience first. Deep linking improves onboarding but is not blocking.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Telegram provider (basic text) | HIGH | MEDIUM | P1 |
| Webhook route + validation | HIGH | LOW | P1 |
| User identity (telegramChatId) | HIGH | MEDIUM | P1 |
| /start + /help commands | HIGH | LOW | P1 |
| Bot command menu | MEDIUM | LOW | P1 |
| Typing indicator | MEDIUM | LOW | P1 |
| HTML message formatting | MEDIUM | LOW-MEDIUM | P1 |
| Photo messages (poster images) | HIGH | MEDIUM | P1 |
| Inline keyboard buttons | HIGH | MEDIUM | P1 |
| Callback query handling | HIGH | MEDIUM | P1 |
| Confirmation via buttons | MEDIUM | LOW | P1 |
| Message editing (button state) | MEDIUM | MEDIUM | P2 |
| Progressive search UX | MEDIUM | MEDIUM | P2 |
| Deep link onboarding | MEDIUM | LOW-MEDIUM | P2 |
| Group chat support | MEDIUM | HIGH | P3 |
| Admin command scopes | LOW | LOW | P2 |
| Telegram notifications | MEDIUM | LOW | P2 |

**Priority key:**
- P1: Must have for Telegram milestone -- core value delivery
- P2: Should have -- significantly improves Telegram experience
- P3: Nice to have -- defer if timeline is tight

---

## Competitor Feature Comparison (Telegram Media Bots)

| Feature | Searcharr | Addarr | Botdarr | WadsMedia Telegram |
|---------|-----------|--------|---------|-------------------|
| Interaction model | Command-based (`/movie X`) | Command-based (`/movie`) | Command-based | Natural language conversation |
| Search results display | Text + navigation buttons | Text + selection buttons | Text | Photo + formatted caption + action buttons |
| Add media | Button after search | Button after search | Command-based | "Add this" button OR natural language ("add it") |
| Result navigation | Forward/back buttons | Selection from list | No navigation | "Next result" button + "show me more" |
| Plex integration | No | No | No | Library check, season availability, watch history |
| Discovery (genre/actor) | No | No | No | Natural language TMDB discovery |
| Confirmation for destructive | No (no remove support) | No | No | Inline keyboard "Yes, remove" / "Cancel" |
| Message formatting | Plain text | Plain text + buttons | Plain text | HTML rich text (bold, italic, links) |
| Typing indicator | No | No | No | Yes, during LLM processing |
| Message editing | No | No | No | Progressive results, button state updates |
| Group chat | Limited (commands only) | Yes (commands) | Yes (commands) | Full conversational in groups via @mention |
| User authentication | `/start <password>` | Password auth | Chat ID whitelist | Deep link invite codes + admin approval |
| Multi-platform | Telegram only | Telegram only | Telegram + Discord + Slack + Matrix | SMS + Telegram (with abstraction for more) |
| Personality | None (robotic) | None (robotic) | None (robotic) | Fun, opinionated assistant character |

---

## MessagingProvider Interface Impact Assessment

The existing `MessagingProvider` interface was designed for Twilio. Key gaps for Telegram:

| Interface Method | SMS/Twilio | Telegram | Gap |
|-----------------|------------|----------|-----|
| `send(OutboundMessage)` | Body text, contentSid, mediaUrl | sendMessage, sendPhoto, inline keyboards | OutboundMessage needs `replyMarkup`, `photo`, `chatId` fields OR a Telegram-specific send method |
| `validateWebhook()` | Twilio signature validation | Secret token header check | Different params, same concept |
| `parseInbound()` | Form-encoded body -> InboundMessage | JSON Update -> InboundMessage + CallbackQuery | InboundMessage needs `callbackData` field, or separate parsing for callback queries |
| `formatReply()` | Returns TwiML string | Not applicable (no response body) | Dead method for Telegram -- return empty or refactor interface |
| `formatEmptyReply()` | Returns empty TwiML | Not applicable | Same as above |

**Recommendation:** The interface needs to be extended, not replaced. Options:

1. **Extend OutboundMessage** with optional Telegram fields (`chatId`, `photo`, `replyMarkup`, `parseMode`). TwilioProvider ignores them, TelegramProvider uses them. **Simple but leaky.**

2. **Create provider-specific send methods** with a common base. `sendText(to, body)`, `sendPhoto(to, photo, caption, keyboard)`. Each provider implements what it supports. **Cleaner but more refactoring.**

3. **Keep interface minimal, use provider-specific wrapper.** The conversation engine calls `messaging.send()` for text. For Telegram-specific features (photos, keyboards), the engine detects the provider type and calls Telegram-specific methods. **Pragmatic, minimal interface changes.**

Option 3 is recommended for the first phase. The engine already knows the user's provider context (they came in via Telegram webhook). It can access Telegram-specific methods when available.

---

## Sources

### Telegram Bot API (HIGH confidence)
- [Telegram Bot API Documentation](https://core.telegram.org/bots/api) -- complete API reference
- [Telegram Bot Features](https://core.telegram.org/bots/features) -- inline keyboards, commands, privacy mode, menu button
- [Telegram Bots Introduction](https://core.telegram.org/bots) -- deep linking, privacy mode, group behavior
- [Telegram Buttons](https://core.telegram.org/api/bots/buttons) -- inline keyboard, callback buttons
- [Telegram Bot Commands](https://core.telegram.org/api/bots/commands) -- setMyCommands, command scopes
- [Telegram Bot Menu Button](https://core.telegram.org/api/bots/menu) -- menu button configuration
- [Telegram Formatting Options](https://core.telegram.org/api/entities) -- HTML and MarkdownV2 styling
- [Telegram Threads](https://core.telegram.org/api/threads) -- reply-to threading

### Telegram Bot Frameworks (HIGH confidence)
- [grammY vs Telegraf comparison](https://grammy.dev/resources/comparison) -- framework selection rationale
- [grammY Documentation](https://grammy.dev/) -- modern TypeScript-first framework
- [grammY Flood Limits](https://grammy.dev/advanced/flood) -- rate limiting details

### Existing Media Bots (MEDIUM confidence -- GitHub README analysis)
- [Searcharr](https://github.com/toddrob99/searcharr) -- Sonarr/Radarr/Readarr bot, command-based, inline keyboards for navigation
- [Addarr](https://github.com/Waterboy1602/Addarr) -- Sonarr/Radarr bot, inline keyboards, multi-language
- [Botdarr](https://github.com/shayaantx/botdarr) -- multi-platform bot (Telegram+Discord+Slack+Matrix)

### Telegram Bot Rate Limits (MEDIUM-HIGH confidence)
- [Telegram Bots FAQ](https://core.telegram.org/bots/faq) -- 30 msg/sec global, 20 msg/min per group, 1 msg/sec per DM
- [GramIO Rate Limits Guide](https://gramio.dev/rate-limits) -- adaptive retry, flood control

### Callback Data Limitations (HIGH confidence)
- [callback_data limit discussion](https://github.com/nmlorg/metabot/issues/1) -- 64 bytes confirmed
- [Enhanced callback_data with protobuf](https://seroperson.me/2025/02/05/enhanced-telegram-callback-data/) -- workaround strategies

### MarkdownV2 Gotchas (HIGH confidence)
- [Telegraf issue #1242](https://github.com/telegraf/telegraf/issues/1242) -- comprehensive list of escape requirements
- [Telegram bug report](https://bugs.telegram.org/c/8003) -- documentation gaps for special characters

---
*Feature research for: WadsMedia Telegram Bot Integration*
*Researched: 2026-02-14*
