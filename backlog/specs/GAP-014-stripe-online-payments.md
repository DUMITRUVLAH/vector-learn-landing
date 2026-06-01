---
id: GAP-014
title: "Plăți online cu cardul (Stripe Checkout) — reconciliere automată facturi"
milestone: GAP
phase: 4
priority: P1
slug: stripe-online-payments
depends_on: [MVP-007]
status: pending
---

# GAP-014 — Plăți online cu cardul (Stripe)

## Goal

Părinții pot plăti facturi online cu cardul bancar prin Stripe Checkout. La succesul plății,
factura se marchează automat ca plătită, datoria studentului scade, și se loghează în audit.
Nu se stochează date de card — totul trece prin Stripe.

## In scope

- **Stripe Checkout Session:** `POST /api/payments/stripe/checkout` — body: `{ invoiceId }` →
  creează sesiune Stripe Checkout, returnează `{ checkoutUrl }`. Redirect client la Stripe.
- **Webhook Stripe:** `POST /api/payments/stripe/webhook` — procesează `checkout.session.completed`:
  marchează invoice `paid`, actualizează `student.debtCents`, loghează în audit. Verifică
  `stripe-signature` header (HMAC). No-auth endpoint.
- **Invoice model extins:**
  - câmp `stripeSessionId varchar(255)` pe `invoices` table
  - câmp `stripePaymentIntentId varchar(255)` pe `invoices` table
  - câmp `paidOnline boolean default false`
- **UI — buton "Plătește online"** pe rândul facturii din `/app/invoices`:
  - apare doar dacă `invoice.status = 'unpaid'`
  - click → POST checkout → redirect la Stripe Checkout URL
  - după redirect înapoi (success URL = `/app/invoices?paid=1`) → toast „Plată procesată!"
- **Configurare:** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` în env (Vercel env vars).
  Dacă env lipsesc → buton "Plătește online" ascuns, nu eroare 500.
- **DB:** fără raw `.execute().rows`; query builder

## Out of scope

- Stripe Elements în-app (redirecționare la Stripe Checkout, nu embedded)
- Refund flow (manual din Stripe dashboard)
- Abonamente recurente (Stripe Subscriptions — GAP-005 are propriul model)
- Multi-currency (doar valuta din invoice)

## Acceptance criteria

- [ ] `POST /api/payments/stripe/checkout` returnează `{ checkoutUrl }` (cu keys reale sau mock)
- [ ] `POST /api/payments/stripe/webhook` cu event valid → invoice `paid`, debt scăzut
- [ ] Webhook respinge request fără semnătură validă (401)
- [ ] Câmpuri `stripeSessionId`, `stripePaymentIntentId`, `paidOnline` în invoices table
- [ ] Buton "Plătește online" vizibil pe facturi unpaid; ascuns dacă `STRIPE_SECRET_KEY` lipsă
- [ ] Migrare adăugare câmpuri Stripe la `invoices` commitată; `db:reset + db:seed` succed
- [ ] TypeScript strict; zero `any`; 0 axe critical/serious

## Tests

- **T-GAP-014-1** `[blocant]` Given `STRIPE_SECRET_KEY` setat, When `POST /api/payments/stripe/checkout` cu invoiceId valid, Then 200 cu `checkoutUrl`
- **T-GAP-014-2** `[blocant]` Given webhook cu `checkout.session.completed` și semnătură validă, When processat, Then invoice `status = paid` + `debtCents` scăzut
- **T-GAP-014-3** `[blocant]` Given webhook fără header `stripe-signature`, When procesat, Then 401
- **T-GAP-014-4** `[blocant]` Migration gate: `db:reset + db:seed` succed cu câmpuri Stripe noi
- **T-GAP-014-5** `[normal]` Given `STRIPE_SECRET_KEY` absent, When `GET /api/invoices`, Then butonul de plată online nu apare (UI hide)
- **T-GAP-014-6** `[normal]` Pagina `/app/invoices` randează fără crash cu sau fără Stripe config

## DoD

Standard. O fază = 1 PR (CLAUDE.md §0.2). Faza 4 branch: `feat/GAP-faza-4-analytics`.
