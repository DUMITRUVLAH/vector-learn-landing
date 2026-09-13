# Audit de securitate externă — FinFlow (PAR) — 2026-08-29

Repo: `/Users/dima/vector-learn-landing`, branch `feat/platform-impersonation`.
Metodă: citire de cod (server/ + src/), verificare de rutare Hono cu test local, `npm audit --omit=dev`,
`vercel env ls production` (doar nume de variabile, fără valori).

Legendă: **CONFIRMAT** = verificabil direct din cod/config, fără presupuneri.
**PROBABIL** = tipar periculos prezent, exploatabilitatea depinde de o condiție de mediu pe care nu am putut-o măsura.

---

## P0-1 — CONFIRMAT — Preluarea completă a platformei: superadmin prin invitație către emailul de proprietar

**Severitate: CRITICĂ.** Atacator anonim de pe internet → superadmin de platformă → impersonare a ORICĂRUI
utilizator din ORICE workspace (inclusiv aprobator/finanțe pe PAR-uri cu bani).

### Dovada în cod
- `server/lib/platformOwner.ts:12` — `const FALLBACK_OWNER_EMAILS = ["vlah.business@gmail.com"];`
- `server/lib/platformOwner.ts:15` — fallback-ul e activ dacă `PLATFORM_ADMIN_EMAILS` lipsește.
  **`vercel env ls production` NU conține `PLATFORM_ADMIN_EMAILS`** → în producție e activ emailul hardcodat.
- `server/middleware/requirePlatformAdmin.ts:21-31` — dacă `isPlatformOwnerEmail(user.email)` e adevărat,
  se INSEREAZĂ automat un rând în `platform_admins` și se acordă accesul.
- `server/db/schema/users.ts:42` — `uniqueIndex("users_tenant_email_uniq").on(t.tenantId, t.email)`
  → unicitatea emailului e **per tenant**, nu globală. Același email poate exista în alt workspace.
- `server/routes/parInvites.ts:41-89` — `POST /api/par/invites` cere doar `par_admin`;
  `requirePARRole` (`server/middleware/requirePARRole.ts:74`) tratează `users.role="admin"` ca par_admin implicit,
  iar self-signup-ul face exact asta (`server/routes/businessAuth.ts:116` — `role: "admin"`).
  Ruta **întoarce tokenul brut în răspuns**: `parInvites.ts:89` → `inviteUrl: url`.
- `server/routes/auth.ts:506-640` — `POST /api/auth/accept-invite` caută userul existent DOAR în tenantul
  invitației (`auth.ts:545-549`), deci nu se lovește de contul real al proprietarului; creează un user nou cu
  `email: emailLower` (`auth.ts:597`) și **emite direct sesiunea** (`auth.ts:632-634`).
- `server/routes/impersonation.ts:98` — `POST /api/impersonation/start` cere doar `requirePlatformAdmin`;
  `server/lib/impersonation.ts:88-101` creează o sesiune completă pe contul victimei.

### Scenariul de atac (integral din exterior, fără nicio credențială)
1. `POST /api/business/auth/signup` — self-signup deschis (`server/app.ts:174`, `businessAuth.ts:72`).
   Atacatorul devine `admin` în workspace-ul lui.
2. `GET /api/par/payers` → ia `payer_id`-ul propriu.
3. `POST /api/par/invites` `{email:"vlah.business@gmail.com", par_role:"requestor", payer_ids:[...]}`
   → răspunsul conține `inviteUrl` cu tokenul brut.
4. `POST /api/auth/accept-invite` `{token, name:"x", password:"<al lui>"}`
   → se creează în tenantul ATACATORULUI un user cu emailul proprietarului platformei, iar cookie-ul de sesiune
   e setat pe loc.
5. Orice `GET /api/platform/*` → `requirePlatformAdmin` vede emailul de proprietar, îl auto-provizionează în
   `platform_admins` → acces la toate workspace-urile, statistici, istoric de logări, module.
6. `POST /api/impersonation/start {userId}` pentru orice user care nu e el însuși superadmin →
   sesiune completă în contul clientului plătitor (citire dosare PAR, IBAN-uri, aprobări, plăți).

