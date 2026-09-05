# Submission assets

## Live public beta

- Canonical public URL: https://helloaevia.vercel.app
- Canonical admin beta runner: https://helloaevia.vercel.app/admin/beta
- Canonical-domain validation: passed on 2026-09-05; root and the protected beta-admin runner resolve to the current `vesta-mitra-product` Production deployment.
- Latest Vercel deployment artifact: https://vesta-mitra-product-f1n1ycts9-wizard-e2d1.vercel.app
- Latest deployment admin artifact: https://vesta-mitra-product-f1n1ycts9-wizard-e2d1.vercel.app/admin/beta
- Implementation commit: `390b2f8`
- Submission-assets lineage: `8b901ea618cb78ddecf798661cd8137caf3c8384`
- Meta readiness check commit: `de79885`
- Branch: `m5-aevia-flow-and-m0-stability`
- Convex target: `dev:grand-goshawk-952`
- Pari household: `jx76yambxwk64rtj3f88a6zvr98dsac8`
- Pari plan: `nd77jtw3ypj6g4afqpt6pam16h8dvac2` (version 1; approved by Pari through the live generated-plan screen)
- Pari approval timestamp/source: 2026-09-05 05:31:46.921 IST; `household_user`; actor `Pari`
- Vaibhav execution: `m170jc97e82tr9sj30a9tgqnp98dvajw`; run `066742c8-2d95-4565-b59d-cc15b1223e57`; evidence `EVD-RUN-066742c8-2d95-4565-b59d-cc15b1223e57`
- Vaibhav delivery result: Meta accepted at 2026-09-05 06:20:47.330 IST, then reported delivery failure at 2026-09-05 06:20:48.000 IST; no inbound reply; no retry yet
- Deployment timestamp: 2026-09-05 06:48 IST
- Public access: verified; the canonical root and protected admin API returned HTTP 200 without Vercel authentication
- WhatsApp sends in this phase: 1 initial attempt; 0 retries

## Live smoke test

- Final frozen-design/flow correction: replaced stale onboarding, landing, review, completion, Mitra, and Tarla presentation with the final `Given` visual system while preserving the working runtimes
- Identity: mobile is required, email is optional, and both persist to the existing shared profile/member model
- Height: separate feet and inches fields are shown and converted to centimetres for the existing nutrition calculations
- Landing: passed in a fresh private browser on desktop and 390px; final frozen layout, shared logo, styles, and images loaded with no horizontal overflow
- Fresh onboarding: passed against Convex development, including a successful live-deployment write
- Review and generated Tarla plan: passed with per-person portions and kitchen totals
- Dashboard, Household, Mitra, and Tarla routes: passed
- Admin beta runner: passed; configured recipients loaded with masked numbers only, and exact preview remained behind the explicit SEND gate
- Pari approval unblock: existing plan `nd76vxg1nw91x8n432vcs5s50s8dr2hg` was approved once by the owner/test admin for this Build Week run; the audit explicitly records that Pari did not click approval
- Future plan approval: generated plans awaiting approval now show `Approve plan` and `Make changes`; user approval persists after reload and the focused change flow preserves the household setup
- Vaibhav link and Tarla prepare: passed against Pari's existing household and approved plan; the exact prepared message contains no fixture language and remains behind the explicit SEND confirmation
- Meta authentication: passed after the owner refreshed the Convex-development token; no message was sent during this deployment verification
- Admin execution-path fix: the Vercel runner now calls the existing Convex development functions directly. It does not invoke the local W4 verifier scripts, whose development-only guard remains unchanged.
- Mitra prepare: passed on the live Production deployment; exact preview was `Papa, evening walk ka time ho gaya.` with five configured recipients loaded as masked numbers only
- SEND gate: passed; confirmation remained explicit and was not used
- Mobile: passed at 390px with no horizontal overflow on landing, onboarding, dashboard, Household, Mitra, or Tarla
- Vaibhav live result: accepted by Meta, delivery failed, no inbound reply, and no retry. The stored normalized record did not retain Meta's numeric error code, title, detailed message, or `error_data`, so the exact provider cause is not claimed.

## Current verification summary

- BETA-5: passed
- Mitra seven-case evaluation and M1.1: passed
- W3.1: 7/7 passed
- W4: 12/12 passed
- TypeScript, lint, and production build: passed
- Production-like local admin prepare: passed with `CONVEX_DEPLOYMENT=production-like-runtime`; exact Mitra preview prepared without invoking a local CLI verifier
- Production admin prepare: passed on `https://helloaevia.vercel.app`; five masked recipients loaded and the explicit SEND gate was returned. No dispatch occurred.
- Pari approval-state correction: the registry previously pointed to an older Pari household and plan. It now resolves the real live-browser household and preserves Pari's original `household_user` approval without creating or admin-approving another plan.
- Live Vaibhav Prepare: passed on `https://helloaevia.vercel.app`; the exact 5 September instruction was returned with masked recipient, prepared payload ID, run ID, and explicit SEND gate. No live send was attempted.
- Household 1 inbound readiness: real Meta “Hi” messages from Mohit and Krishna passed signature validation on 2026-09-05 and opened their provider conversation windows. Mohit's 06:30:02 IST inbound now resolves to his canonical Household 1 member/contact; Krishna remains unmatched. No outbound message was sent in this readiness check.
- Mohit readiness: five historical duplicate endpoints were disabled without deleting their records or evidence. The single canonical endpoint is active and Meta-ready, the shared-member salutation is `Papa`, masked recipient `+********7764`, and exact preview `Papa, evening walk ka time ho gaya.` passed with Meta authentication HTTP 200 and the explicit SEND gate closed. Ready for an owner-approved send; no send occurred during this correction.
- Meta bootstrap readiness: approved `hello_world` template (`en_US`, utility) is available on the existing authenticated Meta test sender. It is recorded only as conversation setup, not an Aevia output. Failed Mohit run `62af13cc-717a-496f-989d-6181d2772b82` remains unchanged; no retry or template send occurred. Krishna is enabled in the server-side test registry, but Meta does not expose a separate read-only per-recipient template-send eligibility check, so permission is confirmed only when Meta accepts an explicitly approved send.
- Meta WABA subscription correction: the existing authenticated app is now verified in the configured development WABA's `subscribed_apps`. Mohit's validated inbound window remains open, Meta auth passes with HTTP 200, and the exact prepared payload is `Papa, evening walk ka time ho gaya.` The failed run remains unchanged and no WhatsApp message was sent during this configuration task.
- Krishna readiness: blocked because Household 1 has no Krishna shared-member/family-cook record and no current 5 September approved plan for Krishna; no plan or member was invented.

## Canonical Tarla evidence

- Run ID: `ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`
- Evidence ID: `EVD-RUN-ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`
- Evidence commit: `bc17d6e`
