# PAR / FinFlow — audit de securitate + performanță
**29 august 2026.** 5 agenți în paralel: securitate internă (authz/izolare), securitate externă,
performanță backend, performanță frontend, DB/indexuri/cache. Rapoartele detaliate sunt fișierele
alăturate. Constatările marcate „verificat" au fost re-verificate manual în cod după raportul agentului.

## Verdict în trei rânduri
Izolarea de tenant e solidă — nu s-a găsit niciun IDOR cross-tenant, iar validarea de intrare e
consistentă. Riscul real e altundeva: **două căi de preluare a platformei din exterior** și un set de
**controale financiare care se pot ocoli din interior** (auto-re-aprobare, delegare fără plafon, gaură
în matricea DOA). Pe performanță, problema dominantă e că mediul local (PGlite în proces, ~0,1 ms/query)
ascunde structural costul rețelei din producție — clasa de bug-uri „26 de query-uri secvențiale" e
invizibilă în dezvoltare prin construcție.

## P0 — de reparat în următoarele ore

| # | Problemă | Dovadă | Fix |
|---|---|---|---|
| P0-1 | **Preluare completă a platformei**: superadmin obținut printr-o invitație către emailul de proprietar hardcodat | `platformOwner.ts:12` + `requirePlatformAdmin.ts:21-31` + `users.ts:42` + `parInvites.ts:52,89` + `auth.ts:586-599`; `PLATFORM_ADMIN_EMAILS` **absent** în prod (verificat cu `vercel env ls`) | Interzice emailurile din `platformOwnerEmails()` pe toate căile de creare/rehome de cont; legă superadminul de `platform_admins` + tenant, nu de un șir de email |
| P0-2 | **`ENCRYPTION_KEY` lipsește în producție** → `crypto.ts` folosește `DEV_KEY` hardcodat: cookie `vl_g_pending` forjabil, secrete la rest (2FA/SFS/Stripe) criptate cu cheie publică | `crypto.ts:15,28` (doar `console.error`, nu `throw`); `vercel env ls production` | Setează cheia + `throw` în producție când lipsește; re-criptează secretele existente |

