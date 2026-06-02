---
id: INTEG-202
title: "Integrare: contracts.courseId — contract legat de curs (FK→courses)"
milestone: INTEG
phase: 2
status: in_progress
depends_on: [INTEG-201, CONTRACT-501]
slug: contracts-course-picker
---

## Goal

Adaugă `course_id` (FK→courses, nullable, ON DELETE SET NULL) pe tabela `contracts`.
Existent: contracts.course (varchar text). Nou: contracts.courseId (UUID FK).

Aceasta permite: (1) legătura contractelor la cursuri structurate, (2) rapoarte de contracte per curs.

## In scope

- Migration: ADD COLUMN course_id uuid + FK constraint.
- Schema Drizzle: contracts.courseId.
- Route POST /api/contracts: acceptă courseId.
- Route PATCH /api/contracts/:id: acceptă courseId.
- GET /api/contracts: returnează courseId + courseName din JOIN.
- Tests: T-INTEG-202-1..4 verzi.

## Out of scope

- UI dropdown de selectare curs (UI item separat).
- Ștergerea câmpului course (varchar) — păstrat pentru backward compat.

## User stories

- **US-1**: Ca manager, vreau să leagă contractele de cursuri structurate pentru a raporta corect venitul.
- **US-2**: Ca manager, vreau să văd câte contracte sunt per curs.

## Acceptance criteria

- [ ] AC1: Migration adaugă course_id (nullable, FK→courses) pe contracts.
- [ ] AC2: POST /api/contracts cu courseId → salvat.
- [ ] AC3: GET /api/contracts returnează courseId + courseName.
- [ ] AC4: Contractele existente fără courseId nu se sparg.
- [ ] AC5: tenant-safe; zero `any`; fără raw `.execute().rows`.

## Tests

- **T-INTEG-202-1** `[blocant]` Schema contracts.courseId există și e nullable.
- **T-INTEG-202-2** `[blocant]` POST /api/contracts cu courseId → 201, courseId setat.
- **T-INTEG-202-3** `[blocant]` GET /api/contracts returnează courseName (sau null).
- **T-INTEG-202-4** Contracte fără courseId sunt backward compatible (courseId null).

## Definition of Done

- [ ] AC1-5; T-INTEG-202-1..4 verzi; build+typecheck+lint+test verzi
- [ ] Migration + portability verzi (§3.5.1)
