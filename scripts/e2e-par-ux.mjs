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

const BASE = process.env.BASE_URL ?? process.env.BASE ?? "http://localhost:3000";
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

// Filtrele se verifică pe DATELE reale (nu pe un status/o sumă hardcodate care pot lipsi
// din seed), iar resetarea stă în finally — un assert picat nu mai lasă filtrul blocat
// și nu mai prăbușește în cascadă restul verificărilor de dashboard.
const allRequests = (await (await api.get("/api/par?limit=200")).json()).requests ?? [];

await T("dashboard: statusul din dropdown filtrează", async () => {
  const counts = {};
  for (const r of allRequests) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const target = Object.entries(counts).find(([, c]) => c > 0 && c < allRequests.length)?.[0];
  assert(target, "toate cererile au același status — nimic de filtrat");
  const before = await rowCount();
  try {
    await page.selectOption('select[aria-label="Filtrează după status"]', target);
    await page.waitForTimeout(900);
    const after = await rowCount();
    assert(after > 0 && after < before, `filtrul „${target}" nu a redus lista: ${before} → ${after}`);
  } finally {
    await page.selectOption('select[aria-label="Filtrează după status"]', "");
    await page.waitForTimeout(600);
  }
});

await T("dashboard: 'Mai multe filtre' deschide cele 4 câmpuri, iar suma minimă filtrează", async () => {
  await page.getByRole("button", { name: /Mai multe filtre/ }).click();
  await page.waitForTimeout(500);
  assert(await page.locator("#date-from").isVisible(), "câmpul 'De la data' nu apare");
  assert(await page.locator("#min-total").isVisible(), "câmpul 'Sumă minimă' nu apare");
  const totals = allRequests.map((r) => r.totalEstimatedCents ?? 0).sort((a, b) => a - b);
  assert(totals.length > 1 && totals[0] !== totals[totals.length - 1], "toate cererile au aceeași sumă — nimic de filtrat");
  // La mijloc între min și max: exclude garantat rândul minim, păstrează garantat maximul.
  const cut = Math.round((totals[0] + totals[totals.length - 1]) / 2 / 100);
  const before = await rowCount();
  try {
    await page.fill("#min-total", String(cut));
    await page.waitForTimeout(900);
    const after = await rowCount();
    assert(after > 0 && after < before, `suma minimă ${cut} nu a filtrat: ${before} → ${after}`);
  } finally {
    await page.fill("#min-total", "");
    await page.waitForTimeout(600);
  }
});

await T("dashboard: niciun număr de cerere nu apare de două ori pe pagină", async () => {
  // First cell is the request number; the second is the project, which repeats legitimately.
  const nums = await page.$$eval("tbody tr td:first-child", (tds) => tds.map((t) => t.innerText.trim()));
  const dupes = nums.filter((n, i) => n && nums.indexOf(n) !== i);
  assert(dupes.length === 0, `rânduri duplicate: ${[...new Set(dupes)].slice(0, 3).join(", ")}`);
});

await T("dashboard: lista e plafonată, cu link către restul", async () => {
  const rows = await rowCount();
  assert(rows <= 25, `${rows} rânduri randate dintr-o dată`);
  const more = page.getByRole("button", { name: /Arată toate cele \d+ cereri/ });
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(800);
    assert(await rowCount() > rows, "linkul nu a extins lista");
  }
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
  // Scope to the page content: the notification panel is chrome, and an open
  // panel would otherwise make this assert about a different surface.
  const main = await page.locator("main").innerText();
  const uuid = main.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/);
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

// Ordinea actuală a coloanelor din inbox: checkbox(1), Acțiuni(2), Nr.(3), Beneficiar(4), Sumă(5)
// — deciziile conduc rândul (comentariul din ParInbox.tsx). Indexurile de mai jos o urmează.
await T("inbox: suma e vizibilă fără derulare laterală", async () => {
  const cell = page.locator("tbody tr").first().locator("td").nth(4);
  const box = await cell.boundingBox();
  const vw = page.viewportSize().width;
  assert(box && box.x + box.width <= vw, `coloana Sumă începe la ${box?.x} — în afara ecranului de ${vw}px`);
  const txt = await cell.innerText();
  assert(/\d/.test(txt), `a cincea coloană nu conține o sumă: "${txt}"`);
});

await T("inbox: j/k mută cursorul pe rânduri", async () => {
  await page.locator("h1").first().click(); // focus the page, NOT the sidebar at (5,5)
  const first = await page.locator('tr[data-cursor="true"] td:nth-child(3)').innerText();
  await page.keyboard.press("j");
  await page.waitForTimeout(400);
  const second = await page.locator('tr[data-cursor="true"] td:nth-child(3)').innerText();
  assert(first !== second, `cursorul nu s-a mutat: rămas pe ${first}`);
  await page.keyboard.press("k");
  await page.waitForTimeout(400);
  assert(await page.locator('tr[data-cursor="true"] td:nth-child(3)').innerText() === first, "k nu a revenit");
  return `${first.trim()} → ${second.trim()}`;
});

