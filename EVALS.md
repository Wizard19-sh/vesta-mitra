# Aevia Evaluations

## Purpose

This is the canonical record of verified development evidence and planned evaluation coverage after W4.

Labels:

- **VERIFIED PASS** — executed and accepted in Convex development for the named checkpoint.
- **REPEATABLE** — a tracked script can exercise the check again; some scripts require a configured development deployment.
- **REAL OUTPUT** — the flow crossed a real Meta WhatsApp test channel and was observed on a real WhatsApp recipient.
- **PLANNED** — required coverage that is not implemented or not yet shown to pass.

No planned case should be reported as passing until it has a named repeatable check and recorded evidence.

This document records product eval behavior. GrowthX row allocation, scoring claims, and judge-proof gaps are tracked separately in [EVIDENCE.md](./EVIDENCE.md) so the same artifact is not casually counted twice.

## Evidence baseline

| Milestone | Status | Evidence |
| --- | --- | --- |
| W1 shared infrastructure | **VERIFIED PASS** | Shared household/member/preferences/endpoints; Mitra and Tarla run traces; M1.1 compatibility |
| W2 Mitra runtime | **VERIFIED PASS — 7/7 named evals** | Autonomous once and recurring schedules; normalized replies; self-report-safe state; no-response; M1.1 regression |
| W3 Tarla runtime | **VERIFIED PASS — 10/10 named evals** | Deterministic planning/nutrition, approval/correction memory, cooking-person flow, exception handling, shopping-needed state |
| W3.1 day planning | **VERIFIED PASS** | Full-day totals and variance, member differences, once/twice-daily visits, autonomous scheduling, latest-approved-plan semantics, duplicate prevention |
| W4 provider preflight | **VERIFIED PASS — 12/12** | Twilio and Meta normalization/signatures, idempotency, delivery state, webhook guards |
| W4 Mitra Meta round trip | **VERIFIED PASS — REAL OUTPUT** | Scheduled Mitra message sent through Meta, real reply returned through signed webhook, raw reply and interpretation persisted, task/run completed |
| W4 Tarla Meta exception loop | **VERIFIED PASS — REAL OUTPUT** | Scheduled cook instruction sent through Meta, real missing-ingredient reply ingested, deterministic replan/nutrition/shopping update, second real message received |
| M5 local product checks | **VERIFIED PASS — 17/17 LOCAL ONLY** | Product-language, consent wiring, landing proposition, development-transport disclosure, cook-output formatting, navigation safety, existing-setup hydration/update wiring, founder-default safety, and latency-format checks; not final visual acceptance |
| M2 non-live execution gate | **VERIFIED PASS — 39/39 + browser 1/1** | Synthetic development execution for Mitra routing/self-report/approval and Tarla cook selection/substitution; evidence, trace, analytics, consumer, mobile, and admin inspection; no real M2 message sent |

The real W4 checks used a controlled development recipient. Phone numbers, credentials, provider message IDs, and live-state evidence are intentionally not stored in tracked fixtures or this document.

## Repeatable commands

```text
npm run verify:w1
npm run verify:w2
npm run verify:w3
npm run verify:w3.1
npm run verify:w4
npm run verify:m5
npm run verify:m2
npm run verify:m2:browser
```

The W1-W3.1 scripts require a Convex development deployment and create isolated test data. W2 and W3.1 deliberately wait for Convex scheduling rather than invoking the send path manually.

W4 also has controlled live harnesses:

```text
npm run verify:w4:meta:prepare
npm run verify:w4:meta:retry
npm run verify:w4:meta:inspect
npm run verify:w4:meta:status
npm run verify:w4:meta:tarla:prepare
npm run verify:w4:meta:tarla:inspect
```

These commands can send real WhatsApp messages. They require secure local/server configuration, an already consented developer test endpoint, and explicit approval before use. Their local state files are ignored. They are not ordinary regression commands.

## W1 — shared infrastructure

**Status: VERIFIED PASS**