Emailul de invitație chiar pleacă spre proprietar (`lib/par/invites.ts:33`), deci atacul e *detectabil*, dar nu e
împiedicat.

### Fix concret
1. `requirePlatformAdmin` să NU mai accepte fallback-ul pe email fără o a doua condiție verificabilă:
   cel puțin `AND user.tenantId = <tenantul proprietarului>` **sau**, mai bine, eliminarea completă a
   fallback-ului + un rând real în `platform_admins` (script de bootstrap rulat o dată).
2. Cât timp fallback-ul există: interzice crearea/mutarea unui cont pe un email din `platformOwnerEmails()`
   pe orice cale (signup, accept-invite, Google join, rehome) — validare centrală în `auth.ts` + `parInvites.ts`.
3. `POST /api/par/invites` să respingă emailurile de proprietar de platformă (`400 forbidden_email`).
4. Recomandat suplimentar: verificare de email la crearea de cont (azi nu există nicăieri).

---

## P0-2 — CONFIRMAT (cod) + CONFIRMAT (env) — `ENCRYPTION_KEY` lipsește în producție → cookie de identitate Google forjabil

**Severitate: CRITICĂ.**

### Dovada
- `server/lib/crypto.ts:15` — `const DEV_KEY = "dev-key-do-not-use-in-production-32";`
- `server/lib/crypto.ts:28` — `const raw = process.env.ENCRYPTION_KEY ?? DEV_KEY;` (avertisment în log la linia 20, dar **nu** aruncă).
- `vercel env ls production` — **`ENCRYPTION_KEY` NU apare în lista variabilelor de producție.**
  Deci în prod se folosește cheia din cod, cunoscută de oricine are acces la repo/artefact.
- `server/routes/auth.ts:698-708` (`readPendingGoogle`) — identitatea Google „în așteptare" e ținută exclusiv într-un
  cookie `vl_g_pending` criptat cu acea cheie; `auth.ts:1143` îl scrie.
- Cine acceptă acel cookie ca UNICĂ autentificare:
  `POST /api/auth/google/create-workspace` (`auth.ts:1200`), `POST /api/auth/google/join` (`auth.ts:1268`),
  `POST /api/auth/google/accept-matched-invite` (`auth.ts:1359`).

### Scenariul de atac
Atacatorul calculează `encrypt(JSON.stringify({sub:"oricare", email:"victima@client.md", name:"x", picture:null}))`
cu AES-256-GCM și cheia `sha256("dev-key-do-not-use-in-production-32")`, pune rezultatul în cookie-ul `vl_g_pending`
și apelează:
- `POST /api/auth/google/accept-matched-invite` → **fură orice invitație PAR în așteptare** pentru acel email
  (devine approver/finance în workspace-ul clientului, fără să fi primit vreodată linkul);
- `POST /api/auth/google/join` cu un token de invitație interceptat → același efect, ocolind verificarea „emailul
  invitației = emailul verificat de Google";
- `POST /api/auth/google/create-workspace` → cont pe un email arbitrar (vezi și P0-1: emailul de proprietar).

Aceeași cheie protejează și secretele la rest (`server/auth/twoFactor.ts`, chei SFS/Stripe) — toate sunt
decriptabile de oricine are codul.

### Fix concret
1. `vercel env add ENCRYPTION_KEY production` cu 32+ octeți aleatori (`openssl rand -base64 48`), redeploy.
2. `server/lib/crypto.ts` — în `NODE_ENV=production` să **arunce** la încărcare dacă `ENCRYPTION_KEY` lipsește
   (fail-closed), nu doar `console.error`.
3. Cookie-ul `vl_g_pending` să conțină și un `exp` + `nonce` verificate server-side, nu doar criptare.

---

## P1-1 — CONFIRMAT — Traversare de cale în „finalize" pentru fișierele din Supabase Storage (citire între tenanți / între bucket-uri)

**Severitate: MARE** (impact mare, dar cere cunoașterea numelui exact al obiectului).

### Dovada
- `server/routes/finCaptures.ts:873` — singura gardă: `if (!item.path.startsWith(`${user.tenantId}/`))`.
- `server/lib/storage/captureStorage.ts:87` — `fetch(`${c.url}/storage/v1/object/${CAPTURE_BUCKET}/${path}`)`
  cu cheia **service-role** (ocolește RLS).