await T("inbox: tasta 'a' deschide decizia de aprobare pentru rândul curent", async () => {
  const num = (await page.locator('tr[data-cursor="true"] td:nth-child(3)').innerText()).trim();
  await page.keyboard.press("a");
  await page.waitForTimeout(800);
  const dlg = page.locator('[role="dialog"]');
  assert(await dlg.isVisible(), "nu s-a deschis nimic la 'a'");
  const txt = await dlg.innerText();
  assert(txt.includes(num), `dialogul nu e pentru rândul curent (${num}): ${txt.slice(0, 80)}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
});

await T("inbox: tastele NU fură input-ul când scrii într-un câmp", async () => {
  assert(!(await page.locator('[role="dialog"]').isVisible().catch(() => false)),
    "un dialog a rămas deschis de la verificarea anterioară — Escape nu l-a închis");
  const f = page.locator('input[aria-label="Filtrează după solicitant"]');
  await f.fill("");
  // "amar" contains a, m and r — all three decision shortcuts.
  await f.pressSequentially("amar");
  assert(await f.inputValue() === "amar", `câmpul a pierdut caractere: "${await f.inputValue()}"`);
  assert(!(await page.locator('[role="dialog"]').isVisible().catch(() => false)), "s-a deschis un dialog în timp ce scriam");
  await f.fill("");
  await page.waitForTimeout(600);
});

await T("inbox: filtrul după beneficiar restrânge lista", async () => {
  const before = await rowCount();
  assert(before > 0, "inboxul e gol — nimic de filtrat");
  // Data-agnostic: un beneficiar REAL de pe primul rând trebuie să rămână (≥1),
  // iar un text imposibil trebuie să golească lista (0). Amândouă probează filtrarea.
  const payee = (await page.locator("tbody tr").first().locator("td").nth(3).innerText()).trim().split(/\s+/)[0];
  const f = page.locator('input[aria-label="Filtrează după beneficiar"]');
  try {
    await f.fill(payee);
    await page.waitForTimeout(900);
    const kept = await rowCount();
    assert(kept > 0 && kept <= before, `filtrul „${payee}" a golit lista: ${before} → ${kept}`);
    await f.fill("zzz-beneficiar-inexistent");
    await page.waitForTimeout(900);
    assert((await rowCount()) === 0, "un beneficiar inexistent nu a golit lista — filtrul nu filtrează");
  } finally {
    await f.fill("");
    await page.waitForTimeout(600);
  }
});

// ── Finance queue ───────────────────────────────────────────────────────────
await login("finance");
await go("/#/business/par/finance");

