import { v } from "convex/values";
import {
  firstOccurrenceAt,
  legacyScheduleFromTiming,
  type RoutineTiming,
} from "../lib/mitraSchedule";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const routineType = v.union(
  v.literal("Medication"),
  v.literal("Walk / activity"),
  v.literal("Appointment / checkup"),
  v.literal("Custom"),
);

const timing = v.union(
  v.object({
    kind: v.literal("once_now"),
    timezone: v.string(),
  }),
  v.object({
    kind: v.literal("once_scheduled"),
    timezone: v.string(),
    scheduledAt: v.number(),
  }),
  v.object({
    kind: v.literal("recurring"),
    timezone: v.string(),
    recurrence: v.object({
      frequency: v.union(
        v.literal("daily"),
        v.literal("selected_days"),
        v.literal("weekly"),
        v.literal("monthly"),
      ),
      time: v.string(),
      daysOfWeek: v.optional(v.array(v.number())),
      dayOfMonth: v.optional(v.number()),
    }),
  }),
);

export const setMemberReadiness = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    memberId: v.id("members"),
    readiness: v.union(
      v.literal("not_introduced"),
      v.literal("ready"),
    ),
  },
  handler: async (ctx, args) => {
    await requireHousehold(ctx, args.householdId, args.ownerKey);
    await requireMember(ctx, args.memberId, args.householdId);
    const existing = await ctx.db
      .query("mitraMemberStates")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        readiness: args.readiness,
        introducedAt:
          args.readiness === "ready"
            ? (existing.introducedAt ?? now)
            : existing.introducedAt,
        updatedAt: now,
      });
      return existing._id;
    }
    return ctx.db.insert("mitraMemberStates", {
      householdId: args.householdId,
      memberId: args.memberId,
      readiness: args.readiness,
      introducedAt: args.readiness === "ready" ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createScheduledRoutine = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    memberId: v.id("members"),
    recipientMemberId: v.optional(v.id("members")),
    recipientAudience: v.optional(
      v.union(v.literal("senior"), v.literal("caretaker")),
    ),
    parentId: v.id("parents"),
    communicationEndpointId: v.id("communicationEndpoints"),
    type: routineType,
    label: v.string(),
    timing,
    responseWindowMs: v.optional(v.number()),
    customMessage: v.optional(v.string()),
    confirmingReactions: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    routineId: Id<"routines">;
    nextOccurrenceAt: number;
    scheduledJobId: Id<"_scheduled_functions">;
  }> => {
    const household = await requireHousehold(
      ctx,
      args.householdId,
      args.ownerKey,
    );
    await requireMember(ctx, args.memberId, args.householdId);
    const parent = await ctx.db.get(args.parentId);
    if (!parent || parent.ownerKey !== args.ownerKey) {
      throw new Error("Parent not found");
    }
    if (
      (parent.householdId && parent.householdId !== args.householdId) ||
      (parent.memberId && parent.memberId !== args.memberId)
    ) {
      throw new Error("Parent is linked to different Vesta context");
    }
    if (!parent.householdId || !parent.memberId) {
      await ctx.db.patch(parent._id, {
        householdId: args.householdId,
        memberId: args.memberId,
      });
    }

    const readiness = await ctx.db
      .query("mitraMemberStates")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .unique();
    if (!readiness || readiness.readiness !== "ready") {
      throw new Error("Parent is not ready for Mitra routines");
    }

    const recipientMemberId = args.recipientMemberId ?? args.memberId;
    await requireMember(ctx, recipientMemberId, args.householdId);
    const endpoint = await ctx.db.get(args.communicationEndpointId);
    if (
      !endpoint ||
      endpoint.householdId !== args.householdId ||
      endpoint.memberId !== recipientMemberId ||
      !endpoint.active ||
      endpoint.consentStatus !== "granted"
    ) {
      throw new Error("An active consented endpoint is required");
    }
    if (args.timing.timezone !== household.timezone) {
      throw new Error("Routine timezone must match the household timezone");
    }

    const responseWindowMs = args.responseWindowMs ?? 4 * 60 * 60 * 1_000;
    if (
      !Number.isFinite(responseWindowMs) ||
      responseWindowMs < 1_000 ||
      responseWindowMs > 7 * 24 * 60 * 60 * 1_000
    ) {
      throw new Error("Response window must be between 1 second and 7 days");
    }
    const normalizedTiming = args.timing as RoutineTiming;
    const nextOccurrenceAt = firstOccurrenceAt(normalizedTiming);
    const now = Date.now();
    const label = requiredText(args.label, "Routine label", 160);
    const customMessage = optionalText(args.customMessage, "Custom message", 500);
    const reactions = args.confirmingReactions?.map((reaction) =>
      requiredText(reaction, "Confirming reaction", 20),
    );
    if (reactions && new Set(reactions).size !== reactions.length) {
      throw new Error("Confirming reactions must not contain duplicates");
    }

    const routineId = await ctx.db.insert("routines", {
      ownerKey: args.ownerKey,
      parentId: args.parentId,
      householdId: args.householdId,
      memberId: args.memberId,
      communicationEndpointId: args.communicationEndpointId,
      recipientMemberId,
      recipientAudience: args.recipientAudience ?? "senior",
      type: args.type,
      topics: [args.type],
      customTopic: args.type === "Custom" ? label : undefined,
      frequency: legacyFrequency(normalizedTiming),
      schedule: legacyScheduleFromTiming(normalizedTiming, nextOccurrenceAt),
      prompt: customMessage ?? label,
      w2Enabled: true,
      label,
      timing: normalizedTiming,
      responseWindowMs,
      confirmingReactions: reactions,
      notes: optionalText(args.notes, "Routine notes", 1_000),
      nextOccurrenceAt,
      createdAt: now,
      updatedAt: now,
    });
    const scheduledJobId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(
      nextOccurrenceAt,
      internal.mitraRuntime.triggerRoutine,
      { routineId, scheduledFor: nextOccurrenceAt },
    );
    await ctx.db.patch(routineId, { scheduledJobId: String(scheduledJobId) });

    return { routineId, nextOccurrenceAt, scheduledJobId };
  },
});

