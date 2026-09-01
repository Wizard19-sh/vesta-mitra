import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { TARLA_W3_EVAL_SET } from "./tarla-w3-eval-cases.mjs";

const localEnvironment = readEnvironmentFile(
  fileURLToPath(new URL("../.env.local", import.meta.url)),
);
const deployment =
  process.env.CONVEX_DEPLOYMENT ?? localEnvironment.CONVEX_DEPLOYMENT;
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  process.env.CONVEX_URL ??
  localEnvironment.NEXT_PUBLIC_CONVEX_URL ??
  localEnvironment.CONVEX_URL;

if (!deployment?.startsWith("dev:")) {
  throw new Error("W3 verification only runs against a Convex dev deployment");
}
if (!convexUrl) throw new Error("Convex development URL not found");

const client = new ConvexHttpClient(convexUrl);
const reference = (name) => makeFunctionReference(name);
const mutate = (name, args) => client.mutation(reference(name), args);
const query = (name, args) => client.query(reference(name), args);
const fixtureKey = new Date().toISOString().replace(/[^0-9]/g, "");
const ownerKey = `w3-verification-${fixtureKey}`;
const timezone = "Asia/Kolkata";
const targetDate = "2026-09-01";

console.log("Creating a fresh W3 household with primary user, adult, child, and cook...");
const householdId = await mutate("vesta:createHousehold", {
  ownerKey,
  name: "W3 Isolated Tarla Household",
  timezone,
});
const [primaryUserId, adultId, childId, cookId] = await Promise.all([
  mutate("vesta:addMember", {
    ownerKey,
    householdId,
    name: "W3 Test Sid",
    role: "primary user",
    age: 35,
    sex: "Male",
    heightCm: 175,
    weightKg: 75,
    languagePreference: "English",
  }),
  mutate("vesta:addMember", {
    ownerKey,
    householdId,
    name: "W3 Test Mira",
    role: "spouse",
    age: 34,
    sex: "Female",
    heightCm: 162,
    weightKg: 58,
    languagePreference: "English",
  }),
  mutate("vesta:addMember", {
    ownerKey,
    householdId,
    name: "W3 Test Child",
    role: "child",
    age: 9,
    languagePreference: "English",
  }),
  mutate("vesta:addMember", {
    ownerKey,
    householdId,
    name: "Didi",
    role: "cook",
    languagePreference: "Hindi",
  }),
]);

await mutate("tarlaProfiles:setHouseholdMealContext", {
  ownerKey,
  householdId,
  mealsPreparedAtHome: ["breakfast", "lunch", "dinner"],
  usualMealTimes: [
    { meal: "breakfast", time: "08:30" },
    { meal: "lunch", time: "13:00" },
    { meal: "dinner", time: "20:00" },
  ],
});
await Promise.all([
  mutate("tarlaProfiles:upsertMemberProfile", {
    ownerKey,
    householdId,
    memberId: primaryUserId,
    dietaryType: "vegetarian",
    allergies: ["peanut"],
    dislikedFoods: ["mushroom"],
    avoidedFoods: [],
    limitedFoods: ["paneer"],
    favouriteFoods: ["paneer"],
    mealsAtHome: ["lunch", "dinner"],
    servingEquivalent: 1.25,
    foodContext: "Wants high-protein vegetarian meals under an explicit calorie target.",
    cookNotes: "less oil",
  }),
  mutate("tarlaProfiles:upsertMemberProfile", {
    ownerKey,
    householdId,
    memberId: adultId,
    dietaryType: "eggetarian",
    allergies: [],
    dislikedFoods: ["mushroom"],
    avoidedFoods: [],
    limitedFoods: [],
    favouriteFoods: [],
    mealsAtHome: ["dinner"],
    servingEquivalent: 1,
  }),
  mutate("tarlaProfiles:upsertMemberProfile", {
    ownerKey,
    householdId,
    memberId: childId,
    dietaryType: "vegetarian",
    allergies: ["peanut"],
    dislikedFoods: ["mushroom"],
    avoidedFoods: [],
    limitedFoods: [],
    favouriteFoods: ["paneer"],
    mealsAtHome: ["dinner"],
    servingEquivalent: 0.5,
    cookNotes: "low spice",
  }),
]);

