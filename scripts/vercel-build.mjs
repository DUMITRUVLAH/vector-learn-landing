#!/usr/bin/env node
/**
 * Comanda de build pentru Vercel, într-un singur loc.
 *
 * De ce există: `buildCommand` din `vercel.json` are o limită DURĂ de 256 de caractere, impusă la
 * validarea schemei ÎNAINTE de a porni build-ul. Lanțul de porți crescuse la 345 de caractere,
 * iar deploy-ul a picat instantaneu cu
 *   „The `vercel.json` schema validation failed … `buildCommand` should NOT be longer than 256"
 * — fără niciun log de build, pentru că build-ul nici nu apucase să pornească. Simptomul e derutant
 * exact pentru că nu seamănă a eroare de cod.
 *
 * Acum `vercel.json` cheamă doar acest fișier, deci se pot adăuga oricâte porți fără să se atingă
 * din nou plafonul. ORDINEA de mai jos contează și nu e arbitrară — vezi comentariile per pas.
 */
import { execSync } from "node:child_process";

/** Pașii de build, în ordine. Fiecare oprește deploy-ul dacă iese cu cod diferit de 0. */
const STEPS = [
  // ── Porți STATICE: rulează primele, sunt ieftine și prind clasele de bug-uri care au dat
  //    outage-uri reale. Nu ating baza de date, deci pot pica rapid fără efecte secundare.
  ["schema vercel.json", "node scripts/check-vercel-config.mjs"],
  ["referințe nedefinite (TS2304)", "node scripts/check-undefined-refs.mjs"],
  ["rute Hono nemontate", "node scripts/check-route-mounts.mjs"],
  ["linkuri moarte în meniu", "node scripts/check-nav-links.mjs"],
  ["statement-breakpoints în migrări", "node scripts/check-migration-breakpoints.mjs"],

  // ── Migrările pe baza de date reală. DUPĂ porțile statice (n-are rost să atingem prod-ul dacă
  //    un import lipsă urmează oricum să oprească build-ul) și ÎNAINTE de build, ca schema și
  //    codul care o interoghează să plece împreună.
  ["migrări + sincronizare schemă", "node scripts/vercel-migrate.mjs"],

  // ── Build-ul frontend. NODE_ENV=production e OBLIGATORIU: Vite citește NODE_ENV din fișierele
  //    .env, iar acest repo are acolo `NODE_ENV=development`. Fără el, în producție ajunge
  //    build-ul de DEZVOLTARE al React — mai mare și efectiv mai lent la fiecare randare.
  //    Vezi docs/solutions/build-errors/react-dev-build-shipped-to-production.md.
  ["build frontend", "NODE_ENV=production vite build"],

  // ── Blogul, pre-randat ca HTML static în dist/blog/. DUPĂ vite build (are nevoie de dist/)
  //    și ÎNAINTE de împachetare (build-vercel.mjs copiază dist/ în output). Fără pasul ăsta,
  //    /blog/* ar cădea în fallback-ul SPA și ar servi shell-ul aplicației — adică o pagină
  //    goală pentru orice crawler.
  ["blog pre-randat", "tsx scripts/build-blog.ts"],

  // ── Porți pe ARTEFACTUL construit: se pot verifica doar după ce dist/ există.
  ["React de producție în dist/", "node scripts/check-react-prod-build.mjs"],
  ["buget cale critică", "node scripts/check-bundle-budget.mjs"],

  // ── Împachetarea pentru Vercel (Build Output API v3). Ultima, consumă dist/.
  ["Build Output pentru Vercel", "node scripts/build-vercel.mjs"],

  // ── Ultima poartă: verifică ARTEFACTUL de deploy, nu sursa. Headerele de securitate arată
  //    corect în cod chiar și când CDN-ul nu le emite (middleware-ul Hono acoperă doar /api/*).
  ["headere pe Build Output", "node scripts/check-vercel-headers.mjs"],
];

for (const [label, cmd] of STEPS) {
  console.log(`\n▶ ${label}\n  $ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", env: process.env });
  } catch {
    console.error(`\n❌ Build oprit la pasul: ${label}\n   Comanda: ${cmd}\n`);
    process.exit(1);
  }
}

console.log("\n✅ Toate etapele de build au trecut.");
