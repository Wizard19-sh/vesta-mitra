# Aevia Changelog

This changelog records product-direction changes and verified development milestones. It is evidence-led: a checkpoint means the named implementation passed in development, not that it is broadly launched.

## Final submission freeze — 2026-09-05

The documentation set was frozen locally without product-code changes, a fresh test run, deployment, WhatsApp send, commit, or push. Git commands were unavailable during the freeze. The checked-out branch was recovered by reading the worktree's `.git` pointer and its `HEAD` directly: `m5-aevia-flow-and-m0-stability`.

The submission record is [README.md](./README.md), [EVIDENCE.md](./EVIDENCE.md), and [SUBMISSION_ASSETS.md](./SUBMISSION_ASSETS.md). Earlier entries remain historical evidence and retain their original limits; this entry does not increase any rubric claim.

The visible consumer brand is now **Aevia**. Internal Vesta and `vesta-mitra` identifiers remain unchanged during Build Week.

## Product evolution

### Original parent check-in idea

The product began as a parent check-in experience: an adult child configured how Mitra should contact a parent, selected a topic, reviewed the message, and interpreted a reply.

The first implementation proved the basic parent, routine, check-in, raw reply, and interpretation journey.

Relevant early checkpoints:

- `f915180d79523c99381ebb97270ead0a86f51b49` — `m1-golden-path`
- `3dd0b117041977e7839297b5c270e839e2833546` — `m1.1-context-and-composer`

### User feedback changed the thesis

The product direction moved away from an assistant acting as a child’s proxy for relationship check-ins. The stronger need was delegated everyday coordination that reduces household mental load without replacing human connection.

Core principle:

> Connection stays human. Coordination becomes agentic.

### Mitra became a routine specialist

Mitra was repositioned as a familiar everyday assistant for parents, grandparents, and other senior family members. Its initial work became medication reminders, walks/activity, appointments, and custom routines.

The key safety distinction became explicit:

> A senior’s reply is a self-report, not independent verification.

### Tarla became a kitchen specialist

Tarla was added to remove recurring meal decisions and cooking-person coordination. It plans from household context, calculates nutrition deterministically, waits for initial user approval, schedules concise instructions, and handles bounded kitchen exceptions.

### Aevia emerged as the shared household assistant

The shared layer became the product hub: household identity, members, memory, endpoints, transport, routing, observability, and later orchestration.

The consumer relationship is Aevia. Mitra and Tarla remain specialist agents behind that shared relationship.

Aevia is currently a shared hub, not yet a fully dynamic manager/orchestrator.

## Verified milestones

### Meta development WABA subscription correction

Verified on 2026-09-05 without sending WhatsApp: the existing authenticated Meta app was subscribed to the already configured Convex-development WABA after a Mitra request failed with Meta code `131005`. The sender, recipients, token, scopes, webhook URLs, provider, Convex deployment, and application code were unchanged. A fresh Mohit preview remained exact and behind the explicit SEND gate.

### New live Household 1 contact resolution

Verified on 2026-09-05 without sending WhatsApp: the newest live-created Household 1 replaced older Phase A and earlier household mappings for Mohit and Krishna. Their existing validated Meta inbounds now resolve to the new shared-member endpoints, while historical records remain preserved. The user-approved Tarla plan is retained unchanged; Krishna prepare fails closed because its scheduled execution does not yet contain an exact composed instruction. Convex also contains no Ivvan member in this saved household, so the missing record is reported rather than invented.

### Krishna scheduled-to-prepared Tarla handoff

Implemented and verified on 2026-09-05: the existing beta prepare operation can safely convert a current user-approved, future scheduled Tarla execution into an exact prepared payload. It reuses the original plan, execution, and run; confirms no transport activity; composes through the shared Tarla instruction function; cancels the old scheduler job; and leaves dispatch exclusively behind `sendPreparedDayInstruction`. No WhatsApp message was sent. Meta authentication later returned HTTP 401 because the temporary token expired.

