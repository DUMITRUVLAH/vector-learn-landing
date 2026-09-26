/**
 * @vitest-environment node
 *
 * Proba că agenții porniți în paralel nu mai strică migrările (incidentul 2026-09-26: 0191, apoi
 * 0192, luate de două ori într-o oră). Totul rulează pe un „GitHub" de unică folosință: un repo
 * bare + clone care joacă rolul agenților, cu scripturile REALE (migration-new, ship-to-main).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { journalProblems, parseJournal } from "../lib/migrationPlan.mjs";

const SCRIPTS = path.resolve(__dirname, "..");
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Agent",
  GIT_AUTHOR_EMAIL: "agent@test.local",
  GIT_COMMITTER_NAME: "Agent",
  GIT_COMMITTER_EMAIL: "agent@test.local",
};

let tmp;

const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, env: GIT_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const git = (cwd, ...args) => sh("git", args, cwd).trim();
const run = (cwd, script, ...args) => sh("node", [path.join(cwd, "scripts", script), ...args], cwd);
const tryRun = (cwd, script, ...args) => {
  try {
    return { ok: true, out: run(cwd, script, ...args) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};

function journalAt(cwd, ref = "origin/main") {
  git(cwd, "fetch", "-q", "origin", "main");
  return parseJournal(git(cwd, "show", `${ref}:drizzle/meta/_journal.json`));
}

/** Un repo „main" cu două migrări și scripturile de lucru; întoarce calea spre origin. */
function makeOrigin() {
  const origin = path.join(tmp, "origin.git");
  git(tmp, "init", "-q", "--bare", "-b", "main", origin);
  const seed = path.join(tmp, "seed");
  git(tmp, "clone", "-q", origin, seed);
  git(seed, "checkout", "-q", "-b", "main");
  mkdirSync(path.join(seed, "drizzle/meta"), { recursive: true });
  mkdirSync(path.join(seed, "scripts/lib"), { recursive: true });
  cpSync(path.join(SCRIPTS, "lib/git.mjs"), path.join(seed, "scripts/lib/git.mjs"));
  cpSync(path.join(SCRIPTS, "lib/migrationPlan.mjs"), path.join(seed, "scripts/lib/migrationPlan.mjs"));
  cpSync(path.join(SCRIPTS, "migration-new.mjs"), path.join(seed, "scripts/migration-new.mjs"));
  cpSync(path.join(SCRIPTS, "ship-to-main.mjs"), path.join(seed, "scripts/ship-to-main.mjs"));
  writeFileSync(path.join(seed, "drizzle/0000_init.sql"), "CREATE TABLE a (id int);\n");
  writeFileSync(path.join(seed, "drizzle/0001_b.sql"), "CREATE TABLE b (id int);\n");
  writeFileSync(path.join(seed, "app.txt"), "linia 1\n");
  writeFileSync(
    path.join(seed, "drizzle/meta/_journal.json"),
    `${JSON.stringify(
      {
        version: "7",
        dialect: "postgresql",
        entries: [
          { idx: 0, version: "7", when: 1000, tag: "0000_init", breakpoints: true },
          { idx: 1, version: "7", when: 2000, tag: "0001_b", breakpoints: true },
        ],
      },
      null,
      2
    )}\n`
  );
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "init");
  git(seed, "push", "-q", "origin", "main");
  return origin;
}

function agent(origin, name) {
  const dir = path.join(tmp, name);
  git(tmp, "clone", "-q", origin, dir);
  git(dir, "checkout", "-q", "-b", `feat/${name}`);
  return dir;
}

