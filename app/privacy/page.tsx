import Link from "next/link";
import { BETA_DRAFT_LABEL, PRIVACY_VERSION } from "../../lib/betaPolicies";
import { PolicyViewTracker } from "../PolicyViewTracker";
import styles from "../legal.module.css";

export default function PrivacyPage() {
  return (
    <main className={styles.shell}>
      <PolicyViewTracker type="privacy" />
      <header className={styles.header}>
        <Link href="/" className={styles.brand}><span>A</span>Aevia</Link>
        <Link href="/onboarding" className={styles.cta}>Meet Aevia</Link>
      </header>
      <article className={styles.document}>
        <p className={styles.kicker}>Privacy Policy · {PRIVACY_VERSION}</p>
        <h1>Aevia Beta Privacy Policy</h1>
        <p className={styles.draft}>{BETA_DRAFT_LABEL}</p>
        <p className={styles.lead}>This policy explains the information the closed beta may process, why it is used, and the controls that exist today.</p>

        <h2>1. Information Aevia may process</h2>
        <ul>
          <li>Account and profile details, including name, email, time zone, and beta acceptance.</li>
          <li>Household members, roles, preferences, language, routines, schedules, and communication endpoints.</li>
          <li>Food preferences, allergies, dietary rules, meal plans, nutrition estimates, cooking-person setup, inventory, and shopping-needed items.</li>
          <li>Senior and medication context supplied by users. Uploaded medical documents are not part of the current M5 product.</li>
          <li>WhatsApp or development-transport messages, replies, reactions, delivery state, and provider identifiers.</li>
          <li>Agent runs, ordered steps, corrections, feedback, exceptions, and operator-review information.</li>
          <li>Privacy-safe product usage events such as landing views, onboarding progress, activation, and task outcomes.</li>
        </ul>

        <h2>2. Why this information is used</h2>
        <p>Aevia uses information for personalization, scheduling, task execution, communication, memory and context, safety and exception handling, debugging, user support, evaluation, beta improvement, and product analytics.</p>

        <h2>3. Source and certainty</h2>
        <p>Aevia should distinguish user-provided facts, another person’s self-report, extracted candidate information, and agent inference. A self-report is not independent verification. An estimate is not professional advice.</p>

        <h2>4. Service providers</h2>
        <p>The current product uses Convex for application data/runtime and can use messaging providers behind a replaceable transport layer. Development transport remains available. Twilio is retained as a fallback adapter, and Meta WhatsApp Cloud API is the current real test provider. Provider services process data under their own terms and policies.</p>

        <h2>5. Beta operator access</h2>
        <p>Authorized Aevia operators may need controlled access for debugging, exception resolution, safety review, support, evaluation, and product improvement. Operator tools should mask sensitive fields by default and require deliberate reveal where that control is implemented. M5 adds a household-scoped run viewer; a complete access-controlled admin system is not yet built.</p>

        <h2>6. Analytics limits</h2>
        <p>Product analytics must not receive phone numbers, medicine names, raw WhatsApp text, prescription content, secrets, or unnecessary personal information. M5 records allowlisted, pseudonymous product events. A third-party product analytics service is not configured in this milestone.</p>

        <h2>7. User controls</h2>
        <p>Where currently supported, you can review setup, correct active context, update preferences, and pause or change routines. Full self-serve export, account deletion, and rich memory history controls are not yet implemented; do not rely on them until they appear in the product.</p>

        <h2>8. Third-party information</h2>
        <p>Only provide another person’s information when appropriate, and introduce Aevia before automated messages begin. A parent, senior, cooking person, or family member should not receive surprise recurring messages.</p>

        <h2>9. Medical documents</h2>
        <p>Prescription image/PDF extraction is not implemented in M5. Formal production privacy and regulatory handling for future medical-document ingestion remains open and requires review before launch.</p>

        <h2>10. Security and retention</h2>
        <p>Aevia uses application ownership checks and provider webhook validation in the current beta. No system is perfectly secure. We do not claim encryption, retention, deletion, or compliance guarantees beyond what is actually implemented. Beta data may be retained while needed for the purposes above and handled through operator-supported requests.</p>
      </article>
      <footer className={styles.footer}><Link href="/terms">Terms</Link><Link href="/beta">Beta status</Link><Link href="/">Home</Link></footer>
    </main>
  );
}
