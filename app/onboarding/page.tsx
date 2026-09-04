"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Children,
  cloneElement,
  FormEvent,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  buildRoutineTiming,
  composeCookIntroduction,
  composeMitraMessage,
  cumulativeHouseholdMeasure,
  defaultHouseholdMember,
  defaultRoutine,
  defaultTarlaSetup,
  formatHouseholdMeasure,
  isNutritionEstimateSupported,
  normalizePhone,
  personHouseholdMeasure,
  splitPhone,
  to12Hour,
  type AeviaLanguage,
  type AeviaSetupPayload,
  type CommunicationPath,
  type CookingPersonDraft,
  type FoodRuleDraft,
  type HouseholdMemberDraft,
  type MitraPersonDraft,
  type MitraRoutineDraft,
  type NutritionPersonDraft,
  type TarlaSetupDraft,
} from "../../lib/aeviaSetup";
import { useDeviceCredential } from "../../lib/aeviaSession";
import { PRIVACY_VERSION, TERMS_VERSION } from "../../lib/betaPolicies";
import {
  initialOnboardingStep,
  onboardingSteps,
  previousOnboardingStep,
} from "../../lib/onboardingFlowState";
import { useProductAnalytics } from "../../lib/productAnalytics";
import { SessionUnavailable } from "../SessionUnavailable";
import { AeviaLogo } from "../AeviaLogo";
import styles from "./onboarding.module.css";

type AgentChoice = "mitra" | "tarla" | "both";
type Step =
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
  | "review"
  | "plan";
type ExistingSession = NonNullable<FunctionReturnType<typeof api.m5.getSession>>;
type IdentityResult = { householdId: Id<"households">; memberId: Id<"members"> };
type PlanSetup = {
  dayPlanId: Id<"tarlaDayPlans">;
  cookStateId: Id<"tarlaCookStates">;
  endpointId: Id<"communicationEndpoints">;
  primingMessage: string;
  phone: string;
  relationshipType: CookingPersonDraft["relationshipType"];
};

