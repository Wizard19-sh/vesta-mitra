import { v } from "convex/values";
import { calculateRecipeSnapshot, interpretUserCorrection, planMeal } from "../lib/tarlaPlanner";
import { composeCookInstruction } from "../lib/tarlaMessages";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getMessageTransport } from "./messageTransport";
import {
  addCompletedStep,
  addWaitingStep,
  completeLatestWaitingStep,
  getCalculatedPlanItems,
  insertMealPlan,
  loadPlanningContext,
  nextStepOrder,
  rememberTarlaCorrection,
  requireOwnedHousehold,
  requireOwnedPlan,
} from "./tarlaSupport";

const feedbackAction = v.union(
  v.literal("approve"),
  v.literal("request_change"),
);

export const createMealPlan = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    requestedByMemberId: v.id("members"),
    eaterMemberIds: v.array(v.id("members")),
    targetDate: v.string(),
    mealSlot: v.string(),
    contextLabel: v.optional(v.string()),
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
    const mealSlot = requiredText(args.mealSlot, "Meal slot", 40).toLocaleLowerCase();
    const now = Date.now();
    const runPublicId = crypto.randomUUID();
    const runId = await ctx.db.insert("agentRuns", {
      runId: runPublicId,
      agent: "tarla",
      householdId: args.householdId,
      taskType: "meal_plan_and_kitchen_execution",
      status: "running",
      startedAt: now,
      inputSummary: `Plan one ${mealSlot} meal for ${eaterMemberIds.length} household members`,
      createdAt: now,
      updatedAt: now,
    });
    await addCompletedStep(
      ctx,
      runId,
      1,
      "receive_meal_request",
      "Accept a household meal request",
      `Accepted a ${mealSlot} request for ${targetDate}`,
    );
    const planning = await loadPlanningContext(ctx, args.householdId, eaterMemberIds);
    await addCompletedStep(
      ctx,
      runId,
      2,
      "retrieve_household_context",
      "Load the shared Vesta household and selected members",
      `Loaded ${planning.members.length} eater profiles`,
    );
    await addCompletedStep(
      ctx,
      runId,
      3,
      "retrieve_member_preferences",
      "Load structured profiles, dietary rules, and active Vesta memory",
      `Loaded ${planning.rules.length} rules and ${planning.memory.length} active food memories`,
    );
    await addCompletedStep(
      ctx,
      runId,
      4,
      "retrieve_recent_meal_history",
      "Load recent approved and manual meal history",
      `Loaded ${planning.history.length} history records`,
    );
    await addCompletedStep(
      ctx,
      runId,
      5,
      "calculate_targets",
      "Use editable member calorie, protein, and serving targets when supplied",
      `${planning.members.filter((member) => member.calorieTargetKcal || member.proteinTargetG).length} members have explicit nutrition targets`,
    );
    const result = planMeal({
      targetDate,
      mealSlot,
      members: planning.members,
      rules: planning.rules,
      history: planning.history,
      memory: planning.memory,
      inventory: planning.inventory,
    });
    await addCompletedStep(
      ctx,
      runId,
      6,
      "select_candidate_meals",
      "Filter and rank the small structured meal-template library",
      `Selected ${result.templateName}`,
    );
    await addCompletedStep(
      ctx,
      runId,
      7,
      "validate_constraints",
      "Check dietary type, allergy, day, repetition, memory, and inventory rules",
      "All hard constraints passed",
    );
    await addCompletedStep(
      ctx,
      runId,
      8,
      "calculate_nutrition",
      "Scale ingredient grams and sum deterministic nutrition data",
      `Calculated ${result.perServingNutrition.caloriesKcal} kcal and ${result.perServingNutrition.proteinG} g protein per serving equivalent`,
    );
    const planId = await insertMealPlan(ctx, {
      householdId: args.householdId,
      requestedByMemberId: args.requestedByMemberId,
      runId,
      targetDate,
      mealSlot,
      contextLabel: optionalText(args.contextLabel, "Context label", 200),
      status: "awaiting_approval",
      version: 1,
      result,
    });
    await addCompletedStep(
      ctx,
      runId,
      9,
      "generate_plan",
      "Persist an inspectable plan and ingredient-level nutrition snapshot",
      "Created plan version 1 for user review",
    );
    await addWaitingStep(
      ctx,
      runId,
      10,
      "wait_for_user_approval",
      "Wait for approval or an explicit correction before contacting the cook",
    );
    await ctx.db.patch(runId, {
      status: "waiting",
      outputSummary: "Meal plan created; waiting for household-user approval",
      updatedAt: Date.now(),
    });
    return { planId, runId: runPublicId, selectedTemplateId: result.templateId };
  },
});

