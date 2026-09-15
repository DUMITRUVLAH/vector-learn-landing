# STOC — Documentația CORE a modulului

> **Acesta este documentul „cap-coadă" al modulului de stoc.** Tot ce ține de gestiuni,
> recepție, ieșire, transfer, inventariere, rezervare și evaluare se descrie aici. Nicio
> decizie de comportament nu trăiește doar în cod — trăiește aici.
>
> Specurile din `backlog/specs/STOCK-1xx-*.md` sunt unitățile buildabile; ele referă
> secțiunile de aici. Ordinea de build e în `backlog/stock/BUILD-SEQUENCE.md`.
>
> Cerința ownerului (14.09.2026): „avem produse, hai să facem și stoc ca să putem avea
> stock management". Modulul se așază PESTE catalogul de produse CRM existent
> (`crm_products`), nu lângă el.

---

## 0. Decizia care ține tot documentul: nu construim un al doilea sistem de stoc

Înainte de orice, ce EXISTĂ deja în aplicație și atinge stocul:

| Ce | Unde | Ce face azi |
|---|---|---|
| Catalogul de articole de inventar | `server/db/schema/finInventory.ts` → `fin_inventory_items` | denumire, SKU, unitate, `qty_on_hand`, `avg_cost_cents` (CMP), prag minim, categorie |
| Jurnalul de mișcări | `server/db/schema/finInventory.ts` → `fin_stock_movements` | `purchase / sale / adjustment / transfer_in / transfer_out`, cost unitar, cost total, referință, `invoice_id`, `branch_id`, `moved_by` |
| Motorul de evaluare CMP | `server/lib/finInventoryEngine.ts` | `calculateAvgCost`, `calculateExitCost`, `isInbound`, `isOutbound` |
| Rutele | `server/routes/finInventory.ts` | `/api/fin/inventory` — items, movements, `stock-value`, `hook/invoice-issued`, `hook/purchase`, rapoarte `report/stock-snapshot` și `report/period` |
| Clientul de API | `src/lib/api/finInventory.ts` | tipuri + fetchere |
| Ecranele | `src/pages/app/InventoryPage.tsx`, `src/pages/app/InventoryReportPage.tsx` | `/business/fin/inventory` — articole, mișcări, adaugă mișcare, rapoarte |
| Catalogul comercial | `server/db/schema/crmProducts.ts` → `crm_products` | preț de listă în cenți, TVA, monedă, unitate, SKU, activ/arhivat |
| Ofertele/actele care consumă catalogul | `server/routes/crmDocuments.ts` → `doc_documents` + `doc_document_lines` | transformă produsele CRM în rânduri de act, cu preț și TVA |
| Facturarea B2B | `server/db/schema/finInvoices.ts` → `fin_invoices` + `fin_invoice_lines` | facturi cu rânduri, TVA pe rând |
| Numerotarea documentelor | `server/db/schema/docs.ts` → `doc_number_sequences` | rezervare de număr la finalizare, per tenant + an |
| Cursurile valutare | `server/db/schema/finExchangeRates.ts` | curs BNM per pereche + zi |
| Moneda de bază a workspace-ului | `server/db/schema/finCore.ts` → `base_currency` (implicit `MDL`) | — |

**Concluzia: motorul de stoc EXISTĂ.** Ce lipsește nu e „stoc", ci patru lucruri: dimensiunea
*gestiune*, documentele care justifică mișcările (NIR, bon de ieșire, aviz de transfer, listă de
inventariere), legătura cu ce vindem efectiv (`crm_products`) și rezervarea la ofertă.

Deci modulul ăsta **extinde FinDesk**, nu ridică un sistem paralel. Concret:

- **Se REFOLOSEȘTE** `fin_stock_movements` ca jurnal unic al mișcărilor
  (`server/db/schema/finInventory.ts`). Nu se creează un al doilea jurnal.
- **Se REFOLOSEȘTE** `server/lib/finInventoryEngine.ts` ca motor de evaluare. Se extinde cu
  funcții noi, nu se rescrie.
- **Se REFOLOSEȘTE** `fin_inventory_items` ca *fișă de stoc* a articolului. Primește coloane noi
  (legătura cu produsul comercial, gestiunea implicită), nu e înlocuit.
- **Se REFOLOSEȘTE** `crm_products` ca singura sursă de adevăr pentru preț, TVA și monedă.
  Modulul de stoc NU ține prețuri de vânzare.
- **Se REFOLOSEȘTE** `doc_number_sequences` (`server/db/schema/docs.ts`) pentru numerotarea
  NIR-urilor și a avizelor. Nu se scrie un al doilea numerotator.
- **Se REFOLOSEȘTE** `fin_exchange_rates` pentru recepțiile în valută.
- **Sunt NOI** doar: gestiunile, soldul pe gestiune, documentele de stoc și rezervările.

De ce contează asta explicit: CLAUDE.md §3.5.1 numește `COMPETING_SYSTEM` drept motiv de
respingere a unui PR, iar repo-ul a mai pățit-o de două ori (două sisteme de notificări, două
motoare de acte — vezi antetul din `server/routes/crmDocuments.ts`). Un al doilea catalog de
articole ar însemna că întrebarea „câte bucăți din produsul X avem" are două răspunsuri.

---

## 1. Ce este (și ce nu este) modulul

**Este**: evidența cantitativ-valorică a mărfurilor și materialelor pe care firma le cumpără,
le ține în una sau mai multe gestiuni și le vinde sau le consumă. Răspunde la patru întrebări:
*cât avem*, *unde avem*, *cât valorează* și *cine a mișcat marfa și pe ce document*.

