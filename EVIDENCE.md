# Aevia GrowthX Evidence Plan

## Canonical scoring reference

This document uses the **GrowthX Build Week rubric v2.2.0** supplied directly from the GrowthX Build Week Scoring page / Build Week agent.

Primary planned track:

> **AI Agent as a Service**

Do not switch the primary track without explicit user approval.

### Scoring mechanic

Points per row:

```text
(L - 1) × weight
```

- L1 = 0 points.
- L3 = half of L5.
- L4 and L5 require verifiable evidence such as a URL, timestamp, table count, analytics view, or replayable/inspectable product evidence.
- Without verifiable evidence, a row caps at L3.
- The same piece of evidence cannot raise two separate rows.
- Real output supports uncapped overflow.

The AI Agent as a Service track has **164 base points plus overflow**.

Canonical L3/L4/L5 wording has now been supplied for all seven primary rows. Canonical L2 wording has not been supplied, so this document does not invent L2 labels or award inferred L2 points.

| Exact rubric row | Weight | L3 | L4 | L5 |
| --- | ---: | --- | --- | --- |
| Real output on a real surface | 20x | Works, but staged/test surface only | Real output on real surfaces but the builder has to babysit (human approves every step). | Autonomously completes a real task in declared domain end-to-end, output lands on real live surfaces (live site, real ATS, real support queue, real repo), production quality. |
| Observability | 7x | Pull up one run, see each agent step by step | Trace tree across agents (who called whom), token and cost per step, filter by agent or task. | Production-grade: diff two runs side by side, alerts on failure or cost spike, search across runs, senior eng would trust this to debug prod. |
| Agent org structure | 5x | Manager + specialists, static routing | Dynamic: manager agent plans subtasks based on the specific request, delegates, reviews outputs. | Emergent org: manager spawns sub-specialists on the fly, agents escalate when stuck, roles self-adjust to task. |
| Evals and iteration | 5x | Named eval set, run manually between versions | Automated eval pipeline, CI-style, fails a release if quality drops. | Closed-loop: failed runs feed a growing eval set, version-controlled prompts and agents, measurable gains across versions. |
| Handoffs and memory | 2x | Short-term memory within one task | Persistent memory across tasks (remembers past customers, past projects). | Hierarchical: working memory (current task) + episodic (past tasks) + semantic (domain facts, team norms). |
| Cost and latency | 1x | 5–10 min OR $0.50–$2 | 1–5 min OR $0.10–$0.50 | Under 1 min AND under $0.10. |
| Management UI | 1x | A PM could operate it with docs | Clean UI, non-eng operates with one walkthrough. | Delightful UI, non-eng volunteer defines a new agent role (job, tools, guardrails) in under 10 min unassisted. |

Known point totals are L4: Real output 60, Observability 21, Agent org structure 15, Evals and iteration 15, Handoffs and memory 6, Cost and latency 3, Management UI 3. L5 totals are 80, 28, 20, 20, 8, 4, and 4 respectively. Real output also supports `+1 × 20x` overflow for every additional real task completed autonomously during judging.

For Cost and latency, the lower qualifying tier governs. For example, 40 seconds at $0.60 is L3, not L5. Actual cost and latency must be measured; neither may be inferred or fabricated.

## Governing Build Week evidence principle

> **Every high-weight rubric milestone must produce evidence at the same time it produces functionality.**

A feature is not evidence-complete merely because it works on the developer machine. Evidence capture belongs in the acceptance criteria for every important milestone.

For an evidence-ready real Mitra senior run, capture where appropriate:

- evidence ID
- consenting recipient type
- date and time
- run ID
- real surface
- redacted screenshot or safe reference
- ordered/replayable trace
- provider state
- inbound response when applicable
- interpretation
- final state and outcome
- latency and cost where available
- feedback
- exception, if any
- resulting iteration, if any
- analytics reference, when available
- one primary rubric row supported

Use pseudonyms and recipient roles. Do not put phone numbers, secrets, medical information, or unnecessary personally identifiable information in this ledger.

## Conservative current baseline

This is a planning assessment, not an official judge score.

| Row | Weight | Current claimed level | L3 achieved? | Planning points | Confidence |
| --- | ---: | --- | --- | ---: | --- |
| Real output on a real surface | 20x | L3 | Yes | 40 | High |
| Observability | 7x | Below L3; exact canonical L2 wording not supplied | No, pending reviewer-accessible proof | Not assigned | Medium |
| Agent org structure | 5x | Below L3; exact canonical L2 wording not supplied | No | Not assigned | High |
| Evals and iteration | 5x | L3 | Yes | 10 | High |
| Handoffs and memory | 2x | L3 | Yes | 4 | High |
| Cost and latency | 1x | Not claimed | Not established | 0 | Low |
| Management UI | 1x | L1 | No | 0 | High |

Conservative subtotal from rows currently claimed at a supplied threshold: **54 base points**. No points are assigned here to rows below L3 when canonical L2 wording is missing. Cost and latency remains unscored, and no L4/L5, overflow, or cross-track bonus is claimed. This remains a planning assessment, not an official judge score.

Strategic targets, not current claims: Real output L5; Observability L4; Agent org structure L4; Evals and iteration L4; Handoffs and memory L4 initially; Cost and latency at the highest tier supported by measured evidence; Management UI L4.

## Live evidence ledger and allocation rule

The same piece of evidence cannot raise two rows. `Primary scoring row` is the only row an item may raise. `Related rows` record relevance without awarding points.

