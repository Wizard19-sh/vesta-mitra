import Link from "next/link";
import { AeviaLogo } from "../AeviaLogo";
import styles from "../legal.module.css";

export default function BetaPage() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <AeviaLogo compact />
        <Link href="/onboarding" className={styles.cta}>Hello Aevia</Link>
      </header>
      <article className={styles.document}>
        <p className={styles.kicker}>Closed beta</p>
        <h1>Useful now. Still learning.</h1>
        <p className={styles.lead}>Aevia’s shared household runtime, Mitra routines, Tarla day planning, and provider-neutral messaging have passed development checks. The consumer product flow is the current milestone.</p>
        <div className={styles.statusGrid}>
          <section><strong>Current</strong><p>One household, Mitra and Tarla setup, scheduled development messages, real task state, explicit beta consent, and household-scoped run traces.</p></section>
          <section><strong>Still limited</strong><p>No emergency monitoring, prescription extraction, grocery ordering, voice, payments, full admin console, or dynamic Aevia manager.</p></section>
          <section><strong>Messaging</strong><p>Automated product testing uses the development transport. Real recipients are never messaged without a separate consented test and explicit approval.</p></section>
          <section><strong>Review important details</strong><p>Aevia can make mistakes or misunderstand messages. Verify medical, allergy, dietary, safety, and other material decisions.</p></section>
        </div>
        <div className={styles.betaActions}><Link href="/onboarding" className={styles.cta}>Start the beta setup</Link><Link href="/terms">Read Terms</Link><Link href="/privacy">Read Privacy</Link></div>
      </article>
      <footer className={styles.footer}><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/">Home</Link></footer>
    </main>
  );
}
