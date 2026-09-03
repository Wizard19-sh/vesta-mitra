"use client";

import Image from "next/image";
import Link from "next/link";
import { Inter, Playfair_Display } from "next/font/google";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useProductAnalytics } from "../lib/productAnalytics";
import styles from "./aevia.module.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-aevia-inter" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-aevia-playfair",
});

const PROOFS = [
  {
    agent: "Mitra",
    title: "Medicine reminder",
    tone: "mitra" as const,
    messages: [
      { sender: "Mitra", text: "Papa, BP wali dawai ka time ho gaya. Le li?", time: "8:00 PM", direction: "agent" as const },
      { sender: "Papa", text: "Haan beta, le li.", time: "8:04 PM", direction: "reply" as const },
      { sender: "Mitra", text: "Perfect.", time: "8:04 PM", direction: "agent" as const },
    ],
    state: "Papa said he took it — not independently verified.",
  },
  {
    agent: "Mitra",
    title: "Evening walk",
    tone: "mitra" as const,
    messages: [
      { sender: "Mitra", text: "Papa, walk ka time ho gaya. Aaj weather bhi better hai.", time: "6:00 PM", direction: "agent" as const },
      { sender: "Papa", text: "Haan, walk ho gayi.", time: "6:32 PM", direction: "reply" as const },
    ],
    state: "Routine followed through, based on Papa’s reply.",
  },
  {
    agent: "Tarla",
    title: "Lunch change",
    tone: "tarla" as const,
    messages: [
      { sender: "Tarla", text: "Namaste Didi. Aaj lunch mein palak tofu, dal, roti aur salad hai.", time: "10:15 AM", direction: "agent" as const },
      { sender: "Pinky didi", text: "Didi, palak nahi hai.", time: "10:18 AM", direction: "reply" as const },
      { sender: "Tarla", text: "Theek hai. Aaj bhindi aur soy chunk masala kar dete hain. Palak shopping list mein add kar diya.", time: "10:18 AM", direction: "agent" as const },
    ],
    state: "Handled without another call from you.",
  },
];

type MemoryGroup = {
  name: string;
  items: Array<{
    icon: string;
    text: string;
    detail?: string;
    important?: boolean;
  }>;
};

