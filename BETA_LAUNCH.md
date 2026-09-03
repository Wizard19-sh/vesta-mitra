# Aevia Build Week and Closed-Beta Execution Plan

## Purpose

This document is the canonical execution order after the W4 checkpoint and the local M5 functional skeleton. M5 visual/product acceptance is not complete; Figma is being developed separately as the UX/UI source of truth.

The visible product brand is **Aevia**. Internal Vesta and `vesta-mitra` identifiers remain unchanged until a separate migration is approved.

Primary GrowthX track:

> **AI Agent as a Service**

Do not change the primary track without explicit user approval.

## Governing evidence rule

> **Every high-weight rubric milestone must produce evidence at the same time it produces functionality.**

Working on the developer machine is not enough for evidence completion. Every qualifying milestone must include a safe proof record in [EVIDENCE.md](./EVIDENCE.md) as part of acceptance.

Use this prioritization:

```text
weight
× achievable level gain
× confidence
÷ implementation time
```

Do not spend significant time on a low-weight row while an achievable high-weight row remains below its target.

## Status meanings

- **COMPLETE:** finished and verified for the current checkpoint.
- **IMPLEMENTED LOCALLY:** code/build exists, but required browser or user evidence is still pending.
- **ACTIVE RULE:** applies to every following milestone.
- **NEXT:** next approved work; not started by this document.
- **PENDING APPROVAL:** requires explicit approval, consent, credentials, production change, or real-recipient action.
- **FUTURE:** after the core product/evidence path is stable.

## P0 — CONTROL + EVIDENCE

1. **Complete documentation/control plane — COMPLETE.**
   - Canonical scope, architecture, eval, language, changelog, evidence, and launch-plan documents exist locally.
   - This documentation milestone remains uncommitted until separately approved.

2. **Maintain `EVIDENCE.md` from this point forward — ACTIVE RULE.**
   - Give every proof a unique evidence ID.
   - Assign one primary scoring row.
   - Record related rows without double-counting.

3. **Get non-developer real-surface evidence — NEXT, PENDING APPROVAL.**
   - Keep developer/test evidence labeled accurately.
   - Progress through household control, target recipients, and external households with explicit consent.

4. **Capture evidence simultaneously with every qualifying run — ACTIVE RULE.**
   - Evidence fields belong in acceptance criteria, not as an afterthought.
   - Use safe references and redact unnecessary personal data.

5. **Integrate analytics before wider distribution — NEXT.**
   - Capture web funnel, activation, execution, retention, and traffic-source evidence.
   - Do not send sensitive message, medical, phone, or household content to product analytics.

## P0 — REAL USERS

6. **Same-household non-developer control where useful — PENDING APPROVAL.**
   - Record it as `HOUSEHOLD CONTROL`, not external beta evidence.
   - Do not infer a particular level from recipient class alone. Use the exact L4/L5 criteria in `EVIDENCE.md` and capture qualifying proof.

7. **Real senior/father → Mitra — PENDING APPROVAL.**
   - Confirm introduction, consent, channel readiness, and a low-risk agreed routine.
   - Capture evidence at the same time as the real run.

8. **Real cook/cooking person → Tarla — PENDING APPROVAL.**
   - Primary user primes the recipient.
   - Confirm consent/readiness before any scheduled instruction.

9. **Two to three external households — PENDING APPROVAL.**
   - Each household must be outside the founder’s household.
   - Keep unique primary-user, household, senior, and cooking-person counts separate.

10. **Record actual feedback and failures — ACTIVE RULE once testing starts.**
    - Preserve expected/actual behavior, cause, product/code change, and rerun result.
    - Convert appropriate real failures into regression evals.

## P1 — PRODUCT

11. **Landing page — FUNCTIONAL SKELETON LOCAL; visual acceptance failed.**
    - Introduce Aevia, Mitra, Tarla, trust, WhatsApp behavior, language, and truthful product proof.
    - Treat “up to 10 hours” as an unvalidated hypothesis.

12. **Signup plus Beta Terms/Privacy acceptance — IMPLEMENTED LOCALLY; approved Figma treatment pending.**
    - Explicit acceptance control.
    - Store policy/version and acceptance timestamp.
    - Progressive safety disclosure rather than a wall of legal text.

13. **Shared onboarding — FUNCTIONAL BOTH FLOW COMPLETED; edit-path verification pending development sync.**
    - One Aevia household identity and shared context.
    - Do not make users create duplicate specialist household profiles.

14. **Mitra/Tarla/Both specialist onboarding — FUNCTIONAL BOTH FLOW COMPLETED; visual acceptance pending.**
    - Let the primary user activate either specialist or both.
    - Capture execution-side recipient role, language, readiness, and consent separately.

15. **User dashboard — IMPLEMENTED LOCALLY; browser acceptance pending.**
    - Household setup, routines, plans, history, approvals, exceptions, and settings.

16. **“What Aevia Knows” — M5 PREVIEW IMPLEMENTED LOCALLY.**
    - Narrative, inspectable household context with source and correction/removal controls where implemented.
    - Do not present a raw database dump.

## P1 — AGENT EVIDENCE

