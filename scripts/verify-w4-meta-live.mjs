import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const environmentPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const statePath = process.env.W4_META_LIVE_STATE_PATH
  ? fileURLToPath(new URL(`../${process.env.W4_META_LIVE_STATE_PATH}`, import.meta.url))
  : fileURLToPath(new URL("../.w4-meta-live-state.json", import.meta.url));
const localEnvironment = readEnvironmentFile(environmentPath);
const deployment =
  process.env.CONVEX_DEPLOYMENT ?? localEnvironment.CONVEX_DEPLOYMENT;
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  process.env.CONVEX_URL ??
  localEnvironment.NEXT_PUBLIC_CONVEX_URL ??
  localEnvironment.CONVEX_URL;

if (!deployment?.startsWith("dev:")) {
  throw new Error("The live Meta check only runs against a Convex development deployment");
}
if (!convexUrl) throw new Error("Convex development URL not found");

const client = new ConvexHttpClient(convexUrl);
const reference = (name) => makeFunctionReference(name);
const mutate = (name, args) => client.mutation(reference(name), args);
const query = (name, args) => client.query(reference(name), args);
const command = process.argv[2];

if (command === "prepare") {
  await prepare();
} else if (command === "retry") {
  await retryTimedOutAttempt();
} else if (command === "inspect") {
  await inspect();
} else if (command === "status") {
  await status();
} else {
  throw new Error("Use prepare, retry, inspect, or status");
}

async function prepare() {
  const previousAttempts = await previousFailedAttempts();
  const recipient = (
    process.env.W4_META_TEST_RECIPIENT_E164 ??
    localEnvironment.W4_META_TEST_RECIPIENT_E164 ??
    ""
  ).trim();
  if (!/^\+[1-9]\d{7,14}$/.test(recipient)) {
    throw new Error(
      "Set W4_META_TEST_RECIPIENT_E164 in ignored .env.local using + followed by the country code and number",
    );
  }

  const fixtureKey = new Date().toISOString().replace(/[^0-9]/g, "");
  const ownerKey = `w4-meta-live-${fixtureKey}`;
  const timezone = "Asia/Kolkata";
  const scheduledAt = Date.now() + scheduledDelayMs();

  const householdId = await mutate("vesta:createHousehold", {
    ownerKey,
    name: "W4 Meta Developer Test Household",
    timezone,
  });
  const [primaryUserId, parentMemberId] = await Promise.all([
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: "W4 Developer",
      role: "primary user",
      languagePreference: "English",
    }),
    mutate("vesta:addMember", {
      ownerKey,
      householdId,
      name: "W4 Test Parent",
      role: "parent",
      languagePreference: "Hinglish",
      notes: "Developer-controlled endpoint for the W4 Meta transport proof.",
    }),
  ]);
  const parentId = await mutate("mitra:addParent", {
    ownerKey,
    name: "W4 Test Parent",
    relationship: "Other",
    childDisplayName: "W4 Developer",
    salutation: "Ji",
    preferredLanguage: "Hinglish",
    communicationPreference: "Text",
    conversationStyle: "Straightforward",
    primaryIntent: "ROUTINES",
    context: "This is a consented developer-run transport test.",
  });
  await mutate("vesta:linkLegacyParent", {
    ownerKey,
    parentId,
    householdId,
    memberId: parentMemberId,
  });
  const endpointId = await mutate("vesta:addCommunicationEndpoint", {
    ownerKey,
    householdId,
    memberId: parentMemberId,
    channel: "whatsapp",
    address: recipient,
    preferredLanguage: "Hinglish",
    preferredMode: "text",
    providerMetadata: { provider: "meta", ready: true },
    active: true,
    consentStatus: "granted",
    verifiedAt: Date.now(),
  });
  await mutate("mitraRoutines:setMemberReadiness", {
    ownerKey,
    householdId,
    memberId: parentMemberId,
    readiness: "ready",
  });
  const routine = await mutate("mitraRoutines:createScheduledRoutine", {
    ownerKey,
    householdId,
    memberId: parentMemberId,
    parentId,
    communicationEndpointId: endpointId,
    type: "Walk / activity",
    label: "evening walk",
    timing: {
      kind: "once_scheduled",
      timezone,
      scheduledAt,
    },
    responseWindowMs: 10 * 60 * 1_000,
  });
  assert.equal(routine.nextOccurrenceAt, scheduledAt);

  const state = {
    ownerKey,
    householdId,
    primaryUserId,
    parentMemberId,
    parentId,
    endpointId,
    routineId: routine.routineId,
    scheduledAt,
    createdAt: Date.now(),
    previousAttempts,
  };
  if (process.env.W4_SKIP_LOCAL_STATE !== "1") {
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      flag: previousAttempts.length ? "w" : "wx",
    });
  }

  await waitForOutbound(state);
}

