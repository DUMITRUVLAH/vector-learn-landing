// PAR UX regression suite — exercises the CONTROLS on every PAR screen: types
// into filters, flips tabs, ticks checkboxes, opens the bulk dialog, advances
// the wizard, tabs to a checkbox — and asserts the app actually reacts.
//
// Why this exists (CLAUDE.md §3.5.1quater): the HR365 conversion swapped every
// hand-rolled control for a DS primitive. Screenshots proved they RENDER; they
// could not prove they still WORK. This suite caught two things they missed:
// a checkbox whose focus ring was invisible to keyboard users, and the
// notification bell sitting inside <main> (so "first control in main" resolved
// to the bell instead of the page content).
//
// Usage: node scripts/e2e-par-ux.mjs   (needs a seeded local server on :3000)
import { chromium, request } from "playwright-core";

const BASE = "http://localhost:3000";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const U = { admin: "admin@atic.demo.io", approver: "approver@atic.demo.io", finance: "finance@atic.demo.io" };
const OUT = process.env.OUT ?? ".";

let pass = 0; const fails = [];
async function T(name, fn) {
  try { await fn(); pass++; console.log(`✅ ${name}`); }
  catch (e) { fails.push(`${name} — ${e.message}`); console.log(`❌ ${name} — ${e.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const api = await request.newContext({ baseURL: BASE });
await api.post("/api/auth/login", { data: { email: U.admin, password: "demo123456" } });
const detailId = (await (await api.get("/api/par?limit=5")).json()).requests?.[0]?.id;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(e.message));

async function login(role) {
  await ctx.clearCookies();
  await page.goto(`${BASE}/#/business/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', U[role]);
  await page.fill('input[type="password"]', "demo123456");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}
const go = async (r) => { await page.goto(`${BASE}${r}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1500); };
const rowCount = () => page.locator("tbody tr").count();

await login("admin");

// ── Dashboard ───────────────────────────────────────────────────────────────
await go("/#/business/par");

await T("dashboard: căutarea filtrează efectiv lista", async () => {
  const before = await rowCount();
  assert(before > 0, "nu sunt rânduri de filtrat");
  await page.fill('input[aria-label="Caută cereri PAR după număr"]', "PAR-2026-0003");
  await page.waitForTimeout(900);
  const after = await rowCount();
  assert(after < before, `lista nu s-a îngustat: ${before} → ${after}`);
  await page.fill('input[aria-label="Caută cereri PAR după număr"]', "");
  await page.waitForTimeout(600);
});

await T("dashboard: tabul Ciorne schimbă conținutul secțiunii", async () => {
  await page.getByRole("tab", { name: "Ciorne" }).click();
  await page.waitForTimeout(900);
  assert(await page.getByText("Ciornele mele").isVisible(), "titlul secțiunii nu s-a schimbat");
  const selected = await page.getByRole("tab", { name: "Ciorne" }).getAttribute("aria-selected");
  assert(selected === "true", "tabul nu e marcat selectat");
  await page.getByRole("tab", { name: "Toate cererile" }).click();
  await page.waitForTimeout(600);
});

await T("dashboard: statusul din dropdown filtrează", async () => {
  const before = await rowCount();
  await page.selectOption('select[aria-label="Filtrează după status"]', "rejected");
  await page.waitForTimeout(900);
  const after = await rowCount();
  assert(after > 0 && after < before, `filtrul de status nu a redus lista: ${before} → ${after}`);
  await page.selectOption('select[aria-label="Filtrează după status"]', "");
  await page.waitForTimeout(600);
});

await T("dashboard: 'Mai multe filtre' deschide cele 4 câmpuri, iar suma minimă filtrează", async () => {
  await page.getByRole("button", { name: /Mai multe filtre/ }).click();
  await page.waitForTimeout(500);
  assert(await page.locator("#date-from").isVisible(), "câmpul 'De la data' nu apare");
  assert(await page.locator("#min-total").isVisible(), "câmpul 'Sumă minimă' nu apare");
  const before = await rowCount();
  await page.fill("#min-total", "50000");
  await page.waitForTimeout(900);
  const after = await rowCount();
  assert(after < before, `suma minimă nu a filtrat: ${before} → ${after}`);
  await page.fill("#min-total", "");
  await page.waitForTimeout(600);
});

await T("dashboard: click pe un rând navighează la detaliu", async () => {
  await page.locator("tbody tr").first().click();
  await page.waitForTimeout(1800);
  assert(/\/business\/par\/[0-9a-f-]{36}/.test(page.url()), `nu a navigat: ${page.url()}`);
});

// ── Detail ──────────────────────────────────────────────────────────────────
await go(`/#/business/par/${detailId}`);

await T("detaliu: caseta de comentariu acceptă text și activează Trimite", async () => {
  const ta = page.locator('textarea[aria-label="Comentariu nou"]');
  assert(await ta.isVisible(), "caseta de comentariu lipsește");
  const btn = page.locator('form:has(textarea[aria-label="Comentariu nou"]) button[type="submit"]');
  assert(await btn.isDisabled(), "Trimite ar trebui dezactivat cât timp caseta e goală");
  await ta.fill("Test de interacțiune.");
  await page.waitForTimeout(400);
  assert(!(await btn.isDisabled()), "Trimite a rămas dezactivat după ce am scris");
});

await T("detaliu: niciun UUID brut afișat ca nume de persoană", async () => {
  const body = await page.evaluate(() => document.body.innerText);
  const uuid = body.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/);
  assert(!uuid, `UUID vizibil în pagină: ${uuid?.[0]}`);
});

await T("detaliu: titlul apare o singură dată", async () => {
  const n = await page.getByRole("heading", { level: 1 }).count();
  assert(n === 1, `${n} titluri h1 pe pagină`);
});

// ── Inbox (approver) ────────────────────────────────────────────────────────
await login("approver");
await go("/#/business/par/inbox");

await T("inbox: bifarea unui rând scoate butonul de aprobare în lot", async () => {
  const cb = page.locator('input[type="checkbox"][aria-label^="Selectează PAR"]').first();
  assert(await cb.count() > 0, "niciun checkbox de rând");
  await cb.check();
  await page.waitForTimeout(600);
  assert(await cb.isChecked(), "checkbox-ul nu s-a bifat");
  assert(await page.locator('button:has-text("selectate")').first().isVisible(), "butonul de lot nu a apărut");
});

await T("inbox: dialogul de aprobare în lot se deschide, acceptă text și se închide cu Escape", async () => {
  await page.locator('button:has-text("selectate")').first().click();
  await page.waitForTimeout(700);
  const dlg = page.locator('[role="dialog"]');
  assert(await dlg.isVisible(), "dialogul nu s-a deschis");
  await page.fill("#bulk-sig", "Ana Chirita");
  await page.fill("#bulk-comment", "Aprobat în lot.");
  assert(await page.inputValue("#bulk-sig") === "Ana Chirita", "câmpul de semnătură nu reține textul");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  assert(!(await dlg.isVisible()), "Escape nu a închis dialogul");
});

await T("inbox: 'Selectează tot' bifează toate rândurile", async () => {
  await page.locator('input[type="checkbox"][aria-label="Selectează tot"]').check();
  await page.waitForTimeout(600);
  const boxes = page.locator('input[type="checkbox"][aria-label^="Selectează PAR"]');
  const n = await boxes.count();
  let checked = 0;
  for (let i = 0; i < n; i++) if (await boxes.nth(i).isChecked()) checked++;
  assert(checked === n && n > 0, `${checked}/${n} bifate`);
});

await T("inbox: checkbox-ul arată inel de focus la navigare cu tastatura", async () => {
  const cb = page.locator('input[type="checkbox"][aria-label="Selectează tot"]');
  await cb.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab"); // real keyboard focus — :focus-visible ignores .focus()
  const ring = await cb.evaluate((el) => {
    const skin = el.nextElementSibling;
    return skin ? getComputedStyle(skin).boxShadow : "none";
  });
  assert(ring && ring !== "none", "caseta nu primește inel de focus — un utilizator cu tastatura nu vede unde e");
});

await T("inbox: spațiu de la tastatură bifează checkbox-ul", async () => {
  const cb = page.locator('input[type="checkbox"][aria-label^="Selectează PAR"]').nth(1);
  await cb.focus();
  const before = await cb.isChecked();
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  assert(await cb.isChecked() !== before, "Space nu a comutat checkbox-ul");
});

await T("inbox: filtrul după beneficiar restrânge lista", async () => {
  const before = await rowCount();
  await page.fill('input[aria-label="Filtrează după beneficiar"]', "Audit");
  await page.waitForTimeout(900);
  const after = await rowCount();
  assert(after < before && after > 0, `filtrul nu a funcționat: ${before} → ${after}`);
});

// ── Finance queue ───────────────────────────────────────────────────────────
await login("finance");
await go("/#/business/par/finance");

await T("coadă finanțe: căutarea filtrează rândurile", async () => {
  const before = await rowCount();
  assert(before > 0, "coada e goală — nimic de filtrat");
  await page.fill('input[aria-label="Caută în coada finanțe"]', "Audit");
  await page.waitForTimeout(900);
  const after = await rowCount();
  assert(after < before && after > 0, `${before} → ${after}`);
  await page.fill('input[aria-label="Caută în coada finanțe"]', "");
});

// ── Reports ─────────────────────────────────────────────────────────────────
await login("admin");
await go("/#/business/par/reports");

await T("rapoarte: schimbarea tabului schimbă graficul", async () => {
  const titleBefore = await page.locator("h3").first().innerText();
  await page.getByRole("tab", { name: "Departament" }).click();
  await page.waitForTimeout(1200);
  const titleAfter = await page.locator("h3").first().innerText();
  assert(titleBefore !== titleAfter, `titlul graficului nu s-a schimbat: "${titleBefore}"`);
});

await T("rapoarte: presetul de perioadă completează datele", async () => {
  await page.getByRole("button", { name: "Luna curentă" }).click();
  await page.waitForTimeout(700);
  const from = await page.inputValue("#par-report-from");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(from), `data 'De la' nu s-a completat: "${from}"`);
});

// ── Onboarding wizard ───────────────────────────────────────────────────────
await go("/#/business/par/onboarding");

await T("onboarding: câmpurile acceptă text și 'Continuă' avansează pasul", async () => {
  await page.fill("#org-name", "Test Org SRL");
  assert(await page.inputValue("#org-name") === "Test Org SRL", "câmpul nu reține textul");
  await page.selectOption("#currency", "EUR");
  assert(await page.inputValue("#currency") === "EUR", "select-ul nu reține valoarea");
  await page.getByRole("button", { name: /Continuă/ }).click();
  await page.waitForTimeout(800);
  assert((await page.evaluate(() => document.body.innerText)).includes("Pasul 2 din 3"), "nu a avansat la pasul 2");
});

await T("onboarding: 'Înapoi' revine la pasul 1", async () => {
  await page.getByRole("button", { name: /Înapoi/ }).click();
  await page.waitForTimeout(700);
  assert((await page.evaluate(() => document.body.innerText)).includes("Pasul 1 din 3"), "nu a revenit la pasul 1");
  assert(await page.inputValue("#org-name") === "Test Org SRL", "textul introdus s-a pierdut la navigarea înapoi");
});

// ── Folders ─────────────────────────────────────────────────────────────────
await go("/#/business/par/folders");

await T("foldere: proiectul se extinde și duce la lista filtrată", async () => {
  const head = page.locator('main button[aria-expanded]').first();
  await head.click();
  await page.waitForTimeout(700);
  assert(await head.getAttribute("aria-expanded") === "true", "folderul nu s-a extins");
  const link = page.getByRole("button", { name: /Toate cererile acestui proiect/ });
  assert(await link.isVisible(), "linkul spre lista filtrată nu apare după extindere");
});

await page.screenshot({ path: `${OUT}/ux-last.png`, fullPage: true });
console.log(`\n${pass} trecute, ${fails.length} picate`);
if (jsErrors.length) console.log("erori JS:\n" + jsErrors.slice(0, 5).join("\n"));
if (fails.length) console.log("\n" + fails.join("\n"));
await browser.close();
process.exit(fails.length ? 1 : 0);
