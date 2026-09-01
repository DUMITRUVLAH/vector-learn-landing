// Build gate: FAIL the deploy if any "Cannot find name" (TS2304) error exists.
//
// Why this exists (post-mortem 2026-06-02): the production build runs `vite build`
// (esbuild), which strips types and does NOT type-check. So a missing import —
// `Medal`, a dropped page import, `z` used without importing zod — compiles fine and
// ships, then esbuild leaves the undefined reference as a runtime global → ReferenceError
// in prod (white screen / 500 on every request). The 38-PR merge introduced ~100 of these.
//
// We do NOT gate on ALL tsc errors: the repo carries ~240 pre-existing type-quality
// errors (wrong types, missing props) that don't crash at runtime. Gating on those would
// block every deploy. We gate ONLY on TS2304 (Cannot find name) — the exact class that
// becomes a runtime crash — plus TS2552 (cannot find name, did you mean) which is the same.
//
// Run FIRST in the build (before migrate) so a broken bundle never touches the DB.
import { execSync } from "node:child_process";

const FATAL_CODES = ["TS2304", "TS2552"]; // undefined references → runtime ReferenceError

// Erori de SINTAXĂ. Adăugate 2026-08-29, după ce o ghilimea românească închisă într-un șir JS
// („Descarcă PDF") a rupt un fișier de rute — iar poarta a raportat verde. Motivul e perfid:
// când tsc nu poate parsa fișierul, nu mai raportează DELOC TS2304 pentru el, deci exact
// verificarea pentru care există poarta dispare în tăcere. Un fișier care nu se parsează nu
// se poate nici construi, deci gatearea pe ele nu blochează nimic legitim.
// Declarații DUBLATE. Adăugate 2026-09-01, după ce un cherry-pick a reaplicat un bloc pe care
// main îl avea deja: fișierul a ajuns cu `const words` de două ori. `vite build` nu compilează
// codul de server, iar poarta asta gatea doar pe TS2304 — deci commit-ul a trecut de build și de
// teste, dar SERVERUL nu mai pornea deloc (esbuild: "The symbol words has already been declared").
// Un simbol declarat de două ori nu se poate rula, deci gatearea pe el nu blochează nimic legitim.
// NU includem TS2300 („Duplicate identifier"): el apare și pentru TIPURI declarate de două ori,
// care dispar la compilare și nu pot rupe nimic la rulare — repo-ul are deja un astfel de caz.
// Gatăm doar pe duplicatele care există și după ce tipurile sunt șterse.
const DUPLICATE_CODES = [
  "TS2451", // Cannot redeclare block-scoped variable — esbuild refuză fișierul
  "TS2393", // Duplicate function implementation
];

const SYNTAX_CODES = [
  "TS1002", // Unterminated string literal
  "TS1003", // Identifier expected
  "TS1005", // ',' expected / '}' expected
  "TS1109", // Expression expected
  "TS1128", // Declaration or statement expected
  "TS1136", // Property assignment expected
  "TS1160", // Unterminated template literal
  "TS1161", // Unterminated regular expression literal
  "TS1381", // Unexpected token
  "TS1382", // Unexpected token
];
const projects = ["tsconfig.json", "tsconfig.server.json"];

let fatal = [];
for (const proj of projects) {
  let out = "";
  try {
    execSync(`node_modules/.bin/tsc --noEmit -p ${proj}`, { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
  }
  const lines = out
    .split("\n")
    .filter((l) => [...FATAL_CODES, ...SYNTAX_CODES, ...DUPLICATE_CODES].some((c) => l.includes(`error ${c}:`)));
  fatal.push(...lines.map((l) => `[${proj}] ${l.trim()}`));
}

if (fatal.length > 0) {
  const syntax = fatal.filter((l) => SYNTAX_CODES.some((c) => l.includes(`error ${c}:`)));
  console.error(`\n❌ [check-undefined-refs] ${fatal.length} problemă(e) blocantă(e) — deploy oprit.`);
  if (syntax.length > 0) {
    console.error(
      "   ⚠️  Erori de SINTAXĂ: fișierul nu se parsează, deci restul verificărilor din el sunt oarbe."
    );
    console.error(
      "      Cauză frecventă: ghilimele românești („ ”) în interiorul unui șir JS delimitat cu \".\n"
    );
  }
  console.error("   Referințe nedefinite → ReferenceError/ecran alb în prod. Repară importurile:\n");
  fatal.forEach((l) => console.error("   " + l));
  console.error("");
  process.exit(1);
}

console.log(
  "✅ [check-undefined-refs] fără referințe nedefinite (TS2304/2552) și fără erori de sintaxă — se poate construi."
);
