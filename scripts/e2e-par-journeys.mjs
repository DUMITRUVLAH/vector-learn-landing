/**
 * E2E PAR — 15 parcursuri de rol, pas cu pas, în browser real
 * ===========================================================
 * Nu verifică endpoint-uri, ci DRUMURI: ce face un solicitant, un aprobator și un om de la
 * finanțe de la primul click până la plată — și dacă, la fiecare pas, ecranul chiar se schimbă:
 * apare rândul, se schimbă statusul, dispare din coadă, se actualizează totalul, se blochează
 * butonul care trebuie blocat.
 *
 * Rulare (seed proaspăt + dist construit — vezi memoria par-blind-sweep-suite):
 *   npm run db:reset && npm run db:seed && npx vite build
 *   PORT=3140 npm run start &
 *   BASE_URL=http://localhost:3140 node scripts/e2e-par-journeys.mjs
 *   ONLY=7 node scripts/e2e-par-journeys.mjs     # doar parcursul 7
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3140";
const PW = process.env.SMOKE_PASSWORD ?? "demo123456";
const HEADED = process.env.HEADED === "1";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",").map((s) => s.trim())) : null;

const USERS = {
  requestor: "requestor@atic.demo.io",
  approver: "approver@atic.demo.io",
  finance: "finance@atic.demo.io",
  admin: "admin@atic.demo.io",
};
const IBAN = "MD24AG000225100013104168";
const IDNP = "2002600012345";

// ── raport ──────────────────────────────────────────────────────────────────
let flowNo = 0;
const results = [];
let stepsOk = 0;
const failures = [];

async function FLOW(title, fn) {
  flowNo++;
  const id = String(flowNo).padStart(2, "0");
  if (ONLY && !ONLY.has(String(flowNo))) { console.log(`⏭  ${id} ${title}`); return; }
  console.log(`\n━━━ ${id}. ${title}`);
  const before = failures.length;
  try {
    await fn();
  } catch (e) {
    failures.push({ flow: `${id} ${title}`, step: "(parcurs întrerupt)", msg: e.message });
    console.log(`   ✖ parcurs întrerupt — ${e.message}`);
  }
  const failed = failures.length - before;
  results.push({ id, title, ok: failed === 0 });
  console.log(failed === 0 ? `   ✅ parcurs complet` : `   ❌ ${failed} pas(i) picat(ți)`);
}

let currentFlow = "";
async function step(label, fn) {
  try {
    await fn();
    stepsOk++;
    console.log(`   ✅ ${label}`);
  } catch (e) {
    failures.push({ flow: currentFlow, step: label, msg: e.message });
    console.log(`   ❌ ${label}\n        → ${e.message}`);
    throw e; // un pas picat oprește parcursul: pașii următori nu mai au sens
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── sesiuni de browser (un context per rol = sesiuni independente) ──────────
let browser;
const S = {};
const pageErrors = [];

async function openAs(role) {
  if (S[role]) return S[role];
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(`[${role}] ${e}`));
  // Anularea cererii trece printr-un window.confirm() nativ — fără asta Playwright îl respinge
  // automat și acțiunea pare că „nu face nimic".
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto(`${BASE}/#/business/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', USERS[role]);
  await page.fill('input[type="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.hash.includes("/login"), null, { timeout: 20000 });
  await settle(page);
  S[role] = page;
  return page;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(page, ms = 900) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await sleep(ms);
}
const body = (page) => page.evaluate(() => document.body.innerText);

/** Așteaptă până când textul cerut APARE pe ecran (nu doar în DOM-ul inițial). */
async function sees(page, re, { timeout = 12000, label } = {}) {
  const deadline = Date.now() + timeout;
  let last = "";
  while (Date.now() < deadline) {
    last = await body(page);
    if (re.test(last)) return last;
    await sleep(350);
  }
  throw new Error(`${label ?? "textul"} ${re} nu a apărut. Ecranul: ${last.replace(/\s+/g, " ").slice(0, 400)}`);
}
/** Așteaptă până când textul DISPARE de pe ecran. */
async function gone(page, re, { timeout = 12000, label } = {}) {
  const deadline = Date.now() + timeout;
  let last = "";
  while (Date.now() < deadline) {
    last = await body(page);
    if (!re.test(last)) return;
    await sleep(350);
  }
  throw new Error(`${label ?? "textul"} ${re} încă e pe ecran: ${last.replace(/\s+/g, " ").slice(0, 300)}`);
}
async function notSees(page, re, label) {
  const t = await body(page);
  assert(!re.test(t), `${label ?? re} nu ar trebui să fie pe ecran`);
}
async function go(page, hash) {
  const target = `${BASE}/#${hash}`;
  const same = page.url() === target;
  await page.goto(target, { waitUntil: "domcontentloaded" });
  // Un SPA cu rutare pe hash nu re-randează când hash-ul nu se schimbă — fără reload, verificăm
  // ce era pe ecran acum zece minute, nu ce s-a întâmplat între timp.
  if (same) await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
}
/**
 * Apasă un control după ce SCRIE pe el. Numele accesibil poate veni din aria-label („Cerere PAR
 * nouă") sau din textul vizibil („Cerere nouă"), iar unele acțiuni sunt linkuri, nu butoane —
 * helperul le încearcă pe rând, ca testul să eșueze doar când controlul chiar lipsește.
 */
