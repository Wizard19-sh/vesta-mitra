export const TARLA_W3_EVAL_SET = [
  {
    id: "vegetarian_high_protein_low_calorie",
    name: "VEGETARIAN HIGH-PROTEIN / LOW-CALORIE",
    expected: "Vegetarian plan stays within the explicit meal calorie allocation and reaches the protein allocation.",
  },
  {
    id: "day_specific_vegetarian_rule",
    name: "DAY-SPECIFIC VEGETARIAN RULE",
    expected: "A Tuesday vegetarian rule excludes egg and chicken templates even for a non-vegetarian member.",
  },
  {
    id: "allergy_exclusion",
    name: "ALLERGY EXCLUSION",
    expected: "A peanut allergy excludes the peanut-poha candidate.",
  },
  {
    id: "paneer_repetition_limit",
    name: "PANEER REPETITION LIMIT",
    expected: "Paneer history at the configured limit forces another protein source.",
  },
  {
    id: "conflicting_household_preferences",
    name: "CONFLICTING HOUSEHOLD PREFERENCES",
    expected: "A common compatible meal is selected with distinct adult and child serving equivalents and cook notes.",
  },
  {
    id: "user_rejects_plan",
    name: "USER REJECTS PLAN",
    expected: "Raw correction persists, Vesta memory is created, and both the immediate and future plan avoid paneer.",
  },
  {
    id: "missing_ingredient",
    name: "MISSING INGREDIENT",
    expected: "Palak is replaced, nutrition is recalculated, shopping-needed is updated, and the user is not interrupted.",
  },
  {
    id: "cook_asks_recipe_question",
    name: "COOK ASKS RECIPE QUESTION",
    expected: "Raw question remains linked, a concise answer is sent, and the task is not falsely completed.",
  },
  {
    id: "no_cook_response",
    name: "NO COOK RESPONSE",
    expected: "Execution starts waiting and reaches no_response without claiming meal completion.",
  },
  {
    id: "nutrition_calculation",
    name: "NUTRITION CALCULATION",
    expected: "Known rice quantities produce the exact deterministic nutrition total.",
  },
];
