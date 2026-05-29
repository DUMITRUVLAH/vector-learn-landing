---
id: CRM-106
title: Cartonaș detaliu lead/client — pagină /app/leads/:id
milestone: CRM
phase: B
priority: P0
core_ref: [CRM-CORE.md §6]
tests: TEST-SCENARIOS.md#crm-106
depends_on: [CRM-105]
status: pending
---

# CRM-106 — Cartonaș detaliu

## Goal
O pagină completă pentru un lead/client, unde vânzătorul vede și face tot: contact, sursă, UTM,
stadiu, scor, responsabil, timeline complet, cu editare inline.

## In scope
- Ruta `/app/leads/:id` cu layout 2 coloane (CORE §6 — col. stângă sticky info+acțiuni, col.
  dreaptă tab-uri). Quick-view modal din kanban rămâne pentru previzualizare.
- Col. stângă: stadiu (dropdown), scor (placeholder până la CRM-111), responsabil (dropdown),
  contact (telefon/email/curs/sursă/UTM/dată), butoane Convertește / Marchează pierdut.
- **Editare inline** (buton Editează → câmpuri editabile → Salvează → `PATCH /api/leads/:id`).
- Tab **Activitate**: timeline cronologic invers (note, stage_change, system, viitoarele comms).
- `+ Notă` salvează interaction instant.
- Badge „Consimțământ retras" + dezactivare butoane outbound dacă `consent_revoked_at`.
- Meniu `⋯ Acțiuni`: Reasignează, Merge (CRM-102), Șterge GDPR (`DELETE /api/leads/:id`).

## Out of scope
- Task-uri/fișiere (CRM-107), comunicare reală (CRM-108/109), conversia cu familie (CRM-111).

## Acceptance criteria
- [ ] `/app/leads/:id` afișează tot din CORE §6; câmpurile editabile persistă după reload
- [ ] Timeline corect sortat; nota apare instant și persistă
- [ ] Consent retras → badge + butoane outbound dezactivate
- [ ] Ștergere GDPR șterge PII și anonimizează interacțiunile
- [ ] Click-map din CORE §6.1 implementat (rândurile fără `[Fază X]` ulterioară)

## Tests
`TEST-SCENARIOS.md#crm-106` (T-CRM-106-1..5). Blocante verzi.

## DoD
Standard.