export const submitUserFeedback = mutation({
  args: {
    ownerKey: v.string(),
    planId: v.id("tarlaMealPlans"),
    memberId: v.id("members"),
    action: feedbackAction,
    rawContent: v.string(),
    cookMemberId: v.optional(v.id("members")),
    responseWindowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const plan = await requireOwnedPlan(ctx, args.planId, args.ownerKey);
    if (plan.status !== "awaiting_approval") {
      throw new Error("Only a plan awaiting approval can receive user feedback");
    }
    const member = await ctx.db.get(args.memberId);
    if (!member || member.householdId !== plan.householdId) {
      throw new Error("Feedback member was not found in this household");
    }
    const run = await ctx.db.get(plan.runId);
    if (!run) throw new Error("Tarla run not found");
    const rawContent = requiredText(args.rawContent, "Feedback", 5_000);

    // The exact user feedback is persisted before interpretation or state changes.
    const feedbackId = await ctx.db.insert("tarlaUserFeedback", {
      householdId: plan.householdId,
      planId: plan._id,
      runId: run._id,
      memberId: args.memberId,
      feedbackType: args.action === "approve" ? "approval" : "correction",
      rawContent,
      createdAt: Date.now(),
    });
    await completeLatestWaitingStep(
      ctx,
      run._id,
      args.action === "approve" ? "Household user approved the plan" : "Household user requested a change",
    );
    let order = await nextStepOrder(ctx, run._id);
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "receive_user_feedback",
      "Persist the exact household-user feedback before applying it",
      args.action === "approve" ? "Received plan approval" : "Received an explicit plan correction",
    );

    if (args.action === "request_change") {
      const correction = interpretUserCorrection(rawContent, plan.selectedTemplateId);
      const preferenceId = await rememberTarlaCorrection(ctx, {
        householdId: plan.householdId,
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
        run._id,
        order++,
        "persist_correction",
        "Store explicit food feedback in shared Vesta memory",
        correction.interpretation,
      );
      const eaterMemberIds = plan.memberNutrition.map((item) => item.memberId);
      const planning = await loadPlanningContext(ctx, plan.householdId, eaterMemberIds);
      const result = planMeal({
        targetDate: plan.targetDate,
        mealSlot: plan.mealSlot,
        members: planning.members,
        rules: planning.rules,
        history: planning.history,
        memory: planning.memory,
        inventory: planning.inventory,
      });
      const newPlanId = await insertMealPlan(ctx, {
        householdId: plan.householdId,
        requestedByMemberId: plan.requestedByMemberId,
        runId: run._id,
        targetDate: plan.targetDate,
        mealSlot: plan.mealSlot,
        contextLabel: plan.contextLabel,
        status: "awaiting_approval",
        version: plan.version + 1,
        previousPlanId: plan._id,
        result,
      });
      await ctx.db.patch(plan._id, { status: "rejected", updatedAt: Date.now() });
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "replan_if_needed",
        "Apply the new memory and rerun deterministic constraint selection",
        `Created plan version ${plan.version + 1} using ${result.templateName}`,
      );
      await addWaitingStep(
        ctx,
        run._id,
        order,
        "wait_for_user_approval",
        "Wait for approval of the revised plan",
      );
      await ctx.db.patch(run._id, {
        status: "waiting",
        outputSummary: "Revised meal plan created; waiting for approval",
        updatedAt: Date.now(),
      });
      return {
        action: "replanned" as const,
        feedbackId,
        preferenceId,
        planId: newPlanId,
        selectedTemplateId: result.templateId,
        runId: run.runId,
      };
    }

    await ctx.db.patch(feedbackId, { interpretation: "Household user approved this exact plan version." });
    await ctx.db.patch(plan._id, {
      status: "approved",
      approvedAt: Date.now(),
      updatedAt: Date.now(),
    });
    const cookMemberId = args.cookMemberId;
    if (!cookMemberId) throw new Error("Cook member is required when approving a plan");
    const cookState = await ctx.db
      .query("tarlaCookStates")
      .withIndex("by_member", (q) => q.eq("memberId", cookMemberId))
      .unique();
    if (!cookState || cookState.householdId !== plan.householdId || cookState.readiness !== "ready") {
      throw new Error("Cook must be primed and ready before an instruction is sent");
    }
    const [cook, endpoint, items, planning] = await Promise.all([
      ctx.db.get(cookMemberId),
      ctx.db.get(cookState.communicationEndpointId),
      getCalculatedPlanItems(ctx, plan._id),
      loadPlanningContext(ctx, plan.householdId, plan.memberNutrition.map((item) => item.memberId)),
    ]);
    if (!cook || !endpoint || !endpoint.active || endpoint.consentStatus !== "granted") {
      throw new Error("An active consented cook endpoint is required");
    }
    const importantRestrictions = planning.members.flatMap((profile) =>
      profile.allergies.map((allergy) => `${profile.name}: no ${allergy.replaceAll("_", " ")}`),
    );
    const instruction = composeCookInstruction({
      mealSlot: plan.mealSlot,
      totalServingEquivalents: plan.totalServingEquivalents,
      items,
      memberNotes: planning.members
        .filter((profile) => profile.cookNotes)
        .map((profile) => ({ memberName: profile.name, note: profile.cookNotes! })),
      importantRestrictions,
      preferredLanguage: endpoint.preferredLanguage ?? cook.languagePreference,
    });
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "generate_cook_instruction",
      "Turn the approved structured plan into one concise executable instruction",
      `Generated one instruction for ${plan.totalServingEquivalents} serving equivalents`,
    );
    const now = Date.now();
    const executionId = await ctx.db.insert("tarlaExecutions", {
      householdId: plan.householdId,
      planId: plan._id,
      runId: run._id,
      cookMemberId,
      communicationEndpointId: endpoint._id,
      status: "instruction_ready",
      instruction,
      latestInstruction: instruction,
      unavailableIngredientKeys: [],
      userEscalationRequired: false,
      createdAt: now,
      updatedAt: now,
    });
    const sent = await getMessageTransport(ctx).sendMessage({
      recipient: {
        memberId: String(cook._id),
        endpointId: String(endpoint._id),
        address: endpoint.address,
      },
      channel: endpoint.channel,
      message: instruction,
      metadata: {
        householdId: String(plan.householdId),
        runId: String(run._id),
        tarlaExecutionId: String(executionId),
        mealPlanId: String(plan._id),
        purpose: "cook_instruction",
      },
    });
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "send_cook_instruction",
      "Send the approved instruction through the provider-neutral transport",
      "Provider-neutral transport recorded one cook instruction request",
    );
    const responseWindowMs = validResponseWindow(args.responseWindowMs);
    const expectedResponseBy = sent.timestamp + responseWindowMs;
    await ctx.db.patch(executionId, {
      status: "waiting",
      outboundMessageId: sent.messageId,
      sentAt: sent.timestamp,
      expectedResponseBy,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(plan._id, { status: "executing", updatedAt: Date.now() });
    const ingredientKeys = [...new Set(items.flatMap((item) => item.ingredients.map((ingredient) => ingredient.ingredientKey)))];
    await ctx.db.insert("tarlaMealHistory", {
      householdId: plan.householdId,
      planId: plan._id,
      targetDate: plan.targetDate,
      mealSlot: plan.mealSlot,
      templateId: plan.selectedTemplateId,
      recipeIds: items.map((item) => item.recipeId),
      ingredientKeys,
      active: true,
      source: "approved_plan",
      createdAt: Date.now(),
    });
    await addWaitingStep(
      ctx,
      run._id,
      order,
      "wait_for_cook_reply",
      "Wait for a normalized cook signal or response-window expiry",
    );
    await ctx.db.patch(run._id, {
      status: "waiting",
      outputSummary:
        "Approved meal instruction recorded by transport; waiting for cook response",
      updatedAt: Date.now(),
    });
    const timeoutJobId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(
      expectedResponseBy,
      internal.tarlaRuntime.handleCookResponseTimeout,
      { executionId, expectedResponseBy },
    );
    await ctx.db.patch(executionId, { responseTimeoutJobId: String(timeoutJobId) });
    return {
      action: "approved_and_sent" as const,
      feedbackId,
      planId: plan._id,
      executionId,
      outboundMessageId: sent.messageId,
      runId: run.runId,
    };
  },
});

