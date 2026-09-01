import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const environmentPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const statePath = fileURLToPath(
  new URL("../.w4-meta-tarla-live-state.json", import.meta.url),
);
const localEnvironment = readEnvironmentFile(environmentPath);
const deployment =
  process.env.CONVEX_DEPLOYMENT ?? localEnvironment.CONVEX_DEPLOYMENT;
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  process.env.CONVEX_URL ??
  localEnvironment.NEXT_PUBLIC_CONVEX_URL ??
  localEnvironment.CONVEX_URL;

if (!deployment?.startsWith("dev:")) {
  throw new Error("The Tarla Meta check only runs against Convex development");
}
if (!convexUrl) throw new Error("Convex development URL not found");

const client = new ConvexHttpClient(convexUrl);
const reference = (name) => makeFunctionReference(name);
const mutate = (name, args) => client.mutation(reference(name), args);
const query = (name, args) => client.query(reference(name), args);
const command = process.argv[2];
const timezone = "Asia/Kolkata";

if (command === "prepare") {
  await prepare();
} else if (command === "inspect") {
  await inspect();
} else {
  throw new Error("Use prepare or inspect");
}

async function prepare() {
  if (existsSync(statePath)) {
    throw new Error("A Tarla Meta live test is already recorded");
  }
  const recipient = (
    process.env.W4_META_TEST_RECIPIENT_E164 ??
    localEnvironment.W4_META_TEST_RECIPIENT_E164 ??
    ""
  ).trim();
  if (!/^\+[1-9]\d{7,14}$/.test(recipient)) {
    throw new Error("W4_META_TEST_RECIPIENT_E164 is missing or invalid");
  }

  const fixtureKey = new Date().toISOString().replace(/[^0-9]/g, "");
  const ownerKey = `w4-meta-tarla-${fixtureKey}`;
  const arrival = safeFutureLocalSchedule(4);
  const householdId = await mutate("vesta:createHousehold", {
    ownerKey,
    name: "W4 Meta Tarla Developer Household",
    timezone,
  });
  const [primaryId, adultId, childId, cookId] = await Promise.all([
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: "W4 Primary",
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
      name: "W4 Adult",
      role: "spouse",
      age: 34,
      sex: "Female",
      languagePreference: "English",
    }),
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: "W4 Child",
      role: "child",
      age: 9,
      languagePreference: "English",
    }),
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: "W4 Test Cook",
      role: "cook",
      languagePreference: "Hindi",
    }),
  ]);

  await mutate("tarlaProfiles:setHouseholdMealContext", {
    ownerKey,
    householdId,
    mealsPreparedAtHome: ["breakfast", "lunch", "snack", "dinner"],
    usualMealTimes: [
      { meal: "breakfast", time: "08:30" },
      { meal: "lunch", time: "13:00" },
      { meal: "snack", time: "17:00" },
      { meal: "dinner", time: "20:00" },
    ],
  });
  await Promise.all([
    mutate("tarlaProfiles:upsertMemberProfile", {
      ownerKey,
      householdId,
      memberId: primaryId,
      dietaryType: "vegetarian",
      allergies: ["peanut"],
      limitedFoods: ["paneer"],
      favouriteFoods: ["paneer"],
      mealsAtHome: ["breakfast", "lunch", "snack", "dinner"],
      servingEquivalent: 1.25,
      foodContext: "High-protein vegetarian plan with an explicit calorie target.",
      cookNotes: "less oil",
    }),
    mutate("tarlaProfiles:upsertMemberProfile", {
      ownerKey,
      householdId,
      memberId: adultId,
      dietaryType: "vegetarian",
      dislikedFoods: ["mushroom"],
      mealsAtHome: ["breakfast", "lunch", "dinner"],
      servingEquivalent: 1,
    }),
    mutate("tarlaProfiles:upsertMemberProfile", {
      ownerKey,
      householdId,
      memberId: childId,
      dietaryType: "vegetarian",
      allergies: ["peanut"],
      mealsAtHome: ["breakfast", "dinner"],
      servingEquivalent: 0.5,
      cookNotes: "low spice",
    }),
  ]);
  await mutate("tarlaProfiles:setNutritionTargets", {
    ownerKey,
    householdId,
    memberId: primaryId,
    calorieTargetKcal: 1600,
    proteinTargetG: 75,
    carbohydratesTargetG: 180,
    fatTargetG: 55,
    fibreTargetG: 25,
  });
  await mutate("tarlaProfiles:addDietaryRule", {
    ownerKey,
    householdId,
    ruleType: "vegetarian_days",
    daysOfWeek: [arrival.dayOfWeek],
    description: "This development test day is vegetarian.",
  });
  await mutate("tarlaProfiles:addDietaryRule", {
    ownerKey,
    householdId,
    memberId: primaryId,
    ruleType: "ingredient_frequency_limit",
    ingredientKey: "paneer",
    maxOccurrences: 2,
    windowDays: 7,
    description: "Paneer maximum twice in seven days.",
  });

  const endpointId = await mutate("vesta:addCommunicationEndpoint", {
    ownerKey,
    householdId,
    memberId: cookId,
    channel: "whatsapp",
    address: recipient,
    preferredLanguage: "Hindi",
    preferredMode: "text",
    providerMetadata: { provider: "meta", ready: true },
    active: true,
    consentStatus: "granted",
    verifiedAt: Date.now(),
  });
  const cookStateId = await mutate("tarlaProfiles:configureCook", {
    ownerKey,
    householdId,
    memberId: cookId,
    communicationEndpointId: endpointId,
    usualArrivalTime: arrival.time,
    communicationTone: "brief and respectful",
  });
  const primingMessageId = await mutate("tarlaProfiles:generateCookPriming", {
    ownerKey,
    householdId,
    cookMemberId: cookId,
    householdUserMemberId: primaryId,
  });
  await mutate("tarlaProfiles:setCookReadiness", {
    ownerKey,
    cookStateId,
    readiness: "ready",
  });
  const visits = await mutate("tarlaProfiles:configureCookVisits", {
    ownerKey,
    cookStateId,
    frequency: "once_daily",
    visits: [
      {
        label: "W4 test cook visit",
        daysOfWeek: [arrival.dayOfWeek],
        arrivalTime: arrival.time,
        timezone,
        instructionLeadMinutes: 1,
        mealSlots: ["breakfast", "lunch", "snack", "dinner"],
      },
    ],
  });

  for (const ingredient of [
    "paneer",
    "tofu",
    "palak",
    "soy chunks",
    "bhindi",
    "besan",
    "moong sprouts",
    "curd",
    "moong dal",
    "cucumber",
    "tomato",
    "onion",
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

  const initial = await mutate("tarlaDayPlanning:createFullDayPlan", {
    ownerKey,
    householdId,
    requestedByMemberId: primaryId,
    eaterMemberIds: [primaryId, adultId, childId],
    targetDate: arrival.targetDate,
    mealSlots: ["breakfast", "lunch", "snack", "dinner"],
  });
  const revised = await mutate("tarlaDayPlanning:requestDayPlanChange", {
    ownerKey,
    dayPlanId: initial.dayPlanId,
    memberId: primaryId,
    rawContent: "Don't give paneer again today.",
  });
  const revisedDetail = await getDayPlan(ownerKey, revised.dayPlanId);
  const palakMeal = revisedDetail.meals.find((meal) =>
    meal.calculated.plan.ingredientKeys.includes("spinach"),
  );
  assert.ok(palakMeal, "The approved live plan must contain palak for the exception test");
  assert.ok(revisedDetail.dayPlan.constraintChecks.every((check) => check.passed));
  const approval = await mutate("tarlaDayPlanning:approveDayPlan", {
    ownerKey,
    dayPlanId: revised.dayPlanId,
    memberId: primaryId,
    cookStateId,
    rawContent: "Approved for the W4 Meta developer test.",
  });
  assert.equal(approval.executions.length, 1);
  const executionId = approval.executions[0].executionId;
  const state = {
    ownerKey,
    householdId,
    primaryId,
    adultId,
    childId,
    cookId,
    endpointId,
    cookStateId,
    cookVisitId: visits.visitIds[0],
    primingMessageId,
    initialDayPlanId: initial.dayPlanId,
    approvedDayPlanId: revised.dayPlanId,
    executionId,
    affectedMealSlot: palakMeal.join.mealSlot,
    scheduledFor: approval.executions[0].scheduledFor,
    nutritionBefore: revisedDetail.dayPlan.totalNutrition,
    createdAt: Date.now(),
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  const detail = await waitFor(
    () => getDayExecution(ownerKey, executionId),
    (value) =>
      value.transportMessages.some((message) =>
        ["accepted", "sent", "delivered", "read", "failed"].includes(
          message.status,
        ),
      ),
    6 * 60_000,
    "the scheduled Tarla cook instruction",
  );
  const message = detail.transportMessages[0];
  assert.equal(detail.outboundMessages.length, 0);
  assert.equal(message.provider, "meta");
  assert.notEqual(message.status, "failed", `Meta send failed: ${message.failureCode}`);
  console.log(
    JSON.stringify(
      {
        test: "w4_meta_tarla_missing_ingredient",
        phase: "cook_instruction_delivered",
        scheduledFor: new Date(detail.execution.scheduledFor).toISOString(),
        sentAt: new Date(detail.execution.sentAt).toISOString(),
        providerAcceptedAt: message.providerAcceptedAt
          ? new Date(message.providerAcceptedAt).toISOString()
          : null,
        providerStatus: message.status,
        providerMessageId: message.providerMessageId,
        runId: detail.run?._id,
        executionId: detail.execution._id,
        instruction: detail.execution.instruction,
        approvedMeals: revisedDetail.meals.map((meal) => ({
          slot: meal.join.mealSlot,
          recipe: meal.calculated.plan.templateName,
        })),
        dailyNutrition: revisedDetail.dayPlan.totalNutrition,
        manualSendUsed: false,
        replyInstruction: "Reply in WhatsApp with: Palak nahi hai.",
      },
      null,
      2,
    ),
  );
}

async function inspect() {
  if (!existsSync(statePath)) {
    throw new Error("No Tarla Meta live test state exists");
  }
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const detail = await waitFor(
    () => getDayExecution(state.ownerKey, state.executionId),
    (value) =>
      value.inboundSignals.length > 0 &&
      value.transportMessages.length >= 2 &&
      ["accepted", "sent", "delivered", "read"].includes(
        value.transportMessages.at(-1)?.status,
      ),
    3 * 60_000,
    "the signed cook reply and revised Meta instruction",
  );
  const reread = await getDayExecution(state.ownerKey, state.executionId);
  const inbound = detail.inboundSignals[0];
  const revisedMessage = detail.transportMessages.at(-1);
  const shopping = await query("tarlaPlanning:listShoppingNeeded", {
    ownerKey: state.ownerKey,
    householdId: state.householdId,
  });
  const palakShopping = shopping.find(
    (item) => item.ingredientKey === "spinach" && item.status === "needed",
  );
  assert.match(inbound.rawContent, /^\s*palak nahi hai[.!]?\s*$/i);
  assert.equal(detail.execution.status, "revised_waiting");
  assert.equal(detail.execution.userEscalationRequired, false);
  assert.ok(palakShopping);
  assert.ok(
    detail.meals.every(
      (meal) => !meal.calculated.plan.ingredientKeys.includes("spinach"),
    ),
  );
  assert.notDeepEqual(detail.dayPlan.totalNutrition, state.nutritionBefore);
  assert.equal(reread.execution.status, detail.execution.status);
  assert.equal(reread.inboundSignals[0].rawContent, inbound.rawContent);
  for (const requiredStep of [
    "cook_instruction_trigger",
    "retrieve_latest_approved_plan",
    "send_cook_instruction",
    "receive_webhook",
    "validate_webhook",
    "normalize_signal",
    "persist_raw_signal",
    "interpret_constraint",
    "substitute_or_replan",
    "recalculate_nutrition",
    "update_shopping_list",
    "send_revised_instruction",
  ]) {
    assert.ok(
      detail.steps.some((step) => step.name === requiredStep),
      `Missing trace step ${requiredStep}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        test: "w4_meta_tarla_missing_ingredient",
        phase: "exception_resolved",
        rawCookReply: inbound.rawContent,
        inboundAt: new Date(inbound.timestamp).toISOString(),
        affectedMealSlot: state.affectedMealSlot,
        revisedPlanVersion: detail.dayPlan.version,
        nutritionBefore: state.nutritionBefore,
        nutritionAfter: detail.dayPlan.totalNutrition,
        shoppingItem: palakShopping.item,
        shoppingStatus: palakShopping.status,
        revisedInstruction: detail.execution.latestInstruction,
        revisedProviderMessageId: revisedMessage.providerMessageId,
        revisedProviderStatus: revisedMessage.status,
        revisedProviderAcceptedAt: revisedMessage.providerAcceptedAt
          ? new Date(revisedMessage.providerAcceptedAt).toISOString()
          : null,
        revisedDeliveredAt: revisedMessage.deliveredAt
          ? new Date(revisedMessage.deliveredAt).toISOString()
          : null,
        userEscalationRequired: detail.execution.userEscalationRequired,
        runId: detail.run?._id,
        runStatus: detail.run?.status,
        orderedTrace: detail.steps.map((step) => ({
          order: step.order,
          name: step.name,
          status: step.status,
        })),
        stableReread: true,
      },
      null,
      2,
    ),
  );
}

function getDayPlan(ownerKey, dayPlanId) {
  return query("tarlaDayPlanning:getDayPlan", { ownerKey, dayPlanId });
}

function getDayExecution(ownerKey, executionId) {
  return query("tarlaDayPlanning:getDayExecution", { ownerKey, executionId });
}

async function waitFor(read, ready, timeoutMs, description) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function safeFutureLocalSchedule(minutes) {
  let timestamp = Date.now() + minutes * 60_000;
  let parts = localParts(timestamp);
  if (parts.hour === 23 && parts.minute >= 55) {
    timestamp += 10 * 60_000;
    parts = localParts(timestamp);
  }
  const targetDate = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  return {
    targetDate,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
    dayOfWeek: dayOfWeekForDate(targetDate),
  };
}

function localParts(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const value = (type) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function dayOfWeekForDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function readEnvironmentFile(path) {
  if (!existsSync(path)) return {};
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
    }
    values[key] = value;
  }
  return values;
}
