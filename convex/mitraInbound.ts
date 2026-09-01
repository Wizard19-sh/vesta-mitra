import { v } from "convex/values";
import { interpretRoutineSignal } from "../lib/interpretRoutineSignal";
import type { MitraRoutineType } from "../lib/composeRoutineMessage";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";

const signalType = v.union(
  v.literal("text"),
  v.literal("reaction"),
  v.literal("acknowledgement"),
);

export const ingestSignal = mutation({
  args: {
    ownerKey: v.string(),
    senderAddress: v.string(),
    channel: v.string(),
    signalType,
    rawContent: v.string(),
    messageId: v.string(),
    timestamp: v.number(),
    metadata: v.optional(
      v.object({
        inReplyToMessageId: v.optional(v.string()),
        reactionToMessageId: v.optional(v.string()),
        provider: v.optional(v.string()),
        webhookReceivedAt: v.optional(v.number()),
        webhookValidatedAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const channel = requiredText(args.channel, "Channel", 80).toLocaleLowerCase();
    const senderAddress = requiredText(
      args.senderAddress,
      "Sender address",
      500,
    );
    const messageId = requiredText(args.messageId, "Message ID", 300);
    if (args.rawContent.length > 10_000) {
      throw new Error("Raw inbound content must be 10000 characters or fewer");
    }
    if (args.signalType === "text" && !args.rawContent.trim()) {
      throw new Error("Text signal content is required");
    }
    const dedupeKey = `${channel}:${messageId}`;
    const duplicate = await ctx.db
      .query("inboundSignals")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if (duplicate) {
      return {
        signalId: duplicate._id,
        matched: duplicate.matched,
        checkInId: duplicate.checkInId,
      };
    }

    const endpointCandidates = await ctx.db
      .query("communicationEndpoints")
      .withIndex("by_channel_and_address", (q) =>
        q.eq("channel", channel).eq("address", senderAddress),
      )
      .collect();
    let endpoint: Doc<"communicationEndpoints"> | undefined;
    for (const candidate of endpointCandidates) {
      const household = await ctx.db.get(candidate.householdId);
      if (household?.ownerKey === args.ownerKey) {
        endpoint = candidate;
        break;
      }
    }

    if (!endpoint) {
      const signalId = await persistSignal(ctx, args, {
        dedupeKey,
        channel,
        senderAddress,
        matched: false,
      });
      return { signalId, matched: false, checkInId: undefined };
    }

    const instances = await ctx.db
      .query("checkIns")
      .withIndex("by_member", (q) => q.eq("memberId", endpoint!.memberId))
      .order("desc")
      .collect();
    const referencedMessageId =
      args.metadata?.inReplyToMessageId ??
      args.metadata?.reactionToMessageId;
    const openInstance = instances.find(
      (instance) =>
        instance.communicationEndpointId === endpoint._id &&
        (instance.status === "WAITING" ||
          instance.status === "SENT" ||
          instance.status === "UNCONFIRMED") &&
        (!referencedMessageId ||
          instance.outboundMessageId === referencedMessageId),
    );

    if (!openInstance?.runId) {
      const signalId = await persistSignal(ctx, args, {
        dedupeKey,
        channel,
        senderAddress,
        endpoint,
        matched: false,
      });
      return { signalId, matched: false, checkInId: undefined };
    }
    const [routine, parent, run] = await Promise.all([
      ctx.db.get(openInstance.routineId),
      ctx.db.get(openInstance.parentId),
      ctx.db.get(openInstance.runId),
    ]);
    if (!routine || !parent || !run) {
      const signalId = await persistSignal(ctx, args, {
        dedupeKey,
        channel,
        senderAddress,
        endpoint,
        matched: false,
      });
      return { signalId, matched: false, checkInId: undefined };
    }

    // Persist the exact raw signal before applying any interpretation.
    const signalId = await persistSignal(ctx, args, {
      dedupeKey,
      channel,
      senderAddress,
      endpoint,
      checkInId: openInstance._id,
      runId: run._id,
      matched: true,
    });
    await completeLatestWaitingStep(
      ctx,
      run._id,
      `Received normalized ${args.signalType} signal`,
    );
    let order = await nextStepOrder(ctx, run._id);
    if (
      args.metadata?.provider &&
      args.metadata.webhookReceivedAt !== undefined &&
      args.metadata.webhookValidatedAt !== undefined
    ) {
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "receive_webhook",
        "Receive a provider webhook through the shared transport gateway",
        `Received a ${args.metadata.provider} inbound event`,
      );
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "validate_webhook",
        "Require provider authentication before routing household data",
        "Provider signature and account context were validated",
      );
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "normalize_signal",
        "Convert the provider payload to the Vesta inbound contract",
        `Normalized ${args.signalType} signal ${messageId}`,
      );
    }
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "receive_signal",
      "Accept a provider-neutral inbound signal",
      `Received ${args.signalType} signal ${messageId}`,
    );
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "persist_raw_signal",
      "Persist the original signal before interpretation",
      "Stored the unchanged raw signal in its source record",
    );

    const interpretation = interpretRoutineSignal({
      signalType: args.signalType,
      rawContent: args.rawContent,
      routineType: runtimeRoutineType(routine.type),
      parentLabel: parent.salutation ?? parent.name,
      confirmingReactions: routine.confirmingReactions,
    });
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "interpret_signal",
      "Apply deterministic self-report semantics",
      interpretation.summary,
    );

    await ctx.db.patch(openInstance._id, {
      status: interpretation.state,
      responseAt: args.timestamp,
      inboundSignalReceived: true,
      latestInboundSignalId: signalId,
      selfReportInterpretation: {
        outcome: interpretation.outcome,
        summary: interpretation.summary,
        basis: interpretation.basis,
      },
      confirmedAt:
        interpretation.state === "CONFIRMED"
          ? args.timestamp
          : openInstance.confirmedAt,
    });
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "update_routine_state",
      "Apply only the state supported by the inbound signal",
      `Updated the routine instance to ${interpretation.state}`,
    );

    if (interpretation.state === "CONFIRMED") {
      await addCompletedStep(
        ctx,
        run._id,
        order,
        "complete",
        "Finish the scheduled Mitra occurrence",
        "Completed after a supported confirmation",
      );
      await completeRun(
        ctx,
        run,
        "Routine instance completed from a self-reported confirmation",
      );
    } else {
      await addWaitingStep(
        ctx,
        run._id,
        order,
        "wait_for_reply",
        "The routine remains unresolved and can accept another signal",
      );
      await ctx.db.patch(run._id, {
        status: "waiting",
        outputSummary: `Routine instance remains ${interpretation.state}`,
        updatedAt: Date.now(),
      });
    }

    return {
      signalId,
      matched: true,
      checkInId: openInstance._id,
      state: interpretation.state,
      interpretation: interpretation.summary,
      runId: run.runId,
    };
  },
});

