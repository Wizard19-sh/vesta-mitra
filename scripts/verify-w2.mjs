import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { MITRA_W2_EVAL_SET } from "./mitra-w2-eval-cases.mjs";

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
  throw new Error("W2 verification only runs against a Convex dev deployment");
}
if (!convexUrl) throw new Error("Convex development URL not found");

const client = new ConvexHttpClient(convexUrl);
const reference = (name) => makeFunctionReference(name);
const mutate = (name, args) => client.mutation(reference(name), args);
const query = (name, args) => client.query(reference(name), args);
const fixtureKey = new Date().toISOString().replace(/[^0-9]/g, "");
const ownerKey = `w2-verification-${fixtureKey}`;
const timezone = "Asia/Kolkata";
const senderAddress = `+9198${fixtureKey.slice(-8)}`;

console.log("Creating isolated W2 household and ready parent...");
const householdId = await mutate("vesta:createHousehold", {
  ownerKey,
  name: "W2 Isolated Mitra Household",
  timezone,
});
const [primaryUserId, parentMemberId] = await Promise.all([
  mutate("vesta:addMember", {
    ownerKey,
    householdId,
    name: "W2 Test Sid",
    role: "primary user",
    languagePreference: "English",
  }),
  mutate("vesta:addMember", {
    ownerKey,
    householdId,
    name: "W2 Test Papa",
    role: "parent",
    age: 68,
    languagePreference: "Hinglish",
    notes: "Synthetic W2 parent with no medical profile.",
  }),
]);
const parentId = await mutate("mitra:addParent", {
  ownerKey,
  name: "W2 Test Papa",
  relationship: "Father",
  childDisplayName: "W2 Test Sid",
  salutation: "Papa",
  preferredLanguage: "Hinglish",
  communicationPreference: "Text",
  conversationStyle: "Warm & caring",
  primaryIntent: "ROUTINES",
  context: "Prefers brief routine reminders.",
});
await mutate("vesta:linkLegacyParent", {
  ownerKey,
  parentId,
  householdId,
  memberId: parentMemberId,
});
await Promise.all([
  mutate("vesta:rememberPreference", {
    ownerKey,
    householdId,
    memberId: parentMemberId,
    category: "communication",
    key: "language",
    value: "Papa prefers Hinglish",
    source: "explicit_correction",
  }),
  mutate("vesta:rememberPreference", {
    ownerKey,
    householdId,
    memberId: parentMemberId,
    category: "communication",
    key: "salutation",
    value: "Papa",
    source: "onboarding",
  }),
]);
const endpointId = await mutate("vesta:addCommunicationEndpoint", {
  ownerKey,
  householdId,
  memberId: parentMemberId,
  channel: "whatsapp",
  address: senderAddress,
  preferredLanguage: "Hinglish",
  preferredMode: "text",
  active: true,
  consentStatus: "granted",
});
await mutate("mitraRoutines:setMemberReadiness", {
  ownerKey,
  householdId,
  memberId: parentMemberId,
  readiness: "ready",
});

const scheduledOnceAt = Date.now() + 120_000;
const recurrenceTarget = Date.now() + 180_000;
const recurrenceLocal = localParts(recurrenceTarget, timezone);

console.log(
  `Scheduling once at ${new Date(scheduledOnceAt).toISOString()} and recurrence near ${new Date(recurrenceTarget).toISOString()}...`,
);
const scheduledOnce = await createRoutine({
  type: "Medication",
  label: "evening medicine",
  timing: {
    kind: "once_scheduled",
    timezone,
    scheduledAt: scheduledOnceAt,
  },
  responseWindowMs: 120_000,
});
const recurring = await createRoutine({
  type: "Walk / activity",
  label: "daily walk",
  timing: {
    kind: "recurring",
    timezone,
    recurrence: {
      frequency: "selected_days",
      time: recurrenceLocal.time,
      daysOfWeek: [recurrenceLocal.dayOfWeek],
    },
  },
  responseWindowMs: 120_000,
});

assert.equal(
  (await listInstances(scheduledOnce.routineId)).length,
  0,
  "Scheduled-once instance must not exist before its scheduler fires",
);
assert.equal(
  (await listInstances(recurring.routineId)).length,
  0,
  "Recurring instance must not exist before its scheduler fires",
);

