/**
 * E2E TaskBoard — browser real (TB-001 Tabel + TB-002 Kanban).
 *
 * Completează e2e-taskboard.mjs (API): aici se exercită UI-ul REAL — login,
 * lista de boarduri, tabelul cu quick-add (acțiunea, nu afordanța — §3.5.1quater),
 * și drag & drop-ul Kanban prin DragEvent-uri HTML5 dispecerizate SINCRON.
 *
 * De ce dispatch sincron și nu mouse-drag: (1) Playwright headless nu inițiază
 * drag nativ din mișcări de mouse — limitare de tool; (2) dispatch-ul sincron
 * (dragstart+drop în același task JS, fără re-render între ele) este EXACT
 * scenariul care a prins bug-ul de closure stale din 2026-07-07: handleDrop
 * citea taskId din state-ul React în loc de dataTransfer și mutarea se pierdea.
 * Acest script e netul de regresie pentru clasa aia de bug.
 *
 * Rulare (cu seed proaspăt + server pornit):
 *   npm run db:reset && npm run db:seed
 *   PORT=3000 npm run start &
 *   BASE_URL=http://localhost:3000 node scripts/e2e-taskboard-browser.mjs
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = "admin@atic.demo.io";
const PW = process.env.SMOKE_PASSWORD ?? "demo123456";
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
].filter(Boolean);

let ok = true;
const check = (cond, label) => {
  console.log(cond ? `✅ ${label}` : `❌ ${label}`);
  if (!cond) ok = false;
};

const exe = CHROME_PATHS.find((p) => existsSync(p));
if (!exe) {
  console.error("❌ No Chrome binary found. Set CHROME_PATH.");
  process.exit(2);
}
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));

// ── Login business ───────────────────────────────────────────────────────────
await page.goto(`${BASE}/#/business/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PW);
await page.click('button[type="submit"]');
await page.waitForTimeout(2500);

// ── TB-001: Boarduri + Tabel + quick-add ─────────────────────────────────────
await page.goto(`${BASE}/#/business/board`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
check(
  (await page.getByText("Lansare Cybersecurity toamnă").count()) > 0,
  "TB-001 boardul seedat apare în listă"
);

await page.getByText("Lansare Cybersecurity toamnă").first().click();
await page.waitForTimeout(2000);
const rows = await page.locator("tbody tr").count();
check(rows >= 8, `TB-001 tabelul are ${rows} rânduri (≥8 seedate)`);

const marker = `Task browser ${Date.now()}`;
await page.fill('input[aria-label="Adaugă task nou"]', marker);
await page.press('input[aria-label="Adaugă task nou"]', "Enter");
await page.waitForTimeout(1500);
check(
  (await page.locator(`input[value="${marker}"]`).count()) > 0 ||
    (await page.locator("tbody tr").count()) > rows,
  "TB-001 quick-add (Enter) chiar creează taskul"
);

// ── TB-002: Kanban + drag & drop ─────────────────────────────────────────────
await page.getByRole("button", { name: /Kanban/ }).click();
await page.waitForTimeout(1000);
const cols = await page.locator("section[aria-label^='Coloana']").count();
check(cols >= 4, `TB-002 Kanban afișează ${cols} coloane`);
check(
  (await page.locator("section[aria-label*='Neîncadrate']").count()) === 1,
  "TB-002 lane-ul „Neîncadrate” (plan-first) apare"
);

// Drag sincron dragstart→dragover→drop (regresia closure-stale).
const CARD_TITLE = "Landing page ediția toamnă";
await page.evaluate((title) => {
  const card = [...document.querySelectorAll("div[role='listitem']")].find((el) =>
    el.textContent.includes(title)
  );
  const col = [...document.querySelectorAll("section")].find((el) =>
    el.getAttribute("aria-label")?.startsWith("Coloana Gata")
  );
  const dt = new DataTransfer();
  card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
  col.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
  col.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
}, CARD_TITLE);
await page.waitForTimeout(1500);

check(
  (await page
    .locator("section[aria-label^='Coloana Gata']")
    .locator("div[role='listitem']", { hasText: CARD_TITLE })
    .count()) === 1,
  "TB-002 drag & drop: cardul a ajuns în „Gata”"
);

// Starea reală de pe server, nu doar UI-ul: statusul s-a sincronizat pe done.
const doneTitles = await page.evaluate(async () => {
  const r = await fetch("/api/board/tasks?status=done", { credentials: "include" });
  return (await r.json()).tasks.map((t) => t.title);
});
check(doneTitles.includes(CARD_TITLE), "TB-002 API confirmă status=done (sync listă↔status)");

check(errors.length === 0, errors.length === 0 ? "zero erori JS" : `erori JS: ${errors.join(" | ")}`);
await browser.close();
console.log(ok ? "\n✅ e2e-taskboard-browser: all clean" : "\n❌ e2e-taskboard-browser: failures above");
process.exit(ok ? 0 : 1);
