#!/usr/bin/env node
/**
 * Livrarea sigură pe `main` când mai mulți agenți lucrează deodată (CLAUDE.md §0.2bis + §0.4).
 *
 *   node scripts/ship-to-main.mjs [--dry-run] [--skip-guards] [--attempts N]
 *
 * Bucla, până reușește sau până la N încercări (implicit 5):
 *   1. refuză un working tree murdar — ce nu e comis nu pleacă și nu se pierde;
 *   2. `git fetch origin main` + rebase pe origin/main. Un conflict DOAR pe
 *      drizzle/meta/_journal.json (doi agenți au adăugat câte o migrare) se rezolvă singur, prin
 *      UNIUNE; orice alt conflict oprește scriptul cu rebase-ul anulat — acolo decide un om/agentul;
 *   3. renumerotează migrările proprii (cele care nu sunt pe main) peste max(main), cu numere
 *      rezervate atomic, și le dă `when` strict peste tot ce e pe main (altfel drizzle le SARE);
 *      redenumește fișierele, actualizează jurnalul și referințele din cod, într-un commit separat;
 *   4. gărzile: jurnal (idx/tag/prefix/when), check-undefined-refs, check-route-mounts,
 *      check-migration-breakpoints, check-migration-journal, schema-drift;
 *   5. `git push origin HEAD:main` — FĂRĂ force. Respins (main s-a mișcat între timp) → de la 1.
 *
 * Nu rulează testele zonei și nici poarta E2E — acelea le rulează agentul ÎNAINTE (§3.5.1quinquies);
 * scriptul ăsta garantează doar că ce era verde ajunge pe main fără coliziuni și fără migrări sărite.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  conflictedFiles,
  fetchMain,
  git,
  isDirty,
  listReservations,
  rebaseInProgress,
  releaseReservation,
  remote,
  repoRoot,
  reserve,
  tryGit,
} from "./lib/git.mjs";
import {
  formatJournal,
  historicalWhenProblems,
  journalProblems,
  parseJournal,
  planRenumber,
  unionJournals,
} from "./lib/migrationPlan.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const skipGuards = args.includes("--skip-guards");
const attemptsArg = args.indexOf("--attempts");
const maxAttempts = attemptsArg >= 0 ? Number(args[attemptsArg + 1]) || 5 : 5;

const JOURNAL = "drizzle/meta/_journal.json";
const root = repoRoot();
process.chdir(root);

const log = (msg) => console.log(`[ship] ${msg}`);
const fail = (msg) => {
  console.error(`[ship] ✗ ${msg}`);
  process.exit(1);
};

function mainJournal() {
  return parseJournal(git(["show", `origin/main:${JOURNAL}`]));
}
function localJournal() {
  return parseJournal(readFileSync(path.join(root, JOURNAL), "utf8"));
}

/** Rebase pe origin/main, cu rezolvarea automată a conflictelor de jurnal. */
function rebaseOntoMain() {
  if (tryGit(["merge-base", "--is-ancestor", "origin/main", "HEAD"]).ok) {
    log("branch-ul conține deja origin/main — fără rebase.");
    return;
  }
  log("rebase pe origin/main…");
  let r = tryGit(["rebase", "origin/main"], { env: { ...process.env, GIT_EDITOR: "true" } });
  for (let guard = 0; !r.ok && rebaseInProgress() && guard < 50; guard += 1) {
    const conflicts = conflictedFiles();
    if (conflicts.length === 1 && conflicts[0] === JOURNAL) {
      // În rebase: :2 = ce e deja aplicat (main + commiturile mele de dinainte), :3 = commitul reaplicat.
      const ours = parseJournal(git(["show", `:2:${JOURNAL}`]));
      const theirs = parseJournal(git(["show", `:3:${JOURNAL}`]));
      writeFileSync(path.join(root, JOURNAL), formatJournal(unionJournals(ours, theirs)));
      git(["add", JOURNAL]);
      log("conflict pe _journal.json rezolvat prin uniune (renumerotarea vine după rebase).");
      r = tryGit(["rebase", "--continue"], { env: { ...process.env, GIT_EDITOR: "true" } });
      continue;
    }
    tryGit(["rebase", "--abort"]);
    fail(
      `rebase-ul are conflicte care cer o decizie: ${conflicts.join(", ") || "(necunoscute)"}.\n` +
        "        Rebase anulat, nimic pierdut. Rezolvă manual (git rebase origin/main) și rulează din nou."
    );
  }
  if (!r.ok) fail(`rebase eșuat: ${r.err.split("\n")[0]}`);
}

