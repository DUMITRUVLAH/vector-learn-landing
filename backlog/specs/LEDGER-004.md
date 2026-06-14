---
id: LEDGER-004
title: "UI registru general — jurnal, carte mare per cont, balanță completă + navigare LEDGER"
milestone: FIN
phase: "17"
status: pending
depends_on: [LEDGER-002, CORE-004]
spec: backlog/specs/LEDGER-004.md
branch: feat/FIN-ledger
---

## Goal

Construiește UI-ul complet al General Ledger-ului, extins față de simpla balanță de verificare
din LEDGER-002:

1. **Jurnal contabil (`/app/fin/ledger/journal`)** — listare paginată a tuturor `fin_journal_entries`
   cu detalii pe linii (debit/credit per cont), filtre pe dată / sourceType, export CSV.
2. **Carte mare per cont (`/app/fin/ledger/account/:code`)** — toate mișcările debit/credit ale
   unui cont specific, cu sold cumulativ running balance.
3. **Balanță de verificare completă (`/app/fin/ledger`)** — îmbunătățește pagina existentă
   (FinLedgerPage) cu: a) tab-uri (Balanță / Jurnal / Carte mare), b) drill-down per cont
   din balanță → carte mare, c) buton Reconciliere care apelează LEDGER-003 endpoint.

Refolosește: `finLedgerRoutes` (deja montat), `GET /api/fin/ledger/entries`,
`GET /api/fin/ledger/trial-balance`, API client `src/lib/api/finLedger.ts`.
Nu creează tabele sau migrări noi.

---

## User stories

- Ca **contabil**, vreau să văd jurnalul complet cu fiecare înregistrare și liniile ei debit/credit,
  pentru că pot astfel face verificarea zilnică fără a deschide un software extern.
- Ca **director financiar**, vreau să dau click pe un cont din balanță și să văd toate mișcările
  lui (carte mare), pentru că pot urmări evoluția oricărui cont specific.
- Ca **contabil**, vreau să export jurnalul ca CSV, pentru că trebuie să îl depun contabilului
  extern sau auditorului.

---

## Acceptance criteria

- [ ] AC1: **Jurnal** — `FinLedgerJournalTab` (sub-componentă în `FinLedgerPage`):
  - Tabel cu coloane: Data | Descriere | Ref | Sursă | Debit Total | Credit Total | Acțiuni.
  - Clic pe rând expandează liniile debit/credit (account code, sumă, descriere).
  - Filtre: dată from/to, sourceType (toate/PAY/BILL/SPEND/SALARY/ASSET/MANUAL).
  - Paginare 50/pagină.
  - Buton "Export CSV" — descarcă jurnalul filtrat ca `jurnal-<from>-<to>.csv`.
  - Apelează `GET /api/fin/ledger/entries`.

- [ ] AC2: Endpoint nou `GET /api/fin/ledger/account/:code` — carte mare per cont.
  Query params: `from`, `to`. Returnează:
  `{ account: FinLedgerAccount, lines: AccountLedgerLine[], openingBalance: number,
  closingBalance: number }` unde `AccountLedgerLine = { date, entryId, description, reference,
  debitCents, creditCents, runningBalance }`.
  Lines ordonate cronoloigc. Running balance cumulat de la beginning of time (sau de la `from`
  cu opening balance calculat).

- [ ] AC3: **Carte mare UI** — `FinLedgerCarteMare` (sub-componentă sau pagina separată `/app/fin/ledger/account/:code`):
  - Header: Cont NNN — Denumire | Sold inițial | Sold final.
  - Tabel: Data | Descriere | Ref | Debit | Credit | Sold Curent.
  - Link înapoi → balanța de verificare.
  - Design system tokens, dark mode, WCAG AA.

- [ ] AC4: **Tab-uri în FinLedgerPage** — înlocuiește single-view cu 3 tab-uri:
  - Tab "Balanță" — conținut actual (balanța de verificare cu echilibru banner).
  - Tab "Jurnal" — FinLedgerJournalTab.
  - Tab "Reconciliere" — buton "Rulează reconciliere" → apelează GET /reconcile → afișează
    `ok: true/false` + lista de gaps (unposted transactions).
  - Conturile din Balanță → click pe row → navighează la `/app/fin/ledger/account/:code`.

- [ ] AC5: Ruta `/app/fin/ledger/account/:code` montată în `App.tsx`.
  Ruta server `GET /api/fin/ledger/account/:code` montată (deja la `/api/fin/ledger`).

- [ ] AC6: Niciun hex hardcodat. Design system tokens în tot UI-ul. A11y: labels, aria, contrast.

---

## Files to create / modify

**Create:**
- `src/__tests__/fin/fin-ledger-004.test.ts`

**Modify:**
- `src/pages/fin/FinLedgerPage.tsx` — add tabs (Balanță/Jurnal/Reconciliere) + drill-down link
- `server/routes/finLedger.ts` — add GET /account/:code
- `src/lib/api/finLedger.ts` — add getAccountLedger(), runReconcile()
- `src/App.tsx` — add route /app/fin/ledger/account/:code

---

## Tests

- **T-LEDGER-004-1** `[blocant]` Given FinLedgerPage render cu mock API, When montare, Then nu crează crash + afișează 3 tab-uri.
- **T-LEDGER-004-2** `[blocant]` GET /api/fin/ledger/account/:code ruta exportată din finLedger.ts.
- **T-LEDGER-004-3** `[blocant]` Given entries cu running balance, When getAccountLedger, Then runningBalance e cumulat corect (debit creste activ, credit scade).
- **T-LEDGER-004-4** [normal] FinLedgerJournalTab afișează rândul expandat cu liniile de jurnal.
- **T-LEDGER-004-5** [normal] Export CSV buton apelează funcția de download cu rows corecte.

---

## Definition of Done

- [ ] AC1–AC6 implementate
- [ ] T1–T3 [blocante] trec
- [ ] Build + typecheck + lint verde
- [ ] Zero migrări noi (extension of existing routes/UI only)
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
