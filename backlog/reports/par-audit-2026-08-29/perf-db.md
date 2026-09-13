# Audit DB + Caching — modulul PAR (FinFlow)

Repo: `/Users/dima/vector-learn-landing`. Nu s-a modificat cod, nu s-au rulat migrări.
EXPLAIN pe PGlite local NU a fost rulat: `.pglite/` e un fișier cu lock exclusiv, folosit
probabil de un server pornit în alt chat (regula §0.4) — riscul de a bloca alt chat depășește
valoarea unui EXPLAIN pe un set de date oricum prea mic (zeci de rânduri) ca planul să difere
de producție. Analiza de mai jos e pe cod + migrări reale + cardinalitate rezonată.

---

## 0. Rezumat — ce impact are fiecare grup de probleme

| # | Problemă | Rută afectată | Impact |
|---|----------|---------------|--------|
| 1 | Lipsesc indexuri compuse pe `par_requests`/`par_approvals` pe exact combinațiile din `WHERE`+`ORDER BY` | listă, inbox, coadă finanțe, rapoarte | sort/scan complet la fiecare încărcare de pagină, se agravează liniar cu nr. de PAR-uri |
| 2 | Inbox-ul de aprobări citește TOATE aprobările `pending` ale tenantului și TOATE cererile `pending_approval`, apoi filtrează în JS | `GET /api/par/inbox` | cea mai gravă — nici măcar nu folosește `parIds` calculat deja, deci nu scalează cu nr. de aprobatori |
| 3 | `enabledPayerIds`/`accessiblePayerIds`/`accessibleProjectIds`/entitlement middleware rulează 5–8 interogări **pe fiecare cerere**, unele duplicate (aceeași logică calculată de 2–3 ori în același request) | orice rută `/api/par/*` | latență de rețea × nr. de round-trip-uri, agravat de §5 (pool serverless) |
| 4 | `GET /api/par/:id` face `SELECT *` pe `par_attachments`/`par_payments`, aducând `file_url`/`proof_url` (base64, MB) chiar dacă pagina de detaliu nu le afișează inline | detaliu cerere | payload de MB pe orice deschidere de PAR cu atașamente |
| 5 | Migrările rulează pe conexiunea **pooled** (pgBouncer :6543), nu pe cea directă (:5432) — contribuie plauzibil la desincronizarea migrărilor documentată deja în cod | deploy | motiv tehnic concret pentru un bug deja cunoscut, nu doar simptom |
| 6 | `/api/par/*` e `no-store` necondiționat (inclusiv date de referință aproape statice: curs BNM, setări, membri) | toate | reîncărcări inutile la navigare |

Detaliile + dovezile + DDL-ul, mai jos, în ordinea cerută.

---

## 1. Indexuri lipsă (cu dovadă și DDL)

### Contextul: ce filtre/sortări chiar există în rute

`server/routes/par.ts:670-806` (lista de cereri — cea mai folosită rută):
```
conditions = [eq(tenantId), inArray(payerId, entitledPayers), eq(requestedByUserId) sau
              or(inArray(projectId, scoped), and(isNull(projectId), inArray(payerId, scoped))),
              eq(status)?, eq(purpose)?, eq(projectId)?, eq(payerId)?, eq(eventId)?,
              ilike(requestNo|payeeName|endUse) sau EXISTS pe line_items, gte/lte(dateOfRequest)?,
              gte/lte(totalEstimatedCents)?]
ORDER BY parRequests.createdAt DESC
LIMIT 1000 (implicit)
```
plus un al doilea `SELECT count(*)` cu ACELEAȘI condiții (par.ts:798-801) — rulează planul de
filtrare de două ori pe fiecare încărcare de listă.

`server/routes/parApprovals.ts:421-437` (inbox — coada de aprobări):
```
WHERE tenant_id = ? AND decision = 'pending' AND locked = false   -- FĂRĂ limit, tenant-wide
```
apoi (parApprovals.ts:504-513):
```
WHERE tenant_id = ? AND status = 'pending_approval'
ORDER BY submitted_at DESC                                         -- FĂRĂ limit, tenant-wide
```
filtrat abia DUPĂ în JS cu `parIds.includes(p.id)` (parApprovals.ts:522) — deși `parIds` era deja
cunoscut înainte de interogare. Vezi §2 pentru gravitatea asta ca query design, nu doar index.

