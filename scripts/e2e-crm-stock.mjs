// E2E pentru stocul produselor din CRM — aplicația REALĂ, server real, browser real.
// Cererea ownerului: „stocul să fie friendly: apeși plus sau minus și câte vrei să schimbi,
// vezi câte sunt pe stoc, cu roșu când ai puține".
//
// Rulare:
//   PORT=3241 npx tsx server/index.ts &      (serverul servește și dist/, deci `vite build` înainte)
//   BASE=http://localhost:3241 node scripts/e2e-crm-stock.mjs
//
// Nu verifică doar că dialogul se deschide: APASĂ butoanele și confirmă în API că stocul chiar
// s-a mișcat (§3.5.1quater — testează acțiunea, nu butonul).

import { createRequire } from "node:module";
let chromium;
for (const base of [process.cwd(), "/Users/dima/vector-learn-landing"]) {
  try {
    ({ chromium } = createRequire(base + "/package.json")("playwright-core"));
    break;
  } catch { /* încearcă următorul */ }
}
if (!chromium) { console.error("playwright-core lipsește"); process.exit(2); }

const BASE = process.env.BASE || "http://localhost:3241";
const EMAIL = process.env.E2E_EMAIL || "admin@atic.demo.io";
const PASSWORD = process.env.E2E_PASSWORD || "demo123456";
const SHOTS = process.env.SHOTS_DIR || "";

let pass = 0;
const fails = [];
const ok = (n) => { pass++; console.log(`  ✓ ${n}`); };
const bad = (n, d) => { fails.push(`${n}${d ? " — " + d : ""}`); console.log(`  ✗ ${n}${d ? " — " + d : ""}`); };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

// Produs cu 18 buc și limită 5 — ca în captura ownerului.
const name = `Ficat de cod E2E ${Date.now()}`;
const created = await ctx.request.post(`${BASE}/api/crm/products`, {
  data: { name, sku: `STK-${Date.now()}`, listPriceCents: 5000, currency: "MDL", unit: "buc" },
});
const productId = (await created.json()).id;
const enabled = await ctx.request.post(`${BASE}/api/crm/products/${productId}/stock/enable`, {
  data: { initialQty: 18, unitCostCents: 2000, minQtyAlert: 5 },
});
if (enabled.status() === 201) ok("produs cu stoc 18 și limită 5 creat prin API");
else bad("pornirea stocului", `HTTP ${enabled.status()}`);

async function stocApi() {
  const res = await ctx.request.get(`${BASE}/api/crm/products`);
  return (await res.json()).items.find((p) => p.id === productId);
}

await page.goto(`${BASE}/#/business/crm/produse`);
const cell = page.getByRole("button", { name: new RegExp(`Stoc ${name}: 18 buc\\. Modifică`) });
await cell.waitFor({ timeout: 20000 });
ok("tabelul arată stocul 18 ca buton");

await cell.click();
await page.getByRole("dialog").waitFor();
if (SHOTS) await page.screenshot({ path: `${SHOTS}/stock-dialog-in.png` });

// Scot 14: 18 → 4, sub limita 5 → trebuie să apară „stoc scăzut".
await page.getByRole("button", { name: "Scot din stoc" }).click();
await page.getByLabel("Câte scoți").fill("13");
await page.getByRole("button", { name: "Cantitatea: crește cu 1" }).click();
const dialogText = await page.getByRole("dialog").innerText();
if (/După\s*4\s*stoc scăzut/.test(dialogText)) ok("previzualizarea arată 4 și „stoc scăzut” înainte de salvare");
else bad("previzualizarea", dialogText.replace(/\s+/g, " ").slice(0, 200));

await page.getByRole("button", { name: "Inventar în minus" }).click();
if (SHOTS) await page.screenshot({ path: `${SHOTS}/stock-dialog-out.png` });
await page.getByRole("button", { name: "Scoate 14 buc" }).click();
await page.getByRole("dialog").waitFor({ state: "detached" });

const after = await stocApi();
if (after.qtyOnHand === 4 && after.lowStock) ok("API-ul confirmă: 4 buc, lowStock=true");
else bad("stocul după ieșire", JSON.stringify({ qty: after.qtyOnHand, low: after.lowStock }));

const lowCell = page.getByRole("button", { name: new RegExp(`Stoc ${name}: 4 buc, stoc scăzut`) });
await lowCell.waitFor({ timeout: 10000 });
if ((await lowCell.getAttribute("class")).includes("text-destructive")) ok("celula din tabel e roșie");
else bad("celula roșie");
if (await page.getByText(/stoc scăzut$/).first().isVisible()) ok("bannerul „stoc scăzut” apare deasupra tabelului");
else bad("bannerul de stoc scăzut");
if (SHOTS) await page.screenshot({ path: `${SHOTS}/stock-table-low.png` });

// Mai mult decât e pe stoc: butonul rămâne blocat.
await lowCell.click();
await page.getByRole("button", { name: "Scot din stoc" }).click();
await page.getByRole("button", { name: "10 buc" }).click();
if (await page.getByRole("button", { name: "Scoate 10 buc" }).isDisabled()) ok("nu lasă să scoți 10 când ai 4");
else bad("blocarea ieșirii peste stoc");

// Doar limita: 5 → 3, fără mișcare de stoc.
await page.getByRole("button", { name: "Cantitatea: scade cu 1" }).click({ clickCount: 1 });
await page.getByLabel("Câte scoți").fill("0");
await page.getByLabel("Roșu când rămân cel mult").fill("3");
await page.getByRole("button", { name: "Salvează limita" }).click();
await page.getByRole("dialog").waitFor({ state: "detached" });
const afterLimit = await stocApi();
if (afterLimit.minQtyAlert === 3 && afterLimit.qtyOnHand === 4 && !afterLimit.lowStock)
  ok("limita mutată la 3 fără să atingă cantitatea; produsul nu mai e roșu");
else bad("limita", JSON.stringify(afterLimit));

if (pageErrors.length) bad("erori JS în pagină", pageErrors.join(" | "));
else ok("nicio eroare JS în pagină");

await browser.close();
console.log(`\n${pass} ok, ${fails.length} eșuate`);
process.exit(fails.length ? 1 : 0);
