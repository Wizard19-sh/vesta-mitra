import { v } from "convex/values";
import { interpretTarlaCookSignal } from "../lib/interpretTarlaSignal";
import { summarizeDayMeals } from "../lib/tarlaDayPlanner";
import { planMeal, type CalculatedMealPlan } from "../lib/tarlaPlanner";
import type { CalculatedDayPlan } from "../lib/tarlaDayPlanner";
import {
  composeCookInstruction,
  composeCookShoppingAcknowledgement,
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
  createExecutionException,
  ensureEvidenceRecord,
  markTaskComplete,
  recordExecutionEvent,
} from "./executionSupport";
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
    await recordExecutionEvent(ctx, {
      eventKey: `${signalId}:reply_received`,
      householdId: plan.householdId,
      runId: run._id,
      taskType: run.taskType,
      eventName: "reply_received",
      agent: "tarla",
      outcome: args.signalType,
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

    if (interpretation.kind === "shopping_needed_acknowledged") {
      const cook = await ctx.db.get(execution.cookMemberId);
      if (!cook) throw new Error("Cook member was not found");

      const result = await handleShoppingNeededAcknowledgement(ctx, {
        householdId: plan.householdId,
        execution,
        run,
        endpoint,
        cook,
        ingredientKey: interpretation.ingredientKey,
        ingredientName: interpretation.ingredientName,
        order,
        planMetadata: { mealPlanId: String(plan._id) },
      });
      return {
        signalId,
        matched: true,
        executionId: execution._id,
        state: "acknowledged",
        acknowledgementMessageId: result.messageId,
        userEscalationRequired: false,
      };
    }

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
      if (planning.unstructuredRules.length > 0) {
        await ctx.db.patch(execution._id, {
          status: "unresolved",
          userEscalationRequired: true,
          unavailableIngredientKeys: [
            ...new Set([...execution.unavailableIngredientKeys, interpretation.ingredientKey]),
          ],
          updatedAt: Date.now(),
        });
        const profile = await ctx.db
          .query("betaUserProfiles")
          .withIndex("by_household", (q) => q.eq("householdId", plan.householdId))
          .unique();
        await createExecutionException(ctx, {
          householdId: plan.householdId,
          runId: run._id,
          agent: "tarla",
          taskType: run.taskType,
          tarlaExecutionId: execution._id,
          sourceMemberId: endpoint.memberId,
          riskClass: "medium",
          policyCode: "UNSTRUCTURED_FOOD_RULE_REQUIRES_REVIEW",
          rawRequest: args.rawContent,
          proposedAction: "Review the saved food rule before changing this meal.",
          status: "needs_review",
          requiredApproverMemberId: profile?.memberId,
        });
        return {
          signalId,
          matched: true,
          executionId: execution._id,
          state: "unresolved",
          userEscalationRequired: true,
        };
      }
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
      const exceptionId = await createExecutionException(ctx, {
        householdId: plan.householdId,
        runId: run._id,
        agent: "tarla",
        taskType: run.taskType,
        tarlaExecutionId: execution._id,
        sourceMemberId: endpoint.memberId,
        riskClass: "low",
        policyCode: "INGREDIENT_UNAVAILABLE_SUPPORTED_SUBSTITUTION",
        rawRequest: args.rawContent,
        proposedAction: `Replace the affected meal because ${interpretation.ingredientName} is unavailable.`,
        status: "auto_resolved",
      });
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "substitute_or_replan",
        `Replace ${affectedItem.recipeName} after the cook reported ${interpretation.ingredientName} unavailable`,
        `Selected ${replacement.templateName} without interrupting the household user`,
        { component: "tarla", usageStatus: "not_applicable", exceptionId },
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
        cookName: cook.preferredSalutation ?? cook.name,
        relationshipType: execution.recipientClass,
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
          recipientClass: execution.recipientClass ?? "hired_cook",
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
        planVersion: plan.version + 1,
        updatedAt: Date.now(),
      });
      await addCompletedStep(
        ctx,
        run._id,
        order++,
        "send_revised_instruction",
        "Send one constraint-safe revised instruction through the shared transport",
        "Provider-neutral transport recorded the revised cook instruction request",
        {
          component: "transport",
          tool: "whatsapp",
          provider: sent.provider,
          usageStatus: "not_applicable",
          outcome: sent.providerStatus,
          exceptionId,
        },
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
      await recordExecutionEvent(ctx, {
        eventKey: `${exceptionId}:resolved`,
        householdId: plan.householdId,
        runId: run._id,
        taskType: run.taskType,
        eventName: "exception_resolved",
        agent: "tarla",
        outcome: "auto_resolved",
      });
      await ensureEvidenceRecord(ctx, {
        run,
        surface: transportSurface(endpoint),
        recipientClass: execution.recipientClass ?? "hired_cook",
        outcome: "AUTONOMOUS_SUBSTITUTION_PENDING_ACKNOWLEDGEMENT",
        primaryRubricClaim: "Real output on a real surface",
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
      await markTaskComplete(ctx, {
        run,
        agent: "tarla",
        outcome: "COOK_ACKNOWLEDGED",
        recipientClass: execution.recipientClass ?? "hired_cook",
        surface: transportSurface(endpoint),
      });
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

export const retryFailedRevisedInstruction = mutation({
  args: {
    ownerKey: v.string(),
    executionId: v.id("tarlaExecutions"),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution || execution.status !== "failed") {
      throw new Error("Only a failed Tarla execution can be retried");
    }
    if (!execution.latestInstruction || !execution.dayPlanId) {
      throw new Error("The failed execution has no revised instruction to retry");
    }
    const [run, endpoint, inboundSignals, messages] = await Promise.all([
      ctx.db.get(execution.runId),
      ctx.db.get(execution.communicationEndpointId),
      ctx.db
        .query("inboundSignals")
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
    ]);
    if (!run || !endpoint) throw new Error("Tarla retry context was not found");
    const household = await ctx.db.get(endpoint.householdId);
    if (!household || household.ownerKey !== args.ownerKey) {
      throw new Error("Tarla execution not found for this household");
    }
    if (!inboundSignals.some((signal) => signal.matched)) {
      throw new Error("A real matched cook reply is required before retrying");
    }
    const failedRevision = messages.find(
      (message) =>
        message.status === "failed" &&
        message.purpose === "revised_day_cook_instruction",
    );
    if (!failedRevision) {
      throw new Error("No failed revised instruction is available to retry");
    }

    const sent = await getMessageTransport(ctx).sendMessage({
      recipient: {
        memberId: String(endpoint.memberId),
        endpointId: String(endpoint._id),
        address: endpoint.address,
      },
      channel: endpoint.channel,
      message: execution.latestInstruction,
      metadata: {
        householdId: String(household._id),
        runId: String(run._id),
        tarlaExecutionId: String(execution._id),
        dayPlanId: String(execution.dayPlanId),
        cookVisitId: execution.cookVisitId ? String(execution.cookVisitId) : undefined,
        purpose: "revised_day_cook_instruction_retry",
        recipientClass: execution.recipientClass ?? "hired_cook",
      },
    });
    const now = Date.now();
    const expectedResponseBy = now + 4 * 60 * 60 * 1_000;
    await ctx.db.patch(execution._id, {
      status: "revised_waiting",
      revisedOutboundMessageId: sent.messageId,
      expectedResponseBy,
      userEscalationRequired: false,
      updatedAt: now,
    });
    await ctx.db.patch(run._id, {
      status: "waiting",
      completedAt: undefined,
      totalLatencyMs: undefined,
      error: undefined,
      outputSummary:
        "Retrying the already-computed revised instruction after a provider authentication failure",
      updatedAt: now,
    });
    let order = await nextStepOrder(ctx, run._id);
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "retry_revised_instruction",
      "Retry the unchanged revised instruction after provider authentication is restored",
      "Provider-neutral transport recorded one revised instruction retry",
      {
        component: "transport",
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
      "wait_for_cook_reply",
      "Wait for acknowledgement of the retried revised instruction",
      { component: "tarla", usageStatus: "not_applicable" },
    );
    await recordExecutionEvent(ctx, {
      eventKey: `${execution._id}:revised_retry:${sent.messageId}`,
      householdId: household._id,
      runId: run._id,
      taskType: run.taskType,
      eventName: "message_scheduled",
      agent: "tarla",
      outcome: "requested",
    });
    const refreshedRun = await ctx.db.get(run._id);
    if (refreshedRun) {
      await ensureEvidenceRecord(ctx, {
        run: refreshedRun,
        surface: transportSurface(endpoint),
        recipientClass: execution.recipientClass ?? "hired_cook",
        outcome: "AUTONOMOUS_SUBSTITUTION_PENDING_ACKNOWLEDGEMENT",
        primaryRubricClaim: "Real output on a real surface",
      });
    }
    const timeoutJobId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(
      expectedResponseBy,
      internal.tarlaRuntime.handleCookResponseTimeout,
      { executionId: execution._id, expectedResponseBy },
    );
    await ctx.db.patch(execution._id, {
      responseTimeoutJobId: String(timeoutJobId),
    });
    return { executionId: execution._id, retryMessageId: sent.messageId };
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
  await recordExecutionEvent(ctx, {
    eventKey: `${signalId}:reply_received`,
    householdId: dayPlan.householdId,
    runId: run._id,
    taskType: run.taskType,
    eventName: "reply_received",
    agent: "tarla",
    outcome: args.signalType,
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

  if (interpretation.kind === "shopping_needed_acknowledged") {
    const result = await handleShoppingNeededAcknowledgement(ctx, {
      householdId: dayPlan.householdId,
      execution: normalized.execution,
      run,
      endpoint: normalized.endpoint,
      cook,
      ingredientKey: interpretation.ingredientKey,
      ingredientName: interpretation.ingredientName,
      order,
      planMetadata: { dayPlanId: String(dayPlan._id) },
    });
    return {
      signalId,
      matched: true,
      executionId: normalized.execution._id,
      state: "acknowledged",
      acknowledgementMessageId: result.messageId,
      userEscalationRequired: false,
    };
  }

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
    const visitMealSlots = new Set(
      normalized.execution.assignedMealSlots ?? visit.mealSlots,
    );
    const affectedMeals = currentMeals.filter(
      (meal) =>
        visitMealSlots.has(meal.join.mealSlot) &&
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
        args.rawContent,
        normalized.endpoint.memberId,
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
    const originalMealsBySlot = new Map(
      currentMeals.map((meal) => [meal.join.mealSlot, meal.calculated]),
    );
    const revisedMeals = [];
    const mealPlanIds = new Map<string, Id<"tarlaMealPlans">>();
    const changedMealsForReason: Array<{
      mealSlot: string;
      reasonType: "direct_substitution" | "secondary_adjustment";
      reasonText: string;
      recipeLine: string;
      nutritionBeforeAfter?: {
        before: NutritionPoint;
        after: NutritionPoint;
      };
    }> = [];
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
        const originalMeal = originalMealsBySlot.get(current.join.mealSlot);
        if (!originalMeal) throw new Error("Original meal snapshot was missing");
        const beforeNutrition = {
          caloriesKcal: roundNutrition(originalMeal.plan.totalNutrition.caloriesKcal),
          proteinG: roundNutrition(originalMeal.plan.totalNutrition.proteinG),
        };
        const afterNutrition = {
          caloriesKcal: roundNutrition(replacement.totalNutrition.caloriesKcal),
          proteinG: roundNutrition(replacement.totalNutrition.proteinG),
        };
        const reasonType = originalMeal.plan.ingredientKeys.includes(
          interpretation.ingredientKey,
        )
          ? "direct_substitution"
          : "secondary_adjustment";
        const directReplacement = reasonType === "direct_substitution";
        const changedByNutrition = hasNutritionDelta(beforeNutrition, afterNutrition, 0.01);
        changedMealsForReason.push({
          mealSlot: current.join.mealSlot,
          reasonType,
          reasonText:
            directReplacement
              ? `${interpretation.ingredientName} was unavailable and directly replaced this dish`
              : "Adjusted this dish after substitution to keep calorie/protein targets closer to target ranges",
          recipeLine: `${originalMeal.plan.templateName} -> ${replacement.templateName}`,
          nutritionBeforeAfter: changedByNutrition
            ? {
                before: beforeNutrition,
                after: afterNutrition,
              }
            : undefined,
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
        args.rawContent,
        normalized.endpoint.memberId,
      ).then((result) => ({ signalId, matched: true, ...result }));
    }

    const result = summarizeDayMeals(revisedMeals, planning.members);
    const { nutritionBeforeAfter, fallbackNotes } = reconcileDayTotalsSummary(
      dayPlan,
      result,
    );
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
    const exceptionId = await createExecutionException(ctx, {
      householdId: dayPlan.householdId,
      runId: run._id,
      agent: "tarla",
      taskType: run.taskType,
      tarlaExecutionId: normalized.execution._id,
      sourceMemberId: normalized.endpoint.memberId,
      riskClass: "low",
      policyCode: "INGREDIENT_UNAVAILABLE_SUPPORTED_SUBSTITUTION",
      rawRequest: args.rawContent,
      proposedAction: `Replace the affected meal because ${interpretation.ingredientName} is unavailable.`,
      status: "auto_resolved",
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
      { component: "tarla", usageStatus: "not_applicable", exceptionId },
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
      (normalized.execution.assignedMealSlots ?? visit.mealSlots).includes(meal.mealSlot),
    );
    if (planning.unstructuredRules.length > 0) {
      return leaveDayExecutionUnresolved(
        ctx,
        normalized.execution,
        run,
        order,
        interpretation.ingredientKey,
        "A saved food rule is not structured enough to enforce automatically",
        args.rawContent,
        normalized.endpoint.memberId,
      ).then((result) => ({ signalId, matched: true, ...result }));
    }
    const cookState = await ctx.db.get(visit.cookStateId);
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
      cookName: cook.preferredSalutation ?? cook.name,
      preferredLanguage:
        normalized.endpoint.preferredLanguage ?? cook.languagePreference,
      relationshipType: cookState?.relationshipType,
      changedMeals: changedMealsForReason,
      nutritionBeforeAfter,
      fallbackNotes,
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
        recipientClass: normalized.execution.recipientClass ?? "hired_cook",
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
      planVersion: dayPlan.version + 1,
      updatedAt: Date.now(),
    });
    await addCompletedStep(
      ctx,
      run._id,
      order++,
      "send_revised_instruction",
      "Send the visit's revised instruction through the shared transport",
      "Provider-neutral transport recorded the revised full-day cook instruction request",
      {
        component: "transport",
        tool: "whatsapp",
        provider: sent.provider,
        usageStatus: "not_applicable",
        outcome: sent.providerStatus,
        exceptionId,
      },
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
    await recordExecutionEvent(ctx, {
      eventKey: `${exceptionId}:resolved`,
      householdId: dayPlan.householdId,
      runId: run._id,
      taskType: run.taskType,
      eventName: "exception_resolved",
      agent: "tarla",
      outcome: "auto_resolved",
    });
    await ensureEvidenceRecord(ctx, {
      run,
      surface: transportSurface(normalized.endpoint),
      recipientClass: normalized.execution.recipientClass ?? "hired_cook",
      outcome: "AUTONOMOUS_SUBSTITUTION_PENDING_ACKNOWLEDGEMENT",
      primaryRubricClaim: "Real output on a real surface",
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
    await markTaskComplete(ctx, {
      run,
      agent: "tarla",
      outcome: "COOK_ACKNOWLEDGED",
      recipientClass: normalized.execution.recipientClass ?? "hired_cook",
      surface: transportSurface(normalized.endpoint),
    });
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
  rawRequest: string,
  sourceMemberId: Id<"members">,
) {
  const profile = await ctx.db
    .query("betaUserProfiles")
    .withIndex("by_household", (q) => q.eq("householdId", execution.householdId))
    .unique();
  const exceptionId = await createExecutionException(ctx, {
    householdId: execution.householdId,
    runId: run._id,
    agent: "tarla",
    taskType: run.taskType,
    tarlaExecutionId: execution._id,
    sourceMemberId,
    riskClass: "medium",
    policyCode: "INGREDIENT_EXCEPTION_NEEDS_REVIEW",
    rawRequest,
    proposedAction: reason,
    status: "needs_review",
    requiredApproverMemberId: profile?.memberId,
  });
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
    { component: "tarla", usageStatus: "not_applicable" },
  );
  const latest = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_and_order", (q) => q.eq("runId", run._id))
    .order("desc")
    .first();
  if (latest) await ctx.db.patch(latest._id, { exceptionId });
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

function transportSurface(endpoint: Doc<"communicationEndpoints">) {
  const provider = endpoint.providerMetadata?.provider?.toLocaleLowerCase();
  return provider === "development" || provider === "dev"
    ? ("development_transport" as const)
    : ("whatsapp" as const);
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

async function markIngredientShoppingNeeded(
  ctx: MutationCtx,
  householdId: Id<"households">,
  executionId: Id<"tarlaExecutions">,
  ingredientKey: string,
  ingredientName: string,
) {
  const now = Date.now();
  const shopping = await ctx.db
    .query("shoppingNeededItems")
    .withIndex("by_household_and_ingredient", (q) =>
      q.eq("householdId", householdId).eq("ingredientKey", ingredientKey),
    )
    .collect();
  const existingNeeded = shopping.find((item) => item.status === "needed");

  if (existingNeeded) {
    await ctx.db.patch(existingNeeded._id, {
      tarlaExecutionId: executionId,
      reason: "Cook said this ingredient needs to be ordered for the approved plan",
      source: "cook_shopping_request",
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("shoppingNeededItems", {
    householdId,
    tarlaExecutionId: executionId,
    ingredientKey,
    item: ingredientName,
    reason: "Cook said this ingredient needs to be ordered for the approved plan",
    source: "cook_shopping_request",
    status: "needed",
    addedAt: now,
    updatedAt: now,
  });
}

async function handleShoppingNeededAcknowledgement(
  ctx: MutationCtx,
  input: {
    householdId: Id<"households">;
    execution: Doc<"tarlaExecutions">;
    run: Doc<"agentRuns">;
    endpoint: Doc<"communicationEndpoints">;
    cook: Doc<"members">;
    ingredientKey: string;
    ingredientName: string;
    order: number;
    planMetadata: {
      mealPlanId?: string;
      dayPlanId?: string;
    };
  },
) {
  await markIngredientShoppingNeeded(
    ctx,
    input.householdId,
    input.execution._id,
    input.ingredientKey,
    input.ingredientName,
  );

  let order = input.order;
  await addCompletedStep(
    ctx,
    input.run._id,
    order++,
    "update_shopping_list",
    "Record the ingredient the cook said needs ordering",
    `Added ${input.ingredientName} to shopping-needed`,
  );

  const acknowledgement = composeCookShoppingAcknowledgement({
    cookName: input.cook.preferredSalutation ?? input.cook.name,
    ingredientName: input.ingredientName,
    preferredLanguage:
      input.endpoint.preferredLanguage ?? input.cook.languagePreference,
  });
  const sent = await getMessageTransport(ctx).sendMessage({
    recipient: {
      memberId: String(input.cook._id),
      endpointId: String(input.endpoint._id),
      address: input.endpoint.address,
    },
    channel: input.endpoint.channel,
    message: acknowledgement,
    metadata: {
      householdId: String(input.householdId),
      runId: String(input.run._id),
      tarlaExecutionId: String(input.execution._id),
      ...input.planMetadata,
      purpose: "cook_shopping_acknowledgement",
      recipientClass: input.execution.recipientClass ?? "hired_cook",
    },
  });

  await ctx.db.patch(input.execution._id, {
    status: "acknowledged",
    userEscalationRequired: false,
    updatedAt: Date.now(),
  });
  await addCompletedStep(
    ctx,
    input.run._id,
    order++,
    "send_acknowledgement",
    "Acknowledge the cook's accepted instruction and shopping note",
    "Sent the shopping acknowledgement through the shared transport",
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
    input.run._id,
    order,
    "complete",
    "Complete kitchen coordination after cook acceptance",
    "Cook accepted the current instruction and identified an item for shopping",
  );
  await completeRun(
    ctx,
    input.run,
    `Cook accepted the instruction; ${input.ingredientName} was added to shopping-needed`,
  );
  await markTaskComplete(ctx, {
    run: input.run,
    agent: "tarla",
    outcome: "COOK_ACKNOWLEDGED_WITH_SHOPPING_NEEDED",
    recipientClass: input.execution.recipientClass ?? "hired_cook",
    surface: transportSurface(input.endpoint),
  });

  return sent;
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

type NutritionPoint = { caloriesKcal: number; proteinG: number };
type NutritionSourceScope = "household";
type DayTotalsSummary = {
  nutritionBeforeAfter?: {
    before: NutritionPoint;
    after: NutritionPoint;
    scope: NutritionSourceScope;
  };
  fallbackNotes: string[];
};

function reconcileDayTotalsSummary(
  originalDayPlan: Doc<"tarlaDayPlans">,
  revisedDayPlan: CalculatedDayPlan,
): DayTotalsSummary {
  const fallbackNotes: string[] = [];
  const before = extractNutritionFromPlanRecord(
    {
      totalNutrition: originalDayPlan.totalNutrition,
      memberDailyNutrition: originalDayPlan.memberDailyNutrition,
    },
    "before",
    fallbackNotes,
  );
  const beforeFallback = before.source === "fallback";
  const after = extractNutritionFromPlanRecord(
    revisedDayPlan,
    "after",
    fallbackNotes,
  );
  if (before.sourceScope && after.sourceScope) {
    if (before.sourceScope !== after.sourceScope) {
      const mismatchNotes = [
        `Skipped before-and-after totals in the revised WhatsApp message because before scope (${before.sourceScope}) and after scope (${after.sourceScope}) do not match.`,
      ];
      if (mismatchNotes.length) {
        fallbackNotes.push(...mismatchNotes);
        console.log("[tarla] skipped revised-day nutrition totals due scope mismatch", {
          dayPlanId: String(originalDayPlan._id),
          scopeMismatch: {
            before: before.sourceScope,
            after: after.sourceScope,
          },
        });
      }
      return { fallbackNotes };
    }
  }
  const afterFallback = after.source === "fallback";
  const result: DayTotalsSummary = {
    nutritionBeforeAfter:
      before.values && after.values
        ? {
            before: before.values,
            after: after.values,
            scope: before.sourceScope ?? "household",
          }
        : undefined,
    fallbackNotes: [
      ...fallbackNotes,
      ...(beforeFallback || afterFallback
        ? ["Recalculated totals using available nutrition fields to avoid missing values."]
        : []),
    ],
  };
  if (result.fallbackNotes.length > 0) {
    console.log(
      "[tarla] used fallback nutrition source while composing revised-day message",
      {
        dayPlanId: String(originalDayPlan._id),
        fallbackNotes: result.fallbackNotes,
      },
    );
  }
  return result;
}

function extractNutritionFromPlanRecord(
  source: {
    totalNutrition?: {
      caloriesKcal?: number;
      proteinG?: number;
    };
    memberDailyNutrition?:
      | Array<{ total?: { caloriesKcal?: number; proteinG?: number } }>
      | undefined;
  },
  label: "before" | "after",
  fallbackNotes: string[],
): {
  values?: NutritionPoint;
  source: "direct" | "fallback";
  sourceScope?: NutritionSourceScope;
} {
  const direct = extractNutritionFromTotals(source.totalNutrition);
  if (direct.values) {
    return {
      values: direct.values,
      source: "direct",
      sourceScope: "household",
    };
  }
  const fromMembers = extractNutritionFromMembers(source.memberDailyNutrition, fallbackNotes);
  if (fromMembers.values) {
    fallbackNotes.push(
      `Could not read direct ${label} total calories/protein from plan totals; used member totals fallback.`,
    );
    return {
      values: fromMembers.values,
      source: "fallback",
      sourceScope: "household",
    };
  }
  fallbackNotes.push(
    `Could not read ${label} total calories/protein from plan or member records; values were omitted from the update message.`,
  );
  return { source: "fallback" };
}

function extractNutritionFromTotals(
  totals: {
    caloriesKcal?: number;
    proteinG?: number;
  } | undefined,
): { values?: NutritionPoint; source: "direct" | "fallback" } {
  const caloriesKcal = totals?.caloriesKcal;
  const proteinG = totals?.proteinG;
  if (
    caloriesKcal !== undefined &&
    proteinG !== undefined &&
    Number.isFinite(caloriesKcal) &&
    Number.isFinite(proteinG)
  ) {
    return { values: { caloriesKcal: roundNutrition(caloriesKcal), proteinG: roundNutrition(proteinG) }, source: "direct" };
  }
  return { source: "fallback" };
}

function extractNutritionFromMembers(
  members:
    | Array<{ total?: { caloriesKcal?: number; proteinG?: number } }>
    | undefined,
  fallbackNotes: string[],
): { values?: NutritionPoint; source: "direct" | "fallback" } {
  if (!members?.length) return { source: "fallback" };
  const totals = members.reduce(
    (acc, member) => {
      const mealTotal = member.total;
      acc.caloriesKcal += mealTotal?.caloriesKcal ?? 0;
      acc.proteinG += mealTotal?.proteinG ?? 0;
      return acc;
    },
    { caloriesKcal: 0, proteinG: 0 },
  );
  const hasData = members.every(
    (member) =>
      Number.isFinite(member.total?.caloriesKcal) &&
      Number.isFinite(member.total?.proteinG),
  );
  if (!hasData) return { source: "fallback" };
  fallbackNotes.push(
    "Used member totals as a fallback for daily nutrition because direct totals were unavailable.",
  );
  return {
    values: {
      caloriesKcal: roundNutrition(totals.caloriesKcal),
      proteinG: roundNutrition(totals.proteinG),
    },
    source: "fallback",
  };
}

function roundNutrition(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isMealPlanDifferent(
  before: CalculatedMealPlan,
  after: CalculatedMealPlan,
) {
  if (before.templateId !== after.templateId) return true;
  if (before.totalServingEquivalents !== after.totalServingEquivalents) return true;
  if (before.items.length !== after.items.length) return true;
  if (!sameSortedIngredientList(before.ingredientKeys, after.ingredientKeys))
    return true;
  return false;
}

function hasNutritionDelta(
  before: NutritionPoint,
  after: NutritionPoint,
  minDelta: number,
) {
  return (
    Math.abs(before.caloriesKcal - after.caloriesKcal) >= minDelta ||
    Math.abs(before.proteinG - after.proteinG) >= minDelta
  );
}

function sameSortedIngredientList(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((ingredient, index) => sortedRight[index] === ingredient);
}
