export type Topic =
  | "Medication"
  | "Exercise / activity"
  | "How they're feeling"
  | "General check-in"
  | "Custom";

export type Language = "English" | "Hindi" | "Hinglish";
export type ConversationStyle = "Warm & caring" | "Casual" | "Straightforward";

type ComposeInput = {
  salutation: string;
  childDisplayName: string;
  language: Language;
  style: ConversationStyle;
  context?: string;
  topics: Topic[];
  customTopic?: string;
};

export function composeCheckIn(input: ComposeInput): string {
  const salutation = input.salutation.trim() || "Papa";
  const childName = input.childDisplayName.trim() || "Sid";
  const intro = composeIntro(salutation, childName, input.language, input.style);
  const contextLine = /travell?ing|travel|trip|journey/i.test(input.context ?? "")
    ? input.language === "English"
      ? input.style === "Casual"
        ? " Hope the trip's going well."
        : " Hope the trip is going well."
      : input.style === "Warm & caring"
        ? " Hope aap trip enjoy kar rahe hain."
        : " Hope trip achchi chal rahi hai."
    : "";
  const delegatedRoutine = chooseDelegatedRoutine(input.topics);
  const questions = [
    delegatedRoutine
      ? topicQuestion(delegatedRoutine, input.language, input.style, input.customTopic)
      : "",
  ].filter(Boolean);

  return `${intro}${contextLine} ${questions.join(" ")}`.replace(/\s+/g, " ").trim();
}

function chooseDelegatedRoutine(topics: Topic[]): Topic | undefined {
  if (topics.includes("Custom")) return "Custom";
  if (topics.includes("Medication")) return "Medication";
  if (topics.includes("Exercise / activity")) return "Exercise / activity";
  if (topics.includes("How they're feeling")) return "How they're feeling";
  return topics.includes("General check-in") ? "General check-in" : undefined;
}

function composeIntro(
  salutation: string,
  childName: string,
  language: Language,
  style: ConversationStyle,
) {
  if (language === "Hindi") {
    if (style === "Casual") return `Hi ${salutation}! Main Mitra hoon — ${childName} ne check in karne ko kaha.`;
    if (style === "Straightforward") return `Namaste ${salutation}. Main Mitra hoon. ${childName} ne check in karne ko kaha.`;
    return `Namaste ${salutation} 🙂 Main Mitra hoon. ${childName} ne aapse pyaar se check in karne ko kaha.`;
  }
  if (language === "Hinglish") {
    if (style === "Casual") return `Hi ${salutation}! Main Mitra hoon — ${childName} ne bola tha check-in kar loon.`;
    if (style === "Straightforward") return `Hi ${salutation}. Main Mitra hoon. ${childName} ne check-in karne ko kaha tha.`;
    return `Hi ${salutation} 🙂 Main Mitra hoon. ${childName} ne bola tha main aapse check-in kar loon.`;
  }
  if (style === "Casual") return `Hi ${salutation}! I'm Mitra — ${childName} asked me to check in.`;
  if (style === "Straightforward") return `Hi ${salutation}. I'm Mitra. ${childName} asked me to check in.`;
  return `Hi ${salutation} 🙂 I'm Mitra. ${childName} asked me to check in.`;
}

function topicQuestion(
  topic: Topic,
  language: Language,
  style: ConversationStyle,
  customTopic?: string,
) {
  if (topic === "Custom") return ensureQuestion(customTopic ?? "");
  if (language === "English") {
    if (style === "Casual") {
      return {
        Medication: "Medicines done?",
        "Exercise / activity": "Did you get some activity today?",
        "How they're feeling": "How are you feeling today?",
        "General check-in": "How's your day going?",
      }[topic];
    }
    return {
      Medication: "Have you taken your medicines?",
      "Exercise / activity": "Did you get some activity today?",
      "How they're feeling": "How are you feeling today?",
      "General check-in": "How is your day going?",
    }[topic];
  }
  if (language === "Hinglish" && style === "Casual") {
    return {
      Medication: "Medicines time pe le lena.",
      "Exercise / activity": "Aaj walk ya activity hui?",
      "How they're feeling": "Overall kaisa feel kar rahe hain?",
      "General check-in": "Aaj ka din kaisa ja raha hai?",
    }[topic];
  }
  if (language === "Hinglish" && style === "Straightforward") {
    return {
      Medication: "Medicines time pe lena mat bhuliyega.",
      "Exercise / activity": "Aaj walk ya activity hui?",
      "How they're feeling": "Aap overall kaisa feel kar rahe hain?",
      "General check-in": "Aaj sab kaisa chal raha hai?",
    }[topic];
  }
  if (language === "Hindi") {
    return {
      Medication: "Dawai ho gayi?",
      "Exercise / activity": "Aaj thodi walk ya activity ho paayi?",
      "How they're feeling": "Aaj aap kaisa mehsoos kar rahe hain?",
      "General check-in": "Aapka din kaisa ja raha hai?",
    }[topic];
  }
  return {
    Medication: "Medicines time pe lena mat bhuliyega.",
    "Exercise / activity": "Aaj thodi walk ya activity ho paayi?",
    "How they're feeling": "Aur aaj overall kaisa feel kar rahe hain?",
    "General check-in": "Aapka day kaisa ja raha hai?",
  }[topic];
}

function ensureQuestion(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  return /[?.!]$/.test(clean) ? clean : `${clean}?`;
}
