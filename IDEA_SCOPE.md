# Aevia Product and Build Week Scope

## Document role

This is the canonical product and scope document for Aevia after the W4 development checkpoint. It guides product, design, engineering, evaluation, and beta operations.

The visible consumer brand is **Aevia**. Existing internal identifiers such as `vesta-mitra`, Vesta table names, function names, and deployment names remain unchanged during Build Week.

Status labels used throughout:

- **CURRENT** — implemented and verified in the W1-W4 development checkpoints.
- **NEXT** — intended for the next product and closed-beta work, but not yet verified.
- **FUTURE** — direction the architecture should allow without implying it exists today.
- **OPEN** — requires a product, legal, security, privacy, or operating decision.

The current canonical scoring reference is the GrowthX Build Week rubric v2.2.0 supplied directly from the GrowthX Build Week Scoring page / Build Week agent. The primary planned track is **AI Agent as a Service** and must not change without explicit user approval. Canonical L3/L4/L5 wording is recorded in [EVIDENCE.md](./EVIDENCE.md); complete canonical L2 wording is unavailable and must not be invented.

## Product

### Brand and proposition

- Brand: **Aevia**
- Core proposition: **“Aevia takes care of the everyday things you care about.”**
- Category: personal household assistant / household assistant
- Internal thesis: Aevia is a second brain plus an execution layer for the household.

“Second brain” explains the internal thesis. It is not necessarily the primary consumer-facing category.

### Benefit hierarchy

1. Removes mental load.
2. Saves time.
3. Makes sure things get done.
4. Gives peace of mind.

### Marketing hypothesis

**“Get up to 10 hours of your week back.”** is a supporting marketing hypothesis, not a measured Aevia result. It must be qualified until usage data supports a defensible claim.

### Core loop

```text
context
→ memory
→ decision
→ action
→ response
→ exception handling
→ feedback
→ better context
```

The success direction is fewer repeated interventions from the primary user while useful household tasks continue to complete safely.

Candidate product metric:

> Primary-user interventions per successfully completed task

This metric needs a precise event definition before it becomes a reporting claim. A lower number is useful only when completion quality and safety remain acceptable.

## Product architecture

### Aevia as the hub

Aevia owns the shared household relationship:

- household context
- members and identity
- shared memory and preferences
- communication endpoints
- inbound routing
- exception state
- run observability
- future orchestration

Mitra and Tarla are specialists that consume relevant, scoped Aevia context. They must not maintain isolated duplicate “household brains.” Agent-specific task state can remain separate.

Core principle:

> Connection stays human. Coordination becomes agentic.

Users can eventually activate Mitra, Tarla, or both. The primary user should experience one Aevia platform and one communication relationship; they should not need a separate WhatsApp number for every specialist.

- **CURRENT:** shared household, member, preference, endpoint, transport, scheduler, inbound, and run infrastructure exists. Mitra and Tarla use it. Routing is based on provider context and open work.
- **CURRENT:** Aevia is not a fully dynamic manager agent. It does not yet interpret arbitrary intent and decide which specialist should own it.
- **NEXT:** present one Aevia relationship in onboarding, account surfaces, and messaging while retaining clear specialist behavior behind it.
- **FUTURE:** Aevia interprets intent, delegates dynamically to Mitra or Tarla, manages cross-specialist exceptions, and explains what it did.

### Specialist agents

- **Mitra:** everyday routine specialist for parents, grandparents, and other senior family members.
- **Tarla:** meal-planning and kitchen-coordination specialist for households and the people who cook.

## People and roles

### Primary user

The primary user:

- configures and oversees Aevia
- supplies and corrects household context
- reviews history and what Aevia knows
- approves important actions and initial Tarla plans
- handles meaningful exceptions when Aevia cannot act safely

Long-term success means the primary user increasingly does not have to be the middle person in ordinary coordination.

### Execution-side users

Mitra may work with:

- a parent
- a grandparent
- another senior family member

Tarla may work with:

- hired cooks or domestic help
- family members who cook
- the primary user
- multiple cooking people in one household

