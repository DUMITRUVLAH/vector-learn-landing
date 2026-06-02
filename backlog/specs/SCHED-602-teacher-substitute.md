---
id: SCHED-602
title: "Înlocuitor profesor la lecție + notificare automată"
milestone: SCHED
phase: "6 — Calendar UX"
priority: P0
slug: teacher-substitute
depends_on: [SCHED-601, MVP-006]
status: pending
---

# SCHED-602 — Înlocuitor profesor

## Goal

Permite managerului să schimbe profesorul la o lecție specifică (ex. concediu medical).
Sistemul filtrează doar profesorii disponibili în acel slot și trimite notificare automată.

## User stories

- Ca Manager, vreau dropdown "Schimbă profesor" în detaliul lecției, pentru că acopăr absența unui profesor fără să reprogramez.
- Ca Manager, vreau să văd doar profesorii liberi în acel slot, pentru că nu creez conflict nou.
- Ca Profesor înlocuitor, vreau notificare email/SMS că am o lecție nouă, pentru că nu o știam.

## Acceptance criteria

- [ ] `PATCH /api/lessons/:id/substitute` → 200 cu noul teacherId salvat
- [ ] Conflict detection: dacă noul profesor e ocupat → 409
- [ ] `GET /api/teachers/available?lessonId=x` → lista fără conflicte
- [ ] Notificare email stub trimisă
- [ ] UI: dropdown + confirm + toast
- [ ] Typecheck green, zero `any`

## Tests

- **T-SCHED602-1** [blocant] Given profesorul A liber, When PATCH substitute cu teacherId=A, Then 200 + lessons.teacher_id actualizat
- **T-SCHED602-2** [blocant] Given profesorul B cu conflict, When PATCH substitute cu teacherId=B, Then 409
- **T-SCHED602-3** [blocant] Given login + PATCH /api/lessons/:id/substitute → 200 (integration smoke)
- **T-SCHED602-4** [normal] Given GET /api/teachers/available?lessonId=x, Then response excludes teacheri cu overlap
- **T-SCHED602-5** [normal] Given substitute reușit, When audit_log verificat, Then entry cu teacher_changed prezent