export const calculateRecipeNutrition = query({
  args: { recipeId: v.string(), totalServingEquivalents: v.number() },
  handler: async (_ctx, args) =>
    calculateRecipeSnapshot(args.recipeId, args.totalServingEquivalents),
});

export const getMealPlan = query({
  args: { ownerKey: v.string(), planId: v.id("tarlaMealPlans") },
  handler: async (ctx, args) => {
    const plan = await requireOwnedPlan(ctx, args.planId, args.ownerKey);
    const [items, feedback, executions] = await Promise.all([
      ctx.db
        .query("tarlaMealPlanItems")
        .withIndex("by_plan", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("tarlaUserFeedback")
        .withIndex("by_plan", (q) => q.eq("planId", plan._id))
        .collect(),
      ctx.db
        .query("tarlaExecutions")
        .withIndex("by_plan", (q) => q.eq("planId", plan._id))
        .collect(),
    ]);
    return { plan, items, feedback, executions };
  },
});

export const getExecution = query({
  args: { ownerKey: v.string(), executionId: v.id("tarlaExecutions") },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) throw new Error("Tarla execution not found");
    await requireOwnedHousehold(ctx, execution.householdId, args.ownerKey);
    const [plan, items, outboundMessages, transportMessages, inboundSignals, run] = await Promise.all([
      execution.planId ? ctx.db.get(execution.planId) : Promise.resolve(null),
      execution.planId
        ? ctx.db
            .query("tarlaMealPlanItems")
            .withIndex("by_plan", (q) => q.eq("planId", execution.planId!))
            .collect()
        : Promise.resolve([]),
      ctx.db
        .query("devTransportMessages")
        .withIndex("by_tarla_execution", (q) => q.eq("tarlaExecutionId", execution._id))
        .collect(),
      ctx.db
        .query("transportMessages")
        .withIndex("by_tarla_execution", (q) =>
          q.eq("tarlaExecutionId", execution._id),
        )
        .collect(),
      ctx.db
        .query("inboundSignals")
        .withIndex("by_tarla_execution", (q) => q.eq("tarlaExecutionId", execution._id))
        .collect(),
      ctx.db.get(execution.runId),
    ]);
    const steps = run
      ? await ctx.db
          .query("agentRunSteps")
          .withIndex("by_run_and_order", (q) => q.eq("runId", run._id))
          .order("asc")
          .collect()
      : [];
    return {
      execution,
      plan,
      items,
      outboundMessages,
      transportMessages,
      inboundSignals,
      run,
      steps,
    };
  },
});