`server/routes/parPayments.ts:152-190` (coada de finanțe):
```
WHERE tenant_id = ? AND purpose = 'execute_payment' AND status IN ('approved','in_finance','reapproval_required')
```
fără limit, filtrat de scope tot în JS după.

`server/routes/parReports.ts` (`buildReportWhere`, linia 113-140, folosit de toate cele 10
rapoarte + export CSV):
```
WHERE tenant_id = ? [AND scope] [AND date_of_request BETWEEN ? AND ?] [AND status IN (...)]
      [AND payer_id=?] [AND project_id=?] [AND department_id=?] [AND budget_code_id=?]
      [AND purpose=?] [AND charge_to=?] [AND currency=?] [AND text search]
GROUP BY <dimensiune> / ORDER BY dateOfRequest
```

### Ce indexuri există REAL azi (migrate + schema — verificate identice)

`drizzle/0113_par_core.sql:221-225` + `server/db/schema/par.ts:534-539`:
```
par_requests_tenant_idx        (tenant_id)
par_requests_payer_idx         (payer_id)          -- adăugat în 0136
par_requests_status_idx        (status)
par_requests_requested_by_idx  (requested_by_user_id)
```
Niciun index compus. Niciun index pe `project_id`, `event_id`, `budget_code_id`,
`department_id`, `purpose`, `currency`, `date_of_request`, `submitted_at`, `created_at` pe
`par_requests` — deși toate sunt folosite în `WHERE`/`GROUP BY`/`ORDER BY` mai sus.

`par_approvals` (drizzle/0113_par_core.sql:231-235):
```
par_approvals_par_idx      (par_id)
par_approvals_tenant_idx   (tenant_id)
par_approvals_decision_idx (decision)
```
Nimic pe `(tenant_id, decision, locked)`, deși exact asta filtrează inbox-ul.

### Indexuri de adăugat (DDL concret, ordine de coloane gândită după selectivitate + ORDER BY)

```sql
-- 1) Lista de cereri: elimină sortarea explicită pe createdAt (azi: scan pe tenant_idx + sort separat)
CREATE INDEX IF NOT EXISTS par_requests_tenant_created_idx
  ON par_requests (tenant_id, created_at DESC);

-- 2) Inbox de aprobări: azi tenant-wide fără limit pe status; ordinea cerută e submitted_at DESC
CREATE INDEX IF NOT EXISTS par_requests_tenant_status_submitted_idx
  ON par_requests (tenant_id, status, submitted_at DESC);

-- 3) Rapoarte: TOATE cele 10 rapoarte + exportul filtrează întâi pe interval de dată
CREATE INDEX IF NOT EXISTS par_requests_tenant_date_idx
  ON par_requests (tenant_id, date_of_request);

-- 4) Coada de finanțe: tenant + purpose + status (IN-list mic, 3 valori)
CREATE INDEX IF NOT EXISTS par_requests_tenant_purpose_status_idx
  ON par_requests (tenant_id, purpose, status);

-- 5) Filtrele de listă/rapoarte pe FK-uri azi neindexate deloc
CREATE INDEX IF NOT EXISTS par_requests_project_idx     ON par_requests (project_id);
CREATE INDEX IF NOT EXISTS par_requests_event_idx       ON par_requests (event_id);
CREATE INDEX IF NOT EXISTS par_requests_budget_code_idx ON par_requests (budget_code_id);
CREATE INDEX IF NOT EXISTS par_requests_department_idx  ON par_requests (department_id);

-- 6) Inbox-ul de aprobări (parApprovals.ts:431-437) — cea mai fierbinte interogare pe par_approvals,
--    și cea mai bună candidată pentru index PARȚIAL: "pending + unlocked" e un subset mic din
--    istoricul total de aprobări (majoritatea rândurilor vechi sunt deja decise).
CREATE INDEX IF NOT EXISTS par_approvals_pending_unlocked_idx
  ON par_approvals (tenant_id)
  WHERE decision = 'pending' AND locked = false;

-- 7) fin_parties.tenant_id e căutat des (fin_parties_tenant_idx există) dar tabela e mică; nu e
--    prioritate — vezi §3 pentru problema reală de acolo (lipsă FK, nu lipsă index).
```

