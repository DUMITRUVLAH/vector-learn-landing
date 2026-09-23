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

/**
 * Pregătește o cerere ajunsă la finanțe, ca ecranul să aibă ce arăta.
 *
 * Aria contează, altfel ecranul rămâne gol și poarta „trece" pe nimic: cererea trebuie să stea pe
 * un proiect pe care îl vede și cel care o depune, și omul de la finanțe (`accessibleScopes` taie
 * restul), cu plătitorul și codul bugetar ale ACELUIAȘI proiect — altfel PATCH-ul cade cu
 * `project_not_in_payer` / `budget_code_not_in_payer` și cererea pleacă mai departe goală, ca să
 * fie oprită abia la depunere. Prima versiune citea `?.items?.[0]?.id` din răspunsuri care se
 * numesc `projects` / `departments` / `budgetCodes`: toate trei ieșeau `undefined`, cererea nu
 * avea proiect, iar coada de finanțe nu o arăta nimănui.
 */
async function seedInFinance() {
  const ctx = {};
  for (const [role, email] of Object.entries({
    admin: "admin@atic.demo.io", approver: "approver@atic.demo.io",
    requestor: "requestor@atic.demo.io", finance: "finance@atic.demo.io",
  })) {
    ctx[role] = await request.newContext({ baseURL: BASE });
    await ctx[role].post("/api/auth/login", { data: { email, password: PW } });
  }
  const j = async (r) => { try { return await r.json(); } catch { return null; } };
  const financeProjects = (await j(await ctx.finance.get("/api/par/projects")))?.projects ?? [];
  const mineProjects = (await j(await ctx.requestor.get("/api/par/projects")))?.projects ?? [];
  // Cine depune: solicitantul, dacă are un proiect comun cu finanțele; altfel adminul, care le vede
  // pe toate. Tot ce contează e ca cererea să ajungă vizibilă în coada de finanțe.
  const shared = financeProjects.find((p) => mineProjects.some((m) => m.id === p.id));
  const author = shared ? "requestor" : "admin";
  const project = shared ?? financeProjects[0];
  if (!project) throw new Error("omul de la finanțe nu e pe niciun proiect — coada n-are ce arăta");
  const payerId = project.payerId ?? project.payer_id ?? null;
  const dept = (await j(await ctx.admin.get("/api/par/departments")))?.departments?.[0]?.id;
  const bc = ((await j(await ctx.admin.get("/api/par/budget-codes")))?.budgetCodes ?? [])
    .find((x) => (x.payerId ?? x.payer_id) === payerId)?.id ?? null;
  // Aprobatorul trebuie să aibă și el proiectul în arie, altfel pasul de aprobare nu e al nimănui:
  // `par_admin` NU mai e cheie universală (decizia owner-ului, 09.09.2026 — vezi `stepMatchesViewer`),
  // deci singurul care poate semna un pas de rol „approver" e cine are chiar acel rol. Adăugăm
  // proiectul la aria lui, păstrând ce avea (ruta înlocuiește lista, nu completează).
  const approverId = (await j(await ctx.approver.get("/api/par/me")))?.userId;
  const approverProjects = (await j(await ctx.approver.get("/api/par/projects")))?.projects ?? [];
  const union = [...new Set([...approverProjects.map((x) => x.id), project.id])];
  await ctx.admin.put(`/api/par/profiles/${approverId}/projects`, { data: { project_ids: union } });

  const id = (await j(await ctx[author].post("/api/par", { data: {} })))?.id;
  const patched = await ctx[author].patch(`/api/par/${id}`, { data: {
    purpose: "execute_payment", currency: "MDL", end_use: "Verificare pe telefon",
    payee_name: "Centrul de Resurse Juridice", payee_iban: "MD80VI000002224217675MDL",
    payee_idnp: "2002600012345", payee_bank: "Victoriabank",
    department_id: dept, project_id: project.id, payer_id: payerId,
    ...(bc ? { budget_code_id: bc } : {}) } });
  if (!patched.ok()) throw new Error(`fixtura de finanțe nu s-a putut completa: ${patched.status()} ${(await patched.text()).slice(0, 140)}`);
  await ctx[author].post(`/api/par/${id}/line-items`, { data: { description: "Audit", quantity: 1, unit: "buc", unit_price_cents: 200000 } });
  const sub = await ctx[author].post(`/api/par/${id}/submit`, { data: {} });
  if (!sub.ok()) throw new Error(`fixtura de finanțe nu s-a putut depune: ${sub.status()} ${(await sub.text()).slice(0, 140)}`);
  for (const role of ["approver", "admin"]) {
    if ((await j(await ctx.admin.get(`/api/par/${id}`)))?.status === "in_finance") break;
    await ctx[role].post(`/api/par/${id}/approve`, { data: { comment: "ok", signatureName: "Test" } });
  }
  const finalStatus = (await j(await ctx.admin.get(`/api/par/${id}`)))?.status;
  if (finalStatus !== "in_finance") throw new Error(`fixtura a rămas în ${finalStatus}, nu a ajuns la finanțe`);
  for (const c of Object.values(ctx)) await c.dispose();
  return id;
}

