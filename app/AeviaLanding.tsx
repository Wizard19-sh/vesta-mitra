"use client";

import Image from "next/image";
import Link from "next/link";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useProductAnalytics } from "../lib/productAnalytics";
import styles from "./aevia.module.css";

const PROOFS = [
  {
    agent: "Mitra",
    tone: "mitra" as const,
    title: "Medicine reminder",
    messages: [
      { sender: "Mitra", text: "Papa, BP wali dawai ka time ho gaya. Le li?", time: "8:00 PM", direction: "agent" as const },
      { sender: "Papa", text: "Haan beta, le li.", time: "8:04 PM", direction: "reply" as const },
      { sender: "Mitra", text: "Achha, theek hai.", time: "8:04 PM", direction: "agent" as const },
    ],
    state: "Papa said he took his BP medicine.",
  },
  {
    agent: "Mitra",
    tone: "mitra" as const,
    title: "Evening walk",
    messages: [
      { sender: "Mitra", text: "पापा, शाम की सैर का समय हो गया। आज 6 बजे जाना था न?", time: "6:00 PM", direction: "agent" as const },
      { sender: "Papa", text: "हो गई। अभी घर आया हूँ।", time: "6:42 PM", direction: "reply" as const },
      { sender: "Mitra", text: "अच्छा, ठीक है।", time: "6:42 PM", direction: "agent" as const },
    ],
    state: "Papa said his walk is done.",
  },
  {
    agent: "Tarla",
    tone: "tarla" as const,
    title: "Missing ingredient",
    messages: [
      { sender: "Tarla", text: "Pinky didi, aaj dinner mein palak tofu, dal, roti aur salad hai.", time: "10:15 AM", direction: "agent" as const },
      { sender: "Pinky didi", text: "Palak nahi hai.", time: "10:18 AM", direction: "reply" as const },
      { sender: "Tarla", text: "Koi baat nahi didi. Palak tofu ki jagah bhindi kar lete hain. Baaki same rahega.", time: "10:18 AM", direction: "agent" as const },
    ],
    state: "Palak wasn’t available, so Tarla changed the sabzi and added palak to the list. Everything else stayed the same.",
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
    <main className={styles.siteShell}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Wordmark />
          <nav className={styles.primaryNav} aria-label="Primary navigation">
            <a href="#how">How it works</a>
            <a href="#specialists">Mitra &amp; Tarla</a>
            <a href="#trust">Trust</a>
            <Link href="/beta">Beta</Link>
          </nav>
          <Link className={styles.navCta} href="/onboarding" onClick={() => void track("cta_clicked", { route: "/", outcome: "header" })}>
            Hello Aevia
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Personal household assistance</p>
            <h1>The everyday things you care about. <em>Taken care of.</em></h1>
            <p className={styles.heroLead}>Meet Aevia — your personal household assistant.</p>
            <p className={styles.heroBody}>
              From your parents’ agreed routines to what gets cooked at home, Aevia keeps the everyday follow-through moving — without you chasing every step.
            </p>
            <div className={styles.heroActions}>
              <Link href="/onboarding" className={styles.primaryButton} onClick={() => void track("cta_clicked", { route: "/", outcome: "hero" })}>
                Hello Aevia
              </Link>
              <a href="#how" className={styles.secondaryButton}>See how it works</a>
            </div>
            <p className={styles.heroBody}>Currently in closed beta.</p>
          </div>

          <div className={styles.heroVisual}>
            <Image className={styles.heroImage} src="/aevia/landing-hero.jpg" alt="A family using Aevia together at home" fill priority sizes="(max-width: 900px) 100vw, 54vw" />
            <span className={`${styles.annotation} ${styles.annotationWalk}`}>Papa’s walk · 6 PM</span>
            <span className={`${styles.annotation} ${styles.annotationMedicine}`}>BP wali dawai · asked</span>
            <span className={`${styles.annotation} ${styles.annotationDinner}`}>Dinner · palak unavailable</span>
            <span className={`${styles.annotation} ${styles.annotationFoodRule}`}>Tuesday · vegetarian</span>
          </div>
        </div>
      </section>

      <section className={styles.proofStrip} aria-label="Aevia capabilities">
        <div><CheckIcon /><span>Works on WhatsApp</span></div>
        <div className={styles.languageProof}><LanguageIcon /><strong>English · Hindi · Hinglish</strong></div>
        <div><CheckIcon /><span>Remembers your household</span></div>
        <div><CheckIcon /><span>You stay in control</span></div>
      </section>

      <section className={styles.mentalLoad} id="how">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>The household mental load</p>
          <h2>Less remembering. Less deciding. Less following up.</h2>
          <p>The reminders you care about. Without becoming the reminder person.</p>
        </div>
        <div className={styles.loadCanvas}>
          <div className={`${styles.loadCluster} ${styles.parentCluster}`}>
            <h3>Parents and routines</h3>
            <span>“Papa, dawai le li?”</span>
            <span>“Kal appointment hai na?”</span>
          </div>
          <div className={`${styles.loadCluster} ${styles.kitchenCluster}`}>
            <h3>Meals and kitchen</h3>
            <span>“Khaane mein kya banega?”</span>
            <span>“Cook ko bata diya?”</span>
          </div>
        </div>
        <div className={styles.sectionIntro}>
          <p>The questions are small. Carrying all of them is not.</p>
          <p>Tell Aevia which routines matter. It keeps the follow-through moving with the people you’ve chosen — and brings you in when something changes or needs your say.</p>
          <h2>Connection stays human. Aevia takes on the coordination.</h2>
        </div>
      </section>

      <section className={styles.specialists}>
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>What could that add up to?</p>
          <h2>Up to 10 hours back in your week.*</h2>
          <p>*That’s our early hypothesis. We’re measuring it through the beta.</p>
        </div>
      </section>

      <section className={styles.specialists} id="specialists">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Meet the specialists</p>
          <h2>One Aevia. The right help when you need it.</h2>
          <p>Start with Mitra, Tarla — or both. Aevia keeps the context connected.</p>
        </div>
        <div className={styles.specialistGrid}>
          <article className={styles.specialistCard}>
            <div className={styles.specialistImageFrame}>
              <Image className={styles.specialistImage} src="/aevia/mitra-intro.jpg" alt="Older adults walking together in a garden" fill sizes="(max-width: 760px) 100vw, 46vw" />
              <span className={styles.specialistLabel}>Mitra</span>
            </div>
            <h3>A familiar everyday assistant for your parents.</h3>
            <p>Mitra supports parents, grandparents and senior family members with agreed routines such as medicine reminders, walks and appointments.</p>
            <p>It speaks to them the way your family is comfortable with.</p>
          </article>
          <article className={`${styles.specialistCard} ${styles.tarlaCard}`}>
            <div className={styles.specialistImageFrame}>
              <Image className={`${styles.specialistImage} ${styles.tarlaImage}`} src="/aevia/tarla-intro.jpg" alt="A home cook preparing a meal in the kitchen" fill sizes="(max-width: 760px) 100vw, 46vw" />
              <span className={`${styles.specialistLabel} ${styles.tarlaLabel}`}>Tarla</span>
            </div>
            <h3>Your kitchen, minus the daily back-and-forth.</h3>
            <p>Tarla plans meals around what your household actually eats, coordinates with whoever cooks, and handles the everyday changes that usually come back to you.</p>
          </article>
        </div>
      </section>

      <section className={styles.whatsappProof} aria-labelledby="whatsapp-title">
        <div className={styles.whatsappHeader}>
          <div><p className={styles.eyebrow}>Aevia on WhatsApp</p><h2 id="whatsapp-title">No new app for Papa. No new system for the cook.</h2><p>Mitra and Tarla work through WhatsApp, in the language each person is comfortable with.</p></div>
          <div className={styles.languageSelector} aria-label="Available languages"><span>English</span><span>Hindi</span><span>Hinglish</span></div>
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

      <section className={styles.trustSection}>
        <div className={styles.trustInner}>
          <div className={styles.trustLead}>
            <p className={styles.eyebrow}>How Aevia works</p>
            <h2>Tell Aevia what matters. Then let it take the follow-through.</h2>
          </div>
          <div className={styles.trustPrinciples}>
            <article><span>1. Tell Aevia how your home works</span><p>Who’s at home. What Aevia should call them. The routines, languages, food preferences and timings that matter.</p></article>
            <article><span>2. Choose the help you want</span><p>Use Mitra for agreed parent and senior routines, Tarla for meals and kitchen coordination — or both.</p></article>
            <article><span>3. Get the outcome, not the running commentary</span><p>Aevia shows you what was handled, what changed and what genuinely needs your decision.</p></article>
          </div>
        </div>
      </section>

      <section className={styles.specialists}>
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Remembers your household</p>
          <h2>Your home has a way of doing things. Aevia remembers it.</h2>
          <p>Aevia remembers the context you choose to share — people, relationships, routines, languages, food preferences, who cooks and what is only true for now.</p>
        </div>
        <div className={styles.specialistGrid}>
          <article className={styles.specialistCard}><h3>Papa</h3><p>Prefers Hinglish</p><p>Evening walk · weekdays · 6 PM</p><p>“BP wali dawai” · familiar household name</p></article>
          <article className={`${styles.specialistCard} ${styles.tarlaCard}`}><h3>Household and kitchen</h3><p>Pinky didi · comes twice daily · prefers Hinglish</p><p>Tuesday · vegetarian</p><p>Peanuts · must avoid</p><p>No paneer this week · ends Sunday</p></article>
        </div>
        <div className={styles.sectionIntro}><p>You decide what Aevia remembers. Temporary details stay temporary. Important changes still need your say.</p></div>
      </section>

      <section className={styles.trustSection} id="trust">
        <div className={styles.trustInner}>
          <div className={styles.trustLead}>
            <p className={styles.eyebrow}>Trust, built into the follow-through</p>
            <h2>Helpful enough to act. Careful enough to ask.</h2>
            <div className={styles.betaNote}><strong>Closed beta</strong><p>Aevia acts within the routines and choices you set. When something is unclear, important or outside those limits, it asks.</p></div>
          </div>
          <div className={styles.trustPrinciples}>
            <article><span>You decide</span><p>Choose who Aevia contacts, what it helps with and which changes need your approval.</p></article>
            <article><span>Honest about what happened</span><p>If Papa says he took his medicine, Aevia tells you exactly that. It doesn’t pretend it saw it happen.</p></article>
            <article><span>Clear about beta</span><p>Aevia is currently in closed beta. It can misunderstand a message or make a mistake, so important information and decisions should still be reviewed.</p></article>
            <article><span>Current boundaries</span><p>Mitra supports everyday routines. It is not medical or emergency monitoring. Tarla supports meal planning. It does not provide medical nutrition advice.</p><p>WhatsApp is the main conversation surface in the current closed beta. English, Hindi and Hinglish are supported.</p></article>
          </div>
        </div>
      </section>

      <section className={styles.mentalLoad}>
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>What we heard in research</p>
          <h2>If the help gives you one more person to coordinate, it isn’t helping.</h2>
          <p>The whole point is to take coordination off your plate — not add another person between you and your household.</p>
          <p>That principle shapes Aevia: handle the routine follow-through, surface the exceptions, bring you in when your decision actually matters.</p>
          <p>Early research insight · paraphrased</p>
        </div>
      </section>

      <section className={styles.finalSection}>
        <div className={styles.finalCta}>
          <div className={styles.finalGlowOne} aria-hidden="true" />
          <div className={styles.finalGlowTwo} aria-hidden="true" />
          <div className={styles.finalContent}>
            <p className={styles.eyebrow}>A little less on your mind</p>
            <h2>Less remembering.<br />Less following up.<br />More time for what matters.</h2>
            <p>Tell Aevia what matters at home. Start with Mitra, Tarla — or both.</p>
            <Link href="/onboarding" className={styles.finalButton} onClick={() => void track("cta_clicked", { route: "/", outcome: "footer" })}>Hello Aevia</Link>
            <p>Currently in closed beta.</p>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <Wordmark compact />
        <p>Personal household assistance for the everyday.</p>
        <nav aria-label="Legal and beta links"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/beta">Beta status</Link></nav>
        <p>© 2026 Aevia. Closed beta.</p>
      </footer>
    </main>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`${styles.wordmark} ${compact ? styles.compactWordmark : ""}`} aria-label="Aevia home">
      <Image src="/aevia/brand/wordmark-clean.png" fill sizes={compact ? "72px" : "88px"} alt="" />
    </Link>
  );
}

function CheckIcon() {
  return <span className={styles.checkIcon} aria-hidden="true">✓</span>;
}

function LanguageIcon() {
  return <span className={styles.languageIcon} aria-hidden="true">A/अ</span>;
}
