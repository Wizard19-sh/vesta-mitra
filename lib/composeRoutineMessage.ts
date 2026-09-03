import type { ConversationStyle, Language } from "./composeCheckIn";

export type MitraRoutineType =
  | "Medication"
  | "Walk / activity"
  | "Appointment / checkup"
  | "Custom";

export type ComposeRoutineMessageInput = {
  salutation: string;
  language: Language;
  style: ConversationStyle;
  routineType: MitraRoutineType;
  label: string;
  customMessage?: string;
  isFirstContact?: boolean;
  setupBy?: string;
};

export function composeRoutineMessage(input: ComposeRoutineMessageInput) {
  const salutation = input.salutation.trim() || "Hello";
  const label = input.label.trim() || defaultLabel(input.routineType);
  const reminder = input.customMessage?.trim()
    ? ensurePunctuation(input.customMessage.trim())
    : routineReminder(input.routineType, label, input.language, input.style);
  const introduction = input.isFirstContact
    ? firstContactIntroduction(salutation, input.language)
    : greeting(salutation, input.language);

  return `${introduction} ${reminder}`.replace(/\s+/g, " ").trim();
}

function greeting(salutation: string, language: Language) {
  if (language === "Hindi") return `Namaste ${salutation}.`;
  return `Hi ${salutation}.`;
}

function firstContactIntroduction(
  salutation: string,
  language: Language,
) {
  if (language === "English") {
    return `Hi ${salutation}. I'm Mitra, Aevia's routine assistant. I'll send reminders for the routines you agreed to.`;
  }
  return `Namaste ${salutation}. Main Mitra hoon, Aevia ka routine assistant. Aapke agreed routines ke reminders yahin milenge.`;
}

function routineReminder(
  routineType: MitraRoutineType,
  label: string,
  language: Language,
  style: ConversationStyle,
) {
  if (language === "English") {
    if (routineType === "Medication") {
      return style === "Casual"
        ? `It's time for ${label}. Have you taken it?`
        : `${capitalize(label)} is due now. Have you taken it?`;
    }
    if (routineType === "Walk / activity") {
      return `This is your ${label} reminder.`;
    }
    if (routineType === "Appointment / checkup") {
      return `A reminder for ${label}.`;
    }
    return `A reminder for ${label}.`;
  }

  if (routineType === "Medication") {
    return `${capitalize(label)} ka time ho gaya. Le li?`;
  }
  if (routineType === "Walk / activity") {
    return `Aaj ${label} ka reminder hai.`;
  }
  if (routineType === "Appointment / checkup") {
    return `${capitalize(label)} ka reminder hai.`;
  }
  return `${capitalize(label)} ka reminder hai.`;
}

function defaultLabel(routineType: MitraRoutineType) {
  if (routineType === "Medication") return "medicine";
  if (routineType === "Walk / activity") return "walk";
  if (routineType === "Appointment / checkup") return "appointment";
  return "routine";
}

function ensurePunctuation(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
