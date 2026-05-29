---
id: HR-403
title: "Disponibilitate profesor: grid săptămânal + excepții + conflict prevent"
milestone: HR
phase: "3 — Availability"
priority: P0
slug: availability
depends_on: [HR-401]
status: pending
---

# HR-403 — Disponibilitate profesor

## Goal

Fiecare profesor poate marca sloturile de disponibilitate în grid săptămânal 7×24h.
La crearea unei lecții, dacă profesorul nu e disponibil la ora respectivă → warning
(nu blochează hard, dar avertizează).

## In scope

- **Schema `teacher_availability`**:
  `id, tenant_id, teacher_id, day_of_week (0-6), start_hour (0-23), end_hour, is_available,
  created_at`
  - Default: toate sloturile disponibile (no rows = fully available)
- **Migration** 0012
- **API `GET /api/hr/teachers/:id/availability`**: lista sloturilor setate
- **API `PUT /api/hr/teachers/:id/availability`**: upsert availability grid
  (body: `{ slots: [{dayOfWeek, startHour, endHour, isAvailable}] }`)
- **UI `/app/teachers/:id/availability`** (sau drawer din TeachersPage):
  - Grid 7 zile × 24 ore cu toggle
  - Zilele săptămânii: Lun-Dum
  - Ore: 06:00-22:00 (16 slots × 7 = 112 toggle-uri)
  - Buton Salvează
- **Lesson create warning**: dacă teacher e indisponibil → toast warning (nu 409, just info)

## Out of scope

- Excepții per dată specifică (concediu)
- Algoritm înlocuire automată (HR-10)

## Acceptance criteria

- [ ] Migration 0012 commitată
- [ ] GET /api/hr/teachers/:id/availability → 200
- [ ] PUT upsert disponibilitate salvat
- [ ] Grid UI toggle salvează corect
- [ ] Warning la create lesson dacă indisponibil

## Tests

1. [blocant] GET /api/hr/teachers/:id/availability → 200
2. [blocant] PUT upsert → disponibilitate salvată
3. [normal] Grid UI toggles funcțional

## DoD

Standard.
