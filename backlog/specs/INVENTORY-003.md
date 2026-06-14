---
id: INVENTORY-003
title: "Inventar — UI pagină /app/fin/inventory: listă articole, mișcări, stoc curent"
milestone: FIN
phase: "19"
status: pending
depends_on: [INVENTORY-002]
spec: backlog/specs/INVENTORY-003.md
branch: feat/FIN-inventory
---

## Goal

Construiește pagina UI `/app/fin/inventory` cu trei tab-uri:

1. **Articole** — tabel cu toate articolele active, stoc curent, cost mediu, valoare totală per articol.
   Filtre: categorie. Acțiuni: creare articol nou (modal), editare inline (PATCH).
2. **Mișcări** — jurnal cronologic al mișcărilor de stoc. Filtre: articol, tip mișcare, perioadă.
3. **Mișcare manuală** — formular pentru înregistrare manuală (purchase/sale/adjustment).

Banner sumar sus: valoare totală stoc + număr articole sub alert.

---

## User stories

- Ca **director financiar**, vreau să văd lista articolelor cu stocul curent și valoarea pe o singură pagină, pentru că am nevoie de situația stocului la orice moment.
- Ca **administrator**, vreau să creez un articol nou din UI fără să știu SQL, pentru că altfel nu pot gestiona stocul.
- Ca **contabil**, vreau să văd jurnalul mișcărilor filtrat pe articol + perioadă, pentru că trebuie să reconciliez inventarul cu bonurile.
- Ca **manager**, vreau să văd un banner cu articolele sub stocul minim, pentru că altfel comenzile de materiale se fac în ultimul moment.

---

## Acceptance criteria

- [ ] AC1: Pagina `src/pages/app/InventoryPage.tsx` cu 3 tab-uri (Articole | Mișcări | Adaugă mișcare).
  Ruta `/app/fin/inventory` înregistrată în `src/App.tsx`. Link deja în AppShell (INVENTORY-001).

- [ ] AC2: **Tab Articole**:
  - Tabel: Articol | SKU | Categorie | Stoc (qty + unit) | Cost mediu (MDL) | Valoare totală (MDL) | Alert stoc.
  - Filtre: dropdown categorie (consumabile/active_mici/materiale_didactice/papetarie/electronice/altele).
  - Coloana „Alert stoc" — badge roșu dacă `qty_on_hand < min_qty_alert && min_qty_alert > 0`.
  - Buton „+ Articol nou" → modal cu formular (name, sku, unit, category, minQtyAlert, description).
  - Rând click → drawer lateral cu detalii + buton „Editează".

- [ ] AC3: **Tab Mișcări**:
  - Tabel: Data | Articol | Tip | Cantitate | Cost unitar | Total | Referință | Note.
  - Filtre: select articol, select tip mișcare, date-range from/to.
  - Paginare (50/pagină, buton „Mai multe").
  - Tip afișat cu badge colorat: purchase=verde, sale=albastru, adjustment=gri, transfer=portocaliu.

- [ ] AC4: **Tab Adaugă mișcare manuală**:
  - Formular: select articol, select tip (purchase/sale/adjustment/transfer_in/transfer_out),
    qty (number), unitCostCents (afișat în MDL, în lei cu 2 zecimale), reference, notes.
  - La submit: `POST /api/fin/inventory/movements`. Feedback success/error.
  - Recalculare live a stocului estimat (qty curent ± qty formulat) — informațional.

- [ ] AC5: **Banner sumar** (sus, deasupra tab-urilor):
  - Apelează `GET /api/fin/inventory/stock-value`.
  - Afișează: „Valoare totală stoc: X MDL" | „Articole: N" | „Sub stoc minim: M" (badge roșu dacă M>0).
  - Loading skeleton în timp ce se încarcă.

- [ ] AC6: Tokens design system — nicio culoare hex hardcoded. Dark mode funcțional.
  WCAG AA: contrast ≥ 4.5:1, touch targets ≥ 44px, labels pe toate inputuri.
  Zero orice `any` TypeScript.

---

## Files to create / modify

**Create:**
- `src/pages/app/InventoryPage.tsx`
- `src/lib/api/finInventory.ts` (react-query hooks: useInventoryItems, useStockMovements, useStockValue, useCreateItem, useCreateMovement, usePatchItem)
- `src/__tests__/fin/inventory-003.test.tsx`

**Modify:**
- `src/App.tsx` — add route `/app/fin/inventory` → `<InventoryPage />`

---

## Tests

- **T-INVENTORY-003-1** `[blocant]` Given pagina randată, When render InventoryPage, Then nu crează erori (smoke test).
- **T-INVENTORY-003-2** `[blocant]` Given mock 3 articole, When tab Articole activ, Then tabelul afișează 3 rânduri cu name, qty, valoare corectă.
- **T-INVENTORY-003-3** `[blocant]` Given articol cu qty < min_qty_alert, When render, Then badge-ul roșu „Alert" e vizibil.
- **T-INVENTORY-003-4** `[blocant]` Given formular mișcare manuală, When submit cu qty valid, Then POST /movements apelat cu parametrii corecți.
- **T-INVENTORY-003-5** [normal] Given tab Mișcări, When filtru tip=purchase, Then lista conține doar mișcări purchase.
- **T-INVENTORY-003-6** [normal] Given pagina, When banner stock-value afișat, Then totalValueCents corect afișat în MDL (împărțit la 100).

---

## Definition of Done

- [ ] AC1–AC6 implementate
- [ ] T1–T4 [blocante] trec
- [ ] Ruta montată în App.tsx
- [ ] Build + typecheck verzi
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
