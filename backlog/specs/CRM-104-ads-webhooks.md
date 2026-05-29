---
id: CRM-104
title: Webhook Facebook Lead Ads (HMAC) + Google Ads gclid
milestone: CRM
phase: A
priority: P1
core_ref: [CRM-CORE.md §8.4, §8.5]
tests: TEST-SCENARIOS.md#crm-104
depends_on: [CRM-101]
status: pending
---

# CRM-104 — Webhooks ads

## Goal
Leadurile din Facebook Lead Ads și Google Ads intră automat, atribuite corect campaniei, gata de
optimizare a bidding-ului la conversie.

## In scope
- `POST /webhooks/meta/lead-ads`: verificare HMAC SHA256 (`X-Hub-Signature-256`), fetch formular
  via Graph API (stub în dev), mapare câmpuri → schema, `source=facebook_ad`,
  `utm_campaign=meta_campaign_id`. Idempotent pe `leadgen_id`.
- `gclid` salvat la intake web (CRM-101) → pregătire payload Google Offline Conversion la conversie
  (efectiv trimis în CRM-111).

## Out of scope
- Sync complet Meta Conversions API / ROAS (CRM-112).

## Acceptance criteria
- [ ] HMAC valid → lead creat; HMAC invalid → 401
- [ ] Același `leadgen_id` de două ori → un singur lead (idempotent)
- [ ] Consent original (Meta-managed) + URL formular salvate
- [ ] `gclid` persistat pentru conversie offline

## Tests
`TEST-SCENARIOS.md#crm-104` (T-CRM-104-1..4). Blocante verzi.

## DoD
Standard.
