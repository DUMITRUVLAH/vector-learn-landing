---
id: ASSET-002
title: "Motor amortizare DETERMINIST liniar/degresiv + postare cheltuiala fin_expenses (rule #3)"
milestone: FIN
phase: "12"
status: pending
depends_on: [ASSET-001]
spec: backlog/specs/ASSET-002.md
branch: feat/FIN-asset
---

## Goal

Implementează motorul de amortizare DETERMINIST (FIN-CORE §1.12, regula #4):
1. Calcul amortizare liniară: depreciation_cents = (acquisitionCostCents − residualValueCents) / usefulLifeMonths (UNIFORM per lună)
2. Calcul amortizare degresivă: depreciation_cents = bookValue × cota_anuala / 12
   (cota_anuala = 100% / usefulLifeMonths × 12 × factor = uzual 200% / usefulLifeMonths × 12)
   Book value scade spre residualValueCents — nu poate fi sub.
3. API: POST /api/fin/assets/runs — calculează și salvează amortizările pentru luna dată (toată lista activelor active ale tenant-ului)
4. FIN-CORE regula #3: la confirmare (POST /api/fin/assets/runs/:assetId/confirm), postează cheltuiala în fin_expenses; dacă fin_expenses nu există → loghează și continuă (nu 500)
5. Rute montate în server/app.ts

---

## User stories

- Ca **contabil**, vreau să calculez automat amortizarea lunară a tuturor activelor, pentru că nu vreau să calculez manual 10+ active în Excel.
- Ca **director financiar**, vreau că la confirmarea amortizării cheltuiala să se înregistreze automat în SPEND, pentru că bilanțul reflectă realitatea.
- Ca **auditor**, vreau că calculul este DETERMINIST și reproductibil — aceeași intrare produce același rezultat, pentru că pot verifica față de normele contabile.

---

## Acceptance criteria

- [ ] AC1: `server/lib/fin/depreciationCalculator.ts` — funcție DETERMINISTĂ:
  `calculateDepreciation({ asset, periodMonth }): { depreciationCents, bookValueCents }`.
  - Metoda liniară: `depreciationCents = floor((acquisitionCostCents − residualValueCents) / usefulLifeMonths)`
    Ultima lună: ajustare pentru a nu depăși baza amortizabilă.
  - Metoda degresivă (declining_balance): `annualRate = min(2 / usefulLifeMonths, 1.0)`
    `depreciationCents = floor(prevBookValue × annualRate / 12)`.
    `bookValueCents = max(prevBookValue − depreciationCents, residualValueCents)`.
  - Dacă activul e deja fully_depreciated → depreciationCents = 0.
- [ ] AC2: `server/routes/finAssets.ts` — rute API:
  - `GET /api/fin/assets` — lista active per tenant (cu coloane relevante)
  - `POST /api/fin/assets` — creare activ nou
  - `POST /api/fin/assets/depreciate` — calculează amortizarea pentru `periodMonth` specificat
    pentru toate activele cu status=active; idempotent (dacă intrarea există → update)
    → returnează lista finDepreciationEntries create/update
  - `POST /api/fin/assets/:id/confirm-depreciation` — confirmă amortizarea lunii specificate:
    postează cheltuiala în fin_expenses (FIN-CORE regula #3); dacă fin_expenses nu există → loghează
    → actualizează finDepreciationEntries.expenseId (dacă a reușit)
    → actualizează finAssets.status = fully_depreciated dacă bookValueCents <= residualValueCents
- [ ] AC3: Rute montate în server/app.ts (route-mount rule §3.5.1).
- [ ] AC4: Tenant isolation pe toate rutele. Zero `any`. Zero hex hardcodate în UI.
- [ ] AC5: Motor idempotent: re-run pe aceeași lună suprascrie, nu duplică.

---

## Files to create / modify

**Create:**
- `server/lib/fin/depreciationCalculator.ts` — motor DETERMINIST liniar/degresiv
- `server/routes/finAssets.ts` — rute API active fixe
- `src/__tests__/fin/depreciation-calculator.test.ts` — teste motor

**Modify:**
- `server/app.ts` — mount finAssetsRoutes la /api/fin/assets
- `server/db/schema/index.ts` — deja conține finAssets (ASSET-001)

---

## Tests

- **T-ASSET-002-1** `[blocant]` Given activ cu brut=1_200_000 cenți, residual=0, 36 luni, metoda=linear,
  When calculateDepreciation luna 1, Then depreciationCents=33_333 (1200000/36=33333.33, floor), bookValue=1_166_667.
- **T-ASSET-002-2** `[blocant]` Given activ cu brut=800_000 cenți, 60 luni, metoda=linear, prec book=800_000,
  When calculateDepreciation luna 60 (ultima), Then bookValueCents=0 (nu negativ, nu depășit residual).
- **T-ASSET-002-3** `[blocant]` Given activ declining_balance cu brut=18_000_000 cenți, residual=2_000_000, 60 luni,
  When calculateDepreciation luna 1, Then annualRate=2/60=0.0333..., depreciationCents=floor(18_000_000×0.0333/12)=floor(50_000)=50_000, bookValue=17_950_000.
- **T-ASSET-002-4** `[blocant]` Given POST /api/fin/assets/depreciate cu periodMonth valid, When autentificat tenant, Then 200 cu array de entries.
- **T-ASSET-002-5** [normal] Given activ fully_depreciated, When calculateDepreciation, Then depreciationCents=0.
- **T-ASSET-002-6** [normal] Given POST /api/fin/assets/:id/confirm-depreciation și fin_expenses lipsă,
  When confirmare, Then 200 (nu 500) + warning în response.

---

## Definition of Done

- [ ] AC1-AC5 implementate
- [ ] T-ASSET-002-1..4 trec (blocante)
- [ ] Motor DETERMINIST: date calendaristice → amortizare reproductibilă
- [ ] Build + typecheck + lint verzi
- [ ] Rute montate în app.ts
