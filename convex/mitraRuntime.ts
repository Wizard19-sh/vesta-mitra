import { v } from "convex/values";
import {
  composeRoutineMessage,
  type MitraRoutineType,
} from "../lib/composeRoutineMessage";
import {
  nextOccurrenceAfter,
  type RoutineTiming,
} from "../lib/mitraSchedule";
import type { ConversationStyle, Language } from "../lib/composeCheckIn";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { getMessageTransport } from "./messageTransport";

export const triggerRoutine = internalMutation({
  args: {
    routineId: v.id("routines"),
    scheduledFor: v.number(),
  },
  handler: async (ctx, { routineId, scheduledFor }) => {
    const routine = await ctx.db.get(routineId);
    if (!routine || !routine.w2Enabled || !routine.timing) return null;
    if (
      !routine.householdId ||
      !routine.memberId ||
      !routine.communicationEndpointId
    ) {
      throw new Error("W2 routine is missing shared Vesta links");
    }

    const occurrenceKey = `${routineId}:${scheduledFor}`;
    const existing = await ctx.db
      .query("checkIns")
      .withIndex("by_occurrence_key", (q) =>
        q.eq("occurrenceKey", occurrenceKey),
      )
      .unique();
    if (existing) return existing._id;

    const now = Date.now();
    const runPublicId = crypto.randomUUID();
    const runId = await ctx.db.insert("agentRuns", {
      runId: runPublicId,
      agent: "mitra",
      householdId: routine.householdId,
      taskType: "scheduled_routine",
      status: "running",
      startedAt: now,
      inputSummary: "A scheduled Mitra routine occurrence became due",
      createdAt: now,
      updatedAt: now,
    });
    await addCompletedStep(
      ctx,
      runId,
      1,
      "scheduler_trigger",
      "Convex scheduled mutation invoked the occurrence",
      "Accepted a unique scheduled occurrence",
    );

    const [household, member, parent, endpoint, readiness, preferences] =
      await Promise.all([
        ctx.db.get(routine.householdId),
        ctx.db.get(routine.memberId),
        ctx.db.get(routine.parentId),
        ctx.db.get(routine.communicationEndpointId),
        ctx.db
          .query("mitraMemberStates")
          .withIndex("by_member", (q) => q.eq("memberId", routine.memberId!))
          .unique(),
        ctx.db
          .query("preferences")
          .withIndex("by_household", (q) =>
            q.eq("householdId", routine.householdId!),
          )
          .collect(),
      ]);
    if (!household || !member || !parent || !endpoint) {
      throw new Error("Scheduled routine context was not found");
    }
    if (readiness?.readiness !== "ready") {
      throw new Error("Parent is not ready for scheduled Mitra messages");
    }
    if (!endpoint.active || endpoint.consentStatus !== "granted") {
      throw new Error("Communication endpoint is not ready");
    }
    const activePreferences = preferences.filter(
      (preference) =>
        preference.active &&
        (!preference.memberId || preference.memberId === member._id),
    );
    await addCompletedStep(
      ctx,
      runId,
      2,
      "retrieve_context",
      "Load household, parent, endpoint, readiness, and shared preferences",
      `Loaded ${activePreferences.length} relevant active preferences`,
    );

    const checkInId = await ctx.db.insert("checkIns", {
      ownerKey: routine.ownerKey,
      parentId: routine.parentId,
      routineId: routine._id,
      status: "SCHEDULED",
      createdAt: now,
      householdId: routine.householdId,
      memberId: routine.memberId,
      communicationEndpointId: routine.communicationEndpointId,
      scheduledFor,
      occurrenceKey,
      inboundSignalReceived: false,
      runId,
    });
    await addCompletedStep(
      ctx,
      runId,
      3,
      "create_routine_instance",
      "Create one occurrence separate from the durable routine",
      "Created one idempotent routine instance",
    );

    const language = resolveLanguage(
      activePreferences,
      endpoint.preferredLanguage,
      member.languagePreference,
      parent.preferredLanguage,
    );
    const salutation = resolveSalutation(activePreferences, parent);
    const message = composeRoutineMessage({
      salutation,
      language,
      style: resolveStyle(parent.conversationStyle),
      routineType: runtimeRoutineType(routine.type),
      label: routine.label ?? routine.prompt,
      customMessage:
        routine.prompt !== routine.label ? routine.prompt : undefined,
      isFirstContact: false,
    });
    await addCompletedStep(
      ctx,
      runId,
      4,
      "compose_message",
      "Compose from routine type, salutation, language, and shared context",
      `Composed a brief ${language} ${runtimeRoutineType(routine.type)} reminder`,
    );

    const sent = await getMessageTransport(ctx).sendMessage({
      recipient: {
        memberId: String(member._id),
        endpointId: String(endpoint._id),
        address: endpoint.address,
      },
      channel: endpoint.channel,
      message,
      metadata: {
        householdId: String(household._id),
        checkInId: String(checkInId),
        runId: String(runId),
        routineId: String(routine._id),
      },
    });
    const expectedResponseBy = sent.timestamp + (routine.responseWindowMs ?? 4 * 60 * 60 * 1_000);
    await addCompletedStep(
      ctx,
      runId,
      5,
      "send_message",
      "Send through the provider-neutral transport contract",
      "Provider-neutral transport recorded one outbound message request",
    );
    await ctx.db.patch(checkInId, {
      status: "WAITING",
      sentAt: sent.timestamp,
      outboundMessageId: sent.messageId,
      expectedResponseBy,
    });
    await addWaitingStep(
      ctx,
      runId,
      6,
      "wait_for_reply",
      "Wait for a normalized inbound signal or response-window expiry",
    );
    await ctx.db.patch(runId, {
      status: "waiting",
      outputSummary:
        "Outbound reminder recorded by transport; waiting for a normalized signal",
      updatedAt: Date.now(),
    });

    const timeoutJobId = await ctx.scheduler.runAt(
      expectedResponseBy,
      internal.mitraRuntime.handleResponseTimeout,
      { checkInId },
    );
    await ctx.db.patch(checkInId, {
      responseTimeoutJobId: String(timeoutJobId),
    });

    const timing = routine.timing as RoutineTiming;
    const nextOccurrenceAt = nextOccurrenceAfter(timing, scheduledFor);
    if (nextOccurrenceAt === undefined) {
      await ctx.db.patch(routine._id, {
        w2Enabled: false,
        lastOccurrenceAt: scheduledFor,
        nextOccurrenceAt: undefined,
        scheduledJobId: undefined,
        updatedAt: Date.now(),
      });
    } else {
      const nextJobId = await ctx.scheduler.runAt(
        nextOccurrenceAt,
        internal.mitraRuntime.triggerRoutine,
        { routineId: routine._id, scheduledFor: nextOccurrenceAt },
      );
      await ctx.db.patch(routine._id, {
        lastOccurrenceAt: scheduledFor,
        nextOccurrenceAt,
        scheduledJobId: String(nextJobId),
        updatedAt: Date.now(),
      });
    }

    return checkInId;
  },
});

