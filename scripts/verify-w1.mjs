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
  throw new Error("W1 verification only runs against a Convex dev deployment");
}
if (!convexUrl) throw new Error("Convex development URL not found");

const client = new ConvexHttpClient(convexUrl);
const reference = (name) => makeFunctionReference(name);
const mutate = (name, args) => client.mutation(reference(name), args);
const query = (name, args) => client.query(reference(name), args);
const fixtureKey = new Date().toISOString().replace(/[^0-9]/g, "");
const ownerKey = `w1-verification-${fixtureKey}`;

const householdId = await mutate("vesta:createHousehold", {
  ownerKey,
  name: "W1 Isolated Test Household",
  timezone: "Asia/Kolkata",
});

const [primaryUserId, parentMemberId, cookMemberId] = await Promise.all([
  mutate("vesta:addMember", {
    ownerKey,
    householdId,
    name: "Test Sid",
    role: "primary user",
    languagePreference: "English",
  }),
  mutate("vesta:addMember", {
    ownerKey,
    householdId,
    name: "Test Papa",
    role: "parent",
    age: 68,
    languagePreference: "Hinglish",
    notes: "Synthetic W1 member; no health data.",
  }),
  mutate("vesta:addMember", {
    ownerKey,
    householdId,
    name: "Test Cook",
    role: "cook",
    languagePreference: "Hindi",
  }),
]);

await Promise.all([
  mutate("vesta:rememberPreference", {
    ownerKey,
    householdId,
    memberId: parentMemberId,
    category: "communication",
    key: "language",
    value: "Papa prefers Hinglish",
    source: "onboarding",
  }),
  mutate("vesta:rememberPreference", {
    ownerKey,
    householdId,
    memberId: cookMemberId,
    category: "communication",
    key: "text_language",
    value: "Cook prefers Hindi text",
    source: "onboarding",
  }),
  mutate("vesta:rememberPreference", {
    ownerKey,
    householdId,
    category: "weekly_meals",
    key: "avoid_repeat_poha",
    value: "Do not repeat poha this week",
    source: "explicit_correction",
  }),
]);

await mutate("vesta:rememberPreference", {
  ownerKey,
  householdId,
  memberId: primaryUserId,
  category: "food",
  key: "paneer_repetition",
  value: "Paneer can repeat during the week",
  source: "onboarding",
});
await mutate("vesta:rememberPreference", {
  ownerKey,
  householdId,
  memberId: primaryUserId,
  category: "food",
  key: "paneer_repetition",
  value: "Sid does not want paneer repeatedly",
  source: "explicit_correction",
});

await Promise.all([
  mutate("vesta:addCommunicationEndpoint", {
    ownerKey,
    householdId,
    memberId: primaryUserId,
    channel: "email",
    address: "w1-primary@example.invalid",
    preferredLanguage: "English",
    preferredMode: "text",
    active: true,
    consentStatus: "granted",
  }),
  mutate("vesta:addCommunicationEndpoint", {
    ownerKey,
    householdId,
    memberId: parentMemberId,
    channel: "whatsapp",
    address: "+910000000001",
    preferredLanguage: "Hinglish",
    preferredMode: "text",
    active: true,
    consentStatus: "granted",
  }),
  mutate("vesta:addCommunicationEndpoint", {
    ownerKey,
    householdId,
    memberId: cookMemberId,
    channel: "whatsapp",
    address: "+910000000002",
    preferredLanguage: "Hindi",
    preferredMode: "text",
    active: true,
    consentStatus: "pending",
  }),
]);

const mitraTrace = await createSyntheticRun({
  agent: "mitra",
  taskType: "routine_check_in_trace",
  inputSummary: "Verify a synthetic routine check-in over shared context",
  steps: [
    ["retrieve_context", "Loaded household, member, and active preferences"],
    ["compose_message", "Composed a synthetic Hinglish check-in summary"],
    ["send_message", "Development transport accepted the synthetic message"],
    ["receive_reply", "Received a synthetic acknowledgement"],
    ["interpret", "Interpreted the synthetic acknowledgement as okay"],
    ["persist_state", "Saved the synthetic check-in outcome"],
  ],
});

const tarlaTrace = await createSyntheticRun({
  agent: "tarla",
  taskType: "shared_context_access_check",
  inputSummary: "Verify Tarla can read shared household preferences",
  steps: [
    ["retrieve_context", "Loaded household, member, and active preferences"],
    ["interpret", "Recognized active food preferences without planning meals"],
    ["persist_state", "Recorded completion of the shared-context check"],
  ],
});

const legacyParentId = await mutate("mitra:addParent", {
  ownerKey,
  name: "Legacy Test Papa",
  relationship: "Father",
  childDisplayName: "Test Sid",
  salutation: "Papa",
  preferredLanguage: "Hinglish",
  communicationPreference: "Text",
  conversationStyle: "Warm & caring",
  primaryIntent: "ROUTINES",
  context: "Synthetic M1.1 compatibility check.",
});
await mutate("vesta:linkLegacyParent", {
  ownerKey,
  parentId: legacyParentId,
  householdId,
  memberId: parentMemberId,
});
const legacyRoutine = await mutate("mitra:createRoutine", {
  ownerKey,
  parentId: legacyParentId,
  type: "Medication",
  topics: ["Medication", "How they're feeling"],
  frequency: "Once",
  schedule: {
    date: "2026-09-01",
    time: "09:00",
    timeZone: "Asia/Kolkata",
  },
  prompt: "Hi Papa. Medicines ho gayi? Aap kaisa feel kar rahe hain?",
});
await mutate("mitra:saveRawResponse", {
  ownerKey,
  checkInId: legacyRoutine.checkInId,
  rawResponse: "Haan medicine le li. I am okay.",
});
await mutate("mitra:interpretCheckIn", {
  ownerKey,
  checkInId: legacyRoutine.checkInId,
});