**Câștig estimat**: pentru un tenant cu câteva mii de `par_requests` (scenariul realist pe
termen de 1-2 ani pentru o organizație activă), (1)+(2)+(6) transformă lista/inboxul din
"scan tenant + sort/filter în memorie peste tot setul" în "index scan direct pe subsetul cerut,
deja în ordinea cerută" — de la sute de ms + agravare liniară, la interogări sub 10ms indiferent
de câte PAR-uri istorice are tenantul. (3)+(4) au impact simetric pe rapoarte/coada de finanțe.

### Unde se aplică — heal-ul, nu doar migrarea

Regula din CLAUDE.md se confirmă în cod: bucla de auto-heal din
`server/db/sync-schema.ts:38-63` gestionează DOAR coloane lipsă (`ADD COLUMN IF NOT EXISTS`),
NICIODATĂ indexuri pe tabele deja existente. Indexurile noi de mai sus, pentru tabele care deja
există pe prod (`par_requests`, `par_approvals`), trebuie puse manual în array-ul
**`ENSURE_COLUMN_STMTS`** (`server/db/sync-schema.ts:110-119`, executat statement-cu-statement
prin `sql.unsafe` într-un `try/catch` la fiecare deploy — `server/db/sync-schema.ts:120-126`),
NU în `ENSURE_STATEMENTS` (acela e doar pentru tabele noi, `CREATE TABLE IF NOT EXISTS`, de la
linia 129 în jos). Plus, desigur, o migrare reală nouă (`drizzle/01NN_par_perf_indexes.sql`) cu
`CREATE INDEX IF NOT EXISTS` (nu `CREATE INDEX` simplu — idempotența contează aici pentru
`db:reset` pe PGlite în teste).

---

## 2. Indexuri inutile / duplicate

Nu există duplicate exacte pe `par_requests`/`par_approvals` — fiecare index single-column
declarat corespunde unei coloane folosite real în cod. NU recomand ștergerea niciunuia.

Un singur semnal demn de notat, nu de acționat: `par_project_members_user_idx` și
`par_payer_members_user_idx` sunt ambele `(tenant_id, user_id)` pe tabele diferite — nu sunt
duplicate (tabele distincte), doar o observație că, dacă vreodată aceste tabele cresc mult
(multe mii de membri per tenant — puțin probabil la scara PAR), n-ar mai fi nevoie de nimic în
plus, sunt deja corecte.

**Recomandare reală pe partea de scriere**: NU adăuga cele 7 indexuri de mai sus orbește pe
toate coloanele — `par_requests_tenant_created_idx` + `par_requests_tenant_status_submitted_idx`
+ `par_requests_tenant_purpose_status_idx` se suprapun parțial (toate încep cu `tenant_id`).
Dacă volumul de scriere pe `par_requests` devine vreodată o grijă (azi nu e — un PAR are puține
UPDATE-uri pe parcursul ciclului de viață), (3) `par_requests_tenant_date_idx` ar putea fi
sărit inițial și reconsiderat doar dacă rapoartele devin lente — e cel mai puțin critic dintre
cele patru compuse, pentru că `date_of_request` corelează puternic cu `created_at` (aproape
mereu setat la submit), deci indexul de la (1) acoperă parțial și cazul de rapoarte fără filtru
de status.

---

## 3. Foreign keys & ON DELETE

Verificare completă a `server/db/schema/par.ts` + `parEinvoices.ts` + `finParties.ts`:

- **Toate FK-urile din `par.ts` au `.references()` + `onDelete` explicit** (`cascade` pentru
  copii ai unui `par_id`/`tenant_id`, `set null` pentru referințe opționale ca `payerId`,
  `projectId`, `vendorId`, `departmentId`, `budgetCodeId`, `eventId`, și `restrict` intenționat
  pe `parRequests.requestedByUserId` — un utilizator cu cereri nu poate fi șters, corect pentru
  audit). Nu am găsit orfani posibili pe lanțul PAR.

