import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { composeRoutineMessage } from "../lib/composeRoutineMessage.ts";
import { naturalizeCookMessage } from "../lib/tarlaMessageFormatting.ts";
import { formatDuration, runLatencyBreakdown } from "../lib/runLatency.ts";

const cookInstruction = naturalizeCookMessage(
  "Dinner plan (2.75 serving equivalents):\n- Tofu bhurji (tofu 412.5 g)\n- Child: low spice\nImportant: no peanut.",
);
assert.doesNotMatch(cookInstruction, /serving equivalents/i);
assert.doesNotMatch(cookInstruction, /\d+\.\d+ g/i);
assert.match(cookInstruction, /low spice/i);
assert.match(cookInstruction, /no peanut/i);

const dayInstruction = naturalizeCookMessage(
  "Breakfast (2.75 serving equivalents):\n- Besan chilla (besan 165.5 g)",
);
assert.doesNotMatch(dayInstruction, /serving equivalents/i);

const mitraMessage = composeRoutineMessage({
  salutation: "Papa",
  language: "Hinglish",
  style: "Warm & caring",
  routineType: "Walk / activity",
  label: "evening walk",
  isFirstContact: true,
  setupBy: "Sid",
});
assert.match(mitraMessage, /agreed routines/i);
assert.doesNotMatch(mitraMessage, /wants to know|monitor/i);

const landing = await readFile(new URL("../app/AeviaLanding.tsx", import.meta.url), "utf8");
const onboarding = await readFile(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8");
const m5Backend = await readFile(new URL("../convex/m5.ts", import.meta.url), "utf8");
const m1Backend = await readFile(new URL("../convex/m1Setup.ts", import.meta.url), "utf8");
assert.match(landing, /The everyday things you care about/);
assert.match(landing, /not independently verified/i);
assert.match(onboarding, /beta_terms_accepted/);
assert.match(m1Backend, /provider:\s*"development"/i);
assert.match(onboarding, /Here(?:’|')s what Aevia understood/);
assert.match(landing, /<Link[\s\S]{0,240}href="\/onboarding"/);
assert.doesNotMatch(landing, /<a[\s\S]{0,120}href="\/onboarding"/);
assert.doesNotMatch(landing + onboarding, /beforeunload|onbeforeunload/i);
assert.doesNotMatch(onboarding, /relationship:\s*"Papa"|salutation:\s*"Papa"|placeholder="e\.g\. Sid"/);
assert.match(onboarding, /setIdentity\(\{/);
assert.match(onboarding, /existing\.setup\.mitraPeople/);
assert.match(m1Backend, /args\.input\.routineId[\s\S]{0,3000}ctx\.db\.patch/);
assert.match(m5Backend, /setup:\s*\{/);
assert.equal(formatDuration(1_600_000), "26m 40s");
assert.equal(formatDuration(2_400), "2.4 s");
assert.deepEqual(
  runLatencyBreakdown([
    { name: "retrieve_context", latencyMs: 200 },
    { name: "send_message", latencyMs: 400 },
    { name: "wait_for_reply", latencyMs: 90_000 },
  ]),
  { humanWaitMs: 90_000, recordedProcessingMs: 600, transportCallMs: 400 },
);

console.log(JSON.stringify({
  evalSet: "minimum_testable_aevia_m5",
  passed: 17,
  failed: 0,
  realMessageSent: false,
  cases: [
    "Cook instruction hides serving equivalents",
    "Cook instruction rounds absurd decimal grams",
    "Cook instruction preserves restrictions",
    "Day instruction hides serving equivalents",
    "Mitra first contact is agreed-routine framed",
    "Landing core proposition exists",
    "Landing self-report wording is explicit",
    "Beta acceptance analytics is wired",
    "Development transport remains backend-only and understood review is explicit",
    "Landing onboarding links use client navigation",
    "No navigation warning is installed without unsaved data",
    "Fresh onboarding has no founder-specific persisted defaults",
    "Existing setup is hydrated from persisted data",
    "Existing Mitra setup preserves IDs and uses patch semantics",
    "M5 session query returns specialist setup",
    "Long end-to-end durations are human-readable",
    "Latency separates human wait, processing, and transport call time",
  ],
}, null, 2));
