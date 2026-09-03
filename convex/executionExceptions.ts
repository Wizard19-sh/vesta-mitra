import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  addCompletedStep,
  completeLatestWaitingStep,
  nextStepOrder,
} from "./tarlaSupport";
import { markTaskComplete, recordExecutionEvent } from "./executionSupport";

export const listForHousehold = query({
  args: { ownerKey: v.string(), householdId: v.id("households") },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (!household || household.ownerKey !== args.ownerKey) {
      throw new Error("Household not found");
    }
    const exceptions = await ctx.db
      .query("executionExceptions")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .order("desc")
      .take(100);
    return Promise.all(
      exceptions.map(async (exception) => ({
        ...exception,
        sourceMember: exception.sourceMemberId
          ? await ctx.db.get(exception.sourceMemberId)
          : null,
        checkIn: exception.checkInId
          ? await ctx.db.get(exception.checkInId)
          : null,
      })),
    );
  },
});

export const decide = mutation({
  args: {
    ownerKey: v.string(),
    exceptionId: v.id("executionExceptions"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
  },
  handler: async (ctx, args) => {
    const exception = await ctx.db.get(args.exceptionId);
    if (!exception) throw new Error("Request not found");
    const [household, profile, run] = await Promise.all([
      ctx.db.get(exception.householdId),
      ctx.db
        .query("betaUserProfiles")
        .withIndex("by_household", (q) => q.eq("householdId", exception.householdId))
        .unique(),
      ctx.db.get(exception.runId),
    ]);
    if (!household || household.ownerKey !== args.ownerKey || !profile) {
      throw new Error("Request not found");
    }
    if (
      exception.requiredApproverMemberId &&
      exception.requiredApproverMemberId !== profile.memberId
    ) {
      throw new Error("This account cannot decide the request");
    }
    if (exception.status !== "pending_approval") {
      throw new Error("This request has already been decided");
    }
    if (!run) throw new Error("Linked task was not found");

    let resultingAction = "No configuration was changed.";
    if (
      args.decision === "approve" &&
      exception.policyCode === "MEDICINE_REMINDER_CHANGE_REQUIRES_APPROVAL" &&
      exception.checkInId
    ) {
      const checkIn = await ctx.db.get(exception.checkInId);
      if (!checkIn) throw new Error("Linked routine request was not found");
      const routine = await ctx.db.get(checkIn.routineId);
      if (!routine) throw new Error("Linked routine was not found");
      if (routine.scheduledJobId) {
        try {
          await ctx.scheduler.cancel(
            routine.scheduledJobId as Id<"_scheduled_functions">,
          );
        } catch {
          // A job that already started cannot be cancelled; disabling the routine
          // still prevents a later occurrence from executing.
        }
      }
      await ctx.db.patch(routine._id, {
        w2Enabled: false,
        nextOccurrenceAt: undefined,
        scheduledJobId: undefined,
        updatedAt: Date.now(),
      });
      resultingAction = "The reminder was stopped after household approval.";
    }

    const now = Date.now();
    await ctx.db.patch(exception._id, {
      status: args.decision === "approve" ? "approved" : "rejected",
      decision: args.decision,
      decisionByMemberId: profile.memberId,
      decisionAt: now,
      resultingAction,
      resolvedAt: now,
      updatedAt: now,
    });
    if (exception.checkInId) {
      await ctx.db.patch(exception.checkInId, {
        status: "UNCONFIRMED",
        primaryUserSummary:
          args.decision === "approve"
            ? "You approved stopping this reminder."
            : "You kept this reminder active.",
      });
    }
    await completeLatestWaitingStep(
      ctx,
      run._id,
      `Household account holder chose to ${args.decision} the requested change`,
    );
    const order = await nextStepOrder(ctx, run._id);
    await addCompletedStep(
      ctx,
      run._id,
      order,
      "apply_authorised_decision",
      "Apply only the authorised household decision",
      resultingAction,
      {
        component: "mitra",
        usageStatus: "not_applicable",
        outcome: args.decision === "approve" ? "CHANGE_APPROVED" : "CHANGE_REJECTED",
        exceptionId: exception._id,
      },
    );
    await recordExecutionEvent(ctx, {
      eventKey: `${exception._id}:resolved`,
      householdId: exception.householdId,
      runId: run._id,
      taskType: run.taskType,
      eventName: "exception_resolved",
      agent: exception.agent,
      outcome: args.decision,
    });
    await ctx.db.patch(run._id, {
      outputSummary: resultingAction,
      primaryUserInterventionRequired: true,
      updatedAt: now,
    });
    await markTaskComplete(ctx, {
      run,
      agent: exception.agent,
      outcome: args.decision === "approve" ? "CHANGE_APPROVED" : "CHANGE_REJECTED",
      recipientClass: "primary_user",
      surface: "whatsapp",
    });
    return { exceptionId: exception._id, decision: args.decision, resultingAction };
  },
});
