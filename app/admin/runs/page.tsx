"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useDeviceCredential } from "../../../lib/aeviaSession";
import { SessionUnavailable } from "../../SessionUnavailable";
import styles from "./runs.module.css";

export default function AgentRunsPage() {
  const [credentialState, retryCredential] = useDeviceCredential();
  const ownerKey = credentialState.status === "ready" ? credentialState.credential : undefined;
  const session = useQuery(api.m5.getSession, ownerKey ? { ownerKey } : "skip");
  const runs = useQuery(api.agentRuns.listRuns, ownerKey && session ? { ownerKey, householdId: session.household._id } : "skip");
  const [selectedRunId, setSelectedRunId] = useState<string>();

  const activeRunId = selectedRunId ?? runs?.[0]?.runId;
  const trace = useQuery(api.agentRuns.getRunTrace, ownerKey && activeRunId ? { ownerKey, runId: activeRunId } : "skip");

  if (credentialState.status === "loading" || (credentialState.status === "ready" && (session === undefined || runs === undefined))) {
    return <main className={styles.loading}>Loading run data…</main>;
  }
  if (credentialState.status === "unavailable") return <SessionUnavailable onRetry={retryCredential} />;
  if (!session) return <main className={styles.empty}>No household setup on this device.</main>;

  const exceptions = trace?.exceptions ?? [];
  const evidence = trace?.evidence ?? [];

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.back}>← Dashboard</Link>
        <div>
          <p>Admin view</p>
          <h1>Runs</h1>
        </div>
        <span>{session.household.name}</span>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.runList}>
          <p className={styles.kicker}>Recent runs</p>
          {runs?.length
            ? runs.map((run) => (
              <button key={run._id} className={run.runId === activeRunId ? styles.selected : ""} onClick={() => setSelectedRunId(run.runId)} type="button">
                <span>{run.agent}</span>
                <strong>{run.taskType}</strong>
                <small>{run.runId}</small>
              </button>
            ))
            : <p className={styles.noRuns}>No runs yet.</p>}
        </aside>

        <section className={styles.trace}>
          {!trace ? (
            <div className={styles.traceEmpty}>Select a run to review.</div>
          ) : (
            <>
              <div className={styles.runHeader}>
                <div>
                  <p className={styles.kicker}>{trace.run.agent}</p>
                  <h2>{trace.run.taskType}</h2>
                </div>
                <span className={styles.status}>{trace.run.status}</span>
              </div>

              <section className={styles.section}>
                <h3>Run</h3>
                <p><strong>Started:</strong> {formatTime(trace.run.startedAt ?? trace.run.createdAt, session.household.timezone)}</p>
                <p><strong>Outcome:</strong> {trace.run.outputSummary || "not yet ready"}</p>
              </section>

              <section className={styles.grid}>
                <div>
                  <h3>Exceptions</h3>
                  {exceptions.length ? (
                    <ul>
                      {exceptions.map((item) => (
                        <li key={item._id}>
                          <strong>{item.policyCode}</strong>
                          <span>{item.status}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p>No exceptions linked to this run.</p>}
                </div>
                <div>
                  <h3>Evidence</h3>
                  {evidence.length ? (
                    <ul>
                      {evidence.map((item) => (
                        <li key={item._id}>
                          <strong>{item.evidenceId}</strong>
                          <span>{item.outcome}</span>
                          <small>Artifact: {item.artifactStatus}</small>
                        </li>
                      ))}
                    </ul>
                  ) : <p>No evidence recorded for this run.</p>}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function formatTime(value: number, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(value);
}
