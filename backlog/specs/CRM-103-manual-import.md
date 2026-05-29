---
id: CRM-103
title: Adăugare manuală extinsă + Import CSV
milestone: CRM
phase: A
priority: P0
core_ref: [CRM-CORE.md §8.2, §8.6]
tests: TEST-SCENARIOS.md#crm-103
depends_on: [CRM-102]
status: pending
---

# CRM-103 — Add manual extins & import CSV

## Goal
Recepționerul adaugă rapid un lead din apel; managerul migrează leaduri vechi dintr-un Excel/CRM
fără să creeze duplicate.

## In scope
- Extinde modalul „Adaugă lead nou" existent (`LeadsPage.tsx`): câmp `assigned_to` (responsabil),
  dedup live la `blur` pe telefon/email (banner „Există deja: <nume> – Deschide / Creează oricum").
- Import CSV: ⋯ → Import → upload → mapare coloane (nume/telefon/email/curs/sursă) → preview 5
  rânduri → validare + dedup pe tot fișierul → raport „X create, Y duplicate, Z erori". `source=import`.
  Tranzacțional pe erorile critice.

## Out of scope
- Webhooks ads (CRM-104).

## Acceptance criteria
- [ ] Submit fără nume → validare blochează (fără request)
- [ ] Dedup live la blur afișează banner cu acțiuni Deschide/Creează oricum
- [ ] `assigned_to` salvat și filtrabil (filtru Responsabil — depinde de coloana din CRM-105; dacă
      nu există încă, câmpul se salvează și filtrul vine în CRM-105)
- [ ] Import: raport corect, preview înainte de commit, tranzacțional pe erori critice

## Tests
`TEST-SCENARIOS.md#crm-103` (T-CRM-103-1..5). Blocante verzi.

## DoD
Standard.
