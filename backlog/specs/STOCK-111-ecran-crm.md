---
id: STOCK-111
title: Ecranul de stoc în CRM + coloana „Stoc" în Produse + permisiuni
milestone: STOCK
phase: D
priority: P1
core_ref: [stock/STOCK-CORE.md §9, §4.7]
tests: inline (vezi „Tests")
depends_on: [STOCK-110, STOCK-109]
status: pending
---

# STOCK-111 — Interfața modulului

## Goal
Modulul devine folosibil de cineva care n-a auzit de `fin_stock_doc`: un ecran în CRM, lângă
produsele pe care le vinde, cu cifrele care contează sus și acțiunile la un click.

## In scope
- `/business/crm/stoc` (`src/pages/business/crm/CrmStockPage.tsx`) cu patru vizualizări:
  1. **Stoc curent** — tabel articol × gestiune (pe mână / rezervat / disponibil / valoare),
     căutare, filtru pe gestiune și categorie;
  2. **Mișcări** — jurnalul cu filtre, iar un click pe articol deschide fișa de magazie;
  3. **Documente** — NIR-uri, ieșiri, transferuri, liste de inventariere, cu stare și număr;
  4. **Transfer nou** — formularul din STOCK-107.
- Bandă de indicatori sus: valoarea totală a stocului, câte articole sub pragul minim, câte
  facturi emise fără descărcare de gestiune (STOCK-106), câte rezervări descoperite (STOCK-109).
  Fiecare indicator e un filtru, nu doar un număr — se apasă și duce la lista lui.
- Coloana **„Stoc"** în `src/pages/business/crm/CrmProductsPage.tsx`: disponibilul, cu badge roșu
  sub prag și „—" pentru produsele fără fișă de stoc, plus butonul de legare din STOCK-103.
- Tile-ul „Stoc" în `CRM_MODULES` din `src/pages/business/crm/CrmHomePage.tsx` trece pe
  `available: true` (până acum stă „În curând", ca la celelalte submodule).
- Aplicarea drepturilor: `stock.view` vede tot, `stock.manage` postează. Fără `stock.manage`
  butoanele de acțiune **nu se randează**, iar rutele întorc 403 — poarta e pe server, ascunderea
  butonului e doar politețe.
- Stări goale (primul login: „n-ai nicio gestiune / niciun articol urmărit"), cu următorul pas
  concret, ca la CRM-128.
- Export CSV pe „Stoc curent" și pe fișa de magazie.

## Out of scope
- Vedere mobilă dedicată. Ecranul e responsive, dar fluxul de numărare pe telefon (STOCK-108) se
  optimizează separat, dacă gestionarul chiar numără de pe telefon.
- Grafice de evoluție — cer istoric (CORE §8.5).

## Decizii, cu motivul
- **Ecranul stă sub `/business/crm/`, nu sub `/business/fin/`.** Cine are nevoie de stoc e cel
  care vinde, iar el lucrează în CRM. `/business/fin/inventory` rămâne pentru evidența internă
  (consumabile, materiale didactice) și pentru contabil. Aceleași tabele, două uși — asta e
  diferența dintre două interfețe și două sisteme.
- **Indicatorii sunt filtre.** Un contor care nu duce nicăieri nu se folosește: omul îl vede, nu
  poate face nimic cu el, îl ignoră.
- **Verificarea de drepturi e pe server.** Un buton ascuns nu e o permisiune.

## Acceptance criteria
- [ ] Cele patru vizualizări randează și se filtrează; datele se potrivesc cu rutele din STOCK-110
- [ ] Indicatorii duc la lista corespunzătoare la click
- [ ] Coloana „Stoc" în Produse: disponibil corect, badge sub prag, „—" pentru produse fără fișă
- [ ] `stock.view` fără `stock.manage`: vede tot, niciun buton de acțiune randat, iar apelul
      direct al rutei de postare → **403**
- [ ] `student` / `parent` → 403 pe rute și tile invizibil
- [ ] Stări goale cu următorul pas concret, nu ecran alb
- [ ] Zero hex hardcodat în `.tsx`, doar tokeni semantici; funcționează în light ȘI dark
      (CLAUDE.md §3.1)
- [ ] Contrast ≥ 4.5:1, ținte ≥ 44×44px, `aria-label` pe butoanele doar-iconiță, `axe` fără
      violări critical/serious (CLAUDE.md §3.3)
- [ ] Sumele formatate `ro-RO` / moneda de bază, ca în `InventoryPage.tsx`
- [ ] Export CSV cu aceleași cifre ca ecranul

## Tests
`src/pages/business/crm/__tests__/CrmStockPage.test.tsx` (nou) +
`src/pages/business/crm/__tests__/CrmProductsPage.stock.test.tsx` (nou) + smoke de integrare.

Blocante:
1. `[blocant]` ecranul randează fără să crape, cu date mock pe toate cele patru vizualizări.
2. `[blocant]` un click pe indicatorul „sub prag" filtrează lista la exact acele articole.
3. `[blocant]` `stock.view` fără `stock.manage`: butoanele „NIR nou", „Transfer", „Postează" nu
   sunt în DOM; apelul direct al rutei → 403 (test pe server, nu doar pe UI).
4. `[blocant]` coloana „Stoc" arată `qty_available`, nu `qty_on_hand`, când există rezervări.
5. `[blocant]` produs fără fișă de stoc → „—" și butonul de legare, nu „0".
6. `[blocant]` stare goală (zero gestiuni) → mesaj cu următorul pas, nu tabel gol.
7. `[blocant]` `axe` fără violări critical/serious pe ecranul principal.
8. `[blocant]` smoke live API (CLAUDE.md §3.5.1): login → `GET /api/fin/stock/reports/on-hand`,
   `/docs`, `/locations` → toate 200 cu JSON-ul așteptat.

## Files
- `src/pages/business/crm/CrmStockPage.tsx` (nou) + `src/App.tsx`
- `src/pages/business/crm/CrmProductsPage.tsx` (coloana „Stoc")
- `src/pages/business/crm/CrmHomePage.tsx` (tile `available: true`)
- `src/lib/api/finStock.ts`
- `src/hooks/useCrmPermissions.ts` (drepturile noi)
- teste noi în `src/pages/business/crm/__tests__/`

## DoD
Standard.