await seedInFinance();

const browser = await chromium.launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Un telefon nou. `__phoneW` e lățimea REALĂ a ecranului, pusă în pagină înainte de orice cod al
 * aplicației: verificările nu se pot sprijini pe `window.innerWidth`, fiindcă acela crește odată
 * cu depășirea (vezi `mustFitPhone`) și ar face orice măsurătoare de lățime să treacă mereu.
 */
async function newPhone(storageState) {
  const ctx = await browser.newContext({
    ...devices["iPhone 13"], locale: "ro-RO", serviceWorkers: "block",
    ...(storageState ? { storageState } : {}),
  });
  const width = devices["iPhone 13"].viewport.width;
  await ctx.addInitScript((w) => { window.__phoneW = w; }, width);
  return ctx.newPage();
}

const page = await newPhone();

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
    const vw = window.__phoneW ?? window.innerWidth;
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

/**
 * Lățimea ecranului e cea a TELEFONULUI, nu `window.innerWidth`.
 *
 * Capcană descoperită la 14.09.2026: pe mobil, conținutul mai lat decât ecranul nu produce o bară
 * de derulare — browserul lărgește fereastra de layout și micșorează toată pagina ca să încapă.
 * Fișa unei cereri raporta `innerWidth === 719` pe un iPhone de 390px, deci verificarea clasică
 * `scrollWidth <= innerWidth` era ADEVĂRATĂ exact în cazul pe care trebuia să-l prindă — și
 * pagina se deschidea zoom-ată la 54%, cu text de nedeslușit. Referința corectă e lățimea cerută
 * contextului (`viewportSize()`), singura care nu se mișcă sub picioarele testului.
 */
async function mustFitPhone(pg, where) {
  const deviceW = pg.viewportSize().width;
  const m = await pg.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    layoutW: window.innerWidth,
  }));
  must(
    m.scrollW <= deviceW + 1 && m.layoutW <= deviceW + 1,
    `${where}: ${Math.max(m.scrollW, m.layoutW)}px de conținut pe un ecran de ${deviceW}px` +
      (m.layoutW > deviceW + 1 ? ` (pagina se deschide micșorată la ${Math.round((deviceW / m.layoutW) * 100)}%)` : ""),
  );
}

