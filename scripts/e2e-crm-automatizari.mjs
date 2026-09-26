// E2E — Automatizări CRM (CRM-A01 + CRM-A02), pe aplicația REALĂ: server real, bază reală, browser real.
//
// Ownerul: „nu se poate face scroll aici la fel; îmbunătățește automatizările să fie mai flexibile și
// scenariile predefinite să fie deja". Scriptul APASĂ comutatoarele și verifică prin API ce s-a
// salvat — nu doar că butoanele există (CLAUDE.md §3.5.1quater: testează acțiunea, nu posibilitatea).
//
// Rulare:
//   CRON_SECRET=e2e-cron-secret PORT=3171 npx tsx server/index.ts &   (după db:reset + db:seed + vite build)
//   BASE=http://localhost:3171 CRON_SECRET=e2e-cron-secret node scripts/e2e-crm-automatizari.mjs

import { createRequire } from "node:module";
let chromium;
for (const base of [process.cwd(), "/Users/dima/vector-learn-landing"]) {
  try {
    ({ chromium } = createRequire(base + "/package.json")("playwright-core"));
    break;
  } catch {
    /* încearcă următorul */
  }
}
if (!chromium) {
  console.error("playwright-core lipsește");
  process.exit(2);
}

const BASE = process.env.BASE || "http://localhost:3171";
const EMAIL = process.env.E2E_EMAIL || "admin@atic.demo.io";
const PASSWORD = process.env.E2E_PASSWORD || "demo123456";
const CRON_SECRET = process.env.CRON_SECRET || "";

