---
id: BUDGET-003
title: "Buget — grafice plan vs realizat, progress bars, alerte vizuale UI"
milestone: FIN
phase: "20"
status: pending
depends_on: [BUDGET-002, INSIGHT-002]
spec: backlog/specs/BUDGET-003.md
branch: feat/FIN-budget
---

## Goal

Îmbogățire UI BudgetPage cu vizualizări grafice (plan vs realizat per categorie, progress ring
pentru execuție globală, bare de alertă color-coded) și un panou de alerte active.
Refolosește datele deja disponibile din `GET /api/fin/budget/:id/report` (BUDGET-002).
Fără noi rute API — tot ce se adaugă e vizualizare frontend.

GAP-ANALYSIS G4 — "grafice, alerte depășire, UI bugetare".

---

## User stories

- Ca **director financiar**, vreau să văd un grafic bar cu bugetat vs realizat per categorie,
  pentru că citesc mai rapid cu vizualizare decât cu numere brute.
- Ca **contabil**, vreau ca liniile care depășesc 80% să fie evidențiate vizual în portocaliu
  și cele la 100%+ în roșu, pentru că trebuie să acționez imediat.
- Ca **director**, vreau un panou "Alerte active" care să listeze toate liniile în pericol
  din toate bugetele active, pentru că nu deschid fiecare buget manual.
- Ca **manager de departament**, vreau un "progress ring" cu procentul total de execuție a
  bugetului, pentru că este prima cifră pe care o raportez în ședința lunară.

---

## Acceptance criteria

- [ ] AC1: **Grafic bară "Plan vs Realizat"** în detaliul bugetului:
  - Bare duble per categorie: bara stângă = bugetat (bg-primary/20), bara dreaptă = realizat.
  - Bara de realizat se colorează: < 80% = `text-success` (verde), 80–99% = `text-warning`
    (portocaliu), ≥ 100% = `text-destructive` (roșu). Fără hex hardcodat.
  - Valorile sunt afișate deasupra fiecărei bare (format MDL).
  - Graficul este responsiv (CSS, nu SVG absolut) și funcționează pe mobile.

- [ ] AC2: **Progress ring** (SVG circular) pentru execuția globală a bugetului:
  - Calculat ca: sum(actualCents) / sum(budgetedCents) * 100.
  - Ring colorat după aceeași schemă ca AC1.
  - Afișat în header-ul paginii de detaliu buget, lângă titlul bugetului.
  - Accesibil: `role="progressbar"`, `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=100`.

- [ ] AC3: **Panou "Alerte active"** pe BudgetPage (lista de bugete):
  - Afișat în topul paginii dacă există cel puțin o alertă activă (linie ≥ 80%).
  - Listează: Buget | Categorie | % execuție | Status (warning/overrun).
  - Buton "Verifică alerte" pe fiecare buget activ apelează `POST /:id/check-alerts`
    și reîncarcă datele.
  - Dacă nu sunt alerte → panel ascuns (nu placeholder gol).

- [ ] AC4: **Color coding** în tabelul de linii (detaliu buget):
  - Rândul întreg se marchează cu `bg-warning/10` la 80–99% și `bg-destructive/10` la ≥ 100%.
  - Coloana "%" afișează badge color-coded (Tailwind semantic tokens).

- [ ] AC5: Toate adăugirile respectă design-system Vector 365: tokeni semantici, dark mode,
  WCAG AA (contrast ≥ 4.5:1, touch targets ≥ 44px, aria-labels pe icon-only buttons).

- [ ] AC6: Zero hex hardcodat în `.tsx`. Nicio dependință nouă de librărie grafice
  (graficul se implementează cu CSS/SVG pur + Tailwind).

- [ ] AC7: Testele existente (budget-002.test.tsx) rămân verzi după modificări.

---

## Files to create / modify

**Create:**
- `src/components/fin/BudgetBarChart.tsx` — grafic bară plan vs realizat
- `src/components/fin/BudgetProgressRing.tsx` — progress ring SVG
- `src/components/fin/BudgetAlertsPanel.tsx` — panou alerte active
- `src/__tests__/fin/budget-003.test.tsx` — teste pentru componente noi

**Modify:**
- `src/pages/app/BudgetPage.tsx` — integrare componente noi

---

## Tests

- **T-BUDGET-003-1** `[blocant]` Given render BudgetBarChart cu 3 categorii (60%/85%/110%), Then afișează 3 perechi de bare fără erori.
- **T-BUDGET-003-2** `[blocant]` Given render BudgetProgressRing cu pct=87, Then SVG arc prezent și aria-valuenow="87".
- **T-BUDGET-003-3** `[blocant]` Given BudgetAlertsPanel cu linie la 105%, Then randul este vizibil și are clasa destructive.
- **T-BUDGET-003-4** `[blocant]` Given render BudgetPage (smoke), Then nu crează erori de runtime.
- **T-BUDGET-003-5** [normal] Given BudgetBarChart cu pct < 80%, Then bara realizat are clasa success (verde).
- **T-BUDGET-003-6** [normal] Given BudgetAlertsPanel fără alerte, Then panoul este ascuns (nu renderizat).

---

## Definition of Done

- [ ] AC1–AC7 implementate
- [ ] T1–T4 [blocante] trec
- [ ] Build + typecheck + lint verzi
- [ ] Zero hex hardcodat, dark mode funcționează
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