await T("coadă finanțe: căutarea filtrează rândurile", async () => {
  const before = await rowCount();
  assert(before > 0, "coada e goală — nimic de filtrat");
  // Numărul cererii de pe primul rând e unic — căutarea lui trebuie să restrângă la ≥1 rând.
  const rowText = await page.locator("tbody tr").first().innerText();
  const no = rowText.match(/[A-Z]{2,}-\d{4}-\d+/)?.[0];
  assert(no, `primul rând nu conține un număr de cerere: "${rowText.slice(0, 60)}"`);
  const f = page.locator('input[aria-label="Caută în coada finanțe"]');
  try {
    await f.fill(no);
    await page.waitForTimeout(900);
    const kept = await rowCount();
    assert(kept >= 1 && kept <= before, `căutarea „${no}" a golit coada: ${before} → ${kept}`);
    await f.fill("zzz-nimic");
    await page.waitForTimeout(900);
    assert((await rowCount()) === 0, "o căutare imposibilă nu a golit coada");
  } finally {
    await f.fill("");
    await page.waitForTimeout(600);
  }
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

// ── Create form (38 controls converted mechanically — press on them) ────────
await go("/#/business/par/new");

await T("cerere nouă: selectul de scop schimbă valoarea", async () => {
  await page.selectOption("#purpose", "obtain_quotations");
  assert(await page.inputValue("#purpose") === "obtain_quotations", "selectul nu reține valoarea");
  await page.selectOption("#purpose", "execute_payment");
});

await T("cerere nouă: câmpurile de text rețin ce scrii", async () => {
  await page.fill("#rt", "Coordonator achiziții");
  assert(await page.inputValue("#rt") === "Coordonator achiziții", "câmpul Funcție nu reține textul");
});

await T("cerere nouă: adăugarea unui articol chiar creează rândul și recalculează totalul", async () => {
  await page.fill("#nlDesc", "Articol de verificare UX");
  await page.fill("#nlQty", "3");
  await page.fill("#nlPrice", "250");
  const rowsBefore = await page.locator("table tbody tr").count();
  await page.getByRole("button", { name: /Adaugă articol/ }).click();
  await page.waitForTimeout(2500); // creates the draft server-side on first line
  const rowsAfter = await page.locator("table tbody tr").count();
  assert(rowsAfter === rowsBefore + 1, `rândul nu a fost adăugat: ${rowsBefore} → ${rowsAfter}`);
  const total = await page.locator('span:text-is("TOTAL ESTIMAT")').first().locator("xpath=../..").innerText();
  assert(/750/.test(total.replace(/[.\s]/g, "")), `totalul nu reflectă 3 × 250: "${total.replace(/\n/g, " ")}"`);
});

await T("cerere nouă: selectul de monedă comută", async () => {
  const cur = page.locator('select[aria-label="Monedă"]');
  await cur.selectOption("EUR");
  assert(await cur.inputValue() === "EUR", "moneda nu s-a schimbat");
  await cur.selectOption("MDL");
});

await T("cerere nouă: contextul folosit ultima dată se pre-completează", async () => {
  // Seed the memory the way a successful submit would, then reload the form.
  await page.evaluate(() => localStorage.setItem("par.lastUsedContext", JSON.stringify({ currency: "EUR" })));
  // Navigate AWAY first: re-issuing the same hash URL doesn't remount the page,
  // so the effect that applies the remembered context would never re-run.
  await page.goto(`${BASE}/#/business/par`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.goto(`${BASE}/#/business/par/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const cur = await page.locator('select[aria-label="Monedă"]').inputValue();
  assert(cur === "EUR", `moneda nu s-a pre-completat din ultima folosire: "${cur}"`);
  await page.evaluate(() => localStorage.removeItem("par.lastUsedContext"));
});

// ── Admin (58 controls converted mechanically) ──────────────────────────────
await login("admin");
await go("/#/business/par/admin");

await T("admin: toate cele 5 taburi schimbă panoul", async () => {
  for (const name of ["Setări", "Membri", "Date referință", "Audit", "Aprobare"]) {
    await page.getByRole("tab", { name }).click();
    await page.waitForTimeout(900);
    const sel = await page.getByRole("tab", { name }).getAttribute("aria-selected");
    assert(sel === "true", `tabul ${name} nu s-a selectat`);
  }
});

await T("admin: Date referință — subtaburile comută secțiunea", async () => {
  await page.getByRole("tab", { name: "Date referință" }).click();
  await page.waitForTimeout(1000);
  const sub = page.getByRole("tab", { name: "Departamente" });
  if (await sub.count()) {
    await sub.click();
    await page.waitForTimeout(800);
    assert(await sub.getAttribute("aria-selected") === "true", "subtabul nu s-a selectat");
  }
});

await T("admin: Setări — comutatoarele răspund la click", async () => {
  await page.getByRole("tab", { name: "Setări" }).click();
  await page.waitForTimeout(1200);
  const sw = page.locator('[role="switch"]').first();
  if (await sw.count()) {
    const before = await sw.getAttribute("aria-checked");
    await sw.click();
    await page.waitForTimeout(700);
    assert(await sw.getAttribute("aria-checked") !== before, "comutatorul nu s-a schimbat");
    await sw.click();
  }
});

// ── Folders ─────────────────────────────────────────────────────────────────
await go("/#/business/par/folders");

await T("foldere: click pe un folder de proiect intră în folder (drill-down)", async () => {
  // Pagina nu mai e un accordion (button[aria-expanded]) — e o navigare pe niveluri:
  // fiecare folder e un <a> real către /business/par/folders?project_id=… (PR #279).
  const rows = page.locator('main a[href*="/business/par/folders"]');
  const n = await rows.count();
  assert(n > 0, "niciun folder de proiect pe pagină");
  // Alege un folder NEVID (meta „· N cereri" cu N ≥ 1) — unul gol arată doar empty state.
  let row = rows.first();
  for (let i = 0; i < n; i++) {
    if (/[1-9]\d*\s+cereri/.test(await rows.nth(i).innerText())) { row = rows.nth(i); break; }
  }
  const name = (await row.locator("span span").first().innerText()).trim();
  await row.click();
  await page.waitForTimeout(900);
  const main = await page.locator("main").innerText();
  assert(main.includes(name), `după click nu sunt în folderul „${name}"`);
  const buckets = await page.locator('main a[href*="&b="]').count();
  assert(buckets > 0 || /folder gol/i.test(main),
    "în folderul proiectului nu apar nici subfolderele de status, nici empty state-ul");
});

await page.screenshot({ path: `${OUT}/ux-last.png`, fullPage: true });
console.log(`\n${pass} trecute, ${fails.length} picate`);
if (jsErrors.length) console.log("erori JS:\n" + jsErrors.slice(0, 5).join("\n"));
if (fails.length) console.log("\n" + fails.join("\n"));
await browser.close();
process.exit(fails.length ? 1 : 0);
