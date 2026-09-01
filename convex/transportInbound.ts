import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";

const inboundMetadata = v.optional(
  v.object({
    inReplyToMessageId: v.optional(v.string()),
    reactionToMessageId: v.optional(v.string()),
    provider: v.optional(v.string()),
    webhookReceivedAt: v.optional(v.number()),
    webhookValidatedAt: v.optional(v.number()),
  }),
);

export const resolveRoute = internalQuery({
  args: {
    senderAddress: v.string(),
    channel: v.string(),
    provider: v.string(),
    inReplyToProviderMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const endpoints = await endpointCandidates(
      ctx,
      args.senderAddress,
      args.channel,
      args.provider,
    );
    if (args.inReplyToProviderMessageId) {
      const referenced = await ctx.db
        .query("transportMessages")
        .withIndex("by_provider_message_id", (q) =>
          q.eq("providerMessageId", args.inReplyToProviderMessageId),
        )
        .unique();
      if (
        referenced &&
        endpoints.some(
          (endpoint) =>
            endpoint._id === referenced.communicationEndpointId,
        )
      ) {
        const route = await routeForMessage(ctx, referenced);
        if (route) return route;
      }
    }

    const candidates = [];
    for (const endpoint of endpoints) {
      const messages = await ctx.db
        .query("transportMessages")
        .withIndex("by_endpoint", (q) =>
          q.eq("communicationEndpointId", endpoint._id),
        )
        .order("desc")
        .collect();
      for (const message of messages) {
        if (message.status === "failed") continue;
        const route = await routeForMessage(ctx, message);
        if (route) {
          candidates.push({ ...route, requestedAt: message.requestedAt });
          break;
        }
      }
    }
    // One address may appear on multiple test endpoints. Routing is safe only
    // when exactly one of them has a currently open agent task.
    if (candidates.length > 1) return null;
    const selected = candidates[0];
    if (selected) {
      return {
        agent: selected.agent,
        ownerKey: selected.ownerKey,
        endpointId: selected.endpointId,
      };
    }
    if (endpoints.length === 1) {
      const household = await ctx.db.get(endpoints[0].householdId);
      return household
        ? {
            agent: "unmatched" as const,
            ownerKey: household.ownerKey,
            endpointId: endpoints[0]._id,
          }
        : null;
    }
    return null;
  },
});

export const persistUnmatched = internalMutation({
  args: {
    senderAddress: v.string(),
    channel: v.string(),
    signalType: v.union(
      v.literal("text"),
      v.literal("reaction"),
      v.literal("acknowledgement"),
    ),
    rawContent: v.string(),
    messageId: v.string(),
    timestamp: v.number(),
    endpointId: v.optional(v.id("communicationEndpoints")),
    metadata: inboundMetadata,
  },
  handler: async (ctx, args) => {
    const dedupeKey = `${args.channel}:${args.messageId}`;
    const duplicate = await ctx.db
      .query("inboundSignals")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if (duplicate) return { signalId: duplicate._id, duplicate: true };
    const endpoint = args.endpointId
      ? await ctx.db.get(args.endpointId)
      : null;
    const signalId = await ctx.db.insert("inboundSignals", {
      dedupeKey,
      householdId: endpoint?.householdId,
      memberId: endpoint?.memberId,
      communicationEndpointId: endpoint?._id,
      agent: "vesta",
      senderAddress: args.senderAddress,
      channel: args.channel,
      signalType: args.signalType,
      rawContent: args.rawContent,
      messageId: args.messageId,
      timestamp: args.timestamp,
      metadata: args.metadata,
      matched: false,
      createdAt: Date.now(),
    });
    return { signalId, duplicate: false };
  },
});

async function endpointCandidates(
  ctx: QueryCtx,
  senderAddress: string,
  channel: string,
  provider: string,
) {
  const addresses = [senderAddress, `whatsapp:${senderAddress}`];
  const found: Doc<"communicationEndpoints">[] = [];
  for (const address of addresses) {
    const matches = await ctx.db
      .query("communicationEndpoints")
      .withIndex("by_channel_and_address", (q) =>
        q.eq("channel", channel).eq("address", address),
      )
      .collect();
    found.push(...matches);
  }
  return found.filter(
    (endpoint, index, all) =>
      all.findIndex((candidate) => candidate._id === endpoint._id) === index &&
      endpoint.active &&
      endpoint.consentStatus === "granted" &&
      endpoint.providerMetadata?.provider?.toLocaleLowerCase() === provider &&
      endpoint.providerMetadata.ready === true,
  );
}

async function routeForMessage(
  ctx: QueryCtx,
  message: Doc<"transportMessages">,
) {
  const household = await ctx.db.get(message.householdId);
  if (!household) return null;
  if (message.checkInId) {
    const checkIn = await ctx.db.get(message.checkInId);
    if (
      checkIn &&
      ["WAITING", "SENT", "UNCONFIRMED"].includes(checkIn.status)
    ) {
      return {
        agent: "mitra" as const,
        ownerKey: household.ownerKey,
        endpointId: message.communicationEndpointId,
      };
    }
  }
  if (message.tarlaExecutionId) {
    const execution = await ctx.db.get(message.tarlaExecutionId);
    if (
      execution &&
      ["waiting", "revised_waiting", "question_received", "unresolved"].includes(
        execution.status,
      )
    ) {
      return {
        agent: "tarla" as const,
        ownerKey: household.ownerKey,
        endpointId: message.communicationEndpointId,
      };
    }
  }
  return null;
}
