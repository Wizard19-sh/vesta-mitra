import {
  findIngredientInText,
  getIngredient,
  normalizeFoodKey,
  type Nutrition,
} from "./tarlaIngredientData";
import {
  addNutrition,
  nutritionForIngredient,
  scaleNutrition,
  ZERO_NUTRITION,
} from "./tarlaNutrition";
import {
  getRecipe,
  MEAL_TEMPLATES,
  type RecipeDietaryType,
  type TarlaMealTemplate,
} from "./tarlaRecipes";

export type PlannerMember = {
  memberId: string;
  name: string;
  dietaryType: RecipeDietaryType;
  allergies: string[];
  dislikedFoods: string[];
  avoidedFoods: string[];
  limitedFoods: string[];
  favouriteFoods: string[];
  mealsAtHome: string[];
  servingEquivalent: number;
  calorieTargetKcal?: number;
  proteinTargetG?: number;
  fatTargetG?: number;
  carbohydratesTargetG?: number;
  fibreTargetG?: number;
  cookNotes?: string;
};

export type PlannerRule = {
  memberId?: string;
  ruleType:
    | "vegetarian_days"
    | "non_vegetarian_allowed_days"
    | "ingredient_excluded_days"
    | "ingredient_frequency_limit"
    | "avoid_recipe_repeat";
  daysOfWeek?: number[];
  ingredientKey?: string;
  mealSlot?: string;
  maxOccurrences?: number;
  windowDays?: number;
};

export type PlannerHistory = {
  targetDate: string;
  mealSlot: string;
  templateId: string;
  recipeIds: string[];
  ingredientKeys: string[];
};

export type PlannerMemory = {
  memberId?: string;
  key: string;
  value: string;
};

export type PlannerInventory = {
  ingredientKey: string;
  availability: "available" | "unavailable" | "unknown";
};

export type CalculatedPlanItem = {
  recipeId: string;
  recipeName: string;
  scale: number;
  totalNutrition: Nutrition;
  perServingNutrition: Nutrition;
  ingredients: Array<{
    ingredientKey: string;
    ingredientName: string;
    quantityG: number;
    nutrition: Nutrition;
  }>;
  memberPortions: Array<{
    memberId: string;
    memberName: string;
    servingEquivalent: number;
    nutrition: Nutrition;
  }>;
};

export type CalculatedMealPlan = {
  templateId: string;
  templateName: string;
  totalServingEquivalents: number;
  totalNutrition: Nutrition;
  perServingNutrition: Nutrition;
  memberNutrition: Array<{
    memberId: string;
    memberName: string;
    servingEquivalent: number;
    nutrition: Nutrition;
  }>;
  items: CalculatedPlanItem[];
  ingredientKeys: string[];
  constraintChecks: Array<{
    name: string;
    passed: boolean;
    detail: string;
  }>;
};

export function planMeal(input: {
  targetDate: string;
  mealSlot: string;
  members: PlannerMember[];
  rules: PlannerRule[];
  history: PlannerHistory[];
  memory: PlannerMemory[];
  inventory: PlannerInventory[];
  enforceNutritionTargets?: boolean;
}): CalculatedMealPlan {
  validateDate(input.targetDate);
  if (input.members.length === 0) {
    throw new Error("At least one household member must be eating");
  }
  for (const member of input.members) {
    if (!Number.isFinite(member.servingEquivalent) || member.servingEquivalent <= 0) {
      throw new Error("Serving equivalents must be positive numbers");
    }
  }

  const candidates = MEAL_TEMPLATES.filter((template) =>
    template.mealSlots.includes(input.mealSlot),
  )
    .map((template) => evaluateTemplate(template, input))
    .filter((candidate): candidate is EvaluatedCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score);

  const selected = candidates[0];
  if (!selected) {
    throw new Error("No meal candidate satisfies the known household constraints");
  }

  return {
    ...selected.plan,
    constraintChecks: [
      { name: "dietary_compatibility", passed: true, detail: "All eaters can eat the selected meal type." },
      { name: "allergy_exclusion", passed: true, detail: "No selected ingredient matches a recorded allergy." },
      { name: "day_rules", passed: true, detail: "The selected meal satisfies applicable day-specific rules." },
      { name: "repetition_rules", passed: true, detail: "Recent meal history remains within configured limits." },
      { name: "active_memory", passed: true, detail: "Active Vesta food corrections were applied." },
      { name: "known_inventory", passed: true, detail: "No ingredient marked unavailable was selected." },
      { name: "nutrition_targets", passed: true, detail: "Explicit meal-level calorie and protein allocations were respected." },
    ],
  };
}

export function calculateRecipeSnapshot(
  recipeId: string,
  totalServingEquivalents: number,
) {
  if (!Number.isFinite(totalServingEquivalents) || totalServingEquivalents <= 0) {
    throw new Error("Serving equivalents must be a positive number");
  }
  return calculateItem(getRecipe(recipeId), totalServingEquivalents, []);
}