const [context, allPreferences, endpoints, legacyJourney] = await Promise.all([
  query("vesta:getHouseholdContext", { ownerKey, householdId }),
  query("vesta:listPreferences", {
    ownerKey,
    householdId,
    includeInactive: true,
  }),
  query("vesta:listCommunicationEndpoints", {
    ownerKey,
    householdId,
    includeInactive: true,
  }),
  query("mitra:getJourney", { ownerKey }),
]);

assert.equal(context.household._id, householdId);
assert.equal(context.members.length, 3);
assert.deepEqual(
  context.members.map((member) => member.role).sort(),
  ["cook", "parent", "primary user"],
);
assert.equal(context.preferences.length, 4);
assert.equal(allPreferences.length, 5);
const paneerHistory = allPreferences.filter(
  (preference) => preference.key === "paneer_repetition",
);
assert.equal(paneerHistory.length, 2);
assert.equal(paneerHistory.filter((preference) => preference.active).length, 1);
assert.equal(
  paneerHistory.find((preference) => preference.active)?.source,
  "explicit_correction",
);
assert.equal(endpoints.length, 3);
assertTrace(mitraTrace, [1, 2, 3, 4, 5, 6]);
assertTrace(tarlaTrace, [1, 2, 3]);
assert.equal(legacyJourney?.parent._id, legacyParentId);
assert.equal(legacyJourney?.parent.householdId, householdId);
assert.equal(legacyJourney?.parent.memberId, parentMemberId);
assert.equal(legacyJourney?.routine?._id, legacyRoutine.routineId);
assert.equal(legacyJourney?.checkIn?._id, legacyRoutine.checkInId);
assert.equal(legacyJourney?.checkIn?.status, "OK");
assert.ok(legacyJourney?.checkIn?.interpretation);

console.log(
  JSON.stringify(
    {
      fixture: { ownerKey, householdId },
      sharedContext: {
        householdName: context.household.name,
        timezone: context.household.timezone,
        memberRoles: context.members.map((member) => member.role).sort(),
        activePreferences: context.preferences.length,
        storedPreferenceHistory: allPreferences.length,
        correctionHistoryRetained: paneerHistory.some(
          (preference) => !preference.active,
        ),
        communicationEndpoints: endpoints.map((endpoint) => ({
          channel: endpoint.channel,
          preferredMode: endpoint.preferredMode,
          consentStatus: endpoint.consentStatus,
        })),
      },
      runs: [traceSummary(mitraTrace), traceSummary(tarlaTrace)],
      m1_1: {
        parentLinkedToHousehold: true,
        routinePersisted: true,
        checkInStatus: legacyJourney.checkIn.status,
        interpretationPersisted: Boolean(legacyJourney.checkIn.interpretation),
      },
    },
    null,
    2,
  ),
);

async function createSyntheticRun({
  agent,
  taskType,
  inputSummary,
  steps,
}) {
  const run = await mutate("agentRuns:createRun", {
    ownerKey,
    householdId,
    agent,
    taskType,
    inputSummary,
  });
  await mutate("agentRuns:updateRunStatus", {
    ownerKey,
    runId: run.runId,
    status: "running",
  });

  for (const [index, [name, outputSummary]] of steps.entries()) {
    const stepId = await mutate("agentRuns:addRunStep", {
      ownerKey,
      runId: run.runId,
      name,
      order: index + 1,
      inputSummary: `Synthetic ${name} input`,
    });
    await mutate("agentRuns:updateRunStep", {
      ownerKey,
      stepId,
      status: "running",
    });
    await mutate("agentRuns:updateRunStep", {
      ownerKey,
      stepId,
      status: "completed",
      outputSummary,
    });
  }

  await mutate("agentRuns:updateRunStatus", {
    ownerKey,
    runId: run.runId,
    status: "completed",
    outputSummary: `Completed ${steps.length} synthetic trace steps`,
  });
  return query("agentRuns:getRunTrace", { ownerKey, runId: run.runId });
}

function assertTrace(trace, expectedOrder) {
  assert.equal(trace.run.status, "completed");
  assert.deepEqual(
    trace.steps.map((step) => step.order),
    expectedOrder,
  );
  assert.ok(trace.steps.every((step) => step.status === "completed"));
  assert.ok(trace.steps.every((step) => step.startedAt !== undefined));
  assert.ok(trace.steps.every((step) => step.completedAt !== undefined));
  assert.ok(trace.steps.every((step) => step.latencyMs !== undefined));
}

function traceSummary(trace) {
  return {
    runId: trace.run.runId,
    agent: trace.run.agent,
    status: trace.run.status,
    totalLatencyMs: trace.run.totalLatencyMs,
    steps: trace.steps.map((step) => ({
      order: step.order,
      name: step.name,
      status: step.status,
      latencyMs: step.latencyMs,
    })),
  };
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
