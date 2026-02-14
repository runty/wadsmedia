# Phase 2: Messaging Gateway - Research

**Researched:** 2026-02-13
**Domain:** Twilio SMS/RCS webhook integration with Fastify
**Confidence:** HIGH

## Summary

Phase 2 implements a modular messaging gateway that receives inbound Twilio SMS/RCS messages via webhook, validates their authenticity, and can send outbound messages via the Twilio REST API. The architecture uses a ports-and-adapters pattern where a TypeScript interface defines the messaging contract and a Twilio adapter implements it. This keeps the core logic decoupled from Twilio, allowing future provider swaps.

Twilio sends incoming messages as `application/x-www-form-urlencoded` POST requests to a configured webhook URL, signed with an `X-Twilio-Signature` HMAC-SHA1 header. Fastify needs `@fastify/formbody` to parse these bodies and `fastify-raw-body` is NOT needed because Twilio uses form-encoded bodies (not JSON), and the Twilio SDK's `validateRequest()` function takes the parsed key-value params directly, not a raw body string. The webhook responds with TwiML XML for immediate replies, while outbound messages initiated by the application use the REST API via `client.messages.create()`.

RCS support is handled transparently through Twilio Messaging Services. When an RCS sender and SMS sender are both in a Messaging Service's sender pool, Twilio automatically attempts RCS first and falls back to SMS. The application code is identical for both channels -- use `messagingServiceSid` instead of `from` and Twilio handles channel selection. The MSG-04 "text-first" requirement means responses should be plain text strings (no RCS-only formatting like carousels or rich cards) so they read well as SMS.

**Primary recommendation:** Use the `twilio` npm package (v5.x) with `@fastify/formbody` for webhook parsing, implement `validateRequest()` in a Fastify `preHandler` hook, define a `MessagingProvider` TypeScript interface, and implement a `TwilioMessagingProvider` adapter.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `twilio` | ^5.12 | Twilio REST API client, TwiML generation, signature validation | Official SDK, ships TypeScript types, ESM-compatible default export |
| `@fastify/formbody` | ^8.0 | Parse `application/x-www-form-urlencoded` request bodies | Official Fastify plugin for form data, required for Twilio webhooks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fastify-plugin` | ^5.1 (already installed) | Encapsulate Fastify plugins without scope isolation | Wrapping the messaging plugin |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `twilio` SDK | Raw HTTP calls to Twilio API | Lose signature validation, TwiML helpers, auto-pagination; no benefit |
| TwiML XML response | REST API for all replies | TwiML is simpler for immediate webhook replies; REST API needed for async/proactive sends |
| `@fastify/formbody` | Custom `addContentTypeParser` | More code, same result; official plugin is 3 lines to register |

**Installation:**
```bash
npm install twilio @fastify/formbody
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── messaging/
│   ├── types.ts              # MessagingProvider interface, InboundMessage/OutboundMessage types
│   └── twilio-provider.ts    # TwilioMessagingProvider implements MessagingProvider
├── plugins/
│   ├── messaging.ts          # Fastify plugin: registers provider on fastify instance
│   └── webhook.ts            # Fastify plugin: /webhook/twilio route with signature validation
├── plugins/
│   ├── database.ts           # (existing)
│   └── health.ts             # (existing)
└── config.ts                 # Add required TWILIO_* env vars (make non-optional)
```

### Pattern 1: Messaging Provider Interface (Ports & Adapters)
**What:** Define a TypeScript interface for all messaging operations, implement it with a Twilio-specific adapter.
**When to use:** Always. This is the MSG-01 requirement.
**Example:**
```typescript
// Source: Ports & Adapters pattern for messaging
// src/messaging/types.ts

export interface InboundMessage {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia: number;
  // Preserve raw params for signature validation and future extensibility
}

export interface OutboundMessage {
  to: string;
  body: string;
  messagingServiceSid?: string;
  from?: string;
}

export interface SendResult {
  sid: string;
  status: string;
}

export interface MessagingProvider {
  /** Send an outbound message */
  send(message: OutboundMessage): Promise<SendResult>;

