#!/usr/bin/env node
/**
 * NAV-01..06 — reorganizarea FinDesk, verificată în browser real.
 *
 *   E2E_PORT=3163 node scripts/e2e-findesk-nav.mjs          # server local deja pornit, cu dist/
 *   BASE_URL=https://… node scripts/e2e-findesk-nav.mjs      # preview / prod
 *   SHOTS=/cale node scripts/e2e-findesk-nav.mjs             # + capturi de ecran per rută
 *
 * Fiecare rută: URL-ul final e cel cerut (o redirecționare la login NU e verde), fără erori JS,
 * iar textele care dovedesc schimbarea sunt pe ecran. Plus acțiunea, nu doar controlul: „Factură
 * nouă" de pe ecranul de start chiar deschide formularul (§3.5.1quater).
 */
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? "3131"}`).replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL ?? "admin@atic.demo.io";
const PW = process.env.E2E_PASSWORD ?? "demo123456";
const SHOTS = process.env.SHOTS;
const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean).find((p) => existsSync(p));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Rute + ce trebuie să fie pe ecran (în <main> sau în meniu). */
const ROUTES = [
  { path: "/business/fin/", main: ["De făcut acum", "Fiscal & conformitate"], nav: ["Facturare", "Fiscal & conformitate", "Toate modulele|Înapoi la module"], mainAbsent: ["În curând"] },
  { path: "/business/fin/calendar", nav: ["Calendar fiscal", "Rezidenți IT Park|Salarizare"] },
  { path: "/business/fin/invoices", main: ["Cont de plată", "e-Factura SFS"], single: "Facturi" },
  { path: "/business/fin/einvoices", main: ["Cont de plată", "e-Factura SFS"], single: "Facturi" },
  { path: "/business/fin/invoices/document", main: ["e-Factura SFS"], single: "Facturi" },
  { path: "/business/fin/statement", main: ["Încarcă extras", "Istoric extrase"] },
  { path: "/business/fin/statement/upload", main: ["Încarcă extras", "Istoric extrase"] },
  { path: "/business/crm/contracte", nav: ["Contracte & facturare", "Pipeline"] },
  { path: "/business/crm/facturi", main: ["e-Factura SFS"], nav: ["Contracte & facturare", "Pipeline"] },
  { path: "/business/crm/facturi/efactura", main: ["e-Factura SFS"], nav: ["Pipeline"] },
  { path: "/business/dashboard", mainAbsent: ["Disponibil în FinDesk"] },
];

async function main() {
  if (!CHROME) throw new Error("Chrome lipsă — setează CHROME_PATH");
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await ctx.request.post(`${BASE}/api/business/auth/login`, { data: { email: EMAIL, password: PW } });
  check(`login ${EMAIL}`, login.status() === 200, `status ${login.status()}`);
  if (login.status() !== 200) return finish(browser);

  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  for (const r of ROUTES) {
    errors.length = 0;
    await page.goto(`${BASE}/#${r.path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const finalPath = new URL(page.url()).hash.slice(1);
    const onRoute = finalPath === r.path;
    const main = (await page.locator("main").innerText().catch(() => "")) ?? "";
    const nav = (await page.locator('aside[aria-label="Navigare Business Suite"]').first().innerText().catch(() => "")) ?? "";
    // Titlurile de grupă sunt `uppercase` din CSS, iar innerText întoarce textul afișat.
    const has = (hay, needle) => hay.toLowerCase().includes(needle.toLowerCase());
    const missing = [
      ...(r.main ?? []).filter((t) => !t.split("|").some((alt) => has(main, alt))).map((t) => `main:${t}`),
      ...(r.nav ?? []).filter((t) => !t.split("|").some((alt) => has(nav, alt))).map((t) => `meniu:${t}`),
      ...(r.mainAbsent ?? []).filter((t) => has(main, t)).map((t) => `nu trebuia:${t}`),
    ];
    // Un singur titlu de pagină — paginile Facturi / e-Factura aveau două <h1>.
    const h1s = await page.locator("main h1").count();
    const titleOk = !r.single || (h1s === 1 && (await page.locator("main h1").first().innerText()).trim() === r.single);
    check(
      r.path,
      onRoute && missing.length === 0 && errors.length === 0 && titleOk,
      [!onRoute && `a ajuns la ${finalPath}`, missing.length && missing.join(", "), errors.length && `JS: ${errors[0]}`, !titleOk && `${h1s} titluri h1`]
        .filter(Boolean)
        .join(" · "),
    );
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${r.path.replace(/\W+/g, "_")}.png`), fullPage: true });
  }

  // NAV-07: fiecare rând din harta FinDesk deschide o pagină cu UN titlu, identic cu eticheta din
  // meniu. 11 pagini aveau două <h1> (shell + propriul antet) sau un nume diferit de meniu.
  const mapSrc = readFileSync(new URL("../src/lib/fin/finNav.ts", import.meta.url), "utf-8");
  const mapRows = [...mapSrc.matchAll(/label: "([^"]+)",\s*href: "(\/business\/fin\/[^"]+)"/g)]
    .map((m) => ({ label: m[1], href: m[2] }))
    // Ecranul de start poartă numele firmei, nu „Acasă FinDesk".
    .filter((r) => r.href !== "/business/fin/");
  for (const row of mapRows) {
    errors.length = 0;
    await page.goto(`${BASE}/#${row.href}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const h1 = (await page.locator("main h1").allInnerTexts()).map((t) => t.trim());
    const ok = h1.length === 1 && h1[0] === row.label && errors.length === 0;
    check(`titlu = meniu: ${row.label}`, ok, ok ? "" : `h1=${JSON.stringify(h1)}${errors.length ? ` JS: ${errors[0]}` : ""}`);
  }

  // NAV-08: IT Park, cap-coadă — un dosar real, apoi fișa și fiecare sub-pagină. Înainte, orice rută
  // IT Park rămânea pe spinner (fișa nu găsea id-ul) și sub-paginile nu erau rutate deloc.
  const resident = `E2E Rezident ${Date.now()}`;
  const created = await ctx.request.post(`${BASE}/api/itpark/engagements`, {
    data: { residentName: resident, idno: "1003600000000", vatPayer: false, periodStart: "2026-01-01", periodEnd: "2026-12-31", reportingYear: 2026 },
  });
  const engagement = created.ok() ? await created.json() : null;
  const engId = engagement?.id ?? engagement?.data?.id ?? engagement?.engagement?.id;
  check("IT Park: dosar creat prin API", !!engId, `status ${created.status()}`);
  if (engId) {
    const pages = [
      { path: `/business/fin/itpark/${engId}`, title: resident },
      { path: `/business/fin/itpark`, title: "Rezidenți IT Park", contains: resident },
      { path: `/business/fin/itpark/new`, title: "Dosar IT Park nou" },
      { path: `/business/fin/itpark/dashboard`, title: "Conformitate IT Park" },
      ...["anexa2", "anexa3", "anexa4", "scrisori", "ready", "declaratie"].map((sub) => ({ path: `/business/fin/itpark/${engId}/${sub}` })),
    ];
    for (const pg of pages) {
      errors.length = 0;
      await page.goto(`${BASE}/#${pg.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      const finalPath = new URL(page.url()).hash.slice(1);
      const main = await page.locator("main").innerText().catch(() => "");
      const h1 = (await page.locator("main h1").allInnerTexts()).map((t) => t.trim());
      const problems = [
        finalPath !== pg.path && `a ajuns la ${finalPath}`,
        h1.length !== 1 && `${h1.length} titluri h1 ${JSON.stringify(h1)}`,
        pg.title && h1[0] !== pg.title && `titlu „${h1[0]}”`,
        pg.contains && !main.includes(pg.contains) && `lipsește „${pg.contains}”`,
        /Eroare la încărcare|nu a fost găsit/i.test(main) && "eroare pe ecran",
        (await page.locator('[role="status"].animate-spin, [aria-busy="true"]').count()) > 0 && "încă pe spinner",
        errors.length && `JS: ${errors[0]}`,
      ].filter(Boolean);
      check(`IT Park ${pg.path.replace(engId, ":id")}`, problems.length === 0, problems.join(" · "));
    }
    await ctx.request.delete(`${BASE}/api/itpark/engagements/${engId}`);
  }

  // Acțiunea, nu doar butonul: „Factură nouă" de pe ecranul de start deschide formularul.
  await page.goto(`${BASE}/#/business/fin/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Factură nouă" }).first().click();
  await page.waitForTimeout(800);
  const dialogOpen = await page.getByRole("dialog").count();
  check("„Factură nouă” de pe ecranul de start deschide formularul", dialogOpen > 0, `url ${new URL(page.url()).hash}`);

  // Pe telefon, filele de jos din FinDesk.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/#/business/fin/calendar`, { waitUntil: "domcontentloaded" });
  const mobile = await page.locator('nav[aria-label="Navigare mobilă Business Suite"]').innerText();
  check("mobil: filele FinDesk (Facturi, Termene)", mobile.includes("Facturi") && mobile.includes("Termene"));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "mobile_fin_calendar.png") });

  return finish(browser);
}

async function finish(browser) {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} verzi`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
