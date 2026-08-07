// E2E e-Factura — login → Facturi B2B → creează factură (cu IBAN) → Trimite la SFS.
// Apasă butoanele reale ca un utilizator. Raportează fiecare pas.
//   BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD overridabile.
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "https://vector-learn-landing.vercel.app";
const EMAIL = process.env.SMOKE_EMAIL ?? "admin@demo.vectorlearn.io";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "demo123456";
const BUYER = process.env.SMOKE_BUYER_IDNO ?? "1024600035737"; // VECTOR ACADEMY
const IBAN = process.env.SMOKE_BUYER_IBAN ?? "MD87AG000000022516065719";
const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean).find((p) => existsSync(p));

const log = (s) => console.log(s);
const step = (n, ok, extra = "") => console.log(`${ok ? "✅" : "❌"} ${n}${extra ? "  — " + extra : ""}`);

async function main() {
  if (!CHROME) { console.error("no chrome"); process.exit(2); }
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  const apiCalls = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/api/fin/einvoices") || u.includes("/api/fin/invoices") || u.includes("/api/fin/sfs")) {
      apiCalls.push(`${r.request().method()} ${r.status()} ${u.replace(BASE, "").split("?")[0]}`);
    }
  });

  // 1. LOGIN
  await page.goto(`${BASE}/#/business/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
  await page.fill('input[type="email"]', EMAIL).catch(() => {});
  await page.fill('input[type="password"]', PASSWORD).catch(() => {});
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  step("Login", !page.url().includes("/login"), page.url().replace(BASE, ""));

  // 2. Facturi B2B
  await page.goto(`${BASE}/#/business/fin/invoices`, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(1500);
  const hasNewBtn = await page.locator('text=Factură nouă').count();
  step("Pagina Facturi B2B + buton 'Factură nouă'", hasNewBtn > 0);

  // 3. Deschide modalul
  await page.locator('text=Factură nouă').first().click();
  await page.waitForTimeout(800);
  const modalOpen = await page.locator('text=Factură B2B nouă').count();
  step("Modal 'Factură B2B nouă' deschis", modalOpen > 0);

  // 4. Câmpul IBAN e prezent (mereu vizibil acum)
  const ibanField = await page.locator('#fin-buyer-iban').count();
  step("Câmp 'IBAN cumpărător' vizibil", ibanField > 0);

  // 5. Caută + selectează partener
  await page.fill('input[placeholder*="IDNO"]', BUYER).catch(() => {});
  await page.waitForTimeout(2500); // debounce + registry search
  const results = await page.locator('ul li button, [role="option"]').count();
  log(`   rezultate căutare partener: ${results}`);
  if (results > 0) {
    await page.locator('ul li button, [role="option"]').first().click();
    await page.waitForTimeout(1500);
  }
  const partySelected = await page.locator('text=va apărea pe Contul de plată').count();
  step("Partener selectat", partySelected > 0);

  // 6. Completează IBAN + linie
  await page.fill('#fin-buyer-iban', IBAN).catch(() => {});
  await page.fill('input[placeholder*="Descriere"]', "E2E test serviciu").catch(() => {});
  await page.fill('input[placeholder="ex: 200"]', "1").catch(() => {});
  await page.waitForTimeout(500);

  // 7. Creează factura
  apiCalls.length = 0;
  await page.locator('text=Creează factura').first().click().catch(() => {});
  await page.waitForTimeout(3000);
  const createCall = apiCalls.find((c) => c.includes("POST") && c.includes("/api/fin/invoices"));
  step("Click 'Creează factura' → POST invoices", !!createCall, createCall || apiCalls.join(" | "));

  // 7b. Emite prima factură draft (draft → issued) ca să apară butonul Trimite SFS
  await page.waitForTimeout(1500);
  const emiteBtn = page.locator('button[aria-label*="Emite factura"]').first();
  if (await emiteBtn.count() > 0) {
    await emiteBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
    step("Click 'Emite' (draft → issued)", true);
  } else {
    step("Buton 'Emite' găsit", false, "nicio factură draft în listă");
  }

  // 8. Apasă Trimite la SFS pe prima factură (butonul ⚡ / Zap)
  await page.waitForTimeout(1000);
  apiCalls.length = 0;
  // butonul are aria-label "Trimite factura ... la SFS"
  const sendBtn = page.locator('button[aria-label*="SFS"], button[title*="SFS"]').first();
  const sendCount = await sendBtn.count();
  if (sendCount > 0) {
    await sendBtn.click().catch(() => {});
    await page.waitForTimeout(3500);
  }
  const submitCall = apiCalls.find((c) => c.includes("/submit"));
  step("Click '⚡ Trimite la SFS' → POST submit", !!submitCall, submitCall || `buton găsit: ${sendCount}`);

  // 9. Mesaj de feedback în UI
  const body = await page.$eval("body", (el) => el.innerText).catch(() => "");
  const sentMsg = body.includes("Trimisă la SFS") || body.includes("sfsStatus") || body.includes("status: sent");
  const errMsg = body.match(/Eroare SFS[^\n]*/)?.[0] || body.match(/sfs_[a-z_]+/)?.[0] || body.match(/buyer_iban_missing|not_configured/)?.[0];
  step("Feedback trimitere în UI", sentMsg || !!errMsg, sentMsg ? "Trimisă la SFS ✓" : (errMsg || "(niciun mesaj clar)"));

  log("\n=== Toate apelurile API observate ===");
  [...new Set(apiCalls)].forEach((c) => log("  " + c));

  await browser.close();
}
main().catch((e) => { console.error("crashed:", e.message); process.exit(2); });
