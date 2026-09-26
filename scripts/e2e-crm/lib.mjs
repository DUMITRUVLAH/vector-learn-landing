// Harness comun pentru suita CRM de peste 1000 de scenarii (scripts/e2e-crm-1000.mjs).
//
// De ce un harness propriu și nu vitest: scenariile rulează pe serverul REAL (rute montate,
// middleware, sesiune, bază), exact cum le vede browserul. Un test vitest pe o rută izolată
// trece și când ruta nu e montată sau middleware-ul de acces o blochează (CLAUDE.md §3.5.1).
//
// Un scenariu = o acțiune invocată + o așteptare verificată (§3.5.1quater: testăm acțiunea,
// nu faptul că butonul există). Numărul de scenarii e numărul de verificări care pot pica.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function resolveBase() {
  if (process.env.BASE) return process.env.BASE.replace(/\/$/, "");
  if (process.env.E2E_PORT) return `http://localhost:${process.env.E2E_PORT}`;
  const f = path.join(ROOT, ".dev-port");
  if (existsSync(f)) return `http://localhost:${readFileSync(f, "utf8").trim()}`;
  return "http://localhost:3131";
}
export const BASE = resolveBase();

// Suita SCRIE mult (leaduri, firme, anonimizări GDPR, ștergeri). Pe producție ar murdări
// datele clientului plătitor — deci refuzăm orice țintă care nu e locală.
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) && process.env.ALLOW_REMOTE !== "1") {
  console.error(`Refuz să rulez pe ${BASE}: suita creează și șterge date. Doar localhost (ALLOW_REMOTE=1 ca să forțezi).`);
  process.exit(2);
}

export const RUN = Date.now().toString(36);
export const uid = (p = "") => `${p}${RUN}-${Math.random().toString(36).slice(2, 7)}`;
export const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
export const RANDOM_UUID = "7d3c1b0e-5a4f-4e2b-9c1d-8f6e5a4b3c2d";

// ── Sesiuni: cookie jar minimal peste fetch ──────────────────────────────────
export class Session {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
    this.user = null;
    this.tenant = null;
  }
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  absorb(res) {
    const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
}

export const anon = new Session("anon");

/**
 * Cerere HTTP. `body` poate fi obiect (JSON), string (trimis brut — pentru JSON stricat) sau
 * `{ form: FormData }`. Întoarce mereu un obiect, niciodată nu aruncă pe status.
 */
export async function api(sess, method, p, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const ck = sess?.cookieHeader();
  if (ck) headers.cookie = ck;
  let payload;
  if (body !== undefined && body !== null && body.form instanceof FormData) payload = body.form;
  else if (typeof body === "string") { payload = body; headers["content-type"] ??= "application/json"; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers["content-type"] ??= "application/json"; }
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(BASE + p, { method, headers, body: payload, redirect: "manual" });
  } catch (e) {
    return { status: 0, ok: false, json: null, text: String(e), ct: "", ms: Date.now() - t0 };
  }
  sess?.absorb(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* nu e JSON */ }
  return { status: res.status, ok: res.ok, json, text, ct: res.headers.get("content-type") || "", ms: Date.now() - t0 };
}

export async function login(email, password = "demo123456", route = "/api/business/auth/login") {
  const s = new Session(email);
  const r = await api(s, "POST", route, { email, password });
  if (!r.ok) throw new Error(`login ${email} → HTTP ${r.status} ${r.text.slice(0, 160)}`);
  s.user = r.json?.user ?? null;
  s.tenant = r.json?.tenant ?? null;
  return s;
}

/** Un workspace de business nou-nouț — al doilea chiriaș, pentru izolarea între clienți. */
export async function signupTenant(label) {
  const s = new Session(label);
  const email = `${uid("e2e-crm-")}@example.invalid`;
  const r = await api(s, "POST", "/api/business/auth/signup", {
    email, password: "E2e-parola-lunga-123!", name: "Tenant Izolat", tenantName: `Firma ${label} ${RUN}`,
  });
  if (!r.ok) throw new Error(`signup ${label} → HTTP ${r.status} ${r.text.slice(0, 200)}`);
  s.user = r.json?.user ?? null;
  s.tenant = r.json?.tenant ?? null;
  return s;
}

// ── Aserțiuni ────────────────────────────────────────────────────────────────
export class Fail extends Error {}
export function expect(cond, msg) { if (!cond) throw new Fail(msg); }

const brief = (r) => `HTTP ${r.status} ${r.text.replace(/\s+/g, " ").slice(0, 160)}`;

