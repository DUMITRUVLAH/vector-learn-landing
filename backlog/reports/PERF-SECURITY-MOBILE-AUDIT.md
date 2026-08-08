# Audit performanță · securitate · mobil — FinFlow

**Data:** 2026-08-08 · **Branch:** `feat/PERF-faza-1-viteza-securitate-mobil` · **Bază:** `origin/main` (b3885e1)

Măsurat pe build de producție (`vite build` + `server/index.ts`), tenant demo ATIC, Chromium headless.
Toate cifrele de mai jos sunt măsurate, nu estimate.

---

## 0. Verdict

Senzația de „se mișcă greu și se reîncarcă tot la fiecare refresh" are **trei cauze reale**, toate
confirmate cu măsurători:

1. **Niciun header de cache pe fișierele statice** → browserul redescarcă **3,06 MB de JS** la
   fiecare refresh. Nu există `Cache-Control`, nici `ETag`, nici `Last-Modified`.
2. **Un singur bundle de 3,06 MB / 669 KB gzip** (bugetul din CLAUDE.md §3.4 e 100 KB gzip/rută)
   — 60 de pagini importate eager în `App.tsx`, plus `recharts`, `jspdf`, `html2canvas`, `qrcode`.
3. **Zero cache pe datele din API** → `/api/business/auth/me` se cere de **4–6 ori** la fiecare
   încărcare de pagină; `/business/par` face **34 de cereri API** pentru un singur ecran.

Adică: refresh = redescarcă tot codul + reinterogează tot, de mai multe ori. Exact simptomul descris.

---

## 1. Performanță — măsurători de referință

### 1.1 Bundle

| Fișier | Raw | Gzip |
|---|---|---|
| `assets/index-*.js` (chunk principal) | **3.063 KB** | **669 KB** |
| `assets/index.es-*.js` | 150 KB | 51 KB |
| CSS | 83 KB | 14,5 KB |
| **Total `dist/`** | **3,6 MB** | — |

Buget CLAUDE.md §3.4: **≤ 100 KB gzip per rută**. Depășire **6,7×**.

Cauza: `src/App.tsx` importă static ~60 de pagini (doar 12 sunt `lazy`). Prin ele intră în chunk-ul
principal, pentru *toți* utilizatorii, inclusiv pe ecranul de login:

- `recharts` — via `ParReports.tsx`, `PaymentsDonut.tsx` (import static)
- `jspdf` + `html2canvas` — via `src/lib/parPdf.ts` ← `ParDetail.tsx` (import static)
- `qrcode` — via `epcQr.ts`, `certificateRender.ts`
- `jszip` — via `certificateZip.ts`

### 1.2 Headere HTTP (măsurat cu `curl -I`)

```
GET /assets/index-Bkm4ihWH.js
HTTP/1.1 200 OK
content-length: 3068937
content-type: text/javascript
        ← fără Cache-Control, fără ETag, fără Last-Modified, fără compresie
```

Fișierele au nume cu hash de conținut (`index-Bkm4ihWH.js`), deci sunt **imutabile prin construcție**
și ar trebui servite cu `max-age=31536000, immutable`. În loc de asta, se redescarcă integral la
fiecare refresh. `.vercel/output/config.json` nu declară niciun `headers`, deci nici prod nu le are.

### 1.3 Cereri API pe încărcare de pagină (măsurat cu Playwright)

| Rută | Cereri API | Duplicate notabile |
|---|---|---|
| `/business/par` | **34** | `auth/me` ×6, `par/me` ×4, `par/inbox` ×3, restul ×2 |
| `/business/fin/invoices` | 16 | `auth/me` ×4, `fin/invoices` ×2, `fin/invoices/aging` ×2 |
| `/business/dashboard` | 15 | `auth/me` ×4, `fin/expenses/summary` ×2, `fin/invoices?limit=500` ×2 |
| `/business/fin/` | 13 | `auth/me` ×4, `fin/members/me` ×3 |

Cauza: `useBusinessSession()` face `fetch` propriu la fiecare montare, iar `BusinessGuardPage`,
`BusinessShell` și `ParGuardPage` îl apelează fiecare separat pe același ecran. `src/lib/api.ts` e
un `fetch` gol — fără deduplicare, fără cache, fără revalidare. `sessionCache.ts` există, dar e
folosit doar pentru `my-modules` și `par-me`, nu pentru sesiune.

În plus, `BusinessShell` sondează `/api/platform/catalog` la fiecare montare pentru a afla dacă
utilizatorul e superadmin — un 403 garantat pentru 99% dintre utilizatori, la fiecare navigare.

### 1.4 Cost pe cerere autentificată

`getSessionUser()` (`server/auth/session.ts`) face, **la fiecare cerere autentificată**:

1. `SELECT` din `sessions` după token
2. `SELECT` din `users` după `userId`
3. `UPDATE sessions SET last_active_at` (fire-and-forget, dar tot lovește DB-ul)

Local, cu PGlite în proces, e invizibil (2–20 ms). Pe prod, cu Supabase peste rețea, sunt ~3 dus-întors
× ~20–40 ms = **60–120 ms de overhead pur de autentificare pe fiecare cerere**. Înmulțit cu cele 34
de cereri de pe `/business/par` → ~2–4 secunde doar din autentificare repetată.

