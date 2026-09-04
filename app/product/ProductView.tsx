"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useDeviceCredential } from "../../lib/aeviaSession";
import { SessionUnavailable } from "../SessionUnavailable";
import { AeviaLogo } from "../AeviaLogo";
import styles from "./product.module.css";

type View = "household" | "mitra" | "tarla";

export function ProductView({ view }: { view: View }) {
  const [credentialState, retryCredential] = useDeviceCredential();
  const ownerKey = credentialState.status === "ready" ? credentialState.credential : undefined;
  const data = useQuery(api.m5.getDashboard, ownerKey ? { ownerKey } : "skip");

  if (credentialState.status === "loading" || (ownerKey && data === undefined)) {
    return <main className={styles.loading}>Opening your household…</main>;
  }
  if (credentialState.status === "unavailable") return <SessionUnavailable onRetry={retryCredential} />;
  if (!data) {
    return <main className={styles.empty}><span>A</span><h1>Your household starts here.</h1><p>Add your people and meal preferences first.</p><Link href="/onboarding">Hello Aevia</Link></main>;
  }

  const memberMap = new Map(data.members.map((member) => [String(member._id), member]));
  const activeRoutines = data.routines.filter((routine) => routine.w2Enabled);
  const latestPlan = data.dayPlans[0];
  const cook = data.cookStates[0];
  const cookMember = cook ? memberMap.get(String(cook.memberId)) : undefined;

  return <main className={styles.shell}>
    <header className={styles.topbar}>
      <AeviaLogo compact href="/dashboard" />
      <nav aria-label="Household navigation"><Link href="/dashboard">Home</Link><Link className={view === "household" ? styles.active : ""} href="/household">Household</Link><Link className={view === "mitra" ? styles.active : ""} href="/mitra">Mitra</Link><Link className={view === "tarla" ? styles.active : ""} href="/tarla">Tarla</Link></nav>
      <p>Closed beta</p>
    </header>
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <p>Your household</p>
        <strong>{data.household.name}</strong>
        <nav><Link className={view === "household" ? styles.current : ""} href="/household">People &amp; roles</Link><Link className={view === "mitra" ? styles.current : ""} href="/mitra">Mitra routines</Link><Link className={view === "tarla" ? styles.current : ""} href="/tarla">Tarla meals</Link></nav>
        <Link className={styles.editLink} href="/onboarding">Edit setup</Link>
      </aside>
      <section className={styles.content}>
        {view === "household" && <>
          <PageHeading eyebrow="Household" title="The people Aevia remembers" text="Names, roles, food needs and communication choices saved for this household." />
          <div className={styles.memberGrid}>{data.members.map((member) => {
            const food = data.tarlaProfiles.find((profile) => profile.memberId === member._id);
            return <article className={styles.personCard} key={member._id}><div className={styles.avatar}>{member.name.charAt(0).toUpperCase()}</div><div><h2>{member.name}</h2><p>{member.relationship || friendlyRole(member.role)}</p></div><span>{lifeStage(member.lifeStage)}</span><dl><div><dt>Food</dt><dd>{food ? foodLabel(food.dietaryType) : "Not added"}</dd></div><div><dt>Meals at home</dt><dd>{food?.mealsAtHome.length ? food.mealsAtHome.map(titleCase).join(", ") : "Not added"}</dd></div><div><dt>Allergies</dt><dd>{food?.allergies.length ? food.allergies.join(", ") : "None reported"}</dd></div></dl></article>;
          })}</div>
          <Link className={styles.primaryAction} href="/onboarding">Add household member</Link>
        </>}

        {view === "mitra" && <>
          <PageHeading eyebrow="Mitra" title="Everyday routines, with honest follow-through" text="Mitra keeps agreed routines moving and records what the person actually says." />
          <section className={styles.heroCard}><div><p className={styles.kicker}>Active routines</p><strong>{activeRoutines.length}</strong><span>{activeRoutines.length === 1 ? "routine is set up" : "routines are set up"}</span></div><div><p className={styles.kicker}>Needs your attention</p><strong>{data.exceptions.filter((item) => ["pending_approval", "needs_review"].includes(item.status)).length}</strong><span>changes are waiting for a decision</span></div></section>
          <div className={styles.stack}>{activeRoutines.length ? activeRoutines.map((routine) => {
            const person = routine.memberId ? memberMap.get(String(routine.memberId)) : undefined;
            const checkIn = data.latestInstances.find((item) => item.routineId === routine._id)?.instance;
            return <article className={styles.routineCard} key={routine._id}><div className={styles.icon}>M</div><div><p className={styles.kicker}>{person?.preferredSalutation || person?.name || "Household member"}</p><h2>{routine.label || routine.type}</h2><p>{routine.frequency} · {routine.schedule?.time || "Time saved"}</p>{routine.notes && <small>{routine.notes}</small>}</div><span>{checkIn ? honestState(checkIn.status, person?.name) : "Scheduled"}</span></article>;
          }) : <EmptyCard title="No Mitra routine yet" text="Add a household member and an agreed routine when you are ready." />}</div>
          <Link className={styles.primaryAction} href="/onboarding">Edit Mitra setup</Link>
        </>}

        {view === "tarla" && <>
          <PageHeading eyebrow="Tarla" title="Today’s household meal plan" text="The same plan is shown as individual portions and kitchen-wide totals." />
          <section className={styles.planHeader}><div><p className={styles.kicker}>Current plan</p><h2>{latestPlan ? formatDate(latestPlan.targetDate) : "No plan created yet"}</h2><p>{latestPlan ? latestPlan.mealSlots.map(titleCase).join(" · ") : "Complete setup to create a full-day plan."}</p></div><span>{latestPlan ? planState(latestPlan.status) : "Not started"}</span></section>
          {latestPlan && <div className={styles.planGrid}><article><p className={styles.kicker}>Per-person portions</p>{latestPlan.memberDailyNutrition.map((person) => <div className={styles.nutritionRow} key={person.memberName}><div><strong>{person.memberName}</strong><span>{person.meals.length} meals</span></div><p>{Math.round(person.total.caloriesKcal)} kcal · {Math.round(person.total.proteinG)} g protein</p></div>)}</article><article className={styles.kitchenCard}><p className={styles.kicker}>Kitchen totals</p><h2>{Math.round(latestPlan.totalNutrition.caloriesKcal)} kcal</h2><p>{Math.round(latestPlan.totalNutrition.proteinG)} g protein across the household plan</p><dl><div><dt>Cooking person</dt><dd>{cookMember?.preferredSalutation || cookMember?.name || "Someone at home"}</dd></div><div><dt>Visit pattern</dt><dd>{cook ? visitFrequency(cook.visitFrequency) : "Not added"}</dd></div></dl></article></div>}
          <section className={styles.rules}><div><p className={styles.kicker}>Food rules</p><h2>What this plan respects</h2></div>{data.tarlaProfiles.map((profile) => { const person = memberMap.get(String(profile.memberId)); return <article key={profile._id}><strong>{person?.name || "Household member"}</strong><p>{foodLabel(profile.dietaryType)} · {goalLabel(profile.planningGoal)}</p><small>{profile.allergies.length ? `Avoid: ${profile.allergies.join(", ")}` : "No allergies reported"}</small></article>; })}</section>
          <Link className={styles.primaryAction} href="/onboarding">Edit Tarla setup</Link>
        </>}
      </section>
    </div>
  </main>;
}

function PageHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <header className={styles.heading}><p>{eyebrow}</p><h1>{title}</h1><span>{text}</span></header>; }
function EmptyCard({ title, text }: { title: string; text: string }) { return <article className={styles.emptyCard}><h2>{title}</h2><p>{text}</p></article>; }
function titleCase(value: string) { return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()); }
function friendlyRole(value: string) { return titleCase(value.replace(" and cook", " · cooking person")); }
function lifeStage(value?: string) { return value ? titleCase(value) : "Household member"; }
function foodLabel(value: string) { return value === "non_vegetarian" ? "Non-vegetarian" : value === "eggetarian" ? "Eggetarian" : "Vegetarian"; }
function goalLabel(value?: string) { return ({ balanced: "Balanced meals", maintain: "Balanced meals", moderate_deficit: "Moderate calorie reduction", stronger_deficit: "Stronger calorie reduction", high_protein: "Higher protein" } as Record<string, string>)[value || "balanced"] || "Balanced meals"; }
function visitFrequency(value?: string) { return value === "twice_daily" ? "Twice a day" : value === "once_daily" ? "Once a day" : value === "custom" ? "Custom schedule" : "Not added"; }
function honestState(value: string, name?: string) { if (["CONFIRMED", "OK"].includes(value)) return name ? `${name} said it was done` : "Reported done"; if (value === "NO_RESPONSE") return "No reply"; if (value === "NEEDS_ATTENTION") return "Needs attention"; return titleCase(value.toLowerCase()); }
function planState(value: string) { if (value === "awaiting_approval") return "Ready to review"; if (value === "scheduled") return "Scheduled"; if (value === "approved") return "Approved"; return titleCase(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
