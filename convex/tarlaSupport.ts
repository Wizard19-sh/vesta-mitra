import type {
  CalculatedMealPlan,
  CalculatedPlanItem,
  PlannerHistory,
  PlannerInventory,
  PlannerMemory,
  PlannerMember,
  PlannerRule,
} from "../lib/tarlaPlanner";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function loadPlanningContext(
  ctx: MutationCtx,
  householdId: Id<"households">,
  eaterMemberIds: Id<"members">[],
) {
  const [members, profiles, preferences, rules, history, inventory] = await Promise.all([
    Promise.all(eaterMemberIds.map((memberId) => ctx.db.get(memberId))),
    ctx.db
      .query("tarlaMemberProfiles")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect(),
    ctx.db
      .query("preferences")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect(),
    ctx.db
      .query("tarlaDietaryRules")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect(),
    ctx.db
      .query("tarlaMealHistory")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect(),
    ctx.db
      .query("tarlaInventoryItems")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect(),
  ]);
  if (members.some((member) => !member || member.householdId !== householdId)) {
    throw new Error("Every eater must be a member of this household");
  }
  const profileByMember = new Map(profiles.map((profile) => [profile.memberId, profile]));
  const plannerMembers: PlannerMember[] = members.map((member) => {
    if (!member) throw new Error("Household member was not found");
    const profile = profileByMember.get(member._id);
    if (!profile) throw new Error(`Tarla profile is missing for ${member.name}`);
    return {
      memberId: String(member._id),
      name: member.name,
      dietaryType: profile.dietaryType,
      allergies: profile.allergies,
      dislikedFoods: profile.dislikedFoods,
      avoidedFoods: profile.avoidedFoods,
      limitedFoods: profile.limitedFoods,
      favouriteFoods: profile.favouriteFoods,
      mealsAtHome: profile.mealsAtHome,
      servingEquivalent: profile.servingEquivalent,
      calorieTargetKcal: profile.calorieTargetKcal,
      proteinTargetG: profile.proteinTargetG,
      fatTargetG: profile.fatTargetG,
      carbohydratesTargetG: profile.carbohydratesTargetG,
      fibreTargetG: profile.fibreTargetG,
      cookNotes: profile.cookNotes,
    };
  });
  const now = Date.now();
  const memory: PlannerMemory[] = preferences
    .filter(
      (preference) =>
        preference.active &&
        (preference.expiresAt === undefined || preference.expiresAt > now) &&
        preference.category === "tarla_food",
    )
    .map((preference) => ({
      memberId: preference.memberId ? String(preference.memberId) : undefined,
      key: preference.key,
      value: preference.value,
    }));
  const plannerRules: PlannerRule[] = rules
    .filter(
      (rule) =>
        rule.active &&
        rule.ruleType !== "custom_days" &&
        (rule.expiresAt === undefined || rule.expiresAt > now),
    )
    .map((rule) => ({
      memberId: rule.memberId ? String(rule.memberId) : undefined,
      ruleType: rule.ruleType as PlannerRule["ruleType"],
      daysOfWeek: rule.daysOfWeek,
      ingredientKey: rule.ingredientKey,
      mealSlot: rule.mealSlot,
      maxOccurrences: rule.maxOccurrences,
      windowDays: rule.windowDays,
    }));
  const unstructuredRules = rules
    .filter(
      (rule) =>
        rule.active &&
        rule.ruleType === "custom_days" &&
        (rule.expiresAt === undefined || rule.expiresAt > now),
    )
    .map((rule) => ({
      id: rule._id,
      description: rule.description,
      daysOfWeek: rule.daysOfWeek ?? [],
    }));
  const plannerHistory: PlannerHistory[] = history
    .filter((entry) => entry.active !== false)
    .map((entry) => ({
    targetDate: entry.targetDate,
    mealSlot: entry.mealSlot,
    templateId: entry.templateId,
    recipeIds: entry.recipeIds,
    ingredientKeys: entry.ingredientKeys,
    }));
  const plannerInventory: PlannerInventory[] = inventory.map((item) => ({
    ingredientKey: item.ingredientKey,
    availability: item.availability,
  }));
  return {
    members: plannerMembers,
    rules: plannerRules,
    history: plannerHistory,
    memory,
    inventory: plannerInventory,
    profileDocs: profiles.filter((profile) => eaterMemberIds.includes(profile.memberId)),
    unstructuredRules,
  };
}

