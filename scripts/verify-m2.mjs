import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import {
  allocateMealsToCookVisits,
  composeCaretakerNoResponseFollowUp,
  composeMitraAcknowledgement,
  cookRecipientClass,
  isHigherRiskReminderChange,
  primaryUserMitraSummary,
  resolveMitraRecipient,
  shouldFollowUpWithCaretaker,
} from "../lib/m2Execution.ts";
import { interpretRoutineSignal } from "../lib/interpretRoutineSignal.ts";
import {
  activeRule,
  cumulativeHouseholdMeasure,
  formatHouseholdMeasure,
  householdMeasuresReconcile,
} from "../lib/aeviaSetup.ts";
import { shouldApplyDeliveryState } from "../lib/messageTransport.ts";
import { resolveMemberSalutation } from "../lib/mitraSalutation.ts";

const cases = [];
function check(name, fn) {
  fn();
  cases.push(name);
}

check("Mitra direct routing", () => {
  assert.equal(resolveMitraRecipient({ communicationPath: "senior_directly", directAvailable: true, caretakerAvailable: false }).recipientClass, "senior");
});
check("Mitra caretaker routing", () => {
  assert.equal(resolveMitraRecipient({ communicationPath: "caretaker", directAvailable: false, caretakerAvailable: true }).recipientClass, "caretaker");
});
check("Mitra both-mode starts with the senior", () => {
  assert.equal(resolveMitraRecipient({ communicationPath: "both", directAvailable: true, caretakerAvailable: true }).recipientClass, "senior");
});
check("Mitra both-mode uses one caretaker follow-up", () => {
  assert.equal(shouldFollowUpWithCaretaker({ communicationPath: "both", initialRecipientClass: "senior", caretakerAvailable: true }), true);
  assert.equal(shouldFollowUpWithCaretaker({ communicationPath: "both", initialRecipientClass: "caretaker", caretakerAvailable: true }), false);
});
check("Caretaker follow-up names the household context", () => {
  assert.match(composeCaretakerNoResponseFollowUp({ language: "Hinglish", caretakerSalutation: "Ria", seniorSalutation: "Maa", routineLabel: "evening walk" }), /Maa.*evening walk/i);
});
check("Medication self-report remains a self-report", () => {
  const result = interpretRoutineSignal({ signalType: "text", rawContent: "Haan, dawai le li.", routineType: "Medication", parentLabel: "Papa" });
  assert.equal(result.state, "CONFIRMED");
  assert.equal(result.basis, "self_report");
  assert.doesNotMatch(result.summary, /verified|independent/i);
});
check("Ambiguous Mitra reply does not complete", () => {
  assert.equal(interpretRoutineSignal({ signalType: "text", rawContent: "Dekhte hain", routineType: "Walk / activity", parentLabel: "Papa" }).state, "UNCONFIRMED");
});
check("Unmapped reaction does not complete", () => {
  assert.equal(interpretRoutineSignal({ signalType: "reaction", rawContent: "👍", routineType: "Medication", parentLabel: "Papa" }).state, "UNCONFIRMED");
});
check("Stop-medicine request is higher risk", () => {
  assert.equal(isHigherRiskReminderChange({ routineType: "Medication", rawContent: "8 baje wali dawai reminder band kar do" }), true);
  assert.equal(isHigherRiskReminderChange({ routineType: "Walk / activity", rawContent: "walk reminder band kar do" }), false);
});
check("Mitra acknowledgement is relationship-neutral", () => {
  assert.equal(composeMitraAcknowledgement({ language: "English", outcome: "completed" }), "Got it, thank you.");
  assert.doesNotMatch(composeMitraAcknowledgement({ language: "Hinglish", outcome: "completed" }), /Sid|beta ne/i);
});
check("Mitra uses a confirmed salutation with a respectful display-name fallback", () => {
  assert.equal(resolveMemberSalutation({ preferredSalutation: "papa", displayName: "Mohit" }), "Papa");
  assert.equal(resolveMemberSalutation({ displayName: "Mohit" }), "Mohit Ji");
  assert.equal(composeMitraAcknowledgement({ language: "Hinglish", outcome: "completed", recipientSalutation: "Papa" }), "Achha, theek hai Papa. Thank you.");
});
check("Mitra change acknowledgement uses family language", () => {
  const acknowledgement = composeMitraAcknowledgement({ language: "Hinglish", outcome: "change_pending" });
  assert.match(acknowledgement, /family.*confirm/i);
  assert.doesNotMatch(acknowledgement, /account holder|verified|medical emergency/i);
});
check("Primary summary says who reported", () => {
  const summary = primaryUserMitraSummary({ personSalutation: "Papa", routineType: "Medication", routineLabel: "BP wali dawai", sourceAudience: "senior", completed: true });
  assert.match(summary, /^Papa said/);
  assert.doesNotMatch(summary, /verified|definitely/i);
});
check("Expired context is inactive", () => {
  assert.equal(activeRule({ active: true, expiresAt: Date.now() - 1 }), false);
});

