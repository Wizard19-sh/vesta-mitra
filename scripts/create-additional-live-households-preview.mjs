import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const environmentPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const localEnvironment = readEnvironmentFile(environmentPath);
const deployment =
  process.env.CONVEX_DEPLOYMENT ?? localEnvironment.CONVEX_DEPLOYMENT;
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  process.env.CONVEX_URL ??
  localEnvironment.NEXT_PUBLIC_CONVEX_URL ??
  localEnvironment.CONVEX_URL;

if (!deployment?.startsWith("dev:")) {
  throw new Error(
    "This script must only run against a Convex development deployment",
  );
}
if (!convexUrl) {
  throw new Error("Convex URL is missing from environment");
}

const client = new ConvexHttpClient(convexUrl);
const mutate = (name, args) => client.mutation(makeFunctionReference(name), args);
const query = (name, args) => client.query(makeFunctionReference(name), args);

const timezone = "Asia/Kolkata";
const ownerKey = `phase-a-live-${randomUUID()}`;

function tomorrowYmd() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toLocaleDateString("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function localTime(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const byType = (type) => parts.find((p) => p.type === type)?.value;
  return `${byType("hour")}:${byType("minute")}`;
}

function dayOfWeekForDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function requiredText(value) {
  const clean = value.trim();
  if (!clean) throw new Error(`Missing required value: ${value}`);
  return clean;
}

function composeMitraMessage({ recipientSalutation, label, type, language }) {
  if (type === "Walk / activity") {
    return language === "English"
      ? `${recipientSalutation}, it is time for ${label}.`
      : `${recipientSalutation}, ${label} ka time ho gaya.`;
  }
  if (type === "Medication") {
    return language === "English"
      ? `${recipientSalutation}, it is time for ${label}. Have you taken it?`
      : `${recipientSalutation}, ${label} ka time ho gaya. Le li?`;
  }
  return language === "English"
    ? `${recipientSalutation}, a reminder for ${label}.`
    : `${recipientSalutation}, ${label} ka reminder hai.`;
}

function recipeMeasure(recipeId) {
  if (recipeId === "besan_chilla") return { perServing: 2, unit: "chillas" };
  if (recipeId === "plain_rice") return { perServing: 1, unit: "cups" };
  if (recipeId.includes("roti")) return { perServing: 2, unit: "rotis" };
  if (recipeId.includes("salad")) return { perServing: 0.5, unit: "bowls" };
  if (recipeId.includes("curd")) return { perServing: 1, unit: "bowls" };
  if (recipeId.includes("chicken") || recipeId.includes("fish")) {
    return { perServing: 1, unit: "portions" };
  }
  return { perServing: 1, unit: "bowls" };
}

function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

function isVolumeUnit(unit) {
  return unit === "bowls" || unit === "cups";
}

function formatQuarter(value) {
  const whole = Math.floor(value);
  const fraction = value - whole;
  const suffix = fraction === 0.5 ? "½" : "";
  return whole ? `${whole}${suffix}` : suffix || "0";
}

function formatHouseholdMeasure(measure) {
  const roundedQuantity = measure.unit === "bowls" || measure.unit === "cups"
    ? roundToHalf(measure.quantity)
    : Math.max(1, Math.round(measure.quantity));
  const quantity = formatQuarter(roundedQuantity);
  const unit = measure.quantity === 1 ? singular(measure.unit) : measure.unit;
  return `${quantity} ${unit}`;
}

function singular(value) {
  if (value === "chillas") return "chilla";
  if (value === "rotis") return "roti";
  if (value === "bowls") return "bowl";
  if (value === "cups") return "cup";
  if (value === "portions") return "portion";
  return value;
}

function personHouseholdMeasure(recipeId, servingEquivalent) {
  const definition = recipeMeasure(recipeId);
  return {
    quantity: definition.perServing * servingEquivalent,
    unit: definition.unit,
  };
}

function cumulativeHouseholdMeasure(recipeId, servingEquivalents) {
  const definition = recipeMeasure(recipeId);
  return {
    quantity: servingEquivalents.reduce(
      (sum, serving) =>
        sum + personHouseholdMeasure(recipeId, serving).quantity,
      0,
    ),
    unit: definition.unit,
  };
}

