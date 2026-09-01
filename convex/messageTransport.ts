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
    const runId = requiredMetadataId(metadata, "runId");
    const checkInId = optionalMetadataId(metadata, "checkInId");
    const routineId = optionalMetadataId(metadata, "routineId");
    const tarlaExecutionId = optionalMetadataId(metadata, "tarlaExecutionId");
    const mealPlanId = optionalMetadataId(metadata, "mealPlanId");
    const dayPlanId = optionalMetadataId(metadata, "dayPlanId");
    const cookVisitId = optionalMetadataId(metadata, "cookVisitId");
    if (
      !(checkInId && routineId) &&
      !(tarlaExecutionId && (mealPlanId || dayPlanId))
    ) {
      throw new Error(
        "Transport metadata must identify either a Mitra instance or Tarla execution",
      );
    }
    const timestamp = Date.now();
    const messageId = `dev-${crypto.randomUUID()}`;

    await this.ctx.db.insert("devTransportMessages", {
      messageId,
      householdId: householdId as Id<"households">,
      memberId: input.recipient.memberId as Id<"members">,
      communicationEndpointId: input.recipient.endpointId as Id<"communicationEndpoints">,
      checkInId: checkInId as Id<"checkIns"> | undefined,
      runId: runId as Id<"agentRuns">,
      routineId: routineId as Id<"routines"> | undefined,
      tarlaExecutionId: tarlaExecutionId as Id<"tarlaExecutions"> | undefined,
      mealPlanId: mealPlanId as Id<"tarlaMealPlans"> | undefined,
      dayPlanId: dayPlanId as Id<"tarlaDayPlans"> | undefined,
      cookVisitId: cookVisitId as Id<"tarlaCookVisits"> | undefined,
      purpose: optionalMetadataText(metadata, "purpose"),
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

function optionalMetadataId(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value) {
    throw new Error(`Transport metadata ${key} must be a non-empty string`);
  }
  return value;
}

function optionalMetadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Transport metadata ${key} must be a non-empty string`);
  }
  return value.trim();
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
