import twilio from "twilio";
import type {
  InboundMessage,
  MessagingProvider,
  OutboundMessage,
  SendResult,
  WebhookValidationParams,
} from "./types.js";

const { twiml, validateRequest } = twilio;
const { MessagingResponse } = twiml;

/** Twilio-specific outbound message fields for rich card sends (Content Templates). */
export interface TwilioOutboundMessage extends OutboundMessage {
  /** Content Template SID for rich card sends (mutually exclusive with body) */
  contentSid?: string;
  /** JSON string of template variables: {"1": "val", "2": "val", ...} */
  contentVariables?: string;
}

export class TwilioMessagingProvider implements MessagingProvider {
  readonly providerName = "twilio" as const;

  private client: ReturnType<typeof twilio>;
  private authToken: string;
  private fromNumber: string;
  private messagingServiceSid?: string;

  constructor(
    accountSid: string,
    authToken: string,
    fromNumber: string,
    messagingServiceSid?: string,
  ) {
    this.client = twilio(accountSid, authToken);
    this.authToken = authToken;
    this.fromNumber = fromNumber;
    this.messagingServiceSid = messagingServiceSid;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const fromOrService = this.messagingServiceSid
      ? { messagingServiceSid: this.messagingServiceSid }
      : { from: this.fromNumber };

    // Check for Twilio-specific rich card fields
    const twilioMsg = message as TwilioOutboundMessage;
    if (twilioMsg.contentSid) {
      const result = await this.client.messages.create({
        contentSid: twilioMsg.contentSid,
        ...(twilioMsg.contentVariables
          ? { contentVariables: twilioMsg.contentVariables }
          : {}),
        to: message.to,
        ...fromOrService,
      });
      return { providerMessageId: result.sid, status: result.status };
    }

    // Plain text (or MMS with media)
    const result = await this.client.messages.create({
      body: message.body ?? "",
      to: message.to,
      ...(message.mediaUrl?.length ? { mediaUrl: message.mediaUrl } : {}),
      ...fromOrService,
    });
    return { providerMessageId: result.sid, status: result.status };
  }

  validateWebhook(params: WebhookValidationParams): boolean {
    const signature = params.headers["x-twilio-signature"];
    if (typeof signature !== "string") return false;
    const body = params.body as Record<string, string>;
    return validateRequest(this.authToken, signature, params.url, body);
  }

  parseInbound(body: unknown): InboundMessage {
    const b = body as Record<string, string>;
    return {
      providerMessageId: b.MessageSid ?? "",
      from: b.From ?? "",
      to: b.To ?? "",
      body: b.Body ?? "",
      numMedia: Number.parseInt(b.NumMedia ?? "0", 10),
      buttonPayload: b.ButtonPayload ?? null,
      buttonText: b.ButtonText ?? null,
    };
  }

  formatWebhookResponse(text?: string): string {
    const response = new MessagingResponse();
    if (text) {
      response.message(text);
    }
    return response.toString();
  }
}
