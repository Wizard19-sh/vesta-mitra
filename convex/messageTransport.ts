import {
  createOutboundIdempotencyKey,
  type MessageTransport,
  type SendMessageInput,
  type SentMessage,
} from "../lib/messageTransport";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export function getMessageTransport(ctx: MutationCtx): MessageTransport {
  return new ConvexProviderRouterTransport(ctx);
}

class ConvexProviderRouterTransport implements MessageTransport {
  constructor(private readonly ctx: MutationCtx) {}

  async sendMessage(input: SendMessageInput): Promise<SentMessage> {
    const links = transportLinks(input.metadata ?? {});
    const endpointId = input.recipient
      .endpointId as Id<"communicationEndpoints">;
    const endpoint = await this.ctx.db.get(endpointId);
    if (
      !endpoint ||
      endpoint.householdId !== links.householdId ||
      endpoint.memberId !== (input.recipient.memberId as Id<"members">) ||
      endpoint.address !== input.recipient.address
    ) {
      throw new Error(
        "Transport recipient does not match its communication endpoint",
      );
    }
    const provider =
      endpoint.providerMetadata?.provider?.trim().toLocaleLowerCase() ??
      "development";
    if (provider === "development" || provider === "dev") {
      return this.sendDevelopment(input, links);
    }
    if (provider === "twilio") {
      return this.enqueueExternalProvider(input, links, endpointId, "twilio");
    }
    if (provider === "meta") {
      return this.enqueueExternalProvider(input, links, endpointId, "meta");
    }
    throw new Error(`No message transport adapter is configured for ${provider}`);
  }

  private async sendDevelopment(
    input: SendMessageInput,
    links: TransportLinks,
  ): Promise<SentMessage> {
    const timestamp = Date.now();
    const messageId = `dev-${crypto.randomUUID()}`;
    await this.ctx.db.insert("devTransportMessages", {
      messageId,
      householdId: links.householdId,
      memberId: input.recipient.memberId as Id<"members">,
      communicationEndpointId:
        input.recipient.endpointId as Id<"communicationEndpoints">,
      checkInId: links.checkInId,
      runId: links.runId,
      routineId: links.routineId,
      tarlaExecutionId: links.tarlaExecutionId,
      mealPlanId: links.mealPlanId,
      dayPlanId: links.dayPlanId,
      cookVisitId: links.cookVisitId,
      purpose: links.purpose,
      recipientAddress: requiredText(
        input.recipient.address,
        "Recipient address",
      ),
      channel: requiredText(input.channel, "Channel"),
      message: requiredText(input.message, "Message"),
      sentAt: timestamp,
    });
    return {
      ...input,
      messageId,
      timestamp,
      provider: "development",
      providerStatus: "accepted",
    };
  }