async function waitForOutbound(state) {
  const detail = await waitFor(
    async () => {
      const instances = await query("mitraRoutines:listRoutineInstances", {
        ownerKey: state.ownerKey,
        routineId: state.routineId,
      });
      if (!instances[0]) return null;
      return query("mitraRoutines:getRoutineInstance", {
        ownerKey: state.ownerKey,
        checkInId: instances[0]._id,
      });
    },
    (value) =>
      Boolean(
        value?.transportMessages.some((message) =>
          ["accepted", "sent", "delivered", "read", "failed"].includes(
            message.status,
          ),
        ),
      ),
    5 * 60 * 1_000,
    "the autonomous scheduler and Meta provider dispatch",
  );
  const message = detail.transportMessages[0];
  assert.ok(message, "Expected one external transport message");
  assert.equal(detail.outboundMessages.length, 0);
  assert.equal(message.provider, "meta");
  assert.notEqual(message.status, "failed", `Meta send failed: ${message.failureCode}`);

  console.log(
    JSON.stringify(
      {
        test: "w4_meta_developer_round_trip",
        phase: "outbound_accepted",
        scheduledAt: new Date(state.scheduledAt).toISOString(),
        instanceCreatedAt: new Date(detail.instance.createdAt).toISOString(),
        providerAcceptedAt: message.providerAcceptedAt
          ? new Date(message.providerAcceptedAt).toISOString()
          : null,
        providerStatus: message.status,
        providerMessageId: message.providerMessageId,
        runId: detail.run?._id,
        instanceId: detail.instance._id,
        instanceState: detail.instance.status,
        manualSendUsed: false,
        replyInstruction: "Reply in WhatsApp with: Haan walk ho gayi.",
      },
      null,
      2,
    ),
  );
}

async function retryTimedOutAttempt() {
  if (!existsSync(statePath)) {
    throw new Error("No live Meta test state exists to retry");
  }
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const detail = await currentDetail(state);
  if (!detail || detail.instance.status !== "NO_RESPONSE") {
    throw new Error("A retry is allowed only after the recorded attempt reaches NO_RESPONSE");
  }
  if (detail.inboundSignals.length) {
    throw new Error("The recorded attempt already has an inbound signal");
  }
  const scheduledAt = Date.now() + scheduledDelayMs();
  const routine = await mutate("mitraRoutines:createScheduledRoutine", {
    ownerKey: state.ownerKey,
    householdId: state.householdId,
    memberId: state.parentMemberId,
    parentId: state.parentId,
    communicationEndpointId: state.endpointId,
    type: "Walk / activity",
    label: "evening walk",
    timing: {
      kind: "once_scheduled",
      timezone: "Asia/Kolkata",
      scheduledAt,
    },
    responseWindowMs: 10 * 60 * 1_000,
  });
  const retryState = {
    ...state,
    routineId: routine.routineId,
    scheduledAt,
    createdAt: Date.now(),
    previousAttempts: [
      ...(Array.isArray(state.previousAttempts) ? state.previousAttempts : []),
      {
        ownerKey: state.ownerKey,
        routineId: state.routineId,
        instanceId: detail.instance._id,
        runId: detail.run?._id,
        scheduledAt: state.scheduledAt,
        finalState: detail.instance.status,
      },
    ],
  };
  writeFileSync(statePath, `${JSON.stringify(retryState, null, 2)}\n`, "utf8");
  await waitForOutbound(retryState);
}

