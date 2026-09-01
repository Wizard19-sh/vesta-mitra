import { getRecipe } from "./tarlaRecipes";
import type { CalculatedPlanItem } from "./tarlaPlanner";
import type { CalculatedDayMeal } from "./tarlaDayPlanner";

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
  revisedBecause?: string;
}) {
  const language = input.preferredLanguage?.toLocaleLowerCase() ?? "hinglish";
  const title = language.includes("english")
    ? `${capitalize(input.mealSlot)} plan`
    : `${capitalize(input.mealSlot)} ka plan`;
  const servings = `${round(input.totalServingEquivalents)} serving equivalents`;
  const lines = input.items.map((item) => `- ${item.recipeName}${quantityNote(item)}`);
  const notes = input.memberNotes.map(
    ({ memberName, note }) => `- ${memberName}: ${note}`,
  );
  const restrictions = input.importantRestrictions.length
    ? [`Important: ${input.importantRestrictions.join("; ")}.`]
    : [];
  const revision = input.revisedBecause
    ? [`Revised because ${input.revisedBecause}.`]
    : [];
  return [
    `${title} (${servings}):`,
    ...lines,
    ...notes,
    ...restrictions,
    ...revision,
  ].join("\n");
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
  revisedBecause?: string;
}) {
  const mealLines = input.meals.flatMap((meal) => [
    `${capitalize(meal.mealSlot)} (${round(meal.plan.totalServingEquivalents)} serving equivalents):`,
    ...meal.plan.items.map(
      (item) => `- ${item.recipeName}${quantityNote(item)}`,
    ),
  ]);
  const notes = input.memberNotes.map(
    ({ memberName, note }) => `- ${memberName}: ${note}`,
  );
  return [
    `${input.visitLabel} — ${input.targetDate}`,
    ...mealLines,
    ...notes,
    ...(input.importantRestrictions.length
      ? [`Important: ${input.importantRestrictions.join("; ")}.`]
      : []),
    ...(input.revisedBecause
      ? [`Revised because ${input.revisedBecause}.`]
      : []),
  ].join("\n");
}

function quantityNote(item: CalculatedPlanItem) {
  const notable = item.ingredients.filter(
    (ingredient) => !["oil", "tomato", "onion", "lemon"].includes(ingredient.ingredientKey),
  );
  if (notable.length === 0) return "";
  return ` (${notable
    .slice(0, 2)
    .map((ingredient) => `${ingredient.ingredientName} ${formatGrams(ingredient.quantityG)}`)
    .join(", ")})`;
}

function formatGrams(quantityG: number) {
  if (quantityG >= 1_000) return `${round(quantityG / 1_000)} kg`;
  return `${round(quantityG)} g`;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
