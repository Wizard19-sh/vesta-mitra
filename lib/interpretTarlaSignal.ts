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

  const ingredient = findIngredientInText(raw);
  const shoppingNeeded =
    /\b(order\s+(?:karna|karni)\s+padega|mangwana\s+padega|order\s+kar\s+lena)\b/i.test(
      lower,
    );
  const accepted = /\b(no problem|theek hai|thik hai)\b/i.test(lower);
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
