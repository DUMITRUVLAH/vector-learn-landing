---
id: CRM-108
title: Bibliotecă template-uri (email/WhatsApp/SMS) cu variabile
milestone: CRM
phase: C
priority: P0
core_ref: [CRM-CORE.md §2.4]
tests: TEST-SCENARIOS.md#crm-108
depends_on: [CRM-106]
status: pending
---

# CRM-108 — Template-uri de mesaje

## Goal
Vânzătorul nu scrie de la zero: template-uri reutilizabile (welcome, trial confirm, no-show
follow-up) cu variabile și preview.

## In scope
- Tabel `message_templates` (name, channel email|whatsapp|sms, subject, body, variables[]).
- CRUD în `/app/settings/crm/templates`.
- Variabile suportate: `{{first_name}}`, `{{course}}`, `{{trial_date}}`, `{{center_name}}`.
  Detectare automată a variabilelor din body la salvare.
- Preview cu sample data (înlocuire variabile); avertisment la variabilă necunoscută.

## Out of scope
- Trimiterea efectivă (CRM-109), automatizări (CRM-110).

## Acceptance criteria
- [ ] CRUD template-uri tenant-scoped
- [ ] Variabile detectate corect la salvare
- [ ] Preview înlocuiește variabilele cu sample data
- [ ] Variabilă necunoscută → avertisment vizibil

## Tests
`TEST-SCENARIOS.md#crm-108` (T-CRM-108-1..3). Blocante verzi.

## DoD
Standard.
