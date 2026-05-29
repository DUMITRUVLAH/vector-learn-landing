---
id: CRM-114
title: Companie + contacte multiple per lead (B2B) + nume deal
milestone: CRM
phase: F
priority: P1
core_ref: [CRM-CORE.md §11.2]
tests: TEST-SCENARIOS.md#crm-114
depends_on: [CRM-106]
status: pending
---

# CRM-114 — Companie & contacte multiple

## Goal
Suport B2B: un lead poate avea o companie și mai mulți contacți (decident, plătitor, utilizator),
iar deal-ul poate avea un nume separat de persoană.

## In scope
- Migrare `leads`: `+ company TEXT NULL` `+ deal_name TEXT NULL`.
- Tabel nou `lead_contacts` (id, tenant_id, lead_id, full_name, role, phone, email, is_primary).
- Cartonaș (CRM-106): afișează compania sub nume; secțiune „Contacte" cu listă + „Adaugă contact".
- Card kanban: afișează `company` sub nume (muted) când există; titlul = `deal_name ?? full_name`.
- API: `GET/POST/PATCH/DELETE /api/leads/:id/contacts`.

## Out of scope
- Dedup pe companie (rămâne dedup pe persoană, CRM-102).

## Acceptance criteria
- [ ] Company + deal_name persistă și se afișează (card + card detail)
- [ ] CRUD contacte multiple per lead; un singur `is_primary`
- [ ] Tenant-scoped; migrare generată + commisă

## Tests
`TEST-SCENARIOS.md#crm-114`. Blocante verzi.

## DoD
Standard.
