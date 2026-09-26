#!/usr/bin/env node
/**
 * Un chat/agent nou = un worktree propriu, cu port propriu. (CLAUDE.md §0.4)
 *
 *   node scripts/dev-worktree.mjs <slug> [--branch feat/X-...] [--install]
 *   node scripts/dev-worktree.mjs --list
 *
 * De ce: ownerul pornește des mai mulți agenți deodată. Pe un working tree comun, `git stash` /
 * `checkout` dintr-un chat șterge munca celuilalt (2026-08-08), iar două servere pe același port
 * sau același `.pglite` mor cu `RuntimeError: Aborted()`. Scriptul face tot ce trebuia ținut minte:
 *   - `../vl-<slug>` din origin/main proaspăt, pe `feat/<slug>` (sau --branch);
 *   - copiază `.env` (nu e în git) din worktree-ul principal;
 *   - alege un port liber 3150–3199, neluat de alt worktree, și îl scrie în `.dev-port` (gitignored);
 *   - `--install` rulează și `npm install` (node_modules e per worktree).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fetchMain, git, remote, tryGit } from "./lib/git.mjs";

const PORT_MIN = 3150;
const PORT_MAX = 3199;

function worktrees() {
  const out = git(["worktree", "list", "--porcelain"]);
  return out
    .split("\n\n")
    .map((block) => {
      const lines = block.split("\n");
      const dir = lines.find((l) => l.startsWith("worktree "))?.slice(9);
      const branch = lines.find((l) => l.startsWith("branch "))?.slice(7).replace("refs/heads/", "");
      return dir ? { dir, branch: branch ?? "(detached)" } : null;
    })
    .filter(Boolean);
}

function portOf(dir) {
  const f = path.join(dir, ".dev-port");
  return existsSync(f) ? Number(readFileSync(f, "utf8").trim()) : null;
}

function isListening(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: "127.0.0.1" });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });
}

async function freePort() {
  const taken = new Set(worktrees().map((w) => portOf(w.dir)).filter(Boolean));
  for (let p = PORT_MIN; p <= PORT_MAX; p += 1) {
    if (taken.has(p)) continue;
    if (!(await isListening(p))) return p;
  }
  throw new Error(`Niciun port liber în ${PORT_MIN}–${PORT_MAX}. Curăță worktree-urile livrate (--list).`);
}

function list() {
  fetchMain();
  const rows = worktrees().map((w) => {
    const run = (args) => tryGit(["-C", w.dir, ...args]).out;
    const dirty = run(["status", "--porcelain", "--untracked-files=no"]).split("\n").filter(Boolean).length;
    const ahead = Number(run(["rev-list", "--count", `${remote()}/main..HEAD`]) || 0);
    return { name: path.basename(w.dir), branch: w.branch, port: portOf(w.dir) ?? "", dirty, ahead };
  });
  console.log("worktree".padEnd(28), "port".padEnd(6), "necomis".padEnd(8), "nelivrat".padEnd(9), "branch");
  for (const r of rows) {
    console.log(r.name.padEnd(28), String(r.port).padEnd(6), String(r.dirty).padEnd(8), String(r.ahead).padEnd(9), r.branch);
  }
  const done = rows.filter((r) => r.dirty === 0 && r.ahead === 0 && r.branch !== "main").length;
  console.log(`\n${done} worktree-uri fără nimic nelivrat → se pot șterge: git worktree remove ../<nume>`);
}

async function create(slug, { branch, install }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`slug invalid „${slug}” — doar litere mici, cifre, liniuță`);
  const main = worktrees()[0].dir; // primul e mereu worktree-ul principal
  const dir = path.resolve(main, "..", `vl-${slug}`);
  if (existsSync(dir)) throw new Error(`${dir} există deja — folosește-l, sau alege alt slug.`);
  const br = branch ?? `feat/${slug}`;
  if (tryGit(["rev-parse", "--verify", "-q", `refs/heads/${br}`]).ok) throw new Error(`branch-ul ${br} există deja — dă --branch altul.`);

  fetchMain();
  git(["worktree", "add", dir, "-b", br, `${remote()}/main`]);
  for (const f of [".env", ".env.local"]) {
    if (existsSync(path.join(main, f))) copyFileSync(path.join(main, f), path.join(dir, f));
  }
  const port = await freePort();
  writeFileSync(path.join(dir, ".dev-port"), `${port}\n`);
  if (install) execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir, stdio: "inherit" });

  console.log(`
✓ worktree ${dir}
  branch ${br} (din ${remote()}/main)   port ${port}

Pașii următori — TOATE comenzile din acest director:
  cd ${dir}${install ? "" : "\n  npm install"}
  npm run db:reset && npm run db:seed                 # baza PGlite proprie (.pglite din worktree)
  PORT=${port} npm run server:dev                        # serverul TĂU, nu 3131
  npm run migration:new -- <slug>                     # dacă ai nevoie de o migrare (număr rezervat atomic)
  E2E_PORT=${port} npm run e2e                           # poarta e2e pe serverul tău
  npm run ship                                        # rebase + renumerotare + gărzi + push în main
`);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
try {
  if (args.includes("--list")) list();
  else {
    const slug = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--branch");
    if (!slug) throw new Error("folosire: node scripts/dev-worktree.mjs <slug> [--branch feat/X] [--install] | --list");
    await create(slug, { branch: flag("--branch"), install: args.includes("--install") });
  }
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
