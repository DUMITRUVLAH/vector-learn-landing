# STOC — Secvența de build (driver pas-cu-pas)

> **Acesta e șoferul pentru modulul de stoc.** Se construiește **item cu item**, în ordinea de
> mai jos, dar se livrează **grupat pe fază: o fază = un branch = un PR** (CLAUDE.md §0.2).
>
> Regula de aur: **build → rulează testele item-ului → dacă pică, REPARĂ pe loc → abia apoi
> treci la următorul.** Un item cu teste roșii nu se închide.
>
> Sursa de adevăr pentru comportament: `backlog/stock/STOCK-CORE.md`. Dacă implementarea ajunge
> să difere de CORE, CORE se actualizează în ACELAȘI PR.

---

## Înainte de prima linie de cod — citește asta

Modulul **extinde FinDesk**, nu construiește un sistem nou (STOCK-CORE §0). Dacă în timpul
build-ului simți nevoia să creezi un al doilea catalog de articole, un al doilea jurnal de
mișcări sau un al doilea motor de cost — te-ai abătut. Ce se refolosește, cu calea:

- `server/db/schema/finInventory.ts` — `fin_inventory_items`, `fin_stock_movements`
- `server/lib/finInventoryEngine.ts` — CMP
- `server/routes/finInventory.ts` — rutele și hook-urile existente
- `server/db/schema/crmProducts.ts` — prețul, TVA-ul, moneda (NU le duplica)
- `server/db/schema/docs.ts` — `doc_number_sequences` pentru numerotare
- `server/lib/crm/permissions.ts` — matricea de drepturi

Reguli de migrare care nu se negociază (CLAUDE.md §0.2bis + §3.5.1):

1. prefixul migrării noi **> maximul de pe `origin/main`** (azi: `0175_par_teams.sql`);
2. `--> statement-breakpoint` între statements;
3. fiecare fișier nou `server/db/schema/X.ts` primește `export * from "./X";` în
   `server/db/schema/index.ts`, în ACELAȘI commit (altfel `db.query.X` e `undefined` → 500);
4. fiecare router nou se montează în `server/app.ts` în ACELAȘI commit;
5. **tabelele noi au nevoie de `ENSURE_STATEMENTS`** în `server/db/sync-schema.ts` (coloanele se
   vindecă generic, tabelele NU) — se adaugă un fișier `server/db/ensure/stock.ts`, după modelul
   `server/db/ensure/crmParity.ts`;
6. la finalul fazei: `npm run db:reset && npm run db:seed` verzi.

---

## Testul care se scrie PRIMUL: izolarea multi-tenant

**Înainte de orice rută de stoc**, la STOCK-101, se scrie
`server/__tests__/stock-isolation.routes.test.ts`, cu două tenant-uri complete (A și B) în
PGlite, după modelul din `server/__tests__/crm-lead-product.routes.test.ts`. Testul crește la
fiecare fază: fiecare item nou își adaugă resursele în el.

Ce verifică, pentru FIECARE resursă nouă (gestiune, sold, document, rând, rezervare, mișcare):

- `GET` lista ca tenant A → nu conține niciun rând al lui B;
- `GET /:id` cu un id real al lui B → **404**, nu 403, nu 200;
- `PATCH` / `POST .../post` / `DELETE` pe un id al lui B → **404**, iar rândul lui B rămâne
  neschimbat (se reverifică în DB după apel, nu doar codul de status);
- un document al lui A nu poate referi o gestiune sau un articol al lui B → **404 / 422**, nu FK
  error 500;
- rapoartele lui A nu însumează niciun cent de-al lui B (valoarea stocului lui A calculată
  manual == valoarea întoarsă de rută).

De ce primul: nu există RLS în aplicație, deci izolarea e o convenție ținută de fiecare query în
parte. O convenție fără test se pierde la al treilea item. Un `404` returnat în loc de `403` face
parte din test, nu e un detaliu de stil — un 403 confirmă că resursa există.

---

## Faza A — Temelia: gestiuni, solduri, legătura cu catalogul

> Ce livrează: stocul capătă dimensiunea „unde" și se leagă de produsele pe care firma le vinde.
> Nu se vede încă nimic nou în interfață în afară de ecranul de gestiuni.

| Item | Titlu | Spec | CORE ref | Depinde de |
|---|---|---|---|---|
| `STOCK-101` | Gestiuni (`fin_stock_locations`) + testul de izolare multi-tenant | [STOCK-101](../specs/STOCK-101-gestiuni.md) | §2.2, §4.7 | — |
| `STOCK-102` | Sold pe gestiune (`fin_stock_balances`) + migrarea stocului existent | [STOCK-102](../specs/STOCK-102-solduri-gestiune.md) | §2.3, §2.6 | STOCK-101 |
| `STOCK-103` | Legătura produs CRM ↔ fișă de stoc + unitate înghețată | [STOCK-103](../specs/STOCK-103-legatura-produs.md) | §2.4, §4.3 | STOCK-102 |

