# Aevia Architecture

## Purpose

This document is the canonical architecture map after the W4 checkpoint and the local M5 functional skeleton. It separates verified implementation from the next product layer and longer-term direction; M5 visual/product acceptance remains pending.

The consumer brand is **Aevia**. Existing internal identifiers—including Vesta names and `vesta-mitra`—remain in place during Build Week.

Status labels:

- **CURRENT** — implemented and verified in Convex development.
- **NEXT** — required for the closed-beta product, but not yet implemented or verified.
- **FUTURE** — intended direction that should remain compatible with current boundaries.
- **OPEN** — needs a product, legal, security, privacy, or operations decision.

## System definition

Aevia is the shared household context, memory, and runtime hub.

- **Mitra** is the senior/parent routine specialist.
- **Tarla** is the meal-planning and kitchen-coordination specialist.

The specialists share household identity, members, preferences, communication endpoints, transport, inbound events, and run observability. They retain their own task-specific state.

```text
Primary user and household participants
                    |
          one Aevia relationship
                    |
      provider-neutral message boundary
                    |
     +--------------+---------------+
     |                              |
 shared household hub          normalized inbound
 context / memory / runs       routing / raw events
     |                              |
     +--------------+---------------+
                    |
           +--------+--------+
           |                 |
         Mitra             Tarla
    routine instances   plans / executions
```

### CURRENT

Aevia is a shared hub and runtime foundation. It can route a normalized inbound message to an open Mitra or Tarla task when there is one safe match. It does not interpret arbitrary household intent and choose a specialist dynamically.

### TARGET

The primary user has one Aevia relationship and channel. Aevia understands the request, delegates to the right specialist, coordinates exceptions, and keeps shared context coherent.

### Constraint

Do not call the current hub a fully autonomous orchestrator. That would overstate the implementation.

## Current platform

| Layer | CURRENT implementation |
| --- | --- |
| Web application | Next.js application; current visible experience remains the M1.1 Vesta/Mitra journey |
| Backend and persistence | Convex functions, database, scheduler, and HTTP webhook routes |
| Shared context | Households, members, preferences, communication endpoints, readiness, consent status |
| Mitra runtime | Durable routines, scheduled occurrences/check-ins, response windows, normalized interpretation |
| Tarla runtime | Structured profiles/rules, meal and full-day plans, approval, cook visits, executions, shopping-needed state |
| Nutrition | Deterministic ingredient, recipe, per-serving, per-member, and full-day calculations; Mifflin-St Jeor estimate with explicit activity factors |
| Transport | Provider-neutral application boundary with development transport, Meta Cloud API, and Twilio fallback |
| Inbound gateway | Signed provider webhooks, provider normalization, safe task routing, raw signal persistence |
| Observability | Shared agent runs and ordered run steps with status, timestamps, latency, summaries, and errors |

## Context and data ownership

### Shared Aevia state

The shared layer owns:

- `households`
- `members`
- `preferences`
- `communicationEndpoints`
- `inboundSignals`
- `transportMessages`
- `devTransportMessages`
- `agentRuns`
- `agentRunSteps`

This prevents separate copies of the same household identity or ordinary preference inside each specialist.

### Mitra-specific state

Mitra owns:

- legacy-compatible `parents`
- durable `routines`
- occurrence-level `checkIns`
- `mitraMemberStates` for introduction/readiness

Legacy M1.1 records remain valid because shared links and W2 fields are optional where old data requires them to be.

### Tarla-specific state

Tarla owns:

- household meal context
- member food and optional nutrition profiles
- dietary and frequency rules
- cooking-person state and visits
- meal and full-day plans
- plan feedback and approval
- executions
- inventory snapshots
- shopping-needed items
- meal history

Explicit reusable corrections belong in shared Aevia preferences when they apply beyond one execution. Plan, visit, nutrition snapshot, and execution state remain Tarla-specific.

## Shared context flow

```text
household + members
        |
        +--> communication endpoints and consent/readiness
        |
        +--> active shared preferences
        |
        +--> Mitra routine context
        |
        +--> Tarla profile, dietary rules, history, inventory
```

A specialist reads the minimum context needed for its task. Raw events stay separate from interpretations. Observability summaries should avoid unnecessary sensitive content when a source record already exists.

## Provider-neutral messaging

Mitra and Tarla call the shared transport boundary. They do not call Meta or Twilio directly.

Application-facing outbound shape:

```ts
sendMessage({
  recipient,
  channel,
  message,
  metadata,
})
```

Normalized inbound shape:

```ts
{
  sender,
  recipient,
  channel,
  signalType,
  rawContent,
  providerMessageId,
  timestamp,
  metadata,
}
```

