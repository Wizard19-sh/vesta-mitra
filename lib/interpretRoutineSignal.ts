import type { InboundSignalType } from "./messageTransport";
import type { MitraRoutineType } from "./composeRoutineMessage";

export type RoutineSignalOutcome =
  | "confirmed"
  | "negative"
  | "ambiguous"
  | "unrelated"
  | "reaction_unmapped"
  | "reaction_confirmed"
  | "acknowledged";

export type RoutineSignalInterpretation = {
  state: "CONFIRMED" | "UNCONFIRMED";
  outcome: RoutineSignalOutcome;
  summary: string;
  basis: "self_report" | "configured_reaction" | "acknowledgement";
};

export function interpretRoutineSignal(input: {
  signalType: InboundSignalType;
  rawContent: string;
  routineType: MitraRoutineType;
  parentLabel: string;
  confirmingReactions?: string[];
}): RoutineSignalInterpretation {
  const parent = input.parentLabel.trim() || "Parent";
  const raw = input.rawContent.trim();

  if (input.signalType === "reaction") {
    if (input.confirmingReactions?.includes(raw)) {
      return {
        state: "CONFIRMED",
        outcome: "reaction_confirmed",
        summary: `${parent} used a reaction explicitly configured to confirm this routine.`,
        basis: "configured_reaction",
      };
    }
    return {
      state: "UNCONFIRMED",
      outcome: "reaction_unmapped",
      summary: `${parent}'s reaction was preserved but is not configured as routine confirmation.`,
      basis: "acknowledgement",
    };
  }

  if (input.signalType === "acknowledgement") {
    return {
      state: "UNCONFIRMED",
      outcome: "acknowledged",
      summary: `A message acknowledgement was received; it does not confirm that ${parent} completed the routine.`,
      basis: "acknowledgement",
    };
  }

  const text = raw.toLocaleLowerCase();
  if (input.routineType === "Medication") {
    if (isMedicationNegative(text)) {
      return {
        state: "UNCONFIRMED",
        outcome: "negative",
        summary: `${parent} reported that they have not taken their medicine yet.`,
        basis: "self_report",
      };
    }
    if (isMedicationConfirmation(text)) {
      return {
        state: "CONFIRMED",
        outcome: "confirmed",
        summary: `${parent} reported taking their medicine.`,
        basis: "self_report",
      };
    }
  }

  if (input.routineType === "Walk / activity") {
    if (isWalkNegative(text)) {
      return {
        state: "UNCONFIRMED",
        outcome: "negative",
        summary: `${parent} reported not completing their walk or activity.`,
        basis: "self_report",
      };
    }
    if (isWalkConfirmation(text)) {
      return {
        state: "CONFIRMED",
        outcome: "confirmed",
        summary: `${parent} reported completing their walk or activity.`,
        basis: "self_report",
      };
    }
  }

  if (input.routineType === "Appointment / checkup" && isAcknowledged(text)) {
    return {
      state: "CONFIRMED",
      outcome: "acknowledged",
      summary: `${parent} acknowledged the appointment reminder.`,
      basis: "self_report",
    };
  }

  if (input.routineType === "Custom" && isExplicitCompletion(text)) {
    return {
      state: "CONFIRMED",
      outcome: "confirmed",
      summary: `${parent} reported completing the agreed routine.`,
      basis: "self_report",
    };
  }

  if (isUnrelated(text)) {
    return {
      state: "UNCONFIRMED",
      outcome: "unrelated",
      summary: `${parent}'s message was preserved but did not answer this routine reminder.`,
      basis: "self_report",
    };
  }

  return {
    state: "UNCONFIRMED",
    outcome: "ambiguous",
    summary: `${parent}'s reply did not clearly confirm completion of the routine.`,
    basis: "self_report",
  };
}

function isMedicationNegative(text: string) {
  return (
    /(medicine|medication|dawai|dawa|tablet).*(nahi|nahin|not|didn't|did not)/i.test(
      text,
    ) ||
    /(nahi|nahin|not|didn't|did not).*(medicine|medication|dawai|dawa|tablet)/i.test(
      text,
    ) ||
    /\b(abhi nahi|abhi nahin|not yet)\b/i.test(text)
  );
}

function isMedicationConfirmation(text: string) {
  return (
    /(medicine|medication|dawai|dawa|tablet).*(le li|li hai|taken|took|done|ho gay[ai])/i.test(
      text,
    ) ||
    /(le li|li hai|taken|took|done|ho gay[ai]).*(medicine|medication|dawai|dawa|tablet)/i.test(
      text,
    ) ||
    /^(haan|han|yes)?[,.! ]*(le li|li hai|taken|done|ho gaya)[.! ]*$/i.test(
      text,
    )
  );
}

function isWalkNegative(text: string) {
  return (
    /(walk|walking|exercise|activity).*(nahi|nahin|not|didn't|did not)/i.test(
      text,
    ) ||
    /(nahi|nahin|not|didn't|did not).*(walk|walking|exercise|activity)/i.test(
      text,
    )
  );
}

function isWalkConfirmation(text: string) {
  return (
    /(walk|walking|exercise|activity).*(ho gay[ai]|kar li|done|completed|did)/i.test(
      text,
    ) ||
    /(ho gay[ai]|kar li|done|completed|did).*(walk|walking|exercise|activity)/i.test(
      text,
    ) ||
    /^(haan|han|yes)?[,.! ]*(ho gaya|ho gayi|kar li|done)[.! ]*$/i.test(text)
  );
}

function isAcknowledged(text: string) {
  return /\b(haan|han|yes|okay|ok|got it|noted|yaad rahega)\b/i.test(text);
}

function isExplicitCompletion(text: string) {
  return /\b(done|completed|ho gaya|ho gayi|kar liya|kar li)\b/i.test(text);
}

function isUnrelated(text: string) {
  return /(call|phone|video|sid ko|beta ko|kal baat|talk later)/i.test(text);
}