- **`server/db/schema/finParties.ts:35`** — `finParties.tenantId` e `uuid("tenant_id").notNull()`
  **FĂRĂ `.references(() => tenants.id)`**, spre deosebire de absolut toate celelalte tabele din
  `par.ts` care au `tenant_id` cu FK + `onDelete: cascade`. Are index (`fin_parties_tenant_idx`,
  linia 53) dar nicio constrângere de integritate. Nu e un bug care lasă orfani AZI (tenants nu
  se șterg din UI), dar e inconsistent cu restul schemei și e exact genul de gaură care devine
  o problemă reală în ziua în care cineva adaugă "ștergere tenant" (GDPR right-to-erasure, de
  exemplu) — orice altă tabelă cu FK+cascade se curăță automat, `fin_parties` rămâne cu rânduri
  moarte. Recomand adăugarea FK-ului într-o migrare viitoare (nu urgent, dar de notat explicit).

- `parEinvoices.ts:59-62` — `parId` are `.unique()` PESTE FK cu `cascade` — corect, un rând per
  cerere, se șterge automat dacă cererea e ștearsă (deși PAR-urile nu par să fie șterse fizic
  în cod, doar `status='cancelled'` — deci cascade-ul e mai mult o plasă de siguranță).

- Nicio coloană căutată frecvent și lăsată fără index — toate FK-urile relevante pentru
  interogări (par_id, tenant_id) sunt indexate; lipsurile sunt pe coloanele non-FK din §1
  (status, purpose, date_of_request, submitted_at).

---

## 4. Tipuri de coloane

- **Bani**: toate sumele PAR sunt `integer` în minor units (cenți) — `unitPriceCents`,
  `lineTotalCents`, `totalEstimatedCents`, `totalMdlCents`, `allocatedCents`,
  `actualAmountCents`, `invoiceTotalCents` (par.ts, parEinvoices.ts). Plafonul `integer` e
  ~21.4 milioane unități monetare majore (2^31 cenți). Pentru un PAR individual e imposibil de
  atins. **Punct de urmărit, nu de reparat acum**: `parBudgetCodes.allocatedCents` (par.ts:299)
  e un total CUMULATIV de buget pe un cod bugetar — pentru un grant multianual mare în
  USD/EUR convertit intern, valoarea cumulată ar putea, teoretic, apropia plafonul. Nu e o
  problemă azi (ar necesita un buget de >21M unități monetare pe un singur cod), dar dacă
  organizația crește la granturi de ordinul zecilor de milioane, `allocatedCents` merită trecut
  la `bigint` preventiv — e un `ALTER COLUMN TYPE` ieftin și fără risc de date.
  `exchangeRate` e deja `numeric(14,6)` — corect pentru un curs valutar.

- **Date**: toate sunt `timestamp({ withTimezone: true })`, nimic stocat ca `text`/`varchar`.
  Bun — asta e exact ce a cauzat bug-ul PARQA-019 menționat în comentariul din
  `parReports.ts:116-118` (când codul trimitea un string în loc de `Date`, nu o problemă de
  schemă). Schema e corectă; grija e doar în cod la construirea query-ului (deja rezolvată).

- **JSONB/coloane mari citite în listări**:
  - `parAttachments.fileUrl` (par.ts:623) și `parPayments.proofUrl` (par.ts:662) sunt `text`,
    documentat explicit în cod ca fiind base64 data URLs de ordinul megabytes. **Problema
    concretă**: `GET /api/par/:id` (`server/routes/par.ts:942-950`) face
    `db.select().from(parAttachments)...` și `db.select().from(parPayments)...` — adică
    `SELECT *`, care include `file_url`/`proof_url` complet, PENTRU FIECARE atașament al unei
    cereri, la FIECARE deschidere a paginii de detaliu — deși pagina de detaliu (conform
    `server/routes/parAttachments.ts:327-341`, ruta dedicată de preview) încarcă separat
    conținutul unui atașament DOAR când utilizatorul dă click pe el. Deci payload-ul mare se
    transferă de două ori: o dată inutil în `GET /:id`, o dată real la preview.
    Codul repo-ului deja știe pattern-ul corect — e aplicat în alte 2 locuri:
    `par.ts:823-826` (`include_docs`, selectează doar `{parId, kind}`) și
    `parApprovals.ts:538-543` (selectează coloane explicite, fără `fileUrl`).
    **Recomandare**: pe `GET /:id`, selectează explicit coloanele necesare UI-ului
    (`id, fileName, kind, kindOther, uploadedBy, createdAt` pentru attachments;
    tot ce ține de `parPayments` mai puțin `proofUrl`, înlocuit cu un boolean
    `hasProof` ca în `par.ts:833`) — exact pattern-ul deja folosit alături. Câștig: elimină MB
    de payload nefolosit pe orice PAR cu atașamente foto/PDF, exact pe ruta cea mai vizitată
    după listă/inbox.
  - Nu există coloane `jsonb` propriu-zise pe tabelele PAR (schema PAR folosește `text` +
    `JSON.stringify` manual — ex. `parTemplates.snapshot`, `parAudit.diff`); asta e mai lent la
    interogare structurată dar nu e citit în listări fierbinți (doar la deschiderea unui
    template/eveniment de audit specific), deci nu e prioritate.

