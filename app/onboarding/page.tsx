"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDeviceCredential } from "../../lib/aeviaSession";
import { SessionUnavailable } from "../SessionUnavailable";
import styles from "./onboarding.module.css";

type Step = "basics" | "members" | "roles" | "review" | "complete";
type DietaryType = "vegetarian" | "eggetarian" | "non_vegetarian";
type ActivityLevel = "sedentary" | "lightly_active" | "moderately_active" | "very_active" | "extra_active";
type DietGoal = "maintain" | "moderate_deficit" | "stronger_deficit" | "high_protein";

type MemberDraft = {
  clientKey: string;
  name: string;
  relationship: string;
  lifeStage: "adult" | "child" | "senior";
  dietaryType: DietaryType;
  favouriteFoods: string;
  allergies: string;
  restrictions: string;
  mealsAtHome: string[];
  age: string;
  sex: "male" | "female";
  heightCm: string;
  weightKg: string;
  activityLevel: ActivityLevel;
  dietGoal: DietGoal;
};

type CookSetup = {
  mode: "member" | "hired";
  name: string;
  phone: string;
  language: "English" | "Hindi" | "Hinglish";
  frequency: "once_daily" | "twice_daily";
  consentConfirmed: boolean;
};

type CreatedIds = { householdId: Id<"households">; memberIds: Id<"members">[]; dayPlanId: Id<"tarlaDayPlans"> };

const allMeals = ["breakfast", "lunch", "snack", "dinner"];

export default function OnboardingPage() {
  const [credentialState, retryCredential] = useDeviceCredential();
  if (credentialState.status === "loading") return <main className={styles.loading}>Opening your setup…</main>;
  if (credentialState.status === "unavailable") return <SessionUnavailable onRetry={retryCredential} />;
  return <OnboardingFlow ownerKey={credentialState.credential} />;
}