Their consent, language, role, and communication style are separate from the primary user’s.

## Mitra

### Positioning

**“A familiar everyday assistant for your parents.”**

“Parents” is consumer shorthand. Product setup must also support grandparents and other senior family members.

Relationship and salutation examples include Papa, Dad, Mummy, Maa, Mom, Dada, Dadu, Dadi, Nana, Nanu, Nani, and custom terms. Capture gender when it is needed and cannot safely be inferred.

Communication should use the combination of:

- relationship
- salutation
- preferred language
- respect level
- warmth
- vocabulary
- relevant conversation history

### Initial jobs

1. Medication reminders.
2. Walk and activity reminders.
3. Appointments, checkups, events, and planned details.
4. Additional everyday routines added over time.

- **CURRENT:** routines can run once now, once later, or recur daily, weekly, monthly, or on selected days.
- **CURRENT:** each occurrence is a separate routine instance/check-in with its own state and run trace.
- **CURRENT:** replies, reactions, unrelated messages, ambiguity, negative answers, and no response are handled without false completion.
- **NEXT:** allow a senior to initiate low-risk reminders, for example, “Kal 9 baje doctor ko call karna yaad dila dena.”
- **NEXT:** apply the risk matrix before accepting a senior-initiated context or schedule change.

### Self-report semantics

Self-report is not independent verification.

“Haan medicine le li” means the senior reported taking medicine. It does not mean Aevia independently verified that medicine was taken.

This distinction must remain visible in stored meaning, primary-user updates, admin review, and evaluation.

Mitra does not diagnose, provide medical advice, infer treatment, interpret drug interactions, or act as an emergency service.

### Medication context

- **CURRENT:** medication is an agreed reminder/check-in routine. The runtime has no medication-specific clinical logic.
- **FUTURE:** input may support structured entry, free text, family-friendly references, prescription images, prescription PDFs, extraction, and voice.

A family may say “BP wali dawai” while a confirmed backend record contains the exact medicine and agreed timing. The familiar phrase may remain appropriate in conversation.

Prescription or document extraction creates **candidate context** only. It must never automatically start or stop medicine, change dosage, change treatment, or activate a high-risk medical instruction. A human must confirm material medical information before it becomes active.

- **OPEN:** production privacy, security, retention, and regulatory handling for prescriptions and other medical documents.
- **OPEN:** exact access policy for sensitive medical records.

For a controlled beta, sensitive medical data should be visible only to the relevant primary user, the relevant senior where appropriate, and specifically authorized beta operators. Admin surfaces should mask sensitive fields by default and require a deliberate, logged reveal.

### Conversational evolution

Day 0 should be warm, respectful, and task-led. Mitra should not manufacture companionship or replace the child’s relationship.

Familiarity may grow only through genuine engagement. Mitra can learn useful family vocabulary, such as “BP wali dawai,” and use it when the meaning is safe and relevant.

No reply to a routine is not permission to start generic conversation.

## Tarla

### Positioning

Headline:

> Get freedom from the kitchen.

Explanation:

> Plans the meals. Coordinates the kitchen. Follows up with the cook.

Outcome priority:

1. Remove the recurring “aaj kya banega?” decision burden.
2. Reduce cook and kitchen coordination.
3. Help the household eat according to its preferences and goals.

Tarla should grow toward useful meal-planning fundamentals: personalized plans, dietary preferences, servings, deterministic nutrition, recipes, grocery lists, shared household context, calendar/history, reusable preferences, and later voice-friendly input. It must not copy competitors or proprietary content.

### Who cooks

Onboarding must ask: **Who usually prepares meals at home?**

Supported product roles:

- hired cook or domestic help
- family member
- primary user
- multiple or different cooking people

Communication changes by role:

- Hired cook: short, practical, warm, respectful.
- Family member: collaborative, warm, less command-like.
- Primary user cooking: planning and recipe guidance rather than delegation.

- **CURRENT:** cook members, communication endpoints, readiness, priming messages, arrival schedules, language, communication mode, and relevant notes can be stored.
- **NEXT:** make cooking-person role and learned capabilities explicit in product onboarding and instruction generation.

