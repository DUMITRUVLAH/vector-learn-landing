---
id: SCHED-502
title: "Lecții recurente: lesson_series + creare N lecții + bulk cancel"
milestone: SCHED
phase: "2 — Recurring"
priority: P0
slug: recurring
depends_on: [SCHED-501]
status: pending
---

# SCHED-502 — Lecții recurente

## Goal

Manager creează o serie de lecții recurente (ex: "Engleză B2, luni 14:00, 12 săptămâni").
Sistemul generează toate lecțiile, le leagă în `lesson_series`, și permite bulk-cancel "all future".

## In scope

- Schema `lesson_series` + `series_id` FK pe `lessons`; migration 0015
- `POST /api/lessons/recurring`: body cu `{ recurrence: { type: weekly, endDate?, count? }, ...lessonBase }`
  → creează N lecții cu conflict check per fiecare
- `DELETE /api/lessons/series/:seriesId/future?from=ISO_DATE`: anulează lecțiile viitoare din serie
- UI modal "Repetă" cu: weekly + număr ocurențe sau dată finale

## Out of scope

- "Edit this and all following"
- Monthly recurrence

## Acceptance criteria

- [ ] POST /api/lessons/recurring → array de N lecții create
- [ ] DELETE /api/lessons/series/:id/future → lecții anulate
- [ ] Conflict check per lecție generată

## Tests

1. [blocant] POST /api/lessons/recurring → N lecții
2. [blocant] DELETE series future → lecții marked cancelled
3. [normal] UI modal repetă funcțional

## DoD

Standard.
