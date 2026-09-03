import { v } from "convex/values";
import { type MitraRoutineType } from "../lib/composeRoutineMessage";
import {
  nextOccurrenceAfter,
  type RoutineTiming,
} from "../lib/mitraSchedule";
import type { Language } from "../lib/composeCheckIn";
import {
  composeCaretakerNoResponseFollowUp,
  resolveMitraRecipient,
  shouldFollowUpWithCaretaker,
} from "../lib/m2Execution";
import { composeMitraMessage, type AeviaLanguage } from "../lib/aeviaSetup";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { getMessageTransport } from "./messageTransport";
import { ensureEvidenceRecord, recordExecutionEvent } from "./executionSupport";

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

    const [household, member, parent, readiness, preferences, endpoints] =
      await Promise.all([
        ctx.db.get(routine.householdId),
        ctx.db.get(routine.memberId),
        ctx.db.get(routine.parentId),
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
        ctx.db
          .query("communicationEndpoints")
          .withIndex("by_household", (q) =>
            q.eq("householdId", routine.householdId!),
          )
          .collect(),
      ]);
    if (!household || !member || !parent) {
      throw new Error("Scheduled routine context was not found");
    }
    if (readiness?.readiness !== "ready") {
      throw new Error("Parent is not ready for scheduled Mitra messages");
    }
    const directEndpoint = readyEndpoint(endpoints, routine.memberId);
    const caretakerEndpoint = parent.caretakerMemberId
      ? readyEndpoint(endpoints, parent.caretakerMemberId)
      : undefined;
    const recipientPolicy = resolveMitraRecipient({
      communicationPath: parent.coordinationMode ?? "senior_directly",
      configuredAudience: routine.recipientAudience,
      directAvailable: Boolean(directEndpoint),
      caretakerAvailable: Boolean(caretakerEndpoint),
    });
    await addCompletedStep(
      ctx,
      runId,
      2,
      "resolve_recipient",
      "Apply the household's direct, caretaker, or both communication choice",
      recipientPolicy.status === "ready"
        ? `Resolved recipient: ${recipientPolicy.recipientClass} (${recipientPolicy.reason})`
        : recipientPolicy.reason,
      { component: "mitra", usageStatus: "not_applicable" },
    );
    if (recipientPolicy.status === "unresolved") {
      const checkInId = await ctx.db.insert("checkIns", {
        ownerKey: routine.ownerKey,
        parentId: routine.parentId,
        routineId: routine._id,
        status: "UNRESOLVED",
        createdAt: now,
        householdId: routine.householdId,
        memberId: routine.memberId,
        scheduledFor,
        occurrenceKey,
        inboundSignalReceived: false,
        runId,
        failureReason: recipientPolicy.reason,
        recipientSelectionReason: recipientPolicy.reason,
      });
      await addCompletedStep(
        ctx,
        runId,
        3,
        "halt_no_recipient",
        "Stop before composition when no valid Mitra recipient exists",
        "Run stopped without sending because no recipient could be resolved.",
      );
      const run = await ctx.db.get(runId);
      if (!run) throw new Error("Run not found");
      await completeRun(
        ctx,
        run,
        `Mitra routine stopped: ${recipientPolicy.reason}`,
      );
      await ensureEvidenceRecord(ctx, {
        run,
        surface: "whatsapp",
        recipientClass: "senior",
        outcome: "UNRESOLVED",
        primaryRubricClaim: "Real output on a real surface",
      });
      return checkInId;
    }
    const recipientMemberId =
      recipientPolicy.recipientClass === "caretaker"
        ? parent.caretakerMemberId
        : routine.memberId;
    const endpoint =
      recipientPolicy.recipientClass === "caretaker"
        ? caretakerEndpoint
        : directEndpoint;
    const recipientMember = recipientMemberId
      ? await ctx.db.get(recipientMemberId)
      : null;
    if (!recipientMember || !endpoint) {
      throw new Error("The selected routine recipient is not ready");
    }
    const activePreferences = preferences.filter(
      (preference) =>
        preference.active &&
        (preference.expiresAt === undefined || preference.expiresAt > now) &&
        (!preference.memberId || preference.memberId === member._id),
    );
    await addCompletedStep(
      ctx,
      runId,
      2,
      "retrieve_context",
      "Load household, parent, endpoint, readiness, and shared preferences",
      `Loaded ${activePreferences.length} relevant active preferences`,
      { component: "mitra", usageStatus: "not_applicable" },
    );
    await addCompletedStep(
      ctx,
      runId,
      4,
      "create_routine_instance",
      "Create one occurrence separate from the durable routine",
      "Created one idempotent routine instance",
    );

    const checkInId = await ctx.db.insert("checkIns", {
      ownerKey: routine.ownerKey,
      parentId: routine.parentId,
      routineId: routine._id,
      status: "SCHEDULED",
      createdAt: now,
      householdId: routine.householdId,
      memberId: routine.memberId,
      communicationEndpointId: endpoint._id,
      intendedRecipientMemberId: recipientMember._id,
      intendedRecipientClass: recipientPolicy.recipientClass,
      recipientSelectionReason: recipientPolicy.reason,
      scheduledFor,
      occurrenceKey,
      inboundSignalReceived: false,
      runId,
    });

    const language = resolveLanguage(
      activePreferences,
      endpoint.preferredLanguage,
      recipientMember.languagePreference,
      parent.preferredLanguage,
    );
    const seniorSalutation = resolveSalutation(activePreferences, parent);
    const recipientSalutation =
      recipientMember.preferredSalutation ?? recipientMember.name;
    const message = composeMitraMessage({
      context: {
        agent: "mitra",
        audience: recipientPolicy.recipientClass,
        surface: "whatsapp",
        moment: "reminder",
      },
      recipientSalutation,
      seniorSalutation,
      label: routine.label ?? routine.prompt,
      type: runtimeRoutineType(routine.type),
      language: language as AeviaLanguage,
    });
    await addCompletedStep(
      ctx,
      runId,
      5,
      "compose_message",
      "Compose from routine type, salutation, language, and shared context",
      `Composed a brief ${language} ${runtimeRoutineType(routine.type)} reminder`,
      {
        component: "mitra",
        tool: "bounded_template",
        usageStatus: "not_applicable",
      },
    );

    const sent = await getMessageTransport(ctx).sendMessage({
      recipient: {
        memberId: String(recipientMember._id),
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
        purpose: "routine_reminder",
        recipientClass: recipientPolicy.recipientClass,
      },
    });
    await recordExecutionEvent(ctx, {
      eventKey: `${checkInId}:reminder_requested`,
      householdId: household._id,
      runId,
      taskType: "scheduled_routine",
      eventName: "message_scheduled",
      agent: "mitra",
      outcome: sent.providerStatus,
    });
    const expectedResponseBy = sent.timestamp + (routine.responseWindowMs ?? 4 * 60 * 60 * 1_000);
    await addCompletedStep(
      ctx,
      runId,
      6,
      "send_message",
      "Send through the provider-neutral transport contract",
      "Provider-neutral transport recorded one outbound message request",
      {
        component: "transport",
        tool: "whatsapp",
        provider: sent.provider,
        usageStatus: "not_applicable",
        outcome: sent.providerStatus,
      },
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
      7,
      "wait_for_reply",
      "Wait for a normalized inbound signal or response-window expiry",
      { component: "mitra", usageStatus: "not_applicable" },
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
    const [parent, routine] = await Promise.all([
      ctx.db.get(instance.parentId),
      ctx.db.get(instance.routineId),
    ]);
    if (!parent || !routine || !instance.householdId || !instance.memberId) {
      return null;
    }
    const now = Date.now();
    await completeLatestWaitingStep(
      ctx,
      run._id,
      "Response window expired without an inbound signal",
    );
    let order = await nextStepOrder(ctx, run._id);
    if (
      !instance.followUpCommunicationEndpointId &&
      parent.caretakerMemberId &&
      shouldFollowUpWithCaretaker({
        communicationPath: parent.coordinationMode ?? "senior_directly",
        initialRecipientClass: instance.intendedRecipientClass ?? "senior",
        caretakerAvailable: true,
      })
    ) {
      const endpoints = await ctx.db
        .query("communicationEndpoints")
        .withIndex("by_household", (q) => q.eq("householdId", instance.householdId!))
        .collect();
      const caretakerEndpoint = readyEndpoint(endpoints, parent.caretakerMemberId);
      const [caretaker, senior] = await Promise.all([
        ctx.db.get(parent.caretakerMemberId),
        ctx.db.get(instance.memberId),
      ]);
      if (caretakerEndpoint && caretaker && senior) {
        const language = endpointLanguage(caretakerEndpoint.preferredLanguage);
        const message = composeCaretakerNoResponseFollowUp({
          language,
          caretakerSalutation: caretaker.preferredSalutation ?? caretaker.name,
          seniorSalutation: senior.preferredSalutation ?? parent.salutation ?? parent.name,
          routineLabel: routine.label ?? routine.prompt,
        });
        const sent = await getMessageTransport(ctx).sendMessage({
          recipient: {
            memberId: String(caretaker._id),
            endpointId: String(caretakerEndpoint._id),
            address: caretakerEndpoint.address,
          },
          channel: caretakerEndpoint.channel,
          message,
          metadata: {
            householdId: String(instance.householdId),
            checkInId: String(instance._id),
            runId: String(run._id),
            routineId: String(routine._id),
            purpose: "caretaker_no_response_follow_up",
            recipientClass: "caretaker",
          },
        });
        const nextExpectedResponseBy = sent.timestamp + 2 * 60 * 60 * 1_000;
        await ctx.db.patch(instance._id, {
          status: "WAITING",
          followUpCommunicationEndpointId: caretakerEndpoint._id,
          followUpOutboundMessageId: sent.messageId,
          expectedResponseBy: nextExpectedResponseBy,
        });
        await addCompletedStep(
          ctx,
          run._id,
          order++,
          "caretaker_follow_up",
          "Use the configured both-mode follow-up after the senior did not reply",
          `Asked ${caretaker.name} to check; the original routine was not marked complete`,
          {
            component: "mitra",
            tool: "whatsapp",
            provider: sent.provider,
            usageStatus: "not_applicable",
            outcome: sent.providerStatus,
          },
        );
        await addWaitingStep(
          ctx,
          run._id,
          order,
          "wait_for_caretaker_reply",
          "Wait for the configured caretaker or family follow-up",
          { component: "mitra", usageStatus: "not_applicable" },
        );
        const timeoutJobId = await ctx.scheduler.runAt(
          nextExpectedResponseBy,
          internal.mitraRuntime.handleResponseTimeout,
          { checkInId },
        );
        await ctx.db.patch(instance._id, {
          responseTimeoutJobId: String(timeoutJobId),
        });
        return instance._id;
      }
    }
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "update_routine_state",
      "Apply the configured response window without inferring concern",
      "Marked the instance NO_RESPONSE with no emergency implication",
      { component: "mitra", usageStatus: "not_applicable", outcome: "NO_RESPONSE" },
    );
    await ctx.db.patch(instance._id, {
      status: "NO_RESPONSE",
      selfReportInterpretation: {
        outcome: "no_response",
        summary: "No response arrived within the configured response window.",
        basis: "response_window",
      },
      primaryUserSummary: `${parent.salutation ?? parent.name} did not reply about ${routine.label ?? routine.prompt}.`,
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
    await ctx.db.patch(run._id, {
      outcome: "NO_RESPONSE",
      successfullyCompletedTask: false,
      updatedAt: Date.now(),
    });
    const endpoint = instance.communicationEndpointId
      ? await ctx.db.get(instance.communicationEndpointId)
      : null;
    await ensureEvidenceRecord(ctx, {
      run,
      surface:
        endpoint?.providerMetadata?.provider === "development"
          ? "development_transport"
          : "whatsapp",
      recipientClass: instance.intendedRecipientClass ?? "senior",
      outcome: "NO_RESPONSE",
      primaryRubricClaim: "Real output on a real surface",
    });
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

function readyEndpoint(
  endpoints: Doc<"communicationEndpoints">[],
  memberId: Id<"members">,
) {
  return endpoints.find(
    (endpoint) =>
      endpoint.memberId === memberId &&
      endpoint.channel.toLocaleLowerCase() === "whatsapp" &&
      endpoint.active &&
      endpoint.consentStatus === "granted",
  );
}

function endpointLanguage(value?: string): AeviaLanguage {
  if (/hinglish/i.test(value ?? "")) return "Hinglish";
  if (/hindi/i.test(value ?? "")) return "Hindi";
  return "English";
}
