# Phase 13: RCS Rich Messaging + Personality - Research

**Researched:** 2026-02-14
**Domain:** Twilio RCS messaging, Content Template API, system prompt personality design
**Confidence:** MEDIUM

## Summary

Phase 13 has three distinct work areas: (1) sending search results as RCS rich cards with poster images, (2) adding quick-action suggested reply buttons, and (3) giving the assistant a fun, edgy personality. The first two are messaging layer changes using Twilio's Content Template API; the third is a system prompt rewrite.

Twilio's RCS is GA (since August 2025) and integrates through the same `client.messages.create()` API already in use. The key mechanism is **Content Templates**: pre-created message structures identified by a `ContentSid`. Templates can define both a `twilio/card` (rich content for RCS) and a `twilio/text` (SMS fallback) in a single payload. When sending via a Messaging Service with both an RCS sender and SMS sender in its pool, Twilio automatically checks device RCS capability and falls back to SMS if needed.

**However**, RCS brand onboarding requires carrier approval (4-6+ weeks), a paid Twilio account, business verification with logos/privacy policies/ToS, and campaign videos. This is a significant operational blocker for a homelab project. The pragmatic approach is: build the content template infrastructure targeting MMS as immediate delivery (poster image + text), with RCS as an upgrade path once/if brand approval is obtained. The personality update is independent and can ship immediately.

**Primary recommendation:** Implement Content Templates via the Twilio Content API for rich search results with MMS fallback as the immediate delivery channel, design for RCS upgrade without code changes, and update the system prompt for personality.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| twilio | ^5.12.1 (already installed) | Content Template API + message sending | Already in use; Content API is a sub-resource of the same SDK (`client.content.v1`) |
| N/A (system prompt) | N/A | Personality update | Plain text file edit, no library needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No new dependencies | - | - | This phase requires zero new npm packages |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Content Templates (pre-created) | Inline `mediaUrl` + `body` on each send | Content Templates give structured cards with buttons + automatic channel fallback; inline sends cannot have quick-reply buttons |
| Pre-created templates via API | Console-created templates | API creation is automatable/reproducible; Console is manual but has a visual builder |
| MMS fallback (immediate) | Wait for RCS approval | MMS works today with poster images; RCS requires 4-6 week brand approval process |

**Installation:**
```bash
# No new packages needed - twilio ^5.12.1 already installed
```

## Architecture Patterns

### Recommended Changes to Project Structure
```
src/
├── messaging/
│   ├── types.ts              # Extend OutboundMessage with contentSid, contentVariables
│   ├── twilio-provider.ts    # Extend send() to use contentSid when present
│   └── content-templates.ts  # NEW: Template creation/management utilities
├── conversation/
│   ├── system-prompt.ts      # UPDATE: Personality rewrite
│   ├── engine.ts             # UPDATE: Use rich send for search results
│   ├── message-formatter.ts  # NEW: Format tool results into rich messages
│   └── tools/                # Existing tools (no changes needed)
└── config.ts                 # ADD: TWILIO_MESSAGING_SERVICE_SID usage required
```

### Pattern 1: Content Template Creation via API

**What:** Create card templates programmatically via `POST https://content.twilio.com/v1/Content` rather than through the Twilio Console. Templates are created at application startup (or via a setup script) and their SIDs are stored for reuse.

**When to use:** When templates need dynamic variables (poster URL, title, year, overview) that change per message.

**Example:**
```typescript
// Source: https://www.twilio.com/docs/content/content-api-resources
// Create a media search result card template
const response = await fetch("https://content.twilio.com/v1/Content", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
  },
  body: JSON.stringify({
    friendly_name: "media_search_result",
    language: "en",
    variables: {
      "1": "Movie Title",
      "2": "2024",
      "3": "A brief overview of the movie...",
      "4": "https://image.tmdb.org/t/p/w500/placeholder.jpg",
    },
    types: {
      "twilio/card": {
        title: "{{1}} ({{2}})",
        body: "{{3}}",
        media: ["{{4}}"],
        actions: [
          { type: "QUICK_REPLY", title: "Add this", id: "add_media" },
          { type: "QUICK_REPLY", title: "Next result", id: "next_result" },
          { type: "QUICK_REPLY", title: "Check Plex", id: "check_plex" },
        ],
      },
      "twilio/text": {
        body: "{{1}} ({{2}})\n{{3}}",
      },
    },
  }),
});
const template = await response.json();
// template.sid is the ContentSid (format: HXxxxx)
```

### Pattern 2: Sending Rich Messages via ContentSid

