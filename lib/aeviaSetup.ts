export const SUPPORTED_LANGUAGES = ["English", "Hindi", "Hinglish"] as const;
export const LIFE_STAGES = ["adult", "child", "senior"] as const;
export const COMMUNICATION_PATHS = [
  "senior_directly",
  "caretaker",
  "both",
] as const;

export type AeviaLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LifeStage = (typeof LIFE_STAGES)[number];
export type CommunicationPath = (typeof COMMUNICATION_PATHS)[number];
export type AgentIdentity = "aevia" | "mitra" | "tarla";
export type CommunicationAudience =
  | "primary_user"
  | "senior"
  | "caretaker"
  | "hired_cook"
  | "family_cook";
export type CommunicationSurface = "whatsapp" | "consumer_ui";
export type CommunicationMoment =
  | "setup"
  | "reminder"
  | "acknowledgement"
  | "summary"
  | "exception"
  | "confirmation";

export type CommunicationContext = {
  agent: AgentIdentity;
  audience: CommunicationAudience;
  surface: CommunicationSurface;
  moment: CommunicationMoment;
};

export type HouseholdMemberDraft = {
  clientKey: string;
  memberId?: string;
  name: string;
  relationship: string;
  lifeStage: LifeStage;
  preferredSalutation: string;
  preferredLanguage: AeviaLanguage;
  memberKind: "household" | "external";
  isPrimary: boolean;
};

export type RoutineTimingInput =
  | { kind: "once_now"; timezone: string }
  | { kind: "once_scheduled"; timezone: string; scheduledAt: number }
  | {
      kind: "recurring";
      timezone: string;
      recurrence: {
        frequency: "daily" | "selected_days" | "weekly" | "monthly";
        time: string;
        daysOfWeek?: number[];
        dayOfMonth?: number;
      };
    };

export type MitraRoutineDraft = {
  clientKey: string;
  routineId?: string;
  type: "Medication" | "Walk / activity" | "Appointment / checkup" | "Custom";
  label: string;
  timingMode:
    | "once_now"
    | "once_scheduled"
    | "daily"
    | "selected_days"
    | "weekly"
    | "monthly";
  date: string;
  time12: string;
  daysOfWeek: number[];
  dayOfMonth: number;
  notes: string;
};

export type MitraPersonDraft = {
  memberClientKey: string;
  parentId?: string;
  communicationPath: CommunicationPath;
  caretakerMemberClientKey?: string;
  directPhone: string;
  caretakerPhone: string;
  consentConfirmed: boolean;
  routines: MitraRoutineDraft[];
};

export type NutritionPersonDraft = {
  memberClientKey: string;
  enabled: boolean;
  age?: number;
  sex?: "male" | "female";
  heightCm?: number;
  weightKg?: number;
  activityLevel?:
    | "sedentary"
    | "lightly_active"
    | "moderately_active"
    | "very_active"
    | "extra_active";
  goal:
    | "maintain"
    | "moderate_deficit"
    | "stronger_deficit"
    | "high_protein"
    | "custom";
  customCalorieTargetKcal?: number;
  customProteinTargetG?: number;
};

export type FoodRuleDraft = {
  clientKey: string;
  ruleId?: string;
  daysOfWeek: number[];
  description: string;
  temporary: boolean;
  expiresOn?: string;
};

export type CookVisitDraft = {
  clientKey: string;
  label: string;
  daysOfWeek: number[];
  time12: string;
  mealSlots: string[];
};

export type CookingPersonDraft = {
  clientKey: string;
  cookStateId?: string;
  memberClientKey: string;
  relationshipType: "hired_cook" | "family_cook" | "primary_user" | "other";
  phone: string;
  preferredLanguage: AeviaLanguage;
  consentConfirmed: boolean;
  visits: CookVisitDraft[];
};

export type TarlaSetupDraft = {
  eaterMemberClientKeys: string[];
  dietaryType: "vegetarian" | "eggetarian" | "non_vegetarian";
  cuisines: string[];
  favouriteFoods: string[];
  dislikedFoods: string[];
  allergies: string[];
  hardRestrictions: string[];
  softerPreferences: string[];
  foodContext: string;
  rules: FoodRuleDraft[];
  nutritionMode: "balanced" | "nutrition_goal";
  nutritionPeople: NutritionPersonDraft[];
  cookingPeople: CookingPersonDraft[];
  firstPlanDate: string;
};

export type AeviaSetupPayload = {
  agentChoice: "mitra" | "tarla" | "both";
  members: HouseholdMemberDraft[];
  removedMemberIds: string[];
  mitraPeople: MitraPersonDraft[];
  tarla: TarlaSetupDraft;
  anythingElse: string;
};

