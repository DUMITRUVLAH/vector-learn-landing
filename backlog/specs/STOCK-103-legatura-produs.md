---
id: STOCK-103
title: Legătura produs CRM ↔ fișă de stoc, cu unitate înghețată
milestone: STOCK
phase: A
priority: P0
core_ref: [stock/STOCK-CORE.md §2.4, §4.3]
tests: inline (vezi „Tests")
depends_on: [STOCK-102]
status: pending
---

# STOCK-103 — Produsul CRM capătă fișă de stoc

## Goal
Cererea ownerului, exact: stoc **peste produsele care există**. Un produs din `crm_products`
poate avea o fișă de stoc în `fin_inventory_items` — una singură — fără să apară un al doilea
catalog și fără să se dubleze prețul.

## In scope
- Coloane noi pe `fin_inventory_items`: `crm_product_id` (uuid, nullable),
  `default_location_id`, `is_stock_tracked` (boolean NOT NULL DEFAULT true).
- Index `UNIQUE (tenant_id, crm_product_id) WHERE crm_product_id IS NOT NULL`. FK-ul către
  `crm_products` se declară **în migrare**, nu în fișierul de schemă — exact cum s-a făcut la
  `leads.product_id` (migrarea 0171), ca schema să nu depindă de ordinea importurilor.
- `POST /api/fin/stock/items/from-product` — creează fișa de stoc pornind de la un produs:
  copiază `name`, `sku` și `unit` din `crm_products`, pune `qty_on_hand=0`, `avg_cost_cents=0`.
  Dacă produsul are deja fișă → `409 already_linked` cu id-ul fișei existente.
- `GET /api/crm/products` câștigă, la cerere (`?withStock=1`), câmpurile `stockItemId`,
  `qtyOnHand`, `qtyAvailable` — printr-un singur LEFT JOIN, nu N+1.
- Validarea unității: `crm_products.unit` e text liber, `finInventory` acceptă doar
  `buc | kg | l | m | set | pachet`. O unitate în afara listei → `422 unsupported_unit`, cu
  lista acceptată în corpul răspunsului. **Fără conversie tăcută la `buc`.**
- `PATCH /api/fin/inventory/items/:id` refuză schimbarea unității după prima mișcare →
  `409 unit_locked`.
- Buton „Urmărește stocul" în `src/pages/business/crm/CrmProductsPage.tsx`, pe rândul produsului.

## Out of scope
- Coloana „Stoc" cu cifre în tabelul de produse (STOCK-111) — aici doar API-ul și butonul.
- Crearea automată de fișă pentru toate produsele existente. Ar umple lista de stoc cu servicii;
  legarea e o decizie a utilizatorului, produs cu produs.

## Decizii, cu motivul
- **Legătură 0..1, nu N:N.** Două fișe pentru același produs ar readuce exact problema pe care
  catalogul a rezolvat-o când a înlocuit textul liber: două răspunsuri la „câte avem".
- **Prețul NU se copiază în fișa de stoc.** `crm_products.list_price_cents` rămâne singura sursă.
  Fișa ține cost (CMP), nu preț.
- **Unitatea se îngheață după prima mișcare.** Cantitățile istorice sunt exprimate în ea;
  schimbarea ar rescrie retroactiv sensul întregului jurnal.
- **`is_stock_tracked`** există ca un serviciu (training, consultanță) să nu apară în „sub pragul
  minim" și să nu blocheze o factură prin lipsă de stoc.

## Acceptance criteria
- [ ] Un produs poate avea cel mult o fișă de stoc (impus prin index unic parțial, nu doar în cod)
- [ ] `from-product` copiază nume, SKU și unitate; `qty=0`, `avg_cost=0`
- [ ] Produs cu unitate necunoscută → 422 `unsupported_unit`, fișa NU se creează
- [ ] Schimbarea unității după o mișcare → 409 `unit_locked`
- [ ] `GET /api/crm/products?withStock=1` întoarce stocul cu un singur query (fără N+1)
- [ ] Produs al altui tenant în `from-product` → **404**
- [ ] Migrare commisă; FK declarat în SQL; `schema-drift` verde

## Tests
Extinde `stock-isolation.routes.test.ts`; fișier nou `server/__tests__/stock-product-link.routes.test.ts`.

Blocante:
1. `[blocant]` legare produs → fișă creată cu unitatea produsului; a doua legare → 409.
2. `[blocant]` produs cu `unit='cutie'` → 422 `unsupported_unit`; nicio fișă în DB după apel.
3. `[blocant]` `PATCH` unitate după o mișcare → 409; unitatea din DB neschimbată.
4. `[blocant]` `?withStock=1` întoarce `qtyAvailable` corect și NU întoarce produsele lui B.
5. `[blocant]` `from-product` cu `productId` al lui B → 404, nicio fișă creată.
6. `[blocant]` produs `is_stock_tracked=false` nu apare în lista „sub prag minim".

## Files
- `server/db/schema/finInventory.ts` (3 coloane)
- `drizzle/0178_fin_inventory_product_link.sql` (coloane + index parțial + FK)
- `server/routes/finInventory.ts` (`from-product`, blocarea unității)
- `server/routes/crmProducts.ts` (`?withStock=1`)
- `src/lib/api/crm.ts`, `src/lib/api/finStock.ts`
- `src/pages/business/crm/CrmProductsPage.tsx`
- `server/__tests__/stock-product-link.routes.test.ts` (nou)

## DoD
Standard.