### CURRENT providers

| Provider | Role | State |
| --- | --- | --- |
| Development transport | Repeatable local/development verification | Active and retained |
| Meta WhatsApp Cloud API | Real W4 WhatsApp proof and intended direct provider path | Active development adapter |
| Twilio WhatsApp | Earlier W4 direction and provider fallback | Preserved, tested at the adapter/preflight level |
| Hermes | Possible later operating/routing layer | Not integrated |

Changing provider should mean adding or selecting an adapter and webhook normalizer—not changing Mitra or Tarla business logic.

### Outbound lifecycle

```text
agent requests normalized message
→ create transport message with idempotency key
→ choose provider from endpoint configuration
→ provider adapter validates readiness
→ provider accepts or rejects request
→ persist provider message ID and timestamps
→ later delivery updates may advance state
```

Tracked states are `requested`, `accepted`, `sent`, `delivered`, `read`, and `failed`. Provider acceptance is not the same as human receipt, reading, or action.

Duplicate outbound work is limited with deterministic idempotency keys and occurrence/execution keys. Delivery state only moves forward; a late callback should not downgrade a later known state.

### Meta outbound

The Meta adapter:

- reads server-side environment configuration
- validates a ready, active, consented endpoint
- formats a WhatsApp recipient address
- calls the configured Graph API version and Phone Number ID
- stores the provider message ID and acceptance time
- converts failures to safe provider errors without logging credentials

### Twilio fallback

The Twilio adapter remains behind the same boundary. It formats `whatsapp:` addresses, validates readiness, persists provider state, supports signed inbound/status callbacks, and does not leak Twilio logic into specialist code.

## Inbound gateway

Provider webhook code has four responsibilities:

1. Authenticate the provider request.
2. Validate that it belongs to the configured provider account/sender.
3. Normalize provider fields into Aevia’s inbound shape.
4. Call the shared route and specialist pipeline.

It must not contain Mitra or Tarla decision logic.

### Meta webhook

CURRENT route:

```text
/webhooks/meta/whatsapp
```

GET handles Meta’s verification challenge with a configured verify token. POST requires `application/json`, a valid `X-Hub-Signature-256` HMAC signature using the Meta app secret, the configured WABA ID, and the configured Phone Number ID.

The raw request body is signature-checked before JSON parsing. Logs contain safe counts and routing results rather than message content, phone numbers, or secrets.

### Twilio webhooks

CURRENT routes:

```text
/webhooks/twilio/whatsapp/inbound
/webhooks/twilio/whatsapp/status
```

Twilio request signatures are validated with the official SDK against the configured exact URL and account context.

### Normalization and routing

```text
signed provider webhook
→ provider-specific normalization
→ match sender endpoint and referenced outbound message when available
→ require one safe open task match
→ persist raw signal before interpretation
→ call Mitra or Tarla normalized inbound function
→ preserve unmatched or ambiguous inbound safely
```

If one address could match multiple open tasks and the system cannot select exactly one, routing returns no specialist match. It must not falsely complete a task.

Inbound events use provider message IDs and a dedupe key to make webhook retries idempotent.

## Scheduling and task state

### Mitra

```text
durable routine
→ Convex scheduled job at next occurrence
→ create one occurrence/check-in
→ retrieve shared context
→ compose and send
→ wait for normalized signal or response timeout
→ persist raw signal
→ interpret self-report
→ update occurrence and run
→ schedule next recurrence when applicable
```

The durable routine and one occurrence are different records. An occurrence can be `SCHEDULED`, `SENT`, `WAITING`, `CONFIRMED`, `UNCONFIRMED`, `NO_RESPONSE`, or `FAILED`. Legacy M1.1 states remain supported.

### Tarla

```text
household context + rules + memory + history
→ deterministic candidate selection and nutrition
→ plan awaiting approval
→ correction and replan if needed
→ latest plan approved
→ allocate meals to cooking-person visits
→ schedule each instruction for arrival minus lead time
→ at trigger, retrieve latest approved plan
→ compose and send visit-specific instruction
→ wait for cooking-person signal
→ resolve supported exception or preserve unresolved state
```

An execution links one approved plan/visit occurrence to its run, endpoint, instruction, response window, unavailable ingredients, and outcome. Already locked/completed meals should not be needlessly disturbed by a later exception.

## Interpretation rules

### Raw first

Raw inbound content is saved unchanged before interpretation. Interpretation is a derived record, never a rewrite of the source.

### Mitra

Mitra distinguishes:

- clear self-reported confirmation
- explicit negative response
- ambiguity
- unrelated text
- configured or unmapped reaction
- acknowledgment
- no response after the window

