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
  routineType: string,
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

  const routineOutcome =
    routineType === "Medication" && medicineTaken
      ? "Medicine taken."
      : "Response received — review the original reply for details.";

  return {
    status: clearlyOkay ? "OK" : "UNCONFIRMED",
    overall: clearlyOkay
      ? `${parentName} seems okay.`
      : `${parentName} replied, but this check-in isn’t confirmed yet.`,
    routineOutcome,
    usefulContext: withRelatives
      ? "Out with relatives."
      : "They shared an update.",
    childAction:
      wantsVideoCall && mentionsGrandson
        ? `${parentName} wants a video call when your son wakes up.`
        : wantsVideoCall
          ? `${parentName} would like a video call.`
          : "No immediate follow-up was identified.",
  };
}