export const listMealPlans = query({
  args: { ownerKey: v.string(), householdId: v.id("households") },
  handler: async (ctx, args) => {
    await requireOwnedHousehold(ctx, args.householdId, args.ownerKey);
    return ctx.db
      .query("tarlaMealPlans")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .order("desc")
      .collect();
  },
});

export const listShoppingNeeded = query({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    includeResolved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireOwnedHousehold(ctx, args.householdId, args.ownerKey);
    const items = await ctx.db
      .query("shoppingNeededItems")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .order("desc")
      .collect();
    return args.includeResolved ? items : items.filter((item) => item.status === "needed");
  },
});

export const updateShoppingStatus = mutation({
  args: {
    ownerKey: v.string(),
    itemId: v.id("shoppingNeededItems"),
    status: v.union(v.literal("needed"), v.literal("acquired"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Shopping-needed item not found");
    await requireOwnedHousehold(ctx, item.householdId, args.ownerKey);
    await ctx.db.patch(item._id, { status: args.status, updatedAt: Date.now() });
    return item._id;
  },
});

function requiredText(value: string, label: string, maxLength: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return clean;
}

function optionalText(value: string | undefined, label: string, maxLength: number) {
  if (value === undefined) return undefined;
  const clean = value.trim();
  if (!clean) return undefined;
  if (clean.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return clean;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("Target date must use YYYY-MM-DD format");
  }
  return value;
}

function validResponseWindow(value: number | undefined) {
  const result = value ?? 4 * 60 * 60 * 1_000;
  if (!Number.isFinite(result) || result < 1_000 || result > 24 * 60 * 60 * 1_000) {
    throw new Error("Cook response window must be between 1 second and 24 hours");
  }
  return result;
}
