---
title: Trei feluri în care o probă în browser minte că pagina e ruptă
problem_type: e2e-false-negative
module: scripts/e2e-par-vendor360.mjs, scripts/e2e-gate.mjs
tags: [e2e, playwright, cookie, auth, innerText, css, networkidle]
symptoms: "testul spune 404 Not Found / pagina duce la login / lipsește un text care se vede clar pe ecran"
severity: medium
date: 2026-08-29
---

## Simptom

Proba în browser pentru fișa furnizorului (VENDOR360) raporta, pe rând: `404 Not Found`, apoi
pagina de login, apoi „lipsește «Plătit în total»". Pagina era, de fiecare dată, perfect corectă —
verificată manual în același browser headless, cu același cont.

Un test care raportează fals „e rupt" e mai scump decât lipsa lui: te trimite să repari ce nu e
stricat, iar a doua oară nu-l mai crezi când chiar are dreptate.

## Cele trei cauze, în ordinea în care au apărut

### 1. Serverul de dezvoltare nu servește `dist/`

`npm run server:dev` e doar API — pentru orice cale care nu e `/api/*` răspunde `404 Not Found`,
pentru că frontendul rulează separat, pe vite dev. Corpul paginii chiar E textul „404 Not Found".

**Regula:** partea de browser a unei probe cere un server care servește build-ul —
`npx tsx server/index.ts` (același pe care îl pornește și `e2e-gate.mjs` pe `:3131`), niciodată
`server:dev`.

### 2. Sesiunea de CRM nu deschide paginile `/business/*`

`POST /api/auth/login` dă o sesiune pe care API-ul PAR o acceptă — toate cele 26 de verificări de
API treceau. Dar paginile `/business/*` verifică sesiunea de **Business Suite**, așa că browserul
era trimis la `/#/business/login`, iar testul concluziona „pagina e ruptă".

**Regula:** pentru orice verificare vizuală pe `/business/*`, autentifică-te pe
`POST /api/business/auth/login` (`admin@atic.demo.io` / `demo123456` local), exact ca `e2e-gate.mjs`.

### 3. Cookie ținut într-o variabilă, nu într-un borcan

```js
// GREȘIT: orice răspuns cu set-cookie șterge sesiunea
if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
```

Un singur răspuns care pune alt cookie (sau îl reînnoiește pe altul) lasă cererile următoare fără
sesiune. Ține un `Map` și trimite tot borcanul.

## Bonus: `innerText` întoarce textul TRANSFORMAT de CSS

Eticheta scrisă în cod „Plătit în total", randată cu `text-transform: uppercase`, iese din
`document.body.innerText` drept „PLĂTIT ÎN TOTAL". O potrivire sensibilă la majuscule pică pe o
pagină corectă. Compară cu `/plătit în total/i`.

## Și încă una: `waitUntil: "networkidle"` nu se așază niciodată

Pe o aplicație cu cereri periodice (notificări, sesiune), rețeaua nu tace, iar `page.goto` atârnă
până la timeout. Folosește `domcontentloaded` + `waitForFunction` pe TEXTUL care dovedește că
pagina s-a randat, și pune `page.setDefaultTimeout(8000)`: un test care atârnă minute nu se mai
rulează de nimeni.

## Verificarea care rămâne

`node scripts/e2e-par-vendor360.mjs --browser` — 35 de verificări, dintre care 9 pe ecranul real:
lista se randează cu furnizorul creat, fișa se deschide pe URL-ul cerut, KPI-urile și semnalele
apar, fiecare tab arată conținutul lui, zero erori JS.
