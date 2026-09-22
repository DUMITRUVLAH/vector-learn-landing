/**
 * E2E PONTAJ — fluxul întreg, pe aplicația reală: modul oprit → aprins din consolă → setări →
 * concediu pe interval → corecție de zi → formular tipărit → PDF.
 *
 * Rulează pe stack-ul local (API 3000 + Vite 5173, PGlite). Nu atinge producția.
 *   node scripts/e2e-pontaj-flow.mjs
 */
import { chromium, request as pwRequest } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const WEB = process.env.E2E_WEB ?? "http://localhost:5173";
const OUT = process.env.E2E_OUT ?? "/tmp/pontaj-e2e";
const PASSWORD = "demo123456";
const ADMIN = "admin@atic.demo.io";      // superadmin de platformă (din seed)
const ANGAJAT = "requestor@atic.demo.io"; // angajat obișnuit — Sirbu Cristina

mkdirSync(OUT, { recursive: true });

let steps = 0;
let ok = 0;
const fails = [];
function check(name, pass, detail = "") {
  steps++;
  if (pass) { ok++; console.log(`  ✅ ${name}`); }
  else { fails.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function apiLogin(email) {
  const ctx = await pwRequest.newContext({ baseURL: WEB });
  const res = await ctx.post("/api/business/auth/login", { data: { email, password: PASSWORD } });
  if (!res.ok()) throw new Error(`login ${email} → ${res.status()} ${await res.text()}`);
  return ctx;
}

/** Luna de test: martie 2026 — are 8 martie duminică+sărbătoare, un caz bun de suprapunere. */
const MONTH = "2026-03";

const summary = {};

// ═══ FAZA 0 — modulul e OPRIT implicit ═══════════════════════════════════════
console.log("\n▶ FAZA 0 — modulul oprit implicit");
const angajat = await apiLogin(ANGAJAT);
{
  const res = await angajat.get(`/api/pontaj/month?month=${MONTH}`);
  const body = await res.json().catch(() => ({}));
  check("angajatul primește 403 module_disabled cât timp modulul e stins",
    res.status() === 403 && body.error === "module_disabled", `${res.status()} ${JSON.stringify(body)}`);
}

// ═══ FAZA 1 — proprietarul aprinde modulul pentru organizație ════════════════
console.log("\n▶ FAZA 1 — toggle din Consola Platformă");
const admin = await apiLogin(ADMIN);
let tenantId = null;
{
  const res = await admin.get("/api/platform/workspaces");
  const body = await res.json();
  const list = body.workspaces ?? body.items ?? body.rows ?? [];
  const atic = list.find((w) => (w.slug ?? "").includes("atic") || (w.name ?? "").includes("ATIC"));
  tenantId = atic?.id ?? atic?.tenantId ?? null;
  check("consola listează workspace-ul ATIC", !!tenantId, JSON.stringify(Object.keys(body)));
  check("modulul pontaj apare în catalog, stins",
    atic?.modules?.pontaj === false, JSON.stringify(atic?.modules ?? {}));
}
{
  const res = await admin.put(`/api/platform/workspaces/${tenantId}/modules`, {
    data: { module: "pontaj", enabled: true },
  });
  check("comutatorul pornește modulul", res.ok(), `${res.status()} ${await res.text()}`);
}
{
  const res = await angajat.get(`/api/pontaj/month?month=${MONTH}`);
  check("angajatul primește acum luna", res.status() === 200, String(res.status()));
}

// ═══ FAZA 2 — administratorul configurează organizația ═══════════════════════
console.log("\n▶ FAZA 2 — setările organizației");
{
  const res = await admin.put("/api/pontaj/org", {
    data: {
      country: "MD",
      unitName: "Asociația pentru Tehnologie și Internet din Moldova",
      subdivisionName: "Direcția proiecte",
    },
  });
  check("unitatea și subdiviziunea se salvează", res.ok(), String(res.status()));
}
{
  const res = await admin.post("/api/pontaj/holidays", {
    data: { date: "2026-03-18", name: "Hramul orașului Chișinău" },
  });
  check("ziua de Hram se adaugă ca zi nelucrătoare", res.status() === 201, String(res.status()));
}

// ═══ FAZA 3 — angajatul lucrează în tabel, prin INTERFAȚĂ ════════════════════
console.log("\n▶ FAZA 3 — angajatul, în interfață");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
// Refolosim sesiunea angajatului: cookie-ul e pe localhost, deci merge și pe 5173.
await ctx.addCookies((await angajat.storageState()).cookies);
const page = await ctx.newPage();
const consoleErrors = [];
const badRequests = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));
// `/api/platform/catalog` e SONDA prin care shell-ul află dacă ești superadmin: 403 = „nu ești".
// E comportament vechi, de pe main, nu o cerere picată — vezi BusinessShell.tsx.
page.on("response", (r) => {
  if (r.status() >= 400 && !r.url().includes("/api/platform/catalog")) {
    badRequests.push(`${r.status()} ${r.url().replace(WEB, "")}`);
  }
});