export async function insertMealPlan(
  ctx: MutationCtx,
  input: {
    householdId: Id<"households">;
    requestedByMemberId: Id<"members">;
    runId: Id<"agentRuns">;
    targetDate: string;
    mealSlot: string;
    contextLabel?: string;
    status: Doc<"tarlaMealPlans">["status"];
    version: number;
    previousPlanId?: Id<"tarlaMealPlans">;
    result: CalculatedMealPlan;
  },
) {
  const now = Date.now();
  const planId = await ctx.db.insert("tarlaMealPlans", {
    householdId: input.householdId,
    requestedByMemberId: input.requestedByMemberId,
    runId: input.runId,
    targetDate: input.targetDate,
    mealSlot: input.mealSlot,
    contextLabel: input.contextLabel,
    status: input.status,
    version: input.version,
    previousPlanId: input.previousPlanId,
    selectedTemplateId: input.result.templateId,
    selectedTemplateName: input.result.templateName,
    totalServingEquivalents: input.result.totalServingEquivalents,
    totalNutrition: input.result.totalNutrition,
    perServingNutrition: input.result.perServingNutrition,
    memberNutrition: input.result.memberNutrition.map((item) => ({
      ...item,
      memberId: item.memberId as Id<"members">,
    })),
    constraintChecks: input.result.constraintChecks,
    userEscalationRequired: false,
    createdAt: now,
    updatedAt: now,
  });
  await Promise.all(
    input.result.items.map((item) =>
      ctx.db.insert("tarlaMealPlanItems", {
        planId,
        recipeId: item.recipeId,
        recipeName: item.recipeName,
        scale: item.scale,
        totalNutrition: item.totalNutrition,
        perServingNutrition: item.perServingNutrition,
        ingredients: item.ingredients,
        memberPortions: item.memberPortions.map((portion) => ({
          ...portion,
          memberId: portion.memberId as Id<"members">,
        })),
        createdAt: now,
      }),
    ),
  );
  return planId;
}

export async function getCalculatedPlanItems(
  ctx: MutationCtx | QueryCtx,
  planId: Id<"tarlaMealPlans">,
): Promise<CalculatedPlanItem[]> {
  const items = await ctx.db
    .query("tarlaMealPlanItems")
    .withIndex("by_plan", (q) => q.eq("planId", planId))
    .collect();
  return items.map((item) => ({
    recipeId: item.recipeId,
    recipeName: item.recipeName,
    scale: item.scale,
    totalNutrition: item.totalNutrition,
    perServingNutrition: item.perServingNutrition,
    ingredients: item.ingredients,
    memberPortions: item.memberPortions.map((portion) => ({
      ...portion,
      memberId: String(portion.memberId),
    })),
  }));
}

export async function rememberTarlaCorrection(
  ctx: MutationCtx,
  input: {
    householdId: Id<"households">;
    memberId?: Id<"members">;
    key: string;
    value: string;
    expiresAt?: number;
  },
) {
  const existing = await ctx.db
    .query("preferences")
    .withIndex("by_household", (q) => q.eq("householdId", input.householdId))
    .collect();
  const now = Date.now();
  await Promise.all(
    existing
      .filter(
        (preference) =>
          preference.active &&
          preference.memberId === input.memberId &&
          preference.category === "tarla_food" &&
          preference.key === input.key,
      )
      .map((preference) =>
        ctx.db.patch(preference._id, { active: false, updatedAt: now }),
      ),
  );
  return ctx.db.insert("preferences", {
    householdId: input.householdId,
    memberId: input.memberId,
    category: "tarla_food",
    key: input.key,
    value: input.value,
    source: "explicit_correction",
    active: true,
    expiresAt: input.expiresAt,
    createdAt: now,
    updatedAt: now,
  });
}

export async function addCompletedStep(
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

export async function addWaitingStep(
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

export async function completeLatestWaitingStep(
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

export async function nextStepOrder(ctx: MutationCtx, runId: Id<"agentRuns">) {
  const latest = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_and_order", (q) => q.eq("runId", runId))
    .order("desc")
    .first();
  return (latest?.order ?? 0) + 1;
}

export async function completeRun(
  ctx: MutationCtx,
  run: Doc<"agentRuns">,
  outputSummary: string,
) {
  const completedAt = Date.now();
  await ctx.db.patch(run._id, {
    status: "completed",
    completedAt,
    totalLatencyMs:
      run.startedAt === undefined ? undefined : completedAt - run.startedAt,
    outputSummary,
    updatedAt: completedAt,
  });
}

export async function requireOwnedHousehold(
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

export async function requireOwnedPlan(
  ctx: MutationCtx | QueryCtx,
  planId: Id<"tarlaMealPlans">,
  ownerKey: string,
) {
  const plan = await ctx.db.get(planId);
  if (!plan) throw new Error("Meal plan not found");
  await requireOwnedHousehold(ctx, plan.householdId, ownerKey);
  return plan;
}
