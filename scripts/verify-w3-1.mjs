import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

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
  throw new Error("W3.1 verification only runs against a Convex dev deployment");
}
if (!convexUrl) throw new Error("Convex development URL not found");

const client = new ConvexHttpClient(convexUrl);
const reference = (name) => makeFunctionReference(name);
const mutate = (name, args) => client.mutation(reference(name), args);
const query = (name, args) => client.query(reference(name), args);
const fixtureKey = new Date().toISOString().replace(/[^0-9]/g, "");
const timezone = "Asia/Kolkata";
const firstArrival = safeFutureLocalSchedule(4);
const secondArrival = addLocalMinutes(firstArrival, 5);

console.log("Creating isolated once-daily and twice-daily W3.1 households...");
const once = await createHouseholdFixture("once", firstArrival.targetDate);
const twice = await createHouseholdFixture("twice", firstArrival.targetDate);

const onceVisits = await mutate("tarlaProfiles:configureCookVisits", {
  ownerKey: once.ownerKey,
  cookStateId: once.cookStateId,
  frequency: "once_daily",
  visits: [
    {
      label: "Daily cook visit",
      daysOfWeek: [firstArrival.dayOfWeek],
      arrivalTime: firstArrival.time,
      timezone,
      instructionLeadMinutes: 1,
      mealSlots: ["breakfast", "lunch", "snack", "dinner"],
    },
  ],
});
assert.equal(onceVisits.visitIds.length, 1);

const twiceVisits = await mutate("tarlaProfiles:configureCookVisits", {
  ownerKey: twice.ownerKey,
  cookStateId: twice.cookStateId,
  frequency: "twice_daily",
  visits: [
    {
      label: "Morning cook visit",
      daysOfWeek: [firstArrival.dayOfWeek],
      arrivalTime: firstArrival.time,
      timezone,
      instructionLeadMinutes: 1,
      mealSlots: ["breakfast", "lunch", "snack"],
    },
    {
      label: "Evening cook visit",
      daysOfWeek: [secondArrival.dayOfWeek],
      arrivalTime: secondArrival.time,
      timezone,
      instructionLeadMinutes: 1,
      mealSlots: ["dinner"],
    },
  ],
});
assert.equal(twiceVisits.visitIds.length, 2);

console.log("Generating a full day with per-meal and daily nutrition...");
const initial = await mutate("tarlaDayPlanning:createFullDayPlan", {
  ownerKey: once.ownerKey,
  householdId: once.householdId,
  requestedByMemberId: once.primaryId,
  eaterMemberIds: [once.primaryId, once.adultId, once.childId],
  targetDate: firstArrival.targetDate,
  mealSlots: ["breakfast", "lunch", "snack", "dinner"],
});
const initialDetail = await getDayPlan(once.ownerKey, initial.dayPlanId);
assert.deepEqual(initialDetail.dayPlan.mealSlots, [
  "breakfast",
  "lunch",
  "snack",
  "dinner",
]);
assert.equal(initialDetail.meals.length, 4);
assert.ok(initialDetail.dayPlan.constraintChecks.every((check) => check.passed));
assert.equal(
  new Set(
    initialDetail.meals.map((meal) => meal.calculated.plan.templateId),
  ).size,
  4,
);
assert.ok(
  initialDetail.meals.every((meal) =>
    meal.calculated.plan.constraintChecks.every((check) => check.passed),
  ),
);
assert.ok(
  initialDetail.meals.every((meal) =>
    meal.calculated.plan.items.every((item) =>
      item.ingredients.every(
        (ingredient) => ingredient.ingredientKey !== "peanut",
      ),
    ),
  ),
);
const primaryDay = memberDay(initialDetail, once.primaryId);
const adultDay = memberDay(initialDetail, once.adultId);
const childDay = memberDay(initialDetail, once.childId);
assert.equal(primaryDay.meals.length, 4);
assert.equal(adultDay.meals.length, 3);
assert.equal(childDay.meals.length, 2);
assert.equal(primaryDay.targets.caloriesKcal, 1600);
assert.equal(primaryDay.targets.proteinG, 75);
assert.equal(
  primaryDay.variance.caloriesKcal,
  round(primaryDay.total.caloriesKcal - 1600),
);
assert.equal(
  primaryDay.variance.proteinG,
  round(primaryDay.total.proteinG - 75),
);
const initialPaneerMeal = initialDetail.meals.find((meal) =>
  meal.calculated.plan.ingredientKeys.includes("paneer"),
);
assert.ok(initialPaneerMeal, "The preference-weighted first plan should include paneer");

