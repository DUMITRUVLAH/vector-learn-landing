---
id: STOCK-109
title: Rezervarea la ofertă + disponibil = pe mână − rezervat
milestone: STOCK
phase: C
priority: P1
core_ref: [stock/STOCK-CORE.md §2.7, §6.5]
tests: inline (vezi „Tests")
depends_on: [STOCK-106]
status: pending
---

# STOCK-109 — Rezervări la ofertă

## Goal
Doi agenți nu mai promit aceeași marfă. O ofertă finalizată rezervă cantitatea, iar disponibilul
pe care îl vede vânzătorul e ce poate promite cu adevărat.

## In scope
- Tabelă nouă `fin_stock_reservations` (CORE §2.7) în `server/db/schema/finStockReservations.ts`,
  cu `UNIQUE (tenant_id, source_kind, source_id, item_id, location_id)`.
- Cârlig pe ofertă: la finalizarea unei oferte CRM (`doc_documents`, `kind='oferta_comerciala'`,
  trecerea în `final` — vezi `server/routes/crmDocuments.ts` și `server/routes/docs.ts`),
  rândurile cu produs care are fișă de stoc creează rezervări în gestiunea implicită.
- `qty_reserved` pe `fin_stock_balances` întreținut în aceeași tranzacție cu rezervarea.
- `qty_available = qty_on_hand − qty_reserved` întors de `GET /api/fin/stock/balances` și de
  `GET /api/crm/products?withStock=1`.
- Eliberarea: oferta anulată sau expirată → `status='released'`, `qty_reserved` scade.
  `expires_at` = valabilitatea ofertei; curățarea rulează în `server/routes/finCron.ts` (cronul
  există deja — nu se scrie unul nou).
- Consumarea: factura emisă din ofertă (STOCK-106) trece rezervările în `consumed` și scade
  `qty_reserved`, în aceeași tranzacție cu ieșirea.
- „Rezervări descoperite": endpoint + contor pentru rezervările `active` a căror cantitate
  depășește `qty_on_hand` din gestiune.

## Out of scope
- Rezervare pe o anumită gestiune aleasă de vânzător — se rezervă în gestiunea implicită. Alegerea
  gestiunii la ofertare cere un selector în ecranul de acte, care nu e al acestui modul.
- Rezervare parțială / cozi de așteptare pe marfă indisponibilă.

## Decizii, cu motivul
- **Rezervarea NU blochează ieșirea.** Dacă cineva chiar vinde marfa rezervată, vânzarea trece, iar
  rezervarea rămasă fără acoperire apare marcată „descoperită". Blocarea ar transforma o unealtă
  informativă într-un obstacol și ar pune evidența mai presus de vânzarea reală.
- **Se rezervă la finalizarea ofertei, nu la ciornă.** O ciornă se schimbă de cinci ori pe zi;
  rezervările ei ar face disponibilul o cifră fără sens.
- **Unicitate pe (ofertă, articol, gestiune).** Retrimiterea aceleiași oferte nu dublează
  rezervarea.
- **`qty_available` rămâne calculat, nu stocat** (CORE §2.3).

## Acceptance criteria
- [ ] Ofertă finalizată cu 2 produse cu stoc → 2 rezervări `active`, `qty_reserved` crescut
- [ ] Produsele fără fișă de stoc și serviciile nu produc rezervări
- [ ] `qty_available` scade cu rezervarea, în ambele endpoint-uri care îl întorc
- [ ] Aceeași ofertă finalizată de două ori → o singură rezervare per articol
- [ ] Ofertă anulată → rezervări `released`, `qty_reserved` revenit
- [ ] `expires_at` trecut → cronul eliberează; `qty_reserved` revine
- [ ] Factură emisă din ofertă → rezervări `consumed`, `qty_reserved` scade, în aceeași
      tranzacție cu ieșirea (nu în două)
- [ ] O ieșire trece chiar dacă marfa e rezervată; rezervarea descoperită apare în contor
- [ ] `Σ qty_reserved` pe (item, locație) == `Σ qty` al rezervărilor `active` — invariant testat
- [ ] Ofertă a altui tenant → 404

## Tests
`server/__tests__/stock-reservations.routes.test.ts` (nou).

Blocante:
1. `[blocant]` finalizare ofertă → rezervări create; `qty_available` scăzut; `qty_on_hand`
   neschimbat.
2. `[blocant]` idempotență: a doua finalizare → o singură rezervare (indexul unic o impune).
3. `[blocant]` anulare ofertă → `released`; `qty_reserved` revine la 0.
4. `[blocant]` expirare: `expires_at` în trecut + rularea cronului → `released`.
5. `[blocant]` facturare → `consumed` + ieșire, verificate ambele în DB după un singur apel.
6. `[blocant]` **cursa pe ultima marfă**: 5 buc în stoc, oferta A rezervă 5 → oferta B vede
   `qty_available=0`; o vânzare directă de 5 buc trece, iar rezervarea lui A apare în contorul de
   „rezervări descoperite".
7. `[blocant]` invariantul `qty_reserved` == suma rezervărilor active, după fiecare scenariu.
8. `[blocant]` izolare: rezervările lui B nu apar în `GET` ca A; oferta lui B → 404.

## Files
- `server/db/schema/finStockReservations.ts` (nou) + `index.ts`
- `drizzle/0180_fin_stock_reservations.sql`
- `server/db/ensure/stock.ts`
- `server/lib/finStockReservations.ts` (nou)
- `server/routes/crmDocuments.ts` / `server/routes/docs.ts` (cârligul la finalizare/anulare)
- `server/routes/finInvoices.ts` (consumarea la emitere)
- `server/routes/finCron.ts` (eliberarea celor expirate)
- `server/routes/crmProducts.ts`, `server/routes/finStockDocs.ts` (`qty_available`)
- `server/__tests__/stock-reservations.routes.test.ts` (nou)

## DoD
Standard.