---

## 5. Connection pooling pe serverless (`server/db/client.ts`)

Config curentă (`server/db/client.ts:70-75`), pentru Vercel:
```js
postgres(databaseUrl, { prepare: false, fetch_types: false, max: 3, connect_timeout: 10 })
```
fără `idle_timeout`. Comentariul din cod (linii 51-69) documentează exact istoricul relevant:
`max:1` + `idle_timeout` a produs 504-uri (PLATFORM-404, 2026-08-28) pentru că timer-ul de
inactivitate "curge" doar la dezgheț, deci se declanșa exact pe request-ul următor, ucigând o
conexiune tocmai refolosită. **Config-ul actual (max:3, fără idle_timeout, prepare:false,
fetch_types:false) e corect pentru combinația Vercel + pgBouncer transaction-mode** — nu am
găsit nimic de schimbat aici, e deja aliniat cu recomandarea Supabase pentru serverless
(transaction pooler pe :6543, fără prepared statements, fără introspecție de tip la conectare).

**Ce NU e corect**, descoperit urmărind fluxul de migrare:
- `server/db/env.ts:40-48` — `resolveDatabaseUrl(preferDirect)`: cu `preferDirect=true` preferă
  `POSTGRES_URL_NON_POOLING` (:5432, direct), altfel `POSTGRES_URL` (:6543, pooled) —
  design corect, documentat corect în comentarii.
- **DAR** `server/db/client.ts:32` calculează `databaseUrl = resolveDatabaseUrl(!onVercel)`.
  Pe Vercel, `onVercel=true` → `!onVercel=false` → **alege conexiunea POOLED**, nu direct.
- `server/db/migrate.ts:11` rulează migrările pe clientul `db` importat din `./client` — deci
  **migrările (DDL: `CREATE TABLE`, `CREATE INDEX`, `ALTER TYPE ... ADD VALUE`, plus tabela de
  tracking `__drizzle_migrations` a drizzle) rulează pe conexiunea pooled (pgBouncer, transaction
  mode), nu pe cea directă**, atât la `npm run db:migrate` local (unde nu contează, e PGlite/
  direct) cât mai ales în `scripts/vercel-migrate.mjs:32` — care rulează în timpul BUILD-ului pe
  Vercel, unde `VERCEL=1` e setat și de Vercel însuși în faza de build (nu doar la runtime), deci
  `isVercelRuntime=true` acolo la fel ca la runtime.
- **De ce contează**: Supabase recomandă explicit conexiunea directă (sau session pooler) pentru
  DDL/migrări, nu transaction pooler — pgBouncer în transaction mode nu garantează aceeași
  sesiune între statement-uri și poate întrerupe advisory locks / tracking de sesiune pe care
  unele migratoare se bazează. Asta e o explicație tehnică plauzibilă, cu dovadă în cod, pentru
  chestia deja documentată în memorie ("Prod migration tracking DESYNCED" — migrările drizzle
  nu se aplică fiabil pe prod, de-asta există tot mecanismul de `sync-schema.ts`). Nu e o
  certitudine 100% fără acces la log-urile reale de deploy, dar e prima explicație concretă
  găsită în cod pentru un simptom cunoscut de multă vreme și tratat doar prin ocolire (heal),
  niciodată la rădăcină.
