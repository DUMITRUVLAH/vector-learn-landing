/**
 * E2E PAR-EFP — e-Factura de la prestator, pe aplicația LIVE
 * ==========================================================
 * Duce o cerere reală până la plată (API), apoi execută fiecare acțiune a modulului nou și
 * verifică EFECTUL, nu doar existența butonului (CLAUDE.md §3.5.1quater):
 *   1. plata către o persoană juridică intră în coada „lipsă e-Factura";
 *   2. plata către o persoană fizică NU intră (nu emite e-Factura);
 *   3. scanarea fără credențiale SFS spune „nu am putut verifica", nu „lipsește";
 *   4. reminderul chiar pleacă spre SOLICITANTUL cererii, iar al doilea e refuzat (429);
 *   5. marcarea manuală scoate cererea din coadă;
 *   6. pagina /business/par/efactura și cardul din pagina cererii chiar se randează în browser.
 *
 * Rulare (seed proaspăt + dist construit):
 *   npm run db:reset && npm run db:seed && npx vite build
 *   PORT=3137 npm run server:dev &
 *   BASE_URL=http://localhost:3137 node scripts/e2e-par-efactura.mjs
 */
import { request, chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3137";
const PW = process.env.SMOKE_PASSWORD ?? "demo123456";
const U = {
  admin: "admin@atic.demo.io",
  approver: "approver@atic.demo.io",
  finance: "finance@atic.demo.io",
  requestor: "requestor@atic.demo.io",
};
const IBAN = "MD24AG000225100013104168";
const IDNO_JURIDIC = "1002600001234";
const IDNP_FIZIC = "2002600012345";

const ctx = {};
async function login(role) {
  const c = await request.newContext({ baseURL: BASE });
  await c.post("/api/auth/login", { data: { email: U[role], password: PW } });
  ctx[role] = c;
}
async function call(role, method, path, body) {
  const res = await ctx[role][method.toLowerCase()](path, body !== undefined ? { data: body } : {});
  let json = null;
  try {
    json = await res.json();
  } catch { /* răspuns fără corp */ }
  return { status: res.status(), json };
}
const GET = (r, p) => call(r, "GET", p);
const POST = (r, p, b) => call(r, "POST", p, b);
const PATCH = (r, p, b) => call(r, "PATCH", p, b);

let total = 0;
let passed = 0;
const failures = [];
async function T(name, fn) {
  total++;
  try {
    const detail = await fn();
    passed++;
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    failures.push({ name, detail: e.message });
    console.log(`🔴 ${name}\n      ${e.message}`);
  }
}
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const cfg = {};

/** Creează o cerere, o duce prin aprobări și o achită. Întoarce id-ul cererii plătite. */
async function paidPar({ payeeType, idno, cents }) {
  const created = await POST("requestor", "/api/par", {});
  const id = created.json.id;
  await PATCH("requestor", `/api/par/${id}`, {
    purpose: "execute_payment",
    currency: "MDL",
    end_use: "Servicii de consultanță — verificare e-Factura",
    payee_name: payeeType === "juridic" ? "Consultanți SRL" : "Ion Popescu",
    payee_iban: IBAN,
    payee_idnp: idno,
    payee_bank: "Victoriabank",
    payee_type: payeeType,
    department_id: cfg.deptId,
    project_id: cfg.projectId,
    budget_code_id: cfg.budgetCodeId,
  });
  await POST("requestor", `/api/par/${id}/line-items`, {
    description: "Serviciu",
    quantity: 1,
    unit: "buc",
    unit_price_cents: cents,
  });
  await POST("requestor", `/api/par/${id}/submit`, {});
  for (const role of ["approver", "admin"]) {
    await POST(role, `/api/par/${id}/approve`, { comment: "ok", signatureName: "Test" });
    const s = (await GET("admin", `/api/par/${id}`)).json.status;
    if (["approved", "in_finance"].includes(s)) break;
  }
  await POST("finance", `/api/par/${id}/finance`, { par_bl: "BL-1" });
  const pay = await POST("finance", `/api/par/${id}/pay`, {
    actual_amount_cents: cents,
    payment_date: new Date().toISOString(),
    payment_ref: "OP-EFP",
  });
  const status = (await GET("admin", `/api/par/${id}`)).json.status;
  must(status === "paid", `cererea nu a ajuns la „paid" (status ${status}, plată ${pay.status})`);
  return id;
}

console.log("═══ PAR — e-Factura de la prestator (live) ═══\n");
for (const role of Object.keys(U)) await login(role);
const [d, p, b] = await Promise.all([
  GET("requestor", "/api/par/departments"),
  GET("requestor", "/api/par/projects"),
  GET("requestor", "/api/par/budget-codes"),
]);
cfg.deptId = (d.json.departments ?? d.json.items ?? [])[0]?.id;
cfg.projectId = (p.json.projects ?? p.json.items ?? [])[0]?.id;
cfg.budgetCodeId = (b.json.budget_codes ?? b.json.items ?? [])[0]?.id;

const parJuridic = await paidPar({ payeeType: "juridic", idno: IDNO_JURIDIC, cents: 120000 });
const parFizic = await paidPar({ payeeType: "fizic", idno: IDNP_FIZIC, cents: 50000 });

await T("plata către persoană juridică intră în coada „lipsă e-Factura”", async () => {
  const q = await GET("finance", "/api/par/efactura?filter=missing");
  must(q.status === 200, `coada a răspuns ${q.status}`);
  const item = q.json.items.find((i) => i.parId === parJuridic);
  must(item, "cererea plătită nu apare în coadă");
  must(item.state.status === "expected", `stare ${item.state.status}`);
  return `${q.json.items.length} cereri în coadă`;
});

await T("plata către persoană fizică NU cere e-Factura", async () => {
  const q = await GET("finance", "/api/par/efactura?filter=all");
  const item = q.json.items.find((i) => i.parId === parFizic);
  must(!item || item.state.status === "not_applicable", "plata către persoană fizică e tratată ca lipsă factură");
});

await T("scanarea fără credențiale SFS nu declară factura lipsă", async () => {
  const s = await POST("finance", "/api/par/efactura/scan", {});
  must(s.status === 200, `scan a răspuns ${s.status}`);
  must(s.json.result.available === false, "scanarea se declară disponibilă deși SFS nu e configurat");
  const one = await GET("finance", `/api/par/efactura/requests/${parJuridic}`);
  must(one.json.state.lastScanAt === null, "s-a înregistrat o verificare care nu a avut loc");
  return s.json.result.message;
});

await T("reminderul pleacă spre solicitantul cererii", async () => {
  const r = await POST("finance", `/api/par/efactura/requests/${parJuridic}/reminder`, {});
  must(r.status === 200, `reminder a răspuns ${r.status}`);
  must(r.json.toAddress === U.requestor, `email trimis la ${r.json.toAddress}, nu la solicitant`);
  must(r.json.reminderCount === 1, `contor remindere ${r.json.reminderCount}`);
  return r.json.toAddress;
});

await T("al doilea reminder în aceeași zi e refuzat", async () => {
  const r = await POST("finance", `/api/par/efactura/requests/${parJuridic}/reminder`, {});
  must(r.status === 429, `al doilea reminder a răspuns ${r.status}`);
});

await T("marcarea manuală scoate cererea din coadă", async () => {
  const m = await POST("finance", `/api/par/efactura/requests/${parJuridic}/mark-received`, {
    seria: "EFMD",
    number: "000000123",
    note: "primită pe email de la prestator",
  });
  must(m.status === 200, `marcarea a răspuns ${m.status}`);
  must(m.json.state.status === "received_manual", `stare ${m.json.state.status}`);
  const q = await GET("finance", "/api/par/efactura?filter=missing");
  must(!q.json.items.some((i) => i.parId === parJuridic), "cererea a rămas în coada „lipsă”");
});

await T("tabul cu toate e-Facturile răspunde și explică lipsa credențialelor", async () => {
  const r = await GET("finance", "/api/par/efactura/invoices");
  must(r.status === 200, `lista de facturi a răspuns ${r.status}`);
  must(r.json.available === false, "lista se declară disponibilă deși SFS nu e configurat");
  must(Array.isArray(r.json.invoices) && r.json.invoices.length === 0, "lista ar trebui să fie goală");
  return r.json.message;
});

// ── Partea de browser: paginile chiar se randează ────────────────────────────

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));

