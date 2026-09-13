// PAR pe telefon — ce trebuie să fie ATINGIBIL, nu doar prezent în DOM.
//
// De ce există (CLAUDE.md §3.5.1quater). Owner-ul a cerut, 13.09.2026, o verificare a fluxului de
// plată pe telefon: „dacă totul se vede de la stânga la dreapta, fără suprapuneri, nimic prea mic".
// Verificarea în browser real, la 390px, a găsit două lucruri pe care niciun test din jsdom nu le
// putea vedea, pentru că amândouă țin de VIEWPORT, nu de DOM:
//
//   1. coada de finanțe e un tabel de 13 coloane (`min-w-[1280px]`) — pe telefon se vedea o
//      fereastră de o coloană, deschisă chiar peste „Acțiuni": trei butoane și niciun număr de
//      cerere, niciun beneficiar, nicio sumă;
//   2. dialogul de plată era mai înalt decât ecranul și nu se derula: butonul „Da, confirmă plata"
//      cădea SUB marginea de jos, iar Playwright nu-l putea apăsa nici scrollând („element is
//      outside of the viewport"). Adică plata nu se putea încheia de pe telefon.
//
// Rulare: node scripts/e2e-par-mobile.mjs   (server local pornit și populat)
import { chromium, request, devices } from "playwright";

const BASE = process.env.BASE_URL ?? process.env.BASE ?? "http://localhost:3000";
const PW = "demo123456";

let pass = 0;
const fails = [];
async function T(name, fn) {
  try { await fn(); pass++; console.log(`✅ ${name}`); }
  catch (e) { fails.push(`${name} — ${e.message}`); console.log(`❌ ${name} — ${e.message}`); }
}
const must = (c, m) => { if (!c) throw new Error(m); };

/** Pregătește o cerere ajunsă la finanțe, ca ecranul să aibă ce arăta. */
async function seedInFinance() {
  const ctx = {};
  for (const [role, email] of Object.entries({
    admin: "admin@atic.demo.io", approver: "approver@atic.demo.io", requestor: "requestor@atic.demo.io",
  })) {
    ctx[role] = await request.newContext({ baseURL: BASE });
    await ctx[role].post("/api/auth/login", { data: { email, password: PW } });
  }
  const j = async (r) => { try { return await r.json(); } catch { return null; } };
  const cfg = {
    dept: (await j(await ctx.admin.get("/api/par/departments")))?.items?.[0]?.id,
    proj: (await j(await ctx.admin.get("/api/par/projects")))?.items?.[0]?.id,
    bc: (await j(await ctx.admin.get("/api/par/budget-codes")))?.items?.[0]?.id,
  };
  const id = (await j(await ctx.requestor.post("/api/par", { data: {} })))?.id;
  await ctx.requestor.patch(`/api/par/${id}`, { data: {
    purpose: "execute_payment", currency: "MDL", end_use: "Verificare pe telefon",
    payee_name: "Centrul de Resurse Juridice", payee_iban: "MD80VI000002224217675MDL",
    payee_idnp: "2002600012345", payee_bank: "Victoriabank",
    department_id: cfg.dept, project_id: cfg.proj, budget_code_id: cfg.bc } });
  await ctx.requestor.post(`/api/par/${id}/line-items`, { data: { description: "Audit", quantity: 1, unit: "buc", unit_price_cents: 200000 } });
  await ctx.requestor.post(`/api/par/${id}/submit`, { data: {} });
  for (const role of ["approver", "admin"]) {
    if ((await j(await ctx.admin.get(`/api/par/${id}`)))?.status === "in_finance") break;
    await ctx[role].post(`/api/par/${id}/approve`, { data: { comment: "ok", signatureName: "Test" } });
  }
  return id;
}

await seedInFinance();

const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices["iPhone 13"], locale: "ro-RO", serviceWorkers: "block" })).newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/`);
await page.evaluate(async ({ pw }) => {
  await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "finance@atic.demo.io", password: pw }), credentials: "include" });
}, { pw: PW });
await page.goto(`${BASE}/#/business/par/finance`, { waitUntil: "load" });
await wait(2500);

await T("coada de finanțe: cererea se citește fără să tragi pagina lateral", async () => {
  // Nu „textul există în DOM" — asta era adevărat și când tabelul lat îl ținea la 900px în dreapta.
  // Cerem ca fiecare informație să fie ÎN LĂȚIMEA ecranului, acolo unde omul chiar o vede.
  const seen = await page.evaluate(() => {
    const vw = window.innerWidth;
    const inView = (re) =>
      [...document.querySelectorAll("body *")].some((el) => {
        if (el.children.length) return false;
        if (!re.test((el.textContent ?? "").trim())) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.left >= -1 && r.right <= vw + 1;
      });
    return {
      numar: inView(/^PAR-\d{4}-\d{4}$/),
      beneficiar: inView(/Centrul de Resurse Juridice/),
      suma: inView(/2\.000,00/),
    };
  });
  must(seen.numar, "numărul cererii nu încape în lățimea ecranului");
  must(seen.beneficiar, "beneficiarul nu încape în lățimea ecranului");
  must(seen.suma, "suma nu încape în lățimea ecranului");
});

await T("nimic nu iese lateral din ecran", async () => {
  const { scrollW, vw } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, vw: window.innerWidth }));
  must(scrollW <= vw + 1, `pagina are ${scrollW}px pe un ecran de ${vw}px`);
});

await T("[blocant] plata se poate DUCE LA CAPĂT de pe telefon", async () => {
  await page.getByRole("button", { name: /Înregistrează plata pentru/i }).first().click();
  await page.getByRole("button", { name: /^Marchează plătit$/ }).click({ timeout: 5000 });
  const confirm = page.getByRole("button", { name: /Da, confirmă plata/i });
  // `click` cu timeout scurt: dacă butonul e sub marginea ecranului și dialogul nu se derulează,
  // Playwright reîncearcă până la timeout cu „element is outside of the viewport" — exact bug-ul.
  await confirm.click({ timeout: 5000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Înregistrare plată"), null, { timeout: 15000 });
});

await browser.close();

console.log(`\n═══ ${pass}/${pass + fails.length} au trecut ═══`);
if (fails.length) { for (const f of fails) console.log("  •", f); process.exit(1); }
