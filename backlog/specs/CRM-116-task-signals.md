---
id: CRM-116
title: Semnale de task pe card — „Fără task" + aging restanță
milestone: CRM
phase: F
priority: P0
core_ref: [CRM-CORE.md §11.4]
tests: TEST-SCENARIOS.md#crm-116
depends_on: [CRM-107]
status: pending
---

# CRM-116 — Semnale de task pe card

## Goal
Niciun lead nu se mai pierde: cardul kanban arată dacă leadul n-are niciun task (uitat) și cât de
întârziat e următorul — exact ca în CRM-ul real („No Tasks", „75d").

## In scope
- Card kanban (CRM-105): dacă leadul nu are niciun `lead_task` cu status `open` → badge
  **„Fără task"** (portocaliu, token `warning`).
- Dacă are task open scadent depășit → badge roșu cu **nr. de zile întârziere** (ex. „75d",
  token `destructive`). Altfel afișează data celui mai apropiat task (ex. „⏰ azi 14:00").
- Stage-change interaction afișează sursa, dacă există („Mutat în {stage} din {source}").
- Filtru kanban: „doar leaduri fără task" / „cu restanțe".

## Out of scope
- Remindere automate (CRM-110 le trimite; aici doar semnalizare vizuală).

## Acceptance criteria
- [ ] Lead fără task open → badge „Fără task"; cu task → data/nr. zile corecte
- [ ] Task scadent depășit → roșu cu nr. zile; calc corect (azi − due, în zile)
- [ ] Filtre „fără task" / „restanțe" funcționează client-side
- [ ] 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-116`. Blocante verzi.

## DoD
Standard.
