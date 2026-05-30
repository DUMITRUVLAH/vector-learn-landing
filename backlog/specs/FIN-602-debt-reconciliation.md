---
id: FIN-602
title: "Datorie elev — link CRM-113 debt_cents + reconciliere plăți"
milestone: FIN
phase: "2 — Debt & Reconciliation"
priority: P0
slug: debt-reconciliation
depends_on: [FIN-601, CRM-113]
status: pending
---

# FIN-602 — Datorie elev + Reconciliere plăți

## Goal

Coloanele `debt_cents`/`value_cents` din leads (CRM-113) se conectează cu sistemul de facturi:
când o factură e marcată `paid`, datoria studentului scade automat.
Managerul vede datoria totală per student în `/app/students/:id` și poate reconcilia manual
o plată cu o factură.

## In scope

- `students` prinde coloana `debt_cents INTEGER NOT NULL DEFAULT 0` (migrare 0012)
- La `PATCH /api/invoices/:id` cu `status: "paid"` → trigger server-side:
  `UPDATE students SET debt_cents = debt_cents - invoice.amount_cents WHERE id = invoice.student_id`
  (floor la 0: debt nu poate fi negativ)
- `GET /api/students/:id` răspunsul include `debtCents`
- `GET /api/invoices/debt-summary` → lista studenți cu `debtCents > 0`, ordonat DESC (tenant-scoped)
- UI în `/app/students/:id` — badge „Datorie: RON X" (roșu) dacă debt > 0
- UI în `/app/invoices` — coloana "Datorie" în tabelul de facturi (suma rămasă)
- Reconciliere manuală: `PATCH /api/payments/:id/link-invoice` cu `{ invoiceId }` — leagă
  un payment existent de o factură (setează `invoices.payment_id`)
- Migrare `0012_fin602_debt_reconcile.sql`

## Out of scope

- Stripe webhooks (FIN-603)
- Notificări automate la restanță (US-PAY-11) — rămâne viitor
- Plan de rate (US-PAY-17)

## User stories

- US-PAY-04: Stats luna curentă — extinde cu `debtCents` total
- US-PAY-12: Suspendare acces (parțial — expune debt pentru viitor)

## Acceptance criteria

- [ ] Coloana `students.debt_cents` creată, migrare 0012 commitată
- [ ] PATCH invoice → paid scade `students.debt_cents` corect (floor 0)
- [ ] GET /api/students/:id include `debtCents`
- [ ] GET /api/invoices/debt-summary → 200, lista ordonată DESC
- [ ] PATCH /api/payments/:id/link-invoice → 200, invoice.payment_id actualizat
- [ ] Badge datorie în UI StudentDetailPage vizibil când debt > 0
- [ ] Tenant isolation: debt-summary și link-invoice nu expun date cross-tenant

## Files

### New
- `drizzle/0012_fin602_debt_reconcile.sql`

### Modified
- `server/db/schema/students.ts` — add `debtCents`
- `server/routes/invoices.ts` — extend PATCH paid logic + GET debt-summary
- `server/routes/payments.ts` — add PATCH /:id/link-invoice
- `server/routes/students.ts` — include debtCents in GET /:id
- `src/pages/StudentDetailPage.tsx` (sau similar) — badge datorie
- `src/pages/InvoicesPage.tsx` — coloana datorie

## Tests

1. [blocant] Migration gate: 0012 commitată, db:reset+db:seed succed
2. [blocant] PATCH /api/invoices/:id `{ status: "paid" }` → GET /api/students/:id → `debtCents` scăzut corect
3. [blocant] debt nu poate fi < 0: PATCH paid pe invoice cu amount > debt existent → debt = 0
4. [blocant] GET /api/invoices/debt-summary → 200, ordonat DESC, tenant-scoped
5. [blocant] PATCH /api/payments/:id/link-invoice → 200, payment_id setat pe invoice
6. [normal] Badge datorie vizibil în StudentDetailPage când debtCents > 0
7. [normal] Isolation: student din alt tenant nu apare în debt-summary

## DoD

Standard — toate criteriile [blocant] verzi, reviewer APPROVED, integration-architect CONNECTED.
