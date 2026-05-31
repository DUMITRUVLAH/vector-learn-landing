---
id: FIN-603
title: "Abonamente recurente — generare automată facturi lunare"
milestone: FIN
phase: "3 — Recurring Billing"
priority: P0
slug: recurring-billing
depends_on: [FIN-601, FIN-602]
status: pending
---

# FIN-603 — Abonamente recurente (facturare lunară)

## Goal

Directoarea configurează un abonament per elev (preț + zi facturare). La data specificată,
serverul generează automat factura și trimite email-ul de notificare. Elimină munca manuală
de creare a 200 de facturi pe lună.

## In scope

- Schema `subscriptions` (migrare 0013):
  - `id`, `tenant_id`, `student_id`, `amount_cents`, `currency`
  - `billing_day` SMALLINT (1–28) — ziua lunii la care se generează factura
  - `description` VARCHAR(200)
  - `status`: `active | paused | cancelled`
  - `next_billing_date` DATE — calculat la creare și actualizat după fiecare run
  - `created_at`, `updated_at`
- `POST /api/subscriptions` — creare abonament per elev
- `GET /api/subscriptions` — lista abonamente tenant-scoped
- `PATCH /api/subscriptions/:id` — update status (active/paused/cancelled) sau amount
- `POST /api/subscriptions/run-billing` — endpoint manual declanșat de admin (sau cron)
  - Găsește toate abonamentele `active` cu `next_billing_date <= today`
  - Creează o `invoice` per abonament (via logica din FIN-601)
  - Actualizează `next_billing_date` la luna viitoare
  - Returnează `{ processed: N, invoicesCreated: [ids] }`
- UI `/app/invoices` câștigă tab „Abonamente":
  - Tabel abonamente cu coloane: Elev, Sumă, Zi facturare, Următoarea factură, Status, Acțiuni
  - Buton „Adaugă abonament" → modal cu student selector + preț + billing_day
  - Buton „Rulează facturare" (admin only) → confirmație count + POST run-billing
  - Badge status (active=green, paused=yellow, cancelled=gray)

## Out of scope

- Stripe Subscription (real payment charging) — pentru viitor (US-PAY-06)
- Retry logic la plată eșuată
- Email trimitere reală (stub notification log)

## User stories

- US-PAY-10: Bulk invoice generation
- US-PAY-06: Abonamente recurente (parte infrastructure, fără Stripe)

## Acceptance criteria

- [ ] Tabel `subscriptions` creat, migrare 0013 commitată
- [ ] POST /api/subscriptions → 201 cu `next_billing_date` calculat corect
- [ ] GET /api/subscriptions → lista tenant-scoped
- [ ] POST /api/subscriptions/run-billing → creează facturi pentru abonamente scadente
- [ ] `next_billing_date` actualizat la luna viitoare după run
- [ ] Tab „Abonamente" vizibil în /app/invoices
- [ ] Modal „Adaugă abonament" funcțional (save + apare în tabel)
- [ ] Buton „Rulează facturare" returnează count facturat

## Files

### New
- `server/db/schema/subscriptions.ts`
- `drizzle/0013_fin603_subscriptions.sql`

### Modified
- `server/db/schema/index.ts` — export subscriptions
- `server/routes/invoices.ts` — add subscription routes + run-billing
- `server/index.ts` — mount subscription sub-routes (sau extinde /api/invoices)
- `src/pages/InvoicesPage.tsx` — add tab Abonamente + modal + run billing button
- `src/components/invoices/SubscriptionTable.tsx` (nou)
- `src/components/invoices/AddSubscriptionModal.tsx` (nou)

## Tests

1. [blocant] Migration gate: 0013 commitată, db:reset+db:seed succed
2. [blocant] POST /api/subscriptions `{ studentId, amountCents: 20000, billingDay: 1, currency: "RON" }` → 201
3. [blocant] next_billing_date calculat: dacă billing_day = 1 și azi e 30 mai → 2026-06-01
4. [blocant] POST /api/subscriptions/run-billing → subscriptions scadente → facturi create (`invoicesCreated` array non-empty)
5. [blocant] next_billing_date avansat cu 1 lună după run
6. [blocant] Abonament paused nu e procesat de run-billing
7. [normal] GET /api/subscriptions → tenant-scoped
8. [normal] Tab „Abonamente" randează în InvoicesPage fără crash

## DoD

Standard — toate criteriile [blocant] verzi, reviewer APPROVED, integration-architect CONNECTED.
