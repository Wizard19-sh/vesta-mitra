"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useDeviceCredential } from "../../../lib/aeviaSession";
import { formatDuration, runLatencyBreakdown } from "../../../lib/runLatency";
import { SessionUnavailable } from "../../SessionUnavailable";
import styles from "./runs.module.css";

export default function AgentRunsPage() {
  const [credentialState, retryCredential] = useDeviceCredential();
  const ownerKey =
    credentialState.status === "ready"
      ? credentialState.credential
      : undefined;
  const session = useQuery(api.m5.getSession, ownerKey ? { ownerKey } : "skip");
  const runs = useQuery(
    api.agentRuns.listRuns,
    ownerKey && session
      ? { ownerKey, householdId: session.household._id }
      : "skip",
  );
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const activeRunId = selectedRunId ?? runs?.[0]?.runId;

  const trace = useQuery(
    api.agentRuns.getRunTrace,
    ownerKey && activeRunId ? { ownerKey, runId: activeRunId } : "skip",
  );
  const latency = trace ? runLatencyBreakdown(trace.steps) : undefined;

  if (
    credentialState.status === "loading" ||
    (credentialState.status === "ready" &&
      (session === undefined || (session && runs === undefined)))
  ) {
    return <main className={styles.loading}>Loading safe run summaries…</main>;
  }
  if (credentialState.status === "unavailable") {
    return <SessionUnavailable onRetry={retryCredential} />;
  }
  if (!session) {
    return <main className={styles.empty}><h1>No Aevia household on this device.</h1><Link href="/onboarding">Start setup</Link></main>;
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.back}>← Dashboard</Link>
        <div><p>Internal beta</p><h1>Agent runs</h1></div>
        <span>{session.household.name}</span>
      </header>
      <div className={styles.workspace}>
        <aside className={styles.runList}>
          <p className={styles.kicker}>Recent runs</p>
          {runs?.length ? runs.map((run) => (
            <button
              key={run._id}
              className={run.runId === activeRunId ? styles.selected : ""}
              onClick={() => setSelectedRunId(run.runId)}
              type="button"
            >
              <span>{run.agent}</span>
              <strong>{human(run.taskType)}</strong>
              <small>{shortId(run.runId)} · {human(run.status)}</small>
            </button>
          )) : <p className={styles.noRuns}>No runs yet. Activate a real task from onboarding first.</p>}
        </aside>

        <section className={styles.trace}>
          {!activeRunId || trace === undefined ? (
            <div className={styles.traceEmpty}>{activeRunId ? "Loading trace…" : "Select a run."}</div>
          ) : (
            <>
              <div className={styles.runHeader}>
                <div><p className={styles.kicker}>{trace.run.agent} · {human(trace.run.taskType)}</p><h2>{trace.run.runId}</h2></div>
                <span className={styles.status}>{human(trace.run.status)}</span>
              </div>
              <dl className={styles.metrics}>
                <div><dt>Started</dt><dd>{formatTime(trace.run.startedAt ?? trace.run.createdAt, session.household.timezone)}</dd></div>
                <div><dt>End-to-end elapsed</dt><dd>{trace.run.totalLatencyMs === undefined ? "Still open" : formatDuration(trace.run.totalLatencyMs)}</dd></div>
                <div><dt>Human waiting</dt><dd>{formatDuration(latency?.humanWaitMs)}</dd></div>
                <div><dt>Recorded processing</dt><dd>{formatDuration(latency?.recordedProcessingMs)}</dd></div>
                <div><dt>Transport call time</dt><dd>{formatDuration(latency?.transportCallMs)}</dd></div>
                <div><dt>Provider state</dt><dd>{providerState(trace.steps)}</dd></div>
                <div><dt>Cost / tokens</dt><dd>{costLabel(trace.run)}</dd></div>
              </dl>
              {(trace.run.error || trace.run.outputSummary) && (
                <div className={trace.run.error ? styles.runError : styles.runSummary}>
                  <strong>{trace.run.error ? "Error" : "Outcome"}</strong>
                  <p>{mask(trace.run.error ?? trace.run.outputSummary ?? "")}</p>
                </div>
              )}
              <div className={styles.steps}>
                <div className={styles.stepHeading}><h3>Ordered trace</h3><span>{trace.steps.length} steps</span></div>
                {trace.steps.map((step) => (
                  <article key={step._id}>
                    <div className={styles.order}>{String(step.order).padStart(2, "0")}</div>
                    <div className={styles.stepBody}>
                      <div><h4>{human(step.name)}</h4><span>{human(step.status)}</span></div>
                      {step.outputSummary && <p>{mask(step.outputSummary)}</p>}
                      {step.error && <p className={styles.errorText}>{mask(step.error)}</p>}
                      <small>
                        {formatTime(step.startedAt ?? step.createdAt, session.household.timezone)}
                        {" · "}
                        {step.latencyMs === undefined ? "latency pending" : formatDuration(step.latencyMs)}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
              <p className={styles.maskNote}>Phone numbers, provider addresses, tokens, and long message-like summaries are masked or shortened here. Raw source records are not shown.</p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function human(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function formatTime(value: number, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(value);
}

function providerState(steps: Array<{ name: string; status: string }>) {
  const failed = steps.find((step) => step.name.includes("provider") && step.status === "failed");
  if (failed) return "Provider failed";
  if (steps.some((step) => step.name === "message_delivered")) return "Delivered";
  if (steps.some((step) => step.name === "provider_accepted")) return "Provider accepted";
  if (steps.some((step) => step.name === "send_message" && step.status === "completed")) return "Send step completed";
  return "No provider event yet";
}

function costLabel(run: { actualCost?: number; estimatedCost?: number; costCurrency?: string }) {
  const value = run.actualCost ?? run.estimatedCost;
  if (value === undefined) return "Not recorded";
  return value + " " + (run.costCurrency ?? "");
}

function mask(value: string) {
  const masked = value
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone hidden]")
    .replace(/whatsapp:\S+/gi, "[address hidden]")
    .replace(/Bearer\s+\S+/gi, "[token hidden]");
  return masked.length > 240 ? masked.slice(0, 237) + "…" : masked;
}
