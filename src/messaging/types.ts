export interface InboundMessage {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia: number;
  /** Button id from RCS/rich messaging quick-reply tap (Twilio ButtonPayload param) */
  buttonPayload: string | null;
  /** Button title from RCS/rich messaging quick-reply tap (Twilio ButtonText param) */
  buttonText: string | null;
}

export interface OutboundMessage {
  to: string;
  /** Plain text message body (mutually exclusive with contentSid) */
  body?: string;
  /** Content Template SID for rich card sends (mutually exclusive with body) */
  contentSid?: string;
  /** JSON string of template variables: {"1": "val", "2": "val", ...} */
  contentVariables?: string;
  /** Media URLs to attach (forces MMS) */
  mediaUrl?: string[];
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
