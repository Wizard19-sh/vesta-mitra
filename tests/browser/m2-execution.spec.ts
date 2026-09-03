import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const artifacts = path.resolve("artifacts", "m2");

type RecordedMessage = { messageId: string; purpose?: string };
type MitraInstanceDetail = {
  outboundMessages: RecordedMessage[];
  run: { runId: string };
};
type IngredientExecutionDetail = {
  execution: {
    _id: string;
    cookMemberId: string;
    assignedMealSlots?: string[];
  };
  visit: { mealSlots: string[] };
  outboundMessages: RecordedMessage[];
  meals: Array<{
    join: { mealSlot: string };
    calculated: {
      plan: {
        items: Array<{
          ingredients: Array<{ ingredientKey: string; ingredientName: string }>;
        }>;
      };
    };
  }>;
};

test("synthetic Mitra and Tarla runs are understandable and actionable", async ({ page }) => {
  test.setTimeout(240_000);
  await mkdir(artifacts, { recursive: true });
  const environment = await readEnvironment();
  expect(environment.CONVEX_DEPLOYMENT).toMatch(/^dev:/);
  const client = new ConvexHttpClient(environment.NEXT_PUBLIC_CONVEX_URL);
  const call = (name: string) => makeFunctionReference<"mutation">(name);
  const ask = (name: string) => makeFunctionReference<"query">(name);
  const mutate = (name: string, args: Record<string, unknown>) => client.mutation(call(name), args);
  const query = (name: string, args: Record<string, unknown>) =>
    client.query(ask(name), args) as ReturnType<ConvexHttpClient["query"]>;
  const stamp = Date.now();
  const ownerKey = `aevia_device_m2_browser_${stamp}_safe_fixture`;
  const timezone = "Asia/Kolkata";
  const targetDate = localDate(timezone);
  const dayOfWeek = localDayOfWeek(timezone);
  const visitTime = localTime12(timezone);
  const identity = await mutate("m5:createOrUpdateIdentity", {
    ownerKey,
    name: "Asha Test",
    email: `m2-${stamp}@example.invalid`,
    householdName: `M2 Test Household ${stamp}`,
    timezone,
    termsVersion: "beta-2026-08-30",
    privacyVersion: "beta-2026-08-30",
    accepted: true,
  });
  const setup = await mutate("m1Setup:saveSetup", {
    ownerKey,
    householdId: identity.householdId,
    setup: {
      agentChoice: "both",
      members: [
        member("primary", identity.memberId, "Asha Test", "Self", "adult", "Asha", true),
        member("senior", undefined, "Raman Test", "Father", "senior", "Baba"),
        member("caretaker", undefined, "Ria Test", "Partner / spouse", "adult", "Ria"),
        { ...member("cook", undefined, "Kitchen Test Contact", "Cooking person", "adult", "Didi"), memberKind: "external" },
      ],
      removedMemberIds: [],
      mitraPeople: [
        {
          memberClientKey: "senior",
          communicationPath: "both",
          caretakerMemberClientKey: "caretaker",
          directPhone: "+919100000101",
          caretakerPhone: "+919100000102",
          consentConfirmed: true,
          routines: [
            routine("medicine_keep", "Medication", "evening medicine"),
            routine("medicine_stop", "Medication", "night medicine"),
            routine("walk_done", "Walk / activity", "evening walk"),
          ],
        },
      ],
      tarla: {
        eaterMemberClientKeys: ["primary", "senior", "caretaker"],
        dietaryType: "vegetarian",
        cuisines: ["North Indian", "South Indian"],
        favouriteFoods: ["dal", "bhindi"],
        dislikedFoods: [],
        allergies: [],
        hardRestrictions: [],
        softerPreferences: ["less oil"],
        foodContext: "Synthetic browser-test household context.",
        rules: [],
        nutritionMode: "balanced",
        nutritionPeople: [],
        cookingPeople: [
          {
            clientKey: "cook_state",
            memberClientKey: "cook",
            relationshipType: "hired_cook",
            phone: "+919100000103",
            preferredLanguage: "Hinglish",
            consentConfirmed: true,
            visits: [{ clientKey: "morning_visit", label: "Morning visit", daysOfWeek: [dayOfWeek], time12: visitTime, mealSlots: ["breakfast", "lunch"] }],
          },
          {
            clientKey: "family_state",
            memberClientKey: "primary",
            relationshipType: "primary_user",
            phone: "+919100000104",
            preferredLanguage: "English",
            consentConfirmed: true,
            visits: [{ clientKey: "evening_visit", label: "Evening cooking", daysOfWeek: [dayOfWeek], time12: visitTime, mealSlots: ["snack", "dinner"] }],
          },
        ],
        firstPlanDate: targetDate,
      },
      anythingElse: "Synthetic M2 verification only.",
    },
  });

  const routineIds = setup.mitraRoutineIds.map((item: { routineId: string }) => item.routineId);
  const instances = await Promise.all(
    routineIds.map((routineId: string) => waitFor(async () => {
      const rows = await query("mitraRoutines:listRoutineInstances", { ownerKey, routineId });
      return rows[0];
    }, 45_000)),
  );
  const details = await Promise.all(instances.map((item) => query("mitraRoutines:getRoutineInstance", { ownerKey, checkInId: item._id })));

  for (const [index, routineId] of routineIds.entries()) {
    if (index > 1) continue;
    const routineDoc = await query("mitraRoutines:getRoutine", { ownerKey, routineId });
    await mutate("mitraRoutines:updateScheduledRoutine", {
      ownerKey,
      routineId,
      type: "Medication",
      label: routineDoc.label,
      timing: { kind: "once_scheduled", timezone, scheduledAt: Date.now() + 24 * 60 * 60 * 1_000 },
      communicationEndpointId: routineDoc.communicationEndpointId,
      recipientMemberId: routineDoc.recipientMemberId,
      recipientAudience: routineDoc.recipientAudience,
      notes: routineDoc.notes,
    });
  }

  for (let index = 0; index < 2; index += 1) {
    await mutate("mitraInbound:ingestSignal", {
      ownerKey,
      senderAddress: "+919100000101",
      channel: "whatsapp",
      signalType: "text",
      rawContent: index === 0 ? "Evening medicine reminder band kar do" : "Night medicine reminder band kar do",
      messageId: `m2-stop-${stamp}-${index}`,
      timestamp: Date.now(),
      metadata: { inReplyToMessageId: reminderMessage(details[index]).messageId, provider: "development" },
    });
  }
  await mutate("mitraInbound:ingestSignal", {
    ownerKey,
    senderAddress: "+919100000101",
    channel: "whatsapp",
    signalType: "text",
    rawContent: "Haan, walk ho gayi.",
    messageId: `m2-walk-${stamp}`,
    timestamp: Date.now(),
    metadata: { inReplyToMessageId: reminderMessage(details[2]).messageId, provider: "development" },
  });

  const dayPlan = await mutate("tarlaDayPlanning:createFullDayPlan", {
    ownerKey,
    householdId: identity.householdId,
    requestedByMemberId: identity.memberId,
    eaterMemberIds: setup.eaterMemberIds,
    targetDate,
    mealSlots: ["breakfast", "lunch", "snack", "dinner"],
  });
  const approval = await mutate("tarlaDayPlanning:approveDayPlan", {
    ownerKey,
    dayPlanId: dayPlan.dayPlanId,
    memberId: identity.memberId,
    cookStateId: setup.cookingPeople[0].cookStateId,
    rawContent: "Approved synthetic M2 plan.",
  });
  expect(approval.executions).toHaveLength(2);
  const executionDetails = await Promise.all(
    approval.executions.map((item: { executionId: string }) => waitFor(async () => {
      const detail = await query("tarlaDayPlanning:getDayExecution", { ownerKey, executionId: item.executionId });
      return detail.execution.status === "waiting" ? detail : undefined;
    }, 60_000)),
  );
  const chosen = chooseIngredientExecution(executionDetails);
  const cookAddress = String(chosen.detail.execution.cookMemberId) === String(identity.memberId)
    ? "+919100000104"
    : "+919100000103";
  const exceptionResult = await mutate("tarlaInbound:ingestCookSignal", {
    ownerKey,
    senderAddress: cookAddress,
    channel: "whatsapp",
    signalType: "text",
    rawContent: `${chosen.ingredientName} nahi hai`,
    messageId: `m2-cook-missing-${stamp}`,
    timestamp: Date.now(),
    metadata: { inReplyToMessageId: chosen.detail.outboundMessages[0].messageId, provider: "development" },
  });
  expect(exceptionResult.userEscalationRequired).toBe(false);
  const revised = await query("tarlaDayPlanning:getDayExecution", { ownerKey, executionId: chosen.detail.execution._id });
  expect(revised.execution.status).toBe("revised_waiting");
  expect(revised.execution.latestInstruction).not.toMatch(/serving\s*equivalent/i);

  await page.addInitScript((credential) => localStorage.setItem("aevia-device-credential", credential), ownerKey);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your home, today" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep reminder" }).first()).toBeVisible();
  await expect(page.getByText(/Tarla updated the plan because/).first()).toBeVisible();
  await expect(page.getByText(chosen.ingredientName, { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "needs-you-and-handled.png"), fullPage: true });

  await page.getByRole("button", { name: "Keep reminder" }).first().click();
  await expect(page.getByRole("button", { name: "Keep reminder" })).toHaveCount(1);
  await page.getByRole("button", { name: "Approve stopping reminder" }).click();
  await expect(page.getByRole("button", { name: "Keep reminder" })).toHaveCount(0);
  const decidedRoutines = await Promise.all(routineIds.slice(0, 2).map((routineId: string) => query("mitraRoutines:getRoutine", { ownerKey, routineId })));
  expect(decidedRoutines.filter((item) => item.w2Enabled).length).toBe(1);

  const revisedAfterDashboard = await query("tarlaDayPlanning:getDayExecution", { ownerKey, executionId: chosen.detail.execution._id });
  await mutate("tarlaInbound:ingestCookSignal", {
    ownerKey,
    senderAddress: cookAddress,
    channel: "whatsapp",
    signalType: "text",
    rawContent: "Theek hai",
    messageId: `m2-cook-ack-${stamp}`,
    timestamp: Date.now(),
    metadata: { inReplyToMessageId: revisedAfterDashboard.execution.revisedOutboundMessageId, provider: "development" },
  });
  const executionSummary = await query("productAnalytics:getExecutionSummary", { ownerKey, householdId: identity.householdId });
  expect(executionSummary.successfullyCompletedTasks).toBeGreaterThanOrEqual(4);
  expect(executionSummary.primaryUserInterventions).toBe(2);
  expect(executionSummary.interventionsPerSuccessfullyCompletedTask).not.toBeNull();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: path.join(artifacts, "mobile-execution-dashboard.png"), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/runs");
  await expect(page.getByRole("heading", { name: "Agent runs" })).toBeVisible();
  await page.locator("aside button").filter({ hasText: String(details[2].run.runId).slice(0, 8) }).click();
  await expect(page.getByRole("heading", { name: "Message lifecycle" })).toBeVisible();
  await expect(page.getByText(/EVD-RUN-/).first()).toBeVisible();
  await expect(page.getByText(/Self reported complete/i).first()).toBeVisible();
  await expect(page.getByText(/usage not applicable/i).first()).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "run-trace-inspection.png"), fullPage: true });
});

