---
title: fetch fără timeout = spinner infinit („Se încarcă…" care nu se mai termină)
problem_type: hung-request-infinite-spinner
module: src/lib/api.ts, Consola Platformă (Workspace-uri)
tags: [fetch, timeout, abortcontroller, loading-state, ux, platform-console]
symptoms: "stau asa mult timp si nu se incarca nimic; ecranul rămâne pe Se încarcă…; API-ul răspunde normal la curl"
severity: high
date: 2026-08-28
---

## Simptom

Fila **Workspace-uri** din Consola Platformă rămânea pe „Se încarcă…" la nesfârșit, în browserul
owner-ului. Fără mesaj de eroare, fără buton de reîncercare — singura ieșire era reîncărcarea paginii.

## Ce NU era

Diagnosticat pe prod, nu ghicit:

- `GET /api/platform/workspaces` autentificat, pe `www.finflow.best`: **HTTP 200 în 261 ms**, 4,6 KB.
- Interogările din `loadWorkspaces()` rulate direct pe Supabase-ul de prod: **~55 ms fiecare**
  (12 tenanți, 23 utilizatori, 33 `login_events`, 81 `par_requests`).
- `error_groups` din Consola Platformă: **nicio** eroare pe ruta asta.
- Chrome headless pe prod, cu sesiune reală: tabelul se randează complet, rapid.

Deci nici serverul, nici baza, nici codul de randare. Cererea rămăsese agățată în browserul clientului.

## Cauza reală

`fetch` **nu are timeout implicit**. O cerere agățată (rețea care dispare, laptop trezit din somn cu
socketul mort, proxy care ține conexiunea deschisă) nu respinge NICIODATĂ promisiunea. Iar tiparul
folosit peste tot în aplicație —

```ts
try { setRows(await getX()); } catch { setError(true); } finally { setLoading(false); }
```

— nu ajunge niciodată nici pe `catch`, nici pe `finally`. Rezultatul: `loading` rămâne `true` pentru
totdeauna. Nu e un bug al unei singure file, ci al TUTUROR ecranelor care încarcă date.

## Remediul

1. `src/lib/api.ts` pune un `AbortController` pe fiecare **GET** fără `signal` propriu
   (`GET_TIMEOUT_MS = 30_000`). La expirare aruncă `ApiError(0, "request_timeout")` și raportează
   în telemetrie (deci apare în fila „Erori").
2. Mutațiile NU primesc limita: extragerea AI / generarea PDF / importurile pot dura legitim minute,
   iar un abort acolo ar lăsa acțiunea pe jumătate făcută pe server.
3. `LoadingRow` spune după 8 s că durează neobișnuit de mult.
4. `LoadFailed` (Consola Platformă) afișează motivul + buton **Reîncearcă** — starea de eroare nu mai
   e un fund de sac.

## Regresia care îl blochează

`src/__tests__/api-get-timeout.test.ts` — un `fetch` care nu răspunde niciodată (dar respectă
`signal`). Pică pe codul vechi (testul expiră), trece pe cel nou (`request_timeout`).

## Lecția generală

Când UI-ul zice „se încarcă" iar `curl` pe același endpoint răspunde în milisecunde, **nu mai căuta
în server**. Întrebarea corectă e „ce se întâmplă dacă cererea nu se termină niciodată?" — și
răspunsul, în orice cod care folosește `fetch` fără `signal`, e „ecranul se blochează pe vecie".
Orice stare de încărcare are nevoie de o limită de timp ȘI de o cale de ieșire.

---

## Continuare (aceeași zi): cauza era pe SERVER, nu doar lipsa timeout-ului

Timeout-ul de client a scos spinnerul infinit, dar cererile tot se blocau. Telemetria a arătat
că expirau `/api/par/finance` ȘI `/api/notifications` din același tab — deci **nu o rută anume**.

Măsurat pe prod, cu rafale de 9-10 cereri paralele (ca la montarea paginii):

- ~4 din 50 de invocări logau `<-- GET …` și **nu mai răspundeau niciodată** → 504
  FUNCTION_INVOCATION_TIMEOUT. Toate răspunsurile reușite veneau **sub 3 s**. Comportament binar:
  ori rapid, ori pe veci — deci nu „interogare lentă", ci **răspuns care nu mai vine**.
- `/api/health` (care face `SELECT 1`) se bloca și el → blocajul e pe conexiunea la bază.
- `statement_timeout` NU e o plasă: pooler-ul Supabase în mod tranzacție **ignoră** parametrul la
  conectare (verificat: rămâne 2 min), iar serverul oricum nu execută nimic.

### Cele două cauze din `server/db/client.ts`

1. **`idle_timeout: 20` pe Vercel.** Instanța e ÎNGHEȚATĂ între cereri, deci cronometrul nu se
   scurge în timp real — se declanșează la dezgheț, exact când sosește cererea următoare.
   Conexiunea se închide fix pe interogarea nouă, care rămâne scrisă într-un socket mort.
   **Un timp care nu curge nu are voie să închidă conexiuni.** Eliminat.
2. **`max: 1`.** Funcțiile Node de pe Vercel servesc cereri CONCURENT în aceeași instanță; cu o
   singură conexiune, o interogare blocată le lua cu ea pe toate — de aici blocajul simultan al
   tuturor cererilor unui tab. Ridicat la 3.

### Plasa care face simptomul imposibil

`server/middleware/getTimeout.ts` — orice `GET /api/*` care depășește 20 s primește `503
server_timeout` în loc să atârne până la 504. Doar GET: mutațiile (AI, PDF, import) pot dura
legitim minute. Clientul reia o singură dată un GET picat cu 503 (idempotent, reușește sub o secundă).

### Capcană de verificare

**Nu poți demonstra plafonul local:** PGlite e WASM în proces și rulează interogarea **sincron**,
blocând bucla de evenimente — `setTimeout` nu apucă să pornească, deci middleware-ul pare inactiv
chiar dacă e montat corect (confirmat cu log: rulează, cu cap=1 ms, și tot întoarce 200). Verificarea
reală se face pe Postgres (prod/preview), cu rafale paralele.
