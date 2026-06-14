---
id: LEDGER-002
title: "Postări automate în general ledger din payments + UI balanță de verificare"
milestone: FIN
phase: "17"
status: pending
depends_on: [LEDGER-001]
spec: backlog/specs/LEDGER-002.md
branch: feat/FIN-ledger
---

## Goal

Extinde general ledger-ul (LEDGER-001) cu:
1. **Postări automate** din plăți (payments) — când o plată e înregistrată, se creează
   automat o înregistrare contabilă double-entry: Debit 531 (Numerar/Bancă) / Credit 711 (Venituri).
2. **Endpoint POST /api/fin/ledger/post** — acceptă orice tranzacție financiară
   (source_type: PAY/BILL/SPEND/MANUAL) și creează înregistrarea echilibrată în jurnal.
3. **UI /app/fin/ledger** — pagina de balanță de verificare cu filtre pe dată și clasă
   de cont, totaluri debit/credit, verificare echilibru (debit == credit).

Reuse: `finLedgerAccounts`, `finJournalEntries`, `finJournalLines` (LEDGER-001).
Nu crea tabele noi — extension via rute noi + componentă UI.
GAP-ANALYSIS G1: acesta este factorul diferențiator față de concurență — un ledger real.

---

## User stories

- Ca **contabil**, vreau ca fiecare plată înregistrată să genereze automat o înregistrare
  contabilă double-entry, pentru că altfel trebuie să le introduc manual — ineficient.
- Ca **director financiar**, vreau să văd balanța de verificare (sum debit vs credit per cont)
  filtrată pe perioadă, pentru că pot verifica că contabilitatea e echilibrată fără un
  software extern.
- Ca **sistem**, vreau să pot posta orice tip de sursă financiară (PAY/BILL/SPEND) prin
  un singur endpoint, pentru că viitoarele module BILL și SPEND îl vor apela direct.

---

## Acceptance criteria

- [ ] AC1: `POST /api/fin/ledger/post` — creează o înregistrare contabilă double-entry.
  Payload: `{ sourceType: "PAY"|"BILL"|"SPEND"|"MANUAL", sourceId: UUID|null, entryDate: ISO,
  description: string, lines: [{ accountCode, debitCents, creditCents, currency?, description? }] }`.
  Validare: `sum(debitCents) === sum(creditCents)` (altfel 400 "unbalanced entry").
  Returnează `{ entryId: UUID, lineCount: number }`. Auth required.

- [ ] AC2: `POST /api/fin/ledger/post-payment/:paymentId` — quick-post pentru o plată existentă.
  Lookup payment (amount_cents, currency, paid_at, student name), creează entry PAY:
  - Debit 531 "Numerar și echivalente de numerar" `amount_cents`
  - Credit 711 "Venituri din prestarea serviciilor" `amount_cents`
  Idempotent: dacă există deja un entry cu sourceType=PAY și sourceId=paymentId, returnează
  `{ entryId: UUID, existing: true }` fără a crea duplicat.

- [ ] AC3: `GET /api/fin/ledger/trial-balance` (îmbunătățit față de LEDGER-001) — returnează:
  `{ accounts: [{code, name, class, debitTotal, creditTotal, netBalance}], grandDebit, grandCredit,
  isBalanced: boolean, periodFrom, periodTo }`. isBalanced = grandDebit === grandCredit.
  Filtru: `from`, `to`, `class`. Ordonat: code ASC.

- [ ] AC4: `GET /api/fin/ledger/entries?page=1&limit=50` — listare înregistrări jurnal cu paginare.
  Filtre: `sourceType`, `from`, `to`. Returnează `{ data: JournalEntry[], total, page }`.

- [ ] AC5: `FinLedgerPage` la `/app/fin/ledger` — pagina trial balance:
  - Header cu perioadă (selector from/to), buton Refresh.
  - Banner verde/roșu: "Balanță ECHILIBRATĂ" / "NEECHILIBRATĂ — diferență: X MDL".
  - Tabel: Cont | Denumire | Clasa | Total Debit | Total Credit | Sold Net.
  - Footer: totaluri Grand Debit / Grand Credit.
  - Filtru pe clasă (A/P/V/C/B/Toate).
  - Buton "Postează plată" → dialog cu payment ID → POST /api/fin/ledger/post-payment/:id.
  - Design system tokens, dark mode, WCAG AA. Niciun hex hardcodat.

- [ ] AC6: Ruta `/app/fin/ledger` montată în `App.tsx`. Routele server montate în `app.ts`.

---

## Files

### New
- `src/pages/fin/FinLedgerPage.tsx` — trial balance UI
- `src/lib/api/finLedger.ts` — API client for LEDGER
- `src/__tests__/fin/fin-ledger-002.test.ts`

### Modified
- `server/routes/finLedger.ts` — add POST /post, POST /post-payment/:id, GET /entries
- `server/app.ts` — already mounted; no change needed (routes extend existing handler)
- `src/App.tsx` — add route `/app/fin/ledger`

---

## Tests

- **T-LEDGER-002-1** [blocant] Given balanced lines (debit==credit), When POST /api/fin/ledger/post, Then 201 cu entryId
- **T-LEDGER-002-2** [blocant] Given unbalanced lines (debit≠credit), When POST /api/fin/ledger/post, Then 400 "unbalanced entry"
- **T-LEDGER-002-3** [blocant] Given FinLedgerPage render cu mock API, When montare, Then nu crează crash + afișează tabel + banner echilibru
- **T-LEDGER-002-4** [normal] Given debit==credit în trial balance, When isBalanced check, Then true
- **T-LEDGER-002-5** [normal] API client finLedger exportă funcțiile așteptate

---

## Definition of Done

- [ ] AC1–AC6 implementate
- [ ] T1–T3 [blocante] trec
- [ ] Build + typecheck + lint verde
- [ ] Nicio migrare nouă (nu adăugăm tabele — extindem rutele LEDGER-001)
- [ ] Route mount confirmat (deja la /api/fin/ledger)
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