console.log("Approving, revising before send, and approving the latest version...");
const firstApproval = await mutate("tarlaDayPlanning:approveDayPlan", {
  ownerKey: once.ownerKey,
  dayPlanId: initial.dayPlanId,
  memberId: once.primaryId,
  cookStateId: once.cookStateId,
  rawContent: "Approved for the first scheduled version.",
});
assert.equal(firstApproval.executions.length, 1);
const onceExecutionId = firstApproval.executions[0].executionId;
let onceExecution = await getDayExecution(once.ownerKey, onceExecutionId);
assert.equal(onceExecution.execution.status, "scheduled");
assert.equal(onceExecution.execution.instruction, undefined);
assert.equal(onceExecution.outboundMessages.length, 0);

const rawCorrection = "Don't give paneer again today.";
const revised = await mutate("tarlaDayPlanning:requestDayPlanChange", {
  ownerKey: once.ownerKey,
  dayPlanId: initial.dayPlanId,
  memberId: once.primaryId,
  rawContent: rawCorrection,
});
const revisedDetail = await getDayPlan(once.ownerKey, revised.dayPlanId);
assert.equal(revisedDetail.dayPlan.version, 2);
assert.ok(
  revisedDetail.meals.every(
    (meal) => !meal.calculated.plan.ingredientKeys.includes("paneer"),
  ),
);
const contextAfterCorrection = await query("tarlaProfiles:getTarlaContext", {
  ownerKey: once.ownerKey,
  householdId: once.householdId,
});
const paneerMemory = contextAfterCorrection.preferences.find(
  (item) => item.key === "avoid_ingredient:paneer",
);
assert.ok(paneerMemory);
assert.equal(paneerMemory.value, rawCorrection);
const secondApproval = await mutate("tarlaDayPlanning:approveDayPlan", {
  ownerKey: once.ownerKey,
  dayPlanId: revised.dayPlanId,
  memberId: once.primaryId,
  cookStateId: once.cookStateId,
  rawContent: "Approved revised full-day plan.",
});
assert.equal(secondApproval.executions.length, 1);
assert.equal(secondApproval.executions[0].executionId, onceExecutionId);
assert.equal(secondApproval.executions[0].reused, true);

const twicePlan = await mutate("tarlaDayPlanning:createFullDayPlan", {
  ownerKey: twice.ownerKey,
  householdId: twice.householdId,
  requestedByMemberId: twice.primaryId,
  eaterMemberIds: [twice.primaryId, twice.adultId, twice.childId],
  targetDate: firstArrival.targetDate,
  mealSlots: ["breakfast", "lunch", "snack", "dinner"],
});
const twiceApproval = await mutate("tarlaDayPlanning:approveDayPlan", {
  ownerKey: twice.ownerKey,
  dayPlanId: twicePlan.dayPlanId,
  memberId: twice.primaryId,
  cookStateId: twice.cookStateId,
  rawContent: "Approved twice-daily visit allocation.",
});
assert.equal(twiceApproval.executions.length, 2);
const twiceFirst = twiceApproval.executions.find(
  (execution) => execution.cookVisitId === twiceVisits.visitIds[0],
);
const twiceSecond = twiceApproval.executions.find(
  (execution) => execution.cookVisitId === twiceVisits.visitIds[1],
);
assert.ok(twiceFirst);
assert.ok(twiceSecond);

