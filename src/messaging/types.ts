export interface InboundMessage {
  providerMessageId: string;
  from: string;
  to: string;
  body: string;
  numMedia: number;
  /** Button id from RCS/rich messaging quick-reply tap (maps to Twilio ButtonPayload, Telegram callback_data) */
  buttonPayload: string | null;
  /** Button title from RCS/rich messaging quick-reply tap (maps to Twilio ButtonText) */
  buttonText: string | null;
}

export interface OutboundMessage {
  to: string;
  /** Plain text message body */
  body?: string;
  /** Media URLs to attach (forces MMS on Twilio) */
  mediaUrl?: string[];
}

export interface SendResult {
  providerMessageId: string;
  status: string;
}

export interface WebhookValidationParams {
  headers: Record<string, string | string[] | undefined>;
  url: string;
  body: unknown;
}

export interface MessagingProvider {
  readonly providerName: string;

  /** Send an outbound message */
  send(message: OutboundMessage): Promise<SendResult>;

  /** Validate an incoming webhook request is authentic */
  validateWebhook(params: WebhookValidationParams): boolean;

  /** Parse raw webhook body into a normalized InboundMessage */
  parseInbound(body: unknown): InboundMessage;

  /**
   * Format a webhook response for the provider.
   * Returns the response body string, or null for providers that don't reply inline
   * (e.g. Telegram sends via API, not webhook response).
   * When text is undefined/empty, returns empty response (for Twilio: empty TwiML).
   * When text is provided, returns response with message (for Twilio: TwiML with message).
   */
  formatWebhookResponse(text?: string): string | null;
}
