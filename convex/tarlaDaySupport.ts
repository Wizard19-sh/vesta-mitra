import type {
  CalculatedDayMeal,
  CalculatedDayPlan,
} from "../lib/tarlaDayPlanner";
import type { CalculatedMealPlan } from "../lib/tarlaPlanner";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  getCalculatedPlanItems,
  insertMealPlan,
  requireOwnedHousehold,
} from "./tarlaSupport";

export async function insertDayPlan(
  ctx: MutationCtx,
  input: {
    householdId: Id<"households">;
    requestedByMemberId: Id<"members">;
    runId: Id<"agentRuns">;
    seriesId: string;
    targetDate: string;
    status: Doc<"tarlaDayPlans">["status"];
    mealStatus: Doc<"tarlaMealPlans">["status"];
    version: number;
    previousDayPlanId?: Id<"tarlaDayPlans">;
    result: CalculatedDayPlan;
  },
) {
  const mealPlanIds: Array<{
    mealSlot: string;
    mealPlanId: Id<"tarlaMealPlans">;
  }> = [];
  for (const meal of input.result.meals) {
    const mealPlanId = await insertMealPlan(ctx, {
      householdId: input.householdId,
      requestedByMemberId: input.requestedByMemberId,
      runId: input.runId,
      targetDate: input.targetDate,
      mealSlot: meal.mealSlot,
      contextLabel: "full_day_plan_meal",
      status: input.mealStatus,
      version: input.version,
      result: meal.plan,
    });
    mealPlanIds.push({ mealSlot: meal.mealSlot, mealPlanId });
  }
  const now = Date.now();
  const dayPlanId = await ctx.db.insert("tarlaDayPlans", {
    householdId: input.householdId,
    requestedByMemberId: input.requestedByMemberId,
    runId: input.runId,
    seriesId: input.seriesId,
    targetDate: input.targetDate,
    status: input.status,
    version: input.version,
    previousDayPlanId: input.previousDayPlanId,
    mealSlots: input.result.meals.map((meal) => meal.mealSlot),
    totalNutrition: input.result.totalNutrition,
    memberDailyNutrition: input.result.memberDailyNutrition.map((member) => ({
      ...member,
      memberId: member.memberId as Id<"members">,
    })),
    constraintChecks: input.result.constraintChecks,
    createdAt: now,
    updatedAt: now,
  });
  await Promise.all(
    mealPlanIds.map(({ mealSlot, mealPlanId }) =>
      ctx.db.insert("tarlaDayPlanMeals", {
        dayPlanId,
        mealPlanId,
        mealSlot,
        locked: false,
        createdAt: now,
      }),
    ),
  );
  return { dayPlanId, mealPlanIds };
}

export async function insertDayPlanFromMeals(
  ctx: MutationCtx,
  input: {
    householdId: Id<"households">;
    requestedByMemberId: Id<"members">;
    runId: Id<"agentRuns">;
    seriesId: string;
    targetDate: string;
    status: Doc<"tarlaDayPlans">["status"];
    version: number;
    previousDayPlanId: Id<"tarlaDayPlans">;
    result: CalculatedDayPlan;
    mealPlanIds: Map<string, Id<"tarlaMealPlans">>;
    lockedMealSlots: Set<string>;
  },
) {
  const now = Date.now();
  const dayPlanId = await ctx.db.insert("tarlaDayPlans", {
    householdId: input.householdId,
    requestedByMemberId: input.requestedByMemberId,
    runId: input.runId,
    seriesId: input.seriesId,
    targetDate: input.targetDate,
    status: input.status,
    version: input.version,
    previousDayPlanId: input.previousDayPlanId,
    mealSlots: input.result.meals.map((meal) => meal.mealSlot),
    totalNutrition: input.result.totalNutrition,
    memberDailyNutrition: input.result.memberDailyNutrition.map((member) => ({
      ...member,
      memberId: member.memberId as Id<"members">,
    })),
    constraintChecks: input.result.constraintChecks,
    createdAt: now,
    updatedAt: now,
  });
  await Promise.all(
    input.result.meals.map((meal) => {
      const mealPlanId = input.mealPlanIds.get(meal.mealSlot);
      if (!mealPlanId) throw new Error(`Meal plan ID missing for ${meal.mealSlot}`);
      return ctx.db.insert("tarlaDayPlanMeals", {
        dayPlanId,
        mealPlanId,
        mealSlot: meal.mealSlot,
        locked: input.lockedMealSlots.has(meal.mealSlot),
        createdAt: now,
      });
    }),
  );
  return dayPlanId;
}

export async function loadDayMeals(
  ctx: MutationCtx | QueryCtx,
  dayPlanId: Id<"tarlaDayPlans">,
): Promise<
  Array<{
    join: Doc<"tarlaDayPlanMeals">;
    mealPlan: Doc<"tarlaMealPlans">;
    calculated: CalculatedDayMeal;
  }>
