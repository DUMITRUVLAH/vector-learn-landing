---
id: LEDGER-001
title: "General Ledger — schema fin_ledger_accounts + fin_journal_entries + fin_journal_lines + migration + seed"
milestone: FIN
phase: "17"
status: pending
depends_on: []
spec: backlog/specs/LEDGER-001.md
branch: feat/FIN-ledger
---

## Goal

Build the double-entry general ledger foundation for FinDesk — the #1 competitive gap vs. competitors
(GAP-ANALYSIS G1). Create three tables: chart of accounts, journal entries (header), and journal lines
(debit/credit pairs). Seed with the standard Moldovan chart of accounts (accounts 100–900 range).
Add basic routes to list accounts and query the trial balance (sum of debits vs credits per account).

Reuse `accountingMappings.ts` codes as the link between existing payment exports and the new ledger.
This module enables real double-entry accounting that competitors lack entirely.

---

## User stories

- Ca **contabil**, vreau să văd planul de conturi al firmei (active, pasive, venituri, cheltuieli)
  organizat pe clase, pentru că pot astfel face rapoarte de bilanț și cont de profit și pierdere.
- Ca **director financiar**, vreau să văd balanța de verificare (suma debite vs credite per cont),
  pentru că pot verifica că contabilitatea e echilibrată fără a deschide un software extern.
- Ca **sistem**, vreau ca fiecare plată/factură/cheltuială să genereze automat o înregistrare contabilă
  în jurnal, pentru că aceasta este cerința IFRS/SNC pentru evidența financiară.

---

## Acceptance criteria

- [ ] AC1: `fin_ledger_accounts` — tabel plan de conturi cu: `id UUID PK`, `tenant_id UUID FK`,
  `code VARCHAR(20)`, `name TEXT`, `account_class VARCHAR(10)` (A=Activ, P=Pasiv, V=Venituri, C=Cheltuieli,
  B=Bifuncțional), `is_system BOOLEAN DEFAULT true`, `parent_code VARCHAR(20)`, `is_active BOOLEAN DEFAULT true`,
  `created_at`, `updated_at`. Index unic pe `(tenant_id, code)`.

- [ ] AC2: `fin_journal_entries` — antet jurnal contabil: `id UUID PK`, `tenant_id UUID FK`,
  `entry_date DATE NOT NULL`, `description TEXT`, `reference VARCHAR(100)`,
  `source_type VARCHAR(30)` (BILL/SPEND/PAY/ASSET/MANUAL), `source_id UUID`,
  `status VARCHAR(20) DEFAULT 'posted'`, `created_by UUID FK users`, `created_at`, `updated_at`.
  Index pe `(tenant_id, entry_date)` și `(tenant_id, source_type, source_id)`.

- [ ] AC3: `fin_journal_lines` — linii debit/credit: `id UUID PK`, `entry_id UUID FK fin_journal_entries`,
  `account_code VARCHAR(20)`, `debit_cents BIGINT DEFAULT 0`, `credit_cents BIGINT DEFAULT 0`,
  `currency VARCHAR(3) DEFAULT 'MDL'`, `description TEXT`. Constraint CHECK că debit=0 OR credit=0
  (nu ambele non-zero pe aceeași linie). Index pe `(entry_id)` și `(account_code)`.

- [ ] AC4: Migration `0124_fin_ledger.sql` — creează cele 3 tabele în ordinea corectă FK.
  Statement-breakpoints între instrucțiuni.

- [ ] AC5: Seed minimal — funcție `seedLedgerAccounts(tenantId)` în `server/lib/finLedgerSeed.ts`
  care inserează planul de conturi standard Moldova (SNC) pentru un tenant. Clase: 1xx Active pe termen
  lung, 2xx Active pe termen scurt, 3xx Stocuri, 4xx Creanțe, 5xx Numerar, 6xx Capitaluri proprii,
  7xx Datorii, 8xx Venituri, 9xx Cheltuieli. Minim 12 conturi reprezentative (câte 1-2 per clasă).
  Funcție idempotentă (skip dacă există deja).

- [ ] AC6: `GET /api/fin/ledger/accounts` — listează conturile pentru tenant (cu filtru `class` și `active`).
  `GET /api/fin/ledger/trial-balance?from=YYYY-MM-DD&to=YYYY-MM-DD` — returnează suma debit/credit per
  cont în intervalul dat, ordonat după code. Montat în `server/app.ts`.

- [ ] AC7: Schema exports în `server/db/schema/index.ts`. Zero `any`. Tenant isolation.

---

## Files to create / modify

**Create:**
- `server/db/schema/finLedger.ts`
- `server/lib/finLedgerSeed.ts`
- `server/routes/finLedger.ts`
- `drizzle/0124_fin_ledger.sql`
- `src/__tests__/fin/fin-ledger.test.ts`

**Modify:**
- `server/db/schema/index.ts` — add `export * from "./finLedger";`
- `server/app.ts` — mount `finLedgerRoutes` at `/api/fin/ledger`
- `drizzle/meta/_journal.json` — append idx 124

---

## Tests

- **T-LEDGER-001-1** `[blocant]` Given schema finLedger exportat, When import finLedgerAccounts, Then tabelul e definit cu coloanele corecte.
- **T-LEDGER-001-2** `[blocant]` Given seedLedgerAccounts cu 12+ conturi, When listezi pe clasa A, Then returnezi conturi clasa A.
- **T-LEDGER-001-3** `[blocant]` Given o linie jurnal cu debit>0 și credit>0, When validezi, Then e invalidă (debit XOR credit).
- **T-LEDGER-001-4** `[blocant]` finLedgerRoutes e exportat din routes/finLedger.ts.
- **T-LEDGER-001-5** [normal] trial balance: suma debit = suma credit pentru un set de înregistrări echilibrate.

---

## Definition of Done

- [ ] AC1–AC7 implementate
- [ ] T-LEDGER-001-1..4 trec (blocante)
- [ ] Migration 0124 cu statement-breakpoints + _journal.json actualizat
- [ ] Export în schema/index.ts + route montat în app.ts
- [ ] Build + typecheck verzi pe fișierele noi
