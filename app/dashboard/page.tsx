"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { useDeviceCredential } from "../../lib/aeviaSession";
import { useProductAnalytics } from "../../lib/productAnalytics";
import { SessionUnavailable } from "../SessionUnavailable";
import styles from "./dashboard.module.css";

export default function DashboardPage() {
  const [credentialState, retryCredential] = useDeviceCredential();
  const ownerKey = credentialState.status === "ready" ? credentialState.credential : undefined;
  const data = useQuery(api.m5.getDashboard, ownerKey ? { ownerKey } : "skip");
  const track = useProductAnalytics();
  const tracked = useRef(false);

  useEffect(() => {
    if (!data || tracked.current) return;
    tracked.current = true;
    void track("dashboard_viewed", { householdId: data.household._id, route: "/dashboard" });
  }, [data, track]);

  if (credentialState.status === "loading" || (ownerKey && data === undefined)) {
    return <main className={styles.loading}>Opening your household…</main>;
  }
  if (credentialState.status === "unavailable") return <SessionUnavailable onRetry={retryCredential} />;
  if (!data) {
    return <main className={styles.emptyPage}><span>A</span><h1>Your Aevia setup starts here.</h1><p>This browser does not have a closed-beta household yet.</p><Link href="/onboarding">Hello Aevia</Link></main>;
  }

  const activeRoutines = [...data.routines]
    .filter((routine) => routine.w2Enabled)
    .sort((left, right) => (left.nextOccurrenceAt ?? Infinity) - (right.nextOccurrenceAt ?? Infinity));
  const latestPlan = data.dayPlans[0];
  const failedRuns = data.runs.filter((run) => run.status === "failed");
  const memberMap = new Map(data.members.map((member) => [String(member._id), member]));
  const activeMitraMembers = new Set(activeRoutines.map((routine) => String(routine.memberId)));
  const tarlaMemberIds = new Set(data.tarlaProfiles.map((profile) => String(profile.memberId)));
  const memories = visibleMemories(data);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>Aevia</Link>
        <nav><a href="#today">Home</a><Link href="/onboarding?edit=mitra">Mitra</Link><Link href="/onboarding?edit=tarla">Tarla</Link><Link href="/onboarding?edit=household">Household</Link></nav>
        <p>Closed beta</p>
      </header>

      <section className={styles.welcome} id="today">
        <p className={styles.eyebrow}>{data.household.name}</p>
        <h1>Your home, today</h1>
        <p>Aevia is taking care of the follow-through.</p>
      </section>

      <section className={styles.assistants}>
        <div className={styles.sectionTitle}><p>Taking care of</p><span>{activeRoutines.length + (latestPlan ? 1 : 0)} saved</span></div>
        <div className={styles.assistantGrid}>
          {activeRoutines.slice(0, 3).map((routine) => {
            const member = routine.memberId ? memberMap.get(String(routine.memberId)) : undefined;
            const latest = data.latestInstances.find((item) => item.routineId === routine._id)?.instance;
            return <article key={routine._id}><div className={styles.assistantIcon}>M</div><div><span>Mitra</span><h2>{member ? `${member.preferredSalutation || member.name}'s ${routine.label ?? "routine"}` : routine.label}</h2><p>{routine.nextOccurrenceAt ? formatTimestamp(routine.nextOccurrenceAt, data.household.timezone) : "Schedule saved"}</p>{routine.notes && <small>{routine.notes}</small>}</div><strong>{latest ? honestMitraState(latest.status, member?.preferredSalutation || member?.name) : "Scheduled"}</strong></article>;
          })}
          {latestPlan && <article><div className={[styles.assistantIcon, styles.tarlaIcon].join(" ")}>T</div><div><span>Tarla</span><h2>Meals for {formatDate(latestPlan.targetDate)}</h2><p>{latestPlan.mealSlots.join(" · ")}</p></div><strong>{latestPlan.status === "scheduled" || latestPlan.status === "approved" ? "Plan approved" : friendlyState(latestPlan.status)}</strong></article>}
          {!activeRoutines.length && !latestPlan && <article className={styles.addCard}><div className={styles.assistantIcon}>A</div><div><span>Aevia</span><h2>No active work yet</h2><p>Your saved setup is ready. Work will appear here when it is scheduled.</p></div></article>}
        </div>
      </section>

      <section className={styles.nextGrid}>
        <article className={styles.nextCard}><p className={styles.eyebrow}>Needs you</p>{failedRuns.length ? <><h2>{failedRuns.length} item{failedRuns.length === 1 ? "" : "s"} need review</h2><p>Aevia could not finish these, so they have not been marked complete.</p></> : <><h2>Nothing right now.</h2><p>Aevia will ask when something needs your decision.</p></>}</article>
        <article className={styles.nextCard}><p className={styles.eyebrow}>Coming up</p>{activeRoutines[0]?.nextOccurrenceAt ? <><h2>{activeRoutines[0].label}</h2><p>{formatTimestamp(activeRoutines[0].nextOccurrenceAt, data.household.timezone)}</p></> : latestPlan ? <><h2>Next meal plan</h2><p>{formatDate(latestPlan.targetDate)}</p></> : <><h2>No scheduled work</h2><p>Add or edit a specialist when you are ready.</p></>}</article>
      </section>

      <div className={styles.lowerGrid}>
        <section className={styles.activity}>
          <div className={styles.sectionTitle}><p>Household at a glance</p><Link href="/onboarding?edit=household">Manage household</Link></div>
          <div className={styles.householdList}>{data.members.filter((member) => member.memberKind !== "external").map((member) => <article key={member._id}><div><strong>{member.name}</strong><p>{member.relationship ?? member.role} · {capitalize(member.lifeStage ?? "adult")}</p></div><span>{activeMitraMembers.has(String(member._id)) ? "Mitra active" : tarlaMemberIds.has(String(member._id)) ? "Tarla meal planning" : member._id === data.primaryMember?._id ? "You" : "Household"}</span></article>)}</div>
        </section>
        <aside className={styles.sideColumn}>
          <section className={styles.exceptionCard}><p className={styles.eyebrow}>Specialists</p><h2>{activeRoutines.length ? `Mitra · ${activeRoutines.length} routine${activeRoutines.length === 1 ? "" : "s"}` : "Mitra · not active"}</h2><Link href="/onboarding?edit=mitra">Edit Mitra</Link><h2>{data.tarlaProfiles.length ? `Tarla · ${data.tarlaProfiles.length} people` : "Tarla · not active"}</h2><Link href="/onboarding?edit=tarla">Edit Tarla</Link></section>
          <section className={styles.memoryCard}><p className={styles.eyebrow}>What Aevia knows</p><h2>Your shared household context</h2>{memories.length ? <ul>{memories.slice(0, 7).map((item) => <li key={item}>{item}</li>)}</ul> : <p>Context you add during setup will appear here.</p>}<small>This is saved information you can review and correct. Aevia is not claiming it inferred anything else.</small></section>
        </aside>
      </div>

      <footer className={styles.footer}><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/beta">Beta status</Link><span>Policies accepted {new Date(data.profile.acceptedAt).toLocaleDateString()}</span></footer>
    </main>
  );
}