Production registry verification later passed after Krishna's existing server-side entry received the canonical Household 1 owner key. The live admin runner returned the same prepared execution, run, and exact text; Meta authentication returned HTTP 200 and SEND remained gated.

### M0 — Stabilise Aevia

Implemented locally on 2026-09-03:

- removed the profile-ID React key that remounted fresh onboarding after identity creation
- kept returned household/member IDs inside the active onboarding flow
- froze saved-session hydration to the initial mount instead of recalculating it during an active flow
- resumed identity-only saved sessions at Choose Help
- added Back controls that preserve entered field state
- added one guarded browser-storage abstraction for device, analytics, and retained legacy identity values
- prevented unpersisted credentials from becoming temporary unrelated household sessions
- added a concise recoverable state for onboarding, dashboard, and run-view access when browser persistence is unavailable
- made analytics stop quietly when its browser identifier cannot be read or written
- added dependency-free M0 checks and real-browser Playwright coverage

Verified:

- `npm run verify:m0`: 15/15
- `npm run verify:m0:browser`: 3/3 in Microsoft Edge
- `npm run verify:m5`: 17/17
- `npm run verify:m5:route`: 3/3 after the approved Convex development synchronization
- W1, W2, W3, W3.1, and W4 regressions: pass using synthetic/development paths
- TypeScript: pass
- production build: pass
- full lint: zero errors; four pre-existing warnings in generated Convex files
- no real WhatsApp message, Convex production deployment, web deployment, commit, or push

Closure note: the initial M5 route-version preflight failed because the connected Convex development deployment lacked `m5:getRuntimeVersion`. After explicit owner approval, `npx convex dev --once` synchronized the reviewed local functions to development only and the preflight passed 3/3. The broader approved onboarding/dashboard visual redesign remains pending; M0 did not start it.

### M1 — Complete Aevia household and specialist setup

Implemented and verified locally on 2026-09-03:

- changed public primary CTAs to **Hello Aevia** while retaining **Meet Aevia — your personal household assistant.** as supporting brand copy
- extended the existing shared `members` model so one person can be reused across Aevia, Mitra, and Tarla without duplicate specialist identities
- added arbitrary household members with relationship, life stage, explicit salutation, supported language, contact type, and reusable saved IDs
- rebuilt onboarding as a progressive Mitra-only, Tarla-only, or Both flow with shared people and focused returning-user edit paths
- added Mitra direct, caretaker/family, and both coordination setup; multiple independently scheduled routines; optional notes; explicit AM/PM controls; and familiar medicine labels without exact-medication storage
- added Tarla eater selection, separate restrictions and preferences, custom entries, multiple expiring day rules, balanced or supported adult nutrition-goal setup, and multiple relationship-aware cooking people/visits
- added deterministic customer-facing portions in household measures with cumulative kitchen totals that reconcile
- updated the consumer dashboard to show saved household and specialist setup, honest upcoming work, a good “nothing needs you” state, and direct edit links without Agent Runs navigation
- retained M0 safe-browser-storage behavior and existing W1–W4 runtime semantics

Verified:

- `npm run verify:m1`: 31/31
- `npm run verify:m1:browser`: 2/2, including the full Both flow, six people, shared specialist identity, returning edits, reload, and 390px overflow coverage
- `npm run verify:m5:route`: 3/3
- `npm run verify:m0`: 15/15
- `npm run verify:m0:browser`: 3/3
- `npm run verify:m5`: 17/17
- W1, W2, W3, W3.1, and W4: pass using development/synthetic paths only
- TypeScript and production build: pass
- lint: zero errors and four existing warnings in generated Convex files
- Content Manager review: pass after removing unsupported or overly technical customer wording

Development note: `npx convex dev --once` synchronized the additive M1 schema and functions to Convex development `grand-goshawk-952` for browser acceptance. It did not deploy production or the web application. No real WhatsApp message was sent.

Known M1 boundary: the setup records Mitra’s `both` coordination path and multiple cooking people, but full multi-recipient follow-up and multi-cook execution remain later execution work. Generic free-text day rules are saved as context; arbitrary rule interpretation is not claimed.

