---
id: CRM-126
title: Secvențe follow-up (cadence) — pas 1/2/3 auto pe zile, peste motorul CRM-110
milestone: CRM
phase: H
priority: P1
core_ref: [CRM-CORE.md §2.5]
tests: TEST-SCENARIOS.md#crm-126
depends_on: [CRM-110, CRM-108]
status: pending
---

# CRM-126 — Secvențe de follow-up

## Goal
Cel mai des pierdut lead e cel necontactat după primul contact. Adăugăm „secvențe" (cadence):
o serie de pași programați (ex. zi 0 SMS welcome, zi 2 WhatsApp, zi 5 apel) care rulează automat
peste motorul de automatizări existent (CRM-110).

## In scope
- Tabel `cadences` (`id, tenant_id, name, enabled, steps JSONB`) unde fiecare step =
  `{ offset_days, channel, template_id | action: 'create_task', note }`.
- Tabel `cadence_enrollments` (`id, tenant_id, lead_id, cadence_id, current_step, status, next_run_at`).
- UI: editor de secvențe (listă pași cu offset + acțiune); buton „Înscrie în secvență" pe cartonaș
  și ca acțiune de automatizare (CRM-110 action `enroll_cadence`).
- Cron `POST /api/cadences/cron/run` (pattern din CRM-110 no-contact): procesează enrollments
  scadente, execută pasul, avansează `current_step`, scrie `lead_interaction` + `cadence_enrollment` log.
- Oprire automată: lead convertit/pierdut sau `consent_revoked_at` → enrollment `stopped`.

## Out of scope
- Branching condiționat în secvență (ramuri „dacă a deschis emailul"). Liniar deocamdată.

## Acceptance criteria
- [ ] CRUD secvențe cu pași (offset+canal+template/task)
- [ ] Înscriere manuală + via automatizare; cron avansează pașii la scadență
- [ ] Conversie/pierdere/consent revocat oprește secvența (respectă §10 GDPR)
- [ ] Migrări `cadences` + `cadence_enrollments` generate + comise (§3.5.1)
- [ ] Endpoints tenant-scoped; nu raw `.execute().rows`
- [ ] 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-126`. Blocante verzi (incl. integration smoke pe cron + oprire la consent).

## DoD
Standard.
