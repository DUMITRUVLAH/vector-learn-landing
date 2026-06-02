REVIEW_RESULT: APPROVED
ID: CRM-104
REVIEWER: code-reviewer-vl

## Summary

CRM-104 adds the Facebook Lead Ads webhook with HMAC SHA256 verification, idempotency on `leadgen_id`, Meta Graph API field mapping (stub in dev), and Google Ads `gclid` plumbing. Also adds the `webhook_events` audit table.

## Schema Changes
- `webhook_events` table: tenant-scoped, provider enum, external_id, payload, is_duplicate, processed_at
- `leads.leadgen_id` + `leads.meta_form_id` + `leads.meta_ad_id` columns
- `leads_leadgen_idx(tenant_id, leadgen_id)` for fast idempotency lookup
- All CRM-101+102+103 cumulative columns also on this branch

## API Changes
- `GET /webhooks/meta/lead-ads` — Meta hub challenge verification
- `POST /webhooks/meta/lead-ads` — full webhook handler: HMAC verify → parse → fetch form (stub/real) → dedup → create lead
- `buildGoogleOfflineConversionPayload()` helper exported for CRM-111
- `server/routes/webhooks.ts` registered at `/webhooks` in server/index.ts

## Test Gate
- T-CRM-104-1 ✅ valid HMAC → lead created source=facebook_ad
- T-CRM-104-2 ✅ invalid HMAC → 401 response
- T-CRM-104-3 ✅ same leadgen_id twice → idempotent (one lead)
- T-CRM-104-4 ✅ gclid persisted for Google Offline Conversion

Total: 241 tests pass (21 new T-CRM-104-*).

## Acceptance Criteria Check
- [x] HMAC valid → lead created; HMAC invalid → 401
- [x] Same `leadgen_id` twice → one lead (idempotent)
- [x] Meta-managed consent + form URL saved
- [x] gclid persisted for conversion offline

## Notes
- META_APP_SECRET/META_VERIFY_TOKEN/META_PAGE_ACCESS_TOKEN are env vars; dev mode accepts all if not set
- Page ID → Tenant mapping is basic (first tenant in dev); production needs a settings table (logged in backlog)
- Google Offline Conversion upload happens in CRM-111; this item only prepares the payload helper
- 0 errors, 45 pre-existing warnings