/** Ce ar face un agent fără script: numerotare „max + 1" de la punctul de ramificare. */
function naiveMigration(dir, n, slug) {
  const tag = `${String(n).padStart(4, "0")}_${slug}`;
  writeFileSync(path.join(dir, `drizzle/${tag}.sql`), `-- ${slug}\nALTER TABLE a ADD COLUMN ${slug} int;\n`);
  const jpath = path.join(dir, "drizzle/meta/_journal.json");
  const j = JSON.parse(readFileSync(jpath, "utf8"));
  j.entries.push({ idx: n, version: "7", when: j.entries.at(-1).when + 1, tag, breakpoints: true });
  writeFileSync(jpath, `${JSON.stringify(j, null, 2)}\n`);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", `feat: ${slug}`);
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "parallel-mig-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("migrări în paralel", () => {
  it("[blocant] doi agenți care cer o migrare deodată primesc numere DIFERITE (rezervare atomică)", () => {
    const origin = makeOrigin();
    const a = agent(origin, "a");
    const b = agent(origin, "b");
    run(a, "migration-new.mjs", "a_feature");
    run(b, "migration-new.mjs", "b_feature");
    expect(existsSync(path.join(a, "drizzle/0002_a_feature.sql"))).toBe(true);
    expect(existsSync(path.join(b, "drizzle/0003_b_feature.sql"))).toBe(true);
    const refs = git(a, "ls-remote", "origin", "refs/migration-reservations/*");
    expect(refs).toMatch(/refs\/migration-reservations\/0002/);
    expect(refs).toMatch(/refs\/migration-reservations\/0003/);
  });

  it("[blocant] cursă pe ACELAȘI număr, din același commit: exact un agent câștigă", async () => {
    // Doi agenți proaspeți din origin/main au același HEAD. Când rezervarea împingea HEAD, al
    // doilea push era „up to date" și trecea ca succes — ambii „câștigau" 9990 (prins live pe GitHub).
    const origin = makeOrigin();
    const a = agent(origin, "ra");
    const b = agent(origin, "rb");
    const reserveIn = (dir) =>
      sh("node", ["--input-type=module", "-e", `import { reserve } from "./scripts/lib/git.mjs"; console.log(reserve(9990));`], dir).trim();
    expect([reserveIn(a), reserveIn(b)].sort()).toEqual(["false", "true"]);
  });

  it("[blocant] coliziunea reală (ambii au 0002): al doilea livrat e renumerotat, cu `when` peste main", () => {
    const origin = makeOrigin();
    const c = agent(origin, "c");
    const d = agent(origin, "d");
    naiveMigration(c, 2, "c_col");
    naiveMigration(d, 2, "d_col");

    expect(run(c, "ship-to-main.mjs", "--skip-guards")).toMatch(/livrat pe main/);
    const second = run(d, "ship-to-main.mjs", "--skip-guards");
    expect(second).toMatch(/conflict pe _journal\.json rezolvat prin uniune/);
    expect(second).toMatch(/renumerotat 0002_d_col → 0003_d_col/);
    expect(second).toMatch(/livrat pe main/);

    const main = journalAt(d);
    expect(main.entries.map((e) => e.tag)).toEqual(["0000_init", "0001_b", "0002_c_col", "0003_d_col"]);
    // `when` strict crescător: altfel drizzle ar sări 0003 pe baza care a aplicat 0002.
    const whens = main.entries.map((e) => e.when);
    expect(whens[3]).toBeGreaterThan(whens[2]);
    expect(journalProblems(main, new Set())).toEqual([]);
    expect(git(d, "ls-tree", "--name-only", "origin/main", "drizzle/")).toMatch(/0003_d_col\.sql/);
  });

  it("[blocant] un conflict care cere o decizie (același rând de cod) oprește livrarea, fără pierderi", () => {
    const origin = makeOrigin();
    const e = agent(origin, "e");
    const f = agent(origin, "f");
    for (const [dir, text] of [
      [e, "linia 1 — varianta E\n"],
      [f, "linia 1 — varianta F\n"],
    ]) {
      writeFileSync(path.join(dir, "app.txt"), text);
      git(dir, "commit", "-q", "-am", "edit");
    }
    expect(run(e, "ship-to-main.mjs", "--skip-guards")).toMatch(/livrat pe main/);
    const res = tryRun(f, "ship-to-main.mjs", "--skip-guards");
    expect(res.ok).toBe(false);
    expect(res.out).toMatch(/conflicte care cer o decizie: app\.txt/);
    // Rebase anulat: commitul lui F e intact, nimic pe main de la el.
    expect(readFileSync(path.join(f, "app.txt"), "utf8")).toBe("linia 1 — varianta F\n");
    expect(git(f, "status", "--porcelain")).toBe("");
  });

  it("[blocant] refuză să livreze modificări necomise", () => {
    const origin = makeOrigin();
    const g = agent(origin, "g");
    writeFileSync(path.join(g, "app.txt"), "necomis\n");
    const res = tryRun(g, "ship-to-main.mjs", "--skip-guards");
    expect(res.ok).toBe(false);
    expect(res.out).toMatch(/modificări necomise/);
  });

  it("[normal] după livrare, rezervarea numărului livrat se eliberează", () => {
    const origin = makeOrigin();
    const h = agent(origin, "h");
    run(h, "migration-new.mjs", "h_feature");
    git(h, "add", "-A");
    git(h, "commit", "-q", "-m", "feat: h");
    expect(run(h, "ship-to-main.mjs", "--skip-guards")).toMatch(/livrat pe main/);
    expect(git(h, "ls-remote", "origin", "refs/migration-reservations/*")).toBe("");
  });
});
