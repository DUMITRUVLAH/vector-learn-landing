# PAR — Test scenarios (Given / When / Then)

> Format: `- **T-PAR-xxx-N** [blocant|normal] Given …, When …, Then …`. `[blocant]` = item nu se
> închide dacă pică. Sursa de adevăr: [`PAR-CORE.md`](./PAR-CORE.md). Backend items au obligatoriu
> câte un `[blocant]` pentru: migration gate, live API smoke (login + endpoint → 200),
> DB-portability (result shape). UI items au un `[blocant]` render-fără-crash + un `[normal]`
> interacțiune principală.

## PAR-001 — Schema + migrare + seed
- **T-PAR-001-1** [blocant] Given schema `par.ts` cu toate tabelele din §2, When `npm run db:generate`, Then 0 fișiere uncommitted și migrarea are prefix `0113` (> max pe origin/main `0112`).
- **T-PAR-001-2** [blocant] Given migrarea committed, When `npm run db:reset && npm run db:seed`, Then trec fără eroare și creează tenantul demo NGO + utilizatori (requestor/approver/finance/admin).
- **T-PAR-001-3** [blocant] Given `schema/index.ts`, When build, Then conține `export * from "./par"` (altfel `db.query.parRequests` e undefined → 500).
- **T-PAR-001-4** [normal] Given seed-ul, Then există ≥1 `par_settings` cu `micro_purchase_threshold_cents` și `default_currency = "MDL"`.

## PAR-002 — Roluri + DOA matrix
- **T-PAR-002-1** [blocant] Given un user fără rol PAR, When apelează un endpoint protejat cu `requirePARRole("approver")`, Then 403.
- **T-PAR-002-2** [blocant] Given seed, Then există o matrice DOA implicită (≤ prag → 1 pas; > prag → 2 pași incl. Executive Director) — §3.
- **T-PAR-002-3** [blocant] Migration + live API smoke: login ca admin → `GET /api/par/doa` → 200 cu rândurile matricei.
- **T-PAR-002-4** [normal] Given un approver cu `approval_limit_cents = 5000_00`, When evaluăm o cerere de 7000 MDL, Then nu e suficient singur (necesită pasul superior).

## PAR-003 — Config org
- **T-PAR-003-1** [blocant] Given admin, When `POST /api/par/budget-codes {code,name}`, Then 201 și apare în `GET`.
- **T-PAR-003-2** [blocant] Given un IBAN MD valid, When `POST /api/par/vendors`, Then 201; Given un IBAN invalid (checksum greșit), Then 400.
- **T-PAR-003-3** [blocant] Live API smoke: login + `GET /api/par/projects` → 200 (listă, tenant-scoped).
- **T-PAR-003-4** [normal] Given vendor al altui tenant, When `GET /api/par/vendors`, Then NU apare (izolare tenant).

## PAR-101 — Create API (header)
- **T-PAR-101-1** [blocant] Given requestor, When `POST /api/par` cu header valid, Then 201, status `draft`, `request_no` = `PAR-2026-0001` (secvențial per tenant).
- **T-PAR-101-2** [blocant] Given două cereri create consecutiv, Then numerele sunt unice și incrementale (fără coliziune).
- **T-PAR-101-3** [blocant] Migration/portability: răspunsul folosește query builder (nu raw `.execute().rows`); rulează identic pe PGlite.
- **T-PAR-101-4** [blocant] Given `purpose` invalid, When POST, Then 400 (enum guard).
- **T-PAR-101-5** [normal] Given draftul altui user, When `PATCH /api/par/:id`, Then 403 (doar autorul/own draft).

## PAR-102 — Line items
- **T-PAR-102-1** [blocant] Given un PAR draft, When adaug linie `qty=1, unit_price=700000` (7,000.00 MDL), Then `line_total_cents = 700000` și `total_estimated_cents` al PAR se actualizează.
- **T-PAR-102-2** [blocant] Given 2 linii, Then `total_estimated_cents` = suma; valoarea NU e hand-typed (computed server-side).
- **T-PAR-102-3** [blocant] Given `quantity ≤ 0`, When add line, Then 400.
- **T-PAR-102-4** [normal] Given total > micro-purchase threshold, Then UI afișează nota „regula 10%".

