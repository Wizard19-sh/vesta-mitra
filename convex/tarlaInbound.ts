import { v } from "convex/values";
import { interpretTarlaCookSignal } from "../lib/interpretTarlaSignal";
import { summarizeDayMeals } from "../lib/tarlaDayPlanner";
import { planMeal } from "../lib/tarlaPlanner";
import {
  composeCookInstruction,
  composeDayCookInstruction,
  composeRecipeQuestionReply,
} from "../lib/tarlaMessages";
import { getIngredient } from "../lib/tarlaIngredientData";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { getMessageTransport } from "./messageTransport";
import {
  activateDayPlanHistory,
  insertDayPlanFromMeals,
  loadDayMeals,
} from "./tarlaDaySupport";
import {
  addCompletedStep,
  addWaitingStep,
  completeLatestWaitingStep,
  completeRun,
  getCalculatedPlanItems,
  insertMealPlan,
  loadPlanningContext,
  nextStepOrder,
} from "./tarlaSupport";

const signalType = v.union(
  v.literal("text"),
  v.literal("reaction"),
  v.literal("acknowledgement"),
);

export const ingestCookSignal = mutation({
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
    const senderAddress = requiredText(args.senderAddress, "Sender address", 500);
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
        executionId: duplicate.tarlaExecutionId,
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
      return { signalId, matched: false, executionId: undefined };
    }

    const executions = await ctx.db
      .query("tarlaExecutions")
      .withIndex("by_cook", (q) => q.eq("cookMemberId", endpoint!.memberId))
      .order("desc")
      .collect();
    const referencedMessageId =
      args.metadata?.inReplyToMessageId ?? args.metadata?.reactionToMessageId;
    const execution = executions.find(
      (candidate) =>
        candidate.communicationEndpointId === endpoint!._id &&
        ["waiting", "revised_waiting", "question_received", "unresolved"].includes(candidate.status) &&
        (!referencedMessageId ||
          candidate.outboundMessageId === referencedMessageId ||
          candidate.revisedOutboundMessageId === referencedMessageId),
    );
    if (!execution) {
      const signalId = await persistSignal(ctx, args, {
        dedupeKey,
        channel,
        senderAddress,
        endpoint,
        matched: false,
      });
      return { signalId, matched: false, executionId: undefined };
    }
    if (execution.dayPlanId) {
      return handleDayExecutionSignal(ctx, args, {
        dedupeKey,
        channel,
        senderAddress,
        messageId,
        endpoint,
        execution,
      });
    }
    if (!execution.planId) {
      const signalId = await persistSignal(ctx, args, {
        dedupeKey,
        channel,
        senderAddress,
        endpoint,
        executionId: execution._id,
        runId: execution.runId,
        matched: false,
      });
      return { signalId, matched: false, executionId: execution._id };
    }

    const planId = execution.planId;
    const [plan, run] = await Promise.all([
      ctx.db.get(planId),
      ctx.db.get(execution.runId),
    ]);
    if (!plan || !run) {
      const signalId = await persistSignal(ctx, args, {
        dedupeKey,
        channel,
        senderAddress,
        endpoint,
        matched: false,
      });
      return { signalId, matched: false, executionId: undefined };
    }

    // Preserve the provider-neutral raw signal before interpreting kitchen meaning.
    const signalId = await persistSignal(ctx, args, {
      dedupeKey,
      channel,
      senderAddress,
      endpoint,
      executionId: execution._id,
      runId: run._id,
      matched: true,
    });
    await completeLatestWaitingStep(
      ctx,
      run._id,
      `Received normalized cook ${args.signalType} signal`,
    );
    let order = await nextStepOrder(ctx, run._id);
    order = await addWebhookTraceIfPresent(ctx, run._id, order, args.metadata, args.signalType);
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "receive_cook_signal",
      "Accept a provider-neutral inbound cook signal",
      `Received ${args.signalType} signal ${messageId}`,
    );
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "persist_raw_signal",
      "Persist the exact source signal before interpretation",
      "Stored the unchanged cook signal",
    );
    const interpretation = interpretTarlaCookSignal({
      signalType: args.signalType,
      rawContent: args.rawContent,
    });
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "interpret_constraint",
      "Apply deterministic kitchen-signal interpretation",
      interpretation.summary,
    );
    await ctx.db.patch(execution._id, {
      latestInboundSignalId: signalId,
      updatedAt: Date.now(),
    });

    if (interpretation.kind === "missing_ingredient") {
      const currentItems = await getCalculatedPlanItems(ctx, plan._id);
      const affectedItem = currentItems.find((item) =>
        item.ingredients.some(
          (ingredient) => ingredient.ingredientKey === interpretation.ingredientKey,
        ),
      );
      await markIngredientUnavailable(
        ctx,
        plan.householdId,
        execution._id,
        interpretation.ingredientKey,
        interpretation.ingredientName,
      );
      if (!affectedItem) {
        await ctx.db.patch(execution._id, {
          status: "unresolved",
          userEscalationRequired: true,
          unavailableIngredientKeys: [
            ...new Set([
              ...execution.unavailableIngredientKeys,
              interpretation.ingredientKey,
            ]),
          ],
          updatedAt: Date.now(),
        });
        await addWaitingStep(
          ctx,
          run._id,
          order,
          "wait_for_user_approval",
          "The reported item was not part of the approved plan, so clarification is required",
        );
        await ctx.db.patch(run._id, {
          status: "waiting",
          outputSummary: "Cook reported an unmatched missing item; user clarification is required",
          updatedAt: Date.now(),
        });
        return {
          signalId,
          matched: true,
          executionId: execution._id,
          state: "unresolved",
          userEscalationRequired: true,
        };
      }

      const eaterMemberIds = plan.memberNutrition.map((item) => item.memberId);
      const planning = await loadPlanningContext(ctx, plan.householdId, eaterMemberIds);
      let replacement;
      try {
        replacement = planMeal({
          targetDate: plan.targetDate,
          mealSlot: plan.mealSlot,
          members: planning.members,
          rules: planning.rules,
          history: planning.history,
          memory: planning.memory,
          inventory: planning.inventory,
        });
      } catch {
        await ctx.db.patch(execution._id, {
          status: "unresolved",
          userEscalationRequired: true,
          unavailableIngredientKeys: [
            ...new Set([
              ...execution.unavailableIngredientKeys,
              interpretation.ingredientKey,
            ]),
          ],
          updatedAt: Date.now(),
        });
        await addWaitingStep(
          ctx,
          run._id,
          order,
          "wait_for_user_approval",
          "No valid replacement satisfied all known constraints",
        );
        await ctx.db.patch(run._id, {
          status: "waiting",
          outputSummary: "No safe replacement found; household-user decision is required",
          updatedAt: Date.now(),
        });
        return {
          signalId,
          matched: true,
          executionId: execution._id,
          state: "unresolved",
          userEscalationRequired: true,
        };
      }
      const revisedPlanId = await insertMealPlan(ctx, {
        householdId: plan.householdId,
        requestedByMemberId: plan.requestedByMemberId,
        runId: run._id,
        targetDate: plan.targetDate,
        mealSlot: plan.mealSlot,
        contextLabel: plan.contextLabel,
        status: "approved",
        version: plan.version + 1,
        previousPlanId: plan._id,
        result: replacement,
      });
      await ctx.db.patch(plan._id, { status: "superseded", updatedAt: Date.now() });
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "substitute_or_replan",
        `Replace ${affectedItem.recipeName} after the cook reported ${interpretation.ingredientName} unavailable`,
        `Selected ${replacement.templateName} without interrupting the household user`,
      );
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "recalculate_nutrition",
        "Recalculate every affected ingredient and member portion",
        `Recalculated ${replacement.perServingNutrition.caloriesKcal} kcal and ${replacement.perServingNutrition.proteinG} g protein per serving equivalent`,
      );
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "update_shopping_list",
        "Persist the missing ingredient for later household shopping",
        `Added ${interpretation.ingredientName} to shopping-needed`,
      );
      const [cook, revisedItems] = await Promise.all([
        ctx.db.get(execution.cookMemberId),
        getCalculatedPlanItems(ctx, revisedPlanId),
      ]);
      if (!cook) throw new Error("Cook member was not found");
      const history = await ctx.db
        .query("tarlaMealHistory")
        .withIndex("by_household", (q) => q.eq("householdId", plan.householdId))
        .collect();
      await Promise.all(
        history
          .filter((entry) => entry.planId === plan._id && entry.active !== false)
          .map((entry) => ctx.db.patch(entry._id, { active: false })),
      );
      await ctx.db.insert("tarlaMealHistory", {
        householdId: plan.householdId,
        planId: revisedPlanId,
        targetDate: plan.targetDate,
        mealSlot: plan.mealSlot,
        templateId: replacement.templateId,
        recipeIds: revisedItems.map((item) => item.recipeId),
        ingredientKeys: replacement.ingredientKeys,
        active: true,
        source: "approved_plan",
        createdAt: Date.now(),
      });
      const restrictions = planning.members.flatMap((profile) =>
        profile.allergies.map(
          (allergy) => `${profile.name}: no ${allergy.replaceAll("_", " ")}`,
        ),
      );
      const revisedInstruction = composeCookInstruction({
        mealSlot: plan.mealSlot,
        totalServingEquivalents: replacement.totalServingEquivalents,
        items: revisedItems,
        memberNotes: planning.members
          .filter((profile) => profile.cookNotes)
          .map((profile) => ({ memberName: profile.name, note: profile.cookNotes! })),
        importantRestrictions: restrictions,
        preferredLanguage: endpoint.preferredLanguage ?? cook.languagePreference,
        revisedBecause: `${interpretation.ingredientName} is unavailable`,
      });
      const sent = await getMessageTransport(ctx).sendMessage({
        recipient: {
          memberId: String(cook._id),
          endpointId: String(endpoint._id),
          address: endpoint.address,
        },
        channel: endpoint.channel,
        message: revisedInstruction,
        metadata: {
          householdId: String(plan.householdId),
          runId: String(run._id),
          tarlaExecutionId: String(execution._id),
          mealPlanId: String(revisedPlanId),
          purpose: "revised_cook_instruction",
        },
      });
      const responseWindowMs = Math.max(
        1_000,
        (execution.expectedResponseBy ?? sent.timestamp + 4 * 60 * 60 * 1_000) -
          (execution.sentAt ?? sent.timestamp),
      );
      const expectedResponseBy = sent.timestamp + responseWindowMs;
      await ctx.db.patch(revisedPlanId, { status: "executing", updatedAt: Date.now() });
      await ctx.db.patch(execution._id, {
        planId: revisedPlanId,
        status: "revised_waiting",
        latestInstruction: revisedInstruction,
        revisedOutboundMessageId: sent.messageId,
        expectedResponseBy,
        unavailableIngredientKeys: [
          ...new Set([
            ...execution.unavailableIngredientKeys,
            interpretation.ingredientKey,
          ]),
        ],
        userEscalationRequired: false,
        updatedAt: Date.now(),
      });
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "send_revised_instruction",
        "Send one constraint-safe revised instruction through the shared transport",
        "Provider-neutral transport recorded the revised cook instruction request",
      );
      await addWaitingStep(
        ctx,
        run._id,
        order,
        "wait_for_cook_reply",
        "Wait for acknowledgement of the revised instruction",
      );
      await ctx.db.patch(run._id, {
        status: "waiting",
        outputSummary:
          "Missing ingredient resolved; revised instruction submitted without user interruption",
        updatedAt: Date.now(),
      });
      const timeoutJobId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(
        expectedResponseBy,
        internal.tarlaRuntime.handleCookResponseTimeout,
        { executionId: execution._id, expectedResponseBy },
      );
      await ctx.db.patch(execution._id, { responseTimeoutJobId: String(timeoutJobId) });
      return {
        signalId,
        matched: true,
        executionId: execution._id,
        state: "revised_waiting",
        revisedPlanId,
        replacementTemplateId: replacement.templateId,
        userEscalationRequired: false,
      };
    }

    if (interpretation.kind === "acknowledgement") {
      await ctx.db.patch(execution._id, {
        status: "acknowledged",
        userEscalationRequired: false,
        updatedAt: Date.now(),
      });
      await addCompletedStep(
        ctx,
        run._id,
        order,
        "complete",
        "Complete kitchen coordination after cook acknowledgement",
        "Cook acknowledged the instruction; no meal preparation was claimed",
      );
      await completeRun(
        ctx,
        run,
        "Cook acknowledged the instruction; execution coordination completed without claiming meal completion",
      );
      return {
        signalId,
        matched: true,
        executionId: execution._id,
        state: "acknowledged",
        userEscalationRequired: false,
      };
    }

    if (interpretation.kind === "recipe_question") {
      const items = await getCalculatedPlanItems(ctx, plan._id);
      const answer = composeRecipeQuestionReply(items[0].recipeId);
      await getMessageTransport(ctx).sendMessage({
        recipient: {
          memberId: String(endpoint.memberId),
          endpointId: String(endpoint._id),
          address: endpoint.address,
        },
        channel: endpoint.channel,
        message: answer,
        metadata: {
          householdId: String(plan.householdId),
          runId: String(run._id),
          tarlaExecutionId: String(execution._id),
          mealPlanId: String(plan._id),
          purpose: "cook_recipe_answer",
        },
      });
      await ctx.db.patch(execution._id, {
        status: "question_received",
        updatedAt: Date.now(),
      });
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "answer_recipe_question",
        "Answer an ordinary recipe question from the approved structured recipe",
        "Sent a concise recipe instruction; execution remains open",
      );
      await addWaitingStep(
        ctx,
        run._id,
        order,
        "wait_for_cook_reply",
        "Wait for the cook after answering the question",
      );
      await ctx.db.patch(run._id, {
        status: "waiting",
        outputSummary: "Cook question answered; execution remains open",
        updatedAt: Date.now(),
      });
      return {
        signalId,
        matched: true,
        executionId: execution._id,
        state: "question_received",
        userEscalationRequired: false,
      };
    }

    await ctx.db.patch(execution._id, {
      status: "unresolved",
      updatedAt: Date.now(),
    });
    await addWaitingStep(
      ctx,
      run._id,
      order,
      "wait_for_cook_reply",
      "Preserve the unresolved cook message and keep the execution linked",
    );
    await ctx.db.patch(run._id, {
      status: "waiting",
      outputSummary: "Cook signal did not complete the kitchen task",
      updatedAt: Date.now(),
    });
    return {
      signalId,
      matched: true,
      executionId: execution._id,
      state: "unresolved",
      userEscalationRequired: false,
    };
  },
});