function OnboardingFlow({ ownerKey }: { ownerKey: string }) {
  const [step, setStep] = useState<Step>("basics");
  const [householdName, setHouseholdName] = useState("");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata");
  const [members, setMembers] = useState<MemberDraft[]>([newMember()]);
  const [primaryKey, setPrimaryKey] = useState(members[0].clientKey);
  const [cookKey, setCookKey] = useState(members[0].clientKey);
  const [cookSetup, setCookSetup] = useState<CookSetup>({ mode: "member", name: "", phone: "", language: "Hinglish", frequency: "once_daily", consentConfirmed: false });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedIds | null>(null);

  const createHousehold = useMutation(api.vesta.createHousehold);
  const addMember = useMutation(api.vesta.addMember);
  const addCommunicationEndpoint = useMutation(api.vesta.addCommunicationEndpoint);
  const configureCook = useMutation(api.tarlaProfiles.configureCook);
  const configureCookVisits = useMutation(api.tarlaProfiles.configureCookVisits);
  const upsertMemberProfile = useMutation(api.tarlaProfiles.upsertMemberProfile);
  const setNutritionTargets = useMutation(api.tarlaProfiles.setNutritionTargets);
  const estimateMemberNutrition = useMutation(api.tarlaProfiles.estimateMemberNutrition);
  const createFullDayPlan = useMutation(api.tarlaDayPlanning.createFullDayPlan);
  const createdPlan = useQuery(api.tarlaDayPlanning.getDayPlan, created ? { ownerKey, dayPlanId: created.dayPlanId } : "skip");

  function nextBasics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdName.trim()) return setError("Add a household name.");
    setError("");
    setStep("members");
  }

  function nextMembers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const member of members) {
      if (!member.name.trim()) nextErrors[`${member.clientKey}:name`] = "Name is required.";
      if (!member.relationship.trim()) nextErrors[`${member.clientKey}:relationship`] = "Relationship is required.";
      if (!validGoal(member.age)) nextErrors[`${member.clientKey}:age`] = "Enter an age in years.";
      if (!validGoal(member.heightCm)) nextErrors[`${member.clientKey}:heightCm`] = "Enter height in centimetres.";
      if (!validGoal(member.weightKg)) nextErrors[`${member.clientKey}:weightKg`] = "Enter weight in kilograms.";
      if (!member.mealsAtHome.length) nextErrors[`${member.clientKey}:meals`] = "Choose at least one meal at home.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return setError("Complete the highlighted fields before continuing.");
    setError("");
    setStep("roles");
  }

  function addPerson() {
    setMembers((current) => [...current, newMember()]);
  }

  function removePerson(clientKey: string) {
    if (members.length === 1) return;
    const next = members.filter((member) => member.clientKey !== clientKey);
    setMembers(next);
    if (primaryKey === clientKey) setPrimaryKey(next[0].clientKey);
    if (cookKey === clientKey) setCookKey(next[0].clientKey);
  }

  function updatePerson(clientKey: string, patch: Partial<MemberDraft>) {
    setMembers((current) => current.map((member) => member.clientKey === clientKey ? { ...member, ...patch } : member));
  }

  function nextRoles() {
    if (cookSetup.mode === "hired" && (!cookSetup.name.trim() || !cookSetup.phone.trim())) {
      return setError("Add your cook’s name and WhatsApp number.");
    }
    if (cookSetup.mode === "hired" && !cookSetup.consentConfirmed) {
      return setError("Confirm that your cook knows Tarla can message them on WhatsApp.");
    }
    setError("");
    setStep("review");
  }

  async function confirm() {
    if (!primaryKey || !cookKey) return setError("Choose one primary user and one cooking person.");
    setBusy(true);
    setError("");
    try {
      const householdId = await createHousehold({ ownerKey, name: householdName.trim(), timezone });
      const memberIds = await Promise.all(members.map(async (member) => {
        const memberId = await addMember({
          ownerKey, householdId, name: member.name.trim(), relationship: member.relationship.trim(),
          role: memberRole(member, primaryKey, cookKey), lifeStage: member.lifeStage,
          preferredSalutation: member.name.trim(), memberKind: "household", languagePreference: "English",
          age: Number(member.age), sex: member.sex, heightCm: Number(member.heightCm), weightKg: Number(member.weightKg),
        });
        await upsertMemberProfile({
          ownerKey, householdId, memberId, dietaryType: member.dietaryType,
          favouriteFoods: toList(member.favouriteFoods), allergies: toList(member.allergies),
          dislikedFoods: [], avoidedFoods: toList(member.restrictions), limitedFoods: [], mealsAtHome: member.mealsAtHome,
          servingEquivalent: member.lifeStage === "child" ? 0.6 : 1, includedInPlanning: true,
        });
        await estimateMemberNutrition({ ownerKey, householdId, memberId, activityLevel: member.activityLevel, goal: "maintenance" });
        const targets = computedTargets(member);
        await setNutritionTargets({ ownerKey, householdId, memberId, calorieTargetKcal: targets.calorieTargetKcal, proteinTargetG: targets.proteinTargetG, planningGoal: member.dietGoal });
        return memberId;
      }));
      const primaryIndex = members.findIndex((member) => member.clientKey === primaryKey);
      if (cookSetup.mode === "hired") {
        const cookMemberId = await addMember({
          ownerKey, householdId, name: cookSetup.name.trim(), relationship: "Hired cook", role: "cooking person",
          preferredSalutation: cookSetup.name.trim(), memberKind: "external", languagePreference: cookSetup.language,
        });
        const endpointId = await addCommunicationEndpoint({
          ownerKey, householdId, memberId: cookMemberId, channel: "whatsapp", address: cookSetup.phone.trim(),
          preferredLanguage: cookSetup.language, preferredMode: "text", consentStatus: "granted",
        });
        const cookStateId = await configureCook({
          ownerKey, householdId, memberId: cookMemberId, communicationEndpointId: endpointId,
          relationshipType: "hired_cook", visitFrequency: cookSetup.frequency, usualArrivalTime: "09:00", communicationTone: "warm and clear",
        });
        await configureCookVisits({
          ownerKey, cookStateId, frequency: cookSetup.frequency,
          visits: cookSetup.frequency === "twice_daily"
            ? [
                { label: "Morning visit", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], arrivalTime: "09:00", timezone, mealSlots: ["breakfast", "lunch"] },
                { label: "Evening visit", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], arrivalTime: "17:00", timezone, mealSlots: ["snack", "dinner"] },
              ]
            : [{ label: "Daily visit", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], arrivalTime: "09:00", timezone, mealSlots: allMeals }],
        });
      }
      const selectedMeals = allMeals.filter((meal) => members.some((member) => member.mealsAtHome.includes(meal)));
      const plan = await createFullDayPlan({
        ownerKey, householdId, requestedByMemberId: memberIds[primaryIndex], eaterMemberIds: memberIds,
        targetDate: new Date().toISOString().slice(0, 10), mealSlots: selectedMeals,
      });
      setCreated({ householdId, memberIds, dayPlanId: plan.dayPlanId });
      setStep("complete");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t create your first day plan yet.");
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.shell}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>Aevia</Link>
      <div className={styles.progress} aria-label={stepLabel(step)}><span style={{ width: `${progress(step)}%` }} /></div>
      <p>{stepLabel(step)}</p>
    </header>
    <section className={styles.panel}>
      {step === "basics" && <Panel eyebrow="Start here" title="Tell us about your household" supporting="This takes you to a first day plan. Nothing is sent to WhatsApp.">
        <form className={styles.form} onSubmit={nextBasics}>
          <Field label="Household name"><input autoFocus required value={householdName} onChange={(event) => setHouseholdName(event.target.value)} placeholder="For example, the Sharma household" /></Field>
          <Field label="Timezone"><input required value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field>
          <FormError error={error} />
          <div className={styles.actions}><span /><button className={styles.primaryButton}>Continue</button></div>
        </form>
      </Panel>}

      {step === "members" && <Panel eyebrow="People & food" title="Who is eating at home?" supporting="Add each person once, then set the meals, food preferences and nutrition goal that apply to them.">
        <form className={styles.form} onSubmit={nextMembers}>
          <div className={styles.memberList}>{members.map((member, index) => <section className={styles.memberCard} key={member.clientKey}>
            <div className={styles.groupTitle}><span>Member {index + 1}</span>{members.length > 1 && <button type="button" onClick={() => removePerson(member.clientKey)}>Remove</button>}</div>
            <div className={styles.twoColumns}>
              <Field label="Name" error={fieldErrors[`${member.clientKey}:name`]}><input value={member.name} onChange={(event) => updatePerson(member.clientKey, { name: event.target.value })} /></Field>
              <Field label="Relationship" error={fieldErrors[`${member.clientKey}:relationship`]}><input value={member.relationship} onChange={(event) => updatePerson(member.clientKey, { relationship: event.target.value })} placeholder="Self, partner, child" /></Field>
            </div>
            <section className={styles.nutritionSection}><div><h2>Meal approach</h2><p className={styles.helper}>Choose balanced meals or a specific nutrition goal. The daily estimate remains visible at review.</p></div><div className={styles.modeCards}><button type="button" aria-pressed={member.dietGoal === "maintain"} onClick={() => updatePerson(member.clientKey, { dietGoal: "maintain" })}><strong>Balanced meals</strong><span>A steady everyday plan based on this person’s details.</span></button><button type="button" aria-pressed={member.dietGoal !== "maintain"} onClick={() => updatePerson(member.clientKey, { dietGoal: member.dietGoal === "maintain" ? "high_protein" : member.dietGoal })}><strong>Nutrition goal</strong><span>Choose higher protein or a measured calorie reduction.</span></button></div>{member.dietGoal !== "maintain" && <Field label="Nutrition goal"><select value={member.dietGoal} onChange={(event) => updatePerson(member.clientKey, { dietGoal: event.target.value as DietGoal })}><option value="high_protein">Higher protein</option><option value="moderate_deficit">Moderate calorie reduction</option><option value="stronger_deficit">Stronger calorie reduction</option></select></Field>}</section>
            <div className={styles.twoColumns}>
              <Field label="Life stage"><select value={member.lifeStage} onChange={(event) => updatePerson(member.clientKey, { lifeStage: event.target.value as MemberDraft["lifeStage"] })}><option value="adult">Adult</option><option value="child">Child</option><option value="senior">Senior</option></select></Field>
              <Field label="Diet"><select value={member.dietaryType} onChange={(event) => updatePerson(member.clientKey, { dietaryType: event.target.value as DietaryType })}><option value="vegetarian">Vegetarian</option><option value="eggetarian">Eggetarian</option><option value="non_vegetarian">Non-vegetarian</option></select></Field>
            </div>
            <Field label="Favourite foods"><input value={member.favouriteFoods} onChange={(event) => updatePerson(member.clientKey, { favouriteFoods: event.target.value })} placeholder="For example, dal, bhindi, dosa" /></Field>
            <section className={styles.restrictionBox}><p>Important food rules</p><Field label="Allergies"><input value={member.allergies} onChange={(event) => updatePerson(member.clientKey, { allergies: event.target.value })} placeholder="Leave blank if there are none" /></Field><Field label="Foods to avoid"><input value={member.restrictions} onChange={(event) => updatePerson(member.clientKey, { restrictions: event.target.value })} placeholder="For example, no mushrooms this week" /></Field></section>
            <fieldset className={styles.dayPicker}><legend>Meals at home</legend><div>{allMeals.map((meal) => <button type="button" key={meal} aria-pressed={member.mealsAtHome.includes(meal)} onClick={() => updatePerson(member.clientKey, { mealsAtHome: member.mealsAtHome.includes(meal) ? member.mealsAtHome.filter((item) => item !== meal) : [...member.mealsAtHome, meal] })}>{titleCase(meal)}</button>)}</div>{fieldErrors[`${member.clientKey}:meals`] && <small className={styles.error}>{fieldErrors[`${member.clientKey}:meals`]}</small>}</fieldset>
            <div className={styles.threeColumns}>
              <Field label="Age in years" error={fieldErrors[`${member.clientKey}:age`]}><input min="1" type="number" value={member.age} onChange={(event) => updatePerson(member.clientKey, { age: event.target.value })} /></Field>
              <Field label="Height in cm" error={fieldErrors[`${member.clientKey}:heightCm`]}><input min="1" type="number" value={member.heightCm} onChange={(event) => updatePerson(member.clientKey, { heightCm: event.target.value })} /></Field>
              <Field label="Weight in kg" error={fieldErrors[`${member.clientKey}:weightKg`]}><input min="1" type="number" value={member.weightKg} onChange={(event) => updatePerson(member.clientKey, { weightKg: event.target.value })} /></Field>
            </div>
            <div className={styles.twoColumns}>
              <Field label="Sex for the calorie estimate"><select value={member.sex} onChange={(event) => updatePerson(member.clientKey, { sex: event.target.value as MemberDraft["sex"] })}><option value="female">Female</option><option value="male">Male</option></select></Field>
              <Field label="Activity level"><select value={member.activityLevel} onChange={(event) => updatePerson(member.clientKey, { activityLevel: event.target.value as ActivityLevel })}><option value="sedentary">Mostly sitting</option><option value="lightly_active">Lightly active</option><option value="moderately_active">Moderately active</option><option value="very_active">Very active</option><option value="extra_active">Extra active</option></select></Field>
            </div>
          </section>)}</div>
          <button className={styles.addButton} type="button" onClick={addPerson}>+ Add another person</button>
          <FormError error={error} />
          <Actions back={() => setStep("basics")} busy={busy}><button className={styles.primaryButton}>Continue</button></Actions>
        </form>
      </Panel>}

      {step === "roles" && <Panel eyebrow="Tarla setup" title="Who usually prepares meals?" supporting="Choose someone at home, or add a hired cook. WhatsApp is only set up after you confirm they know about it.">
        <div className={styles.form}>
          <fieldset className={styles.selectPeople}><legend className={styles.helper}>Primary user</legend>{members.map((member) => <button key={`primary-${member.clientKey}`} type="button" aria-pressed={primaryKey === member.clientKey} onClick={() => setPrimaryKey(member.clientKey)}><strong>{member.name || "Unnamed member"}</strong><span>{member.relationship || "Household member"}</span><em>{primaryKey === member.clientKey ? "Primary user" : "Choose"}</em></button>)}</fieldset>
          <div className={styles.choiceCards}>
            <button type="button" aria-pressed={cookSetup.mode === "member"} onClick={() => setCookSetup((current) => ({ ...current, mode: "member" }))}><span>Tarla setup</span><strong>Someone at home</strong><p>Keep the plan inside the household.</p><em>{cookSetup.mode === "member" ? "Selected" : "Choose"}</em></button>
            <button type="button" aria-pressed={cookSetup.mode === "hired"} onClick={() => setCookSetup((current) => ({ ...current, mode: "hired" }))}><span>Tarla setup</span><strong>A hired cook</strong><p>Set up a clear WhatsApp route with permission.</p><em>{cookSetup.mode === "hired" ? "Selected" : "Choose"}</em></button>
          </div>
          {cookSetup.mode === "member" ? <fieldset className={styles.selectPeople}><legend className={styles.helper}>Cooking person</legend>{members.map((member) => <button key={`cook-${member.clientKey}`} type="button" aria-pressed={cookKey === member.clientKey} onClick={() => setCookKey(member.clientKey)}><strong>{member.name || "Unnamed member"}</strong><span>{member.relationship || "Household member"}</span><em>{cookKey === member.clientKey ? "Selected" : "Choose"}</em></button>)}</fieldset> : <section className={styles.cookCard}>
            <header><div><span>Cook details</span><strong>Set up the route clearly</strong></div></header>
            <div className={styles.twoColumns}><Field label="Cook’s name"><input value={cookSetup.name} onChange={(event) => setCookSetup((current) => ({ ...current, name: event.target.value }))} placeholder="For example, Pinky didi" /></Field><Field label="WhatsApp number"><input inputMode="tel" value={cookSetup.phone} onChange={(event) => setCookSetup((current) => ({ ...current, phone: event.target.value }))} placeholder="+91…" /></Field></div>
            <div className={styles.twoColumns}><Field label="Preferred language"><select value={cookSetup.language} onChange={(event) => setCookSetup((current) => ({ ...current, language: event.target.value as CookSetup["language"] }))}><option>English</option><option>Hindi</option><option>Hinglish</option></select></Field><Field label="Usually comes"><select value={cookSetup.frequency} onChange={(event) => setCookSetup((current) => ({ ...current, frequency: event.target.value as CookSetup["frequency"] }))}><option value="once_daily">Once a day</option><option value="twice_daily">Twice a day</option></select></Field></div>
            <label className={styles.checkLine}><input type="checkbox" checked={cookSetup.consentConfirmed} onChange={(event) => setCookSetup((current) => ({ ...current, consentConfirmed: event.target.checked }))} />I have told this person that Tarla can message them about the meal plan on WhatsApp.</label>
          </section>}
          <FormError error={error} />
          <Actions back={() => setStep("members")} busy={busy}><button className={styles.primaryButton} type="button" onClick={nextRoles}>Review household</button></Actions>
        </div>
      </Panel>}

      {step === "review" && <Panel eyebrow="Review" title="Check your household before creating the plan" supporting="Confirming creates the household, each member profile, and one full-day plan.">
        <div className={styles.reviewGrid}>
          <section className={styles.reviewSection}><header><h2>{householdName}</h2><button type="button" onClick={() => setStep("basics")}>Edit</button></header><p>{timezone}</p></section>
          <section className={styles.reviewSection}><header><h2>Cooking setup</h2><button type="button" onClick={() => setStep("roles")}>Edit</button></header><p>Primary user: {memberName(members, primaryKey)}</p><p>{cookSetup.mode === "hired" ? `${cookSetup.name || "Your cook"} · hired cook · ${cookSetup.language} · ${cookSetup.frequency === "twice_daily" ? "twice a day" : "once a day"}` : `Family cooking person: ${memberName(members, cookKey)}`}</p></section>
          <section className={styles.reviewSection}><header><h2>People and meal logic</h2><button type="button" onClick={() => setStep("members")}>Edit</button></header><ul>{members.map((member) => { const targets = computedTargets(member); return <li key={member.clientKey}><strong>{member.name}</strong><span>{member.relationship} · {foodLabel(member.dietaryType)} · {goalLabel(member.dietGoal)}</span><small>Meals: {member.mealsAtHome.map(titleCase).join(", ")}<br />Favourites: {member.favouriteFoods || "None added"}<br />Allergies: {member.allergies || "None reported"}<br />Foods to avoid: {member.restrictions || "None added"}<br />Estimated daily target: {targets.calorieTargetKcal} kcal, {targets.proteinTargetG} g protein<br />{nutritionNote(member)}</small></li>; })}</ul></section>
        </div>
        <FormError error={error} />
        <Actions back={() => setStep("roles")} busy={busy}><button className={styles.primaryButton} type="button" disabled={busy} onClick={confirm}>{busy ? "Creating your first plan…" : "Confirm and create my first day plan"}</button></Actions>
      </Panel>}

      {step === "complete" && created && <Panel eyebrow="Your first Tarla plan" title="Your household plan is ready" supporting="This is a starting point based on what you shared. No WhatsApp message was sent from this setup.">
        {createdPlan === undefined ? <div className={styles.loadingCard}>Building your plan…</div> : <><div className={styles.planStack}>{createdPlan?.meals.map((meal) => <section className={styles.mealPlan} key={meal.join._id}><header><span>{titleCase(meal.join.mealSlot)}</span><h2>{meal.calculated.plan.templateName}</h2></header><p>{meal.calculated.plan.items.map((item) => item.recipeName).join(" · ")}</p><div className={styles.portionBlock}><h3>Per-person portions</h3><div>{meal.calculated.plan.memberNutrition.map((portion) => <p key={portion.memberId}><span>{portion.memberName}</span><small>{portion.servingEquivalent} serving · {Math.round(portion.nutrition.caloriesKcal)} kcal</small></p>)}</div></div><div className={styles.kitchenSummary}><p>Kitchen total</p><div><strong>{meal.calculated.plan.totalServingEquivalents} servings</strong><span>{Math.round(meal.calculated.plan.totalNutrition.caloriesKcal)} kcal · {Math.round(meal.calculated.plan.totalNutrition.proteinG)} g protein</span></div></div></section>)}</div><div className={styles.inlineActions}><Link href="/dashboard">Go to household home</Link><button type="button" onClick={() => setStep("review")}>Review setup</button></div></>}
      </Panel>}
    </section>
  </main>;
}

