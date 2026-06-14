---
id: CASH-001
title: "Schema fin_bank_transactions + fin_payments + fin_payment_allocations + migrare 0116 + seed"
milestone: FIN
phase: "9"
status: pending
depends_on: [CAPTURE-003]
spec: backlog/specs/CASH-001.md
---

## Goal

Creează fundația de date pentru modulul CASH (Încasări): tabelele `fin_bank_transactions`,
`fin_payments` și `fin_payment_allocations` în `server/db/schema/finBilling.ts` (sau extinde
fișierul existent dacă există). Migrarea `0116_fin_cash.sql`. Seed cu 3 tranzacții bancare
demo + 2 plăți parțial alocate.

Refolosește `finBilling.ts` (unde stau `fin_invoices`, `fin_payments` per FIN-CORE §1.9).
Refolosește `fin_parties` pentru `party_id`. NU recrea tabele care există — verifică mai întâi.

---

## User stories

- Ca **contabil**, vreau ca tranzacțiile bancare importate să fie stocate cu status reconciliat/nereconsiliat, pentru că altfel nu știu ce e nealocat.
- Ca **CFO**, vreau să pot aloca o plată primită la una sau mai multe facturi, pentru că un client poate plăti parțial sau mai multe facturi deodată.
- Ca **contabil**, vreau ca creditul nealocat (surplus plată − Σ alocări) să fie calculat automat, nu manual, pentru că greșelile de calcul creează probleme fiscale.
- Ca **auditor**, vreau ca fiecare alocare să aibă `payment_id` + `invoice_id` + `amount_cents`, pentru că trebuie să pot trasa exact ce factură a fost acoperită de ce plată.

---

## Acceptance criteria

- [ ] `fin_bank_transactions` creat cu coloanele: `id`, `tenant_id`, `account_label`, `tx_date`, `amount_cents`, `currency`, `reference`, `counterparty`, `direction enum(in|out)`, `import_batch_id`, `match_status enum(unmatched|matched|duplicate|ignored)`, `created_at`, `updated_at`
- [ ] `fin_payments` creat cu coloanele: `id`, `tenant_id`, `party_id → fin_parties.id`, `received_date`, `amount_cents`, `currency`, `account_label`, `allocated_cents default 0`, `bank_tx_id → fin_bank_transactions.id nullable`, `created_at`, `updated_at`
- [ ] `fin_payment_allocations` creat: `id`, `tenant_id`, `payment_id → fin_payments.id`, `invoice_id → fin_invoices.id`, `amount_cents`, `created_at`
- [ ] Migrare `drizzle/0116_fin_cash.sql` commitată cu breakpoint-uri corecte între statement-uri
- [ ] `npm run db:reset && npm run db:seed` trec fără erori
- [ ] Seed inserează minim 3 `fin_bank_transactions` (2 `in`, 1 `out`) + 2 `fin_payments` + 1 `fin_payment_allocation`
- [ ] Index pe `tenant_id` pe toate 3 tabelele
- [ ] FK-urile sunt declarate în schema Drizzle (nu doar în SQL)
- [ ] Export `* from "./finBilling"` (sau fișierul corect) existent în `server/db/schema/index.ts`
- [ ] Tipurile TypeScript `FinBankTransaction`, `FinPayment`, `FinPaymentAllocation` exportate
- [ ] Schema-drift test (`src/__tests__/schema-drift.test.ts`) rămâne verde

---

## Files to create / modify

**Create:**
- `drizzle/0116_fin_cash.sql` — migrare cu 3 CREATE TABLE + indecși + breakpoint-uri

**Modify:**
- `server/db/schema/finBilling.ts` — adaugă cele 3 tabele noi (sau creează `finCash.ts` și exportă din `index.ts`)
- `server/db/schema/index.ts` — asigură `export * from "./finBilling"` (sau `./finCash`)
- `drizzle/meta/_journal.json` — append entry pentru 0116
- `server/db/seed.ts` — adaugă seed pentru CASH

**Test:**
- `server/__tests__/finCash.schema.test.ts` — validare structură tabele

---

## Tests

- **T-CASH-001-1** [blocant] Given o bază de date curată (db:reset), When rulăm `npm run db:migrate && npm run db:seed`, Then migrarea 0116 se aplică fără erori și seed-ul inserează 3 tranzacții + 2 plăți + 1 alocare.
- **T-CASH-001-2** [blocant] Given schema `finBilling.ts` cu tabelul `fin_payments`, When rulăm `db.query.finPayments.findMany()`, Then răspunsul e un Array (nu `.rows`) — portabilitate PGlite↔Postgres.
- **T-CASH-001-3** [blocant] Given `_journal.json` actualizat cu prefix 0116, When verificăm că nu există alt idx 116 în jurnal, Then nu există duplicat de prefix — fără coliziuni.
- **T-CASH-001-4** [blocant] Given `server/db/schema/index.ts`, When verificăm că exportă tabelele cash, Then `db.query.finBankTransactions` nu e undefined la runtime.
- **T-CASH-001-5** [normal] Given o plată de 1000 MDL alocată parțial (600 MDL pe factură A), When calculăm credit nealocat, Then `payment.amount_cents - payment.allocated_cents = 400 MDL`.
- **T-CASH-001-6** [normal] Given seed cu tranzacții din tenant A, When query cu tenant B user, Then rezultat empty (tenant isolation).

---

## Definition of Done

- Acceptance criteria bifate
- Scenariile blocante T-CASH-001-1..4 verzi
- `npm run db:reset && npm run db:seed` verzi
- Migration prefix 0116 unic față de origin/main (max 0115 pe branch, 0114 pe main)
- Schema index.ts exportă noile tabele
- Raport persona salvat
- Commit pe `feat/FIN-cash` (branch nou din main)
