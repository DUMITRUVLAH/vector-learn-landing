/**
 * Git pentru scripturile de lucru în paralel (migration-new, ship-to-main, dev-worktree).
 *
 * Rezervarea unui număr de migrare e un REF pe GitHub: `refs/migration-reservations/NNNN`.
 * `git push --force-with-lease=<ref>:` (valoare goală = „ref-ul NU trebuie să existe") e o operație
 * atomică pe server: dintre doi agenți care cer 0194 în aceeași secundă, exact unul reușește —
 * indiferent de chat, worktree sau mașină. Ref-urile nu sunt branch-uri: nu declanșează deploy-uri
 * Vercel și nici workflow-urile GitHub (care ascultă pe `main` și pe PR-uri).
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import os from "node:os";

export const RESERVATION_PREFIX = "refs/migration-reservations/";

export function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
}

/** Ca `git`, dar nu aruncă: { ok, out, err }. */
export function tryGit(args, opts = {}) {
  try {
    return { ok: true, out: git(args, opts), err: "" };
  } catch (e) {
    const err = e && typeof e === "object" ? String(e.stderr ?? e.message ?? e) : String(e);
    return { ok: false, out: e && typeof e === "object" ? String(e.stdout ?? "") : "", err };
  }
}

export function repoRoot() {
  return git(["rev-parse", "--show-toplevel"]);
}

export function remote() {
  return process.env.MIGRATION_REMOTE || "origin";
}

export function fetchMain() {
  git(["fetch", "-q", remote(), "main"]);
}

/** Numerele rezervate acum pe server. */
export function listReservations() {
  const r = tryGit(["ls-remote", remote(), `${RESERVATION_PREFIX}*`]);
  if (!r.ok) return [];
  return r.out
    .split("\n")
    .map((line) => line.split("\t")[1] ?? "")
    .map((ref) => Number(ref.slice(RESERVATION_PREFIX.length)))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Un obiect UNIC per rezervare: commit fără părinte, pe arborele gol, cu un nonce în mesaj.
 * NU `HEAD`: doi agenți proaspeți din origin/main au același HEAD, iar al doilea push al aceluiași
 * SHA iese „up to date" ÎNAINTE de verificarea lease-ului — ambii „câștigau" numărul (prins live pe
 * GitHub, 2026-09-26; testul „cursă pe ACELAȘI număr" îl blochează).
 */
function reservationToken(ref) {
  const emptyTree = git(["hash-object", "-t", "tree", "-w", "--stdin"], { input: "", stdio: ["pipe", "pipe", "pipe"] });
  const nonce = `${os.hostname()} pid=${process.pid} ${Date.now()} ${randomBytes(8).toString("hex")}`;
  return git(["commit-tree", emptyTree, "-m", `rezervare ${ref}\n\n${nonce}`]);
}

/** Rezervă ATOMIC numărul `n`. `true` = e al nostru; `false` = l-a luat altcineva. */
export function reserve(n, pad = (x) => String(x).padStart(4, "0")) {
  const ref = `${RESERVATION_PREFIX}${pad(n)}`;
  const token = reservationToken(ref);
  if (!tryGit(["push", "-q", `--force-with-lease=${ref}:`, remote(), `${token}:${ref}`]).ok) return false;
  // Pe server trebuie să fie token-ul NOSTRU, nu doar „push-ul n-a dat eroare".
  const onServer = tryGit(["ls-remote", remote(), ref]).out.split("\t")[0];
  return onServer === token;
}

export function releaseReservation(n, pad = (x) => String(x).padStart(4, "0")) {
  tryGit(["push", "-q", remote(), "--delete", `${RESERVATION_PREFIX}${pad(n)}`]);
}

/** Rezervă primul număr liber începând cu `start`. Aruncă după `attempts` încercări. */
export function reserveFrom(start, attempts = 30) {
  const taken = new Set(listReservations());
  let n = start;
  for (let i = 0; i < attempts; i += 1, n += 1) {
    if (taken.has(n)) continue;
    if (reserve(n)) return n;
  }
  throw new Error(`Nu am putut rezerva un număr de migrare după ${attempts} încercări (de la ${start}).`);
}

export function isDirty() {
  return git(["status", "--porcelain", "--untracked-files=no"]).length > 0;
}

export function rebaseInProgress() {
  return tryGit(["rev-parse", "--verify", "-q", "REBASE_HEAD"]).ok;
}

export function conflictedFiles() {
  const out = tryGit(["diff", "--name-only", "--diff-filter=U"]).out;
  return out ? out.split("\n").filter(Boolean) : [];
}
