import { v } from "convex/values";
import { interpretRoutineSignal } from "../lib/interpretRoutineSignal";
import {
  composeMitraAcknowledgement,
  isHigherRiskReminderChange,
  primaryUserMitraSummary,
} from "../lib/m2Execution";
import type { AeviaLanguage } from "../lib/aeviaSetup";
import { resolveMemberSalutation } from "../lib/mitraSalutation";
import type { MitraRoutineType } from "../lib/composeRoutineMessage";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { getMessageTransport } from "./messageTransport";
import {
  createExecutionException,
  markTaskComplete,
  recordExecutionEvent,
} from "./executionSupport";

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

    const memberInstances = await ctx.db
      .query("checkIns")
      .withIndex("by_member", (q) => q.eq("memberId", endpoint!.memberId))
      .order("desc")
      .collect();
    const followUpInstances = await ctx.db
      .query("checkIns")
      .withIndex("by_follow_up_endpoint", (q) =>
        q.eq("followUpCommunicationEndpointId", endpoint!._id),
      )
      .order("desc")
      .collect();
    const instances = [...memberInstances, ...followUpInstances].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    const referencedMessageId =
      args.metadata?.inReplyToMessageId ??
      args.metadata?.reactionToMessageId;
    const openInstance = instances.find(
      (instance) =>
        (instance.communicationEndpointId === endpoint._id ||
          instance.followUpCommunicationEndpointId === endpoint._id) &&
        (instance.status === "WAITING" ||
          instance.status === "SENT" ||
          instance.status === "UNCONFIRMED") &&
        (!referencedMessageId ||
          instance.outboundMessageId === referencedMessageId ||
          instance.followUpOutboundMessageId === referencedMessageId),
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
    const [routine, parent, run, sourceMember, seniorMember] = await Promise.all([
      ctx.db.get(openInstance.routineId),
      ctx.db.get(openInstance.parentId),
      ctx.db.get(openInstance.runId),
      ctx.db.get(endpoint.memberId),
      openInstance.memberId ? ctx.db.get(openInstance.memberId) : null,
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
    await recordExecutionEvent(ctx, {
      eventKey: `${signalId}:reply_received`,
      householdId: run.householdId,
      runId: run._id,
      taskType: run.taskType,
      eventName: "reply_received",
      agent: "mitra",
      outcome: args.signalType,
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

    const sourceAudience =
      openInstance.followUpCommunicationEndpointId === endpoint._id
        ? ("caretaker" as const)
        : (openInstance.intendedRecipientClass ??
          routine.recipientAudience ??
          "senior");
    const personSalutation = resolveMemberSalutation({
      preferredSalutation: seniorMember?.preferredSalutation,
      displayName: seniorMember?.name ?? parent.name,
    });
    const recipientSalutation = resolveMemberSalutation({
      preferredSalutation: sourceMember?.preferredSalutation,
      displayName: sourceMember?.name ?? parent.name,
    });
    const language = supportedLanguage(
      endpoint.preferredLanguage ?? parent.preferredLanguage,
    );
    if (
      args.signalType === "text" &&
      isHigherRiskReminderChange({
        routineType: runtimeRoutineType(routine.type),
        rawContent: args.rawContent,
      })
    ) {
      const profile = openInstance.householdId
        ? await ctx.db
            .query("betaUserProfiles")
            .withIndex("by_household", (q) =>
              q.eq("householdId", openInstance.householdId!),
            )
            .unique()
        : null;
      if (!openInstance.householdId) {
        throw new Error("Routine instance is missing household context");
      }
      const exceptionId = await createExecutionException(ctx, {
        householdId: openInstance.householdId,
        runId: run._id,
        agent: "mitra",
        taskType: run.taskType,
        checkInId: openInstance._id,
        sourceMemberId: endpoint.memberId,
        riskClass: "high",
        policyCode: "MEDICINE_REMINDER_CHANGE_REQUIRES_APPROVAL",
        rawRequest: args.rawContent,
        proposedAction: `Stop the ${routine.label ?? routine.prompt} reminder.`,
        status: "pending_approval",
        requiredApproverMemberId: profile?.memberId,
      });
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "classify_change_request",
        "Apply the explicit beta policy for medicine-reminder changes",
        "Classified the request as higher risk and left the routine unchanged",
        {
          component: "mitra",
          usageStatus: "not_applicable",
          outcome: "PENDING_APPROVAL",
          exceptionId,
        },
      );
      const acknowledgement = composeMitraAcknowledgement({
        language,
        outcome: "change_pending",
        recipientSalutation,
      });
      const sent = await getMessageTransport(ctx).sendMessage({
        recipient: {
          memberId: String(endpoint.memberId),
          endpointId: String(endpoint._id),
          address: endpoint.address,
        },
        channel: endpoint.channel,
        message: acknowledgement,
        metadata: {
          householdId: String(openInstance.householdId),
          checkInId: String(openInstance._id),
          runId: String(run._id),
          routineId: String(routine._id),
          purpose: "change_request_acknowledgement",
          recipientClass: sourceAudience,
        },
      });
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "acknowledge_change_request",
        "Tell the recipient that the request needs household approval",
        "Sent a brief acknowledgement without applying the change",
        {
          component: "transport",
          tool: "whatsapp",
          provider: sent.provider,
          usageStatus: "not_applicable",
          outcome: sent.providerStatus,
          exceptionId,
        },
      );
      await ctx.db.patch(openInstance._id, {
        status: "NEEDS_ATTENTION",
        responseAt: args.timestamp,
        rawResponse: args.rawContent,
        inboundSignalReceived: true,
        latestInboundSignalId: signalId,
        responseSourceMemberId: endpoint.memberId,
        responseSourceAudience: sourceAudience,
        acknowledgementOutboundMessageId: sent.messageId,
        primaryUserSummary: `${personSalutation} asked to stop the ${routine.label ?? routine.prompt} reminder. Your approval is required before it changes.`,
      });
      await addWaitingStep(
        ctx,
        run._id,
        order,
        "wait_for_primary_user_decision",
        "Keep the routine active while the household account holder reviews the request",
      );
      await ctx.db.patch(run._id, {
        status: "waiting",
        outcome: "PENDING_APPROVAL",
        primaryUserInterventionRequired: true,
        outputSummary: "Medicine-reminder change is waiting for authorised approval",
        updatedAt: Date.now(),
      });
      return {
        signalId,
        matched: true,
        checkInId: openInstance._id,
        state: "PENDING_APPROVAL",
        exceptionId,
        runId: run.runId,
      };
    }

    const interpretation = interpretRoutineSignal({
      signalType: args.signalType,
      rawContent: args.rawContent,
      routineType: runtimeRoutineType(routine.type),
      parentLabel: personSalutation,
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
      rawResponse: args.rawContent,
      responseSourceMemberId: endpoint.memberId,
      responseSourceAudience: sourceAudience,
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
      const acknowledgement = composeMitraAcknowledgement({
        language,
        outcome: "completed",
        recipientSalutation,
      });
      const sent = await getMessageTransport(ctx).sendMessage({
        recipient: {
          memberId: String(endpoint.memberId),
          endpointId: String(endpoint._id),
          address: endpoint.address,
        },
        channel: endpoint.channel,
        message: acknowledgement,
        metadata: {
          householdId: String(openInstance.householdId),
          checkInId: String(openInstance._id),
          runId: String(run._id),
          routineId: String(routine._id),
          purpose: "recipient_acknowledgement",
          recipientClass: sourceAudience,
        },
      });
      await ctx.db.patch(openInstance._id, {
        acknowledgementOutboundMessageId: sent.messageId,
        primaryUserSummary: primaryUserMitraSummary({
          personSalutation,
          routineType: runtimeRoutineType(routine.type),
          routineLabel: routine.label ?? routine.prompt,
          sourceAudience,
          completed: true,
        }),
      });
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "send_acknowledgement",
        "Respond naturally after a supported self-report",
        "Sent a brief acknowledgement without claiming independent verification",
        {
          component: "transport",
          tool: "whatsapp",
          provider: sent.provider,
          usageStatus: "not_applicable",
          outcome: sent.providerStatus,
        },
      );
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
      await markTaskComplete(ctx, {
        run,
        agent: "mitra",
        outcome: "SELF_REPORTED_COMPLETE",
        recipientClass: sourceAudience,
        surface: transportSurface(endpoint),
      });
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
  metadata?: {
    component?: string;
    tool?: string;
    provider?: string;
    model?: string;
    usageStatus?: "tracked" | "unavailable" | "not_applicable";
    outcome?: string;
    exceptionId?: Id<"executionExceptions">;
    evidenceRecordId?: Id<"evidenceRecords">;
  },
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
    ...metadata,
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
  metadata?: {
    component?: string;
    tool?: string;
    provider?: string;
    usageStatus?: "tracked" | "unavailable" | "not_applicable";
  },
) {
  const now = Date.now();
  return ctx.db.insert("agentRunSteps", {
    runId,
    name,
    order,
    status: "waiting",
    startedAt: now,
    inputSummary,
    ...metadata,
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

function supportedLanguage(value?: string): AeviaLanguage {
  if (/hinglish/i.test(value ?? "")) return "Hinglish";
  if (/hindi/i.test(value ?? "")) return "Hindi";
  return "English";
}

function transportSurface(endpoint: Doc<"communicationEndpoints">) {
  const provider = endpoint.providerMetadata?.provider?.toLocaleLowerCase();
  return provider === "development" || provider === "dev"
    ? ("development_transport" as const)
    : ("whatsapp" as const);
}