console.log("Waiting for the scheduled-once Convex job; no trigger is called by this script...");
const scheduledOnceInstance = await waitForInstance(
  scheduledOnce.routineId,
  180_000,
);
let scheduledOnceDetail = await getInstance(scheduledOnceInstance._id);
assert.equal(scheduledOnceDetail.instance.status, "WAITING");
assert.equal(scheduledOnceDetail.outboundMessages.length, 1);
assert.equal(scheduledOnceDetail.inboundSignals.length, 0);
assert.equal(scheduledOnceDetail.instance.scheduledFor, scheduledOnce.nextOccurrenceAt);
assert.ok(scheduledOnceDetail.run);
assert.deepEqual(
  scheduledOnceDetail.steps.map((step) => step.name),
  [
    "scheduler_trigger",
    "retrieve_context",
    "create_routine_instance",
    "compose_message",
    "send_message",
    "wait_for_reply",
  ],
);

const scheduledRawReply = "Haan medicine le li.";
const scheduledOutbound = scheduledOnceDetail.outboundMessages[0];
await mutate("mitraInbound:ingestSignal", {
  ownerKey,
  senderAddress,
  channel: "whatsapp",
  signalType: "text",
  rawContent: scheduledRawReply,
  messageId: `w2-once-reply-${fixtureKey}`,
  timestamp: Date.now(),
  metadata: { inReplyToMessageId: scheduledOutbound.messageId },
});
scheduledOnceDetail = await getInstance(scheduledOnceInstance._id);
assert.equal(scheduledOnceDetail.instance.status, "CONFIRMED");
assert.equal(scheduledOnceDetail.inboundSignals[0].rawContent, scheduledRawReply);
assert.match(
  scheduledOnceDetail.instance.selfReportInterpretation.summary,
  /reported taking their medicine/i,
);
assert.equal(scheduledOnceDetail.run.status, "completed");
assert.deepEqual(
  scheduledOnceDetail.steps.map((step) => step.name),
  [
    "scheduler_trigger",
    "retrieve_context",
    "create_routine_instance",
    "compose_message",
    "send_message",
    "wait_for_reply",
    "receive_signal",
    "persist_raw_signal",
    "interpret_signal",
    "update_routine_state",
    "complete",
  ],
);
const rereadOnce = await getInstance(scheduledOnceInstance._id);
assert.equal(rereadOnce.instance.status, scheduledOnceDetail.instance.status);
assert.equal(
  rereadOnce.instance.selfReportInterpretation.summary,
  scheduledOnceDetail.instance.selfReportInterpretation.summary,
);

console.log("Waiting for the selected-day recurrence to trigger autonomously...");
const recurringInstance = await waitForInstance(recurring.routineId, 210_000);
let recurringDetail = await getInstance(recurringInstance._id);
assert.equal(recurringDetail.instance.status, "WAITING");
assert.equal(recurringDetail.outboundMessages.length, 1);
const recurringRoutine = await query("mitraRoutines:getRoutine", {
  ownerKey,
  routineId: recurring.routineId,
});
assert.ok(recurringRoutine.nextOccurrenceAt > recurringDetail.instance.scheduledFor);
const recurrenceGap =
  recurringRoutine.nextOccurrenceAt - recurringDetail.instance.scheduledFor;
assert.ok(recurrenceGap >= 6 * 24 * 60 * 60 * 1_000);
assert.ok(recurrenceGap <= 8 * 24 * 60 * 60 * 1_000);
await sleep(5_000);
assert.equal((await listInstances(recurring.routineId)).length, 1);
recurringDetail = await getInstance(recurringInstance._id);
assert.equal(recurringDetail.outboundMessages.length, 1);
await mutate("mitraInbound:ingestSignal", {
  ownerKey,
  senderAddress,
  channel: "whatsapp",
  signalType: "text",
  rawContent: "Haan walk ho gayi.",
  messageId: `w2-recurring-reply-${fixtureKey}`,
  timestamp: Date.now(),
  metadata: {
    inReplyToMessageId: recurringDetail.outboundMessages[0].messageId,
  },
});
recurringDetail = await getInstance(recurringInstance._id);
assert.equal(recurringDetail.instance.status, "CONFIRMED");

