---
id: SCHED-601
title: "Drag-and-drop reprogramare lecție în calendar"
milestone: SCHED
phase: "6 — Calendar UX"
priority: P0
slug: drag-drop-reschedule
depends_on: [SCHED-501, SCHED-502]
status: done
---

# SCHED-601 — Drag-and-drop reprogramare lecție

## Goal

Permite managerului să tragă o lecție dintr-un slot în altul direct în vizualizarea săptămânii.
La drop, sistemul detectează conflicte (profesor, sală) și salvează noul scheduledAt prin PATCH /api/lessons/:id.

## Acceptance criteria

- [x] Drag-and-drop funcțional în week view pe desktop
- [x] PATCH /api/lessons/:id cu noul scheduledAt salvat în DB
- [x] Conflict profesor → 409 → toast error → revert card la poziția inițială
- [x] No drag pe lecții cu status "completed" sau "cancelled"
- [x] Typecheck + lint green; zero `any`
