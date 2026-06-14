---
id: LEDGER-003
title: "GL auto-postings din salarii (payroll) + deprecieri active + reconciliere GL cu module"
milestone: FIN
phase: "17"
status: pending
depends_on: [LEDGER-002, PAY-002]
spec: backlog/specs/LEDGER-003.md
branch: feat/FIN-ledger
---

## Goal

Extinde General Ledger-ul (LEDGER-001/002) cu postări automate din două surse noi:

1. **Salarii (payroll)** — când un `payroll_entry` trece în status `paid`, se creează automat
   o înregistrare double-entry: Debit 811 (Cheltuieli cu retribuirea muncii) / Credit 531 (Numerar).
2. **Deprecieri active fixe** — un endpoint `POST /api/fin/ledger/post-depreciation` care acceptă
   valoarea amortizării lunare pentru un activ (id, sumă, dată) și creează entry ASSET:
   Debit 713 (Cheltuieli privind uzura) / Credit 124 (Amortizarea activelor nemateriale) sau
   121 (Amortizarea mijloacelor fixe) după tipul activului.
3. **Reconciliere GL cu module** — endpoint `GET /api/fin/ledger/reconcile` care compară sumele
   din jurnal (`fin_journal_entries`) cu sumele reale din tabelele sursă (payments, payroll_entries)
   și returnează `{ ok: boolean, gaps: ReconcileGap[] }`. Fiecare gap indică sourceType + sourceId
   nepostat.

Nu se creează tabele noi — totul refolosește `finJournalEntries` + `finJournalLines`.
ASSET schema nu există încă — deprecierile se postează cu ASSET sourceType și sourceId arbitrar
(assetRef string), suficient pentru audit trail.

---

## User stories

- Ca **contabil**, vreau ca salariile aprobate să genereze automat înregistrări contabile,
  pentru că altfel trebuie să le introduc manual — ineficient și predispus la erori.
- Ca **director financiar**, vreau un endpoint de reconciliere GL care să îmi spună ce tranzacții
  financiare nu au înregistrare contabilă, pentru că pot verifica că nimic nu a scăpat.
- Ca **contabil**, vreau să pot posta deprecierea lunară a unui activ fără să am un modul ASSET
  complet, pentru că deprecierea e o cerință contabilă imediată (SNC Moldova).

---

## Acceptance criteria

- [ ] AC1: `POST /api/fin/ledger/post-payroll/:payrollEntryId` — quick-post pentru o intrare
  de salarizare. Lookup `payroll_entries` (tenantId, totalCents, month). Creează entry MANUAL cu
  sourceType="SALARY" (adăugăm la enum JOURNAL_SOURCE_TYPES din finLedger.ts):
  - Debit 811 "Cheltuieli privind retribuirea muncii" `totalCents`
  - Credit 531 "Numerar și echivalente de numerar" `totalCents`
  Idempotent: dacă există deja entry cu sourceType="SALARY" și sourceId=payrollEntryId, returnează
  `{ entryId, existing: true }`.

- [ ] AC2: `POST /api/fin/ledger/post-depreciation` — postare depreciere activă.
  Payload: `{ assetRef: string, assetType: "fixed"|"intangible", periodMonth: "YYYY-MM",
  depreciationCents: number, description?: string }`.
  Creează entry ASSET:
  - Debit 713 "Cheltuieli privind uzura și deprecierea" `depreciationCents`
  - Credit 124 "Amortizarea activelor nemateriale" sau 121 "Amortizarea mijloacelor fixe" în funcție
    de assetType.
  Idempotent: un singur entry per (assetRef, periodMonth).

- [ ] AC3: `GET /api/fin/ledger/reconcile?from=YYYY-MM-DD&to=YYYY-MM-DD` — reconciliere.
  Compară:
  a) Payments: toate `payments` cu `paidAt` în interval vs fin_journal_entries cu sourceType="PAY".
  b) Payroll: toate `payroll_entries` cu status="paid" în interval vs fin_journal_entries cu sourceType="SALARY".
  Returnează `{ ok, grandDebit, grandCredit, isBalanced, postedPayments, unpostedPayments,
  postedPayroll, unpostedPayroll, gaps: [{ sourceType, sourceId, amountCents, date }] }`.

- [ ] AC4: Enum `JOURNAL_SOURCE_TYPES` extins cu "SALARY" în `server/db/schema/finLedger.ts`.
  Schema rămâne compatibilă (VARCHAR(30) poate stoca "SALARY"). Nu e nevoie de migrare nouă —
  coloana e VARCHAR, nu pgEnum. Schema TS se actualizează.

- [ ] AC5: Toate rutele noi montate în `finLedgerRoutes` deja montat la `/api/fin/ledger`.
  Zero new tables. Zero raw `.execute().rows`. Tenant isolation. Auth required.

---

## Files to create / modify

**Create:**
- `src/__tests__/fin/fin-ledger-003.test.ts`

**Modify:**
- `server/routes/finLedger.ts` — add POST /post-payroll/:id, POST /post-depreciation, GET /reconcile
- `server/db/schema/finLedger.ts` — extend JOURNAL_SOURCE_TYPES with "SALARY"

---

## Tests

- **T-LEDGER-003-1** `[blocant]` Given payrollEntry cu totalCents=200000, When POST /api/fin/ledger/post-payroll/:id, Then 201 cu entryId + sum(debit)==sum(credit)==200000.
- **T-LEDGER-003-2** `[blocant]` Given același payrollEntryId, When POST a doua oară, Then 200 cu existing=true (idempotent).
- **T-LEDGER-003-3** `[blocant]` Given assetRef="LAPTOP-001" + periodMonth="2026-01" + depreciationCents=50000, When POST /api/fin/ledger/post-depreciation, Then 201 cu double-entry echilibrată.
- **T-LEDGER-003-4** `[blocant]` Given SALARY adăugat la JOURNAL_SOURCE_TYPES, When import din finLedger schema, Then tipul include "SALARY".
- **T-LEDGER-003-5** [normal] GET /api/fin/ledger/reconcile returnează { ok, gaps } cu proprietăți corecte.

---

## Definition of Done

- [ ] AC1–AC5 implementate
- [ ] T1–T4 [blocante] trec
- [ ] Build + typecheck + lint verde
- [ ] Fără migrare nouă (schema VARCHAR tolerează "SALARY" fără ALTER TABLE)
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
