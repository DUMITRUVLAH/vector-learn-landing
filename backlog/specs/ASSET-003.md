---
id: ASSET-003
title: "UI Active Fixe: registru, amortizare lunară, casare — /app/fin/assets"
milestone: FIN
phase: "12"
status: pending
depends_on: [ASSET-001, ASSET-002]
spec: backlog/specs/ASSET-003.md
branch: feat/FIN-asset
---

## Goal

Implementează pagina UI `/app/fin/assets` — registrul de active fixe (FIN-CORE §1.12):
1. **Registru active** — tabel cu toate activele fixe ale tenant-ului: name, category,
   acquisitionDate, acquisitionCostCents, currentBookValueCents, status, lastDepreciationPeriod.
   Filtrare după status (Toate / Activ / Amortizat complet / Vândut / Casat).
2. **Dialog „Activ nou"** — formular creare activ (name, category, acquisitionDate,
   acquisitionCostCents, residualValueCents, usefulLifeMonths, depreciationMethod, notes).
3. **Dialog „Calcul amortizare lunii"** — input `periodMonth` (YYYY-MM), buton „Calculează",
   afișare preview rezultate, buton „Confirmă" per activ (POST /confirm-depreciation).
4. **Dialog „Casare activ"** — schimbă statusul activului la `scrapped` (PATCH /api/fin/assets/:id).
5. **API client** `src/lib/api/finAssets.ts` cu funcțiile: `listAssets`, `createAsset`,
   `depreciateAssets`, `confirmDepreciation`, `scrapAsset`.
6. Rută montată în `src/App.tsx` (`if path.startsWith("/app/fin/assets")`) și link în AppShell nav.

Design-system tokens only (no hex), light+dark, WCAG AA. Toate sumele în MDL (lei).

---

## User stories

- Ca **contabil**, vreau să văd registrul activelor fixe cu valoarea curentă netă, pentru că trebuie
  să știu ce active are centrul și cât valorează ele contabil.
- Ca **director financiar**, vreau să calculez amortizarea lunii cu un click, pentru că fac asta
  manual în Excel acum și durează 20 minute.
- Ca **contabil**, vreau să casez un activ (îl scoatem din uz), pentru că altfel apare în registru
  ca și activ deși nu mai există fizic.
- Ca **auditor**, vreau să văd istoricul amortizărilor per activ, pentru că verific că s-au
  înregistrat corect toate lunile.

---

## Acceptance criteria

- [ ] AC1: Pagina `/app/fin/assets` se redează fără crash; afișează tabel cu activele tenant-ului.
  Coloane: Denumire, Categorie, Dată achiziție, Valoare intrare (MDL), Valoare netă curentă (MDL),
  Ultima amortizare, Status (badge color-coded). Filtre: Toate / Activ / Amortizat complet / Vândut / Casat.
- [ ] AC2: Buton „+ Activ nou" deschide un dialog cu formular: name (required), category,
  acquisitionDate (date picker string YYYY-MM-DD), acquisitionCostCents (input MDL, converted ×100),
  residualValueCents (MDL, default 0), usefulLifeMonths (number, min 1), depreciationMethod
  (select: Liniar / Degresiv), notes. POST /api/fin/assets → actualizare tabel.
- [ ] AC3: Buton „Calcul amortizare" deschide dialog: input „Luna (YYYY-MM)", buton „Calculează".
  POST /api/fin/assets/depreciate → afișare preview: tabel cu activele, sumele amortizate, valoarea netă.
  Per activ: buton „Confirmă amortizarea" → POST /api/fin/assets/:id/confirm-depreciation → toast succes.
- [ ] AC4: Per activ (row în tabel sau detaliu): buton „Casare" → dialog confirmare → PATCH
  /api/fin/assets/:id cu `{ status: "scrapped" }` → activ dispare din lista „Activ".
- [ ] AC5: `src/lib/api/finAssets.ts` — funcții tipizate TypeScript:
  `listAssets(params?)`, `createAsset(data)`, `depreciateAssets(periodMonth, assetIds?)`,
  `confirmDepreciation(assetId, periodMonth)`, `scrapAsset(assetId)`. Zero `any`.
- [ ] AC6: Rută adăugată în `src/App.tsx`: `if (path.startsWith("/app/fin/assets")) return <AssetsPage />;`
  Link „Active Fixe" adăugat în AppShell nav (secțiunea Finanțe).
- [ ] AC7: Design system tokens everywhere: `bg-background`, `text-foreground`, `border-border`,
  `text-muted-foreground`. Badges status: activ=`bg-success/10 text-success`,
  amortizat=`bg-muted text-muted-foreground`, casat=`bg-destructive/10 text-destructive`.
  Light+dark mode funcțional. WCAG AA: contrast ≥ 4.5:1, touch targets ≥ 44px.
- [ ] AC8: Loading states (Loader2 spinner), error states (AlertTriangle + mesaj), empty state
  „Niciun activ înregistrat — adaugă primul activ fix." Toate sumele formatate în MDL cu
  `Intl.NumberFormat("ro-RO", { style: "currency", currency: "MDL" })`.
- [ ] AC9: Tenant isolation — toate apelurile API includ token sesiune (via `useSession` + fetch cu
  Authorization header). Server respinge altă tenantId automat (filtrare DB per tenant).

---

## Files to create / modify

**Create:**
- `src/lib/api/finAssets.ts` — API client tipizat
- `src/pages/app/AssetsPage.tsx` — pagina principală registru active fixe

**Modify:**
- `src/App.tsx` — adaugă ruta `/app/fin/assets`
- `src/components/app/AppShell.tsx` — adaugă link „Active Fixe" în nav (secțiunea Finanțe)
- `src/__tests__/fin/fin-assets-ui.test.tsx` — teste UI

---

## Tests

- **T-ASSET-003-1** `[blocant]` Given component AssetsPage renderizat cu mocked fetch,
  When pagina se încarcă, Then se redează fără crash și afișează „Active fixe" în heading.
- **T-ASSET-003-2** `[blocant]` Given API client finAssets.ts,
  When `listAssets()` cu fetch mock 200 `{ assets: [] }`,
  Then returnează array gol fără excepție.
- **T-ASSET-003-3** `[blocant]` Given `createAsset({ name:"Laptop", acquisitionCostCents:1200000, ... })`,
  When fetch mock returnează 201 cu asset,
  Then returnează asset-ul cu id corect.
- **T-ASSET-003-4** [normal] Given tabel cu active, When user apasă filtru „Activ",
  Then fetch-ul include `?status=active` în URL.
- **T-ASSET-003-5** [normal] Given dialog „Casare", When user confirmă casarea,
  Then `scrapAsset(id)` este apelat și tabelul se actualizează.
- **T-ASSET-003-6** [normal] Given sume de 1_200_000 cenți,
  When formatate, Then afișează „12.000,00 MDL" (Intl.NumberFormat ro-RO MDL).

---

## Definition of Done

- [ ] AC1-AC9 implementate
- [ ] T-ASSET-003-1..3 trec (blocante)
- [ ] Build + typecheck + lint verzi
- [ ] Rută montată în App.tsx, link în AppShell nav
- [ ] Fără hex hardcodat, dark mode funcțional
- [ ] AssetsPage redare fără crash în test