function newMember(): MemberDraft {
  return { clientKey: crypto.randomUUID(), name: "", relationship: "", lifeStage: "adult", dietaryType: "vegetarian", favouriteFoods: "", allergies: "", restrictions: "", mealsAtHome: [...allMeals], age: "", sex: "female", heightCm: "", weightKg: "", activityLevel: "moderately_active", dietGoal: "maintain" };
}

function toList(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function validGoal(value: string) { return Number.isFinite(Number(value)) && Number(value) > 0; }
function computedTargets(member: MemberDraft) {
  const multiplier: Record<ActivityLevel, number> = { sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725, extra_active: 1.9 };
  const bmr = 10 * Number(member.weightKg) + 6.25 * Number(member.heightCm) - 5 * Number(member.age) + (member.sex === "male" ? 5 : -161);
  const calorieMultiplier = member.dietGoal === "moderate_deficit" ? 0.9 : member.dietGoal === "stronger_deficit" ? 0.8 : 1;
  return { calorieTargetKcal: Math.round(bmr * multiplier[member.activityLevel] * calorieMultiplier), proteinTargetG: Math.round(Number(member.weightKg) * (member.dietGoal === "high_protein" ? 1.6 : member.lifeStage === "child" ? 0.95 : 0.8)) };
}
function goalLabel(value: DietGoal) { return ({ maintain: "Balanced meals", moderate_deficit: "Moderate calorie reduction", stronger_deficit: "Stronger calorie reduction", high_protein: "Higher protein" } as const)[value]; }
function foodLabel(value: DietaryType) { return value === "non_vegetarian" ? "Non-vegetarian" : value === "eggetarian" ? "Eggetarian" : "Vegetarian"; }
function nutritionNote(member: MemberDraft) { return member.dietGoal === "high_protein" ? "Protein target uses body weight × 1.6." : "Calories use your age, height, weight and activity; protein uses age-group guidance."; }
function titleCase(value: string) { return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()); }
function memberRole(member: MemberDraft, primaryKey: string, cookKey: string) { const parts = [member.clientKey === primaryKey ? "primary user" : "household member"]; if (member.clientKey === cookKey) parts.push("cook"); return parts.join(" and "); }
function memberName(members: MemberDraft[], clientKey: string) { return members.find((member) => member.clientKey === clientKey)?.name || "Not chosen"; }
function progress(step: Step) { return ({ basics: 20, members: 40, roles: 60, review: 80, complete: 100 } as const)[step]; }
function stepLabel(step: Step) { return ({ basics: "Step 1 of 4", members: "Step 2 of 4", roles: "Step 3 of 4", review: "Step 4 of 4", complete: "Complete" } as const)[step]; }
function Panel({ eyebrow, title, supporting, children }: { eyebrow: string; title: string; supporting: string; children: React.ReactNode }) { return <><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1><p className={styles.supporting}>{supporting}</p>{children}</>; }
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className={styles.field}><span>{label}</span>{children}{error && <small className={styles.error}>{error}</small>}</label>; }
function Actions({ back, busy, children }: { back: () => void; busy: boolean; children: React.ReactNode }) { return <div className={styles.actions}><button className={styles.backButton} type="button" onClick={back} disabled={busy}>Back</button>{children}</div>; }
function FormError({ error }: { error: string }) { return error ? <p className={styles.error}>{error}</p> : null; }
