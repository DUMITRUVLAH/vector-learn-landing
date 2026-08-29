---
category: frontend
date: 2026-08-29
symptom: "Failed to fetch dynamically imported module: /assets/<Chunk>-<hash>.js — permanent, la fiecare vizită"
files:
  - public/sw.js
  - scripts/build-vercel.mjs
  - server/index.ts
  - src/lib/staleChunk.ts
---

# Un chunk lipsă servit ca HTML otrăvește cache-ul service worker-ului PERMANENT

## Simptom

Owner-ul primea, la fiecare deploy, alerta „tip NOU de eroare" din Consola Platformă:

```
Tip: client_crash
Mesaj: Failed to fetch dynamically imported module:
       https://www.finflow.best/assets/ParDashboard-Cvn9ANnH.js
Unde: /business/par
```

și o descria simplu: **„aceasta eroare este mereu"**. Nu era o coincidență de formulare — pentru
browserul afectat chiar era permanentă, nu doar „la deploy".

## Mecanismul (lanțul complet, în ordine)

1. `/assets/<chunk>.js` care nu există **nu întorcea 404**: cădea în fallback-ul SPA și primea
   `200` + `index.html`. Verificat pe serverul care rula:
   `GET /assets/ParDashboard-NuExista.js → 200 text/html`.
2. Browserul refuză HTML-ul ca modul ES → exact mesajul de mai sus.
3. `public/sw.js` era „cache-first pe orice e static" și cache-uia **orice** răspuns cu
   `response.ok`. Deci punea HTML-ul acela **sub URL-ul de JavaScript**.
4. `CACHE_NAME` era o constantă (`vl-shell-v1`) care nu se schimba niciodată, iar `activate`
   șterge doar cache-urile cu ALT nume → intrarea otrăvită nu se mai ștergea.
5. Hash-ul din numele chunk-ului depinde de conținut: dacă modulul nu se schimbă, deploy-ul
   următor cere **exact același URL** → servit iar din cache-ul otrăvit. De aici „mereu".
6. Reload-ul automat din `ErrorBoundary` nu avea cum să repare nimic: cererea nici nu ajungea
   la rețea. Iar fiecare hash nou de chunk producea un **fingerprint nou** în telemetrie
   (`normalizeMessage` nu normalizează hash-urile), deci un **email nou** către owner.

## Reparația (patru straturi, fiecare rupe lanțul singur)

1. **404 curat pentru un `/assets/*` inexistent** — `scripts/build-vercel.mjs`
   (`{ src: "/assets/(.*)", status: 404 }` după `handle: "filesystem"`) și `server/index.ts`
   (același lucru local). Un 404 nu se cache-uiește și spune adevărul.
2. **Service worker-ul nu mai atinge deloc `/assets/*`** — fișierele au hash de conținut și
   `cache-control: immutable, max-age=1y`, deci cache-ul HTTP al browserului le ține oricum.
   Un al doilea cache nu adaugă nimic și poate strica totul.
3. **Niciun HTML nu se cache-uiește sau se servește sub un URL de fișier** — în ambele sensuri
   (la scriere și la citire, cu ștergerea intrării vechi otrăvite). Plus `CACHE_NAME` → `v2`,
   ceea ce golește cache-urile deja otrăvite ale utilizatorilor existenți.
4. **Recuperarea golește cache-urile înainte de reload** și se face la IMPORT, nu după ce
   eroarea urcă în `ErrorBoundary` — `src/lib/staleChunk.ts`, apelată din `lazyWithTimeout`.
   O filă rămasă în urma unui deploy nu e un crash: se raportează doar dacă recuperarea a eșuat.

## Gărzi (ca să nu se mai întoarcă)

- `scripts/check-vercel-headers.mjs`, verificarea 4: un `/assets/*.js` inexistent **trebuie** să
  primească 404 în `.vercel/output/config.json`. Confirmat roșu pe configurația veche.
- `src/__tests__/serviceWorker.test.ts`: încarcă `public/sw.js` real într-un `self` fals și
  verifică ambele reguli. Toate cele 3 teste pică pe worker-ul vechi.
- `src/lib/__tests__/staleChunk.test.ts`: golirea cache-urilor se întâmplă ÎNAINTE de reload,
  o singură dată per incident.

## Lecția generalizabilă

**Un fallback SPA care răspunde `200` la orice cerere transformă „fișier lipsă" în „fișier cu
conținut greșit"** — și orice strat de cache de după el (service worker, CDN, browser) va păstra
minciuna. Fallback-ul trebuie să acopere DOAR navigațiile; căile de fișiere trebuie să dea 404.
Aceeași lecție a fost învățată o dată pentru `/api/*` (PLATFORM-002, „Unexpected token '<'") —
`/assets/*` era al doilea loc unde regula lipsea.