async function click(page, name, { nth = 0, timeout = 10000 } = {}) {
  const candidates = [
    page.getByRole("button", { name }),
    page.getByRole("link", { name }),
    page.locator("button, a, [role=button]").filter({ hasText: name }),
  ];
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const c of candidates) {
      const el = c.nth(nth);
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        await settle(page, 700);
        return;
      }
    }
    await sleep(300);
  }
  const seen = (await body(page)).replace(/\s+/g, " ").slice(0, 300);
  throw new Error(`nu găsesc controlul ${name} pe ecran. Ecranul: ${seen}`);
}
async function clickLink(page, name, { nth = 0 } = {}) {
  const el = page.getByRole("link", { name }).nth(nth);
  await el.waitFor({ state: "visible", timeout: 10000 });
  await el.click();
  await settle(page);
}
const parIdFromUrl = (page) => (page.url().match(/\/business\/par\/([0-9a-f-]{36})/) ?? [])[1] ?? null;

/** Completează formularul de cerere nouă și returnează { id, requestNo } după trimitere. */
async function createRequestViaUI(page, { amount = 7000, desc = "Servicii de consultanță", endUse = "Servicii prestate în cadrul proiectului, conform contractului.", payee = "Daria Roitman", submit = true } = {}) {
  await go(page, "/business/par/new");
  await sees(page, /Cerere nouă de plată/i, { label: "titlul formularului" });
  await page.fill("#rt", "Procurement Specialist");
  await page.fill("#nlDesc", desc);
  await page.fill("#nlQty", "1");
  await page.fill("#nlPrice", String(amount));
  await click(page, /Adaugă articol/i);
  await page.fill("#endUse", endUse);
  await click(page, /Introdu manual/i);
  await page.fill("#pn", payee);
  await page.fill("#pi", IDNP);
  await page.fill("#pb", IBAN);
  await page.fill("#pbk", 'BC "Moldindconbank" S.A.');
  if (!submit) return { id: null, requestNo: null };
  // Avertismentele nu blochează, dar primul click doar le scoate în față — de aceea clic dublu.
  await click(page, /Trimite pentru aprobare/i);
  if (!parIdFromUrl(page)) {
    await sleep(600);
    if (page.url().includes("/par/new")) await click(page, /Trimite pentru aprobare/i);
  }
  await page.waitForFunction(() => /\/business\/par\/[0-9a-f-]{36}/.test(location.hash), null, { timeout: 20000 });
  await settle(page);
  const id = parIdFromUrl(page);
  const txt = await body(page);
  const requestNo = (txt.match(/PAR-\d{4}-\d+/) ?? [])[0] ?? null;
  return { id, requestNo };
}

