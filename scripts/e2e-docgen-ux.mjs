/**
 * Sweep UX pentru modulul de acte.
 *
 * Nu verifică doar că paginile se deschid (aia face poarta e2e), ci PARCURGE fluxul ca un om:
 * act nou → furnizor → poziții → finalizare → PDF → dosare → șabloane. La fiecare pas face o
 * captură și adună: erori din consolă, texte de eroare vizibile, butoane fără nume accesibil.
 *
 * Rulare: node scripts/e2e-docgen-ux.mjs   (BASE=http://localhost:3141)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3141";
const EMAIL = process.env.E2E_EMAIL ?? "admin@atic.demo.io";
const PW = process.env.E2E_PASSWORD ?? "demo123456";
const OUT = process.env.OUT ?? "/tmp/docgen-ux";

fs.mkdirSync(OUT, { recursive: true });

const findings = [];
const note = (step, level, text) => {
  findings.push({ step, level, text });
  console.log(`${level === "bug" ? "🐞" : "•"} [${step}] ${text}`);
};

const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};

/** Texte care înseamnă „ceva e stricat" dacă apar pe ecran. */
const ERROR_TEXTS = [
  "Nu am putut", "nu a putut", "Eroare", "error", "undefined", "NaN", "{{", "[object Object]",
];

async function scanVisible(page, step) {
  const body = await page.evaluate(() => document.body.innerText);
  for (const t of ERROR_TEXTS) {
    if (body.includes(t)) note(step, "bug", `text suspect pe ecran: „${t}"`);
  }
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll("button")].filter(
      (b) => !b.textContent?.trim() && !b.getAttribute("aria-label")
    ).length
  );
  if (unnamed > 0) note(step, "bug", `${unnamed} buton(e) fără nume accesibil`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) note("consolă", "bug", m.text().slice(0, 160));
});
page.on("pageerror", (e) => note("consolă", "bug", `pageerror: ${e.message.slice(0, 160)}`));

try {
  // ── Autentificare ──────────────────────────────────────────────────────────
  await page.goto(`${BASE}/#/business/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  // ── Registrul de acte ──────────────────────────────────────────────────────
  await page.goto(`${BASE}/#/business/docs`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot(page, "01-registru");
  await scanVisible(page, "registru");

  // ── Act nou ────────────────────────────────────────────────────────────────
  const actNou = page.getByRole("button", { name: /Act nou|Creează primul act/ }).first();
  await actNou.click();
  await page.waitForTimeout(1500);
  await shot(page, "02-act-nou-gol");
  await scanVisible(page, "act nou");

  // Câmpurile furnizorului trebuie să existe FĂRĂ niciun click.
  for (const label of ["Denumirea furnizorului", "Cod fiscal (IDNO/IDNP)", "IBAN", "Banca"]) {
    const visible = await page.getByLabel(label, { exact: false }).first().isVisible().catch(() => false);
    if (!visible) note("act nou", "bug", `câmpul „${label}" nu e vizibil din prima`);
  }

  // ── Completare ─────────────────────────────────────────────────────────────
  await page.getByLabel("Titlul actului").fill("Act UX — servicii marketing");
  await page.getByLabel(/Denumirea furnizorului/).fill("SRL Marketing Test");
  await page.getByLabel("Cod fiscal (IDNO/IDNP)").fill("1002600012345");
  await page.getByLabel("IBAN", { exact: true }).fill("MD24AG000225100013104168");
  await page.getByLabel("Banca", { exact: true }).fill("BC Moldova-Agroindbank SA");
  await page.getByLabel("Denumirea poziției 1").fill("servicii marketing");
  await page.getByLabel("Cantitatea 1").fill("1");
  await page.getByLabel("Prețul unitar 1").fill("2000");
  await page.waitForTimeout(2200); // auto-save
  await shot(page, "03-act-completat");
  await scanVisible(page, "act completat");

  // Aritmetica de pe ecran: 1 × 2.000 trebuie să dea 2.000,00, nu 2,00. (Bug prins de sweep:
  // prețul reformatat românește era recitit ca 2 lei.)
  const totalText = await page.locator("text=/Total:/").first().innerText();
  if (!/2\.000,00/.test(totalText)) {
    note("act completat", "bug", `totalul e greșit: „${totalText.trim()}" (aștept 2.000,00)`);
  }

  // Și după re-deschiderea actului salvat — acolo se rupea round-trip-ul.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const totalAfterReload = await page.locator("text=/Total:/").first().innerText();
  if (!/2\.000,00/.test(totalAfterReload)) {
    note("re-deschidere", "bug", `după re-deschidere totalul e „${totalAfterReload.trim()}"`);
  }
  await shot(page, "03b-act-redeschis");

  // ── Finalizare ─────────────────────────────────────────────────────────────
  const finalizeBtn = page.getByRole("button", { name: /Finalizează/ });
  if (await finalizeBtn.isEnabled()) {
    await finalizeBtn.click();
    await page.waitForTimeout(2500);
  } else {
    note("finalizare", "bug", "butonul Finalizează e dezactivat după completare");
  }
  await shot(page, "04-dupa-finalizare");
  await scanVisible(page, "după finalizare");

  // ── Actul finalizat, din listă ─────────────────────────────────────────────
  await page.goto(`${BASE}/#/business/docs`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const firstRow = page.locator("table tbody tr").first();
  if (await firstRow.count()) {
    await firstRow.click();
    await page.waitForTimeout(1800);
    await shot(page, "05-act-finalizat");
    await scanVisible(page, "act finalizat");

    for (const name of [/Descarcă PDF/, /Transformă în cerere de plată/, /Trimite pe email/]) {
      const exists = await page.getByRole("button", { name }).count();
      if (!exists) note("act finalizat", "bug", `lipsește acțiunea ${name}`);
    }
  }

  // ── Șabloane ───────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/#/business/docs/templates`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, "06-sabloane");
  await scanVisible(page, "șabloane");

  // ── Dosarul contrapărții (link direct din act) ─────────────────────────────
  await page.goto(`${BASE}/#/business/docs?kind=act_primire_predare`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot(page, "07-filtre");
  await scanVisible(page, "filtre");
} finally {
  const bugs = findings.filter((f) => f.level === "bug");
  console.log(`\n═══ Sweep UX: ${bugs.length} probleme, capturi în ${OUT} ═══`);
  fs.writeFileSync(path.join(OUT, "findings.json"), JSON.stringify(findings, null, 2));
  await browser.close();
}