const energyEstimate = await mutate("tarlaProfiles:estimateMemberNutrition", {
  ownerKey,
  householdId,
  memberId: primaryUserId,
  activityLevel: "moderately_active",
  goal: "deficit_10",
});
assert.equal(energyEstimate.equation, "mifflin_st_jeor");
assert.equal(energyEstimate.activityMultiplier, 1.55);
assert.equal(energyEstimate.estimatedBmrKcal, 1674);
assert.equal(energyEstimate.estimatedTdeeKcal, 2594);
assert.equal(energyEstimate.calorieTargetKcal, 2335);
await mutate("tarlaProfiles:setNutritionTargets", {
  ownerKey,
  householdId,
  memberId: primaryUserId,
  calorieTargetKcal: 1600,
  proteinTargetG: 75,
  fatTargetG: 55,
  carbohydratesTargetG: 180,
  fibreTargetG: 25,
});
await mutate("vesta:rememberPreference", {
  ownerKey,
  householdId,
  memberId: primaryUserId,
  category: "tarla_food",
  key: "free_text_profile",
  value: "I want high-protein vegetarian meals under 1600 calories and don't want paneer every day.",
  source: "onboarding",
});

await Promise.all([
  mutate("tarlaProfiles:addDietaryRule", {
    ownerKey,
    householdId,
    ruleType: "vegetarian_days",
    daysOfWeek: [2],
    description: "Household chooses vegetarian food every Tuesday.",
  }),
  mutate("tarlaProfiles:addDietaryRule", {
    ownerKey,
    householdId,
    memberId: primaryUserId,
    ruleType: "ingredient_frequency_limit",
    ingredientKey: "paneer",
    maxOccurrences: 2,
    windowDays: 7,
    description: "Paneer at most twice in seven days.",
  }),
  mutate("tarlaProfiles:addDietaryRule", {
    ownerKey,
    householdId,
    ruleType: "ingredient_excluded_days",
    ingredientKey: "egg",
    daysOfWeek: [2],
    description: "No eggs on Tuesday.",
  }),
  mutate("tarlaProfiles:addDietaryRule", {
    ownerKey,
    householdId,
    ruleType: "avoid_recipe_repeat",
    mealSlot: "breakfast",
    windowDays: 3,
    description: "Do not repeat the same breakfast within three days.",
  }),
]);
await mutate("tarlaProfiles:recordMealHistory", {
  ownerKey,
  householdId,
  targetDate: "2026-08-31",
  mealSlot: "dinner",
  templateId: "paneer_dal_salad",
  recipeIds: ["paneer_bhurji", "moong_dal", "cucumber_salad"],
  ingredientKeys: ["paneer", "moong_dal", "cucumber"],
});

const cookAddress = `+9197${fixtureKey.slice(-8)}`;
const cookEndpointId = await mutate("vesta:addCommunicationEndpoint", {
  ownerKey,
  householdId,
  memberId: cookId,
  channel: "whatsapp",
  address: cookAddress,
  preferredLanguage: "Hindi",
  preferredMode: "text",
  active: true,
  consentStatus: "granted",
});
const cookStateId = await mutate("tarlaProfiles:configureCook", {
  ownerKey,
  householdId,
  memberId: cookId,
  communicationEndpointId: cookEndpointId,
  usualArrivalTime: "17:30",
  cookingConstraints: "Needs the final plan before arrival.",
  communicationTone: "brief and respectful",
});
const priming = await mutate("tarlaProfiles:generateCookPriming", {
  ownerKey,
  householdId,
  cookMemberId: cookId,
  householdUserMemberId: primaryUserId,
});
assert.match(priming.primingMessage, /Tarla/i);
assert.match(priming.primingMessage, /Didi/i);
await mutate("tarlaProfiles:setCookReadiness", {
  ownerKey,
  cookStateId,
  readiness: "ready",
});

for (const ingredient of [
  "paneer",
  "tofu",
  "palak",
  "tomato",
  "onion",
  "moong dal",
  "cucumber",
  "lemon",
  "oil",
]) {
  await mutate("tarlaProfiles:setInventoryItem", {
    ownerKey,
    householdId,
    ingredient,
    availability: "available",
    source: "user",
  });
}