function member(clientKey: string, memberId: string | undefined, name: string, relationship: string, lifeStage: "adult" | "child" | "senior", preferredSalutation: string, isPrimary = false) {
  return { clientKey, memberId, name, relationship, lifeStage, preferredSalutation, preferredLanguage: "English", memberKind: "household", isPrimary };
}

function routine(clientKey: string, type: "Medication" | "Walk / activity", label: string) {
  return { clientKey, type, label, timingMode: "once_now", date: "", time12: "6:00 PM", daysOfWeek: [1, 2, 3, 4, 5], dayOfMonth: 1, notes: "Synthetic verification routine." };
}

function reminderMessage(detail: MitraInstanceDetail) {
  const message = detail.outboundMessages.find((item: RecordedMessage) => item.purpose === "routine_reminder") ?? detail.outboundMessages[0];
  if (!message) throw new Error("Synthetic reminder was not recorded");
  return message;
}

function chooseIngredientExecution(details: IngredientExecutionDetail[]) {
  const preferred = new Set(["spinach", "paneer", "tofu", "bhindi", "chickpeas", "besan", "poha", "moong_sprouts", "egg", "chicken"]);
  const names: Record<string, string> = { spinach: "palak", paneer: "paneer", tofu: "tofu", bhindi: "bhindi", chickpeas: "chole", besan: "besan", poha: "poha", moong_sprouts: "sprouts", egg: "egg", chicken: "chicken" };
  for (const detail of details) {
    const slots = new Set(detail.execution.assignedMealSlots ?? detail.visit.mealSlots);
    for (const meal of detail.meals) {
      if (!slots.has(meal.join.mealSlot)) continue;
      for (const item of meal.calculated.plan.items) {
        const ingredient = item.ingredients.find((candidate: { ingredientKey: string; ingredientName: string }) => preferred.has(candidate.ingredientKey));
        if (ingredient) return { detail, ingredientName: names[ingredient.ingredientKey] ?? ingredient.ingredientName };
      }
    }
  }
  throw new Error("No bounded ingredient exception was available in the synthetic plan");
}

async function waitFor<T>(read: () => Promise<T | undefined>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for the synthetic development task");
}

async function readEnvironment() {
  const raw = await readFile(path.resolve(".env.local"), "utf8");
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  if (!values.NEXT_PUBLIC_CONVEX_URL || !values.CONVEX_DEPLOYMENT) {
    throw new Error("Convex development configuration is unavailable");
  }
  return values as { NEXT_PUBLIC_CONVEX_URL: string; CONVEX_DEPLOYMENT: string };
}

function localDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function localDayOfWeek(timezone: string) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

function localTime12(timezone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date());
}