### Planning horizon and execution

- **CURRENT:** Tarla supports a requested meal and a coherent full-day plan with breakfast, lunch, optional snack, and dinner. Members can eat different subsets of meals at home.
- **CURRENT:** full-day plans calculate per-meal nutrition, daily totals, and variance from editable targets.
- **CURRENT:** once-daily, twice-daily, and custom cook visits can map different meals to different visits.
- **CURRENT:** approved instructions are scheduled for arrival time minus a configurable lead time; the default is 30 minutes.
- **CURRENT:** the scheduled send retrieves the latest approved plan and prevents duplicate sends.
- **NEXT:** make a week the backend planning horizon, with day and meal inspection.
- **NEXT:** use the weekly horizon for restocking awareness, repetition control, cuisine variety, and day-specific dietary rules while keeping cook delivery visit-specific.

### Food context

Collect only what is relevant and willingly provided:

- household members
- age, sex, height, weight, and activity level when nutrition estimation is requested
- vegetarian, non-vegetarian, eggetarian, or custom dietary type
- allergies and other hard restrictions
- cuisine and dish preferences
- disliked and avoided foods
- foods to limit
- day-specific and frequency rules
- nutrition targets
- meals eaten at home
- free-text food context

Cuisine examples should reflect broad Indian and international household reality: North Indian, South Indian, Punjabi, Gujarati, Rajasthani, Bengali, Maharashtrian, Kerala, Tamil, Andhra/Telangana, coastal, Jain-friendly where relevant, Indo-Chinese, Continental, Italian/pasta, Asian, salads/bowls, and custom.

A cuisine label is not enough. Show representative dishes and invite free text: **“Tell Tarla what your household actually likes eating.”**

### Food rule types

| Type | Meaning | Examples |
| --- | --- | --- |
| Hard constraint | Must not be violated | allergy; explicit religious rule; vegetarian day; no onion/garlic when explicitly required |
| Strong preference | Important direction, but not automatically a safety exclusion | low oil; low spice; avoid deep-fried food; less salt |
| Contextual preference | Depends on the dish, day, or temporary context | usually mild, but a particular dish can be spicy; current craving or temporary avoidance |

Do not turn a soft preference into a hard exclusion unless the user explicitly makes it one.

### Nutrition

Nutrition planning is optional.

- **CURRENT:** when requested, the profile can hold age, sex, height, weight, activity, and editable calorie and macro targets.
- **CURRENT:** energy estimates use the deterministic Mifflin-St Jeor equation. Activity multipliers are sedentary `1.2`, lightly active `1.375`, moderately active `1.55`, very active `1.725`, and extra active `1.9`. The user can override the resulting target.
- **CURRENT:** recipe nutrition is calculated from structured ingredient quantities. An LLM does not invent calories or macros.

Maintain this relationship:

```text
daily target
→ meal allocation
→ meal nutrition
→ daily actual
→ target variance
```

TDEE, calories, and macro targets are estimates, not medical nutrition advice.

### Indian meal completeness

Where appropriate, Tarla should consider a culturally complete meal:

```text
sabzi or main
+ dal or another protein
+ roti or rice
+ accompaniment
```

Household context can change this composition. A numerically valid but culturally incomplete meal should not be the default.

### Kitchen quantities

Internal nutrition calculations may use grams and millilitres. Cook-facing instructions should prefer natural kitchen quantities:

- pieces
- rotis
- chillas
- bowls
- katoris
- cups
- spoons
- portions

Grams or millilitres may appear secondarily when genuinely useful. Never expose “serving equivalents” to the cooking person.

Instructions use cumulative household amounts: three people having two rotis each becomes “6 rotis,” not a list of internal per-member calculations.

### Recipes and provenance

The internal representation should contain dish, cuisine, ingredients, quantities, servings, concise method, dietary constraints, nutrition, and cook familiarity.

Selection hierarchy:

1. Known household recipe.
2. Previously successful Tarla recipe.
3. Household-adapted structured recipe.
4. New or unfamiliar dish.

