---
id: CRM-111
title: Conversie lead → student cu legătură familie + reasignare + scor
milestone: CRM
phase: E
priority: P0
core_ref: [CRM-CORE.md §6.7, §2.2]
tests: TEST-SCENARIOS.md#crm-111
depends_on: [CRM-106]
status: pending
---

# CRM-111 — Conversie + familie

## Goal
Când leadul plătește, devine student real, cu plătitorul (părinte) legat corect — modelul
educațional plătitor↔elevi. Plus reasignare și scor de prioritate.

## In scope
- Modal conversie (CORE §6.7): pre-completare din lead + câmpuri plătitor (nume/telefon/email) +
  data nașterii elev + status.
- Tabel `families`; `students.family_id`. `POST /api/leads/:id/convert` creează student + familie,
  setează `stage=paid`, `converted_to_student_id`, `converted_at`, scrie interaction `system`.
  Idempotent (`already_converted`).
- Drop în coloana „Client"/paid → deschide modalul de conversie (nu schimbă direct stage-ul).
- `gclid` prezent → trimite Google Offline Conversion.
- Reasignare (`assigned_to`) + notificare. Scor `0..100` derivat din semnale (sursă,
  time-to-respond, replies) + badge hot/warm/cold pe card.

## Out of scope
- Rapoarte agregate (CRM-112), reactivare lost (rămâne în CRM-112/backlog).

## Acceptance criteria
- [ ] Convert creează student (active) + familie + leagă family_id
- [ ] A doua conversie → `already_converted`, fără duplicat
- [ ] Drop în paid deschide modal (nu schimbă direct)
- [ ] Reasignare actualizează assigned_to + notifică
- [ ] Scor calculat și afișat (hot/warm/cold)

## Tests
`TEST-SCENARIOS.md#crm-111` (T-CRM-111-1..5). Blocante verzi.

## DoD
Standard.