async function handleDayExecutionSignal(
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
    messageId: string;
    endpoint: Doc<"communicationEndpoints">;
    execution: Doc<"tarlaExecutions">;
  },
) {
  const dayPlanId = normalized.execution.dayPlanId;
  if (!dayPlanId) throw new Error("Full-day execution is missing its day plan");
  const [dayPlan, run, visit, cook] = await Promise.all([
    ctx.db.get(dayPlanId),
    ctx.db.get(normalized.execution.runId),
    normalized.execution.cookVisitId
      ? ctx.db.get(normalized.execution.cookVisitId)
      : Promise.resolve(null),
    ctx.db.get(normalized.execution.cookMemberId),
  ]);
  if (!dayPlan || !run || !visit || !cook) {
    const signalId = await persistSignal(ctx, args, {
      dedupeKey: normalized.dedupeKey,
      channel: normalized.channel,
      senderAddress: normalized.senderAddress,
      endpoint: normalized.endpoint,
      executionId: normalized.execution._id,
      runId: normalized.execution.runId,
      matched: false,
    });
    return {
      signalId,
      matched: false,
      executionId: normalized.execution._id,
    };
  }

  // The exact source signal is durable before any kitchen interpretation runs.
  const signalId = await persistSignal(ctx, args, {
    dedupeKey: normalized.dedupeKey,
    channel: normalized.channel,
    senderAddress: normalized.senderAddress,
    endpoint: normalized.endpoint,
    executionId: normalized.execution._id,
    runId: run._id,
    matched: true,
  });
  await completeLatestWaitingStep(
    ctx,
    run._id,
    `Received normalized cook ${args.signalType} signal`,
  );
  let order = await nextStepOrder(ctx, run._id);
  order = await addWebhookTraceIfPresent(
    ctx,
    run._id,
    order,
    args.metadata,
    args.signalType,
  );
  await addCompletedStep(
    ctx,
    run._id,
    order++,
    "receive_cook_signal",
    "Accept a provider-neutral inbound cook signal",
    `Received ${args.signalType} signal ${normalized.messageId}`,
  );
  await addCompletedStep(
    ctx,
    run._id,
    order++,
    "persist_raw_signal",
    "Persist the exact source signal before interpretation",
    "Stored the unchanged cook signal",
  );
  const interpretation = interpretTarlaCookSignal({
    signalType: args.signalType,
    rawContent: args.rawContent,
  });
  await addCompletedStep(
    ctx,
    run._id,
    order++,
    "interpret_constraint",
    "Apply deterministic kitchen-signal interpretation",
    interpretation.summary,
  );
  await ctx.db.patch(normalized.execution._id, {
    latestInboundSignalId: signalId,
    updatedAt: Date.now(),
  });

  if (interpretation.kind === "missing_ingredient") {
    await markIngredientUnavailable(
      ctx,
      dayPlan.householdId,
      normalized.execution._id,
      interpretation.ingredientKey,
      interpretation.ingredientName,
    );
    const currentMeals = await loadDayMeals(ctx, dayPlan._id);
    const lockedMealSlots = new Set(normalized.execution.lockedMealSlots ?? []);
    const affectedMeals = currentMeals.filter(
      (meal) =>
        !lockedMealSlots.has(meal.join.mealSlot) &&
        meal.calculated.plan.ingredientKeys.includes(
          interpretation.ingredientKey,
        ),
    );
    if (affectedMeals.length === 0) {
      return leaveDayExecutionUnresolved(
        ctx,
        normalized.execution,
        run,
        order,
        interpretation.ingredientKey,
        "The reported item did not affect an unlocked meal in this visit",
      ).then((result) => ({ signalId, matched: true, ...result }));
    }

    const planning = await loadPlanningContext(
      ctx,
      dayPlan.householdId,
      dayPlan.memberDailyNutrition.map((member) => member.memberId),
    );
    const affectedSlots = new Set(
      affectedMeals.map((meal) => meal.join.mealSlot),
    );
    const protectedTemplates = currentMeals
      .filter((meal) => !affectedSlots.has(meal.join.mealSlot))
      .map((meal) => meal.calculated.plan.templateId);
    const revisedMeals = [];
    const mealPlanIds = new Map<string, Id<"tarlaMealPlans">>();
    try {
      for (const current of currentMeals) {
        if (!affectedSlots.has(current.join.mealSlot)) {
          revisedMeals.push(current.calculated);
          mealPlanIds.set(current.join.mealSlot, current.mealPlan._id);
          continue;
        }
        const eaters = planning.members.filter((member) =>
          current.calculated.eaterMemberIds.includes(member.memberId),
        );
        const replacement = planMeal({
          targetDate: dayPlan.targetDate,
          mealSlot: current.join.mealSlot,
          members: eaters,
          rules: planning.rules,
          history: planning.history,
          memory: [
            ...planning.memory,
            ...protectedTemplates.map((templateId) => ({
              key: `avoid_template:${templateId}`,
              value: "Keep unaffected meals stable while replacing a missing ingredient",
            })),
            ...revisedMeals.map((meal) => ({
              key: `avoid_template:${meal.plan.templateId}`,
              value: "Avoid a duplicate within the revised day",
            })),
          ],
          inventory: planning.inventory,
          enforceNutritionTargets: false,
        });
        const replacementPlanId = await insertMealPlan(ctx, {
          householdId: dayPlan.householdId,
          requestedByMemberId: dayPlan.requestedByMemberId,
          runId: run._id,
          targetDate: dayPlan.targetDate,
          mealSlot: current.join.mealSlot,
          contextLabel: "full_day_missing_ingredient_replacement",
          status: "executing",
          version: current.mealPlan.version + 1,
          previousPlanId: current.mealPlan._id,
          result: replacement,
        });
        await ctx.db.patch(current.mealPlan._id, {
          status: "superseded",
          updatedAt: Date.now(),
        });
        revisedMeals.push({
          mealSlot: current.join.mealSlot,
          eaterMemberIds: current.calculated.eaterMemberIds,
          plan: replacement,
        });
        mealPlanIds.set(current.join.mealSlot, replacementPlanId);
        protectedTemplates.push(replacement.templateId);
      }
    } catch {
      return leaveDayExecutionUnresolved(
        ctx,
        normalized.execution,
        run,
        order,
        interpretation.ingredientKey,
        "No valid replacement satisfied all known household constraints",
      ).then((result) => ({ signalId, matched: true, ...result }));
    }

    const result = summarizeDayMeals(revisedMeals, planning.members);
    const revisedDayPlanId = await insertDayPlanFromMeals(ctx, {
      householdId: dayPlan.householdId,
      requestedByMemberId: dayPlan.requestedByMemberId,
      runId: run._id,
      seriesId: dayPlan.seriesId,
      targetDate: dayPlan.targetDate,
      status: "executing",
      version: dayPlan.version + 1,
      previousDayPlanId: dayPlan._id,
      result,
      mealPlanIds,
      lockedMealSlots,
    });
    await ctx.db.patch(dayPlan._id, {
      status: "superseded",
      updatedAt: Date.now(),
    });
    const revisedDayPlan = await ctx.db.get(revisedDayPlanId);
    if (!revisedDayPlan) throw new Error("Revised full-day plan was not found");
    await activateDayPlanHistory(ctx, revisedDayPlan);
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "substitute_or_replan",
      `Replace ${interpretation.ingredientName} only in affected unlocked meals`,
      `Replanned ${affectedMeals.map((meal) => meal.join.mealSlot).join(", ")} without interrupting the household user`,
    );
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "recalculate_nutrition",
      "Recalculate affected meals and the remaining full-day nutrition",
      "Updated per-meal nutrition, daily totals, and target variance",
    );
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "update_shopping_list",
      "Persist the unavailable ingredient for later shopping",
      `Added ${interpretation.ingredientName} to shopping-needed`,
    );
    const visitMeals = result.meals.filter((meal) =>
      visit.mealSlots.includes(meal.mealSlot),
    );
    const revisedInstruction = composeDayCookInstruction({
      visitLabel: visit.label,
      targetDate: dayPlan.targetDate,
      meals: visitMeals,
      memberNotes: planning.members
        .filter((member) => member.cookNotes)
        .map((member) => ({ memberName: member.name, note: member.cookNotes! })),
      importantRestrictions: planning.members.flatMap((member) =>
        member.allergies.map(
          (allergy) => `${member.name}: no ${allergy.replaceAll("_", " ")}`,
        ),
      ),
      revisedBecause: `${interpretation.ingredientName} is unavailable`,
    });
    const sent = await getMessageTransport(ctx).sendMessage({
      recipient: {
        memberId: String(cook._id),
        endpointId: String(normalized.endpoint._id),
        address: normalized.endpoint.address,
      },
      channel: normalized.endpoint.channel,
      message: revisedInstruction,
      metadata: {
        householdId: String(dayPlan.householdId),
        runId: String(run._id),
        tarlaExecutionId: String(normalized.execution._id),
        dayPlanId: String(revisedDayPlanId),
        cookVisitId: String(visit._id),
        purpose: "revised_day_cook_instruction",
      },
    });
    const responseWindowMs = Math.max(
      1_000,
      (normalized.execution.expectedResponseBy ??
        sent.timestamp + 4 * 60 * 60 * 1_000) -
        (normalized.execution.sentAt ?? sent.timestamp),
    );
    const expectedResponseBy = sent.timestamp + responseWindowMs;
    await ctx.db.patch(normalized.execution._id, {
      dayPlanId: revisedDayPlanId,
      status: "revised_waiting",
      latestInstruction: revisedInstruction,
      revisedOutboundMessageId: sent.messageId,
      expectedResponseBy,
      unavailableIngredientKeys: [
        ...new Set([
          ...normalized.execution.unavailableIngredientKeys,
          interpretation.ingredientKey,
        ]),
      ],
      userEscalationRequired: false,
      updatedAt: Date.now(),
    });
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "send_revised_instruction",
      "Send the visit's revised instruction through the shared transport",
      "Provider-neutral transport recorded the revised full-day cook instruction request",
    );
    await addWaitingStep(
      ctx,
      run._id,
      order,
      "wait_for_cook_reply",
      "Wait for acknowledgement of the revised instruction",
    );
    await ctx.db.patch(run._id, {
      status: "waiting",
      outputSummary:
        "Missing ingredient resolved; full-day totals updated and revised instruction submitted",
      updatedAt: Date.now(),
    });
    const timeoutJobId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(
      expectedResponseBy,
      internal.tarlaRuntime.handleCookResponseTimeout,
      {
        executionId: normalized.execution._id,
        expectedResponseBy,
      },
    );
    await ctx.db.patch(normalized.execution._id, {
      responseTimeoutJobId: String(timeoutJobId),
    });
    return {
      signalId,
      matched: true,
      executionId: normalized.execution._id,
      state: "revised_waiting",
      revisedDayPlanId,
      affectedMealSlots: [...affectedSlots],
      userEscalationRequired: false,
    };
  }

  if (interpretation.kind === "acknowledgement") {
    await ctx.db.patch(normalized.execution._id, {
      status: "acknowledged",
      userEscalationRequired: false,
      updatedAt: Date.now(),
    });
    await addCompletedStep(
      ctx,
      run._id,
      order,
      "complete",
      "Complete kitchen coordination after cook acknowledgement",
      "Cook acknowledged the visit instruction; no meal completion was claimed",
    );
    await completeRun(
      ctx,
      run,
      "Cook acknowledged the full-day visit instruction without claiming meal completion",
    );
    return {
      signalId,
      matched: true,
      executionId: normalized.execution._id,
      state: "acknowledged",
      userEscalationRequired: false,
    };
  }

  await ctx.db.patch(normalized.execution._id, {
    status: interpretation.kind === "recipe_question" ? "question_received" : "unresolved",
    updatedAt: Date.now(),
  });
  await addWaitingStep(
    ctx,
    run._id,
    order,
    "wait_for_cook_reply",
    "Keep the exact cook message linked without inventing task completion",
  );
  await ctx.db.patch(run._id, {
    status: "waiting",
    outputSummary: "Cook signal preserved; the full-day execution remains open",
    updatedAt: Date.now(),
  });
  return {
    signalId,
    matched: true,
    executionId: normalized.execution._id,
    state:
      interpretation.kind === "recipe_question" ? "question_received" : "unresolved",
    userEscalationRequired: false,
  };
}

