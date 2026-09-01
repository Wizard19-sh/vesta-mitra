export type RecipeDietaryType =
  | "vegetarian"
  | "eggetarian"
  | "non_vegetarian";

export type TarlaRecipe = {
  id: string;
  name: string;
  dietaryType: RecipeDietaryType;
  mealSlots: string[];
  baseServings: number;
  ingredients: Array<{
    ingredientKey: string;
    quantityG: number;
  }>;
  cookLine: string;
};

export type TarlaMealTemplate = {
  id: string;
  name: string;
  mealSlots: string[];
  recipeIds: string[];
};

export const RECIPES: TarlaRecipe[] = [
  recipe("paneer_bhurji", "Paneer bhurji", "vegetarian", ["lunch", "dinner"], [
    ["paneer", 500], ["tomato", 200], ["onion", 150], ["oil", 15],
  ], "Make a lightly spiced paneer bhurji."),
  recipe("palak_tofu", "Palak tofu", "vegetarian", ["lunch", "dinner"], [
    ["tofu", 600], ["spinach", 400], ["tomato", 200], ["onion", 150], ["oil", 15],
  ], "Make palak tofu with moderate seasoning."),
  recipe("tofu_bhurji", "Tofu bhurji", "vegetarian", ["lunch", "dinner"], [
    ["tofu", 600], ["tomato", 250], ["onion", 200], ["oil", 15],
  ], "Make a lightly spiced tofu bhurji."),
  recipe("moong_dal", "Moong dal", "vegetarian", ["lunch", "dinner"], [
    ["moong_dal", 200], ["tomato", 150], ["onion", 100], ["oil", 10],
  ], "Cook a simple moong dal."),
  recipe("cucumber_salad", "Cucumber salad", "vegetarian", ["lunch", "dinner"], [
    ["cucumber", 500], ["lemon", 50],
  ], "Prepare fresh cucumber salad with lemon."),
  recipe("chole", "Chole", "vegetarian", ["lunch", "dinner"], [
    ["chickpeas", 240], ["tomato", 200], ["onion", 150], ["oil", 15],
  ], "Cook a home-style chole."),
  recipe("plain_rice", "Plain rice", "vegetarian", ["lunch", "dinner"], [
    ["rice", 200],
  ], "Cook plain rice."),
  recipe("egg_bhurji", "Egg bhurji", "eggetarian", ["breakfast", "lunch", "dinner"], [
    ["egg", 400], ["tomato", 200], ["onion", 150], ["oil", 10],
  ], "Make a lightly spiced egg bhurji."),
  recipe("chicken_curry", "Chicken curry", "non_vegetarian", ["lunch", "dinner"], [
    ["chicken", 600], ["tomato", 250], ["onion", 200], ["oil", 20],
  ], "Cook a simple home-style chicken curry."),
  recipe("besan_chilla", "Besan chilla", "vegetarian", ["breakfast"], [
    ["besan", 240], ["tomato", 150], ["onion", 150], ["oil", 10],
  ], "Make thin besan chillas with vegetables."),
  recipe("curd_bowl", "Curd", "vegetarian", ["breakfast", "lunch"], [
    ["curd", 400],
  ], "Serve plain curd."),
  recipe("sprouts_chaat", "Moong sprouts chaat", "vegetarian", ["breakfast", "snack"], [
    ["moong_sprouts", 800], ["tomato", 200], ["onion", 100], ["lemon", 50],
  ], "Mix a fresh, lightly seasoned sprouts chaat."),
  recipe("peanut_poha", "Poha with peanuts", "vegetarian", ["breakfast"], [
    ["poha", 300], ["peanut", 60], ["onion", 150], ["oil", 15],
  ], "Make poha with peanuts."),
  recipe("bhindi_sabzi", "Bhindi sabzi", "vegetarian", ["lunch", "dinner"], [
    ["bhindi", 600], ["onion", 150], ["oil", 15],
  ], "Make a dry bhindi sabzi."),
  recipe("soy_chunk_masala", "Soy chunk masala", "vegetarian", ["lunch", "dinner"], [
    ["soy_chunks", 240], ["tomato", 250], ["onion", 200], ["oil", 15],
  ], "Cook soy chunks in a light tomato-onion masala."),
];

export const MEAL_TEMPLATES: TarlaMealTemplate[] = [
  template("paneer_dal_salad", "Paneer bhurji, moong dal and cucumber salad", ["lunch", "dinner"], ["paneer_bhurji", "moong_dal", "cucumber_salad"]),
  template("palak_tofu_dal_salad", "Palak tofu, moong dal and cucumber salad", ["lunch", "dinner"], ["palak_tofu", "moong_dal", "cucumber_salad"]),
  template("tofu_dal_salad", "Tofu bhurji, moong dal and cucumber salad", ["lunch", "dinner"], ["tofu_bhurji", "moong_dal", "cucumber_salad"]),
  template("soy_bhindi_salad", "Soy chunk masala, bhindi and cucumber salad", ["lunch", "dinner"], ["soy_chunk_masala", "bhindi_sabzi", "cucumber_salad"]),
  template("chole_rice_salad", "Chole, rice and cucumber salad", ["lunch", "dinner"], ["chole", "plain_rice", "cucumber_salad"]),
  template("egg_dal_salad", "Egg bhurji, moong dal and cucumber salad", ["lunch", "dinner"], ["egg_bhurji", "moong_dal", "cucumber_salad"]),
  template("chicken_rice_salad", "Chicken curry, rice and cucumber salad", ["lunch", "dinner"], ["chicken_curry", "plain_rice", "cucumber_salad"]),
  template("besan_chilla_curd", "Besan chilla with curd", ["breakfast"], ["besan_chilla", "curd_bowl"]),
  template("sprouts_breakfast", "Moong sprouts chaat with curd", ["breakfast"], ["sprouts_chaat", "curd_bowl"]),
  template("peanut_poha_breakfast", "Poha with peanuts and curd", ["breakfast"], ["peanut_poha", "curd_bowl"]),
  template("sprouts_snack", "Moong sprouts chaat", ["snack"], ["sprouts_chaat"]),
];

const RECIPE_BY_ID = new Map(RECIPES.map((item) => [item.id, item]));

export function getRecipe(recipeId: string) {
  const found = RECIPE_BY_ID.get(recipeId);
  if (!found) throw new Error(`Unknown recipe: ${recipeId}`);
  return found;
}

function recipe(
  id: string,
  name: string,
  dietaryType: RecipeDietaryType,
  mealSlots: string[],
  ingredients: Array<[string, number]>,
  cookLine: string,
): TarlaRecipe {
  return {
    id,
    name,
    dietaryType,
    mealSlots,
    baseServings: 4,
    ingredients: ingredients.map(([ingredientKey, quantityG]) => ({ ingredientKey, quantityG })),
    cookLine,
  };
}

function template(
  id: string,
  name: string,
  mealSlots: string[],
  recipeIds: string[],
): TarlaMealTemplate {
  return { id, name, mealSlots, recipeIds };
}
