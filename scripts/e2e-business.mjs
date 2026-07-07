// Business Suite E2E smoke — logs in via /business/login and walks every /business/fin/*
// and /business/par/* route in a real headless browser, capturing the EXACT JS error that
// trips the ErrorBoundary ("A apărut o eroare") plus any console errors and failed API calls.
//
// Usage:
//   node scripts/e2e-business.mjs
//   BASE_URL=http://localhost:4173 node scripts/e2e-business.mjs
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "https://vector-learn-landing.vercel.app";
const EMAIL = process.env.SMOKE_EMAIL ?? "admin@demo.vectorlearn.io";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "demo123456";
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const ROUTES = [
  "/#/business/dashboard",
  "/#/business/fin/",
  "/#/business/fin/invoices",
  "/#/business/fin/expenses",
  "/#/business/fin/payments",
  "/#/business/fin/cash",
  "/#/business/fin/ledger",
  "/#/business/fin/budget",
  "/#/business/fin/parties",
  "/#/business/fin/registry",
  "/#/business/fin/einvoices",
  "/#/business/fin/assets",
  "/#/business/fin/inventory",
  "/#/business/fin/payroll",
  "/#/business/fin/tax",
  "/#/business/fin/calendar",
  "/#/business/fin/reconcile",
  "/#/business/fin/agreements",
  "/#/business/fin/mass",
  "/#/business/fin/export",
  "/#/business/fin/banklink",
  "/#/business/fin/itpark",
  "/#/business/par",
  // TB-001: TaskBoard
  "/#/business/board",
  "/#/business/board/products",
];

const ERR_PATTERNS = [
  "A apărut o eroare", "does not exist", "Internal Server", "http_500",
  "is not defined", "Cannot read", "Failed to fetch", "Unexpected token",
  "undefined is not", "null is not",
];

async function main() {
  const executablePath = CHROME_PATHS.find((p) => existsSync(p));
  if (!executablePath) { console.error("❌ No Chrome binary. Set CHROME_PATH."); process.exit(2); }

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const perRoute = { js: [], console: [], api: [] };
  page.on("pageerror", (e) => perRoute.js.push(e.message.split("\n")[0]));
  page.on("console", (m) => { if (m.type() === "error") perRoute.console.push(m.text().slice(0, 200)); });
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/api/") && r.status() >= 400) perRoute.api.push(`${r.status()} ${u.replace(BASE, "")}`);
  });

  // Login via business form
  await page.goto(`${BASE}/#/business/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', EMAIL).catch(() => {});
  await page.fill('input[type="password"]', PASSWORD).catch(() => {});
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  console.log(`login → ${page.url().replace(BASE, "")}`);

  let fails = 0;
  for (const r of ROUTES) {
    perRoute.js = []; perRoute.console = []; perRoute.api = [];
    await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const text = await page.$eval("body", (el) => el.innerText).catch(() => "");
    const found = ERR_PATTERNS.filter((p) => text.includes(p));
    const broken = found.length > 0 || perRoute.js.length > 0;
    if (broken) {
      fails++;
      console.error(`\n❌ ${r}`);
      if (found.length) console.error(`   page text: [${found.join(", ")}]`);
      if (perRoute.js.length) console.error(`   JS error:  ${[...new Set(perRoute.js)].join(" | ")}`);
      if (perRoute.console.length) console.error(`   console:   ${[...new Set(perRoute.console)].slice(0, 3).join(" | ")}`);
      if (perRoute.api.length) console.error(`   bad API:   ${[...new Set(perRoute.api)].slice(0, 5).join(" | ")}`);
    } else {
      console.log(`✅ ${r}${perRoute.api.length ? "  (api warns: " + [...new Set(perRoute.api)].slice(0,3).join(",") + ")" : ""}`);
    }
  }

  await browser.close();
  console.error(`\n${fails > 0 ? "❌" : "✅"} ${fails}/${ROUTES.length} route(s) broken.`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => { console.error("crashed:", e.message); process.exit(2); });
