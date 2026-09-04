# Submission assets

## Live public beta

- Public Vercel URL: https://vesta-mitra-product-h6414lnkn-wizard-e2d1.vercel.app
- Admin beta runner: https://vesta-mitra-product-h6414lnkn-wizard-e2d1.vercel.app/admin/beta
- Deployment commit: `36a80d0a415a759356cdefc35bdb443c098ad43e`
- Feature commit: `e352ea89fc5656d7f9d209882a186fd88e1a6697`
- Branch: `m5-aevia-flow-and-m0-stability`
- Convex target: `dev:grand-goshawk-952`
- Deployment timestamp: 2026-09-05 01:26:57 IST
- Public access: verified; landing and admin page returned HTTP 200 without Vercel authentication
- WhatsApp send during deployment smoke test: none

## Live smoke test

- Landing: passed on desktop and 390px; styles loaded, all five images loaded, and no image request failed
- Fresh onboarding: passed against Convex development
- Generated Tarla plan: passed
- Dashboard: passed
- Admin beta runner: passed; five configured recipients loaded with masked numbers only
- Tarla prepare: passed; exact preview and a prepared payload ID were returned without dispatch
- Mitra prepare: passed; exact preview was `Ji, evening walk ka time ho gaya.`
- SEND gate: passed; confirmation remained explicit and was not used
- Mobile: passed at 390px with no horizontal overflow on landing, onboarding, dashboard, or admin beta runner
- First live Mitra send blocker: the Meta access token configured in Convex development is expired and must be replaced before SEND

## Canonical Tarla evidence

- Run ID: `ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`
- Evidence ID: `EVD-RUN-ba9fad2e-0996-46b1-a0e6-0eec8672d6ab`
- Evidence commit: `bc17d6e`