**Nu este**:

- **Nu e WMS.** Fără locații de raft, fără rute de culegere, fără terminale RF, fără optimizarea
  drumului prin depozit. Un WMS are sens de la câteva mii de linii pe zi; clientul plătitor e o
  firmă care emite zeci de documente pe lună.
- **Nu e sistem de coduri de bare.** Fără scanare, fără generare de etichete, fără EAN-13.
  Motivul: scanarea are valoare doar când numărul de linii pe document depășește ce poate fi
  tastat comod, iar azi nu-l depășește. Când va fi nevoie, `fin_inventory_items.sku` e deja
  locul unde stă codul — se adaugă un câmp `barcode` și un input de scanner, fără schimbare de
  model. Nu construim azi hardware-ul pe care nu-l are nimeni.
- **Nu e producție.** Fără rețete, fără consum de materii prime în produs finit, fără bonuri de
  consum pe comandă de producție. Firma cumpără și revinde; când va produce, e alt modul.
- **Nu e contabilitate de stoc pe conturi.** Modulul produce *valoarea* stocului și mișcările;
  nota contabilă (211/217 vs 711) nu se generează aici. Legătura cu `fin_ledger` e enumerată la
  §11 ca extindere, nu ca scop al fazei.
- **Nu ține prețuri de vânzare.** Prețul e în `crm_products.list_price_cents`. Stocul ține
  costuri, nu prețuri. Două locuri cu preț = două prețuri diferite peste trei luni.
- **Nu e pentru materialele didactice ale școlii.** Alea trăiesc deja în `fin_inventory_items`
  fără legătură cu `crm_products` (categoriile `consumabile`, `materiale_didactice`,
  `papetarie`). Modulul le acoperă în continuare — aceleași tabele — dar ecranul nou e construit
  pentru marfa comercială.

---

## 2. Model de date

### 2.1 Regula care se aplică fiecărei tabele noi

Fiecare tabelă nouă are `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` și cel
puțin un index care începe cu `tenant_id`. Nu există RLS în aplicație — **fiecare query din rute
filtrează explicit pe `tenant_id`**. Un `id` care există, dar aparține altui tenant, se întoarce
ca **404, nu 403**: un 403 confirmă că resursa există, deci e o scurgere de informație. Asta e
regula deja aplicată în `server/routes/crmProducts.ts` și `server/routes/finInventory.ts`.

Toate sumele de bani sunt întregi în cenți, în coloane `*_cents`, ca în tot restul aplicației
(`crm_products.list_price_cents`, `fin_inventory_items.avg_cost_cents`). Fără `float`, fără
`numeric` pentru bani.

### 2.2 `fin_stock_locations` — gestiunile (NOU)

O gestiune = un loc fizic sau logic cu un gestionar responsabil. Depozit central, magazin,
mașina unui agent, „marfă la client în custodie".

| Coloană | Tip | Note |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL → tenants | cascade |
| `code` | varchar(30) NOT NULL | cod scurt („DEP", „MAG1") — apare pe documente |
| `name` | varchar(200) NOT NULL | |
| `branch_id` | uuid NULL | filiala, dacă tenantul le folosește (`branches`); fără FK hard, ca în `fin_stock_movements.branch_id` |
| `manager_user_id` | uuid NULL → users | gestionarul responsabil; `set null` la ștergerea userului |
| `is_default` | boolean NOT NULL DEFAULT false | gestiunea implicită a tenantului |
| `is_active` | boolean NOT NULL DEFAULT true | arhivare, niciodată DELETE |
| `created_at` / `updated_at` | timestamptz | |

Indecși: `fin_stock_locations_tenant_idx (tenant_id)`,
`fin_stock_locations_code_uniq UNIQUE (tenant_id, code)`.

**Regula „exact o gestiune implicită per tenant"** se impune în rută, nu în DB (un index parțial
unic ar bloca tranziția când utilizatorul mută implicitul). La setarea uneia noi, ruta o
debifează pe precedenta în aceeași tranzacție.

**Migrarea datelor existente**: fiecare tenant care are măcar un rând în `fin_inventory_items`
primește o gestiune `code='PRINCIPAL'`, `is_default=true`, iar tot `qty_on_hand` existent se
așază în ea (§2.3). Fără pasul ăsta, stocul de azi ar deveni invizibil în ecranele noi — și asta
e exact genul de „feature livrat care strică ce mergea" pe care CLAUDE.md §3.5.1ter îl
interzice.

### 2.3 `fin_stock_balances` — soldul pe articol × gestiune (NOU)

| Coloană | Tip | Note |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL → tenants | |
| `item_id` | uuid NOT NULL → fin_inventory_items | `on delete restrict` |
| `location_id` | uuid NOT NULL → fin_stock_locations | `on delete restrict` |
| `qty_on_hand` | bigint NOT NULL DEFAULT 0 | cantitate fizică în gestiunea asta |
| `qty_reserved` | bigint NOT NULL DEFAULT 0 | rezervat de oferte (§6.5); întreținut de STOCK-109 |
| `updated_at` | timestamptz | |

Indecși: `fin_stock_balances_tenant_idx (tenant_id)`,
`fin_stock_balances_item_loc_uniq UNIQUE (tenant_id, item_id, location_id)`,
`fin_stock_balances_loc_idx (tenant_id, location_id)`.

**Disponibilul** nu e o coloană: `qty_available = qty_on_hand − qty_reserved`, calculat la
citire. O a treia coloană derivată ar fi al treilea loc care se poate desincroniza.

