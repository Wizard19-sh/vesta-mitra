import { getRecipe } from "./tarlaRecipes";
import { naturalizeCookMessage } from "./tarlaMessageFormatting";
import {
  cumulativeHouseholdMeasure,
  formatHouseholdMeasure,
} from "./aeviaSetup";

import type { CalculatedPlanItem } from "./tarlaPlanner";
import type { CalculatedDayMeal } from "./tarlaDayPlanner";

type MealChangeReason = {
  mealSlot: string;
  reasonType: "direct_substitution" | "secondary_adjustment";
  reasonText: string;
  recipeLine: string;
  nutritionBeforeAfter?: {
    before: { caloriesKcal: number; proteinG: number };
    after: { caloriesKcal: number; proteinG: number };
  };
};

type NutritionTotalsScope = "household";

type NutritionBeforeAfter = {
  before: { caloriesKcal: number; proteinG: number };
  after: { caloriesKcal: number; proteinG: number };
  scope: NutritionTotalsScope;
};

export function composeCookPrimingMessage(input: {
  cookName: string;
  householdUserName: string;
  preferredLanguage?: string;
  communicationTone?: string;
}) {
  const cook = input.cookName.trim() || "Didi";
  const user = input.householdUserName.trim() || "the household";
  const language = input.preferredLanguage?.toLocaleLowerCase() ?? "hinglish";
  if (language.includes("english")) {
    return `Hi ${cook}. ${user} is setting up Tarla, a kitchen assistant that will share approved meal instructions before cooking time. ${user} will let you know when to start using it.`;
  }
  if (language.includes("hindi")) {
    return `Namaste ${cook}. ${user} Tarla naam ka kitchen assistant set kar rahe hain. Yeh cooking time se pehle approved meal instructions bhejega. Start karna ho to ${user} aapko bata denge.`;
  }
  return `Hi ${cook}. ${user} Tarla kitchen assistant set kar rahe hain, jo cooking time se pehle approved meal instructions bhejega. Start karna ho to ${user} aapko bata denge.`;
}

export function composeCookInstruction(input: {
  mealSlot: string;
  totalServingEquivalents: number;
  items: CalculatedPlanItem[];
  memberNotes: Array<{ memberName: string; note: string }>;
  importantRestrictions: string[];
  preferredLanguage?: string;
  cookName?: string;
  relationshipType?: "hired_cook" | "family_cook" | "primary_user" | "other";
  revisedBecause?: string;
}) {
  const language = input.preferredLanguage?.toLocaleLowerCase() ?? "hinglish";
  const title = language.includes("english")
    ? `${capitalize(input.mealSlot)} plan`
    : `${capitalize(input.mealSlot)} ka plan`;
  const lines = input.items.map((item) => `- ${item.recipeName} — ${householdQuantity(item)}`);
  const notes = input.memberNotes.map(
    ({ memberName, note }) => `- ${memberName}: ${note}`,
  );
  const restrictions = input.importantRestrictions.length
    ? [`Important: ${input.importantRestrictions.join("; ")}.`]
    : [];
  const revision = input.revisedBecause
    ? [`Revised because ${input.revisedBecause}.`]
    : [];
  return naturalizeCookMessage([
    relationshipOpening(input, title),
    ...lines,
    ...notes,
    ...restrictions,
    ...revision,
  ].join("\n"));
}

export function composeRecipeQuestionReply(recipeId: string) {
  const recipe = getRecipe(recipeId);
  return `${recipe.name}: ${recipe.cookLine}`;
}

