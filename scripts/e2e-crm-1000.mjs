#!/usr/bin/env node
// Suita CRM completă: peste 1000 de scenarii pe serverul REAL, prin API.
//
//   PORT=$(cat .dev-port) npx tsx server/index.ts &        # serverul TĂU (bază PGlite proprie)
//   node scripts/e2e-crm-1000.mjs                          # toate grupurile
//   node scripts/e2e-crm-1000.mjs --group leads,tasks      # doar unele
//   node scripts/e2e-crm-1000.mjs --list                   # doar numără scenariile
//   node scripts/e2e-crm-1000.mjs --verbose                # afișează și ce trece
//
// Ținta: BASE, altfel E2E_PORT, altfel .dev-port. Refuză orice nu e localhost (scrie date).
// Raportul complet: backlog/reports/crm-e2e-1000/latest.md (+ .json).
//
// Structura:
//   scripts/e2e-crm/lib.mjs       — sesiuni, cereri, aserțiuni, registrul de scenarii
//   scripts/e2e-crm/catalog.mjs   — toate rutele /api/crm/* (sursa matricilor generice)
//   scripts/e2e-crm/groups/*.mjs  — un fișier per domeniu; fiecare exportă `register(suite)`

import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, BASE, Suite, login, signupTenant, api } from "./e2e-crm/lib.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const onlyGroups = opt("group")?.split(",").map((s) => s.trim()).filter(Boolean);

const suite = new Suite();
const groupsDir = path.join(ROOT, "scripts/e2e-crm/groups");
const files = readdirSync(groupsDir).filter((f) => f.endsWith(".mjs")).sort();
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(groupsDir, f)).href);
  if (typeof mod.register !== "function") throw new Error(`${f} nu exportă register(suite)`);
  await mod.register(suite);
}

const matches = (s) => !onlyGroups || onlyGroups.some((g) => s.group === g || s.group.startsWith(`${g}:`));
const selected = suite.scenarios.filter(matches);

if (flag("list")) {
  const byGroup = {};
  for (const s of selected) byGroup[s.group] = (byGroup[s.group] ?? 0) + 1;
  for (const [g, n] of Object.entries(byGroup).sort()) console.log(String(n).padStart(5), g);
  console.log(String(selected.length).padStart(5), "TOTAL");
  process.exit(0);
}

// ── Sesiunile partajate de toate grupurile ───────────────────────────────────
const health = await api(null, "GET", "/api/health");
if (!health.ok) { console.error(`Serverul de la ${BASE} nu răspunde (/api/health → ${health.status}).`); process.exit(2); }

const ctx = suite.ctx;
ctx.admin = await login(process.env.E2E_EMAIL || "admin@atic.demo.io");
// Agent de vânzări (rol `teacher`): lucrează cu leadurile, dar nu umblă la setări.
ctx.agent = await login("approver@atic.demo.io");
// Al doilea client, nou-nouț: nu are voie să vadă sau să atingă nimic din primul.
ctx.other = await signupTenant("izolat");

console.log(`CRM e2e · ${BASE} · ${selected.length} scenarii · admin=${ctx.admin.user?.email} (${ctx.admin.tenant?.name}) · agent rol=${ctx.agent.user?.role} · al doilea client=${ctx.other.tenant?.name}\n`);

const t0 = Date.now();
const results = await suite.run({ filter: matches, verbose: flag("verbose"), concurrency: Number(opt("concurrency") ?? 6) });
const secs = ((Date.now() - t0) / 1000).toFixed(1);

// ── Raport ───────────────────────────────────────────────────────────────────
const groups = {};
for (const r of results) {
  const g = (groups[r.group] ??= { pass: 0, fail: 0, failures: [] });
  if (r.ok) g.pass++; else { g.fail++; g.failures.push(r); }
}
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;

const lines = [
  `# CRM e2e — ${results.length} scenarii`,
  "",
  `Rulat: ${new Date().toISOString()} · țintă ${BASE} · ${secs}s · **${pass} trec, ${fail} pică**`,
  "",
  "| Grup | Trec | Pică |",
  "|---|---:|---:|",
  ...Object.entries(groups).sort().map(([g, v]) => `| ${g} | ${v.pass} | ${v.fail} |`),
  "",
];
if (fail) {
  lines.push("## Ce pică", "");
  for (const [g, v] of Object.entries(groups).sort()) {
    for (const f of v.failures) lines.push(`- **[${g}]** ${f.name} — ${f.error}`);
  }
}
const outDir = path.join(ROOT, "backlog/reports/crm-e2e-1000");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "latest.md"), lines.join("\n") + "\n");
writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(results.map(({ fn, ...r }) => r), null, 1));

console.log("\n" + Object.entries(groups).sort().map(([g, v]) => `${String(v.pass).padStart(4)} ✓ ${String(v.fail).padStart(3)} ✗  ${g}`).join("\n"));
console.log(`\n${pass}/${results.length} trec, ${fail} pică · ${secs}s · raport: backlog/reports/crm-e2e-1000/latest.md`);
process.exit(fail ? 1 : 0);