// ── parcursurile ────────────────────────────────────────────────────────────
const run = async () => {
browser = await chromium.launch({ headless: !HEADED });
let f1;

// ═══ 1 ═══════════════════════════════════════════════════════════════════
await FLOW("Solicitantul creează o cerere de la zero și o trimite spre aprobare", async () => {
  currentFlow = "01";
  const p = await openAs("requestor");
  await step("intră pe „Cereri de plată” și vede lista lui", async () => {
    await go(p, "/business/par");
    await sees(p, /Cerere( PAR)? nouă/i, { label: "butonul de cerere nouă" });
  });
  await step("apasă „Cerere nouă” și ajunge pe formular", async () => {
    await click(p, /Cerere( PAR)? nouă/i);
    await sees(p, /Cerere nouă de plată/i, { label: "titlul formularului" });
    assert(page_hash(p).includes("/par/new"), `ruta nu s-a schimbat: ${page_hash(p)}`);
  });
  await step("adaugă un articol și totalul estimat se actualizează pe ecran", async () => {
    await p.fill("#nlDesc", "Sesiune de consiliere psihologică");
    await p.fill("#nlQty", "2");
    await p.fill("#nlPrice", "3500");
    await click(p, /Adaugă articol/i);
    await sees(p, /Sesiune de consiliere psihologică/, { label: "articolul adăugat" });
    await sees(p, /7[  .,]?000/, { label: "totalul de 7.000" });
  });
  await step("completează utilizarea finală și alege cum introduce beneficiarul", async () => {
    await p.fill("#endUse", "Consiliere de grup, 120 min, platforma Zoom.");
    await click(p, /Introdu manual/i);
    await sees(p, /Nume, Prenume|Denumire companie/i, { label: "câmpurile beneficiarului" });
    await p.fill("#pn", "Daria Roitman");
    await p.fill("#pi", IDNP);
    await p.fill("#pb", IBAN);
    await p.fill("#pbk", 'BC "Moldindconbank" S.A.');
    assert((await p.inputValue("#pb")) === IBAN, "IBAN-ul nu s-a scris în câmp");
  });
  await step("trimite cererea și ajunge pe pagina ei de detaliu", async () => {
    await click(p, /Trimite pentru aprobare/i);
    if (page_hash(p).includes("/par/new")) { await sleep(700); await click(p, /Trimite pentru aprobare/i); }
    await p.waitForFunction(() => /\/business\/par\/[0-9a-f-]{36}/.test(location.hash), null, { timeout: 20000 });
    await settle(p);
    f1 = { id: parIdFromUrl(p), requestNo: (await body(p)).match(/PAR-\d{4}-\d+/)?.[0] };
    assert(f1.id && f1.requestNo, `nu am ajuns pe detaliu: ${page_hash(p)}`);
  });
  await step("statusul afișat este „În aprobare”, nu mai e ciornă", async () => {
    await sees(p, /În aprobare/, { label: "statusul" });
    await notSees(p, /\bCiornă\b/, "statusul de ciornă");
  });
  await step("lanțul de semnături apare cu pașii de aprobare", async () => {
    await sees(p, /DOA Holder|Supervisor|Aprobator|Executive Director/i, { label: "lanțul de aprobări" });
  });
  await step("cererea apare acum în lista lui, cu numărul ei", async () => {
    await go(p, "/business/par");
    await sees(p, new RegExp(f1.requestNo), { label: "cererea în listă" });
  });
});

// ═══ 2 ═══════════════════════════════════════════════════════════════════
await FLOW("Solicitantul salvează o ciornă, o regăsește și o completează mai târziu", async () => {
  currentFlow = "02";
  const p = await openAs("requestor");
  let no;
  await step("completează parțial și apasă „Salvează ciornă”", async () => {
    await go(p, "/business/par/new");
    await p.fill("#rt", "Specialist achiziții");
    await p.fill("#nlDesc", "Materiale de birou");
    await p.fill("#nlQty", "10");
    await p.fill("#nlPrice", "150");
    await click(p, /Adaugă articol/i);
    await click(p, /Salvează ciornă/i);
  });
  await step("primește confirmarea cu numărul ciornei", async () => {
    const t = await sees(p, /ciorn/i, { label: "confirmarea salvării" });
    no = t.match(/PAR-\d{4}-\d+/)?.[0];
    assert(no, `fără număr de cerere în confirmare: ${t.replace(/\s+/g, " ").slice(0, 200)}`);
  });
  await step("ciorna apare în lista de cereri cu status „Ciornă”", async () => {
    await go(p, "/business/par");
    await sees(p, new RegExp(no), { label: "ciorna în listă" });
    const row = await p.locator("tr", { hasText: no }).first().innerText();
    assert(/Ciornă/i.test(row), `rândul nu arată statusul de ciornă: ${row.replace(/\s+/g, " ")}`);
  });
  await step("o deschide și regăsește exact ce scrisese", async () => {
    await p.locator("tr", { hasText: no }).first().click();
    await settle(p);
    if (!parIdFromUrl(p)) await p.getByText(no).first().click();
    await settle(p);
    await sees(p, /Materiale de birou/, { label: "articolul salvat" });
    await sees(p, /1[  .,]?500/, { label: "totalul de 1.500" });
  });
  await step("o completează prin „Editează” și o trimite", async () => {
    await click(p, /Editează/i);
    await sees(p, /Editează cererea de plată|Cerere nouă de plată/i, { label: "formularul de editare" });
    await p.fill("#endUse", "Materiale necesare biroului de proiect.");
    await click(p, /Introdu manual/i);
    await p.fill("#pn", "Papetăria SRL");
    await p.fill("#pi", IDNP);
    await p.fill("#pb", IBAN);
    await click(p, /Trimite pentru aprobare/i);
    if (page_hash(p).includes("/par/new") || page_hash(p).includes("edit")) { await sleep(700); await click(p, /Trimite pentru aprobare/i); }
    await sees(p, /În aprobare/, { label: "statusul după trimitere" });
  });
});

// ═══ 3 ═══════════════════════════════════════════════════════════════════
await FLOW("Solicitantul e oprit, cu explicații pe ecran, când trimite o cerere incompletă", async () => {
  currentFlow = "03";
  const p = await openAs("requestor");
  await step("pe un formular gol butonul de trimitere e inactiv", async () => {
    await go(p, "/business/par/new");
    const btn = p.getByRole("button", { name: /Trimite cererea pentru aprobare|Trimite pentru aprobare/i }).first();
    await btn.waitFor({ state: "visible", timeout: 10000 });
    assert(await btn.isDisabled(), "butonul de trimitere e activ pe un formular gol");
  });
  await step("adaugă un articol — abia acum poate încerca să trimită", async () => {
    await p.fill("#nlDesc", "Servicii de traducere");
    await p.fill("#nlQty", "1");
    await p.fill("#nlPrice", "900");
    await click(p, /Adaugă articol/i);
    await sees(p, /Servicii de traducere/, { label: "articolul adăugat" });
    const btn = p.getByRole("button", { name: /Trimite cererea pentru aprobare|Trimite pentru aprobare/i }).first();
    assert(!(await btn.isDisabled()), "butonul a rămas inactiv deși există un articol");
  });
  await step("trimite fără beneficiar și vede scris exact ce lipsește", async () => {
    await click(p, /Trimite pentru aprobare/i);
    await sees(p, /beneficiar|utilizării finale|Descrierea/i, { label: "eroarea despre beneficiar / utilizare" });
  });
  await step("cererea NU a plecat — nu există status „În aprobare”", async () => {
    await notSees(p, /În aprobare/, "statusul de cerere trimisă");
  });
});

// ═══ 4 ═══════════════════════════════════════════════════════════════════
await FLOW("Solicitantul descarcă formularul PAR completat (PDF)", async () => {
  currentFlow = "04";
  const p = await openAs("requestor");
  await step("deschide cererea trimisă la parcursul 1", async () => {
    await go(p, `/business/par/${f1.id}`);
    await sees(p, new RegExp(f1.requestNo), { label: "numărul cererii" });
  });
  await step("apasă „Descarcă formularul” și primește un PDF real", async () => {
    const [download] = await Promise.all([
      p.waitForEvent("download", { timeout: 30000 }),
      click(p, /Descarcă formularul/i),
    ]);
    const name = download.suggestedFilename();
    assert(/\.pdf$/i.test(name), `fișierul descărcat nu e PDF: ${name}`);
    const stream = await download.createReadStream();
    let size = 0;
    for await (const chunk of stream) size += chunk.length;
    assert(size > 1000, `PDF suspect de mic: ${size} octeți`);
  });
});

// ═══ 5 ═══════════════════════════════════════════════════════════════════
await FLOW("Solicitantul duplică o cerere veche ca să nu o retasteze", async () => {
  currentFlow = "05";
  const p = await openAs("requestor");
  await step("deschide cererea și apasă „Duplică”", async () => {
    await go(p, `/business/par/${f1.id}`);
    await click(p, /Duplică/i);
    await settle(p, 1500);
  });
  await step("ajunge pe o cerere NOUĂ, cu alt număr, în stare de ciornă", async () => {
    const id = parIdFromUrl(p);
    assert(id && id !== f1.id, `nu s-a creat o cerere nouă (id=${id})`);
    await sees(p, /Ciornă/i, { label: "statusul de ciornă" });
    const no = (await body(p)).match(/PAR-\d{4}-\d+/)?.[0];
    assert(no && no !== f1.requestNo, `numărul nu s-a schimbat: ${no}`);
  });
  await step("articolele au venit cu ea", async () => {
    await sees(p, /Sesiune de consiliere psihologică/, { label: "articolul copiat" });
  });
  await step("dar semnăturile NU au venit — e o cerere nouă, nu una aprobată", async () => {
    await notSees(p, /Aprobat[ăa] de|Semnat/i, "semnături copiate");
  });
});

// ═══ 6 ═══════════════════════════════════════════════════════════════════
await FLOW("Solicitantul își anulează propria cerere", async () => {
  currentFlow = "06";
  const p = await openAs("requestor");
  let no;
  await step("creează o cerere nouă și o trimite", async () => {
    const r = await createRequestViaUI(p, { amount: 1200, desc: "Cerere de test pentru anulare" });
    no = r.requestNo;
    assert(no, "cererea nu s-a creat");
  });
  await step("apasă „Anulează cererea” și confirmă", async () => {
    await click(p, /Anulează/i);
    await settle(p, 900);
    const t = await body(p);
    if (/Confirm|Da, anulează|Sigur/i.test(t)) {
      await p.getByRole("button", { name: /Confirm|Da, anulează/i }).first().click().catch(() => {});
      await settle(p, 900);
    }
  });
  await step("statusul devine „Anulată”", async () => {
    await sees(p, /Anulat[ăa]/i, { label: "statusul anulat" });
  });
  await step("butoanele de acțiune dispar — nu mai poate fi trimisă", async () => {
    await notSees(p, /Trimite spre aprobare/i, "butonul de trimitere");
  });
});

// ═══ 7 ═══════════════════════════════════════════════════════════════════
let f7;
await FLOW("Aprobatorul găsește cererea în inbox, o deschide și o aprobă cu semnătură", async () => {
  currentFlow = "07";
  const r = await openAs("requestor");
  const a = await openAs("approver");
  await step("solicitantul trimite o cerere sub pragul de achiziție mică (o semnătură)", async () => {
    f7 = await createRequestViaUI(r, { amount: 2000, desc: "Servicii de printare materiale" });
    assert(f7.requestNo, "cererea nu s-a trimis");
  });
  await step("aprobatorul vede cererea în „Inbox aprobare”", async () => {
    await go(a, "/business/par/inbox");
    await sees(a, new RegExp(f7.requestNo), { timeout: 15000, label: "cererea în inbox" });
  });
  await step("o deschide din inbox și vede cine a cerut, cât și pentru ce", async () => {
    await a.getByRole("button", { name: new RegExp(`^${f7.requestNo}$`) }).first().click();
    await settle(a, 1200);
    if (!parIdFromUrl(a)) await go(a, `/business/par/${f7.id}`);
    await sees(a, /Servicii de printare materiale/, { label: "articolul cererii" });
    await sees(a, /2[  .,]?000/, { label: "suma cerută" });
  });
  await step("vede blocul beneficiarului (are dreptul — cererea i-a fost rutată)", async () => {
    await sees(a, new RegExp(IBAN), { label: "IBAN-ul beneficiarului" });
  });
  await step("din inbox apasă „Aprobă” și primește dialogul de semnătură", async () => {
    await go(a, "/business/par/inbox");
    await a.getByRole("button", { name: new RegExp(`^Aprobă ${f7.requestNo}$`) }).first().click();
    await settle(a, 900);
    await sees(a, /Aprobă cererea/i, { label: "dialogul de aprobare" });
    await sees(a, /Comentariu|Numele dvs/i, { label: "câmpurile de semnătură" });
  });
  await step("scrie comentariul, se semnează și confirmă", async () => {
    await a.fill("#decision-comment", "De acord, suma e în buget.");
    await a.fill("#signature-name", "Ana Chirita");
    await a.getByRole("button", { name: /^Aprobă$/ }).last().click();
    await settle(a, 1800);
  });
  await step("cererea dispare din inboxul lui", async () => {
    await go(a, "/business/par/inbox");
    await gone(a, new RegExp(f7.requestNo), { timeout: 15000, label: "cererea aprobată" });
  });
  await step("pe cerere statusul nu mai e „În aprobare”", async () => {
    await go(a, `/business/par/${f7.id}`);
    await sees(a, /La finanțe|Aprobat/i, { label: "statusul nou" });
  });
  await step("solicitantul vede în cererea lui că a fost aprobată", async () => {
    await go(r, `/business/par/${f7.id}`);
    await sees(r, /La finanțe|Aprobat/i, { label: "statusul la solicitant" });
    await sees(r, /De acord, suma e în buget/, { label: "comentariul aprobatorului" });
  });
});

// ═══ 8 ═══════════════════════════════════════════════════════════════════
await FLOW("Aprobatorul respinge o cerere și motivul ajunge la solicitant", async () => {
  currentFlow = "08";
  const r = await openAs("requestor");
  const a = await openAs("approver");
  let req;
  await step("solicitantul trimite o cerere", async () => {
    req = await createRequestViaUI(r, { amount: 1500, desc: "Abonament software neaprobat" });
  });
  await step("aprobatorul deschide cererea și apasă „Respinge”", async () => {
    await go(a, `/business/par/${req.id}`);
    await click(a, /Respinge cererea/i);
    await sees(a, /Motiv respingere|Motiv/i, { label: "dialogul de respingere" });
  });
  await step("fără motiv scris, respingerea nu se poate confirma", async () => {
    const confirm = a.getByRole("button", { name: /Confirmă respingere/i }).last();
    const disabled = await confirm.isDisabled().catch(() => false);
    if (!disabled) {
      await confirm.click();
      await settle(a, 900);
      const t = await body(a);
      assert(/Motiv|obligatoriu/i.test(t), "s-a respins fără motiv, fără niciun mesaj");
    }
  });
  await step("scrie motivul și confirmă", async () => {
    await a.fill("#reject-comment", "Nu există buget pentru acest abonament în trimestrul curent.");
    await a.getByRole("button", { name: /Confirmă respingere/i }).last().click();
    await settle(a, 1500);
  });
  await step("statusul devine „Respinsă”", async () => {
    await sees(a, /Respins[ăa]/i, { label: "statusul respins" });
  });
  await step("solicitantul vede respingerea ȘI motivul", async () => {
    await go(r, `/business/par/${req.id}`);
    await sees(r, /Respins[ăa]/i, { label: "statusul la solicitant" });
    await sees(r, /Nu există buget pentru acest abonament/, { label: "motivul respingerii" });
  });
});

// ═══ 9 ═══════════════════════════════════════════════════════════════════
await FLOW("Aprobatorul cere modificări, solicitantul corectează și retrimite", async () => {
  currentFlow = "09";
  const r = await openAs("requestor");
  const a = await openAs("approver");
  let req;
  await step("solicitantul trimite o cerere", async () => {
    req = await createRequestViaUI(r, { amount: 4000, desc: "Servicii de mentenanță" });
  });
  await step("aprobatorul apasă „Cere modificări” și scrie ce lipsește", async () => {
    await go(a, `/business/par/${req.id}`);
    await click(a, /Cere modificări/i);
    await sees(a, /Modificări solicitate|Ce trebuie/i, { label: "dialogul de modificări" });
    await a.fill("#changes-comment", "Atașează contractul semnat și detaliază perioada.");
    await a.getByRole("button", { name: /^Solicită modificări$/ }).last().click();
    await settle(a, 1500);
  });
  await step("cererea primește statusul „Modificări solicitate”", async () => {
    await sees(a, /Modificări solicitate/i, { label: "statusul" });
  });
  await step("solicitantul vede cererea întoarsă, cu explicația aprobatorului", async () => {
    await go(r, `/business/par/${req.id}`);
    await sees(r, /Modificări solicitate/i, { label: "statusul la solicitant" });
    await sees(r, /Atașează contractul semnat/, { label: "explicația" });
  });
  await step("o poate edita din nou (butonul „Editează” e disponibil)", async () => {
    await sees(r, /Editează/i, { label: "butonul de editare" });
    await click(r, /Editează/i);
    await sees(r, /Editează cererea de plată|Cerere nouă de plată/i, { label: "formularul" });
    await r.fill("#endUse", "Mentenanță lunară conform contractului nr. 12 din 2026, perioada iunie–decembrie.");
  });
  await step("retrimite și cererea revine în starea „În aprobare”", async () => {
    await click(r, /Trimite pentru aprobare/i);
    if (!/\/par\/[0-9a-f-]{36}$/.test(page_hash(r))) { await sleep(700); await click(r, /Trimite pentru aprobare/i); }
    await sees(r, /În aprobare/i, { timeout: 15000, label: "statusul retrimis" });
  });
  await step("și reapare în inboxul aprobatorului", async () => {
    await go(a, "/business/par/inbox");
    await sees(a, new RegExp(req.requestNo), { timeout: 15000, label: "cererea reintrată în inbox" });
  });
});

// ═══ 10 ══════════════════════════════════════════════════════════════════
await FLOW("Aprobatorul rezolvă mai multe cereri deodată, din inbox", async () => {
  currentFlow = "10";
  const r = await openAs("requestor");
  const a = await openAs("approver");
  const nos = [];
  await step("solicitantul trimite două cereri mici", async () => {
    for (const label of ["Consumabile birou A", "Consumabile birou B"]) {
      const x = await createRequestViaUI(r, { amount: 800, desc: label });
      nos.push(x.requestNo);
    }
    assert(nos.every(Boolean), "cererile nu s-au creat");
  });
  await step("aprobatorul le vede pe ambele în inbox", async () => {
    await go(a, "/business/par/inbox");
    for (const no of nos) await sees(a, new RegExp(no), { timeout: 15000, label: `cererea ${no}` });
  });
  await step("le selectează și apasă „Aprobă toate”", async () => {
    for (const no of nos) {
      const cb = a.locator("tr", { hasText: no }).locator('input[type="checkbox"]').first();
      await cb.check({ timeout: 8000 });
    }
    await sees(a, /Aprobă \d+ selectate/i, { label: "bara de acțiuni în masă" });
    await a.getByRole("button", { name: /Aprobă \d+ selectate/i }).first().click();
    await settle(a, 1000);
    const t = await body(a);
    if (/Comentariu|în masă/i.test(t)) {
      await a.fill("#bulk-comment", "Aprobare în masă — cheltuieli curente.").catch(() => {});
      await a.fill("#bulk-sig", "Ana Chirita").catch(() => {});
      await a.getByRole("button", { name: /^Aprobă/ }).last().click();
      await settle(a, 2500);
    }
  });
  await step("ambele dispar din inbox", async () => {
    await go(a, "/business/par/inbox");
    for (const no of nos) await gone(a, new RegExp(no), { timeout: 15000, label: `cererea ${no}` });
  });
});

// ═══ 11 ══════════════════════════════════════════════════════════════════
await FLOW("Aprobatorul NU își poate aproba propria cerere, și vede de ce", async () => {
  currentFlow = "11";
  const a = await openAs("approver");
  await step("aprobatorul creează și trimite o cerere în nume propriu", async () => {
    const own = await createRequestViaUI(a, { amount: 3000, desc: "Cerere depusă chiar de aprobator" });
    assert(own.id, "cererea nu s-a trimis");
  });
  await step("pe propria cerere nu are butoanele de decizie", async () => {
    await notSees(a, /^Aprobă$/m, "butonul Aprobă");
  });
  await step("ecranul îi explică motivul (nu doar ascunde butonul)", async () => {
    await sees(a, /propria|propriu|self|nu poți aproba/i, { label: "explicația" });
  });
  await step("propria cerere NU stă în inboxul lui de aprobare", async () => {
    const own = (await body(a)).match(/PAR-\d{4}-\d+/)?.[0];
    await go(a, "/business/par/inbox");
    await notSees(a, new RegExp(own), `propria cerere ${own} în inbox`);
  });
});

// ═══ 12 ══════════════════════════════════════════════════════════════════
let f12;
await FLOW("O cerere mare cere două semnături, una după alta", async () => {
  currentFlow = "12";
  const r = await openAs("requestor");
  const a = await openAs("approver");
  const adm = await openAs("admin");
  await step("solicitantul trimite o cerere de 7.000 MDL (peste pragul de achiziție mică)", async () => {
    f12 = await createRequestViaUI(r, { amount: 7000, desc: "Echipament pentru sala de curs" });
    assert(f12.id, "cererea nu s-a trimis");
  });
  await step("pe cerere apar DOI pași de semnătură", async () => {
    const t = await body(r);
    const steps = (t.match(/Pas(ul)? ?[12]|Step [12]/gi) ?? []).length;
    assert(steps >= 2 || /Executive Director/i.test(t), `nu văd doi pași de aprobare: ${t.replace(/\s+/g, " ").slice(0, 300)}`);
  });
  await step("primul aprobator semnează", async () => {
    await go(a, `/business/par/${f12.id}`);
    await click(a, /Aprobă cererea/i);
    await settle(a, 1800);
  });
  await step("cererea RĂMÂNE „În aprobare” — mai lipsește o semnătură", async () => {
    await go(a, `/business/par/${f12.id}`);
    await sees(a, /În aprobare/i, { label: "statusul intermediar" });
  });
  await step("al doilea semnatar o vede și o aprobă", async () => {
    await go(adm, `/business/par/${f12.id}`);
    await click(adm, /Aprobă cererea/i);
    await settle(adm, 1800);
  });
  await step("abia acum cererea trece la finanțe", async () => {
    await sees(adm, /La finanțe/i, { timeout: 15000, label: "statusul final" });
  });
  await step("ambele semnături apar în secțiunea 14–15", async () => {
    const t = await body(adm);
    const semnate = (t.match(/Aprobat/g) ?? []).length;
    assert(semnate >= 3, `lipsesc semnături în secțiunea 14–15 (găsite ${semnate}): ${t.replace(/\s+/g, " ").slice(-350)}`);
    assert(/Ana Chirita/.test(t) && /Irina Oriol/.test(t), "nu apar ambii semnatari cu numele");
  });
});

// ═══ 13 ══════════════════════════════════════════════════════════════════
await FLOW("Finanțele preiau cererea aprobată, completează secțiunea 16 și o plătesc", async () => {
  currentFlow = "13";
  const fin = await openAs("finance");
  await step("omul de la finanțe vede cererea în „Coadă finanțe”", async () => {
    await go(fin, "/business/par/finance");
    await sees(fin, new RegExp(f12.requestNo), { timeout: 15000, label: "cererea în coadă" });
  });
  await step("completează secțiunea 16 (linia bugetară, cine a primit-o)", async () => {
    await fin.getByRole("button", { name: new RegExp(`^Completează secțiunea 16 pentru ${f12.requestNo}$`) }).first().click();
    await settle(fin, 900);
    await sees(fin, /PAR BL|Primit de/i, { label: "dialogul secțiunii 16" });
    await fin.fill("#par-bl", "BL-2026-014");
    await fin.getByRole("button", { name: /^Salvează/ }).last().click();
    await settle(fin, 1800);
  });
  await step("linia bugetară rămâne salvată pe cerere", async () => {
    await go(fin, `/business/par/${f12.id}`);
    await sees(fin, /BL-2026-014/, { label: "linia bugetară" });
  });
  await step("apasă „Înregistrează plata” și completează suma, data și referința", async () => {
    await go(fin, "/business/par/finance");
    await fin.getByRole("button", { name: new RegExp(`^Înregistrează plata pentru ${f12.requestNo}$`) }).first().click();
    await settle(fin, 900);
    await sees(fin, /Suma|Data plății|Referin/i, { label: "dialogul de plată" });
    await fin.fill("#actual-amount", "7000");
    await fin.fill("#payment-date", "2026-08-26");
    await fin.fill("#payment-ref", "OP 4417");
    await fin.getByRole("button", { name: /^Marchează plătit$/ }).last().click();
    await settle(fin, 2200);
  });
  await step("cererea devine „Plătită”", async () => {
    await go(fin, `/business/par/${f12.id}`);
    await sees(fin, /Plătit[ăa]/i, { timeout: 15000, label: "statusul plătit" });
  });
  await step("și dispare din coada de finanțe", async () => {
    await go(fin, "/business/par/finance");
    await gone(fin, new RegExp(f12.requestNo), { timeout: 15000, label: "cererea plătită" });
  });
  await step("solicitantul vede pe cererea lui că a fost plătită, cu referința", async () => {
    const r = await openAs("requestor");
    await go(r, `/business/par/${f12.id}`);
    await sees(r, /Plătit[ăa]/i, { label: "statusul la solicitant" });
    await sees(r, /OP 4417/, { label: "referința plății" });
  });
});

// ═══ 14 ══════════════════════════════════════════════════════════════════
let f14;
await FLOW("O plată cu peste 10% peste estimat se oprește și cere re-aprobare", async () => {
  currentFlow = "14";
  const r = await openAs("requestor");
  const a = await openAs("approver");
  const adm = await openAs("admin");
  const fin = await openAs("finance");
  await step("o cerere de 7.000 MDL parcurge tot lanțul de aprobare", async () => {
    f14 = await createRequestViaUI(r, { amount: 7000, desc: "Lucrări de reparație sală" });
    for (const [who, page] of [["approver", a], ["admin", adm]]) {
      await go(page, `/business/par/${f14.id}`);
      const t = await body(page);
      if (!/Aprobă/.test(t)) continue;
      void who;
      await click(page, /Aprobă cererea/i);
      await settle(page, 1800);
    }
    await go(fin, "/business/par/finance");
    await sees(fin, new RegExp(f14.requestNo), { timeout: 15000, label: "cererea în coada de finanțe" });
  });
  await step("finanțele introduc o sumă reală cu 28% mai mare", async () => {
    await fin.getByRole("button", { name: new RegExp(`^Înregistrează plata pentru ${f14.requestNo}$`) }).first().click();
    await settle(fin, 900);
    await fin.fill("#actual-amount", "9000");
    await fin.fill("#payment-date", "2026-08-26");
    await fin.getByRole("button", { name: /^Marchează plătit$/ }).last().click();
    await settle(fin, 2200);
  });
  await step("plata NU trece: cererea cere re-aprobare", async () => {
    await go(fin, "/business/par/finance");
    await sees(fin, /Reaprobare necesară|Așteptare re-aprobare/i, { timeout: 15000, label: "starea de re-aprobare" });
  });
  await step("finanțele nu au buton de plată cât timp lipsește re-aprobarea", async () => {
    const payBtn = fin.getByRole("button", { name: new RegExp(`^Înregistrează plata pentru ${f14.requestNo}$`) });
    assert(!(await payBtn.isVisible().catch(() => false)), "butonul de plată e încă disponibil deși lipsește re-aprobarea");
    await sees(fin, /Așteptare re-aprobare/i, { label: "explicația din coadă" });
  });
  await step("aprobatorul acordă re-aprobarea de pe cerere", async () => {
    await go(adm, `/business/par/${f14.id}`);
    await sees(adm, /Reaprobare necesară/i, { label: "starea pe detaliu" });
    await click(adm, /Re-?aprob|Aprobă depășirea|Aprobă cererea/i);
    await settle(adm, 1500);
  });
  await step("finanțele văd acum butonul „Plătește (re-aprobat)” și plătesc", async () => {
    await go(fin, "/business/par/finance");
    await fin.getByRole("button", { name: new RegExp(`^(Plătește \\(re-aprobat\\)|Reîncearcă plata|Înregistrează plata) pentru ${f14.requestNo}|^Plătește \\(re-aprobat\\)$`) })
      .first().click({ timeout: 20000 });
    await settle(fin, 900);
    await fin.fill("#actual-amount", "9000");
    await fin.fill("#payment-date", "2026-08-26");
    await fin.fill("#payment-ref", "OP 4418").catch(() => {});
    await fin.getByRole("button", { name: /^Marchează plătit$/ }).last().click();
    await settle(fin, 2200);
  });
  await step("cererea ajunge „Plătită” cu suma reală", async () => {
    await go(fin, `/business/par/${f14.id}`);
    await sees(fin, /Plătit[ăa]/i, { timeout: 15000, label: "statusul plătit" });
    await sees(fin, /9[  .,]?000/, { label: "suma reală plătită" });
  });
});

// ═══ 15 ══════════════════════════════════════════════════════════════════
await FLOW("Finanțele iau dosarul complet și verifică cifra în rapoarte", async () => {
  currentFlow = "15";
  const fin = await openAs("finance");
  await step("descarcă dosarul complet al cererii plătite", async () => {
    await go(fin, `/business/par/${f12.id}`);
    const [download] = await Promise.all([
      fin.waitForEvent("download", { timeout: 40000 }),
      click(fin, /Descarcă dosarul complet/i),
    ]);
    assert(/\.pdf$/i.test(download.suggestedFilename()), `dosarul nu e PDF: ${download.suggestedFilename()}`);
    const stream = await download.createReadStream();
    let size = 0;
    for await (const c of stream) size += c.length;
    assert(size > 1000, `dosar suspect de mic: ${size} octeți`);
  });
  await step("deschide „Rapoarte PAR” și vede cifre, nu un ecran gol", async () => {
    await go(fin, "/business/par/reports");
    await sees(fin, /Raport|Cheltuieli|Total/i, { label: "pagina de rapoarte" });
    const t = await body(fin);
    assert(/\d/.test(t.replace(/2026/g, "")), `raportul nu conține nicio cifră: ${t.replace(/\s+/g, " ").slice(0, 300)}`);
  });
  await step("execuția bugetară arată bani „plătit efectiv”, nu doar angajați", async () => {
    const t = (await body(fin)).replace(/\s+/g, " ");
    assert(/Plătit efectiv/i.test(t), `raportul nu are coloana de plăți: ${t.slice(0, 400)}`);
    const sume = [...t.matchAll(/([\d.]+),(\d{2}) L/g)].map((m) => Number(m[1].replace(/\./g, "") + "." + m[2]));
    assert(sume.some((v) => v >= 7000), `nicio sumă plătită de ordinul cererilor achitate: ${sume.slice(0, 12).join(", ")}`);
  });
  await step("aprobatorul vede aceleași rapoarte (nu i se ascund cifrele)", async () => {
    const a = await openAs("approver");
    await go(a, "/business/par/reports");
    await sees(a, /Raport|Cheltuieli|Total/i, { label: "rapoartele pentru aprobator" });
    const t = await body(a);
    assert(/[1-9]/.test(t.replace(/2026/g, "")), "aprobatorul vede un raport gol");
  });
});

// ── final ─────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(74)}`);
const okFlows = results.filter((r) => r.ok).length;
console.log(`PARCURSURI: ${okFlows}/${results.length} complete · ${stepsOk} pași trecuți · ${failures.length} pași picați`);
if (failures.length) {
  console.log("\nPAȘI PICAȚI:");
  for (const f of failures) console.log(`  [${f.flow}] ${f.step}\n      → ${f.msg}`);
}
if (pageErrors.length) {
  console.log(`\nERORI DE RUNTIME ÎN BROWSER (${pageErrors.length}):`);
  for (const e of [...new Set(pageErrors)].slice(0, 10)) console.log("  " + e);
}
console.log("═".repeat(74));
await browser.close();
process.exit(failures.length || pageErrors.length ? 1 : 0);
};

function page_hash(p) { return (p.url().split("#")[1] ?? ""); }

run().catch(async (e) => { console.error("FATAL", e); if (browser) await browser.close(); process.exit(2); });