For an unfamiliar dish, Tarla may offer a concise recipe: “Aaj chicken biryani banani hai 3 logon ke liye. Recipe bheju?”

Public recipe sites, including Archana’s Kitchen and other reputable sources, may be used for research and reference during beta. Do not copy long copyrighted prose into the product or repository.

- **CURRENT:** a focused original structured seed library proves deterministic planning.
- **FUTURE:** expand through licensed or open data and household recipes.
- **OPEN:** production recipe licensing and provenance policy.

### Approval and autonomy

The initial trust ramp remains:

```text
Tarla creates a plan
→ primary user reviews or corrects it
→ primary user approves it
→ approved plan goes to the cooking person on schedule
```

Once approved, ordinary execution exceptions should be resolved without making the primary user mediate every message. Meaningful changes should be reported to the primary user.

Example target behavior:

```text
palak unavailable
→ safe substitute selected
→ nutrition recalculated
→ cooking person receives revised instruction
→ primary user informed
→ palak offered for the shopping-needed list
```

- **CURRENT:** Tarla can resolve a known missing-ingredient case, update nutrition and shopping-needed state, and send a revised instruction without user interruption.
- **NEXT:** notify the primary user of meaningful automatically resolved changes.
- **FUTURE:** suggest reduced review frequency under explicit user control.

Do not implement opaque trust graduation.

### Groceries

- **CURRENT:** persistent shopping-needed items, missing-ingredient capture, quantities when known, reasons, and needed/acquired/dismissed states.
- **NEXT:** user-requested additions and useful summaries.
- **FUTURE:** preferred grocery app, supported cart integrations, ordering, or list export.

Direct grocery ordering is outside current Build Week scope. If a preferred app is unsupported later, Aevia should say so and offer supported alternatives or list export.

## Aevia memory

Memory must preserve meaning and origin, not just a sentence.

Target context fields include:

- value
- source and source type
- verification state
- who confirmed it
- created and updated times
- validity period or expiry
- active/inactive state
- correction history

Memory classes:

| Class | Example | Expected handling |
| --- | --- | --- |
| Stable | Papa prefers Hinglish | Remains active until corrected or removed |
| Temporary | No paneer this week | Expires at the end of the stated period |
| Recurring contextual | Vegetarian during Shravan | Returns for future confirmation in the relevant context |
| Situational | No palak today | Applies to the current execution, not permanent preference |

- **CURRENT:** shared preferences store household/member scope, category, key, string value, source, active state, optional expiry, and timestamps. Explicit Tarla corrections can create shared memory and affect later plans.
- **CURRENT:** raw inbound events and interpreted outcomes remain distinct.
- **NEXT:** add explicit verification state, confirmer identity, structured validity, and correction history without breaking existing preferences.
- **FUTURE:** use recurring history to ask, for example, “Last Shravan you switched to vegetarian meals. Should I do the same this year?”

Do not promote one situational event into a permanent preference. “No paneer this week” should expire. “No paneer for now” needs clarification about whether it is permanent or time-bound.

Major or high-impact changes require confirmation.

## “What Aevia knows about my household”

The primary-user dashboard should have a signature surface called **“What Aevia knows about my household.”**

It should be a progressive, understandable account of:

- household members
- senior routines
- languages and salutations
- response patterns, with evidence and limits
- food and cuisine preferences
- cooking people and their capabilities
- recurring dietary rules
- successful and avoided dishes
- useful corrections learned over time

The user should be able to inspect, correct, remove or deactivate context, and understand why Aevia believes it.

- **CURRENT:** the underlying shared context is inspectable through Convex functions and verification scripts.
- **NEXT:** build the primary-user surface and supported correction/deactivation controls.

This is simultaneously utility, trust, transparency, proof of personalization, and retention—not a raw database dump.

## Risk matrix

| Level | Default action | Examples |
| --- | --- | --- |
| Low | Apply with normal logging | walk timing; birthday reminder; non-medical event reminder; preferred communication time; wording preference |
| Medium | Notify or require confirmation based on impact | established routine time change; moved doctor appointment; temporary pause for travel; recurring schedule change |
| High | Require explicit human confirmation before material change | medication start/stop; dosage; treatment instruction; allergy removal; major health-related context change |