const visits = [
  { id: "morning", arrivalTime: "07:00", mealSlots: ["breakfast", "lunch"], relationshipType: "hired_cook" },
  { id: "evening", arrivalTime: "18:00", mealSlots: ["dinner"], relationshipType: "family_cook" },
];
const allocation = allocateMealsToCookVisits(["breakfast", "lunch", "dinner"], visits);
check("Tarla selects the morning cook visit", () => {
  assert.deepEqual(allocation.find((item) => item.visitId === "morning")?.assignedMealSlots, ["breakfast", "lunch"]);
});
check("Tarla selects the evening family visit", () => {
  assert.deepEqual(allocation.find((item) => item.visitId === "evening")?.assignedMealSlots, ["dinner"]);
});
check("Cook relationship maps to an audience", () => {
  assert.equal(cookRecipientClass("family_cook"), "family_cook");
  assert.equal(cookRecipientClass("hired_cook"), "hired_cook");
});
check("Household portions reconcile", () => {
  assert.equal(householdMeasuresReconcile("besan_chilla", [1, 1, 0.5]), true);
  assert.equal(cumulativeHouseholdMeasure("besan_chilla", [1, 1, 0.5]).quantity, 5);
});
check("Cook instruction uses household measures", () => {
  const measure = formatHouseholdMeasure(cumulativeHouseholdMeasure("moong_dal", [1, 1, 0.5]));
  assert.equal(measure, "2½ bowls");
  assert.doesNotMatch(measure, /serving\s*equivalent/i);
});
check("Provider acceptance is not delivery", () => {
  assert.equal(shouldApplyDeliveryState("accepted", "delivered"), true);
  assert.equal(shouldApplyDeliveryState("delivered", "accepted"), false);
});
check("Failed delivery remains terminal", () => {
  assert.equal(shouldApplyDeliveryState("failed", "delivered"), false);
});

