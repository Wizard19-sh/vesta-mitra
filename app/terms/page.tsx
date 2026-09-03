import Link from "next/link";
import { BETA_DRAFT_LABEL, TERMS_VERSION } from "../../lib/betaPolicies";
import { PolicyViewTracker } from "../PolicyViewTracker";
import styles from "../legal.module.css";

export default function TermsPage() {
  return (
    <main className={styles.shell}>
      <PolicyViewTracker type="terms" />
      <header className={styles.header}>
        <Link href="/" className={styles.brand}><span>A</span>Aevia</Link>
        <Link href="/onboarding" className={styles.cta}>Hello Aevia</Link>
      </header>
      <article className={styles.document}>
        <p className={styles.kicker}>Terms of Use · {TERMS_VERSION}</p>
        <h1>Aevia Beta Terms</h1>
        <p className={styles.draft}>{BETA_DRAFT_LABEL}</p>
        <p className={styles.lead}>
          These terms describe the closed-beta product as it works today. By activating Aevia, you agree to these Terms and the Privacy Policy.
        </p>

        <h2>1. Beta product</h2>
        <p>Aevia is early-stage software. Its output may be incomplete, delayed, inaccurate, misunderstood, or incorrect. Review important information and decisions before relying on them.</p>

        <h2>2. What Aevia does</h2>
        <p>Aevia can store household context, schedule agreed routines, create meal plans, send provider-based messages, interpret replies, and keep task records. Mitra handles everyday senior routines. Tarla handles meal planning and kitchen coordination.</p>

        <h2>3. Important limits</h2>
        <ul>
          <li>Aevia is not a medical, health, emergency, nutrition, financial, or legal professional service.</li>
          <li>A message saying a person completed a task is a self-report unless an independent verified source is explicitly shown.</li>
          <li>Automated language interpretation may misunderstand a reply.</li>
          <li>WhatsApp, internet, scheduling, or provider failures may delay or prevent a message.</li>
          <li>You remain responsible for important household decisions and for verifying material actions and information.</li>
        </ul>

        <h2>4. Mitra safety</h2>
        <p>Mitra is an everyday routine assistant, not a doctor, healthcare provider, medical monitor, or emergency service. Verify medication names, timing, and instructions. Aevia must not be used to start, stop, change dosage, or materially change treatment based only on conversation or extracted information. Contact the appropriate local emergency or medical service for emergencies.</p>

        <h2>5. Tarla safety</h2>
        <p>Tarla’s calories, macros, TDEE, portions, and meal suggestions are planning estimates, not medical nutrition advice. Independently verify allergies, intolerances, religious restrictions, medically required diets, and ingredient substitutions.</p>

        <h2>6. Third-party recipients</h2>
        <p>If you configure Aevia to message a parent, senior, cooking person, or family member, you must introduce the product and make sure the recipient has agreed before recurring messages begin. Your acceptance does not replace their consent.</p>

        <h2>7. Responsible use</h2>
        <p>Provide accurate context, keep contact details current, review important changes, and do not use Aevia for unlawful, harmful, deceptive, or emergency activity. Do not treat provider acceptance as proof that a person read or acted on a message.</p>

        <h2>8. Beta operations</h2>
        <p>Authorized Aevia beta operators may access controlled product and agent data for debugging, support, exception resolution, safety review, evaluation, and product improvement. Sensitive data should be minimized and masked by default in operator tools where implemented.</p>

        <h2>9. Availability and changes</h2>
        <p>The beta may change, pause, or stop. Features may be added or removed. If these terms materially change, Aevia should request acceptance of the updated version before continued activation where the product supports it.</p>

        <h2>10. Leaving the beta</h2>
        <p>You may pause configured routines or ask to leave the beta. Data handling requests are addressed according to the implemented product capability and Privacy Policy. This beta does not yet promise self-serve export or deletion tools.</p>
      </article>
      <footer className={styles.footer}><Link href="/privacy">Privacy</Link><Link href="/beta">Beta status</Link><Link href="/">Home</Link></footer>
    </main>
  );
}