let pass = 0;
const fails = [];
const ok = (n) => {
  pass++;
  console.log(`  ✓ ${n}`);
};
const bad = (n, d) => {
  fails.push(`${n}${d ? " — " + d : ""}`);
  console.log(`  ✗ ${n}${d ? " — " + d : ""}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 800 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

const login = await ctx.request.post(`${BASE}/api/business/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
if (!login.ok()) {
  bad("autentificare", `HTTP ${login.status()}`);
  await browser.close();
  process.exit(1);
}
ok("autentificare în Business Suite");

const api = async (method, url, data) => {
  const res = await ctx.request.fetch(`${BASE}${url}`, { method, data });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status(), body };
};

// Pornim de la curat: regulile rămase dintr-o rulare anterioară ar face comutatoarele să pară deja pornite.
for (const r of (await api("GET", "/api/crm/automations")).body?.items ?? []) await api("DELETE", `/api/crm/automations/${r.id}`);
for (const r of (await api("GET", "/api/crm/assignment/rules")).body?.items ?? []) await api("DELETE", `/api/crm/assignment/rules/${r.id}`);

// ── 1. Scenariile sunt deja pe pagină, iar comutatorul chiar creează regula ─────
await page.goto(`${BASE}/#/business/crm/automatizari`, { waitUntil: "networkidle" });
if (await page.getByText("Scenarii gata făcute").isVisible().catch(() => false)) ok("pagina goală arată scenariile gata făcute");
else bad("scenariile gata făcute lipsesc de pe pagină");

await page.getByLabel(/Pornește scenariul Nu lăsa lead-urile uitate/).click();
await page.getByLabel(/Oprește scenariul Nu lăsa lead-urile uitate/).waitFor({ timeout: 5000 }).catch(() => {});
const afterToggle = (await api("GET", "/api/crm/automations")).body?.items ?? [];
const idleRule = afterToggle.find((r) => r.templateKey === "idle-3-days");
if (idleRule?.enabled && idleRule.trigger?.kind === "lead.idle" && idleRule.trigger?.idleDays === 3)
  ok("comutatorul a creat regula „lead neatins 3 zile”, pornită, cu scenariul de origine");
else bad("scenariul pornit nu s-a salvat corect", JSON.stringify(idleRule ?? afterToggle).slice(0, 200));

await page.reload({ waitUntil: "networkidle" });
if (await page.getByLabel(/Oprește scenariul Nu lăsa lead-urile uitate/).isVisible().catch(() => false))
  ok("după reîncărcare scenariul apare tot pornit (nu se propune a doua oară)");
else bad("scenariul nu apare pornit după reîncărcare");

// ── 2. „Personalizează” deschide editorul completat ──────────────────────────
await page.getByRole("button", { name: "Personalizează" }).nth(1).click();
const dialog = page.getByRole("dialog");
const days = await dialog.getByLabel("După câte zile").inputValue().catch(() => "");
if (days === "3") ok("„Personalizează” deschide regula cu pragul de zile");
else bad("editorul personalizării", `zile=${days}`);
await page.keyboard.press("Escape");

// ── 3. O regulă proprie cu condiție „este unul dintre” + notificare, prin API, chiar rulează ─
const created = await api("POST", "/api/crm/automations", {
  name: "E2E rețele",
  trigger: { kind: "lead.created" },
  conditions: [{ field: "source", op: "in", value: "facebook_ad,instagram" }],
  actions: [
    { type: "add_tag", tag: "e2e-social" },
    { type: "notify", to: "admins", message: "lead din rețele" },
  ],
});
if (created.status === 201) ok("POST /api/crm/automations acceptă „este unul dintre” + „anunță”");
else bad("POST regulă nouă", `HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 160)}`);

const lead = await api("POST", "/api/crm/leads", { fullName: "E2E Automatizări", phone: "+37360000123", source: "instagram" });
if (lead.status === 201 || lead.status === 200) {
  const leadId = lead.body?.id ?? lead.body?.lead?.id;
  const runs = (await api("GET", `/api/crm/automations/runs?leadId=${leadId}`)).body?.items ?? [];
  const run = runs.find((r) => r.automationName === "E2E rețele");
  if (run && run.status === "ok" && run.actions.some((a) => a.action === "notify"))
    ok("lead-ul din Instagram a declanșat regula: etichetă + notificare, în jurnal");
  else bad("regula cu „este unul dintre” n-a rulat", JSON.stringify(runs).slice(0, 200));
} else bad("POST /api/crm/leads", `HTTP ${lead.status}`);

// ── 4. Cronul zilnic rulează lead-urile uitate și răspunde cu forma așteptată ──
if (CRON_SECRET) {
  const res = await ctx.request.get(`${BASE}/api/crm/cron/daily`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const body = await res.json().catch(() => null);
  if (res.ok() && body?.idle && typeof body.idle.fired === "number") ok(`cronul zilnic rulează regulile „idle” (${body.idle.rules} reguli)`);
  else bad("cronul zilnic", `HTTP ${res.status()} ${JSON.stringify(body).slice(0, 160)}`);
} else console.log("  – cronul zilnic sărit (fără CRON_SECRET)");

// ── 5. Distribuirea: scenariile se exclud între ele ─────────────────────────
await page.getByRole("tab", { name: "Distribuire" }).click();
await page.getByLabel(/Pornește scenariul Pe rând, la toată echipa/).click();
await page.getByLabel(/Oprește scenariul Pe rând, la toată echipa/).waitFor({ timeout: 5000 }).catch(() => {});
await page.getByLabel(/Pornește scenariul Primește cine are loc azi/).click();
await page.getByLabel(/Oprește scenariul Primește cine are loc azi/).waitFor({ timeout: 5000 }).catch(() => {});
const distRules = (await api("GET", "/api/crm/assignment/rules")).body?.items ?? [];
const rr = distRules.find((r) => r.templateKey === "dist-round-robin");
const cap = distRules.find((r) => r.templateKey === "dist-capacity");
if (rr && !rr.enabled && cap?.enabled) ok("pornirea „cine are loc azi” a oprit „pe rând” — un singur mod activ");
else bad("scenariile de distribuire nu se exclud", JSON.stringify(distRules).slice(0, 200));

// ── 6. Derularea (CRM-A01) ──────────────────────────────────────────────────
const scrolls = async () => {
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(400);
  return page.evaluate(() => scrollY);
};
if ((await scrolls()) > 0) ok("fila Distribuire se derulează");
else bad("fila Distribuire nu se derulează");

// Blocaj rămas de pe pagina de dinainte (cazul real: fișa leadului + „Act nou”), apoi navigare.
await page.goto(`${BASE}/#/business/crm/pipeline`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  document.body.style.overflow = "hidden";
});
await page.evaluate(() => {
  location.hash = "#/business/crm/automatizari";
});
await page.waitForTimeout(1200);
const ov = await page.evaluate(() => document.body.style.overflow);
if (ov !== "hidden" && (await scrolls()) > 0) ok("un blocaj de derulare rămas de pe altă pagină se ridică la navigare");
else bad("blocajul de derulare a supraviețuit navigării", `overflow=${ov}`);

if (pageErrors.length === 0) ok("nicio eroare JavaScript în pagină");
else bad("erori în pagină", pageErrors.slice(0, 3).join(" | "));

// Curățenie: nu lăsăm reguli de test pornite în baza locală.
for (const r of (await api("GET", "/api/crm/automations")).body?.items ?? []) await api("DELETE", `/api/crm/automations/${r.id}`);
for (const r of (await api("GET", "/api/crm/assignment/rules")).body?.items ?? []) await api("DELETE", `/api/crm/assignment/rules/${r.id}`);

await browser.close();
console.log(`\n${pass} ok, ${fails.length} picate`);
if (fails.length) {
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
