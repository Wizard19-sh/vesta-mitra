import type { ProviderDeliveryState } from "./messageTransport";

export type NormalizedMetaInbound = {
  senderAddress: string;
  recipientAddress?: string;
  channel: "whatsapp";
  signalType: "text" | "reaction";
  rawContent: string;
  providerMessageId: string;
  timestamp: number;
  wabaId: string;
  phoneNumberId: string;
  metadata: {
    inReplyToMessageId?: string;
    reactionToMessageId?: string;
    provider: "meta";
  };
};

export type NormalizedMetaDelivery = {
  providerMessageId: string;
  providerStatus: string;
  normalizedStatus: ProviderDeliveryState;
  failureCode?: string;
  timestamp: number;
  wabaId: string;
  phoneNumberId: string;
};

export type NormalizedMetaWebhook = {
  messages: NormalizedMetaInbound[];
  deliveries: NormalizedMetaDelivery[];
};

export function formatMetaRecipientAddress(value: string) {
  const clean = value.trim().replace(/^whatsapp:/i, "");
  const digits = clean.startsWith("+") ? clean.slice(1) : clean;
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error("Meta WhatsApp recipient must be an E.164 phone number");
  }
  return digits;
}

export function normalizeMetaSenderAddress(value: string) {
  return `+${formatMetaRecipientAddress(value)}`;
}

export function normalizeMetaGraphApiVersion(value: string) {
  const clean = value.trim().toLocaleLowerCase();
  if (!/^v\d{1,3}\.\d{1,2}$/.test(clean)) {
    throw new Error("Meta Graph API version must look like v25.0");
  }
  return clean;
}

export function normalizeMetaPhoneNumberId(value: string) {
  const clean = value.trim();
  if (!/^\d{5,30}$/.test(clean)) {
    throw new Error("Meta Phone Number ID must contain digits only");
  }
  return clean;
}

export function buildMetaMessagesUrl(apiVersion: string, phoneNumberId: string) {
  return `https://graph.facebook.com/${normalizeMetaGraphApiVersion(apiVersion)}/${normalizeMetaPhoneNumberId(phoneNumberId)}/messages`;
}

export function buildMetaTextMessageBody(recipient: string, message: string) {
  const body = requiredText(message, "Meta WhatsApp message", 4_096, false);
  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to: formatMetaRecipientAddress(recipient),
    type: "text" as const,
    text: {
      preview_url: false,
      body,
    },
  };
}

export function verifyMetaWebhookChallenge(
  input: { mode?: string; verifyToken?: string; challenge?: string },
  configuredVerifyToken: string,
) {
  if (
    input.mode !== "subscribe" ||
    !input.verifyToken ||
    !input.challenge ||
    !constantTimeTextEqual(input.verifyToken, configuredVerifyToken)
  ) {
    return null;
  }
  return input.challenge;
}

export async function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  appSecret: string,
) {
  const match = signatureHeader.trim().match(/^sha256=([0-9a-f]{64})$/i);
  if (!match || !appSecret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)),
  );
  const received = hexToBytes(match[1]);
  return constantTimeBytesEqual(expected, received);
}

export function normalizeMetaWebhook(
  payload: unknown,
  receivedAt = Date.now(),
): NormalizedMetaWebhook {
  const root = record(payload, "Meta webhook payload");
  if (root.object !== "whatsapp_business_account") {
    throw new Error("Unsupported Meta webhook object");
  }
  const messages: NormalizedMetaInbound[] = [];
  const deliveries: NormalizedMetaDelivery[] = [];
  for (const entryValue of array(root.entry)) {
    const entry = record(entryValue, "Meta webhook entry");
    const wabaId = requiredString(entry.id, "Meta WABA ID", 100);
    for (const changeValue of array(entry.changes)) {
      const change = record(changeValue, "Meta webhook change");
      if (change.field !== "messages") continue;
      const value = record(change.value, "Meta messages value");
      const metadata = record(value.metadata, "Meta messages metadata");
      const phoneNumberId = normalizeMetaPhoneNumberId(
        requiredString(metadata.phone_number_id, "Meta Phone Number ID", 30),
      );
      const recipientAddress = optionalDisplayAddress(metadata.display_phone_number);
      for (const messageValue of array(value.messages)) {
        const message = record(messageValue, "Meta inbound message");
        const providerMessageId = requiredString(
          message.id,
          "Meta message ID",
          300,
        );
        const senderAddress = normalizeMetaSenderAddress(
          requiredString(message.from, "Meta message sender", 30),
        );
        const timestamp = metaTimestamp(message.timestamp, receivedAt);
        const context = optionalRecord(message.context);
        const inReplyToMessageId = optionalString(context?.id, 300);
        if (message.type === "text") {
          const text = record(message.text, "Meta text message");
          messages.push({
            senderAddress,
            recipientAddress,
            channel: "whatsapp",
            signalType: "text",
            rawContent: requiredText(text.body, "Meta message body", 10_000, false),
            providerMessageId,
            timestamp,
            wabaId,
            phoneNumberId,
            metadata: {
              inReplyToMessageId,
              provider: "meta",
            },
          });
        } else if (message.type === "reaction") {
          const reaction = record(message.reaction, "Meta reaction message");
          const reactionToMessageId = requiredString(
            reaction.message_id,
            "Meta reaction target",
            300,
          );
          messages.push({
            senderAddress,
            recipientAddress,
            channel: "whatsapp",
            signalType: "reaction",
            rawContent: stringValue(reaction.emoji),
            providerMessageId,
            timestamp,
            wabaId,
            phoneNumberId,
            metadata: {
              inReplyToMessageId,
              reactionToMessageId,
              provider: "meta",
            },
          });
        }
      }
      for (const statusValue of array(value.statuses)) {
        const status = record(statusValue, "Meta delivery status");
        const providerStatus = requiredString(
          status.status,
          "Meta delivery status",
          80,
        ).toLocaleLowerCase();
        const errors = array(status.errors);
        const firstError = errors.length ? optionalRecord(errors[0]) : undefined;
        deliveries.push({
          providerMessageId: requiredString(
            status.id,
            "Meta delivery message ID",
            300,
          ),
          providerStatus,
          normalizedStatus: normalizeMetaDeliveryState(providerStatus),
          failureCode: optionalString(firstError?.code, 80),
          timestamp: metaTimestamp(status.timestamp, receivedAt),
          wabaId,
          phoneNumberId,
        });
      }
    }
  }
  return { messages, deliveries };
}

export function normalizeMetaDeliveryState(status: string): ProviderDeliveryState {
  switch (status.trim().toLocaleLowerCase()) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "failed";
    default:
      return "accepted";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function requiredString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(`${label} is required`);
  return requiredText(value, label, maxLength);
}

function optionalString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function requiredText(
  value: unknown,
  label: string,
  maxLength: number,
  trim = true,
) {
  if (typeof value !== "string") throw new Error(`${label} is required`);
  const clean = trim ? value.trim() : value;
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return clean;
}

function optionalDisplayAddress(value: unknown) {
  if (typeof value !== "string") return undefined;
  const digits = value.replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : undefined;
}

function metaTimestamp(value: unknown, fallback: number) {
  if (typeof value !== "string" || !/^\d{1,15}$/.test(value)) return fallback;
  const timestamp = Number(value) * 1_000;
  return Number.isSafeInteger(timestamp) ? timestamp : fallback;
}

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function constantTimeTextEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}