**What:** Replace `body` in `messages.create()` with `contentSid` + `contentVariables`.

**When to use:** When sending search results, discovery results, or any structured media information.

**Example:**
```typescript
// Source: https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder
const message = await client.messages.create({
  contentSid: "HXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  contentVariables: JSON.stringify({
    "1": "The Matrix",
    "2": "1999",
    "3": "A hacker discovers reality is simulated...",
    "4": "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
  }),
  messagingServiceSid: "MGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // Required for RCS + fallback
  to: "+15551234567",
});
```

**Critical:** When using `contentSid`, do NOT include `body` or `mediaUrl` -- they are mutually exclusive.

### Pattern 3: Handling Inbound Button Taps

**What:** When a user taps a quick-reply button, Twilio sends the button's `id` as `ButtonPayload` in the webhook, and the button's `title` as `ButtonText` and `Body`.

**When to use:** Parse inbound webhooks to detect button taps and route to appropriate handlers.

**Example:**
```typescript
// Source: https://www.twilio.com/docs/messaging/guides/webhook-request
// In webhook handler / parseInbound:
parseInbound(body: Record<string, string>): InboundMessage {
  return {
    messageSid: body.MessageSid ?? "",
    from: body.From ?? "",
    to: body.To ?? "",
    body: body.Body ?? "",
    numMedia: Number.parseInt(body.NumMedia ?? "0", 10),
    // NEW fields for rich messaging
    buttonPayload: body.ButtonPayload ?? null,
    buttonText: body.ButtonText ?? null,
  };
}
```

### Pattern 4: Messaging Service with Sender Pool (RCS + SMS Fallback)

**What:** Configure a Twilio Messaging Service with both an RCS sender and an SMS phone number in its sender pool. Twilio automatically checks device RCS capability and falls back.

**When to use:** All outbound messages should go through the Messaging Service instead of a direct phone number `from` field.

**Migration path:**
```typescript
// BEFORE (current): Direct phone number
await messaging.send({
  to: userPhone,
  body: "Hello",
  from: config.TWILIO_PHONE_NUMBER,
});

// AFTER: Messaging Service (enables RCS + SMS fallback)
await messaging.send({
  to: userPhone,
  body: "Hello",
  messagingServiceSid: config.TWILIO_MESSAGING_SERVICE_SID,
});
```

### Anti-Patterns to Avoid
- **Creating templates per-message:** Content Templates should be created once (at startup or via a setup script) and reused. Creating a new template for every message would be slow and hit API rate limits.
- **Hardcoding ContentSid values:** Store template SIDs in config or a database lookup, not in code. Templates may need to be recreated if they change.
- **Sending `body` alongside `contentSid`:** These are mutually exclusive in the Twilio API. Including both will cause errors or unexpected behavior.
- **Blocking on RCS approval:** Build the content template infrastructure now with MMS/SMS fallback. RCS is an operational upgrade, not a code change.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rich card formatting | Custom HTML/MMS card builder | Twilio Content Templates (`twilio/card`) | Handles cross-channel rendering, button interactions, fallback |
| Channel capability detection | Custom RCS detection logic | Twilio Messaging Service sender pool | Twilio automatically detects RCS support and falls back to SMS/MMS |
| Button interaction tracking | Custom state machine for button responses | Twilio `ButtonPayload` webhook field | Buttons return their `id` in the standard webhook; just parse it |
| SMS text fallback rendering | Custom "if RCS then X else Y" logic | Multi-type Content Templates (`twilio/card` + `twilio/text`) | Define both types in one template; Twilio picks the right one per channel |

**Key insight:** Twilio's Content Template system handles the entire rich-to-plain fallback chain. The code only needs to: (1) create templates once, (2) send using ContentSid + ContentVariables, (3) parse ButtonPayload from inbound webhooks.

## Common Pitfalls

### Pitfall 1: ContentSid and Body Are Mutually Exclusive
**What goes wrong:** Sending a message with both `contentSid` and `body` params causes unpredictable behavior or API errors.
**Why it happens:** Developers try to "add" rich content on top of existing text sending logic.
**How to avoid:** When using ContentSid, remove `body` and `mediaUrl` entirely. The `OutboundMessage` type should be a discriminated union or have clear either/or semantics.
**Warning signs:** Twilio API errors mentioning conflicting parameters.