The matrix must be extensible. Risk comes from impact, not merely which specialist received the message.

- **CURRENT:** high-risk medical behavior is excluded from implemented agent logic; endpoint readiness and initial plan approval provide limited safety gates.
- **NEXT:** represent risk assessment and confirmation state explicitly for actions and changes.

## Exception and escalation matrix

Exceptions are first-class product state.

| Category | Default behavior | Example |
| --- | --- | --- |
| Resolve automatically | Act within known constraints and log the result | known safe ingredient substitution |
| Resolve and notify primary user | Act safely, then explain the meaningful change | palak unavailable, compatible substitute used |
| Ask primary user | Pause when context is conflicting or the choice is meaningful | unknown substitute or conflicting preference |
| Human/admin review | Escalate when automated handling is unsafe or repeatedly failing | medical ambiguity, unsupported request, high-impact conflict, provider/system failure |

Every exception should preserve agent, household, task, reason, relevant context, attempted actions, confidence where appropriate, notifications, resolution, and timestamps.

- **CURRENT:** task failure, unmatched inbound events, waiting/no-response states, safe missing-ingredient resolution, and run errors can be stored.
- **NEXT:** add a unified exception record and escalation queue across agents.
- **NEXT:** feed human resolution into shared memory where appropriate and into a named future eval case.

## Dashboards and operations

### Primary-user dashboard

For the household: context, plans, routines, history, approvals, exceptions requiring their input, settings, privacy controls, and “What Aevia knows.”

### Beta admin dashboard

For authorized Aevia operators:

- households and users
- agents and runs
- exceptions and failures
- feedback
- escalation queue
- safe “view as user”
- controlled sensitive-data reveal

These are separate products with separate access expectations.

- **CURRENT:** run and step data is queryable, but neither complete dashboard exists.
- **NEXT:** build minimum closed-beta primary-user and admin operations surfaces.

Sensitive values should be masked by default, revealed intentionally, access-controlled, and not exposed when unnecessary.

## Analytics

Analytics must be designed into product implementation rather than added after launch. PostHog or an equivalent product analytics stack is the current direction, not an installed dependency today.

Web funnel events:

- `landing_viewed`
- `onboarding_started`
- `identity_completed`
- `agent_selected`
- `shared_context_completed`
- `specialist_onboarding_completed`
- `whatsapp_ready`
- `first_task_configured`

Execution events:

- `message_scheduled`
- `provider_accepted`
- `delivered`
- `reply_received`
- `interpretation_completed`
- `exception_created`
- `exception_resolved`
- `task_completed`
- `plan_approved`
- `plan_edited`
- `shopping_item_added`

Retention and quality events:

- `second_execution`
- `third_execution`
- `memory_corrected`
- `primary_user_intervention`
- `agent_resolved_without_user`
- `response_latency`
- `exception_rate`

WhatsApp analytics should come from Aevia’s backend and normalized provider events, not depend only on Meta dashboards.

- **CURRENT:** operational transport timestamps, provider status, inbound signals, task state, and agent run steps exist.
- **NEXT:** add consent-aware product analytics, stable event definitions, and reporting for the candidate intervention metric.

## Human communication

Aevia, Mitra, and Tarla must not sound like generic AI.

> Aevia should feel human because it understands context and communicates naturally, not because it pretends to be human.

Aevia should identify itself as assistant software where appropriate, especially in a first interaction. It must never impersonate a person. Detailed rules and examples are canonical in [PRODUCT_LANGUAGE.md](./PRODUCT_LANGUAGE.md).

## Landing and onboarding direction

Hero direction:

> The everyday things you care about. Taken care of.

Support:

> Meet Aevia — your personal household assistant.

The “up to 10 hours” line may be tested only as a qualified hypothesis until supported by evidence.

The first fold should:

- introduce Aevia
- establish trust
- show Mitra and Tarla briefly
- show real-feeling, truthful WhatsApp execution proof
- make the WhatsApp-native behavior clear
- show privacy and context control
- show language compatibility
- use only genuine, attributable research quotes

- **CURRENT:** the existing page is the M1.1 Vesta/Mitra flow and has not been rebranded or redesigned.
- **NEXT:** design and implement the Aevia landing, shared onboarding, and account experience under a separate approved milestone.

## Closed beta terms, privacy, and consent

Aevia is a closed-loop MVP/beta.

Before external beta activation, the product needs:

1. Beta Terms of Use.
2. Privacy Policy.
3. Explicit acceptance during signup/onboarding.
4. Short, product-specific safety disclosures at the relevant step.

Important limitations must not be hidden only in long legal documents. Use progressive disclosure: a short, clear warning with a link to the full policy.

Suggested acceptance control:

> [ ] I agree to Aevia’s Terms of Use and Privacy Policy and understand that Aevia is currently a beta product.

Terms and Privacy must be reachable from signup/onboarding, the website footer, and account/settings. Record the accepted policy version and timestamp so later changes can require appropriate action.

Analytics events should include `terms_viewed`, `privacy_viewed`, and `beta_terms_accepted` where appropriate, along with acceptance time and version.

- **CURRENT:** communication endpoints have active, consent status, readiness/provider metadata, and optional verification time. Mitra and Tarla enforce readiness/consent gates before real sends.
- **CURRENT:** the application does not have beta Terms, Privacy pages, signup acceptance, acceptance versioning, or product analytics.
- **NEXT:** draft and implement beta-appropriate policies and progressive consent surfaces based on actual behavior.
- **OPEN:** **BETA DRAFT — requires legal review before broad commercial launch.** Nothing in these project docs is legal advice.

### Required beta disclosure

Appropriately drafted beta language must explain that:

- Aevia is early-stage software.
- Outputs may be incomplete, delayed, inaccurate, misunderstood, or wrong.
- Users should review important information and decisions before relying on them.
- Aevia must not be the sole source for medical, health, emergency, nutritional, safety-critical, financial, legal, or other professional decisions.
- A response does not independently prove an action occurred.
- WhatsApp, provider, network, or platform failure may delay or prevent messages.
- Automated interpretation may misunderstand natural language.
- Users remain responsible for important household decisions and should verify material actions and information.

### Mitra and medical safety disclosure

Explain that:

- Mitra is an everyday routine assistant, not a doctor, healthcare provider, emergency service, or medical monitoring service.
- Medication information and reminders must be verified by the user or relevant person.
- “Medicine taken” is a self-report, not independently verified adherence.
- Prescription/document extraction may be wrong and must be reviewed before confirmation.
- Aevia does not autonomously start, stop, alter dosage, or materially change medication instructions from unreviewed extraction or conversational inference.
- Emergencies require appropriate local emergency or medical services, not Aevia.

### Tarla and nutrition safety disclosure

Explain that:

- Tarla’s meal and nutrition outputs are planning estimates, not medical nutrition advice.
- Calorie, macro, and TDEE calculations are estimates.
- Users must independently verify allergies, intolerances, dietary restrictions, and medically required diets.
- An ingredient substitute may not suit every medical or dietary context.
- Allergies and explicit religious or medical constraints need stricter treatment than ordinary preferences.

### Privacy scope

The beta Privacy Policy should accurately describe processing of:

- account and profile information
- household and member information
- phone and contact information
- routines and schedules
- food and diet preferences
- senior and medication context supplied by users
- uploaded documents where enabled
- WhatsApp messages, replies, and reactions
- cooking-person communications
- agent execution records
- corrections and feedback
- inferred or learned preferences
- analytics and product-usage data
- exception and admin-review data

Purposes include personalization, task execution, scheduling, communication, memory/context, safe exception handling, debugging, beta improvement, evaluation, analytics, and user support.

The product must distinguish user-provided facts, self-reports, extracted candidate information, and agent inference. Do not claim stronger privacy or security guarantees than the implementation supports.

### Beta admin access