async function persistSignal(
  ctx: MutationCtx,
  args: {
    rawContent: string;
    signalType: "text" | "reaction" | "acknowledgement";
    messageId: string;
    timestamp: number;
    metadata?: {
      inReplyToMessageId?: string;
      reactionToMessageId?: string;
      provider?: string;
      webhookReceivedAt?: number;
      webhookValidatedAt?: number;
    };
  },
  normalized: {
    dedupeKey: string;
    channel: string;
    senderAddress: string;
    endpoint?: Doc<"communicationEndpoints">;
    checkInId?: Id<"checkIns">;
    runId?: Id<"agentRuns">;
    matched: boolean;
  },
) {
  return ctx.db.insert("inboundSignals", {
    dedupeKey: normalized.dedupeKey,
    householdId: normalized.endpoint?.householdId,
    memberId: normalized.endpoint?.memberId,
    communicationEndpointId: normalized.endpoint?._id,
    checkInId: normalized.checkInId,
    runId: normalized.runId,
    senderAddress: normalized.senderAddress,
    channel: normalized.channel,
    signalType: args.signalType,
    rawContent: args.rawContent,
    messageId: args.messageId,
    timestamp: args.timestamp,
    metadata: args.metadata,
    matched: normalized.matched,
    createdAt: Date.now(),
  });
}

async function addCompletedStep(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  order: number,
  name: string,
  inputSummary: string,
  outputSummary: string,
) {
  const startedAt = Date.now();
  const completedAt = Date.now();
  return ctx.db.insert("agentRunSteps", {
    runId,
    name,
    order,
    status: "completed",
    startedAt,
    completedAt,
    latencyMs: completedAt - startedAt,
    inputSummary,
    outputSummary,
    createdAt: startedAt,
    updatedAt: completedAt,
  });
}

async function addWaitingStep(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  order: number,
  name: string,
  inputSummary: string,
) {
  const now = Date.now();
  return ctx.db.insert("agentRunSteps", {
    runId,
    name,
    order,
    status: "waiting",
    startedAt: now,
    inputSummary,
    createdAt: now,
    updatedAt: now,
  });
}

async function completeLatestWaitingStep(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  outputSummary: string,
) {
  const steps = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_and_order", (q) => q.eq("runId", runId))
    .order("desc")
    .collect();
  const waiting = steps.find((step) => step.status === "waiting");
  if (!waiting) return;
  const completedAt = Date.now();
  await ctx.db.patch(waiting._id, {
    status: "completed",
    completedAt,
    latencyMs: completedAt - (waiting.startedAt ?? waiting.createdAt),
    outputSummary,
    updatedAt: completedAt,
  });
}

async function nextStepOrder(ctx: MutationCtx, runId: Id<"agentRuns">) {
  const latest = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_and_order", (q) => q.eq("runId", runId))
    .order("desc")
    .first();
  return (latest?.order ?? 0) + 1;
}

async function completeRun(
  ctx: MutationCtx,
  run: Doc<"agentRuns">,
  outputSummary: string,
) {
  const completedAt = Date.now();
  await ctx.db.patch(run._id, {
    status: "completed",
    completedAt,
    totalLatencyMs:
      run.startedAt === undefined ? undefined : completedAt - run.startedAt,
    outputSummary,
    updatedAt: completedAt,
  });
}

function runtimeRoutineType(type: Doc<"routines">["type"]): MitraRoutineType {
  if (type === "Exercise") return "Walk / activity";
  if (type === "How they're feeling") return "Custom";
  return type;
}

function requiredText(value: string, label: string, maxLength: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return clean;
}