function naturalizeCookMessage(value) {
  return value
    .replace(/\(\d+(?:\.\d+)? serving equivalents\)/g, "— household quantity")
    .replace(/(\d+)\.(\d+) g/g, (match) => {
      const quantity = Number(match.slice(0, -2));
      return Number.isFinite(quantity) ? Math.round(quantity) + " g" : match;
    });
}

function relationshipOpening(input, title) {
  const name = input.cookName?.trim();
  const english = input.preferredLanguage?.toLocaleLowerCase().includes("english");
  if (input.relationshipType === "family_cook" || input.relationshipType === "primary_user") {
    if (!name) return title;
    return english ? `Hi ${name}. ${title}` : `${name}, ${title}`;
  }
  if (!name) return title;
  return english ? `Hi ${name}. ${title}` : `Namaste ${name}. ${title}`;
}

function householdQuantity(item) {
  return formatHouseholdMeasure(
    cumulativeHouseholdMeasure(
      item.recipeId,
      item.memberPortions.map((portion) => portion.servingEquivalent),
    ),
  );
}

function composeDayCookInstruction(input) {
  const language = input.preferredLanguage?.toLocaleLowerCase() ?? "hinglish";
  const mealLines = input.meals.flatMap((meal) => [
    `${meal.mealSlot[0].toUpperCase()}${meal.mealSlot.slice(1)}:`,
    ...meal.plan.items.map((item) => `- ${item.recipeName} — ${householdQuantity(item)}`),
  ]);
  const notes = input.memberNotes.map(
    ({ memberName, note }) => `- ${memberName}: ${note}`,
  );
  return naturalizeCookMessage([
    relationshipOpening(input, `${input.visitLabel} — ${input.targetDate}`),
    ...mealLines,
    ...notes,
    ...(input.importantRestrictions.length
      ? [`Important: ${input.importantRestrictions.join("; ")}.`]
      : []),
    ...(input.revisedBecause
      ? [`Revised because ${input.revisedBecause}.`]
      : []),
  ].join("\n"));
}

