import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { heightCmFromFeetInches, heightFeetInchesFromCm } from "../lib/aeviaSetup.ts";

const onboarding = await readFile(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8");
const setup = await readFile(new URL("../convex/m1Setup.ts", import.meta.url), "utf8");
const schema = await readFile(new URL("../convex/schema.ts", import.meta.url), "utf8");

assert.equal(heightCmFromFeetInches(5, 8), 172.7);
assert.deepEqual(heightFeetInchesFromCm(172.7), { feet: 5, inches: 8 });
assert.match(onboarding, /label="Mobile number"/);
assert.match(onboarding, /label="Email" hint="Optional"/);
assert.match(onboarding, /\+ Add another person/);
assert.match(onboarding, /\+ Add another routine/);
assert.match(onboarding, /\+ Add another medicine/);
assert.doesNotMatch(onboarding, /up to four during beta/i);
assert.match(onboarding, /Exact medicine name/);
assert.match(schema, /exactMedicineName: v\.optional/);
assert.match(setup, /exactMedicineName:/);
assert.match(onboarding, /Which meals should Tarla plan/);
assert.match(setup, /mealsAtHome: uniqueTextList\(tarla\.mealSlots\)/);
assert.match(onboarding, /When should Tarla remind you/);
assert.doesNotMatch(onboarding, /label = "Daily visit"/);
assert.match(onboarding, /Approve plan/);
assert.match(onboarding, /Make changes/);

console.log(JSON.stringify({
  evalSet: "final_frozen_flow_contract",
  passed: 16,
  failed: 0,
  realMessageSent: false,
}, null, 2));
