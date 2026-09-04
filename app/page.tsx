"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import {
  composeCheckIn,
  type ConversationStyle,
  type Language,
  type Topic,
} from "../lib/composeCheckIn";
import { getOrCreateLegacyMitraCredential } from "../lib/aeviaSession";
import { AeviaLanding } from "./AeviaLanding";
import { AeviaLogo } from "./AeviaLogo";
import styles from "./page.module.css";

const SAMPLE_RESPONSE =
  "Haan medicine le li. Bahar relatives ke saath ghoom raha hoon. Sid ko bolna grandson uth jaaye toh video call kare.";
const TOPICS: Topic[] = [
  "Medication",
  "Exercise / activity",
  "How they're feeling",
  "General check-in",
  "Custom",
];

type Step = "landing" | "parent" | "routine" | "preview" | "response" | "result";
type Relationship = "Mother" | "Father" | "Other";
type CommunicationPreference = "Text" | "Voice" | "Both";
type PrimaryIntent = "ROUTINES" | "WELLBEING" | "CONNECTION" | "OTHER";
type Frequency = "Once" | "Daily" | "Weekly" | "Monthly";
type PrimaryRoutineType = "Medication" | "Exercise" | "How they're feeling" | "Custom";
type RoutineDraft = {
  type: PrimaryRoutineType;
  topics: Topic[];
  customTopic?: string;
  frequency: Frequency;
  schedule: {
    date?: string;
    time: string;
    dayOfWeek?: string;
    dayOfMonth?: number;
    timeZone: string;
  };
  prompt: string;
};

export default function Home() {
  return <AeviaLanding />;
}

