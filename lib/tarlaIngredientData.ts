export type Nutrition = {
  caloriesKcal: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fibreG: number;
};

export type NutritionIngredient = {
  key: string;
  name: string;
  aliases: string[];
  allergenKeys: string[];
  per100g: Nutrition;
};

export const INGREDIENTS: NutritionIngredient[] = [
  ingredient("besan", "besan", ["gram flour", "chickpea flour"], 387, 22.4, 57.8, 6.7, 10.8),
  ingredient("curd", "curd", ["dahi", "yogurt"], 63, 5.25, 7.04, 1.55, 0, ["milk"]),
  ingredient("tofu", "tofu", ["soy tofu"], 144, 17.3, 2.8, 8.7, 2.3, ["soy"]),
  ingredient("moong_dal", "moong dal", ["mung dal", "yellow moong"], 347, 24.5, 59.9, 1.2, 8.2),
  ingredient("whole_wheat_flour", "whole-wheat flour", ["atta", "wheat flour"], 364, 12.1, 72, 1.7, 10.7, ["wheat", "gluten"]),
  ingredient("spinach", "palak", ["spinach"], 23, 2.9, 3.6, 0.4, 2.2),
  ingredient("tomato", "tomato", ["tamatar", "tomatoes"], 18, 0.9, 3.9, 0.2, 1.2),
  ingredient("onion", "onion", ["pyaaz", "pyaz", "onions"], 40, 1.1, 9.3, 0.1, 1.7),
  ingredient("oil", "cooking oil", ["oil", "tel"], 884, 0, 0, 100, 0),
  ingredient("cucumber", "cucumber", ["kheera", "cucumbers"], 15, 0.65, 3.6, 0.1, 0.5),
  ingredient("paneer", "paneer", ["cottage cheese"], 265, 18.3, 1.2, 20.8, 0, ["milk"]),
  ingredient("chickpeas", "chickpeas", ["chole", "chana"], 364, 19.3, 60.7, 6, 17.4),
  ingredient("rice", "rice", ["chawal", "basmati"], 365, 7.1, 80, 0.7, 1.3),
  ingredient("egg", "egg", ["eggs", "anda", "ande"], 155, 12.6, 1.1, 10.6, 0, ["egg"]),
  ingredient("chicken", "chicken", ["murgh"], 120, 22.5, 0, 2.6, 0),
  ingredient("poha", "poha", ["flattened rice"], 350, 6.7, 76.9, 1.2, 1.3),
  ingredient("peanut", "peanut", ["peanuts", "moongfali", "groundnut"], 567, 25.8, 16.1, 49.2, 8.5, ["peanut"]),
  ingredient("moong_sprouts", "moong sprouts", ["sprouts", "mung sprouts"], 30, 3, 5.9, 0.2, 1.8),
  ingredient("bhindi", "bhindi", ["okra", "ladyfinger"], 33, 1.9, 7.5, 0.2, 3.2),
  ingredient("soy_chunks", "soy chunks", ["soya chunks", "nutrela"], 345, 52, 33, 0.5, 13, ["soy"]),
  ingredient("lemon", "lemon", ["nimbu", "lime"], 29, 1.1, 9.3, 0.3, 2.8),
];

const BY_KEY = new Map(INGREDIENTS.map((item) => [item.key, item]));

export function getIngredient(key: string) {
  const item = BY_KEY.get(normalizeKey(key));
  if (!item) throw new Error(`Unknown nutrition ingredient: ${key}`);
  return item;
}

export function findIngredientInText(raw: string) {
  const text = raw.toLocaleLowerCase();
  return INGREDIENTS.find((item) =>
    [item.key.replaceAll("_", " "), item.name, ...item.aliases].some((alias) =>
      new RegExp(`\\b${escapeRegExp(alias.toLocaleLowerCase())}\\b`, "i").test(text),
    ),
  );
}

export function normalizeFoodKey(value: string) {
  const match = findIngredientInText(value);
  return match?.key ?? normalizeKey(value);
}

function ingredient(
  key: string,
  name: string,
  aliases: string[],
  caloriesKcal: number,
  proteinG: number,
  carbohydratesG: number,
  fatG: number,
  fibreG: number,
  allergenKeys: string[] = [],
): NutritionIngredient {
  return {
    key,
    name,
    aliases,
    allergenKeys,
    per100g: { caloriesKcal, proteinG, carbohydratesG, fatG, fibreG },
  };
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
