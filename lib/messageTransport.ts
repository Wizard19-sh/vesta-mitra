export type MessageRecipient = {
  memberId: string;
  endpointId: string;
  address: string;
};

export type SendMessageInput = {
  recipient: MessageRecipient;
  channel: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type SentMessage = SendMessageInput & {
  messageId: string;
  timestamp: number;
  provider?: string;
  providerStatus?:
    | "requested"
    | "accepted"
    | "sent"
    | "delivered"
    | "read"
    | "failed";
};

export type NormalizedDeliveryState =
  | "requested"
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type ProviderDeliveryState = Exclude<
  NormalizedDeliveryState,
  "requested"
>;

export type InboundSignalType = "text" | "reaction" | "acknowledgement";

export type InboundSignal = {
  sender: MessageRecipient;
  channel: string;
  signalType: InboundSignalType;
  rawContent: string;
  messageId: string;
  timestamp: number;
  metadata?: {
    inReplyToMessageId?: string;
    reactionToMessageId?: string;
    provider?: string;
    webhookReceivedAt?: number;
    webhookValidatedAt?: number;
  };
};

export type InboundMessage = InboundSignal;

export interface MessageTransport {
  sendMessage(input: SendMessageInput): Promise<SentMessage>;
}

export function shouldApplyDeliveryState(
  current: NormalizedDeliveryState,
  next: NormalizedDeliveryState,
) {
  if (current === "failed") return false;
  const rank: Record<Exclude<NormalizedDeliveryState, "failed">, number> = {
    requested: 0,
    accepted: 1,
    sent: 2,
    delivered: 3,
    read: 4,
  };
  if (next === "failed") return rank[current] < rank.delivered;
  return rank[next] >= rank[current];
}

export function createOutboundIdempotencyKey(input: {
  checkInId?: string;
  tarlaExecutionId?: string;
  dayPlanId?: string;
  mealPlanId?: string;
  purpose?: string;
  message: string;
}) {
  const source = input.checkInId
    ? `mitra:${input.checkInId}`
    : `tarla:${input.tarlaExecutionId ?? "unlinked"}`;
  const version = input.dayPlanId ?? input.mealPlanId ?? "none";
  return `${source}:${input.purpose ?? "message"}:${version}:${smallHash(input.message)}`;
}

function smallHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Local-only transport for development and tests. A future provider adapter can
 * implement MessageTransport without changing Mitra, Tarla, or household data.
 * Metadata must contain routing context only, never credentials or secrets.
 */
export class DevMessageTransport implements MessageTransport {
  private sequence = 0;
  private readonly messages: SentMessage[] = [];

  async sendMessage(input: SendMessageInput): Promise<SentMessage> {
    const channel = requiredText(input.channel, "Channel");
    const message = requiredText(input.message, "Message");
    const address = requiredText(input.recipient.address, "Recipient address");
    const timestamp = Date.now();
    const sent: SentMessage = {
      ...input,
      recipient: { ...input.recipient, address },
      channel,
      message,
      metadata: input.metadata ? { ...input.metadata } : undefined,
      messageId: `dev-${timestamp}-${++this.sequence}`,
      timestamp,
    };
    this.messages.push(sent);
    return { ...sent, recipient: { ...sent.recipient } };
  }

  inspectSentMessages(): SentMessage[] {
    return this.messages.map((message) => ({
      ...message,
      recipient: { ...message.recipient },
      metadata: message.metadata ? { ...message.metadata } : undefined,
    }));
  }
}

function requiredText(value: string, label: string) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  return clean;
}