await page.goto(`${WEB}/#/business/pontaj`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Navigăm la luna de test din bara de lună.
{
  const shown = await page.locator("text=/^(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie) \\d{4}$/").first().textContent();
  summary.lunaInitiala = shown?.trim();
  // Mergem înapoi/înainte până ajungem la martie 2026.
  for (let i = 0; i < 24; i++) {
    const cur = (await page.locator("text=/^(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie) \\d{4}$/").first().textContent())?.trim();
    if (cur === "martie 2026") break;
    const target = new Date("2026-03-01").getTime();
    const [mn, yr] = (cur ?? "").split(" ");
    const idx = ["ianuarie","februarie","martie","aprilie","mai","iunie","iulie","august","septembrie","octombrie","noiembrie","decembrie"].indexOf(mn);
    const curTime = new Date(Number(yr), idx, 1).getTime();
    await page.getByRole("button", { name: curTime > target ? "Luna precedentă" : "Luna următoare" }).click();
    await page.waitForTimeout(450);
  }
  const final = (await page.locator("text=/^martie 2026$/").first().textContent())?.trim();
  check("bara de lună ajunge la martie 2026", final === "martie 2026", String(final));
}

check("pagina s-a încărcat fără cereri respinse", badRequests.length === 0, badRequests.slice(0, 4).join(" | "));
check("pagina s-a încărcat fără erori JS", consoleErrors.filter((e) => !/Failed to load resource/.test(e)).length === 0,
  consoleErrors.slice(0, 2).join(" | "));

// Numele omului pe tabel
{
  const desc = await page.locator("text=/Sirbu Cristina/").first().count();
  check("angajatul își vede numele pe pontaj", desc > 0);
}

// 3a. Setările proprii: funcția + norma
await page.getByRole("button", { name: /Setări/ }).click();
await page.waitForTimeout(400);
await page.locator("#pontaj-job").fill("consultant proiecte");
await page.locator("#pontaj-norm").fill("7");
await page.getByRole("button", { name: /^Salvează$/ }).click();
await page.waitForTimeout(900);
{
  const body = await (await angajat.get(`/api/pontaj/settings`)).json();
  check("norma proprie salvată din interfață (7 ore = 420 min)", body.profile?.dailyMinutes === 420, JSON.stringify(body.profile));
  check("funcția salvată din interfață", body.profile?.jobTitle === "consultant proiecte", String(body.profile?.jobTitle));
}

// 3b. Concediu pe interval
await page.getByRole("button", { name: /Adaugă concediu/ }).click();
await page.waitForTimeout(400);
await page.locator("#pontaj-leave-start").fill("2026-03-09");
await page.locator("#pontaj-leave-end").fill("2026-03-20");
await page.locator("#pontaj-leave-note").fill("cerere nr. 7");
await page.getByRole("button", { name: /Înregistrează/ }).click();
await page.waitForTimeout(1200);
{
  const notice = await page.locator("text=/zile calendaristice/").first().textContent().catch(() => null);
  summary.mesajConcediu = notice?.trim();
  check("interfața confirmă intervalul cu zile calendaristice și lucrătoare", !!notice && /12 zile calendaristice/.test(notice), String(notice));
}

// 3c. Corecția unei zile, din grilă: click pe celula de 4 martie → popover
{
  await page.getByLabel(/^4 mar —/).click();
  await page.waitForTimeout(400);
  const popTitle = await page.locator('[role="dialog"]').first().textContent();
  check("popover-ul celulei poartă numele și ziua", /Sirbu Cristina/.test(popTitle ?? "") && /4 mar/.test(popTitle ?? ""), String(popTitle).slice(0, 60));
  await page.locator("#pontaj-day-hours").fill("6");
  await page.locator("#pontaj-day-note").fill("plecat mai devreme");
  await page.getByRole("button", { name: /^Salvează$/ }).click();
  await page.waitForTimeout(1000);
}

// 3d. Zi lucrată în weekend: 7 martie (sâmbătă) — schimbăm simbolul din popover
{
  await page.getByLabel(/^7 mar —/).click();
  await page.waitForTimeout(400);
  await page.locator("#pontaj-day-symbol").selectOption("P");
  await page.waitForTimeout(200);
  await page.locator("#pontaj-day-hours").fill("4");
  await page.getByRole("button", { name: /^Salvează$/ }).click();
  await page.waitForTimeout(1000);
}

// 3e. Grila arată corecția manuală cu contur violet
{
  const cls = await page.getByLabel(/^4 mar —/).getAttribute("class");
  check("celula corectată manual are conturul violet", /outline-indigo/.test(cls ?? ""), String(cls).slice(0, 80));
}

await page.screenshot({ path: `${OUT}/01-tabel.png`, fullPage: true });

// Starea finală, citită de la server (sursa de adevăr a ce va intra pe hârtie)
const month = await (await angajat.get(`/api/pontaj/month?month=${MONTH}`)).json();
summary.luna = month.month;
summary.totals = month.totals;
const byDate = Object.fromEntries(month.days.map((d) => [d.date, d]));
check("4 martie: corecția manuală (6 ore)", byDate["2026-03-04"]?.minutes === 360 && byDate["2026-03-04"]?.source === "manual", JSON.stringify(byDate["2026-03-04"]));
check("7 martie: sâmbătă lucrată, 4 ore", byDate["2026-03-07"]?.symbol === "P" && byDate["2026-03-07"]?.minutes === 240, JSON.stringify(byDate["2026-03-07"]));
check("8 martie: sărbătoare, nu repaus", byDate["2026-03-08"]?.symbol === "Sn", JSON.stringify(byDate["2026-03-08"]));
check("9–20 martie: concediu pe tot intervalul", month.days.filter((d) => d.symbol === "C").length === 12, String(month.days.filter((d) => d.symbol === "C").length));
check("18 martie (Hram) e în interiorul concediului — concediul rămâne simbolul zilei", byDate["2026-03-18"]?.symbol === "C", JSON.stringify(byDate["2026-03-18"]));
check("17 martie NU e ajun scurtat: e deja concediu", byDate["2026-03-17"]?.symbol === "C");
check("norma de 7 ore se aplică zilelor normale", byDate["2026-03-03"]?.minutes === 420, JSON.stringify(byDate["2026-03-03"]));
check("antetul poartă denumirea unității", month.org?.unitName?.includes("Tehnologie"), String(month.org?.unitName));

// ═══ FAZA 4 — formularul tipărit → PDF ═══════════════════════════════════════
console.log("\n▶ FAZA 4 — tipărire → PDF");
const [popup] = await Promise.all([
  page.waitForEvent("popup"),
  page.getByRole("button", { name: /Tipărește/ }).click(),
]);
await popup.waitForLoadState("load");
await popup.waitForTimeout(800);
const printHtml = await popup.content();
writeFileSync(`${OUT}/pontaj-formular.html`, printHtml);
check("fereastra de tipărire s-a deschis cu formularul", /TABEL DE EVIDEN/.test(printHtml));
await popup.screenshot({ path: `${OUT}/02-formular.png`, fullPage: true });

const pdf = await popup.pdf({ printBackground: true, preferCSSPageSize: true });
writeFileSync(`${OUT}/pontaj-2026-03.pdf`, pdf);
check("PDF generat", pdf.length > 5000, `${pdf.length} octeți`);
summary.pdfBytes = pdf.length;

await browser.close();
await ctx.dispose?.();

writeFileSync(`${OUT}/rezumat.json`, JSON.stringify({ summary, fails, steps, ok }, null, 2));

console.log(`\n${ok}/${steps} verificări trecute.`);
if (fails.length) { console.log("EȘECURI:"); for (const f of fails) console.log("  · " + f); }
console.log(`Artefacte în ${OUT}`);
process.exit(fails.length ? 1 : 0);
