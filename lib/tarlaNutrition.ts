import { getIngredient, type Nutrition } from "./tarlaIngredientData";

export type ActivityLevel =
  | "sedentary"
  | "lightly_active"
  | "moderately_active"
  | "very_active"
  | "extra_active";

export type NutritionGoal =
  | "maintenance"
  | "deficit_10"
  | "deficit_20"
  | "custom";

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export const ZERO_NUTRITION: Nutrition = {
  caloriesKcal: 0,
  proteinG: 0,
  carbohydratesG: 0,
  fatG: 0,
  fibreG: 0,
};

export function estimateEnergy(input: {
  age: number;
  sex: "male" | "female";
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: NutritionGoal;
  customCalorieTargetKcal?: number;
}) {
  positive(input.age, "Age");
  positive(input.heightCm, "Height");
  positive(input.weightKg, "Weight");
  const sexAdjustment = input.sex === "male" ? 5 : -161;
  const bmr =
    10 * input.weightKg +
    6.25 * input.heightCm -
    5 * input.age +
    sexAdjustment;
  const activityMultiplier = ACTIVITY_MULTIPLIERS[input.activityLevel];
  const tdee = bmr * activityMultiplier;
  const goalMultiplier =
    input.goal === "deficit_10"
      ? 0.9
      : input.goal === "deficit_20"
        ? 0.8
        : 1;
  const target =
    input.goal === "custom"
      ? requiredPositive(input.customCalorieTargetKcal, "Custom calorie target")
      : tdee * goalMultiplier;
  return {
    equation: "mifflin_st_jeor" as const,
    estimateLabel: "Non-clinical estimate based on Mifflin-St Jeor",
    activityMultiplier,
    estimatedBmrKcal: round(bmr, 0),
    estimatedTdeeKcal: round(tdee, 0),
    calorieTargetKcal: round(target, 0),
  };
}

export function nutritionForIngredient(ingredientKey: string, quantityG: number) {
  if (!Number.isFinite(quantityG) || quantityG < 0) {
    throw new Error("Ingredient quantity must be a non-negative number");
  }
  const ingredient = getIngredient(ingredientKey);
  return scaleNutrition(ingredient.per100g, quantityG / 100);
}

export function addNutrition(...values: Nutrition[]) {
  return values.reduce(
    (total, value) => ({
      caloriesKcal: total.caloriesKcal + value.caloriesKcal,
      proteinG: total.proteinG + value.proteinG,
      carbohydratesG: total.carbohydratesG + value.carbohydratesG,
      fatG: total.fatG + value.fatG,
      fibreG: total.fibreG + value.fibreG,
    }),
    { ...ZERO_NUTRITION },
  );
}

export function scaleNutrition(value: Nutrition, factor: number) {
  return roundNutrition({
    caloriesKcal: value.caloriesKcal * factor,
    proteinG: value.proteinG * factor,
    carbohydratesG: value.carbohydratesG * factor,
    fatG: value.fatG * factor,
    fibreG: value.fibreG * factor,
  });
}

export function roundNutrition(value: Nutrition) {
  return {
    caloriesKcal: round(value.caloriesKcal, 2),
    proteinG: round(value.proteinG, 2),
    carbohydratesG: round(value.carbohydratesG, 2),
    fatG: round(value.fatG, 2),
    fibreG: round(value.fibreG, 2),
  };
}

function requiredPositive(value: number | undefined, label: string) {
  if (value === undefined) throw new Error(`${label} is required`);
  positive(value, label);
  return value;
}

function positive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