“Confirmed” means a supported self-report or explicitly configured acknowledgment—not independent evidence of the real-world action.

### Tarla

Tarla distinguishes acknowledgment, unavailable ingredient, recipe question, inability, timing issue, and unrelated/unresolved input. Deterministic exception logic can replan a supported missing ingredient while rechecking constraints and nutrition.

## Agent runs and observability

Each real task uses a shared `agentRuns` record and ordered `agentRunSteps`.

Run data includes:

- agent
- household
- task type
- queued/running/waiting/completed/failed state
- start/end times and total latency where known
- safe input/output summary
- safe error summary
- optional cost data

Step data includes:

- order and name
- status
- start/end and latency
- safe input/output summary
- error
- optional token and cost fields

Deterministic paths report no invented token or cost values.

CURRENT trace steps include real scheduler, context, composition, transport, provider acceptance, webhook receipt/validation/normalization, raw persistence, interpretation, state update, replan, nutrition, and shopping actions when those actions occur. Do not add trace steps merely to make a run look agentic.

The GrowthX judge-verifiability gap and minimum reviewer-facing run view are tracked in [EVIDENCE.md](./EVIDENCE.md).

## Memory architecture

### CURRENT

Shared preferences support:

- household scope
- optional member scope
- category and key
- string value
- source: onboarding, explicit correction, or agent observation
- active/inactive state
- optional expiry time
- created/updated times

Raw signals, feedback, plans, check-ins, and histories provide separate source evidence. Explicit Tarla corrections are already read by future plans.

### NEXT

Extend shared memory without invalidating existing records:

- verification state: unverified, candidate, confirmed, disputed
- confirmer identity and confirmation time
- structured validity start/end
- memory class: stable, temporary, recurring contextual, situational
- supersession and correction links
- reason/evidence reference without copying unnecessary sensitive text
- change history

Temporary memory must expire predictably. Situational events must not silently become permanent preference.

### FUTURE

Use confirmed history to make transparent suggestions. Keep the source visible and ask before major or high-risk changes. Vector retrieval is optional future infrastructure, not a substitute for explicit structured memory.

## Risk architecture

| Level | Required system behavior | Examples |
| --- | --- | --- |
| Low | May apply with normal logging | wording preference, walk time, birthday reminder |
| Medium | Notify or request confirmation based on impact | recurring schedule change, moved appointment, travel pause |
| High | Explicit human confirmation before material action | medication start/stop/dose, treatment instruction, allergy removal |

- **CURRENT:** unsupported medical decisions are outside specialist logic; current runtime does not perform them.
- **NEXT:** attach risk level, proposed action, confirmer, and decision state to a change request.
- **FUTURE:** policy-driven delegation with auditable household-specific limits.

## Exception architecture

| Class | System response |
| --- | --- |
| Auto-resolve | Resolve within known hard constraints; log the action |
| Resolve and notify | Resolve safely; tell the primary user what materially changed |
| Ask primary user | Pause and request a decision |
| Admin/human review | Queue an unsafe, unsupported, ambiguous, or repeated failure |

### CURRENT

Failures are visible in task/run state. Unmatched inbound events are preserved. Tarla can auto-resolve the verified missing-palak case without user interruption. A unified exception table and queue do not exist.

### NEXT

Add a shared exception record containing:

- agent, household, task, and run
- reason and risk level
- bounded context/evidence references
- attempted actions
- confidence where appropriate
- notification and review state
- resolver and resolution
- timestamps

Human resolution should update shared memory when appropriate and create or extend a named eval case. It must not automatically turn every resolution into a permanent preference.

## User and admin surfaces

### Primary-user dashboard — CURRENT M5 slice

The local M5 dashboard shows the household, active assistants, next routine/plan state, recent actions, known context, and current exceptions. It is a functional slice, not the approved final UX. Figma is the next UX/UI source of truth.

### Beta admin dashboard — CURRENT run slice; full dashboard NEXT

The local `/admin/runs` route lets the current device-bound household select a run and inspect its ordered, masked trace. A full operations surface for authorized Aevia staff—households, users, agents, runs, exceptions, failures, feedback, escalation queue, and a safe “view as user”—is NEXT.

The dashboards are not the same product. Admin access does not imply ordinary household access, and household access does not imply admin rights.

Sensitive data should be:

- masked by default
- revealed only through a deliberate control
- limited by role/access
- logged when revealed where appropriate
- excluded when it is not needed

The current code has queryable run/context records and summary masking, not complete dashboard access control, role-based authorization, controlled reveal, or reveal auditing.

## Analytics architecture

### CURRENT

