---
category: build-errors
symptom: "Aplicația e lentă în producție fără motiv vizibil; bundle-ul React e de ~2,3× mai mare decât ar trebui"
root_cause: "NODE_ENV=development din fișierul .env e citit de Vite la build"
date: 2026-08-08
---

# Build-ul de dezvoltare al React ajuns în producție

## Simptomul

Aplicația „se mișcă greu" în producție. Nimic în cod nu explică de ce. Profilarea unei pagini nu
arată o funcție lentă anume — totul e puțin mai lent decât ar trebui.

## Cum se confirmă în 5 secunde

```bash
grep -l "Invalid hook call. Hooks can only be called" dist/assets/*.js
```

Textul acela există **doar** în `react-dom.development.js`. Dacă apare în `dist/`, livrezi în
producție build-ul de dezvoltare al React. Alte texte-martor: „Each child in a list should have a
unique key", `jsxDEV`, `react/jsx-dev-runtime`.

## Cauza

Acest repo are `NODE_ENV=development` în `.env` și în `.env.example` (corect pentru serverul de
dezvoltare). **Vite citește `NODE_ENV` din fișierele `.env`**, nu doar din mediul procesului. Deci
`vite build` rulat local sau într-un CI care are acel fișier construiește în modul dezvoltare, fără
niciun avertisment.

Costul real nu e dimensiunea (328 KB în loc de 142 KB), ci timpul: build-ul de dezvoltare al React
face validări de proprietăți, verificări de hook-uri și avertizări la FIECARE randare a FIECĂREI
componente.

## Reparația

Setează `NODE_ENV` **înainte** să pornească Vite, în comanda de build:

```jsonc
// package.json
"build": "tsc -b && NODE_ENV=production vite build && node scripts/check-react-prod-build.mjs"
```

și la fel în `buildCommand` din `vercel.json`.

## Capcana: NU repara cu `define`

Prima încercare a fost în `vite.config.ts`:

```ts
define: { "process.env.NODE_ENV": JSON.stringify("production") }   // ❌ NU
```

Rezultatul a fost o aplicație **complet albă**, pe toate rutele:

```
Uncaught TypeError: r.jsxDEV is not a function
```

De ce: `define` decide ce ramură din `react-dom/index.js` supraviețuiește tree-shaking-ului, dar
**nu** decide și cum compilează JSX pluginul `@vitejs/plugin-react-swc`. Pluginul își ia decizia din
modul Vite, care era în continuare `development`, deci emitea apeluri `jsxDEV` — o funcție pe care
runtime-ul de producție al React nu o exportă.

**Runtime-ul React și transformarea JSX trebuie să vină din ACEEAȘI decizie**, iar acea decizie e
`NODE_ENV`. Repară la sursă, nu la jumătate din efect.

## Poarta permanentă

`scripts/check-react-prod-build.mjs` rulează în `vercel.json` și în `package.json` după `vite build`
și verifică **ambele** simptome: runtime-ul de dezvoltare ȘI transformarea JSX de dezvoltare.

Prima versiune a scriptului verifica doar runtime-ul — și a raportat „✅ build de producție" exact
peste build-ul alb descris mai sus. Lecția generală, dincolo de React: **când două lucruri trebuie
să fie consecvente între ele, verifică-le pe amândouă, nu doar pe cel la care te-ai gândit întâi.**

## Dacă simptomul revine doar pe Vercel

Verifică `NODE_ENV` în Settings → Environment Variables ale proiectului. Dacă e `development` acolo,
build-ul de pe Vercel îl va citi, exact ca fișierul `.env` local.
