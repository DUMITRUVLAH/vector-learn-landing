---
id: INVENTORY-002
title: "Inventar — hooks SPEND→intrare + BILL→ieșire automat + spend_id FK"
milestone: FIN
phase: "19"
status: pending
depends_on: [INVENTORY-001, BILL-001]
spec: backlog/specs/INVENTORY-002.md
branch: feat/FIN-inventory
---

## Goal

Conectează modulul Inventar cu BILL (facturi) și achiziții manuale:

1. **spend_id FK** — adaugă coloana `spend_id UUID` în `fin_stock_movements` (pentru viitor link cu
   tabelul de achiziții; momentan stocat ca referință liberă fără FK hard — SPEND table nu există).
2. **Hook BILL→ieșire** — endpoint `POST /api/fin/inventory/hook/invoice-issued` apelat după emiterea
   unei facturi. Preia `invoiceId` + array de linie `{ itemId, qty }`, creează automat mișcări de
   tip `sale` pentru fiecare articol, linkuind `invoice_id`. Stocul scade automat la emiterea facturii.
3. **Hook PURCHASE→intrare** — endpoint `POST /api/fin/inventory/hook/purchase` înregistrează o
   intrare de tip `purchase` cu `{ itemId, qty, unitCostCents, reference, spendId? }`.
   Recalculează CMP și crește stocul. `spendId` se stochează în `spend_id` pentru trasabilitate.
4. **Endpoint stoc curent consolidat** — `GET /api/fin/inventory/stock-value` returnează valoarea
   totală a stocului per tenant: `{ totalItems, totalQty, totalValueCents, belowMinAlert: N }`.

---

## User stories

- Ca **contabil**, vreau că la emiterea unei facturi cu articole de stoc, mișcarea de ieșire să
  se creeze automat, pentru că altfel trebuie s-o introduc manual și fac greșeli.
- Ca **director financiar**, vreau să văd valoarea totală a stocului dintr-o singură chemare API,
  pentru că o includ în bilanțul lunar.
- Ca **sistem**, vreau că o achiziție să crească stocul și să recalculeze CMP automat prin
  hook-ul de purchase, pentru că aceasta este sursa principală de intrare în stoc.
- Ca **manager**, vreau alertă când un articol e sub stocul minim, pentru că altfel rămânem fără
  consumabile în mijlocul cursului.

---

## Acceptance criteria

- [ ] AC1: Migrare `0116_inventory_spend_id.sql` — adaugă coloana `spend_id UUID` la
  `fin_stock_movements` (nullable, fără FK hard — spend table nu există). Index pe `(spend_id)`.
  Statement-breakpoint respectat. Prefix 116 > 115 (fin_inventory).

- [ ] AC2: Schema `finInventory.ts` actualizată — adaugă câmpul `spendId: uuid("spend_id")`.
  Export în `server/db/schema/index.ts` actualizat (fișierul există deja, nu duplica exportul).

- [ ] AC3: **Hook invoice-issued** — `POST /api/fin/inventory/hook/invoice-issued`:
  - Body: `{ invoiceId: string, lines: Array<{ itemId: string, qty: number }> }`
  - Validare: `invoiceId` UUID valid, `lines` array non-empty, `qty > 0`.
  - Pentru fiecare linie: creează mișcare `sale` cu `invoiceId` setat, scade stocul.
  - Verificare stoc suficient per articol; dacă insuficient → returnează 422 cu lista articolelor
    cu stoc insuficient (nu creează nicio mișcare — atomic per articol).
  - `requireAuth` + tenant isolation (verifică că `itemId` aparține tenant-ului).
  - Returnează `{ movements: [...], itemsUpdated: N }`.

- [ ] AC4: **Hook purchase** — `POST /api/fin/inventory/hook/purchase`:
  - Body: `{ itemId: string, qty: number, unitCostCents: number, reference?: string, spendId?: string, notes?: string }`
  - Creează mișcare `purchase`, recalculează CMP, crește stocul.
  - `spendId` opțional — se stochează în `spend_id`.
  - Returnează `{ movement, newQtyOnHand, newAvgCostCents }`.

- [ ] AC5: **Stock value summary** — `GET /api/fin/inventory/stock-value`:
  - Returnează `{ totalItems: N, totalQty: N, totalValueCents: N, belowMinAlert: N }`.
  - `totalValueCents = SUM(qty_on_hand × avg_cost_cents)` per tenant.
  - `belowMinAlert = COUNT(articole unde qty_on_hand < min_qty_alert AND min_qty_alert > 0)`.
  - Zero raw `.execute().rows` — folosește query builder Drizzle.

- [ ] AC6: Toate endpoint-urile noi montate în `finInventoryRoutes` (deja montat în app.ts).
  Zero `any`. Tenant isolation pe fiecare query.

---

## Files to create / modify

**Create:**
- `drizzle/0116_inventory_spend_id.sql`
- `src/__tests__/fin/inventory-002.test.ts`

**Modify:**
- `server/db/schema/finInventory.ts` — adaugă `spendId` câmp
- `server/routes/finInventory.ts` — adaugă cele 3 endpoint-uri noi
- `drizzle/meta/_journal.json` — append idx 116

---

## Tests

- **T-INVENTORY-002-1** `[blocant]` Given un articol cu qty=50, When POST hook/invoice-issued cu qty=10, Then mișcare `sale` creată, qty_on_hand=40, invoice_id setat.
- **T-INVENTORY-002-2** `[blocant]` Given qty_on_hand=5, When hook/invoice-issued cu qty=10, Then 422 insufficient_stock, nicio mișcare creată.
- **T-INVENTORY-002-3** `[blocant]` Given articol nou, When POST hook/purchase cu qty=20 unitCost=500, Then qty_on_hand=20, avg_cost=500, spend_id stocat.
- **T-INVENTORY-002-4** `[blocant]` Given 3 articole cu avg_cost și qty variate, When GET /stock-value, Then totalValueCents = suma corectă, belowMinAlert corect.
- **T-INVENTORY-002-5** `[blocant]` finStockMovements schema are câmpul spendId definit.
- **T-INVENTORY-002-6** [normal] Hook invoice-issued cu lines goale returnează 400 validare.

---

## Definition of Done

- [ ] AC1–AC6 implementate
- [ ] T1–T5 [blocante] trec
- [ ] Migration 0116 cu statement-breakpoints + _journal.json actualizat
- [ ] Schema finInventory.ts actualizată cu spendId
- [ ] Build + typecheck verzi
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