| Evidence ID | Evidence | Primary scoring row | Related rows | Used for scoring? Y/N | Verification reference |
| --- | --- | --- | --- | --- | --- |
| `EVD-001` | Developer/test scheduled Mitra Meta WhatsApp round trip | Real output on a real surface | Observability; Cost and latency | Y — current L3 planning claim | W4 accepted development checkpoint; ignored live record; `scripts/verify-w4-meta-live.mjs` |
| `EVD-002` | Historical developer/test scheduled Tarla Meta missing-ingredient loop and second real message | Real output on a real surface | Observability; Handoffs and memory; Cost and latency | Y — current L3 planning claim | Earlier W4 checkpoint; retained honestly. Preferred clean-copy proof is `EVD-016`. |
| `EVD-003` | Separate W2 development run with ordered scheduler-to-interpretation trace | Observability | Evals and iteration | N — technical capability only; reviewer surface missing | Replayable `scripts/verify-w2.mjs` trace output |
| `EVD-004` | Shared hub with Mitra/Tarla specialists and static open-task routing | Agent org structure | Handoffs and memory | N — does not meet supplied manager threshold | `ARCHITECTURE.md`; `convex/transportInbound.ts`; `convex/http.ts` |
| `EVD-005` | Mitra W2 named 7-case set | Evals and iteration | Observability | Y — current L3 planning claim | `scripts/mitra-w2-eval-cases.mjs`; accepted 7/7 result |
| `EVD-006` | Tarla W3 named 10-case set | Evals and iteration | Handoffs and memory | Y — current L3 planning claim | `scripts/tarla-w3-eval-cases.mjs`; accepted 10/10 result |
| `EVD-007` | W4 named 12-case provider preflight | Evals and iteration | Real output on a real surface | Y — current L3 planning claim | `scripts/verify-w4.mjs`; accepted 12/12 result |
| `EVD-008` | Separate W1 preference lifecycle and stable reread | Handoffs and memory | Evals and iteration | Y — current L3 planning claim | `scripts/verify-w1.mjs` preference lifecycle assertions |
| `EVD-009` | Dedicated cost/latency benchmark | Cost and latency | Observability | N — reserved; measurements not captured as one evidence item | Future benchmark reference |
| `EVD-010` | Reviewer-operable management surface | Management UI | Observability | N — reserved; surface not built | Future URL and acceptance record |
| `EVD-011` | M5 local consumer surface, beta consent, dashboard, and household-scoped run-view implementation | Management UI | Real output on a real surface; Observability | N — production build and HTTP proof only; browser activation and reviewer proof remain incomplete | Local M5 build; `npm run verify:m5`; routes `/`, `/onboarding`, `/dashboard`, `/admin/runs` |
| `EVD-012` | Manual M5 Both onboarding flow completed after the missing Convex functions were synchronized | Management UI | Evals and iteration | N — functional product evidence only; visual/product acceptance remains failed | Manual local acceptance record below; `scripts/verify-m5-route.mjs`; `scripts/verify-m5.mjs` |
| `EVD-013` | M0 onboarding continuity and unavailable-browser-storage handling verified in a real local browser | Management UI | Evals and iteration | N — local stability evidence only; no rubric-level upgrade claimed | `npm run verify:m0`; `npm run verify:m0:browser`; `artifacts/m0/identity-to-choice.png`; `artifacts/m0/storage-unavailable.png` |
| `EVD-014` | M1 shared-household and specialist setup verified in a real local browser | Management UI | Handoffs and memory; Evals and iteration | N — local product-foundation evidence only; no real household task or rubric-level upgrade claimed | `npm run verify:m1`; `npm run verify:m1:browser`; `artifacts/m1/flexible-household.png`; `artifacts/m1/shared-member-review.png`; `artifacts/m1/per-person-and-kitchen-portions.png`; `artifacts/m1/returning-edit-review.png`; `artifacts/m1/mobile-onboarding-390.png` |
| `EVD-015` | M2 household execution, bounded exceptions, approvals, evidence linkage, and consumer/admin inspection verified with synthetic development records | Evals and iteration | Real output on a real surface; Observability; Handoffs and memory; Management UI | N — non-live development evidence only; the required real Mitra and Tarla WhatsApp runs have not been sent | `npm run verify:m2`; `npm run verify:m2:browser`; `artifacts/m2/needs-you-and-handled.png`; `artifacts/m2/mobile-execution-dashboard.png`; `artifacts/m2/run-trace-inspection.png` |
| `EVD-016` | Preferred clean-copy Tarla Meta WhatsApp missing-ingredient loop: Priya received the plan, a real reply reported palak unavailable, Tarla substituted lunch and the revised instruction was delivered | Real output on a real surface | Observability; Handoffs and memory | Y — controlled developer/test surface; no level upgrade claimed | Convex development run `ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`; evidence record `EVD-RUN-ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`; `scripts/verify-w4-meta-tarla-live.mjs` |

Evidence used for a primary row must not also be submitted to raise a Revenue or Virality row. A separate artifact, cohort, or measurement must support any bonus claim.

**Next available evidence ID: `EVD-017`.** Add the record when the next qualifying run or artifact is accepted; do not pre-allocate a passing result.

### EVD-016 — preferred clean-copy Tarla real-output run

- Surface and target: Meta WhatsApp Cloud API on Convex development; one configured developer/test recipient.
- Initial plan: accepted at `2026-09-04T17:05:02.737Z` and provider-delivered at `2026-09-04T17:05:03.000Z`. The customer copy used only Priya, Sid, and Kayaan; it contained no `W4`, `test`, `fixture`, or `synthetic` wording.
- Real inbound: the recipient replied `Palak Nahi hai` at `2026-09-04T18:07:23.000Z`. The signed webhook was received at `2026-09-04T18:07:23.985Z` and validated at `2026-09-04T18:07:23.989Z`; the raw text and provider message ID are retained in the run record.
- Interpretation and result: `INGREDIENT_UNAVAILABLE_SUPPORTED_SUBSTITUTION`; lunch changed from Palak tofu, moong dal and cucumber salad to Soy chunk masala, bhindi and cucumber salad. Household totals changed from 3646.88 kcal / 272.38 g protein to 3333.09 kcal / 256.63 g protein. Palak was added to shopping-needed. No primary-user escalation was required.
- Provider recovery: the first revised request failed with Meta token code `190`. After one manual development-token refresh, the guarded retry submitted the unchanged revised instruction at `2026-09-04T18:25:52.539Z`, Meta accepted it at `2026-09-04T18:25:53.631Z`, and Meta delivered it at `2026-09-04T18:25:54.000Z`.
- Final stored state: `revised_waiting`, pending a real cook acknowledgement. No acknowledgement was fabricated. Manual intervention count: 1 (credential refresh and recorded retry); plan, quantities, restrictions, raw inbound handling, and substitution stayed autonomous.
- Artifacts: no screenshot was captured; the evidence record is marked `MISSING` for a screenshot artifact. The inspectable artifacts are the Convex run, ordered trace, inbound signal, exception, three transport records, and evidence record named above.

### M5 evidence status

M5 currently has local implementation evidence only:

- the production build exposes the landing, onboarding, dashboard, legal, beta, legacy Mitra, and household-scoped run routes;
- the named `minimum_testable_aevia_m5` local set passes 17/17 language, navigation, edit-safety, and latency checks;
- all eight routes return HTTP 200 locally;
- W1, W2 7/7, W3 10/10, W3.1, and W4 12/12 regressions pass after the changes;
- no real WhatsApp message was sent.