The repeatable W1 verification demonstrates:

- one household with primary user, parent, and cook members
- optional member context without globally mandatory health/diet fields
- household- and member-scoped preferences
- active/inactive preference correction history through separate records
- provider-neutral communication endpoints
- separate Mitra and Tarla synthetic runs
- ordered, timestamped, inspectable run steps
- stable reread of stored traces
- linked legacy parent, routine, and check-in data
- raw M1.1 reply and interpretation preserved

W1 does not prove dynamic orchestration, vector memory, product dashboards, legal acceptance, or production-scale access control.

## W2 — Mitra runtime

### Scheduler and state proof

**Status: VERIFIED PASS**

- A once-scheduled routine is created in the future.
- The test confirms no instance exists before the due time.
- Convex scheduling creates the instance and sends through the development transport.
- A normalized reply is ingested; raw text is preserved.
- The stored meaning uses self-report wording.
- The run completes and a stable reread returns the same final state.
- A selected-day recurring routine also triggers through Convex scheduling.
- Exactly one instance and one outbound message are produced for the occurrence.
- The next recurrence remains scheduled roughly one week later.

### Named Mitra W2 set — 7/7

| Case | Verified expectation | Status |
| --- | --- | --- |
| CLEAR MEDICATION CONFIRMATION | “Haan medicine le li.” becomes `CONFIRMED` with “reported taking” meaning | **PASS** |
| AMBIGUOUS REPLY | “Baad mein.” becomes `UNCONFIRMED`; no false completion | **PASS** |
| EXPLICIT NEGATIVE WALK | “Aaj walk nahi ki.” becomes `UNCONFIRMED`; walk is not claimed complete | **PASS** |
| HINGLISH CONFIRMATION | Clear Hinglish self-report becomes `CONFIRMED` with self-report wording | **PASS** |
| NO RESPONSE | Starts `WAITING`, then becomes `NO_RESPONSE`; no emergency or completion claim | **PASS** |
| UNRELATED MESSAGE | Raw message remains stored; the routine is not falsely confirmed | **PASS** |
| REACTION SIGNAL | Reaction is stored; without a configured mapping it remains `UNCONFIRMED` | **PASS** |

### W2 regression

**Status: VERIFIED PASS**

The legacy M1.1 parent/routine/check-in path remains valid, including raw reply and interpretation.

## W3 — Tarla runtime

### Named Tarla W3 set — 10/10

| Case | Verified expectation | Status |
| --- | --- | --- |
| VEGETARIAN HIGH-PROTEIN / LOW-CALORIE | Respects vegetarian, explicit calorie/protein allocation, and paneer-limit constraints | **PASS** |
| DAY-SPECIFIC VEGETARIAN RULE | Day rule excludes egg and chicken candidates | **PASS** |
| ALLERGY EXCLUSION | Peanut allergy excludes the peanut-containing candidate | **PASS** |
| PANEER REPETITION LIMIT | Paneer history at its configured limit forces another protein source | **PASS** |
| CONFLICTING HOUSEHOLD PREFERENCES | Selects one compatible household meal with distinct portions and child variation | **PASS** |
| USER REJECTS PLAN | Raw correction persists, shared memory is created, immediate and later plans avoid paneer | **PASS** |
| MISSING INGREDIENT | Palak is replaced, nutrition recalculates, shopping-needed updates, user is not interrupted | **PASS** |
| COOK ASKS RECIPE QUESTION | Raw question remains linked, concise answer is produced, task is not falsely completed | **PASS** |
| NO COOK RESPONSE | Starts waiting and reaches no-response without claiming meal completion | **PASS** |
| NUTRITION CALCULATION | Known ingredient quantities produce the exact deterministic nutrition result | **PASS** |

### Additional W3 evidence

**Status: VERIFIED PASS**

