/**
 * Build/CI gate: every Drizzle migration .sql that contains more than one top-level SQL statement
 * MUST separate them with `--> statement-breakpoint`. The migrator sends each between-breakpoint
 * chunk as ONE prepared statement; PGlite (local/tests) and the Postgres extended protocol reject
 * a multi-command string with `cannot insert multiple commands into a prepared statement` (42601).
 *
 * This is the durable fix for the 23 hand-written migrations that broke `db:reset` (IMPROVEMENTS
 * F1 / database §1c). drizzle-kit generate is broken on this repo, so migrations are hand-written
 * and this class of bug recurs without a gate. Splitter is dollar-quote-aware: a `;` inside a
 * `DO $$ … $$;` block is NOT a statement boundary.
 */
import { readFileSync, readdirSync } from "node:fs";

function splitTop(sql) {
  const segs = [];
  let buf = "", dq = false;
  for (let i = 0; i < sql.length; i++) {
    const two = sql.slice(i, i + 2);
    if (!dq && two === "--") { const nl = sql.indexOf("\n", i); const e = nl === -1 ? sql.length : nl; buf += sql.slice(i, e); i = e - 1; continue; }
    if (two === "$$") { dq = !dq; buf += two; i++; continue; }
    const c = sql[i]; buf += c;
    if (c === ";" && !dq) { segs.push(buf); buf = ""; }
  }
  if (buf.trim()) segs.push(buf);
  return segs.map((s) => s.trim()).filter(Boolean);
}

const bad = [];
for (const f of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
  const sql = readFileSync(`drizzle/${f}`, "utf8");
  // For each between-breakpoint chunk, it must contain at most one top-level statement.
  for (const chunk of sql.split("--> statement-breakpoint")) {
    if (splitTop(chunk).length > 1) { bad.push(f); break; }
  }
}

if (bad.length) {
  console.error(`❌ [check-migration-breakpoints] ${bad.length} migration(s) have multiple statements in one chunk without "--> statement-breakpoint":`);
  for (const f of bad) console.error(`   - drizzle/${f}`);
  console.error(`\nInsert "--> statement-breakpoint" between each top-level statement (a ; inside a DO $$ … $$; block does NOT count). These crash a fresh DB (db:reset / PGlite / CI).`);
  process.exit(1);
}
console.log("✅ [check-migration-breakpoints] all migrations split statements correctly.");
