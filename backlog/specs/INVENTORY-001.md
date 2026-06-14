---
id: INVENTORY-001
title: "Inventar — schema fin_inventory_items + fin_stock_movements + cost mediu ponderat + seed"
milestone: FIN
phase: "19"
status: pending
depends_on: [CORE-001]
spec: backlog/specs/INVENTORY-001.md
branch: feat/FIN-inventory
---

## Goal

Construiește fundația modulului Inventar (GAP-ANALYSIS G3) — gestiunea stocurilor de materiale
didactice, consumabile și active mici pentru centre educaționale:

1. **Schema** — tabele `fin_inventory_items` (catalog produse) și `fin_stock_movements`
   (mișcări: intrare achiziție, ieșire vânzare/consum, ajustare inventar).
2. **Cost mediu ponderat** — la fiecare intrare, se recalculează costul mediu ponderat
   (`avg_cost_cents`) per articol. Formula: `(qty_on_hand × old_avg + qty_in × unit_cost) / (qty_on_hand + qty_in)`.
3. **Conexiuni** — `fin_stock_movements` referențiază opțional `invoice_id` (ieșire din vânzare
   prin factură) și un viitor `spend_id` (intrare din achiziție via SPEND). Pregătit pentru BILL.
4. **Seed** — date demo: 5 articole + 8 mișcări (intrări + ieșiri) pentru tenant demo.
5. **Rute CRUD** — `/api/fin/inventory/items` + `/api/fin/inventory/movements` cu paginare.
6. **Export schema** în `server/db/schema/index.ts`.

GAP-ANALYSIS G3: gestionarea stocurilor lipsește din sistemele CRM educaționale. Andreea
cumpără consumabile (caiete, markere, papetărie) și le distribuie pe filiale — fără tracking,
pierde ~15% din stoc.

---

## User stories

- Ca **director financiar**, vreau să văd stocul curent al fiecărui articol și costul mediu,
  pentru că trebuie să știu valoarea stocului la final de lună pentru bilanț.
- Ca **administrator**, vreau să înregistrez o intrare de marfă (ex: 100 caiete la 5 MDL/buc),
  pentru că altfel nu știu câte am și la ce cost.
- Ca **contabil**, vreau că fiecare vânzare dintr-o factură să reducă automat stocul,
  pentru că manual fac greșeli și inventarul derivă de la realitate.
- Ca **sistem**, vreau costul mediu ponderat recalculat la fiecare intrare, pentru că
  metoda FIFO e complicată și CMP e standardul contabil Moldovenesc (SNC 2).

---

## Acceptance criteria

- [ ] AC1: `fin_inventory_items` — catalog articole inventar per tenant:
  `id UUID PK`, `tenant_id UUID FK tenants`, `name TEXT NOT NULL`,
  `sku VARCHAR(50)` (cod articol opțional), `unit VARCHAR(20) DEFAULT 'buc'`
  (buc/kg/l/m/set/pachet), `description TEXT`,
  `qty_on_hand BIGINT NOT NULL DEFAULT 0` (în unități mici, ex: grame, ml pentru precizie),
  `avg_cost_cents BIGINT NOT NULL DEFAULT 0` (cost mediu ponderat în MDL cents),
  `min_qty_alert BIGINT DEFAULT 0` (alertă stoc minim — 0 = fără alertă),
  `is_active BOOLEAN DEFAULT true`,
  `category VARCHAR(50)` (ex: "consumabile", "active_mici", "materiale_didactice"),
  `created_at TIMESTAMP`, `updated_at TIMESTAMP`.
  Index pe `(tenant_id)`, `(tenant_id, category)`.

- [ ] AC2: `fin_stock_movements` — jurnal mișcări stoc:
  `id UUID PK`, `tenant_id UUID FK tenants`,
  `item_id UUID FK fin_inventory_items NOT NULL`,
  `movement_type VARCHAR(30) NOT NULL` (purchase|sale|adjustment|transfer_in|transfer_out),
  `qty BIGINT NOT NULL` (poate fi negativ pentru ieșiri — sau mereu pozitiv + type indică direcția),
  `unit_cost_cents BIGINT DEFAULT 0` (cost unitar la momentul mișcării),
  `total_cost_cents BIGINT DEFAULT 0` (= qty × unit_cost_cents la intrare, valoare ieșire la CMP),
  `invoice_id UUID` (FK invoices.id opțional — ieșire prin factură),
  `reference VARCHAR(100)` (număr document sursă),
  `notes TEXT`,
  `branch_id UUID` (FK opțional pentru transfer filiale),
  `moved_by UUID FK users.id`,
  `moved_at TIMESTAMP NOT NULL DEFAULT NOW()`,
  `created_at TIMESTAMP`.
  Index pe `(tenant_id, item_id)`, `(tenant_id, movement_type)`, `(item_id, moved_at)`.

