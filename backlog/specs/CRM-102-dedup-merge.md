---
id: CRM-102
title: Deduplicare robustă + merge manual de leaduri
milestone: CRM
phase: A
priority: P0
core_ref: [CRM-CORE.md §8.8, §6.1]
tests: TEST-SCENARIOS.md#crm-102
depends_on: [CRM-101]
status: pending
---

# CRM-102 — Deduplicare & merge

## Goal
Baza de leaduri rămâne curată: detectăm automat duplicatele înainte de creare și oferim
managerului un merge manual pentru false-negative.

## In scope
- Normalizare deterministă: telefon (strip non-cifre, prefix +40, ultimele 9 cifre), email
  (lowercase+trim), nume (NFC, lowercase, trim spații multiple) — utilitar comun reutilizat de
  intake (CRM-101), manual (CRM-103) și webhooks (CRM-104).
- Index `idx_leads_dedup (tenant_id, phone_normalized, email_normalized)`.
- La match → adaugă `interaction` la leadul existent, NU creează duplicat.
- `POST /api/leads/:id/merge { sourceId }`: mută toate interacțiunile/task-urile pe lead-ul
  păstrat, completează golurile din celălalt, arhivează sursa. Acțiune din cartonaș (⋯ → Merge).

## Out of scope
- Atribuire multi-touch (CRM-112).

## Acceptance criteria
- [ ] Variațiile de format telefon (cu/fără prefix, spații, dash) → același lead
- [ ] Email/nume normalizate corect (diacritice, case)
- [ ] Merge nu pierde nicio interacțiune; câmpurile non-nule ale păstratului au prioritate
- [ ] Merge e tenant-scoped și reversibil prin audit (interaction `system`)

## Tests
`TEST-SCENARIOS.md#crm-102` (T-CRM-102-1..5). Blocante verzi.

## DoD
Standard (vezi BUILD-SEQUENCE „Definiția de done").