await T("nimic nu iese lateral din ecran", async () => {
  await mustFitPhone(page, "coada de finanțe");
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


// ═══════════════════════════════════════════════════════════════════════════════
// CERERI ȘI APROBĂRI pe telefon (cerere owner, 14.09.2026: „verifică e2e pe mobile
// și fă modulul de PAR-uri mult mai ușor de utilizat — nu setările, ci cererile și
// aprobările").
//
// Aceleași două întrebări ca mai sus, pe cele două ecrane pe care trăiește modulul:
// se CITEȘTE cererea fără să tragi pagina lateral, și se poate DECIDE de pe telefon.
// ═══════════════════════════════════════════════════════════════════════════════

const api = {};
for (const [role, email] of Object.entries({
  admin: "admin@atic.demo.io", approver: "approver@atic.demo.io", requestor: "requestor@atic.demo.io",
})) {
  api[role] = await request.newContext({ baseURL: BASE });
  await api[role].post("/api/auth/login", { data: { email, password: PW } });
}
const J = async (r) => { try { return await r.json(); } catch { return null; } };

/**
 * Cereri reale în inboxul aprobatorului.
 *
 * Nu le poate depune `requestor`: în demo, solicitantul și aprobatorul stau pe proiecte diferite,
 * iar `filterStepsForUser` taie orice pas de pe un proiect din care aprobatorul nu face parte —
 * o cerere depusă de solicitant n-ar ajunge NICIODATĂ în inboxul lui, iar poarta ar trece verde
 * pe un ecran gol. Le depune `admin` (vede toate proiectele), pe un proiect al aprobatorului.
 * Segregarea atribuțiilor rămâne respectată: cine depune nu e cine semnează.
 */
async function seedPendingForApprover(count = 2) {
  const project = (await J(await api.approver.get("/api/par/projects")))?.projects?.[0];
  if (!project?.id) throw new Error("aprobatorul nu e pe niciun proiect — fixtura n-are unde depune");
  const payerId = project.payerId ?? project.payer_id ?? null;
  const dept = (await J(await api.admin.get("/api/par/departments")))?.departments?.[0]?.id;
  // Codul bugetar trebuie să fie al aceluiași plătitor (`budget_code_not_in_payer`) ȘI, dacă e legat
  // de un proiect, chiar de proiectul cererii (`budget_code_not_in_project`). Fixtura filtra doar
  // după plătitor, deci pe un seed cu mai multe proiecte alegea un cod al altui proiect și murea
  // la 400 — suita se oprea înainte să testeze ceva.
  const budgetCodeId = ((await J(await api.admin.get("/api/par/budget-codes")))?.budgetCodes ?? [])
    .find((x) => {
      const codePayer = x.payerId ?? x.payer_id ?? null;
      const codeProject = x.projectId ?? x.project_id ?? null;
      return (!codePayer || codePayer === payerId) && (!codeProject || codeProject === project.id);
    })?.id ?? null;
  const made = [];
  for (let i = 0; i < count; i++) {
    const id = (await J(await api.admin.post("/api/par", { data: {} })))?.id;
    if (!id) throw new Error("nu s-a putut crea ciorna de test");
    const patched = await api.admin.patch(`/api/par/${id}`, { data: {
      purpose: "execute_payment", currency: "MDL",
      end_use: "Servicii de consultanță pentru programul de instruire",
      payee_name: `Furnizor Mobil ${i + 1} SRL`, payee_iban: "MD24AG000225100013104168",
      payee_idnp: "2002600012345", payee_bank: "Victoriabank",
      department_id: dept, project_id: project.id, payer_id: payerId,
      ...(budgetCodeId ? { budget_code_id: budgetCodeId } : {}) } });
    if (!patched.ok()) throw new Error(`fixtura nu s-a putut completa: ${patched.status()} ${(await patched.text()).slice(0, 140)}`);
    await api.admin.post(`/api/par/${id}/line-items`, { data: { description: "Servicii de consultanță", quantity: 1, unit: "buc", unit_price_cents: 120000 + i * 5000 } });
    const sub = await api.admin.post(`/api/par/${id}/submit`, { data: {} });
    if (!sub.ok()) throw new Error(`fixtura nu s-a putut depune: ${sub.status()} ${(await sub.text()).slice(0, 140)}`);
    made.push(id);
  }
  return made;
}

const seeded = await seedPendingForApprover(2);
const seededNo = (await J(await api.admin.get(`/api/par/${seeded[0]}`)))?.requestNo ?? null;

/** Un telefon nou, autentificat ca rolul cerut. */
async function phoneAs(role) {
  const pg = await newPhone(await api[role].storageState());
  pg.on("pageerror", (e) => fails.push(`JS crash (${role}) — ${String(e.message).slice(0, 140)}`));
  return pg;
}

/** Textul se vede ÎN lățimea ecranului — nu doar „există în DOM", la 900px în dreapta. */
const inViewport = (re) =>
  [...document.querySelectorAll("body *")].some((el) => {
    if (el.children.length) return false;
    if (!re.test((el.textContent ?? "").trim())) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.left >= -1 && r.right <= (window.__phoneW ?? window.innerWidth) + 1;
  });

/**
 * Ținta reală a degetului, nu dreptunghiul elementului.
 *
 * Bifele (16px) și comutatoarele (24px) au dimensiunea lor de desen; ce contează e unde apeși.
 * Eticheta din jurul bifei și pseudo-elementul comutatorului întind zona de apăsare la 44px —
 * iar singurul mod de a verifica asta e să întrebi browserul CE element răspunde la un punct
 * aflat la 20px deasupra și dedesubtul centrului.
 */
const hitAreaCoversTap = (selector) => {
  const el = document.querySelector(selector);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  // Ce se întâmplă CU ADEVĂRAT la o apăsare în acel punct. Un simplu „elementul de sub deget îl
  // conține pe al meu" ar fi prea îngăduitor: orice control înfășurat într-un `div` de 44px ar
  // trece, deși apăsarea pe div nu declanșează nimic. Trec doar elementul însuși, urmașii lui și
  // un `<label>` care îl înfășoară — singurul înveliș care chiar transmite apăsarea mai departe.
  const hits = (y) => {
    const t = document.elementFromPoint(cx, y);
    if (!t) return false;
    if (t === el || el.contains(t)) return true;
    const lab = t.closest("label");
    return !!lab && lab.contains(el);
  };
  const at = (y) => { const t = document.elementFromPoint(cx, y); return t ? `${t.tagName}.${(typeof t.className === "string" ? t.className : "").slice(0, 28)}` : "nimic"; };
  return { found: true, top: hits(cy - 20), bottom: hits(cy + 20), at: [at(cy - 20), at(cy), at(cy + 20)] };
};

/**
 * Ținta reală a unui control, măsurată după ce l-am adus în ecran.
 *
 * Derularea se face într-un pas SEPARAT și se așteaptă: aplicația are `scroll-behavior: smooth`,
 * deci `scrollIntoView` nu mută nimic până la următoarele cadre — un `getBoundingClientRect`
 * chemat imediat după el citește vechea poziție, iar verificarea cădea pe bara de navigare de jos
 * în loc de controlul căutat.
 */
async function tapTarget(pg, selector) {
  await pg.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "center" }), selector);
  await wait(900);
  return pg.evaluate(({ src, sel }) => new Function("sel", `return (${src})(sel)`)(sel), { src: hitAreaCoversTap.toString(), sel: selector });
}