**Testul care contează în faza A**: izolarea multi-tenant (mai sus) **și** consistența soldurilor
— `Σ fin_stock_balances.qty_on_hand = fin_inventory_items.qty_on_hand` pe fiecare articol, după
migrare și după fiecare operațiune. Faza A introduce o redundanță deliberată (STOCK-CORE §2.3);
testul e prețul ei.

**Efort: ~4 zile.** (101: 1,5 z — tabelă, rute CRUD, ecran simplu, testul de izolare de la zero.
102: 1,5 z — tabelă + migrarea datelor istorice, care e partea lentă. 103: 1 z.)

**Branch**: `feat/STOCK-faza-A-temelie` → un PR.

---

## Faza B — Documentele: intrări, ieșiri, transferuri

> Ce livrează: marfa intră și iese pe baza unui document cu număr, nu prin scriere directă în
> jurnal. Aici se mută greutatea modulului.

| Item | Titlu | Spec | CORE ref | Depinde de |
|---|---|---|---|---|
| `STOCK-104` | Documentul de stoc (`fin_stock_docs` + linii) + ciclul draft→posted→reversed | [STOCK-104](../specs/STOCK-104-document-stoc.md) | §2.5, §5 | STOCK-103 |
| `STOCK-105` | Recepția (NIR): postare cu recalculare CMP, numerotare, valută | [STOCK-105](../specs/STOCK-105-receptie-nir.md) | §6.1, §4.6 | STOCK-104 |
| `STOCK-106` | Ieșirea la vânzare din factură + ieșirea manuală, idempotent și atomic | [STOCK-106](../specs/STOCK-106-iesire-vanzare.md) | §6.2, §6.3, §4.8 | STOCK-105 |
| `STOCK-107` | Transferul între gestiuni | [STOCK-107](../specs/STOCK-107-transfer.md) | §6.4 | STOCK-106 |

**Testul care contează în faza B**: **invariantul de valoare**. Trei aserțiuni blocante, rulate
după fiecare tip de document:

1. după un transfer, `Σ (qty × avg_cost)` pe tenant e **identică** cu valoarea dinainte;
2. după o recepție, valoarea crește exact cu `Σ line_total_cents` al documentului;
3. suma `qty_signed` din jurnal, pe articol × gestiune, e **egală** cu
   `fin_stock_balances.qty_on_hand` — jurnalul și soldul nu pot diverge.

Plus: postarea e atomică (un rând fără stoc → zero rânduri scrise, verificat în DB) și
idempotentă (aceeași factură procesată de două ori → un singur document de ieșire).

**Efort: ~7 zile.** (104: 2 z — tabelele, tranzacția de postare, stornarea. 105: 2 z — numerotare
+ valută + ecran de NIR. 106: 2 z — cârligul pe factură, idempotența, rescrierea lui
`hook/invoice-issued` ca să treacă prin document și să fie tranzacțional. 107: 1 z.)

**Branch**: `feat/STOCK-faza-B-documente` → un PR.

---

## Faza C — Controlul: inventariere și rezervări

> Ce livrează: evidența se poate confrunta cu realitatea din raft, iar vânzătorii nu mai promit
> aceeași marfă de două ori.

| Item | Titlu | Spec | CORE ref | Depinde de |
|---|---|---|---|---|
| `STOCK-108` | Inventarierea: listă, numărare, ajustări la postare | [STOCK-108](../specs/STOCK-108-inventariere.md) | §6.6, §4.1 | STOCK-107 |
| `STOCK-109` | Rezervarea la ofertă + disponibil = pe mână − rezervat | [STOCK-109](../specs/STOCK-109-rezervari.md) | §2.7, §6.5 | STOCK-106 |

**Testul care contează în faza C**: cursa pe aceeași marfă. Două oferte rezervă simultan
ultimele bucăți → a doua vede disponibil redus; o vânzare reală trece peste rezervare și
rezervarea rămasă apare marcată „descoperită"; o listă de inventariere deschisă înainte de o
vânzare care s-a produs între timp NU suprascrie tăcut soldul, ci întoarce `409 stale_count` cu
lista articolelor mișcate.

**Efort: ~4 zile.** (108: 2,5 z — generarea listei, înghețarea scripticului, ecranul de
completare, `409`-ul de concurență. 109: 1,5 z.)

**Branch**: `feat/STOCK-faza-C-control` → un PR.

---

## Faza D — Ce vede omul: rapoarte și ecranul din CRM

> Ce livrează: modulul devine utilizabil de cineva care nu știe ce e un `fin_stock_doc`.