export function LegacyMitraJourney() {
  const [ownerKey] = useState<string | undefined>(() =>
    getOrCreateLegacyMitraCredential(),
  );
  const [step, setStep] = useState<Step>("landing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [childDisplayName, setChildDisplayName] = useState("Sid");
  const [salutation, setSalutation] = useState("Papa");
  const [language, setLanguage] = useState<Language>("Hinglish");
  const [style, setStyle] = useState<ConversationStyle>("Warm & caring");
  const [parentContext, setParentContext] = useState("");
  const [primaryIntent, setPrimaryIntent] = useState<PrimaryIntent>("ROUTINES");
  const [primaryIntentOther, setPrimaryIntentOther] = useState("");
  const [topics, setTopics] = useState<Topic[]>(["Medication"]);
  const [customTopic, setCustomTopic] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("Once");
  const [draft, setDraft] = useState<RoutineDraft>();
  const [editedMessage, setEditedMessage] = useState("");
  const [editingMessage, setEditingMessage] = useState(false);

  const journey = useQuery(api.mitra.getJourney, ownerKey ? { ownerKey } : "skip");
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
        childDisplayName: childDisplayName.trim(),
        salutation: salutation.trim(),
        preferredLanguage: language,
        communicationPreference: String(data.get("communicationPreference")) as CommunicationPreference,
        conversationStyle: style,
        primaryIntent,
        primaryIntentOther: primaryIntent === "OTHER" ? primaryIntentOther.trim() : undefined,
        context: parentContext.trim() || undefined,
      });
      setStep("routine");
    } catch {
      setError("We couldn’t save this yet. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function preparePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!journey?.parent) return;
    if (topics.length === 0) {
      setError("Choose at least one thing for Mitra to check in about.");
      return;
    }
    if (topics.includes("Custom") && !customTopic.trim()) {
      setError("Add the custom question you want Mitra to ask.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const schedule = {
      date: frequency === "Once" ? String(data.get("date")) : undefined,
      time: String(data.get("time")),
      dayOfWeek: frequency === "Weekly" ? String(data.get("dayOfWeek")) : undefined,
      dayOfMonth: frequency === "Monthly" ? Number(data.get("dayOfMonth")) : undefined,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const prompt = composeCheckIn({
      salutation: journey.parent.salutation ?? journey.parent.name,
      childDisplayName: journey.parent.childDisplayName ?? "Sid",
      language: journey.parent.preferredLanguage ?? "English",
      style: journey.parent.conversationStyle ?? "Warm & caring",
      context: journey.parent.context,
      topics,
      customTopic: customTopic.trim() || undefined,
    });
    const nextDraft: RoutineDraft = {
      type: primaryType(topics),
      topics,
      customTopic: customTopic.trim() || undefined,
      frequency,
      schedule,
      prompt,
    };
    setDraft(nextDraft);
    setEditedMessage(prompt);
    setEditingMessage(false);
    setError("");
    setStep("preview");
  }

  async function approveMessage() {
    if (!ownerKey || !journey?.parent || !draft || !editedMessage.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createRoutine({
        ownerKey,
        parentId: journey.parent._id,
        type: draft.type,
        topics: draft.topics,
        customTopic: draft.customTopic,
        frequency: draft.frequency,
        schedule: draft.schedule,
        prompt: editedMessage.trim(),
      });
      setStep("response");
    } catch {
      setError("We couldn’t save this check-in. Please try again.");
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
      await saveRawResponse({ ownerKey, checkInId: journey.checkIn._id, rawResponse });
      await interpretCheckIn({ ownerKey, checkInId: journey.checkIn._id });
      setStep("result");
    } catch {
      setError("Mitra couldn’t read that response. Your original reply is still saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!ownerKey || journey === undefined) return <main className={styles.loading}>Opening Mitra…</main>;

  const parentName = journey?.parent?.name ?? "your parent";
  const parentSalutation = journey?.parent?.salutation ?? parentName;
  const savedStep: Step = journey?.checkIn?.interpretation
    ? "result"
    : journey?.checkIn
      ? "response"
      : journey?.parent
        ? "routine"
        : "landing";
  const activeStep = step === "landing" ? savedStep : step;
  const styleExample = composeCheckIn({
    salutation,
    childDisplayName,
    language,
    style,
    context: parentContext,
    topics: ["Medication", "How they're feeling"],
  });

  return (
    <main className={styles.shell}>
      <Header activeStep={activeStep} />

      {activeStep === "landing" && !journey && (
        <section className={styles.hero}>
          <div className={styles.eyebrow}>For the moments between calls</div>
          <h1>When you can’t reach a parent, know whether there’s actually something you need to act on.</h1>
          <p>Mitra checks in, understands the useful parts of their reply, and brings you the reassurance or action that matters.</p>
          <button className={styles.primaryButton} onClick={() => setStep("parent")}>Check in with a parent <span aria-hidden="true">→</span></button>
          <p className={styles.promise}>A calm update, not a monitoring dashboard.</p>
        </section>
      )}

      {activeStep === "parent" && (
        <section className={styles.card}>
          <SectionIntro number="01" kicker="Teach Mitra the relationship" title="How should Mitra speak with your parent?" />
          <form onSubmit={submitParent} className={styles.form}>
            <div className={styles.twoColumns}>
              <label>Parent’s real name<input name="name" placeholder="e.g. Rajesh" required autoFocus /></label>
              <label>What do you call them?<input name="salutation" value={salutation} onChange={(e) => setSalutation(e.target.value)} placeholder="e.g. Papa" required /></label>
            </div>
            <fieldset>
              <legend>Relationship</legend>
              <ChoiceGroup name="relationship" values={["Mother", "Father", "Other"]} required />
            </fieldset>
            <label>
              What should Mitra call you when speaking to your parent?
              <input name="childDisplayName" value={childDisplayName} onChange={(e) => setChildDisplayName(e.target.value)} placeholder="e.g. Sid" required />
            </label>
            <fieldset>
              <legend>Preferred language</legend>
              <ControlledChoices values={["English", "Hindi", "Hinglish"]} selected={language} onSelect={(value) => setLanguage(value as Language)} />
            </fieldset>
            <fieldset>
              <legend>Communication preference</legend>
              <ChoiceGroup name="communicationPreference" values={["Text", "Voice", "Both"]} defaultValue="Text" required />
              <p className={styles.hint}>M1.1 uses text. This preference is saved for future check-ins.</p>
            </fieldset>
            <label>
              What should Mitra know about them? <span>Optional</span>
              <textarea name="context" rows={3} value={parentContext} onChange={(e) => setParentContext(e.target.value)} placeholder="Dad is travelling this week. Usually replies after a few hours. Likes short messages." />
            </label>
            <fieldset>
              <legend>What would you like Mitra to help with?</legend>
              <div className={styles.intentList}>
                <IntentChoice value="ROUTINES" selected={primaryIntent} onSelect={setPrimaryIntent} title="Keep track of a few regular routines" example="Medicines, walks, meals" />
                <IntentChoice value="WELLBEING" selected={primaryIntent} onSelect={setPrimaryIntent} title="Know how they’re doing when we’re not in touch" example="A lightweight wellbeing check-in" />
                <IntentChoice value="CONNECTION" selected={primaryIntent} onSelect={setPrimaryIntent} title="Make it easier to stay connected" example="Useful updates and reasons to connect without constant checking" />
                <IntentChoice value="OTHER" selected={primaryIntent} onSelect={setPrimaryIntent} title="Something else" />
              </div>
            </fieldset>
            {primaryIntent === "OTHER" && (
              <label>
                What would you like help with?
                <input value={primaryIntentOther} onChange={(e) => setPrimaryIntentOther(e.target.value)} maxLength={120} required />
              </label>
            )}
            <fieldset>
              <legend>How should Mitra speak with {salutation || "them"}?</legend>
              <ControlledChoices values={["Warm & caring", "Casual", "Straightforward"]} selected={style} onSelect={(value) => setStyle(value as ConversationStyle)} />
              <div className={styles.toneExample}><span>Example</span><p>{styleExample}</p></div>
            </fieldset>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.primaryButton} disabled={busy}>{busy ? "Saving…" : "Continue"}</button>
          </form>
        </section>
      )}

      {activeStep === "routine" && journey?.parent && (
        <section className={styles.card}>
          <SectionIntro number="02" kicker="Plan one natural check-in" title={`What should Mitra ask ${parentSalutation} about?`} />
          <form onSubmit={preparePreview} className={styles.form}>
            <fieldset>
              <legend>Choose one or more topics</legend>
              <div className={styles.topicGrid}>
                {TOPICS.map((topic) => (
                  <label className={styles.topicChoice} key={topic}>
                    <input type="checkbox" checked={topics.includes(topic)} onChange={() => setTopics(toggleItem(topics, topic))} />
                    <span>{topic}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {topics.includes("Custom") && (
              <label>Custom question<input value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder="e.g. Did the train journey go smoothly?" required /></label>
            )}
            <fieldset>
              <legend>How often?</legend>
              <ControlledChoices values={["Once", "Daily", "Weekly", "Monthly"]} selected={frequency} onSelect={(value) => setFrequency(value as Frequency)} />
            </fieldset>
            <ScheduleFields frequency={frequency} />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.primaryButton}>Preview message</button>
          </form>
        </section>
      )}

      {activeStep === "preview" && draft && (
        <section className={styles.card}>
          <SectionIntro number="03" kicker="Trust checkpoint" title={`Here’s how Mitra will check in with ${parentSalutation}`} />
          <p className={styles.explainerPreview}>This is the exact message your parent will see.</p>
          {editingMessage ? (
            <label className={styles.previewEditor}>Message<textarea rows={7} value={editedMessage} onChange={(e) => setEditedMessage(e.target.value)} autoFocus /></label>
          ) : (
            <div className={styles.messagePreview}><span>Mitra</span><p>{editedMessage}</p></div>
          )}
          <div className={styles.previewActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setEditingMessage(!editingMessage)}>{editingMessage ? "Done editing" : "Edit message"}</button>
            <button className={styles.primaryButton} type="button" onClick={approveMessage} disabled={busy || !editedMessage.trim()}>{busy ? "Saving…" : "Looks good / Continue"}</button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </section>
      )}

      {activeStep === "response" && journey?.checkIn && (
        <section className={styles.card}>
          <div className={styles.simulationLabel}>M1.1 response simulation</div>
          <SectionIntro number="04" kicker={`Reply from ${parentSalutation}`} title="What did they say?" />
          <p className={styles.explainer}>Paste a natural reply here. In a later version, this will arrive from WhatsApp.</p>
          <form onSubmit={submitResponse} className={styles.form}>
            <label>Parent’s original response<textarea id="response" name="response" rows={6} placeholder="Type or paste their reply exactly as they sent it…" required /></label>
            <button className={styles.textButton} type="button" onClick={() => { const field = document.querySelector<HTMLTextAreaElement>("#response"); if (field) field.value = SAMPLE_RESPONSE; }}>Use the example reply</button>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.primaryButton} disabled={busy}>{busy ? "Understanding reply…" : "See Mitra’s update"}</button>
          </form>
        </section>
      )}

      {activeStep === "result" && journey?.checkIn?.interpretation && (
        <section className={styles.resultCard}>
          <div className={`${styles.statusIcon} ${journey.checkIn.status === "OK" ? "" : styles.unconfirmedIcon}`} aria-hidden="true">{journey.checkIn.status === "OK" ? "✓" : "i"}</div>
          <p className={styles.kicker}>Mitra’s update</p>
          <h1>{journey.checkIn.interpretation.overall}</h1>
          <p className={styles.updated}>Response received just now</p>
          <div className={styles.resultList}>
            <ResultRow label="Check-in" value={journey.checkIn.interpretation.routineOutcome} />
            <ResultRow label="Context" value={journey.checkIn.interpretation.usefulContext} />
            <ResultRow label="For you" value={journey.checkIn.interpretation.childAction} accent />
          </div>
          <details className={styles.original}><summary>See original response</summary><p>{journey.checkIn.rawResponse}</p></details>
          <p className={styles.disclaimer}>Mitra shares context from the reply. It does not provide medical advice.</p>
        </section>
      )}
    </main>
  );
}

function Header({ activeStep }: { activeStep: Step }) {
  const progress = activeStep === "parent" ? 1 : activeStep === "routine" ? 2 : activeStep === "preview" ? 3 : 4;
  return <header className={styles.header}><AeviaLogo compact />{activeStep !== "landing" && activeStep !== "result" && <span className={styles.progress}>{progress} of 4</span>}</header>;
}

function SectionIntro({ number, kicker, title }: { number: string; kicker: string; title: string }) {
  return <div className={styles.sectionIntro}><span className={styles.stepIcon}>{number}</span><div><p className={styles.kicker}>{kicker}</p><h1>{title}</h1></div></div>;
}

function ChoiceGroup({ name, values, defaultValue, required }: { name: string; values: string[]; defaultValue?: string; required?: boolean }) {
  return <div className={styles.choices}>{values.map((value) => <label className={styles.choice} key={value}><input type="radio" name={name} value={value} defaultChecked={value === defaultValue} required={required} /><span>{value}</span></label>)}</div>;
}

function ControlledChoices({ values, selected, onSelect }: { values: string[]; selected: string; onSelect: (value: string) => void }) {
  return <div className={styles.choices}>{values.map((value) => <label className={styles.choice} key={value}><input type="radio" checked={selected === value} onChange={() => onSelect(value)} /><span>{value}</span></label>)}</div>;
}

function IntentChoice({ value, selected, onSelect, title, example }: { value: PrimaryIntent; selected: PrimaryIntent; onSelect: (value: PrimaryIntent) => void; title: string; example?: string }) {
  return <label className={styles.intentChoice}><input type="radio" checked={selected === value} onChange={() => onSelect(value)} /><span><strong>{title}</strong>{example && <small>{example}</small>}</span></label>;
}

function ScheduleFields({ frequency }: { frequency: Frequency }) {
  return <div className={styles.scheduleFields}>
    {frequency === "Once" && <label>Date<input type="date" name="date" required /></label>}
    {frequency === "Weekly" && <label>Day of week<select name="dayOfWeek" defaultValue="Monday"><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option><option>Sunday</option></select></label>}
    {frequency === "Monthly" && <label>Day of month<input type="number" name="dayOfMonth" min="1" max="31" defaultValue="1" required /></label>}
    <label>Time<input type="time" name="time" required /></label>
  </div>;
}

function ResultRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`${styles.resultRow} ${accent ? styles.accentRow : ""}`}><p>{label}</p><strong>{value}</strong></div>;
}

function toggleItem<T>(items: T[], item: T) {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

function primaryType(topics: Topic[]): PrimaryRoutineType {
  const first = topics[0];
  if (first === "Medication") return "Medication";
  if (first === "Exercise / activity") return "Exercise";
  if (first === "How they're feeling") return "How they're feeling";
  return "Custom";
}
