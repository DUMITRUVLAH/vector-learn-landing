---
id: CASH-004
title: "UI încasări: registru plăți, donut alocări, link-uri de plată rapide"
milestone: FIN
phase: "9"
status: pending
depends_on: [CASH-003, CORE-004]
spec: backlog/specs/CASH-004.md
branch: feat/FIN-cash
---

## Goal

Construiește interfața completă a modulului de încasări: pagina registru plăți cu filtrare și
sortare, widget donut alocări (alocat vs. nealocat pe fiecare cont), și link-uri de acțiune
rapidă (alocă, ignore, creează plată) integrate cu coada de tranzacții nepotrivite.

Toate componentele respectă design-system Vector 365 (tokens, dark/light, WCAG AA).

---

## User stories

- Ca **contabil**, vreau să văd toate plățile primite cu suma rămasă nealocată, pentru că altfel trebuie să calculez manual în Excel.
- Ca **contabil**, vreau un donut care arată rapid cât din total e alocat vs. nealocat, pentru că managerii întreabă zilnic „câți bani avem disponibili?".
- Ca **director**, vreau să pot filtra plățile după perioadă și cont bancar, pentru că am 4 conturi și le raportez separat.
- Ca **contabil**, vreau să aloc o tranzacție nepotrivită direct din coada de nepotrivite fără să schimb pagina, pentru că flow-ul de reconciliere trebuie să fie rapid.

---

## Acceptance criteria

- [ ] Pagina `/app/fin/cash` (CashPage.tsx extinsă sau nouă) afișează:
  - Tabel registru plăți: coloane `Data`, `Client`, `Sumă`, `Alocat`, `Nealocat`, `Acțiuni`
  - Filtrare după: perioadă (date picker), cont bancar (select), status alocare (all/partial/full)
  - Sortare pe coloanele `Data` și `Sumă`
  - Paginare (≤ 50 rânduri/pagină)
- [ ] Widget donut (Recharts PieChart) cu sectoarele `Alocat` / `Nealocat` + totaluri MDL sub grafic
- [ ] Tab „Nepotrivite" — coada `unmatched` din CASH-003 cu butoane `Creează plată` + `Ignoră` per rând
- [ ] Tab „Import" — buton + link spre `/app/fin/cash/import` (existent din CASH-002)
- [ ] Modal alocare: la click pe `Alocă` dintr-un rând de plată, se deschide un dialog cu:
  - Câmp invoice_id (input text UUID sau lookup viitor)
  - Câmp amount (max = unallocated_cents)
  - Buton Salvează care apelează `POST /api/fin/cash/payments/:id/allocate`
- [ ] Design system: tokens semantice, zero hex hardcodat, dark/light mode, touch targets ≥ 44px
- [ ] Axe: 0 violații critical+serious
- [ ] Renders without crash (smoke test)

---

## Files to create / modify

**Create:**
- `src/pages/fin/PaymentsPage.tsx` — registru plăți cu filtre, donut, tab nepotrivite
- `src/components/fin/AllocationModal.tsx` — dialog alocare plată↔factură
- `src/components/fin/PaymentsDonut.tsx` — donut Recharts alocat/nealocat
- `src/__tests__/fin/payments-page.test.tsx` — smoke test + interacțiuni principale

**Modify:**
- `src/App.tsx` — adaugă ruta `/app/fin/payments` → `PaymentsPage`
- `src/lib/api/finCashAllocations.ts` — adaugă hook `usePayments` + `useCreditSummary`

---

## Tests

- **T-CASH-004-1** [blocant] Given pagina `/app/fin/payments` renderizată cu date mock, When componenta montată, Then se afișează tabelul + donut fără crash (renders without crash).
- **T-CASH-004-2** [blocant] Given AllocationModal deschis cu `unallocated_cents: 500`, When userul introduce `amount = 600` și apasă Salvează, Then butonul rămâne disabled / eroare vizibilă (validare client-side).
- **T-CASH-004-3** [normal] Given tab „Nepotrivite" cu 2 tranzacții, When userul apasă „Creează plată" pe prima, Then `POST /api/fin/cash/transactions/:id/create-payment` este apelat.
- **T-CASH-004-4** [normal] Given filtrare după perioadă setată, When lista se actualizează, Then `GET /api/fin/cash/payments?from=...&to=...` este apelat cu parametrii corecți.

---

## Definition of Done

- Acceptance criteria bifate
- Scenariile blocante T-CASH-004-1..2 verzi
- Ruta `/app/fin/payments` funcțională
- Design tokens, light+dark, WCAG AA, axe 0 violații
- Raport persona-manager + persona-student salvat
- Commit pe `feat/FIN-cash`
- PR #162 updatat cu CASH-003+004