async function createHouseholdOne() {
  const name = "Phase A Live Household 1";
  const householdId = await mutate("vesta:createHousehold", {
    ownerKey,
    name,
    timezone,
  });
  const [siddharthId, mohitId, priyaId] = await Promise.all([
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: requiredText("Siddharth"),
      role: "primary user",
      lifeStage: "adult",
      relationship: "son",
      preferredSalutation: "Siddharth",
      languagePreference: "Hinglish",
    }),
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: requiredText("Mohit"),
      role: "senior",
      lifeStage: "senior",
      relationship: "papa",
      preferredSalutation: "papa",
      languagePreference: "Hinglish",
    }),
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: requiredText("Priya"),
      role: "hired cook",
      lifeStage: "adult",
      relationship: "cooking support",
      preferredSalutation: "Priya",
      languagePreference: "Hindi",
    }),
  ]);
  const [siddharthEndpointId, mohitEndpointId, priyaEndpointId] =
    await Promise.all([
      mutate("vesta:addCommunicationEndpoint", {
        ownerKey,
        householdId,
        memberId: siddharthId,
        channel: "whatsapp",
        address: "+919619065456",
        preferredLanguage: "Hinglish",
        preferredMode: "text",
        providerMetadata: { provider: "meta", ready: true },
        active: true,
        consentStatus: "granted",
        verifiedAt: Date.now(),
      }),
      mutate("vesta:addCommunicationEndpoint", {
        ownerKey,
        householdId,
        memberId: mohitId,
        channel: "whatsapp",
        address: "+919833657764",
        preferredLanguage: "Hinglish",
        preferredMode: "text",
        providerMetadata: { provider: "meta", ready: true },
        active: true,
        consentStatus: "granted",
        verifiedAt: Date.now(),
      }),
      mutate("vesta:addCommunicationEndpoint", {
        ownerKey,
        householdId,
        memberId: priyaId,
        channel: "whatsapp",
        address: "+919990323617",
        preferredLanguage: "Hindi",
        preferredMode: "text",
        providerMetadata: { provider: "meta", ready: true },
        active: true,
        consentStatus: "granted",
        verifiedAt: Date.now(),
      }),
    ]);
  const parentId = await mutate("mitra:addParent", {
    ownerKey,
    name: "Mohit",
    relationship: "Father",
    childDisplayName: "Siddharth",
    salutation: "Papa",
    preferredLanguage: "Hinglish",
    communicationPreference: "Text",
    conversationStyle: "Straightforward",
    primaryIntent: "ROUTINES",
    context: "Additional phase-A live test household",
  });
  await mutate("vesta:linkLegacyParent", {
    ownerKey,
    parentId,
    householdId,
    memberId: mohitId,
  });
  await mutate("mitraRoutines:setMemberReadiness", {
    ownerKey,
    householdId,
    memberId: mohitId,
    readiness: "ready",
  });

  const targetDate = tomorrowYmd();
  const walkDate = new Date(`${targetDate}T18:30:00+05:30`);
  const routine = await mutate("mitraRoutines:createScheduledRoutine", {
    ownerKey,
    householdId,
    memberId: mohitId,
    parentId,
    communicationEndpointId: mohitEndpointId,
    type: "Walk / activity",
    label: "evening walk",
    timing: {
      kind: "once_scheduled",
      timezone,
      scheduledAt: walkDate.getTime(),
    },
    responseWindowMs: 10 * 60 * 1_000,
  });
  const mitraMessage1 = composeMitraMessage({
    recipientSalutation: "papa",
    label: "evening walk",
    type: "Walk / activity",
    language: "Hinglish",
  });

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
  await mutate("tarlaProfiles:upsertMemberProfile", {
    ownerKey,
    householdId,
    memberId: siddharthId,
    dietaryType: "vegetarian",
    mealsAtHome: ["breakfast", "lunch", "snack", "dinner"],
    servingEquivalent: 1.25,
  });
  await mutate("tarlaProfiles:setNutritionTargets", {
    ownerKey,
    householdId,
    memberId: siddharthId,
    calorieTargetKcal: 1700,
    proteinTargetG: 80,
    carbohydratesTargetG: 190,
    fatTargetG: 55,
    fibreTargetG: 26,
  });
  const cookEndpointId = priyaEndpointId;
  const cookStateId = await mutate("tarlaProfiles:configureCook", {
    ownerKey,
    householdId,
    memberId: priyaId,
    communicationEndpointId: cookEndpointId,
    usualArrivalTime: "20:15",
    communicationTone: "brief and respectful",
    relationshipType: "hired_cook",
  });
  await mutate("tarlaProfiles:generateCookPriming", {
    ownerKey,
    householdId,
    cookMemberId: priyaId,
    householdUserMemberId: siddharthId,
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
        label: "Evening cook visit",
        daysOfWeek: [dayOfWeekForDate(targetDate)],
        arrivalTime: "20:00",
        timezone,
        instructionLeadMinutes: 10,
        mealSlots: ["breakfast", "lunch", "snack", "dinner"],
      },
    ],
  });
  const initial = await mutate("tarlaDayPlanning:createFullDayPlan", {
    ownerKey,
    householdId,
    requestedByMemberId: siddharthId,
    eaterMemberIds: [siddharthId],
    targetDate,
    mealSlots: ["breakfast", "lunch", "snack", "dinner"],
  });
  const revised = await mutate("tarlaDayPlanning:approveDayPlan", {
    ownerKey,
    dayPlanId: initial.dayPlanId,
    memberId: siddharthId,
    cookStateId,
    rawContent: "Approved for phase-A live preview.",
  });
  const execution = revised.executions[0];
  const executionDetail = await query("tarlaDayPlanning:getDayExecution", {
    ownerKey,
    executionId: execution.executionId,
  });
  const dayPlan = await query("tarlaDayPlanning:getDayPlan", {
    ownerKey,
    dayPlanId: initial.dayPlanId,
  });
  const visitMeals = executionDetail.meals
    .filter((meal) => execution.assignedMealSlots.includes(meal.join.mealSlot))
    .map((meal) => meal.calculated);
  const mealSlotsOrdered = ["breakfast", "lunch", "snack", "dinner"];
  const sortedMeals = visitMeals.sort(
    (left, right) =>
      mealSlotsOrdered.indexOf(left.mealSlot) -
      mealSlotsOrdered.indexOf(right.mealSlot),
  );
  const tarlaMessage1 = composeDayCookInstruction({
    visitLabel: executionDetail.visit.label,
    targetDate,
    meals: sortedMeals.map((meal) => ({
      mealSlot: meal.mealSlot,
      plan: {
        items: meal.plan.items,
      },
    })),
    memberNotes: [],
    importantRestrictions: [],
    cookName: "Priya",
    preferredLanguage: "Hindi",
    relationshipType: "hired_cook",
  });

  return {
    householdId,
    name,
    routineId: routine.routineId,
    dayPlanId: initial.dayPlanId,
    executionId: execution.executionId,
    endpointIds: [siddharthEndpointId, mohitEndpointId, priyaEndpointId],
    parentId,
    mitraMessage: mitraMessage1,
    tarlaMessage: tarlaMessage1,
  };
}