Disclose that specifically authorized Aevia operators may need controlled beta access for debugging, exception resolution, safety review, support, evaluation, and product improvement.

Sensitive information in admin tools should be masked by default, require deliberate reveal, be access-controlled, and avoid unnecessary exposure.

### User control

Where implemented, users should be able to inspect what Aevia knows, correct it, remove or deactivate context, update preferences, pause agents/routines, and withdraw from beta or request account-data handling under the operative policy.

Do not promise deletion, portability, or export until those capabilities exist and are tested.

### Consent for other people

The primary user’s acceptance does not automatically create consent for every parent, senior, cooking person, or family member.

- Mitra needs an appropriate introduction and readiness/consent experience before recurring senior communication.
- A hired cook or other cooking person should be primed by the household before recurring Tarla instructions.
- Aevia must not surprise recipients with agent messages.

Unresolved or potentially unsafe beta interactions may be escalated to the primary user, an authorized beta operator, or both. Where appropriate, explain that an issue was escalated rather than failing silently.

## Build Week boundary

### CURRENT: verified foundation

- W1 shared household, member, preference, endpoint, and run infrastructure.
- W2 scheduled Mitra routines, normalized signals, self-report-safe state, and traceability.
- W3 Tarla profiles, deterministic meal planning/nutrition, approval, cooking-person execution, shopping-needed state, and missing-ingredient handling.
- W3.1 full-day planning and autonomous cooking-person visit scheduling.
- W4 provider-neutral real WhatsApp transport through Meta Cloud API, with development transport and Twilio fallback retained.

Exact evidence is recorded in [EVALS.md](./EVALS.md).

GrowthX row-level claims and missing judge proof are recorded separately in [EVIDENCE.md](./EVIDENCE.md).

The approved order for evidence, real users, product work, launch infrastructure, and distribution is maintained in [BETA_LAUNCH.md](./BETA_LAUNCH.md).

### NEXT: closed-beta product work

- Aevia-branded landing, shared onboarding, and primary-user dashboard.
- Terms, Privacy, explicit beta acceptance, policy versioning, and relevant disclosures.
- One Aevia relationship and clear specialist activation.
- “What Aevia knows” inspection and correction experience.
- Explicit risk and exception records, notifications, and beta admin queue.
- Product analytics and the primary-user intervention metric.
- Week-level Tarla plan and cooking-person role-aware experience.
- Dedicated Aevia Meta WhatsApp production number before launch.

### FUTURE: explicitly outside the current Build Week proof

- dynamic Aevia manager/orchestrator
- senior-initiated routines beyond bounded low-risk cases
- prescription image/PDF extraction and voice
- production medical-document program
- adaptive trust graduation
- voice processing and voice calls
- grocery cart or ordering integrations
- broad recipe catalog and licensed content program
- festival/event intelligence
- production-scale admin and analytics systems
- Hermes operation/routing where it adds clear value

## Open decisions and contradictions to resolve

1. **Brand versus identifiers:** consumer brand is Aevia; internal Vesta and `vesta-mitra` identifiers remain until a separate migration is approved.
2. **One channel versus current setup:** the target is one Aevia relationship/number; current infrastructure supports shared routing but the unified product experience is not built.
3. **Hub versus orchestrator:** Aevia is a shared hub today, not a dynamic manager agent.
4. **Meal horizon:** current planning is meal/day; week is the target backend horizon.
5. **Memory richness:** current shared memory is structured but mostly string-valued; full provenance, verification, validity, and correction history are next.
6. **Exception behavior:** automatic missing-ingredient resolution exists; consistent user notification and a shared escalation record do not.
7. **Consent:** endpoint readiness exists; legal acceptance and policy versioning do not.
8. **Sensitive data:** product masking, reveal audit, retention, deletion, and medical-document policies remain open.
9. **Analytics:** operational logs exist; product analytics and metric instrumentation do not.
10. **Marketing claim:** “up to 10 hours” is unvalidated.
11. **Legal status:** beta terms and privacy text need implementation and legal review before broader launch.
12. **Recipe provenance:** research references are allowed; production licensing and attribution policy remain open.
