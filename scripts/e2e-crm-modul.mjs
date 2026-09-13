// E2E pentru modulul CRM (Faza 1) — rulează pe aplicația REALĂ, cu server real,
// bază reală și browser real. Verifică fix ce a cerut ownerul: modulul are
// submodule, doar Pipeline și Produse merg, restul sunt marcate „În curând".
//
// Rulare:
//   PORT=3211 npx tsx server/index.ts &      (sau orice port liber)
//   BASE=http://localhost:3211 node scripts/e2e-crm-modul.mjs
//
// De ce prin serverul de API și nu prin `vite dev`: proxy-ul din vite.config.ts
// e fixat pe portul 3000, care e adesea ocupat de altă sesiune. Serverul
// servește și SPA-ul construit, deci asta e și mai aproape de producție.

import { createRequire } from "node:module";
let chromium;
for (const base of [
  "/Users/dima/vector-learn-landing",
  "/Users/dima/vl-crm-modul",
  "/Users/dima/investment",
]) {
  try {
    ({ chromium } = createRequire(base + "/package.json")("playwright-core"));
    break;
  } catch { /* încearcă următorul */ }
}
if (!chromium) { console.error("playwright-core lipsește"); process.exit(2); }

const BASE = process.env.BASE || "http://localhost:3211";
const EMAIL = process.env.E2E_EMAIL || "admin@atic.demo.io";
const PASSWORD = process.env.E2E_PASSWORD || "demo123456";