  /** Validate an incoming webhook request is authentic */
  validateWebhook(params: {
    signature: string;
    url: string;
    body: Record<string, string>;
  }): boolean;

  /** Parse raw webhook body params into a normalized InboundMessage */
  parseInbound(body: Record<string, string>): InboundMessage;

  /** Generate a TwiML response string for an immediate reply */
  formatReply(text: string): string;

  /** Generate an empty TwiML response (acknowledge without replying) */
  formatEmptyReply(): string;
}
```

### Pattern 2: Twilio Adapter Implementation
**What:** Concrete implementation of MessagingProvider using the Twilio SDK.
**When to use:** Production. Could swap for a mock/stub in tests.
**Example:**
```typescript
// Source: Twilio official docs + SDK exports
// src/messaging/twilio-provider.ts

import twilio from "twilio";
import { twiml } from "twilio";

const { MessagingResponse } = twiml;

export class TwilioMessagingProvider implements MessagingProvider {
  private client: ReturnType<typeof twilio>;
  private authToken: string;

  constructor(accountSid: string, authToken: string) {
    this.client = twilio(accountSid, authToken);
    this.authToken = authToken;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const result = await this.client.messages.create({
      body: message.body,
      to: message.to,
      ...(message.messagingServiceSid
        ? { messagingServiceSid: message.messagingServiceSid }
        : { from: message.from }),
    });
    return { sid: result.sid, status: result.status };
  }

  validateWebhook(params: {
    signature: string;
    url: string;
    body: Record<string, string>;
  }): boolean {
    return twilio.validateRequest(
      this.authToken,
      params.signature,
      params.url,
      params.body,
    );
  }

  parseInbound(body: Record<string, string>): InboundMessage {
    return {
      messageSid: body.MessageSid ?? "",
      from: body.From ?? "",
      to: body.To ?? "",
      body: body.Body ?? "",
      numMedia: Number.parseInt(body.NumMedia ?? "0", 10),
    };
  }

  formatReply(text: string): string {
    const response = new MessagingResponse();
    response.message(text);
    return response.toString();
  }

  formatEmptyReply(): string {
    const response = new MessagingResponse();
    return response.toString();
  }
}
```

### Pattern 3: Webhook Route with Signature Validation preHandler
**What:** Fastify route that validates Twilio signatures before processing.
**When to use:** All incoming webhook routes.
**Example:**
```typescript
// Source: Twilio webhook security docs + Fastify patterns
// src/plugins/webhook.ts

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";

