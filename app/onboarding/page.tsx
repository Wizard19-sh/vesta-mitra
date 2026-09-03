"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { useDeviceCredential } from "../../lib/aeviaSession";
import { PRIVACY_VERSION, TERMS_VERSION } from "../../lib/betaPolicies";
import {
  composeRoutineMessage,
  type MitraRoutineType,
} from "../../lib/composeRoutineMessage";
import {
  initialOnboardingStep,
  previousOnboardingStep,
} from "../../lib/onboardingFlowState";
import { useProductAnalytics } from "../../lib/productAnalytics";
import { SessionUnavailable } from "../SessionUnavailable";
import styles from "./onboarding.module.css";

type AgentChoice = "mitra" | "tarla" | "both";
type Step =
  | "identity"
  | "choice"
  | "shared"
  | "mitra"
  | "tarla"
  | "understood"
  | "plan";
type Language = "English" | "Hindi" | "Hinglish";
type RoutineTimingMode =
  | "once_now"
  | "once_scheduled"
  | "daily"
  | "selected_days"
  | "weekly"
  | "monthly";
type DietaryType = "vegetarian" | "eggetarian" | "non_vegetarian";
type CookingRole = "hired" | "family" | "self" | "different";
type VisitFrequency = "once_daily" | "twice_daily";
type MitraInput = {
  name: string;
  relationship: string;
  salutation: string;
  language: Language;
  phone: string;
  routineType: MitraRoutineType;
  label: string;
  exactMedicineName: string;
  timingMode: RoutineTimingMode;
  date: string;
  time: string;
  daysOfWeek: number[];
  dayOfMonth: number;
  introduced: boolean;
};
type TarlaInput = {
  includeAdult: boolean;
  adultName: string;
  includeChild: boolean;
  childName: string;
  dietaryType: DietaryType;
  cuisines: string[];
  foodContext: string;
  allergies: string;
  avoidFoods: string;
  preferences: string[];
  tuesdayVegetarian: boolean;
  nutrition: boolean;
  age: number;
  sex: "male" | "female";
  heightCm: number;
  weightKg: number;
  activityLevel:
    | "sedentary"
    | "lightly_active"
    | "moderately_active"
    | "very_active"
    | "extra_active";
  nutritionGoal: "maintenance" | "deficit_10" | "deficit_20" | "custom";
  calorieTarget: number;
  proteinTarget: number;
  cookingRole: CookingRole;
  cookingName: string;
  cookingLanguage: Language;
  cookingPhone: string;
  visitFrequency: VisitFrequency;
  morningTime: string;
  eveningTime: string;
  planDate: string;
};
type IdentityResult = {
  householdId: Id<"households">;
  memberId: Id<"members">;
};
type TarlaSetupResult = {
  cookStateId: Id<"tarlaCookStates">;
  endpointId: Id<"communicationEndpoints">;
  dayPlanId: Id<"tarlaDayPlans">;
  primingMessage: string;
  cookingRole: CookingRole;
};
type ExistingSession = NonNullable<FunctionReturnType<typeof api.m5.getSession>>;
type ExistingSetupIds = {
  mitra?: {
    memberId: Id<"members">;
    parentId: Id<"parents">;
    endpointId: Id<"communicationEndpoints">;
    routineId: Id<"routines">;
  };
  tarla?: {
    adultMemberId?: Id<"members">;
    childMemberId?: Id<"members">;
    cookMemberId?: Id<"members">;
    cookStateId?: Id<"tarlaCookStates">;
    endpointId?: Id<"communicationEndpoints">;
  };
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_CHOICES = [
  ["Sun", 0],
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6],
] as const;
const CUISINES = [
  "North Indian",
  "South Indian",
  "Punjabi",
  "Gujarati",
  "Maharashtrian",
  "Bengali",
  "Indo-Chinese",
  "Continental",
  "Italian / Pasta",
  "Salads / Bowls",
  "Other",
];

export default function OnboardingPage() {
  const [credentialState, retryCredential] = useDeviceCredential();
  const ownerKey =
    credentialState.status === "ready"
      ? credentialState.credential
      : undefined;
  const existingSession = useQuery(
    api.m5.getSession,
    ownerKey ? { ownerKey } : "skip",
  );

  if (credentialState.status === "loading") {
    return <main className={styles.loading}>Opening your Aevia setup…</main>;
  }
  if (credentialState.status === "unavailable") {
    return <SessionUnavailable onRetry={retryCredential} />;
  }
  if (existingSession === undefined) {
    return <main className={styles.loading}>Opening your Aevia setup…</main>;
  }

  return (
    <OnboardingFlow
      ownerKey={credentialState.credential}
      existingSession={existingSession}
    />
  );
}

