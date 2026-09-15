---
id: STOCK-105
title: Recepția de marfă (NIR) — postare cu recalculare CMP, numerotare, valută
milestone: STOCK
phase: B
priority: P0
core_ref: [stock/STOCK-CORE.md §6.1, §4.2, §4.6]
tests: inline (vezi „Tests")
depends_on: [STOCK-104]
status: pending
---

# STOCK-105 — Recepția (NIR)

## Goal
Marfa intră în gestiune pe un document cu număr, cu cost de achiziție real, iar costul mediu
ponderat se recalculează corect — inclusiv când factura furnizorului e în valută.

## In scope
- `kind='reception'` peste motorul din STOCK-104: crește soldul gestiunii din
  `fin_stock_docs.location_id`, recalculează CMP prin `calculateAvgCost`.
- Ecran `/business/crm/stoc/receptii` (`src/pages/business/crm/CrmStockReceptionsPage.tsx`):
  listă NIR-uri cu stare și total, plus formular de creare:
  - selector de gestiune (implicit: gestiunea implicită a tenantului);
  - furnizor opțional din `fin_parties`;
  - căutare de produs **în catalogul CRM** (`GET /api/crm/products?withStock=1`); produsul fără
    fișă de stoc oferă „creează fișă" pe loc (ruta `from-product` din STOCK-103);
  - per rând: cantitate + cost de achiziție, etichetat explicit **„cost achiziție, fără TVA"**;
  - butoanele „Salvează ciornă" și „Postează".
- Valută: selector de monedă pe document; cursul de la `doc_date` se aduce automat din
  `fin_exchange_rates` (`GET /api/fin/exchange-rates`) și poate fi corectat manual. Rândurile se
  scriu convertite în moneda de bază (`fin_settings.base_currency`, `server/db/schema/finCore.ts`),
  iar `currency` + `fx_rate` rămân pe antet ca dovadă.
- `POST /api/fin/inventory/hook/purchase` — **rămâne funcțional**, dar e rescris ca un caz
  particular: creează și postează un `reception` cu un rând, în gestiunea implicită. Nu mai scrie
  direct în jurnal.

## Out of scope
- Legarea NIR-ului de o cheltuială din `fin_expenses` sau de o factură de furnizor scanată din
  `fin_captures`. Coloana `source_kind='fin_expense'` e prevăzută, dar fluxul nu se construiește
  aici.
- Recepția parțială față de o comandă de aprovizionare — nu există comenzi (CORE §11.2).

## Decizii, cu motivul
- **Costul se introduce fără TVA.** TVA-ul deductibil nu face parte din costul stocului; dacă ar
  intra, valoarea stocului ar fi umflată cu 20% față de balanța contabilă.
- **Cursul se îngheață pe document.** O reevaluare ulterioară a cursului nu rescrie costul mărfii
  deja intrate — altfel valoarea stocului s-ar schimba singură peste noapte.
- **Costul se ține în moneda de bază.** Un stoc în trei monede n-ar avea o valoare, ar avea trei
  (CORE §4.6). Suma *cererii* (factura furnizorului) rămâne afișată în moneda ei pe antet, ceea
  ce respectă CLAUDE.md §3.8.
- **`hook/purchase` nu se șterge.** Are consumatori; ștergerea ar rupe integrări. Dar trece prin
  document, altfel am avea două căi de intrare și una dintre ele ar uita soldurile pe gestiune.

## Acceptance criteria
- [ ] NIR postat: soldul gestiunii crește cu cantitatea; `items.qty_on_hand` (totalul) la fel
- [ ] CMP recalculat exact după formula din `finInventoryEngine` (verificat pe un caz cu două
      intrări la costuri diferite, cu rotunjire la cent)
- [ ] Prima intrare pe un articol cu stoc 0 setează `avg_cost = unit_cost`
- [ ] Valoarea totală a stocului crește exact cu `Σ line_total_cents` al documentului
- [ ] Recepție în EUR: rândurile se scriu convertite; `currency`+`fx_rate` rămân pe antet;
      schimbarea ulterioară a cursului în `fin_exchange_rates` NU modifică documentul postat
- [ ] Curs lipsă pentru `doc_date` → cere curs manual, nu presupune 1
- [ ] `hook/purchase` produce un document `reception` postat, cu un rând, și actualizează balanța
- [ ] Ecranul respectă design-system-ul, dark mode și a11y (CLAUDE.md §3.1–3.3)

## Tests
`server/__tests__/stock-reception.routes.test.ts` (nou) + smoke pe ecran
`src/pages/business/crm/__tests__/CrmStockReceptionsPage.test.tsx`.

Blocante:
1. `[blocant]` CMP pe două intrări: 10 buc × 100 bani, apoi 10 buc × 200 bani → `avg=150`,
   `qty=20`; a treia intrare pe stoc 0 după golire → `avg` = costul noii intrări.
2. `[blocant]` valoarea stocului după postare == valoarea dinainte + totalul documentului.
3. `[blocant]` recepție în EUR la curs 19,5 → `line_total_cents` în MDL; modificarea cursului în
   `fin_exchange_rates` după postare nu schimbă documentul.
4. `[blocant]` `hook/purchase` creează document postat + mișcare + sold actualizat.
5. `[blocant]` recepție într-o gestiune arhivată → 422; într-o gestiune a lui B → 404.
6. `[blocant]` articol `is_stock_tracked=false` pe un rând de NIR → 422.
7. `[blocant]` smoke UI: ecranul randează, adaugă un rând, afișează totalul calculat client-side
   identic cu cel întors de server după postare.

## Files
- `server/lib/finStockPosting.ts` (ramura `reception`)
- `server/routes/finStockDocs.ts`, `server/routes/finInventory.ts` (`hook/purchase` rescris)
- `src/lib/api/finStock.ts`
- `src/pages/business/crm/CrmStockReceptionsPage.tsx` (nou) + `src/App.tsx`
- `server/__tests__/stock-reception.routes.test.ts` (nou)

## DoD
Standard.
