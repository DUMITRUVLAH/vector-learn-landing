---
id: SCHED-603
title: "Filtrare orar per profesor + statistici încărcare săptămânală"
milestone: SCHED
phase: "6 — Calendar UX"
priority: P1
slug: schedule-view-by-teacher
depends_on: [SCHED-602]
status: pending
---

# SCHED-603 — Vizualizare orar per profesor

## Goal

Adaugă un dropdown "Profesor" în header-ul SchedulePage care filtrează orarul pentru a vedea
lecțiile unui singur profesor. Include un counter "X lecții / Y ore săptămâna asta".

## User stories

- Ca Director, vreau să filtrez orarul pe Ana M., pentru că văd cât e încărcată fără să număr manual.
- Ca Manager, vreau un counter "8 lecții / 12h această săptămână", pentru că balansez echipa.

## Acceptance criteria

- [ ] Dropdown profesor în header-ul SchedulePage
- [ ] GET /api/lessons?teacherId=<id> returnează doar lecțiile acelui profesor
- [ ] Counter "X lecții · Y ore" calculat corect pentru săptămâna afișată
- [ ] Selecție persistată în localStorage
- [ ] Typecheck green

## Tests

- **T-SCHED603-1** [blocant] Given teacherId=X selected, When GET /api/lessons?teacherId=X, Then response conține doar lecții cu teacher_id=X
- **T-SCHED603-2** [blocant] Given login + GET /api/lessons?teacherId=1 → 200 (integration smoke)
- **T-SCHED603-3** [normal] Given 3 lecții × 2h, When profesor selectat, Then counter afișează "3 lecții · 6h"
- **T-SCHED603-4** [normal] Given dropdown rendered, When user selectează profesor, Then week view se actualizează
- **T-SCHED603-5** [normal] Given selecție persistată, When pagina reîncărcată, Then același profesor selectat
