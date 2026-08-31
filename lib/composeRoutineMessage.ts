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
    ? firstContactIntroduction(
        salutation,
        input.language,
        input.setupBy?.trim(),
      )
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
  setupBy?: string,
) {
  if (language === "English") {
    return setupBy
      ? `Hi ${salutation}. I'm Mitra. ${setupBy} set me up to help with routines you have agreed to.`
      : `Hi ${salutation}. I'm Mitra. I'm here to help with routines you have agreed to.`;
  }
  return setupBy
    ? `Namaste ${salutation}. Main Mitra hoon. ${setupBy} ne mujhe aapke agreed routines mein help karne ke liye set up kiya hai.`
    : `Namaste ${salutation}. Main Mitra hoon. Main aapke agreed routines mein help karne ke liye hoon.`;
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
        ? `It's time for ${label}. Please remember it.`
        : `${capitalize(label)} is due now. Please remember it.`;
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
    return `${capitalize(label)} ka time ho gaya. Lena yaad rakhiyega.`;
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
