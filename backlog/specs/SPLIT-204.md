---
id: SPLIT-204
title: "Dashboard unificat /business/dashboard — KPI FinDesk + PAR + ITPark"
milestone: SPLIT
phase: "3"
status: pending
branch: feat/SPLIT-integration
depends_on: [SPLIT-202, SPLIT-203]
spec: backlog/specs/SPLIT-204.md
---

## Goal

Înlocuiește placeholder-ul din `BusinessDashboardPage` cu KPI reali din toate 3 module:
- **FinDesk**: venituri (totalIncome), cheltuieli (totalExpenses), sold net, TVA de plătit — din `/api/fin/expenses/summary`
- **PAR**: cereri în așteptare (pending count), valoarea totală a cererilor pending — din `/api/par?status=pending`
- **ITPark**: rezidenți activi (count), contracte active — din `/api/itpark/engagements`

Pagina existentă este `src/pages/business/BusinessDashboardPage.tsx` (SPLIT-101 a creat placeholder-ul). SPLIT-204 POPULEAZĂ cu date reale — NU rescrie shell-ul sau layout-ul.

## User Stories

- Ca CFO/director, vreau să văd KPI din toate 3 module pe un singur ecran, pentru că altfel trebuie să navighez în 3 locuri.
- Ca manager financiar, vreau să văd suma cheltuielilor și veniturilor din FinDesk, pentru că îmi oferă tabloul de bord zilnic.
- Ca responsabil achizitii, vreau să văd câte cereri de plată sunt pending, pentru că să știu ce trebuie aprobat azi.
- Ca director ITPark, vreau să văd numărul de rezidenți activi, pentru că e KPI principal al parcului.

## Acceptance Criteria

- [ ] Secțiunea FinDesk KPI: afișează totalVenituri, totalCheltuieli, soldNet (venituri - cheltuieli) — valori reale din `/api/fin/expenses/summary`.
- [ ] Secțiunea PAR KPI: afișează nr. cereri `pending` + valoarea totală — din `/api/par` (filter status=pending).
- [ ] Secțiunea ITPark KPI: afișează nr. rezidenți activi — din `/api/itpark/engagements` (filter status=active).
- [ ] Loading skeleton pentru fiecare card în timp ce datele se încarcă.
- [ ] Eroare graceful: dacă un API pică, cardul afișează „N/A" fără a bloca restul dashboard-ului.
- [ ] Design: 3 KPI cards (una per modul), semantic tokens, light+dark, WCAG AA.
- [ ] Quick-access links spre modulele detaliate rămân (FinDesk, PAR, ITPark cards).
- [ ] Nicio rescriere a BusinessShell sau a layout-ului existent.

## Files Affected

- `src/pages/business/BusinessDashboardPage.tsx` — înlocuiește placeholder cu 3 KPI cards
- `src/lib/api/businessDashboard.ts` — (NOU) fetch helper pentru cele 3 endpoint-uri
- `src/hooks/useBusinessDashboard.ts` — (NOU) hook cu loading/error state

## Tests

- **T-SPLIT-204-1** [blocant] Given pagina /business/dashboard este randată cu sesiune validă, When datele se încarcă, Then 3 carduri KPI sunt vizibile (FinDesk, PAR, ITPark) și nu există crash.
- **T-SPLIT-204-2** [normal] Given API-ul /api/fin/expenses/summary returnează date, When dashboard-ul se randează, Then valorile totalVenituri/totalCheltuieli sunt afișate ca numere (nu "undefined").
- **T-SPLIT-204-3** [normal] Given API-ul PAR returnează liste, When dashboard-ul se randează, Then nr. cererilor pending este afișat corect.
- **T-SPLIT-204-4** [normal] Given un API pică (simulat cu null/error), When dashboard-ul se randează, Then celelalte 2 carduri sunt afișate corect (eroare izolată).
- **T-SPLIT-204-5** [blocant] Given user-ul navighează la /business/dashboard fără sesiune, When pagina se încarcă, Then redirect la /business/login (BusinessShell guard existent).

## DoD

- Build + typecheck + lint green.
- Toate T-SPLIT-204-{1,5} (blocant) trec.
- Reviewer APPROVED, integration CONNECTED.
- Persona reports salvate.