### M2 — Real household execution, non-live gate

Implemented and verified with synthetic Convex development records on 2026-09-03:

- made Mitra's saved direct, caretaker, and both communication paths executable without duplicating household members or sending every ordinary reminder to two people
- preserved intended recipient, recipient role, selection reason, raw inbound reply, interpretation, honest outcome, acknowledgement, and useful primary-user summary as separate task facts
- added an explicit higher-risk approval path for medicine-reminder stop requests; the routine remains unchanged until the authorised primary user approves it
- separated requested, provider-accepted, delivered, read, and failed transport lifecycle evidence without treating acceptance as delivery
- selected Tarla's cooking person from the matching visit, meal responsibility, and schedule rather than the first saved cook
- generated cooking-person instructions from cumulative household measures and the latest current plan version
- completed the bounded missing-ingredient loop with constraint checks, plan/version update, recalculated household quantities, shopping-needed state, revised instruction, and no primary-user interruption for a supported safe substitution
- treated expired context as inactive and kept unsupported free-text food rules visible for review instead of claiming they were automatically enforced
- added linked execution exceptions, evidence records, step metadata, and execution analytics for successful tasks and real primary-user interventions
- added the smallest consumer approval, handled-outcome, and shopping-needed states, plus a richer household-scoped run inspection view for M2 verification
- completed Content Manager review for new Mitra, caretaker, cooking-person, approval, outcome, and shopping wording

Verified before any real send:

- `npm run verify:m2`: 39/39
- `npm run verify:m2:browser`: 1/1 with synthetic records, including desktop and 390px inspection
- `npm run verify:m1`: 31/31
- `npm run verify:m1:browser`: 2/2
- `npm run verify:m5:route`: 3/3
- `npm run verify:m0`: 15/15
- `npm run verify:m0:browser`: 3/3
- `npm run verify:m5`: 17/17
- W1, W2, W3, W3.1, and W4 non-live regressions: pass

Development note: `npx convex dev --once` synchronized the additive M2 schema/functions and reviewed message templates to Convex development `grand-goshawk-952`. Production was not targeted. No real WhatsApp message, web deployment, Git push, or production Convex deployment occurred.

Live gate: the next action is one consented Mitra real-surface test and one consented Tarla real-surface test. Both require explicit owner approval before any command that can send a message. M2 is not checkpointed or called fully accepted until that gate is completed or explicitly waived.

### W1 — shared infrastructure

Included in local checkpoint:

```text
90d8a665eef26b8a0c09cdb437afd8fba6947647
w2-vesta-memory-and-mitra-runtime
```

Verified:

- household and multiple members
- optional shared member context
- scoped, inspectable preferences with source and active state
- provider-neutral communication endpoints
- shared Mitra/Tarla run and ordered step logging
- correction records and active preference behavior
- backward-compatible M1.1 records

Important decision: shared household context belongs to Aevia/Vesta, not duplicate specialist profiles.

### W2 — Mitra scheduled runtime

Local checkpoint:

```text
90d8a665eef26b8a0c09cdb437afd8fba6947647
w2-vesta-memory-and-mitra-runtime
```

Verified:

- durable routine separate from occurrence/check-in
- once-now, once-scheduled, and recurring timing model
- autonomous Convex scheduled trigger
- no duplicate occurrence or send in the recurrence test
- shared-context retrieval and message composition
- provider-neutral development send
- normalized inbound signal and raw-first persistence
- self-report-safe interpretation
- waiting, confirmed, unconfirmed, no-response, and failed paths
- complete ordered run trace
- Mitra W2 named evals: **7/7**
- M1.1 regression passed

Important fix: scheduler acceptance required waiting for the actual scheduled job. A manual send was not accepted as scheduler proof.

### W3 — Tarla meal and kitchen runtime

Included in local checkpoint:

```text
cc2a9dceaebda6de0810ef2d6679272875880eae
w3-tarla-day-planning-and-kitchen-runtime
```

Verified:

