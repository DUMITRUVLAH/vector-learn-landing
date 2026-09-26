#!/usr/bin/env node
/**
 * Migrare nouă, cu număr REZERVAT atomic — obligatoriu când lucrează mai mulți agenți deodată.
 *
 *   node scripts/migration-new.mjs <slug> [--dry-run]
 *   ex.: node scripts/migration-new.mjs crm_task_reminders
 *
 * Ce face:
 *   1. aduce origin/main și citește jurnalul de acolo + cel local + rezervările de pe server;
 *   2. rezervă ATOMIC următorul număr liber (refs/migration-reservations/NNNN pe origin) — doi
 *      agenți care rulează scriptul în aceeași secundă primesc numere diferite;
 *   3. creează drizzle/NNNN_<slug>.sql (cu antet și exemplu de breakpoint) și adaugă intrarea în
 *      drizzle/meta/_journal.json, cu `when` peste tot ce există.
 *
 * NU folosi `npm run db:generate` în lucrul paralel: numerotează de la punctul de ramificare.
 * La livrare, scripts/ship-to-main.mjs re-verifică tot (număr + `when`) și renumerotează dacă e nevoie.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchMain, git, repoRoot, listReservations, reserveFrom } from "./lib/git.mjs";
import { formatJournal, nextNumber, pad4, parseJournal } from "./lib/migrationPlan.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const slug = args.find((a) => !a.startsWith("--"));
if (!slug || !/^[a-z0-9_]+$/.test(slug)) {
  console.error("Folosire: node scripts/migration-new.mjs <slug_cu_litere_mici_si_underscore> [--dry-run]");
  process.exit(2);
}

const root = repoRoot();
const journalPath = path.join(root, "drizzle/meta/_journal.json");

fetchMain();
const main = parseJournal(git(["show", "origin/main:drizzle/meta/_journal.json"]));
const local = parseJournal(readFileSync(journalPath, "utf8"));
const start = nextNumber(main, local, listReservations());

if (dry) {
  console.log(`[migration-new] (dry-run) următorul număr liber ar fi ${pad4(start)} → drizzle/${pad4(start)}_${slug}.sql`);
  process.exit(0);
}

const n = reserveFrom(start);
const tag = `${pad4(n)}_${slug}`;
const file = path.join(root, "drizzle", `${tag}.sql`);
if (existsSync(file)) {
  console.error(`[migration-new] ${file} există deja.`);
  process.exit(1);
}

const maxWhen = Math.max(...[...main.entries, ...local.entries].map((e) => Number(e.when) || 0), Date.now());
writeFileSync(
  file,
  `-- ${tag}: <ce face și DE CE — o frază>\n` +
    `-- Număr rezervat atomic (scripts/migration-new.mjs). Mai multe statements → despărțite de\n` +
    `-- „--> statement-breakpoint" pe rând propriu. Coloană/tabelă nouă pe calea de request → heal în\n` +
    `-- server/db/sync-schema.ts (tabelele NOI în ENSURE_STATEMENTS; coloanele se adaugă generic).\n`
);
local.entries.push({ idx: n, version: "7", when: maxWhen + 1, tag, breakpoints: true });
writeFileSync(journalPath, formatJournal(local));

console.log(`[migration-new] rezervat ${pad4(n)} → drizzle/${tag}.sql (+ intrare în _journal.json).`);
console.log("  Scrie SQL-ul, declară coloanele în server/db/schema/*.ts în ACELAȘI commit, apoi livrează cu:");
console.log("  node scripts/ship-to-main.mjs");