const MEMORY_GROUPS: MemoryGroup[] = [
  {
    name: "Papa",
    items: [
      { icon: "A", text: "Prefers Hinglish" },
      { icon: "W", text: "Walk · weekdays · 6:00 PM" },
      { icon: "+", text: "BP wali dawai", detail: "Exact medicine stored only when confirmed" },
    ],
  },
  {
    name: "Pinky didi",
    items: [
      { icon: "K", text: "Cooks twice daily" },
      { icon: "A", text: "Prefers Hinglish" },
    ],
  },
  {
    name: "Household",
    items: [
      { icon: "V", text: "Vegetarian · Tuesday + Thursday" },
      { icon: "!", text: "Peanut allergy", important: true },
      { icon: "L", text: "Prefers low oil" },
    ],
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
            <a href="#trust">Trust</a>
            <Link href="/beta">Beta</Link>
          </nav>
          <Link className={styles.navCta} href="/onboarding" data-analytics-id="meet_aevia_clicked" onClick={() => void track("cta_clicked", { route: "/", outcome: "header" })}>
            Meet Aevia
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Personal household assistance</p>
            <h1>The everyday things you care about. <em>Taken care of.</em></h1>
            <p className={styles.heroLead}>Meet Aevia — your personal household assistant.</p>
            <p className={styles.heroBody}>Aevia remembers how your household works and handles the everyday follow-through — from your parents’ routines to what gets cooked at home.</p>
            <div className={styles.heroActions}>
              <Link href="/onboarding" className={styles.primaryButton} data-analytics-id="meet_aevia_clicked" onClick={() => void track("cta_clicked", { route: "/", outcome: "hero" })}>
                Meet Aevia
              </Link>
              <a href="#how" className={styles.secondaryButton} data-analytics-id="see_how_it_works_clicked">See how it works</a>
            </div>
            <div className={styles.timeHook}>
              <strong>Get up to 10 hours of your week back.*</strong>
              <span>*An early product hypothesis, not a measured result.</span>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <Image src="/aevia/landing-hero.jpg" alt="An adult daughter and her mother sharing time in a warm contemporary Indian living room" fill preload sizes="(max-width: 900px) calc(100vw - 32px), (max-width: 1280px) 56vw, 720px" className={styles.heroImage} />
            <div className={`${styles.annotation} ${styles.annotationWalk}`}>Papa · evening walk · 6:00 PM <span aria-hidden="true">✓</span></div>
            <div className={`${styles.annotation} ${styles.annotationMedicine}`}>BP wali dawai · 8:00 PM</div>
            <div className={`${styles.annotation} ${styles.annotationDinner}`}>Pinky didi · dinner · 5:30 PM</div>
            <div className={`${styles.annotation} ${styles.annotationFoodRule}`}>Tuesday + Thursday · vegetarian</div>
          </div>
        </div>
      </section>

      <section className={styles.proofStrip} aria-label="Aevia product qualities">
        <div><CheckIcon /><span>Works on WhatsApp</span></div>
        <div className={styles.languageProof}><LanguageIcon /><strong>English · Hindi · Hinglish</strong></div>
        <div><CheckIcon /><span>Remembers your household</span></div>
        <div><CheckIcon /><span>You stay in control</span></div>
      </section>

      <section className={styles.mentalLoad} id="how">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>The household mental load</p>
          <h2>Less remembering. Less deciding. Less following up.</h2>
        </div>
        <div className={styles.loadCanvas}>
          <div className={`${styles.loadCluster} ${styles.parentCluster}`}>
            <h3>Papa</h3><span>BP wali dawai · 8:00 PM</span><span>Walk · 6:00 PM</span><span>Doctor · Thursday</span>
          </div>
          <svg className={styles.loadConnectors} viewBox="0 0 1000 420" role="presentation" aria-hidden="true">
            <path d="M205 80 C370 80 365 285 500 300" /><path d="M170 170 C350 170 375 290 500 300" /><path d="M230 260 C370 260 410 298 500 300" />
            <path d="M795 78 C640 78 635 285 500 300" /><path d="M830 166 C650 166 625 290 500 300" /><path d="M775 252 C630 252 590 298 500 300" /><path d="M820 332 C650 332 600 310 500 300" />
          </svg>
          <div className={styles.handledCore}><span aria-hidden="true">✓</span><strong>Handled by Aevia</strong></div>
          <div className={`${styles.loadCluster} ${styles.kitchenCluster}`}>
            <h3>Kitchen</h3><span>What&apos;s for dinner?</span><span>Pinky didi · 5:30 PM</span><span>Thursday · vegetarian</span><span className={styles.attentionFragment}>Palak unavailable</span>
          </div>
        </div>
        <p className={styles.loadSummary}>The details still belong to your household. You just don&apos;t have to keep all of them in your head.</p>
      </section>

      <section className={styles.specialists} id="specialists">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Specialist assistants</p>
          <h2>One Aevia. The right help when you need it.</h2>
          <p>Start with either. Or both.</p>
        </div>
        <div className={styles.specialistGrid}>
          <article className={styles.specialistCard}>
            <div className={styles.specialistImageFrame}>
              <Image src="/aevia/mitra-identities.jpg" alt="A polished Indian man and woman representing possible Mitra assistant identities" fill sizes="(max-width: 760px) calc(100vw - 32px), 560px" className={styles.specialistImage} />
              <span className={styles.specialistLabel}>Mitra</span>
            </div>
            <h3>A familiar everyday assistant for your parents.</h3>
            <p>Medicines · walks · appointments · everyday routines</p>
          </article>
          <article className={`${styles.specialistCard} ${styles.tarlaCard}`}>
            <div className={styles.specialistImageFrame}>
              <Image src="/aevia/tarla-identity.jpg" alt="A polished Indian woman representing Tarla in a contemporary home" fill sizes="(max-width: 760px) calc(100vw - 32px), 560px" className={`${styles.specialistImage} ${styles.tarlaImage}`} />
              <span className={`${styles.specialistLabel} ${styles.tarlaLabel}`}>Tarla</span>
            </div>
            <h3>Freedom from everyday kitchen coordination.</h3>
            <p>Meal planning · household preferences · cooking coordination · follow-through</p>
          </article>
        </div>
      </section>

      <section className={styles.whatsappProof} aria-labelledby="whatsapp-title">
        <div className={styles.whatsappHeader}>
          <div><p className={styles.eyebrow}>Aevia on WhatsApp</p><h2 id="whatsapp-title">Works where life happens.</h2><p>Conversations in WhatsApp, just like with anyone else.</p></div>
          <div className={styles.languageSelector} aria-label="Available languages"><span>English</span><span lang="hi">हिंदी</span><span>Hinglish</span></div>
        </div>
        <div className={styles.carouselShell}>
          <button className={`${styles.carouselArrow} ${styles.previousArrow}`} type="button" aria-label="Previous WhatsApp example" onClick={() => showProof(proofIndex - 1)}>←</button>
          <div className={styles.proofTrack} ref={carouselRef} onScroll={syncProofIndex} onKeyDown={handleCarouselKeys} tabIndex={0} role="region" aria-roledescription="carousel" aria-label="Household WhatsApp examples">
            {PROOFS.map((proof, index) => (
              <article className={styles.proofCard} key={`${proof.agent}-${proof.title}`} data-proof-slide={index} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${PROOFS.length}: ${proof.title}`}>
                <div className={styles.chatHeader}>
                  <span className={`${styles.chatAvatar} ${styles[proof.tone]}`} aria-hidden="true">{proof.agent.charAt(0)}</span>
                  <div><strong>{proof.agent}</strong><span>WhatsApp · {proof.title}</span></div>
                  <span className={styles.chatStatus}>online</span>
                </div>
                <div className={styles.messages}>
                  {proof.messages.map((message, messageIndex) => (
                    <div className={`${styles.chatBubble} ${message.direction === "reply" ? styles.replyBubble : styles.agentBubble}`} key={`${message.sender}-${messageIndex}`}>
                      <span className={styles.sender}>{message.sender}</span><p>{message.text}</p><span className={styles.messageTime}>{message.time}{message.direction === "reply" && <span aria-label="Sent" className={styles.replyState}>✓✓</span>}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.outcomeNote}><span aria-hidden="true">✓</span><p>{proof.state}</p></div>
              </article>
            ))}
          </div>
          <button className={`${styles.carouselArrow} ${styles.nextArrow}`} type="button" aria-label="Next WhatsApp example" onClick={() => showProof(proofIndex + 1)}>→</button>
        </div>
        <div className={styles.carouselProgress} aria-label={`Example ${proofIndex + 1} of ${PROOFS.length}`}>
          {PROOFS.map((proof, index) => <button key={`${proof.title}-dot`} type="button" className={index === proofIndex ? styles.activeDot : ""} aria-label={`Show ${proof.title}`} aria-current={index === proofIndex ? "true" : undefined} onClick={() => showProof(index)} />)}
        </div>
      </section>

      <section className={styles.memorySection}>
        <div className={styles.memoryIntro}>
          <p className={styles.eyebrow}>Household memory</p>
          <h2>Your household shouldn&apos;t have to explain itself every day.</h2>
          <p>Aevia gradually connects the people, routines and preferences you choose to share.</p>
        </div>
        <div className={styles.memoryTree}>
          <div className={styles.memoryRoot}><span aria-hidden="true">A</span><strong>Household memory</strong></div>
          <div className={styles.memoryTrunk} aria-hidden="true" />
          <div className={styles.memoryBranches}>
            {MEMORY_GROUPS.map((group) => (
              <article className={styles.memoryGroup} key={group.name}>
                <h3>{group.name}</h3>
                <div className={styles.memoryItems}>
                  {group.items.map((item) => (
                    <div className={`${styles.memoryItem} ${item.important ? styles.importantMemory : ""}`} key={item.text}>
                      <span aria-hidden="true">{item.icon}</span><p>{item.text}{item.detail && <small>{item.detail}</small>}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.trustSection} id="trust">
        <div className={styles.trustInner}>
          <div className={styles.trustLead}>
            <p className={styles.eyebrow}>Quiet augmentation</p>
            <h2>Works naturally on WhatsApp — in English, Hindi and Hinglish.</h2>
            <div className={styles.betaNote}><strong>Clear about beta</strong><p>Aevia is currently in closed beta. It can make mistakes or misunderstand messages, so important information and decisions should still be reviewed.</p></div>
          </div>
          <div className={styles.trustPrinciples}>
            <article><span>Remembers context</span><p>Your household shouldn&apos;t have to explain itself every day.</p></article>
            <article><span>Knows when to ask</span><p>Important changes stay under your control.</p></article>
            <article><span>Works where life already happens</span><p>WhatsApp. English. Hindi. Hinglish.</p></article>
          </div>
        </div>
      </section>

      <section className={styles.finalSection}>
        <div className={styles.finalCta}>
          <div className={styles.finalGlowOne} aria-hidden="true" /><div className={styles.finalGlowTwo} aria-hidden="true" />
          <div className={styles.finalAnnotation} aria-hidden="true"><span>Papa · walk done</span><span>Dinner · handled</span></div>
          <div className={styles.finalContent}>
            <p className={styles.eyebrow}>A little less on your mind</p>
            <h2>Less remembering.<br />Less following up.<br /><em>More time for what matters.</em></h2>
            <Link href="/onboarding" className={styles.finalButton} data-analytics-id="meet_aevia_clicked" onClick={() => void track("cta_clicked", { route: "/", outcome: "footer" })}>Meet Aevia</Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <Wordmark compact />
        <nav aria-label="Legal and beta links"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/beta">Beta status</Link></nav>
        <p>© 2026 Aevia Household. All rights reserved.</p>
      </footer>
    </main>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`${styles.wordmark} ${compact ? styles.compactWordmark : ""}`} aria-label="Aevia home">
      <Image src="/aevia/aevia-wordmark.jpg" width={1024} height={1024} sizes={compact ? "56px" : "72px"} alt="" />
    </Link>
  );
}

function CheckIcon() {
  return <span className={styles.checkIcon} aria-hidden="true">✓</span>;
}

function LanguageIcon() {
  return <span className={styles.languageIcon} aria-hidden="true">A/अ</span>;
}
