// Post-deploy E2E smoke test — real browser, real DB.
//
// Why this exists (post-mortem 2026-06-02): unit tests run on PGlite and pass even when
// the deployed app is broken. The only way these bugs surfaced was a human opening the
// site and seeing a white screen / red error. This automates that: log in as the demo
// admin and walk every key route in a real headless browser, failing if any route throws
// a JS error OR renders a caught error message as text (most API failures are caught and
// shown as red text — root still has content, nothing thrown — so pageerror alone misses them).
//
// Usage:
//   node scripts/e2e-smoke.mjs                      # against prod
//   BASE_URL=http://localhost:4173 node scripts/e2e-smoke.mjs
//   CHROME_PATH=/path/to/chrome node scripts/e2e-smoke.mjs
//
// Requires playwright-core (devDependency) + a Chrome/Chromium binary. On macOS it
// auto-detects Google Chrome; elsewhere set CHROME_PATH. Exits 1 if any route is broken.
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "https://vector-learn-landing.vercel.app";
const EMAIL = process.env.SMOKE_EMAIL ?? "admin@demo.vectorlearn.io";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "demo123456";
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

// Substrings that indicate a caught error rendered into the page (not thrown).
// "Unexpected token" catches the JSON.parse('<!doctype …') symptom of an API call hitting
// the SPA HTML fallback (route not mounted) — exactly how the api-keys/webhooks pages broke.
const ERR_PATTERNS = [
  "does not exist", "must be less than", "must be greater", "Internal Server",
  "http_500", "is not defined", "Eroare la", "null value", "violates",
  "Cannot read", "invalid input", "NaN", "Failed to fetch", "Unexpected token",
];

// Static routes — every authenticated /app/* page in the router (src/App.tsx Routes()).
// NOTE: these must match the router's path checks exactly; a near-miss (e.g. /app/diploma
// vs /app/diplome, or /app/automations vs /app/settings/crm/automations) silently falls
// through to the dashboard and passes WITHOUT testing the intended page.
const ROUTES = [
  "/#/app/dashboard", "/#/app/students", "/#/app/gamification", "/#/app/schedule",
  "/#/app/teachers", "/#/app/payments", "/#/app/leads", "/#/app/leads/today",
  "/#/app/courses", "/#/app/invoices", "/#/app/contracts", "/#/app/feedback", "/#/app/cx",
  "/#/app/diplome", "/#/app/cadences", "/#/app/audit-log",
  "/#/app/analytics", "/#/app/analytics/crm",
  "/#/app/hr/payroll", "/#/app/hr/audit",
  "/#/app/reports/kpi", "/#/app/reports/revenue", "/#/app/reports/retention", "/#/app/reports/export",
  "/#/app/grading",
  "/#/app/conturi-plata", "/#/app/conturi-plata/setari", "/#/app/conturi-plata/nou",
  "/#/app/kinder/checkin", "/#/app/kinder/diary", "/#/app/kinder/ratio",
  "/#/app/kinder/immunization-report", "/#/app/kinder/compliance", "/#/app/kinder/incidents",
  "/#/app/settings/integrations", "/#/app/settings/api-keys", "/#/app/settings/webhooks",
  "/#/app/settings/crm/automations", "/#/app/settings/crm/templates",
];

async function main() {
  const executablePath = CHROME_PATHS.find((p) => existsSync(p));
  if (!executablePath) {
    console.error("❌ [e2e-smoke] No Chrome binary found. Set CHROME_PATH.");
    process.exit(2);
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(e.message.split("\n")[0]));

  // Login
  await page.goto(`${BASE}/#/app/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', EMAIL).catch(() => {});
  await page.fill('input[type="password"]', PASSWORD).catch(() => {});
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  if (!page.url().includes("/app/dashboard")) {
    console.error(`❌ [e2e-smoke] Login failed — still at ${page.url()}`);
    await browser.close();
    process.exit(1);
  }
  console.log(`✅ login OK → dashboard (${BASE})`);

  // Resolve real IDs (cookies are set) so detail pages get exercised with live data,
  // not just the static list pages. A detail route that 500s on a real id is a common break.
  const ids = await page.evaluate(async () => {
    const j = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
    const pick = (o) => Array.isArray(o) ? o[0]
      : (o?.items?.[0] || o?.data?.[0] || o?.students?.[0] || o?.leads?.[0] || o?.teachers?.[0]);
    const [students, leads, teachers] = await Promise.all([
      j("/api/students"), j("/api/leads"), j("/api/teachers"),
    ]);
    return { student: pick(students)?.id, lead: pick(leads)?.id, teacher: pick(teachers)?.id };
  });
  const detailRoutes = [];
  if (ids.student) detailRoutes.push(
    `/#/app/students/${ids.student}`,
    `/#/app/kinder/students/${ids.student}/medical`,
    `/#/app/kinder/students/${ids.student}/feed`,
  );
  if (ids.lead) detailRoutes.push(`/#/app/leads/${ids.lead}`);
  if (ids.teacher) detailRoutes.push(
    `/#/app/hr/teachers/${ids.teacher}/stats`,
    `/#/app/hr/teachers/${ids.teacher}/availability`,
  );

  let fails = 0;
  for (const r of [...ROUTES, ...detailRoutes]) {
    await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(800);
    const text = await page.$eval("body", (el) => el.innerText).catch(() => "");
    const rootLen = await page.$eval("#root", (el) => el.innerHTML.length).catch(() => 0);
    const found = ERR_PATTERNS.filter((p) => text.includes(p));
    if (found.length > 0 || rootLen < 200) {
      fails++;
      console.error(`❌ ${r}  ${found.length ? "[" + found.join(", ") + "]" : "root=" + rootLen}`);
    } else {
      console.log(`✅ ${r}`);
    }
  }
  if (jsErrors.length > 0) {
    fails += jsErrors.length;
    console.error("❌ JS errors:", [...new Set(jsErrors)].join(" | "));
  }

  await browser.close();
  if (fails > 0) {
    console.error(`\n❌ [e2e-smoke] ${fails} route(s) broken.`);
    process.exit(1);
  }
  console.log(`\n✅ [e2e-smoke] all ${ROUTES.length} routes clean.`);
}

main().catch((e) => { console.error("[e2e-smoke] crashed:", e.message); process.exit(2); });