**`fin_inventory_items.qty_on_hand` rămâne** și devine *totalul pe tenant* — suma soldurilor pe
gestiuni, întreținută în aceeași tranzacție cu balanța. De ce păstrăm redundanța, deși în
general e o greșeală: rutele și ecranele existente (`/api/fin/inventory/items`, `InventoryPage`,
`stock-value`) citesc coloana asta azi. Dacă o golim, tot ce merge acum se rupe. Un test de
consistență (`Σ balances.qty_on_hand = items.qty_on_hand` pe fiecare articol) e **blocant** la
STOCK-102 — redundanța e acceptabilă doar cât timp e verificată.

### 2.4 `fin_inventory_items` — coloane noi (EXTINDERE)

| Coloană nouă | Tip | De ce |
|---|---|---|
| `crm_product_id` | uuid NULL | fișa de stoc a unui produs comercial din `crm_products`. `NULL` = articol intern (consumabile, materiale didactice) care nu se vinde. FK declarat în migrare, nu în fișierul de schemă — exact cum s-a procedat la `leads.product_id` (migrarea 0171), ca schema să nu depindă de ordinea importurilor |
| `default_location_id` | uuid NULL → fin_stock_locations | gestiunea propusă în formulare |
| `is_stock_tracked` | boolean NOT NULL DEFAULT true | un serviciu din catalog (consultanță, training) nu are stoc; fără flag, ecranul „sub prag minim" ar urla despre servicii |

Index nou: `fin_inventory_items_product_uniq UNIQUE (tenant_id, crm_product_id) WHERE crm_product_id IS NOT NULL`.

**Un produs comercial are cel mult o fișă de stoc.** Dacă ar avea două, „câte bucăți avem din
produsul X" ar avea din nou două răspunsuri — fix problema pe care catalogul `crm_products` a
rezolvat-o când a înlocuit textul liber (vezi antetul din `server/db/schema/crmProducts.ts`).

**Unitatea de măsură** se ia din `crm_products.unit` la crearea legăturii și se îngheață în
`fin_inventory_items.unit`. După prima mișcare, unitatea nu se mai poate schimba — cantitățile
istorice sunt exprimate în ea, iar o schimbare ar rescrie retroactiv sensul întregului jurnal.
Ruta întoarce `409 unit_locked`. Atenție la o nepotrivire reală care trebuie rezolvată la
STOCK-103: `crm_products.unit` e `varchar(30)` liber, iar `finInventory` validează un enum
(`buc | kg | l | m | set | pachet`). Legarea unui produs cu unitate în afara listei se respinge
cu `422 unsupported_unit` și un mesaj care spune ce unități sunt acceptate — NU se convertește
tăcut la `buc`.

### 2.5 `fin_stock_docs` + `fin_stock_doc_lines` — documentele de stoc (NOU)

**O singură pereche de tabele pentru toate cele patru documente**, cu discriminatorul `kind`:

- `reception` — NIR, intrare de marfă de la furnizor
- `issue` — bon de ieșire / livrare către client
- `transfer` — aviz de transfer între două gestiuni
- `count` — listă de inventariere

De ce una și nu patru perechi: toate au aceeași formă — antet (număr, dată, gestiune, stare
`draft → posted → reversed`, cine l-a făcut) și rânduri (articol, cantitate, cost). Patru perechi
de tabele ar însemna patru copii ale logicii de postare, iar a cincea copie ar diverge de
prima. Costul deciziei, spus pe față: câteva coloane sunt folosite doar de un `kind`
(`to_location_id` doar la transfer, `qty_counted` doar la inventariere) și rămân `NULL` în rest.
Am ales lățimea în loc de duplicare — coloanele nule nu produc bug-uri, logica duplicată da.

`fin_stock_docs`:

| Coloană | Tip | Note |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL → tenants | |
| `kind` | varchar(20) NOT NULL | `reception` / `issue` / `transfer` / `count` |
| `doc_number` | varchar(50) NULL | rezervat la POSTARE, nu la ciornă — ca la `doc_documents.doc_number`; o ciornă ștearsă nu trebuie să lase o gaură în numerotare |
| `doc_year` | integer NULL | anul de numerotare, ținut separat ca unicitatea să nu depindă de fus orar (identic cu `docs.ts`) |
| `status` | varchar(20) NOT NULL DEFAULT 'draft' | `draft` / `posted` / `reversed` |
| `doc_date` | date NOT NULL | data operațiunii (poate diferi de `created_at`) |
| `location_id` | uuid NOT NULL → fin_stock_locations | gestiunea sursă (la `reception`: destinația) |
| `to_location_id` | uuid NULL → fin_stock_locations | doar `kind='transfer'` |
| `party_id` | uuid NULL | furnizorul/clientul din `fin_parties`; fără FK hard, ca în `fin_invoices.party_id` |
| `source_kind` | varchar(30) NULL | `crm_document` / `fin_invoice` / `manual` |
| `source_id` | uuid NULL | id-ul actului/facturii care a generat documentul; polimorf, deci fără FK (ca `doc_documents.counterparty_id`) |
| `currency` | varchar(3) NOT NULL DEFAULT 'MDL' | moneda documentului sursă |
| `fx_rate` | numeric(18,6) NOT NULL DEFAULT 1 | curs la `doc_date` către moneda de bază |
| `total_cost_cents` | bigint NOT NULL DEFAULT 0 | calculat pe server din rânduri, în **moneda de bază**; niciodată preluat din client |
| `notes` | text NULL | |
| `reversal_of_id` | uuid NULL → fin_stock_docs | stornarea (§5.4) |
| `created_by` / `posted_by` | uuid NULL → users | |
| `posted_at` | timestamptz NULL | |
| `created_at` / `updated_at` | timestamptz | |