async function uiLogin() {
  await page.goto(`${BASE}/#/business/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', U.finance);
  await page.fill('input[type="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

await T("pagina /business/par/efactura se randează", async () => {
  await uiLogin();
  await page.goto(`${BASE}/#/business/par/efactura`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const body = await page.textContent("body");
  must(/e-Factura prestatori/i.test(body ?? ""), "titlul paginii lipsește");
  must(consoleErrors.length === 0, `erori JS: ${consoleErrors.join(" | ")}`);
});

await T("tabul „Toate e-Facturile” se deschide în browser", async () => {
  await page.click('[role="tab"]:has-text("Toate e-Facturile")');
  await page.waitForTimeout(1500);
  const body = await page.textContent("body");
  must(/Nu putem citi facturile din SFS|facturi primite/i.test(body ?? ""), "tabul nu a afișat nici listă, nici explicație");
  must(consoleErrors.length === 0, `erori JS: ${consoleErrors.join(" | ")}`);
});

await T("cardul e-Factura apare în pagina unei cereri plătite", async () => {
  await page.goto(`${BASE}/#/business/par/${parFizic}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const body = await page.textContent("body");
  must(/e-Factura de la prestator/i.test(body ?? ""), "cardul nu apare în pagina cererii");
  must(consoleErrors.length === 0, `erori JS: ${consoleErrors.join(" | ")}`);
});

await browser.close();

console.log(`\n═══ ${passed}/${total} verificări trecute ═══`);
if (failures.length) {
  for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
  process.exit(1);
}