export default fp(
  async (fastify: FastifyInstance) => {
    // Signature validation as preHandler hook
    const validateTwilioSignature = async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
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
        const message = fastify.messaging.parseInbound(
          request.body as Record<string, string>,
        );
        request.log.info({ from: message.from, body: message.body }, "Incoming message");

        // Phase 2: acknowledge receipt; later phases add conversation logic
        const twimlResponse = fastify.messaging.formatEmptyReply();
        reply.type("text/xml").send(twimlResponse);
      },
    );
  },
  { name: "webhook", dependencies: ["messaging"] },
);
```

### Pattern 4: Fastify Plugin Registration
**What:** Register the messaging provider on the Fastify instance.
**Example:**
```typescript
// src/plugins/messaging.ts
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
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = fastify.config;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
    }

    const provider = new TwilioMessagingProvider(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    fastify.decorate("messaging", provider);

    fastify.log.info("Messaging provider registered (Twilio)");
  },
  { name: "messaging" },
);
```

### Anti-Patterns to Avoid
- **Importing Twilio in route handlers directly:** Couples routes to Twilio. Always go through the `MessagingProvider` interface.
- **Hardcoding the webhook URL:** The URL must be reconstructed from request headers at runtime. Twilio uses the exact URL it called for signature validation, including query parameters.
- **Using `req.protocol` without checking `x-forwarded-proto`:** Behind Docker/nginx/load balancers, the protocol seen by the app is HTTP, but Twilio sent HTTPS. Signature validation will fail if you use the wrong protocol.
- **Sending JSON responses to Twilio webhooks:** Twilio expects TwiML (XML) or plain text responses. JSON responses will be ignored.
- **Trimming whitespace from form body params:** Some middleware trims whitespace. This breaks HMAC signature validation. `@fastify/formbody` uses Node's `querystring.parse` which does not trim.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA1 signature validation | Custom crypto.createHmac implementation | `twilio.validateRequest()` | Twilio may change signing algorithm; their SDK handles edge cases, parameter sorting, URL normalization |
| TwiML XML generation | String template XML | `twiml.MessagingResponse` from `twilio` | Proper escaping, valid XML structure, handles nested elements |
| Form body parsing | Custom querystring parser | `@fastify/formbody` | Handles encoding edge cases, integrates with Fastify's content-type system |
| RCS/SMS channel selection | Manual channel detection logic | Twilio Messaging Services with sender pool | Twilio handles device capability detection and automatic fallback |

**Key insight:** Twilio's webhook security model is HMAC-SHA1 with specific parameter sorting rules. Hand-rolling this is fragile and breaks when Twilio adds new parameters (which they do without notice).

## Common Pitfalls

### Pitfall 1: SSL Termination Breaks Signature Validation
**What goes wrong:** `validateRequest()` returns false for every legitimate request.
**Why it happens:** App sees `http://` but Twilio used `https://`. The URL is part of the HMAC calculation, so any mismatch fails.
**How to avoid:** Always reconstruct the URL using `x-forwarded-proto` header. In Docker/production, the reverse proxy terminates SSL.
**Warning signs:** All webhook requests return 403 in production but work locally with ngrok.

### Pitfall 2: Missing formbody Parser
**What goes wrong:** `request.body` is undefined or a raw string in Twilio webhook handler.
**Why it happens:** Fastify does not parse `application/x-www-form-urlencoded` by default (only JSON and plain text).
**How to avoid:** Register `@fastify/formbody` before the webhook route.
**Warning signs:** Logging `request.body` shows `undefined` instead of an object.

### Pitfall 3: Config Validation Not Updated for Required Twilio Vars
**What goes wrong:** App starts without Twilio credentials and crashes when first webhook arrives.
**Why it happens:** Phase 1 config schema marks Twilio vars as `.optional()`. Phase 2 needs them required.
**How to avoid:** Update `config.ts` to make `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` required (remove `.optional()`). Or: validate at plugin registration time and throw a clear error.
**Warning signs:** Zod schema still has `.optional()` on Twilio fields.

### Pitfall 4: Twilio SDK ESM Default Import
**What goes wrong:** `twilio` is `undefined` or not a function when imported.
**Why it happens:** The Twilio SDK is a CommonJS package with a default export. ESM interop varies.
**How to avoid:** Use `import twilio from "twilio"` for the client factory. Use `import { twiml } from "twilio"` for TwiML classes. The SDK supports both patterns. With `verbatimModuleSyntax` in tsconfig, use `import twilio from "twilio"` (default import of CJS module).
**Warning signs:** `TypeError: twilio is not a function` at runtime.

### Pitfall 5: Webhook URL Must Include Query Parameters
**What goes wrong:** Signature validation fails intermittently.
**Why it happens:** When Twilio sends JSON bodies, it appends `?bodySHA256=...` to the URL. If you strip query params when reconstructing the URL, the HMAC won't match.
**How to avoid:** Use `request.url` (which includes query string) rather than `request.routeOptions.url` (which is the route pattern).
**Warning signs:** Validation works for SMS (form-encoded, no query params) but fails for other webhook types.

### Pitfall 6: Responding with Wrong Content-Type
**What goes wrong:** Twilio ignores your reply or logs an error.
**Why it happens:** Responding with `application/json` instead of `text/xml` for TwiML.
**How to avoid:** Always set `reply.type("text/xml")` when returning TwiML. Alternatively, `text/plain` works if you just want to send a plain text reply (Twilio sends it as a message).
**Warning signs:** Twilio dashboard shows "Error 12100 - Document parse failure."

