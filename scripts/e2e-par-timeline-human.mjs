// PAR — jurnalul de activitate trebuie să fie citibil de un om, în browser, pe date reale.
//
// Regresia pe care o blochează: jurnalul afișa exact ce scrie serverul în `par_audit` —
// „Updated fields: payeeType”, `{"attachmentId":"0973c7b7-…","checks":[{"field":"sumă",
// "expected":2340200,"matches":null}]}`, uuid-uri, hash-uri, sume în bani. Testele unitare
// pot trece pe traducător și ecranul să rămână plin de JSON dacă panoul nu se deschide sau
// componenta nu e cea folosită. Deci verificarea se face pe pagina reală: deschidem dosarul,
// apăsăm „Jurnal activitate” și citim ce vede omul.
//
// Per CLAUDE.md §3.5.1quater: verificăm ACȚIUNEA (panoul deschis, textul randat), nu doar
// că butonul există. Testul negativ face parte din livrare — un uuid sau o acoladă în panou
// TREBUIE să facă poarta roșie.
//
//   node scripts/e2e-par-timeline-human.mjs           (server pe :3000, seed rulat)
//   BASE=http://localhost:3100 node scripts/e2e-par-timeline-human.mjs
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE || process.env.BASE_URL || "http://localhost:3000";
const ADMIN = process.env.E2E_EMAIL || "admin@atic.demo.io";
const PW = process.env.E2E_PASSWORD || "demo123456";
// `E2E_SESSION_FILE` ține sesiunea de prod separat de cea locală (nu le amestecăm).
const SESSION_FILE = process.env.E2E_SESSION_FILE
  ? path.resolve(process.env.E2E_SESSION_FILE)
  : path.join(ROOT, ".e2e-session.json");

let n = 0, ok = 0;
const failures = [];
function check(name, pass, detail = "") {
  n++;
  if (pass) { ok++; console.log(`  ✅ ${name}`); }
  else { failures.push({ name, detail }); console.log(`  🔴 ${name}${detail ? `\n      ${detail}` : ""}`); }
}

// Sesiune refolosită (cota e 10 autentificări / 15 min — vezi scripts/e2e-gate.mjs).
async function apiContext() {
  if (existsSync(SESSION_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
      if (saved.base === BASE) {
        const ctx = await request.newContext({ baseURL: BASE, storageState: saved.state });
        if ((await ctx.get("/api/modules")).status() === 200) return ctx;
        await ctx.dispose();
      }
    } catch { /* cache stricat */ }
  }
  const ctx = await request.newContext({ baseURL: BASE });
  const login = await ctx.post("/api/business/auth/login", { data: { email: ADMIN, password: PW } });
  if (login.status() !== 200) throw new Error(`login ${ADMIN} → ${login.status()} (server pornit? seed rulat?)`);
  return ctx;
}

/** Cererea cu cel mai bogat jurnal — acolo se văd cele mai multe feluri de eveniment. */
async function richestPar(ctx) {
  const list = await (await ctx.get("/api/par?limit=40")).json();
  const rows = list.requests ?? list.items ?? list.data ?? list;
  let best = null;
  for (const par of rows.slice(0, 25)) {
    const res = await ctx.get(`/api/par/${par.id}/timeline`);
    if (res.status() !== 200) continue;
    const { timeline } = await res.json();
    const kinds = new Set(timeline.map((e) => e.event));
    if (!best || kinds.size > best.kinds) best = { id: par.id, no: par.request_no ?? par.requestNo, events: timeline, kinds: kinds.size };
  }
  return best;
}

console.log("═══ PAR — jurnalul de activitate, citit ca un om ═══\n");

const ctx = await apiContext();
const par = await richestPar(ctx);
if (!par) { console.log("🔴 nicio cerere cu jurnal — ai rulat `npm run db:seed`?"); process.exit(1); }
console.log(`  Dosar: ${par.no ?? par.id} — ${par.events.length} evenimente, ${par.kinds} feluri\n`);

const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean).find((p) => existsSync(p));
if (!CHROME) { console.log("🔴 niciun Chrome găsit — setează CHROME_PATH"); process.exit(1); }

const { chromium } = await import("playwright-core");
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.newContext({ storageState: await ctx.storageState() })).newPage();
const crashes = [];
page.on("pageerror", (e) => crashes.push(String(e.message).slice(0, 200)));

await page.goto(`${BASE}/#/business/par/${par.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const toggle = page.getByRole("button", { name: /Jurnal activitate/i }).first();
check("butonul „Jurnal activitate” e pe pagină", await toggle.count() > 0);
await toggle.click();
await page.waitForTimeout(1200);

const panel = page.locator("#par-timeline-panel");
check("panoul chiar se deschide (nu doar butonul există)", await panel.count() > 0 && await panel.isVisible());

const rows = await panel.locator("li").count();
check(`jurnalul are rânduri (${rows})`, rows > 0);

const text = (await panel.innerText()).trim();
check("panoul are conținut, nu e gol", text.length > 30, `${text.length} caractere`);

// ── Testul negativ: bruta tehnică NU are voie pe ecran ───────────────────────
const FORBIDDEN = [
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "uuid"],
  [/[{}]|"\w+":/, "JSON brut"],
  [/\bcents\b/i, "„cents” (sume în bani)"],
  [/Updated fields/i, "„Updated fields”"],
  [/\bmatches\b|\bexpected\b|attachmentId/i, "câmpuri din JSON-ul de verificare"],
  [/Hash mismatch|Body hash/i, "hash de integritate"],
  [/\bStep \d+ .*(approved|rejected|unlocked)/i, "text tehnic în engleză"],
  [/created as draft|Instantiated from|Duplicated from|Received by user/i, "detaliu netradus"],
];
for (const [re, what] of FORBIDDEN) {
  const m = text.match(re);
  check(`fără ${what}`, !m, m ? `găsit: „${String(m[0]).slice(0, 80)}”` : "");
}

// ── Pozitivul: titlurile sunt cuvinte, nu nume de eveniment ─────────────────
const titles = await panel.locator("li .text-sm.font-medium").allInnerTexts();
check("fiecare rând are un titlu scris cu cuvinte", titles.length > 0 && titles.every((t) => t.trim() && !t.includes("_")),
  titles.filter((t) => t.includes("_")).join(", "));
check("jurnalul e în română", /creat|aprob|semnat|plăt|modific|trimis|finanțe/i.test(text), text.slice(0, 120));
check("nicio eroare JS pe pagină", crashes.length === 0, crashes[0] ?? "");

console.log(`\n──── ce vede omul ────\n${text.split("\n").slice(0, 24).map((l) => `  ${l}`).join("\n")}\n`);

await browser.close();
console.log(`═══ ${ok}/${n} au trecut ═══`);
if (failures.length) { console.log("Jurnalul nu e citibil:"); for (const f of failures) console.log(` - ${f.name}${f.detail ? ` — ${f.detail}` : ""}`); process.exit(1); }
console.log("Jurnalul se citește ca un text, nu ca un log.");
