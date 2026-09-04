# Submission assets

## Live public beta

- Canonical public URL: https://getaevia.vercel.app
- Canonical admin beta runner: https://getaevia.vercel.app/admin/beta
- Canonical-domain validation: failed on 2026-09-05; the alias currently resolves to the older `vesta-mitra` production project, where the beta admin route is 404. No production routing was changed.
- Latest Vercel deployment artifact: https://vesta-mitra-product-r0rw4ms9a-wizard-e2d1.vercel.app
- Latest deployment admin artifact: https://vesta-mitra-product-r0rw4ms9a-wizard-e2d1.vercel.app/admin/beta
- Implementation commit: `99b64257e9fd074f89f44a3456ed8000faed9aa7`
- Submission-assets lineage: `8b901ea618cb78ddecf798661cd8137caf3c8384`
- Meta readiness check commit: `de79885`
- Branch: `m5-aevia-flow-and-m0-stability`
- Convex target: `dev:grand-goshawk-952`
- Pari household: `jx7b9qmphkehcery61md517a5d8dr545`
- Pari plan: `nd76vxg1nw91x8n432vcs5s50s8dr2hg`
- Deployment timestamp: 2026-09-05 04:47:49 IST
- Public access: verified; landing and admin page returned HTTP 200 without Vercel authentication
- WhatsApp sends in this phase: 0

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
- Meta authentication: blocked; the protected read-only check against the token stored in Convex development returned HTTP 401 on 2026-09-05, so no live send was attempted
- Mitra prepare: passed on the live deployment; exact preview was `Papa, evening walk ka time ho gaya.`
- SEND gate: passed; confirmation remained explicit and was not used
- Mobile: passed at 390px with no horizontal overflow on landing, onboarding, dashboard, Household, Mitra, or Tarla
- First live send blocker: refresh `META_WHATSAPP_ACCESS_TOKEN` in `dev:grand-goshawk-952`, then rerun the protected authentication check before using SEND

## Current verification summary

- BETA-5: passed
- Mitra seven-case evaluation and M1.1: passed
- W3.1: 7/7 passed
- W4: 12/12 passed
- TypeScript, lint, and production build: passed
- Vaibhav Tarla preview: prepared on the latest deployment artifact with a masked recipient and no fixture-language leakage; SEND was not invoked
- Canonical alias revalidation: root served the old `vesta-mitra` production application and `/admin/beta` returned 404
- Current blocker: protected Meta authentication was revalidated against Convex development and still returned HTTP 401; no live send was attempted

## Canonical Tarla evidence

- Run ID: `ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`
- Evidence ID: `EVD-RUN-ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`
- Evidence commit: `bc17d6e`
