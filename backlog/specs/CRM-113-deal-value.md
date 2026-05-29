---
id: CRM-113
title: Valoarea deal-ului (€) per lead + rollup valoare pe pipeline
milestone: CRM
phase: F
priority: P0
core_ref: [CRM-CORE.md §11.1]
tests: TEST-SCENARIOS.md#crm-113
depends_on: [CRM-105, CRM-112]
status: pending
---

# CRM-113 — Valoare deal + rollup pipeline

## Goal
Pipeline-ul devine un pipeline de vânzări real: fiecare lead are o valoare (€), iar kanban-ul
arată banii — total și pe fiecare stadiu — ca în CRM-ul de producție (Kommo).

## In scope
- Migrare `leads`: `+ value_cents INTEGER NOT NULL DEFAULT 0` (Sale) `+ debt_cents INTEGER NOT NULL DEFAULT 0` (Datorie).
- Editabil în cartonaș (CRM-106) și în modalul de creare (suma deal-ului).
- Kanban (CRM-105): header arată **total leaduri + Σ valoare** (`{n} leads · €{sum}`); fiecare
  coloană arată **count + Σ valoare**; cardul afișează `€value` (și `Datorie €x` dacă > 0).
- `GET /api/leads/pipeline` întoarce `value_cents`/`debt_cents` per lead + sume agregate per stadiu.
- Raportul (CRM-112) câștigă „valoare ponderată pe stadiu" (Σ value_cents pe coloană).

## Out of scope
- Facturare reală / legătura cu Payments (rămâne în modulul Finanțe).

## Acceptance criteria
- [ ] value_cents/debt_cents persistă; editabile din card + create
- [ ] Header + fiecare coloană afișează count și Σ valoare corecte (formatare €, ro-RO)
- [ ] Datoria apare pe card doar când > 0
- [ ] Pipeline endpoint întoarce sumele agregate; tenant-scoped
- [ ] Migrare generată + commisă (gate §3.5.1)

## Tests
`TEST-SCENARIOS.md#crm-113`. Blocante verzi (incl. migration + integration smoke).

## DoD
Standard (vezi BUILD-SEQUENCE).