## Code Examples

Verified patterns from official sources:

### Initializing the Twilio Client (ESM)
```typescript
// Source: https://github.com/twilio/twilio-node, https://www.twilio.com/en-us/blog/how-to-send-sms-node-js
import twilio from "twilio";

const client = twilio(accountSid, authToken);
```

### Sending an Outbound Message
```typescript
// Source: https://www.twilio.com/docs/messaging/tutorials/how-to-send-sms-messages
const message = await client.messages.create({
  body: "Hello from wadsmedia!",
  to: "+15558675310",
  from: "+15017122661",       // OR use messagingServiceSid
});
console.log(message.sid);     // e.g., "SM1234..."
console.log(message.status);  // e.g., "queued"
```

### Sending with Messaging Service (RCS + SMS fallback)
```typescript
// Source: https://www.twilio.com/docs/rcs/send-an-rcs-message
const message = await client.messages.create({
  body: "This tries RCS first, falls back to SMS.",
  messagingServiceSid: "MGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  to: "+15558675310",
});
```

### Validating a Webhook Signature
```typescript
// Source: https://www.twilio.com/docs/usage/webhooks/webhooks-security
import twilio from "twilio";

const isValid = twilio.validateRequest(
  authToken,                        // Your Twilio auth token
  request.headers["x-twilio-signature"],  // The signature header
  webhookUrl,                       // The full URL Twilio called
  request.body,                     // Parsed form params as key-value object
);
```

### Generating TwiML Reply
```typescript
// Source: https://www.twilio.com/docs/messaging/tutorials/how-to-receive-and-reply/node-js
import { twiml } from "twilio";
const { MessagingResponse } = twiml;

const response = new MessagingResponse();
response.message("Thanks for your message!");
const xml = response.toString();
// Output: <?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks for your message!</Message></Response>
```

### Registering @fastify/formbody
```typescript
// Source: https://github.com/fastify/fastify-formbody
import formbody from "@fastify/formbody";

await fastify.register(formbody);
// Now request.body is parsed for application/x-www-form-urlencoded
```

