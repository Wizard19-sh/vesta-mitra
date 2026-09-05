import { v } from "convex/values";
import { planFullDay } from "../lib/tarlaDayPlanner";
import { interpretUserCorrection } from "../lib/tarlaPlanner";
import {
  allocateMealsToCookVisits,
  cookRecipientClass,
} from "../lib/m2Execution";
import {
  cookVisitTiming,
  dayOfWeekForDate,
} from "../lib/tarlaVisitSchedule";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { composeDayExecutionInstruction } from "./tarlaInstruction";
import {
  activateDayPlanHistory,
  deactivateDaySeriesHistory,
  insertDayPlan,
  loadDayMeals,
  requireOwnedDayPlan,
} from "./tarlaDaySupport";
import {
  addCompletedStep,
  addWaitingStep,
  completeLatestWaitingStep,
  completeRun,
  loadPlanningContext,
  nextStepOrder,
  rememberTarlaCorrection,
  requireOwnedHousehold,
} from "./tarlaSupport";

export const createFullDayPlan = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    requestedByMemberId: v.id("members"),
    eaterMemberIds: v.array(v.id("members")),
    targetDate: v.string(),
    mealSlots: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireOwnedHousehold(ctx, args.householdId, args.ownerKey);
    const requester = await ctx.db.get(args.requestedByMemberId);
    if (!requester || requester.householdId !== args.householdId) {
      throw new Error("Requesting member was not found in the household");
    }
    const eaterMemberIds = [...new Set(args.eaterMemberIds)];
    if (eaterMemberIds.length === 0) throw new Error("At least one eater is required");
    const targetDate = validDate(args.targetDate);
    const mealSlots = normalizeMealSlots(
      args.mealSlots ?? ["breakfast", "lunch", "snack", "dinner"],
    );
    const now = Date.now();
    const runPublicId = crypto.randomUUID();
    const runId = await ctx.db.insert("agentRuns", {
      runId: runPublicId,
      agent: "tarla",
      householdId: args.householdId,
      taskType: "full_day_meal_plan",
      status: "running",
      startedAt: now,
      inputSummary: `Plan a full day across ${mealSlots.length} requested meal slots`,
      createdAt: now,
      updatedAt: now,
    });
    await addCompletedStep(
      ctx,
      runId,
      1,
      "receive_meal_request",
      "Accept a full-day household meal request",
      `Accepted ${targetDate} for ${eaterMemberIds.length} household members`,
    );
    const planning = await loadPlanningContext(ctx, args.householdId, eaterMemberIds);
    await addCompletedStep(
      ctx,
      runId,
      2,
      "retrieve_household_context",
      "Load household members and at-home meal participation",
      `Loaded ${planning.members.length} member profiles`,
    );
    await addCompletedStep(
      ctx,
      runId,
      3,
      "retrieve_member_preferences",
      "Load food rules, active memory, inventory, and recent history",
      `Loaded ${planning.rules.length} rules and ${planning.memory.length} active food memories`,
    );
    await addCompletedStep(
      ctx,
      runId,
      4,
      "calculate_targets",
      "Read editable daily nutrition targets without treating them as clinical advice",
      `${planning.members.filter((member) => member.calorieTargetKcal || member.proteinTargetG).length} members have daily targets`,
    );
    const result = planFullDay({
      targetDate,
      mealSlots,
      members: planning.members,
      rules: planning.rules,
      history: planning.history,
      memory: planning.memory,
      inventory: planning.inventory,
    });
    await addCompletedStep(
      ctx,
      runId,
      5,
      "generate_day_plan",
      "Select a coherent sequence while carrying same-day variety and frequency context forward",
      `Generated ${result.meals.length} planned meals with no repeated template`,
    );
    await addCompletedStep(
      ctx,
      runId,
      6,
      "calculate_daily_nutrition",
      "Sum per-meal member nutrition into daily totals and target variance",
      "Calculated meal totals, daily totals, and configured-target variance",
    );
    await addCompletedStep(
      ctx,
      runId,
      7,
      "validate_constraints",
      "Validate every selected meal and the full-day variety check",
      "All day-plan constraint checks passed",
    );
    const seriesId = crypto.randomUUID();
    const inserted = await insertDayPlan(ctx, {
      householdId: args.householdId,
      requestedByMemberId: args.requestedByMemberId,
      runId,
      seriesId,
      targetDate,
      status: "awaiting_approval",
      mealStatus: "awaiting_approval",
      version: 1,
      result,
    });
    await addWaitingStep(
      ctx,
      runId,
      8,
      "wait_for_user_approval",
      "Wait before scheduling any cook instruction",
    );
    await ctx.db.patch(runId, {
      status: "waiting",
      outputSummary: "Full-day plan created; waiting for household-user approval",
      updatedAt: Date.now(),
    });
    return {
      dayPlanId: inserted.dayPlanId,
      seriesId,
      runId: runPublicId,
      mealSlots: result.meals.map((meal) => meal.mealSlot),
    };
  },
});

