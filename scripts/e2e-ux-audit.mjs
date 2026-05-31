// UX audit: log in, visit each page, capture full-page screenshots + UX signals
// (empty states, element counts, interactive affordances). Output → /tmp/ux/*.png + report.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5173";
const CREDS = { email: "admin@demo.vectorlearn.io", password: "demo123456" };
mkdirSync("/tmp/ux", { recursive: true });

const PAGES = [
  { name: "01-dashboard", hash: "#/app" },
  { name: "02-today", hash: "#/app/leads/today" },
  { name: "03-leads-kanban", hash: "#/app/leads" },
  { name: "04-students", hash: "#/app/students" },
  { name: "05-schedule", hash: "#/app/schedule" },
  { name: "06-teachers", hash: "#/app/teachers" },
  { name: "07-payments", hash: "#/app/payments" },
  { name: "08-contracts", hash: "#/app/contracts" },
  { name: "09-feedback", hash: "#/app/feedback" },
  { name: "10-cadences", hash: "#/app/cadences" },
  { name: "11-audit", hash: "#/app/audit-log" },
  { name: "12-payroll", hash: "#/app/hr/payroll" },
  { name: "13-analytics", hash: "#/app/analytics/crm" },
  { name: "14-automations", hash: "#/app/settings/crm/automations" },
];

const report = [];
const log = (s) => { console.log(s); report.push(s); };

const browser = await chromium.launch({ headless: false, slowMo: 150 });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

// login
await page.goto(`${BASE}/#/app/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', CREDS.email);
await page.fill('input[type="password"]', CREDS.password);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);
log(`LOGIN: ${page.url().includes("/login") ? "FAILED" : "OK"}\n`);

for (const p of PAGES) {
  await page.goto(`${BASE}/${p.hash}`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // UX signals
  const counts = await page.evaluate(() => ({
    buttons: document.querySelectorAll("button").length,
    inputs: document.querySelectorAll("input,select,textarea").length,
    tables: document.querySelectorAll("table").length,
    headings: document.querySelectorAll("h1,h2,h3").length,
    // empty-state heuristic
    emptyWords: (document.body.innerText.match(/niciun|nicio|gol|încă|adaugă primul|empty|no data/gi) || []).length,
    // buttons with no accessible label
    iconBtnsNoLabel: Array.from(document.querySelectorAll("button")).filter(b => !b.textContent.trim() && !b.getAttribute("aria-label")).length,
    h1: document.querySelector("h1")?.innerText?.slice(0, 60) || "(no h1)",
  }));
  log(`${p.name}  [${p.hash}]`);
  log(`   h1: "${counts.h1}" · btns:${counts.buttons} inputs:${counts.inputs} tables:${counts.tables}`);
  if (counts.iconBtnsNoLabel > 0) log(`   ⚠️ ${counts.iconBtnsNoLabel} icon-button(s) fără aria-label (a11y)`);
  if (counts.emptyWords > 2) log(`   ℹ️ pare empty-state (multe "niciun/încă" — verifică dacă are CTA bun)`);
  await page.screenshot({ path: `/tmp/ux/${p.name}.png`, fullPage: true });
}
log("\nScreenshots → /tmp/ux/*.png");
writeFileSync("/tmp/ux/report.txt", report.join("\n"));
await browser.close();