console.log("Generating the first plan and exercising the approval-first correction loop...");
const initial = await createPlan({ targetDate, mealSlot: "dinner" });
let initialDetail = await getPlan(initial.planId);
assert.equal(initialDetail.plan.status, "awaiting_approval");
assert.equal(initialDetail.plan.selectedTemplateId, "paneer_dal_salad");
assert.ok(initialDetail.plan.constraintChecks.every((check) => check.passed));
const primaryNutrition = initialDetail.plan.memberNutrition.find(
  (entry) => entry.memberId === primaryUserId,
);
assert.ok(primaryNutrition);
assert.ok(primaryNutrition.nutrition.caloriesKcal <= 800);
assert.ok(primaryNutrition.nutrition.proteinG >= 37.5);
assert.ok(
  initialDetail.items.every((item) =>
    item.ingredients.every((ingredient) => ingredient.ingredientKey !== "peanut"),
  ),
);

const rawUserCorrection = "Don't give me paneer again this week.";
const replan = await mutate("tarlaPlanning:submitUserFeedback", {
  ownerKey,
  planId: initial.planId,
  memberId: primaryUserId,
  action: "request_change",
  rawContent: rawUserCorrection,
});
assert.equal(replan.action, "replanned");
let revisedDetail = await getPlan(replan.planId);
assert.equal(revisedDetail.plan.selectedTemplateId, "palak_tofu_dal_salad");
assert.equal(initialDetail.plan.selectedTemplateId === revisedDetail.plan.selectedTemplateId, false);
const contextAfterCorrection = await query("tarlaProfiles:getTarlaContext", {
  ownerKey,
  householdId,
});
const paneerMemory = contextAfterCorrection.preferences.find(
  (preference) => preference.key === "avoid_ingredient:paneer",
);
assert.ok(paneerMemory);
assert.equal(paneerMemory.value, rawUserCorrection);
const correctionFeedback = initialDetail.feedback.length
  ? initialDetail.feedback[0]
  : (await getPlan(initial.planId)).feedback[0];
assert.equal(correctionFeedback.rawContent, rawUserCorrection);

console.log("Approving the revised plan and sending one provider-neutral cook instruction...");
const approval = await mutate("tarlaPlanning:submitUserFeedback", {
  ownerKey,
  planId: replan.planId,
  memberId: primaryUserId,
  action: "approve",
  rawContent: "Approved. Please send this to Didi.",
  cookMemberId: cookId,
  responseWindowMs: 30_000,
});
assert.equal(approval.action, "approved_and_sent");
let execution = await getExecution(approval.executionId);
assert.equal(execution.execution.status, "waiting");
assert.equal(execution.outboundMessages.length, 1);
assert.match(execution.execution.instruction, /low spice/i);
assert.match(execution.execution.instruction, /no peanut/i);
assert.equal(execution.run.status, "waiting");

console.log("Injecting the normalized missing-ingredient signal: Palak nahi hai.");
const rawCookConstraint = "Palak nahi hai.";
const missingResult = await mutate("tarlaInbound:ingestCookSignal", {
  ownerKey,
  senderAddress: cookAddress,
  channel: "whatsapp",
  signalType: "text",
  rawContent: rawCookConstraint,
  messageId: `w3-missing-${fixtureKey}`,
  timestamp: Date.now(),
  metadata: { inReplyToMessageId: approval.outboundMessageId },
});
assert.equal(missingResult.state, "revised_waiting");
assert.equal(missingResult.userEscalationRequired, false);
assert.equal(missingResult.replacementTemplateId, "tofu_dal_salad");
execution = await getExecution(approval.executionId);
assert.equal(execution.execution.status, "revised_waiting");
assert.equal(execution.execution.userEscalationRequired, false);
assert.equal(execution.outboundMessages.length, 2);
assert.equal(execution.inboundSignals[0].rawContent, rawCookConstraint);
assert.equal(execution.plan.selectedTemplateId, "tofu_dal_salad");
assert.notDeepEqual(
  execution.plan.perServingNutrition,
  revisedDetail.plan.perServingNutrition,
);
assert.ok(execution.plan.constraintChecks.every((check) => check.passed));
const shopping = await query("tarlaPlanning:listShoppingNeeded", {
  ownerKey,
  householdId,
});
const palakShopping = shopping.find((item) => item.ingredientKey === "spinach");
assert.ok(palakShopping);
assert.equal(palakShopping.status, "needed");
const contextAfterMissing = await query("tarlaProfiles:getTarlaContext", {
  ownerKey,
  householdId,
});
assert.equal(
  contextAfterMissing.inventory.find((item) => item.ingredientKey === "spinach")
    ?.availability,
  "unavailable",
);