17. **Reviewer-visible Agent Runs — M5 HOUSEHOLD-SCOPED SLICE IMPLEMENTED LOCALLY; reviewer proof pending.**
    - Select a run and see agent, task, ordered steps, timestamps, state transitions, provider state, inbound signal, interpretation, errors, latency, and token/cost where applicable.
    - Mask or minimize sensitive content.
    - A judge should not need local command-line knowledge.

18. **Exception/admin queue — NEXT.**
    - Auto-resolve, resolve-and-notify, ask-primary-user, and human/admin-review paths.
    - Preserve resolution and feed suitable outcomes into memory/evals.

19. **Make eval evidence inspectable — NEXT.**
    - Show named case, expected, actual, version/commit, timestamp, pass/fail, failure cause, iteration, and rerun.

20. **Implement genuine Aevia manager/orchestration if the core product path is stable — NEXT, CONDITIONAL.**
    - Do not split Mitra or Tarla artificially for scoring.
    - Prove intent → context → specialist choice → delegation → execution → returned result → combined state/memory.

## P1 — LAUNCH INFRASTRUCTURE

21. **Dedicated Aevia WhatsApp sender / Meta production setup — PENDING APPROVAL.**
    - Dedicated Aevia Meta production number is required before launch.
    - Preserve provider-neutral business logic.

22. **Production secrets/configuration — PENDING APPROVAL.**
    - Use approved server secret configuration.
    - Never store credentials in source, user data, tracked evidence, or chat.

23. **Closed-beta smoke tests — PENDING APPROVAL.**
    - Run only after production configuration and recipient consent are ready.
    - Capture evidence and rollback/incident notes with the test.

## PARALLEL DISTRIBUTION

24. **Get the product into users’ hands — NEXT after minimum beta readiness.**

25. **Three posts per day — NEXT.**
    - Preserve URLs, timestamps, platform, topic, and traffic tags.

26. **Instagram launch/demo video — NEXT.**
    - Record the post URL, timestamp, audience metrics, and resulting product traffic.

27. **Track URLs, impressions, visitors, signups, and meaningful actions — NEXT.**
    - Use read-only analytics evidence where required.
    - Keep paid, organic social, direct, referral, and other sources distinguishable.

28. **Preserve evidence for cross-track bonus where eligible — ACTIVE RULE.**
    - Do not reuse primary-track evidence to raise a bonus row.
    - Apply Virality anti-spoof and ad weighting exactly as recorded in `EVIDENCE.md`.

## P2 / AFTER CORE

29. **Richer provenance memory implementation — FUTURE after higher-weight gaps.**
    - Source/type, verification, confirmer, validity, active state, and correction history.

30. **Voice input — FUTURE.**

31. **Further Tarla planner optimization — FUTURE.**

32. **Broader Mitra conversational evolution — FUTURE.**
    - Familiarity grows from real engagement, never synthetic companionship.

## Real-user sequence and evidence labels

Do not collapse these into one generic “user” count:

| Label | Definition | Evidence meaning |
| --- | --- | --- |
| `DEVELOPER TEST` | Founder/developer is the recipient | Technical real-surface proof in a controlled cohort |
| `HOUSEHOLD CONTROL` | Non-developer in the founder’s household | Non-developer household proof, not external beta |
| `TARGET RECIPIENT` | Actual senior or actual cook/cooking person | Proof with the intended execution-side role |
| `EXTERNAL BETA` | Household outside the founder’s household | External product evidence |

Stronger evidence should progress safely from technical proof to the intended recipient role and then external households. Never relabel an earlier cohort to make a claim look stronger.

## Gates before wider cohort

Before sending the product to a wider cohort:

- analytics is active and privacy-checked
- Beta Terms and Privacy acceptance is active and versioned
- relevant safety disclosures are visible
- each recipient has the right introduction and consent/readiness
- dedicated production sender/configuration is ready
- reviewer-visible runs and exception handling are usable by beta operations
- smoke tests pass
- evidence capture is part of the run checklist

## Current highest-weight next actions

After this cleanup is accepted, the intended sequence is:

1. Make Figma the UX/UI source of truth.
2. Implement the approved Figma product flow.
3. Connect product analytics.
4. Move toward a dedicated Aevia production WhatsApp sender.
5. Capture a real household control.
6. Capture a real senior Mitra run.
7. Capture a real cook Tarla run.
8. Expand to external beta households.
9. Build Observability L4.
10. Build Evals and iteration L4.
11. Build Aevia orchestration to Agent org structure L4.
12. Prove Handoffs and memory L4.
13. Build Management UI L4.
14. Run distribution and submission evidence work in parallel.

Strategic targets are Real output L5; Observability L4; Agent org structure L4; Evals and iteration L4; Handoffs and memory L4 initially; Cost and latency at the highest genuinely measured tier; and Management UI L4. These are targets, not current claims.

Low-weight polish must not displace these actions.

## Stop conditions that remain in force

This document does not authorize:

- messaging a real recipient
- production deployment or configuration
- Git push
- product/UI implementation
- new provider credentials
- dynamic orchestration implementation
- distribution posting

Each requires its own approved milestone or explicit approval.