  private async enqueueExternalProvider(
    input: SendMessageInput,
    links: TransportLinks,
    endpointId: Id<"communicationEndpoints">,
    provider: "twilio" | "meta",
  ): Promise<SentMessage> {
    const endpoint = await this.ctx.db.get(endpointId);
    if (!endpoint) throw new Error("Communication endpoint not found");
    if (
      !endpoint.active ||
      endpoint.consentStatus !== "granted" ||
      endpoint.providerMetadata?.ready !== true
    ) {
      throw new Error(
        "External provider endpoint is not active, consented, and provider-ready",
      );
    }
    if (input.channel.trim().toLocaleLowerCase() !== "whatsapp") {
      throw new Error("W4 external transports support only the WhatsApp channel");
    }
    const message = requiredText(input.message, "Message");
    const idempotencyKey = createOutboundIdempotencyKey({
      checkInId: links.checkInId,
      tarlaExecutionId: links.tarlaExecutionId,
      dayPlanId: links.dayPlanId,
      mealPlanId: links.mealPlanId,
      purpose: links.purpose,
      message,
    });
    const existing = await this.ctx.db
      .query("transportMessages")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", idempotencyKey),
      )
      .unique();
    if (existing) {
      if (existing.status === "failed") {
        throw new Error(
          "A previous provider dispatch for this exact message failed; duplicate retry was blocked",
        );
      }
      return {
        ...input,
        messageId: existing.providerMessageId ?? existing.messageId,
        timestamp: existing.providerAcceptedAt ?? existing.requestedAt,
        provider: existing.provider,
        providerStatus: existing.status,
      };
    }
    const requestedAt = Date.now();
    const messageId = `transport-${crypto.randomUUID()}`;
    const transportMessageId = await this.ctx.db.insert("transportMessages", {
      messageId,
      idempotencyKey,
      provider,
      status: "requested",
      householdId: links.householdId,
      memberId: input.recipient.memberId as Id<"members">,
      communicationEndpointId: endpointId,
      checkInId: links.checkInId,
      runId: links.runId,
      routineId: links.routineId,
      tarlaExecutionId: links.tarlaExecutionId,
      mealPlanId: links.mealPlanId,
      dayPlanId: links.dayPlanId,
      cookVisitId: links.cookVisitId,
      purpose: links.purpose,
      channel: "whatsapp",
      message,
      requestedAt,
      updatedAt: requestedAt,
    });
    const scheduledJobId: Id<"_scheduled_functions"> =
      provider === "twilio"
        ? await this.ctx.scheduler.runAfter(
            0,
            internal.twilioTransport.dispatchOutbound,
            { transportMessageId },
          )
        : await this.ctx.scheduler.runAfter(
            0,
            internal.metaWhatsAppTransport.dispatchOutbound,
            { transportMessageId },
          );
    await this.ctx.db.patch(transportMessageId, {
      scheduledJobId: String(scheduledJobId),
    });
    return {
      ...input,
      messageId,
      timestamp: requestedAt,
      provider,
      providerStatus: "requested",
    };
  }
}

type TransportLinks = {
  householdId: Id<"households">;
  runId: Id<"agentRuns">;
  checkInId?: Id<"checkIns">;
  routineId?: Id<"routines">;
  tarlaExecutionId?: Id<"tarlaExecutions">;
  mealPlanId?: Id<"tarlaMealPlans">;
  dayPlanId?: Id<"tarlaDayPlans">;
  cookVisitId?: Id<"tarlaCookVisits">;
  purpose?: string;
};

function transportLinks(metadata: Record<string, unknown>): TransportLinks {
  const householdId = requiredMetadataId(
    metadata,
    "householdId",
  ) as Id<"households">;
  const runId = requiredMetadataId(metadata, "runId") as Id<"agentRuns">;
  const checkInId = optionalMetadataId(metadata, "checkInId") as
    | Id<"checkIns">
    | undefined;
  const routineId = optionalMetadataId(metadata, "routineId") as
    | Id<"routines">
    | undefined;
  const tarlaExecutionId = optionalMetadataId(metadata, "tarlaExecutionId") as
    | Id<"tarlaExecutions">
    | undefined;
  const mealPlanId = optionalMetadataId(metadata, "mealPlanId") as
    | Id<"tarlaMealPlans">
    | undefined;
  const dayPlanId = optionalMetadataId(metadata, "dayPlanId") as
    | Id<"tarlaDayPlans">
    | undefined;
  const cookVisitId = optionalMetadataId(metadata, "cookVisitId") as
    | Id<"tarlaCookVisits">
    | undefined;
  if (
    !(checkInId && routineId) &&
    !(tarlaExecutionId && (mealPlanId || dayPlanId))
  ) {
    throw new Error(
      "Transport metadata must identify either a Mitra instance or Tarla execution",
    );
  }
  return {
    householdId,
    runId,
    checkInId,
    routineId,
    tarlaExecutionId,
    mealPlanId,
    dayPlanId,
    cookVisitId,
    purpose: optionalMetadataText(metadata, "purpose"),
  };
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

function requiredMetadataId(metadata: Record<string, unknown>, key: string) {
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