- Verificat: parserul de URL normalizează segmentele `..`:
  `new URL("https://h/storage/v1/object/fin-captures/AAA/../BBB/x.pdf").pathname` → `/storage/v1/object/fin-captures/BBB/x.pdf`.

### Scenariul de atac
Utilizator autentificat în tenantul A:
`POST /api/fin/captures/finalize {items:[{path:"<tenantA-uuid>/../<tenantB-uuid>/1756-abc-factura.pdf", fileName:"x.pdf"}]}`
→ trece de `startsWith`, dar cererea reală ajunge la fișierul tenantului B; conținutul e extras (text + câmpuri
financiare) și salvat ca „capture" în tenantul atacatorului, deci îl poate citi în UI.
Cu `"<tenantA>/../../object/<alt-bucket>/<obiect>"` se poate ieși chiar din bucket-ul `fin-captures`.

### Fix concret
În `finCaptures.ts:873`, înlocuiește `startsWith` cu o validare strictă de formă:
```ts
const PATH_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/;
if (!PATH_RE.test(item.path) || !item.path.startsWith(`${user.tenantId}/`)) → forbidden_path
```
(și respinge explicit orice `..` sau `/` suplimentar). Ideal: nu accepta deloc `path` de la client — întoarce
un identificator opac la `sign-uploads` și ține maparea în DB.

---

## P1-2 — CONFIRMAT — 2FA se ocolește complet prin ruta de login a aplicației Business

**Severitate: MARE** (impact real doar pentru conturile care au 2FA activ — vezi nota).

### Dovada
- `server/routes/auth.ts:143-165` — `/api/auth/login` verifică `twoFactorSettings` și, dacă 2FA e activ,
  creează o sesiune `twoFactorPending: true` (blocată de `getSessionUser`, `server/auth/session.ts:98`).
- `server/routes/businessAuth.ts:165-232` — `/api/business/auth/login` (ruta pe care o folosește FinFlow)
  **nu se uită deloc** la `twoFactorSettings`: la linia 219 emite direct o sesiune completă.
- `POST /api/auth/2fa/enable` (`server/routes/auth/twoFactor.ts:45`) e disponibil oricărui utilizator autentificat.

