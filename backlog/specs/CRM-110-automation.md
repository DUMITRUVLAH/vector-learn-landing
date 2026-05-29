---
id: CRM-110
title: Motor de automatizări (trigger → condiție → acțiune)
milestone: CRM
phase: D
priority: P0
core_ref: [CRM-CORE.md §2.5]
tests: TEST-SCENARIOS.md#crm-110
depends_on: [CRM-109]
status: pending
---

# CRM-110 — Automatizări

## Goal
Centrul răspunde în secunde fără efort uman: „lead nou Facebook → SMS welcome", „necontactat 3
zile → reminder WhatsApp".

## In scope
- Tabele `automations` (trigger/conditions/actions JSONB, enabled) și `automation_runs` (audit).
- Trigger-e: `lead.created`, `lead.stage_changed`, `time.no_contact` (cron zilnic).
- Condiții: `[{field, op, value}]` (ex. `source = facebook_ad`, `stage = new`, `days_since_last_interaction >= 3`).
- Acțiuni: `send_template` (CRM-108/109), `create_task` (CRM-107), `assign`, `move_stage`.
- UI vizual cu noduri în `/app/settings/crm/automations`.
- **Test mode** pe lead fictiv (simulează acțiunile, fără efecte reale, cu log).
- Fiecare execuție → `automation_run` (ok|skipped|failed + detaliu); eșecul unei acțiuni nu
  oprește restul.
- Respectă `consent_revoked_at` (nu trimite outbound).

## Acceptance criteria
- [ ] Trigger+condiție+acțiune se execută corect end-to-end (T-CRM-110-1)
- [ ] Condiție nesatisfăcută → skipped, fără acțiune
- [ ] Cron `no_contact 3 zile` trimite reminder corect
- [ ] Test mode simulează fără efecte; audit log complet
- [ ] Acțiune eșuată → failed cu detaliu, restul continuă

## Tests
`TEST-SCENARIOS.md#crm-110` (T-CRM-110-1..5). Blocante verzi.

## DoD
Standard.
