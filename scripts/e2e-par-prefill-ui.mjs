/**
 * Real-browser check of the PAR AI-prefill flow, end to end:
 * log in → open the "PAR nou" form → upload a real contract PDF into the actual file input →
 * read back what the FORM shows.
 *
 * Exists because the 2026-08-25 report was about what the form displayed, not about the API
 * payload — and the two are only the same if the UI wires every field through. Run against a
 * server started from this worktree:
 *
 *   PORT=3137 npm run server:dev
 *   BASE=http://localhost:3137 DOC=/path/to/contract.pdf node scripts/e2e-par-prefill-ui.mjs
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE || "http://localhost:3137";
const DOC = process.env.DOC;
const EMAIL = process.env.EMAIL || "admin@atic.demo.io";
const PASSWORD = process.env.PASSWORD || "demo123456";

if (!DOC) {
  console.error("DOC=<path to a contract pdf> is required");
  process.exit(2);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

const val = async (label) => {
  const el = page.locator(`label:has-text("${label}")`).first();
  const id = await el.getAttribute("for").catch(() => null);
  if (id) return page.inputValue(`[id="${id}"]`).catch(() => null);
  return el.locator("xpath=following::input[1]").inputValue().catch(() => null);
};

try {
  await page.goto(`${BASE}/#/business/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/#/business/par/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // The AI upload block only mounts after picking the "Din document (AI)" payee method.
  await page.getByRole("button", { name: /Din document \(AI\)/i }).click();
  await page.waitForTimeout(800);

  const fileInput = page.locator('input[type="file"][aria-label="Alege document pentru analiză AI"]');
  await fileInput.waitFor({ state: "attached", timeout: 15000 });
  await fileInput.setInputFiles(DOC);

  // Wait for the prefill round-trip to land in the form.
  await page.waitForFunction(
    () => !!document.querySelector('input[value*="MD"], input[value*="md"]'),
    null,
    { timeout: 45000 },
  ).catch(() => {});
  await page.waitForTimeout(3000);

  const partyCards = await page
    .locator('text=/Am găsit \\d+ părți în document/')
    .first()
    .textContent()
    .catch(() => null);

  const fields = {
    "Denumire companie": await val("Denumire companie"),
    IDNO: await val("IDNO"),
    IBAN: await val("IBAN"),
    Bancă: await val("Bancă"),
    "BIC / SWIFT": await val("BIC / SWIFT"),
    "Administrator / reprezentant": await val("Administrator / reprezentant"),
    "Adresă juridică": await val("Adresă juridică"),
  };

  console.log("părți găsite :", partyCards ?? "(banner absent — o singură parte propusă)");
  for (const [k, v] of Object.entries(fields)) console.log(`${k.padEnd(28)}: ${JSON.stringify(v)}`);
  if (errors.length) console.log("JS ERRORS:", errors);

  const bad = [];
  if ((fields["Bancă"] ?? "").startsWith("iciar")) bad.push("Bancă still starts with 'iciar'");
  if (/^(Președintelui|Presedintelui|Administratorului)/.test(fields["Administrator / reprezentant"] ?? ""))
    bad.push("Administrator still carries the role noun");
  if (/Am găsit ([3-9]|\d\d)/.test(partyCards ?? "")) bad.push("more than 2 parties proposed");
  if (errors.length) bad.push(...errors);

  console.log(bad.length ? `\n❌ ${bad.join(" · ")}` : "\n✅ formularul e completat corect");
  process.exitCode = bad.length ? 1 : 0;
} finally {
  await browser.close();
}
