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
