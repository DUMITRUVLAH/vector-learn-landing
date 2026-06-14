---
id: INVENTORY-004
title: "Inventar — Raport stoc: valoare, mișcări perioadă, articole sub minim"
milestone: FIN
phase: "19"
status: pending
depends_on: [INVENTORY-003]
spec: backlog/specs/INVENTORY-004.md
branch: feat/FIN-inventory
---

## Goal

Raport de inventar complet accesibil la `/app/fin/inventory/report`:
- **Situația stocului la dată** — qty + valoare per articol la o dată aleasă.
- **Mișcări în perioadă** — intrări vs ieșiri per articol (pivot simplu).
- **Articole sub stocul minim** — tabel alert.
- **Export CSV** — pentru bilanțul contabil.

---

## User stories

- Ca **director financiar**, vreau un raport de inventar la o dată calendaristică (ex: 31 mai), pentru că trebuie să-l atașez la bilanțul lunar.
- Ca **contabil**, vreau să văd intrările și ieșirile pe o perioadă, totalizate per articol, pentru că reconciliez cu bonurile de intrare și facturile.
- Ca **manager**, vreau lista articolelor cu stoc sub minim pe o singură pagină, pentru că fac comanda de aprovizionare o dată pe săptămână.
- Ca **director**, vreau să export raportul în CSV, pentru că l-am importa în Excel pentru bilanț.

---

## Acceptance criteria

- [ ] AC1: Pagina `src/pages/app/InventoryReportPage.tsx` la ruta `/app/fin/inventory/report`.
  Link din `InventoryPage` (buton/tab „Raport" în header sau tab nou).

- [ ] AC2: **Secțiunea Situație stoc**:
  - Date-picker „La data de" (default: azi).
  - Tabel: Articol | SKU | Categorie | Stoc (qty) | Cost mediu (MDL/unit) | Valoare totală (MDL).
  - Rând „TOTAL" jos cu suma valorilor.
  - API: `GET /api/fin/inventory/report/stock-snapshot?date=YYYY-MM-DD` — returnează stocul calculat
    pe baza mișcărilor până la data dată (sumă algebrică qty pe mișcări cu `moved_at <= date`).

- [ ] AC3: **Secțiunea Mișcări în perioadă**:
  - Date-range from/to (default: luna curentă).
  - Tabel pivot: Articol | Intrări (qty) | Valoare intrări (MDL) | Ieșiri (qty) | Valoare ieșiri (MDL) | Net qty.
  - API: `GET /api/fin/inventory/report/period?from=YYYY-MM-DD&to=YYYY-MM-DD`.

- [ ] AC4: **Secțiunea Sub stoc minim**:
  - Tabel: Articol | Stoc curent | Stoc minim | Deficit.
  - Badge roșu pe fiecare rând.
  - Afișat doar dacă există articole sub minim; altfel mesaj „Toate articolele au stoc suficient ✓".

- [ ] AC5: **Export CSV**:
  - Buton „Exportă CSV" pe fiecare secțiune.
  - CSV generat client-side din datele deja încărcate (nu necesită endpoint separat).
  - Fișier: `inventar-situatie-YYYY-MM-DD.csv` sau `inventar-miscari-FROM-TO.csv`.

- [ ] AC6: 2 endpoint-uri noi în `finInventoryRoutes`:
  - `GET /report/stock-snapshot?date=` — stoc la dată.
  - `GET /report/period?from=&to=` — mișcări în perioadă (intrări vs ieșiri).
  Zero raw `.execute().rows`. Tenant isolation. `requireAuth`.

- [ ] AC7: Tokens design system. Dark mode. WCAG AA. Zero `any`.

---

## Files to create / modify

**Create:**
- `src/pages/app/InventoryReportPage.tsx`
- `src/__tests__/fin/inventory-004.test.tsx`

**Modify:**
- `server/routes/finInventory.ts` — adaugă `/report/stock-snapshot` și `/report/period`
- `src/lib/api/finInventory.ts` — adaugă hooks `useStockSnapshot`, `usePeriodReport`
- `src/pages/app/InventoryPage.tsx` — link spre raport (buton „Raport" în header)
- `src/App.tsx` — route `/app/fin/inventory/report` → `<InventoryReportPage />`

---

## Tests

- **T-INVENTORY-004-1** `[blocant]` Given render InventoryReportPage, Then nu crează erori (smoke).
- **T-INVENTORY-004-2** `[blocant]` Given 2 mișcări purchase + 1 sale, When GET /report/stock-snapshot?date=today, Then qty corect (purchase - sale).
- **T-INVENTORY-004-3** `[blocant]` Given mișcări în perioadă, When GET /report/period?from=&to=, Then intrări și ieșiri totalizate corect per articol.
- **T-INVENTORY-004-4** [normal] Given articol cu qty_on_hand=3 și min_qty_alert=10, When secțiunea Sub minim, Then articolul apare cu deficit=7.
- **T-INVENTORY-004-5** [normal] Given datele încărcate, When click Export CSV secțiunea Situație, Then download inițiat cu CSV corect.

---

## Definition of Done

- [ ] AC1–AC7 implementate
- [ ] T1–T3 [blocante] trec
- [ ] Endpoint-uri /report/* montate (în routerul deja existent)
- [ ] Build + typecheck verzi
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
