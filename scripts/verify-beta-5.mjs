import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parseBetaRecipients, recipientView } from "../lib/betaRecipients.ts";
import { interpretRoutineSignal } from "../lib/interpretRoutineSignal.ts";
import { exactPreparedTarlaInstruction } from "../lib/preparedTarlaPayload.ts";
import { composeMitraMessage } from "../lib/aeviaSetup.ts";
import { composeMitraAcknowledgement } from "../lib/m2Execution.ts";
import { resolveMemberSalutation } from "../lib/mitraSalutation.ts";

const registry = JSON.stringify([
  { id: "sid", displayName: "Sid", e164: "+919900000001", role: "primary_user", enabled: true },
  { id: "mohit", displayName: "Mohit", e164: "+919900000002", role: "senior", enabled: true },
  { id: "priya", displayName: "Priya", e164: "+919900000003", role: "cook", enabled: true },
  { id: "reecha", displayName: "Reecha", e164: "+919900000004", role: "senior", enabled: false },
  { id: "guest", displayName: "Guest", e164: "+919900000005", role: "other", enabled: true },
]);
const recipients = parseBetaRecipients(registry);
assert.equal(recipients.length, 5);
assert.equal(recipients.filter((recipient) => recipient.enabled).length, 4);
const browserValue = JSON.stringify(recipients.map(recipientView));
assert.ok(!browserValue.includes("+919900000001"), "raw E.164 never reaches the browser projection");
assert.equal(recipients.find((recipient) => recipient.id === "priya")?.id, "priya");
const mohitSalutation = resolveMemberSalutation({ preferredSalutation: "papa", displayName: "Mohit" });
assert.equal(mohitSalutation, "Papa");
assert.equal(resolveMemberSalutation({ displayName: "Mohit" }), "Mohit Ji");
const mitraReminderInput = { recipient: { preferredSalutation: "papa", displayName: "Mohit" }, senior: { preferredSalutation: "papa", displayName: "Mohit" }, label: "evening walk", type: "Walk / activity", language: "Hinglish", context: { agent: "mitra", audience: "senior", surface: "whatsapp", moment: "reminder" } };
const previewText = composeMitraMessage({ recipientSalutation: resolveMemberSalutation(mitraReminderInput.recipient), seniorSalutation: resolveMemberSalutation(mitraReminderInput.senior), label: mitraReminderInput.label, type: mitraReminderInput.type, language: mitraReminderInput.language, context: mitraReminderInput.context });
const dispatchedText = composeMitraMessage({ recipientSalutation: resolveMemberSalutation(mitraReminderInput.recipient), seniorSalutation: resolveMemberSalutation(mitraReminderInput.senior), label: mitraReminderInput.label, type: mitraReminderInput.type, language: mitraReminderInput.language, context: mitraReminderInput.context });
assert.equal(previewText, "Papa, evening walk ka time ho gaya.");
assert.equal(dispatchedText, previewText, "Mitra preview must equal dispatched text");
assert.equal(composeMitraAcknowledgement({ language: "Hinglish", outcome: "completed", recipientSalutation: mohitSalutation }), "Achha, theek hai Papa. Thank you.");
for (const reply of ["Haan", "Ho gaya"]) assert.equal(interpretRoutineSignal({ signalType: "text", rawContent: reply, routineType: "Walk / activity", parentLabel: "Mohit" }).state, "CONFIRMED");
for (const reply of ["Nahi", "Abhi nahi", "Thodi der mein", "maybe later"]) assert.equal(interpretRoutineSignal({ signalType: "text", rawContent: reply, routineType: "Walk / activity", parentLabel: "Mohit" }).state, "UNCONFIRMED");
const tarla = readFileSync(new URL("../scripts/verify-w4-meta-tarla-live.mjs", import.meta.url), "utf8");
const tarlaInbound = readFileSync(new URL("../convex/tarlaInbound.ts", import.meta.url), "utf8");
assert.match(tarlaInbound, /ingestCookSignal/);
assert.match(tarla, /Palak nahi hai/);
const betaRoute = readFileSync(new URL("../app/api/admin/beta/route.ts", import.meta.url), "utf8");
assert.match(betaRoute, /body\.confirmation !== "SEND"/);
assert.doesNotMatch(betaRoute, /recipientSalutation:\s*"Ji"/);
assert.match(betaRoute, /executeProvenW4\(\{ recipient, agent: body\.agent, preparedToken: body\.preparedToken \}\)/);
const executor = readFileSync(new URL("../lib/betaW4Execution.ts", import.meta.url), "utf8");
assert.match(executor, /getBetaMitraRecipientContext/);
assert.doesNotMatch(
  executor,
  /runNode\(|scripts\/verify-w4-meta-(?:tarla-)?live\.mjs/,
  "The deployed admin runner must not invoke local verifier scripts",
);
assert.match(executor, /tarlaDayPlanning:sendPreparedDayInstruction/);
assert.match(executor, /mitraRoutines:createScheduledRoutine/);
assert.match(executor, /betaAdmin:prepareApprovedTarlaInstruction/);
assert.match(tarla, /prepareExistingPlan/);
assert.match(tarla, /Selected recipient has no approved\/current Tarla plan/);
const onboarding = readFileSync(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8");
assert.match(onboarding, /"Approve plan"/);
assert.match(onboarding, /"Make changes"/);
assert.match(onboarding, /latestPlan\?\.status === "awaiting_approval"/);
assert.match(onboarding, /setShowPlanChanges/);
const dayPlanning = readFileSync(new URL("../convex/tarlaDayPlanning.ts", import.meta.url), "utf8");
assert.match(dayPlanning, /owner_test_admin/);
assert.match(dayPlanning, /household user did not click approval/);
assert.match(dayPlanning, /Test-admin plan approval is not configured or authorised/);
const betaAdmin = readFileSync(new URL("../convex/betaAdmin.ts", import.meta.url), "utf8");
assert.match(betaAdmin, /resolveCanonicalInboundContact/);
assert.match(betaAdmin, /signal\.metadata\.webhookValidatedAt === undefined/);
assert.match(betaAdmin, /communicationEndpointId: endpoint\._id/);
assert.match(betaAdmin, /signal\.matched \|\| signal\.runId \|\| signal\.checkInId/);
assert.match(betaAdmin, /provider:\s*"meta"/);
assert.match(betaAdmin, /ready:\s*true/);
assert.match(betaAdmin, /approvalSource === "household_user"/);
assert.match(betaAdmin, /developmentMessages\.length === 0/);
assert.match(betaAdmin, /providerMessages\.length !== 0/);
assert.match(betaAdmin, /status:\s*"instruction_ready"/);
const betaAdminMeta = readFileSync(new URL("../convex/betaAdminMeta.ts", import.meta.url), "utf8");
assert.match(betaAdminMeta, /fields=id/);
assert.doesNotMatch(betaAdminMeta, /\/messages/);
const exactPreview = "Namaste Priya. Aaj ka meal plan — exact prepared text.";
assert.equal(
  exactPreparedTarlaInstruction({ preparedInstruction: exactPreview, currentInstruction: exactPreview }),
  exactPreview,
  "Tarla preview text equals the actual text selected for dispatch",
);
assert.throws(
  () => exactPreparedTarlaInstruction({ preparedInstruction: exactPreview, currentInstruction: `${exactPreview} changed` }),
  /stale/,
  "changed context fails closed instead of regenerating",
);
const stateFile = `.beta-w4-tarla-contract-${randomUUID()}.json`;
const liveHarnessEnvironment = {
  ...process.env,
  W4_META_TEST_RECIPIENT_E164: "+919900000099",
  W4_META_TARLA_STATE_PATH: stateFile,
  W4_TRANSPORT_PROVIDER: "development",
};
const preparedOutput = execFileSync(process.execPath, ["scripts/verify-w4-meta-tarla-live.mjs", "prepare_preview"], { cwd: process.cwd(), env: liveHarnessEnvironment, encoding: "utf8" });
const prepared = JSON.parse(preparedOutput.slice(preparedOutput.indexOf("{")));
const sentOutput = execFileSync(process.execPath, ["scripts/verify-w4-meta-tarla-live.mjs", "send_prepared"], { cwd: process.cwd(), env: liveHarnessEnvironment, encoding: "utf8" });
const dispatched = JSON.parse(sentOutput.slice(sentOutput.indexOf("{")));
assert.equal(dispatched.instruction, prepared.instruction, "Tarla preview exactly equals development-transport dispatch text");
rmSync(stateFile, { force: true });
console.log("BETA-5 registry, recipient safety, Mitra interpretation, and Tarla-path checks passed.");
