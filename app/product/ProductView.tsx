"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useDeviceCredential } from "../../lib/aeviaSession";
import { SessionUnavailable } from "../SessionUnavailable";
import { AeviaLogo } from "../AeviaLogo";
import {
  cumulativeHouseholdMeasure,
  formatHouseholdMeasure,
  personHouseholdMeasure,
} from "../../lib/aeviaSetup";
import baseStyles from "./product.module.css";
import finalStyles from "./productFinal.module.css";

const styles = { ...baseStyles, ...finalStyles };

type View = "household" | "mitra" | "tarla";

export function ProductView({ view }: { view: View }) {
  const [credentialState, retryCredential] = useDeviceCredential();
  const ownerKey = credentialState.status === "ready" ? credentialState.credential : undefined;
  const data = useQuery(api.m5.getDashboard, ownerKey ? { ownerKey } : "skip");
  const currentDayPlanId = data?.dayPlans[0]?._id;
  const planDetail = useQuery(
    api.tarlaDayPlanning.getDayPlan,
    ownerKey && currentDayPlanId ? { ownerKey, dayPlanId: currentDayPlanId } : "skip",
  );

  if (credentialState.status === "loading" || (ownerKey && data === undefined)) {
    return <main className={styles.loading}>Opening your household…</main>;
  }
  if (credentialState.status === "unavailable") return <SessionUnavailable onRetry={retryCredential} />;
  if (!data) {
    return <main className={styles.empty}><AeviaLogo /><h1>Your household starts here.</h1><p>Add your people and meal preferences first.</p><Link href="/onboarding">Hello Aevia</Link></main>;
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
        <Link className={styles.editLink} href="/onboarding">Review or edit setup</Link>
      </aside>
      <section className={styles.content}>
        {view === "household" && <>
          <PageHeading eyebrow="Household" title="The people Aevia remembers" text="Names, roles, food needs and communication choices saved for this household." />
          <div className={styles.memberGrid}>{data.members.map((member) => {
            const food = data.tarlaProfiles.find((profile) => profile.memberId === member._id);
            return <article className={styles.personCard} key={member._id}><div className={styles.avatar}>{member.name.charAt(0).toUpperCase()}</div><div><h2>{member.name}</h2><p>{member.relationship || friendlyRole(member.role)}</p></div><span>{lifeStage(member.lifeStage)}</span><dl><div><dt>Food</dt><dd>{food ? foodLabel(food.dietaryType) : "Not added"}</dd></div><div><dt>Meals at home</dt><dd>{food?.mealsAtHome.length ? food.mealsAtHome.map(titleCase).join(", ") : "Not added"}</dd></div><div><dt>Allergies</dt><dd>{food?.allergies.length ? food.allergies.join(", ") : "None reported"}</dd></div></dl></article>;
          })}</div>
          <Link className={styles.primaryAction} href="/onboarding?edit=household">Add household member</Link>
        </>}

        {view === "mitra" && <>
          <section className={styles.presenceHero}><p>● Active presence</p><h1>Good {dayPart()}, {data.profile.name}.</h1><span>{activeRoutines.length ? `${activeRoutines.length} agreed ${activeRoutines.length === 1 ? "routine is" : "routines are"} active.` : "No Mitra routines are active yet."}</span></section>
          <div className={styles.mitraWorkspace}><section className={styles.presencePanel}><header><div><p className={styles.kicker}>Mitra</p><h2>Everyday routines</h2></div><span>{activeRoutines.length} active</span></header><div className={styles.stack}>{activeRoutines.length ? activeRoutines.map((routine) => {
            const person = routine.memberId ? memberMap.get(String(routine.memberId)) : undefined;
            const checkIn = data.latestInstances.find((item) => item.routineId === routine._id)?.instance;
            return <article className={styles.routineCard} key={routine._id}><div className={styles.icon}>M</div><div><p className={styles.kicker}>{person?.preferredSalutation || person?.name || "Household member"}</p><h2>{routine.label || routine.type}</h2><p>{routine.frequency} · {routine.schedule?.time || "Time saved"}</p>{routine.notes && <small>{routine.notes}</small>}</div><span>{checkIn ? honestState(checkIn.status, person?.name) : "Scheduled"}</span></article>;
          }) : <EmptyCard title="No Mitra routine yet" text="Add a household member and an agreed routine when you are ready." />}</div></section><section className={styles.presencePanel}><header><div><p className={styles.kicker}>Recent follow-through</p><h2>What people reported</h2></div></header><div className={styles.reportList}>{data.latestInstances.filter((entry) => entry.instance).slice(0, 5).map((entry) => { const routine = activeRoutines.find((item) => item._id === entry.routineId); const person = routine?.memberId ? memberMap.get(String(routine.memberId)) : undefined; return <article key={entry.routineId}><strong>{routine?.label || "Routine"}</strong><p>{entry.instance?.primaryUserSummary || "A reply has not been recorded yet."}</p><span>{honestState(entry.instance!.status, person?.preferredSalutation || person?.name)}</span></article>; })}{!data.latestInstances.some((entry) => entry.instance) && <p className={styles.emptyReport}>Real replies and outcomes will appear here.</p>}</div></section></div>
          <Link className={styles.primaryAction} href="/onboarding?edit=mitra">Edit Mitra setup</Link>
        </>}

        {view === "tarla" && <>
          <PageHeading eyebrow="Tarla" title="Today’s household meal plan" text="The same plan is shown as individual portions and kitchen-wide totals." />
          <section className={styles.planHeader}><div><p className={styles.kicker}>Current plan</p><h2>{latestPlan ? formatDate(latestPlan.targetDate) : "No plan created yet"}</h2><p>{latestPlan ? latestPlan.mealSlots.map(titleCase).join(" · ") : "Complete setup to create a full-day plan."}</p></div><span>{latestPlan ? planState(latestPlan.status) : "Not started"}</span></section>
          {latestPlan && planDetail && <div className={styles.tarlaWorkspace}><div className={styles.mealStack}>{planDetail.meals.map((meal) => <article className={styles.mealDetail} key={meal.join._id}><header><span>{titleCase(meal.join.mealSlot)}</span><h2>{meal.mealPlan.selectedTemplateName}</h2></header>{meal.calculated.plan.items.map((item) => <section key={item.recipeId}><h3>{item.recipeName}</h3>{item.memberPortions.map((portion) => <p key={portion.memberId}><strong>{portion.memberName}</strong><span>{formatHouseholdMeasure(personHouseholdMeasure(item.recipeId, portion.servingEquivalent))}</span></p>)}</section>)}</article>)}</div><article className={styles.kitchenDirective}><p className={styles.kicker}>For the kitchen</p><h2>Household totals</h2>{planDetail.meals.map((meal) => <section key={meal.join._id}><strong>{titleCase(meal.join.mealSlot)}</strong>{meal.calculated.plan.items.map((item) => <p key={item.recipeId}>{item.recipeName} · {formatHouseholdMeasure(cumulativeHouseholdMeasure(item.recipeId, item.memberPortions.map((portion) => portion.servingEquivalent)))}</p>)}</section>)}<dl><div><dt>Cooking person</dt><dd>{cookMember?.preferredSalutation || cookMember?.name || "Someone at home"}</dd></div><div><dt>Schedule</dt><dd>{cook ? visitFrequency(cook.visitFrequency) : "Not added"}</dd></div></dl></article></div>}
          {latestPlan?.status === "awaiting_approval" && <Link className={styles.approvalAction} href="/onboarding">Review and approve plan</Link>}
          <section className={styles.rules}><div><p className={styles.kicker}>Food rules</p><h2>What this plan respects</h2></div>{data.tarlaProfiles.map((profile) => { const person = memberMap.get(String(profile.memberId)); return <article key={profile._id}><strong>{person?.name || "Household member"}</strong><p>{foodLabel(profile.dietaryType)} · {goalLabel(profile.planningGoal)}</p><small>{profile.allergies.length ? `Avoid: ${profile.allergies.join(", ")}` : "No allergies reported"}</small></article>; })}</section>
          <Link className={styles.primaryAction} href="/onboarding?edit=tarla">Edit Tarla setup</Link>
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
function dayPart() { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"; }
