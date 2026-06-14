---
id: SPEND-003
title: "UI Cheltuieli — /app/fin/expenses: listă, categorii, top furnizori, carduri"
milestone: FIN
phase: spend
depends_on: [SPEND-001, SPEND-002]
branch: feat/FIN-spend
priority: P0
status: pending
spec_version: 1
---

## Goal

Construiește pagina `/app/fin/expenses` — interfața principală de gestionare cheltuieli FinDesk.
Conține: filtru multicriteria, tabel paginat cu rânduri acționabile, 4 carduri KPI (total cheltuieli,
TVA deductibil, cheltuieli în așteptare, rată aprobare), grafic top furnizori (bar horizontal), și
dialog creare/editare cheltuială cu câmpul `vatDeductible` obligatoriu.

Acesta este ultimul item al fazei SPEND. Dupa commit, se deschide PR #160 (actualul PR al fazei).

## User stories

- **Ca** Director, **vreau să** văd lista tuturor cheltuielilor filtrate pe categorie/status/dată,
  **pentru că** trebuie să monitorizez fluxul de numerar lunar.
- **Ca** Contabil, **vreau să** creez o cheltuială cu TVA deductibil marcat explicit,
  **pentru că** reconcilierea fiscală necesită această distincție.
- **Ca** Director, **vreau să** văd top 5 furnizori după cheltuieli totale,
  **pentru că** identific rapid dependențele mari față de furnizori.
- **Ca** Manager, **vreau să** aprob cheltuielile draft cu un singur click,
  **pentru că** fluxul de aprobare trebuie să fie rapid pentru a nu bloca plățile.

## Acceptance criteria

1. Pagina `/app/fin/expenses` se randează fără crash în light și dark mode.
2. 4 KPI cards: "Total cheltuieli (luna curentă)", "TVA deductibil", "În așteptare (draft)", "Rată aprobare (%)".
3. Tabel cu coloane: Data, Furnizor, Categorie, Sumă (MDL), TVA, Status, Acțiuni.
4. Filtru: dropdown Categorie, dropdown Status, date range (De la / Până la), input Furnizor.
5. Paginare: 20 rânduri / pagină; buton Next/Prev funcțional.
6. Grafic "Top 5 furnizori" (bar horizontal, Recharts) cu sume totale.
7. Dialog "Adaugă cheltuială" cu toate câmpurile din `createExpenseSchema` (SPEND-002):
   - `vatDeductible` este required — buton radio "Deductibil / Nedeductibil" (nu opțional).
   - Eroare explicită dacă lipsește.
8. Buton "Aprobă" în tabel (rol director/admin) → `POST /api/fin/expenses/:id/approve`.
9. Buton "Respinge" → `DELETE /api/fin/expenses/:id`.
10. Token-uri Vector 365 — ZERO hex hardcodat. WCAG AA contrast. Touch targets ≥ 44px.
11. Rută înregistrată în `App.tsx` sub `<Route path="/app/fin/expenses" element={<FinExpensesPage />} />`.
12. Export CSV buton — descarcă lista curentă filtrată ca expenses.csv.

## Files

### New files
- `src/pages/app/FinExpensesPage.tsx` — pagina principală
- `src/components/fin/ExpenseKpiCards.tsx` — 4 carduri KPI
- `src/components/fin/ExpenseTable.tsx` — tabel cu filtre + paginare
- `src/components/fin/TopVendorsChart.tsx` — grafic Recharts bar horizontal
- `src/components/fin/ExpenseFormDialog.tsx` — dialog creare/editare
- `src/__tests__/fin/FinExpensesPage.test.tsx` — smoke tests

### Modified files
- `src/App.tsx` — adaugă ruta `/app/fin/expenses`
- `src/components/layout/Sidebar.tsx` sau echivalent — adaugă link "Cheltuieli" sub secțiunea Finanțe

## Tests

- **T-SPEND-003-1** [blocant] Given utilizatorul e autentificat, When accesează `/app/fin/expenses`, Then pagina se randează fără crash, cu tabelul și cardurile KPI vizibile.
- **T-SPEND-003-2** [blocant] Given există cheltuieli în DB, When pagina se încarcă, Then `GET /api/fin/expenses` returnează 200 cu `data.items` array.
- **T-SPEND-003-3** [blocant] Given utilizatorul deschide dialogul "Adaugă cheltuială" fără a selecta vatDeductible, When apasă Save, Then apare eroare de validare "vat_deductible_required".
- **T-SPEND-003-4** [normal] Given tabelul afișează cheltuieli, When utilizatorul selectează filtru Categorie=rent, Then lista se filtrează corespunzător.
- **T-SPEND-003-5** [normal] Given utilizatorul are rol director, When apasă "Aprobă" pe o cheltuială draft, Then statusul se schimbă în "approved".
- **T-SPEND-003-6** [normal] Given graficul TopVendors există, When se randează, Then afișează cel puțin un bar pentru fiecare furnizor distinct.

## Definition of Done

- Build + typecheck + lint verzi pe branch `feat/FIN-spend`.
- Smoke test T-SPEND-003-1 și T-SPEND-003-2 trec.
- Reviewer APPROVED.
- Pagina vizibilă la `/app/fin/expenses` cu date reale din API.
- PR #160 actualizat cu commit `feat(SPEND-003): ...`.
