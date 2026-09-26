#!/usr/bin/env node
/**
 * Garda statică a jurnalului de migrări (build + CI). Pică dacă:
 *   - două intrări au același idx, tag sau prefix de fișier (0191 luat de două branch-uri);
 *   - o intrare din jurnal nu are fișierul .sql, sau un .sql numerotat nu e în jurnal;
 *   - cu `--base <ref>`: o migrare care nu e pe <ref> are `when` ≤ max(<ref>) — drizzle ar
 *     SĂRI-o în tăcere pe orice bază care a aplicat deja migrările de dinainte.
 *
 * Coliziunile se evită din start cu `npm run migration:new` și se repară singure la
 * `npm run ship`; garda asta prinde ce ajunge totuși în main pe altă cale.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { historicalWhenProblems, journalProblems, parseJournal } from "./lib/migrationPlan.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DRIZZLE = path.join(ROOT, "drizzle");
const journal = parseJournal(readFileSync(path.join(DRIZZLE, "meta/_journal.json"), "utf8"));

const baseIdx = process.argv.indexOf("--base");
let ownTags = new Set();
if (baseIdx > 0) {
  const ref = process.argv[baseIdx + 1];
  try {
    const text = execFileSync("git", ["show", `${ref}:drizzle/meta/_journal.json`], { cwd: ROOT, encoding: "utf8" });
    const baseTags = new Set(parseJournal(text).entries.map((e) => e.tag));
    ownTags = new Set(journal.entries.map((e) => e.tag).filter((t) => !baseTags.has(t)));
  } catch {
    console.warn(`[migration-journal] nu pot citi jurnalul de pe ${ref}; verific doar duplicatele`);
  }
}

const problems = journalProblems(journal, ownTags);
const sqlFiles = readdirSync(DRIZZLE).filter((f) => /^\d{4}_.+\.sql$/.test(f));
const tags = new Set(journal.entries.map((e) => e.tag));
for (const e of journal.entries) {
  if (!existsSync(path.join(DRIZZLE, `${e.tag}.sql`))) problems.push(`${e.tag}: în jurnal, dar fără drizzle/${e.tag}.sql`);
}
for (const f of sqlFiles) {
  if (!tags.has(f.replace(/\.sql$/, ""))) problems.push(`drizzle/${f}: fișier fără intrare în _journal.json (nu se aplică niciodată)`);
}

if (problems.length) {
  console.error("✗ jurnalul de migrări are probleme:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("Reparare: `npm run ship` renumerotează automat migrările proprii peste origin/main.");
  process.exit(1);
}
const hist = historicalWhenProblems(journal).length;
console.log(`✓ jurnal de migrări OK (${journal.entries.length} intrări${hist ? `; ${hist} when-uri istorice ne-crescătoare, doar info` : ""})`);
