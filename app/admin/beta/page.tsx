"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { BetaRecipientView } from "../../../lib/betaRecipients";
import styles from "../runs/runs.module.css";

export default function BetaRunnerPage() {
  const [key, setKey] = useState("");
  const [recipients, setRecipients] = useState<BetaRecipientView[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [agent, setAgent] = useState<"mitra" | "tarla">("mitra");
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState("");
  const [preparedToken, setPreparedToken] = useState("");
  const [result, setResult] = useState<{ runId?: string | null; evidenceId?: string | null; providerStatus?: string | null; providerMessageId?: string | null }>();
  const [notice, setNotice] = useState("Enter the internal beta key to load the configured recipients.");
  const scenario = agent === "mitra" ? "evening_walk" : "tarla_palak_exception";
  const selected = recipients.find((recipient) => recipient.id === recipientId);

  function resetPreparation() {
    setPreparedToken(""); setPreview(""); setConfirmation(""); setResult(undefined);
  }

  async function load() {
    const response = await fetch("/api/admin/beta", { headers: { "x-beta-admin-key": key } });
    const result = await response.json();
    if (!response.ok) return setNotice(result.error ?? "Unable to load recipients");
    setRecipients(result.recipients); setRecipientId(result.recipients[0]?.id ?? ""); setNotice("Select one recipient and review the exact message.");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/beta", { method: "POST", headers: { "content-type": "application/json", "x-beta-admin-key": key }, body: JSON.stringify({ recipientId, agent, scenario, confirmation, preparedToken: preparedToken || undefined }) });
    const result = await response.json();
    if (result.preview) setPreview(result.preview);
    if (result.preparedToken) setPreparedToken(result.preparedToken);
    if (response.ok && result.runKey) setResult(result);
    setNotice(response.ok ? (result.runKey ? "Prepared message submitted to Meta." : "Exact preview ready. Type SEND to dispatch this unchanged message.") : (result.error ?? "Unable to prepare run"));
  }

  return <main className={styles.shell}><header className={styles.header}><Link className={styles.back} href="/admin/runs">← Runs</Link><div><p>Internal only</p><h1>Beta runner</h1></div><span>One recipient at a time</span></header><section className={styles.trace}><p className={styles.kicker}>Meta development beta</p><h2>Prepare one live run</h2><p>{notice}</p>{!recipients.length ? <div className={styles.section}><label>Internal beta key<input type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" /></label><button type="button" onClick={load}>Load recipients</button></div> : <form className={styles.section} onSubmit={submit}><label>Recipient<select value={recipientId} onChange={(event) => { resetPreparation(); setRecipientId(event.target.value); }}>{recipients.map((recipient) => <option key={recipient.id} value={recipient.id} disabled={!recipient.enabled}>{recipient.displayName} — {recipient.maskedPhone}{recipient.enabled ? "" : " (disabled)"}</option>)}</select></label>{selected && <p><strong>Role:</strong> {roleLabel(selected.role)}{selected.label ? ` · ${selected.label}` : ""}</p>}<label>Agent<select value={agent} onChange={(event) => { resetPreparation(); setAgent(event.target.value as "mitra" | "tarla"); }}><option value="mitra">Mitra</option><option value="tarla">Tarla</option></select></label><p><strong>Scenario:</strong> {agent === "mitra" ? "Evening walk reminder" : "Meal plan with Palak nahi hai exception"}</p>{preparedToken && <label>Type SEND to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>}<button type="submit">{preparedToken ? "Send prepared message" : "Prepare exact preview"}</button>{preview && <><h3>Exact WhatsApp preview</h3><pre className={styles.section}>{preview}</pre></>}{result && <section className={styles.section}><h3>Run result</h3><p><strong>Run:</strong> {result.runId ?? "not yet available"}</p><p><strong>Evidence:</strong> {result.evidenceId ?? "pending a real reply"}</p><p><strong>Provider:</strong> {result.providerStatus ?? "not reported"}</p><p><strong>Provider message:</strong> {result.providerMessageId ?? "not reported"}</p></section>}</form>}</section></main>;
}

function roleLabel(role: BetaRecipientView["role"]) {
  return role === "primary_user" ? "Primary user" : role === "senior" ? "Senior" : role === "cook" ? "Cook" : "Other";
}
