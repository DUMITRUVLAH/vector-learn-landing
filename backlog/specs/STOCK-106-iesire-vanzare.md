---
id: STOCK-106
title: Ieșirea la vânzare din factură + ieșirea manuală, idempotent și atomic
milestone: STOCK
phase: B
priority: P0
core_ref: [stock/STOCK-CORE.md §6.2, §6.3, §4.8]
tests: inline (vezi „Tests")
depends_on: [STOCK-105]
status: pending
---

# STOCK-106 — Ieșirea din gestiune

## Goal
Când se emite o factură, marfa iese din gestiune automat, o singură dată, la costul mediu
ponderat — fără să blocheze facturarea și fără să dubleze descărcarea la o retrimitere.

## In scope
- `kind='issue'` peste motorul din STOCK-104.
- **Cârligul pe factură**: la trecerea `fin_invoices.status → 'issued'` se creează un document
  `issue` cu `source_kind='fin_invoice'`, `source_id = invoice.id`, din rândurile
  `fin_invoice_lines` care au articol cu fișă de stoc și `is_stock_tracked=true`. Rândurile de
  servicii se ignoră tăcut.
- **Idempotență**: înainte de creare se caută pe `(tenant_id, source_kind, source_id)`. Există
  deja un document ne-stornat → nu se creează al doilea, se întoarce cel existent.
- **Nu blochează facturarea**: dacă stocul nu ajunge, factura se emite oricum, iar documentul de
  ieșire rămâne `draft` cu `notes` care spun ce lipsește. Ecranul de stoc arată un contor „N
  facturi emise fără descărcare de gestiune" (consumat vizual la STOCK-111).
- **Stornarea facturii** (`status → 'cancelled'`) stornează documentul de ieșire, dacă era postat.
- **Ieșirea manuală**: `kind='issue'` fără `source_id`, cu motiv obligatoriu în `notes`
  (`422 reason_required` fără el). Acoperă consumul intern, pierderea, casarea și materialele
  didactice ale școlii.
- **Rescrierea lui `POST /api/fin/inventory/hook/invoice-issued`**: trece prin document, într-o
  singură tranzacție. Azi verifică „toate sau nimic", dar apoi scrie rând cu rând fără
  tranzacție — o eroare la al treilea din cinci rânduri lasă gestiunea pe jumătate descărcată.
  Contractul HTTP al rutei rămâne același (aceleași coduri, același corp), ca integrările
  existente să nu se rupă.

## Out of scope
- Rezervările (STOCK-109) — ieșirea nu consultă încă `qty_reserved`.
- Descărcarea la acceptarea ofertei. Oferta e o intenție, factura e evenimentul care transferă
  proprietatea (CORE §6.2).
- Livrări parțiale față de o factură (un aviz azi, restul peste o săptămână). Se descarcă integral
  la emitere; livrarea parțială cere o stare de „livrat" pe rândul de factură, pe care
  `fin_invoice_lines` nu o are.

## Decizii, cu motivul
- **Momentul descărcării = emiterea facturii.** Oferta se schimbă și moare; factura nu.
- **Lipsa de stoc nu blochează factura.** A opri încasarea banilor din cauza evidenței de stoc e
  un rău mai mare decât o evidență temporar incompletă. Dar nici nu se ascunde: rămâne o ciornă
  vizibilă și numărată.
- **Idempotența se sprijină pe un index**, nu pe o convenție. Webhook-urile se repetă; facturile
  se re-emit.
- **Costul ieșirii = CMP-ul din momentul postării**, nu prețul de vânzare. Marja nu se calculează
  aici.

## Acceptance criteria
- [ ] Factura emisă → document `issue` postat, mișcări `sale`, solduri scăzute, CMP neschimbat
- [ ] Aceeași factură procesată de două ori → **un singur** document de ieșire
- [ ] Stoc insuficient → factura rămâne emisă, documentul rămâne `draft`, contorul crește
- [ ] Rândurile de serviciu (`is_stock_tracked=false`) nu produc mișcări
- [ ] Anularea facturii stornează documentul postat; dacă era ciornă, îl șterge
- [ ] Ieșire manuală fără motiv → `422 reason_required`
- [ ] `hook/invoice-issued` e tranzacțional: eroare pe al 3-lea din 5 rânduri → **zero** mișcări
      scrise (regresie explicită pe bug-ul de azi)
- [ ] Contractul HTTP al lui `hook/invoice-issued` neschimbat (aceleași coduri și corpuri)
- [ ] Factura altui tenant → 404

## Tests
`server/__tests__/stock-issue.routes.test.ts` (nou).

Blocante:
1. `[blocant]` emitere factură cu 3 rânduri (2 marfă, 1 serviciu) → document cu 2 rânduri,
   soldurile scăzute exact cu cantitățile, serviciul ignorat.
2. `[blocant]` **idempotență**: același apel de două ori → un singur document, solduri scăzute o
   singură dată.
3. `[blocant]` **atomicitate** (regresie): 5 rânduri, al 3-lea fără stoc → 422 și **zero**
   mișcări în DB, solduri identice cu cele dinainte.
4. `[blocant]` stoc insuficient pe calea automată → factura rămâne `issued`, documentul `draft`,
   contorul de „facturi fără descărcare" = 1.
5. `[blocant]` anulare factură → document `reversed`, solduri revenite la valoarea dinainte.
6. `[blocant]` ieșire manuală fără `notes` → 422; cu motiv → postată, mișcare `sale`.
7. `[blocant]` costul ieșirii == `avg_cost_cents` din momentul postării, nu prețul de listă.
8. `[blocant]` izolare: factura lui B → 404, nicio mișcare în tenantul A.

## Files
- `server/lib/finStockPosting.ts` (ramura `issue`)
- `server/routes/finStockDocs.ts`
- `server/routes/finInvoices.ts` (cârligul la `issued` / `cancelled`)
- `server/routes/finInventory.ts` (`hook/invoice-issued` rescris peste document, tranzacțional)
- `server/__tests__/stock-issue.routes.test.ts` (nou)

## DoD
Standard.