// ── Aprobări ─────────────────────────────────────────────────────────────────
const appr = await phoneAs("approver");
await appr.goto(`${BASE}/#/business/par/inbox`, { waitUntil: "load" });
await wait(2500);

await T("inbox aprobatori: cererea se citește fără să tragi pagina lateral", async () => {
  const seen = await appr.evaluate(({ src, no }) => {
    const inViewportFn = new Function("re", `return (${src})(re)`);
    return {
      numar: inViewportFn(new RegExp(`^${no}$`)),
      beneficiar: inViewportFn(/Furnizor Mobil \d SRL/),
      suma: inViewportFn(/1\.2\d0,00/),
      pentruCe: inViewportFn(/Servicii de consultanță/),
    };
  }, { src: inViewport.toString(), no: seededNo });
  must(seen.numar, "numărul cererii nu încape în lățimea ecranului");
  must(seen.beneficiar, "beneficiarul nu încape în lățimea ecranului");
  must(seen.suma, "suma nu încape în lățimea ecranului");
  must(seen.pentruCe, "motivul cererii nu încape în lățimea ecranului");
});

await T("inbox aprobatori: nimic nu iese lateral din ecran", async () => {
  await mustFitPhone(appr, "inboxul aprobatorului");
});

await T("inbox aprobatori: cele trei decizii sunt în ecran și de mărimea unui deget", async () => {
  const btns = await appr.evaluate(() => {
    const out = {};
    for (const [key, re] of [["aproba", /^Aprobă /], ["modificari", /^Solicită modificări/], ["respinge", /^Respinge /]]) {
      const el = [...document.querySelectorAll("button")].find((b) => re.test(b.getAttribute("aria-label") ?? ""));
      if (!el) { out[key] = null; continue; }
      const r = el.getBoundingClientRect();
      out[key] = { w: Math.round(r.width), h: Math.round(r.height), inView: r.left >= -1 && r.right <= window.innerWidth + 1 };
    }
    return out;
  });
  for (const [key, m] of Object.entries(btns)) {
    must(m, `butonul „${key}" nu există pe ecranul telefonului`);
    must(m.inView, `butonul „${key}" e dincolo de marginea ecranului`);
    must(m.h >= 43.5 && m.w >= 43.5, `butonul „${key}" e ${m.w}×${m.h}px, sub ținta de 44px`);
  }
});

await T("inbox aprobatori: bifa de selecție se poate nimeri cu degetul", async () => {
  const hit = await tapTarget(appr, 'input[type="checkbox"][aria-label^="Selectează PAR"]');
  must(hit.found, "nu există bifă de selecție pe card");
  must(hit.top && hit.bottom, `zona de apăsare a bifei e mai mică de 44px pe verticală (${hit.at?.join(" / ")})`);
});

await T("[blocant] aprobarea se poate DUCE LA CAPĂT de pe telefon", async () => {
  const before = (await J(await api.admin.get(`/api/par/${seeded[0]}`)))?.status;
  must(before === "pending_approval", `fixtura nu e în aprobare (${before})`);
  await appr.getByRole("button", { name: new RegExp(`^Aprobă ${seededNo}$`) }).click({ timeout: 5000 });
  // Butonul de trimitere e în josul dialogului: dacă panoul nu se derulează, Playwright cade cu
  // „element is outside of the viewport" — exact defectul pe care îl păzim.
  await appr.getByRole("button", { name: /^Aprobă$/ }).last().click({ timeout: 5000 });
  await appr.waitForTimeout(2000);
  const after = (await J(await api.admin.get(`/api/par/${seeded[0]}`)))?.status;
  must(after && after !== "pending_approval", `starea cererii a rămas ${after} — decizia nu a ajuns la server`);
});

