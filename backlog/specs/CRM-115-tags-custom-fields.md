---
id: CRM-115
title: Tag-uri + câmpuri custom configurabile per tenant
milestone: CRM
phase: F
priority: P1
core_ref: [CRM-CORE.md §11.3]
tests: TEST-SCENARIOS.md#crm-115
depends_on: [CRM-106]
status: pending
---

# CRM-115 — Tag-uri & câmpuri custom

## Goal
Fiecare centru își adaptează CRM-ul: etichete libere pe leaduri + câmpuri proprii (ex. „Ediție",
„Curs Live", „Motivul refuzului") configurabile fără cod.

## In scope
- Tabel `lead_tags` (lead_id, tag) — tag-uri libere; afișate pe card detail + filtrabile.
- Tabele `custom_fields` (tenant_id, key, label, type: text|select|number, options[], order) și
  `lead_field_values` (lead_id, field_id, value).
- UI Setup `/app/settings/crm/fields`: CRUD câmpuri custom (owner/manager).
- Cartonaș (CRM-106): randează dinamic câmpurile custom (select/text/number) + editare.
- Tag de sursă auto (ex. „organic") la intake când nu există UTM.

## Out of scope
- Câmpuri custom pe alte entități (doar leads acum).

## Acceptance criteria
- [ ] Adăugare/ștergere tag-uri pe lead; afișate + filtru pe tag
- [ ] CRUD câmpuri custom; randate dinamic în cartonaș și salvate per lead
- [ ] Tenant-scoped; migrare generată + commisă

## Tests
`TEST-SCENARIOS.md#crm-115`. Blocante verzi.

## DoD
Standard.