- [ ] AC3: Migration `0127_fin_inventory.sql` — creează cele 2 tabele.
  Statement-breakpoints între instrucțiuni. Prefix 127 > 114 (max pe main) — fără coliziune.
  (Notă: 125+126 sunt pe feat/FIN-banklink și vor fi 115-116 după merge reordering, dar
   pentru siguranță folosim 127 care e cert liber pe orice ordine de merge.)

- [ ] AC4: **Cost mediu ponderat (CMP)** — funcție `calculateAvgCost(itemId, qtyIn, unitCostCents)`
  în `server/lib/finInventoryEngine.ts`:
  - Fetch qty_on_hand + avg_cost_cents curent
  - Calculează noul avg = (old_qty × old_avg + qty_in × unit_cost) / (old_qty + qty_in)
  - Returnează `{ newAvgCostCents, newQtyOnHand }`
  - Apelabilă la fiecare înregistrare de intrare.

- [ ] AC5: **Rute** — `server/routes/finInventory.ts` (exportat + montat în app.ts):
  - `GET /api/fin/inventory/items` — lista articolelor active (cu qty + avg_cost). Filtre: category.
  - `POST /api/fin/inventory/items` — creare articol nou.
  - `PATCH /api/fin/inventory/items/:id` — actualizare (name/sku/unit/min_qty_alert/category).
  - `GET /api/fin/inventory/movements?itemId=&type=&from=&to=&page=&limit=` — jurnal mișcări.
  - `POST /api/fin/inventory/movements` — înregistrare mișcare manuală:
    Body: `{ itemId, movementType, qty, unitCostCents, reference, notes }`.
    La `purchase`: recalculează CMP + actualizează qty_on_hand.
    La `sale`/`adjustment`: scade qty_on_hand (nu recalculează CMP — cost mediu rămâne).
    Validare: qty > 0 mereu (tipul decide direcția), stoc nu poate deveni negativ la ieșiri.
  Toate cu requireAuth + tenant isolation.

- [ ] AC6: **Seed** — `server/lib/finInventorySeed.ts`: 5 articole demo
  (ex: "Caiete A4", "Markere permanente", "Hârtie imprimare A4", "Folii A4", "Pixuri") + 8
  mișcări (3 intrări + 3 ieșiri + 2 ajustări). Idempotent. Apelabilă din `seedDemo.ts`.

- [ ] AC7: Schema exports în `server/db/schema/index.ts`. Zero `any`. Zero raw `.execute().rows`.

---

## Files to create / modify

**Create:**
- `server/db/schema/finInventory.ts`
- `server/lib/finInventoryEngine.ts`
- `server/lib/finInventorySeed.ts`
- `server/routes/finInventory.ts`
- `drizzle/0127_fin_inventory.sql`
- `src/__tests__/fin/inventory-001.test.ts`

**Modify:**
- `server/db/schema/index.ts` — add `export * from "./finInventory";`
- `server/app.ts` — mount `finInventoryRoutes` at `/api/fin/inventory`
- `drizzle/meta/_journal.json` — append idx 127

---

## Tests

- **T-INVENTORY-001-1** `[blocant]` Given schema finInventory exportat, When import finInventoryItems, Then tabelul e definit cu coloanele corecte (qty_on_hand, avg_cost_cents).
- **T-INVENTORY-001-2** `[blocant]` Given articol cu qty=100 avg_cost=50, When purchase(20, 60), Then avg_cost = (100×50 + 20×60) / 120 = 51.67 cents ≈ 51 (integer division).
- **T-INVENTORY-001-3** `[blocant]` Given qty_on_hand=10, When sale(15), Then funcția returnează eroare "insufficient_stock".
- **T-INVENTORY-001-4** `[blocant]` finInventoryRoutes exportat din routes/finInventory.ts.
- **T-INVENTORY-001-5** `[blocant]` seedFinInventory inserează 5 articole + 8 mișcări și e idempotentă.
- **T-INVENTORY-001-6** [normal] calculateAvgCost cu old_qty=0 (primul articol) returnează unitCostCents direct.

---

## Definition of Done

- [ ] AC1–AC7 implementate
- [ ] T1–T5 [blocante] trec
- [ ] Migration 0127 cu statement-breakpoints + _journal.json actualizat
- [ ] Export în schema/index.ts + route montat în app.ts
- [ ] Build + typecheck verzi
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
