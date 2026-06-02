---
id: PAY-007
title: "Refund — rambursare parțială sau completă cu audit log"
milestone: PAY
phase: "3"
status: pending
depends_on: [PAY-004]
slug: refunds
---

## Goal

Permite managerilor să proceseze rambursări (refunduri) pentru plățile deja efectuate. Pentru plățile
cash/transfer → rambursare manuală (înregistrare în sistem). Pentru plățile Stripe → refund automat via
Stripe API. Fiecare refund e înregistrat cu motiv, sumă și aprobator în audit log. UI afișează status
factură ca "Refundat parțial" sau "Refundat complet".

## User stories

- **US-1**: Ca Manager, vreau să procesez un refund parțial când un elev abandoneaza cursul la jumătate, pentru că trebuie să rambursez proporțional.
- **US-2**: Ca Director, vreau să văd toate refund-urile lunii cu motivele lor, pentru că trebuie să înțeleg de ce pierdem bani.
- **US-3**: Ca Recepționer, vreau ca sistemul să facă automat refund Stripe dacă plata a fost cu cardul, pentru că nu știu cum se face manual în Stripe dashboard.
- **US-4**: Ca Accountant, vreau ca refund-urile să apară în export contabilitate ca intrări negative, pentru că altfel reportul e incorect.

## Acceptance criteria

- [ ] AC1: Tabel `refunds` — (id, invoice_id, amount_cents, currency, reason TEXT, method: stripe/manual, stripe_refund_id nullable, processed_by, processed_at, status: pending/completed/failed).
- [ ] AC2: `POST /api/invoices/:id/refund` cu `{amount_cents, reason}` → dacă factura are `stripe_payment_intent_id`, face Stripe Refund API call; altfel înregistrează manual. Returnează 400 dacă sum > paid amount sau invoice nu e paid.
- [ ] AC3: Invoice status update după refund: dacă refund_amount == paid_amount → `status = "refunded"`; altfel → `status = "partially_refunded"`. Câmp `refunded_amount_cents` pe invoices.
- [ ] AC4: `GET /api/refunds` cu query params `{month, status}` → lista refunduri per tenant pentru raportare.
- [ ] AC5: UI — pe card-ul facturii paid: buton "Procesează refund" → modal cu: input sumă (max = suma plătită), input motiv (câmp text obligatoriu), preview calcul nou status factură. Buton confirmare.
- [ ] AC6: Badge pe factură: "Refundat" (roșu), "Refund parțial" (portocaliu). Suma refundată afișată.
- [ ] AC7: Audit log entry la fiecare refund (via funcția existentă `logAudit`): `action: "refund_processed"`, `details: {invoice_id, amount, reason, method}`.
- [ ] AC8: `GET /api/invoices/:id/refunds` → lista refundurilor pentru o factură specifică (pentru timeline).

## Files to create / modify

- `server/db/schema/refunds.ts` — tabel `refunds` + coloană `refunded_amount_cents` pe `invoices`
- `server/routes/refunds.ts` — POST refund + GET list
- `server/lib/stripe.ts` — extend cu `createRefund(paymentIntentId, amount)`
- `src/components/payments/RefundModal.tsx` — modal procesare refund
- `src/pages/PaymentsPage.tsx` — integrate RefundModal + badge status
- `drizzle/0035_pay007_refunds.sql` — migrare

## Tests

- **T-PAY-007-1** [blocant] Given o factură paid cu amount 1200, When POST /api/invoices/:id/refund cu {amount_cents: 400, reason: "elev plecat"}, Then se creează rând în refunds, invoice.refunded_amount_cents = 400, status = "partially_refunded".
- **T-PAY-007-2** [blocant] Given refund cu amount > invoice.amount, When POST /api/invoices/:id/refund, Then 400 cu `error: "refund_exceeds_paid"`.
- **T-PAY-007-3** [blocant] Given API smoke — boot server, POST /api/auth/login → 200, GET /api/refunds → 200 array.
- **T-PAY-007-4** [normal] Given refund complet (amount = total), Then invoice status = "refunded" (nu "partially_refunded").
- **T-PAY-007-5** [normal] Given factură cu status "pending" (neplătită), When POST /api/invoices/:id/refund, Then 400 cu `error: "invoice_not_paid"`.

## Definition of Done

- [ ] Migrare SQL commitată și `db:reset && db:seed` trec
- [ ] Toate testele T-PAY-007-* trec
- [ ] Modal refund funcțional cu validare sumă
- [ ] Badge status "Refundat" / "Refund parțial" vizibil
- [ ] Audit log înregistrează fiecare refund
- [ ] Reviewer APPROVED, integration-architect CONNECTED
