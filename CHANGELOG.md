# Changelog

All notable changes to this project will be documented here.

## [Unreleased]

- **Staff authentication (Supabase Auth).** Witnesses remain anonymous forever (ref-code only); NGO/officer staff now sign in via email/password, verified as ES256 JWTs against the project's JWKS. Gates `/api/dashboard/*`, `/api/kpis`, statement review, PDFs, and staff call routes — see `CLAUDE.md`'s Authentication section for the full route list and known gaps (workspace scoping not yet enforced at the app layer, readback audio still unauthenticated).
- Supabase Postgres persistence (six tables, RLS-defined) alongside the existing local-JSON fallback.
- Both Vercel projects (frontend, backend) are now git-linked with auto-deploy on push to `main`, closing a gap where committed auth code previously sat undeployed while the live API kept serving unauthenticated statement text.
- Project title standardized to **Voice AI Enabled Orchestration Engine (Gawah)**; product brand remains **Gawah (گواہ)**. Originated at Uplift AI × Replit Voice AI Hackathon (2026).