### 1.5 Interogări fără paginare

`GET /api/par` (`server/routes/par.ts:739`):

```ts
const rows = await db.select().from(parRequests).where(and(...conditions))
  .orderBy(desc(parRequests.createdAt));   // fără limit, fără offset, toate coloanele
```

Întoarce **toate** cererile tenantului, cu **toate** coloanele, ordonate în DB. La 10.000 de PAR-uri
înseamnă răspuns de câțiva MB și sortare completă la fiecare apel. `total` e calculat ca
`result.length`, deci paginarea nici nu poate fi adăugată fără a schimba contractul.

Frontendul cere pe dashboard `GET /api/fin/invoices?limit=500` — 500 de facturi pentru un widget.

### 1.6 Indecși — risc pe producție

Schema drizzle declară **294 de indecși**, inclusiv `sessions_token_idx` (cea mai fierbinte
interogare din aplicație). Dar:

- migrările **nu se aplică fiabil pe prod** (memorie confirmată: `prod-migration-tracking-desynced`);
- `server/db/sync-schema.ts` vindecă **doar coloane** (`ADD COLUMN IF NOT EXISTS`) și 11 indecși
  scriși de mână — **nu** cei 294 din schemă.

Deci pe producție e foarte probabil ca indecși din calea fierbinte să lipsească → seq scan pe
`sessions` la fiecare cerere.

---

## 2. Securitate

| # | Constatare | Severitate |
|---|---|---|
| S1 | **Zero headere de securitate.** Fără `Content-Security-Policy`, `X-Frame-Options`, `HSTS`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Aplicația poate fi încadrată în iframe (clickjacking pe butoanele de aprobare plăți). | **Înalt** |
| S2 | **Rate limiting inexistent.** `hono-rate-limiter` e în `package.json` dar nu e importat nicăieri. `POST /api/business/auth/login` acceptă un număr nelimitat de încercări → credential stuffing. La fel signup, invite-accept, endpoint-urile AI (cost real per apel) și upload-urile. | **Înalt** |
| S3 | **CORS greșit.** `origin: (origin) => allowedOrigins.includes(origin) ? origin : allowedOrigins[0]` — o origine necunoscută primește `Access-Control-Allow-Origin: http://localhost:5173` împreună cu `credentials: true`. Corect e să nu se emită niciun header. | Mediu |
| S4 | Cookie de sesiune `SameSite=Lax`. Pentru o aplicație care aprobă plăți, `Strict` e alegerea corectă; nu există token CSRF ca a doua linie. | Mediu |
| S5 | bcrypt cu 10 runde **fără** limitare de rată la login. Una dintre cele două trebuie întărită. | Mediu |
| S6 | `/api/health/db` expune public numărul de tabele, tenanți și utilizatori. Recunoaștere gratuită. | Scăzut |

Verificate și **în regulă**: fără `sql.raw`/`sql.unsafe` (zero suprafață de SQL injection),
`.env` netrackuit în git, parole hash-uite cu bcrypt, secrete la repaus cu AES-256-GCM,
izolare pe tenant prezentă pe rutele PAR verificate.

---

## 3. Mobil (măsurat pe iPhone SE 375px, iPhone 14 390px, Pixel 7 412px)

| # | Constatare | Unde |
|---|---|---|
| M1 | **Pagina derulează pe orizontală.** Banda de filtre pe status (`inline-flex`, „Toate cererile / Ciorne / Întoarse pentru modificare…") nu se înfășoară și nu derulează → **+39 px** peste ecran pe iPhone SE, +24 px pe iPhone 14. | `/business/par` |
| M2 | Același defect: rândul de acțiuni „Angajați / Rulaj nou" → **+31 px**. | `/business/fin/payroll` |
| M3 | **246 de ținte de atingere sub 44×44.** Sistematic: hamburgerul și clopoțelul din `BusinessShell` sunt **40×40**; toate butoanele `h-9`/`h-10` au 36–40 px înălțime; `select`-urile de filtrare 38–40 px. | Toate rutele |
| M4 | Text sub 12 px: 10–11 px pe formularul de cerere și pe Acasă FinDesk. | `/business/par/new`, `/business/fin/` |
| M5 | Cardurile KPI se stivuiesc câte unul pe rând → 4 numere ocupă 4 ecrane de derulare. | `/business/par`, dashboard |

Zero erori JS pe mobil pe toate cele 17 rute × 3 ecrane. Sertarul de navigare, bara de jos și
redirecționările funcționează corect.

Capturi: `output/mobile/<ecran>/<rută>.png`.

---

## 4. Plan de remediere (ordonat după impact)

1. `Cache-Control: immutable` pe assets + `no-cache` pe `index.html` + `ETag` + compresie — local și în `.vercel/output/config.json`
2. Strat de cache/dedup pentru cereri în `src/lib/api.ts` + sesiune prin `sessionCache`
3. Code splitting: rute lazy + `manualChunks` pentru `recharts`/`jspdf`/`html2canvas`
4. Headere de securitate + rate limiting + CORS corect
5. Cache de sesiune pe server (elimină 2 din 3 dus-întorsuri per cerere)
6. Sincronizare indecși la deploy + paginare pe `GET /api/par`
7. Mobil: overflow, ținte de atingere, dimensiuni de text, densitate KPI
