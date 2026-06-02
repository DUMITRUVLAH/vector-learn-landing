---
id: INTEG-102
title: payments.courseId + invoices.courseId FK — plăți legate de curs
milestone: INTEG
phase: "1"
branch: feat/INTEG-faza-1-conectivitate-module
status: pending
attempts: 0
depends_on: [INTEG-101]
---

## Goal

Plățile și facturile trebuie asociate unui curs pentru a putea calcula revenue per curs. Acum `payments` și `invoices` au doar `studentId` — nu se știe pentru ce curs s-a plătit. Fără acest FK, endpoint-ul `/api/analytics/revenue-by-course` este imposibil de implementat corect.

## User stories

- Ca director financiar, vreau să văd câți bani a generat fiecare curs, pentru că știu care cursuri sunt profitabile.
- Ca manager, când creez o factură, vreau să asociez cursul pentru care se plătește, pentru că factura trebuie să fie clară.
- Ca sistem analytics, vreau să pot agrupa plățile pe `courseId`, pentru că generez rapoartele de revenue.

## Acceptance criteria

1. Migrare `0034_integ102_payments_invoices_course.sql` adaugă:
   - `course_id UUID REFERENCES courses(id) ON DELETE SET NULL` pe tabela `payments`
   - `course_id UUID REFERENCES courses(id) ON DELETE SET NULL` pe tabela `invoices`
   - Ambele nullable

2. Schema drizzle `server/db/schema/payments.ts` și `server/db/schema/invoices.ts` includ `courseId` cu relație FK.

3. Route `server/routes/payments.ts`:
   - `createPaymentSchema` acceptă opțional `courseId`
   - `POST /api/payments` salvează `courseId`
   - `GET /api/payments` returnează `courseId` și `courseName` (join)

4. Route `server/routes/invoices.ts`:
   - `createInvoiceSchema` acceptă opțional `courseId`
   - `POST /api/invoices` salvează `courseId`
   - `GET /api/invoices` returnează `courseId` și `courseName` (join)

5. Frontend `InvoicesPage.tsx` și `PaymentsPage.tsx`:
   - La creare invoice/payment, afișează un selector de curs (opțional)
   - Dacă studentul are un `courseId` pe lead/cohort, pre-populează selectorul

6. Migrare rulează fără erori.

## Files touched

- `server/db/schema/payments.ts`
- `server/db/schema/invoices.ts`
- `server/routes/payments.ts`
- `server/routes/invoices.ts`
- `src/pages/app/InvoicesPage.tsx`
- `src/pages/app/PaymentsPage.tsx`
- `src/lib/api/invoices.ts` și `payments.ts` — actualizează tipuri
- `drizzle/` — migrare nouă `0034_integ102_...`

## Tests

- Unit: `payments.courseId` se salvează și returnează
- Unit: `invoices.courseId` se salvează și returnează
- Integration: `POST /api/payments` cu `courseId` valid → persistat

## DoD

- [ ] Migrare generată și committată
- [ ] `db:reset && db:seed` trece
- [ ] TypeScript strict
- [ ] Selectori curs în InvoicesPage + PaymentsPage
- [ ] Tests verzi