console.log("Acknowledging the revised instruction so the main Tarla run completes...");
const finalOutbound = execution.outboundMessages.find(
  (message) => message.messageId === execution.execution.revisedOutboundMessageId,
);
assert.ok(finalOutbound);
await mutate("tarlaInbound:ingestCookSignal", {
  ownerKey,
  senderAddress: cookAddress,
  channel: "whatsapp",
  signalType: "text",
  rawContent: "Theek hai.",
  messageId: `w3-ack-${fixtureKey}`,
  timestamp: Date.now(),
  metadata: { inReplyToMessageId: finalOutbound.messageId },
});
execution = await getExecution(approval.executionId);
assert.equal(execution.execution.status, "acknowledged");
assert.equal(execution.run.status, "completed");
assert.deepEqual(
  execution.steps.map((step) => step.order),
  execution.steps.map((_, index) => index + 1),
);
assert.ok(execution.steps.every((step) => step.status === "completed"));
const rereadExecution = await getExecution(approval.executionId);
assert.equal(rereadExecution.execution.status, execution.execution.status);
assert.equal(rereadExecution.plan.selectedTemplateId, execution.plan.selectedTemplateId);

console.log("Running isolated constraint cases for day rules, allergy, and paneer history...");
const constraintOwnerKey = `w3-constraints-${fixtureKey}`;
const constraintHouseholdId = await mutate("vesta:createHousehold", {
  ownerKey: constraintOwnerKey,
  name: "W3 Constraint Eval Household",
  timezone,
});
const constraintMemberId = await mutate("vesta:addMember", {
  ownerKey: constraintOwnerKey,
  householdId: constraintHouseholdId,
  name: "Constraint Test Adult",
  role: "primary user",
});
await mutate("tarlaProfiles:upsertMemberProfile", {
  ownerKey: constraintOwnerKey,
  householdId: constraintHouseholdId,
  memberId: constraintMemberId,
  dietaryType: "non_vegetarian",
  allergies: ["peanut"],
  favouriteFoods: ["chicken", "paneer", "peanut"],
  mealsAtHome: ["breakfast", "dinner"],
  servingEquivalent: 1,
});
await Promise.all([
  mutate("tarlaProfiles:addDietaryRule", {
    ownerKey: constraintOwnerKey,
    householdId: constraintHouseholdId,
    ruleType: "vegetarian_days",
    daysOfWeek: [2],
    description: "Tuesday is vegetarian for this test household.",
  }),
  mutate("tarlaProfiles:addDietaryRule", {
    ownerKey: constraintOwnerKey,
    householdId: constraintHouseholdId,
    ruleType: "ingredient_frequency_limit",
    ingredientKey: "paneer",
    maxOccurrences: 1,
    windowDays: 7,
    description: "Paneer maximum once per week.",
  }),
]);
await mutate("tarlaProfiles:recordMealHistory", {
  ownerKey: constraintOwnerKey,
  householdId: constraintHouseholdId,
  targetDate: "2026-08-31",
  mealSlot: "dinner",
  templateId: "paneer_dal_salad",
  recipeIds: ["paneer_bhurji"],
  ingredientKeys: ["paneer"],
});
const constraintDinner = await mutate("tarlaPlanning:createMealPlan", {
  ownerKey: constraintOwnerKey,
  householdId: constraintHouseholdId,
  requestedByMemberId: constraintMemberId,
  eaterMemberIds: [constraintMemberId],
  targetDate,
  mealSlot: "dinner",
});
const constraintDinnerDetail = await query("tarlaPlanning:getMealPlan", {
  ownerKey: constraintOwnerKey,
  planId: constraintDinner.planId,
});
const constraintDinnerIngredients = constraintDinnerDetail.items.flatMap((item) =>
  item.ingredients.map((ingredient) => ingredient.ingredientKey),
);
assert.equal(constraintDinnerIngredients.includes("chicken"), false);
assert.equal(constraintDinnerIngredients.includes("egg"), false);
assert.equal(constraintDinnerIngredients.includes("paneer"), false);
const allergyBreakfast = await mutate("tarlaPlanning:createMealPlan", {
  ownerKey: constraintOwnerKey,
  householdId: constraintHouseholdId,
  requestedByMemberId: constraintMemberId,
  eaterMemberIds: [constraintMemberId],
  targetDate,
  mealSlot: "breakfast",
});
const allergyBreakfastDetail = await query("tarlaPlanning:getMealPlan", {
  ownerKey: constraintOwnerKey,
  planId: allergyBreakfast.planId,
});
assert.ok(
  allergyBreakfastDetail.items.every((item) =>
    item.ingredients.every((ingredient) => ingredient.ingredientKey !== "peanut"),
  ),
);