export const requestDayPlanChange = mutation({
  args: {
    ownerKey: v.string(),
    dayPlanId: v.id("tarlaDayPlans"),
    memberId: v.id("members"),
    rawContent: v.string(),
  },
  handler: async (ctx, args) => {
    const dayPlan = await requireOwnedDayPlan(ctx, args.dayPlanId, args.ownerKey);
    if (![
      "awaiting_approval",
      "approved",
      "scheduled",
    ].includes(dayPlan.status)) {
      throw new Error("This full-day plan can no longer be changed before send");
    }
    const member = await ctx.db.get(args.memberId);
    if (!member || member.householdId !== dayPlan.householdId) {
      throw new Error("Feedback member was not found in this household");
    }
    if (dayPlan.status === "scheduled") {
      const executions = await ctx.db
        .query("tarlaExecutions")
        .withIndex("by_day_plan", (q) => q.eq("dayPlanId", dayPlan._id))
        .collect();
      if (executions.some((execution) => execution.status !== "scheduled")) {
        throw new Error("This extension only changes a day plan before its scheduled send");
      }
    }
    const rawContent = requiredText(args.rawContent, "Day-plan feedback", 5_000);
    const now = Date.now();
    const runPublicId = crypto.randomUUID();
    const runId = await ctx.db.insert("agentRuns", {
      runId: runPublicId,
      agent: "tarla",
      householdId: dayPlan.householdId,
      taskType: "full_day_plan_revision",
      status: "running",
      startedAt: now,
      inputSummary: "Revise an approved or review-stage full-day plan from explicit feedback",
      createdAt: now,
      updatedAt: now,
    });
    // Preserve the exact correction before interpreting it.
    const feedbackId = await ctx.db.insert("tarlaDayPlanFeedback", {
      householdId: dayPlan.householdId,
      dayPlanId: dayPlan._id,
      runId,
      memberId: args.memberId,
      feedbackType: "correction",
      rawContent,
      createdAt: now,
    });
    await addCompletedStep(
      ctx,
      runId,
      1,
      "receive_user_feedback",
      "Persist exact household-user feedback before interpretation",
      "Received an explicit full-day plan correction",
    );
    const currentMeals = await loadDayMeals(ctx, dayPlan._id);
    const correction = interpretUserCorrection(
      rawContent,
      currentMeals[0]?.mealPlan.selectedTemplateId ?? "full_day",
    );
    const preferenceId = await rememberTarlaCorrection(ctx, {
      householdId: dayPlan.householdId,
      memberId: args.memberId,
      key: correction.key,
      value: rawContent,
      expiresAt: correction.expiresAt,
    });
    await ctx.db.patch(feedbackId, {
      interpretation: correction.interpretation,
      preferenceId,
    });
    await addCompletedStep(
      ctx,
      runId,
      2,
      "persist_correction",
      "Store the correction in shared Vesta memory",
      correction.interpretation,
    );
    const eaterMemberIds = dayPlan.memberDailyNutrition.map(
      (entry) => entry.memberId,
    );
    await deactivateDaySeriesHistory(ctx, dayPlan);
    const planning = await loadPlanningContext(
      ctx,
      dayPlan.householdId,
      eaterMemberIds,
    );
    const result = planFullDay({
      targetDate: dayPlan.targetDate,
      mealSlots: dayPlan.mealSlots,
      members: planning.members,
      rules: planning.rules,
      history: planning.history,
      memory: planning.memory,
      inventory: planning.inventory,
    });
    await addCompletedStep(
      ctx,
      runId,
      3,
      "generate_day_plan",
      "Rebuild the day using the new active correction",
      `Generated day-plan version ${dayPlan.version + 1}`,
    );
    await addCompletedStep(
      ctx,
      runId,
      4,
      "calculate_daily_nutrition",
      "Recalculate every meal, daily total, and target variance",
      "Updated full-day nutrition after the correction",
    );
    const inserted = await insertDayPlan(ctx, {
      householdId: dayPlan.householdId,
      requestedByMemberId: dayPlan.requestedByMemberId,
      runId,
      seriesId: dayPlan.seriesId,
      targetDate: dayPlan.targetDate,
      status: "awaiting_approval",
      mealStatus: "awaiting_approval",
      version: dayPlan.version + 1,
      previousDayPlanId: dayPlan._id,
      result,
    });
    await ctx.db.patch(dayPlan._id, {
      status:
        dayPlan.status === "awaiting_approval" ? "rejected" : "superseded",
      updatedAt: Date.now(),
    });
    if (dayPlan.status === "awaiting_approval") {
      const oldRun = await ctx.db.get(dayPlan.runId);
      if (oldRun) {
        await completeLatestWaitingStep(
          ctx,
          oldRun._id,
          "Household user requested a full-day plan change",
        );
        await completeRun(ctx, oldRun, "Full-day plan was replaced before approval");
      }
    }
    await addWaitingStep(
      ctx,
      runId,
      5,
      "wait_for_user_approval",
      "Wait for approval of the revised full-day plan",
    );
    await ctx.db.patch(runId, {
      status: "waiting",
      outputSummary: "Revised full-day plan created; waiting for approval",
      updatedAt: Date.now(),
    });
    return {
      dayPlanId: inserted.dayPlanId,
      seriesId: dayPlan.seriesId,
      version: dayPlan.version + 1,
      runId: runPublicId,
      preferenceId,
    };
  },
});

