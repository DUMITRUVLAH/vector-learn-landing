REVIEW_RESULT: APPROVED
ID: CRM-101
REVIEWER: code-reviewer-vl

## Summary

CRM-101 delivers: public intake endpoint with rate-limiting, captcha stub, GDPR consent storage (text+timestamp+IP+UA), UTM/fbclid/gclid capture, dedup (phone/email normalized), and the `/cere-demo` frontend page.

## Schema Changes
- Added `user_agent_at_consent VARCHAR(512)` and `consent_revoked_at TIMESTAMP WITH TIME ZONE` to `leads` table
- These columns match CRM-CORE.md §3 exactly

## API Changes
- `POST /api/leads/intake`: added rate-limiter (5/IP/min), captcha verification (Turnstile stub in dev, real in prod), `consentAt` freshness check (≤5 min), `userAgentAtConsent` saved, `captchaToken` field in schema
- Return now includes `{ leadId, isDuplicate, interactionId }` — matching the spec

## Frontend
- `src/lib/utm.ts`: captures UTM params from URL, persists in cookie for 30 days, reads back on subsequent pages
- `src/pages/CereDemoPage.tsx`: accessible form with GDPR checkbox, UTM attribution, success/duplicate states, proper error handling
- Route `/cere-demo` added to `src/App.tsx`

## Quality Gates
- TypeScript: zero errors (client tsconfig)
- Tests: 19 new scenarios in `CRM-101-intake.test.ts`, all pass; 236 total pass
- Build: clean (same pre-existing warnings as before)
- Lint: fixed 1 pre-existing error in rapoarte.test.tsx; 45 pre-existing warnings remain (not introduced by this PR)

## Acceptance Criteria Check
- [x] Intake valid creează lead `source=webform`
- [x] Consent lipsă → 400 (Zod schema min(1))
- [x] UTM persistă 30 zile în cookie
- [x] Consent salvat versionat (text hardcoded versioned string în formular)
- [x] Rate-limit 5/IP/min
- [x] Captcha stub funcțional în dev, real Turnstile în prod
- [x] Multi-tenant: `tenant_slug` rezolvă tenantul

## Notes
- `consentRevokedAt` column added to schema now (needed by CRM-106 Tab GDPR) — no behaviour yet, forward-compatible
- The `seed.ts` server typecheck error is pre-existing (not introduced here)
- Lighthouse not runnable in CI (no browser); skip for this backend-heavy item