console.log("Running recipe-question and no-response execution cases...");
const questionPlan = await createPlan({ targetDate: "2026-09-02", mealSlot: "dinner" });
const questionApproval = await mutate("tarlaPlanning:submitUserFeedback", {
  ownerKey,
  planId: questionPlan.planId,
  memberId: primaryUserId,
  action: "approve",
  rawContent: "Approved for the recipe-question test.",
  cookMemberId: cookId,
  responseWindowMs: 60_000,
});
await mutate("tarlaInbound:ingestCookSignal", {
  ownerKey,
  senderAddress: cookAddress,
  channel: "whatsapp",
  signalType: "text",
  rawContent: "Tofu bhurji kaise banau?",
  messageId: `w3-question-${fixtureKey}`,
  timestamp: Date.now(),
  metadata: { inReplyToMessageId: questionApproval.outboundMessageId },
});
const questionExecution = await getExecution(questionApproval.executionId);
assert.equal(questionExecution.execution.status, "question_received");
assert.equal(questionExecution.run.status, "waiting");
assert.equal(questionExecution.inboundSignals[0].rawContent, "Tofu bhurji kaise banau?");
assert.equal(questionExecution.outboundMessages.length, 2);

const noResponsePlan = await createPlan({ targetDate: "2026-09-03", mealSlot: "dinner" });
const noResponseApproval = await mutate("tarlaPlanning:submitUserFeedback", {
  ownerKey,
  planId: noResponsePlan.planId,
  memberId: primaryUserId,
  action: "approve",
  rawContent: "Approved for the no-response test.",
  cookMemberId: cookId,
  responseWindowMs: 3_000,
});
let noResponseExecution = await getExecution(noResponseApproval.executionId);
assert.equal(noResponseExecution.execution.status, "waiting");
noResponseExecution = await waitForExecutionState(
  noResponseApproval.executionId,
  "no_response",
  30_000,
);
assert.equal(noResponseExecution.execution.status, "no_response");
assert.match(noResponseExecution.run.outputSummary, /unconfirmed/i);
assert.doesNotMatch(noResponseExecution.run.outputSummary, /prepared|completed meal/i);

console.log("Checking a known deterministic nutrition calculation...");
const riceNutrition = await query("tarlaPlanning:calculateRecipeNutrition", {
  recipeId: "plain_rice",
  totalServingEquivalents: 4,
});
assert.deepEqual(riceNutrition.totalNutrition, {
  caloriesKcal: 730,
  proteinG: 14.2,
  carbohydratesG: 160,
  fatG: 1.4,
  fibreG: 2.6,
});
assert.deepEqual(riceNutrition.perServingNutrition, {
  caloriesKcal: 182.5,
  proteinG: 3.55,
  carbohydratesG: 40,
  fatG: 0.35,
  fibreG: 0.65,
});

const finalContext = await query("tarlaProfiles:getTarlaContext", {
  ownerKey,
  householdId,
});
assert.equal(finalContext.members.length, 4);
assert.equal(finalContext.memberProfiles.length, 3);
assert.equal(finalContext.cooks[0].readiness, "ready");
assert.equal(finalContext.cooks[0].primingMessage, priming.primingMessage);
assert.equal(
  finalContext.memberProfiles.find((profile) => profile.memberId === primaryUserId)
    ?.calorieTargetKcal,
  1600,
);