### Pitfall 2: RCS Brand Approval Takes 4-6+ Weeks
**What goes wrong:** Planning assumes RCS is available immediately; it's blocked by carrier approval.
**Why it happens:** RCS requires business verification, logos (224x224px), banner images (1140x448px), privacy policy URL, terms of service URL, campaign demo videos, and carrier-by-carrier approval.
**How to avoid:** Start the approval process in parallel but do NOT block implementation on it. Use Messaging Service with SMS/MMS sender for immediate functionality. Add RCS sender to pool later.
**Warning signs:** No RCS sender in Twilio Console; messages always falling back to SMS.

### Pitfall 3: Quick-Reply Button Title Max 20 Characters
**What goes wrong:** Button titles are truncated or template creation fails.
**Why it happens:** RCS quick-reply buttons have a strict 20-character limit on `title`.
**How to avoid:** Keep button titles short: "Add this" (8), "Next result" (11), "Check Plex" (10) -- all within limits. Validate during template creation.
**Warning signs:** Template creation API returns validation errors.

### Pitfall 4: TMDB Image URLs Need to Be Publicly Accessible
**What goes wrong:** Poster images don't render in RCS cards or MMS.
**Why it happens:** TMDB image URLs (`https://image.tmdb.org/t/p/w500/...`) are public, but if the URL format changes or the path is null, the card fails.
**How to avoid:** Always null-check `poster_path` before building the URL. Use a placeholder image when poster is unavailable. The existing `tmdbImageUrl()` utility already returns null for missing paths.
**Warning signs:** Cards render without images; broken image indicators.

### Pitfall 5: Personality Prompt Conflicting with Conciseness
**What goes wrong:** The "fun, edgy, spicy" personality generates longer responses that break SMS readability.
**Why it happens:** Emoji-heavy, personality-driven responses are longer. Current prompt says "Be concise. Users are texting via SMS."
**How to avoid:** The personality instructions must reinforce brevity alongside character. "Be spicy but SHORT" not "be a character without constraints."
**Warning signs:** Response lengths increasing significantly after personality update.

### Pitfall 6: Button State When No Search Context Exists
**What goes wrong:** User taps "Add this" or "Next result" but there's no search result in context.
**Why it happens:** Buttons persist in message history. User may tap an old button from a previous conversation.
**How to avoid:** The conversation engine already has context via conversation history. The LLM can handle "Add this" even from button taps because it sees previous search results in history. Treat `ButtonPayload` as equivalent to the user typing the `ButtonText` -- the LLM handles intent from context.
**Warning signs:** "I don't know what you'd like to add" responses after button taps.

## Code Examples

Verified patterns from official sources:

### Creating a Card Content Template
```typescript
// Source: https://www.twilio.com/docs/content/content-api-resources
// Note: The Twilio Node SDK v5 does NOT have a direct client.content.v1.contents.create()
// method for card templates with all fields. Use the REST API directly.

async function createSearchResultTemplate(
  accountSid: string,
  authToken: string,
): Promise<string> {
  const response = await fetch("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
    },
    body: JSON.stringify({
      friendly_name: "media_search_result_card",
      language: "en",
      variables: {
        "1": "Title",
        "2": "Year",
        "3": "Overview text here...",
        "4": "https://image.tmdb.org/t/p/w500/placeholder.jpg",
      },
      types: {
        "twilio/card": {
          title: "{{1}} ({{2}})",
          body: "{{3}}",
          media: ["{{4}}"],
          actions: [
            { type: "QUICK_REPLY", title: "Add this", id: "add_media" },
            { type: "QUICK_REPLY", title: "Next result", id: "next_result" },
            { type: "QUICK_REPLY", title: "Check Plex", id: "check_plex" },
          ],
        },
        "twilio/text": {
          body: "{{1}} ({{2}})\n{{3}}",
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create template: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  return result.sid; // HXxxxx format
}
```

### Sending a Rich Message with ContentSid
```typescript
// Source: https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder
async function sendRichSearchResult(
  client: ReturnType<typeof twilio>,
  to: string,
  messagingServiceSid: string,
  contentSid: string,
  title: string,
  year: string,
  overview: string,
  posterUrl: string | null,
) {
  const variables: Record<string, string> = {
    "1": title,
    "2": year,
    "3": overview,
  };

  // Only include poster URL variable if available
  if (posterUrl) {
    variables["4"] = posterUrl;
  }

  return client.messages.create({
    contentSid,
    contentVariables: JSON.stringify(variables),
    messagingServiceSid,
    to,
  });
}
```

### Extended OutboundMessage Type
```typescript
// Extension to existing src/messaging/types.ts
export interface OutboundMessage {
  to: string;
  // Plain text message (mutually exclusive with contentSid)
  body?: string;
  // Content Template (mutually exclusive with body)
  contentSid?: string;
  contentVariables?: string; // JSON string
  // Sender identification (one of these)
  messagingServiceSid?: string;
  from?: string;
}
```