/** Înlocuiește numele vechi al migrării în fișierele urmărite (comentarii, sync-schema, teste). */
function replaceReferences(from, to) {
  const hits = tryGit(["grep", "-l", "-F", from, "--", ".", `:(exclude)${JOURNAL}`]).out;
  for (const file of hits.split("\n").filter(Boolean)) {
    const full = path.join(root, file);
    const text = readFileSync(full, "utf8");
    writeFileSync(full, text.split(from).join(to));
  }
}

/** Renumerotarea migrărilor proprii peste main. Întoarce numerele rezervate de noi. */
function renumberOwnMigrations() {
  const main = mainJournal();
  const local = localJournal();
  const ownBefore = local.entries.filter((e) => !main.entries.some((m) => m.tag === e.tag));
  if (ownBefore.length === 0) {
    log("nicio migrare nouă pe branch.");
    return [];
  }

  // Numerele ținute de alții: toate rezervările, minus cele pe care le am deja în jurnal.
  const mine = new Set(ownBefore.map((e) => e.idx));
  const othersReserved = new Set(listReservations().filter((n) => !mine.has(n)));
  let plan = planRenumber(main, local, othersReserved);

  // Numerele noi se rezervă atomic; dacă altcineva a luat unul între timp, replanificăm.
  const reserved = [];
  for (let tries = 0; tries < 10; tries += 1) {
    const needed = plan.changes.filter((c) => c.from.slice(0, 4) !== c.to.slice(0, 4)).map((c) => c.idx);
    const lost = needed.filter((n) => !reserve(n));
    if (lost.length === 0) {
      reserved.push(...needed);
      break;
    }
    lost.forEach((n) => othersReserved.add(n));
    needed.filter((n) => !lost.includes(n)).forEach((n) => releaseReservation(n));
    plan = planRenumber(main, local, othersReserved);
  }

  if (plan.changes.length === 0) {
    log(`migrările proprii sunt deja peste main: ${ownBefore.map((e) => e.tag).join(", ")}.`);
    return [...mine];
  }

  for (const c of plan.changes) {
    if (c.from !== c.to) {
      const fromFile = `drizzle/${c.from}.sql`;
      if (!existsSync(path.join(root, fromFile))) fail(`lipsește ${fromFile} pentru intrarea ${c.from} din jurnal`);
      git(["mv", fromFile, `drizzle/${c.to}.sql`]);
      const snapFrom = `drizzle/meta/${c.from.slice(0, 4)}_snapshot.json`;
      if (existsSync(path.join(root, snapFrom))) git(["mv", snapFrom, `drizzle/meta/${c.to.slice(0, 4)}_snapshot.json`]);
      replaceReferences(c.from, c.to);
      log(`renumerotat ${c.from} → ${c.to}`);
    } else {
      log(`${c.to}: \`when\` ${c.oldWhen} → ${c.when} (peste tot ce e pe main)`);
    }
  }
  writeFileSync(path.join(root, JOURNAL), formatJournal(plan.journal));
  // Tree-ul era curat înainte (verificat la pornire), deci „-A" prinde doar renumerotarea.
  git(["add", "-A"]);
  git([
    "commit",
    "-q",
    "-m",
    `chore(migrations): renumerotare peste origin/main (ship-to-main)\n\n${plan.changes
      .map((c) => `- ${c.from} → ${c.to} (when ${c.when})`)
      .join("\n")}\n\nNumere rezervate atomic în ${"refs/migration-reservations/*"}; \`when\` strict peste main,\naltfel drizzle ar sări migrarea pe bazele care au aplicat-o pe cea dinainte.`,
  ]);
  return [...new Set([...reserved, ...plan.own.map((e) => e.idx)])];
}

