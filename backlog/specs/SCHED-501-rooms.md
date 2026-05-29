---
id: SCHED-501
title: "Săli de clasă: rooms table + conflict detection + dropdown la create lesson"
milestone: SCHED
phase: "1 — Rooms"
priority: P0
slug: rooms
depends_on: [MVP-005]
status: pending
---

# SCHED-501 — Săli de clasă

## Goal

Adaugă tabelul `rooms` (name, capacity) și extinde `lessons` cu `room_id` opțional.
Detectare conflict sală (aceeași sală ocupată în același slot) și dropdown room la create lesson.

## In scope

- Schema `rooms` + coloană `room_id` pe `lessons`; migration 0014
- `GET /api/rooms`, `POST /api/rooms`, `DELETE /api/rooms/:id`
- Conflict detection extins în `PATCH /api/lessons/:id` + `POST /api/lessons`
- UI: dropdown "Sală" în SchedulePage create/edit lesson modal

## Out of scope

- View "By room" (SCHED-503)
- Capacitate enforcement per sală

## Acceptance criteria

- [ ] Migration 0014 commitată
- [ ] GET /api/rooms → 200
- [ ] POST /api/lessons cu room_id → conflict 409 dacă sală ocupată
- [ ] Dropdown sală în UI

## Tests

1. [blocant] GET /api/rooms → 200
2. [blocant] POST /api/lessons cu room conflict → 409
3. [normal] UI dropdown sală vizibil

## DoD

Standard.