function visibleMemories(data: NonNullable<FunctionReturnType<typeof api.m5.getDashboard>>) {
  const results: string[] = [];
  for (const member of data.members) {
    if (member.preferredSalutation && member.languagePreference && member.role !== "primary user") results.push(`${member.preferredSalutation} prefers ${member.languagePreference}.`);
  }
  for (const preference of data.preferences) {
    if (preference.category === "household_context") results.push(preference.value);
    if (preference.key === "cuisines") results.push(`Household cuisines: ${preference.value}.`);
    if (preference.key === "hard_restrictions" && preference.value) results.push(`Important food restrictions: ${preference.value}.`);
  }
  for (const rule of data.tarlaRules) results.push(rule.description);
  for (const visit of data.cookVisits) results.push(`${visit.label} · ${to12Hour(visit.arrivalTime)}.`);
  return [...new Set(results)];
}

function to12Hour(value: string) { const [hours, minutes] = value.split(":").map(Number); return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`; }
function formatTimestamp(value: number, timezone: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function friendlyState(value: string) { return value.replaceAll("_", " ").toLocaleLowerCase().replace(/^\w/, (letter) => letter.toUpperCase()); }
function honestMitraState(value: string, name?: string) { if (["CONFIRMED", "OK"].includes(value)) return name ? `${name} said it was done` : "Reported done"; if (value === "NO_RESPONSE") return "No reply"; return friendlyState(value); }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