- household and member meal profiles
- optional deterministic Mifflin-St Jeor energy estimate
- editable nutrition targets
- structured dietary and frequency rules
- focused structured recipe and ingredient library
- deterministic recipe, serving, and member nutrition
- user-first approval and correction loop
- explicit correction stored in shared memory and used by later plans
- cooking-person priming/readiness and provider-neutral endpoint
- concise instruction generation
- raw cooking-person reply persistence
- missing-palak substitution, nutrition recalculation, and shopping-needed update
- no unnecessary user interruption for the resolvable exception
- Tarla W3 named evals: **10/10**

Important boundary: nutrition is computed from structured ingredients; generated prose does not invent macros.

### W3.1 — full-day planning and cook visits

Included in local checkpoint:

```text
cc2a9dceaebda6de0810ef2d6679272875880eae
w3-tarla-day-planning-and-kitchen-runtime
```

Product correction: a daily nutrition target requires a coherent full-day plan, not only one independent meal.

Verified:

- breakfast, lunch, optional snack, and dinner planning
- per-meal and full-day nutrition
- daily target variance
- different meal participation/portions for primary adult, another adult, and child
- once-daily, twice-daily, and configurable cooking-person visits
- configurable instruction lead time with a 30-minute default
- meal allocation across visits
- autonomous scheduled instruction before arrival
- latest-approved-plan retrieval at send time
- duplicate prevention for a plan/visit occurrence
- missing-ingredient replan updates affected meals and full-day nutrition

Important fix: instructions are not frozen too early. A plan changed and re-approved before send produces the latest approved instruction.

### W4 — real WhatsApp transport

Local checkpoint:

```text
1c6d6c739a065bce26baad74bb13ce47d1db0876
w4-real-whatsapp-transport
```

Verified provider foundation:

- provider-neutral application transport preserved
- development transport retained
- Twilio WhatsApp adapter and signed webhook handling retained as fallback
- Meta WhatsApp Cloud API adapter added as active W4 provider
- Meta verification challenge and HMAC webhook signature validation
- configured WABA and Phone Number ID checks
- normalized inbound text, reactions, and delivery events
- raw-first persistence and safe unmatched routing
- provider message and delivery state
- idempotent outbound and inbound handling
- W4 provider preflight: **12/12**

Verified real Mitra output:

- Convex scheduler triggered a real Meta WhatsApp message
- developer-controlled recipient received it
- real reply returned through the Meta webhook
- raw reply, supported interpretation, final occurrence state, and run trace persisted
- no manual send after scheduling

Verified real Tarla output:

- scheduled approved full-day visit instruction reached real WhatsApp
- recipient replied “Palak nahi hai.”
- signed webhook linked the raw message to the open Tarla execution
- Tarla replanned, recalculated nutrition, and added palak to shopping-needed state
- revised instruction reached real WhatsApp as a second message
- the resolvable exception did not require primary-user intervention

Important blockers and fixes:

1. **Provider direction changed:** Twilio configuration work stopped when Meta’s Cloud API test environment became available. Twilio was preserved behind the same interface rather than deleted or added to specialist logic.
2. **Graph version alignment:** the Meta Graph API version was aligned with the version used by the subscribed webhook configuration.
3. **WABA subscription:** the WABA initially returned only an existing Meta-owned subscription. The Aevia app subscription was added without removing the existing subscription.
4. **Inbound field subscription:** the Meta `messages` webhook field was subscribed before real inbound evidence was accepted.
5. **Routing ambiguity:** provider-normalized inbound uses reply context/open work and refuses to select a specialist when multiple task matches are unsafe.
6. **Sensitive test evidence:** real credentials, phone numbers, provider IDs, and local live-test state remained ignored and outside the commit.

## Documentation control plane — current uncommitted milestone

Created as documentation-only work:

- `IDEA_SCOPE.md`
- `ARCHITECTURE.md`
- `EVALS.md`
- `PRODUCT_LANGUAGE.md`
- `CHANGELOG.md`

Added as the supplied GrowthX v2.2.0 scoring and proof register:

- `EVIDENCE.md`

Added as the Build Week and closed-beta execution order:

- `BETA_LAUNCH.md`

No product code, schema, environment variables, deployment, provider configuration, or live messages are part of this documentation milestone. The docs are not yet checkpointed unless a later instruction creates a commit.

## Current state after W4, before M5

- Shared Aevia/Vesta context and specialist runtime foundation: built in development.
- Mitra autonomous routine loop: built and verified.
- Tarla meal/full-day planning and cooking-person execution: built and verified.
- Meta real WhatsApp test round trips: built and verified with a controlled recipient.
- Development transport: retained.
- Twilio adapter: retained as fallback, not active W4 direction.
- Dynamic Aevia intent manager: not built.
- Aevia consumer UX, primary-user dashboard, and beta admin dashboard: not built at the W4 checkpoint.
- Terms, Privacy, beta acceptance/versioning, and product analytics: not built at the W4 checkpoint.
- Production launch configuration: not complete.

## M5 — minimum testable Aevia product (in progress)

Implemented locally, not committed or production-deployed:

- public Aevia landing page with Mitra/Tarla WhatsApp-style action proof
- shared identity, explicit versioned beta acceptance, and minimum household context
- Mitra, Tarla, and Both onboarding branches
- real W2 routine scheduling and W3/W3.1 plan/approval scheduling connections using the development transport
- full-day plan review and correction input
- user dashboard and household-scoped ordered run viewer
- beta Terms, Privacy, and status pages
- privacy-safe first-party analytics event ledger and allowlisted instrumentation
- retained M1.1 UI at `/legacy-mitra`
- cook-facing formatting that removes the internal phrase “serving equivalents” and rounds visibly awkward decimal gram values

Verified locally:

- `minimum_testable_aevia_m5`: 17/17 after the functional-cleanup regression additions
- TypeScript and production build
- all eight product routes return HTTP 200
- W1, W2 7/7, W3 10/10, W3.1, and W4 12/12 regressions
- no real WhatsApp message sent

Manual acceptance and repair history:

- The first landing-to-onboarding test failed at runtime with `Could not find function for 'm5:getSession'. Did you forget to run npx convex dev?`
- Root cause: generated local M5 bindings were ahead of the connected Convex development functions.
- `npx convex dev --once` synchronized Convex development only; `scripts/verify-m5-route.mjs` now protects the deployed-function preflight as well as the HTTP application shell.
- The user then completed a full manual Both onboarding flow.
- Visual/product acceptance still failed. Figma is now being developed separately as the UX/UI source of truth; this cleanup does not redesign the current interface.

M5 functional cleanup implemented locally:

- existing identity, household context, agent choice, Mitra setup, Tarla setup, recipient/cooking-person details, and current schedule data now pre-populate when setup is edited
- existing Mitra member/parent/endpoint/routine records are updated instead of duplicated; unchanged timing keeps its scheduled job
- existing Tarla members/cook state/endpoint are reused; unchanged cook visits are idempotent; editing an existing setup does not generate another day plan by itself
- fresh setup no longer contains founder-specific persisted Mitra defaults such as `Papa`, `Sid`, or a founder household name
- landing onboarding links use Next.js client navigation and no unconditional unsaved-change handler is installed
- Agent Runs displays long durations in readable units and distinguishes end-to-end elapsed time, recorded human waiting, recorded processing, and transport-call time

Still open before M5 can be called accepted:

- live edit-path reread after the reviewed functions are synchronized to Convex development
- fresh Mitra and fresh Tarla branch-specific manual reruns
- approved Figma implementation plus desktop/mobile visual acceptance and safe screenshot references
- reread of created/updated M5 records and analytics from the clicked journey
- PostHog configuration/read-only analytics view

The in-session browser connector returned no available browser, so browser acceptance is not claimed.

### GrowthX rubric v2.2.0 control update

Exact supplied L3 → L4 → L5 thresholds are now recorded in the control plane:

- Real output on a real surface (20x): `Works, but staged/test surface only` → `Real output on real surfaces but the builder has to babysit (human approves every step).` → `Autonomously completes a real task in declared domain end-to-end, output lands on real live surfaces (live site, real ATS, real support queue, real repo), production quality.` Target: **L5**.
- Observability (7x): `Pull up one run, see each agent step by step` → `Trace tree across agents (who called whom), token and cost per step, filter by agent or task.` → `Production-grade: diff two runs side by side, alerts on failure or cost spike, search across runs, senior eng would trust this to debug prod.` Target: **L4**.
- Agent org structure (5x): `Manager + specialists, static routing.` → `Dynamic: manager agent plans subtasks based on the specific request, delegates, reviews outputs.` → `Emergent org: manager spawns sub-specialists on the fly, agents escalate when stuck, roles self-adjust to task.` Target: **L4**.
- Evals and iteration (5x): `Named eval set, run manually between versions.` → `Automated eval pipeline, CI-style, fails a release if quality drops.` → `Closed-loop: failed runs feed a growing eval set, version-controlled prompts and agents, measurable gains across versions.` Target: **L4**.
- Handoffs and memory (2x): `Short-term memory within one task.` → `Persistent memory across tasks (remembers past customers, past projects).` → `Hierarchical: working memory (current task) + episodic (past tasks) + semantic (domain facts, team norms).` Target: **L4 initially**.
- Cost and latency (1x): `5–10 min OR $0.50–$2.` → `1–5 min OR $0.10–$0.50.` → `Under 1 min AND under $0.10.` The lower tier governs. Target: highest genuinely measured tier.
- Management UI (1x): `A PM could operate it with docs.` → `Clean UI, non-eng operates with one walkthrough.` → `Delightful UI, non-eng volunteer defines a new agent role (job, tools, guardrails) in under 10 min unassisted.` Target: **L4**.

No current rubric claim was upgraded solely because the higher-level wording became available. Developer-recipient W4 evidence remains labeled `DEVELOPER TEST`.

### W4 — Clean Tarla Meta evidence recovery

On 2026-09-04, the controlled Tarla Meta loop was rerun with customer-facing fixture names Priya, Sid, and Kayaan. The delivered initial and revised WhatsApp copy contains no W4/test/fixture/synthetic language. A real `Palak Nahi hai` reply passed through the signed Meta webhook, raw inbound storage, supported substitution, nutrition recalculation, shopping-needed update, and revised-instruction composition.

The first revised Meta dispatch failed because the development access token expired (`meta_190`). After a manual development-token refresh, one guarded retry resent the unchanged revised instruction through the existing Meta transport and Meta reported delivery. The run remains `revised_waiting` for a real cook acknowledgement; no acknowledgement was fabricated. Canonical evidence is `EVD-016` in `EVIDENCE.md`.

### Beta runner — direct Convex-development execution

On 2026-09-05, the Production `/admin/beta` runner was changed to call the existing Convex-development Tarla and Mitra functions directly. It no longer attempts to invoke the local W4 verifier scripts from Vercel. The verifier scripts and their development-only safety guard remain unchanged.

Verified without a WhatsApp dispatch:

- BETA-5 recipient, masking, exact-preview, and no-local-verifier checks: passed
- W4 provider-transport checks: 12/12 passed
- TypeScript and production build: passed
- production-like admin Prepare and the canonical Production runner: passed with the explicit SEND gate intact

### Pari approval-state correction

On 2026-09-05, diagnosis confirmed that Pari's live approval had persisted correctly as a `household_user` approval, but the beta recipient registry still referenced an older Pari household. The registry now resolves Pari's actual live-browser household and plan without recreating or administratively approving either record.

The already-approved instruction had previously run only through the development transport. A guarded beta preparation mutation now preserves that historical run, requires the original household-user approval, rejects any execution that already has a real provider message, and creates one idempotent `instruction_ready` payload for the existing Meta send gate. Production Prepare returned the exact stored Vaibhav instruction; no WhatsApp message was sent.