| Item | Titlu | Spec | CORE ref | Depinde de |
|---|---|---|---|---|
| `STOCK-110` | Rapoarte: fișa de magazie, stoc pe gestiune, valoare, sub prag | [STOCK-110](../specs/STOCK-110-rapoarte.md) | §8 | STOCK-108 |
| `STOCK-111` | Ecranul de stoc în CRM + coloana „Stoc" în Produse + permisiuni | [STOCK-111](../specs/STOCK-111-ecran-crm.md) | §9, §4.7 | STOCK-110, STOCK-109 |

**Testul care contează în faza D**: fișa de magazie **se închide** — soldul inițial plus toate
intrările minus toate ieșirile din perioadă e egal cu soldul final afișat, pe date generate
aleator (recepții, vânzări, transferuri, ajustări amestecate). Un raport de stoc care nu se
închide e mai rău decât niciun raport: cineva îl va crede.

Plus, pentru ecran: `stock.view` fără `stock.manage` vede totul și nu poate posta nimic (butoanele
lipsesc ȘI ruta întoarce 403); `student`/`parent` primesc 403 peste tot.

**Efort: ~4,5 zile.** (110: 2 z — inclusiv extinderea rutelor existente `stock-value` și
`report/period` în loc de rute noi. 111: 2,5 z — ecranul are patru vizualizări și trebuie să
treacă porțile de design-system, dark mode și a11y din CLAUDE.md §3.1–3.3.)

**Branch**: `feat/STOCK-faza-D-interfata` → un PR.

---

## Rezumat efort

| Fază | Item-uri | Zile |
|---|---|---|
| A — Temelia | 101, 102, 103 | ~4 |
| B — Documentele | 104, 105, 106, 107 | ~7 |
| C — Controlul | 108, 109 | ~4 |
| D — Interfața | 110, 111 | ~4,5 |
| **Total** | **11 item-uri** | **~19,5 zile** |

Estimările presupun un singur constructor care lucrează pe rând, cu gate-urile de teste rulate
după fiecare item. Nu includ timpul de review și nici fixurile de după personas.

---

## Diagrama dependențelor

```
STOCK-101 ──► STOCK-102 ──► STOCK-103 ──► STOCK-104 ──► STOCK-105 ──► STOCK-106 ──┬──► STOCK-107 ──► STOCK-108 ──► STOCK-110 ──► STOCK-111
                                                                                   └──► STOCK-109 ───────────────────────────────────┘
```

Ordinea liniară pentru autopilot:
`STOCK-101 → 102 → 103 → 104 → 105 → 106 → 107 → 108 → 109 → 110 → 111`

---

## Definiția de „done" per item

- [ ] Tot ce e „In scope" din spec, implementat; nimic în plus (CLAUDE.md §3.7)
- [ ] Toate scenariile blocante din secțiunea „Tests" a specului, verzi
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, testele zonei — verzi
- [ ] Migrare generată și commisă; prefix > maximul de pe `origin/main`; breakpoint-uri prezente
- [ ] Tabelă nouă → `export *` în `server/db/schema/index.ts` + `ENSURE_STATEMENTS`
- [ ] Router nou → montat în `server/app.ts`
- [ ] Testul de izolare multi-tenant extins cu resursele item-ului
- [ ] Consistent cu `STOCK-CORE.md` (dacă diferă, CORE e actualizat în același PR)

---

## Backlog descoperit

> Orice comportament din CORE neacoperit de specul curent se notează aici și **nu** se
> implementează pe furiș în PR-ul curent.
> Format: `- [STOCK-CORE §X.Y] descriere scurtă → propus item STOCK-NNN`.

Deja cunoscute la scriere, lăsate deliberat în afara secvenței (STOCK-CORE §11):

- [STOCK-CORE §11.1] nota contabilă automată către `fin_ledger` → propus item STOCK-201
- [STOCK-CORE §11.2] comenzi de aprovizionare pornind de la pragul minim → propus item STOCK-202
- [STOCK-CORE §4.4] loturi, serii, termene de valabilitate (cere schimbarea metodei de
  evaluare din CMP în FIFO) → modul separat, CORE propriu
- [STOCK-CORE §1] coduri de bare și scanare → propus item STOCK-203
- [STOCK-CORE §8.5] rapoarte analitice (rotație, stoc mort, ABC, marjă) — după 6 luni de date
  reale, nu înainte

Găsit în cod în timpul scrierii backlogului, de reparat la item-ul care atinge zona:

- `server/routes/finInventory.ts`, ramura `adjustment`, scrie cantități negative în
  `fin_stock_movements.qty`, deși schema o documentează ca „mereu pozitivă". Orice agregare pe
  `qty` e azi greșită pentru ajustări. Se închide la **STOCK-102** prin `qty_signed`
  (STOCK-CORE §2.6).
- `POST /api/fin/inventory/hook/invoice-issued` verifică stocul „toate sau nimic", dar apoi
  scrie rând cu rând fără tranzacție: o eroare la al treilea din cinci rânduri lasă gestiunea pe
  jumătate descărcată. Se închide la **STOCK-106**.
