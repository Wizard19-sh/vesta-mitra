export type Interpretation = {
  status: "OK" | "UNCONFIRMED" | "NEEDS_ATTENTION";
  overall: string;
  routineOutcome: string;
  usefulContext: string;
  childAction: string;
};

export function interpretResponse(
  rawResponse: string,
  parentName: string,
  topics: string[],
): Interpretation {
  const text = rawResponse.toLocaleLowerCase();
  const medicineTaken =
    /(medicine|medication|dawai|dawa|tablet).*(le li|li hai|taken|took|done)/i.test(
      text,
    ) || /(le li|li hai|taken|took).*(medicine|medication|dawai|dawa|tablet)/i.test(text);
  const withRelatives = /(relative|relatives|family|rishtedaar)/i.test(text);
  const wantsVideoCall = /(video call|video-call)/i.test(text);
  const mentionsGrandson = /(grandson|beta|son)/i.test(text);
  const clearlyOkay = medicineTaken || /\b(i am|i'm|im) (okay|ok|fine)\b/i.test(text);
  const feelingOkay = /(feeling|feel|tabiyat|haal).*(okay|ok|fine|good|theek|accha)/i.test(text);
  const activityDone =
    /(walk|walking|exercise|activity|yoga).*(done|did|ho gayi|kar li)/i.test(text) ||
    /(done|did|ho gayi|kar li).*(walk|walking|exercise|activity|yoga)/i.test(text);
  const activityNotDone =
    /(walk|walking|exercise|activity|yoga).*(nahi|not|didn't|did not)/i.test(text) ||
    /(nahi|not|didn't|did not).*(walk|walking|exercise|activity|yoga)/i.test(text);

  const confirmedOutcomes: string[] = [];
  if (topics.includes("Medication") && medicineTaken) {
    confirmedOutcomes.push(`${parentName} reported taking their medicine.`);
  }
  if (topics.includes("How they're feeling") && feelingOkay) {
    confirmedOutcomes.push(`${parentName} reported feeling okay.`);
  }
  if (topics.includes("Exercise") || topics.includes("Exercise / activity")) {
    if (activityNotDone) {
      confirmedOutcomes.push(`${parentName} reported not completing a separate walk.`);
    } else if (activityDone) {
      confirmedOutcomes.push(`${parentName} reported completing their activity.`);
    }
  }
  const routineOutcome = confirmedOutcomes.length
    ? confirmedOutcomes.join(" ")
    : "Response received — review the original reply for details.";

  return {
    status: clearlyOkay ? "OK" : "UNCONFIRMED",
    overall: clearlyOkay
      ? `${parentName} reported that they are okay.`
      : `${parentName} replied, but this check-in isn’t confirmed yet.`,
    routineOutcome,
    usefulContext: withRelatives
      ? `${parentName} reported being out with relatives.`
      : "They shared an update.",
    childAction:
      wantsVideoCall && mentionsGrandson
        ? `${parentName} wants a video call when your son wakes up.`
        : wantsVideoCall
          ? `${parentName} would like a video call.`
          : "No immediate follow-up was identified.",
  };
}
