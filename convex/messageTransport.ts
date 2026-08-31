import type { MessageTransport, SendMessageInput, SentMessage } from "../lib/messageTransport";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export function getMessageTransport(ctx: MutationCtx): MessageTransport {
  return new ConvexDevelopmentTransport(ctx);
}

class ConvexDevelopmentTransport implements MessageTransport {
  constructor(private readonly ctx: MutationCtx) {}

  async sendMessage(input: SendMessageInput): Promise<SentMessage> {
    const metadata = input.metadata ?? {};
    const householdId = requiredMetadataId(metadata, "householdId");
    const checkInId = requiredMetadataId(metadata, "checkInId");
    const runId = requiredMetadataId(metadata, "runId");
    const routineId = requiredMetadataId(metadata, "routineId");
    const timestamp = Date.now();
    const messageId = `dev-${crypto.randomUUID()}`;

    await this.ctx.db.insert("devTransportMessages", {
      messageId,
      householdId: householdId as Id<"households">,
      memberId: input.recipient.memberId as Id<"members">,
      communicationEndpointId: input.recipient.endpointId as Id<"communicationEndpoints">,
      checkInId: checkInId as Id<"checkIns">,
      runId: runId as Id<"agentRuns">,
      routineId: routineId as Id<"routines">,
      recipientAddress: requiredText(input.recipient.address, "Recipient address"),
      channel: requiredText(input.channel, "Channel"),
      message: requiredText(input.message, "Message"),
      sentAt: timestamp,
    });

    return {
      ...input,
      messageId,
      timestamp,
    };
  }
}

function requiredMetadataId(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Transport metadata ${key} is required`);
  }
  return value;
}

function requiredText(value: string, label: string) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  return clean;
}