After Convex development synchronization, the user completed a manual Both onboarding flow. This is not yet being used to raise a rubric row: visual/product acceptance failed, the Figma redesign is pending, and safe screenshot/analytics evidence is not assembled. Do not relabel local functional proof as external-user evidence.

## Primary track evidence table

### 1. Real output on a real surface

| Field | Value |
| --- | --- |
| Exact rubric row | Real output on a real surface |
| Weight | 20x |
| Known L3 threshold | Works, but staged/test surface only |
| Current claimed level | **L3** |
| Confidence | High |
| Existing evidence | Real Meta WhatsApp Cloud API execution: autonomous scheduled Mitra message, real human reply, interpretation/state update; scheduled Tarla instruction, real missing-ingredient reply, autonomous replan, and second real WhatsApp message. Recipients were the developer/test cohort. |
| Judge-verifiable evidence | Accepted development checkpoint plus inspectable Convex run/transport records and controlled live harnesses. A safe, redacted judge bundle is not assembled yet. |
| Evidence ID/reference | `EVD-001`, `EVD-002`; W4 checkpoint `1c6d6c739a065bce26baad74bb13ce47d1db0876`; `scripts/verify-w4-meta-live.mjs`; `scripts/verify-w4-meta-tarla-live.mjs` |
| Why current evidence qualifies | It produced real scheduled output on WhatsApp, accepted real inbound human input, changed task state, and produced a second real output. The surface and cohort were still controlled/test, which matches the known L3 threshold. |
| Gap to next level | L4 requires real-surface output where the builder still approves every step; L5 requires production-quality autonomous end-to-end completion in the declared domain. Current recipients remain developer/test cohort, so no upgrade is claimed. |
| Next proof required | Run separate consented proofs for wife/same-household non-developer, real father/senior, real cook, and external households. For each capture a redacted run ID, timestamp, screenshot, outcome, recipient type, consent state, and surface. |
| Owner | Product lead for consent/cohort; engineering for safe evidence capture |
| Status | L3 evidence exists; judge bundle and non-developer proofs pending |

Evidence package fields for every future real-output proof:

| Field | Required record |
| --- | --- |
| Evidence ID | Unique, stable reference |
| Run ID | Redacted or safely displayed stable run reference |
| Timestamp | Schedule, provider acceptance, inbound, and completion times |
| Screenshot | Redacted real surface showing output and response |
| Outcome | Task state and supported interpretation |
| Recipient type | Developer, household non-developer, senior, cook, external household |
| Consent | How readiness and consent were established |
| Surface | Meta WhatsApp test number or dedicated production number |
| Manual action | Whether any send was manually triggered after scheduling |

Do not place phone numbers, access tokens, or unnecessary raw household content in the evidence bundle.

### 2. Observability

| Field | Value |
| --- | --- |
| Exact rubric row | Observability |
| Weight | 7x |
| Known L3 threshold | Pull up one run, see each agent step by step |
| Current claimed level | **Below L3; exact canonical L2 wording not supplied** |
| Confidence | Medium |
| Existing evidence | Shared `agentRuns` and ordered `agentRunSteps` include agent, household, task, status, timestamps, latency, safe summaries, error, and optional token/cost fields. Verification scripts retrieve ordered traces. |
| Judge-verifiable evidence | `EVD-003` can be replayed against Convex development, but there is no reviewer-friendly run URL/view. A reviewer currently needs code/scripts and deployment access. |
| Evidence ID/reference | `EVD-003`; `convex/agentRuns.ts`; W2 trace retrieval in `scripts/verify-w2.mjs` |
| Why current evidence qualifies | The underlying step-by-step run data exists and can be queried. The conservative claim remains below L3 because easy independent review is incomplete. |
| Gap to next level | First make the existing run page judge-verifiable for L3. L4 then requires a cross-agent trace tree, per-step token/cost, and agent/task filters. |
| Next proof required | Provide a reviewer-accessible run page showing run ID, agent, task, ordered steps, timestamps, state transitions, provider acceptance/delivery distinctions, inbound signal, interpretation, errors, latency, and token/cost where applicable. Capture URL and timestamp. |
| Owner | Engineering for run API/view; product for safe field selection |
| Status | Technical data complete enough for a candidate; judge-verifiable surface pending |

Sensitive raw message content should remain hidden unless it is necessary and the viewer is authorized.

### 3. Agent org structure

| Field | Value |
| --- | --- |
| Exact rubric row | Agent org structure |
| Weight | 5x |
| Known L3 threshold | Manager + specialists, static routing |
| Current claimed level | **Below L3; exact canonical L2 wording not supplied** |
| Confidence | High |
| Existing evidence | Aevia/Vesta is the shared household context/runtime hub. Mitra and Tarla are separate specialists. Inbound transport routing can choose an already-open Mitra or Tarla task using provider/message/endpoint context. |
| Judge-verifiable evidence | Source and architecture are inspectable, but there is no manager-agent run that receives an intent and delegates to a specialist. |
| Evidence ID/reference | `EVD-004`; `ARCHITECTURE.md`; `convex/transportInbound.ts`; `convex/http.ts` |
| Why current evidence qualifies | Specialists and shared context are real, but routing follows existing task state. Aevia is not a manager agent, so the known L3 “Manager + specialists” threshold is not claimed. |
| Gap to next level | L3 first requires a real manager plus specialists with static routing. Strategic L4 requires the manager to plan request-specific subtasks, delegate them, and review outputs. |
| Next proof required | One Aevia run that receives normalized intent, retrieves shared context, selects a specialist, delegates with scoped input, receives the result, and updates combined state/memory. |
| Owner | Product for routing policy; engineering for manager runtime and trace |
| Status | Shared hub and specialists exist; manager behavior not built |

Do not split Mitra or Tarla into fake subagents merely to increase this row.

Candidate future orchestration proof:

> “We’re travelling Thursday to Sunday.”

Aevia could interpret the intent, retrieve shared context, identify relevant Tarla meal/cook schedules and Mitra routines, delegate bounded work, and request only necessary confirmations. This is an example for proof design, not a mandatory implementation specification and not CURRENT behavior.

### 4. Evals and iteration