export const approveDayPlan = mutation({
  args: {
    ownerKey: v.string(),
    dayPlanId: v.id("tarlaDayPlans"),
    memberId: v.id("members"),
    cookStateId: v.optional(v.id("tarlaCookStates")),
    rawContent: v.string(),
    prepareOnly: v.optional(v.boolean()),
    approvalSource: v.optional(
      v.union(v.literal("household_user"), v.literal("owner_test_admin")),
    ),
    approvalActorLabel: v.optional(v.string()),
    approvalNote: v.optional(v.string()),
    adminKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approvalSource = args.approvalSource ?? "household_user";
    const isTestAdminApproval = approvalSource === "owner_test_admin";
    if (isTestAdminApproval) {
      const expectedAdminKey = process.env.BETA_ADMIN_KEY?.trim();
      if (!expectedAdminKey || args.adminKey?.trim() !== expectedAdminKey) {
        throw new Error("Test-admin plan approval is not configured or authorised");
      }
      if (!args.approvalNote?.trim()) {
        throw new Error("Test-admin plan approval requires an audit note");
      }
    }
    const dayPlan = await requireOwnedDayPlan(ctx, args.dayPlanId, args.ownerKey);
    if (dayPlan.status !== "awaiting_approval") {
      throw new Error("Only a full-day plan awaiting approval can be approved");
    }
    const [member, run, dayMeals, cookStates, visits] = await Promise.all([
      ctx.db.get(args.memberId),
      ctx.db.get(dayPlan.runId),
      loadDayMeals(ctx, dayPlan._id),
      ctx.db
        .query("tarlaCookStates")
        .withIndex("by_household", (q) => q.eq("householdId", dayPlan.householdId))
        .collect(),
      ctx.db
        .query("tarlaCookVisits")
        .withIndex("by_household", (q) => q.eq("householdId", dayPlan.householdId))
        .collect(),
    ]);
    if (!member || member.householdId !== dayPlan.householdId) {
      throw new Error("Approving member was not found in this household");
    }
    const readyCookStates = cookStates.filter(
      (state) => state.active !== false && state.readiness === "ready",
    );
    let eligibleCookStates = readyCookStates;
    if (isTestAdminApproval) {
      if (!args.cookStateId) {
        throw new Error("Test-admin plan approval requires one selected cooking person");
      }
      const selectedCookState = cookStates.find(
        (state) => state._id === args.cookStateId && state.active !== false,
      );
      if (!selectedCookState) throw new Error("The selected cooking person is not active");
      const endpoint = await ctx.db.get(selectedCookState.communicationEndpointId);
      if (!endpoint || !endpoint.active || endpoint.consentStatus !== "granted") {
        throw new Error("The selected cooking person does not have an active, consented endpoint");
      }
      eligibleCookStates = [selectedCookState];
    }
    if (eligibleCookStates.length === 0) {
      throw new Error("At least one cooking person must be ready before scheduling instructions");
    }
    if (
      args.cookStateId &&
      !eligibleCookStates.some((state) => state._id === args.cookStateId)
    ) {
      throw new Error("The selected cooking person is not ready");
    }
    if (!run) throw new Error("Full-day plan run not found");
    const rawContent = requiredText(args.rawContent, "Approval", 5_000);
    await ctx.db.insert("tarlaDayPlanFeedback", {
      householdId: dayPlan.householdId,
      dayPlanId: dayPlan._id,
      runId: run._id,
      memberId: args.memberId,
      feedbackType: "approval",
      rawContent,
      interpretation: isTestAdminApproval
        ? "Owner/test admin approved this existing plan only to unblock the Build Week live run; the household user did not click approval."
        : "Household user approved this full-day plan version.",
      approvalSource,
      approvalActorLabel: isTestAdminApproval
        ? requiredText(args.approvalActorLabel ?? "Owner / test admin", "Approval actor", 120)
        : member.name,
      approvalNote: isTestAdminApproval
        ? requiredText(args.approvalNote ?? "", "Approval note", 500)
        : "Approved from the generated-plan screen.",
      createdAt: Date.now(),
    });
    await completeLatestWaitingStep(
      ctx,
      run._id,
      isTestAdminApproval
        ? "Owner/test admin approved the existing plan for the Build Week live run; the household user did not click approval"
        : "Household user approved the full-day plan",
    );
    let order = await nextStepOrder(ctx, run._id);
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "receive_user_feedback",
      "Persist exact approval before scheduling cook work",
      `${isTestAdminApproval ? "Owner/test admin approved" : "Household user approved"} full-day plan version ${dayPlan.version}`,
    );
    const dayOfWeek = dayOfWeekForDate(dayPlan.targetDate);
    const applicableVisits = visits.filter(
      (visit) =>
        visit.active &&
        visit.daysOfWeek.includes(dayOfWeek) &&
        eligibleCookStates.some((state) => state._id === visit.cookStateId),
    );
    if (applicableVisits.length === 0) {
      throw new Error("No active cook visit is configured for this day");
    }
    const allocations = allocateMealsToCookVisits(
      dayPlan.mealSlots,
      applicableVisits.map((visit) => ({
        id: String(visit._id),
        arrivalTime: visit.arrivalTime,
        mealSlots: visit.mealSlots,
        relationshipType:
          eligibleCookStates.find((state) => state._id === visit.cookStateId)
            ?.relationshipType ?? "hired_cook",
      })),
    );
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "allocate_meals_to_cook_visits",
      "Map approved meals to configured visit responsibilities",
      `${dayPlan.mealSlots.length} meals allocated across ${allocations.length} matched visits`,
    );
    const executions = [];
    for (const allocation of allocations) {
      const visit = applicableVisits.find(
        (candidate) => String(candidate._id) === allocation.visitId,
      );
      if (!visit) throw new Error("Allocated cooking visit was not found");
      const cookState = eligibleCookStates.find(
        (candidate) => candidate._id === visit.cookStateId,
      );
      if (!cookState) throw new Error("Allocated cooking person was not found");
      const occurrenceKey = `${dayPlan.seriesId}:${visit._id}:${dayPlan.targetDate}`;
      const existing = await ctx.db
        .query("tarlaExecutions")
        .withIndex("by_occurrence_key", (q) => q.eq("occurrenceKey", occurrenceKey))
        .unique();
      if (existing) {
        if (existing.status !== "scheduled") {
          throw new Error("A cook visit instruction has already triggered for this plan series");
        }
        await ctx.db.patch(existing._id, {
          dayPlanId: dayPlan._id,
          assignedMealSlots: allocation.assignedMealSlots,
          selectedCookReason: allocation.reason,
          recipientClass: cookRecipientClass(cookState.relationshipType),
          planVersion: dayPlan.version,
          updatedAt: Date.now(),
        });
        executions.push({
          executionId: existing._id,
          cookVisitId: visit._id,
          assignedMealSlots: allocation.assignedMealSlots,
          scheduledFor: existing.scheduledFor,
          reused: true,
        });
        continue;
      }
      const timing = cookVisitTiming({
        targetDate: dayPlan.targetDate,
        arrivalTime: visit.arrivalTime,
        timezone: visit.timezone,
        instructionLeadMinutes: visit.instructionLeadMinutes,
      });
      const visitRunPublicId = crypto.randomUUID();
      const now = Date.now();
      const visitRunId = await ctx.db.insert("agentRuns", {
        runId: visitRunPublicId,
        agent: "tarla",
        householdId: dayPlan.householdId,
        taskType: "scheduled_cook_visit_instruction",
        status: "queued",
        inputSummary: `Send the ${visit.label} instruction from the latest approved full-day plan`,
        createdAt: now,
        updatedAt: now,
      });
      const executionId = await ctx.db.insert("tarlaExecutions", {
        householdId: dayPlan.householdId,
        dayPlanId: dayPlan._id,
        dayPlanSeriesId: dayPlan.seriesId,
        cookVisitId: visit._id,
        runId: visitRunId,
        cookMemberId: cookState.memberId,
        communicationEndpointId: cookState.communicationEndpointId,
        assignedMealSlots: allocation.assignedMealSlots,
        selectedCookReason: allocation.reason,
        recipientClass: cookRecipientClass(cookState.relationshipType),
        planVersion: dayPlan.version,
        status: args.prepareOnly ? "instruction_ready" : "scheduled",
        scheduledFor: timing.instructionAt,
        occurrenceKey,
        unavailableIngredientKeys: [],
        lockedMealSlots: [],
        userEscalationRequired: false,
        createdAt: now,
        updatedAt: now,
      });
      let instruction;
      if (args.prepareOnly) {
        const execution = await ctx.db.get(executionId);
        if (!execution) throw new Error("Prepared execution was not found");
        instruction = (await composeDayExecutionInstruction(ctx, execution, dayPlan)).instruction;
        await ctx.db.patch(executionId, { instruction, latestInstruction: instruction });
      } else {
        const scheduledJobId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(
          timing.instructionAt,
          internal.tarlaRuntime.triggerCookVisit,
          { executionId, scheduledFor: timing.instructionAt },
        );
        await ctx.db.patch(executionId, { scheduledJobId: String(scheduledJobId) });
      }
      executions.push({
        executionId,
        cookVisitId: visit._id,
        assignedMealSlots: allocation.assignedMealSlots,
        scheduledFor: timing.instructionAt,
        arrivalAt: timing.arrivalAt,
        reused: false,
        runId: visitRunPublicId,
        instruction,
      });
    }
    await Promise.all(
      dayMeals.map((meal) =>
        ctx.db.patch(meal.mealPlan._id, {
          status: "approved",
          approvedAt: Date.now(),
          updatedAt: Date.now(),
        }),
      ),
    );
    await activateDayPlanHistory(ctx, dayPlan);
    await ctx.db.patch(dayPlan._id, {
      status: "scheduled",
      approvedAt: Date.now(),
      approvalSource,
      approvalActorLabel: isTestAdminApproval
        ? requiredText(args.approvalActorLabel ?? "Owner / test admin", "Approval actor", 120)
        : member.name,
      approvalNote: isTestAdminApproval
        ? requiredText(args.approvalNote ?? "", "Approval note", 500)
        : "Approved from the generated-plan screen.",
      updatedAt: Date.now(),
    });
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "schedule_cook_instruction",
      "Schedule provider-neutral sends for arrival time minus each configured lead time",
      `${executions.length} idempotent cook-visit executions are scheduled`,
    );
    await addCompletedStep(
      ctx,
      run._id,
      order,
      "complete",
      "Finish planning after durable visit scheduling",
      "Full-day plan approved and cook visits scheduled",
    );
    await completeRun(
      ctx,
      run,
      "Full-day plan approved; cook instructions will be composed at their scheduled triggers",
    );
    return {
      dayPlanId: dayPlan._id,
      seriesId: dayPlan.seriesId,
      executions,
    };
  },
});