console.log(
  `Waiting for Convex scheduling; first instruction is due at ${new Date(firstApproval.executions[0].scheduledFor).toISOString()}...`,
);
const [sentOnce, sentTwice] = await Promise.all([
  waitForExecution(once.ownerKey, onceExecutionId, "waiting", 6 * 60_000),
  waitForExecution(twice.ownerKey, twiceFirst.executionId, "waiting", 6 * 60_000),
]);

assert.equal(sentOnce.outboundMessages.length, 1);
assert.equal(sentOnce.execution.dayPlanId, revised.dayPlanId);
assert.ok(sentOnce.execution.sentAt >= sentOnce.execution.scheduledFor);
assert.doesNotMatch(sentOnce.execution.instruction, /paneer/i);
assert.match(sentOnce.execution.instruction, /Breakfast/i);
assert.match(sentOnce.execution.instruction, /Lunch/i);
assert.match(sentOnce.execution.instruction, /Snack/i);
assert.match(sentOnce.execution.instruction, /Dinner/i);
assert.equal(sentOnce.outboundMessages[0].dayPlanId, revised.dayPlanId);
assert.equal(
  sentOnce.steps.find((step) => step.name === "retrieve_latest_approved_plan")
    ?.outputSummary.includes("version 2"),
  true,
);

assert.equal(sentTwice.outboundMessages.length, 1);
assert.match(sentTwice.execution.instruction, /Breakfast/i);
assert.match(sentTwice.execution.instruction, /Lunch/i);
assert.match(sentTwice.execution.instruction, /Snack/i);
assert.doesNotMatch(sentTwice.execution.instruction, /Dinner/i);
const unsentEvening = await getDayExecution(
  twice.ownerKey,
  twiceSecond.executionId,
);
assert.equal(unsentEvening.execution.status, "scheduled");
assert.equal(unsentEvening.outboundMessages.length, 0);

console.log("Injecting Palak nahi hai through the normalized cook inbound path...");
const latestBeforeMissing = await getDayPlan(once.ownerKey, revised.dayPlanId);
const palakMeal = latestBeforeMissing.meals.find((meal) =>
  meal.calculated.plan.ingredientKeys.includes("spinach"),
);
assert.ok(palakMeal, "The revised plan should contain a palak meal for this test");
const unaffectedBefore = new Map(
  latestBeforeMissing.meals
    .filter((meal) => meal.join.mealSlot !== palakMeal.join.mealSlot)
    .map((meal) => [meal.join.mealSlot, meal.calculated.plan.templateId]),
);
const rawCookSignal = "Palak nahi hai.";
const missing = await mutate("tarlaInbound:ingestCookSignal", {
  ownerKey: once.ownerKey,
  senderAddress: once.cookAddress,
  channel: "whatsapp",
  signalType: "text",
  rawContent: rawCookSignal,
  messageId: `w31-missing-${fixtureKey}`,
  timestamp: Date.now(),
  metadata: {
    inReplyToMessageId: sentOnce.execution.outboundMessageId,
  },
});
assert.equal(missing.state, "revised_waiting");
assert.equal(missing.userEscalationRequired, false);
assert.deepEqual(missing.affectedMealSlots, [palakMeal.join.mealSlot]);
onceExecution = await getDayExecution(once.ownerKey, onceExecutionId);
assert.equal(onceExecution.execution.status, "revised_waiting");
assert.equal(onceExecution.outboundMessages.length, 2);
assert.equal(onceExecution.inboundSignals[0].rawContent, rawCookSignal);
assert.equal(onceExecution.dayPlan.version, 3);
assert.ok(
  onceExecution.meals.every(
    (meal) => !meal.calculated.plan.ingredientKeys.includes("spinach"),
  ),
);
for (const [mealSlot, templateId] of unaffectedBefore) {
  assert.equal(
    onceExecution.meals.find((meal) => meal.join.mealSlot === mealSlot)
      ?.calculated.plan.templateId,
    templateId,
  );
}
assert.notDeepEqual(
  onceExecution.dayPlan.totalNutrition,
  latestBeforeMissing.dayPlan.totalNutrition,
);
assert.ok(onceExecution.dayPlan.memberDailyNutrition[0].variance);
assert.equal(onceExecution.execution.userEscalationRequired, false);
const shopping = await query("tarlaPlanning:listShoppingNeeded", {
  ownerKey: once.ownerKey,
  householdId: once.householdId,
});
const palakShopping = shopping.find(
  (item) => item.ingredientKey === "spinach" && item.status === "needed",
);
assert.ok(palakShopping);