Operational evidence exists in run steps, transport messages, delivery callbacks, inbound signals, task state, and timestamps. M5 also adds a privacy-allowlisted first-party product event ledger in Convex for the onboarding funnel. PostHog/read-only judge evidence and a complete backend event stream are not connected yet.

### NEXT

Connect PostHog or an equivalent stack through the existing event abstraction. Backend events must cover WhatsApp execution even when the user never visits the web application.

```text
web/browser event --------+
                          +--> Aevia event definitions --> analytics store
backend scheduler event --+
provider/webhook event ---+
agent/task event ---------+
```

Identity and privacy rules must prevent raw messages, phone numbers, medical context, or unnecessary food/household details from entering analytics properties.

Event groups and the candidate metric are defined in [IDEA_SCOPE.md](./IDEA_SCOPE.md). The primary-user intervention event needs an explicit taxonomy: approval, correction, requested decision, manual recovery, and optional review should not be conflated.

## Terms, privacy, and consent

### CURRENT

Communication endpoints record active state, consent status, optional verification time, provider, and readiness. Mitra has introduction/readiness state; Tarla has priming/readiness state. Real transport refuses a send when the selected endpoint is not active, consented, and ready.

M5 adds Beta Terms, Privacy, and Beta pages plus explicit onboarding acceptance with stored terms version, privacy version, and acceptance timestamp. These pages are beta drafts and still require legal review.

Recipient transport readiness and primary-user legal acceptance remain separate states.

### NEXT

Before external beta activation, complete:

- legal review and policy revision handling
- authenticated acceptance actor rather than device-only identity
- complete account/settings access to policies
- implemented withdrawal and data-handling behavior aligned with the published policy

Keep legal text and product controls aligned with actual data handling. Required content is listed in [IDEA_SCOPE.md](./IDEA_SCOPE.md).

## Identity and authentication

### CURRENT

M5 uses a random device credential stored in browser local storage to bind one browser to one beta household. This is real device-bound identity, but it is not email authentication, cross-device account recovery, or suitable production access control. The current setup and run routes therefore must not be treated as a secure multi-user account system.

### NEXT

Use a supported Convex-compatible authentication layer with verified user identity, household membership/roles, session management, recovery, and server-enforced authorization. Preserve the current household IDs and shared context while migrating; do not create a second household brain.

### OPEN

- legal review before broad commercial launch
- medical-document privacy/regulatory program
- data retention, deletion, access, and export behavior
- admin access roles and reveal audit policy
- analytics consent and jurisdiction-specific requirements

## Environments and secrets

Credentials remain server-side environment configuration. They do not belong in source, Convex user data, logs, run summaries, screenshots committed to the repository, or test fixtures.

Real test recipient data and run evidence remain in ignored local state. Provider IDs are persisted in development data only where needed for routing, delivery state, and evidence.

### Dedicated production WhatsApp identity

A dedicated Aevia Meta WhatsApp production number is a launch requirement.

- **CURRENT:** W4 used Meta’s test environment for controlled development verification.
- **NEXT:** obtain and configure the dedicated Aevia number, production WABA/app subscription, approved message templates where needed, production callback URL, monitoring, and operating ownership.
- **FUTURE:** place Hermes above or beside the direct Cloud API adapter only when it adds clear operational value. The specialist contract should not change.

## Evolution to an orchestrator

### CURRENT: shared hub

Routing uses endpoint/provider context, reply references when present, and one open-task match. The specialist is already known from the task.

### NEXT: unified entry and explicit routing

- one Aevia identity/channel
- shared onboarding and agent activation
- clear handling when no task or multiple tasks match
- user-visible routing explanation when useful
- explicit exception handoff

### FUTURE: dynamic delegation

```text
normalized request
→ retrieve authorized household context
→ identify intent and risk
→ choose Mitra, Tarla, or a safe clarification
→ delegate with scoped context
→ observe result and exceptions
→ update only justified shared memory
```

Dynamic delegation must preserve specialist boundaries, consent, risk confirmation, raw evidence, and human review. It must not become a reason to copy household context into another hidden state store.

## Architecture decisions that must remain true

1. One shared household context; no isolated duplicate household brains.
2. Routine definition and routine occurrence remain separate.
3. Tarla plan and cooking-person execution remain separate.
4. Raw inbound evidence is stored before interpretation.
5. A self-report remains a self-report.
6. Provider code stays behind the messaging boundary.
7. Webhooks normalize and route; specialists decide.
8. Provider retries and scheduled jobs are idempotent where practical.
9. Provider acceptance is not human action.
10. Deterministic nutrition does not come from generated prose.
11. Important action uses risk and consent gates.
12. Sensitive data is minimized and masked in future admin/product surfaces.
13. CURRENT, NEXT, and FUTURE claims remain explicit.
