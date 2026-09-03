"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useDeviceCredential } from "../../lib/aeviaSession";
import { useProductAnalytics } from "../../lib/productAnalytics";
import { SessionUnavailable } from "../SessionUnavailable";
import styles from "./dashboard.module.css";

export default function DashboardPage() {
  const [credentialState, retryCredential] = useDeviceCredential();
  const ownerKey =
    credentialState.status === "ready"
      ? credentialState.credential
      : undefined;
  const data = useQuery(api.m5.getDashboard, ownerKey ? { ownerKey } : "skip");
  const track = useProductAnalytics();
  const tracked = useRef(false);

  useEffect(() => {
    if (!data || tracked.current) return;
    tracked.current = true;
    void track("dashboard_viewed", {
      householdId: data.household._id,
      route: "/dashboard",
    });
  }, [data, track]);

  if (
    credentialState.status === "loading" ||
    (credentialState.status === "ready" && data === undefined)
  ) {
    return <main className={styles.loading}>Opening your household…</main>;
  }
  if (credentialState.status === "unavailable") {
    return <SessionUnavailable onRetry={retryCredential} />;
  }
  if (!data) {
    return (
      <main className={styles.emptyPage}>
        <span>A</span>
        <h1>Your Aevia setup starts here.</h1>
        <p>This browser does not have a closed-beta household yet.</p>
        <Link href="/onboarding">Meet Aevia</Link>
      </main>
    );
  }

  const mitraRoutine = [...data.routines]
    .filter((routine) => routine.w2Enabled)
    .sort((left, right) => (left.nextOccurrenceAt ?? Infinity) - (right.nextOccurrenceAt ?? Infinity))[0];
  const latestPlan = data.dayPlans[0];
  const failedRuns = data.runs.filter((run) => run.status === "failed");
  const mitraInstance = mitraRoutine
    ? data.latestInstances.find((item) => item.routineId === mitraRoutine._id)?.instance
    : undefined;
  const memories = visibleMemories(data.preferences, data.members, data.cookVisits);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}><span>A</span>Aevia</Link>
        <nav>
          <Link href="/onboarding">Add or update setup</Link>
          <Link href="/admin/runs">Agent runs</Link>
        </nav>
        <p>Closed beta</p>
      </header>

      <section className={styles.welcome}>
        <p className={styles.eyebrow}>{data.household.name}</p>
        <h1>Good to see you, {data.profile.name}.</h1>
        <p>Here’s what Aevia is handling next and what has happened recently.</p>
      </section>

      <section className={styles.assistants}>
        <div className={styles.sectionTitle}><p>Active assistants</p><span>{[mitraRoutine && "Mitra", latestPlan && "Tarla"].filter(Boolean).length} active</span></div>
        <div className={styles.assistantGrid}>
          {mitraRoutine ? (
            <article>
              <div className={styles.assistantIcon}>M</div>
              <div><span>Mitra</span><h2>{mitraRoutine.label ?? mitraRoutine.prompt}</h2><p>{formatRoutine(mitraRoutine)}</p></div>
              <strong>{mitraInstance ? friendlyState(mitraInstance.status) : "Scheduled"}</strong>
            </article>
          ) : (
            <article className={styles.addCard}><div className={styles.assistantIcon}>M</div><div><span>Mitra</span><h2>No parent routine yet</h2><Link href="/onboarding">Set up one routine</Link></div></article>
          )}
          {latestPlan ? (
            <article>
              <div className={[styles.assistantIcon, styles.tarlaIcon].join(" ")}>T</div>
              <div><span>Tarla</span><h2>Plan for {formatDate(latestPlan.targetDate)}</h2><p>{latestPlan.mealSlots.join(" · ")} · {latestPlan.status.replaceAll("_", " ")}</p></div>
              <strong>{latestPlan.status === "scheduled" ? "Approved" : friendlyState(latestPlan.status)}</strong>
            </article>
          ) : (
            <article className={styles.addCard}><div className={[styles.assistantIcon, styles.tarlaIcon].join(" ")}>T</div><div><span>Tarla</span><h2>No meal plan yet</h2><Link href="/onboarding">Plan one day</Link></div></article>
          )}
        </div>
      </section>

      <section className={styles.nextGrid}>
        <article className={styles.nextCard}>
          <p className={styles.eyebrow}>Next</p>
          <h2>{mitraRoutine ? "Mitra routine" : "No Mitra routine scheduled"}</h2>
          {mitraRoutine ? (
            <>
              <strong>{mitraRoutine.label}</strong>
              <p>{mitraRoutine.nextOccurrenceAt ? formatTimestamp(mitraRoutine.nextOccurrenceAt, data.household.timezone) : "Schedule pending"}</p>
              <small>Messages use the development transport in this M5 setup.</small>
            </>
          ) : <Link href="/onboarding">Add Mitra</Link>}
        </article>
        <article className={styles.nextCard}>
          <p className={styles.eyebrow}>Kitchen</p>
          <h2>{latestPlan ? "Latest full-day plan" : "No Tarla plan scheduled"}</h2>
          {latestPlan ? (
            <>
              <strong>{round(latestPlan.totalNutrition.caloriesKcal)} kcal · {round(latestPlan.totalNutrition.proteinG)} g protein</strong>
              <p>{latestPlan.mealSlots.length} meals · {formatDate(latestPlan.targetDate)}</p>
              <small>Nutrition is a deterministic planning estimate.</small>
            </>
          ) : <Link href="/onboarding">Add Tarla</Link>}
        </article>
      </section>

      <div className={styles.lowerGrid}>
        <section className={styles.activity}>
          <div className={styles.sectionTitle}><p>Recent activity</p><Link href="/admin/runs">See ordered traces</Link></div>
          {data.runs.length ? (
            <div className={styles.activityList}>
              {data.runs.slice(0, 7).map((run) => (
                <article key={run._id}>
                  <span className={run.agent === "tarla" ? styles.tarlaDot : styles.mitraDot}>{run.agent.slice(0, 1).toUpperCase()}</span>
                  <div><strong>{humanTask(run.taskType)}</strong><p>{safeSummary(run.outputSummary ?? run.inputSummary ?? "Run created")}</p></div>
                  <time>{formatTimestamp(run.updatedAt, data.household.timezone)}</time>
                  <em>{friendlyState(run.status)}</em>
                </article>
              ))}
            </div>
          ) : <p className={styles.empty}>Activity will appear after the first scheduled run.</p>}
        </section>

        <aside className={styles.sideColumn}>
          <section className={styles.exceptionCard}>
            <p className={styles.eyebrow}>Needs your input</p>
            {failedRuns.length ? (
              <><h2>{failedRuns.length} run{failedRuns.length === 1 ? "" : "s"} need review</h2><p>Aevia has not marked failed work as complete.</p><Link href="/admin/runs">Review runs</Link></>
            ) : (
              <><h2>Nothing waiting on you</h2><p>No current failed run requires review.</p></>
            )}
          </section>
          <section className={styles.memoryCard}>
            <p className={styles.eyebrow}>What Aevia knows</p>
            <h2>A small, inspectable start.</h2>
            {memories.length ? <ul>{memories.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul> : <p>Context you add during setup will appear here.</p>}
            <small>This is current stored context, not a claim that Aevia inferred more.</small>
          </section>
        </aside>
      </div>

      <footer className={styles.footer}><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/beta">Beta status</Link><span>Policies accepted {new Date(data.profile.acceptedAt).toLocaleDateString()}</span></footer>
    </main>
  );
}