function OnboardingFlow({
  ownerKey,
  existingSession,
}: {
  ownerKey: string;
  existingSession: ExistingSession | null;
}) {
  const router = useRouter();
  const [initial] = useState(() => initialOnboardingState(existingSession));
  const [step, setStep] = useState<Step>(() => initial.step);
  const [identity, setIdentity] = useState(() => initial.identity);
  const [sessionIds, setSessionIds] = useState<IdentityResult | undefined>(
    () => initial.sessionIds,
  );
  const [choice, setChoice] = useState<AgentChoice>(() => initial.choice);
  const [sharedContext, setSharedContext] = useState(
    () => initial.sharedContext,
  );
  const [mitra, setMitra] = useState<MitraInput>(() => initial.mitra);
  const [tarla, setTarla] = useState<TarlaInput>(() => initial.tarla);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tarlaSetup, setTarlaSetup] = useState<TarlaSetupResult>();
  const [existingIds] = useState<ExistingSetupIds>(() => initial.existingIds);
  const [primed, setPrimed] = useState(false);
  const [changeRequest, setChangeRequest] = useState("");
  const started = useRef(false);
  const track = useProductAnalytics();

  const createIdentity = useMutation(api.m5.createOrUpdateIdentity);
  const addMember = useMutation(api.vesta.addMember);
  const updateMember = useMutation(api.vesta.updateMember);
  const rememberPreference = useMutation(api.vesta.rememberPreference);
  const addEndpoint = useMutation(api.vesta.addCommunicationEndpoint);
  const updateEndpoint = useMutation(api.vesta.updateCommunicationEndpoint);
  const updateEndpointStatus = useMutation(api.vesta.updateCommunicationEndpointStatus);
  const configureProvider = useMutation(api.vesta.configureCommunicationProvider);
  const addParent = useMutation(api.mitra.addParent);
  const updateParent = useMutation(api.mitra.updateParent);
  const linkLegacyParent = useMutation(api.vesta.linkLegacyParent);
  const setMitraReadiness = useMutation(api.mitraRoutines.setMemberReadiness);
  const createMitraRoutine = useMutation(api.mitraRoutines.createScheduledRoutine);
  const updateMitraRoutine = useMutation(api.mitraRoutines.updateScheduledRoutine);
  const setMealContext = useMutation(api.tarlaProfiles.setHouseholdMealContext);
  const upsertMemberProfile = useMutation(api.tarlaProfiles.upsertMemberProfile);
  const estimateNutrition = useMutation(api.tarlaProfiles.estimateMemberNutrition);
  const setNutritionTargets = useMutation(api.tarlaProfiles.setNutritionTargets);
  const setTuesdayVegetarianRule = useMutation(
    api.tarlaProfiles.setTuesdayVegetarianRule,
  );
  const configureCook = useMutation(api.tarlaProfiles.configureCook);
  const reassignCook = useMutation(api.tarlaProfiles.reassignCook);
  const configureVisits = useMutation(api.tarlaProfiles.configureCookVisits);
  const generatePriming = useMutation(api.tarlaProfiles.generateCookPriming);
  const setCookReadiness = useMutation(api.tarlaProfiles.setCookReadiness);
  const createDayPlan = useMutation(api.tarlaDayPlanning.createFullDayPlan);
  const requestDayPlanChange = useMutation(api.tarlaDayPlanning.requestDayPlanChange);
  const approveDayPlan = useMutation(api.tarlaDayPlanning.approveDayPlan);
  const plan = useQuery(
    api.tarlaDayPlanning.getDayPlan,
    ownerKey && tarlaSetup
      ? { ownerKey, dayPlanId: tarlaSetup.dayPlanId }
      : "skip",
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void track("onboarding_started", { route: "/onboarding" });
  }, [track]);

  const mitraPreview = useMemo(
    () =>
      composeRoutineMessage({
        salutation: mitra.salutation,
        language: mitra.language,
        style: "Warm & caring",
        routineType: mitra.routineType,
        label: mitra.label,
        isFirstContact: true,
        setupBy: identity.name,
      }),
    [identity.name, mitra],
  );

  const steps = visibleSteps(choice);
  const progressIndex = Math.max(steps.indexOf(step), 0);

  function goBack() {
    const previous = previousOnboardingStep(step, choice);
    if (!previous) return;
    setError("");
    setStep(previous);
  }

  async function submitIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerKey) return;
    setBusy(true);
    setError("");
    try {
      const result = await createIdentity({
        ownerKey,
        name: identity.name,
        email: identity.email,
        householdName: identity.householdName || identity.name + "'s household",
        timezone: identity.timezone,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        accepted: identity.accepted,
      });
      setSessionIds({
        householdId: result.householdId,
        memberId: result.memberId,
      });
      await Promise.all([
        track("identity_completed", {
          householdId: result.householdId,
          route: "/onboarding",
        }),
        track("beta_terms_accepted", {
          householdId: result.householdId,
          route: "/onboarding",
          outcome: TERMS_VERSION,
        }),
      ]);
      setStep("choice");
    } catch (reason) {
      setError(messageFrom(reason, "We couldn’t save this identity yet."));
    } finally {
      setBusy(false);
    }
  }

  function submitChoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionIds) return;
    void track("agent_selected", {
      householdId: sessionIds.householdId,
      route: "/onboarding",
      agent: choice,
    });
    setStep("shared");
  }

  async function submitShared(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerKey || !sessionIds) return;
    setBusy(true);
    setError("");
    try {
      if (
        sharedContext.trim() &&
        existingSession?.setup.sharedContext !== sharedContext.trim()
      ) {
        await rememberPreference({
          ownerKey,
          householdId: sessionIds.householdId,
          category: "household_context",
          key: "user_provided_context",
          value: sharedContext.trim(),
          source: "onboarding",
        });
      }
      await track("shared_context_completed", {
        householdId: sessionIds.householdId,
        route: "/onboarding",
        agent: choice,
      });
      setStep(choice === "tarla" ? "tarla" : "mitra");
    } catch (reason) {
      setError(messageFrom(reason, "We couldn’t save the household context yet."));
    } finally {
      setBusy(false);
    }
  }

  function submitMitra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mitra.introduced) {
      setError("Confirm that this person knows Aevia will send the agreed routine.");
      return;
    }
    if (mitra.timingMode === "selected_days" && mitra.daysOfWeek.length === 0) {
      setError("Choose at least one day.");
      return;
    }
    setError("");
    setStep(choice === "both" ? "tarla" : "understood");
  }

  function submitTarla(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tarla.cuisines.length) {
      setError("Choose at least one cuisine or select Other.");
      return;
    }
    if (tarla.includeAdult && !tarla.adultName.trim()) {
      setError("Add the other adult’s name, or remove that person.");
      return;
    }
    if (tarla.includeChild && !tarla.childName.trim()) {
      setError("Add the child’s name, or remove that person.");
      return;
    }
    if (tarla.cookingRole !== "self" && !tarla.cookingName.trim()) {
      setError("Add the cooking person’s name.");
      return;
    }
    setError("");
    setStep("understood");
  }

  async function activate() {
    if (!ownerKey || !sessionIds) return;
    setBusy(true);
    setError("");
    try {
      if (choice === "mitra" || choice === "both") {
        await activateMitra(ownerKey, sessionIds);
      }
      if (choice === "tarla" || choice === "both") {
        const result = await prepareTarla(ownerKey, sessionIds);
        if (result) {
          setTarlaSetup(result);
          setStep("plan");
        } else {
          router.push("/dashboard");
        }
      } else {
        router.push("/dashboard");
      }
    } catch (reason) {
      setError(messageFrom(reason, "Aevia couldn’t activate this setup yet."));
    } finally {
      setBusy(false);
    }
  }

  async function activateMitra(key: string, session: IdentityResult) {
    const existing = existingIds.mitra;
    const memberId = existing?.memberId ??
      (await addMember({
        ownerKey: key,
        householdId: session.householdId,
        name: mitra.name,
        role: seniorRole(mitra.relationship),
        languagePreference: mitra.language,
        notes: sharedContext.trim() || undefined,
      }));
    if (existing) {
      await updateMember({
        ownerKey: key,
        householdId: session.householdId,
        memberId,
        name: mitra.name,
        role: seniorRole(mitra.relationship),
        languagePreference: mitra.language,
        notes: sharedContext.trim() || undefined,
      });
    }
    const parentId = existing?.parentId ??
      (await addParent({
        ownerKey: key,
        name: mitra.name,
        relationship: legacyRelationship(mitra.relationship),
        childDisplayName: identity.name,
        salutation: mitra.salutation,
        preferredLanguage: mitra.language,
        communicationPreference: "Text",
        conversationStyle: "Warm & caring",
        primaryIntent: "ROUTINES",
        context: sharedContext.trim() || undefined,
      }));
    if (existing) {
      await updateParent({
        ownerKey: key,
        parentId,
        name: mitra.name,
        relationship: legacyRelationship(mitra.relationship),
        childDisplayName: identity.name,
        salutation: mitra.salutation,
        preferredLanguage: mitra.language,
        context: sharedContext.trim() || undefined,
      });
    } else {
      await linkLegacyParent({
        ownerKey: key,
        parentId,
        householdId: session.householdId,
        memberId,
      });
    }
    const endpointId = existing?.endpointId ??
      (await addEndpoint({
        ownerKey: key,
        householdId: session.householdId,
        memberId,
        channel: "whatsapp",
        address: mitra.phone,
        preferredLanguage: mitra.language,
        preferredMode: "text",
        providerMetadata: { provider: "development", ready: true },
        active: true,
        consentStatus: "granted",
        verifiedAt: Date.now(),
      }));
    if (existing) {
      await updateEndpoint({
        ownerKey: key,
        endpointId,
        memberId,
        channel: "whatsapp",
        address: mitra.phone,
        preferredLanguage: mitra.language,
        preferredMode: "text",
      });
    }
    await setMitraReadiness({
      ownerKey: key,
      householdId: session.householdId,
      memberId,
      readiness: "ready",
    });
    const routine = existing
      ? await updateMitraRoutine({
          ownerKey: key,
          routineId: existing.routineId,
          type: mitra.routineType,
          label: mitra.label,
          timing: routineTiming(mitra, identity.timezone),
          customMessage: mitraPreview,
        })
      : await createMitraRoutine({
          ownerKey: key,
          householdId: session.householdId,
          memberId,
          parentId,
          communicationEndpointId: endpointId,
          type: mitra.routineType,
          label: mitra.label,
          timing: routineTiming(mitra, identity.timezone),
          customMessage: mitraPreview,
        });
    await Promise.all([
      track("mitra_onboarding_completed", {
        householdId: session.householdId,
        route: "/onboarding",
        agent: "mitra",
      }),
      track("first_task_configured", {
        householdId: session.householdId,
        route: "/onboarding",
        agent: "mitra",
        outcome: mitra.routineType,
      }),
      track("message_scheduled", {
        householdId: session.householdId,
        route: "/onboarding",
        agent: "mitra",
        outcome: String(routine.nextOccurrenceAt),
      }),
      track("whatsapp_ready", {
        householdId: session.householdId,
        route: "/onboarding",
        agent: "mitra",
        outcome: "development_transport",
      }),
    ]);
  }

  async function prepareTarla(
    key: string,
    session: IdentityResult,
  ): Promise<TarlaSetupResult | null> {
    await setMealContext({
      ownerKey: key,
      householdId: session.householdId,
      mealsPreparedAtHome: ["breakfast", "lunch", "snack", "dinner"],
      usualMealTimes: [
        { meal: "breakfast", time: "08:30" },
        { meal: "lunch", time: "13:00" },
        { meal: "snack", time: "16:30" },
        { meal: "dinner", time: "20:00" },
      ],
    });
    if (tarla.nutrition) {
      await updateMember({
        ownerKey: key,
        householdId: session.householdId,
        memberId: session.memberId,
        age: tarla.age,
        sex: tarla.sex,
        heightCm: tarla.heightCm,
        weightKg: tarla.weightKg,
      });
    }
    const commonProfile = {
      ownerKey: key,
      householdId: session.householdId,
      dietaryType: tarla.dietaryType,
      allergies: listFromText(tarla.allergies),
      avoidedFoods: listFromText(tarla.avoidFoods),
      limitedFoods: [],
      favouriteFoods: [],
      mealsAtHome: ["breakfast", "lunch", "snack", "dinner"],
      foodContext: [tarla.foodContext, tarla.preferences.join(", ")].filter(Boolean).join(". "),
    };
    await upsertMemberProfile({
      ...commonProfile,
      memberId: session.memberId,
      servingEquivalent: 1,
    });
    const eaterIds: Id<"members">[] = [session.memberId];
    if (tarla.includeAdult) {
      const adultId = existingIds.tarla?.adultMemberId ??
        (await addMember({
          ownerKey: key,
          householdId: session.householdId,
          name: tarla.adultName,
          role: "adult",
        }));
      if (existingIds.tarla?.adultMemberId) {
        await updateMember({
          ownerKey: key,
          householdId: session.householdId,
          memberId: adultId,
          name: tarla.adultName,
          role: "adult",
        });
      }
      eaterIds.push(adultId);
      await upsertMemberProfile({
        ...commonProfile,
        memberId: adultId,
        servingEquivalent: 1,
      });
    }
    if (tarla.includeChild) {
      const childId = existingIds.tarla?.childMemberId ??
        (await addMember({
          ownerKey: key,
          householdId: session.householdId,
          name: tarla.childName,
          role: "child",
        }));
      if (existingIds.tarla?.childMemberId) {
        await updateMember({
          ownerKey: key,
          householdId: session.householdId,
          memberId: childId,
          name: tarla.childName,
          role: "child",
        });
      }
      eaterIds.push(childId);
      await upsertMemberProfile({
        ...commonProfile,
        memberId: childId,
        servingEquivalent: 0.55,
        mealsAtHome: ["breakfast", "lunch", "dinner"],
        cookNotes: tarla.preferences.includes("low spice")
          ? "Keep the child portion low spice."
          : undefined,
      });
    }
    if (tarla.nutrition) {
      await estimateNutrition({
        ownerKey: key,
        householdId: session.householdId,
        memberId: session.memberId,
        activityLevel: tarla.activityLevel,
        goal: tarla.nutritionGoal,
        customCalorieTargetKcal:
          tarla.nutritionGoal === "custom" ? tarla.calorieTarget : undefined,
      });
      if (tarla.proteinTarget > 0) {
        await setNutritionTargets({
          ownerKey: key,
          householdId: session.householdId,
          memberId: session.memberId,
          proteinTargetG: tarla.proteinTarget,
        });
      }
    }
    const cuisineValue = tarla.cuisines.join(", ");
    if (existingSession?.setup.tarla?.cuisines !== cuisineValue) {
      await rememberPreference({
        ownerKey: key,
        householdId: session.householdId,
        category: "tarla_onboarding",
        key: "cuisines",
        value: cuisineValue,
        source: "onboarding",
      });
    }
    const foodContextValue = [tarla.foodContext.trim(), tarla.preferences.join(", ")]
      .filter(Boolean)
      .join(". ");
    if (
      foodContextValue &&
      existingSession?.setup.tarla?.foodContext !== foodContextValue
    ) {
      await rememberPreference({
        ownerKey: key,
        householdId: session.householdId,
        category: "tarla_onboarding",
        key: "food_context",
        value: foodContextValue,
        source: "onboarding",
      });
    }
    await setTuesdayVegetarianRule({
      ownerKey: key,
      householdId: session.householdId,
      active: tarla.tuesdayVegetarian,
    });
    let cookingMemberId: Id<"members">;
    if (tarla.cookingRole === "self") {
      cookingMemberId = session.memberId;
    } else if (
      existingIds.tarla?.cookMemberId &&
      existingIds.tarla.cookMemberId !== session.memberId
    ) {
      cookingMemberId = existingIds.tarla.cookMemberId;
      await updateMember({
        ownerKey: key,
        householdId: session.householdId,
        memberId: cookingMemberId,
        name: tarla.cookingName,
        role: cookingMemberRole(tarla.cookingRole),
        languagePreference: tarla.cookingLanguage,
      });
    } else {
      cookingMemberId = await addMember({
        ownerKey: key,
        householdId: session.householdId,
        name: tarla.cookingName,
        role: cookingMemberRole(tarla.cookingRole),
        languagePreference: tarla.cookingLanguage,
      });
    }
    if (
      existingIds.tarla?.cookStateId &&
      existingIds.tarla.cookMemberId !== cookingMemberId
    ) {
      await reassignCook({
        ownerKey: key,
        cookStateId: existingIds.tarla.cookStateId,
        memberId: cookingMemberId,
      });
    }
    const endpointId = existingIds.tarla?.endpointId ??
      (await addEndpoint({
        ownerKey: key,
        householdId: session.householdId,
        memberId: cookingMemberId,
        channel: "whatsapp",
        address: tarla.cookingPhone,
        preferredLanguage: tarla.cookingLanguage,
        preferredMode: "text",
        providerMetadata: {
          provider: "development",
          ready: tarla.cookingRole === "self",
        },
        active: true,
        consentStatus: tarla.cookingRole === "self" ? "granted" : "pending",
        verifiedAt: tarla.cookingRole === "self" ? Date.now() : undefined,
      }));
    if (existingIds.tarla?.endpointId) {
      await updateEndpoint({
        ownerKey: key,
        endpointId,
        memberId: cookingMemberId,
        channel: "whatsapp",
        address: tarla.cookingPhone,
        preferredLanguage: tarla.cookingLanguage,
        preferredMode: "text",
      });
    }
    const cookStateId = await configureCook({
      ownerKey: key,
      householdId: session.householdId,
      memberId: cookingMemberId,
      communicationEndpointId: endpointId,
      usualArrivalTime: tarla.morningTime,
      communicationTone: cookingTone(tarla.cookingRole),
      visitFrequency: tarla.visitFrequency,
    });
    await configureVisits({
      ownerKey: key,
      cookStateId,
      frequency: tarla.visitFrequency,
      visits:
        tarla.visitFrequency === "once_daily"
          ? [
              {
                label: "Daily visit",
                daysOfWeek: ALL_DAYS,
                arrivalTime: tarla.morningTime,
                timezone: identity.timezone,
                instructionLeadMinutes: 30,
                mealSlots: ["breakfast", "lunch", "snack", "dinner"],
              },
            ]
          : [
              {
                label: "Morning visit",
                daysOfWeek: ALL_DAYS,
                arrivalTime: tarla.morningTime,
                timezone: identity.timezone,
                instructionLeadMinutes: 30,
                mealSlots: ["breakfast", "lunch"],
              },
              {
                label: "Evening visit",
                daysOfWeek: ALL_DAYS,
                arrivalTime: tarla.eveningTime,
                timezone: identity.timezone,
                instructionLeadMinutes: 30,
                mealSlots: ["snack", "dinner"],
              },
            ],
    });
    const priming = await generatePriming({
      ownerKey: key,
      householdId: session.householdId,
      cookMemberId: cookingMemberId,
      householdUserMemberId: session.memberId,
    });
    if (existingIds.tarla?.cookStateId) {
      await track("tarla_onboarding_completed", {
        householdId: session.householdId,
        route: "/onboarding",
        agent: "tarla",
        outcome: "updated_existing_setup",
      });
      return null;
    }
    const dayPlan = await createDayPlan({
      ownerKey: key,
      householdId: session.householdId,
      requestedByMemberId: session.memberId,
      eaterMemberIds: eaterIds,
      targetDate: tarla.planDate,
      mealSlots: ["breakfast", "lunch", "snack", "dinner"],
    });
    await Promise.all([
      track("tarla_onboarding_completed", {
        householdId: session.householdId,
        route: "/onboarding",
        agent: "tarla",
      }),
      track("plan_generated", {
        householdId: session.householdId,
        route: "/onboarding",
        agent: "tarla",
        outcome: tarla.planDate,
      }),
    ]);
    return {
      cookStateId,
      endpointId,
      dayPlanId: dayPlan.dayPlanId,
      primingMessage: priming.primingMessage,
      cookingRole: tarla.cookingRole,
    };
  }

  async function changePlan() {
    if (!ownerKey || !sessionIds || !tarlaSetup || !changeRequest.trim()) return;
    setBusy(true);
    setError("");
    try {
      const changed = await requestDayPlanChange({
        ownerKey,
        dayPlanId: tarlaSetup.dayPlanId,
        memberId: sessionIds.memberId,
        rawContent: changeRequest.trim(),
      });
      setTarlaSetup({ ...tarlaSetup, dayPlanId: changed.dayPlanId });
      setChangeRequest("");
    } catch (reason) {
      setError(messageFrom(reason, "Tarla couldn’t apply that change."));
    } finally {
      setBusy(false);
    }
  }

  async function approvePlan() {
    if (!ownerKey || !sessionIds || !tarlaSetup) return;
    if (tarlaSetup.cookingRole !== "self" && !primed) {
      setError("Confirm that you introduced Aevia to the cooking person first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateEndpointStatus({
        ownerKey,
        endpointId: tarlaSetup.endpointId,
        active: true,
        consentStatus: "granted",
        verifiedAt: Date.now(),
      });
      await configureProvider({
        ownerKey,
        endpointId: tarlaSetup.endpointId,
        provider: "development",
        ready: true,
      });
      await setCookReadiness({
        ownerKey,
        cookStateId: tarlaSetup.cookStateId,
        readiness: "ready",
      });
      await approveDayPlan({
        ownerKey,
        dayPlanId: tarlaSetup.dayPlanId,
        memberId: sessionIds.memberId,
        cookStateId: tarlaSetup.cookStateId,
        rawContent: "I approve this full-day plan.",
      });
      await Promise.all([
        track("plan_approved", {
          householdId: sessionIds.householdId,
          route: "/onboarding",
          agent: "tarla",
        }),
        track("first_task_configured", {
          householdId: sessionIds.householdId,
          route: "/onboarding",
          agent: "tarla",
          outcome: "full_day_plan",
        }),
        track("message_scheduled", {
          householdId: sessionIds.householdId,
          route: "/onboarding",
          agent: "tarla",
          outcome: "cook_visit",
        }),
        track("whatsapp_ready", {
          householdId: sessionIds.householdId,
          route: "/onboarding",
          agent: "tarla",
          outcome: "development_transport",
        }),
      ]);
      router.push("/dashboard");
    } catch (reason) {
      setError(messageFrom(reason, "Aevia couldn’t approve and schedule this plan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}><span>A</span>Aevia</Link>
        <div className={styles.progress} aria-label={"Step " + (progressIndex + 1) + " of " + steps.length}>
          <span style={{ width: ((progressIndex + 1) / steps.length) * 100 + "%" }} />
        </div>
        <p>{progressIndex + 1} of {steps.length}</p>
      </header>

      {step === "identity" && (
        <Panel eyebrow="Start with you" title="A few details, then one useful action.">
          {existingSession && (
            <div className={styles.resume}>
              <p>Your saved Aevia setup is loaded below.</p>
              <Link href="/dashboard">Open dashboard</Link>
            </div>
          )}
          <form className={styles.form} onSubmit={submitIdentity}>
            <div className={styles.twoColumns}>
              <Field label="Your name"><input required autoFocus value={identity.name} onChange={(event) => setIdentity({ ...identity, name: event.target.value })} placeholder="e.g. Priya" /></Field>
              <Field label="Email"><input required type="email" value={identity.email} onChange={(event) => setIdentity({ ...identity, email: event.target.value })} placeholder="you@example.com" /></Field>
            </div>
            <Field label="Household name" hint="Optional"><input value={identity.householdName} onChange={(event) => setIdentity({ ...identity, householdName: event.target.value })} placeholder={identity.name ? identity.name + "'s household" : "e.g. The Sharma household"} /></Field>
            <Field label="Timezone"><input required readOnly value={identity.timezone} /></Field>
            <div className={styles.betaNotice}>
              <strong>Aevia is currently in beta.</strong>
              <p>It can make mistakes or misunderstand messages, so please review important information and decisions.</p>
            </div>
            <label className={styles.checkLine}>
              <input type="checkbox" checked={identity.accepted} onChange={(event) => setIdentity({ ...identity, accepted: event.target.checked })} required />
              <span>I agree to Aevia’s <Link href="/terms" target="_blank">Terms</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link> and understand that Aevia is currently in beta.</span>
            </label>
            <p className={styles.deviceNote}>This closed-beta setup is tied to this browser using a private device credential. It is not an email login yet.</p>
            <FormError error={error} />
            <NextButton busy={busy}>Continue</NextButton>
          </form>
        </Panel>
      )}

      {step === "choice" && (
        <Panel eyebrow="Choose your starting point" title="What would you like Aevia to take care of?">
          <form className={styles.form} onSubmit={submitChoice}>
            <div className={styles.choiceCards}>
              <ChoiceCard selected={choice === "mitra"} onSelect={() => setChoice("mitra")} letter="M" title="Parents" body="Set up Mitra for one agreed everyday routine." />
              <ChoiceCard selected={choice === "tarla"} onSelect={() => setChoice("tarla")} letter="T" title="Kitchen" body="Plan a day and coordinate the next cooking visit." />
              <ChoiceCard selected={choice === "both"} onSelect={() => setChoice("both")} letter="A" title="Both" body="One household setup, then Mitra and Tarla." />
            </div>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.backButton} onClick={goBack}>Back</button>
              <NextButton>Continue</NextButton>
            </div>
          </form>
        </Panel>
      )}

      {step === "shared" && (
        <Panel eyebrow="Your household" title="What should Aevia know before it starts?">
          <form className={styles.form} onSubmit={submitShared}>
            <Field label="Anything Aevia should know about your household?" hint="Optional">
              <textarea rows={6} value={sharedContext} onChange={(event) => setSharedContext(event.target.value)} placeholder="Papa prefers Hinglish. Our cook comes twice a day. Tuesdays are vegetarian." />
            </Field>
            <p className={styles.contextNote}>Aevia will save this as your own context. It will not pretend every sentence was perfectly extracted into structured data.</p>
            <FormError error={error} />
            <div className={styles.confirmActions}>
              <button type="button" className={styles.backButton} onClick={goBack} disabled={busy}>Back</button>
              <NextButton busy={busy}>Continue</NextButton>
            </div>
          </form>
        </Panel>
      )}

      {step === "mitra" && (
        <Panel eyebrow="Meet Mitra" title="Set up one routine for someone you care about.">
          <form className={styles.form} onSubmit={submitMitra}>
            <div className={styles.disclosure}>Mitra helps with everyday routines but isn’t a medical or emergency service. Medication information and changes should always be verified.</div>
            <div className={styles.twoColumns}>
              <Field label="Their name"><input required value={mitra.name} onChange={(event) => setMitra({ ...mitra, name: event.target.value })} placeholder="e.g. Rajesh" /></Field>
              <Field label="What do you call them?"><input required value={mitra.salutation} onChange={(event) => setMitra({ ...mitra, salutation: event.target.value, relationship: event.target.value })} placeholder="Papa, Maa, Dadi…" /></Field>
            </div>
            <Field label="Preferred language">
              <Pills values={["English", "Hindi", "Hinglish"]} selected={[mitra.language]} onToggle={(value) => setMitra({ ...mitra, language: value as Language })} single />
            </Field>
            <Field label="WhatsApp number" hint="Use international format">
              <input required pattern="^\+[1-9]\d{9,14}$" value={mitra.phone} onChange={(event) => setMitra({ ...mitra, phone: event.target.value })} placeholder="+91…" />
            </Field>
            <Field label="What should Mitra help with first?">
              <Pills values={["Medication", "Walk / activity", "Appointment / checkup", "Custom"]} selected={[mitra.routineType]} onToggle={(value) => setMitra({ ...mitra, routineType: value as MitraRoutineType, label: "" })} single />
            </Field>
            <Field label={mitra.routineType === "Medication" ? "Family-friendly medicine reference" : "Routine label"}>
              <input required value={mitra.label} onChange={(event) => setMitra({ ...mitra, label: event.target.value })} placeholder={mitra.routineType === "Medication" ? "e.g. BP wali dawai" : "e.g. evening walk"} />
            </Field>
            {mitra.routineType === "Medication" && (
              <Field label="Exact medicine name" hint="Optional; only if already confirmed">
                <input value={mitra.exactMedicineName} onChange={(event) => setMitra({ ...mitra, exactMedicineName: event.target.value })} />
                <small>Prescription upload is not available in this beta flow yet.</small>
              </Field>
            )}
            <Field label="When should it run?">
              <Pills values={["once_now", "once_scheduled", "daily", "selected_days", "weekly", "monthly"]} labels={["Now", "Once later", "Every day", "Selected days", "Weekly", "Monthly"]} selected={[mitra.timingMode]} onToggle={(value) => setMitra({ ...mitra, timingMode: value as RoutineTimingMode })} single />
            </Field>
            {mitra.timingMode === "once_scheduled" && (
              <div className={styles.twoColumns}>
                <Field label="Date"><input required type="date" value={mitra.date} onChange={(event) => setMitra({ ...mitra, date: event.target.value })} /></Field>
                <Field label="Time"><input required type="time" value={mitra.time} onChange={(event) => setMitra({ ...mitra, time: event.target.value })} /></Field>
              </div>
            )}
            {["daily", "selected_days", "weekly", "monthly"].includes(mitra.timingMode) && (
              <Field label="Time"><input required type="time" value={mitra.time} onChange={(event) => setMitra({ ...mitra, time: event.target.value })} /></Field>
            )}
            {["selected_days", "weekly"].includes(mitra.timingMode) && (
              <Field label={mitra.timingMode === "weekly" ? "Day" : "Days"}>
                <div className={styles.dayRow}>{DAY_CHOICES.map(([label, value]) => <button className={mitra.daysOfWeek.includes(value) ? styles.daySelected : ""} type="button" key={value} onClick={() => setMitra({ ...mitra, daysOfWeek: mitra.timingMode === "weekly" ? [value] : toggleNumber(mitra.daysOfWeek, value) })}>{label}</button>)}</div>
              </Field>
            )}
            {mitra.timingMode === "monthly" && <Field label="Day of month"><input type="number" min="1" max="28" value={mitra.dayOfMonth} onChange={(event) => setMitra({ ...mitra, dayOfMonth: Number(event.target.value) })} /></Field>}
            <div className={styles.preview}><span>Message preview</span><p>{mitraPreview}</p></div>
            <label className={styles.checkLine}>
              <input type="checkbox" checked={mitra.introduced} onChange={(event) => setMitra({ ...mitra, introduced: event.target.checked })} />
              <span>{mitra.salutation || "This person"} knows Aevia is being set up and has agreed to receive this routine.</span>
            </label>
            <FormError error={error} />
            <div className={styles.confirmActions}>
              <button type="button" className={styles.backButton} onClick={goBack}>Back</button>
              <NextButton>Continue</NextButton>
            </div>
          </form>
        </Panel>
      )}

      {step === "tarla" && (
        <Panel eyebrow="Meet Tarla" title="Give Tarla enough context to plan one day.">
          <form className={styles.form} onSubmit={submitTarla}>
            <div className={styles.disclosure}>Nutrition and meal recommendations are estimates. Please verify allergies, medical diets and other important dietary restrictions.</div>
            <Field label="Who eats at home?">
              <div className={styles.personRows}>
                <p><strong>{identity.name}</strong><span>You · breakfast, lunch, snack, dinner</span></p>
                <label><input type="checkbox" checked={tarla.includeAdult} onChange={(event) => setTarla({ ...tarla, includeAdult: event.target.checked })} />Another adult</label>
                {tarla.includeAdult && <input value={tarla.adultName} onChange={(event) => setTarla({ ...tarla, adultName: event.target.value })} placeholder="Their name" />}
                <label><input type="checkbox" checked={tarla.includeChild} onChange={(event) => setTarla({ ...tarla, includeChild: event.target.checked })} />A child</label>
                {tarla.includeChild && <input value={tarla.childName} onChange={(event) => setTarla({ ...tarla, childName: event.target.value })} placeholder="Child’s name" />}
              </div>
            </Field>
            <Field label="What kind of food does your household enjoy?">
              <Pills values={CUISINES} selected={tarla.cuisines} onToggle={(value) => setTarla({ ...tarla, cuisines: toggleText(tarla.cuisines, value) })} />
            </Field>
            <Field label="Tell Tarla what your household actually likes eating" hint="Optional">
              <textarea rows={3} value={tarla.foodContext} onChange={(event) => setTarla({ ...tarla, foodContext: event.target.value })} placeholder="We like simple dal-sabzi meals and pasta on weekends." />
            </Field>
            <div className={styles.twoColumns}>
              <Field label="Household diet">
                <select value={tarla.dietaryType} onChange={(event) => setTarla({ ...tarla, dietaryType: event.target.value as DietaryType })}>
                  <option value="vegetarian">Vegetarian</option>
                  <option value="eggetarian">Eggetarian</option>
                  <option value="non_vegetarian">Non-vegetarian</option>
                </select>
              </Field>
              <Field label="Must never include" hint="Allergies, comma separated"><input value={tarla.allergies} onChange={(event) => setTarla({ ...tarla, allergies: event.target.value })} placeholder="peanut" /></Field>
            </div>
            <Field label="Foods to avoid" hint="Hard restriction, comma separated"><input value={tarla.avoidFoods} onChange={(event) => setTarla({ ...tarla, avoidFoods: event.target.value })} placeholder="mushroom" /></Field>
            <Field label="Preferences" hint="Tarla will treat these as preferences, not allergies">
              <Pills values={["low oil", "low spice", "avoid deep fried"]} selected={tarla.preferences} onToggle={(value) => setTarla({ ...tarla, preferences: toggleText(tarla.preferences, value) })} />
            </Field>
            <label className={styles.checkLine}><input type="checkbox" checked={tarla.tuesdayVegetarian} onChange={(event) => setTarla({ ...tarla, tuesdayVegetarian: event.target.checked })} /><span>Tuesday meals must be vegetarian</span></label>
            <Field label="Do you want Tarla to plan around nutrition goals?">
              <Pills values={["Not now", "Yes"]} selected={[tarla.nutrition ? "Yes" : "Not now"]} onToggle={(value) => setTarla({ ...tarla, nutrition: value === "Yes" })} single />
            </Field>
            {tarla.nutrition && (
              <div className={styles.nutritionBox}>
                <div className={styles.threeColumns}>
                  <Field label="Age"><input type="number" min="18" max="120" value={tarla.age} onChange={(event) => setTarla({ ...tarla, age: Number(event.target.value) })} /></Field>
                  <Field label="Sex used by equation"><select value={tarla.sex} onChange={(event) => setTarla({ ...tarla, sex: event.target.value as "male" | "female" })}><option value="male">Male</option><option value="female">Female</option></select></Field>
                  <Field label="Activity"><select value={tarla.activityLevel} onChange={(event) => setTarla({ ...tarla, activityLevel: event.target.value as typeof tarla.activityLevel })}><option value="sedentary">Sedentary</option><option value="lightly_active">Lightly active</option><option value="moderately_active">Moderately active</option><option value="very_active">Very active</option><option value="extra_active">Extra active</option></select></Field>
                </div>
                <div className={styles.threeColumns}>
                  <Field label="Height (cm)"><input type="number" min="100" max="250" value={tarla.heightCm} onChange={(event) => setTarla({ ...tarla, heightCm: Number(event.target.value) })} /></Field>
                  <Field label="Weight (kg)"><input type="number" min="25" max="300" value={tarla.weightKg} onChange={(event) => setTarla({ ...tarla, weightKg: Number(event.target.value) })} /></Field>
                  <Field label="Goal"><select value={tarla.nutritionGoal} onChange={(event) => setTarla({ ...tarla, nutritionGoal: event.target.value as typeof tarla.nutritionGoal })}><option value="maintenance">Maintenance estimate</option><option value="deficit_10">About 10% deficit</option><option value="deficit_20">About 20% deficit</option><option value="custom">Custom calories</option></select></Field>
                </div>
                <div className={styles.twoColumns}>
                  {tarla.nutritionGoal === "custom" && <Field label="Daily calories"><input type="number" min="800" max="6000" value={tarla.calorieTarget} onChange={(event) => setTarla({ ...tarla, calorieTarget: Number(event.target.value) })} /></Field>}
                  <Field label="Daily protein (g)" hint="Editable"><input type="number" min="1" max="400" value={tarla.proteinTarget} onChange={(event) => setTarla({ ...tarla, proteinTarget: Number(event.target.value) })} /></Field>
                </div>
                <p>This uses the deterministic Mifflin–St Jeor estimate and an activity factor. It is not medical advice.</p>
              </div>
            )}
            <Field label="Who prepares meals?">
              <Pills values={["hired", "family", "self", "different"]} labels={["Hired cook", "Family member", "I cook", "Different people"]} selected={[tarla.cookingRole]} onToggle={(value) => setTarla({ ...tarla, cookingRole: value as CookingRole })} single />
            </Field>
            {tarla.cookingRole !== "self" && <Field label={tarla.cookingRole === "different" ? "First cooking person’s name" : "Cooking person’s name"}><input required value={tarla.cookingName} onChange={(event) => setTarla({ ...tarla, cookingName: event.target.value })} placeholder="e.g. Sunita Didi" /></Field>}
            <div className={styles.twoColumns}>
              <Field label={tarla.cookingRole === "self" ? "Your WhatsApp" : "Their WhatsApp"} hint="International format"><input required pattern="^\+[1-9]\d{9,14}$" value={tarla.cookingPhone} onChange={(event) => setTarla({ ...tarla, cookingPhone: event.target.value })} placeholder="+91…" /></Field>
              <Field label="Preferred language"><select value={tarla.cookingLanguage} onChange={(event) => setTarla({ ...tarla, cookingLanguage: event.target.value as Language })}><option>English</option><option>Hindi</option><option>Hinglish</option></select></Field>
            </div>
            <Field label="How often do they cook?">
              <Pills values={["once_daily", "twice_daily"]} labels={["Once daily", "Twice daily"]} selected={[tarla.visitFrequency]} onToggle={(value) => setTarla({ ...tarla, visitFrequency: value as VisitFrequency })} single />
            </Field>
            <div className={styles.twoColumns}>
              <Field label={tarla.visitFrequency === "once_daily" ? "Arrival time" : "Morning arrival"}><input required type="time" value={tarla.morningTime} onChange={(event) => setTarla({ ...tarla, morningTime: event.target.value })} /></Field>
              {tarla.visitFrequency === "twice_daily" && <Field label="Evening arrival"><input required type="time" value={tarla.eveningTime} onChange={(event) => setTarla({ ...tarla, eveningTime: event.target.value })} /></Field>}
            </div>
            <p className={styles.contextNote}>Instructions are scheduled 30 minutes before arrival. The time stays configurable in the runtime.</p>
            <Field label="First plan date"><input required type="date" value={tarla.planDate} onChange={(event) => setTarla({ ...tarla, planDate: event.target.value })} /></Field>
            <FormError error={error} />
            <div className={styles.confirmActions}>
              <button type="button" className={styles.backButton} onClick={goBack}>Back</button>
              <NextButton>Continue</NextButton>
            </div>
          </form>
        </Panel>
      )}

      {step === "understood" && (
        <Panel eyebrow="Review before activation" title="Here’s what Aevia understood.">
          <div className={styles.summary}>
            <SummaryRow label="Household" value={identity.householdName || identity.name + "'s household"} />
            <SummaryRow label="Aevia will start with" value={choice === "mitra" ? "Mitra" : choice === "tarla" ? "Tarla" : "Mitra and Tarla"} />
            {sharedContext.trim() && <SummaryRow label="Your own context" value={sharedContext.trim()} />}
            {(choice === "mitra" || choice === "both") && <SummaryRow label="Mitra" value={mitra.salutation + " · " + mitra.language + " · " + mitra.label + " · " + timingLabel(mitra.timingMode)} />}
            {(choice === "tarla" || choice === "both") && <SummaryRow label="Tarla" value={tarla.dietaryType.replace("_", "-") + " · " + tarla.cuisines.join(", ") + " · " + (tarla.visitFrequency === "once_daily" ? "one daily cooking visit" : "two daily cooking visits")} />}
          </div>
          <div className={styles.confirmActions}>
            <button type="button" className={styles.backButton} onClick={() => setStep(choice === "mitra" ? "mitra" : "tarla")}>Edit</button>
            <button type="button" className={styles.primaryButton} onClick={activate} disabled={busy}>{busy ? "Saving the setup…" : Object.keys(existingIds).length ? "Confirm and save changes" : "Confirm and create"}</button>
          </div>
          <p className={styles.activationNote}>Automated verification uses the development transport. This will not send a real WhatsApp message.</p>
          <FormError error={error} />
        </Panel>
      )}

      {step === "plan" && tarlaSetup && (
        <Panel eyebrow="Your first Tarla plan" title={"A full day for " + tarla.planDate}>
          {plan === undefined ? (
            <div className={styles.loadingCard}>Calculating the day from structured recipes…</div>
          ) : (
            <>
              <div className={styles.mealGrid}>
                {plan.meals.map((meal) => (
                  <article key={meal.join._id}>
                    <span>{meal.join.mealSlot}</span>
                    <h3>{meal.mealPlan.selectedTemplateName}</h3>
                    <p>{meal.calculated.plan.items.map((item) => item.recipeName).join(" · ")}</p>
                    <small>{round(meal.mealPlan.totalNutrition.caloriesKcal)} kcal · {round(meal.mealPlan.totalNutrition.proteinG)} g protein</small>
                  </article>
                ))}
              </div>
              <div className={styles.dayTotals}>
                <p><span>Full day</span><strong>{round(plan.dayPlan.totalNutrition.caloriesKcal)} kcal</strong></p>
                <p><span>Protein</span><strong>{round(plan.dayPlan.totalNutrition.proteinG)} g</strong></p>
                <p><span>Carbs</span><strong>{round(plan.dayPlan.totalNutrition.carbohydratesG)} g</strong></p>
                <p><span>Fat</span><strong>{round(plan.dayPlan.totalNutrition.fatG)} g</strong></p>
              </div>
              {plan.dayPlan.memberDailyNutrition[0] && (
                <p className={styles.variance}>
                  {plan.dayPlan.memberDailyNutrition[0].targets.caloriesKcal
                    ? "For " + plan.dayPlan.memberDailyNutrition[0].memberName + ": " + signed(plan.dayPlan.memberDailyNutrition[0].variance.caloriesKcal) + " kcal versus the configured daily target."
                    : "No calorie target was requested. Nutrition is shown as an estimate, not a prescribed target."}
                </p>
              )}
              <div className={styles.changeBox}>
                <Field label="Want a change?" hint="Tarla will save explicit food corrections">
                  <textarea rows={2} value={changeRequest} onChange={(event) => setChangeRequest(event.target.value)} placeholder="e.g. Don’t give paneer again this week." />
                </Field>
                <button type="button" onClick={changePlan} disabled={busy || !changeRequest.trim()}>Change this plan</button>
              </div>
              {tarlaSetup.cookingRole !== "self" && (
                <div className={styles.primingBox}>
                  <span>Send this introduction from your own WhatsApp first</span>
                  <p>{tarlaSetup.primingMessage}</p>
                  <label className={styles.checkLine}><input type="checkbox" checked={primed} onChange={(event) => setPrimed(event.target.checked)} /><span>I have introduced Aevia and the cooking person agreed to receive instructions.</span></label>
                </div>
              )}
              <FormError error={error} />
              <button type="button" className={styles.primaryButton} onClick={approvePlan} disabled={busy}>{busy ? "Approving and scheduling…" : "Approve and activate"}</button>
              <p className={styles.activationNote}>The approved plan will schedule real backend work through the development transport only.</p>
            </>
          )}
        </Panel>
      )}
    </main>
  );
}

