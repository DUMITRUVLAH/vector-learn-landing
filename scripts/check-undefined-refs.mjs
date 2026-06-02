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
const projects = ["tsconfig.json", "tsconfig.server.json"];

let fatal = [];
for (const proj of projects) {
  let out = "";
  try {
    execSync(`node_modules/.bin/tsc --noEmit -p ${proj}`, { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
  }
  const lines = out.split("\n").filter((l) => FATAL_CODES.some((c) => l.includes(`error ${c}:`)));
  fatal.push(...lines.map((l) => `[${proj}] ${l.trim()}`));
}

if (fatal.length > 0) {
  console.error(`\n❌ [check-undefined-refs] ${fatal.length} undefined-reference error(s) — blocking deploy.`);
  console.error("   These become runtime ReferenceError/white-screen in prod. Fix the missing imports:\n");
  fatal.forEach((l) => console.error("   " + l));
  console.error("");
  process.exit(1);
}

console.log("✅ [check-undefined-refs] no undefined references (TS2304/2552) — safe to build.");