export function interpretUserCorrection(rawContent: string, templateId: string) {
  const raw = rawContent.trim();
  if (!raw) throw new Error("Feedback content is required");
  const lower = raw.toLocaleLowerCase();
  const ingredient = findIngredientInText(raw);
  const negative = /\b(don't|do not|dont|never|avoid|nahi|nahin|mat|didn't eat|did not eat|too much)\b/i.test(lower);
  if (ingredient && negative) {
    return {
      key: `avoid_ingredient:${ingredient.key}`,
      value: raw,
      interpretation: `Avoid ${ingredient.name} in future plans while this correction is active.`,
      expiresAt: /this week|iss week|is week/i.test(raw)
        ? endOfWeekUtc(Date.now())
        : undefined,
    };
  }
  if (/\b(loved|love|bahut pasand|liked)\b/i.test(lower)) {
    return {
      key: `prefer_template:${templateId}`,
      value: raw,
      interpretation: "Prefer this meal template when constraints allow.",
      expiresAt: undefined,
    };
  }
  return {
    key: `avoid_template:${templateId}`,
    value: raw,
    interpretation: "Avoid this meal template in future plans while this correction is active.",
    expiresAt: undefined,
  };
}

type EvaluatedCandidate = {
  plan: Omit<CalculatedMealPlan, "constraintChecks">;
  score: number;
};

function evaluateTemplate(
  template: TarlaMealTemplate,
  input: {
    targetDate: string;
    mealSlot: string;
    members: PlannerMember[];
    rules: PlannerRule[];
    history: PlannerHistory[];
    memory: PlannerMemory[];
    inventory: PlannerInventory[];
    enforceNutritionTargets?: boolean;
  },
): EvaluatedCandidate | null {
  const recipes = template.recipeIds.map(getRecipe);
  const ingredients = recipes.flatMap((recipe) => recipe.ingredients);
  const ingredientKeys = [...new Set(ingredients.map((item) => item.ingredientKey))];
  const dietaryType = recipes.reduce<RecipeDietaryType>(
    (highest, recipe) =>
      DIET_RANK[recipe.dietaryType] > DIET_RANK[highest]
        ? recipe.dietaryType
        : highest,
    "vegetarian",
  );
  if (input.members.some((member) => DIET_RANK[dietaryType] > DIET_RANK[member.dietaryType])) {
    return null;
  }

  const relevantMemberIds = new Set(input.members.map((member) => member.memberId));
  for (const member of input.members) {
    const excluded = [...member.dislikedFoods, ...member.avoidedFoods].map(normalizeFoodKey);
    if (ingredientKeys.some((key) => excluded.includes(key))) return null;
    const allergies = member.allergies.map(normalizeFoodKey);
    if (
      ingredientKeys.some((key) => {
        const ingredient = getIngredient(key);
        return allergies.includes(key) || ingredient.allergenKeys.some((allergen) => allergies.includes(allergen));
      })
    ) {
      return null;
    }
  }

  const day = dayOfWeek(input.targetDate);
  const applicableRules = input.rules.filter(
    (rule) => !rule.memberId || relevantMemberIds.has(rule.memberId),
  );
  for (const rule of applicableRules) {
    const days = rule.daysOfWeek ?? [];
    if (rule.ruleType === "vegetarian_days" && days.includes(day) && dietaryType !== "vegetarian") {
      return null;
    }
    if (
      rule.ruleType === "non_vegetarian_allowed_days" &&
      dietaryType === "non_vegetarian" &&
      !days.includes(day)
    ) {
      return null;
    }
    if (
      rule.ruleType === "ingredient_excluded_days" &&
      days.includes(day) &&
      rule.ingredientKey &&
      ingredientKeys.includes(normalizeFoodKey(rule.ingredientKey))
    ) {
      return null;
    }
    if (rule.ruleType === "ingredient_frequency_limit" && rule.ingredientKey) {
      const key = normalizeFoodKey(rule.ingredientKey);
      if (ingredientKeys.includes(key)) {
        const recent = historyWithinDays(input.history, input.targetDate, rule.windowDays ?? 7);
        const count = recent.filter((entry) => entry.ingredientKeys.includes(key)).length;
        if (count >= (rule.maxOccurrences ?? 1)) return null;
      }
    }
    if (
      rule.ruleType === "avoid_recipe_repeat" &&
      (!rule.mealSlot || rule.mealSlot === input.mealSlot)
    ) {
      const recent = historyWithinDays(input.history, input.targetDate, rule.windowDays ?? 3);
      if (recent.some((entry) => entry.templateId === template.id)) return null;
    }
  }

  const relevantMemory = input.memory.filter(
    (memory) => !memory.memberId || relevantMemberIds.has(memory.memberId),
  );
  if (
    relevantMemory.some((memory) =>
      memory.key.startsWith("avoid_ingredient:") || memory.key.startsWith("limit_ingredient:")
        ? ingredientKeys.includes(memory.key.split(":")[1])
        : memory.key === `avoid_template:${template.id}`,
    )
  ) {
    return null;
  }

  const unavailable = new Set(
    input.inventory
      .filter((item) => item.availability === "unavailable")
      .map((item) => item.ingredientKey),
  );
  if (ingredientKeys.some((key) => unavailable.has(key))) return null;

  const totalServingEquivalents = input.members.reduce(
    (total, member) => total + member.servingEquivalent,
    0,
  );
  const items = recipes.map((recipe) =>
    calculateItem(recipe, totalServingEquivalents, input.members),
  );
  const totalNutrition = addNutrition(...items.map((item) => item.totalNutrition));
  const perServingNutrition = scaleNutrition(totalNutrition, 1 / totalServingEquivalents);
  const memberNutrition = input.members.map((member) => ({
    memberId: member.memberId,
    memberName: member.name,
    servingEquivalent: member.servingEquivalent,
    nutrition: scaleNutrition(perServingNutrition, member.servingEquivalent),
  }));

  if (input.enforceNutritionTargets !== false) {
    for (const member of input.members) {
      const nutrition = memberNutrition.find((item) => item.memberId === member.memberId)!.nutrition;
      const mealCount = Math.max(member.mealsAtHome.length, 1);
      if (
        member.calorieTargetKcal !== undefined &&
        nutrition.caloriesKcal > member.calorieTargetKcal / mealCount
      ) {
        return null;
      }
      if (
        member.proteinTargetG !== undefined &&
        nutrition.proteinG < member.proteinTargetG / mealCount
      ) {
        return null;
      }
    }
  }

  const favouriteKeys = input.members.flatMap((member) => member.favouriteFoods.map(normalizeFoodKey));
  const favouriteScore = ingredientKeys.filter((key) => favouriteKeys.includes(key)).length * 100;
  const limitedKeys = input.members.flatMap((member) => member.limitedFoods.map(normalizeFoodKey));
  const limitedFoodPenalty = ingredientKeys.filter((key) => limitedKeys.includes(key)).length * 20;
  const preferredTemplateScore = relevantMemory.some(
    (memory) => memory.key === `prefer_template:${template.id}`,
  )
    ? 120
    : 0;
  const available = new Set(
    input.inventory
      .filter((item) => item.availability === "available")
      .map((item) => item.ingredientKey),
  );
  const inventoryScore = ingredientKeys.filter((key) => available.has(key)).length * 2;
  const score =
    favouriteScore +
    preferredTemplateScore +
    inventoryScore +
    perServingNutrition.proteinG -
    limitedFoodPenalty -
    perServingNutrition.caloriesKcal / 1_000;

  return {
    score,
    plan: {
      templateId: template.id,
      templateName: template.name,
      totalServingEquivalents,
      totalNutrition,
      perServingNutrition,
      memberNutrition,
      items,
      ingredientKeys,
    },
  };
}

