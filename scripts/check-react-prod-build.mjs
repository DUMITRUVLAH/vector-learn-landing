#!/usr/bin/env node
/**
 * PERF-004 — poarta de build: `dist/` nu are voie să conțină build-ul de DEZVOLTARE al React.
 *
 * Bug-ul pe care îl blochează (2026-08-08, găsit la auditul de performanță): `.env` și
 * `.env.example` conțin `NODE_ENV=development`, iar Vite citește `NODE_ENV` din fișierele `.env`.
 * Rezultat: `vite build` a împachetat luni de zile `react-dom.development.js` în producție —
 * chunk de 328 KB în loc de 142 KB ȘI, mai grav, validările din build-ul de dezvoltare rulau la
 * fiecare randare, în aplicația clientului plătitor.
 *
 * De ce o poartă și nu doar un fix: fix-ul trăiește în `vite.config.ts` (`define`), dar oricine
 * poate reintroduce regresia adăugând `NODE_ENV=development` în mediul de build al Vercel, sau
 * schimbând `define`. Simptomul e invizibil ochiului — aplicația funcționează, doar e lentă.
 * Singurul mod de a-l prinde e să te uiți în artefactul livrat, ceea ce face scriptul ăsta.
 *
 * Detecția se face pe texte care există EXCLUSIV în build-ul de dezvoltare al React.
 *
 * Rulează în `vercel.json` (înainte de deploy) și în CI.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const DIST_ASSETS = path.resolve(process.cwd(), "dist/assets");

/**
 * Se verifică DOUĂ simptome distincte, pentru că prima variantă a acestui script verifica doar
 * primul — și a trecut verde peste un build complet nefuncțional:
 *
 *  1. RUNTIME-ul React de dezvoltare în dist (bundle mai mare + validări la fiecare randare).
 *  2. TRANSFORMAREA JSX de dezvoltare (`jsxDEV`), care e o decizie SEPARATĂ, luată de pluginul SWC.
 *
 * Cum a scăpat: o încercare de reparație prin `define: { "process.env.NODE_ENV": "production" }`
 * a schimbat runtime-ul, dar NU și transformarea. Rezultat: cod compilat care apelează `jsxDEV`
 * peste un runtime de producție care nu-l exportă → „r.jsxDEV is not a function", ecran alb pe
 * TOATE rutele. Poarta a raportat „✅ build de producție" exact în acel moment.
 *
 * Lecția, transformată în cod: verifică fiecare jumătate a unei perechi care trebuie să fie
 * consecventă, nu doar pe cea la care te-ai gândit prima dată.
 */

/** Texte prezente doar în react-dom.development.js / react.development.js. */
const DEV_ONLY_MARKERS = [
  "Each child in a list should have a unique",
  "Invalid hook call. Hooks can only be called",
  "Warning: React.createElement: type is invalid",
  "https://reactjs.org/link/invalid-hook-call",
];

/** Transformarea JSX de dezvoltare. `jsxDEV` nu există în runtime-ul de producție al React. */
const DEV_JSX_MARKERS = ["jsxDEV", "react/jsx-dev-runtime"];

if (!existsSync(DIST_ASSETS)) {
  console.error("[check-react-prod-build] dist/assets lipsește — rulează `vite build` întâi.");
  process.exit(1);
}

const offenders = [];
for (const file of readdirSync(DIST_ASSETS)) {
  if (!file.endsWith(".js")) continue;
  const content = readFileSync(path.join(DIST_ASSETS, file), "utf8");
  const found = [...DEV_ONLY_MARKERS, ...DEV_JSX_MARKERS].filter((m) => content.includes(m));
  if (found.length) offenders.push({ file, found });
}

if (offenders.length) {
  console.error("\n❌ [check-react-prod-build] Artefacte de DEZVOLTARE ale React în dist/:\n");
  for (const o of offenders) {
    console.error(`   ${o.file}`);
    for (const m of o.found) console.error(`      ↳ „${m}…"`);
  }
  console.error(`
   Cauza aproape sigură: NODE_ENV=development e vizibil la momentul build-ului.
   Vite citește NODE_ENV din fișierele .env (iar acest repo are NODE_ENV=development
   în .env / .env.example, pentru serverul de dezvoltare), și pe baza lui aleg ATÂT
   ramura react-dom, CÂT ȘI transformarea JSX din pluginul SWC.

   Reparare: build-ul trebuie pornit cu NODE_ENV=production —
       NODE_ENV=production vite build
   exact cum o fac scripts.build din package.json și buildCommand din vercel.json.
   NU repara cu \`define: { "process.env.NODE_ENV": "production" }\` în vite.config.ts:
   schimbă runtime-ul fără să schimbe transformarea JSX, iar rezultatul e ecran alb
   pe toate rutele ("r.jsxDEV is not a function"). Verificat, nu presupus.

   Dacă apare doar pe Vercel: șterge NODE_ENV=development din variabilele de mediu
   ale proiectului (Settings → Environment Variables).
`);
  process.exit(1);
}

console.log("✅ [check-react-prod-build] dist/ conține build-ul de producție al React.");
