---
id: VM1-03
title: "Valute MDL/EUR/USD — plată în valuta exactă, rapoarte convertite în MDL (BNM)"
milestone: VIOLETA
phase: "VIOLETA"
status: pending
attempts: 0
depends_on: []
spec: backlog/specs/VM1-03-currency-reports.md
core: backlog/par/PAR-CORE.md
---

## Goal

Organizația are conturi separate per valută, deci plata se face în valuta EXACTĂ a PAR-ului — fără
conversie forțată la pasul de plată. Valutele suportate sunt MDL/EUR/USD (se elimină RON). Pentru
rapoarte/totaluri, sumele se convertesc la bază = MDL folosind un curs BNM înghețat la submit în
câmpurile existente `exchangeRate`/`totalMdlCents`. Rapoartele arată atât totalul în MDL cât și
defalcarea per valută.

## User stories

- **Ca** finance, **vreau** să plătesc fix în valuta cererii, **pentru că** avem conturi separate pe MDL,
  EUR și USD și nu vreau conversii inutile.
- **Ca** Andreea (director), **vreau** rapoarte cu un total unic în MDL, **pentru că** cererile sunt în
  valute mixte și am nevoie de o cifră comparabilă.
- **Ca** finance, **vreau** și defalcarea per valută, **pentru că** trebuie să știu cât plătesc din fiecare cont.

## Acceptance criteria

- [ ] Selectorul de valută din `ParCreateForm.tsx` listează DOAR MDL/EUR/USD (RON eliminat din UI și din validarea serverului)
- [ ] La submit, pentru valute ≠ MDL, se populează `exchangeRate` și `totalMdlCents` cu cursul BNM al zilei (înghețat la submit, nu recalculat ulterior)
- [ ] Pentru MDL, `exchangeRate=1` și `totalMdlCents = totalEstimatedCents`
- [ ] Serviciu mic de curs BNM, încărcat dinamic, cu cache zilnic (un fetch/zi/valută); fallback grațios la ultimul curs cunoscut dacă BNM e indisponibil
- [ ] `ParReports.tsx` însumează cereri în valute mixte convertite la MDL folosind `totalMdlCents` (nu reconvertește din valuta brută)
- [ ] Rapoartele arată ȘI defalcarea per valută (total MDL nativ, total EUR nativ, total USD nativ) pe lângă totalul agregat în MDL
- [ ] La pasul de plată NU se forțează nicio conversie — plata rămâne în valuta cererii
- [ ] Tenant scope respectat în raport; cereri vechi cu RON (dacă există) afișate fără crash
- [ ] Fără hex hardcodat, dark-mode ok

## Files

**New:**
- `server/lib/bnm/rate.ts` (fetch curs BNM, cache zilnic, încărcare dinamică)
- teste `server/lib/bnm/__tests__/rate.test.ts`

**Modified:**
- `src/pages/par/ParCreateForm.tsx` — selector valută MDL/EUR/USD
- `server/routes/par*.ts` — la submit, populare `exchangeRate`/`totalMdlCents` din BNM
- `src/pages/par/ParReports.tsx` — total în MDL din `totalMdlCents` + defalcare per valută

## Tests

- **T-VM1-03-1** [blocant] Given o cerere EUR de 100€ la curs BNM 19.5, When submit, Then `exchangeRate≈19.5` și `totalMdlCents≈195000`
- **T-VM1-03-2** [blocant] Given cereri în MDL+EUR+USD, When raport, Then totalul agregat = suma `totalMdlCents` și apare defalcarea per valută
- **T-VM1-03-3** [normal] Given selectorul de valută, When deschis, Then conține DOAR MDL/EUR/USD (fără RON)
- **T-VM1-03-4** [normal] Given BNM indisponibil, When submit valută ≠ MDL, Then se folosește ultimul curs cunoscut și submit-ul reușește

## DoD

- Live-smoke verde · reviewer APPROVED · personas salvate
