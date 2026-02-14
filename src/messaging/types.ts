export interface InboundMessage {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia: number;
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
