export type StableOnboardingStep =
  | "identity"
  | "choice"
  | "shared"
  | "mitra"
  | "tarla"
  | "understood"
  | "plan";

export type StableAgentChoice = "mitra" | "tarla" | "both";

export function initialOnboardingStep({
  hasExistingSession,
  hasSpecialistSetup,
}: {
  hasExistingSession: boolean;
  hasSpecialistSetup: boolean;
}): StableOnboardingStep {
  if (!hasExistingSession) return "identity";
  return hasSpecialistSetup ? "identity" : "choice";
}

export function previousOnboardingStep(
  step: StableOnboardingStep,
  choice: StableAgentChoice,
): StableOnboardingStep | undefined {
  if (step === "choice") return "identity";
  if (step === "shared") return "choice";
  if (step === "mitra") return "shared";
  if (step === "tarla") return choice === "both" ? "mitra" : "shared";
  if (step === "understood") return choice === "mitra" ? "mitra" : "tarla";
  if (step === "plan") return "understood";
  return undefined;
}
