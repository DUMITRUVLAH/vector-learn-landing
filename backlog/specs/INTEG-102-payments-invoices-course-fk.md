---
id: INTEG-102
title: "Integrare: payments + invoices cu FK spre courses — revenue per curs"
milestone: INTEG
phase: 1
status: pending
depends_on: [INTEG-101]
slug: payments-invoices-course-fk
---

## Goal

Adaugă `course_id` (FK→courses, nullable, ON DELETE SET NULL) pe tabelele `payments` și `invoices`.
Permite rapoarte de venit per curs (revenue-per-course) fără a rupe plățile existente.

## In scope

- Migration: ADD COLUMN course_id uuid + FK constraint pe ambele tabele.
- Schema Drizzle: payments.courseId + invoices.courseId cu referință la courses.id.
- Routes: createSchema + patchSchema acceptă courseId; GET returnează courseName din JOIN.
- Tests: T-INTEG-102-1..4 verzi.

## Out of scope

- UI pentru selectarea cursului pe plată/factură (UI item separat).
- Revenue-per-course dashboard (INTEG-104).

## User stories

- **US-1**: Ca manager, vreau ca fiecare plată să fie legată de un curs pentru a vedea venitul per curs.
- **US-2**: Ca manager, vreau ca facturile să indice cursul pentru export contabil corect.

## Acceptance criteria

- [ ] AC1: Migration 0032 adaugă course_id (nullable) pe payments și invoices.
- [ ] AC2: POST /api/payments cu courseId → rând cu course_id setat.
- [ ] AC3: POST /api/invoices cu courseId → rând cu course_id setat.
- [ ] AC4: GET /api/payments returnează courseName din join (sau null dacă lipsește).
- [ ] AC5: Plățile existente fără courseId nu se sparg (backward compatible).
- [ ] AC6: tenant-safe; zero `any`; fără raw `.execute().rows`.

## Tests

- **T-INTEG-102-1** `[blocant]` POST /api/payments cu courseId valid → 201, course_id setat.
- **T-INTEG-102-2** `[blocant]` POST /api/invoices cu courseId valid → 201, course_id setat.
- **T-INTEG-102-3** `[blocant]` GET /api/payments → returnează courseName (sau null).
- **T-INTEG-102-4** POST fără courseId → 201, course_id null (backward compatible).

## Definition of Done

- [ ] AC1-6 bifate; T-INTEG-102-1..4 verzi; build+typecheck+lint+test verzi
- [ ] Migration + API smoke + portability verzi (§3.5.1)
