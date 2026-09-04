import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parseBetaRecipients, recipientView } from "../lib/betaRecipients.ts";
import { interpretRoutineSignal } from "../lib/interpretRoutineSignal.ts";
import { exactPreparedTarlaInstruction } from "../lib/preparedTarlaPayload.ts";

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
for (const reply of ["Haan", "Ho gaya"]) assert.equal(interpretRoutineSignal({ signalType: "text", rawContent: reply, routineType: "Walk / activity", parentLabel: "Mohit" }).state, "CONFIRMED");
for (const reply of ["Nahi", "Abhi nahi", "Thodi der mein", "maybe later"]) assert.equal(interpretRoutineSignal({ signalType: "text", rawContent: reply, routineType: "Walk / activity", parentLabel: "Mohit" }).state, "UNCONFIRMED");
const tarla = readFileSync(new URL("../scripts/verify-w4-meta-tarla-live.mjs", import.meta.url), "utf8");
const tarlaInbound = readFileSync(new URL("../convex/tarlaInbound.ts", import.meta.url), "utf8");
assert.match(tarlaInbound, /ingestCookSignal/);
assert.match(tarla, /Palak nahi hai/);
const betaRoute = readFileSync(new URL("../app/api/admin/beta/route.ts", import.meta.url), "utf8");
assert.match(betaRoute, /body\.confirmation !== "SEND"/);
assert.match(betaRoute, /executeProvenW4\(\{ recipient, agent: body\.agent, preparedToken: body\.preparedToken \}\)/);
const executor = readFileSync(new URL("../lib/betaW4Execution.ts", import.meta.url), "utf8");
assert.match(executor, /W4_META_TEST_RECIPIENT_E164: recipient\.e164/);
assert.match(executor, /verify-w4-meta-tarla-live\.mjs/);
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
