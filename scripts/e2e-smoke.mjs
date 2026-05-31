// Real browser smoke test: opens each app page, logs console errors + failed network calls.
// Usage: node scripts/e2e-smoke.mjs [baseUrl]   (default http://localhost:5173)
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5173";
const CREDS = { email: "admin@demo.vectorlearn.io", password: "demo123456", tenantSlug: "demo-lingua-school" };

const PAGES = [
  { name: "Dashboard", hash: "#/app" },
  { name: "Azi (Today dashboard)", hash: "#/app/leads/today" },
  { name: "Leads (kanban+list)", hash: "#/app/leads" },
  { name: "Elevi (students)", hash: "#/app/students" },
  { name: "Orar (schedule)", hash: "#/app/schedule" },
  { name: "Profesori (teachers)", hash: "#/app/teachers" },
  { name: "Plăți (payments)", hash: "#/app/payments" },
  { name: "Contracte", hash: "#/app/contracts" },
  { name: "Feedback", hash: "#/app/feedback" },
  { name: "Cadences", hash: "#/app/cadences" },
  { name: "Audit Log", hash: "#/app/audit-log" },
  { name: "Salarizare (payroll)", hash: "#/app/hr/payroll" },
  { name: "Analytics CRM", hash: "#/app/analytics/crm" },
  { name: "Automatizări", hash: "#/app/settings/crm/automations" },
];

const report = [];
const log = (s) => { console.log(s); report.push(s); };

const browser = await chromium.launch({ headless: false, slowMo: 250 });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// collect console + network errors per page
let consoleErrors = [];
let netErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/api/") && r.status() >= 400) netErrors.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, "")}`);
});

log(`\n=== E2E SMOKE @ ${BASE} ===\n`);

// 1. LOGIN
log("→ LOGIN");
await page.goto(`${BASE}/#/app/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', CREDS.email);
await page.fill('input[type="password"]', CREDS.password);
consoleErrors = []; netErrors = [];
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
const loggedIn = !page.url().includes("/login");
log(loggedIn ? "  ✅ login OK → " + page.url().replace(BASE, "") : "  ❌ login FAILED (still on /login)");
if (netErrors.length) log("  ⚠️ login network: " + netErrors.join(" | "));

// 2. EACH PAGE
for (const p of PAGES) {
  consoleErrors = []; netErrors = [];
  try {
    await page.goto(`${BASE}/${p.hash}`, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1200);
    // page-level signals
    const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 0);
    const hasError = await page.locator("text=/Internal Server Error|Eroare|something went wrong|undefined/i").count().catch(() => 0);
    const status = (netErrors.length === 0 && consoleErrors.length === 0) ? "✅" : "⚠️";
    log(`\n${status} ${p.name}  (${p.hash})`);
    if (netErrors.length) log("   net: " + netErrors.slice(0, 4).join(" | "));
    if (consoleErrors.length) log("   console: " + consoleErrors.slice(0, 3).join(" | "));
    if (hasError) log("   page shows an error string");
    // screenshot
    const safe = p.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    await page.screenshot({ path: `/tmp/e2e-${safe}.png` });
  } catch (e) {
    log(`\n❌ ${p.name}  (${p.hash}) — navigation FAILED: ${String(e.message).slice(0, 120)}`);
  }
}

log("\n=== END ===");
writeFileSync("/tmp/e2e-report.txt", report.join("\n"));
await page.waitForTimeout(1500);
await browser.close();