function visibleMemories(
  preferences: Array<{ category: string; key: string; value: string }>,
  members: Array<{ _id: string; name: string; role: string; languagePreference?: string }>,
  visits: Array<{ label: string; arrivalTime: string }>,
) {
  const results: string[] = [];
  for (const member of members) {
    if (member.languagePreference && member.role !== "primary user") {
      results.push(member.name + " prefers " + member.languagePreference + ".");
    }
  }
  for (const preference of preferences) {
    if (preference.category === "household_context") results.push(preference.value);
    if (preference.key === "cuisines") results.push("Household cuisines: " + preference.value + ".");
  }
  for (const visit of visits) {
    results.push(visit.label + " at " + visit.arrivalTime + ".");
  }
  return [...new Set(results)];
}

function formatRoutine(routine: {
  timing?: { kind: string; recurrence?: { frequency: string } };
  nextOccurrenceAt?: number;
}) {
  if (routine.timing?.kind === "recurring") {
    return "Repeats " + (routine.timing.recurrence?.frequency.replaceAll("_", " ") ?? "on schedule");
  }
  return routine.nextOccurrenceAt ? "Runs once on schedule" : "Schedule pending";
}

function formatTimestamp(value: number, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
}

function friendlyState(value: string) {
  return value.replaceAll("_", " ").toLocaleLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function humanTask(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function safeSummary(value: string) {
  return value
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone hidden]")
    .replace(/whatsapp:\S+/gi, "[address hidden]")
    .slice(0, 150);
}

function round(value: number) {
  return Math.round(value);
}