let pass = 0;
const fails = [];
const ok = (n) => { pass++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { fails.push(`${n}${d ? " — " + d : ""}`); console.log(`  ✗ ${n}${d ? " — " + d : ""}`); };

const browser = await chromium.launch({ headless: true });
// Viewport explicit: tabla kanban e `hidden lg:grid`, iar implicitul Playwright
// (1280×720) e la limită. Fixăm o fereastră de desktop real.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// ── 1. Autentificare prin API, ca să avem cookie-ul de sesiune ───────────────
// Paginile /business/* cer sesiunea Business Suite (`/api/business/auth/login`),
// care în plus verifică `tenant.app_kind === "business"`. Login-ul generic
// `/api/auth/login` creează o sesiune validă pentru API, dar `BusinessGuardPage`
// tot te trimite la ecranul de conectare — de aceea folosim ruta de business.
const loginRes = await ctx.request.post(`${BASE}/api/business/auth/login`, {
  data: { email: EMAIL, password: PASSWORD },
});
if (loginRes.ok()) ok("autentificare în Business Suite cu utilizatorul din seed");
else {
  bad("autentificare", `HTTP ${loginRes.status()} — ${(await loginRes.text()).slice(0, 120)}`);
  console.log("\nNu pot continua fără sesiune."); await browser.close(); process.exit(1);
}

// ── 2. API-ul CRM răspunde autentificat ─────────────────────────────────────
const prodRes = await ctx.request.get(`${BASE}/api/crm/products`);
if (prodRes.ok()) ok("GET /api/crm/products răspunde autentificat");
else bad("GET /api/crm/products", `HTTP ${prodRes.status()}`);

const pipeRes = await ctx.request.get(`${BASE}/api/crm/leads/pipeline`);
if (pipeRes.ok()) {
  const body = await pipeRes.json();
  if (body && typeof body.counts === "object" && typeof body.totalValueCents === "number") {
    ok(`GET /api/crm/leads/pipeline întoarce structura de kanban (${Object.values(body.counts).reduce((a, b) => a + b, 0)} leaduri)`);
  } else bad("forma răspunsului de pipeline", JSON.stringify(body).slice(0, 120));
} else bad("GET /api/crm/leads/pipeline", `HTTP ${pipeRes.status()}`);

// ── 3. Un produs creat prin API chiar se salvează ───────────────────────────
const sku = `E2E-${Date.now()}`;
const createRes = await ctx.request.post(`${BASE}/api/crm/products`, {
  data: { name: "Produs E2E", sku, listPriceCents: 123456, currency: "MDL", unit: "buc" },
});
let createdId = null;
if (createRes.ok()) {
  const p = await createRes.json();
  createdId = p.id ?? p.product?.id ?? null;
  ok("POST /api/crm/products creează produsul");
} else bad("POST /api/crm/products", `HTTP ${createRes.status()}`);

// SKU duplicat → 409, nu 500
const dupRes = await ctx.request.post(`${BASE}/api/crm/products`, {
  data: { name: "Alt produs", sku, listPriceCents: 1000 },
});
if (dupRes.status() === 409) ok("SKU duplicat e refuzat curat (409), nu cu o eroare de server");
else bad("SKU duplicat", `HTTP ${dupRes.status()} (așteptat 409)`);

// ── 4. Paginile se încarcă în browser ───────────────────────────────────────
async function visit(path, expect, name) {
  const before = pageErrors.length;
  // Aplicația e un SPA pe hash-router: un `goto` către ACELAȘI `#/...` nu e o
  // navigare pentru browser, deci pagina ar rămâne cu datele vechi în memorie.
  // De aceea reîncărcăm explicit — altfel a doua vizită la aceeași rută arată
  // starea dinaintea modificărilor și testul minte.
  await page.goto(`${BASE}/#${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  // 5s: pipeline-ul face două cereri (sesiune + date) înainte să randeze tabla.
  await page.waitForTimeout(5000);
  const text = await page.evaluate(() => document.body.innerText);
  if (pageErrors.length > before) {
    bad(`${name} a aruncat`, pageErrors[pageErrors.length - 1].split("\n")[0].slice(0, 140));
    return "";
  }
  if (expect.test(text)) ok(name);
  else bad(name, text.replace(/\s+/g, " ").slice(0, 140));
  return text;
}

const homeText = await visit("/business/crm", /CRM/i, "pagina modulului CRM se încarcă");

// Cerința ownerului: submodulele neterminate apar ca „În curând"
if (/în curând/i.test(homeText)) ok("submodulele neterminate sunt marcate „În curând”");
else bad("lipsesc marcajele „În curând” pe pagina modulului");

for (const label of ["Pipeline", "Produse"]) {
  if (new RegExp(label, "i").test(homeText)) ok(`submodulul „${label}” e listat`);
  else bad(`submodulul „${label}” lipsește de pe pagina modulului`);
}

// Pipeline gol → stare goală, nu tablă goală. Verificăm întâi asta.
const emptyText = await visit("/business/crm/pipeline", /Pipeline/i, "pagina Pipeline se încarcă");
const startedEmpty = /niciun lead/i.test(emptyText);
if (startedEmpty) ok("pipeline fără leaduri arată o stare goală, nu o tablă pustie");

// Creăm un lead ca să avem ce afișa pe tablă.
const leadName = `Lead E2E ${Date.now()}`;
const leadRes = await ctx.request.post(`${BASE}/api/crm/leads`, {
  data: { fullName: leadName, phone: "+373 69 111 222", company: "SRL Test E2E", valueCents: 250000, source: "manual" },
});
let leadId = null;
if (leadRes.ok()) {
  const l = await leadRes.json();
  leadId = l.id ?? l.lead?.id ?? null;
  ok("POST /api/crm/leads creează leadul");
} else bad("POST /api/crm/leads", `HTTP ${leadRes.status()} — ${(await leadRes.text()).slice(0, 120)}`);

// Cu un lead în bază, tabla trebuie să arate cele 5 etape și leadul.
const boardText = await visit("/business/crm/pipeline", /Pipeline/i, "pagina Pipeline se reîncarcă cu date");
const stages = ["Lead nou", "Contactat", "Trial", "Client", "Pierdut"];
const missing = stages.filter((s) => !new RegExp(s, "i").test(boardText));
if (missing.length === 0) ok("kanbanul afișează toate cele 5 etape");
else bad("etape lipsă pe kanban", missing.join(", "));

if (boardText.includes(leadName)) ok("leadul creat apare pe tablă");
else bad("leadul creat nu apare pe tablă");

// Mutarea în „Pierdut" fără motiv trebuie refuzată de server.
if (leadId) {
  const noReason = await ctx.request.patch(`${BASE}/api/crm/leads/${leadId}/stage`, { data: { stage: "lost" } });
  if (noReason.status() === 400) ok("[blocant] mutarea în „Pierdut” fără motiv e refuzată de server");
  else bad("mutare în „Pierdut” fără motiv", `HTTP ${noReason.status()} (așteptat 400)`);

  const withReason = await ctx.request.patch(`${BASE}/api/crm/leads/${leadId}/stage`, {
    data: { stage: "lost", lostReason: "Preț prea mare" },
  });
  if (withReason.ok()) ok("mutarea în „Pierdut” cu motiv trece");
  else bad("mutare în „Pierdut” cu motiv", `HTTP ${withReason.status()}`);

  const hist = await ctx.request.get(`${BASE}/api/crm/leads/${leadId}/interactions`);
  if (hist.ok()) {
    const h = await hist.json();
    const items = h.items ?? [];
    if (items.some((x) => x.type === "stage_change")) ok("schimbarea de etapă a lăsat urmă în istoric");
    else bad("istoricul nu conține stage_change", JSON.stringify(items).slice(0, 120));
  } else bad("GET interactions", `HTTP ${hist.status()}`);
}

const prodText = await visit("/business/crm/produse", /Produse|produs/i, "pagina Produse se încarcă");
if (/Produs E2E/.test(prodText)) ok("produsul creat prin API apare în pagină");
else bad("produsul creat nu apare în listă");

// ── 5. Curățenie: arhivăm produsul de test ──────────────────────────────────
if (createdId) {
  const arch = await ctx.request.post(`${BASE}/api/crm/products/${createdId}/archive`);
  if (arch.ok()) ok("produsul de test a fost arhivat (curățenie)");
  else bad("arhivarea produsului de test", `HTTP ${arch.status()}`);
}

// Ștergerea de leaduri nu e în scopul Fazei 1 (CORE-ul cere păstrarea istoricului),
// deci leadul de test rămâne marcat „pierdut" — vizibil, dar în afara pâlniei active.
if (leadId) console.log(`  · leadul de test rămâne în bază ca „pierdut": ${leadId}`);

await browser.close();
console.log(`\n${pass} ok, ${fails.length} probleme`);
if (fails.length) {
  console.log("\nDe reparat:");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
