import twilio from "twilio";
import type { InboundMessage, MessagingProvider, OutboundMessage, SendResult } from "./types.js";

const { twiml, validateRequest } = twilio;
const { MessagingResponse } = twiml;

export class TwilioMessagingProvider implements MessagingProvider {
  private client: ReturnType<typeof twilio>;
  private authToken: string;

  constructor(accountSid: string, authToken: string) {
    this.client = twilio(accountSid, authToken);
    this.authToken = authToken;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (message.contentSid) {
      // Rich card via Content Template
      const result = await this.client.messages.create({
        contentSid: message.contentSid,
        ...(message.contentVariables ? { contentVariables: message.contentVariables } : {}),
        to: message.to,
        ...(message.messagingServiceSid
          ? { messagingServiceSid: message.messagingServiceSid }
          : { from: message.from }),
      });
      return { sid: result.sid, status: result.status };
    }

    // Plain text (existing behavior)
    const result = await this.client.messages.create({
      body: message.body ?? "",
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
    return validateRequest(this.authToken, params.signature, params.url, params.body);
  }

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
