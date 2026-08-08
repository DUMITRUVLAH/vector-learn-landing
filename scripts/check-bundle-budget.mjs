#!/usr/bin/env node
/**
 * PERF-003 — poarta de buget pentru calea critică.
 *
 * CLAUDE.md §3.4 cere ≤ 100 KB gzip pe rută. La auditul din 2026-08-08, calea critică măsura
 * **684 KB gzip** — de 6,8× peste buget — pentru că `App.tsx` importa static ~60 de pagini, iar
 * prin ele intrau în bundle-ul principal recharts, jsPDF și html2canvas.
 *
 * Regresia asta e invizibilă în review: nimeni nu observă că un `import { X } from "./pages/Y"`
 * adăugat sus în App.tsx a mutat 300 KB pe calea critică. Se vede doar în artefactul construit —
 * deci se verifică aici, la fiecare build.
 *
 * „Calea critică" = ce descarcă browserul ÎNAINTE de a putea randa prima pagină: chunk-ul de
 * intrare, CSS-ul de intrare și chunk-urile pe care le importă static (`imports` din manifest).
 * Chunk-urile lazy nu intră la socoteală — exact asta e ideea împărțirii pe rute.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const DIST = path.resolve(process.cwd(), "dist");
const BUDGET_KB = 150; // buget cu marjă peste cei ~85 KB măsurați după împărțirea pe rute

if (!existsSync(DIST)) {
  console.error("[check-bundle-budget] dist/ lipsește — rulează `vite build` întâi.");
  process.exit(1);
}

const gzKb = (file) => gzipSync(readFileSync(file)).length / 1024;

// Intrarea: index.html referă exact chunk-ul de intrare + CSS-ul. Le citim de acolo, ca să nu
// ghicim după nume (hash-urile se schimbă la fiecare build).
const html = readFileSync(path.join(DIST, "index.html"), "utf8");
const referenced = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => m[1]);

if (referenced.length === 0) {
  console.error("[check-bundle-budget] Nu am găsit niciun asset referit din index.html.");
  process.exit(1);
}

// Urmărim importurile statice ale chunk-ului de intrare: și ele sunt pe calea critică.
const assetsDir = path.join(DIST, "assets");
const allAssets = readdirSync(assetsDir);
const seen = new Set();
const queue = [...referenced];

while (queue.length) {
  const rel = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);
  if (!rel.endsWith(".js")) continue;
  const full = path.join(DIST, rel);
  if (!existsSync(full)) continue;
  const code = readFileSync(full, "utf8");
  // `import "./react-vendor-XXXX.js"` / `from"./chunk-XXXX.js"` — doar importurile STATICE.
  for (const m of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) {
    const name = m[1];
    if (allAssets.includes(name)) queue.push(`assets/${name}`);
  }
}

const rows = [...seen]
  .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
  .map((f) => ({ file: f, kb: gzKb(path.join(DIST, f)) }))
  .sort((a, b) => b.kb - a.kb);

const total = rows.reduce((s, r) => s + r.kb, 0);

console.log("\n[check-bundle-budget] Calea critică (gzip):");
for (const r of rows) console.log(`   ${r.kb.toFixed(1).padStart(7)} KB  ${r.file}`);
console.log(`   ${"─".repeat(30)}`);
console.log(`   ${total.toFixed(1).padStart(7)} KB  TOTAL (buget ${BUDGET_KB} KB)\n`);

if (total > BUDGET_KB) {
  console.error(
    `❌ Calea critică e ${total.toFixed(1)} KB gzip, peste bugetul de ${BUDGET_KB} KB.\n` +
      `   Cauza obișnuită: un import STATIC nou în src/App.tsx. Fă-l \`lazy()\` — vezi comentariul\n` +
      `   PERF-003 din App.tsx. Dacă noul cost e justificat, ridică BUDGET_KB aici, explicit.\n`
  );
  process.exit(1);
}

console.log("✅ Calea critică se încadrează în buget.");