assert.deepEqual(
  onceExecution.steps.map((step) => step.order),
  onceExecution.steps.map((_, index) => index + 1),
);
for (const requiredStep of [
  "cook_instruction_trigger",
  "retrieve_latest_approved_plan",
  "send_cook_instruction",
  "receive_cook_signal",
  "persist_raw_signal",
  "substitute_or_replan",
  "recalculate_nutrition",
  "update_shopping_list",
  "send_revised_instruction",
]) {
  assert.ok(
    onceExecution.steps.some((step) => step.name === requiredStep),
    `Missing trace step ${requiredStep}`,
  );
}

console.log(
  JSON.stringify(
    {
      fixture: {
        onceDailyHouseholdId: once.householdId,
        twiceDailyHouseholdId: twice.householdId,
        targetDate: firstArrival.targetDate,
      },
      fullDayPlan: {
        dayPlanId: revised.dayPlanId,
        meals: revisedDetail.meals.map((meal) => ({
          mealSlot: meal.join.mealSlot,
          template: meal.calculated.plan.templateName,
          primaryNutrition: meal.calculated.plan.memberNutrition.find(
            (member) => member.memberId === once.primaryId,
          )?.nutrition,
        })),
        primaryDailyTotal: memberDay(revisedDetail, once.primaryId).total,
        primaryTargets: memberDay(revisedDetail, once.primaryId).targets,
        primaryVariance: memberDay(revisedDetail, once.primaryId).variance,
        memberMealCounts: {
          primaryAdult: memberDay(revisedDetail, once.primaryId).meals.length,
          anotherAdult: memberDay(revisedDetail, once.adultId).meals.length,
          child: memberDay(revisedDetail, once.childId).meals.length,
        },
      },
      onceDailySchedule: {
        visitId: onceVisits.visitIds[0],
        executionId: onceExecutionId,
        scheduledFor: sentOnce.execution.scheduledFor,
        sentAt: sentOnce.execution.sentAt,
        schedulerDelayMs:
          sentOnce.execution.sentAt - sentOnce.execution.scheduledFor,
        outboundCountBeforeException: sentOnce.outboundMessages.length,
        instruction: sentOnce.execution.instruction,
      },
      twiceDailySchedule: {
        visitIds: twiceVisits.visitIds,
        triggeredExecutionId: twiceFirst.executionId,
        triggeredMealSlots: sentTwice.visit.mealSlots,
        triggeredState: sentTwice.execution.status,
        laterExecutionId: twiceSecond.executionId,
        laterState: unsentEvening.execution.status,
      },
      latestPlanBeforeSend: {
        initialDayPlanId: initial.dayPlanId,
        latestDayPlanId: revised.dayPlanId,
        executionUsedDayPlanId: sentOnce.execution.dayPlanId,
        occurrenceReused: true,
        outboundCount: sentOnce.outboundMessages.length,
        stalePaneerPresent: /paneer/i.test(sentOnce.execution.instruction),
      },
      missingIngredient: {
        rawCookSignal,
        affectedMealSlots: missing.affectedMealSlots,
        revisedDayPlanId: onceExecution.dayPlan._id,
        revisedDayPlanVersion: onceExecution.dayPlan.version,
        updatedDailyTotal: onceExecution.dayPlan.totalNutrition,
        primaryUpdatedVariance: memberDay(onceExecution, once.primaryId).variance,
        shoppingItem: palakShopping.item,
        revisedInstruction: onceExecution.execution.latestInstruction,
        userEscalationRequired: onceExecution.execution.userEscalationRequired,
      },
      observability: {
        onceRunId: onceExecution.run.runId,
        onceTrace: onceExecution.steps.map((step) => ({
          order: step.order,
          name: step.name,
          status: step.status,
          latencyMs: step.latencyMs,
        })),
        twiceRunId: sentTwice.run.runId,
        twiceTrace: sentTwice.steps.map((step) => ({
          order: step.order,
          name: step.name,
          status: step.status,
          latencyMs: step.latencyMs,
        })),
      },
      checks: {
        fullDayNutrition: "pass",
        memberDifferences: "pass",
        onceDailyAutonomousTrigger: "pass",
        twiceDailyAllocationAndTrigger: "pass",
        latestApprovedPlanAtSend: "pass",
        duplicatePrevention: "pass",
        missingIngredientDayRecalculation: "pass",
      },
    },
    null,
    2,
  ),
);