export const updateScheduledRoutine = mutation({
  args: {
    ownerKey: v.string(),
    routineId: v.id("routines"),
    type: routineType,
    label: v.string(),
    timing,
    customMessage: v.optional(v.string()),
    communicationEndpointId: v.optional(v.id("communicationEndpoints")),
    recipientMemberId: v.optional(v.id("members")),
    recipientAudience: v.optional(
      v.union(v.literal("senior"), v.literal("caretaker")),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const routine = await ctx.db.get(args.routineId);
    if (!routine || routine.ownerKey !== args.ownerKey || !routine.householdId) {
      throw new Error("Routine not found");
    }
    const household = await requireHousehold(
      ctx,
      routine.householdId,
      args.ownerKey,
    );
    if (args.timing.timezone !== household.timezone) {
      throw new Error("Routine timezone must match the household timezone");
    }
    const normalizedTiming = args.timing as RoutineTiming;
    const timingChanged =
      JSON.stringify(routine.timing) !== JSON.stringify(normalizedTiming);
    const label = requiredText(args.label, "Routine label", 160);
    const customMessage = optionalText(args.customMessage, "Custom message", 500);
    const endpointId = args.communicationEndpointId ?? routine.communicationEndpointId;
    const recipientMemberId = args.recipientMemberId ?? routine.recipientMemberId ?? routine.memberId;
    if (!endpointId || !recipientMemberId) {
      throw new Error("Routine recipient was not found");
    }
    const endpoint = await ctx.db.get(endpointId);
    if (!endpoint || endpoint.memberId !== recipientMemberId || endpoint.householdId !== household._id) {
      throw new Error("Routine recipient endpoint was not found");
    }
    const now = Date.now();

    if (!timingChanged) {
      await ctx.db.patch(routine._id, {
        type: args.type,
        topics: [args.type],
        customTopic: args.type === "Custom" ? label : undefined,
        prompt: customMessage ?? label,
        label,
        communicationEndpointId: endpointId,
        recipientMemberId,
        recipientAudience: args.recipientAudience ?? routine.recipientAudience ?? "senior",
        notes: optionalText(args.notes, "Routine notes", 1_000),
        updatedAt: now,
      });
      return {
        routineId: routine._id,
        nextOccurrenceAt: routine.nextOccurrenceAt,
        scheduledJobId: routine.scheduledJobId,
        rescheduled: false,
      };
    }

    const nextOccurrenceAt = firstOccurrenceAt(normalizedTiming);
    if (routine.scheduledJobId) {
      await ctx.scheduler.cancel(
        routine.scheduledJobId as Id<"_scheduled_functions">,
      );
    }
    const scheduledJobId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(
      nextOccurrenceAt,
      internal.mitraRuntime.triggerRoutine,
      { routineId: routine._id, scheduledFor: nextOccurrenceAt },
    );
    await ctx.db.patch(routine._id, {
      type: args.type,
      topics: [args.type],
      customTopic: args.type === "Custom" ? label : undefined,
      frequency: legacyFrequency(normalizedTiming),
      schedule: legacyScheduleFromTiming(normalizedTiming, nextOccurrenceAt),
      prompt: customMessage ?? label,
      label,
      communicationEndpointId: endpointId,
      recipientMemberId,
      recipientAudience: args.recipientAudience ?? routine.recipientAudience ?? "senior",
      notes: optionalText(args.notes, "Routine notes", 1_000),
      timing: normalizedTiming,
      nextOccurrenceAt,
      scheduledJobId: String(scheduledJobId),
      updatedAt: now,
    });
    return {
      routineId: routine._id,
      nextOccurrenceAt,
      scheduledJobId,
      rescheduled: true,
    };
  },
});

export const getRoutine = query({
  args: { ownerKey: v.string(), routineId: v.id("routines") },
  handler: async (ctx, { ownerKey, routineId }) => {
    const routine = await ctx.db.get(routineId);
    if (!routine || routine.ownerKey !== ownerKey) {
      throw new Error("Routine not found");
    }
    return routine;
  },
});

export const getRoutineInstance = query({
  args: { ownerKey: v.string(), checkInId: v.id("checkIns") },
  handler: async (ctx, { ownerKey, checkInId }) => {
    const instance = await ctx.db.get(checkInId);
    if (!instance || instance.ownerKey !== ownerKey) {
      throw new Error("Routine instance not found");
    }
    const [outboundMessages, transportMessages, inboundSignals, run] = await Promise.all([
      ctx.db
        .query("devTransportMessages")
        .withIndex("by_check_in", (q) => q.eq("checkInId", checkInId))
        .collect(),
      ctx.db
        .query("transportMessages")
        .withIndex("by_check_in", (q) => q.eq("checkInId", checkInId))
        .collect(),
      ctx.db
        .query("inboundSignals")
        .withIndex("by_check_in", (q) => q.eq("checkInId", checkInId))
        .collect(),
      instance.runId ? ctx.db.get(instance.runId) : null,
    ]);
    const steps = run
      ? await ctx.db
          .query("agentRunSteps")
          .withIndex("by_run_and_order", (q) => q.eq("runId", run._id))
          .order("asc")
          .collect()
      : [];
    return {
      instance,
      outboundMessages,
      transportMessages,
      inboundSignals,
      run,
      steps,
    };
  },
});

export const listRoutineInstances = query({
  args: { ownerKey: v.string(), routineId: v.id("routines") },
  handler: async (ctx, { ownerKey, routineId }) => {
    const routine = await ctx.db.get(routineId);
    if (!routine || routine.ownerKey !== ownerKey) {
      throw new Error("Routine not found");
    }
    return ctx.db
      .query("checkIns")
      .withIndex("by_routine", (q) => q.eq("routineId", routineId))
      .order("desc")
      .collect();
  },
});

function legacyFrequency(timing: RoutineTiming) {
  if (timing.kind !== "recurring") return "Once" as const;
  if (timing.recurrence.frequency === "daily") return "Daily" as const;
  if (timing.recurrence.frequency === "monthly") return "Monthly" as const;
  return "Weekly" as const;
}

async function requireHousehold(
  ctx: MutationCtx | QueryCtx,
  householdId: Id<"households">,
  ownerKey: string,
) {
  const household = await ctx.db.get(householdId);
  if (!household || household.ownerKey !== ownerKey) {
    throw new Error("Household not found");
  }
  return household;
}

async function requireMember(
  ctx: MutationCtx | QueryCtx,
  memberId: Id<"members">,
  householdId: Id<"households">,
) {
  const member = await ctx.db.get(memberId);
  if (!member || member.householdId !== householdId) {
    throw new Error("Member not found in household");
  }
  return member;
}

function requiredText(value: string, label: string, maxLength: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return clean;
}

function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  const clean = value.trim();
  if (!clean) return undefined;
  if (clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return clean;
}