Notă de exploatabilitate: în `src/` nu există niciun ecran de 2FA (grep „2fa/twoFactor" în `src/` → 0 rezultate),
deci azi 2FA se poate activa doar prin API. Cine o face crede că e protejat, dar nu e.

### Fix concret
Mută verificarea 2FA într-un helper comun (`server/auth/session.ts`) apelat de AMBELE rute de login, sau
copiază blocul din `auth.ts:143-165` în `businessAuth.ts` înainte de `createSession`.

---

## P1-3 — CONFIRMAT — `POST /api/auth/2fa/verify` fără limitare de rată (forță brută pe cod din 6 cifre)

- `server/routes/auth/twoFactor.ts:116-176` — nicio limitare; `server/app.ts:169-179` nu montează nimic pe
  `/api/auth/2fa/*`.
- Atacatorul care are parola (sesiune `twoFactorPending`) poate încerca nelimitat coduri TOTP;
  `verifyTotpCode` acceptă o fereastră, deci spațiul efectiv e sub 10^6.
- Aceeași lipsă la `POST /api/auth/accept-invite`, care face `verifyPassword` pentru un utilizator existent
  (`auth.ts:550`) — forță brută pe parolă pentru cineva care deține un token de invitație valid.
- Regula `app.use("/api/par/invites/accept", authRateLimit)` (`app.ts:177`) e **moartă**: nu există nicio rută
  `/api/par/invites/accept`; acceptarea e la `/api/auth/accept-invite`.

**Fix:** `app.use("/api/auth/2fa/verify", authRateLimit)` + `app.use("/api/auth/accept-invite", authRateLimit)`;
șterge regula moartă. Contorizează și pe `sessionId`/email, nu doar pe IP.

---

## P2-1 — PROBABIL — Limitarea de rată se ocolește prin antetul `X-Forwarded-For`

- `server/middleware/rateLimit.ts:25-33` — `clientIp` ia **primul** element din `x-forwarded-for`, care e
  controlat de client dacă proxy-ul îl *adaugă* în loc să-l *rescrie*.
- Dacă Vercel adaugă (nu suprascrie), atunci `X-Forwarded-For: <aleator>` la fiecare cerere resetează contorul →
  login, signup, forgot-password și AI-prefill rămân, practic, nelimitate.
- Aceeași citire în `server/lib/loginEvents.ts` și `server/routes/telemetry.ts:55` (fals în istoricul de logări).

**Verificare (1 minut):** 12 × `POST https://<prod>/api/business/auth/login` cu parolă greșită și
`X-Forwarded-For: 9.9.9.<n>` diferit; dacă niciunul nu întoarce `429 too_many_attempts`, e confirmat.
**Fix:** folosește ULTIMUL element din XFF (cel pus de proxy-ul propriu) sau antetul de platformă
(`x-vercel-forwarded-for`), și nu accepta XFF deloc când cererea nu vine de la proxy-ul cunoscut.

---

## P2-2 — CONFIRMAT — Injecție de formule în CSV (PAR export)

- `server/routes/parReports.ts:571-614` — câmpurile sunt doar înconjurate cu ghilimele
  (`.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`)`), fără neutralizarea prefixelor `= + - @ TAB CR`.
- `server/lib/fin/exportCsv.ts:17-24` (`escapeCsvField`) și `exportSaga.ts:12` — aceeași lipsă.
- Lanțul e alimentat din exterior: numele beneficiarului/descrierea articolelor pot veni din documentul PDF pe
  care îl trimite un „furnizor" și pe care AI-prefill îl extrage automat
  (`server/routes/parAiPrefill.ts` → `payeeName`), deci atacatorul nu trebuie să aibă cont.
- Impact: cine deschide exportul în Excel execută `=WEBSERVICE(...)`/`=HYPERLINK(...)`/DDE →
  exfiltrare de date sau execuție de comenzi pe stația de finanțe.

**Fix:** un singur helper folosit peste tot:
```ts
const s = String(v ?? "");
return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;   // apoi escaparea CSV obișnuită
```
(exportul .xlsx prin exceljs NU e afectat — valorile sunt scrise ca string, nu ca formulă.)

---

## P2-3 — CONFIRMAT — Endpoint public de telemetrie: inundare de emailuri către proprietar + umplere de bază

- `server/routes/telemetry.ts:54` — `POST /api/telemetry/error` fără autentificare (deliberat), limitat la
  30/IP/5 min **în memoria instanței** (`telemetry.ts:37-52`).
- La fiecare grup NOU de eroare pleacă un email (`telemetry.ts:93` → `server/lib/errorAlerts.ts:44`).
  Plafonul de 6/oră (`errorAlerts.ts:20-28`) e tot un contor **în memorie, per instanță serverless** →
  pe Vercel se multiplică cu numărul de instanțe.
- Mesajul (2 000 car.) + stack (8 000 car.) ajung în DB, cu conținut integral controlat de atacator.
- Efect: reputația expeditorului Resend (exact riscul descris în CLAUDE.md §3.5.1) + creșterea nelimitată a
  tabelelor de telemetrie.

**Fix:** contor de alerte persistat în DB (nu în memorie), plafon global pe zi, și limitare de rată pe
`/api/telemetry/*` bazată pe un token de sesiune sau pe un IP validat (vezi P2-1).

---

## P2-4 — PROBABIL — SSRF / citire de fișiere locale prin șabloanele DOCMERGE randate în Chromium

- `server/routes/docmergeTemplates.ts:39-44` — `bodyHtml` e HTML arbitrar, salvat fără nicio filtrare.
- `server/lib/docmerge/htmlToPdf.ts:29,71` — `chromium.launch({args:["--no-sandbox"]})` +
  `page.setContent(html, {waitUntil:"networkidle"})`.
- Un șablon cu `<iframe src="file:///etc/passwd">`, `<img src="http://169.254.169.254/...">` sau
  `<link rel=stylesheet href="http://intern/...">` se randează în PDF-ul pe care atacatorul îl descarcă.
- **De ce doar „probabil":** pe Vercel Chromium nu există, iar codul cade pe 503
  (`docmergeTemplates.ts:326`, `:341`). Exploatabil pe orice instalare care rulează serverul cu Playwright
  (dev, Docker, self-host — `Dockerfile` există în repo).

**Fix:** randare într-un context izolat (`--disable-features=IsolateOrigins`, blocare `file://` și IP-uri private
prin `page.route`), sau sanitizare a HTML-ului șablonului (allowlist de taguri, fără `iframe/object/embed/link`).

---

## P2-5 — CONFIRMAT — Costuri AI declanșabile fără plafon de rată pe calea atașamentelor

- `server/app.ts:178` limitează doar `/api/par/ai-prefill/*` (verificat: în Hono `"/x/*"` acoperă și `/x` —
  am testat) și `/api/itpark/ai/*`.
- Dar `POST /api/par/:id/attachments` (`server/routes/parAttachments.ts:346`) rulează
  `analyzeAttachmentAgainstPar` → `extractParParties` (apel LLM) la FIECARE încărcare, fără limitare.
  Idem `POST /api/par/:id/attachments/:attId/reconcile` (`parAttachments.ts:299`) — reapelabil la infinit
  pe același atașament.
- Plafonul lunar de buget (`server/lib/ai/budgetGuard.ts`) limitează paguba, dar epuizarea lui e chiar
  scopul atacului (dezactivează funcția pentru clientul plătitor).

**Fix:** montează `expensiveRateLimit` și pe `/api/par/*/attachments` și `/reconcile`.

---

## P3 — Constatări minore (CONFIRMATE)

1. **Scurgere de mesaje interne de eroare.** `server/app.ts:145` — `return c.json({ error: err.message }, 500)`
   trimite clientului textul excepției (nume de coloane/tabele, detalii de driver Postgres).
   *Fix:* mesaj generic + id de corelare; detaliul rămâne doar în telemetrie.
2. **`GET /api/health/db` public** (`app.ts:337-357`) — întoarce numărul de tabele, de tenanți și de utilizatori,
   plus `error.message` la eșec. *Fix:* cere sesiune sau redu la `{ok:true}`.
3. **Oracol de existență între workspace-uri.** `server/lib/par/accessReason.ts:76-116` — pentru un UUID de PAR
   dintr-un ALT tenant, răspunsul distinge `other_workspace` / `other_workspace_no_account` și dezvăluie
   **numele workspace-ului**. *Fix:* întoarce numele doar când utilizatorul chiar are cont acolo (deja se
   verifică) și nu diferenția restul de `unknown_id`.
4. **Zip-bomb la extragerea de text din Office.** `server/lib/ai/officeText.ts:28-45` (`JSZip.loadAsync` +
   `.async("string")` pe `word/document.xml`) și `:66-72` (`exceljs.load`) decomprimă fără plafon;
   un fișier de 8 MB poate exploda în GB → OOM pe funcție. *Fix:* verifică `uncompressedSize` din antetul ZIP
   înainte de extragere (limită ~50 MB).
5. **Încărcare nelimitată în portalul de clienți.** `server/routes/finClientPortal.ts:311-355` —
   `POST /documents?token=` neautentificat (doar token), 10 MB per fișier, fără limitare de rată și fără
   verificare de magic bytes (spre deosebire de PAR, care o face — `parAttachments.ts:80`).
   Tokenul circulă în query string (ajunge în loguri/Referer). *Fix:* limitare de rată + verificare de conținut
   + token în antet/cookie.
6. **Dependențe vulnerabile** (`npm audit --omit=dev`): 4 high / 4 moderate.
   - `pdfjs-dist@6.0.227` (GHSA-hq66-cqwq-w95j, „arbitrary JS on opening a malicious PDF") — **nu e importat
     nicăieri** în cod (singura mențiune e un comentariu în `server/lib/ai/pdfText.ts:8`), iar calea reală de
     parsare (`unpdf@1.6.2`, pdfjs 5.6.205 împachetat) apelează `getDocument({... isEvalSupported: false})`
     — verificat în `node_modules/unpdf/dist/index.mjs:65`. Deci **NU e exploatabil azi**, dar versiunea
     vulnerabilă e instalată; scoate dependența nefolosită din `package.json`.
   - `hono <=4.12.33` — avizele relevante (CORS wildcard cu credentials, body-limit pe Lambda) nu se aplică:
     originea e o funcție cu allowlist (`app.ts:193`) și `bodyLimit` nu e folosit. Totuși: `npm audit fix`.
   - `@hono/node-server` path traversal `%5C` — doar Windows, iar `serveStatic` rulează doar local
     (`server/index.ts:25`). Nu afectează produl.

---

## Ce am verificat și e SOLID (ca să nu se mai reia)

- **Injecție SQL:** zero. Tot ce e `sql\`\`` folosește interpolare parametrizată Drizzle; `sql.raw` apare doar în
  `server/db/sync-schema-local.ts:53` cu nume de coloane derivate din schema proprie. `finCaptures.ts:927`
  folosește `$1..$10` cu array de parametri.
- **XSS:** zero `dangerouslySetInnerHTML` în `src/`. HTML-ul de factură escapează totul
  (`server/lib/fin/invoiceDocTemplate.ts:160` + toate interpolările). CSP fără `unsafe-inline` pe `script-src`
  (`server/middleware/securityHeaders.ts:24`).
- **Cookie-uri de sesiune:** `HttpOnly`, `SameSite=Lax`, `Secure` în producție, `path=/`
  (`auth.ts:59`, `businessAuth.ts:55`, `impersonation.ts:32`); token de 48 octeți aleatori
  (`server/auth/session.ts:10`); nimic în `localStorage`.
- **Reset de parolă:** token de 32 octeți aleatori, stocat ca SHA-256, expirare 1h, one-time, invalidează toate
  sesiunile, răspuns 200 constant (`auth.ts:231-311`).
- **Invitații:** token de 32 octeți, SHA-256 în DB, consum atomic în tranzacție
  (`auth.ts:568-576`), rolul vine EXCLUSIV din rândul invitației.
- **Google OAuth:** `state` + PKCE S256, cookie-uri one-time, `email_verified` obligatoriu (`auth.ts:906`).
- **CORS:** origine necunoscută → niciun antet (`app.ts:193`), nu wildcard cu credentials.
- **Antete:** CSP, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, HSTS în prod, `Permissions-Policy`.
- **Cache:** `/api/*` → `no-store` (`server/middleware/httpCache.ts:40`) — fără risc de cache CDN pe date de tenant.
- **Atașamente PAR:** allowlist de MIME + verificare de magic bytes (`parAttachments.ts:80-140`), SVG interzis
  explicit, preview cu `nosniff` și nume de fișier curățat de `\r\n"`.
- **Autorizare PAR:** `GET /api/par/:id` (`par.ts:888-927`) verifică tenant + rol + draft privat + scope de
  proiect/plătitor + drept de modul; aprobarea interzice auto-aprobarea (`parApprovals.ts:174`).
- **Cron:** `/api/fin/cron/run-recurring` e fail-closed fără `CRON_SECRET` (`finCron.ts:20-28`);
  `CRON_SECRET` nu e setat în prod → endpointul e inert.
- **`/api/auth/__dev__/setup-demo-password`:** în prod cere `DEMO_RESET_SECRET`, care nu e setat → 403 permanent.
- **Webhook-uri / Stripe:** `server/lib/webhookDispatch.ts` și `server/lib/stripe.ts` nu sunt montate în nicio rută
  (cod mort) — deci nu există azi o suprafață de callback financiar.
- **Rute orfane:** `node scripts/check-route-mounts.mjs` → verde.

---

## Ordinea recomandată de remediere

1. P0-1 (blochează emailul de proprietar pe toate căile de creare de cont) — **azi**.
2. P0-2 (`ENCRYPTION_KEY` în Vercel + fail-closed în cod) — **azi**.
3. P1-1 (validare strictă de `path` la finalize), P1-2 (2FA pe ruta business), P1-3 (rate limit pe 2FA/accept-invite).
4. P2-1 (XFF), P2-2 (CSV), P2-3 (telemetrie), P2-5 (rate limit AI pe atașamente).
5. P2-4 + P3 + `npm audit fix`.