- **Recomandare**: `server/db/migrate.ts` (și implicit `scripts/vercel-migrate.mjs`) ar trebui
  să folosească un client Postgres SEPARAT, construit cu `resolveDatabaseUrl(true)` (deci
  `POSTGRES_URL_NON_POOLING`, port 5432) direct, nu clientul de aplicație din `./client`. Asta
  NU schimbă comportamentul clientului de aplicație (rămâne pooled, corect pentru cereri
  concurente scurte) — schimbă doar ce conexiune vede pasul de migrare la deploy. E o schimbare
  de o linie logică (nu am aplicat-o — respect regula "nu modifica cod"), dar e recomandarea cu
  cel mai mare impact potențial din tot auditul, pentru că atacă rădăcina unei clase întregi de
  bug-uri prod (500-uri "column/table does not exist") documentată deja de 3+ incidente în
  istoricul repo-ului.

---

## 6. HTTP caching (`server/middleware/httpCache.ts`)

Politica actuală (`server/middleware/httpCache.ts:40-43`): **orice** `/api/*` primește necondiționat
`Cache-Control: no-store`, indiferent de rută — comentariul din cod (liniile 16-19) chiar
menționează "excepțiile explicite (rate de schimb etc.) își setează singure headerul", dar
**nicio rută PAR nu setează de fapt un header propriu** (am verificat cu grep pe tot
`server/routes/*.ts`: singurele excepții reale sunt `parAttachments.ts:339`
`private, max-age=60` pe preview-ul de fișier, și `finExport.ts` care explicit forțează
`no-store`). Deci comentariul descrie o intenție care nu e implementată pentru PAR.

**Unde ar fi sigur de adăugat cache HTTP, fără scurgere între tenanți** (toate ar trebui
`private`, niciodată `public`, pentru că răspunsul variază după `Authorization`/tenant chiar
dacă datele în sine nu sunt "secrete"):

| Endpoint | Volatilitate reală | Recomandare |
|---|---|---|
| `GET /api/par/fx/rates`, `/series` (`parFx.ts`) | BNM publică o dată/zi; codul are deja un cache de aplicație (mirror în DB, `server/lib/bnm/rates.ts:98-107`) | `Cache-Control: private, max-age=1800` — nu există risc, cursul nu se schimbă intraday |
| `GET /api/par/settings` (`parSettings.ts:29`) | se schimbă doar la acțiune admin explicită | `private, max-age=30, must-revalidate` + `ETag` (hash pe `updatedAt`) |
| `GET /api/par/budget-codes` (`parBudgetCodes.ts:81`) | listă de referință, editată rar | `private, max-age=30` |
| `GET /api/par/projects` (`parProjects.ts:30`) | idem | `private, max-age=30` |
| `GET /api/par/members` (`parMembers.ts:47`) | idem (doar `par_admin`) | `private, max-age=15` (mai sensibil — nume+roluri) |
| `GET /api/par/vendors` (`parVendors.ts:107`) | conține IDNP/IBAN (GDPR) — **NU** cache pe disc/proxy; cel mult `private, max-age=10` cu `must-revalidate`, sau lasă `no-store` dacă owner-ul preferă conservator pe date GDPR-sensibile |
| `GET /api/par/` (lista de cereri), `/api/par/inbox`, `/api/par/finance`, `/api/par/reports/*`, `GET /api/par/:id` | se schimbă la fiecare submit/aprobare/plată — corect `no-store`, NU cache | păstrează cum e |

304/ETag: momentan niciun endpoint PAR nu emite `ETag`/`If-None-Match`. Pentru datele de
referință de mai sus (settings, budget-codes, projects, members), un `ETag` calculat din
`updatedAt` maxim al setului (sau un hash simplu al payload-ului) ar permite `304 Not Modified`
pe navigare repetată (ex. utilizatorul deschide formularul de PAR de mai multe ori pe zi) — cost
de implementare mic, câștig mai ales pe mobil/3G (owner-ul are Maria ca persona — telefon,
răbdare de 30 secunde).

**Nu recomand cache pe listă/inbox/finance/rapoarte** — sunt exact datele pe care Andreea și
finance-ul se bazează să fie proaspete în timp real (o aprobare/plată trebuie să dispară din
coadă imediat).