### Twilio Incoming Webhook Body Shape
```typescript
// Source: https://www.twilio.com/docs/messaging/guides/webhook-request
// Twilio sends these as application/x-www-form-urlencoded:
interface TwilioWebhookBody {
  MessageSid: string;       // "SM1234567890ABCDE"
  AccountSid: string;       // "AC1234567890ABCDE"
  From: string;             // "+15551234567" (E.164)
  To: string;               // "+15559876543" (E.164)
  Body: string;             // The message text
  NumMedia: string;         // "0" (string, not number)
  NumSegments: string;      // "1"
  // Optional geographic data:
  FromCity?: string;
  FromState?: string;
  FromZip?: string;
  FromCountry?: string;
  ToCity?: string;
  ToState?: string;
  ToZip?: string;
  ToCountry?: string;
  // If media attached:
  MediaContentType0?: string;
  MediaUrl0?: string;
  // Messaging Service:
  MessagingServiceSid?: string;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SMS-only via Twilio phone number | RCS + SMS via Messaging Services | Aug 2025 (RCS GA) | Use `messagingServiceSid` for automatic RCS with SMS fallback |
| `require('twilio')` CommonJS | `import twilio from "twilio"` ESM | Twilio Node v5 (2024) | SDK ships dual CJS/ESM builds; TypeScript types included |
| Express middleware `twilio.webhook()` | Framework-agnostic `twilio.validateRequest()` | Always available | `webhook()` is Express-only; use `validateRequest()` for Fastify |
| `@types/twilio` DefinitelyTyped | Built-in TypeScript types | Twilio Node v4+ | Do NOT install `@types/twilio`; types ship with the SDK |
| `SmsSid` / `SmsMessageSid` params | `MessageSid` param | Deprecated | Use `MessageSid`; old names still sent but deprecated |

**Deprecated/outdated:**
- `twilio.webhook()` Express middleware: Express-specific, do not use with Fastify
- `@types/twilio`: No longer needed, SDK has built-in types
- `SmsSid` / `SmsMessageSid` webhook params: Deprecated aliases for `MessageSid`

## Open Questions

1. **Messaging Service SID vs From number**
   - What we know: Using a Messaging Service SID enables automatic RCS-to-SMS fallback. Using a `from` number sends SMS only (unless number is in an RCS sender pool).
   - What's unclear: Whether the project has a Twilio Messaging Service set up, or will use direct `from` number.
   - Recommendation: Support both patterns in the provider interface. Use `TWILIO_PHONE_NUMBER` as `from` for now; add `TWILIO_MESSAGING_SERVICE_SID` as optional config. When present, use it for automatic RCS support.

2. **Webhook URL for local development**
   - What we know: Twilio needs a publicly accessible URL. ngrok is the standard tool. Use `ngrok http 3000` (not `ngrok https`) to avoid SSL termination mismatch.
   - What's unclear: Whether to document ngrok setup as part of this phase or defer.
   - Recommendation: Document ngrok usage in plan but don't automate it. Developers configure their Twilio console manually.

3. **Config validation strategy**
   - What we know: Phase 1 config has Twilio vars as optional. Phase 2 needs them.
   - What's unclear: Whether to make them required at schema level (breaks Phase 1 standalone) or validate at plugin registration.
   - Recommendation: Keep schema optional but validate at plugin registration time. Throw clear error if missing. This preserves backward compat.

## Sources

### Primary (HIGH confidence)
- [Twilio Webhooks Security](https://www.twilio.com/docs/usage/webhooks/webhooks-security) - Signature validation methods, HMAC-SHA1 details, code examples
- [Twilio Webhook Request Parameters](https://www.twilio.com/docs/messaging/guides/webhook-request) - Complete list of incoming webhook parameters
- [Twilio Node.js GitHub](https://github.com/twilio/twilio-node) - SDK version 5.12.1, exports structure, ESM support
- [Twilio Send RCS Messages](https://www.twilio.com/docs/rcs/send-an-rcs-message) - RCS API, Messaging Service fallback, code examples
- [Twilio Receive and Reply Node.js](https://www.twilio.com/docs/messaging/tutorials/how-to-receive-and-reply/node-js) - TwiML MessagingResponse, webhook handler pattern
- [@fastify/formbody GitHub](https://github.com/fastify/fastify-formbody) - v8.0.2, Fastify 5 compatible, form body parsing
- [Fastify rawBody Issue #5491](https://github.com/fastify/fastify/issues/5491) - Raw body access patterns for webhook verification

### Secondary (MEDIUM confidence)
- [Twilio How to Send SMS Node.js](https://www.twilio.com/en-us/blog/how-to-send-sms-node-js) - ESM import pattern verification
- [Twilio TypeScript SMS](https://www.twilio.com/en-us/blog/receive-reply-sms-messages-typescript-twilio) - TypeScript import syntax: `import { twiml } from "twilio"`
- [Twilio SSL Termination](https://www.twilio.com/en-us/blog/developers/tutorials/building-blocks/handle-ssl-termination-twilio-node-js-helper-library) - x-forwarded-proto handling
- [Twilio RCS GA Announcement](https://www.twilio.com/en-us/changelog/rcs-messaging-is-now-generally-available) - RCS availability Aug 2025
- [fastify-raw-body GitHub](https://github.com/Eomm/fastify-raw-body) - v5.0.0 for Fastify 5 (NOT needed for Twilio form-encoded webhooks)

### Tertiary (LOW confidence)
- None. All findings verified against official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Twilio SDK is the canonical choice, verified versions against npm and GitHub
- Architecture: HIGH - Ports-and-adapters is well-established; Fastify plugin pattern matches existing codebase
- Pitfalls: HIGH - SSL termination, formbody parsing, ESM imports all verified against official docs and community issues
- Webhook security: HIGH - `validateRequest()` API verified against official Twilio security docs with code examples

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (Twilio SDK is stable, Fastify plugin ecosystem is stable)
