import type { Nutrition } from "./tarlaIngredientData";
import { addNutrition, ZERO_NUTRITION } from "./tarlaNutrition";
import {
  planMeal,
  type CalculatedMealPlan,
  type PlannerHistory,
  type PlannerInventory,
  type PlannerMemory,
  type PlannerMember,
  type PlannerRule,
} from "./tarlaPlanner";

export type CalculatedDayMeal = {
  mealSlot: string;
  eaterMemberIds: string[];
  plan: CalculatedMealPlan;
};

export type MemberDailyNutrition = {
  memberId: string;
  memberName: string;
  meals: Array<{
    mealSlot: string;
    nutrition: Nutrition;
  }>;
  total: Nutrition;
  targets: {
    caloriesKcal?: number;
    proteinG?: number;
    carbohydratesG?: number;
    fatG?: number;
    fibreG?: number;
  };
  variance: {
    caloriesKcal?: number;
    proteinG?: number;
    carbohydratesG?: number;
    fatG?: number;
    fibreG?: number;
  };
};

export type CalculatedDayPlan = {
  meals: CalculatedDayMeal[];
  totalNutrition: Nutrition;
  memberDailyNutrition: MemberDailyNutrition[];
  constraintChecks: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
};

export function planFullDay(input: {
  targetDate: string;
  mealSlots: string[];
  members: PlannerMember[];
  rules: PlannerRule[];
  history: PlannerHistory[];
  memory: PlannerMemory[];
  inventory: PlannerInventory[];
}): CalculatedDayPlan {
  const meals: CalculatedDayMeal[] = [];
  const rollingHistory = [...input.history];
  const rollingMemory = [...input.memory];
  for (const mealSlot of input.mealSlots) {
    const eaters = input.members.filter((member) =>
      member.mealsAtHome.includes(mealSlot),
    );
    if (eaters.length === 0) continue;
    const plan = planMeal({
      targetDate: input.targetDate,
      mealSlot,
      members: eaters,
      rules: input.rules,
      history: rollingHistory,
      memory: rollingMemory,
      inventory: input.inventory,
      enforceNutritionTargets: false,
    });
    meals.push({
      mealSlot,
      eaterMemberIds: eaters.map((member) => member.memberId),
      plan,
    });
    rollingHistory.push({
      targetDate: input.targetDate,
      mealSlot,
      templateId: plan.templateId,
      recipeIds: plan.items.map((item) => item.recipeId),
      ingredientKeys: plan.ingredientKeys,
    });
    rollingMemory.push({
      key: `avoid_template:${plan.templateId}`,
      value: "Avoid repeating a template within this generated day",
    });
  }
  if (meals.length === 0) {
    throw new Error("No requested day-plan meals are eaten at home");
  }
  return summarizeDayMeals(meals, input.members);
}

export function summarizeDayMeals(
  meals: CalculatedDayMeal[],
  members: PlannerMember[],
): CalculatedDayPlan {
  const totalNutrition = meals.length
    ? addNutrition(...meals.map((meal) => meal.plan.totalNutrition))
    : { ...ZERO_NUTRITION };
  const memberDailyNutrition = members.map((member) => {
    const mealNutrition = meals.flatMap((meal) => {
      const portion = meal.plan.memberNutrition.find(
        (entry) => entry.memberId === member.memberId,
      );
      return portion
        ? [{ mealSlot: meal.mealSlot, nutrition: portion.nutrition }]
        : [];
    });
    const total = mealNutrition.length
      ? addNutrition(...mealNutrition.map((entry) => entry.nutrition))
      : { ...ZERO_NUTRITION };
    const targets = {
      caloriesKcal: member.calorieTargetKcal,
      proteinG: member.proteinTargetG,
      carbohydratesG: member.carbohydratesTargetG,
      fatG: member.fatTargetG,
      fibreG: member.fibreTargetG,
    };
    return {
      memberId: member.memberId,
      memberName: member.name,
      meals: mealNutrition,
      total,
      targets,
      variance: {
        caloriesKcal: variance(total.caloriesKcal, targets.caloriesKcal),
        proteinG: variance(total.proteinG, targets.proteinG),
        carbohydratesG: variance(
          total.carbohydratesG,
          targets.carbohydratesG,
        ),
        fatG: variance(total.fatG, targets.fatG),
        fibreG: variance(total.fibreG, targets.fibreG),
      },
    };
  });
  return {
    meals,
    totalNutrition,
    memberDailyNutrition,
    constraintChecks: [
      {
        name: "meal_level_constraints",
        passed: meals.every((meal) =>
          meal.plan.constraintChecks.every((check) => check.passed),
        ),
        detail: "Every meal passed dietary, allergy, day, memory, history, and inventory checks.",
      },
      {
        name: "daily_variety",
        passed:
          new Set(meals.map((meal) => meal.plan.templateId)).size ===
          meals.length,
        detail: "Meal templates are not repeated within the generated day.",
      },
      {
        name: "daily_nutrition_available",
        passed: true,
        detail: "Per-meal totals, daily totals, configured targets, and target variance were calculated deterministically.",
      },
    ],
  };
}

function variance(actual: number, target: number | undefined) {
  if (target === undefined) return undefined;
  return Math.round((actual - target + Number.EPSILON) * 100) / 100;
}
