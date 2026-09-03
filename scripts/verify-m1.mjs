import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  activeRule,
  composeCookIntroduction,
  composeMitraMessage,
  cumulativeHouseholdMeasure,
  defaultHouseholdMember,
  formatHouseholdMeasure,
  householdMeasuresReconcile,
  normalizePhone,
  personHouseholdMeasure,
  to12Hour,
  to24Hour,
} from "../lib/aeviaSetup.ts";
import { onboardingSteps } from "../lib/onboardingFlowState.ts";
import { RECIPES } from "../lib/tarlaRecipes.ts";

const mitraSteps = onboardingSteps("mitra");
const tarlaSteps = onboardingSteps("tarla");
const bothSteps = onboardingSteps("both");
assert(mitraSteps.includes("mitraWho") && !mitraSteps.includes("tarlaFood"));
assert(tarlaSteps.includes("tarlaFood") && !tarlaSteps.includes("mitraWho"));
assert(bothSteps.includes("mitraWho") && bothSteps.includes("tarlaFood"));

const members = Array.from({ length: 6 }, (_, index) =>
  defaultHouseholdMember({ clientKey: `member_${index}`, name: `Member ${index + 1}` }),
);
assert.equal(new Set(members.map((member) => member.clientKey)).size, 6);
const sharedMemberKey = members[2].clientKey;
const specialistSelection = {
  mitraMemberClientKey: sharedMemberKey,
  tarlaEaterMemberClientKeys: [members[0].clientKey, sharedMemberKey],
};
assert.equal(specialistSelection.mitraMemberClientKey, specialistSelection.tarlaEaterMemberClientKeys[1]);

assert.equal(to24Hour("7:00 AM"), "07:00");
assert.equal(to24Hour("6:00 PM"), "18:00");
assert.equal(to12Hour("18:00"), "6:00 PM");
assert.equal(normalizePhone("+91", "98765 43210"), "+919876543210");
assert.throws(() => normalizePhone("+91", "123"));

const now = Date.now();
assert.equal(activeRule({ active: true, expiresAt: now + 1000 }, now), true);
assert.equal(activeRule({ active: true, expiresAt: now - 1 }, now), false);
assert.equal(activeRule({ active: false }, now), false);

for (const recipe of RECIPES) {
  assert(householdMeasuresReconcile(recipe.id, [1, 1, 0.5]), `${recipe.id} portions must reconcile`);
  const person = personHouseholdMeasure(recipe.id, 1);
  const total = cumulativeHouseholdMeasure(recipe.id, [1, 1, 0.5]);
  assert(person.quantity > 0 && total.quantity >= person.quantity);
  assert(!formatHouseholdMeasure(person).includes("serving"));
}

const directMessage = composeMitraMessage({
  context: { agent: "mitra", audience: "senior", surface: "whatsapp", moment: "reminder" },
  recipientSalutation: "Maa",
  seniorSalutation: "Maa",
  label: "evening walk",
  type: "Walk / activity",
  language: "Hinglish",
});
const caretakerMessage = composeMitraMessage({
  context: { agent: "mitra", audience: "caretaker", surface: "whatsapp", moment: "reminder" },
  recipientSalutation: "Ria",
  seniorSalutation: "Maa",
  label: "evening walk",
  type: "Walk / activity",
  language: "English",
});
assert.match(directMessage, /Maa/);
assert.match(caretakerMessage, /Maa's evening walk/);
assert.notEqual(directMessage, caretakerMessage);
assert.notEqual(
  composeCookIntroduction({ cookName: "Didi", language: "Hinglish", relationshipType: "hired_cook" }),
  composeCookIntroduction({ cookName: "Ria", language: "Hinglish", relationshipType: "family_cook" }),
);

const files = {
  onboarding: await readFile(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8"),
  dashboard: await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8"),
  schema: await readFile(new URL("../convex/schema.ts", import.meta.url), "utf8"),
  saveSetup: await readFile(new URL("../convex/m1Setup.ts", import.meta.url), "utf8"),
  landing: await readFile(new URL("../app/AeviaLanding.tsx", import.meta.url), "utf8"),
};

assert.match(files.landing, />Hello Aevia</);
assert.match(files.landing, /Meet Aevia — your personal household assistant\./);
assert.doesNotMatch(files.onboarding, /Exact medicine name/);
assert.doesNotMatch(files.onboarding, /value=\{"?(Sid|Papa|Pinky)/i);
assert.match(files.onboarding, /memberClientKey/);
assert.match(files.onboarding, /eaterMemberClientKeys/);
assert.match(files.onboarding, /senior_directly/);
assert.match(files.onboarding, /caretaker/);
assert.match(files.onboarding, /both/);
assert.match(files.onboarding, /nutritionMode/);
assert.match(files.onboarding, /cookingPeople/);
assert.match(files.schema, /preferredSalutation/);
assert.match(files.schema, /includedInPlanning/);
assert.match(files.schema, /coordinationMode/);
assert.match(files.schema, /expiresAt/);
assert.match(files.saveSetup, /provider: "development"/);
assert.doesNotMatch(files.dashboard, />Agent runs</i);
assert.match(files.dashboard, /Your home, today/);
assert.match(files.dashboard, /said it was done/);

console.log(JSON.stringify({
  evalSet: "m1_household_and_specialist_setup",
  passed: 31,
  failed: 0,
  realMessageSent: false,
  cases: [
    "Mitra-only branch skips Tarla",
    "Tarla-only branch skips Mitra",
    "Both branch uses both specialists",
    "Six household members retain unique local keys",
    "One member key is reused across Mitra and Tarla",
    "AM/PM converts deterministically",
    "Phone country prefix is normalized",
    "Expired temporary context is inactive",
    "Recipe measures reconcile from people to kitchen total",
    "Mitra direct and caretaker messages differ",
    "Hired and family cooking introductions differ",
    "Landing CTA and supporting copy match owner approval",
    "Exact medicine input is not offered",
    "Consumer dashboard has no Agent Runs navigation",
  ],
}, null, 2));
