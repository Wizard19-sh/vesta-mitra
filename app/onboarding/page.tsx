"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useDeviceCredential } from "../../lib/aeviaSession";
import { SessionUnavailable } from "../SessionUnavailable";
import styles from "./onboarding.module.css";

type Step = "basics" | "members" | "roles" | "review" | "complete";
type DietaryType = "vegetarian" | "eggetarian" | "non_vegetarian";

type MemberDraft = {
  clientKey: string;
  name: string;
  relationship: string;
  lifeStage: "adult" | "child" | "senior";
  dietaryType: DietaryType;
  favouriteFoods: string;
  allergies: string;
  calorieTargetKcal: string;
  proteinTargetG: string;
};

type CreatedIds = { householdId: string; memberIds: string[]; dayPlanId: string };

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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedIds | null>(null);

  const createHousehold = useMutation(api.vesta.createHousehold);
  const addMember = useMutation(api.vesta.addMember);
  const upsertMemberProfile = useMutation(api.tarlaProfiles.upsertMemberProfile);
  const setNutritionTargets = useMutation(api.tarlaProfiles.setNutritionTargets);
  const createFullDayPlan = useMutation(api.tarlaDayPlanning.createFullDayPlan);

  function nextBasics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!householdName.trim()) return setError("Add a household name.");
    setError("");
    setStep("members");
  }

  function nextMembers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!members.length || members.some((member) => !member.name.trim() || !member.relationship.trim())) return setError("Add a name and relationship for every household member.");
    if (members.some((member) => !validGoal(member.calorieTargetKcal) || !validGoal(member.proteinTargetG))) return setError("Enter positive calorie and protein goals for every member.");
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
        });
        await upsertMemberProfile({
          ownerKey, householdId, memberId, dietaryType: member.dietaryType,
          favouriteFoods: toList(member.favouriteFoods), allergies: toList(member.allergies),
          dislikedFoods: [], avoidedFoods: [], limitedFoods: [], mealsAtHome: allMeals,
          servingEquivalent: member.lifeStage === "child" ? 0.6 : 1, includedInPlanning: true,
        });
        await setNutritionTargets({
          ownerKey, householdId, memberId, calorieTargetKcal: Number(member.calorieTargetKcal),
          proteinTargetG: Number(member.proteinTargetG),
        });
        return memberId;
      }));
      const primaryIndex = members.findIndex((member) => member.clientKey === primaryKey);
      const plan = await createFullDayPlan({
        ownerKey, householdId, requestedByMemberId: memberIds[primaryIndex], eaterMemberIds: memberIds,
        targetDate: new Date().toISOString().slice(0, 10), mealSlots: allMeals,
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

      {step === "members" && <Panel eyebrow="Household members" title="Add everyone eating from this plan" supporting="Set food preferences, allergies, and daily nutrition goals for each person.">
        <form className={styles.form} onSubmit={nextMembers}>
          <div className={styles.memberList}>{members.map((member, index) => <section className={styles.memberCard} key={member.clientKey}>
            <div className={styles.groupTitle}><span>Member {index + 1}</span>{members.length > 1 && <button type="button" onClick={() => removePerson(member.clientKey)}>Remove</button>}</div>
            <div className={styles.twoColumns}>
              <Field label="Name"><input required value={member.name} onChange={(event) => updatePerson(member.clientKey, { name: event.target.value })} /></Field>
              <Field label="Relationship"><input required value={member.relationship} onChange={(event) => updatePerson(member.clientKey, { relationship: event.target.value })} placeholder="Self, partner, child" /></Field>
            </div>
            <div className={styles.twoColumns}>
              <Field label="Life stage"><select value={member.lifeStage} onChange={(event) => updatePerson(member.clientKey, { lifeStage: event.target.value as MemberDraft["lifeStage"] })}><option value="adult">Adult</option><option value="child">Child</option><option value="senior">Senior</option></select></Field>
              <Field label="Diet"><select value={member.dietaryType} onChange={(event) => updatePerson(member.clientKey, { dietaryType: event.target.value as DietaryType })}><option value="vegetarian">Vegetarian</option><option value="eggetarian">Eggetarian</option><option value="non_vegetarian">Non-vegetarian</option></select></Field>
            </div>
            <Field label="Favourite foods"><input value={member.favouriteFoods} onChange={(event) => updatePerson(member.clientKey, { favouriteFoods: event.target.value })} placeholder="For example, dal, bhindi, dosa" /></Field>
            <Field label="Allergies"><input value={member.allergies} onChange={(event) => updatePerson(member.clientKey, { allergies: event.target.value })} placeholder="Leave blank if there are none" /></Field>
            <div className={styles.twoColumns}>
              <Field label="Daily calories"><input required min="1" type="number" value={member.calorieTargetKcal} onChange={(event) => updatePerson(member.clientKey, { calorieTargetKcal: event.target.value })} /></Field>
              <Field label="Daily protein (g)"><input required min="1" type="number" value={member.proteinTargetG} onChange={(event) => updatePerson(member.clientKey, { proteinTargetG: event.target.value })} /></Field>
            </div>
          </section>)}</div>
          <button className={styles.addButton} type="button" onClick={addPerson}>+ Add another person</button>
          <FormError error={error} />
          <Actions back={() => setStep("basics")} busy={busy}><button className={styles.primaryButton}>Continue</button></Actions>
        </form>
      </Panel>}

      {step === "roles" && <Panel eyebrow="Household roles" title="Who is the primary user and who cooks?" supporting="These labels are saved with the household. This setup does not create or send cook messages.">
        <div className={styles.form}>
          <fieldset className={styles.selectPeople}><legend className={styles.helper}>Primary user</legend>{members.map((member) => <button key={`primary-${member.clientKey}`} type="button" aria-pressed={primaryKey === member.clientKey} onClick={() => setPrimaryKey(member.clientKey)}><strong>{member.name || "Unnamed member"}</strong><span>{member.relationship || "Household member"}</span><em>{primaryKey === member.clientKey ? "Primary user" : "Choose"}</em></button>)}</fieldset>
          <fieldset className={styles.selectPeople}><legend className={styles.helper}>Cooking person</legend>{members.map((member) => <button key={`cook-${member.clientKey}`} type="button" aria-pressed={cookKey === member.clientKey} onClick={() => setCookKey(member.clientKey)}><strong>{member.name || "Unnamed member"}</strong><span>{member.relationship || "Household member"}</span><em>{cookKey === member.clientKey ? "Cooking person" : "Choose"}</em></button>)}</fieldset>
          <FormError error={error} />
          <Actions back={() => setStep("members")} busy={busy}><button className={styles.primaryButton} type="button" onClick={() => { setError(""); setStep("review"); }}>Review household</button></Actions>
        </div>
      </Panel>}

      {step === "review" && <Panel eyebrow="Review" title="Check your household before creating the plan" supporting="Confirming creates the household, each member profile, and one full-day plan.">
        <div className={styles.reviewGrid}>
          <section className={styles.reviewSection}><h2>{householdName}</h2><p>{timezone}</p></section>
          <section className={styles.reviewSection}><h2>Roles</h2><p>Primary user: {memberName(members, primaryKey)}</p><p>Cooking person: {memberName(members, cookKey)}</p></section>
          <section className={styles.reviewSection}><h2>Members</h2><ul>{members.map((member) => <li key={member.clientKey}><strong>{member.name}</strong><span>{member.relationship} · {member.dietaryType.replace("_", " ")}</span><small>Favourites: {member.favouriteFoods || "None added"}<br />Allergies: {member.allergies || "None reported"}<br />Goals: {member.calorieTargetKcal} kcal, {member.proteinTargetG} g protein</small></li>)}</ul></section>
        </div>
        <FormError error={error} />
        <Actions back={() => setStep("roles")} busy={busy}><button className={styles.primaryButton} type="button" disabled={busy} onClick={confirm}>{busy ? "Creating your first plan…" : "Confirm and create my first day plan"}</button></Actions>
      </Panel>}

      {step === "complete" && created && <Panel eyebrow="Your first plan" title="Your household and first day plan are ready" supporting="The plan is waiting for review. No WhatsApp message was sent.">
        <div className={styles.reviewSection}><p><strong>Household ID</strong><br />{created.householdId}</p><p><strong>Member IDs</strong><br />{created.memberIds.join(", ")}</p><p><strong>Day plan ID</strong><br />{created.dayPlanId}</p></div>
      </Panel>}
    </section>
  </main>;
}

function newMember(): MemberDraft {
  return { clientKey: crypto.randomUUID(), name: "", relationship: "", lifeStage: "adult", dietaryType: "vegetarian", favouriteFoods: "", allergies: "", calorieTargetKcal: "2000", proteinTargetG: "75" };
}

function toList(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function validGoal(value: string) { return Number.isFinite(Number(value)) && Number(value) > 0; }
function memberRole(member: MemberDraft, primaryKey: string, cookKey: string) { const parts = [member.clientKey === primaryKey ? "primary user" : "household member"]; if (member.clientKey === cookKey) parts.push("cook"); return parts.join(" and "); }
function memberName(members: MemberDraft[], clientKey: string) { return members.find((member) => member.clientKey === clientKey)?.name || "Not chosen"; }
function progress(step: Step) { return ({ basics: 20, members: 40, roles: 60, review: 80, complete: 100 } as const)[step]; }
function stepLabel(step: Step) { return ({ basics: "Step 1 of 4", members: "Step 2 of 4", roles: "Step 3 of 4", review: "Step 4 of 4", complete: "Complete" } as const)[step]; }
function Panel({ eyebrow, title, supporting, children }: { eyebrow: string; title: string; supporting: string; children: React.ReactNode }) { return <><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1><p className={styles.supporting}>{supporting}</p>{children}</>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className={styles.field}><span>{label}</span>{children}</label>; }
function Actions({ back, busy, children }: { back: () => void; busy: boolean; children: React.ReactNode }) { return <div className={styles.actions}><button className={styles.backButton} type="button" onClick={back} disabled={busy}>Back</button>{children}</div>; }
function FormError({ error }: { error: string }) { return error ? <p className={styles.error}>{error}</p> : null; }
