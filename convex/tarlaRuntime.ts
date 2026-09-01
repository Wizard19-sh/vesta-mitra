import { v } from "convex/values";
import { composeDayCookInstruction } from "../lib/tarlaMessages";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { getMessageTransport } from "./messageTransport";
import { latestApprovedDayPlan, loadDayMeals } from "./tarlaDaySupport";
import {
  addCompletedStep,
  addWaitingStep,
  completeLatestWaitingStep,
  completeRun,
  loadPlanningContext,
  nextStepOrder,
} from "./tarlaSupport";

export const triggerCookVisit = internalMutation({
  args: {
    executionId: v.id("tarlaExecutions"),
    scheduledFor: v.number(),
  },
  handler: async (ctx, { executionId, scheduledFor }) => {
    const execution = await ctx.db.get(executionId);
    if (
      !execution ||
      execution.status !== "scheduled" ||
      execution.scheduledFor !== scheduledFor ||
      !execution.dayPlanSeriesId ||
      !execution.cookVisitId
    ) {
      return null;
    }
    const [run, visit, endpoint, cook] = await Promise.all([
      ctx.db.get(execution.runId),
      ctx.db.get(execution.cookVisitId),
      ctx.db.get(execution.communicationEndpointId),
      ctx.db.get(execution.cookMemberId),
    ]);
    if (!run || !visit || !endpoint || !cook) {
      throw new Error("Scheduled cook visit context was not found");
    }
    if (!endpoint.active || endpoint.consentStatus !== "granted") {
      throw new Error("Cook endpoint is not ready for scheduled instruction");
    }
    const now = Date.now();
    await ctx.db.patch(run._id, {
      status: "running",
      startedAt: run.startedAt ?? now,
      updatedAt: now,
    });
    await addCompletedStep(
      ctx,
      run._id,
      1,
      "cook_instruction_trigger",
      "Convex scheduled mutation invoked the configured cook visit",
      `Accepted unique occurrence ${execution.occurrenceKey}`,
    );
    const latestDayPlan = await latestApprovedDayPlan(
      ctx,
      execution.dayPlanSeriesId,
    );
    if (!latestDayPlan) {
      throw new Error("No approved full-day plan was available at send time");
    }
    const dayMeals = await loadDayMeals(ctx, latestDayPlan._id);
    const visitMeals = dayMeals
      .filter((meal) => visit.mealSlots.includes(meal.join.mealSlot))
      .map((meal) => meal.calculated);
    if (visitMeals.length === 0) {
      throw new Error("Latest day plan has no meals assigned to this visit");
    }
    await addCompletedStep(
      ctx,
      run._id,
      2,
      "retrieve_latest_approved_plan",
      "Resolve the newest approved version at the scheduled trigger",
      `Loaded day-plan version ${latestDayPlan.version} with ${visitMeals.length} visit meals`,
    );
    const eaterMemberIds = latestDayPlan.memberDailyNutrition.map(
      (member) => member.memberId,
    );
    const planning = await loadPlanningContext(
      ctx,
      latestDayPlan.householdId,
      eaterMemberIds,
    );
    const instruction = composeDayCookInstruction({
      visitLabel: visit.label,
      targetDate: latestDayPlan.targetDate,
      meals: visitMeals,
      memberNotes: planning.members
        .filter((member) => member.cookNotes)
        .map((member) => ({ memberName: member.name, note: member.cookNotes! })),
      importantRestrictions: planning.members.flatMap((member) =>
        member.allergies.map(
          (allergy) => `${member.name}: no ${allergy.replaceAll("_", " ")}`,
        ),
      ),
    });
    await addCompletedStep(
      ctx,
      run._id,
      3,
      "generate_cook_instruction",
      "Compose from the latest approved plan and this visit's meal responsibilities",
      `Generated one instruction covering ${visitMeals.map((meal) => meal.mealSlot).join(", ")}`,
    );
    const sent = await getMessageTransport(ctx).sendMessage({
      recipient: {
        memberId: String(cook._id),
        endpointId: String(endpoint._id),
        address: endpoint.address,
      },
      channel: endpoint.channel,
      message: instruction,
      metadata: {
        householdId: String(latestDayPlan.householdId),
        runId: String(run._id),
        tarlaExecutionId: String(execution._id),
        dayPlanId: String(latestDayPlan._id),
        cookVisitId: String(visit._id),
        purpose: "scheduled_day_cook_instruction",
      },
    });
    await addCompletedStep(
      ctx,
      run._id,
      4,
      "send_cook_instruction",
      "Send through the provider-neutral development transport",
      "Development transport persisted one scheduled cook instruction",
    );
    const expectedResponseBy = sent.timestamp + 4 * 60 * 60 * 1_000;
    await ctx.db.patch(execution._id, {
      dayPlanId: latestDayPlan._id,
      status: "waiting",
      instruction,
      latestInstruction: instruction,
      outboundMessageId: sent.messageId,
      sentAt: sent.timestamp,
      expectedResponseBy,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(latestDayPlan._id, {
      status: "executing",
      updatedAt: Date.now(),
    });
    await addWaitingStep(
      ctx,
      run._id,
      5,
      "wait_for_cook_reply",
      "Wait for a normalized cook signal or response-window expiry",
    );
    await ctx.db.patch(run._id, {
      status: "waiting",
      outputSummary: "Scheduled full-day cook instruction sent; waiting for cook response",
      updatedAt: Date.now(),
    });
    const timeoutJobId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(
      expectedResponseBy,
      internal.tarlaRuntime.handleCookResponseTimeout,
      { executionId: execution._id, expectedResponseBy },
    );
    await ctx.db.patch(execution._id, {
      responseTimeoutJobId: String(timeoutJobId),
    });
    return execution._id;
  },
});

export const handleCookResponseTimeout = internalMutation({
  args: {
    executionId: v.id("tarlaExecutions"),
    expectedResponseBy: v.number(),
  },
  handler: async (ctx, { executionId, expectedResponseBy }) => {
    const execution = await ctx.db.get(executionId);
    if (
      !execution ||
      execution.expectedResponseBy !== expectedResponseBy ||
      (execution.status !== "waiting" && execution.status !== "revised_waiting")
    ) {
      return null;
    }
    const run = await ctx.db.get(execution.runId);
    if (!run) return null;
    await completeLatestWaitingStep(
      ctx,
      run._id,
      "Cook response window expired without an inbound signal",
    );
    const order = await nextStepOrder(ctx, run._id);
    await ctx.db.patch(execution._id, {
      status: "no_response",
      updatedAt: Date.now(),
    });
    await addCompletedStep(
      ctx,
      run._id,
      order,
      "complete",
      "Close the response window without inventing kitchen completion",
      "Execution ended NO_RESPONSE; no meal completion was inferred",
    );
    await completeRun(
      ctx,
      run,
      "Cook did not respond within the configured window; execution remains unconfirmed",
    );
    return execution._id;
  },
});
