# Aevia shared product context

Use this briefing to orient project-local skills. Confirm task-specific facts in the canonical repository documents before making claims.

## Source order

1. The user's current instruction.
2. The latest verified state in [EVIDENCE.md](../../../EVIDENCE.md), [EVALS.md](../../../EVALS.md), and [CHANGELOG.md](../../../CHANGELOG.md).
3. Product direction and capability boundaries in [IDEA_SCOPE.md](../../../IDEA_SCOPE.md).
4. System truth in [ARCHITECTURE.md](../../../ARCHITECTURE.md).
5. Voice and wording rules in [PRODUCT_LANGUAGE.md](../../../PRODUCT_LANGUAGE.md).
6. Work order and approval gates in [BETA_LAUNCH.md](../../../BETA_LAUNCH.md).

The canonical documents contain dated sections. New verified evidence may update an older CURRENT/NEXT statement. Do not resolve a mismatch by claiming the stronger capability; state the conflict or use the latest verified record.

## Product model

- **Aevia** is the customer-facing personal household assistant and shared household layer.
- **Hello Aevia** is the name of the public web and onboarding experience.
- **Mitra** supports agreed everyday routines for parents, grandparents, and other senior family members.
- **Tarla** plans meals and coordinates the kitchen with the person who cooks.
- Vesta and `vesta-mitra` remain valid internal technical names during Build Week.
- The core promise is reduced household mental load while human connection, user control, and recipient dignity remain intact.
- Aevia is currently a shared hub with specialists. Dynamic request planning and manager-to-specialist delegation are future work.

## Capability labels

- **CURRENT:** implemented and verified for the named checkpoint.
- **IMPLEMENTED LOCALLY:** code exists locally, but required browser, user, or reviewer evidence is incomplete.
- **NEXT:** intended work, not implemented or not verified.
- **FUTURE:** direction only.
- **OPEN:** requires a product, legal, security, privacy, or operating decision.
- **DESIGN-ONLY:** shown in an approved or exploratory design but not established as product behavior.

Use these labels in internal handoffs. Convert them to plain language for customers without erasing the limitation.

## Current verified foundation

- Shared household, member, preference, communication, scheduler, inbound, and run infrastructure exists.
- Mitra scheduled routines and raw-first, self-report-safe reply handling are verified in development.
- Tarla structured meal/day planning, deterministic nutrition, approval, scheduled cooking-person instructions, and a bounded missing-ingredient path are verified in development.
- Provider-neutral messaging, development transport, and controlled Meta WhatsApp test loops are verified. A dedicated production Aevia sender is not configured.
- The M5 Aevia landing, shared onboarding, dashboard, legal pages, first-party event ledger, and household-scoped run viewer are implemented locally, but visual/product and full browser acceptance remain incomplete.
- The current browser identity is device-bound local storage, not production authentication or cross-device account access.
- The current admin run view is not a complete role-protected operations console.
- Direct user-research evidence exists in the [2026-08-30 voice-memo transcript set](../../../research/user-interviews/2026-08-30-voice-memo-transcripts.docx). It contains nine auto-transcribed recordings and quotable source material subject to audio verification. No publication-approved testimonial or exact-copy user validation is recorded.

Before describing a flow as accepted or implementation-ready, check the current implementation blockers and verification limits in the manual acceptance log in [EVIDENCE.md](../../../EVIDENCE.md). Do not repeat that blocker register in another governance file.

## Meaning that must stay intact

- A senior's statement that an action happened is a self-report, not independent verification.
- System truth is not the same as system language in human conversation. Preserve one truth while adapting its wording for household conversation, primary-user reporting, and admin/observability.
- Provider requested, accepted, sent, delivered, read, replied, interpreted, and completed are different states.
- Raw inbound content remains distinct from Aevia's interpretation.
- Nutrition is estimated deterministically from structured data; it is not medical nutrition advice.
- “Up to 10 hours a week” is an unvalidated marketing hypothesis, not a measured result.
- Situational or temporary context must not be written as a permanent preference.
- A familiar medicine label such as “BP wali dawai” must not be presented as a confirmed exact medicine name unless that exact name has been confirmed.
- Relationship terms and respectful references are configured household context. Never guess them. “Cooking person” is an internal role term, not default human-facing language.
- The primary user's acceptance does not create consent for every senior, cooking person, or household member.
- Aevia is assistant software. It must not impersonate a person or replace family connection.

## Not currently safe to claim

- fully autonomous or dynamic household orchestration;
- independent verification of medicine, walks, appointments, cooking, or other real-world action;
- production-grade authentication, admin access control, sensitive-data reveal auditing, deletion, export, or recovery;
- week-level Tarla planning, broad recipe provenance, grocery ordering, prescription extraction, voice, or emergency monitoring;
- production launch readiness, external-beta acceptance, measured time savings, or a higher GrowthX level without recorded evidence.

## Content and design direction

- Preserve Quiet Augmentation / Aevia Modern Domestic: calm help that removes coordination burden without taking over relationships.
- Optimize customer-facing content for truth + warmth + humanness. Do not turn accurate system states into policy-like or developer-facing customer copy.
- Preserve strong approved brand language unless a genuine factual or safety problem requires a change.
- “Hello Aevia” is the owner-approved primary CTA. “Meet Aevia — your personal household assistant.” is the approved supporting brand copy. Do not interchange them or mechanically replace one with the other.
- The landing navigation recommendation is **How it works**, **Mitra & Tarla**, **Trust**, **Beta**. Do not show Pricing or Blog until those destinations exist.
- Never publish placeholder testimonials. The owner-approved Hello Aevia landing uses an anonymous paraphrased research insight labelled as research, not a participant quote or testimonial.
- The owner-approved landing treatment places “Up to 10 hours back in your week.*” after the mental-load section with the mandatory footnote “*That’s our early hypothesis. We’re measuring it through the beta.” It remains a hypothesis, not a measured outcome, and must not move into the hero.
- The exact owner-approved landing copy and implementation notes are canonical in [content/hello-aevia-landing.md](../../../content/hello-aevia-landing.md).
- Landing copy should communicate that Aevia removes routine coordination. It must not sound like another intermediary the primary user has to manage.
- Keep research evidence, quotable source material, publication-approved testimonials, owner-approved copy, product-verified behavior, and user-validated wording distinct. Research may inform content without granting permission to publish a participant quote.
- Use the approved Aevia logo treatment; content review does not authorize visual redesign.
- The approved consumer designs and Stitch work are specifications or references, not proof of implementation.
- Admin and observability language must prefer honest missing states—“not tracked,” “not available,” or “awaiting evidence”—over invented values.

## Safety and privacy

- Do not place real phone numbers, credentials, provider IDs, raw medical details, or unnecessary personal data in tracked examples or evidence.
- Mask sensitive admin content by default in designs and copy. Do not imply controlled reveal or audit exists until implemented.
- Important medical, allergy, treatment, consent, and other high-impact changes need the appropriate human confirmation.
- Terms, Privacy, retention, deletion, and jurisdiction-specific claims require legal review and matching product behavior before production use.
