# Submission assets

## Live public beta

- Public Vercel URL: https://vesta-mitra-product-6q54p9vvt-wizard-e2d1.vercel.app
- Admin beta runner: https://vesta-mitra-product-6q54p9vvt-wizard-e2d1.vercel.app/admin/beta
- Deployment commit: `02daddbd2d42d0a660e54fd958de740c5359ce67`
- Feature commit: `83ebddea395c7158ffd7f508be2d13452ee6faa7`
- Branch: `m5-aevia-flow-and-m0-stability`
- Convex target: `dev:grand-goshawk-952`
- Deployment timestamp: 2026-09-05 03:48:06 IST
- Public access: verified; landing and admin page returned HTTP 200 without Vercel authentication
- WhatsApp send during deployment smoke test: none

## Live smoke test

- Frozen design correction: replaced the stale onboarding and landing UI with the final shared design; height is shown in feet and inches and remains stored in centimetres for existing nutrition calculations
- Landing: passed on desktop and 390px; final frozen layout, shared logo, styles, and images loaded with no horizontal overflow
- Fresh onboarding: passed against Convex development
- Review and generated Tarla plan: passed with per-person portions and kitchen totals
- Dashboard, Household, Mitra, and Tarla routes: passed
- Admin beta runner: passed; five configured recipients loaded with masked numbers only
- Pari approval unblock: existing plan `nd76vxg1nw91x8n432vcs5s50s8dr2hg` was approved once by the owner/test admin for this Build Week run; the audit explicitly records that Pari did not click approval
- Future plan approval: generated plans awaiting approval now show `Approve plan` and `Make changes`; user approval persists after reload and the focused change flow preserves the household setup
- Vaibhav link and Tarla prepare: passed against Pari's existing household and approved plan; the exact prepared message contains no fixture language and remains behind the explicit SEND confirmation
- Mitra prepare: passed; exact preview was `Papa, evening walk ka time ho gaya.`
- SEND gate: passed; confirmation remained explicit and was not used
- Mobile: passed at 390px with no horizontal overflow on landing, onboarding, dashboard, Household, Mitra, or Tarla
- First live Mitra send blocker: no known technical blocker; a live send still requires explicit operator confirmation and an eligible selected recipient

## Canonical Tarla evidence

- Run ID: `ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`
- Evidence ID: `EVD-RUN-ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`
- Evidence commit: `bc17d6e`
