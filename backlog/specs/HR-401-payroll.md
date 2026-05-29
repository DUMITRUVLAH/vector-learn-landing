---
id: HR-401
title: "Calcul salariu lunar: ore predate × tarif + comision + tabel payroll_entries"
milestone: HR
phase: "1 — Payroll"
priority: P0
slug: payroll
depends_on: [MVP-006, MVP-005]
status: pending
---

# HR-401 — Payroll calcul salariu lunar

## Goal

Calculul automat al salariului lunar pentru fiecare profesor, bazat pe lecțiile predate
(completed) × tarif/oră + comision%. Stocarea în `payroll_entries` tabel și vizualizare
în UI cu breakdown lecție-cu-lecție.

## In scope

- **Schema `payroll_entries`**:
  `id, tenant_id, teacher_id, month (YYYY-MM), total_hours, total_cents, commission_cents,
  bonus_cents, status (draft|approved|paid), breakdown (jsonb), created_at`
- **Migration** 0011
- **API `POST /api/hr/payroll/calculate`**:
  - Body: `{ month: "YYYY-MM" }`
  - Querying: lessons completed în luna respectivă per profesor → count ore × rate_per_hour
  - Creează sau actualizează payroll_entries rows per profesor
  - Returnează `{ entries: PayrollEntry[], totalCents: number }`
- **API `GET /api/hr/payroll`**: lista entries per tenant (filtrabil `?month=`)
- **API `PATCH /api/hr/payroll/:id`**: actualizare status (approved/paid)
- **UI `/app/hr/payroll`**: tabel cu profesori + ore + brut + status per lună; buton „Calculează luna"
- Picker lună + buton calculare
- Status badge: draft/approved/paid
- Click pe rând → drawer cu breakdown lecție-cu-lecție

## Out of scope

- PDF fluturaș
- Email automat
- Bonus formule complexe (HR-402)
- REVISAL export

## Data / API

### payroll_entries table
```ts
{
  id: uuid PK
  tenantId: uuid FK tenants
  teacherId: uuid FK teachers
  month: varchar(7) // YYYY-MM
  totalHours: numeric(10,2)
  totalCents: integer
  commissionCents: integer
  bonusCents: integer DEFAULT 0
  status: enum(draft, approved, paid) DEFAULT draft
  breakdown: jsonb // [{ lessonId, date, hours, rateCents, subtotalCents }]
  createdAt: timestamp
  updatedAt: timestamp
}
```

## Acceptance criteria

- [ ] Migration 0011 commitată
- [ ] POST /api/hr/payroll/calculate → entries calculate din lecții completed
- [ ] GET /api/hr/payroll → lista entries
- [ ] UI afișează tabel payroll cu status badge
- [ ] Click → breakdown lecție cu lecție

## Tests

1. [blocant] POST /api/hr/payroll/calculate → 200
2. [blocant] GET /api/hr/payroll → array
3. [normal] UI tabel payroll renderează

## DoD

Standard.