const evaluations = [
  result("vegetarian_high_protein_low_calorie", {
    state: initialDetail.plan.status,
    templateId: initialDetail.plan.selectedTemplateId,
    memberCaloriesKcal: primaryNutrition.nutrition.caloriesKcal,
    memberProteinG: primaryNutrition.nutrition.proteinG,
  }),
  result("day_specific_vegetarian_rule", {
    templateId: constraintDinnerDetail.plan.selectedTemplateId,
    excluded: ["chicken", "egg"],
  }),
  result("allergy_exclusion", {
    templateId: allergyBreakfastDetail.plan.selectedTemplateId,
    peanutPresent: false,
  }),
  result("paneer_repetition_limit", {
    templateId: constraintDinnerDetail.plan.selectedTemplateId,
    paneerPresent: false,
  }),
  result("conflicting_household_preferences", {
    templateId: initialDetail.plan.selectedTemplateId,
    servingEquivalents: initialDetail.plan.memberNutrition.map((entry) => ({
      member: entry.memberName,
      value: entry.servingEquivalent,
    })),
    childVariationInInstruction: /low spice/i.test(execution.execution.instruction),
  }),
  result("user_rejects_plan", {
    rawFeedbackPreserved: correctionFeedback.rawContent === rawUserCorrection,
    memoryKey: paneerMemory.key,
    replannedTemplateId: revisedDetail.plan.selectedTemplateId,
    laterTemplateId: questionPlan.selectedTemplateId,
  }),
  result("missing_ingredient", {
    rawCookSignal: rawCookConstraint,
    replacementTemplateId: missingResult.replacementTemplateId,
    nutritionRecalculated: true,
    shoppingItem: palakShopping.item,
    userEscalationRequired: false,
  }),
  result("cook_asks_recipe_question", {
    state: questionExecution.execution.status,
    rawPreserved: true,
    linkedExecutionId: questionExecution.execution._id,
    runStatus: questionExecution.run.status,
  }),
  result("no_cook_response", {
    initialState: "waiting",
    finalState: noResponseExecution.execution.status,
    mealCompletionClaimed: false,
  }),
  result("nutrition_calculation", {
    recipeId: "plain_rice",
    totalNutrition: riceNutrition.totalNutrition,
    exactMatch: true,
  }),
];
assert.equal(evaluations.length, TARLA_W3_EVAL_SET.length);
assert.ok(evaluations.every((evaluation) => evaluation.pass));

console.log(
  JSON.stringify(
    {
      fixture: {
        ownerKey,
        householdId,
        memberIds: { primaryUserId, adultId, childId, cookId },
        cookEndpointId,
      },
      nutritionEstimate: energyEstimate,
      userOverride: { calorieTargetKcal: 1600, proteinTargetG: 75 },
      cookPriming: {
        message: priming.primingMessage,
        persistedReadiness: finalContext.cooks[0].readiness,
      },
      approvalLoop: {
        initialPlanId: initial.planId,
        initialTemplateId: initialDetail.plan.selectedTemplateId,
        rawUserCorrection,
        memoryKey: paneerMemory.key,
        revisedPlanId: replan.planId,
        revisedTemplateId: revisedDetail.plan.selectedTemplateId,
      },
      missingIngredientLoop: {
        executionId: approval.executionId,
        rawCookSignal: rawCookConstraint,
        affectedTemplateId: revisedDetail.plan.selectedTemplateId,
        replacementTemplateId: execution.plan.selectedTemplateId,
        revisedInstruction: execution.execution.latestInstruction,
        nutritionBefore: revisedDetail.plan.perServingNutrition,
        nutritionAfter: execution.plan.perServingNutrition,
        shoppingItem: {
          item: palakShopping.item,
          status: palakShopping.status,
          reason: palakShopping.reason,
        },
        userEscalationRequired: execution.execution.userEscalationRequired,
        finalState: execution.execution.status,
      },
      observability: {
        runId: execution.run.runId,
        status: execution.run.status,
        orderedTrace: execution.steps.map((step) => ({
          order: step.order,
          name: step.name,
          status: step.status,
          latencyMs: step.latencyMs,
        })),
        rereadStable: true,
      },
      evaluations,
    },
    null,
    2,
  ),
);

async function createPlan({ targetDate, mealSlot }) {
  return mutate("tarlaPlanning:createMealPlan", {
    ownerKey,
    householdId,
    requestedByMemberId: primaryUserId,
    eaterMemberIds: [primaryUserId, adultId, childId],
    targetDate,
    mealSlot,
  });
}

async function getPlan(planId) {
  return query("tarlaPlanning:getMealPlan", { ownerKey, planId });
}

async function getExecution(executionId) {
  return query("tarlaPlanning:getExecution", { ownerKey, executionId });
}

async function waitForExecutionState(executionId, state, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const detail = await getExecution(executionId);
    if (detail.execution.status === state) return detail;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for execution ${executionId} to reach ${state}`);
}

function result(id, details) {
  const definition = TARLA_W3_EVAL_SET.find((testCase) => testCase.id === id);
  if (!definition) throw new Error(`Unknown W3 evaluation case: ${id}`);
  return { id, name: definition.name, pass: true, ...details };
}

function readEnvironmentFile(path) {
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    values[key] = value;
  }
  return values;
}