### Extended InboundMessage Type
```typescript
// Extension to existing src/messaging/types.ts
export interface InboundMessage {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia: number;
  // Rich messaging button interactions
  buttonPayload: string | null;
  buttonText: string | null;
}
```

### Handling Button Taps in Webhook
```typescript
// Source: https://www.twilio.com/docs/messaging/guides/webhook-request
// The ButtonPayload arrives as a regular webhook parameter.
// The simplest approach: treat button taps as if the user typed the button text.
// The LLM already handles "Add this" or "Check Plex" from conversation context.

parseInbound(body: Record<string, string>): InboundMessage {
  return {
    messageSid: body.MessageSid ?? "",
    from: body.From ?? "",
    to: body.To ?? "",
    body: body.Body ?? "",
    numMedia: Number.parseInt(body.NumMedia ?? "0", 10),
    buttonPayload: body.ButtonPayload ?? null,
    buttonText: body.ButtonText ?? null,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SMS-only plain text | RCS rich cards via Content Templates | Twilio RCS GA Aug 2025 | Visual media cards with buttons in native messaging app |
| `body` + `mediaUrl` for MMS | `contentSid` + `contentVariables` for Content Templates | Content API available 2024+ | Structured templates with channel-specific rendering and fallback |
| Direct phone number sending (`from`) | Messaging Service with sender pool | Long available, now critical for RCS | Automatic RCS/SMS channel selection and fallback |
| Manual channel detection | Twilio automatic capability check | Built into Messaging Service | No client-side channel detection needed |

**Deprecated/outdated:**
- Sending RCS with the `rcs:` prefix in `To` forces RCS without fallback -- avoid unless intentionally disabling fallback
- The Twilio Node SDK does not have complete helper methods for Content Template creation with cards; use the REST API directly via `fetch()`

## Open Questions

1. **RCS Brand Approval for Homelab Projects**
   - What we know: RCS requires business verification with logos, privacy policy, ToS, campaign videos. Designed for commercial brands.
   - What's unclear: Whether a personal/homelab project can pass carrier approval. No documentation addresses hobbyist use cases.
   - Recommendation: Start the RCS sender registration process in parallel. If denied, MMS (poster image + text) via Content Templates still provides a visual upgrade over plain SMS. The code architecture is identical either way.

2. **Template Management Strategy: Static vs Dynamic**
   - What we know: Templates can be created via API at startup, stored in database, or managed via Console. Templates with variables support dynamic content.
   - What's unclear: Whether one template with variables suffices for all search results (movie and TV), or if separate templates are better (movie card vs TV card with season count).
   - Recommendation: Start with one template for search results (title, year, overview, poster) and one for discovery results. Add type-specific templates later if needed. Template SIDs should be stored in the database or config for easy updates.

3. **Where to Intercept: Engine vs Messaging Layer**
   - What we know: Currently, `engine.ts` produces a text `reply` string, then calls `messaging.send({ body: reply })`. For rich cards, we need to send a ContentSid instead of body text.
   - What's unclear: Should the engine produce structured output (e.g., `{ type: 'rich_card', data: {...} }`) and the messaging layer convert to ContentSid? Or should the engine directly call `messaging.sendRichCard()`?
   - Recommendation: Keep the engine producing text replies for normal conversation. Add a **message formatter** layer between the engine and the send call that detects when the LLM's tool results contain search/discovery data and optionally upgrades to a rich send. This preserves the existing architecture while adding the rich messaging path.

4. **Multiple Results Handling**
   - What we know: Search can return multiple results. A single RCS card shows one result. Twilio supports `twilio/carousel` for multiple cards, but carousel is more complex.
   - What's unclear: Should we send one card for the top result and text for the rest? Or a carousel? Or multiple individual card messages?
   - Recommendation: Send the top result as a rich card (with "Next result" button). When user taps "Next result," send the next one as another card. This is simpler than carousels and matches the existing "present top result first" behavior in the system prompt.

5. **Cost Implications**
   - What we know: RCS text messages cost ~$0.0083/msg, RCS rich media ~$0.022/msg, SMS ~$0.0079/msg, MMS ~$0.02/msg. Failed messages cost $0.001.
   - What's unclear: Whether sending rich cards for every search result significantly increases costs for a homelab.
   - Recommendation: Rich cards are only ~$0.01 more than plain SMS per message. For a homelab with a few users, this is negligible. No cost optimization needed.

## Sources

### Primary (HIGH confidence)
- [Twilio Content Template Builder docs](https://www.twilio.com/docs/content) - Content types, template structure, channel support
- [Twilio Card content type](https://www.twilio.com/docs/content/twiliocard) - Card JSON schema, actions, media, channel limits
- [Twilio Quick-Reply content type](https://www.twilio.com/docs/content/twilio-quick-reply) - Button structure, max 10 buttons, 20-char title limit
- [Twilio Content API endpoints](https://www.twilio.com/docs/content/content-api-resources) - REST API for CRUD on templates, ContentSid format
- [Twilio Send Templates docs](https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder) - ContentSid + ContentVariables in messages.create()
- [Twilio Variables with Content API](https://www.twilio.com/docs/content/using-variables-with-content-api) - Variable syntax {{1}}, limits, dynamic media URLs
- [Twilio RCS send/receive docs](https://www.twilio.com/docs/rcs/send-an-rcs-message) - RCS sender, Messaging Service fallback, Node.js examples
- [Twilio RCS onboarding](https://www.twilio.com/docs/rcs/onboarding) - Brand approval process, 4-6 week timeline, requirements
- [Twilio Webhook request params](https://www.twilio.com/docs/messaging/guides/webhook-request) - ButtonPayload, ButtonText, ButtonType fields

### Secondary (MEDIUM confidence)
- [Twilio RCS GA announcement](https://www.twilio.com/en-us/press/releases/rcs-general-availability) - RCS available globally Aug 2025, 20+ countries, 55+ carriers
- [Sending RCS Cards tutorial (Python)](https://www.twilio.com/en-us/blog/developers/tutorials/product/sending-rcs-cards-using-python) - Full card template JSON with actions, fallback pattern
- [Getting started with RCS Node.js](https://www.twilio.com/en-us/blog/developers/tutorials/product/getting-started-with-rcs-node) - Node.js sending, Messaging Service setup
- [RCS button payload changelog](https://www.twilio.com/en-us/changelog/rcs-button-payload) - Standardized button payloads (no longer base64 encoded)
- [Content Templates overview](https://www.twilio.com/docs/content/overview) - Multi-channel fallback, content types by channel

### Tertiary (LOW confidence)
- [Twilio pricing page](https://www.twilio.com/en-us/pricing/messaging) - RCS pricing ($0.0083-$0.022/msg) -- prices may change

## Codebase Integration Notes

### Files That Need Changes

1. **`src/messaging/types.ts`** - Extend `OutboundMessage` with `contentSid`, `contentVariables`. Extend `InboundMessage` with `buttonPayload`, `buttonText`.
2. **`src/messaging/twilio-provider.ts`** - Update `send()` to pass `contentSid`/`contentVariables` to `client.messages.create()`. Update `parseInbound()` to extract button fields.
3. **`src/conversation/engine.ts`** - After getting the LLM reply, detect if the reply references a search result that should be sent as a rich card. Route to rich send when applicable.
4. **`src/conversation/system-prompt.ts`** - Complete personality rewrite. The current prompt is neutral/professional. Phase 13 requires fun, edgy, slightly spicy with emojis.
5. **`src/config.ts`** - `TWILIO_MESSAGING_SERVICE_SID` already exists but is optional. May need to become required when Content Templates are used (required for RCS fallback).

### Files That Should NOT Change

- **`src/conversation/tools/*`** - The LLM tools should continue returning structured data (title, year, overview, posterUrl). The formatting into rich cards happens downstream.
- **`src/plugins/webhook.ts`** - The webhook handler structure stays the same. `parseInbound()` changes are in the provider.
- **`src/media/tmdb/tmdb.utils.ts`** - `tmdbImageUrl()` already works correctly for poster URLs.

### Existing Data Available for Rich Cards

The `discover_media` tool already returns `posterUrl` via `tmdbImageUrl()`. The `search_movies` and `search_series` tools do NOT currently return poster URLs. They would need to either:
- (a) Add `posterUrl` to search results (requires checking if Sonarr/Radarr search responses include TMDB poster paths), OR
- (b) Do a secondary TMDB lookup by tmdbId to get the poster (adds latency)

The `discover_media` tool is already rich-card-ready with: title, year, tmdbId, overview, rating, posterUrl.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Twilio SDK already installed, Content Template API well-documented, no new deps
- Architecture: MEDIUM - Template creation via REST API (not SDK) is less ergonomic; message formatter layer is a design decision not yet validated
- Pitfalls: HIGH - Well-documented API constraints (mutually exclusive params, button limits, approval timeline)
- Personality: HIGH - System prompt change is straightforward text editing

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days - Twilio APIs are stable)