export function composeDayCookInstruction(input: {
  visitLabel: string;
  targetDate: string;
  meals: CalculatedDayMeal[];
  memberNotes: Array<{ memberName: string; note: string }>;
  importantRestrictions: string[];
  cookName?: string;
  preferredLanguage?: string;
  relationshipType?: "hired_cook" | "family_cook" | "primary_user" | "other";
  revisedBecause?: string;
  changedMeals?: MealChangeReason[];
  nutritionBeforeAfter?: NutritionBeforeAfter;
  fallbackNotes?: string[];
}) {
  const mealLines = input.meals.flatMap((meal) => [
    `${capitalize(meal.mealSlot)}:`,
    ...meal.plan.items.map(
      (item) => `- ${item.recipeName} — ${householdQuantity(item)}`,
    ),
  ]);
  const notes = input.memberNotes.map(
    ({ memberName, note }) => `- ${memberName}: ${note}`,
  );
  const mealReasonLines = input.changedMeals?.map((entry) => {
    const typeLabel =
      entry.reasonType === "direct_substitution"
        ? "Direct substitution"
        : "Secondary adjustment";
    const deltaText = entry.nutritionBeforeAfter
      ? ` — ${formatDelta(entry.nutritionBeforeAfter)}`
      : "";
    return `- ${capitalize(entry.mealSlot)}: ${typeLabel}; ${entry.reasonText}; ${entry.recipeLine}${deltaText}`;
  });
  const nutritionLines =
    input.nutritionBeforeAfter &&
    input.nutritionBeforeAfter.scope === "household"
    ? [
        `Daily totals (household) kcal/protein: ${input.nutritionBeforeAfter.before.caloriesKcal} → ${input.nutritionBeforeAfter.after.caloriesKcal} kcal, ${input.nutritionBeforeAfter.before.proteinG} → ${input.nutritionBeforeAfter.after.proteinG} g protein`,
      ]
    : [];
  const fallbackLines = input.fallbackNotes?.length
    ? input.fallbackNotes.map((note) => `Fallback: ${note}`)
    : [];
  return naturalizeCookMessage([
    relationshipOpening(input, `${input.visitLabel} — ${humanDate(input.targetDate)}`),
    ...mealLines,
    ...notes,
    ...(input.importantRestrictions.length
      ? [`Important: ${input.importantRestrictions.join("; ")}.`]
      : []),
    ...(mealReasonLines?.length ? ["", "Changed dishes:"] : []),
    ...(mealReasonLines ?? []),
    ...nutritionLines,
    ...fallbackLines,
    ...(input.revisedBecause
      ? [`Revised because ${input.revisedBecause}.`]
      : []),
  ].join("\n"));
}

function humanDate(value: string) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) return value;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = months[Number(matched[2]) - 1];
  const day = Number(matched[3]);
  return month && day > 0 ? `${day} ${month}` : value;
}

function householdQuantity(item: CalculatedPlanItem) {
  return formatHouseholdMeasure(
    cumulativeHouseholdMeasure(
      item.recipeId,
      item.memberPortions.map((portion) => portion.servingEquivalent),
    ),
  );
}

function relationshipOpening(input: {
  cookName?: string;
  preferredLanguage?: string;
  relationshipType?: "hired_cook" | "family_cook" | "primary_user" | "other";
}, title: string) {
  const name = input.cookName?.trim();
  const english = input.preferredLanguage?.toLocaleLowerCase().includes("english");
  if (input.relationshipType === "family_cook" || input.relationshipType === "primary_user") {
    if (!name) return title;
    return english ? `Hi ${name}. ${title}` : `${name}, ${title}`;
  }
  if (!name) return title;
  return english ? `Hi ${name}. ${title}` : `Namaste ${name}. ${title}`;
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function formatDelta(input: {
  before: { caloriesKcal: number; proteinG: number };
  after: { caloriesKcal: number; proteinG: number };
}) {
  const calorieDelta = roundNutrition(input.after.caloriesKcal - input.before.caloriesKcal);
  const proteinDelta = roundNutrition(input.after.proteinG - input.before.proteinG);
  const calorieSign = calorieDelta > 0 ? "+" : "";
  const proteinSign = proteinDelta > 0 ? "+" : "";
  return `${calorieSign}${calorieDelta} kcal, ${proteinSign}${proteinDelta} g protein`;
}

function roundNutrition(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