| Field | Value |
| --- | --- |
| Exact rubric row | Evals and iteration |
| Weight | 5x |
| Known L3 threshold | Named eval set, run manually between versions |
| Current claimed level | **L3** |
| Confidence | High |
| Existing evidence | Mitra W2 7/7, Tarla W3 10/10, W4 provider preflight 12/12, plus W1/W3.1/regression scripts. Sets have named cases and assertions. |
| Judge-verifiable evidence | Tracked, replayable scripts and named case-definition files. A timestamped human-readable result history by commit is not yet packaged. |
| Evidence ID/reference | `EVD-005`, `EVD-006`, `EVD-007`; `EVALS.md`; `scripts/mitra-w2-eval-cases.mjs`; `scripts/tarla-w3-eval-cases.mjs`; `scripts/verify-w4.mjs` |
| Why current evidence qualifies | Named eval sets exist and were run manually across milestone versions, matching the supplied L3 threshold. |
| Gap to next level | L4 requires an automated CI-style eval pipeline that fails a release when quality drops. |
| Next proof required | Preserve a judge-facing result history, then automate the named suites as a release gate with a deliberate failing-case proof. Add safe real-user failures as regression cases. |
| Owner | Engineering for harness/results; product for expected behavior and iteration notes |
| Status | L3 technical evidence exists; judge-facing history pending |

The strongest future iteration proof should show:

```text
real failure
→ diagnosed issue
→ product or code change
→ eval added or updated
→ rerun passes
```

Real-user failures should become regression cases when they express a durable product expectation and can be represented without sensitive data.

### 5. Handoffs and memory

| Field | Value |
| --- | --- |
| Exact rubric row | Handoffs and memory |
| Weight | 2x |
| Known L3 threshold | Short-term memory within one task |
| Current claimed level | **L3** |
| Confidence | High |
| Existing evidence | Shared household/member context persists. Preferences store source, active state, timestamps, and optional expiry. W1 proves preference lifecycle and stable reread. Tarla corrections can persist and affect later planning. |
| Judge-verifiable evidence | W1 creates and rereads scoped preferences, including corrected active/inactive records. This evidence ID is reserved for memory and is not used to score the eval row. |
| Evidence ID/reference | `EVD-008`; `convex/schema.ts` preference table; `scripts/verify-w1.mjs` preference lifecycle assertions |
| Why current evidence qualifies | The system exceeds the known short-term-within-task threshold by persisting explicit memory across records and later reads. The claim remains L3 because the later-task evidence has not yet been packaged as a separate judge-verifiable L4 proof. |
| Gap to next level | L4 requires persistent memory across tasks. Rich provenance is a separate product/trust gap and must not be described as already implemented. |
| Next proof required | Demonstrate one explicit correction written in one task and used in a later task, with stable reread. Separately implement and prove verification state, validity/expiry, and correction history. |
| Owner | Product for memory semantics; engineering for migration-safe representation and proof |
| Status | L3 claimed; richer provenance memory is NEXT |

Current memory is mostly string-valued. Do not claim the planned provenance/correction model exists today.

The NEXT memory model must distinguish confirmed fact, self-report, extracted candidate, inference, temporary preference, and situational event. It should record source, source type, verification state, confirmer, created/updated times, validity period, active state, and correction history.

### 6. Cost and latency

| Field | Value |
| --- | --- |
| Exact rubric row | Cost and latency |
| Weight | 1x |
| Known L3 threshold | 5–10 min OR $0.50–$2 |
| Current claimed level | **Not claimed** |
| Confidence | Low until a measured benchmark is captured |
| Existing evidence | Agent runs/steps can store latency and optional token/cost data. Deterministic paths honestly use zero/null token and cost values. Real Meta transport records provider timestamps. |
| Judge-verifiable evidence | No dedicated benchmark table currently separates total run, scheduler wait, provider latency, model latency, tokens, and cost across a repeatable cohort. |
| Evidence ID/reference | `EVD-009` reserved; current schema fields in `convex/schema.ts` are capability, not scoring proof |
| Why current evidence qualifies | No level is inferred. The exact thresholds are known, but no dedicated measured evidence item currently separates the relevant lifecycle segments and actual cost. |
| Gap to next level | The lower qualifying time/cost tier governs. A claim requires real end-to-end latency and actual cost, not raw long-lived waiting duration alone. |
| Next proof required | Capture end-to-end elapsed time, human waiting, task processing, provider latency, model latency, token usage, and actual cost for named runs. Apply the lower-tier rule. |
| Owner | Engineering for instrumentation/report; product for rubric clarification |
| Status | Measurement fields exist; row intentionally unscored |

### 7. Management UI

| Field | Value |
| --- | --- |
| Exact rubric row | Management UI |
| Weight | 1x |
| Known L3 threshold | A PM could operate it with docs |
| Current claimed level | **L1** |
| Confidence | High |
| Existing evidence | Backend functions, schemas, scripts, and ordered traces exist. Canonical product/architecture/eval docs now exist. |
| Judge-verifiable evidence | No complete management interface or reviewer-operable URL exists. |
| Evidence ID/reference | `EVD-010` reserved for a future URL and acceptance record |
| Why current evidence qualifies | It does not meet the known L3 threshold: a PM cannot operate households, runs, exceptions, and review state through a complete UI today. |
| Gap to next level | L3 requires a PM-operable interface with docs. Strategic L4 requires a clean UI a non-engineer can operate after one walkthrough. |
| Next proof required | Reviewer URL with households, agents, runs, exceptions, failures, feedback, safe view-as-user, sensitive masking, and human review queue; prove a PM can complete a defined operating task using docs. |
| Owner | Product/design for workflow; engineering for access-controlled UI |
| Status | Below L3; no management UI |

## Today’s rubric objective

GrowthX guidance:

> Get to at least L3 on most parameters.

Live planning table:

| Row | Weight | Current level | L3 achieved? Y/N | Existing proof | Missing proof | Today’s action |
| --- | ---: | --- | --- | --- | --- | --- |
| Real output on a real surface | 20x | L3 | Y | Two controlled real Meta WhatsApp agent loops | Redacted judge bundle and non-developer cohorts | Define the safe evidence template; schedule consented wife/senior/cook proofs only after separate approval |
| Observability | 7x | Below L3; L2 wording unavailable | N | Ordered backend run/step traces | Easy reviewer inspection | Specify the minimum Agent Run view and one judge walkthrough |
| Agent org structure | 5x | Below L3; L2 wording unavailable | N | Shared hub, two specialists, static open-task routing | Actual manager-agent delegation | Define one bounded Aevia manager intent-to-specialist proof without fake agents |
| Evals and iteration | 5x | L3 | Y | Named 7/7, 10/10, and 12/12 sets | Timestamped by-commit judge report and iteration history | Create an evidence-report format; record the next failure and resulting change |
| Handoffs and memory | 2x | L3 | Y | Persistent scoped preferences and stable reread | Rich provenance/expiry/correction demonstration | Define one temporary-memory and correction-history proof |
| Cost and latency | 1x | Not claimed | N | Latency and optional cost fields; provider timestamps | Measured benchmark using the lower-tier rule | Capture task, human-wait, transport, model, token, and cost measurements before claiming a level |
| Management UI | 1x | L1 | N | Backend APIs and docs | Operable management interface | Scope the smallest UI that also unlocks judge-verifiable observability |

Priority method supplied by this addendum:

> weight × achievable level gain × confidence ÷ implementation time

Current order of work, while avoiding low-weight polish over missing high-weight evidence:

1. **Observability (7x):** likely shortest meaningful path from the current trace data to a reviewer-verifiable L3 claim.
2. **Agent org structure (5x):** define and implement one real manager-to-specialist delegation; do not fake organizational depth.
3. **Real output (20x):** preserve the current L3 and collect separate consented non-developer proofs toward production-quality autonomous L5 evidence.
4. **Evals and iteration (5x):** package existing results by commit/time and record the iteration caused by a failure.
5. **Management UI (1x):** keep narrow and use it to unlock observability rather than polishing unrelated screens.
6. **Handoffs and memory (2x):** current L3 is defensible; next prove provenance/expiry/correction behavior after it exists.
7. **Cost and latency (1x):** instrument and clarify, but do not prioritize this over missing higher-weight L3 evidence.

The full 32-step execution order is maintained in [BETA_LAUNCH.md](./BETA_LAUNCH.md).

## User-research evidence register

Research participation, product-use evidence, exact-copy validation, and testimonial publication approval are separate. A research participant does not count as a product user or target execution-side recipient unless the corresponding product-use evidence is also recorded.

| Research ID | Source | Research evidence exists | Quotable source material exists | Publication-approved testimonial | Exact copy user-validated | Limits |
| --- | --- | --- | --- | --- | --- | --- |
| `RSR-001` | [2026-08-30 voice-memo transcript set](./research/user-interviews/2026-08-30-voice-memo-transcripts.docx), nine recordings | Yes | Yes, subject to source verification | No approval recorded | No | Auto-generated transcript; participant count is not stated; proper nouns and Hindi/Hinglish may be misheard; verify quotations against original audio before any approval or publication |

The research-to-content implications are maintained in [PRODUCT_LANGUAGE.md](./PRODUCT_LANGUAGE.md). Do not copy transcript wording into public testimonials without participant consent, approved attribution/anonymity, and exact source verification.

The separate interview-tracker workbook is currently a research plan and outreach list. Its only completed response row is explicitly marked as an example, so it is not participant evidence.

## Real-user evidence categories

Do not collapse these categories into a generic user count:

| Category | Definition | Current evidence state |
| --- | --- | --- |
| `DEVELOPER TEST` | Founder/developer as recipient | W4 Mitra and Tarla real-surface technical evidence |
| `HOUSEHOLD CONTROL` | Non-developer in founder household | Not yet recorded |
| `TARGET RECIPIENT` | Actual senior or actual cook/cooking person | Not yet recorded |
| `EXTERNAL BETA` | Household outside founder’s household | Not yet recorded |

A spouse or same-household non-developer is useful evidence but does not automatically prove L4 or L5. Dad/senior and cooking-person evidence more directly matches Aevia’s intended execution-side roles. External households provide a distinct proof class.

## Build Week real-user count ledger

Count unique people and households, not database fixtures. Do not count the same person twice across roles unless the canonical rubric explicitly permits it.

| Metric | Current safe count | Evidence reference | Counting rule |
| --- | ---: | --- | --- |
| Unique primary users | 1 developer/test; 0 external verified | `EVD-001`, `EVD-002` context | Founder/developer is labeled, not presented as external |
| Unique real households | 0 | None | Synthetic isolated Convex fixtures do not count as real households |
| Unique senior recipients | 0 | None | Developer acting as recipient is not a senior |
| Unique cooking recipients | 0 | None | Developer acting as cooking person is not a target cooking recipient |
| Unique external households | 0 | None | Must be outside founder household |
| First-use events | Not instrumented | None | Requires email/user identity plus defined first-use event where the track requires it |
| Successful real executions | 2 developer/test | `EVD-001`, `EVD-002` | One Mitra and one Tarla real Meta loop; not two unique users |

Update this table at the same time a qualifying run is accepted.

## Distribution evidence ledger

Distribution is parallel Build Week work, but no distribution proof is currently claimed.

Operating target:

- three posts per day
- Instagram launch/demo video
- product in users’ hands once minimum beta readiness is met

Track each post or video separately:

| Evidence ID | Date | Channel | Post/video URL | Timestamp | Impressions | Reactions | Comments | Amplification | Landing visitors | Onboarding starts | Signups | First-use events | Actual product users | Traffic source | Used for scoring? |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| — | No distribution evidence recorded | — | — | — | — | — | — | — | — | — | — | — | — | — | N |

Analytics should distinguish organic social, paid, direct, referral, search, partner, and other known sources where possible. Preserve read-only analytics URLs or timestamped exports when the rubric requires them.

## Analytics evidence priority

Analytics must be integrated before the wider cohort receives the product. Its purpose is not merely a dashboard; it is the verifiable evidence source for:

- visitors and traffic source
- onboarding starts and drop-offs
- signup and policy acceptance
- first use and specialist activation
- scheduled and successful execution
- provider acceptance/delivery distinctions
- reply and interpretation
- exceptions and resolution
- retention
- cross-track bonus eligibility

Product analytics must not receive unnecessary phone numbers, raw WhatsApp content, medical context, secrets, or sensitive household details.

When Virality ratios cross anti-spoof limits, preserve evidence for any non-social source rather than explaining the ratio from memory later.

## Evidence screenshot/reference convention

Documented naming convention only; no screenshot directories or sensitive images are created in this milestone.

```text
evidence/
  EVD-001-mitra-real-output/
  EVD-002-tarla-real-output/
  EVD-003-agent-run-observability/
  EVD-004-agent-org-routing/
  EVD-005-mitra-evals/
  ...
```