export const sendPreparedDayInstruction = mutation({
  args: { ownerKey: v.string(), executionId: v.id("tarlaExecutions") },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "instruction_ready" || !execution.instruction || !execution.dayPlanId) {
      throw new Error("Prepared Tarla payload is missing, stale, or already used");
    }
    const dayPlan = await requireOwnedDayPlan(ctx, execution.dayPlanId, args.ownerKey);
    if (
      dayPlan.version !== execution.planVersion ||
      !["scheduled", "executing"].includes(dayPlan.status)
    ) {
      throw new Error("Prepared Tarla payload is stale; prepare again");
    }
    const current = await composeDayExecutionInstruction(ctx, execution, dayPlan);
    if (current.instruction !== execution.instruction) {
      throw new Error("Tarla plan or context changed; prepare again");
    }
    const scheduledFor = Date.now() + 1_000;
    const scheduledJobId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(
      scheduledFor,
      internal.tarlaRuntime.triggerCookVisit,
      { executionId: execution._id, scheduledFor },
    );
    await ctx.db.patch(execution._id, {
      status: "scheduled",
      scheduledFor,
      scheduledJobId: String(scheduledJobId),
      updatedAt: Date.now(),
    });
    const run = await ctx.db.get(execution.runId);
    return { executionId: execution._id, runId: run?.runId, instruction: execution.instruction };
  },
});