async function createHouseholdFixture(label, targetDate) {
  const ownerKey = `w31-${label}-${fixtureKey}`;
  const householdId = await mutate("vesta:createHousehold", {
    ownerKey,
    name: `W3.1 ${label} isolated household`,
    timezone,
  });
  const [primaryId, adultId, childId, cookId] = await Promise.all([
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: `${label} Sid`,
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
      name: `${label} Mira`,
      role: "spouse",
      age: 34,
      sex: "Female",
      languagePreference: "English",
    }),
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: `${label} Child`,
      role: "child",
      age: 9,
      languagePreference: "English",
    }),
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: `${label} Didi`,
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
      foodContext: "High-protein vegetarian day with an editable calorie target.",
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
    daysOfWeek: [dayOfWeekForDate(targetDate)],
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
  const cookAddress = `+918${label === "once" ? "1" : "2"}${fixtureKey.slice(-8)}`;
  const endpointId = await mutate("vesta:addCommunicationEndpoint", {
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
    communicationEndpointId: endpointId,
    usualArrivalTime: firstArrival.time,
    communicationTone: "brief and respectful",
  });
  await mutate("tarlaProfiles:generateCookPriming", {
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
  return {
    ownerKey,
    householdId,
    primaryId,
    adultId,
    childId,
    cookId,
    cookAddress,
    cookStateId,
  };
}

async function getDayPlan(ownerKey, dayPlanId) {
  return query("tarlaDayPlanning:getDayPlan", { ownerKey, dayPlanId });
}

async function getDayExecution(ownerKey, executionId) {
  return query("tarlaDayPlanning:getDayExecution", { ownerKey, executionId });
}

async function waitForExecution(ownerKey, executionId, state, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const detail = await getDayExecution(ownerKey, executionId);
    if (detail.execution.status === state) return detail;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for ${executionId} to reach ${state}`);
}

function memberDay(detail, memberId) {
  const found = detail.dayPlan.memberDailyNutrition.find(
    (member) => member.memberId === memberId,
  );
  if (!found) throw new Error(`Member daily nutrition missing for ${memberId}`);
  return found;
}

function safeFutureLocalSchedule(minutes) {
  let timestamp = Date.now() + minutes * 60_000;
  let parts = localParts(timestamp);
  if (parts.hour === 23 && parts.minute >= 55) {
    timestamp += 10 * 60_000;
    parts = localParts(timestamp);
  }
  return {
    timestamp,
    targetDate: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
    dayOfWeek: dayOfWeekForDate(
      `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    ),
  };
}

function addLocalMinutes(schedule, minutes) {
  const parts = localParts(schedule.timestamp + minutes * 60_000);
  return {
    timestamp: schedule.timestamp + minutes * 60_000,
    targetDate: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
    dayOfWeek: dayOfWeekForDate(
      `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    ),
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
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
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

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
