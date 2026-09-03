export type StableOnboardingStep =
  | "identity"
  | "household"
  | "choice"
  | "mitraWho"
  | "mitraRoutines"
  | "tarlaEaters"
  | "tarlaFood"
  | "tarlaRules"
  | "tarlaCooks"
  | "anythingElse"
  | "review";

export type StableAgentChoice = "mitra" | "tarla" | "both";

export function initialOnboardingStep({
  hasExistingSession,
  hasSpecialistSetup,
}: {
  hasExistingSession: boolean;
  hasSpecialistSetup: boolean;
}): StableOnboardingStep {
  if (!hasExistingSession) return "identity";
  return hasSpecialistSetup ? "review" : "household";
}

export function onboardingSteps(choice: StableAgentChoice): StableOnboardingStep[] {
  const steps: StableOnboardingStep[] = ["identity", "household", "choice"];
  if (choice !== "tarla") steps.push("mitraWho", "mitraRoutines");
  if (choice !== "mitra") {
    steps.push("tarlaEaters", "tarlaFood", "tarlaRules", "tarlaCooks");
  }
  steps.push("anythingElse", "review");
  return steps;
}

export function previousOnboardingStep(
  step: StableOnboardingStep,
  choice: StableAgentChoice,
): StableOnboardingStep | undefined {
  const steps = onboardingSteps(choice);
  const index = steps.indexOf(step);
  return index > 0 ? steps[index - 1] : undefined;
}