function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return <section className={styles.panel}><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1>{children}</section>;
}

function initialOnboardingState(existingSession: ExistingSession | null) {
  const identity = {
    name: "",
    email: "",
    householdName: "",
    timezone:
      typeof window === "undefined"
        ? "Asia/Kolkata"
        : Intl.DateTimeFormat().resolvedOptions().timeZone,
    accepted: false,
  };
  const mitra: MitraInput = {
    name: "",
    relationship: "",
    salutation: "",
    language: "Hinglish",
    phone: "",
    routineType: "Walk / activity",
    label: "",
    exactMedicineName: "",
    timingMode: "once_scheduled",
    date: localDate(1),
    time: "18:00",
    daysOfWeek: [1, 2, 3, 4, 5],
    dayOfMonth: 1,
    introduced: false,
  };
  const tarla: TarlaInput = {
    includeAdult: false,
    adultName: "",
    includeChild: false,
    childName: "",
    dietaryType: "vegetarian" as DietaryType,
    cuisines: [] as string[],
    foodContext: "",
    allergies: "",
    avoidFoods: "",
    preferences: [] as string[],
    tuesdayVegetarian: false,
    nutrition: false,
    age: 30,
    sex: "male" as "male" | "female",
    heightCm: 170,
    weightKg: 70,
    activityLevel: "lightly_active",
    nutritionGoal: "maintenance",
    calorieTarget: 1800,
    proteinTarget: 80,
    cookingRole: "hired" as CookingRole,
    cookingName: "",
    cookingLanguage: "Hinglish" as Language,
    cookingPhone: "",
    visitFrequency: "once_daily" as VisitFrequency,
    morningTime: "08:00",
    eveningTime: "18:00",
    planDate: localDate(1),
  };
  if (!existingSession) {
    return {
      step: initialOnboardingStep({
        hasExistingSession: false,
        hasSpecialistSetup: false,
      }),
      identity,
      sessionIds: undefined,
      choice: "mitra" as AgentChoice,
      sharedContext: "",
      mitra,
      tarla,
      existingIds: {} as ExistingSetupIds,
    };
  }

  const savedIdentity = {
    name: existingSession.profile.name,
    email: existingSession.profile.email,
    householdName: existingSession.household.name,
    timezone: existingSession.household.timezone,
    accepted: true,
  };
  const setup = existingSession.setup as ExistingSession["setup"] | undefined;
  if (!setup) {
    return {
      step: initialOnboardingStep({
        hasExistingSession: true,
        hasSpecialistSetup: false,
      }),
      identity: savedIdentity,
      sessionIds: {
        householdId: existingSession.household._id,
        memberId: existingSession.member._id,
      },
      choice: "mitra" as AgentChoice,
      sharedContext: "",
      mitra,
      tarla,
      existingIds: {} as ExistingSetupIds,
    };
  }
  const existingIds: ExistingSetupIds = {};
  const storedMitra = setup.mitra;
  if (storedMitra) {
    Object.assign(mitra, {
      name: storedMitra.member.name,
      relationship: storedMitra.parent.salutation ?? storedMitra.member.role,
      salutation: storedMitra.parent.salutation ?? "",
      language: (storedMitra.parent.preferredLanguage ??
        storedMitra.member.languagePreference ??
        "English") as Language,
      phone: storedMitra.endpoint.address,
      routineType: normalizedRoutineType(storedMitra.routine.type),
      label: storedMitra.routine.label ?? storedMitra.routine.prompt,
      ...routineInputFromStored(storedMitra.routine),
      introduced: storedMitra.readiness === "ready",
    });
    existingIds.mitra = {
      memberId: storedMitra.member._id,
      parentId: storedMitra.parent._id,
      endpointId: storedMitra.endpoint._id,
      routineId: storedMitra.routine._id,
    };
  }

  const storedTarla = setup.tarla;
  if (storedTarla) {
    const profile = storedTarla.primaryProfile;
    const visits = [...storedTarla.cookVisits].sort((left, right) =>
      left.arrivalTime.localeCompare(right.arrivalTime),
    );
    const foodContext = splitStoredFoodContext(storedTarla.foodContext);
    const cookingRole = storedCookingRole(
      storedTarla.cookMember?.role,
      storedTarla.cookMember?._id === existingSession.member._id,
    );
    Object.assign(tarla, {
      includeAdult: Boolean(storedTarla.adultMember),
      adultName: storedTarla.adultMember?.name ?? "",
      includeChild: Boolean(storedTarla.childMember),
      childName: storedTarla.childMember?.name ?? "",
      dietaryType: (profile?.dietaryType ?? tarla.dietaryType) as DietaryType,
      cuisines: listFromText(storedTarla.cuisines),
      foodContext: foodContext.freeText,
      allergies: profile?.allergies.join(", ") ?? "",
      avoidFoods: profile?.avoidedFoods.join(", ") ?? "",
      preferences: foodContext.preferences,
      tuesdayVegetarian: storedTarla.dietaryRules.some(
        (rule) =>
          rule.ruleType === "vegetarian_days" && rule.daysOfWeek?.includes(2),
      ),
      nutrition: profile?.nutritionRequested ?? false,
      age: existingSession.member.age ?? tarla.age,
      sex: existingSession.member.sex === "female" ? "female" : "male",
      heightCm: existingSession.member.heightCm ?? tarla.heightCm,
      weightKg: existingSession.member.weightKg ?? tarla.weightKg,
      activityLevel: profile?.activityLevel ?? tarla.activityLevel,
      nutritionGoal: profile?.nutritionGoal ?? tarla.nutritionGoal,
      calorieTarget: profile?.calorieTargetKcal ?? tarla.calorieTarget,
      proteinTarget: profile?.proteinTargetG ?? tarla.proteinTarget,
      cookingRole,
      cookingName:
        cookingRole === "self" ? "" : storedTarla.cookMember?.name ?? "",
      cookingLanguage: (storedTarla.cookEndpoint?.preferredLanguage ??
        storedTarla.cookMember?.languagePreference ??
        "English") as Language,
      cookingPhone: storedTarla.cookEndpoint?.address ?? "",
      visitFrequency: visits.length > 1 ? "twice_daily" : "once_daily",
      morningTime: visits[0]?.arrivalTime ?? tarla.morningTime,
      eveningTime: visits[1]?.arrivalTime ?? tarla.eveningTime,
      planDate: storedTarla.latestDayPlan?.targetDate ?? tarla.planDate,
    });
    existingIds.tarla = {
      adultMemberId: storedTarla.adultMember?._id,
      childMemberId: storedTarla.childMember?._id,
      cookMemberId: storedTarla.cookMember?._id,
      cookStateId: storedTarla.cookState?._id,
      endpointId: storedTarla.cookEndpoint?._id,
    };
  }

  return {
    step: initialOnboardingStep({
      hasExistingSession: true,
      hasSpecialistSetup: Boolean(setup.mitra || setup.tarla),
    }),
    identity: savedIdentity,
    sessionIds: {
      householdId: existingSession.household._id,
      memberId: existingSession.member._id,
    },
    choice: setup.agentChoice as AgentChoice,
    sharedContext: setup.sharedContext,
    mitra,
    tarla,
    existingIds,
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return <label className={styles.field}><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>;
}

function NextButton({
  busy,
  children,
}: {
  busy?: boolean;
  children: React.ReactNode;
}) {
  return <button className={styles.primaryButton} disabled={busy}>{busy ? "Saving…" : children}</button>;
}

function FormError({ error }: { error: string }) {
  return error ? <p className={styles.error} role="alert">{error}</p> : null;
}

function ChoiceCard({
  selected,
  onSelect,
  letter,
  title,
  body,
}: {
  selected: boolean;
  onSelect: () => void;
  letter: string;
  title: string;
  body: string;
}) {
  return (
    <button className={selected ? styles.choiceSelected : ""} type="button" onClick={onSelect} aria-pressed={selected}>
      <span>{letter}</span><strong>{title}</strong><p>{body}</p>
    </button>
  );
}

function Pills({
  values,
  labels,
  selected,
  onToggle,
  single,
}: {
  values: string[];
  labels?: string[];
  selected: string[];
  onToggle: (value: string) => void;
  single?: boolean;
}) {
  return (
    <div className={styles.pills}>
      {values.map((value, index) => (
        <button
          type="button"
          aria-pressed={selected.includes(value)}
          className={selected.includes(value) ? styles.pillSelected : ""}
          onClick={() => onToggle(value)}
          key={value}
        >
          {labels?.[index] ?? value}{!single && selected.includes(value) ? " ✓" : ""}
        </button>
      ))}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><p>{value}</p></div>;
}

function visibleSteps(choice: AgentChoice): Step[] {
  if (choice === "both") return ["identity", "choice", "shared", "mitra", "tarla", "understood", "plan"];
  if (choice === "tarla") return ["identity", "choice", "shared", "tarla", "understood", "plan"];
  return ["identity", "choice", "shared", "mitra", "understood"];
}

function routineTiming(
  input: MitraInput,
  timezone: string,
):
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
    } {
  if (input.timingMode === "once_now") return { kind: "once_now", timezone };
  if (input.timingMode === "once_scheduled") {
    const scheduledAt = new Date(input.date + "T" + input.time + ":00").getTime();
    if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.now()) {
      throw new Error("Choose a future date and time.");
    }
    return { kind: "once_scheduled", timezone, scheduledAt };
  }
  const frequency = input.timingMode;
  return {
    kind: "recurring",
    timezone,
    recurrence: {
      frequency,
      time: input.time,
      daysOfWeek:
        frequency === "selected_days" || frequency === "weekly"
          ? input.daysOfWeek
          : undefined,
      dayOfMonth: frequency === "monthly" ? input.dayOfMonth : undefined,
    },
  };
}