Indecși: `(tenant_id)`, `(tenant_id, kind, status)`, `(tenant_id, location_id)`,
`UNIQUE (tenant_id, kind, doc_year, doc_number) WHERE doc_number IS NOT NULL`,
`(tenant_id, source_kind, source_id)` — ultimul e cel care face idempotența de la §6.3
o căutare, nu o scanare.

`fin_stock_doc_lines`:

| Coloană | Tip | Note |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL → tenants | |
| `doc_id` | uuid NOT NULL → fin_stock_docs | `on delete cascade` |
| `position` | integer NOT NULL DEFAULT 1 | |
| `item_id` | uuid NOT NULL → fin_inventory_items | `on delete restrict` |
| `qty` | bigint NOT NULL | mereu > 0; direcția o dă `kind` |
| `unit_cost_cents` | bigint NOT NULL DEFAULT 0 | la intrare: costul de achiziție **în moneda de bază**; la ieșire: se completează de server cu CMP-ul din momentul postării |
| `line_total_cents` | bigint NOT NULL DEFAULT 0 | `qty × unit_cost_cents`, calculat pe server |
| `qty_counted` | bigint NULL | doar `kind='count'`: cantitatea faptică numărată |
| `qty_expected` | bigint NULL | doar `kind='count'`: cantitatea scriptică, înghețată la deschiderea listei |
| `notes` | text NULL | |
| `created_at` | timestamptz | |

Indecși: `(tenant_id)`, `(doc_id)`, `(tenant_id, item_id)`.

### 2.6 `fin_stock_movements` — coloane noi (EXTINDERE)

| Coloană nouă | Tip | De ce |
|---|---|---|
| `location_id` | uuid NULL → fin_stock_locations | gestiunea în care s-a petrecut mișcarea. `NULL` doar pentru mișcările istorice, dinainte de modul — migrarea le atribuie gestiunii `PRINCIPAL` |
| `doc_id` | uuid NULL → fin_stock_docs | documentul care a produs mișcarea; `NULL` = mișcare manuală veche |
| `qty_signed` | bigint NULL | cantitatea cu semn (+ intrare / − ieșire) |

Despre `qty_signed`: coloana `qty` existentă e documentată „mereu pozitivă — tipul determină
direcția", dar ruta actuală scrie pe `adjustment` valori negative direct în `qty`
(`server/routes/finInventory.ts`, ramura `adjustment`). Deci contractul e deja încălcat în cod,
iar orice sumă pe jurnal e azi greșită pentru ajustări. `qty_signed` devine **singura** coloană
din care se calculează solduri și fișa de magazie; `qty` rămâne neatinsă ca să nu rupem
ecranele existente, iar migrarea o completează pe cea nouă din datele vechi (semnul dedus din
`movement_type`, iar pentru `adjustment` din semnul lui `qty`). Coloana veche se marchează în
comentariul de schemă drept „istorică, nu o folosi la agregări".

Index nou: `fin_stock_movements_item_loc_idx (tenant_id, item_id, location_id, moved_at)` —
fișa de magazie (§8.1) e exact interogarea asta.

### 2.7 `fin_stock_reservations` — rezervările (NOU)

| Coloană | Tip | Note |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL → tenants | |
| `item_id` | uuid NOT NULL → fin_inventory_items | |
| `location_id` | uuid NOT NULL → fin_stock_locations | |
| `qty` | bigint NOT NULL | > 0 |
| `source_kind` | varchar(30) NOT NULL | `crm_document` (ofertă) — singurul azi |
| `source_id` | uuid NOT NULL | `doc_documents.id` al ofertei |
| `status` | varchar(20) NOT NULL DEFAULT 'active' | `active` / `consumed` / `released` |
| `expires_at` | timestamptz NULL | rezervarea expiră odată cu valabilitatea ofertei |
| `created_by` | uuid NULL → users | |
| `created_at` / `updated_at` | timestamptz | |

Indecși: `(tenant_id)`, `(tenant_id, item_id, location_id, status)`,
`UNIQUE (tenant_id, source_kind, source_id, item_id, location_id)` — o ofertă rezervă o singură
dată per articol per gestiune; retrimiterea aceleiași oferte nu dublează rezervarea.

### 2.8 Ce NU se adaugă și de ce

- **`fin_stock_lots` (loturi/serii)** — amânat, vezi §4.4.
- **`barcode`** pe articol — amânat împreună cu scanarea (§1).
- **Coloană `qty_available`** — derivată, vezi §2.3.
- **Un tabel de prețuri de vânzare** — `crm_products` îl are deja.
- **Un tabel de furnizori** — `fin_parties` îl are deja; `fin_stock_docs.party_id` îl referă.

---

## 3. Harta relațiilor (cine cu cine)

```
crm_products ──(0..1)── fin_inventory_items ──(1..n)── fin_stock_balances ──(n..1)── fin_stock_locations
   │ preț, TVA, monedă        │ CMP, unitate,              │ qty pe gestiune              │ cod, gestionar
   │                          │ prag minim                 │
   │                          └──(1..n)── fin_stock_movements ──(n..0..1)── fin_stock_docs
   │                                          │ jurnal, cost                  │ NIR / bon / aviz / inventariere
   │                                          │                               │
doc_documents (ofertă CRM) ────────────────────┴───────────────────────────────┤ source_kind='crm_document'
fin_invoices (factură B2B) ────────────────────────────────────────────────────┘ source_kind='fin_invoice'
        │
        └── fin_stock_reservations (rezervă la ofertă, eliberează la facturare sau la expirare)
```