console.log("Running the named seven-case Mitra W2 evaluation set...");
const evalRoutines = await Promise.all(
  MITRA_W2_EVAL_SET.map((testCase) =>
    createRoutine({
      type: testCase.routineType,
      label: testCase.label,
      timing: { kind: "once_now", timezone },
      responseWindowMs: testCase.id === "no_response" ? 10_000 : 120_000,
    }),
  ),
);
const evalInstances = await Promise.all(
  evalRoutines.map((routine) => waitForInstance(routine.routineId, 90_000)),
);
const initialNoResponseIndex = MITRA_W2_EVAL_SET.findIndex(
  (testCase) => testCase.id === "no_response",
);
const initialNoResponse = await getInstance(
  evalInstances[initialNoResponseIndex]._id,
);
assert.equal(initialNoResponse.instance.status, "WAITING");

await Promise.all(
  MITRA_W2_EVAL_SET.map(async (testCase, index) => {
    if (!testCase.signalType) return;
    const detail = await getInstance(evalInstances[index]._id);
    await mutate("mitraInbound:ingestSignal", {
      ownerKey,
      senderAddress,
      channel: "whatsapp",
      signalType: testCase.signalType,
      rawContent: testCase.rawContent,
      messageId: `w2-eval-${testCase.id}-${fixtureKey}`,
      timestamp: Date.now(),
      metadata: {
        inReplyToMessageId: detail.outboundMessages[0].messageId,
        ...(testCase.signalType === "reaction"
          ? { reactionToMessageId: detail.outboundMessages[0].messageId }
          : {}),
      },
    });
  }),
);

const evaluationResults = [];
for (const [index, testCase] of MITRA_W2_EVAL_SET.entries()) {
  const instanceId = evalInstances[index]._id;
  const detail =
    testCase.id === "no_response"
      ? await waitForInstanceState(instanceId, "NO_RESPONSE", 45_000)
      : await getInstance(instanceId);
  assert.equal(detail.instance.status, testCase.expectedState);
  assert.equal(
    detail.instance.selfReportInterpretation.outcome,
    testCase.expectedOutcome,
  );
  assert.match(
    detail.instance.selfReportInterpretation.summary,
    new RegExp(testCase.expectedSummary, "i"),
  );
  if (testCase.rawContent !== undefined) {
    assert.equal(detail.inboundSignals[0].rawContent, testCase.rawContent);
  }
  if (testCase.id === "explicit_negative_walk") {
    assert.doesNotMatch(
      detail.instance.selfReportInterpretation.summary,
      /reported completing/i,
    );
  }
  if (testCase.id === "reaction_signal") {
    assert.notEqual(detail.instance.status, "CONFIRMED");
  }
  evaluationResults.push({
    id: testCase.id,
    name: testCase.name,
    pass: true,
    state: detail.instance.status,
    outcome: detail.instance.selfReportInterpretation.outcome,
    rawPreserved:
      testCase.rawContent === undefined
        ? true
        : detail.inboundSignals[0].rawContent === testCase.rawContent,
    interpretation: detail.instance.selfReportInterpretation.summary,
  });
}

console.log("Running the existing M1.1 parent/routine/check-in regression...");
const legacyRoutine = await mutate("mitra:createRoutine", {
  ownerKey,
  parentId,
  type: "Medication",
  topics: ["Medication", "How they're feeling"],
  frequency: "Once",
  schedule: {
    date: "2026-09-01",
    time: "09:00",
    timeZone: timezone,
  },
  prompt: "Hi Papa. Medicines ho gayi? Aap kaisa feel kar rahe hain?",
});
const legacyRawReply = "Haan medicine le li. I am okay.";
await mutate("mitra:saveRawResponse", {
  ownerKey,
  checkInId: legacyRoutine.checkInId,
  rawResponse: legacyRawReply,
});
await mutate("mitra:interpretCheckIn", {
  ownerKey,
  checkInId: legacyRoutine.checkInId,
});
const legacyJourney = await query("mitra:getJourney", { ownerKey });
assert.equal(legacyJourney.parent._id, parentId);
assert.equal(legacyJourney.routine._id, legacyRoutine.routineId);
assert.equal(legacyJourney.checkIn._id, legacyRoutine.checkInId);
assert.equal(legacyJourney.checkIn.status, "OK");
assert.equal(legacyJourney.checkIn.rawResponse, legacyRawReply);
assert.match(
  legacyJourney.checkIn.interpretation.routineOutcome,
  /reported taking their medicine/i,
);

