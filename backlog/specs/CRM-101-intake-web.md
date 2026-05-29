---
id: CRM-101
title: Formular web public de intake + UTM + captcha + consent GDPR
milestone: CRM
phase: A
priority: P0
core_ref: [CRM-CORE.md §8.3, §10]
tests: TEST-SCENARIOS.md#crm-101
depends_on: [MVP-009]
status: pending
---

# CRM-101 — Intake web public

## Goal
Endpoint public (no-auth) prin care un vizitator de pe site creează un lead, cu atribuire de
sursă (UTM/fbclid/gclid), protecție anti-spam (captcha + rate-limit) și consent GDPR documentat.

## In scope
- `POST /api/leads/intake` (no-auth) acceptând `tenant_slug`, datele leadului, `utm_*`, `fbclid`,
  `gclid`, `consent_text`, `consent_at`, header captcha.
- Validare: `consent_at` ≤ 5 min în trecut; captcha (Cloudflare Turnstile stub acceptat în dev);
  rate-limit 5 submit-uri/IP/minut.
- Salvare consent: text + timestamp + IP + user-agent (coloane noi pe `leads`, vezi CORE §3).
- Pagina demo `/cere-demo` care captează UTM din URL (sau cookie 30 zile) și apelează endpointul.
- Dedup la nivel de bază (delegare completă în CRM-102): dacă match pe telefon/email → `isDuplicate:true`.

## Out of scope
- Merge manual (CRM-102), webhooks ads (CRM-104), automatizări post-intake (CRM-110).

## Data / API
- Migrare `leads`: `+ consent_text, consent_at, ip_at_consent, user_agent_at_consent, consent_revoked_at, fbclid, gclid`.
- `POST /api/leads/intake` → `{ leadId, isDuplicate, interactionId }`.

## Acceptance criteria
- [ ] Intake valid creează lead `source=webform` în < 500ms (incl. captcha verify)
- [ ] Consent lipsă → 400, niciun lead
- [ ] UTM persistă 30 zile în cookie, supraviețuiește resetării sesiunii
- [ ] Consent salvat versionat (schimbarea textului nu rescrie consimțămintele vechi)
- [ ] Rate-limit + captcha funcționale; captcha fail nu inundă logul (max 1/IP/oră)
- [ ] Multi-tenant: `tenant_slug` rezolvă corect tenantul; tenant suspendat → 503

## Tests
Vezi `TEST-SCENARIOS.md#crm-101` (T-CRM-101-1..6) + transversale T-CRM-X-*. Toate `[blocant]` verzi.

## DoD
Build/typecheck/lint/test verzi · reviewer APPROVED · persona reports · PR pe main.