---

## 4. Regulile de business (deciziile, cu motivul lângă ele)

### 4.1 Stocul negativ e INTERZIS

O ieșire care ar duce soldul gestiunii sub zero se respinge cu `422 insufficient_stock` și cu
`{ itemId, locationId, available, requested }` în corp — formatul e deja cel din
`server/routes/finInventory.ts`.

De ce nu-l permitem, nici măcar ca opțiune: metoda de evaluare e costul mediu ponderat (§4.2),
iar CMP-ul pe o cantitate negativă nu are înțeles matematic — împarți la un numitor negativ și
obții un cost unitar negativ care otrăvește toate ieșirile următoare. Sistemele care permit
stoc negativ o fac având FIFO cu straturi și o procedură de „recostare retroactivă"; noi nu
avem nici straturi, nici recostare. Cine a vândut înainte să înregistreze intrarea
înregistrează întâi NIR-ul, cu data reală — documentul are `doc_date` propriu tocmai pentru
asta.

Excepție unică, controlată: **inventarierea** poate scădea stocul, dar niciodată sub zero
(minusul de inventar nu poate depăși ce era scriptic).

### 4.2 Evaluarea: Cost Mediu Ponderat (CMP), nu FIFO

**Ales: CMP.** Trei motive, în ordinea greutății:

1. **Există deja și funcționează.** `server/lib/finInventoryEngine.ts` implementează CMP-ul,
   iar `fin_inventory_items.avg_cost_cents` conține date reale. FIFO ar cere straturi de lot,
   rescrierea motorului și o migrare care ar trebui să inventeze straturi pentru stocul istoric
   — adică să inventeze cifre care n-au existat.
2. **E metoda pe care o cere contabilul local.** SNC 2 (Moldova) admite CMP, iar clientul
   plătitor își ține evidența în MDL, pe firma din Chișinău. FIFO e permis, dar nu e ce se
   folosește, iar raportul din aplicație trebuie să semene cu ce depune contabilul.
3. **Fără loturi, FIFO e oricum o ficțiune.** FIFO are sens când știi care lot pleacă. Fără
   `fin_stock_lots` (§4.4), „FIFO" ar fi doar o coadă contabilă — complexitate fără informație.

Formula, implementată: `new_avg = (old_qty × old_avg + qty_in × unit_cost) / (old_qty + qty_in)`,
cu `Math.floor` la cent. La ieșire, CMP-ul NU se modifică; valoarea ieșirii e `qty × avg_cost`.

**CMP-ul e la nivel de articol și de tenant, NU pe gestiune.** Cantitatea se ține pe gestiune,
valoarea nu. De ce: evaluarea contabilă se face pe entitate, nu pe depozit — o pereche de
pantofi nu valorează altceva fiindcă a fost mutată în alt raft. Consecința directă, importantă:
**un transfer între gestiuni nu schimbă valoarea stocului** (§6.4), ceea ce face transferul o
operațiune sigură, imposibil de folosit pentru a umfla sau tăia rezultatul.

### 4.3 Unitatea de măsură: una singură, înghețată

Vezi §2.4. Fără conversii între unități (cutie ↔ bucată), fără unități secundare. Un articol se
numără într-un singur fel. Conversiile sunt exact locul unde apar erorile de 12× în stoc și cer
un tabel de factori pe care nimeni nu l-a cerut.

### 4.4 Loturi și serii: AMÂNATE, explicit

Nu intră în acest modul. Motivele:

- Nimeni nu le-a cerut. Cererea ownerului e „stoc peste produse", nu trasabilitate pe lot.
- Ar anula decizia de la §4.2: loturile există ca să poți evalua FIFO/LIFO și să urmărești
  termene de valabilitate. Dacă adaugi loturi, CMP-ul devine metoda greșită, iar motorul
  existent se aruncă.
- Costul lor nu e o tabelă, e o dimensiune nouă pe *fiecare* rând de document, pe *fiecare*
  mișcare și pe *fiecare* sold — adică rescrierea a tot ce livrează fazele A–D.

Când vor fi cerute (marfă cu termen de valabilitate, medicamente, echipamente cu serie), se
deschide un modul separat cu propriul CORE: `fin_stock_lots` + `lot_id` pe rândurile de
document, mișcări și solduri, plus schimbarea metodei de evaluare. Nu lăsăm azi coloane goale
„pentru mai târziu": o coloană `lot_code` nefolosită de nicio logică e o minciună în schemă.

### 4.5 Un document postat nu se editează

`draft` se poate modifica și șterge. `posted` e imutabil: se corectează doar prin **stornare**
(§5.4), care creează un document `reversed` oglindă. De ce: mișcările deja postate au recalculat
CMP-ul, iar editarea unei intrări vechi ar cere recalcularea tuturor ieșirilor ulterioare — adică
exact recostarea retroactivă pe care am refuzat-o la §4.1. Aceeași regulă o aplică deja
`doc_documents` prin `body_hash` (vezi `server/db/schema/docs.ts`).

### 4.6 Moneda

