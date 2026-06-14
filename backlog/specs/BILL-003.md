---
id: BILL-003
title: "Aging raport 0-30/31-60/60+ zile + remindere încasare in-app+email"
milestone: FIN
phase: "5"
status: pending
attempts: 0
depends_on: [BILL-002]
spec: backlog/specs/BILL-003.md
branch: feat/FIN-bill
---

## Goal

Raport de aging pentru facturile B2B cu buckets 0-30 / 31-60 / 60+ zile de la scadență,
plus un sistem de remindere de încasare in-app și email pentru facturile `overdue`.

Endpoint `/api/fin/invoices/aging` returnează sumele totale și per-bucket cu lista de facturi
aflate în fiecare interval. Remindere automate: pentru facturile expirate mai mult de 3/7/14
zile, sistemul creează înregistrări în `fin_invoice_reminders` (schema BILL-001) și afișează
un indicator in-app.

Refolosire: logica de remindere din `invoiceReminders` (tabela existentă pentru facturile B2C),
adaptată la `fin_invoice_reminders`. Pattern-ul de "days overdue" existent în `InvoicesPage.tsx`.

## User stories

- **Ca** contabil, **vreau** să văd facturile împărțite pe buckets de aging (0-30/31-60/60+),
  **pentru că** știu cine datorează cel mai mult timp.
- **Ca** director, **vreau** ca sistemul să trimită automat remindere la parteneri cu facturi expirate,
  **pentru că** urmăresc recuperarea creanțelor fără efort manual.
- **Ca** contabil, **vreau** să văd in-app câte facturi au generat reminder la fiecare bucket,
  **pentru că** pot prioritiza apelurile de colectare.
- **Ca** sistem, **vreau** ca remindere-le să fie idempotente per (invoiceId, reminderDay),
  **pentru că** nu trebuie trimise duplicate la aceeași factură.

## Acceptance criteria

- [ ] `GET /api/fin/invoices/aging` — returnează:
  ```json
  {
    "data": {
      "buckets": {
        "current": { "count": N, "totalCents": N },
        "overdue_0_30": { "count": N, "totalCents": N },
        "overdue_31_60": { "count": N, "totalCents": N },
        "overdue_60_plus": { "count": N, "totalCents": N }
      },
      "overdueInvoices": [ { id, invoiceNumber, partyId, totalCents, dueDate, daysOverdue } ]
    }
  }
  ```
  - `current` = facturi `issued` cu dueDate >= azi (sau fără dueDate)
  - `overdue_0_30` = dueDate între azi-1 și azi-30 (status `overdue` sau `issued` + expirat)
  - `overdue_31_60` = dueDate azi-31..azi-60
  - `overdue_60_plus` = dueDate < azi-60
  - Tenant isolation: filtrare pe tenantId
- [ ] `POST /api/fin/invoices/aging/reminders` — generează remindere:
  - Iterează facturile overdue pentru tenant
  - Pentru zile overdue >= 3, >= 7, >= 14 → inserează `fin_invoice_reminders` cu `reminderDay` corespunzător
  - Unique constraint `(invoiceId, reminderDay)` garantează idempotency (ON CONFLICT DO NOTHING)
  - Returnează `{ created: N, skipped: N }` (create = noi, skipped = deja existente)
- [ ] Ruta montată în `server/app.ts` sub `/api/fin/invoices` (prefix deja montat de BILL-002)
  - IMPORTANT: `/aging` trebuie definit ÎNAINTE de `/:id` în `finInvoicesRoutes` pentru a nu fi interceptat
- [ ] `GET /api/fin/invoices/aging/count` — returnează numărul de facturi cu reminder neacoperit (badge in-app)
- [ ] Auth-guard pe toate rutele noi

## Files

**New:**
- `src/__tests__/fin/bill-003-aging.test.ts` — teste pentru aging + remindere

**Modified:**
- `server/routes/finInvoices.ts` — adaugă rutele `/aging`, `/aging/reminders`, `/aging/count`
  - Adaugă import `finInvoiceReminders` din schema
- `src/__tests__/fin/bill-003-aging.test.ts` — teste unit

## Tests

- **T-BILL-003-1** [blocant] GET `/api/fin/invoices/aging` returnează `{ data: { buckets, overdueInvoices } }` cu toate 4 buckets
- **T-BILL-003-2** [blocant] O factură cu dueDate = azi-45 apare în `overdue_31_60` bucket
- **T-BILL-003-3** [blocant] POST `/api/fin/invoices/aging/reminders` cu o factură overdue ≥ 3 zile → `created: 1` la primul apel, `skipped: 1` la al doilea apel (idempotency)
- **T-BILL-003-4** [blocant] Tenant isolation: aging-ul tenant A nu include facturile tenant B
- **T-BILL-003-5** [normal] `daysOverdue` calculat corect: dueDate=azi-10 → daysOverdue=10
- **T-BILL-003-6** [normal] GET `/api/fin/invoices/aging/count` returnează integer ≥ 0

## DoD

- TypeScript strict, zero any
- Ruta `/aging` definită înaintea `/:id` (no param shadowing)
- check-route-mounts verde
- check-undefined-refs verde
- Toate testele T1-T4 (blocant) verzi
