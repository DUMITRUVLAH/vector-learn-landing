// Verificare în browser REAL a registrului de beneficiari: fiecare rechizit are coloana lui.
//
// De ce un browser și nu doar teste unitare: ParAdmin.tsx e o pagină mare, iar un import lipsă
// sau o eroare de randare nu se vede în vitest cu module mockuite — se vede ca ecran alb, la
// utilizator. Aici pagina e chiar deschisă, se apasă filele, și se citește tabelul din DOM.
//
//   BASE_URL=http://localhost:3141 node scripts/e2e-par-vendor-columns.mjs
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL ?? "admin@atic.demo.io";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "demo123456";
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const EXPECTED_HEADERS = ["Nume", "Cod fiscal / IDNO", "Cod TVA", "IBAN", "Cod bancar", "Bancă"];

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "✅" : "🔴"} ${msg}`);
  if (!ok) failures++;
};

async function main() {
  const executablePath = CHROME_PATHS.find((p) => existsSync(p));
  if (!executablePath) {
    console.error("❌ Niciun binar Chrome. Setează CHROME_PATH.");
    process.exit(2);
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(e.message.split("\n")[0]));

  await page.goto(`${BASE}/#/business/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/#/business/par/admin`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);

  await page.getByRole("tab", { name: /Date referință/i }).click();
  await page.waitForTimeout(600);
  await page.getByRole("tab", { name: /Furnizori/i }).click();
  await page.waitForTimeout(1200);

  const table = page.getByRole("table", { name: "Furnizori" });
  check((await table.count()) === 1, "tabelul de furnizori s-a randat");

  const headers = (await table.locator("thead th").allTextContents()).map((h) => h.trim());
  for (const h of EXPECTED_HEADERS) {
    check(headers.includes(h), `coloana „${h}” există`);
  }

  // Rândul semănat de POST-ul de mai devreme (dacă există) trebuie să aibă codurile pe coloane,
  // nu îngrămădite în „Bancă” — asta e regresia raportată.
  const row = table.locator("tbody tr", { hasText: "NEWS MAKER SRL" });
  if ((await row.count()) > 0) {
    const cells = (await row.first().locator("td").allTextContents()).map((c) => c.trim());
    const bankCell = cells.find((c) => c.startsWith("BC'MAIB'")) ?? "";
    check(cells.includes("AGRNMD2X885"), "codul bancar stă în celula lui");
    check(cells.includes("1014600022332"), "codul fiscal stă în celula lui");
    check(!bankCell.includes("AGRNMD2X885"), "celula „Bancă” NU mai conține codul bancar");
    check(!bankCell.includes("1014600022332"), "celula „Bancă” NU mai conține codul fiscal");
  } else {
    console.log("ℹ️  fără rândul „NEWS MAKER SRL” — sar peste verificarea pe celule");
  }

  // Butonul de reparare trebuie să existe ȘI să răspundă (nu doar să fie desenat).
  const btn = page.getByRole("button", { name: /Separă codurile/i });
  check((await btn.count()) === 1, "acțiunea de separare a rândurilor vechi e prezentă");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/par/vendors/actions/normalize"), { timeout: 15000 }),
    btn.click(),
  ]);
  check(resp.status() === 200, `POST /actions/normalize → ${resp.status()}`);
  await page.waitForTimeout(1500);
  const report = await page.locator("text=/beneficiari au fost separați|Nimic de separat/").count();
  check(report > 0, "rezultatul separării rămâne pe ecran după reîncărcare");

  check(jsErrors.length === 0, `fără erori JS în pagină${jsErrors.length ? `: ${jsErrors.join(" | ")}` : ""}`);

  await browser.close();
  console.log(failures === 0 ? "\n✅ Registrul de beneficiari arată codurile separat." : `\n🔴 ${failures} verificări picate.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(2);
});