Costurile de stoc se țin **în moneda de bază a workspace-ului** (`fin_settings.base_currency`,
`server/db/schema/finCore.ts`, implicit `MDL`). O recepție într-o altă monedă păstrează pe
document `currency` + `fx_rate` (curs de la `doc_date`, din `fin_exchange_rates`), iar rândurile
se scriu convertite. De ce nu ținem stocul multi-monedă: valoarea totală a stocului trebuie să
fie o singură cifră comparabilă cu balanța contabilă; un stoc în trei monede n-ar avea o
valoare, ar avea trei. Cursul se îngheață pe document — o reevaluare ulterioară a cursului nu
rescrie costul mărfii deja intrate.

Asta respectă și CLAUDE.md §3.8: suma *cererii* (factura furnizorului) rămâne afișată în moneda
ei pe document; ce se convertește e doar costul dus în stoc.

### 4.7 Permisiuni

Se extinde matricea existentă din `server/lib/crm/permissions.ts` cu două drepturi noi, nu se
inventează un al doilea sistem de roluri (motivul e scris chiar în antetul fișierului):

- `stock.view` — vede stocurile, fișa de magazie, rapoartele. Îl au `admin`, `manager`,
  `receptionist`, `teacher` (cine vinde trebuie să vadă dacă are marfă).
- `stock.manage` — creează și postează documente, administrează gestiunile, face inventarierea.
  Îl au `admin` și `manager`.

`student` și `parent` — niciunul.

### 4.8 Atomicitate

Postarea unui document = o singură tranzacție: mișcări + solduri + total pe articol + numărul de
document. Dacă un rând pică (stoc insuficient), NU se scrie niciun rând. Ruta existentă
`hook/invoice-issued` face deja verificarea „toate sau nimic" înainte de scriere, dar apoi
scrie rând cu rând, fără tranzacție — se corectează la STOCK-106, fiindcă o eroare la al treilea
din cinci rânduri lasă azi stocul pe jumătate mișcat.

---

## 5. Ciclul de viață al unui document de stoc

```
        creează            postează            stornează
 (nimic) ──────► draft ──────────────► posted ──────────────► reversed
                   │                     │
                   │ șterge              └─► (imutabil: nici editare, nici ștergere)
                   ▼
              (dispărut, fără număr consumat)
```

### 5.1 `draft`
Rândurile se adaugă, se schimbă, se șterg. Nu există mișcări, nu se atinge niciun sold. Nu are
număr de document.

### 5.2 Postarea
1. Validează: gestiune activă, articole active și `is_stock_tracked`, cantități > 0.
2. La ieșiri: verifică disponibilul **în gestiunea documentului** pentru TOATE rândurile.
   Dacă vreunul nu are, se oprește tot, cu `422` și lista completă a rândurilor problemă (nu
   doar primul — omul vrea să știe dintr-o dată ce-i lipsește).
3. Rezervă numărul prin `doc_number_sequences` (aceeași funcție ca la acte).
4. Scrie mișcările, actualizează `fin_stock_balances` și `fin_inventory_items` (qty + CMP).
5. `status='posted'`, `posted_at`, `posted_by`.

### 5.3 `posted`
Imutabil. Din el se citește fișa de magazie.

### 5.4 Stornarea
Creează un document nou, de același `kind`, cu `reversal_of_id` setat, cantități identice și
direcție inversă, apoi îl postează. Documentul original trece în `reversed`.

**CMP-ul NU se recalculează înapoi la stornarea unei intrări.** Se face o ieșire la CMP-ul
curent. De ce: recalcularea înapoi ar schimba costul tuturor ieșirilor de după intrarea
stornată, deci ar rescrie rezultatul unor luni deja închise. Diferența (dacă intrarea stornată
avea alt cost decât CMP-ul de azi) rămâne vizibilă în raport ca diferență de cost — asta e
comportamentul corect contabil și e scris aici tocmai ca să nu fie „reparat" de cineva peste
șase luni.

---

## 6. Fluxurile reale

### 6.1 Recepția de marfă (NIR)
`/business/crm/stoc/receptii` → „NIR nou".

1. Alege gestiunea (implicită: `default_location_id` al utilizatorului sau a tenantului) și
   furnizorul (`fin_parties`, opțional).
2. Adaugă rânduri: caută produsul **în catalogul CRM** (`crm_products`), nu într-un catalog
   separat. Dacă produsul n-are încă fișă de stoc, ecranul o creează pe loc (STOCK-103) — un
   click, nu un alt formular în alt modul.