function routineInputFromStored(routine: {
  timing?:
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
}) {
  const stored = routine.timing;
  if (!stored) return {};
  if (stored.kind === "once_now") {
    return { timingMode: "once_now" as const };
  }
  if (stored.kind === "once_scheduled") {
    const date = new Date(stored.scheduledAt);
    return {
      timingMode: "once_scheduled" as const,
      date: dateInput(date),
      time: timeInput(date),
    };
  }
  return {
    timingMode: stored.recurrence.frequency,
    time: stored.recurrence.time,
    daysOfWeek: stored.recurrence.daysOfWeek ?? [1],
    dayOfMonth: stored.recurrence.dayOfMonth ?? 1,
  };
}

function normalizedRoutineType(value: string): MitraRoutineType {
  if (
    value === "Medication" ||
    value === "Walk / activity" ||
    value === "Appointment / checkup" ||
    value === "Custom"
  ) {
    return value;
  }
  return "Custom";
}

function dateInput(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function timeInput(date: Date) {
  return [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join(":");
}

function legacyRelationship(value: string): "Mother" | "Father" | "Other" {
  if (/papa|dad|father|dada|dadu|nana|nanu/i.test(value)) return "Father";
  if (/mummy|maa|mom|mother|dadi|nani/i.test(value)) return "Mother";
  return "Other";
}

function seniorRole(value: string) {
  return /dada|dadu|dadi|nana|nanu|nani|grand/i.test(value)
    ? "grandparent"
    : "parent";
}

function cookingTone(role: CookingRole) {
  if (role === "hired") return "short, warm, practical hired-cook instructions";
  if (role === "family") return "collaborative family-member kitchen language";
  if (role === "self") return "planning and recipe guidance for the primary user";
  return "short, practical instructions for the configured cooking person";
}

function cookingMemberRole(role: CookingRole) {
  if (role === "hired") return "cook";
  if (role === "family") return "family cook";
  return "cooking person";
}

function storedCookingRole(
  role: string | undefined,
  isPrimaryUser: boolean,
): CookingRole {
  if (isPrimaryUser) return "self";
  if (role === "cook") return "hired";
  if (role === "family cook") return "family";
  return "different";
}

function splitStoredFoodContext(value: string) {
  const known = ["low oil", "low spice", "avoid deep fried"];
  const parts = value
    .split(". ")
    .map((part) => part.trim())
    .filter(Boolean);
  const preferencePart = parts.find((part) =>
    known.some((preference) => part.toLocaleLowerCase().includes(preference)),
  );
  const preferences = known.filter((preference) =>
    preferencePart?.toLocaleLowerCase().includes(preference),
  );
  return {
    preferences,
    freeText: parts.filter((part) => part !== preferencePart).join(". "),
  };
}

function listFromText(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toggleText(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function toggleNumber(values: number[], value: number) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function localDate(daysFromNow: number) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function timingLabel(value: RoutineTimingMode) {
  return {
    once_now: "now",
    once_scheduled: "once later",
    daily: "every day",
    selected_days: "selected days",
    weekly: "weekly",
    monthly: "monthly",
  }[value];
}

function round(value: number) {
  return Math.round(value);
}

function signed(value: number | undefined) {
  if (value === undefined) return "no variance";
  const rounded = Math.round(value);
  return rounded > 0 ? "+" + rounded : String(rounded);
}

function messageFrom(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