export const handleResponseTimeout = internalMutation({
  args: { checkInId: v.id("checkIns") },
  handler: async (ctx, { checkInId }) => {
    const instance = await ctx.db.get(checkInId);
    if (
      !instance ||
      !instance.runId ||
      (instance.status !== "WAITING" && instance.status !== "SENT")
    ) {
      return null;
    }
    const run = await ctx.db.get(instance.runId);
    if (!run) return null;
    const now = Date.now();
    await completeLatestWaitingStep(
      ctx,
      run._id,
      "Response window expired without an inbound signal",
    );
    let order = await nextStepOrder(ctx, run._id);
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "update_routine_state",
      "Apply the configured response window without inferring concern",
      "Marked the instance NO_RESPONSE with no emergency implication",
    );
    await ctx.db.patch(instance._id, {
      status: "NO_RESPONSE",
      selfReportInterpretation: {
        outcome: "no_response",
        summary: "No response arrived within the configured response window.",
        basis: "response_window",
      },
    });
    await addCompletedStep(
      ctx,
      run._id,
      order,
      "complete",
      "Finish the scheduler occurrence after its response window",
      "Completed with NO_RESPONSE and no escalation",
    );
    await completeRun(ctx, run, "Routine instance ended with NO_RESPONSE", now);
    return instance._id;
  },
});

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
  completedAt = Date.now(),
) {
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

function resolveLanguage(
  preferences: Doc<"preferences">[],
  ...fallbacks: Array<string | undefined>
): Language {
  const memory = [...preferences]
    .reverse()
    .find(
      (preference) =>
        preference.category === "communication" &&
        preference.key === "language",
    )?.value;
  for (const value of [memory, ...fallbacks]) {
    if (/hinglish/i.test(value ?? "")) return "Hinglish";
    if (/hindi/i.test(value ?? "")) return "Hindi";
    if (/english/i.test(value ?? "")) return "English";
  }
  return "English";
}

function resolveSalutation(
  preferences: Doc<"preferences">[],
  parent: Doc<"parents">,
) {
  const memory = [...preferences]
    .reverse()
    .find(
      (preference) =>
        preference.category === "communication" &&
        preference.key === "salutation",
    )?.value;
  return memory?.trim() || parent.salutation || parent.name;
}

function resolveStyle(
  style: Doc<"parents">["conversationStyle"],
): ConversationStyle {
  return style ?? "Warm & caring";
}
