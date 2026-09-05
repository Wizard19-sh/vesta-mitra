import { findIngredientInText } from "./tarlaIngredientData";

export type TarlaCookSignalInterpretation =
  | {
      kind: "missing_ingredient";
      ingredientKey: string;
      ingredientName: string;
      summary: string;
    }
  | {
      kind: "shopping_needed_acknowledged";
      ingredientKey: string;
      ingredientName: string;
      summary: string;
    }
  | { kind: "recipe_question"; summary: string }
  | { kind: "acknowledgement"; summary: string }
  | { kind: "timing_issue"; summary: string }
  | { kind: "unrelated"; summary: string };

export function interpretTarlaCookSignal(input: {
  signalType: "text" | "reaction" | "acknowledgement";
  rawContent: string;
  activeIngredients?: Array<{
    ingredientKey: string;
    ingredientName: string;
  }>;
}): TarlaCookSignalInterpretation {
  const raw = input.rawContent.trim();
  const lower = raw.toLocaleLowerCase();
  if (input.signalType === "acknowledgement") {
    return {
      kind: "acknowledgement",
      summary: "Cook acknowledged the instruction; this does not claim the meal was prepared.",
    };
  }
  if (input.signalType === "reaction") {
    return {
      kind: "acknowledgement",
      summary: "Cook reaction was preserved as an acknowledgement only.",
    };
  }

  const ingredient =
    findIngredientInText(raw) ??
    resolveSingleContextIngredient(lower, input.activeIngredients);
  const pendingPassiveOrder =
    /\b(?:need|needs|have|has)\s+to\s+be\s+ordered\b/i.test(lower);
  const shoppingNeeded =
    (/\b(order|buy|purchase|mangwana|mangana|mangwa|kharidna|need\s+to\s+get|needs\s+to\s+get|have\s+to\s+get|has\s+to\s+get)\b/i.test(
      lower,
    ) || pendingPassiveOrder) &&
    (!/\b(ordered|bought|purchased)\b/i.test(lower) || pendingPassiveOrder) &&
    !/\b(?:do not|don't|dont|not|nahi|nahin|mat)\s+(?:need\s+to\s+)?(?:order|buy|purchase|get|mang\w*|kharid\w*)\b/i.test(
      lower,
    ) &&
    !/\b(?:order|buy|purchase|mang\w*|kharid\w*)\s+(?:nahi|nahin|mat)\b/i.test(
      lower,
    );
  const accepted =
    /\b(no problem|ok|okay|fine|theek hai|thik hai)\b/i.test(lower) &&
    !/\b(?:not|isn't|is not|nahi|nahin)\s+(?:ok|okay|fine)\b/i.test(lower);
  if (ingredient && shoppingNeeded && accepted) {
    return {
      kind: "shopping_needed_acknowledged",
      ingredientKey: ingredient.key,
      ingredientName: ingredient.name,
      summary: `Cook said ${ingredient.name} needs ordering and accepted the current instruction.`,
    };
  }
  if (
    ingredient &&
    /\b(nahi hai|nahin hai|not available|unavailable|out of|khatam|finished)\b/i.test(lower)
  ) {
    return {
      kind: "missing_ingredient",
      ingredientKey: ingredient.key,
      ingredientName: ingredient.name,
      summary: `Cook reported ${ingredient.name} unavailable for this execution.`,
    };
  }
  if (/\?|\b(kaise|kitna|kitni|recipe|how do|how much|banau|banana hai)\b/i.test(lower)) {
    return {
      kind: "recipe_question",
      summary: "Cook asked a recipe or quantity question; the execution remains open.",
    };
  }
  if (/\b(late|der|time|kal|tomorrow|nahi aa|cannot come|can't come)\b/i.test(lower)) {
    return {
      kind: "timing_issue",
      summary: "Cook reported a timing constraint; the execution remains unresolved.",
    };
  }
  if (/^(ok|okay|haan|han|theek hai|thik hai|done|will do)[.! ]*$/i.test(lower)) {
    return {
      kind: "acknowledgement",
      summary: "Cook acknowledged the instruction; this does not claim the meal was prepared.",
    };
  }
  return {
    kind: "unrelated",
    summary: "Cook message was preserved but did not resolve this meal execution.",
  };
}

function resolveSingleContextIngredient(
  lower: string,
  activeIngredients:
    | Array<{ ingredientKey: string; ingredientName: string }>
    | undefined,
) {
  if (!/\b(it|this|yeh|ye|isko|usko|item|ingredient)\b/i.test(lower)) {
    return undefined;
  }
  const unique = [
    ...new Map(
      (activeIngredients ?? []).map((ingredient) => [
        ingredient.ingredientKey,
        ingredient,
      ]),
    ).values(),
  ];
  if (unique.length !== 1) return undefined;
  return {
    key: unique[0].ingredientKey,
    name: unique[0].ingredientName,
  };
}
