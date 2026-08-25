// Build gate: pică build-ul dacă există vreo referință nedefinită (TS2304 / TS2552).
//
// DE CE EXISTĂ (post-mortem, cost real: ore de downtime în producție):
// build-ul de producție rulează prin esbuild (vite/tsup/next), care doar ȘTERGE tipurile și
// NU face type-check. Deci un import lipsă — o iconiță, o pagină, `z` folosit fără să fie
// importat zod — compilează perfect și se livrează. În bundle rămâne o referință la un global
// inexistent → ReferenceError la runtime → ecran alb sau 500 pe fiecare request.
//
// NU gate-uim pe TOATE erorile tsc: un repo real cară zeci de erori de calitate a tipurilor
// (props lipsă, tipuri prea largi) care NU crapă la runtime; gating-ul pe ele ar bloca fiecare
// deploy și scriptul ar fi scos în prima zi. Gate-uim DOAR clasa care devine crash: TS2304
// ("Cannot find name") + TS2552 (aceeași eroare, cu sugestie).
//
// UTILIZARE:
//   "build": "node scripts/check-undefined-refs.mjs && vite build"
// Rulează-l PRIMUL în build — înainte de migrări, înainte de orice efect secundar.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const FATAL_CODES = ["TS2304", "TS2552"];

// Toate proiectele tsconfig din repo (adaptează lista pentru monorepo / server separat).
const PROJECTS = ["tsconfig.json", "tsconfig.server.json", "tsconfig.app.json"].filter((p) =>
  existsSync(p),
);

if (PROJECTS.length === 0) {
  console.error("❌ [check-undefined-refs] niciun tsconfig găsit — verifică lista PROJECTS.");
  process.exit(1);
}

const tsc = existsSync("node_modules/.bin/tsc") ? "node_modules/.bin/tsc" : "npx tsc";
const fatal = [];

for (const project of PROJECTS) {
  let output = "";
  try {
    execSync(`${tsc} --noEmit -p ${project}`, { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    // tsc iese cu cod ≠ 0 când găsește ORICE eroare; ne uităm doar după cele fatale.
    output = (error.stdout ?? "") + (error.stderr ?? "");
  }

  const hits = output
    .split("\n")
    .filter((line) => FATAL_CODES.some((code) => line.includes(`error ${code}:`)))
    .map((line) => `[${project}] ${line.trim()}`);

  fatal.push(...hits);
}

if (fatal.length > 0) {
  console.error(
    `\n❌ [check-undefined-refs] ${fatal.length} referință(e) nedefinită(e) — build oprit.`,
  );
  console.error("   Astea devin ReferenceError în producție (ecran alb / 500). Import lipsă:\n");
  for (const line of fatal) console.error("   " + line);
  console.error("");
  process.exit(1);
}

console.log("✅ [check-undefined-refs] nicio referință nedefinită (TS2304/2552) — build permis.");