export const getDayPlan = query({
  args: { ownerKey: v.string(), dayPlanId: v.id("tarlaDayPlans") },
  handler: async (ctx, args) => {
    const dayPlan = await requireOwnedDayPlan(ctx, args.dayPlanId, args.ownerKey);
    const [meals, feedback, executions, run] = await Promise.all([
      loadDayMeals(ctx, dayPlan._id),
      ctx.db
        .query("tarlaDayPlanFeedback")
        .withIndex("by_day_plan", (q) => q.eq("dayPlanId", dayPlan._id))
        .collect(),
      ctx.db
        .query("tarlaExecutions")
        .withIndex("by_day_plan", (q) => q.eq("dayPlanId", dayPlan._id))
        .collect(),
      ctx.db.get(dayPlan.runId),
    ]);
    const steps = run
      ? await ctx.db
          .query("agentRunSteps")
          .withIndex("by_run_and_order", (q) => q.eq("runId", run._id))
          .order("asc")
          .collect()
      : [];
    return { dayPlan, meals, feedback, executions, run, steps };
  },
});

export const listDayPlans = query({
  args: { ownerKey: v.string(), householdId: v.id("households") },
  handler: async (ctx, args) => {
    await requireOwnedHousehold(ctx, args.householdId, args.ownerKey);
    return ctx.db
      .query("tarlaDayPlans")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .order("desc")
      .collect();
  },
});