When evidence is later captured:

- redact phone numbers
- redact tokens and provider secrets
- redact sensitive medical information and unnecessary personal data
- preserve the date/time and run ID where safe
- preserve enough surface and state context for an independent reviewer to verify the claim
- record the primary scoring row and related-but-not-scored rows
- avoid committing sensitive screenshots to a public repository

## Cross-track bonus

Wins in the other two tracks score:

```text
0.5 × original row weight
```

Bonus is capped at **50 total points**. The same evidence standard applies, and one artifact cannot raise both a primary row and a bonus row.

No cross-track bonus is currently claimed.

### Virality L3 reference

| Exact row | Original weight | Known L3 threshold | Current bonus claim | Separate proof required |
| --- | ---: | --- | --- | --- |
| Signups / meaningful actions | 25x | 101–500 | None | Read-only source with qualifying actions and deduplicated users |
| Visitors | 10x | 251–1,000; read-only analytics required | None | Read-only analytics view |
| Amplification quality | 3x | 3+ peer builders OR one sub-10k founder | None | Public identities/links and qualifying amplification |
| Reactions/comments | 2x | 51–150 | None | Platform analytics or inspectable public counts |
| Impressions | 1x | 5k–15k | None | Read-only analytics with weighted source breakdown |

Potential evidence to track later: meaningful actions/signups, visitors, amplification, reactions/comments, and impressions.

### Virality anti-spoof rule

For an affected Virality row, more than either of the following causes the row to drop to L1 unless a non-social traffic source can be proven:

- 1 visitor per 10 weighted impressions
- 1 signup per 2 visitors

Ads count at **25% of face value** on Virality rows.

Distribution analytics must preserve source, campaign, paid/organic classification, weighted impressions, unique visitors, meaningful actions, and the evidence needed to explain unusual ratios.

### Revenue L3 reference

| Exact row | Original weight | Known L3 threshold | Current bonus claim | Separate proof required |
| --- | ---: | --- | --- | --- |
| Signups | 20x | 51–250; requires email + first-use event | None | Deduplicated signup table with email and first-use evidence |
| Live product quality | 8x | Working product, does what it claims | None | Evidence distinct from primary real-output IDs |
| Revenue generated | 4x | $100–$500 | None | Inspectable payment/revenue source |
| Waitlist | 4x | 151–750 | None | Deduplicated waitlist source |
| Pain severity | 2x | Named user, 1–2 conversations this week | None | `RSR-001` exists, but participant identity, consent-safe attribution, and audio-verified quotation are not recorded for rubric proof |
| SOM | 2x | Users × ACV correct, under ₹10 cr | None | Inputs, arithmetic, source, and date |
| Right to win | 2x | Some domain exposure | None | Specific founder/team evidence |
| Why now | 1x | Clear tailwind in last 2 years | None | Current dated sources |
| Moat | 1x | Workflow lock-in, integrations, taste | None | Product proof beyond a narrative claim |

Potential evidence to track later: real signups, live product quality, pain severity, SOM, right to win, why now, and moat.

## Evidence register template

Use one record per artifact or proof:

| Field | Required content |
| --- | --- |
| Evidence ID | Stable unique ID |
| Rubric version | `GrowthX Build Week v2.2.0` |
| Track | Primary or bonus track |
| Exact row | One row only |
| Related rows | Relevant rows that this item is not being used to raise |
| Used for scoring | Y/N and which planning/judge claim it supports |
| Claimed level | Level supported by this proof |
| Date/time | Time zone included |
| Version | Commit hash or deployment version |
| Recipient category | `DEVELOPER TEST`, `HOUSEHOLD CONTROL`, `TARGET RECIPIENT`, `EXTERNAL BETA`, or aggregate |
| Consent | Relevant consent/readiness evidence |
| Real surface | Meta test WhatsApp, dedicated Aevia WhatsApp, web, or another named surface |
| Screenshot/reference | Redacted image, URL, run view, analytics view, table, or repeatable command |
| Run/trace | Run ID plus ordered/replayable trace reference |
| Provider state | Requested, accepted, sent, delivered, read, or failed without conflating states |
| Inbound | Safe response/reaction reference where applicable |
| Interpretation | Derived meaning with source/uncertainty preserved |
| Final state/outcome | Stable task result |
| Latency/cost | End-to-end, provider, model, deterministic latency; tokens and actual cost where available |
| Feedback | Recipient or primary-user feedback |
| Exception | Exception type, handling, and resolution if any |
| Expected | What would count as a pass |
| Actual | What occurred |
| Outcome | Pass, fail, blocked, or partial |
| Resulting iteration | Failure diagnosis, change, eval update, and rerun when applicable |
| Analytics reference | Safe read-only view/export when available |
| Redaction | What sensitive data was removed |
| Notes | Limitations and next action |

## Evidence gaps that block higher claims

1. Safe reviewer-facing evidence bundle for real WhatsApp output.
2. Non-developer recipient proofs beyond the developer/test cohort.
3. Reviewer-accessible Agent Run view and later L4 cross-agent trace/filtering.
4. Genuine Aevia manager-to-specialist delegation; later L4 dynamic planning/review.
5. Automated release-gating eval pipeline for L4.
6. Rich memory provenance, expiry, and correction history alongside later-task proof.
7. Dedicated measured cost/latency benchmark using the lower-tier rule.
8. Operable management UI.
9. Separate evidence for any cross-track bonus.

## M5 manual acceptance log

### 2026-09-02 — blocked at landing navigation