> {
  const joins = await ctx.db
    .query("tarlaDayPlanMeals")
    .withIndex("by_day_plan", (q) => q.eq("dayPlanId", dayPlanId))
    .collect();
  const results = [];
  for (const join of joins) {
    const mealPlan = await ctx.db.get(join.mealPlanId);
    if (!mealPlan) throw new Error("Day-plan meal record was not found");
    const items = await getCalculatedPlanItems(ctx, mealPlan._id);
    const ingredientKeys = [
      ...new Set(
        items.flatMap((item) =>
          item.ingredients.map((ingredient) => ingredient.ingredientKey),
        ),
      ),
    ];
    const plan: CalculatedMealPlan = {
      templateId: mealPlan.selectedTemplateId,
      templateName: mealPlan.selectedTemplateName,
      totalServingEquivalents: mealPlan.totalServingEquivalents,
      totalNutrition: mealPlan.totalNutrition,
      perServingNutrition: mealPlan.perServingNutrition,
      memberNutrition: mealPlan.memberNutrition.map((member) => ({
        ...member,
        memberId: String(member.memberId),
      })),
      items,
      ingredientKeys,
      constraintChecks: mealPlan.constraintChecks,
    };
    results.push({
      join,
      mealPlan,
      calculated: {
        mealSlot: join.mealSlot,
        eaterMemberIds: mealPlan.memberNutrition.map((member) =>
          String(member.memberId),
        ),
        plan,
      },
    });
  }
  return results.sort(
    (left, right) =>
      MEAL_ORDER.indexOf(left.join.mealSlot) -
      MEAL_ORDER.indexOf(right.join.mealSlot),
  );
}

export async function latestApprovedDayPlan(
  ctx: MutationCtx | QueryCtx,
  seriesId: string,
) {
  const plans = await ctx.db
    .query("tarlaDayPlans")
    .withIndex("by_series", (q) => q.eq("seriesId", seriesId))
    .collect();
  return plans
    .filter((plan) =>
      ["approved", "scheduled", "executing"].includes(plan.status),
    )
    .sort((left, right) => right.version - left.version)[0];
}

export async function requireOwnedDayPlan(
  ctx: MutationCtx | QueryCtx,
  dayPlanId: Id<"tarlaDayPlans">,
  ownerKey: string,
) {
  const dayPlan = await ctx.db.get(dayPlanId);
  if (!dayPlan) throw new Error("Full-day plan not found");
  await requireOwnedHousehold(ctx, dayPlan.householdId, ownerKey);
  return dayPlan;
}

export async function deactivateDaySeriesHistory(
  ctx: MutationCtx,
  dayPlan: Doc<"tarlaDayPlans">,
) {
  const plans = await ctx.db
    .query("tarlaDayPlans")
    .withIndex("by_series", (q) => q.eq("seriesId", dayPlan.seriesId))
    .collect();
  const mealPlanIds = new Set<string>();
  for (const plan of plans) {
    const joins = await ctx.db
      .query("tarlaDayPlanMeals")
      .withIndex("by_day_plan", (q) => q.eq("dayPlanId", plan._id))
      .collect();
    joins.forEach((join) => mealPlanIds.add(String(join.mealPlanId)));
  }
  const history = await ctx.db
    .query("tarlaMealHistory")
    .withIndex("by_household", (q) => q.eq("householdId", dayPlan.householdId))
    .collect();
  await Promise.all(
    history
      .filter(
        (entry) =>
          entry.active !== false &&
          entry.planId !== undefined &&
          mealPlanIds.has(String(entry.planId)),
      )
      .map((entry) => ctx.db.patch(entry._id, { active: false })),
  );
}

export async function activateDayPlanHistory(
  ctx: MutationCtx,
  dayPlan: Doc<"tarlaDayPlans">,
) {
  await deactivateDaySeriesHistory(ctx, dayPlan);
  const meals = await loadDayMeals(ctx, dayPlan._id);
  const now = Date.now();
  await Promise.all(
    meals.map((meal) =>
      ctx.db.insert("tarlaMealHistory", {
        householdId: dayPlan.householdId,
        planId: meal.mealPlan._id,
        targetDate: dayPlan.targetDate,
        mealSlot: meal.join.mealSlot,
        templateId: meal.calculated.plan.templateId,
        recipeIds: meal.calculated.plan.items.map((item) => item.recipeId),
        ingredientKeys: meal.calculated.plan.ingredientKeys,
        active: true,
        source: "approved_plan",
        createdAt: now,
      }),
    ),
  );
}

export const MEAL_ORDER = ["breakfast", "lunch", "snack", "dinner"];