function runGuards() {
  const main = mainJournal();
  const local = localJournal();
  const ownTags = new Set(local.entries.filter((e) => !main.entries.some((m) => m.tag === e.tag)).map((e) => e.tag));
  const problems = journalProblems(local, ownTags);
  if (problems.length) fail(`jurnalul de migrări nu e sănătos:\n  - ${problems.join("\n  - ")}`);
  for (const tag of ownTags) {
    if (!existsSync(path.join(root, "drizzle", `${tag}.sql`))) fail(`jurnalul cere drizzle/${tag}.sql, care lipsește`);
  }
  if (skipGuards) {
    log("gărzile de build sărite (--skip-guards).");
    return;
  }
  // [nume, fișierul care trebuie să existe, comanda]
  const steps = [
    ["check-undefined-refs", "scripts/check-undefined-refs.mjs", ["node", "scripts/check-undefined-refs.mjs"]],
    ["check-route-mounts", "scripts/check-route-mounts.mjs", ["node", "scripts/check-route-mounts.mjs"]],
    ["check-migration-breakpoints", "scripts/check-migration-breakpoints.mjs", ["node", "scripts/check-migration-breakpoints.mjs"]],
    ["check-migration-journal", "scripts/check-migration-journal.mjs", ["node", "scripts/check-migration-journal.mjs", "--base", "origin/main"]],
    ["schema-drift", "src/__tests__/schema-drift.test.ts", ["npx", "vitest", "run", "src/__tests__/schema-drift.test.ts"]],
  ];
  for (const [name, needs, cmd] of steps) {
    if (!existsSync(path.join(root, needs))) continue;
    try {
      execFileSync(cmd[0], cmd.slice(1), { stdio: "pipe", encoding: "utf8", env: { ...process.env, LENT_NOLOCK: "1" } });
      log(`✓ ${name}`);
    } catch (e) {
      const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.split("\n").slice(-15).join("\n");
      fail(`garda ${name} a picat:\n${out}`);
    }
  }
}

// ─── Bucla ────────────────────────────────────────────────────────────────────

if (rebaseInProgress()) fail("un rebase e deja în curs în acest worktree — termină-l sau anulează-l întâi.");
if (isDirty()) fail("ai modificări necomise. Comite-le (un commit per item) și rulează din nou.");

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch === "main") fail("rulează din branch-ul tău de lucru, nu de pe main.");

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  log(`încercarea ${attempt}/${maxAttempts} — ${branch} → ${remote()}/main`);
  fetchMain();

  if (dry) {
    const main = mainJournal();
    const local = localJournal();
    const own = local.entries.filter((e) => !main.entries.some((m) => m.tag === e.tag));
    const plan = planRenumber(main, local, new Set(listReservations().filter((n) => !own.some((e) => e.idx === n))));
    const behind = git(["rev-list", "--count", "HEAD..origin/main"]);
    const ahead = git(["rev-list", "--count", "origin/main..HEAD"]);
    log(`(dry-run) ${ahead} commituri de livrat, main e cu ${behind} înainte.`);
    log(`(dry-run) migrări proprii: ${own.map((e) => e.tag).join(", ") || "niciuna"}`);
    for (const c of plan.changes) log(`(dry-run) ar deveni ${c.to} (when ${c.when})${c.from !== c.to ? ` — era ${c.from}` : ""}`);
    const hist = historicalWhenProblems(main);
    if (hist.length) log(`(info) ${hist.length} migrări istorice au \`when\` ne-crescător pe main (sărite pe bazele vechi; le acoperă sync-schema).`);
    process.exit(0);
  }

  rebaseOntoMain();
  const reserved = renumberOwnMigrations();
  runGuards();

  const pushed = tryGit(["push", "-q", remote(), "HEAD:main"]);
  if (pushed.ok) {
    const head = git(["rev-parse", "--short", "HEAD"]);
    log(`✓ livrat pe main (${head}).`);
    // Numerele de acum de pe main nu mai au nevoie de rezervare. Doar ELE: un număr mai mic, încă
    // rezervat de un alt agent care n-a livrat, rămâne al lui (la livrare va fi renumerotat oricum).
    const onMain = new Set(mainJournalAfterPush().entries.map((e) => e.idx));
    new Set([...reserved, ...listReservations()]).forEach((n) => {
      if (onMain.has(n)) releaseReservation(n);
    });
    tryGit(["push", "-q", "--force-with-lease", remote(), `HEAD:${branch}`]);
    log("Urmează: verifică deploy-ul pe prod (autentificat), nu doar build-ul (§0.2bis pasul 5).");
    process.exit(0);
  }
  log(`push respins (${pushed.err.split("\n").find((l) => l.includes("rejected")) ?? "main s-a mișcat"}) — reiau.`);
}

fail(`nu am reușit în ${maxAttempts} încercări: main se mișcă prea des. Încearcă din nou peste un minut.`);

function mainJournalAfterPush() {
  fetchMain();
  return mainJournal();
}