// ── Cereri ───────────────────────────────────────────────────────────────────
const req = await phoneAs("admin");
await req.goto(`${BASE}/#/business/par/${seeded[1]}`, { waitUntil: "load" });
await wait(2500);

await T("fișa cererii: nimic nu iese lateral din ecran", async () => {
  // Cele patru butoane din antet cereau 699px pe un rând, iar rândul refuza să se rupă: fișa se
  // deschidea micșorată la 54%, cu tot textul de nedeslușit.
  await mustFitPhone(req, "fișa cererii");
});

await T("fișa cererii: suma, beneficiarul și articolele se citesc fără derulare laterală", async () => {
  const seen = await req.evaluate((src) => {
    const f = new Function("re", `return (${src})(re)`);
    return { suma: f(/1\.2\d5,00|1\.2\d0,00/), beneficiar: f(/Furnizor Mobil \d SRL/), iban: f(/^MD24AG000225100013104168$/) };
  }, inViewport.toString());
  must(seen.suma, "totalul nu încape în lățimea ecranului");
  must(seen.beneficiar, "beneficiarul nu încape în lățimea ecranului");
  must(seen.iban, "IBAN-ul nu încape în lățimea ecranului");
});

await T("fișa cererii: două texte nu se suprapun", async () => {
  // Rechizitele stau într-o grilă de două coloane: un IBAN de 24 de caractere ieșea peste coloana
  // „Bancă" și cele două șiruri se scriau unul peste altul. Vizibil dintr-o privire, invizibil
  // pentru orice test care se uită doar la marginea din dreapta a ecranului.
  const overlaps = await req.evaluate(() => {
    const leaves = [...document.querySelectorAll("body *")].filter((el) => {
      if (el.children.length) return false;
      if (!(el.textContent ?? "").trim()) return false;
      const cs = getComputedStyle(el);
      if (cs.position !== "static" && cs.position !== "relative") return false;
      if (cs.visibility === "hidden" || cs.opacity === "0") return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    });
    const bad = [];
    for (let i = 0; i < leaves.length; i++) {
      const a = leaves[i].getBoundingClientRect();
      for (let j = i + 1; j < leaves.length; j++) {
        const b = leaves[j].getBoundingClientRect();
        const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (dx > 2 && dy > 2) bad.push(`„${(leaves[i].textContent ?? "").trim().slice(0, 24)}" peste „${(leaves[j].textContent ?? "").trim().slice(0, 24)}"`);
      }
    }
    return bad.slice(0, 4);
  });
  must(overlaps.length === 0, overlaps.join(" · "));
});

await req.goto(`${BASE}/#/business/par/new`, { waitUntil: "load" });
await wait(3000);
// Formularul se deschide peste întrebarea „Cum începem cererea?" — pe telefon, primul lucru pe
// care îl atingi. O închidem ca un om, ca restul verificărilor să măsoare formularul, nu scrimul.
await req.getByText("Începe de la zero").click({ timeout: 5000 }).catch(() => {});
await wait(1200);

await T("cerere nouă: dialogul de start se închide de pe telefon", async () => {
  const stillOpen = await req.evaluate(() => document.body.innerText.includes("Cum începem cererea?"));
  must(!stillOpen, "întrebarea de start a rămas peste formular");
});

await T("cerere nouă: nimic nu iese lateral din ecran", async () => {
  await mustFitPhone(req, "formularul de cerere nouă");
});

await T("cerere nouă: comutatorul de urgență se poate nimeri cu degetul", async () => {
  const hit = await tapTarget(req, '[role="switch"][aria-label="Marchează cererea ca urgentă"]');
  must(hit.found, "comutatorul de urgență nu există în formular");
  must(hit.top && hit.bottom, `pastila are 24px: zona de apăsare nu ajunge la 44px (${hit.at?.join(" / ")})`);
});

await browser.close();
for (const c of Object.values(api)) await c.dispose();

console.log(`\n═══ ${pass}/${pass + fails.length} au trecut ═══`);
if (fails.length) { for (const f of fails) console.log("  •", f); process.exit(1); }
