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

/** Texte prezente doar în react-dom.development.js / react.development.js. */
const DEV_ONLY_MARKERS = [
  "Each child in a list should have a unique",
  "Invalid hook call. Hooks can only be called",
  "Warning: React.createElement: type is invalid",
  "https://reactjs.org/link/invalid-hook-call",
];

if (!existsSync(DIST_ASSETS)) {
  console.error("[check-react-prod-build] dist/assets lipsește — rulează `vite build` întâi.");
  process.exit(1);
}

const offenders = [];
for (const file of readdirSync(DIST_ASSETS)) {
  if (!file.endsWith(".js")) continue;
  const content = readFileSync(path.join(DIST_ASSETS, file), "utf8");
  const found = DEV_ONLY_MARKERS.filter((m) => content.includes(m));
  if (found.length) offenders.push({ file, found });
}

if (offenders.length) {
  console.error("\n❌ [check-react-prod-build] Build-ul de DEZVOLTARE al React a ajuns în dist/:\n");
  for (const o of offenders) {
    console.error(`   ${o.file}`);
    for (const m of o.found) console.error(`      ↳ „${m}…"`);
  }
  console.error(`
   Cauza aproape sigură: NODE_ENV=development e vizibil la momentul build-ului
   (fișier .env local sau variabilă de mediu în Vercel). Vite citește NODE_ENV din
   fișierele .env, iar React alege ramura de dezvoltare pe baza lui.

   Reparare: asigură-te că \`define\` din vite.config.ts forțează
   process.env.NODE_ENV = "production" la build, și că mediul de build al Vercel
   NU setează NODE_ENV=development.
`);
  process.exit(1);
}

console.log("✅ [check-react-prod-build] dist/ conține build-ul de producție al React.");