const sharedContext = await query("vesta:getHouseholdContext", {
  ownerKey,
  householdId,
});
assert.equal(sharedContext.members.length, 2);
assert.equal(sharedContext.preferences.length, 2);

console.log(
  JSON.stringify(
    {
      fixture: {
        ownerKey,
        householdId,
        primaryUserId,
        parentMemberId,
        parentId,
        endpointId,
      },
      scheduledOnce: {
        schedulerInvocation: "Convex scheduled internal mutation only",
        routineId: scheduledOnce.routineId,
        scheduledFor: scheduledOnceDetail.instance.scheduledFor,
        instanceId: scheduledOnceDetail.instance._id,
        outboundMessageId: scheduledOnceDetail.instance.outboundMessageId,
        composedMessage: scheduledOnceDetail.outboundMessages[0].message,
        rawReply: scheduledOnceDetail.inboundSignals[0].rawContent,
        interpretation:
          scheduledOnceDetail.instance.selfReportInterpretation.summary,
        finalState: scheduledOnceDetail.instance.status,
        runId: scheduledOnceDetail.run.runId,
        orderedTrace: scheduledOnceDetail.steps.map((step) => ({
          order: step.order,
          name: step.name,
          status: step.status,
          latencyMs: step.latencyMs,
        })),
        rereadStable: true,
      },
      recurring: {
        schedulerInvocation: "Convex scheduled internal mutation only",
        routineId: recurring.routineId,
        firstScheduledFor: recurringDetail.instance.scheduledFor,
        instanceCount: (await listInstances(recurring.routineId)).length,
        outboundMessageCount: recurringDetail.outboundMessages.length,
        finalState: recurringDetail.instance.status,
        nextOccurrenceAt: recurringRoutine.nextOccurrenceAt,
        nextOccurrenceGapMs: recurrenceGap,
        duplicatePrevented: true,
      },
      evaluations: evaluationResults,
      m1_1: {
        parentPersisted: true,
        routinePersisted: true,
        rawReplyPersisted: legacyJourney.checkIn.rawResponse === legacyRawReply,
        checkInStatus: legacyJourney.checkIn.status,
        selfReportWording: legacyJourney.checkIn.interpretation.routineOutcome,
      },
    },
    null,
    2,
  ),
);

async function createRoutine({
  type,
  label,
  timing,
  responseWindowMs,
}) {
  return mutate("mitraRoutines:createScheduledRoutine", {
    ownerKey,
    householdId,
    memberId: parentMemberId,
    parentId,
    communicationEndpointId: endpointId,
    type,
    label,
    timing,
    responseWindowMs,
  });
}

async function listInstances(routineId) {
  return query("mitraRoutines:listRoutineInstances", { ownerKey, routineId });
}

async function getInstance(checkInId) {
  return query("mitraRoutines:getRoutineInstance", { ownerKey, checkInId });
}

async function waitForInstance(routineId, timeoutMs) {
  return waitFor(
    async () => (await listInstances(routineId))[0],
    (instance) => Boolean(instance),
    timeoutMs,
    `routine ${routineId} to create an instance`,
  );
}

async function waitForInstanceState(checkInId, state, timeoutMs) {
  return waitFor(
    () => getInstance(checkInId),
    (detail) => detail.instance.status === state,
    timeoutMs,
    `instance ${checkInId} to reach ${state}`,
  );
}

async function waitFor(read, ready, timeoutMs, description) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read();
    if (ready(value)) return value;
    await sleep(2_000);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function localParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const value = (type) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return {
    time: `${String(value("hour")).padStart(2, "0")}:${String(value("minute")).padStart(2, "0")}`,
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