3. Pentru fiecare rând: cantitate + **cost de achiziție** (nu preț de vânzare — eticheta din UI
   spune explicit „cost achiziție fără TVA").
4. Dacă factura furnizorului e în valută: alege moneda; cursul de la `doc_date` se ia automat
   din `fin_exchange_rates` și se poate corecta manual (cursul de pe factură bate cursul BNM).
5. „Postează" → NIR-ul primește număr, marfa intră, CMP-ul se recalculează pe fiecare articol.

Ruta existentă `POST /api/fin/inventory/hook/purchase` **rămâne funcțională** (o folosesc
integrările de cheltuieli) și devine un caz particular: creează un document `reception` cu un
singur rând, în gestiunea implicită. Nu se scrie niciodată direct în mișcări ocolind documentul
— altfel avem din nou două căi și una dintre ele uită să actualizeze soldurile pe gestiune.

### 6.2 Ieșirea la vânzare din ofertă → factură
Legătura cu ce există deja: `server/routes/crmDocuments.ts` transformă produsele CRM în rânduri
de ofertă (`doc_document_lines`), iar `fin_invoices` + `fin_invoice_lines` țin factura B2B.

Momentul descărcării de gestiune este **emiterea facturii**, nu acceptarea ofertei. De ce:
oferta e o intenție (se poate schimba, poate muri), factura e evenimentul care transferă
proprietatea. Oferta doar *rezervă* (§6.5).

1. Factura se emite (`fin_invoices.status = 'issued'`).
2. Se creează automat un `fin_stock_doc` de tip `issue`, `source_kind='fin_invoice'`,
   `source_id = invoice.id`, cu rândurile facturii care au articol cu fișă de stoc. Rândurile de
   servicii (`is_stock_tracked=false`) se ignoră tăcut — un training nu descarcă gestiunea.
3. Dacă stocul nu ajunge: **emiterea facturii nu e blocată**, dar documentul de ieșire rămâne
   `draft` cu un avertisment vizibil în ecranul de stoc („3 facturi emise fără descărcare de
   gestiune"). De ce nu blocăm: a bloca facturarea din cauza evidenței de stoc oprește încasarea
   banilor, iar o evidență imperfectă e o problemă mai mică decât o factură netrimisă. Dar
   nici nu o ascundem.
4. Idempotență: indexul `(tenant_id, source_kind, source_id)` + verificare înainte de creare. O
   factură re-emisă sau un webhook repetat NU descarcă gestiunea de două ori.

Stornarea facturii → stornarea documentului de ieșire (§5.4).

### 6.3 Ieșirea manuală (consum intern, pierdere, casare)
Același `kind='issue'`, fără `source_id`, cu motiv obligatoriu în `notes`. Cazul acoperă și
materialele didactice ale școlii, care merg pe același drum.

### 6.4 Transferul între gestiuni
Un singur document `kind='transfer'` cu `location_id` (de unde) și `to_location_id` (unde),
postat atomic: produce două mișcări per rând (`transfer_out` + `transfer_in`, tipuri deja
existente în `fin_stock_movements`), scade într-o balanță, crește în cealaltă.

**Valoarea totală a stocului NU se schimbă** — consecința directă a §4.2. Un test blocant
verifică exact asta: valoarea stocului înainte = valoarea după transfer.

Transferul nu poate avea sursa = destinația (`422 same_location`) și nu poate scoate mai mult
decât e disponibil în sursă.

### 6.5 Rezervarea la ofertă
Când o ofertă CRM (`doc_documents`, `kind='oferta_comerciala'`) e finalizată, produsele ei cu
fișă de stoc se rezervă în gestiunea implicită: rând în `fin_stock_reservations`, `qty_reserved`
crește în balanță.

- Disponibilul afișat vânzătorului devine `on_hand − reserved`. De ce contează: doi agenți care
  vând simultan ultimele 5 bucăți promit amândoi marfa, iar unul dintre clienți află abia la
  livrare.
- Rezervarea **nu blochează** o ieșire: dacă cineva chiar vinde marfa rezervată, ieșirea trece
  și rezervările rămase care nu mai au acoperire apar în ecran ca „rezervări descoperite".
  Blocarea ar transforma o unealtă informativă într-un obstacol.
- Se consumă (`status='consumed'`) când oferta devine factură; se eliberează (`released`) când
  oferta e anulată sau la `expires_at`.
- Curățarea rezervărilor expirate rulează în `server/routes/finCron.ts` — cronul există deja.

### 6.6 Inventarierea
1. „Listă de inventariere nouă" pe o gestiune → document `kind='count'`, `draft`, cu rânduri
   generate din soldurile curente, cu `qty_expected` **înghețat la deschidere**.
2. Omul completează `qty_counted` pe hârtie sau pe telefon.
3. Postarea creează mișcări `adjustment` doar pe rândurile cu diferență, cu `qty_signed` =
   `qty_counted − qty_expected`.
4. Plusul de inventar intră la CMP-ul curent (nu are cost de achiziție propriu). Minusul iese la
   CMP-ul curent. De ce: orice altă valoare ar fi inventată.
5. Documentul postat e dovada: cine a numărat, când, ce a găsit, ce a ieșit diferență.

Regula de concurență: dacă între deschiderea listei și postare au avut loc alte mișcări pe acele
articole, postarea **avertizează și cere reconfirmare** (`409 stale_count` cu lista articolelor
mișcate). Suprascrierea tăcută a soldului ar șterge o vânzare reală.

---

## 7. Cum se leagă de ce există deja (rezumat pentru cine face review)

| Ce vrea modulul | Ce refolosește | Fișier |
|---|---|---|
| Jurnal de mișcări | `fin_stock_movements` (extins cu 3 coloane) | `server/db/schema/finInventory.ts` |
| Evaluare CMP | `calculateAvgCost`, `calculateExitCost` | `server/lib/finInventoryEngine.ts` |
| Fișa articolului | `fin_inventory_items` (extins cu 3 coloane) | `server/db/schema/finInventory.ts` |
| Preț, TVA, monedă, SKU | `crm_products` — NEATINS | `server/db/schema/crmProducts.ts` |
| Ofertele care cer marfă | `doc_documents` + `doc_document_lines` | `server/routes/crmDocuments.ts` |
| Facturile care descarcă gestiunea | `fin_invoices` + `fin_invoice_lines` | `server/db/schema/finInvoices.ts` |
| Numerotarea NIR/aviz | `doc_number_sequences` | `server/db/schema/docs.ts` |
| Furnizori/clienți | `fin_parties` | `server/db/schema/finParties.ts` |
| Curs valutar | `fin_exchange_rates` | `server/db/schema/finExchangeRates.ts` |
| Moneda de bază | `fin_settings.base_currency` | `server/db/schema/finCore.ts` |
| Filiale | `branches` | `server/db/schema/branches.ts` |
| Permisiuni | matricea CRM, extinsă cu 2 drepturi | `server/lib/crm/permissions.ts` |
| Cron de curățare | `finCron` | `server/routes/finCron.ts` |
| Ecranele existente de inventar | rămân funcționale, primesc coloana „gestiune" | `src/pages/app/InventoryPage.tsx` |

---

## 8. Ce raportează

### 8.1 Fișa de magazie (per articol × gestiune × perioadă)
Rândurile jurnalului cu sold rulant: data, documentul (număr + tip, cu link), intrare, ieșire,
sold după mișcare, cost unitar, valoare. Sold inițial calculat la începutul perioadei. Asta e
raportul pe care îl cere contabilul și pe care îl folosește gestionarul ca să răspundă la „unde
s-au dus cele 20 de bucăți".

Interogarea: `fin_stock_movements` filtrat pe `(tenant_id, item_id, location_id)`, ordonat după
`moved_at`, cu sume pe `qty_signed` (§2.6).

### 8.2 Stoc curent pe gestiune
Matrice articol × gestiune: pe mână, rezervat, disponibil, CMP, valoare. Filtre: gestiune,
categorie, doar cu stoc, doar produse CRM. Total pe coloană.

### 8.3 Valoarea stocului
Total `Σ (qty_on_hand × avg_cost_cents)`, defalcat pe gestiune și pe categorie, la o dată
aleasă. Ruta existentă `GET /api/fin/inventory/stock-value` se extinde cu defalcarea pe gestiune
— nu se scrie una nouă.

Pentru „la o dată din trecut" se refolosește `GET /api/fin/inventory/report/stock-snapshot`, care
există deja și reconstruiește soldul din jurnal.

### 8.4 Sub pragul minim
Articolele cu `qty_on_hand ≤ min_qty_alert` (coloana există deja) și `is_stock_tracked=true`.
Pragul e pe articol, pe tenant — nu pe gestiune: „mai am 3 bucăți în total" e întrebarea de
aprovizionare, iar un prag per gestiune ar cere un prag de reaprovizionare per gestiune pe care
nimeni nu-l va întreține.

Se afișează ca badge în ecranul de stoc și în lista de produse CRM.

### 8.5 Mișcări în perioadă
Există: `GET /api/fin/inventory/report/period`. Câștigă filtrul pe gestiune și pe document.

**Nu se raportează** (amânat, deliberat): rotația stocului, stocul mort, ABC-analiza, marja pe
produs. Toate cer istoric de vânzări pe care modulul abia începe să-l producă — se scriu după ce
există șase luni de date reale, altfel sunt grafice pe zero.

---

## 9. Ecranele

| Rută | Ce e | Cine intră |
|---|---|---|
| `/business/crm/stoc` | Stoc curent pe gestiuni + badge „sub prag" + căutare | `stock.view` |
| `/business/crm/stoc/receptii` | Lista NIR + „NIR nou" | `stock.view` / creare: `stock.manage` |
| `/business/crm/stoc/miscari` | Jurnalul + filtre + fișa de magazie a unui articol | `stock.view` |
| `/business/crm/stoc/inventariere` | Listele de inventariere | `stock.manage` |
| `/business/crm/stoc/gestiuni` | Administrarea gestiunilor | `stock.manage` |
| `/business/crm/produse` | **existent**, câștigă coloana „Stoc" cu disponibilul | `products.manage` pentru editare |
| `/business/fin/inventory` | **existent**, rămâne; câștigă selectorul de gestiune | ca azi |

Tile-ul „Stoc" se adaugă în `CRM_MODULES` din `src/pages/business/crm/CrmHomePage.tsx`, cu
`available: false` până la livrarea Fazei D — pattern-ul „În curând" e deja acolo.

De ce ecranul nou stă sub `/business/crm/` și nu sub `/business/fin/`: omul care are nevoie de
stoc e cel care vinde, iar el lucrează în CRM. Ecranul din FinDesk rămâne pentru evidența
internă (consumabile, materiale didactice) și pentru contabil. Aceleași tabele, două uși — asta
e diferența dintre două interfețe și două sisteme.

---

## 10. GDPR & audit

Stocul nu conține date personale — cu o excepție: `moved_by` / `created_by` / `posted_by` spun
cine a mișcat marfa. Sunt date de angajat, necesare pentru răspunderea gestionară, și se
păstrează cât documentul. La ștergerea unui user, coloanele devin `NULL` (`on delete set null`),
documentul rămâne — un NIR fără numele operatorului e încă un NIR valid, iar unul șters e o
gaură în evidență.

Fiecare postare și fiecare stornare scriu în jurnalul de audit existent (`server/db/schema/auditLog.ts`),
cu `entity='fin_stock_doc'` și id-ul documentului.

---

## 11. Extinderi cunoscute, în afara acestui CORE

Enumerate ca să nu fie confundate cu scăpări:

1. **Nota contabilă automată** — legarea mișcărilor de `fin_ledger` (211/217 → 711 la vânzare).
2. **Comenzi de aprovizionare** (purchase orders) — „ce trebuie comandat" pe baza pragului minim
   și a consumului mediu.
3. **Loturi, serii, termene de valabilitate** — §4.4, cu schimbarea metodei de evaluare.
4. **Coduri de bare și scanare** — §1.
5. **Rapoarte analitice** (rotație, stoc mort, ABC, marjă pe produs) — §8.5.
6. **Producție / rețete** — §1.
