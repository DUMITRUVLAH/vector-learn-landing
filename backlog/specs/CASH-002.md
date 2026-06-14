---
id: CASH-002
title: "Import extras CSV/MT940 + motor reconciliere sumă+dată+referință, determinist+scor"
milestone: FIN
phase: "9"
status: pending
depends_on: [CASH-001]
spec: backlog/specs/CASH-002.md
---

## Goal

Implementează fluxul de import extras bancar (CSV sau MT940) și motorul de reconciliere automată
care potrivește tranzacțiile importate cu plățile și facturile existente.

Algoritmul de reconciliere este **determinist** (nu AI): potrivire exactă sumă+dată±3zile+referință
= `matched`; potrivire parțială (doar sumă sau doar ref) = scor 0.6–0.8; nepotrivit = `unmatched`.
AI nu intervine în reconciliere (FIN-CORE regula #4). Coada „nepotrivite" rămâne pentru alocare manuală.

---

## User stories

- Ca **contabil**, vreau să încarc un CSV sau MT940 de la bancă, pentru că importul manual rând cu rând nu e scalabil.
- Ca **contabil**, vreau ca motorul să potrivească automat tranzacțiile cu plățile/facturile mele, pentru că reconcilierea manuală durează ore.
- Ca **contabil**, vreau să văd coada de tranzacții nepotrivite și să le aloc manual, pentru că nu tot ce importez are o factură corespunzătoare.
- Ca **director**, vreau ca motorul să nu greșească (fals pozitive), pentru că o alocare greșită creează probleme fiscale — prefer să văd mai multe manuale decât automate incorecte.

---

## Acceptance criteria

- [ ] `POST /api/fin/cash/import` acceptă un fișier `multipart/form-data` (CSV sau MT940)
- [ ] Parser CSV: coloane `date,amount,currency,reference,counterparty,direction` (header auto-detectat)
- [ ] Parser MT940: extrage câmpurile `:61:` (tranzacție) și `:86:` (narativ)
- [ ] Import creează rânduri în `fin_bank_transactions` cu `import_batch_id` comun per upload
- [ ] Duplicate detection: tranzacție cu același `(account_label, tx_date, amount_cents, reference)` → `match_status = duplicate`
- [ ] Motor reconciliere rulează automat după import și actualizează `match_status` per tranzacție
- [ ] Reguli matching (în ordine, primul match câștigă):
  1. Sumă exactă + dată ±3 zile + referință substring → `matched`, scor 1.0
  2. Sumă exactă + dată ±7 zile → `matched`, scor 0.85
  3. Referință substring (fără sumă) → propunere candidat, scor 0.6, status rămâne `unmatched`
- [ ] `GET /api/fin/cash/transactions` returnează lista paginată cu `match_status` și scor
- [ ] `GET /api/fin/cash/unmatched` returnează tranzacțiile cu `match_status = unmatched`
- [ ] `POST /api/fin/cash/transactions/:id/match` permite alocare manuală la o plată/factură
- [ ] Pagina `/app/fin/cash` afișează: total importate, număr matched/unmatched, tabel tranzacții cu badge status
- [ ] Pagina `/app/fin/cash/import` — drag&drop upload CSV/MT940 cu preview primele 5 rânduri
- [ ] Tenant isolation pe toate rutele

---

## Files to create / modify

**Create:**
- `server/lib/fin/csvParser.ts` — parser CSV extras bancar
- `server/lib/fin/mt940Parser.ts` — parser MT940 (format SWIFT)
- `server/lib/fin/reconcileEngine.ts` — motor reconciliere determinist
- `server/routes/finCash.ts` — rutele `/api/fin/cash/*`
- `src/pages/fin/CashPage.tsx` — overview tranzacții
- `src/pages/fin/CashImportPage.tsx` — upload + preview
- `src/lib/api/finCash.ts` — hooks React Query
- `server/__tests__/finCash.reconcile.test.ts` — unit test motor reconciliere
- `src/__tests__/fin/cash-import.test.tsx` — test UI import

**Modify:**
- `server/app.ts` — montează `finCashRoutes` la `/api/fin/cash`
- `src/App.tsx` — adaugă rutele `/app/fin/cash` + `/app/fin/cash/import`

---

## Tests

- **T-CASH-002-1** [blocant] Given un CSV valid cu 5 rânduri, When POST /api/fin/cash/import cu auth, Then răspuns 200 cu `{ imported: 5, duplicates: 0, matched: N }` și 5 rânduri în `fin_bank_transactions`.
- **T-CASH-002-2** [blocant] Given o tranzacție cu aceeași (account_label, tx_date, amount_cents, reference) importată de două ori, When POST /api/fin/cash/import a doua oară, Then a doua tranzacție primește `match_status = duplicate` (nu se creează duplicat real).
- **T-CASH-002-3** [blocant] Given o tranzacție cu sumă exactă + dată ±2 zile față de o factură existentă, When motorul rulează, Then tranzacția primește `match_status = matched` și scor ≥ 0.85.
- **T-CASH-002-4** [blocant] Given server pornit + login reușit, When GET /api/fin/cash/transactions, Then răspuns 200 cu array (nu `.rows`) — portabilitate DB.
- **T-CASH-002-5** [blocant] Given un fișier MT940 minimal cu un bloc :61:/:86:, When parserul MT940 îl procesează, Then extrage corect `tx_date`, `amount_cents`, `direction`, `reference`.
- **T-CASH-002-6** [normal] Given pagina `/app/fin/cash/import`, When drag&drop un CSV, Then se afișează preview cu primele 5 rânduri în tabel înainte de confirmare.

---

## Definition of Done

- Acceptance criteria bifate
- Scenariile blocante T-CASH-002-1..5 verzi
- Ruta `finCashRoutes` montată în `server/app.ts`
- Design tokens, light+dark, WCAG AA
- Raport persona-manager + persona-student salvat
- Commit pe `feat/FIN-cash`