## PAR-103 — End-use + payee
- **T-PAR-103-1** [blocant] Given IBAN `MD48ML000002259A19498121`, When validare, Then trece (24 chars, mod-97 OK); Given `MD00…`, Then pică.
- **T-PAR-103-2** [blocant] Given IDNP cu ≠13 cifre, When salvare payee inline, Then 400.
- **T-PAR-103-3** [blocant] Given `purpose=execute_payment` fără `end_use`, When submit (PAR-105/107), Then 400 „end use required".
- **T-PAR-103-4** [normal] Given un vendor existent ales, Then payee snapshot (name/idnp/iban/bank) se copiază pe PAR.

## PAR-104 — Atașamente
- **T-PAR-104-1** [blocant] Given un PAR, When upload attachment kind=`contract`, Then apare în `GET /api/par/:id` cu file_name + kind.
- **T-PAR-104-2** [blocant] Live API smoke: login + upload + `GET` → 200 cu attachment.
- **T-PAR-104-3** [normal] Given `attachments_present=true` și 0 fișiere, When submit, Then warning (nu blochează dacă există `attachments_note`).

## PAR-105 — Create wizard (UI)
- **T-PAR-105-1** [blocant] Given `/app/par/new`, When randare, Then nu crapă; pașii (header→…→review) sunt navigabili.
- **T-PAR-105-2** [normal] Given completez tot și apăs Submit, Then PAR-ul devine `pending_approval` și redirect la `/app/par/:id`.
- **T-PAR-105-3** [blocant] a11y: fiecare input are `<label>`, butoanele icon au `aria-label`, 0 violări axe critical/serious.
- **T-PAR-105-4** [normal] Dark mode: wizardul e lizibil în light + dark (fără hex hardcodat).

## PAR-106 — Dashboard / listă
- **T-PAR-106-1** [blocant] Given requestor cu 3 PAR-uri, When `/app/par`, Then se randează lista cu status chips, fără crash.
- **T-PAR-106-2** [normal] Given filtru `status=draft`, Then doar draft-urile apar.
- **T-PAR-106-3** [normal] Given un approver, Then vede secțiunea „pending my approval"; un finance vede „awaiting payment".

## PAR-107 — Routing engine (DOA)
- **T-PAR-107-1** [blocant] Given total 700000 (7,000 MDL) > prag tenant, When submit, Then se creează lanț de 2 pași `par_approvals` (DOA Holder → Executive Director), step 1 `pending`, step 2 locked.
- **T-PAR-107-2** [blocant] Given total ≤ prag, When submit, Then 1 singur pas de aprobare.
- **T-PAR-107-3** [blocant] Given requestorul e și approver pe pasul 1, Then NU poate fi assignat să-și aprobe propria cerere (self-approval blocat).
- **T-PAR-107-4** [blocant] Live API smoke: login + `POST /api/par/:id/submit` → 200 + lanț creat.
- **T-PAR-107-5** [blocant] Given body-ul PAR la submit, Then se calculează un hash al corpului (immutability) salvat pe PAR.

## PAR-108 — Approver inbox
- **T-PAR-108-1** [blocant] Given un approver cu un PAR pe pasul lui, When `/app/par/inbox`, Then îl vede; render fără crash.
- **T-PAR-108-2** [blocant] Given approve pe pasul 1 (din 2), When acțiune, Then step 1 `approved`, step 2 devine `pending`, PAR rămâne `pending_approval`.
- **T-PAR-108-3** [blocant] Given approve pe ultimul pas, Then PAR → `approved` (+ `in_finance` dacă `execute_payment`).
- **T-PAR-108-4** [blocant] Given Reject cu comentariu, Then PAR → `rejected`, lanțul se oprește.
- **T-PAR-108-5** [normal] Request-changes → PAR `changes_requested` → requestorul poate edita din nou.

## PAR-109 — Aprobare secvențială + integritate
- **T-PAR-109-1** [blocant] Given step 2 încă locked, When un approver încearcă să aprobe step 2 înaintea step 1, Then 409/403 (out-of-order blocat).
- **T-PAR-109-2** [blocant] Given un PAR `pending_approval`, When requestorul încearcă `PATCH` la line items, Then 403 (immutable după submit).
- **T-PAR-109-3** [blocant] Given hash-ul corpului la submit, When se regenerează la afișare, Then coincide (dovadă că s-a aprobat exact ce e afișat).
- **T-PAR-109-4** [normal] Given escaladare (total > 100k), Then lanțul are 3 pași conform matricei.