---

## 7. Caching aplicativ (in-process, per-instanță)

Aceasta e, cred, cea mai mare oportunitate găsită în audit — nu indexuri, ci NUMĂRUL de
round-trip-uri redundante pe fiecare cerere, indiferent de index.

### Dovadă: câte interogări separate face UN SINGUR `GET /api/par/` (lista de cereri)

1. `server/app.ts:278-279` — middleware global `requireModuleEntitlement("par")` pe ORICE
   `/api/par/*`:
   - `server/middleware/requireModuleEntitlement.ts:12` — `SELECT` pe `platform_admins`
     (verifică dacă userul e super-admin) — **pe fiecare request**, indiferent de rută.
   - linia 15 — `isModuleEnabledForTenant` → `SELECT` pe `tenant_modules`
     (`server/lib/platformModules.ts:109-113`).
   - linia 24 — dacă path-ul e `/api/par/<uuid>`, încă un `SELECT` pe `par_requests` doar ca
     să afle `payerId`.
   - linia 28 — `SELECT` pe `par_payer_modules`.
   → **3-4 interogări doar pentru poarta de acces**, înainte ca handler-ul de rută să facă
   ceva.
2. `server/routes/par.ts:671` — handler-ul GET / apelează **din nou** `enabledPayerIds`
   (`server/middleware/requireModuleEntitlement.ts:62-71`) — care e o interogare pe
   `par_payer_modules` + (dacă modulul e "implicit", cazul PAR) încă una pe `par_payers` —
   deși `requireModuleEntitlement` de la pasul 1 A CALCULAT deja, intern, aproape aceeași
   informație (linia 28) dar pentru un singur payer, nu pentru toți — deci nu e refolosibilă
   direct, dar arată că design-ul recalculează aceleași tabele de mai multe ori pe request.
3. `server/routes/par.ts:697-700` — `Promise.all([accessibleProjectIds, accessiblePayerIds])`:
   - `accessibleProjectIds` (`server/lib/par/projectScope.ts:10-27`) = 2 interogări
     (`par_project_members` + `par_payer_members`), plus încă una condiționată pe `par_projects`.
   - `accessiblePayerIds` (`projectScope.ts:35-51`) apelează **DIN NOU**
     `accessibleProjectIds(...)` intern (linia 41) — deci logica de mai sus rulează **a doua
     oară, complet duplicat**, în ACELAȘI request, doar pentru că `accessiblePayerIds` are
     nevoie de `projects` ca input și nu primește rezultatul deja calculat la pasul de mai sus.
4. Apoi interogarea principală + `count(*)` + `par_settings` (3 interogări, `par.ts:790-807`).

**Total pentru un GET / simplu, fără `include_docs`, fără căutare**: **10-12 round-trip-uri**
la Postgres, dintre care cel puțin 3-4 sunt exact aceeași logică rulată de 2 ori. Pe o conexiune
serverless cu pool `max:3` (§5) și fără conexiuni persistente calde, fiecare round-trip suplimentar
costă latență de rețea reală (Vercel → Supabase, de multe ori regiuni diferite), nu doar CPU
local. Aceasta explică parțial de ce pool-ul a fost o sursă de 504-uri: nu doar conexiunile sunt
puține, ci FIECARE cerere ține una ocupată mult mai mult decât ar trebui.

Același pattern (`accessibleProjectIds`+`accessiblePayerIds` duplicat, plus reconstruirea
`enabledPayerIds`) se repetă identic în:
- `server/routes/parApprovals.ts:460-461` (inbox)
- `server/routes/parPayments.ts:185-186` (coada de finanțe)
- `server/routes/parReports.ts:45-46, 56` (middleware de scope pe rapoarte)

### Ce merită cache in-process cu TTL scurt

Date candidate — toate se schimbă DOAR prin acțiune administrativă explicită (invită/schimbă rol,
activează/dezactivează modul, atribuie proiect), niciodată prin fluxul normal de lucru al unui PAR:

- `platformAdmins` (e user X super-admin?) — practic imuabil per sesiune de deploy.
- `tenant_modules` / `par_payer_modules` (entitlement pornit/oprit).
- `accessibleProjectIds`/`accessiblePayerIds` per `(userId, tenantId)` — membership.
- `getProjectApproverMap` per `tenantId` (`server/lib/par/projectApprovers.ts:35-51`) — deja
  interogat tenant-wide la fiecare inbox load.
- `parSettings` per tenant (threshold, monedă implicită) — citit la aproape orice rută PAR.

**Propunere**: un `Map<string, {value, expiresAt}>` in-process (nu Redis — nu justifică o
dependență nouă pentru volumul PAR), TTL 30-60s, invalidat activ (delete pe cheie) din exact
punctele de scriere care schimbă aceste date (toggle modul, schimbare rol membru, atribuire
proiect) — nu doar TTL pasiv, ca o dezactivare de acces să nu rămână "vizibilă" până la 60s.

**Riscuri pe serverless, de ce TTL-ul trebuie să rămână scurt**:
1. **Multi-instanță**: Vercel poate rula N instanțe Node în paralel pentru aceeași funcție;
   fiecare are propriul `Map` — un toggle de modul făcut pe instanța A nu invalidează cache-ul
   de pe instanța B. Cu TTL de 30-60s, fereastra de inconsistență e mică și acceptabilă pentru
   date administrative (nu financiare), dar TREBUIE documentată explicit ca limitare cunoscută.
2. **Cold start**: fiecare instanță nouă pornește cu cache gol — nu accelerează primul request,
   doar pe cele repetate pe aceeași instanță caldă (Vercel ține instanțe calde câteva minute
   după ultimul request).
3. **Memorie**: `Map` nesupravegheat crește nelimitat dacă nu se face `expiresAt` cleanup —
   pentru numărul mic de tenanți/useri PAR de azi, nesemnificativ, dar pune un plafon simplu
   (LRU sau curățare periodică) dacă produsul crește mult.
4. **Nu cache-ui niciodată** rezultatul interogării de listă/inbox/finance în acest strat —
   doar datele de configurare/membership de mai sus. Amestecarea celor două ar reintroduce
   exact bug-ul "aprobarea nu dispare din coadă" pe care owner-ul l-ar observa imediat.

**Câștig estimat**: elimină 6-8 din cele 10-12 round-trip-uri identificate mai sus pentru
majoritatea request-urilor (cache hit), reducând latența percepută a listei/inbox-ului cu
aproximativ 60-70% din partea "overhead de acces", independent de indexurile din §1 (care
optimizează interogarea de date propriu-zisă, nu poarta de acces care rulează înainte).

---

## Prioritizare finală (impact pe cele 4 rute cheie: listă, inbox, detaliu, rapoarte)

1. **§7 (cache in-process pe entitlement/scope)** — cel mai mare câștig per rută, zero risc de
   date stale pe conținut financiar, atinge toate cele 4 rute simultan.
2. **§1.2 + §1.6 (index compus `tenant+status+submitted_at` + index parțial pending/unlocked pe
   par_approvals)** — inbox-ul e ruta cu cel mai prost pattern de interogare (tenant-wide, fără
   limit) din tot modulul; indexul reduce costul per-interogare, dar §2 (rescrierea query-ului
   ca să folosească `inArray(parIds)`) ar fi complementul corect — semnalat aici ca observație
   de query design, nu implementat (owner-ul decide dacă vrea și rescrierea, nu doar indexul).
3. **§1.1 + §1.3 (index compus pe listă + rapoarte)** — scalabilitate pe termen mediu, azi
   probabil sub pragul de a se simți, dar ieftin de adăugat acum cât tabela e mică (fără lock
   lung la creare).
4. **§4 (SELECT explicit în loc de `SELECT *` pe attachments/payments în detaliu)** — câștig de
   payload/rețea imediat vizibil pe mobil, fără risc.
5. **§5 (migrațiile pe conexiune directă, nu pooled)** — cel mai mare impact POTENȚIAL (atacă
   rădăcina bug-urilor "column does not exist" de care CLAUDE.md e plin), dar necesită
   verificare la un deploy real ca să confirme ipoteza înainte de a o considera "rezolvată".
6. **§6 (Cache-Control pe date de referință)** — câștig mic dar ieftin, mai ales pe telefon.
