import type { AeviaLanguage, CommunicationPath } from "./aeviaSetup";

export type MitraRecipientClass = "senior" | "caretaker";
export type CookRecipientClass =
  | "hired_cook"
  | "family_cook"
  | "primary_user";

export type MitraRecipientResolution =
  | { recipientClass: MitraRecipientClass; reason: string; status: "ready" }
  | {
      recipientClass?: undefined;
      reason: string;
      status: "unresolved";
    };

export function resolveMitraRecipient(input: {
  communicationPath: CommunicationPath;
  configuredAudience?: MitraRecipientClass;
  directAvailable: boolean;
  caretakerAvailable: boolean;
}): MitraRecipientResolution {
  if (
    input.configuredAudience === "caretaker" &&
    input.caretakerAvailable
  ) {
    return {
      status: "ready",
      recipientClass: "caretaker" as const,
      reason: "The household chose the caretaker or family member as the execution recipient.",
    };
  }
  if (input.communicationPath === "caretaker") {
    if (!input.caretakerAvailable) {
      return {
        status: "unresolved",
        reason: "The configured caretaker contact is not ready.",
      };
    }
    return {
      status: "ready",
      recipientClass: "caretaker" as const,
      reason: "The household chose caretaker or family coordination.",
    };
  }
  if (input.directAvailable) {
    return {
      status: "ready",
      recipientClass: "senior" as const,
      reason:
        input.communicationPath === "both"
          ? "The ordinary reminder goes to the senior; the caretaker joins only for follow-up or exceptions."
          : "The household chose direct communication with the senior.",
    };
  }
  if (input.caretakerAvailable) {
    return {
      status: "ready",
      recipientClass: "caretaker" as const,
      reason: "The direct contact was unavailable, so the configured caretaker is the execution recipient.",
    };
  }
  return {
    status: "unresolved",
    reason: "No consented recipient class is ready for this routine.",
  };
}

export function shouldFollowUpWithCaretaker(input: {
  communicationPath: CommunicationPath;
  initialRecipientClass: MitraRecipientClass;
  caretakerAvailable: boolean;
}) {
  return (
    input.communicationPath === "both" &&
    input.initialRecipientClass === "senior" &&
    input.caretakerAvailable
  );
}

export function isHigherRiskReminderChange(input: {
  routineType: string;
  rawContent: string;
}) {
  if (input.routineType !== "Medication") return false;
  const text = input.rawContent.trim().toLocaleLowerCase();
  const stopIntent =
    /\b(stop|cancel|disable|remove|band|bandh|off)\b/i.test(text) ||
    /(yaad|remind|reminder).*(mat|nahi|nahin|band|stop)/i.test(text);
  const reminderContext =
    /\b(reminder|remind|yaad|dawai|dawa|medicine|tablet)\b/i.test(text);
  return stopIntent && reminderContext;
}

export function composeMitraAcknowledgement(input: {
  language: AeviaLanguage;
  outcome: "completed" | "change_pending";
}) {
  if (input.outcome === "change_pending") {
    if (input.language === "English") {
      return "I’ve noted your request. The reminder will stay the same until your family confirms the change.";
    }
    if (input.language === "Hindi") {
      return "Aapki baat note kar li hai. Parivaar ke confirm karne tak reminder waise hi rahega.";
    }
    return "Aapki baat note kar li hai. Family ke confirm karne tak reminder waise hi rahega.";
  }
  if (input.language === "English") return "Got it, thank you.";
  if (input.language === "Hindi") return "Achha, theek hai. Shukriya.";
  return "Achha, theek hai. Thank you.";
}

export function composeCaretakerNoResponseFollowUp(input: {
  language: AeviaLanguage;
  caretakerSalutation: string;
  seniorSalutation: string;
  routineLabel: string;
}) {
  if (input.language === "English") {
    return `Hi ${input.caretakerSalutation}. ${input.seniorSalutation} hasn't replied about ${input.routineLabel}. Could you check and reply here?`;
  }
  return `Namaste ${input.caretakerSalutation}. ${input.seniorSalutation} ne ${input.routineLabel} ke baare mein reply nahi kiya. Aap check karke yahin bata dijiyega?`;
}

export function primaryUserMitraSummary(input: {
  personSalutation: string;
  routineType: string;
  routineLabel: string;
  sourceAudience: MitraRecipientClass;
  completed: boolean;
}) {
  if (!input.completed) {
    return `${input.personSalutation} did not reply about ${input.routineLabel}.`;
  }
  const source =
    input.sourceAudience === "caretaker"
      ? `${input.personSalutation}'s caretaker`
      : input.personSalutation;
  if (input.routineType === "Medication") {
    return input.sourceAudience === "caretaker"
      ? `${source} said ${input.personSalutation} took ${input.routineLabel}.`
      : `${source} said they took ${input.routineLabel}.`;
  }
  return `${source} said ${input.routineLabel} was done.`;
}

export type CookVisitCandidate = {
  id: string;
  arrivalTime: string;
  mealSlots: string[];
  relationshipType: string;
};

const MEAL_MINUTES: Record<string, number> = {
  breakfast: 8 * 60,
  lunch: 13 * 60,
  snack: 17 * 60,
  dinner: 20 * 60,
};

export function allocateMealsToCookVisits(
  mealSlots: string[],
  visits: CookVisitCandidate[],
) {
  const allocation = new Map<string, string[]>();
  for (const mealSlot of mealSlots) {
    const candidates = visits.filter((visit) => visit.mealSlots.includes(mealSlot));
    if (candidates.length === 0) {
      throw new Error(`Cook visits do not cover: ${mealSlot}`);
    }
    const target = MEAL_MINUTES[mealSlot] ?? 12 * 60;
    const selected = [...candidates].sort((a, b) => {
      const specificity = a.mealSlots.length - b.mealSlots.length;
      if (specificity !== 0) return specificity;
      return visitDistance(a.arrivalTime, target) - visitDistance(b.arrivalTime, target);
    })[0];
    allocation.set(selected.id, [...(allocation.get(selected.id) ?? []), mealSlot]);
  }
  return [...allocation.entries()].map(([visitId, assignedMealSlots]) => ({
    visitId,
    assignedMealSlots,
    reason: `This visit is the closest configured match for ${assignedMealSlots.join(", ")}.`,
  }));
}

export function cookRecipientClass(relationshipType?: string): CookRecipientClass {
  if (relationshipType === "family_cook") return "family_cook";
  if (relationshipType === "primary_user") return "primary_user";
  return "hired_cook";
}

function visitDistance(value: string, target: number) {
  const [hours, minutes] = value.split(":").map(Number);
  const visit = hours * 60 + minutes;
  const forwardPenalty = visit > target ? 24 * 60 : 0;
  return Math.abs(target - visit) + forwardPenalty;
}