async function createHouseholdTwo() {
  const name = "Phase A Live Household 2";
  const householdId = await mutate("vesta:createHousehold", {
    ownerKey,
    name,
    timezone,
  });
  const [reechaId, cookId] = await Promise.all([
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: requiredText("Reecha"),
      role: "primary user",
      lifeStage: "senior",
      relationship: "mother",
      preferredSalutation: "Reecha",
      languagePreference: "Hinglish",
    }),
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: requiredText("Unknown Cook"),
      role: "hired cook",
      lifeStage: "adult",
      relationship: "cooking support",
      preferredSalutation: "Cook",
      languagePreference: "Hindi",
    }),
  ]);

  const [reechaEndpointId, cookEndpointId] = await Promise.all([
    mutate("vesta:addCommunicationEndpoint", {
      ownerKey,
      householdId,
      memberId: reechaId,
      channel: "whatsapp",
      address: "+918860366302",
      preferredLanguage: "Hinglish",
      preferredMode: "text",
      providerMetadata: { provider: "meta", ready: true },
      active: true,
      consentStatus: "granted",
      verifiedAt: Date.now(),
    }),
    mutate("vesta:addCommunicationEndpoint", {
      ownerKey,
      householdId,
      memberId: cookId,
      channel: "whatsapp",
      address: "+919891585207",
      preferredLanguage: "Hindi",
      preferredMode: "text",
      providerMetadata: { provider: "meta", ready: true },
      active: true,
      consentStatus: "granted",
      verifiedAt: Date.now(),
    }),
  ]);

  const parentId = await mutate("mitra:addParent", {
    ownerKey,
    name: "Reecha",
    relationship: "Mother",
    childDisplayName: "Reecha",
    salutation: "Reecha",
    preferredLanguage: "Hinglish",
    communicationPreference: "Text",
    conversationStyle: "Straightforward",
    primaryIntent: "ROUTINES",
    context: "Additional phase-A live test household",
  });
  await mutate("vesta:linkLegacyParent", {
    ownerKey,
    parentId,
    householdId,
    memberId: reechaId,
  });
  await mutate("mitraRoutines:setMemberReadiness", {
    ownerKey,
    householdId,
    memberId: reechaId,
    readiness: "ready",
  });
  const targetDate = tomorrowYmd();
  const walkDate = new Date(`${targetDate}T19:00:00+05:30`);
  const routine = await mutate("mitraRoutines:createScheduledRoutine", {
    ownerKey,
    householdId,
    memberId: reechaId,
    parentId,
    communicationEndpointId: reechaEndpointId,
    type: "Walk / activity",
    label: "evening walk",
    timing: {
      kind: "once_scheduled",
      timezone,
      scheduledAt: walkDate.getTime(),
    },
    responseWindowMs: 10 * 60 * 1_000,
  });
  const mitraMessage2 = composeMitraMessage({
    recipientSalutation: "Reecha",
    label: "evening walk",
    type: "Walk / activity",
    language: "Hinglish",
  });

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
  await mutate("tarlaProfiles:upsertMemberProfile", {
    ownerKey,
    householdId,
    memberId: reechaId,
    dietaryType: "vegetarian",
    mealsAtHome: ["breakfast", "lunch", "snack", "dinner"],
    servingEquivalent: 1.1,
  });
  await mutate("tarlaProfiles:setNutritionTargets", {
    ownerKey,
    householdId,
    memberId: reechaId,
    calorieTargetKcal: 1500,
    proteinTargetG: 70,
    carbohydratesTargetG: 170,
    fatTargetG: 45,
    fibreTargetG: 24,
  });
  const cookStateId = await mutate("tarlaProfiles:configureCook", {
    ownerKey,
    householdId,
    memberId: cookId,
    communicationEndpointId: cookEndpointId,
    usualArrivalTime: "20:00",
    communicationTone: "brief and respectful",
    relationshipType: "hired_cook",
  });
  await mutate("tarlaProfiles:generateCookPriming", {
    ownerKey,
    householdId,
    cookMemberId: cookId,
    householdUserMemberId: reechaId,
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
        label: "Evening cook visit",
        daysOfWeek: [dayOfWeekForDate(targetDate)],
        arrivalTime: "20:00",
        timezone,
        instructionLeadMinutes: 10,
        mealSlots: ["breakfast", "lunch", "snack", "dinner"],
      },
    ],
  });
  const initial = await mutate("tarlaDayPlanning:createFullDayPlan", {
    ownerKey,
    householdId,
    requestedByMemberId: reechaId,
    eaterMemberIds: [reechaId],
    targetDate,
    mealSlots: ["breakfast", "lunch", "snack", "dinner"],
  });
  const revised = await mutate("tarlaDayPlanning:approveDayPlan", {
    ownerKey,
    dayPlanId: initial.dayPlanId,
    memberId: reechaId,
    cookStateId,
    rawContent: "Approved for phase-A live preview.",
  });
  const execution = revised.executions[0];
  const executionDetail = await query("tarlaDayPlanning:getDayExecution", {
    ownerKey,
    executionId: execution.executionId,
  });
  const dayPlan = await query("tarlaDayPlanning:getDayPlan", {
    ownerKey,
    dayPlanId: initial.dayPlanId,
  });
  const visitMeals = executionDetail.meals
    .filter((meal) => execution.assignedMealSlots.includes(meal.join.mealSlot))
    .map((meal) => meal.calculated);
  const mealSlotsOrdered = ["breakfast", "lunch", "snack", "dinner"];
  const sortedMeals = visitMeals.sort(
    (left, right) =>
      mealSlotsOrdered.indexOf(left.mealSlot) -
      mealSlotsOrdered.indexOf(right.mealSlot),
  );
  const tarlaMessage2 = composeDayCookInstruction({
    visitLabel: executionDetail.visit.label,
    targetDate,
    meals: sortedMeals.map((meal) => ({
      mealSlot: meal.mealSlot,
      plan: {
        items: meal.plan.items,
      },
    })),
    memberNotes: [],
    importantRestrictions: [],
    cookName: "Cook",
    preferredLanguage: "Hindi",
    relationshipType: "hired_cook",
  });

  return {
    householdId,
    name,
    routineId: routine.routineId,
    dayPlanId: initial.dayPlanId,
    executionId: execution.executionId,
    endpointIds: [reechaEndpointId, cookEndpointId],
    parentId,
    mitraMessage: mitraMessage2,
    tarlaMessage: tarlaMessage2,
  };
}

async function main() {
  const household1 = await createHouseholdOne();
  const household2 = await createHouseholdTwo();

  console.log("OWNER_KEY");
  console.log(ownerKey);
  console.log("HOUSEHOLD_1");
  console.log(JSON.stringify(household1, null, 2));
  console.log("HOUSEHOLD_2");
  console.log(JSON.stringify(household2, null, 2));
  console.log("COMPOSED_MESSAGES");
  console.log("Household 1 Mitra:", household1.mitraMessage);
  console.log("Household 1 Tarla:");
  console.log(household1.tarlaMessage);
  console.log("Household 2 Mitra:", household2.mitraMessage);
  console.log("Household 2 Tarla:");
  console.log(household2.tarlaMessage);
}

function readEnvironmentFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  const raw = readFileSync(path, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
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

await main();
