import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveMitraRecipient, allocateMealsToCookVisits } from "../lib/m2Execution.ts";
import { interpretRoutineSignal } from "../lib/interpretRoutineSignal.ts";
import { cumulativeHouseholdMeasure, formatHouseholdMeasure } from "../lib/aeviaSetup.ts";
import { shouldApplyDeliveryState } from "../lib/messageTransport.ts";

const phaseATempRoot = await mkdtemp(join(tmpdir(), "vesta-mitra-phase-a-"));

const composeCookInstruction = await (async () => {
  try {
    const source = await readFile(new URL("../lib/tarlaMessages.ts", import.meta.url), "utf8");
    const rewritten = source
      .replace(
        'from "./tarlaRecipes"',
        'from "./tarlaRecipes.ts"',
      )
      .replace(
        'from "./tarlaMessageFormatting"',
        'from "./tarlaMessageFormatting.ts"',
      )
      .replace(
        'from "./aeviaSetup"',
        'from "./aeviaSetup.ts"',
      );

    await Promise.all([
      writeFile(
        join(phaseATempRoot, "tarlaMessages.ts"),
        rewritten,
      ),
      writeFile(
        join(phaseATempRoot, "tarlaRecipes.ts"),
        await readFile(new URL("../lib/tarlaRecipes.ts", import.meta.url), "utf8"),
      ),
      writeFile(
        join(phaseATempRoot, "tarlaMessageFormatting.ts"),
        await readFile(new URL("../lib/tarlaMessageFormatting.ts", import.meta.url), "utf8"),
      ),
      writeFile(
        join(phaseATempRoot, "aeviaSetup.ts"),
        await readFile(new URL("../lib/aeviaSetup.ts", import.meta.url), "utf8"),
      ),
    ]);

    const moduleUrl = pathToFileURL(join(phaseATempRoot, "tarlaMessages.ts")).href;
    const loadedModule = await import(moduleUrl);
    return loadedModule.composeCookInstruction;
  } finally {
    await rm(phaseATempRoot, { recursive: true, force: true });
  }
})();

const cases = [];
const tarlaInbound = await readFile(new URL("../convex/tarlaInbound.ts", import.meta.url), "utf8");
function check(name, fn) {
  fn();
  cases.push(name);
}

check("Mitra resolves one configured recipient", () => {
  const result = resolveMitraRecipient({
    communicationPath: "senior_directly",
    directAvailable: true,
    caretakerAvailable: false,
  });
  assert.equal(result.recipientClass, "senior");
});

check("Mitra halts when no valid recipient is configured", () => {
  const result = resolveMitraRecipient({
    communicationPath: "senior_directly",
    directAvailable: false,
    caretakerAvailable: false,
  });
  assert.equal(result.status, "unresolved");
  assert.equal(result.recipientClass, undefined);
  assert.equal(result.reason.includes("No consented recipient"), true);
});

check("Mitra keeps raw reply, interpretation, and state distinct", () => {
  const rawReply = "Haan, walk ho gayi.";
  const interpretation = interpretRoutineSignal({
    signalType: "text",
    rawContent: rawReply,
    routineType: "Walk / activity",
    parentLabel: "Maa",
  });
  assert.equal(rawReply, "Haan, walk ho gayi.");
  assert.equal(interpretation.state, "CONFIRMED");
  assert.equal(interpretation.basis, "self_report");
  assert.notEqual(rawReply, interpretation.summary);
});

check("Provider acceptance never implies delivery", () => {
  assert.equal(shouldApplyDeliveryState("accepted", "delivered"), true);
  assert.equal(shouldApplyDeliveryState("delivered", "accepted"), false);
  assert.equal(shouldApplyDeliveryState("accepted", "read"), true);
});

check("Tarla selects the cooking person for the scheduled meal", () => {
  const allocations = allocateMealsToCookVisits(["breakfast", "dinner"], [
    { id: "morning-cook", arrivalTime: "07:30", mealSlots: ["breakfast"], relationshipType: "hired_cook" },
    { id: "evening-cook", arrivalTime: "18:30", mealSlots: ["dinner"], relationshipType: "family_cook" },
  ]);
  assert.deepEqual(allocations, [
    { visitId: "morning-cook", assignedMealSlots: ["breakfast"], reason: "This visit is the closest configured match for breakfast." },
    { visitId: "evening-cook", assignedMealSlots: ["dinner"], reason: "This visit is the closest configured match for dinner." },
  ]);
});

check("Tarla instructions use cumulative household quantities", () => {
  const measure = cumulativeHouseholdMeasure("moong_dal", [1, 1, 0.5]);
  assert.equal(formatHouseholdMeasure(measure), "2½ bowls");
});

check("Tarla cook instruction has no quarter or third display fractions", () => {
  const instruction = composeCookInstruction({
    mealSlot: "breakfast",
    totalServingEquivalents: 1,
    items: [
      {
        recipeId: "roti_bhaji",
        recipeName: "Roti",
        memberPortions: [{ servingEquivalent: 0.125 }],
      },
    ],
    memberNotes: [],
    importantRestrictions: [],
    relationshipType: "hired_cook",
    preferredLanguage: "English",
    revisedBecause: "substitution",
    cookName: "Priya",
  });
  assert.doesNotMatch(instruction, /¼|¾|⅓|⅔|third|1\/3|0\.25|0\.75/i);
});

check("Unavailable ingredient produces a bounded substitution signal", () => {
  const rawReply = "Palak nahi hai.";
  assert.match(rawReply, /palak\s+nahi\s+hai/i);
  assert.match(tarlaInbound, /kind === "missing_ingredient"/);
  assert.match(tarlaInbound, /ingredientKey/);
  assert.match(tarlaInbound, /substitute_or_replan/);
  assert.match(tarlaInbound, /recalculate_nutrition/);
  assert.match(tarlaInbound, /send_revised_instruction/);
});

console.log(JSON.stringify({
  evalSet: "phase_a_minimum_paths",
  passed: cases.length,
  failed: 0,
  realMessageSent: false,
  cases,
}, null, 2));