## PAR-110 — Timeline & audit
- **T-PAR-110-1** [blocant] Given un PAR trecut prin submit→approve→approve, Then `par_audit` are câte un rând per tranziție cu actor + timestamp.
- **T-PAR-110-2** [normal] Given pagina detaliu, Then timeline-ul afișează evenimentele cronologic.

## PAR-111 — Notificări
- **T-PAR-111-1** [blocant] Given submit, Then primul approver primește o notificare in-app „PAR-… awaits your approval".
- **T-PAR-111-2** [blocant] Given final approval pe `execute_payment`, Then finance primește notificare.
- **T-PAR-111-3** [normal] Given reject, Then requestorul primește notificare cu motivul.

## PAR-112 — Finance queue (secțiunea 16)
- **T-PAR-112-1** [blocant] Given un PAR `approved`+`execute_payment`, When `/app/par/finance`, Then apare în coadă; render fără crash.
- **T-PAR-112-2** [blocant] Given finance completează PAR BL / Received By / Assigned To, When salvare, Then `par_payments` se creează/actualizează; PAR → `in_finance`.
- **T-PAR-112-3** [blocant] Live API smoke: login finance + `GET /api/par/finance` → 200.
- **T-PAR-112-4** [normal] Given un `obtain_quotations` PAR, Then NU apare în coada finance (se închide la `approved`).

## PAR-113 — Execuție plată + regula 10%
- **T-PAR-113-1** [blocant] Given total estimat 700000 (>prag), When finance introduce actual 800000 (>10% peste), Then PAR → `reapproval_required` (nu `paid`).
- **T-PAR-113-2** [blocant] Given actual ≤ +10% din estimat, When marchează plătit, Then PAR → `paid`, `paid_at` setat.
- **T-PAR-113-3** [blocant] Given total ≤ prag, When actual e cu >10% peste, Then se poate plăti fără reaprobare (regula se aplică doar peste prag) — §3.
- **T-PAR-113-4** [blocant] Live API smoke: login + `POST /api/par/:id/pay` → 200/stare corectă.

## PAR-114 — PDF generator
- **T-PAR-114-1** [blocant] Given un PAR complet, When `buildParHtml(par)`, Then HTML-ul conține titlul „Payment Action Request (PAR) Form", cele 16 secțiuni, opțiunea Purpose/Charge marcată `X`, tabelul de linii + „TOTAL ESTIMATED COST", boxurile de semnătură cu Name/Title/Date.
- **T-PAR-114-2** [blocant] Given un total 700000 MDL, Then se afișează formatat `L 7 000` (stil `paymentAccountPdf.money`).
- **T-PAR-114-3** [normal] Given payee cu diacritice/caractere speciale, Then sunt escapate corect (fără injectare HTML).

## PAR-115 — Download PDF
- **T-PAR-115-1** [blocant] Given pagina `/app/par/:id`, When click „Download PDF", Then se generează un A4 fără eroare (jsPDF), fără crash.
- **T-PAR-115-2** [normal] Given PDF generat, Then se atașează la înregistrare (`par_attachments` kind=`par_pdf` sau `pdfKey`).

## PAR-116 — Admin DOA UI
- **T-PAR-116-1** [blocant] Given par_admin, When `/app/par/admin`, Then randare fără crash; poate adăuga/edita un rând DOA.
- **T-PAR-116-2** [blocant] Given un non-admin, Then ruta `/app/par/admin` e blocată (403/redirect).
- **T-PAR-116-3** [normal] Given modific pragul micro-purchase, Then noile cereri rutează după noua valoare.

## PAR-117 — Rapoarte
- **T-PAR-117-1** [blocant] Given PAR-uri plătite pe 2 budget codes, When `GET /api/par/reports/by-budget`, Then sumele sunt corecte per cod, tenant-scoped.
- **T-PAR-117-2** [normal] Given export CSV, Then fișierul conține rândurile filtrate.

## PAR-118 — Pagina detaliu completă
- **T-PAR-118-1** [blocant] Given un PAR în orice stare, When `/app/par/:id`, Then toate 16 secțiuni read-only se randează corect (fără crash), cu timeline + lanț aprobare.
- **T-PAR-118-2** [normal] Given rolul curent, Then butoanele de acțiune sunt cele permise (approver vede Approve/Reject; finance vede Mark paid; requestor vede Edit draft/Cancel).
- **T-PAR-118-3** [blocant] a11y + dark mode: 0 violări axe critical/serious; lizibil în ambele teme.
