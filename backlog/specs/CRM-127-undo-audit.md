---
id: CRM-127
title: Undo (mutare/ștergere) + audit log per lead vizibil în cartonaș
milestone: CRM
phase: H
priority: P1
core_ref: [CRM-CORE.md §5.3, §6.1, §10]
tests: TEST-SCENARIOS.md#crm-127
depends_on: [CRM-106]
status: pending
---

# CRM-127 — Undo + audit log

## Goal
Recepționerul greșește des (mută cardul greșit, șterge din greșeală). Și pentru încredere/GDPR,
trebuie să vezi cine a modificat ce. Adăugăm Undo imediat + un audit log lizibil pe cartonaș.

## In scope
- **Undo pe mutare de stadiu**: după `PATCH /api/leads/:id/stage`, toast „Mutat în {stage} ·
  Anulează" (5s). Click → revine la stadiul anterior (PATCH invers, scrie interaction system).
- **Undo soft pe ștergere**: ștergerea (non-GDPR) marchează `deleted_at` (soft delete) + toast undo;
  după fereastra de undo / la GDPR-delete devine permanent + anonimizat (§10).
  (Adaugă `leads.deleted_at` + filtrare implicită din liste/kanban/pipeline.)
- **Audit log pe cartonaș**: tab/secțiune „Istoric" care listează din `lead_interactions` toate
  evenimentele `system`/`stage_change`/edit cu actor + timestamp, lizibil („Andrei a schimbat
  valoarea €300→€360 · acum 2h").
- Editările de câmp (CRM-106 inline) scriu un `lead_interaction type=system` cu diff în metadata.

## Out of scope
- Undo pe acțiuni în masă (CRM-118 are deja confirm; nu reintroducem aici).

## Acceptance criteria
- [ ] Undo mutare stadiu funcționează în fereastra de 5s; revert corect + audit
- [ ] Soft-delete cu undo; leadul șters dispare din liste dar e recuperabil până la finalizare
- [ ] GDPR-delete rămâne permanent + anonimizat (§10) — nesoftat
- [ ] Audit log pe cartonaș lizibil, cu actor+timestamp, ordonat invers
- [ ] Migrare `leads.deleted_at` generată + commisă (§3.5.1); liste filtrează deleted
- [ ] 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-127`. Blocante verzi.

## DoD
Standard.