- Outcome: **FAIL / BLOCKED**
- Surface: local production build at `http://localhost:3001`
- User-visible symptom: both the landing **Meet Aevia** CTA and the beta-page **Start the beta setup** CTA reached a page-level “This page couldn’t load” error.
- Exact technical error: Convex development returned `Could not find function for 'm5:getSession'. Did you forget to run npx convex dev?`
- Root cause: the local generated client includes M5 bindings, but the connected Convex development deployment does not yet include `m5:getSession`, `productAnalytics:capture`, or the other M5 functions. The server can return `/onboarding` with HTTP 200, then the client crashes when its first Convex query resolves as a missing function.
- Required correction: deploy the already-reviewed M5 schema/functions to **Convex development only**, run the deployed-function preflight, then retest direct load, refresh, CTA navigation, and Back/Forward behavior.
- Regression requirement: M5 route acceptance must include a read-only deployed-function preflight; an HTTP 200 alone is insufficient because the route hydrates against Convex in the browser.
- Fix applied: `npx convex dev --once` updated **Convex development only** with the existing M5 schema/functions. No production deployment occurred.
- Automated rerun: `m5_onboarding_route_preflight` passed 2/2, proving that development exposes `m5:getSession` and `/onboarding` returns its application shell. The existing `minimum_testable_aevia_m5` suite also remained 9/9.
- Manual rerun: the user subsequently completed a full Both onboarding flow after the Convex development synchronization. The functional entry path was unblocked.
- Visual review is also **not accepted**. Defer redesign until the remaining M5 screens have been reviewed together.
- Later visual correction pass must address: Warm Intelligence direction; excessive hero typography; stronger household/family/kitchen storytelling; layered depth and contrast; visible Mitra/Tarla identity in the first fold; polished WhatsApp proof; removal of consumer-facing “Development proof” and engineering-state wording; stronger language visibility; better treatment of the time-saved hypothesis; stronger trust treatment; and conversation proof that reads as product evidence rather than an engineering trace.

### 2026-09-03 — functional cleanup after manual Both flow

- Status: **functional cleanup implemented locally; live development verification pending approval**.
- Unsaved-navigation finding: no application `beforeunload` handler exists. The prompt came from the stale production build that still contained the temporary native-anchor navigation workaround used during the earlier route diagnosis. Current source uses Next.js client navigation, and `minimum_testable_aevia_m5` now guards against native onboarding anchors or unconditional unload handlers.
- Existing-user edit finding: `/onboarding` previously queried only identity records and always inserted specialist members, endpoints, and routines again. It now retrieves the persisted setup, pre-populates identity/shared/Mitra/Tarla/cooking-person fields, updates the existing Mitra records, reuses Tarla member/cook records, and avoids generating another day plan merely because an existing setup was edited.
- Founder-default finding: fresh Mitra state no longer persists `Papa`, `Sid`, a founder household name, or a routine label as a default. Examples remain placeholders only.
- Latency finding: `agentRuns.totalLatencyMs` correctly measures run start through completion, so a long-lived run includes human waiting. The run view now formats duration (`26m 40s`, not `1600000 ms`) and separates end-to-end elapsed, recorded human waiting, recorded processing, and transport-call time. It does not fabricate provider or model latency.
- Regression result: local `minimum_testable_aevia_m5` passes **17/17**, including navigation, prefill/update, default-safety, and latency cases. `verify:m5:route` must still pass after the reviewed Convex development functions are synchronized.
- Visual/product acceptance remains **failed/pending Figma implementation**. This cleanup does not redesign the product.

### 2026-09-03 — content-manager branch implementation blockers

- **P0 — onboarding bug:** Fresh onboarding resets after identity creation because `OnboardingFlow` changes from the `"fresh"` key to the new profile ID. React remounts the flow, discards its in-progress state, and returns the user to the identity step. This blocks fresh-onboarding acceptance and needs an interaction regression test that completes identity creation and confirms the next step remains active.
- **P1 — resilience bug:** Device and analytics identity initialization reads and writes `localStorage` without handling browser storage failures. A storage security or quota error can escape during render and crash the landing page, onboarding, dashboard, or run viewer. This needs a safe fallback plus coverage for unavailable browser storage before wider beta distribution.
- These are implementation blockers, not content-governance changes. Do not fix them on the `content-manager` branch, and do not modify `app/onboarding/page.tsx` or `lib/aeviaSession.ts` as part of that branch's governance work.
- Review verification: targeted ESLint and TypeScript checks passed, and `minimum_testable_aevia_m5` remained 17/17. Those checks do not exercise the fresh identity-to-next-step transition or unavailable browser storage. Browser verification has not been run for either finding.

### 2026-09-03 — M0 stability implementation and browser acceptance

- Status: **implemented and verified locally**. This is product-stability evidence, not a production deployment or a rubric-level upgrade.
- Fresh-onboarding correction: `OnboardingFlow` no longer uses the newly created profile ID as a React key. Initial saved-session hydration is captured once when the flow mounts, returned household/member IDs stay in the live flow, and identity completion advances to Choose Help without remounting.
- Resume behavior: an identity-only saved session resumes at Choose Help. A completed specialist setup continues to load its existing saved setup for editing. The flow now has Back controls that change only the active step, so entered values remain in memory.
- Storage correction: all active product `localStorage` access now goes through `lib/safeBrowserStorage.ts`. Read, property-access, and write failures are contained. A failed write does not return an unpersisted credential or silently create a different household session.
- Analytics behavior: unavailable analytics storage stops event capture without interrupting navigation or onboarding.
- Recoverable state: onboarding, dashboard, and the run viewer show a concise browser-privacy recovery screen instead of crashing when the household credential cannot be read or persisted.
- Automated verification: `npm run verify:m0` passed **15/15**; `npm run verify:m5` remained **17/17**; `npx tsc --noEmit` passed; `npm run build` passed. Full `npm run lint` passed with zero errors and four pre-existing warnings in generated Convex files.
- Browser verification: `npm run verify:m0:browser` passed **3/3** in Microsoft Edge. It verified Landing → Meet Aevia → identity → Choose Help, Back with preserved values, forward again, reload to Choose Help, storage-read recovery on onboarding/dashboard/run viewer, and storage-write/analytics failure without a crash.
- Safe artifacts: `artifacts/m0/identity-to-choice.png` and `artifacts/m0/storage-unavailable.png`. They contain generic UI only and no submitted name, email, phone number, or household data.
- Development data: browser acceptance created synthetic identity-only M0 test profiles in the connected Convex development deployment. No production data was intentionally modified.
- Initial route preflight: `npm run verify:m5:route` failed because the connected Convex development deployment exposed `m5:getSession` but did not expose the local additive `m5:getRuntimeVersion` query.
- Root cause and closure: local source and the development deployment were out of sync. After explicit owner approval, `npx convex dev --once` synchronized the reviewed local Convex functions to **development only**. It did not call a messaging send function or deploy the web application.
- Final route preflight: `npm run verify:m5:route` passed **3/3**, confirming `m5:getSession`, the expected M5 runtime version, and the `/onboarding` application shell.
- Shared-runtime regressions after synchronization: W1 passed; W2 passed its scheduler flow and Mitra 7-case eval set; W3 passed its Tarla 10-case eval set; W3.1 passed; W4 passed **12/12**. All used synthetic/development paths during this closure run.
- No real WhatsApp message was sent. No Convex production deployment, web deployment, commit, or push was performed.
- The broader approved onboarding/dashboard visual redesign remains pending implementation; this closure did not start M1A or implement additional product requirements.

