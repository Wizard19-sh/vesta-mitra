import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { composeDayExecutionInstruction } from "./tarlaInstruction";

export const resolveCanonicalInboundContact = mutation({
  args: {
    adminKey: v.string(),
    ownerKey: v.string(),
    signalId: v.id("inboundSignals"),
    memberId: v.id("members"),
    endpointId: v.id("communicationEndpoints"),
  },
  handler: async (ctx, args) => {
    requireBetaAdmin(args.adminKey);

    const [signal, member, endpoint] = await Promise.all([
      ctx.db.get(args.signalId),
      ctx.db.get(args.memberId),
      ctx.db.get(args.endpointId),
    ]);
    if (!signal || !member || !endpoint) {
      throw new Error("Inbound signal or canonical contact was not found");
    }

    const household = await ctx.db.get(member.householdId);
    if (!household || household.ownerKey !== args.ownerKey) {
      throw new Error("Canonical member was not found for this owner");
    }
    if (
      member.active === false ||
      endpoint.householdId !== household._id ||
      endpoint.memberId !== member._id ||
      endpoint.channel !== "whatsapp" ||
      endpoint.active === false ||
      endpoint.consentStatus !== "granted"
    ) {
      throw new Error("Canonical WhatsApp contact is not active and consented");
    }
    if (
      signal.channel !== "whatsapp" ||
      signal.senderAddress !== endpoint.address ||
      signal.metadata?.provider !== "meta" ||
      signal.metadata.webhookValidatedAt === undefined
    ) {
      throw new Error("Inbound signal does not match the validated Meta contact");
    }
    if (signal.matched || signal.runId || signal.checkInId) {
      throw new Error("Inbound signal is already attached to a runtime task");
    }

    await ctx.db.patch(signal._id, {
      householdId: household._id,
      memberId: member._id,
      communicationEndpointId: endpoint._id,
      agent: "vesta",
    });

    return {
      signalId: signal._id,
      householdId: household._id,
      memberId: member._id,
      endpointId: endpoint._id,
      webhookValidated: true,
      matchedToTask: false,
    };
  },
});

export const prepareApprovedTarlaInstruction = mutation({
  args: {
    adminKey: v.string(),
    ownerKey: v.string(),
    recipientE164: v.string(),
  },
  handler: async (ctx, args) => {
    requireBetaAdmin(args.adminKey);

    const household = await ctx.db
      .query("households")
      .withIndex("by_owner", (q) => q.eq("ownerKey", args.ownerKey))
      .order("desc")
      .first();
    if (!household) throw new Error("Selected recipient household was not found");

    const plans = await ctx.db
      .query("tarlaDayPlans")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .order("desc")
      .collect();
    const plan = plans.find(
      (item) =>
        item.approvedAt &&
        item.approvalSource === "household_user" &&
        ["scheduled", "executing"].includes(item.status),
    );
    if (!plan) throw new Error("Selected recipient has no user-approved current Tarla plan");

    const matchingEndpoints = await ctx.db
      .query("communicationEndpoints")
      .withIndex("by_channel_and_address", (q) =>
        q.eq("channel", "whatsapp").eq("address", validE164(args.recipientE164)),
      )
      .collect();
    const endpoint = matchingEndpoints.find(
      (item) => item.householdId === household._id,
    );
    if (
      !endpoint ||
      !endpoint.active ||
      endpoint.consentStatus !== "granted"
    ) {
      throw new Error("Selected recipient is not linked to the approved household");
    }

    const executions = await ctx.db
      .query("tarlaExecutions")
      .withIndex("by_day_plan", (q) => q.eq("dayPlanId", plan._id))
      .collect();
    const existingPrepared = executions.find(
      (item) =>
        item.communicationEndpointId === endpoint._id &&
        item.status === "instruction_ready" &&
        item.instruction,
    );
    if (existingPrepared?.instruction) {
      const run = await ctx.db.get(existingPrepared.runId);
      return {
        dayPlanId: plan._id,
        executionId: existingPrepared._id,
        runId: run?.runId,
        instruction: existingPrepared.instruction,
      };
    }

    const source = executions.find(
      (item) =>
        item.communicationEndpointId === endpoint._id &&
        item.status === "waiting" &&
        item.instruction,
    );
    if (!source?.instruction) {
      throw new Error("The user-approved plan has no reusable development instruction");
    }

    const [developmentMessages, providerMessages] = await Promise.all([
      ctx.db
        .query("devTransportMessages")
        .withIndex("by_tarla_execution", (q) => q.eq("tarlaExecutionId", source._id))
        .collect(),
      ctx.db
        .query("transportMessages")
        .withIndex("by_tarla_execution", (q) => q.eq("tarlaExecutionId", source._id))
        .collect(),
    ]);
    if (developmentMessages.length === 0 || providerMessages.length !== 0) {
      throw new Error("The approved instruction is not eligible for a development-to-Meta prepare");
    }

    const occurrenceKey = `${source.occurrenceKey ?? source._id}:meta-beta`;
    const existingRecovery = await ctx.db
      .query("tarlaExecutions")
      .withIndex("by_occurrence_key", (q) => q.eq("occurrenceKey", occurrenceKey))
      .unique();
    if (existingRecovery?.status === "instruction_ready" && existingRecovery.instruction) {
      const run = await ctx.db.get(existingRecovery.runId);
      return {
        dayPlanId: plan._id,
        executionId: existingRecovery._id,
        runId: run?.runId,
        instruction: existingRecovery.instruction,
      };
    }
    if (existingRecovery) throw new Error("A live prepared instruction already exists");

    const now = Date.now();
    const runPublicId = crypto.randomUUID();
    const runId = await ctx.db.insert("agentRuns", {
      runId: runPublicId,
      agent: "tarla",
      householdId: household._id,
      taskType: "scheduled_cook_visit_instruction",
      status: "queued",
      inputSummary: "Prepare the user-approved instruction after its development-only dispatch",
      createdAt: now,
      updatedAt: now,
    });
    const executionId = await ctx.db.insert("tarlaExecutions", {
      householdId: source.householdId,
      dayPlanId: plan._id,
      dayPlanSeriesId: source.dayPlanSeriesId,
      cookVisitId: source.cookVisitId,
      runId,
      cookMemberId: source.cookMemberId,
      communicationEndpointId: endpoint._id,
      assignedMealSlots: source.assignedMealSlots,
      selectedCookReason: source.selectedCookReason,
      recipientClass: source.recipientClass,
      planVersion: plan.version,
      status: "instruction_ready",
      occurrenceKey,
      unavailableIngredientKeys: source.unavailableIngredientKeys,
      lockedMealSlots: source.lockedMealSlots,
      userEscalationRequired: false,
      createdAt: now,
      updatedAt: now,
    });
    const execution = await ctx.db.get(executionId);
    if (!execution) throw new Error("Prepared instruction could not be created");
    const composed = await composeDayExecutionInstruction(ctx, execution, plan);
    if (composed.instruction !== source.instruction) {
      throw new Error("Approved plan context changed; prepare is blocked");
    }
    await ctx.db.patch(executionId, {
      instruction: composed.instruction,
      latestInstruction: composed.instruction,
    });
    return {
      dayPlanId: plan._id,
      executionId,
      runId: runPublicId,
      instruction: composed.instruction,
    };
  },
});

