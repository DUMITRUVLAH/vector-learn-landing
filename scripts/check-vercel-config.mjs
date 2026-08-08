#!/usr/bin/env node
/**
 * Poartă: `vercel.json` trebuie să treacă validarea de schemă a Vercel.
 *
 * Bug-ul pe care îl blochează (2026-08-08): am adăugat două porți noi în `buildCommand`, care a
 * ajuns la 345 de caractere. Vercel are o limită DURĂ de 256 și o verifică ÎNAINTE de a porni
 * build-ul, deci deploy-ul de producție a picat cu
 *   „The `vercel.json` schema validation failed … `buildCommand` should NOT be longer than 256"
 * și cu ZERO loguri de build — pentru că build-ul nu apucase să înceapă.
 *
 * De ce merită o poartă proprie: eșecul nu seamănă a eroare de configurare. Nu apare local
 * (`vite build` merge perfect), nu apare în CI, și nu lasă niciun log de citit. Singurul indiciu e
 * un status „Error" în lista de deploy-uri. Fără verificarea asta, următoarea poartă adăugată în
 * lanț rupe din nou producția, în același mod tăcut.
 *
 * Reparația structurală e deja făcută — `buildCommand` cheamă `scripts/vercel-build.mjs`, deci
 * lanțul poate crește oricât. Poarta există ca nimeni să nu-l umfle la loc, direct în JSON.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const CONFIG = path.resolve(process.cwd(), "vercel.json");

/** Limitele impuse de validarea de schemă a Vercel (v3). */
const MAX_LENGTHS = {
  buildCommand: 256,
  devCommand: 256,
  installCommand: 256,
  ignoreCommand: 256,
  outputDirectory: 256,
};

let config;
try {
  config = JSON.parse(readFileSync(CONFIG, "utf8"));
} catch (e) {
  console.error(`❌ [check-vercel-config] vercel.json nu e JSON valid: ${e.message}`);
  process.exit(1);
}

const problems = [];
for (const [field, max] of Object.entries(MAX_LENGTHS)) {
  const value = config[field];
  if (typeof value === "string" && value.length > max) {
    problems.push(
      `${field}: ${value.length} caractere (maxim ${max})\n      ${value.slice(0, 90)}…`
    );
  }
}

if (problems.length) {
  console.error("\n❌ [check-vercel-config] vercel.json ar fi respins de Vercel:\n");
  for (const p of problems) console.error(`   ${p}`);
  console.error(`
   Deploy-ul ar pica la validarea schemei, ÎNAINTE de build — deci fără niciun log de build,
   ceea ce face cauza foarte greu de găsit din interfață.

   Reparare: mută pașii în scripts/vercel-build.mjs și lasă în vercel.json doar
       "buildCommand": "node scripts/vercel-build.mjs"
   Lanțul poate crește oricât acolo, fără limită de lungime.
`);
  process.exit(1);
}

console.log("✅ [check-vercel-config] vercel.json respectă limitele de schemă ale Vercel.");
