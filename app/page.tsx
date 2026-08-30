"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import styles from "./page.module.css";

const SAMPLE_RESPONSE =
  "Haan medicine le li. Bahar relatives ke saath ghoom raha hoon. Sid ko bolna grandson uth jaaye toh video call kare.";

type Step = "landing" | "parent" | "routine" | "response" | "result";
type Relationship = "Mother" | "Father" | "Other";
type RoutineType = "Medication" | "Exercise" | "How they're feeling" | "Custom";
type Frequency = "Once" | "Daily";

export default function Home() {
  const [ownerKey] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const existing = window.localStorage.getItem("mitra-owner-key");
    const key = existing ?? window.crypto.randomUUID();
    if (!existing) window.localStorage.setItem("mitra-owner-key", key);
    return key;
  });
  const [step, setStep] = useState<Step>("landing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const journey = useQuery(
    api.mitra.getJourney,
    ownerKey ? { ownerKey } : "skip",
  );
  const addParent = useMutation(api.mitra.addParent);
  const createRoutine = useMutation(api.mitra.createRoutine);
  const saveRawResponse = useMutation(api.mitra.saveRawResponse);
  const interpretCheckIn = useMutation(api.mitra.interpretCheckIn);

  async function submitParent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerKey) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await addParent({
        ownerKey,
        name: String(data.get("name")).trim(),
        relationship: String(data.get("relationship")) as Relationship,
        context: String(data.get("context")).trim() || undefined,
      });
      setStep("routine");
    } catch {
      setError("We couldn’t save this yet. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerKey || !journey?.parent) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await createRoutine({
        ownerKey,
        parentId: journey.parent._id,
        type: String(data.get("type")) as RoutineType,
        frequency: String(data.get("frequency")) as Frequency,
        prompt: String(data.get("prompt")).trim(),
      });
      setStep("response");
    } catch {
      setError("We couldn’t create this check-in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerKey || !journey?.checkIn) return;
    const data = new FormData(event.currentTarget);
    const rawResponse = String(data.get("response")).trim();
    setBusy(true);
    setError("");
    try {
      await saveRawResponse({
        ownerKey,
        checkInId: journey.checkIn._id,
        rawResponse,
      });
      await interpretCheckIn({
        ownerKey,
        checkInId: journey.checkIn._id,
      });
      setStep("result");
    } catch {
      setError("Mitra couldn’t read that response. Your original reply is still saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!ownerKey || journey === undefined) {
    return <main className={styles.loading}>Opening Mitra…</main>;
  }

  const parentName = journey?.parent?.name ?? "your parent";
  const savedStep: Step = journey?.checkIn?.interpretation
    ? "result"
    : journey?.checkIn
      ? "response"
      : journey?.parent
        ? "routine"
        : "landing";
  const activeStep = step === "landing" ? savedStep : step;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brandMark}>V</div>
        <div>
          <p className={styles.brand}>Vesta</p>
          <p className={styles.product}>Mitra</p>
        </div>
        {activeStep !== "landing" && activeStep !== "result" && (
          <span className={styles.progress}>
            {activeStep === "parent" ? "1" : activeStep === "routine" ? "2" : "3"} of 3
          </span>
        )}
      </header>

      {activeStep === "landing" && !journey && (
        <section className={styles.hero}>
          <div className={styles.eyebrow}>For the moments between calls</div>
          <h1>
            When you can’t reach a parent, know whether there’s actually something
            you need to act on.
          </h1>
          <p>
            Mitra checks in, understands the useful parts of their reply, and brings
            you the reassurance or action that matters.
          </p>
          <button className={styles.primaryButton} onClick={() => setStep("parent")}>
            Check in with a parent <span aria-hidden="true">→</span>
          </button>
          <p className={styles.promise}>A calm update, not a monitoring dashboard.</p>
        </section>
      )}

      {activeStep === "parent" && (
        <section className={styles.card}>
          <div className={styles.sectionIntro}>
            <span className={styles.stepIcon}>01</span>
            <div>
              <p className={styles.kicker}>Let’s start with them</p>
              <h1>Who would you like Mitra to check in with?</h1>
            </div>
          </div>
          <form onSubmit={submitParent} className={styles.form}>
            <label>
              Parent name
              <input name="name" placeholder="e.g. Rajesh" required autoFocus />
            </label>
            <fieldset>
              <legend>Relationship</legend>
              <div className={styles.choices}>
                {(["Mother", "Father", "Other"] as const).map((value) => (
                  <label className={styles.choice} key={value}>
                    <input type="radio" name="relationship" value={value} required />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              What should Mitra know about them? <span>Optional</span>
              <textarea
                name="context"
                rows={4}
                placeholder="Travelling this week. Takes evening medicines. Usually replies within a few hours."
              />
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.primaryButton} disabled={busy}>
              {busy ? "Saving…" : "Continue"}
            </button>
          </form>
        </section>
      )}

      {activeStep === "routine" && journey?.parent && (
        <section className={styles.card}>
          <div className={styles.sectionIntro}>
            <span className={styles.stepIcon}>02</span>
            <div>
              <p className={styles.kicker}>Create a routine</p>
              <h1>What should Mitra check with {parentName}?</h1>
            </div>
          </div>
          <form onSubmit={submitRoutine} className={styles.form}>
            <label>
              Routine type
              <select name="type" defaultValue="Medication">
                <option>Medication</option>
                <option>Exercise</option>
                <option>How they&apos;re feeling</option>
                <option>Custom</option>
              </select>
            </label>
            <fieldset>
              <legend>Frequency</legend>
              <div className={styles.choices}>
                {(["Once", "Daily"] as const).map((value) => (
                  <label className={styles.choice} key={value}>
                    <input
                      type="radio"
                      name="frequency"
                      value={value}
                      defaultChecked={value === "Once"}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
              <p className={styles.hint}>Daily is saved now; automatic scheduling comes later.</p>
            </fieldset>
            <label>
              Check-in message
              <textarea
                name="prompt"
                rows={3}
                defaultValue={`Hi ${parentName}, did you take your medicine? How is your day going?`}
                required
              />
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.primaryButton} disabled={busy}>
              {busy ? "Creating…" : "Create check-in"}
            </button>
          </form>
        </section>
      )}

      {activeStep === "response" && journey?.checkIn && (
        <section className={styles.card}>
          <div className={styles.simulationLabel}>M1 response simulation</div>
          <div className={styles.sectionIntro}>
            <span className={styles.stepIcon}>03</span>
            <div>
              <p className={styles.kicker}>Reply from {parentName}</p>
              <h1>What did they say?</h1>
            </div>
          </div>
          <p className={styles.explainer}>
            Paste a natural reply here. In a later version, this will arrive from
            WhatsApp.
          </p>
          <form onSubmit={submitResponse} className={styles.form}>
            <label>
              Parent’s original response
              <textarea
                id="response"
                name="response"
                rows={6}
                placeholder="Type or paste their reply exactly as they sent it…"
                required
              />
            </label>
            <button
              className={styles.textButton}
              type="button"
              onClick={() => {
                const field = document.querySelector<HTMLTextAreaElement>("#response");
                if (field) field.value = SAMPLE_RESPONSE;
              }}
            >
              Use the example reply
            </button>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.primaryButton} disabled={busy}>
              {busy ? "Understanding reply…" : "See Mitra’s update"}
            </button>
          </form>
        </section>
      )}

      {activeStep === "result" && journey?.checkIn?.interpretation && (
        <section className={styles.resultCard}>
          <div
            className={`${styles.statusIcon} ${
              journey.checkIn.status === "OK" ? "" : styles.unconfirmedIcon
            }`}
            aria-hidden="true"
          >
            {journey.checkIn.status === "OK" ? "✓" : "i"}
          </div>
          <p className={styles.kicker}>Mitra’s update</p>
          <h1>{journey.checkIn.interpretation.overall}</h1>
          <p className={styles.updated}>Response received just now</p>

          <div className={styles.resultList}>
            <ResultRow
              label={journey.routine?.type ?? "Routine"}
              value={journey.checkIn.interpretation.routineOutcome}
            />
            <ResultRow label="Context" value={journey.checkIn.interpretation.usefulContext} />
            <ResultRow label="For you" value={journey.checkIn.interpretation.childAction} accent />
          </div>

          <details className={styles.original}>
            <summary>See original response</summary>
            <p>{journey.checkIn.rawResponse}</p>
          </details>
          <p className={styles.disclaimer}>
            Mitra shares context from the reply. It does not provide medical advice.
          </p>
        </section>
      )}
    </main>
  );
}

function ResultRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`${styles.resultRow} ${accent ? styles.accentRow : ""}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}
