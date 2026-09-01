import type { ProviderDeliveryState } from "./messageTransport";

export type NormalizedTwilioInbound = {
  senderAddress: string;
  recipientAddress: string;
  channel: "whatsapp";
  signalType: "text";
  rawContent: string;
  providerMessageId: string;
  accountSid: string;
  timestamp: number;
  metadata: {
    inReplyToMessageId?: string;
    provider: "twilio";
  };
};

export function formatTwilioWhatsAppAddress(value: string) {
  return `whatsapp:${normalizeWhatsAppAddress(value)}`;
}

export function normalizeWhatsAppAddress(value: string) {
  const clean = value.trim().replace(/^whatsapp:/i, "");
  if (!/^\+[1-9]\d{7,14}$/.test(clean)) {
    throw new Error("WhatsApp address must be an E.164 phone number");
  }
  return clean;
}

export function normalizeTwilioInbound(
  params: Record<string, string>,
  timestamp = Date.now(),
): NormalizedTwilioInbound {
  const providerMessageId = required(params.MessageSid, "MessageSid", 100);
  const accountSid = required(params.AccountSid, "AccountSid", 100);
  const rawContent = required(params.Body, "Body", 10_000, false);
  return {
    senderAddress: normalizeWhatsAppAddress(
      required(params.From, "From", 100),
    ),
    recipientAddress: normalizeWhatsAppAddress(
      required(params.To, "To", 100),
    ),
    channel: "whatsapp",
    signalType: "text",
    rawContent,
    providerMessageId,
    accountSid,
    timestamp,
    metadata: {
      inReplyToMessageId: optional(
        params.OriginalRepliedMessageSid,
        100,
      ),
      provider: "twilio",
    },
  };
}

export function normalizeTwilioDeliveryStatus(params: Record<string, string>) {
  return {
    providerMessageId: required(params.MessageSid, "MessageSid", 100),
    providerStatus: required(params.MessageStatus, "MessageStatus", 80),
    accountSid: required(params.AccountSid, "AccountSid", 100),
    failureCode: optional(params.ErrorCode, 80),
  };
}

export function normalizeTwilioDeliveryState(status: string): ProviderDeliveryState {
  switch (status.trim().toLocaleLowerCase()) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
    case "undelivered":
      return "failed";
    case "accepted":
    case "queued":
    case "scheduled":
    default:
      return "accepted";
  }
}

function required(
  value: string | undefined,
  label: string,
  maxLength: number,
  trim = true,
) {
  const checked = trim ? value?.trim() : value;
  if (!checked) throw new Error(`Twilio webhook ${label} is required`);
  if (checked.length > maxLength) {
    throw new Error(`Twilio webhook ${label} is too long`);
  }
  return checked;
}

function optional(value: string | undefined, maxLength: number) {
  const clean = value?.trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}
