"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDeviceCredential } from "../../lib/aeviaSession";
import { useProductAnalytics } from "../../lib/productAnalytics";
import { SessionUnavailable } from "../SessionUnavailable";
import { AeviaLogo } from "../AeviaLogo";
import styles from "./dashboard.module.css";

export default function DashboardPage() {
  const [credentialState, retryCredential] = useDeviceCredential();
  const ownerKey = credentialState.status === "ready" ? credentialState.credential : undefined;
  const data = useQuery(api.m5.getDashboard, ownerKey ? { ownerKey } : "skip");
  const track = useProductAnalytics();
  const decideException = useMutation(api.executionExceptions.decide);
  const [decisionPending, setDecisionPending] = useState<string>();
  const [decisionError, setDecisionError] = useState<string>();
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
    return <main className={styles.emptyPage}><AeviaLogo /><h1>Your Aevia setup starts here.</h1><p>This browser does not have a closed-beta household yet.</p><Link href="/onboarding">Hello Aevia</Link></main>;
  }

  const activeRoutines = [...data.routines]
    .filter((routine) => routine.w2Enabled)
    .sort((left, right) => (left.nextOccurrenceAt ?? Infinity) - (right.nextOccurrenceAt ?? Infinity));
  const latestPlan = data.dayPlans[0];
  const failedRuns = data.runs.filter((run) => run.status === "failed");
  const memberMap = new Map(data.members.map((member) => [String(member._id), member]));
  const pendingExceptions = data.exceptions.filter((item) =>
    ["pending_approval", "needs_review"].includes(item.status),
  );
  const handledItems = recentlyHandled(data, memberMap);

  async function decide(exceptionId: string, decision: "approve" | "reject") {
    if (!ownerKey) return;
    setDecisionPending(exceptionId);
    setDecisionError(undefined);
    try {
      await decideException({ ownerKey, exceptionId: exceptionId as Id<"executionExceptions">, decision });
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "That decision could not be saved. Please try again.");
    } finally {
      setDecisionPending(undefined);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <AeviaLogo compact />
        <nav><Link href="/dashboard">Home</Link><Link href="/household">Household</Link><Link href="/mitra">Mitra</Link><Link href="/tarla">Tarla</Link></nav>
        <p>Closed beta</p>
      </header>

      <section className={styles.welcome} id="today">
        <p className={styles.eyebrow}>{data.household.name}</p>
        <h1 id="home">Home</h1>
        <p>Your household specialist actions and replies.</p>
      </section>

      <section className={styles.assistants}>
        <div className={styles.sectionTitle}><p>Mitra and Tarla</p><span>{activeRoutines.length + (latestPlan ? 1 : 0)} active views</span></div>
        <div className={styles.assistantGrid}>
          {activeRoutines.slice(0, 3).map((routine) => {
            const member = routine.memberId ? memberMap.get(String(routine.memberId)) : undefined;
            const latest = data.latestInstances.find((item) => item.routineId === routine._id)?.instance;
            return <article key={routine._id}><div className={styles.assistantIcon}>M</div><div><span>Mitra</span><h2>{member ? `${member.preferredSalutation || member.name}'s ${routine.label ?? "routine"}` : routine.label}</h2><p>{routine.nextOccurrenceAt ? formatTimestamp(routine.nextOccurrenceAt, data.household.timezone) : "Schedule saved"}</p>{routine.notes && <small>{routine.notes}</small>}<Link href="/mitra">Open Mitra</Link></div><strong>{latest ? honestMitraState(latest.status, member?.preferredSalutation || member?.name) : "Scheduled"}</strong></article>;
          })}
          {latestPlan && <article><div className={[styles.assistantIcon, styles.tarlaIcon].join(" ")}>T</div><div><span>Tarla</span><h2>Meals for {formatDate(latestPlan.targetDate)}</h2><p>{latestPlan.mealSlots.map(friendlyState).join(" · ")}</p><Link href="/tarla">Open Tarla</Link></div><strong>{latestPlan.status === "scheduled" || latestPlan.status === "approved" ? "Plan sent" : friendlyState(latestPlan.status)}</strong></article>}
          {!activeRoutines.length && !latestPlan && <article className={styles.addCard}><div className={styles.assistantIcon}>A</div><div><span>Aevia</span><h2>No active work yet</h2><p>Your setup is ready. Start from onboarding to add a first job.</p></div></article>}
        </div>
      </section>

      <section className={styles.nextGrid}>
        <article className={styles.nextCard} id="needs-you">
          <p className={styles.eyebrow}>Needs you</p>
          {pendingExceptions.length ? <div className={styles.requestList}>{pendingExceptions.map((item) => { const source = item.sourceMemberId ? memberMap.get(String(item.sourceMemberId)) : undefined; const medicineChange = item.policyCode === "MEDICINE_REMINDER_CHANGE_REQUIRES_APPROVAL"; return <section key={item._id} className={styles.request}><h2>{source?.preferredSalutation || source?.name || "Someone in your household"} requested a change</h2><p>{item.proposedAction}</p><small>{medicineChange ? "Aevia paused this reminder until you decide." : "Aevia needs your approval before continuing."}</small>{item.status === "pending_approval" && <div className={styles.requestActions}><button type="button" disabled={decisionPending === String(item._id)} onClick={() => void decide(String(item._id), "approve")}>{medicineChange ? "Approve stopping reminder" : "Approve"}</button><button type="button" disabled={decisionPending === String(item._id)} onClick={() => void decide(String(item._id), "reject")}>{medicineChange ? "Keep reminder" : "Reject"}</button></div>}</section>; })}{decisionError && <p role="alert" className={styles.decisionError}>{decisionError}</p>}</div> : failedRuns.length ? <><h2>{failedRuns.length} item{failedRuns.length === 1 ? "" : "s"} need your review</h2><p>Aevia could not complete these runs.</p></> : <><h2>Nothing right now.</h2><p>Only decisions that need your action appear here.</p></>}
        </article>
        <article className={styles.nextCard}><p className={styles.eyebrow}>Coming up</p>{activeRoutines[0]?.nextOccurrenceAt ? <><h2>{activeRoutines[0].label}</h2><p>{formatTimestamp(activeRoutines[0].nextOccurrenceAt, data.household.timezone)}</p></> : latestPlan ? <><h2>Next meal plan</h2><p>{formatDate(latestPlan.targetDate)}</p></> : <><h2>No scheduled work</h2><p>Add or edit a specialist when you are ready.</p></>}</article>
      </section>

      <section className={[styles.activity, styles.fullActivity].join(" ")} aria-labelledby="handled-title">
        <div className={styles.sectionTitle}><p id="handled-title">Recently handled</p><span>Only meaningful outcomes appear here</span></div>
        <div className={styles.activityList}>{handledItems.length ? handledItems.slice(0, 6).map((item) => <article key={item.key}><span className={item.agent === "Mitra" ? styles.mitraDot : styles.tarlaDot}>{item.agent.charAt(0)}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{item.time ? formatTimestamp(item.time, data.household.timezone) : "Recent"}</time><em>{item.state}</em></article>) : <p className={styles.empty}>Completed household work will appear here.</p>}</div>
      </section>

      <section className={styles.activity} aria-label="Specialist views">
        <div className={styles.sectionTitle}><p>Mitra and Tarla views</p><Link href="/household">View household</Link></div>
        <div className={styles.activityList}>
          <article><span className={styles.mitraDot}>M</span><div><strong>Mitra</strong><p>{activeRoutines.length ? `${activeRoutines.length} routine route(s) active.` : "No routine route active yet."}</p></div></article>
          <article><span className={styles.tarlaDot}>T</span><div><strong>Tarla</strong><p>{latestPlan ? `Plan saved for ${formatDate(latestPlan.targetDate)}.` : "No meal plan route active yet."}</p></div></article>
        </div>
      </section>

      <footer className={styles.footer}><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/beta">Beta status</Link><span>Policies accepted {new Date(data.profile.acceptedAt).toLocaleDateString()}</span></footer>
    </main>
  );
}
function recentlyHandled(
  data: NonNullable<FunctionReturnType<typeof api.m5.getDashboard>>,
  memberMap: Map<string, NonNullable<FunctionReturnType<typeof api.m5.getDashboard>>["members"][number]>,
) {
  const items: Array<{ key: string; agent: "Mitra" | "Tarla"; title: string; detail: string; state: string; time?: number }> = [];
  for (const entry of data.latestInstances) {
    if (!entry.instance?.primaryUserSummary || entry.instance.status === "NEEDS_ATTENTION") continue;
    const routine = data.routines.find((item) => item._id === entry.routineId);
    const member = routine?.memberId ? memberMap.get(String(routine.memberId)) : undefined;
    items.push({ key: String(entry.instance._id), agent: "Mitra", title: entry.instance.primaryUserSummary, detail: member ? `${member.preferredSalutation || member.name} · ${routine?.label ?? "routine"}` : routine?.label ?? "Routine", state: entry.instance.status === "CONFIRMED" ? "Self-reported" : entry.instance.primaryUserSummary.startsWith("You ") ? "Decision saved" : "Not marked done", time: entry.instance.responseAt ?? entry.instance.sentAt });
  }
  for (const execution of data.executions) {
    if (!["revised_waiting", "acknowledged"].includes(execution.status)) continue;
    const cook = memberMap.get(String(execution.cookMemberId));
    const missing = execution.unavailableIngredientKeys.map((item) => item.replaceAll("_", " ")).join(", ");
    items.push({ key: String(execution._id), agent: "Tarla", title: execution.status === "revised_waiting" ? `Tarla updated the plan because ${missing || "an ingredient"} was unavailable.` : `${cook?.preferredSalutation || cook?.name || "The cooking person"} acknowledged the meal instruction.`, detail: execution.status === "revised_waiting" ? "The kitchen quantities were updated too." : "This confirms the instruction was received, not that cooking is complete.", state: execution.status === "revised_waiting" ? "Handled" : "Acknowledged", time: execution.updatedAt });
  }
  return items.sort((left, right) => (right.time ?? 0) - (left.time ?? 0));
}

function formatTimestamp(value: number, timezone: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
function friendlyState(value: string) { return value.replaceAll("_", " ").toLocaleLowerCase().replace(/^\w/, (letter) => letter.toUpperCase()); }
function honestMitraState(value: string, name?: string) { if (["CONFIRMED", "OK"].includes(value)) return name ? `${name} said it was done` : "Reported done"; if (value === "NO_RESPONSE") return "No reply"; return friendlyState(value); }