## Explicit remaining work

### NEXT — closed-beta product readiness

- Aevia-branded landing, signup, onboarding, and account experience
- one Aevia relationship/channel with explicit specialist activation
- “What Aevia knows about my household” inspection/correction surface
- primary-user routine, plan, history, exception, and settings dashboard
- separate beta admin operations and human-review queue
- sensitive-data masking, controlled reveal, and access policy
- shared exception records and resolve/notify/ask/review behavior
- explicit risk state and confirmation for medium/high-impact changes
- richer memory provenance, verification, validity/expiry, and correction history
- week-level Tarla planning while preserving visit-specific execution
- cooking-person role/capability-aware instructions
- product analytics, including backend provider events
- definition and measurement of primary-user interventions per successful task
- Beta Terms of Use, Privacy Policy, progressive disclosures, acceptance time/version
- dedicated Aevia Meta production WhatsApp number and launch configuration
- named planned evals in `EVALS.md`

### FUTURE

- Aevia dynamic intent interpretation and specialist delegation
- bounded senior-initiated routines with risk-based approval
- voice input and voice communication
- prescription image/PDF extraction with confirmation
- production medical-document privacy/regulatory program
- licensed/open recipe expansion and provenance controls
- contextual festival/event suggestions
- grocery app/cart/ordering integrations where supported
- transparent, user-controlled trust graduation
- Hermes routing/operations if it adds value without changing specialist logic

### OPEN decisions

- legal review and jurisdiction-specific beta terms/privacy requirements
- health and medical-document regulatory handling
- data retention, deletion, access, export, and withdrawal behavior
- admin roles, audit, and sensitive reveal policy
- recipe licensing and attribution rules
- analytics consent and data-minimization policy
- exact definition and guardrails for the “up to 10 hours” hypothesis
- timing and risk of any future internal Vesta-to-Aevia identifier migration

## Evidence references

- Product and scope: [IDEA_SCOPE.md](./IDEA_SCOPE.md)
- System boundaries: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Verified and planned evaluations: [EVALS.md](./EVALS.md)
- Communication rules: [PRODUCT_LANGUAGE.md](./PRODUCT_LANGUAGE.md)
- GrowthX scoring and proof plan: [EVIDENCE.md](./EVIDENCE.md)
- Build Week and closed-beta execution order: [BETA_LAUNCH.md](./BETA_LAUNCH.md)
- Repeatable scripts: `scripts/verify-w1.mjs`, `scripts/verify-w2.mjs`, `scripts/verify-w3.mjs`, `scripts/verify-w3-1.mjs`, and `scripts/verify-w4.mjs`

- Added a narrow deterministic Tarla rule for cook replies that combine an
  ingredient-ordering need with acceptance of the current instruction.
  Missing-ingredient substitution and ordinary acknowledgement behavior remain
  unchanged.
- Deployed commit `50896cbf9c8324c7d42600f42d73d20d21967b62` to Vercel Production at `https://helloaevia.vercel.app` on 2026-09-05 08:19:37 IST. Convex development was synchronized, both public routes returned HTTP 200, Meta authentication returned HTTP 200, and Krishna's existing conversation window remained open. No WhatsApp message was sent.
- Generalized Tarla's deterministic shopping-plus-acceptance interpretation from a phrase-specific rule to a bounded English/Hinglish intent class. It requires a known explicit ingredient or one unambiguous referenced ingredient from the active instruction, a shopping verb, and acceptance language. Negated shopping, unknown products, ambiguous context, ordinary acknowledgements, and missing-ingredient substitution remain fail-closed or unchanged.
- Deployed generalized interpreter commit `bfc511ce12d4d93e0d82ba2afb689be94916f195` to Vercel Production at `https://helloaevia.vercel.app` on 2026-09-05 08:31:19 IST and synchronized Convex development `dev:grand-goshawk-952`. The canonical root returned HTTP 200, Meta authentication passed with HTTP 200, and Krishna's canonical member/contact mapping and validated 24-hour window remained active. No WhatsApp message was sent.