- Mifflin-St Jeor energy estimate and activity factor produce a deterministic result.
- The primary user can override calorie and protein targets.
- Cooking-person priming and readiness persist.
- User approval is required before the initial cooking instruction.
- Missing-ingredient handling preserves raw input, constraint checks, nutrition before/after, shopping state, and run trace.

## W3.1 — full-day plan and cook visits

**Status: VERIFIED PASS**

| Check | Verified evidence | Status |
| --- | --- | --- |
| Full-day nutrition | Breakfast, lunch, snack, and dinner have calculated nutrition; daily totals and target variance persist | **PASS** |
| Member differences | Primary adult has four home meals, another adult three, and child two in the fixture | **PASS** |
| Once-daily cook | Multiple meals map to one visit and one autonomous scheduled instruction | **PASS** |
| Twice-daily cook | Morning and evening visits hold different meal responsibilities; at least one triggers autonomously | **PASS** |
| Latest approved plan | A change before send reuses the occurrence and the sent instruction uses the new approved plan | **PASS** |
| Duplicate prevention | One outbound instruction exists before exception handling for the scheduled occurrence | **PASS** |
| Missing ingredient | Only affected unlocked meal state is replanned; daily totals/variance and shopping-needed state update | **PASS** |

The test waits for Convex scheduling. It does not call the send function and label that as an autonomous trigger.

## W4 — provider transport

### Provider preflight — 12/12

**Status: VERIFIED PASS, REPEATABLE**

| Case | Verified expectation | Status |
| --- | --- | --- |
| WhatsApp address normalization | Twilio address format accepts E.164 input and rejects invalid format | **PASS** |
| Inbound raw text preservation | Leading/trailing content survives normalization unchanged | **PASS** |
| Delivery payload normalization | Provider delivery status maps to normalized state | **PASS** |
| Monotonic delivery state | Late callbacks cannot incorrectly move a message backward | **PASS** |
| Outbound duplicate key | Same linked task/purpose/body yields the same key; changed body yields a different key | **PASS** |
| Official Twilio signature validation | Valid signature passes and changed body fails | **PASS** |
| Meta outbound normalization | Recipient, Graph URL, and text body normalize correctly | **PASS** |
| Meta challenge verification | Correct verify token returns challenge; wrong token fails | **PASS** |
| Meta HMAC signature | Correct raw-body signature passes; modified body fails | **PASS** |
| Meta inbound/delivery normalization | Text, reaction, reply reference, and delivery state normalize correctly | **PASS** |
| Twilio webhook guard | Exposed development endpoint rejects missing/invalid authentication | **PASS** |
| Meta webhook guard | Exposed development endpoint rejects unsigned requests and incorrect verification | **PASS** |

### Real Mitra Meta round trip

**Status: VERIFIED PASS, REAL OUTPUT**

Accepted evidence:

1. A consented developer endpoint was linked to a fresh Mitra test household.
2. A low-risk walk routine was scheduled in the future.
3. Convex triggered the routine; no manual send path was used.
4. Meta accepted the outbound message and a real WhatsApp recipient received it.
5. A real WhatsApp reply returned through the subscribed Meta webhook.
6. Webhook signature/account context passed before normalization.
7. Raw reply persisted before interpretation.
8. Mitra stored only the supported self-report meaning and completed the occurrence/run.
9. Ordered scheduler, transport, webhook, persistence, interpretation, and state steps were readable.
10. Stable reread preserved final state and raw reply.

### Real Tarla Meta missing-ingredient loop

**Status: VERIFIED PASS, REAL OUTPUT**

Accepted evidence:

1. A full-day plan was generated, corrected, approved, and linked to a ready cooking-person endpoint.
2. A scheduled visit triggered without a manual send.
3. Meta delivered the real cooking instruction.
4. The recipient replied “Palak nahi hai.” in WhatsApp.
5. The signed webhook normalized and linked the raw reply to the open execution.
6. Tarla identified the affected meal, chose a constraint-safe replacement, and recalculated nutrition deterministically.
7. Full-day nutrition state changed and palak entered the shopping-needed list.
8. The primary user was not interrupted for the resolvable exception.
9. A revised instruction was sent through Meta and received as a second real WhatsApp message.
10. The trace showed the real transport and exception steps.