export const getDayExecution = query({
  args: {
    ownerKey: v.string(),
    executionId: v.id("tarlaExecutions"),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) throw new Error("Tarla day execution not found");
    await requireOwnedHousehold(ctx, execution.householdId, args.ownerKey);
    const [dayPlan, visit, run, outboundMessages, transportMessages, inboundSignals] =
      await Promise.all([
        execution.dayPlanId
          ? ctx.db.get(execution.dayPlanId)
          : Promise.resolve(null),
        execution.cookVisitId
          ? ctx.db.get(execution.cookVisitId)
          : Promise.resolve(null),
        ctx.db.get(execution.runId),
        ctx.db
          .query("devTransportMessages")
          .withIndex("by_tarla_execution", (q) =>
            q.eq("tarlaExecutionId", execution._id),
          )
          .collect(),
        ctx.db
          .query("transportMessages")
          .withIndex("by_tarla_execution", (q) =>
            q.eq("tarlaExecutionId", execution._id),
          )
          .collect(),
        ctx.db
          .query("inboundSignals")
          .withIndex("by_tarla_execution", (q) =>
            q.eq("tarlaExecutionId", execution._id),
          )
          .collect(),
      ]);
    const [meals, steps] = await Promise.all([
      dayPlan ? loadDayMeals(ctx, dayPlan._id) : Promise.resolve([]),
      run
        ? ctx.db
            .query("agentRunSteps")
            .withIndex("by_run_and_order", (q) => q.eq("runId", run._id))
            .order("asc")
            .collect()
        : Promise.resolve([]),
    ]);
    return {
      execution,
      dayPlan,
      meals,
      visit,
      run,
      steps,
      outboundMessages: outboundMessages.sort(
        (left, right) => left.sentAt - right.sentAt,
      ),
      transportMessages: transportMessages.sort(
        (left, right) => left.requestedAt - right.requestedAt,
      ),
      inboundSignals: inboundSignals.sort(
        (left, right) => left.timestamp - right.timestamp,
      ),
    };
  },
});

function normalizeMealSlots(values: string[]) {
  const allowed = new Set(["breakfast", "lunch", "snack", "dinner"]);
  const normalized = [...new Set(values.map((value) => value.trim().toLocaleLowerCase()))];
  if (normalized.length === 0 || normalized.some((value) => !allowed.has(value))) {
    throw new Error("Day meal slots must be breakfast, lunch, optional snack, or dinner");
  }
  return ["breakfast", "lunch", "snack", "dinner"].filter((slot) =>
    normalized.includes(slot),
  );
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("Target date must use YYYY-MM-DD format");
  }
  return value;
}

function requiredText(value: string, label: string, maxLength: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return clean;
}