async function previousFailedAttempts() {
  if (!existsSync(statePath)) return [];
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const instances = await query("mitraRoutines:listRoutineInstances", {
    ownerKey: state.ownerKey,
    routineId: state.routineId,
  });
  const instance = instances[0];
  const detail = instance
    ? await query("mitraRoutines:getRoutineInstance", {
        ownerKey: state.ownerKey,
        checkInId: instance._id,
      })
    : null;
  const failedMessage = detail?.transportMessages.find(
    (message) => message.status === "failed",
  );
  if (!failedMessage) {
    throw new Error(
      "A live Meta test is already recorded and did not end in a provider failure",
    );
  }
  return [
    ...(Array.isArray(state.previousAttempts) ? state.previousAttempts : []),
    {
      ownerKey: state.ownerKey,
      routineId: state.routineId,
      instanceId: instance?._id,
      runId: detail?.run?._id,
      scheduledAt: state.scheduledAt,
      providerFailureCode: failedMessage.failureCode,
    },
  ];
}

async function inspect() {
  if (!existsSync(statePath)) {
    throw new Error("No live Meta test state exists; run the approved prepare step first");
  }
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const detail = await waitFor(
    async () => {
      const instances = await query("mitraRoutines:listRoutineInstances", {
        ownerKey: state.ownerKey,
        routineId: state.routineId,
      });
      if (!instances[0]) return null;
      return query("mitraRoutines:getRoutineInstance", {
        ownerKey: state.ownerKey,
        checkInId: instances[0]._id,
      });
    },
    (value) => Boolean(value?.inboundSignals.length),
    2 * 60 * 1_000,
    "a signed Meta inbound webhook",
  );
  const reread = await query("mitraRoutines:getRoutineInstance", {
    ownerKey: state.ownerKey,
    checkInId: detail.instance._id,
  });
  const message = detail.transportMessages[0];
  const inbound = detail.inboundSignals[0];
  assert.ok(message?.providerMessageId);
  assert.ok(inbound, "Expected a persisted inbound signal");
  assert.equal(reread.instance.status, detail.instance.status);
  assert.equal(reread.inboundSignals[0].rawContent, inbound.rawContent);

  console.log(
    JSON.stringify(
      {
        test: "w4_meta_developer_round_trip",
        phase: "inbound_processed",
        scheduledAt: new Date(state.scheduledAt).toISOString(),
        providerAcceptedAt: message.providerAcceptedAt
          ? new Date(message.providerAcceptedAt).toISOString()
          : null,
        providerMessageId: message.providerMessageId,
        inboundAt: new Date(inbound.timestamp).toISOString(),
        rawReply: inbound.rawContent,
        interpretation: detail.instance.selfReportInterpretation ?? null,
        finalState: detail.instance.status,
        runId: detail.run?._id,
        runStatus: detail.run?.status,
        orderedTrace: detail.steps.map((step) => ({
          order: step.order,
          name: step.name,
          status: step.status,
        })),
        stableReread: true,
        manualSendUsed: false,
      },
      null,
      2,
    ),
  );
}

async function status() {
  if (!existsSync(statePath)) {
    throw new Error("No live Meta test state exists");
  }
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const detail = await currentDetail(state);
  console.log(
    JSON.stringify(
      {
        test: "w4_meta_developer_round_trip",
        phase: "current_status",
        scheduledAt: new Date(state.scheduledAt).toISOString(),
        instanceState: detail?.instance.status ?? null,
        runId: detail?.run?._id ?? null,
        runStatus: detail?.run?.status ?? null,
        transport: detail?.transportMessages.map((message) => ({
          status: message.status,
          providerStatus: message.providerStatus,
          providerAcceptedAt: message.providerAcceptedAt,
          deliveredAt: message.deliveredAt,
          readAt: message.readAt,
          failureCode: message.failureCode,
        })),
        inboundSignalCount: detail?.inboundSignals.length ?? 0,
        orderedTrace: detail?.steps.map((step) => ({
          order: step.order,
          name: step.name,
          status: step.status,
        })),
      },
      null,
      2,
    ),
  );
}

async function currentDetail(state) {
  const instances = await query("mitraRoutines:listRoutineInstances", {
    ownerKey: state.ownerKey,
    routineId: state.routineId,
  });
  if (!instances[0]) return null;
  return query("mitraRoutines:getRoutineInstance", {
    ownerKey: state.ownerKey,
    checkInId: instances[0]._id,
  });
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

function scheduledDelayMs() {
  const configured = Number(process.env.W4_META_SCHEDULE_DELAY_MS ?? 120_000);
  if (!Number.isFinite(configured) || configured < 1_000 || configured > 10 * 60_000) {
    throw new Error("W4_META_SCHEDULE_DELAY_MS must be between 1 second and 10 minutes");
  }
  return configured;
}
