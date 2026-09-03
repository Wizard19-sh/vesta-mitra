"use client";

import Image from "next/image";
import Link from "next/link";
import { Inter, Playfair_Display } from "next/font/google";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useProductAnalytics } from "../lib/productAnalytics";
import styles from "./aevia.module.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-aevia-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-aevia-playfair" });

const PROOFS = [
  {
    agent: "Mitra",
    tone: "mitra" as const,
    title: "Evening routine",
    messages: [
      { sender: "Mitra", text: "Maa, walk ka time ho gaya. Aaj 6:00 PM pe jana hai.", time: "6:00 PM", direction: "agent" as const },
      { sender: "Maa", text: "Aaj chalna ho jayega.", time: "6:08 PM", direction: "reply" as const },
      { sender: "Mitra", text: "Thank you. Marked as self-reported complete.", time: "6:08 PM", direction: "agent" as const },
    ],
    state: "Message sent, delivered, and marked by reply.",
  },
  {
    agent: "Mitra",
    tone: "mitra" as const,
    title: "Medicine check",
    messages: [
      { sender: "Mitra", text: "Papa, aaj BP ki dawai le li?", time: "8:00 PM", direction: "agent" as const },
      { sender: "Papa", text: "Abhi li.", time: "8:04 PM", direction: "reply" as const },
      { sender: "Mitra", text: "Thanks. Aevia got your reply.", time: "8:04 PM", direction: "agent" as const },
    ],
    state: "Message sent, acknowledged, and self-reported.",
  },
  {
    agent: "Tarla",
    tone: "tarla" as const,
    title: "Meal instruction",
    messages: [
      { sender: "Tarla", text: "Aaj dinner: dal, roti, salad. 3 roti each.", time: "10:15 AM", direction: "agent" as const },
      { sender: "Priya", text: "Palak nahi hai, bhindi kar sakti hoon?", time: "10:18 AM", direction: "reply" as const },
      { sender: "Tarla", text: "Substitution allowed. Final plan updated and resent.", time: "10:18 AM", direction: "agent" as const },
    ],
    state: "Meal instruction sent, ingredient replaced, plan revised.",
  },
];