### W4 setup blockers and fixes proved during the checkpoint

- Twilio was retained as an adapter/fallback when the active W4 direction changed to direct Meta Cloud API.
- Meta Graph API configuration was aligned with the subscribed webhook version used for the test.
- The Aevia app was explicitly added to the WABA subscription without removing the existing subscription.
- The `messages` webhook field was subscribed before inbound acceptance evidence was recorded.

## Regression status at W4 checkpoint

| Area | Accepted state |
| --- | --- |
| M1.1 | Backward-compatible journey passed |
| W1 | Shared infrastructure verification passed |
| W2 | 7/7 evals and autonomous scheduling passed |
| W3 | 10/10 evals passed |
| W3.1 | Full-day and autonomous cooking-person scheduling checks passed |
| Development transport | Retained for repeatable tests |
| Twilio adapter | Retained; not the active real W4 provider |

## M2 named evaluation set

**Status: VERIFIED PASS — 39/39 deterministic/source checks and 1/1 synthetic browser execution**

The tracked `m2_real_household_execution` set covers:

- Mitra direct, caretaker, and both-mode low-chatter routing;
- self-report completion, ambiguity, reaction safety, no-response behavior, and recipient acknowledgement;
- medicine-reminder stop requests, pending approval, approval application, rejection, and unchanged pre-decision state;
- active versus expired context;
- Tarla cook selection by visit responsibility, hired-cook/family-cook tone, cumulative household quantities, and latest-plan version;
- bounded missing-ingredient handling, restriction and unsupported-rule review paths, shopping-needed, and zero primary-user intervention for an allowed substitution;
- requested/accepted/delivered/failed state distinctions and raw-before-interpretation ordering;
- linked trace metadata, honest missing usage data, one-claim evidence records, successful-task counting, and primary-user-intervention counting;
- consumer dashboard approval/handled/shopping states and a household-scoped run inspection at desktop and 390px.

The M2 browser suite uses synthetic Convex development endpoints only. It is not a real-surface WhatsApp acceptance test. Real Mitra and Tarla M2 tests remain gated by explicit owner approval.

## Planned evaluation program

Rows not covered by the named M2 set remain **PLANNED**. A local M2 pass does not make a real-surface or production claim.

### M5 acceptance gap

After the Convex development function mismatch was repaired, the user completed one manual Both onboarding flow. Visual/product acceptance still failed, and Figma is now the separate UX/UI source of truth. Before M5 acceptance, rerun fresh Mitra and Tarla branches, verify the existing-user edit/reread path after the reviewed cleanup functions are synchronized to Convex development, inspect analytics persistence, and complete desktop/mobile acceptance against the approved Figma implementation. No CLI-created household substitutes for these browser proofs.