const source = {
  schema: await readFile(new URL("../convex/schema.ts", import.meta.url), "utf8"),
  mitraInbound: await readFile(new URL("../convex/mitraInbound.ts", import.meta.url), "utf8"),
  mitraRuntime: await readFile(new URL("../convex/mitraRuntime.ts", import.meta.url), "utf8"),
  tarlaInbound: await readFile(new URL("../convex/tarlaInbound.ts", import.meta.url), "utf8"),
  tarlaRuntime: await readFile(new URL("../convex/tarlaRuntime.ts", import.meta.url), "utf8"),
  dashboard: await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8"),
  analytics: await readFile(new URL("../convex/productAnalytics.ts", import.meta.url), "utf8"),
  tarlaInterpreter: await readFile(new URL("../lib/interpretTarlaSignal.ts", import.meta.url), "utf8"),
  tarlaMessages: await readFile(new URL("../lib/tarlaMessages.ts", import.meta.url), "utf8"),
  mitraMessages: await readFile(new URL("../lib/composeRoutineMessage.ts", import.meta.url), "utf8"),
};
const runnableTarlaInterpreter = source.tarlaInterpreter.replace(
  /import \{ findIngredientInText \} from "\.\/tarlaIngredientData";/,
  `const findIngredientInText = (raw) => {
    const value = raw.toLocaleLowerCase();
    if (value.includes("tofu")) return { key: "tofu", name: "Tofu" };
    if (value.includes("palak")) return { key: "spinach", name: "spinach" };
    return undefined;
  };`,
);
const transpiledTarlaInterpreter = ts.transpileModule(runnableTarlaInterpreter, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { interpretTarlaCookSignal } = await import(
  `data:text/javascript;base64,${Buffer.from(transpiledTarlaInterpreter).toString("base64")}`
);
check("Mitra first contact speaks as Mitra, not as the primary user", () => {
  assert.match(source.mitraMessages, /Main Mitra hoon, Aevia ka routine assistant/);
  assert.doesNotMatch(source.mitraMessages, /\$\{setupBy\} ne mujhe|monitor your parents/i);
});
check("Tarla hired-cook and family-cook tone differ", () => {
  assert.match(source.tarlaMessages, /relationshipType === "family_cook"[\s\S]*`\$\{name\}, \$\{title\}`/);
  assert.match(source.tarlaMessages, /`Namaste \$\{name\}\. \$\{title\}`/);
});
check("Missing ingredient is bounded", () => {
  assert.match(source.tarlaInterpreter, /kind: "missing_ingredient"/);
  assert.match(source.tarlaInterpreter, /ingredientKey/);
});
check("Ordinary cook acknowledgement is not meal completion", () => {
  assert.match(source.tarlaInterpreter, /kind: "acknowledgement"/);
  assert.doesNotMatch(source.tarlaInterpreter, /meal.*verified|cooking.*complete/i);
});
check("Tarla recognizes real-user-derived shopping plus acceptance replies", () => {
  for (const rawContent of [
    "Tofu order karna padega. No problem.",
    "Remember that I have to order tofu later. Abhi ke liye is ok",
  ]) {
    const result = interpretTarlaCookSignal({
      signalType: "text",
      rawContent,
    });
    assert.equal(result.kind, "shopping_needed_acknowledged");
    assert.equal(result.ingredientKey, "tofu");
  }
});
check("Tarla recognizes bounded English and Hinglish shopping variants", () => {
  for (const rawContent of [
    "Tofu mangwana padega, theek hai",
    "Tofu baad mein order kar lena. Abhi sab okay hai.",
    "Need to buy tofu later, no problem.",
    "Okay, tofu order karna hoga.",
  ]) {
    const result = interpretTarlaCookSignal({
      signalType: "text",
      rawContent,
    });
    assert.equal(result.kind, "shopping_needed_acknowledged");
    assert.equal(result.ingredientKey, "tofu");
  }
});
check("Tarla may use one unambiguous active ingredient", () => {
  const result = interpretTarlaCookSignal({
    signalType: "text",
    rawContent: "It needs to be ordered later, okay.",
    activeIngredients: [
      { ingredientKey: "tofu", ingredientName: "Tofu" },
    ],
  });
  assert.equal(result.kind, "shopping_needed_acknowledged");
  assert.equal(result.ingredientKey, "tofu");
});
check("Plain Tarla acknowledgement remains an acknowledgement", () => {
  assert.equal(
    interpretTarlaCookSignal({
      signalType: "text",
      rawContent: "Theek hai.",
    }).kind,
    "acknowledgement",
  );
});
check("Palak unavailable remains on the substitution path", () => {
  assert.equal(
    interpretTarlaCookSignal({
      signalType: "text",
      rawContent: "Palak nahi hai",
    }).kind,
    "missing_ingredient",
  );
});
check("Genuinely unrelated Tarla text remains unresolved", () => {
  assert.equal(
    interpretTarlaCookSignal({
      signalType: "text",
      rawContent: "Thanks, see you.",
    }).kind,
    "unrelated",
  );
});
check("Ambiguous active ingredients fail closed", () => {
  assert.equal(
    interpretTarlaCookSignal({
      signalType: "text",
      rawContent: "It needs to be ordered later, okay.",
      activeIngredients: [
        { ingredientKey: "tofu", ingredientName: "Tofu" },
        { ingredientKey: "paneer", ingredientName: "Paneer" },
      ],
    }).kind,
    "unrelated",
  );
});
check("Unknown products do not inherit an active meal ingredient", () => {
  assert.equal(
    interpretTarlaCookSignal({
      signalType: "text",
      rawContent: "Soap order karna hai, okay.",
      activeIngredients: [
        { ingredientKey: "tofu", ingredientName: "Tofu" },
      ],
    }).kind,
    "unrelated",
  );
});
check("Negated shopping intent does not add an item", () => {
  assert.equal(
    interpretTarlaCookSignal({
      signalType: "text",
      rawContent: "Tofu order nahi karna, okay.",
    }).kind,
    "unrelated",
  );
});
check("Family-cook shopping acknowledgement is brief and truthful", () => {
  assert.match(
    source.tarlaMessages,
    /return `Okay \$\{cook\}\. I've added \$\{ingredient\} to the shopping list\. Thank you\.`/,
  );
});
check("Raw Mitra signal is persisted before interpretation", () => assert(source.mitraInbound.indexOf("persistSignal(ctx") < source.mitraInbound.indexOf("interpretRoutineSignal({")));
check("Raw Tarla signal is persisted before interpretation", () => assert(source.tarlaInbound.indexOf("persistSignal(ctx") < source.tarlaInbound.indexOf("interpretTarlaCookSignal({")));
check("Medicine change creates pending approval", () => assert.match(source.mitraInbound, /MEDICINE_REMINDER_CHANGE_REQUIRES_APPROVAL[\s\S]*pending_approval/));
check("Routine stays unchanged before approval", () => assert.match(source.mitraInbound, /left the routine unchanged/i));
check("Approval applies only after a decision", () => assert.match(source.schema, /decisionByMemberId/));
check("Tarla records shopping needed", () => assert.match(source.tarlaInbound, /shoppingNeededItems/));
check("Tarla updates plan version", () => assert.match(source.tarlaInbound, /planVersion: dayPlan\.version \+ 1/));
check("Unsupported food rule is not silently enforced", () => assert.match(source.tarlaInbound, /UNSTRUCTURED_FOOD_RULE_REQUIRES_REVIEW/));
check("Latest approved plan is loaded at send time", () => assert.match(source.tarlaRuntime, /latestApprovedDayPlan/));
check("Run steps carry honest usage status", () => assert.match(source.schema, /usageStatus/));
check("Evidence records link to one primary claim", () => assert.match(source.schema, /primaryRubricClaim/));
check("Primary-user intervention is execution-linked", () => assert.match(source.analytics, /primary_user_intervention/));
check("Dashboard offers approval decisions", () => {
  assert.match(source.dashboard, /Approve stopping reminder/);
  assert.match(source.dashboard, /Keep reminder/);
});
check("Consumer UI avoids provider jargon", () => assert.doesNotMatch(source.dashboard, /Meta accepted|webhook received|SELF_REPORTED_COMPLETE/));
check("No decorative Aevia manager trace was added", () => assert.doesNotMatch(source.schema, /parentAgentId|delegatedAgentId/));

console.log(JSON.stringify({
  evalSet: "m2_real_household_execution",
  passed: cases.length,
  failed: 0,
  realMessageSent: false,
  transport: "development and pure deterministic evaluation only",
  cases,
}, null, 2));