/** Status exact sau unul dintr-o listă. */
export function expectStatus(r, want, ctx = "") {
  const list = Array.isArray(want) ? want : [want];
  if (!list.includes(r.status)) throw new Fail(`${ctx}așteptat ${list.join("/")}, primit ${brief(r)}`);
  return r;
}
/** 2xx cu JSON (nu fallback-ul HTML al SPA-ului). */
export function expectOk(r, ctx = "") {
  if (!r.ok) throw new Fail(`${ctx}așteptat 2xx, primit ${brief(r)}`);
  if (r.status !== 204 && r.text && r.json === null) throw new Fail(`${ctx}răspuns 2xx care nu e JSON: ${r.text.slice(0, 80)}`);
  return r.json;
}
/**
 * Cererea greșită a clientului: 4xx cu JSON. NICIODATĂ 500 (e bug de server) și niciodată 2xx
 * (ar însemna că a acceptat gunoiul).
 */
export function expectClientError(r, ctx = "") {
  if (r.status >= 500 || r.status === 0) throw new Fail(`${ctx}eroare de server pe input greșit: ${brief(r)}`);
  if (r.status < 400) throw new Fail(`${ctx}input greșit acceptat: ${brief(r)}`);
  if (r.text && r.json === null) throw new Fail(`${ctx}eroarea nu e JSON (fallback HTML?): ${r.text.slice(0, 80)}`);
  return r;
}
/** Orice, doar să nu fie 5xx / HTML / timeout — pentru input „ciudat dar poate valid". */
export function expectNo5xx(r, ctx = "") {
  if (r.status >= 500 || r.status === 0) throw new Fail(`${ctx}eroare de server: ${brief(r)}`);
  if (r.text && r.json === null && !/text\/csv|octet|pdf|zip|spreadsheet/.test(r.ct)) {
    throw new Fail(`${ctx}răspuns non-JSON (${r.ct}): ${r.text.slice(0, 80)}`);
  }
  return r;
}

/** Extrage lista dintr-un răspuns: `{items}`, `{rows}`, `{data}` sau un array direct. */
export function listOf(j) {
  if (Array.isArray(j)) return j;
  for (const k of ["items", "rows", "data", "leads", "results", "members", "rules", "entries", "tasks"]) {
    if (Array.isArray(j?.[k])) return j[k];
  }
  return null;
}
/** Id-ul unei entități create: `{id}` sau `{<cheie>: {id}}`. */
export function idOf(j) {
  if (!j || typeof j !== "object") return null;
  if (typeof j.id === "string") return j.id;
  for (const v of Object.values(j)) if (v && typeof v === "object" && typeof v.id === "string") return v.id;
  return null;
}

// ── Registrul de scenarii ────────────────────────────────────────────────────
export class Suite {
  constructor() {
    this.scenarios = [];
    this.results = [];
    this.ctx = {}; // stare partajată între grupuri (sesiuni, id-uri create)
  }
  /** Înregistrează un scenariu. `fn(ctx)` aruncă Fail la eșec. */
  add(group, name, fn) {
    this.scenarios.push({ group, name, fn });
  }
  /** Scurtătură pentru o familie de scenarii generate dintr-o matrice. */
  each(group, rows, nameFn, fn) {
    for (const row of rows) this.add(group, nameFn(row), (ctx) => fn(row, ctx));
  }
  async run({ filter, concurrency = 6, verbose = false } = {}) {
    const list = this.scenarios.filter((s) => !filter || filter(s));
    // Scenariile unui grup rulează în ordine (un flux depinde de pasul anterior); grupurile
    // diferite rulează în paralel — altfel 1000+ cereri ar dura minute degeaba.
    const byGroup = new Map();
    for (const s of list) {
      if (!byGroup.has(s.group)) byGroup.set(s.group, []);
      byGroup.get(s.group).push(s);
    }
    const queues = [...byGroup.values()];
    let next = 0;
    const worker = async () => {
      while (next < queues.length) {
        const q = queues[next++];
        for (const s of q) {
          const t0 = Date.now();
          try {
            await s.fn(this.ctx);
            this.results.push({ ...s, ok: true, ms: Date.now() - t0 });
            if (verbose) console.log(`  ✓ [${s.group}] ${s.name}`);
          } catch (e) {
            const msg = e instanceof Fail ? e.message : `EXCEPȚIE: ${e?.stack?.split("\n").slice(0, 2).join(" ") ?? e}`;
            this.results.push({ ...s, ok: false, ms: Date.now() - t0, error: msg });
            console.log(`  ✗ [${s.group}] ${s.name} — ${msg}`);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queues.length) }, worker));
    return this.results;
  }
}