const DAY_CHOICES = [
  ["Sun", 0], ["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6],
] as const;
const ALL_DAYS = DAY_CHOICES.map(([, value]) => value);
const CUISINES = [
  "North Indian", "South Indian", "Punjabi", "Gujarati", "Maharashtrian",
  "Bengali", "Indo-Chinese", "Continental", "Italian / Pasta", "Salads / Bowls", "Other",
];
const RELATIONSHIPS = [
  "Partner / spouse", "Mother", "Father", "Mother-in-law", "Father-in-law",
  "Brother", "Sister", "Child", "Grandparent", "Other",
];

export default function OnboardingPage() {
  const [credentialState, retryCredential] = useDeviceCredential();
  const ownerKey = credentialState.status === "ready" ? credentialState.credential : undefined;
  const existingSession = useQuery(api.m5.getSession, ownerKey ? { ownerKey } : "skip");
  if (credentialState.status === "loading" || (ownerKey && existingSession === undefined)) {
    return <main className={styles.loading}>Opening your Aevia setup…</main>;
  }
  if (credentialState.status === "unavailable") return <SessionUnavailable onRetry={retryCredential} />;
  return <OnboardingFlow ownerKey={credentialState.credential} existingSession={existingSession ?? null} />;
}

function OnboardingFlow({ ownerKey, existingSession }: { ownerKey: string; existingSession: ExistingSession | null }) {
  const router = useRouter();
  const [initial] = useState(() => initialState(existingSession));
  const [step, setStep] = useState<Step>(() => initial.step);
  const [identity, setIdentity] = useState(initial.identity);
  const [sessionIds, setSessionIds] = useState<IdentityResult | undefined>(initial.sessionIds);
  const [choice, setChoice] = useState<AgentChoice>(initial.choice);
  const [members, setMembers] = useState<HouseholdMemberDraft[]>(initial.members);
  const [removedMemberIds, setRemovedMemberIds] = useState<string[]>([]);
  const [mitraPeople, setMitraPeople] = useState<MitraPersonDraft[]>(initial.mitraPeople);
  const [tarla, setTarla] = useState<TarlaSetupDraft>(initial.tarla);
  const [anythingElse, setAnythingElse] = useState(initial.anythingElse);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [planSetup, setPlanSetup] = useState<PlanSetup>();
  const [planChange, setPlanChange] = useState("");
  const [primed, setPrimed] = useState(false);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const track = useProductAnalytics();

  const createIdentity = useMutation(api.m5.createOrUpdateIdentity);
  const saveSetup = useMutation(api.m1Setup.saveSetup);
  const createDayPlan = useMutation(api.tarlaDayPlanning.createFullDayPlan);
  const requestDayPlanChange = useMutation(api.tarlaDayPlanning.requestDayPlanChange);
  const approveDayPlan = useMutation(api.tarlaDayPlanning.approveDayPlan);
  const updateEndpointStatus = useMutation(api.vesta.updateCommunicationEndpointStatus);
  const configureProvider = useMutation(api.vesta.configureCommunicationProvider);
  const setCookReadiness = useMutation(api.tarlaProfiles.setCookReadiness);
  const plan = useQuery(
    api.tarlaDayPlanning.getDayPlan,
    planSetup ? { ownerKey, dayPlanId: planSetup.dayPlanId } : "skip",
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void track("onboarding_started", { route: "/onboarding" });
  }, [track]);

  const steps: Step[] = [...onboardingSteps(choice)];
  const progressIndex = Math.max(0, steps.indexOf(step));
  const primary = members.find((member) => member.isPrimary);
  const householdMembers = members.filter((member) => member.memberKind === "household");

  function goBack() {
    const previous =
      step === "plan" ? "review" : previousOnboardingStep(step, choice);
    if (previous) setStep(previous);
    setError("");
  }

  async function submitIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await createIdentity({
        ownerKey,
        name: identity.name,
        email: identity.email,
        householdName: identity.householdName || `${identity.name}'s household`,
        timezone: identity.timezone,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        accepted: identity.accepted,
      });
      const ids = { householdId: result.householdId, memberId: result.memberId };
      setSessionIds(ids);
      setMembers((current) => {
        const existingPrimary = current.find((item) => item.isPrimary);
        const savedPrimary = defaultHouseholdMember({
          ...existingPrimary,
          clientKey: existingPrimary?.clientKey ?? "primary",
          memberId: String(result.memberId),
          name: identity.name,
          relationship: "Self",
          preferredSalutation: identity.name,
          isPrimary: true,
        });
        return [savedPrimary, ...current.filter((item) => !item.isPrimary)];
      });
      await track("identity_completed", { householdId: result.householdId, route: "/onboarding" });
      await track("beta_terms_accepted", {
        householdId: result.householdId,
        route: "/onboarding",
      });
      setStep("household");
    } catch (reason) {
      setError(messageFrom(reason, "We couldn’t save your details yet."));
    } finally {
      setBusy(false);
    }
  }

  function submitHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const active = members.filter((member) => member.memberKind === "household");
    if (active.some((member) => !member.name.trim() || !member.relationship.trim())) {
      setError("Add a name and relationship for each household member.");
      return;
    }
    setError("");
    setStep("choice");
  }

  function submitChoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStep(choice === "tarla" ? "tarlaEaters" : "mitraWho");
  }

  function submitMitraWho(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mitraPeople.length) return setError("Choose at least one adult or senior for Mitra.");
    for (const person of mitraPeople) {
      const member = memberByKey(members, person.memberClientKey);
      if (!member.preferredSalutation.trim()) return setError(`Add what you call ${member.name}.`);
      if (!person.consentConfirmed) return setError(`${member.name} must agree to receive these routine messages.`);
      if ((person.communicationPath === "senior_directly" || person.communicationPath === "both") && !validPhoneDraft(person.directPhone)) {
        return setError(`Add a valid WhatsApp number for ${member.name}.`);
      }
      if ((person.communicationPath === "caretaker" || person.communicationPath === "both") && (!person.caretakerMemberClientKey || !validPhoneDraft(person.caretakerPhone))) {
        return setError(`Add the caretaker or family contact for ${member.name}.`);
      }
    }
    setError("");
    setStep("mitraRoutines");
  }

  function submitMitraRoutines(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    for (const person of mitraPeople) {
      if (!person.routines.length) return setError(`Add at least one routine for ${memberByKey(members, person.memberClientKey).name}.`);
      for (const routine of person.routines) {
        if (!routine.label.trim()) return setError("Give every routine a familiar name.");
        if ((routine.timingMode === "selected_days" || routine.timingMode === "weekly") && !routine.daysOfWeek.length) return setError("Choose at least one day for the routine.");
        try { buildRoutineTiming(routine, identity.timezone); } catch (reason) { return setError(messageFrom(reason, "Check the routine time.")); }
      }
    }
    setError("");
    setStep(choice === "both" ? "tarlaEaters" : "anythingElse");
  }

  function submitTarlaEaters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tarla.eaterMemberClientKeys.length) return setError("Choose at least one person for Tarla to plan for.");
    setError("");
    setStep("tarlaFood");
  }

  function submitTarlaFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tarla.cuisines.length) return setError("Choose at least one cuisine, or choose Other.");
    setError("");
    setStep("tarlaRules");
  }

  function submitTarlaRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    for (const rule of tarla.rules) {
      if (!rule.description.trim() || !rule.daysOfWeek.length) return setError("Each food rule needs a day and a clear instruction.");
      if (rule.temporary && !rule.expiresOn) return setError("Choose when each temporary rule should end.");
    }
    if (tarla.nutritionMode === "nutrition_goal") {
      for (const nutrition of tarla.nutritionPeople.filter((item) => item.enabled)) {
        const member = memberByKey(members, nutrition.memberClientKey);
        if (!isNutritionEstimateSupported(member)) continue;
        if (!nutrition.age || !nutrition.sex || !nutrition.heightCm || !nutrition.weightKg || !nutrition.activityLevel) {
          return setError(`Complete the nutrition details for ${member.name}, or use balanced meals for them.`);
        }
      }
    }
    setError("");
    setStep("tarlaCooks");
  }

  function submitTarlaCooks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tarla.cookingPeople.length) return setError("Add at least one person who prepares meals.");
    for (const cook of tarla.cookingPeople) {
      const member = memberByKey(members, cook.memberClientKey);
      if (!member.name.trim()) return setError("Add a name for each cooking person.");
      if (!validPhoneDraft(cook.phone)) return setError(`Add a valid WhatsApp number for ${member.name}.`);
      if (!cook.visits.length || cook.visits.some((visit) => !visit.daysOfWeek.length)) return setError(`Add a cooking schedule for ${member.name}.`);
    }
    setError("");
    setStep("anythingElse");
  }

  async function confirmSetup() {
    if (!sessionIds) return;
    setBusy(true);
    setError("");
    try {
      const payload: AeviaSetupPayload = { agentChoice: choice, members, removedMemberIds, mitraPeople, tarla, anythingElse };
      const saved = await saveSetup({ ownerKey, householdId: sessionIds.householdId, setup: payload });
      const savedMap = new Map(saved.memberIds.map((item) => [item.clientKey, item.memberId]));
      await track("first_task_configured", { householdId: sessionIds.householdId, route: "/onboarding", agent: choice });
      if ((choice === "tarla" || choice === "both") && !existingSession?.setup.tarla?.latestDayPlan) {
        const firstCook = saved.cookingPeople[0];
        if (!firstCook) throw new Error("A cooking person is required for the first plan");
        const dayPlan = await createDayPlan({
          ownerKey,
          householdId: sessionIds.householdId,
          requestedByMemberId: sessionIds.memberId,
          eaterMemberIds: saved.eaterMemberIds,
          targetDate: tarla.firstPlanDate,
          mealSlots: ["breakfast", "lunch", "snack", "dinner"],
        });
        const cookDraft = tarla.cookingPeople[0];
        setPlanSetup({
          dayPlanId: dayPlan.dayPlanId,
          cookStateId: firstCook.cookStateId,
          endpointId: firstCook.endpointId,
          primingMessage: firstCook.primingMessage,
          phone: cookDraft.phone,
          relationshipType: firstCook.relationshipType,
        });
        setMembers((current) => current.map((item) => ({ ...item, memberId: String(savedMap.get(item.clientKey) ?? item.memberId ?? "") })));
        setStep("plan");
      } else {
        router.push("/dashboard");
      }
    } catch (reason) {
      setError(messageFrom(reason, "Aevia couldn’t save this setup yet."));
    } finally {
      setBusy(false);
    }
  }

  async function changePlan() {
    if (!planSetup || !sessionIds || !planChange.trim()) return;
    setBusy(true);
    try {
      const result = await requestDayPlanChange({ ownerKey, dayPlanId: planSetup.dayPlanId, memberId: sessionIds.memberId, rawContent: planChange.trim() });
      setPlanSetup({ ...planSetup, dayPlanId: result.dayPlanId });
      setPlanChange("");
    } catch (reason) { setError(messageFrom(reason, "Tarla couldn’t apply that change.")); }
    finally { setBusy(false); }
  }

  async function approvePlan() {
    if (!planSetup || !sessionIds) return;
    if (planSetup.relationshipType === "hired_cook" && !primed) return setError("Confirm that the cooking person agreed to receive these messages.");
    setBusy(true);
    try {
      await updateEndpointStatus({ ownerKey, endpointId: planSetup.endpointId, active: true, consentStatus: "granted", verifiedAt: Date.now() });
      await configureProvider({ ownerKey, endpointId: planSetup.endpointId, provider: "development", ready: true });
      await setCookReadiness({ ownerKey, cookStateId: planSetup.cookStateId, readiness: "ready" });
      await approveDayPlan({ ownerKey, dayPlanId: planSetup.dayPlanId, memberId: sessionIds.memberId, cookStateId: planSetup.cookStateId, rawContent: "I approve this full-day plan." });
      router.push("/dashboard");
    } catch (reason) { setError(messageFrom(reason, "Aevia couldn’t approve this plan yet.")); }
    finally { setBusy(false); }
  }

  async function copyIntro() {
    if (!planSetup) return;
    try { await navigator.clipboard.writeText(planSetup.primingMessage); setCopied(true); }
    catch { setError("Copying didn’t work here. You can select the message and copy it instead."); }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <AeviaLogo compact />
        <nav className={styles.stepper} aria-label={`Stage ${progressIndex + 1} of ${steps.length}`}>
          {(["Basics", "Household", "Care & Help", "Details", "Review"] as const).map((label, index) => {
            const active = macroStep(step) === index;
            const complete = macroStep(step) > index;
            return <span key={label} data-active={active} data-complete={complete}><i>{complete ? "✓" : index + 1}</i>{label}</span>;
          })}
        </nav>
        <div className={styles.userBadge}><strong>{identity.name || "Your home"}</strong><span>Household Head</span></div>
      </header>

      {step === "identity" && (
        <Panel eyebrow="About you" title="Let's start with you." supporting="A few basics so Aevia knows whose household it's helping.">
          <form className={styles.form} onSubmit={submitIdentity}>
            <div className={styles.twoColumns}>
              <Field label="Your name"><input required autoFocus value={identity.name} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} placeholder="Your name" /></Field>
              <Field label="Email"><input required type="email" value={identity.email} onChange={(e) => setIdentity({ ...identity, email: e.target.value })} placeholder="you@example.com" /></Field>
            </div>
            <Field label="Household name" hint="Optional"><input value={identity.householdName} onChange={(e) => setIdentity({ ...identity, householdName: e.target.value })} placeholder="e.g. Our home" /></Field>
            <Field label="Timezone"><input readOnly value={identity.timezone} /></Field>
            <div className={styles.betaNotice}><strong>Closed beta</strong><p>Aevia can make mistakes or misunderstand messages, so important information and decisions should still be reviewed.</p></div>
            <label className={styles.checkLine}><input required type="checkbox" checked={identity.accepted} onChange={(e) => setIdentity({ ...identity, accepted: e.target.checked })} /><span>I agree to Aevia’s <Link href="/terms" target="_blank">Terms</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span></label>
            <FormError error={error} /><NextButton busy={busy}>Continue</NextButton>
          </form>
        </Panel>
      )}

      {step === "household" && (
        <Panel eyebrow="Your household" title="Who is part of your household?" supporting="Add the people Aevia may need to plan for or coordinate around.">
          <form className={styles.form} onSubmit={submitHousehold}>
            <div className={styles.memberList}>
              {householdMembers.map((member) => (
                <MemberEditor key={member.clientKey} member={member} onChange={(next) => updateMemberState(setMembers, next)} onRemove={member.isPrimary ? undefined : () => removeMember(member)} />
              ))}
            </div>
            <button className={styles.addButton} type="button" onClick={() => setMembers((current) => [...current, defaultHouseholdMember()])}>+ Add household member</button>
            <p className={styles.helper}>These people form one shared household. Mitra and Tarla will reuse them, so you won’t add the same person twice.</p>
            <FormError error={error} /><Actions back={goBack} busy={busy} nextLabel="Continue to Care & Help" />
          </form>
        </Panel>
      )}

      {step === "choice" && (
        <Panel eyebrow="Phase 03 · Focus Areas" title="What would you like Aevia to take care of?" supporting="Choose the specialist support that suits your household. You can change this later.">
          <form className={styles.form} onSubmit={submitChoice}>
            <div className={styles.choiceCards}>
              <ChoiceCard selected={choice === "mitra"} title="Parents & seniors" name="Mitra" body="Everyday routines and follow-through for someone you care about." onSelect={() => setChoice("mitra")} />
              <ChoiceCard selected={choice === "tarla"} title="Kitchen & meals" name="Tarla" body="Meal planning and coordination around your household." onSelect={() => setChoice("tarla")} />
              <ChoiceCard selected={choice === "both"} title="Both" name="One household setup" body="Mitra and Tarla together, using the same household context." onSelect={() => setChoice("both")} />
            </div>
            <Actions back={goBack} busy={busy} nextLabel="Continue to Details" />
          </form>
        </Panel>
      )}

      {step === "mitraWho" && (
        <Panel eyebrow="Phase 04 · Mitra 1 of 2 — Care Specialist" title="Who should Mitra help?" supporting="Choose from the people already in your household. You can select more than one.">
          <form className={styles.form} onSubmit={submitMitraWho}>
            <div className={styles.selectPeople}>
              {householdMembers.filter((member) => !member.isPrimary && member.lifeStage !== "child").map((member) => {
                const selected = mitraPeople.some((item) => item.memberClientKey === member.clientKey);
                return <button type="button" key={member.clientKey} aria-pressed={selected} className={selected ? styles.personSelected : ""} onClick={() => toggleMitraPerson(member)}><strong>{member.name}</strong><span>{member.relationship} · {member.lifeStage}</span><em>{selected ? "Selected" : "Select"}</em></button>;
              })}
            </div>
            {mitraPeople.map((person) => {
              const member = memberByKey(members, person.memberClientKey);
              return (
                <section className={styles.configCard} key={person.memberClientKey}>
                  <h2>{member.name}</h2>
                  <div className={styles.twoColumns}>
                    <Field label="What do you call them?"><input required value={member.preferredSalutation} onChange={(e) => updateMemberState(setMembers, { ...member, preferredSalutation: e.target.value })} placeholder="Papa, Maa, Dadu, Nani…" /></Field>
                    <Field label="Preferred language"><select value={member.preferredLanguage} onChange={(e) => updateMemberState(setMembers, { ...member, preferredLanguage: e.target.value as AeviaLanguage })}><option>English</option><option>Hindi</option><option>Hinglish</option></select></Field>
                  </div>
                  <Field label="Who should Mitra coordinate with?"><Pills values={["senior_directly", "caretaker", "both"]} labels={["Them directly", "A caretaker / family member", "Both"]} selected={[person.communicationPath]} single onToggle={(value) => patchMitraPerson(person.memberClientKey, { communicationPath: value as CommunicationPath })} /></Field>
                  {(person.communicationPath === "senior_directly" || person.communicationPath === "both") && <PhoneField label={`${member.preferredSalutation || member.name}'s WhatsApp`} value={person.directPhone} onChange={(value) => patchMitraPerson(person.memberClientKey, { directPhone: value })} />}
                  {(person.communicationPath === "caretaker" || person.communicationPath === "both") && (
                    <div className={styles.caretakerBox}>
                      <Field label="Caretaker or family member"><select value={person.caretakerMemberClientKey ?? ""} onChange={(e) => patchMitraPerson(person.memberClientKey, { caretakerMemberClientKey: e.target.value || undefined })}><option value="">Choose a person</option>{members.filter((item) => item.clientKey !== member.clientKey).map((item) => <option key={item.clientKey} value={item.clientKey}>{item.name || "New external contact"} · {item.relationship || "contact"}</option>)}</select></Field>
                      <button className={styles.textButton} type="button" onClick={() => addExternalCaretaker(person.memberClientKey)}>+ Add external caretaker</button>
                      {person.caretakerMemberClientKey && memberByKey(members, person.caretakerMemberClientKey).memberKind === "external" && (() => { const contact = memberByKey(members, person.caretakerMemberClientKey!); return <div className={styles.twoColumns}><Field label="Contact name"><input value={contact.name} onChange={(e) => updateMemberState(setMembers, { ...contact, name: e.target.value })} placeholder="Name" /></Field><Field label="How should Mitra address them?"><input value={contact.preferredSalutation} onChange={(e) => updateMemberState(setMembers, { ...contact, preferredSalutation: e.target.value })} placeholder="Name or familiar salutation" /></Field><Field label="Relationship"><input value={contact.relationship} onChange={(e) => updateMemberState(setMembers, { ...contact, relationship: e.target.value })} placeholder="Caretaker, neighbour, family friend…" /></Field><Field label="Preferred language"><select value={contact.preferredLanguage} onChange={(e) => updateMemberState(setMembers, { ...contact, preferredLanguage: e.target.value as AeviaLanguage })}><option>English</option><option>Hindi</option><option>Hinglish</option></select></Field></div>; })()}
                      <PhoneField label="Caretaker WhatsApp" value={person.caretakerPhone} onChange={(value) => patchMitraPerson(person.memberClientKey, { caretakerPhone: value })} />
                      <p>Mitra uses this path for the agreed routine. You can change it later.</p>
                    </div>
                  )}
                  <label className={styles.checkLine}><input type="checkbox" checked={person.consentConfirmed} onChange={(e) => patchMitraPerson(person.memberClientKey, { consentConfirmed: e.target.checked })} /><span>{member.preferredSalutation || member.name} and any selected contact know about this setup and agreed to receive these messages.</span></label>
                </section>
              );
            })}
            <FormError error={error} /><Actions back={goBack} busy={busy} nextLabel="Continue to Mitra Routines" />
          </form>
        </Panel>
      )}

      {step === "mitraRoutines" && (
        <Panel eyebrow="Phase 04 · Mitra 2 of 2 — Routine Protocols" title="What should Mitra help with?" supporting="Choose one or more routines to start. You can add up to four during beta.">
          <form className={styles.form} onSubmit={submitMitraRoutines}>
            {mitraPeople.map((person) => {
              const member = memberByKey(members, person.memberClientKey);
              return <section className={styles.routineGroup} key={person.memberClientKey}><div className={styles.groupTitle}><div><p>For {member.preferredSalutation || member.name}</p><span>{pathLabel(person.communicationPath)}</span></div><button type="button" disabled={person.routines.length >= 4} onClick={() => patchMitraPerson(person.memberClientKey, { routines: [...person.routines, defaultRoutine()] })}>+ Add routine</button></div>{person.routines.map((routine, index) => <RoutineEditor key={routine.clientKey} routine={routine} index={index} member={member} path={person.communicationPath} caretaker={person.caretakerMemberClientKey ? memberByKey(members, person.caretakerMemberClientKey) : undefined} onChange={(next) => patchRoutine(person.memberClientKey, next)} onRemove={() => patchMitraPerson(person.memberClientKey, { routines: person.routines.filter((item) => item.clientKey !== routine.clientKey) })} />)}</section>;
            })}
            <div className={styles.disclosure}>Mitra supports agreed reminders and follow-through. It does not diagnose, medically monitor, or independently verify that medicine was taken.</div>
            <FormError error={error} /><Actions back={goBack} busy={busy} nextLabel={choice === "both" ? "Continue to Tarla Setup" : "Continue to Domestic Review"} />
          </form>
        </Panel>
      )}

      {step === "tarlaEaters" && (
        <Panel eyebrow="Phase 04 · Tarla 1 of 4 — Meal Planning" title="Who should Tarla plan for?" supporting="Choose from the people already in your shared household.">
          <form className={styles.form} onSubmit={submitTarlaEaters}>
            <div className={styles.inclusionList}>{householdMembers.map((member) => { const included = tarla.eaterMemberClientKeys.includes(member.clientKey); return <button key={member.clientKey} type="button" aria-pressed={included} onClick={() => setTarla({ ...tarla, eaterMemberClientKeys: toggleText(tarla.eaterMemberClientKeys, member.clientKey), nutritionPeople: ensureNutritionPeople(tarla.nutritionPeople, member.clientKey) })}><span><strong>{member.name}</strong><small>{member.relationship} · {member.lifeStage}</small></span><em>{included ? "Included" : "Not included"}</em><i>{included ? "✓" : "+"}</i></button>; })}</div>
            <button className={styles.addButton} type="button" onClick={() => setMembers((current) => [...current, defaultHouseholdMember()])}>+ Add household member</button>
            <FormError error={error} /><Actions back={goBack} busy={busy} nextLabel="Continue to Food Preferences" />
          </form>
        </Panel>
      )}

      {step === "tarlaFood" && (
        <Panel eyebrow="Phase 04 · Tarla 2 of 4 — Food Preferences" title="What does your household actually like eating?" supporting="This helps Tarla suggest meals that feel familiar, not generic.">
          <form className={styles.form} onSubmit={submitTarlaFood}>
            <Field label="Cuisines"><Pills values={CUISINES} selected={tarla.cuisines} onToggle={(value) => setTarla({ ...tarla, cuisines: toggleText(tarla.cuisines, value) })} /></Field>
            {tarla.cuisines.length > 0 && <Suggestion>Tarla can suggest familiar dishes from {tarla.cuisines.slice(0, 2).join(" and ")}. You decide what it remembers.</Suggestion>}
            <TokenField label="Tell Tarla what your household loves eating" value={tarla.favouriteFoods} onChange={(value) => setTarla({ ...tarla, favouriteFoods: value })} placeholder="Add dishes or ingredients, separated by commas" />
            <TokenField label="Foods the household usually dislikes" value={tarla.dislikedFoods} onChange={(value) => setTarla({ ...tarla, dislikedFoods: value })} placeholder="These are preferences, not allergies" />
            <section className={styles.restrictionBox}><p>Important restrictions</p><TokenField label="Any allergies or foods we should never include?" value={tarla.allergies} onChange={(value) => setTarla({ ...tarla, allergies: value })} placeholder="Add allergies, separated by commas" /><TokenField label="Other hard restrictions" value={tarla.hardRestrictions} onChange={(value) => setTarla({ ...tarla, hardRestrictions: value })} placeholder="Add foods that must not be included" /></section>
            <Field label="Preferences" hint="Tarla treats these as preferences, not allergies"><Pills values={["Less oil", "Less spicy", "Avoid deep fried"]} selected={tarla.softerPreferences} onToggle={(value) => setTarla({ ...tarla, softerPreferences: toggleText(tarla.softerPreferences, value) })} /></Field>
            <TokenField label="Add your own preference" value={tarla.softerPreferences.filter((item) => !["Less oil", "Less spicy", "Avoid deep fried"].includes(item))} onChange={(custom) => setTarla({ ...tarla, softerPreferences: [...tarla.softerPreferences.filter((item) => ["Less oil", "Less spicy", "Avoid deep fried"].includes(item)), ...custom] })} placeholder="e.g. lighter dinners" />
            <Field label="Tell Tarla anything else about food" hint="Optional"><textarea rows={4} value={tarla.foodContext} onChange={(e) => setTarla({ ...tarla, foodContext: e.target.value })} placeholder="We enjoy simple weekday meals and a bigger Sunday lunch." /></Field>
            <FormError error={error} /><Actions back={goBack} busy={busy} nextLabel="Continue to Nutrition & Rules" />
          </form>
        </Panel>
      )}

      {step === "tarlaRules" && (
        <Panel eyebrow="Phase 04 · Tarla 3 of 4 — Food Rules & Nutrition" title="Food Rules & Nutrition" supporting="Configure schedule-based dietary rules and nutrition goals for each household member.">
          <form className={styles.form} onSubmit={submitTarlaRules}>
            <div className={styles.ruleList}>{tarla.rules.map((rule) => <FoodRuleEditor key={rule.clientKey} rule={rule} onChange={(next) => setTarla({ ...tarla, rules: tarla.rules.map((item) => item.clientKey === next.clientKey ? next : item) })} onRemove={() => setTarla({ ...tarla, rules: tarla.rules.filter((item) => item.clientKey !== rule.clientKey) })} />)}</div>
            <button type="button" className={styles.addButton} onClick={() => setTarla({ ...tarla, rules: [...tarla.rules, defaultFoodRule()] })}>+ Add rule</button>
            {tarla.rules.length > 0 && <Suggestion>{tarla.rules.map((rule) => `${dayNames(rule.daysOfWeek)} · ${rule.description || "Add rule"}`).join("  •  ")}</Suggestion>}
            <section className={styles.nutritionSection}>
              <h2>How should Tarla plan meals?</h2>
              <div className={styles.modeCards}><button type="button" aria-pressed={tarla.nutritionMode === "balanced"} onClick={() => setTarla({ ...tarla, nutritionMode: "balanced" })}><strong>Keep meals balanced</strong><span>Recommended. No body measurements needed.</span></button><button type="button" aria-pressed={tarla.nutritionMode === "nutrition_goal"} onClick={() => setTarla({ ...tarla, nutritionMode: "nutrition_goal" })}><strong>Plan around nutrition goals</strong><span>Optional per-person planning estimates.</span></button></div>
              {tarla.nutritionMode === "nutrition_goal" && <div className={styles.nutritionPeople}>{tarla.eaterMemberClientKeys.map((key) => { const member = memberByKey(members, key); const nutrition = tarla.nutritionPeople.find((item) => item.memberClientKey === key) ?? defaultNutrition(key); if (!isNutritionEstimateSupported(member)) return <article className={styles.unsupportedNutrition} key={key}><strong>{member.name}</strong><p>Tarla will use balanced, age-appropriate planning here. This beta does not apply the adult estimate to {member.lifeStage === "child" ? "children" : "seniors"}.</p></article>; return <NutritionEditor key={key} member={member} value={nutrition} onChange={(next) => setTarla({ ...tarla, nutritionPeople: upsertNutrition(tarla.nutritionPeople, next) })} />; })}<p className={styles.helper}>Aevia uses these details to estimate energy and nutrition needs. These are planning estimates, not medical advice.</p></div>}
            </section>
            <FormError error={error} /><Actions back={goBack} busy={busy} nextLabel="Continue to Cooking Setup" />
          </form>
        </Panel>
      )}

      {step === "tarlaCooks" && (
        <Panel eyebrow="Phase 04 · Tarla 4 of 4 — Cooking Coordination" title="Who prepares meals?" supporting="Tarla adapts how it coordinates based on who cooks and when they visit.">
          <form className={styles.form} onSubmit={submitTarlaCooks}>
            <div className={styles.cookChoice}><button type="button" onClick={() => addCookingPerson("hired_cook")}>Hired cook</button><button type="button" onClick={() => addCookingPerson("family_cook")}>Family member</button><button type="button" onClick={() => addCookingPerson("primary_user")}>I cook</button><button type="button" onClick={() => addCookingPerson("other")}>Different person</button></div>
            {tarla.cookingPeople.map((cook, index) => <CookEditor key={cook.clientKey} cook={cook} index={index} members={members} onMemberChange={(next) => updateMemberState(setMembers, next)} onChange={(next) => setTarla({ ...tarla, cookingPeople: tarla.cookingPeople.map((item) => item.clientKey === next.clientKey ? next : item) })} onRemove={() => removeCookingPerson(cook)} />)}
            <p className={styles.helper}>Times are shown with AM or PM. You can save more than one cooking person and schedule.</p>
            <FormError error={error} /><Actions back={goBack} busy={busy} nextLabel="Continue to Household Context" />
          </form>
        </Panel>
      )}

      {step === "anythingElse" && (
        <Panel eyebrow="Phase 04 · Domestic Context" title="Anything else Aevia should know?" supporting="Add anything that would help Aevia understand your household routines, quiet hours, or habits.">
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); setStep("review"); }}><Field label="Household notes and preferences" hint="Optional"><textarea rows={7} value={anythingElse} onChange={(e) => setAnythingElse(e.target.value)} placeholder="We usually eat lighter dinners. Our cook doesn't come on Sundays." /></Field><p className={styles.helper}>Aevia can learn more from your corrections over time. You can review and change what it remembers.</p><Actions back={goBack} busy={busy} nextLabel="Continue to Review" /></form>
        </Panel>
      )}

      {step === "review" && (
        <Panel eyebrow="Activation happens after you confirm" title="Here's what Aevia understood." supporting="Review everything before Aevia starts. You can edit any section without restarting setup.">
          <div className={styles.reviewGrid}>
            <ReviewSection title="Household" edit={() => setStep("household")}><ul>{householdMembers.map((member) => <li key={member.clientKey}><strong>{member.name}</strong><span>{member.relationship} · {capitalize(member.lifeStage)}{member.preferredSalutation ? ` · “${member.preferredSalutation}”` : ""}</span></li>)}</ul></ReviewSection>
            {(choice === "mitra" || choice === "both") && <ReviewSection title="Parents & seniors with Mitra" edit={() => setStep("mitraWho")}><ul>{mitraPeople.map((person) => { const member = memberByKey(members, person.memberClientKey); return <li key={person.memberClientKey}><strong>Mitra will help {member.preferredSalutation || member.name}</strong><span>{member.preferredLanguage} · {pathLabel(person.communicationPath)}</span>{person.routines.map((routine) => <small key={routine.clientKey}>{routine.label} · {routineSchedule(routine)}{routine.notes ? ` · ${routine.notes}` : ""}</small>)}</li>; })}</ul></ReviewSection>}
            {(choice === "tarla" || choice === "both") && <><ReviewSection title="Kitchen & meals with Tarla" edit={() => setStep("tarlaEaters")}><p>Tarla will plan for {tarla.eaterMemberClientKeys.map((key) => memberByKey(members, key).name).join(", ")}.</p><p>{tarla.cuisines.join(" · ")}</p>{tarla.allergies.length > 0 && <p><strong>Allergies:</strong> {tarla.allergies.join(", ")}</p>}{tarla.hardRestrictions.length > 0 && <p><strong>Hard restrictions:</strong> {tarla.hardRestrictions.join(", ")}</p>}<p><strong>Preferences:</strong> {[...tarla.favouriteFoods, ...tarla.dislikedFoods, ...tarla.softerPreferences].join(", ") || "None added"}</p>{tarla.foodContext && <p><strong>Food context:</strong> {tarla.foodContext}</p>}<p><strong>Nutrition:</strong> {tarla.nutritionMode === "balanced" ? "Balanced meals" : "Per-person goals where supported"}</p>{tarla.nutritionMode === "nutrition_goal" && <ul>{tarla.eaterMemberClientKeys.map((key) => { const member = memberByKey(members, key); const profile = tarla.nutritionPeople.find((item) => item.memberClientKey === key); return <li key={key}><strong>{member.name}</strong><span>{profile?.enabled && isNutritionEstimateSupported(member) ? nutritionGoalLabel(profile.goal) : "Balanced planning"}</span></li>; })}</ul>}</ReviewSection><ReviewSection title="Food rules" edit={() => setStep("tarlaRules")}><ul>{tarla.rules.length ? tarla.rules.map((rule) => <li key={rule.clientKey}><strong>{dayNames(rule.daysOfWeek)}</strong><span>{rule.description}{rule.temporary ? ` · until ${rule.expiresOn}` : ""}</span></li>) : <li>No day-specific rules</li>}</ul></ReviewSection><ReviewSection title="Cooking people" edit={() => setStep("tarlaCooks")}><ul>{tarla.cookingPeople.map((cook) => { const member = memberByKey(members, cook.memberClientKey); return <li key={cook.clientKey}><strong>{member.name}</strong><span>{cookRoleLabel(cook.relationshipType)} · {cook.preferredLanguage}</span>{cook.visits.map((visit) => <small key={visit.clientKey}>{visit.label} · {dayNames(visit.daysOfWeek)} · {visit.time12}</small>)}</li>; })}</ul></ReviewSection></>}
            <ReviewSection title="Anything else" edit={() => setStep("anythingElse")}><p>{anythingElse || "No additional context added."}</p></ReviewSection>
          </div>
          <FormError error={error} /><button type="button" className={styles.primaryButton} onClick={confirmSetup} disabled={busy}>{busy ? "Saving your household…" : existingSession?.setup.hasSpecialistSetup ? "Confirm and save changes" : "Confirm and create"}</button><p className={styles.helper}>Aevia will activate this setup only after you confirm.</p>
        </Panel>
      )}

      {step === "plan" && planSetup && (
        <Panel eyebrow="Phase 05 · First Plan Approval" title="Your first Tarla plan" supporting={`Review the household menu, portions, and kitchen summary before activation. ${tarla.firstPlanDate} · ${tarla.nutritionMode === "balanced" ? "Keep meals balanced" : "Nutrition goals where configured"}`}>
          {plan === undefined ? <div className={styles.loadingCard}>Building the first plan…</div> : <div className={styles.planStack}>{plan.meals.map((meal) => <article className={styles.mealPlan} key={meal.join._id}><header><span>{meal.join.mealSlot}</span><h2>{meal.mealPlan.selectedTemplateName}</h2></header>{meal.calculated.plan.items.map((item) => <div className={styles.portionBlock} key={item.recipeId}><h3>{item.recipeName}</h3><div>{item.memberPortions.map((portion) => <p key={portion.memberId}><strong>{portion.memberName}</strong><span>{formatHouseholdMeasure(personHouseholdMeasure(item.recipeId, portion.servingEquivalent))}</span>{memberHasNutrition(plan.dayPlan.memberDailyNutrition, portion.memberId) && <small>{Math.round(portion.nutrition.caloriesKcal)} kcal · {Math.round(portion.nutrition.proteinG)} g protein estimate</small>}</p>)}</div></div>)}</article>)}</div>}
          {plan && <section className={styles.kitchenSummary}><p>For the kitchen</p>{plan.meals.map((meal) => <div key={meal.join._id}><strong>{capitalize(meal.join.mealSlot)}</strong>{meal.calculated.plan.items.map((item) => <span key={item.recipeId}>{item.recipeName} · {formatHouseholdMeasure(cumulativeHouseholdMeasure(item.recipeId, item.memberPortions.map((portion) => portion.servingEquivalent)))}</span>)}</div>)}</section>}
          <section className={styles.changeBox}><Field label="Want a change?" hint="Optional"><textarea rows={2} value={planChange} onChange={(e) => setPlanChange(e.target.value)} placeholder="Don't give paneer again this week." /></Field><button type="button" onClick={changePlan} disabled={busy || !planChange.trim()}>Change this plan</button></section>
          {planSetup.relationshipType === "hired_cook" && <section className={styles.primingBox}><p>Introduce Tarla first</p><blockquote>{planSetup.primingMessage}</blockquote><div className={styles.inlineActions}><button type="button" onClick={copyIntro}>{copied ? "Copied" : "Copy message"}</button><a href={`https://wa.me/${planSetup.phone.replace(/\D/g, "")}?text=${encodeURIComponent(planSetup.primingMessage)}`} target="_blank" rel="noreferrer">Open WhatsApp</a></div><label className={styles.checkLine}><input type="checkbox" checked={primed} onChange={(e) => setPrimed(e.target.checked)} /><span>I&apos;ve introduced Tarla and they agreed to receive kitchen messages.</span></label><small>Opening WhatsApp does not send the message.</small></section>}
          <FormError error={error} /><button type="button" className={styles.primaryButton} onClick={approvePlan} disabled={busy}>{busy ? "Approving…" : "Approve and activate"}</button>
        </Panel>
      )}
    </main>
  );

  function removeMember(member: HouseholdMemberDraft) {
    setMembers((current) => current.filter((item) => item.clientKey !== member.clientKey));
    if (member.memberId) setRemovedMemberIds((current) => [...new Set([...current, member.memberId!])]);
    setMitraPeople((current) => current.filter((item) => item.memberClientKey !== member.clientKey && item.caretakerMemberClientKey !== member.clientKey));
    setTarla((current) => ({ ...current, eaterMemberClientKeys: current.eaterMemberClientKeys.filter((key) => key !== member.clientKey), cookingPeople: current.cookingPeople.filter((cook) => cook.memberClientKey !== member.clientKey) }));
  }

  function toggleMitraPerson(member: HouseholdMemberDraft) {
    const existing = mitraPeople.find((item) => item.memberClientKey === member.clientKey);
    setMitraPeople(existing ? mitraPeople.filter((item) => item.memberClientKey !== member.clientKey) : [...mitraPeople, { memberClientKey: member.clientKey, communicationPath: "senior_directly", directPhone: "", caretakerPhone: "", consentConfirmed: false, routines: [defaultRoutine()] }]);
  }

  function patchMitraPerson(key: string, patch: Partial<MitraPersonDraft>) {
    setMitraPeople((current) => current.map((person) => person.memberClientKey === key ? { ...person, ...patch } : person));
  }

  function patchRoutine(personKey: string, routine: MitraRoutineDraft) {
    const person = mitraPeople.find((item) => item.memberClientKey === personKey)!;
    patchMitraPerson(personKey, { routines: person.routines.map((item) => item.clientKey === routine.clientKey ? routine : item) });
  }

  function addExternalCaretaker(personKey: string) {
    const member = defaultHouseholdMember({ memberKind: "external", relationship: "Caretaker", lifeStage: "adult" });
    setMembers((current) => [...current, member]);
    patchMitraPerson(personKey, { caretakerMemberClientKey: member.clientKey });
  }

  function addCookingPerson(type: CookingPersonDraft["relationshipType"]) {
    let memberKey = primary?.clientKey ?? members[0].clientKey;
    if (type === "hired_cook" || type === "other") {
      const external = defaultHouseholdMember({ memberKind: "external", relationship: type === "hired_cook" ? "Hired cook" : "Cooking person", lifeStage: "adult" });
      memberKey = external.clientKey;
      setMembers((current) => [...current, external]);
    } else if (type === "family_cook") {
      memberKey = householdMembers.find((item) => !item.isPrimary)?.clientKey ?? memberKey;
    }
    const cook: CookingPersonDraft = { clientKey: `cook_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, memberClientKey: memberKey, relationshipType: type, phone: "", preferredLanguage: "Hinglish", consentConfirmed: type === "primary_user", visits: [defaultVisit()] };
    setTarla((current) => ({ ...current, cookingPeople: [...current.cookingPeople, cook] }));
  }

  function removeCookingPerson(cook: CookingPersonDraft) {
    const member = members.find((item) => item.clientKey === cook.memberClientKey);
    setTarla((current) => ({ ...current, cookingPeople: current.cookingPeople.filter((item) => item.clientKey !== cook.clientKey) }));
    if (member?.memberKind === "external" && !mitraPeople.some((person) => person.caretakerMemberClientKey === member.clientKey)) removeMember(member);
  }
}

function Panel({ eyebrow, title, supporting, children }: { eyebrow: string; title: string; supporting?: string; children: React.ReactNode }) {
  return <section className={styles.panel}><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1>{supporting && <p className={styles.supporting}>{supporting}</p>}{children}</section>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const labelId = useId();
  const labelledChildren = Children.map(children, (child) => {
    if (
      !isValidElement(child) ||
      typeof child.type !== "string" ||
      !["input", "select", "textarea"].includes(child.type)
    ) {
      return child;
    }
    return cloneElement(
      child as React.ReactElement<Record<string, unknown>>,
      { "aria-labelledby": labelId },
    );
  });
  return <div className={styles.field}><span id={labelId}>{label}{hint && <small>{hint}</small>}</span>{labelledChildren}</div>;
}

function Actions({ back, busy, nextLabel = "Continue" }: { back: () => void; busy?: boolean; nextLabel?: string }) { return <div className={styles.actions}><button type="button" className={styles.backButton} onClick={back} disabled={busy}>Back</button><NextButton busy={busy}>{nextLabel}</NextButton></div>; }
function NextButton({ busy, children }: { busy?: boolean; children: React.ReactNode }) { return <button className={styles.primaryButton} disabled={busy}>{busy ? "Saving…" : children}</button>; }
function FormError({ error }: { error: string }) { return error ? <p className={styles.error} role="alert">{error}</p> : null; }
function Suggestion({ children }: { children: React.ReactNode }) { return <div className={styles.suggestion}><span>Tarla suggests</span><p>{children}</p><small>Optional — you confirm what is saved.</small></div>; }

function MemberEditor({ member, onChange, onRemove }: { member: HouseholdMemberDraft; onChange: (member: HouseholdMemberDraft) => void; onRemove?: () => void }) {
  return <article className={styles.memberCard}><header><div><strong>{member.isPrimary ? "You" : member.name || "New household member"}</strong><span>{member.isPrimary ? "Primary household member" : "Shared Aevia household context"}</span></div>{onRemove && <button type="button" onClick={onRemove}>Remove</button>}</header><div className={styles.twoColumns}><Field label="Name"><input required disabled={member.isPrimary} value={member.name} onChange={(e) => onChange({ ...member, name: e.target.value })} placeholder="Name" /></Field><Field label="Relationship"><input required disabled={member.isPrimary} list="relationships" value={member.relationship} onChange={(e) => onChange({ ...member, relationship: e.target.value })} placeholder="Choose or type" /><datalist id="relationships">{RELATIONSHIPS.map((item) => <option value={item} key={item} />)}</datalist></Field></div><div className={styles.threeColumns}><Field label="Life stage"><select disabled={member.isPrimary} value={member.lifeStage} onChange={(e) => onChange({ ...member, lifeStage: e.target.value as HouseholdMemberDraft["lifeStage"] })}><option value="adult">Adult</option><option value="child">Child</option><option value="senior">Senior</option></select></Field><Field label="What do you call them?" hint="Optional until needed"><input disabled={member.isPrimary} value={member.preferredSalutation} onChange={(e) => onChange({ ...member, preferredSalutation: e.target.value })} placeholder="Maa, Dad, Dadi…" /></Field><Field label="Preferred language"><select value={member.preferredLanguage} onChange={(e) => onChange({ ...member, preferredLanguage: e.target.value as AeviaLanguage })}><option>English</option><option>Hindi</option><option>Hinglish</option></select></Field></div></article>;
}

function ChoiceCard({ selected, title, name, body, onSelect }: { selected: boolean; title: string; name: string; body: string; onSelect: () => void }) { return <button type="button" aria-pressed={selected} onClick={onSelect}><span>{title}</span><strong>{name}</strong><p>{body}</p><em>{selected ? "Selected" : "Choose"}</em></button>; }

function PhoneField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const parts = splitPhone(value);
  return <fieldset className={styles.phoneField}><legend>{label}</legend><div><select aria-label={`${label} country code`} value={parts.countryCode} onChange={(e) => onChange(`${e.target.value}${parts.localNumber}`)}><option value="+91">India +91</option><option value="+1">US/Canada +1</option><option value="+44">UK +44</option><option value="+61">Australia +61</option><option value="+65">Singapore +65</option><option value="+971">UAE +971</option></select><input aria-label={`${label} number`} inputMode="tel" value={parts.localNumber} onChange={(e) => onChange(`${parts.countryCode}${e.target.value.replace(/\D/g, "")}`)} placeholder="WhatsApp number" /></div></fieldset>;
}

function Time12Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const match = value.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/) ?? ["", "6", "00", "PM"];
  return <fieldset className={styles.timeField}><legend>{label}</legend><div><select aria-label={`${label} hour`} value={match[1]} onChange={(e) => onChange(`${e.target.value}:${match[2]} ${match[3]}`)}>{Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => <option key={hour}>{hour}</option>)}</select><span>:</span><select aria-label={`${label} minutes`} value={match[2]} onChange={(e) => onChange(`${match[1]}:${e.target.value} ${match[3]}`)}>{["00", "15", "30", "45"].map((minute) => <option key={minute}>{minute}</option>)}</select><select aria-label={`${label} AM or PM`} value={match[3]} onChange={(e) => onChange(`${match[1]}:${match[2]} ${e.target.value}`)}><option>AM</option><option>PM</option></select></div></fieldset>;
}

function RoutineEditor({ routine, index, member, path, caretaker, onChange, onRemove }: { routine: MitraRoutineDraft; index: number; member: HouseholdMemberDraft; path: CommunicationPath; caretaker?: HouseholdMemberDraft; onChange: (routine: MitraRoutineDraft) => void; onRemove: () => void }) {
  const recipient = path === "caretaker" ? caretaker : member;
  const preview = composeMitraMessage({ context: { agent: "mitra", audience: path === "caretaker" ? "caretaker" : "senior", surface: "whatsapp", moment: "reminder" }, recipientSalutation: recipient?.preferredSalutation || recipient?.name || "Hello", seniorSalutation: member.preferredSalutation || member.name, label: routine.label || (routine.type === "Medication" ? "medicine" : "routine"), type: routine.type, language: recipient?.preferredLanguage ?? member.preferredLanguage });
  return <article className={styles.routineCard}><header><span>Routine {index + 1}</span><button type="button" onClick={onRemove}>Remove</button></header><Field label="Type"><Pills values={["Medication", "Walk / activity", "Appointment / checkup", "Custom"]} selected={[routine.type]} single onToggle={(value) => onChange({ ...routine, type: value as MitraRoutineDraft["type"] })} /></Field><Field label={routine.type === "Medication" ? "Family-friendly medicine reference" : "Natural label"}><input required value={routine.label} onChange={(e) => onChange({ ...routine, label: e.target.value })} placeholder={routine.type === "Medication" ? "e.g. BP wali dawai" : "e.g. evening walk"} />{routine.type === "Medication" && <small>Use only the familiar household reference. Exact medicine storage is not offered in this beta setup.</small>}</Field><Field label="Schedule"><Pills values={["once_now", "once_scheduled", "daily", "selected_days", "weekly", "monthly"]} labels={["Now", "Once later", "Every day", "Selected days", "Weekly", "Monthly"]} selected={[routine.timingMode]} single onToggle={(value) => onChange({ ...routine, timingMode: value as MitraRoutineDraft["timingMode"] })} /></Field>{routine.timingMode === "once_scheduled" && <Field label="Date"><input type="date" value={routine.date} onChange={(e) => onChange({ ...routine, date: e.target.value })} /></Field>}{routine.timingMode !== "once_now" && <Time12Field label="Time" value={routine.time12} onChange={(value) => onChange({ ...routine, time12: value })} />}{(routine.timingMode === "selected_days" || routine.timingMode === "weekly") && <DayPicker selected={routine.daysOfWeek} single={routine.timingMode === "weekly"} onChange={(days) => onChange({ ...routine, daysOfWeek: days })} />}{routine.timingMode === "monthly" && <Field label="Day of month"><input type="number" min={1} max={28} value={routine.dayOfMonth} onChange={(e) => onChange({ ...routine, dayOfMonth: Number(e.target.value) })} /></Field>}<details><summary>Add notes or context <small>Optional</small></summary><textarea rows={3} value={routine.notes} onChange={(e) => onChange({ ...routine, notes: e.target.value })} placeholder="e.g. Usually walks downstairs in the society." /></details><div className={styles.preview}><span>Message preview</span><p>{preview}</p></div></article>;
}

function FoodRuleEditor({ rule, onChange, onRemove }: { rule: FoodRuleDraft; onChange: (rule: FoodRuleDraft) => void; onRemove: () => void }) { return <article className={styles.ruleCard}><header><strong>{rule.description || "New food rule"}</strong><button type="button" onClick={onRemove}>Remove</button></header><DayPicker selected={rule.daysOfWeek} onChange={(days) => onChange({ ...rule, daysOfWeek: days })} /><Field label="Rule"><input value={rule.description} onChange={(e) => onChange({ ...rule, description: e.target.value })} placeholder="e.g. Vegetarian or no onion / garlic" /></Field><label className={styles.checkLine}><input type="checkbox" checked={rule.temporary} onChange={(e) => onChange({ ...rule, temporary: e.target.checked })} /><span>This is temporary</span></label>{rule.temporary && <Field label="End date"><input type="date" value={rule.expiresOn ?? ""} onChange={(e) => onChange({ ...rule, expiresOn: e.target.value })} /></Field>}</article>; }

function NutritionEditor({ member, value, onChange }: { member: HouseholdMemberDraft; value: NutritionPersonDraft; onChange: (value: NutritionPersonDraft) => void }) {
  const height = heightParts(value.heightCm);
  function updateHeight(feet: number | undefined, inches: number | undefined) {
    onChange({ ...value, heightCm: feet ? heightCmFromParts(feet, inches ?? 0) : undefined });
  }
  return <details className={styles.nutritionCard} open><summary><span><strong>{member.name}</strong><small>{value.enabled ? "Nutrition goal" : "Balanced"}</small></span></summary><label className={styles.checkLine}><input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} /><span>Use a nutrition goal for {member.name}</span></label>{value.enabled && <><div className={styles.twoColumns}><Field label="Age" hint="Years"><input type="number" min={18} max={120} value={value.age ?? ""} onChange={(e) => onChange({ ...value, age: Number(e.target.value) || undefined })} /></Field><Field label="Sex / biological profile"><select value={value.sex ?? ""} onChange={(e) => onChange({ ...value, sex: e.target.value as "male" | "female" })}><option value="">Choose</option><option value="female">Female</option><option value="male">Male</option></select></Field></div><div className={styles.twoColumns}><Field label="Height" hint="Feet and inches"><div className={styles.heightInputs}><div><input aria-label="Height feet" type="number" min={3} max={8} placeholder="5" value={height.feet ?? ""} onChange={(e) => updateHeight(Number(e.target.value) || undefined, height.inches)} /><span>ft</span></div><div><input aria-label="Height inches" type="number" min={0} max={11} placeholder="8" value={height.inches ?? ""} onChange={(e) => updateHeight(height.feet, Number(e.target.value))} /><span>in</span></div></div></Field><Field label="Weight" hint="Kilograms"><input aria-label="Weight" type="number" min={25} max={300} placeholder="e.g. 70" value={value.weightKg ?? ""} onChange={(e) => onChange({ ...value, weightKg: Number(e.target.value) || undefined })} /></Field></div><Field label="Activity level & expenditure"><select value={value.activityLevel ?? ""} onChange={(e) => onChange({ ...value, activityLevel: e.target.value as NutritionPersonDraft["activityLevel"] })}><option value="">Choose</option><option value="sedentary">Sedentary · little or no exercise</option><option value="lightly_active">Light · gentle activity 1–2 days/week</option><option value="moderately_active">Moderate · active 3–5 days/week</option><option value="very_active">Very active · exercise 6–7 days/week</option><option value="extra_active">Extra active · intense daily activity</option></select></Field><Field label="Primary nutritional focus"><select value={value.goal} onChange={(e) => onChange({ ...value, goal: e.target.value as NutritionPersonDraft["goal"] })}><option value="maintain">Balanced</option><option value="high_protein">High protein</option><option value="moderate_deficit">Moderate weight management</option><option value="stronger_deficit">Stronger weight management</option><option value="custom">Custom macro</option></select></Field>{value.goal === "custom" && <div className={styles.twoColumns}><Field label="Daily calorie estimate"><input type="number" min={800} max={6000} value={value.customCalorieTargetKcal ?? ""} onChange={(e) => onChange({ ...value, customCalorieTargetKcal: Number(e.target.value) || undefined })} /></Field><Field label="Daily protein estimate (g)"><input type="number" min={1} max={400} value={value.customProteinTargetG ?? ""} onChange={(e) => onChange({ ...value, customProteinTargetG: Number(e.target.value) || undefined })} /></Field></div>}</>}</details>;
}

function CookEditor({ cook, index, members, onMemberChange, onChange, onRemove }: { cook: CookingPersonDraft; index: number; members: HouseholdMemberDraft[]; onMemberChange: (member: HouseholdMemberDraft) => void; onChange: (cook: CookingPersonDraft) => void; onRemove: () => void }) { const member = memberByKey(members, cook.memberClientKey); const canChoose = cook.relationshipType === "family_cook" || cook.relationshipType === "primary_user"; return <article className={styles.cookCard}><header><div><strong>Cooking person {index + 1}</strong><span>{cookRoleLabel(cook.relationshipType)}</span></div><button type="button" onClick={onRemove}>Remove</button></header>{canChoose ? <Field label={cook.relationshipType === "primary_user" ? "Cooking person" : "Choose household member"}><select value={cook.memberClientKey} disabled={cook.relationshipType === "primary_user"} onChange={(e) => onChange({ ...cook, memberClientKey: e.target.value })}>{members.filter((item) => item.memberKind === "household").map((item) => <option key={item.clientKey} value={item.clientKey}>{item.name}</option>)}</select></Field> : <div className={styles.twoColumns}><Field label="Name"><input value={member.name} onChange={(e) => onMemberChange({ ...member, name: e.target.value, preferredSalutation: e.target.value })} placeholder="Name" /></Field><Field label="How should Tarla address them?"><input value={member.preferredSalutation} onChange={(e) => onMemberChange({ ...member, preferredSalutation: e.target.value })} placeholder="e.g. Sunita didi" /></Field></div>}<div className={styles.twoColumns}><PhoneField label="WhatsApp" value={cook.phone} onChange={(phone) => onChange({ ...cook, phone })} /><Field label="Preferred language"><select value={cook.preferredLanguage} onChange={(e) => onChange({ ...cook, preferredLanguage: e.target.value as AeviaLanguage })}><option>English</option><option>Hindi</option><option>Hinglish</option></select></Field></div>{cook.visits.map((visit, visitIndex) => <section className={styles.visitCard} key={visit.clientKey}><header><strong>{visit.label}</strong>{cook.visits.length > 1 && <button type="button" onClick={() => onChange({ ...cook, visits: cook.visits.filter((item) => item.clientKey !== visit.clientKey) })}>Remove visit</button>}</header><Field label="Visit label"><input value={visit.label} onChange={(e) => onChange({ ...cook, visits: cook.visits.map((item) => item.clientKey === visit.clientKey ? { ...item, label: e.target.value } : item) })} /></Field><DayPicker selected={visit.daysOfWeek} onChange={(days) => onChange({ ...cook, visits: cook.visits.map((item) => item.clientKey === visit.clientKey ? { ...item, daysOfWeek: days } : item) })} /><Time12Field label={`Visit ${visitIndex + 1} time`} value={visit.time12} onChange={(time12) => onChange({ ...cook, visits: cook.visits.map((item) => item.clientKey === visit.clientKey ? { ...item, time12 } : item) })} /></section>)}<button className={styles.textButton} type="button" onClick={() => onChange({ ...cook, visits: [...cook.visits, defaultVisit("Evening visit", "6:00 PM")] })}>+ Add another visit</button>{cook.relationshipType !== "primary_user" && <label className={styles.checkLine}><input type="checkbox" checked={cook.consentConfirmed} onChange={(e) => onChange({ ...cook, consentConfirmed: e.target.checked })} /><span>They have agreed to receive Tarla’s kitchen messages.</span></label>}<div className={styles.preview}><span>Introduction preview</span><p>{composeCookIntroduction({ cookName: member.preferredSalutation || member.name || "there", language: cook.preferredLanguage, relationshipType: cook.relationshipType })}</p></div></article>; }

function TokenField({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (value: string[]) => void; placeholder: string }) { return <Field label={label}><input value={value.join(", ")} onChange={(e) => onChange(listFromText(e.target.value))} placeholder={placeholder} />{value.length > 0 && <span className={styles.tokenRow}>{value.map((item) => <em key={item}>{item}</em>)}</span>}</Field>; }
function DayPicker({ selected, onChange, single = false }: { selected: number[]; onChange: (days: number[]) => void; single?: boolean }) { return <fieldset className={styles.dayPicker}><legend>Days</legend><div>{DAY_CHOICES.map(([label, value]) => <button type="button" key={value} aria-pressed={selected.includes(value)} onClick={() => onChange(single ? [value] : toggleNumber(selected, value))}>{label}</button>)}</div></fieldset>; }
function Pills({ values, labels, selected, onToggle, single = false }: { values: readonly string[]; labels?: readonly string[]; selected: string[]; onToggle: (value: string) => void; single?: boolean }) { return <div className={styles.pills}>{values.map((value, index) => <button type="button" key={value} aria-pressed={selected.includes(value)} onClick={() => onToggle(value)}>{labels?.[index] ?? value}{!single && selected.includes(value) ? " ✓" : ""}</button>)}</div>; }
function ReviewSection({ title, edit, children }: { title: string; edit: () => void; children: React.ReactNode }) { return <section className={styles.reviewSection}><header><h2>{title}</h2><button type="button" onClick={edit}>Edit</button></header>{children}</section>; }

function initialState(existing: ExistingSession | null) {
  const identity = { name: existing?.profile.name ?? "", email: existing?.profile.email ?? "", householdName: existing?.household.name ?? "", timezone: existing?.household.timezone ?? (typeof window === "undefined" ? "Asia/Kolkata" : Intl.DateTimeFormat().resolvedOptions().timeZone), accepted: Boolean(existing) };
  if (!existing) return { step: initialOnboardingStep({ hasExistingSession: false, hasSpecialistSetup: false }) as Step, identity, sessionIds: undefined, choice: "both" as AgentChoice, members: [defaultHouseholdMember({ clientKey: "primary", relationship: "Self", isPrimary: true })], mitraPeople: [], tarla: defaultTarlaSetup(), anythingElse: "" };
  const storedMembers: HouseholdMemberDraft[] = existing.setup.members.map((member) => ({ clientKey: String(member._id), memberId: String(member._id), name: member.name, relationship: member.relationship ?? (member._id === existing.member._id ? "Self" : member.role), lifeStage: storedLifeStage(member), preferredSalutation: member.preferredSalutation ?? (member._id === existing.member._id ? member.name : ""), preferredLanguage: supportedLanguage(member.languagePreference), memberKind: member.memberKind ?? (/external|cook|cooking/i.test(member.role) ? "external" : "household"), isPrimary: member._id === existing.member._id }));
  for (const entry of existing.setup.mitraPeople) {
    const saved = storedMembers.find((member) => member.memberId === String(entry.member._id));
    if (saved && !saved.preferredSalutation) {
      saved.preferredSalutation = entry.parent.salutation ?? entry.member.name;
    }
  }
  const mitraPeople: MitraPersonDraft[] = existing.setup.mitraPeople.map((entry) => ({ memberClientKey: String(entry.member._id), parentId: String(entry.parent._id), communicationPath: entry.parent.coordinationMode ?? "senior_directly", caretakerMemberClientKey: entry.caretakerMember ? String(entry.caretakerMember._id) : undefined, directPhone: entry.directEndpoint?.address ?? "", caretakerPhone: entry.caretakerEndpoint?.address ?? "", consentConfirmed: entry.readiness === "ready", routines: entry.routines.map(storedRoutine) }));
  const tarla = defaultTarlaSetup();
  if (existing.setup.tarla) {
    tarla.eaterMemberClientKeys = existing.setup.tarla.eaterProfiles.map((item) => String(item.member._id));
    const firstProfile = existing.setup.tarla.eaterProfiles[0]?.profile;
    tarla.dietaryType = firstProfile?.dietaryType ?? "vegetarian";
    tarla.cuisines = listFromText(existing.setup.tarla.cuisines);
    tarla.favouriteFoods = firstProfile?.favouriteFoods ?? [];
    tarla.dislikedFoods = firstProfile?.dislikedFoods ?? [];
    tarla.allergies = firstProfile?.allergies ?? [];
    tarla.hardRestrictions = firstProfile?.avoidedFoods ?? [];
    tarla.foodContext = existing.setup.tarla.foodContext;
    tarla.rules = existing.setup.tarla.dietaryRules.map((rule) => ({ clientKey: String(rule._id), ruleId: String(rule._id), daysOfWeek: rule.daysOfWeek ?? [], description: rule.description, temporary: rule.expiresAt !== undefined, expiresOn: rule.expiresAt ? new Date(rule.expiresAt).toISOString().slice(0, 10) : undefined }));
    tarla.nutritionMode = existing.setup.tarla.eaterProfiles.some((item) => item.profile.nutritionRequested) ? "nutrition_goal" : "balanced";
    tarla.nutritionPeople = existing.setup.tarla.eaterProfiles.map(({ member, profile }) => ({ memberClientKey: String(member._id), enabled: profile.nutritionRequested, age: member.age, sex: member.sex === "male" || member.sex === "female" ? member.sex : undefined, heightCm: member.heightCm, weightKg: member.weightKg, activityLevel: profile.activityLevel, goal: profile.planningGoal && profile.planningGoal !== "balanced" ? profile.planningGoal : storedGoal(profile.nutritionGoal), customCalorieTargetKcal: profile.planningGoal === "custom" ? profile.calorieTargetKcal : undefined, customProteinTargetG: profile.proteinTargetG }));
    tarla.cookingPeople = existing.setup.tarla.cookingPeople.filter((item) => item.member && item.endpoint).map((item) => ({ clientKey: String(item.cookState._id), cookStateId: String(item.cookState._id), memberClientKey: String(item.member!._id), relationshipType: item.cookState.relationshipType ?? storedCookRole(item.member!, existing.member._id), phone: item.endpoint!.address, preferredLanguage: supportedLanguage(item.endpoint!.preferredLanguage), consentConfirmed: item.endpoint!.consentStatus === "granted", visits: item.visits.map((visit) => ({ clientKey: String(visit._id), label: visit.label, daysOfWeek: visit.daysOfWeek, time12: to12Hour(visit.arrivalTime), mealSlots: visit.mealSlots })) }));
    tarla.firstPlanDate = existing.setup.tarla.latestDayPlan?.targetDate ?? tarla.firstPlanDate;
  }
  const requestedEdit =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("edit");
  const requestedStep: Step | undefined =
    requestedEdit === "household"
      ? "household"
      : requestedEdit === "mitra"
        ? "mitraWho"
        : requestedEdit === "tarla"
          ? "tarlaEaters"
          : undefined;
  return { step: requestedStep ?? initialOnboardingStep({ hasExistingSession: true, hasSpecialistSetup: existing.setup.hasSpecialistSetup }) as Step, identity, sessionIds: { householdId: existing.household._id, memberId: existing.member._id }, choice: existing.setup.agentChoice as AgentChoice, members: storedMembers, mitraPeople, tarla, anythingElse: existing.setup.sharedContext };
}
function macroStep(step: Step) { if (step === "identity") return 0; if (step === "household") return 1; if (step === "choice") return 2; if (step === "review" || step === "plan") return 4; return 3; }
function updateMemberState(setter: React.Dispatch<React.SetStateAction<HouseholdMemberDraft[]>>, member: HouseholdMemberDraft) { setter((current) => current.map((item) => item.clientKey === member.clientKey ? member : item)); }
function memberByKey(members: HouseholdMemberDraft[], key: string) { const member = members.find((item) => item.clientKey === key); if (!member) throw new Error("Household member not found"); return member; }
function validPhoneDraft(value: string) { try { const split = splitPhone(value); normalizePhone(split.countryCode, split.localNumber); return true; } catch { return false; } }
function defaultFoodRule(): FoodRuleDraft { return { clientKey: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, daysOfWeek: [], description: "", temporary: false }; }
function defaultNutrition(memberClientKey: string): NutritionPersonDraft { return { memberClientKey, enabled: false, goal: "maintain" }; }
function ensureNutritionPeople(items: NutritionPersonDraft[], key: string) { return items.some((item) => item.memberClientKey === key) ? items : [...items, defaultNutrition(key)]; }
function upsertNutrition(items: NutritionPersonDraft[], value: NutritionPersonDraft) { return items.some((item) => item.memberClientKey === value.memberClientKey) ? items.map((item) => item.memberClientKey === value.memberClientKey ? value : item) : [...items, value]; }
function defaultVisit(label = "Daily visit", time12 = "8:00 AM") { return { clientKey: `visit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label, daysOfWeek: [...ALL_DAYS], time12, mealSlots: ["breakfast", "lunch", "snack", "dinner"] }; }
function listFromText(value: string) { return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))]; }
function toggleText(values: string[], value: string) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
function toggleNumber(values: number[], value: number) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value].sort(); }
function pathLabel(value: CommunicationPath) { return value === "senior_directly" ? "Them directly" : value === "caretaker" ? "Caretaker / family member" : "Them and a caretaker / family member"; }
function cookRoleLabel(value: CookingPersonDraft["relationshipType"]) { return value === "hired_cook" ? "Hired cook" : value === "family_cook" ? "Family member" : value === "primary_user" ? "You" : "Other cooking person"; }
function dayNames(days: number[]) { return days.map((day) => DAY_CHOICES.find(([, value]) => value === day)?.[0]).filter(Boolean).join(" + ") || "Choose days"; }
function routineSchedule(routine: MitraRoutineDraft) { if (routine.timingMode === "once_now") return "Now"; if (routine.timingMode === "once_scheduled") return `${routine.date} · ${routine.time12}`; if (routine.timingMode === "daily") return `Daily · ${routine.time12}`; if (routine.timingMode === "monthly") return `Monthly on day ${routine.dayOfMonth} · ${routine.time12}`; return `${dayNames(routine.daysOfWeek)} · ${routine.time12}`; }
function storedRoutine(routine: ExistingSession["setup"]["mitraPeople"][number]["routines"][number]): MitraRoutineDraft { const timing = routine.timing; let mode: MitraRoutineDraft["timingMode"] = "daily"; let date = new Date(Date.now() + 86400000).toISOString().slice(0, 10); let time12 = "6:00 PM"; let days: number[] = [1, 2, 3, 4, 5]; let dayOfMonth = 1; if (timing?.kind === "once_now") mode = "once_now"; if (timing?.kind === "once_scheduled") { mode = "once_scheduled"; const value = new Date(timing.scheduledAt); date = value.toISOString().slice(0, 10); time12 = value.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }); } if (timing?.kind === "recurring") { mode = timing.recurrence.frequency; time12 = to12Hour(timing.recurrence.time); days = timing.recurrence.daysOfWeek ?? days; dayOfMonth = timing.recurrence.dayOfMonth ?? 1; } return { clientKey: String(routine._id), routineId: String(routine._id), type: routine.type === "Medication" || routine.type === "Walk / activity" || routine.type === "Appointment / checkup" ? routine.type : "Custom", label: routine.label ?? routine.prompt, timingMode: mode, date, time12, daysOfWeek: days, dayOfMonth, notes: routine.notes ?? "" }; }
function storedLifeStage(member: ExistingSession["setup"]["members"][number]): HouseholdMemberDraft["lifeStage"] { if (member.lifeStage) return member.lifeStage; if (member.role.toLowerCase().includes("child")) return "child"; if (/senior|mother|father|grand/i.test(member.role)) return "senior"; return "adult"; }
function storedGoal(goal: string | undefined): NutritionPersonDraft["goal"] { if (goal === "deficit_10") return "moderate_deficit"; if (goal === "deficit_20") return "stronger_deficit"; if (goal === "custom") return "custom"; return "maintain"; }
function heightParts(heightCm: number | undefined) { if (!heightCm) return { feet: undefined, inches: undefined }; const totalInches = Math.round(heightCm / 2.54); return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 }; }
function heightCmFromParts(feet: number, inches: number) { return Math.round((feet * 12 + inches) * 2.54 * 10) / 10; }
function nutritionGoalLabel(goal: NutritionPersonDraft["goal"]) { return goal === "maintain" ? "Maintain" : goal === "moderate_deficit" ? "Moderate deficit" : goal === "stronger_deficit" ? "Stronger deficit" : goal === "high_protein" ? "High protein" : "Custom"; }
function storedCookRole(member: ExistingSession["setup"]["members"][number], primaryId: string): CookingPersonDraft["relationshipType"] { if (String(member._id) === String(primaryId)) return "primary_user"; if (member.memberKind === "household" || (!member.memberKind && !/cook|cooking/i.test(member.role))) return "family_cook"; return "hired_cook"; }
function supportedLanguage(value: string | undefined): AeviaLanguage { return value === "Hindi" || value === "Hinglish" ? value : "English"; }
function memberHasNutrition(items: Array<{ memberId: string; targets: { caloriesKcal?: number; proteinG?: number } }>, memberId: string) { const item = items.find((entry) => String(entry.memberId) === String(memberId)); return Boolean(item?.targets.caloriesKcal || item?.targets.proteinG); }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " "); }
function messageFrom(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