export const linkConsentedCookRecipient = mutation({
  args: {
    adminKey: v.string(),
    ownerKey: v.string(),
    householdId: v.id("households"),
    cookMemberId: v.id("members"),
    recipientE164: v.string(),
  },
  handler: async (ctx, args) => {
    requireBetaAdmin(args.adminKey);
    const household = await ctx.db.get(args.householdId);
    if (!household || household.ownerKey !== args.ownerKey) {
      throw new Error("Household was not found for this owner");
    }
    const cookMember = await ctx.db.get(args.cookMemberId);
    if (!cookMember || cookMember.householdId !== household._id || cookMember.active === false) {
      throw new Error("Cooking person was not found in this household");
    }
    const cookState = await ctx.db
      .query("tarlaCookStates")
      .withIndex("by_member", (q) => q.eq("memberId", cookMember._id))
      .unique();
    if (!cookState || cookState.active === false) {
      throw new Error("Active cooking-person setup was not found");
    }
    const endpoint = await ctx.db.get(cookState.communicationEndpointId);
    if (!endpoint || endpoint.householdId !== household._id || endpoint.memberId !== cookMember._id) {
      throw new Error("Cooking-person WhatsApp contact was not found");
    }
    if (!endpoint.active || endpoint.consentStatus !== "granted") {
      throw new Error("Cooking-person WhatsApp consent is not active");
    }
    const recipientE164 = validE164(args.recipientE164);
    const conflictingEndpoint = await ctx.db
      .query("communicationEndpoints")
      .withIndex("by_channel_and_address", (q) =>
        q.eq("channel", "whatsapp").eq("address", recipientE164),
      )
      .first();
    if (conflictingEndpoint && conflictingEndpoint._id !== endpoint._id) {
      throw new Error("That beta recipient is already linked to another contact");
    }
    const changed = endpoint.address !== recipientE164;
    await ctx.db.patch(endpoint._id, {
      ...(changed ? { address: recipientE164 } : {}),
      providerMetadata: {
        ...endpoint.providerMetadata,
        provider: "meta",
        ready: true,
      },
      updatedAt: Date.now(),
    });
    const now = Date.now();
    await ctx.db.insert("productAnalyticsEvents", {
      eventKey: `beta-cook-link:${endpoint._id}:${now}`,
      anonymousId: "owner-test-admin",
      householdId: household._id,
      eventName: "beta_cook_recipient_linked",
      route: "/admin/beta",
      agent: "tarla",
      outcome: changed ? "existing_contact_updated" : "existing_contact_confirmed",
      occurredAt: now,
      createdAt: now,
    });
    return {
      householdId: household._id,
      cookMemberId: cookMember._id,
      cookStateId: cookState._id,
      endpointId: endpoint._id,
      changed,
      provider: "meta",
      ready: true,
    };
  },
});

function requireBetaAdmin(value: string) {
  const expected = process.env.BETA_ADMIN_KEY?.trim();
  if (!expected || value.trim() !== expected) {
    throw new Error("Beta admin access is not configured or authorised");
  }
}

function validE164(value: string) {
  const result = value.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(result)) throw new Error("Beta recipient number is invalid");
  return result;
}