export function AeviaLanding() {
  const [proofIndex, setProofIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const tracked = useRef(false);
  const track = useProductAnalytics();

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    void track("landing_viewed", { route: "/" });
  }, [track]);

  function showProof(requestedIndex: number) {
    const nextIndex = (requestedIndex + PROOFS.length) % PROOFS.length;
    const trackElement = carouselRef.current;
    const slide = trackElement?.querySelector<HTMLElement>(`[data-proof-slide="${nextIndex}"]`);
    setProofIndex(nextIndex);
    if (trackElement && slide) {
      trackElement.scrollTo({ left: slide.offsetLeft - trackElement.offsetLeft, behavior: "smooth" });
    }
  }

  function syncProofIndex() {
    const trackElement = carouselRef.current;
    if (!trackElement) return;
    const slides = Array.from(trackElement.querySelectorAll<HTMLElement>("[data-proof-slide]"));
    const nextIndex = slides.reduce(
      (closestIndex, slide, index) =>
        Math.abs(slide.offsetLeft - trackElement.offsetLeft - trackElement.scrollLeft) <
        Math.abs(slides[closestIndex].offsetLeft - trackElement.offsetLeft - trackElement.scrollLeft)
          ? index
          : closestIndex,
      0,
    );
    setProofIndex(nextIndex);
  }

  function handleCarouselKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showProof(proofIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showProof(proofIndex + 1);
    }
  }

  return (
    <main className={`${styles.siteShell} ${inter.variable} ${playfair.variable}`}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Wordmark />
          <nav className={styles.primaryNav} aria-label="Primary navigation">
            <a href="#how">How it works</a>
            <a href="#specialists">Mitra &amp; Tarla</a>
            <a href="#truth">What it does</a>
            <Link href="/beta">Beta</Link>
          </nav>
          <Link className={styles.navCta} href="/onboarding" onClick={() => void track("cta_clicked", { route: "/", outcome: "header" })}>
            Start with Aevia
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Your personal household assistant</p>
            <h1>Action that stays in WhatsApp.</h1>
            <p className={styles.heroLead}>Aevia sends household messages, receives replies, and keeps a record of outcomes.</p>
            <p className={styles.heroBody}>
              Mitra sends routine messages and reads replies. Tarla sends meal instructions and can revise a plan after substitution.
            </p>
            <div className={styles.heroActions}>
              <Link href="/onboarding" className={styles.primaryButton} onClick={() => void track("cta_clicked", { route: "/", outcome: "hero" })}>
                Start with Aevia
              </Link>
              <a href="#how" className={styles.secondaryButton}>See real outcomes</a>
            </div>
          </div>

          <div className={styles.heroVisual} />
        </div>
      </section>

      <section className={styles.proofStrip} aria-label="Aevia capabilities">
        <div><CheckIcon /><span>Message sent on WhatsApp</span></div>
        <div className={styles.languageProof}><LanguageIcon /><strong>English · हिंदी · Hinglish</strong></div>
        <div><CheckIcon /><span>Reply, self-reported complete</span></div>
        <div><CheckIcon /><span>Requires your approval when needed</span></div>
      </section>

      <section className={styles.mentalLoad} id="how">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>What Aevia handles</p>
          <h2>Message sent, message delivered, message acknowledged.</h2>
        </div>
        <div className={styles.loadCanvas}>
          <div className={`${styles.loadCluster} ${styles.parentCluster}`}>
            <h3>Routine flow</h3>
            <span>Message sent</span>
            <span>WhatsApp reply</span>
            <span>Needs follow-up if missing</span>
          </div>
          <div className={`${styles.loadCluster} ${styles.kitchenCluster}`}>
            <h3>Meal flow</h3>
            <span>Instruction sent</span>
            <span>Unavailable item reported</span>
            <span>Substitution recalculated and resent</span>
          </div>
        </div>
      </section>

      <section className={styles.specialists} id="specialists">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Mitra and Tarla</p>
          <h2>Two specialists, one household account.</h2>
          <p>Set Mitra for routine reminders. Set Tarla for meal instruction coordination.</p>
        </div>
        <div className={styles.specialistGrid}>
          <article className={styles.specialistCard}>
            <div className={styles.specialistImageFrame}>
              <span className={styles.specialistLabel}>Mitra</span>
            </div>
            <h3>Routine reminders for family members.</h3>
            <p>Medicines, walks, and routine follow-ups with reply capture.</p>
          </article>
          <article className={`${styles.specialistCard} ${styles.tarlaCard}`}>
            <div className={styles.specialistImageFrame}>
              <span className={`${styles.specialistLabel} ${styles.tarlaLabel}`}>Tarla</span>
            </div>
            <h3>Kitchen guidance for cooks.</h3>
            <p>Meal instructions sent on WhatsApp, with ingredient substitution handling.</p>
          </article>
        </div>
      </section>

      <section className={styles.whatsappProof} aria-labelledby="whatsapp-title">
        <div className={styles.whatsappHeader}>
          <div><p className={styles.eyebrow}>Live examples</p><h2 id="whatsapp-title">WhatsApp updates you can verify</h2><p>Message outcome, delivery, and reply state are surfaced in the run stream.</p></div>
          <div className={styles.languageSelector} aria-label="Available languages"><span>English</span><span lang="hi">हिंदी</span><span>Hinglish</span></div>
        </div>
        <div className={styles.carouselShell}>
          <button className={`${styles.carouselArrow} ${styles.previousArrow}`} type="button" aria-label="Previous example" onClick={() => showProof(proofIndex - 1)}>←</button>
          <div className={styles.proofTrack} ref={carouselRef} onScroll={syncProofIndex} onKeyDown={handleCarouselKeys} tabIndex={0} role="region" aria-roledescription="carousel" aria-label="Aevia run examples">
            {PROOFS.map((proof, index) => (
              <article className={styles.proofCard} key={`${proof.agent}-${proof.title}`} data-proof-slide={index} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${PROOFS.length}: ${proof.title}`}>
                <div className={styles.chatHeader}>
                  <span className={`${styles.chatAvatar} ${styles[proof.tone]}`} aria-hidden="true">{proof.agent.charAt(0)}</span>
                  <div><strong>{proof.agent}</strong><span>WhatsApp · {proof.title}</span></div>
                </div>
                <div className={styles.messages}>
                  {proof.messages.map((message, messageIndex) => (
                    <div className={`${styles.chatBubble} ${message.direction === "reply" ? styles.replyBubble : styles.agentBubble}`} key={`${message.sender}-${messageIndex}`}>
                      <span className={styles.sender}>{message.sender}</span><p>{message.text}</p><span className={styles.messageTime}>{message.time}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.outcomeNote}><span aria-hidden="true">✓</span><p>{proof.state}</p></div>
              </article>
            ))}
          </div>
          <button className={`${styles.carouselArrow} ${styles.nextArrow}`} type="button" aria-label="Next example" onClick={() => showProof(proofIndex + 1)}>→</button>
        </div>
        <div className={styles.carouselProgress} aria-label={`Example ${proofIndex + 1} of ${PROOFS.length}`}>
          {PROOFS.map((proof, index) => <button key={`${proof.title}-dot`} type="button" className={index === proofIndex ? styles.activeDot : ""} aria-label={`Show ${proof.title}`} aria-current={index === proofIndex ? "true" : undefined} onClick={() => showProof(index)} />)}
        </div>
      </section>

      <section className={styles.trustSection} id="truth">
        <div className={styles.trustInner}>
          <div className={styles.trustLead}>
            <p className={styles.eyebrow}>What Aevia does not do</p>
            <h2>No smart-home control. No appliance automation. No inventory or delivery.</h2>
            <div className={styles.betaNote}><strong>Ground truth</strong><p>Aevia only coordinates household actions on WhatsApp and records what is sent, delivered, acknowledged, and approved.</p></div>
          </div>
          <div className={styles.trustPrinciples}>
            <article><span>Message layer</span><p>WhatsApp messages and replies are the only household execution channel.</p></article>
            <article><span>Human approval</span><p>Important changes pause for approval before completing.</p></article>
          </div>
        </div>
      </section>

      <section className={styles.finalSection} id="trust">
        <div className={styles.finalCta}>
          <div className={styles.finalGlowOne} aria-hidden="true" />
          <div className={styles.finalGlowTwo} aria-hidden="true" />
          <div className={styles.finalContent}>
            <p className={styles.eyebrow}>Private and focused</p>
            <h2>Real household updates.<br />Real replies.<br />No extra promises.</h2>
            <Link href="/onboarding" className={styles.finalButton} onClick={() => void track("cta_clicked", { route: "/", outcome: "footer" })}>Start with Aevia</Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <Wordmark compact />
        <p>Your personal household assistant</p>
        <nav aria-label="Legal and beta links"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/beta">Beta status</Link></nav>
      </footer>
    </main>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`${styles.wordmark} ${compact ? styles.compactWordmark : ""}`} aria-label="Aevia home">
      <Image src="/aevia/brand/wordmark-clean.png" width={compact ? 180 : 260} height={72} sizes={compact ? "56px" : "72px"} alt="" />
    </Link>
  );
}

function CheckIcon() {
  return <span className={styles.checkIcon} aria-hidden="true">✓</span>;
}

function LanguageIcon() {
  return <span className={styles.languageIcon} aria-hidden="true">A/अ</span>;
}