| Category | Planned assertion | Status |
| --- | --- | --- |
| Context retrieval across runs | A later task retrieves the correct household/member context without copying stale specialist state | **PLANNED** |
| Provenance classes | UI/API clearly distinguishes user-confirmed fact, candidate extraction, agent inference, and self-report | **PLANNED** |
| Temporary memory expiry | “No paneer this week” affects only the valid period and expires predictably | **PASS — M2 deterministic** |
| Correction history | A correction supersedes prior memory while retaining an inspectable history and source | **PLANNED** |
| Medication self-report safety | All channels and surfaces say “reported” rather than claiming independent medication adherence | **PASS — M2 + W2 development** |
| Risk-level action | Low-risk change logs normally; medium follows configured notify/confirm rule; high-risk change cannot activate without explicit confirmation | **PASS — bounded M2 rules** |
| Exception auto-resolve | Known safe bounded exception resolves and remains observable | **PASS — M2 synthetic development** |
| Exception resolve + notify | A safe material change resolves and produces one clear primary-user notification | **PLANNED** |
| Exception asks primary user | Conflicting/unknown context pauses without guessing | **PASS — M2 supported review paths** |
| Admin/human review | Unsafe, unsupported, or repeated failure enters a controlled review queue | **PLANNED** |
| Human resolution feedback | Review resolution updates appropriate memory and creates/extends a named eval without making unsupported permanent preference | **PLANNED** |
| Ambiguous Aevia routing | One shared channel with multiple possible tasks asks a safe clarification and completes neither task falsely | **PLANNED** |
| Relationship-aware Mitra language | Salutation, relationship, respect, preferred language, and learned family vocabulary remain coherent across turns | **PARTIAL — bounded M2 templates; learned vocabulary remains planned** |
| Mitra familiarity progression | Day-0 task-led tone changes only after genuine senior engagement | **PLANNED** |
| Anti-AI-slop | Messages avoid generic praise, fake empathy, repeated introductions, engineering language, and unnecessary length | **PLANNED** |
| Cuisine/cultural appropriateness | Plan respects explicit cuisine and household context without stereotypes | **PLANNED** |
| Indian meal completeness | Where context expects it, a day includes coherent main/protein/staple/accompaniment combinations | **PLANNED** |
| Cook-friendly quantities | Cooking instruction uses cumulative pieces/rotis/katoris/cups/spoons and never exposes serving equivalents | **PASS — M2 + W3 development** |
| Cooking-person role tone | Hired cook, family cook, and primary-user cooking flows use distinct appropriate language | **PASS — bounded M2 templates** |
| User-feedback learning | An explicit correction changes the next eligible plan and shows why | **PLANNED** |
| Latest-approved-plan semantics | Multiple edits before a scheduled visit always produce exactly the latest approved instruction | **PASS — W3.1 + M2 development** |
| Duplicate prevention | Scheduler retries and duplicate webhooks do not duplicate actions or complete tasks twice | **PLANNED** |
| Provider authentication failure | Task/run fails visibly with no false completion and no credential leakage | **PLANNED** |
| Invalid/unready recipient | Real send is blocked before provider submission | **PLANNED** |
| Provider idempotency | Retries reuse or reject the same logical outbound attempt as designed | **PLANNED** |
| Provider callback ordering | Delivered/read/failure callbacks in unusual order preserve a correct monotonic state | **PASS — W4 + M2 deterministic** |
| Primary-user intervention rate | Event model counts necessary intervention per successfully completed task without counting passive views as intervention | **PASS — M2 synthetic development ledger** |
| Beta consent versioning | Activation requires accepted Terms/Privacy version and stores actor/time/version | **PLANNED** |
| Sensitive-data masking | Admin fields are masked by default and reveal is authorized and auditable | **PLANNED** |

## Product quality measures

### Candidate primary metric

```text
primary-user intervention rate =
  primary-user interventions / successfully completed tasks
```

Before measurement, define:

- what counts as a task
- what counts as successful completion
- whether initial required approval is a baseline interaction or an intervention
- how corrections, exception decisions, manual retries, and optional views differ
- safety and quality guardrails that prevent a low rate from rewarding silent errors

### Supporting measures

- completion rate by task type
- false-completion rate
- correction rate
- unresolved exception rate
- provider failure rate
- response latency
- time from exception to resolution
- percentage resolved without primary-user intervention
- memory correction and expiry accuracy

## Evidence rules for future milestones

1. Name the eval set and each case.
2. Keep raw input separate from expected interpretation.
3. State whether execution is deterministic, simulated, scheduled, or real-provider output.
4. Do not call a manually invoked send an autonomous scheduler proof.
5. Do not call provider acceptance delivery, reading, or real-world completion.
6. Do not call self-report independent verification.
7. Preserve failing cases; do not rewrite expectations to create a pass.
8. Do not expose real phone numbers, tokens, message IDs, or sensitive household content in tracked fixtures.
9. Mark skipped, blocked, and planned checks honestly.
10. CI gating remains future work until separately approved.
