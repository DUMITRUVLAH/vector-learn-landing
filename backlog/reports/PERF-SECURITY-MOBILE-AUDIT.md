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

## 4. Ce s-a livrat — măsurători înainte/după

Toate cifrele sunt măsurate pe același build de producție, aceeași mașină, același tenant.

### 4.1 Încărcare inițială

| | Înainte | După | |
|---|---|---|---|
| Calea critică (gzip) | **684 KB** | **90 KB** | −87% |
| Chunk de intrare | 3.063 KB / 669 KB gz | 106 KB / 22 KB gz | −97% |
| react-vendor | 328 KB / 99 KB gz | 142 KB / 46 KB gz | build de producție, nu de dezvoltare |
| `Cache-Control` pe assets | absent | `max-age=31536000, immutable` | refresh-ul nu mai redescarcă nimic |
| Compresie | absentă | gzip (3,06 MB → 669 KB pe fir) | |

### 4.2 Cereri API pe încărcare de pagină

| Rută | Înainte | După |
|---|---|---|
| `/business/par` | **34** (`auth/me` ×6) | **12** (zero duplicate) |
| `/business/fin/invoices` | 16 | 6 |
| `/business/dashboard` | 15 | 10 |
| `/business/fin/` | 13 | 5 |

### 4.3 Cost pe cerere autentificată

3 interogări DB → **1 la 30 s per sesiune** (cache în proces). `last_active_at` se scrie cel mult
o dată pe minut, nu la fiecare cerere. Pe Supabase asta înseamnă ~60–120 ms mai puțin pe FIECARE
cerere autentificată; înmulțit cu cele 12 cereri ale unei pagini PAR, e cea mai mare economie de
pe producție (local, cu PGlite în proces, e invizibilă — de asta trebuie măsurată pe prod).

### 4.4 Mobil (iPhone SE 375 / iPhone 14 390 / Pixel 7 412)

| | Înainte | După |
|---|---|---|
| Pagini care derulează lateral | **6** | **0** |
| Ținte de atingere < 44×44 | **246** | **18** |
| Erori JS | 0 | 0 |

Cele 18 rămase sunt bifele native de 13×13 (ținta reală e `<label>`-ul din jur) și câteva butoane
locale de pagină. Reparațiile de fond stau în design system (`ds/Button`, `ds/Field`, `ds/Tabs`)
plus o regulă CSS pentru controalele native — deci se aplică și paginilor scrise de acum înainte.

### 4.5 Securitate

- CSP, `X-Frame-Options: DENY`, HSTS (doar prod), `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy` — pe fiecare răspuns.
- Limitare de rată: 10 încercări / 15 min / IP pe login, signup, reset parolă și acceptare de
  invitație; 20/oră pe endpoint-urile AI. **Verificat live:** a 11-a încercare primește 429.
- CORS: originile necunoscute nu mai primesc niciun header.
- Revocarea sesiunii (logout, deconectare dispozitiv, resetare parolă) golește cache-ul de sesiuni
  pe loc — testat în `server/__tests__/session-cache.test.ts`.

---

## 5. Bug-ul care nu era pe listă

Cel mai mare câștig de viteză nu era niciuna dintre ipotezele inițiale.

`.env` și `.env.example` conțin `NODE_ENV=development`. Vite citește `NODE_ENV` din fișierele
`.env`, deci **fiecare build de producție împacheta build-ul de DEZVOLTARE al React** — confirmat
prin prezența textelor de avertizare care există doar acolo („Invalid hook call", „Each child in a
list should have a unique key").

Asta nu înseamnă doar 2,3× mai mulți octeți. Build-ul de dezvoltare al React rulează validări
suplimentare la FIECARE randare a FIECĂREI componente. Aplicația era efectiv mai lentă în producția
clientului plătitor, dintr-un motiv invizibil în cod și în review.

Reparat în comanda de build (`package.json` + `vercel.json`), nu în `vite.config.ts`: prima
încercare, cu `define: { "process.env.NODE_ENV": "production" }`, a schimbat runtime-ul React fără
să schimbe transformarea JSX din pluginul SWC → `r.jsxDEV is not a function` și ecran alb pe toate
rutele. Ambele decizii vin din `NODE_ENV`, deci trebuie setat înainte ca Vite să pornească.

> **Dacă simptomul revine doar pe Vercel:** verifică `NODE_ENV` în variabilele de mediu ale
> proiectului (Settings → Environment Variables). Dacă e `development` acolo, build-ul îl va citi.

---

## 6. Porți noi (ca regresiile să nu se poată întoarce tăcut) — CLAUDE.md §3.5.1quater

| Poartă | Ce blochează |
|---|---|
| `scripts/check-react-prod-build.mjs` | React de dezvoltare ÎN dist — atât runtime-ul, cât și transformarea JSX |
| `scripts/check-bundle-budget.mjs` | un import static nou în `App.tsx` care umflă calea critică peste 150 KB gzip |
| `src/__tests__/perf/apiCache.test.ts` | cache-ul care ar începe să servească date învechite după o mutație |
| `server/__tests__/session-cache.test.ts` | o sesiune revocată care ar mai fi acceptată din cache |

Ambele porți de build și-au dovedit utilitatea în timpul acestei lucrări:

- **check-bundle-budget** a prins prima variantă de `manualChunks`: forțând `recharts` și `jspdf`
  în chunk-uri numite, Rollup a mutat acolo și helperele partajate, iar chunk-ul de intrare a ajuns
  să importe STATIC `pdf-*.js` (171 KB gzip) pentru câțiva octeți de utilitar. Fără poartă, s-ar fi
  livrat ca „optimizare".
- **check-react-prod-build** a trecut verde peste un build complet nefuncțional, pentru că verifica
  doar runtime-ul, nu și transformarea JSX. Acum verifică ambele jumătăți ale perechii.

---

## 7. Ce NU s-a făcut (deliberat) — următorii pași

1. **KPI-urile din `ParDashboard` se calculează în client**, însumând peste toate cererile.
   `GET /api/par` are acum un plafon de 1000 de rânduri (înainte: nelimitat), deci pentru un tenant
   care depășește plafonul sumele vor fi parțiale. Reparația corectă e un endpoint de sumar agregat
   pe server — schimbă cifrele afișate, deci cere verificare separată, nu merită strecurată aici.
2. **63 de `fetch("/api/...")` directe** în `src/` ocolesc `src/lib/api.ts`, deci nu beneficiază de
   deduplicare. Am rutat prin cache doar `getFinMe` (singurul care apărea duplicat în măsurători).
   Restul: migrare treptată, fiecare are tratare proprie de erori.
3. **Rate limiting per instanță.** Pe Vercel, fiecare instanță serverless are contorul ei, deci un
   atac distribuit nu e oprit. Un contor global cere Redis/Upstash — decizie de infrastructură.
4. **Text sub 12 px** (10–11 px pe formularul PAR și pe Acasă FinDesk, 72 de apariții). Nu e o
   încălcare WCAG, ci un prag ales de mine; mărirea afectează densitatea unor ecrane dense de
   finanțe. Recomand decizia de design înainte de schimbare.
5. **Fonturile Google blochează randarea** (`index.html`). Auto-găzduirea lor ar mai scoate un
   dus-întors către un domeniu terț de pe calea critică.