async function leaveDayExecutionUnresolved(
  ctx: MutationCtx,
  execution: Doc<"tarlaExecutions">,
  run: Doc<"agentRuns">,
  order: number,
  ingredientKey: string,
  reason: string,
) {
  await ctx.db.patch(execution._id, {
    status: "unresolved",
    userEscalationRequired: true,
    unavailableIngredientKeys: [
      ...new Set([...execution.unavailableIngredientKeys, ingredientKey]),
    ],
    updatedAt: Date.now(),
  });
  await addWaitingStep(
    ctx,
    run._id,
    order,
    "wait_for_user_approval",
    reason,
  );
  await ctx.db.patch(run._id, {
    status: "waiting",
    outputSummary: `${reason}; household-user decision is required`,
    updatedAt: Date.now(),
  });
  return {
    executionId: execution._id,
    state: "unresolved" as const,
    userEscalationRequired: true,
  };
}

async function markIngredientUnavailable(
  ctx: MutationCtx,
  householdId: Id<"households">,
  executionId: Id<"tarlaExecutions">,
  ingredientKey: string,
  ingredientName: string,
) {
  const now = Date.now();
  const inventory = await ctx.db
    .query("tarlaInventoryItems")
    .withIndex("by_household_and_ingredient", (q) =>
      q.eq("householdId", householdId).eq("ingredientKey", ingredientKey),
    )
    .unique();
  if (inventory) {
    await ctx.db.patch(inventory._id, {
      availability: "unavailable",
      source: "cook",
      lastConfirmedAt: now,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("tarlaInventoryItems", {
      householdId,
      ingredientKey,
      item: ingredientName,
      availability: "unavailable",
      source: "cook",
      lastConfirmedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
  const shopping = await ctx.db
    .query("shoppingNeededItems")
    .withIndex("by_household_and_ingredient", (q) =>
      q.eq("householdId", householdId).eq("ingredientKey", ingredientKey),
    )
    .collect();
  const existingNeeded = shopping.find((item) => item.status === "needed");
  const ingredient = getIngredient(ingredientKey);
  if (existingNeeded) {
    await ctx.db.patch(existingNeeded._id, {
      tarlaExecutionId: executionId,
      reason: "Cook reported this ingredient unavailable for an approved meal",
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("shoppingNeededItems", {
      householdId,
      tarlaExecutionId: executionId,
      ingredientKey,
      item: ingredient.name,
      reason: "Cook reported this ingredient unavailable for an approved meal",
      source: "cook_missing_ingredient",
      status: "needed",
      addedAt: now,
      updatedAt: now,
    });
  }
}

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
    executionId?: Id<"tarlaExecutions">;
    runId?: Id<"agentRuns">;
    matched: boolean;
  },
) {
  return ctx.db.insert("inboundSignals", {
    dedupeKey: normalized.dedupeKey,
    householdId: normalized.endpoint?.householdId,
    memberId: normalized.endpoint?.memberId,
    communicationEndpointId: normalized.endpoint?._id,
    tarlaExecutionId: normalized.executionId,
    runId: normalized.runId,
    agent: "tarla",
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

async function addWebhookTraceIfPresent(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  initialOrder: number,
  metadata:
    | {
        provider?: string;
        webhookReceivedAt?: number;
        webhookValidatedAt?: number;
      }
    | undefined,
  inboundSignalType: "text" | "reaction" | "acknowledgement",
) {
  if (
    !metadata?.provider ||
    metadata.webhookReceivedAt === undefined ||
    metadata.webhookValidatedAt === undefined
  ) {
    return initialOrder;
  }
  let order = initialOrder;
  await addCompletedStep(
    ctx,
    runId,
    order++,
    "receive_webhook",
    "Receive a provider webhook through the shared transport gateway",
    `Received a ${metadata.provider} inbound event`,
  );
  await addCompletedStep(
    ctx,
    runId,
    order++,
    "validate_webhook",
    "Require provider authentication before routing household data",
    "Provider signature and account context were validated",
  );
  await addCompletedStep(
    ctx,
    runId,
    order++,
    "normalize_signal",
    "Convert the provider payload to the Vesta inbound contract",
    `Normalized ${inboundSignalType} cook signal`,
  );
  return order;
}

function requiredText(value: string, label: string, maxLength: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return clean;
}
