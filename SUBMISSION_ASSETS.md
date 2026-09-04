# Submission assets

## Live public beta

- Public Vercel URL: https://vesta-mitra-product-r0rw4ms9a-wizard-e2d1.vercel.app
- Admin beta runner: https://vesta-mitra-product-r0rw4ms9a-wizard-e2d1.vercel.app/admin/beta
- Deployment commit: `99b64257e9fd074f89f44a3456ed8000faed9aa7`
- Feature commit: `99b64257e9fd074f89f44a3456ed8000faed9aa7`
- Meta readiness check commit: `de79885`
- Branch: `m5-aevia-flow-and-m0-stability`
- Convex target: `dev:grand-goshawk-952`
- Deployment timestamp: 2026-09-05 04:47:49 IST
- Public access: verified; landing and admin page returned HTTP 200 without Vercel authentication
- WhatsApp send during deployment smoke test: none

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

## Canonical Tarla evidence

- Run ID: `ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`
- Evidence ID: `EVD-RUN-ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`
- Evidence commit: `bc17d6e`
