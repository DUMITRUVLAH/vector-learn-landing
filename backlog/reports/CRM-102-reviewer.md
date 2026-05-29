REVIEW_RESULT: APPROVED
ID: CRM-102
REVIEWER: code-reviewer-vl

## Summary

CRM-102 adds robust deduplication + manual merge endpoint on top of the CRM-101 foundation. This PR also carries forward all CRM-101 backend changes (rate-limiting, captcha, userAgentAtConsent, consentRevokedAt) since it branches from main (pre-CRM-101 merge).

## Schema Changes
- `full_name_normalized VARCHAR(200)` — for name dedup
- `merged_into_id UUID` — audit trail when a lead is archived after merge
- `user_agent_at_consent VARCHAR(512)` + `consent_revoked_at TIMESTAMP` — from CRM-101
- New indexes: `leads_dedup_idx(tenant_id, phone_normalized, email_normalized)` + `leads_name_idx(tenant_id, full_name_normalized)`

## API Changes
- `normalizeName()` in `server/lib/normalize.ts` — NFC + diacritics strip + lowercase + collapse spaces
- `POST /api/leads/:id/merge { sourceId }` — moves all interactions, fills gaps, archives source with mergedIntoId, writes audit system interaction
- `GET /api/leads/dedup?phone=&email=` — live dedup check for forms (placed BEFORE `/:id` to avoid param collision)
- All create/patch handlers now also set `fullNameNormalized`
- CRM-101 intake handler with full rate-limiting/captcha/consent validation included

## Frontend
- `src/lib/api/leads.ts`: full Lead interface (all new fields), `checkDuplicate()`, `mergeLeads()`, `submitIntake()` functions
- `src/lib/utm.ts`, `src/pages/CereDemoPage.tsx`, `/cere-demo` route (cumulative from CRM-101)

## Test Gate
- T-CRM-102-1 ✅ phone format variations → same normalized value
- T-CRM-102-2 ✅ email case insensitivity
- T-CRM-102-3 ✅ name NFC normalization + diacritics
- T-CRM-102-4 ✅ merge: all interactions transferred, source archived, no timeline loss
- T-CRM-102-5 ✅ field priority: survivor wins, gaps filled from source

Total: 262 tests pass (26 new for CRM-101+102).

## Acceptance Criteria Check
- [x] Phone format variations → same lead
- [x] Email/name normalized (diacritics, case)
- [x] Merge preserves all interactions
- [x] Merge is tenant-scoped + audit interaction written

## Notes
- `merged_into_id` allows future "unmerge" UX if needed — column added but no API for reversal yet
- Pre-existing lint warnings (45) unchanged; 0 errors