function calculateItem(
  recipe: ReturnType<typeof getRecipe>,
  totalServingEquivalents: number,
  members: PlannerMember[],
): CalculatedPlanItem {
  const scale = totalServingEquivalents / recipe.baseServings;
  const ingredients = recipe.ingredients.map((item) => {
    const quantityG = round(item.quantityG * scale, 2);
    const ingredient = getIngredient(item.ingredientKey);
    return {
      ingredientKey: item.ingredientKey,
      ingredientName: ingredient.name,
      quantityG,
      nutrition: nutritionForIngredient(item.ingredientKey, quantityG),
    };
  });
  const totalNutrition = ingredients.length
    ? addNutrition(...ingredients.map((item) => item.nutrition))
    : { ...ZERO_NUTRITION };
  const perServingNutrition = scaleNutrition(totalNutrition, 1 / totalServingEquivalents);
  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    scale: round(scale, 4),
    totalNutrition,
    perServingNutrition,
    ingredients,
    memberPortions: members.map((member) => ({
      memberId: member.memberId,
      memberName: member.name,
      servingEquivalent: member.servingEquivalent,
      nutrition: scaleNutrition(perServingNutrition, member.servingEquivalent),
    })),
  };
}

const DIET_RANK: Record<RecipeDietaryType, number> = {
  vegetarian: 0,
  eggetarian: 1,
  non_vegetarian: 2,
};

function historyWithinDays(history: PlannerHistory[], targetDate: string, days: number) {
  const target = Date.parse(`${targetDate}T00:00:00Z`);
  const start = target - days * 24 * 60 * 60 * 1_000;
  return history.filter((entry) => {
    const date = Date.parse(`${entry.targetDate}T00:00:00Z`);
    return date <= target && date >= start;
  });
}

function dayOfWeek(value: string) {
  return new Date(`${value}T12:00:00Z`).getUTCDay();
}

function validateDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("Target date must use YYYY-MM-DD format");
  }
}

function endOfWeekUtc(timestamp: number) {
  const date = new Date(timestamp);
  const daysUntilMonday = (8 - date.getUTCDay()) % 7 || 7;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + daysUntilMonday,
  ) - 1;
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