### 2026-09-03 — M1 shared household and specialist setup

- Status: **implemented and verified locally**. This is setup and product-foundation evidence, not proof of a real household task or a production launch.
- Shared household: one extended `members` record is reused by Mitra and Tarla. The browser journey created six varied household members and selected the same saved person for both specialists.
- Branching setup: Mitra-only, Tarla-only, and Both paths are covered. The Both browser path completed identity, household, Mitra, Tarla, review, first-plan approval, dashboard, reload, and focused returning-user edits without recreating the household.
- Mitra setup: supports direct, caretaker/family, and both coordination paths; explicit salutation and supported language; multiple independently scheduled routines; optional notes; and 12-hour customer-facing time. Only the familiar medicine reference is collected. Exact medication storage remains unavailable.
- Tarla setup: supports multiple shared eaters, separate hard restrictions and preferences, multiple day rules with optional expiry, balanced or supported adult nutrition-goal planning, and multiple cooking people/visits with relationship-aware copy.
- Portions: the first-plan UI shows understandable per-person household measures and a separate cumulative kitchen quantity. The deterministic M1 checks verify that displayed person amounts reconcile with displayed kitchen totals and that “serving equivalent” is not customer-facing.
- Edit safety: returning-user editing preserves saved record IDs and unrelated setup. The browser test edited one household member, one Mitra routine, food context, and a day rule, then confirmed an unrelated routine remained present after save and reload.
- Content review: owner-approved **Hello Aevia** primary CTA and **Meet Aevia — your personal household assistant.** supporting copy are preserved. A Content Manager pass removed unsupported or overly technical customer wording and retained self-report honesty.
- Automated verification: `npm run verify:m1` passed **31/31**; `npm run verify:m1:browser` passed **2/2**; `npm run verify:m0` passed **15/15**; `npm run verify:m0:browser` passed **3/3**; `npm run verify:m5` passed **17/17**; and `npm run verify:m5:route` passed **3/3**.
- Shared-runtime regression: W1 passed; W2 passed autonomous scheduling, its seven-case Mitra set, and its M1.1 regression; W3 passed its ten-case Tarla set; W3.1 passed its scheduled full-day checks; W4 passed **12/12**. These used development/synthetic transport only.
- Quality checks: `npx tsc --noEmit` passed; `npm run build` passed; `npm run lint` passed with zero errors and four existing warnings in generated Convex files.
- Safe artifacts: `artifacts/m0/identity-to-household.png`, `artifacts/m1/flexible-household.png`, `artifacts/m1/shared-member-review.png`, `artifacts/m1/per-person-and-kitchen-portions.png`, `artifacts/m1/returning-edit-review.png`, and `artifacts/m1/mobile-onboarding-390.png`. They contain synthetic household data only.
- Development synchronization: `npx convex dev --once` synchronized the additive M1 schema/functions to Convex development `grand-goshawk-952` so browser acceptance could exercise persisted setup. No Convex production deployment or web deployment occurred.
- Current execution limits: a saved `both` Mitra relationship keeps both recipient links, while the current routine execution still sends each routine to one configured recipient; generic free-text day rules are stored but are not interpreted as arbitrary meal-planning logic; and the first-plan activation path uses the first configured cooking person. These are later execution concerns, not hidden M1 claims.
- No real WhatsApp message was sent. No production deployment or Git push occurred.

### 2026-09-03 — M2 non-live household execution gate

- Status: **implemented and verified with synthetic records in Convex development; real WhatsApp acceptance is pending owner approval**. This does not replace or extend the earlier W4 real-message evidence.
- Mitra execution: direct, caretaker, and both-mode routing are represented without duplicate people. Both mode sends the ordinary reminder to the direct senior when available and uses the caretaker only for a configured follow-up or exception. Raw replies are saved before interpretation, clear replies remain self-reports, and a brief acknowledgement is sent without claiming independent verification.
- Higher-risk change: a request to stop a medicine reminder creates a pending approval while leaving the routine unchanged. The primary user can approve or keep the reminder, and the request, decision, resulting action, task trace, and intervention event remain linked.
- Tarla execution: meal responsibilities are allocated to the matching configured cook visit rather than the first cook. Cook instructions use cumulative household quantities. A supported missing-ingredient reply can update the current plan/version, recalculate quantities, add the item to shopping-needed, and send the revised instruction without interrupting the primary user.
- Safety boundaries: expired context is excluded; unsupported unstructured rules are not described as automatically enforced; provider acceptance remains distinct from delivery; no token or cost values are invented; evidence artifacts remain `MISSING` until actually attached.
- Analytics: successful task completion and primary-user intervention are execution-linked. Setup, page views, provider delivery state, and normal recipient replies do not count as primary-user intervention.
- Automated eval: `npm run verify:m2` passed **39/39**. The set covers routing, low-chatter follow-up, self-report safety, higher-risk approval, temporary-context expiry, cook selection and tone, household quantities, transport state distinctions, raw-first persistence, current-plan versioning, shopping-needed, unstructured-rule safety, evidence linkage, intervention analytics, and consumer-language guards.
- Browser verification: `npm run verify:m2:browser` passed **1/1** against synthetic development records. It exercised completed Mitra state, two pending approvals, approve and reject outcomes, a Tarla ingredient substitution, shopping-needed, execution metrics, the consumer dashboard at desktop and 390px, and the household-scoped run trace.
- Safe artifacts: `artifacts/m2/needs-you-and-handled.png`, `artifacts/m2/mobile-execution-dashboard.png`, and `artifacts/m2/run-trace-inspection.png`. They contain synthetic names and no real phone number, email, exact medication, provider message ID, credential, or private household information.
- Content Manager review: passed after replacing account terminology in recipient copy, identifying Mitra as Aevia's assistant rather than speaking for the primary user, preserving relationship-aware cook tone, and clarifying the consumer outcome when Tarla changes a plan.
- Convex synchronization: `npx convex dev --once` synchronized the additive M2 schema/functions and reviewed recipient wording to development `grand-goshawk-952`. No Convex production or web deployment occurred.
- Live gate: no real WhatsApp message was sent in M2. One consented Mitra test and one consented Tarla test remain blocked on explicit owner approval, recipient confirmation, and the live-test plan recorded at handoff.