**Lanțul P0-1, 4 requesturi:** signup liber → `POST /api/par/invites` către emailul proprietarului
(verificarea „userul există" e scoped pe tenant) → tokenul brut vine în răspuns (`inviteUrl`) →
`POST /api/auth/accept-invite` cu parolă proprie (fără verificare de email) → cont cu emailul
proprietarului → `/api/platform/*` + `POST /api/impersonation/start` pe orice client.

## P1 — securitate

- **2FA se ocolește complet** prin `POST /api/business/auth/login` — `auth.ts:143-165` verifică
  `twoFactorSettings`, `businessAuth.ts:165-232` nu; emite sesiune completă la l.219.
- **Path traversal la finalize captures** — `finCaptures.ts:873` verifică doar `startsWith(tenantId + "/")`;
  `"AAA/../BBB/x.pdf"` se normalizează la alt tenant, citit cu cheia service-role (fără RLS).
- **Fără rate limit** pe `/api/auth/2fa/verify` (cod de 6 cifre, forță brută) și `/api/auth/accept-invite`;
  regula din `app.ts:177` pentru `/api/par/invites/accept` nu corespunde niciunei rute (e moartă).
- **Datele bancare ale tuturor beneficiarilor**, expuse oricărui cont autentificat —
  `parSuggestions.ts:26` (doar `requireAuth`, fără scope), răspuns cu IBAN/IDNP.
- **Impersonarea poate aproba și plăti**, iar auditul înregistrează numele clientului ca semnatar —
  non-repudiere ruptă (`lib/impersonation.ts:88-101`).

## P2 — controale financiare care se pot ocoli (detalii în sec-internal.md)
Auto-re-aprobarea depășirii (`parApprovals.ts:886`) · delegarea care evaporă plafonul DOA
(`parApprovals.ts:247-258` + `delegations.ts`) · gaura între benzile DOA ⇒ lanț de o singură semnătură
(`doa.ts:81-94`) · nicio segregare cere-vs-plătește (`parPayments.ts:298,400`) · ștergerea istoricului
de aprobări la reopen/withdraw/re-submit · plata nu re-verifică sigiliul de integritate ·
delegările nu se auditează · 5 rute fără scope, inclusiv `/dosar` (PDF cu IBAN/IDNP) ·
injecție de formule în CSV (`parReports.ts:595-605`).

## Performanță — top câștiguri, în ordinea raportului calitate/efort

1. **`GET /api/par/:id` trimite corpurile base64 ale atașamentelor** — `par.ts:941-944` face `select()`
   complet pe `par_attachments`, iar `file_url` e `text` cu data-URL de megabyți (`schema/par.ts:622`).
   Realist 5-20 MB per deschidere de detaliu; peste ~4,5 MB funcția Vercel cade. UI-ul folosește
   `fileUrl` doar la click, iar `/attachments/:id/preview` există deja. **~1000× pe payload, fix mecanic.**
2. **Index lipsă pe `par_payer_modules(tenant_id)`** — `schema/par.ts:177-180` are doar `payer_id`, dar
   `requireModuleEntitlement.ts:28-30` filtrează pe `tenant_id + module_key` ⇒ scan la **fiecare**
   request `/api/par/*`. O linie de SQL. (De livrat și în `sync-schema.ts` — migrările nu se aplică fiabil pe prod.)
3. **`backfillStuckApprovalChains` — N+1 la fiecare deschidere de inbox** (`doa.ts:139-143`, apelat
   necondiționat din `parApprovals.ts:409`): un query per cerere `pending_approval`. N=200 ⇒ ~4 s.
   Se rescrie în 2 query-uri. În 99,9% din cazuri nu vindecă nimic.
4. **`GET /api/par/finance` trage dovezile de plată base64** — `parPayments.ts:196-199`, coadă
   neplafonată, filtrare de arie în JS.
5. **Autorizarea recalculată de 10 ori pe pagina de rapoarte** — ~140 de query-uri de autorizare pentru
   10 de conținut, prin 3 conexiuni. `accessiblePayerIds` reapelează intern `accessibleProjectIds`
   (`projectScope.ts:35-51`), deci `Promise.all([...])` — tipar folosit în 5 fișiere — îl rulează de două ori.
6. **`GET /api/par/:id` ≈ 26 de round-trip-uri secvențiale** — `buildBodyForHash` recitește date deja în
   memorie (`par.ts:977` vs `:898,:930`); 5 lookup-uri de etichetă secvențiale (`:1010-1044`). 26 → ~6.
7. **`POST /api/par/bulk-approve` nu se poate termina** — 25 × `approveParStep` secvențial ⇒ 20-60 s.
8. **Emailurile se trimit sincron, în buclă, pe calea cererii** — `services/par/notify.ts:194-200`.
9. **`parConfigImport`: 2 query-uri per rând × 6 categorii** — 800 de rânduri ⇒ 32-48 s pe prod, ~2 s local.
10. **Indexuri compuse lipsă pe `par_requests`** — azi doar 4 indexuri single-column
    (`schema/par.ts:535-538`); `project_id`, `event_id`, `budget_code_id`, `department_id` neindexate deloc.
    De adăugat: `(tenant_id, created_at DESC)`, `(tenant_id, status, submitted_at DESC)`,
    `(tenant_id, date_of_request)`, `(tenant_id, purpose, status)` + parțial pe `par_approvals` pending.

### Frontend
- `ParDetail.tsx:72` — `@/lib/parPdf` importat STATIC ⇒ html2canvas (174 KB gzip) + jsPDF eager pe
  fiecare detaliu, deși calea dinamică corectă există deja la `:250-252`. Rasterizarea rulează de 2× per click.
- `ParExchange.tsx:31` — `recharts` static, reintroducând problema pe care PERF-003 o rezolvase.
- Căutarea din `ParDashboard.tsx:145,231-258` nu e debounced (un GET per literă), fără `AbortController`
  (race real), iar `listKey` include `searchQ` ⇒ lista clipește la fiecare tastă. `useDebouncedValue.ts` există deja.
- Atașamentele urcă base64 în JSON (`ParCreateForm.tsx:1176`, `lib/api/par.ts:667-675`) cu plafon
  client de 10 MB, peste limita de ~4,5 MB a funcției Vercel ⇒ `413` neexplicat între 3,3 și 10 MB.
  `prefillParFromDocument` (`:1800`) face deja corect, cu `FormData`.
- `ParCreateForm.tsx:568-577` — două `Promise.all` secvențiale fără dependență între ele.

### Cereri la deschidere (sesiune rece)
ParReports 13 · ParCreateForm 9 (2 valuri) · ParDashboard 5 (+4) · ParInbox 4 · ParDetail 3 (+2) ·
ParFolders 3 · ParExchange 1-2 · ParFinanceQueue 1 · ParEfacturaQueue 1 (+1) · ParOnboarding 1 · ParAdmin 1-3/tab

### Infrastructură
- `httpCache.ts:38-43` pune `no-store` pe tot `/api/*`; nicio rută PAR nu-și setează propriul header.
  Candidați siguri pentru `private, max-age`: `/fx/*`, `/settings`, `/budget-codes`, `/projects`, `/members`.
  **Niciodată** listă/inbox/finance/rapoarte/detaliu.
- `db/client.ts` — `max:3`, `prepare:false`, fără `idle_timeout`: corect pentru Vercel+pgBouncer.
- `db/migrate.ts` rulează migrările pe conexiunea **pooled** (6543) în loc de directă (5432), din cauza
  `client.ts:32` — explicație tehnică plauzibilă pentru desincronizarea de migrări documentată în CLAUDE.md.

## Ce e verificat curat (ca să nu se re-auditeze)
Izolarea de tenant pe toate rutele PAR · validarea zod / absența mass assignment · auto-aprobarea pe
approve/reject · verificarea sigiliului la aprobare · rapoartele folosesc același scope ca listarea ·
`par_audit` fără UPDATE/DELETE · importurile grele (exceljs, pdf-lib) sunt dinamice peste tot —
lecția outage-ului e respectată, dar **nu e apărată de nicio gardă automată**, deci reintră la primul refactor.

## Verificare externă live pe `finflow1.vercel.app` (29 aug)
CSP strict, HSTS, `X-Frame-Options: DENY`, nosniff, Permissions-Policy — toate prezente. Toate
endpointurile PAR probate răspund `401` neautentificat. CORS: origine străină nu primește `ACAO`.
Login-ul dă `invalid_credentials` generic. `/api/*` inexistent dă JSON 404, nu HTML.
**Singura scurgere vizibilă:** `/api/health/db` public → `{"ok":true,"tables":240,"counts":{"tenants":12,"users":23}}`.

## Golurile de test (fiecare fix de mai sus are nevoie de garda lui)
- Niciun test că un email din `platformOwnerEmails()` NU poate fi revendicat prin invite/signup/Google.
- Niciun test că `/api/business/auth/login` respectă 2FA.
- Niciun test negativ de path traversal pe `/api/fin/captures/finalize`.
- Niciun test că rate-limitul rezistă la `X-Forwarded-For` fabricat.
- Niciun test de export CSV cu valoare care începe cu `=`.
- **Pentru performanță: nu teste de timp** (PGlite la 0,1 ms/query nu poate demonstra nimic), ci teste
  care **numără query-urile** printr-un spion pe `db`: „`GET /api/par/:id` face ≤ 8 query-uri".
