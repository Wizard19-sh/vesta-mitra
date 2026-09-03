# Aevia Product Analytics

## Current M5 implementation

M5 adds one privacy-safe analytics interface used by the landing page, onboarding, activation, legal pages, and dashboard. Events are written to an additive Convex ledger so the closed beta has inspectable first-party evidence even before a product analytics provider is configured.

PostHog remains the preferred external product analytics direction. It is **not configured in M5**. Adding it later should happen behind the same event interface, using a project key stored in approved environment configuration rather than source code.

## Event catalogue

Current allowlisted funnel and activation events:

- `landing_viewed`
- `cta_clicked`
- `onboarding_started`
- `identity_completed`
- `agent_selected`
- `shared_context_completed`
- `mitra_onboarding_completed`
- `tarla_onboarding_completed`
- `beta_terms_accepted`
- `first_task_configured`
- `plan_generated`
- `plan_approved`
- `whatsapp_ready`
- `dashboard_viewed`
- `terms_viewed`
- `privacy_viewed`

The interface also reserves these normalized execution events for existing runtime integration where practical:

- `message_scheduled`
- `provider_accepted`
- `message_delivered`
- `reply_received`
- `task_completed`
- `exception_created`
- `exception_resolved`

M5 records scheduling and first-task events from the user-facing activation path. Provider, delivery, reply, completion, and exception events are not claimed as fully instrumented across every W1–W4 runtime path yet.

## Safe event fields

Events may contain only:

- a random pseudonymous browser ID
- household ID after ownership validation
- allowlisted event name
- route
- agent: Mitra, Tarla, or both
- short non-sensitive outcome label
- server timestamp

The device credential is used only to authorize a household-linked event. It is not stored as an analytics property.

Never send analytics:

- names or email addresses
- phone numbers or WhatsApp addresses
- medicine names
- raw WhatsApp text or reactions
- prescription/document content
- meal feedback text
- provider tokens or secrets
- unnecessary household context

## Evidence and current limit

The Convex ledger is queryable by the owning household and timestamp. Local M5 code/build verification confirms the event calls and allowlist exist. A complete browser funnel and a PostHog/read-only analytics view are still required before analytics is evidence-complete for distribution or GrowthX scoring.