export function createClientKey(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

export function defaultHouseholdMember(
  overrides: Partial<HouseholdMemberDraft> = {},
): HouseholdMemberDraft {
  return {
    clientKey: createClientKey("member"),
    name: "",
    relationship: "",
    lifeStage: "adult",
    preferredSalutation: "",
    preferredLanguage: "English",
    memberKind: "household",
    isPrimary: false,
    ...overrides,
  };
}

export function defaultRoutine(): MitraRoutineDraft {
  return {
    clientKey: createClientKey("routine"),
    type: "Walk / activity",
    label: "",
    timingMode: "daily",
    date: localDate(1),
    time12: "6:00 PM",
    daysOfWeek: [1, 2, 3, 4, 5],
    dayOfMonth: 1,
    notes: "",
  };
}

export function defaultTarlaSetup(): TarlaSetupDraft {
  return {
    eaterMemberClientKeys: [],
    dietaryType: "vegetarian",
    cuisines: [],
    favouriteFoods: [],
    dislikedFoods: [],
    allergies: [],
    hardRestrictions: [],
    softerPreferences: [],
    foodContext: "",
    rules: [],
    nutritionMode: "balanced",
    nutritionPeople: [],
    cookingPeople: [],
    firstPlanDate: localDate(1),
  };
}

export function buildRoutineTiming(
  routine: MitraRoutineDraft,
  timezone: string,
): RoutineTimingInput {
  if (routine.timingMode === "once_now") return { kind: "once_now", timezone };
  if (routine.timingMode === "once_scheduled") {
    const time24 = to24Hour(routine.time12);
    return {
      kind: "once_scheduled",
      timezone,
      scheduledAt: zonedInputTimestamp(routine.date, time24, timezone),
    };
  }
  return {
    kind: "recurring",
    timezone,
    recurrence: {
      frequency: routine.timingMode,
      time: to24Hour(routine.time12),
      daysOfWeek:
        routine.timingMode === "selected_days" || routine.timingMode === "weekly"
          ? routine.daysOfWeek
          : undefined,
      dayOfMonth:
        routine.timingMode === "monthly" ? routine.dayOfMonth : undefined,
    },
  };
}

export function to24Hour(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) throw new Error("Choose a time with AM or PM");
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    throw new Error("Choose a valid time");
  }
  const meridiem = match[3].toUpperCase();
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function to12Hour(value: string) {
  const match = value.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

export function normalizePhone(countryCode: string, localNumber: string) {
  const code = countryCode.replace(/[^\d+]/g, "");
  const number = localNumber.replace(/\D/g, "");
  const combined = `${code.startsWith("+") ? code : `+${code}`}${number}`;
  if (!/^\+[1-9]\d{7,14}$/.test(combined)) {
    throw new Error("Enter a valid WhatsApp number");
  }
  return combined;
}

export function splitPhone(value: string) {
  const clean = value.trim();
  const known = ["+91", "+1", "+44", "+61", "+65", "+971"];
  const countryCode = known.find((code) => clean.startsWith(code)) ?? "+91";
  return { countryCode, localNumber: clean.startsWith(countryCode) ? clean.slice(countryCode.length) : clean.replace(/^\+/, "") };
}

export function roleForMember(member: HouseholdMemberDraft) {
  if (member.isPrimary) return "primary user";
  if (member.memberKind === "external") return "external contact";
  return member.lifeStage;
}

export function isNutritionEstimateSupported(member: HouseholdMemberDraft) {
  return member.lifeStage === "adult";
}

export function activeRule(rule: { active: boolean; expiresAt?: number }, now = Date.now()) {
  return rule.active && (rule.expiresAt === undefined || rule.expiresAt > now);
}

export function composeMitraMessage(input: {
  context: CommunicationContext;
  recipientSalutation: string;
  seniorSalutation: string;
  label: string;
  type: MitraRoutineDraft["type"];
  language: AeviaLanguage;
}) {
  if (input.context.audience === "caretaker") {
    if (input.language === "English") {
      return `Hi ${input.recipientSalutation}. ${input.seniorSalutation}'s ${input.label} is due. Please reply when it is done.`;
    }
    return `Namaste ${input.recipientSalutation}. ${input.seniorSalutation} ke ${input.label} ka time ho gaya. Ho jaaye toh yahin bata dijiyega.`;
  }
  if (input.type === "Medication") {
    return input.language === "English"
      ? `${input.recipientSalutation}, it is time for ${input.label}. Have you taken it?`
      : `${input.recipientSalutation}, ${input.label} ka time ho gaya. Le li?`;
  }
  if (input.type === "Walk / activity") {
    return input.language === "English"
      ? `${input.recipientSalutation}, it is time for ${input.label}.`
      : `${input.recipientSalutation}, ${input.label} ka time ho gaya.`;
  }
  return input.language === "English"
    ? `${input.recipientSalutation}, a reminder for ${input.label}.`
    : `${input.recipientSalutation}, ${input.label} ka reminder hai.`;
}

export function composeCookIntroduction(input: {
  cookName: string;
  language: AeviaLanguage;
  relationshipType: CookingPersonDraft["relationshipType"];
}) {
  if (input.relationshipType === "family_cook" || input.relationshipType === "primary_user") {
    return input.language === "English"
      ? `Hi ${input.cookName}. Tarla will share the meal plan here. If anything needs changing, you can reply in this chat.`
      : `Hi ${input.cookName}. Tarla yahin khaane ka plan share karegi. Kuch change karna ho toh isi chat mein bata dena.`;
  }
  return input.language === "English"
    ? `Hi ${input.cookName}. Tarla will send the meal list on WhatsApp. Please follow that plan, and tell Tarla here if an ingredient is unavailable or something needs changing.`
    : `Hi ${input.cookName}. Tarla se aapko WhatsApp pe khaane ka list aa jayega. Aap uske hisaab se bana lijiye. Koi ingredient nahi hai ya kuch change karna ho toh Tarla ko yahin bata dijiyega.`;
}

export type HouseholdMeasure = {
  quantity: number;
  unit: string;
};

export function personHouseholdMeasure(recipeId: string, servingEquivalent: number): HouseholdMeasure {
  const definition = recipeMeasure(recipeId);
  return {
    quantity: roundToQuarter(definition.perServing * servingEquivalent),
    unit: definition.unit,
  };
}

export function cumulativeHouseholdMeasure(
  recipeId: string,
  servingEquivalents: number[],
): HouseholdMeasure {
  const definition = recipeMeasure(recipeId);
  return {
    quantity: roundToQuarter(
      servingEquivalents.reduce(
        (sum, serving) =>
          sum + personHouseholdMeasure(recipeId, serving).quantity,
        0,
      ),
    ),
    unit: definition.unit,
  };
}

export function formatHouseholdMeasure(measure: HouseholdMeasure) {
  const quantity = formatQuarter(measure.quantity);
  const unit = measure.quantity === 1 ? singular(measure.unit) : measure.unit;
  return `${quantity} ${unit}`;
}

export function householdMeasuresReconcile(
  recipeId: string,
  servingEquivalents: number[],
) {
  const people = servingEquivalents.map((serving) => personHouseholdMeasure(recipeId, serving));
  const total = cumulativeHouseholdMeasure(recipeId, servingEquivalents);
  return roundToQuarter(people.reduce((sum, measure) => sum + measure.quantity, 0)) === total.quantity;
}

function recipeMeasure(recipeId: string) {
  if (recipeId === "besan_chilla") return { perServing: 2, unit: "chillas" };
  if (recipeId === "plain_rice") return { perServing: 1, unit: "cups" };
  if (recipeId.includes("roti")) return { perServing: 2, unit: "rotis" };
  if (recipeId.includes("salad")) return { perServing: 0.5, unit: "bowls" };
  if (recipeId.includes("curd")) return { perServing: 1, unit: "bowls" };
  if (recipeId.includes("chicken") || recipeId.includes("fish")) {
    return { perServing: 1, unit: "portions" };
  }
  return { perServing: 1, unit: "bowls" };
}

function roundToQuarter(value: number) {
  return Math.round(value * 4) / 4;
}

function formatQuarter(value: number) {
  const whole = Math.floor(value);
  const fraction = value - whole;
  const suffix = fraction === 0.25 ? "¼" : fraction === 0.5 ? "½" : fraction === 0.75 ? "¾" : "";
  return whole ? `${whole}${suffix}` : suffix || "0";
}

function singular(value: string) {
  if (value === "chillas") return "chilla";
  if (value === "rotis") return "roti";
  if (value === "bowls") return "bowl";
  if (value === "cups") return "cup";
  if (value === "portions") return "portion";
  return value;
}

function localDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function zonedInputTimestamp(date: string, time: string, timezone: string) {
  const roughUtc = new Date(`${date}T${time}:00Z`).getTime();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(roughUtc));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const represented = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return roughUtc - (represented - roughUtc);
}
