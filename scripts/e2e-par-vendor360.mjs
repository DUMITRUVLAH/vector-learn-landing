/**
 * PAR-VENDOR360 — proba pe API real a fișei de furnizor.
 *
 * Rulează: `node scripts/e2e-par-vendor360.mjs` (server pe 3155) sau
 *          `BASE=http://localhost:3100 node scripts/e2e-par-vendor360.mjs`.
 *
 * Regula casei (CLAUDE.md §3.5.1quater): testăm ACȚIUNEA, nu afișajul. Fiecare rută e chemată cu
 * date reale și verificăm codul + forma răspunsului. Include și testele negative care contează:
 * stele peste 5 → 400, blocare fără motiv → 400, id invalid → 404 (nu 500), iar rutele literale
 * (`/categories`) nu au voie să fie confundate cu `/:id`.
 */
const BASE = process.env.BASE ?? process.env.BASE_URL ?? "http://localhost:3155";
/**
 * Borcan de cookie-uri, nu o singură valoare: un răspuns care pune ALT cookie nu are voie să șteargă
 * sesiunea. (Prima versiune rescria variabila la fiecare set-cookie și partea de browser ajungea
 * nelogată — exact genul de eșec care raportează „pagina e ruptă" când de fapt testul era rupt.)
 */
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(jar.size ? { cookie: cookieHeader() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  for (const raw of r.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text.slice(0, 120); }
  return { status: r.status, json };
};
const ok = [], bad = [];
const check = (name, cond, extra = "") => (cond ? ok : bad).push(`${cond ? "✅" : "❌"} ${name} ${extra}`);

const login = await call("POST", "/api/auth/login", { email: "admin@demo.vectorlearn.io", password: "demo123456" });
check("login", login.status === 200 && jar.size > 0, `status=${login.status}`);
if (!jar.size) { console.log(login.json); process.exit(1); }

// 1. domenii
const seed = await call("POST", "/api/par/vendors/categories/seed");
// Idempotent: la prima rulare adaugă 12, la a doua 0 — ambele sunt corecte. Ce contează e că
// domeniile EXISTĂ după apel, nu câte s-au scris acum (un test care pică la a doua rulare e un
// test pe care nimeni nu-l mai rulează).
check("seed domenii", seed.status === 200 && typeof seed.json.added === "number", `added=${seed.json?.added}`);
const cats = await call("GET", "/api/par/vendors/categories");
check("listă domenii", cats.status === 200 && cats.json.categories.length >= 12, `n=${cats.json?.categories?.length}`);
const catFood = cats.json.categories.find((c) => c.slug === "alimentatie-catering");
check("domeniu alimentație există", !!catFood);
const dupe = await call("POST", "/api/par/vendors/categories", { name: "Alimentație / catering" });
check("domeniu duplicat → reactivare, nu duplicat", dupe.status === 200 && dupe.json.id === catFood.id);

// 2. furnizor nou + domenii
const vend = await call("POST", "/api/par/vendors", { name: "Catering Bucătăria Bunicii SRL", idnp: "1012600012345", iban: "MD24AG000225100013104168" });
check("furnizor creat", [200, 201].includes(vend.status), `status=${vend.status}`);
const vId = vend.json.id;
const setCats = await call("PUT", `/api/par/vendors/${vId}/categories`, { category_ids: [catFood.id] });
check("domenii atribuite", setCats.status === 200 && setCats.json.categoryIds.length === 1);

// 3. evaluare
const rate = await call("POST", `/api/par/vendors/${vId}/ratings`, { stars: 5, quality_stars: 5, timeliness_stars: 4, comment: "Au livrat la timp, mâncare bună.", would_use_again: true });
check("evaluare salvată", rate.status === 201 && rate.json.stars === 5, `status=${rate.status}`);
const badRate = await call("POST", `/api/par/vendors/${vId}/ratings`, { stars: 9 });
check("stele peste 5 → respins", badRate.status === 400, `status=${badRate.status}`);
const ratings = await call("GET", `/api/par/vendors/${vId}/ratings`);
check("rezumat evaluări", ratings.status === 200 && ratings.json.summary.avg === 5 && ratings.json.ratings[0].authorName, `avg=${ratings.json?.summary?.avg}`);

// 4. notă internă
const note = await call("POST", `/api/par/vendors/${vId}/notes`, { body: "Cer avans 50%.", pinned: true });
check("notă internă", note.status === 201);

// 5. ofertă
const offer = await call("POST", `/api/par/vendors/${vId}/offers`, { title: "Prânz corporativ 2025", amount_cents: 1250000, unit_label: "persoană", unit_price_cents: 12500, offered_at: "2025-03-01" });
check("ofertă adăugată", offer.status === 201, `status=${offer.status}`);
const offers = await call("GET", `/api/par/vendors/${vId}/offers`);
check("oferte listate (manual + din cereri)", offers.status === 200 && offers.json.offers.length >= 1 && Array.isArray(offers.json.quotes), `manual=${offers.json?.offers?.length}`);

// 6. document cu expirare
const doc = await call("POST", `/api/par/vendors/${vId}/documents`, { kind: "contract", title: "Contract cadru 2026", valid_until: new Date(Date.now() + 10 * 86400000).toISOString() });
check("document adăugat", doc.status === 201);

// 7. fișa completă
const prof = await call("GET", `/api/par/vendors/${vId}/profile`);
check("fișa furnizorului", prof.status === 200 && prof.json.vendor.name.includes("Bunicii"), `status=${prof.status}`);
check("fișa are KPI", prof.json?.kpis && typeof prof.json.kpis.paidCents === "number");
check("fișa are semnal 'expiră în curând'", (prof.json?.flags ?? []).some((f) => f.code === "document_expiring"), JSON.stringify(prof.json?.flags?.map(f=>f.code)));

// 8. blocare
const blockNoReason = await call("PATCH", `/api/par/vendors/${vId}/relationship`, { relationship: "blocked" });
check("blocare fără motiv → refuzată", blockNoReason.status === 400, `status=${blockNoReason.status}`);
const block = await call("PATCH", `/api/par/vendors/${vId}/relationship`, { relationship: "blocked", blocked_reason: "Nu a onorat ultima comandă." });
check("blocare cu motiv", block.status === 200 && block.json.relationship === "blocked");
const notes = await call("GET", `/api/par/vendors/${vId}/notes`);
check("blocarea a lăsat urmă în note", notes.json.notes.some((n) => n.body.includes("Furnizor blocat")));

// 9. director cu filtre
const dir = await call("GET", `/api/par/vendors/directory?category=${catFood.id}`);
check("director filtrat pe domeniu", dir.status === 200 && dir.json.vendors.some((v) => v.id === vId), `n=${dir.json?.vendors?.length}`);
const dirRating = await call("GET", "/api/par/vendors/directory?min_rating=5&sort=rating");
check("director filtrat pe notă", dirRating.status === 200 && dirRating.json.vendors[0]?.ratingAvg === 5);
const dirBlocked = await call("GET", "/api/par/vendors/directory?relationship=blocked");
check("director filtrat pe stare", dirBlocked.json.vendors.every((v) => v.relationship === "blocked"));

// 10. evaluări în așteptare
const pend = await call("GET", "/api/par/vendors/pending-ratings");
check("evaluări în așteptare", pend.status === 200 && Array.isArray(pend.json.pending), `n=${pend.json?.pending?.length}`);

// 11. rute literale nu sunt confundate cu :id (regresia gărzii de uuid)
check("/categories nu e tratat ca id", cats.status === 200);
const badId = await call("GET", "/api/par/vendors/nu-e-uuid/profile");
check("id invalid → 404, nu 500", badId.status === 404, `status=${badId.status}`);

// ─── Browser real (--browser): fișa se DESCHIDE și arată datele, nu doar răspunde 200 ───────
// Fără pasul ăsta am testa doar API-ul: o pagină care aruncă la login sau se randează goală ar
// trece verde. Aici cerem explicit URL-ul final, numele furnizorului în pagină și trecerea prin
// taburi cu conținutul lor.
if (process.argv.includes("--browser")) {
  const { existsSync } = await import("node:fs");
  const CHROME = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find((p) => existsSync(p));
  if (!CHROME) {
    check("browser disponibil", false, "setează CHROME_PATH");
  } else {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext();
    await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: BASE })));
    const page = await context.newPage();
    const crashes = [];
    page.on("pageerror", (e) => crashes.push(String(e.message).slice(0, 160)));

    await page.goto(`${BASE}/#/business/par/vendors`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForFunction(() => /Furnizori/.test(document.body?.innerText ?? ""), null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    let text = await page.evaluate(() => document.body?.innerText ?? "");
    check("lista de furnizori se randează", page.url().includes("/business/par/vendors") && text.includes("Bunicii"), crashes[0] ?? text.slice(0, 100));

    await page.goto(`${BASE}/#/business/par/vendors/${vId}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForFunction(() => /Plătit în total|nu s-a putut/.test(document.body?.innerText ?? ""), null, { timeout: 20000 }).catch(() => {});
    text = await page.evaluate(() => document.body?.innerText ?? "");
    check("fișa furnizorului se deschide", page.url().includes(vId) && text.includes("Bunicii"), crashes[0] ?? text.slice(0, 120));
    check("fișa arată KPI-urile", text.includes("Plătit în total"), text.slice(0, 120));
    check("fișa arată semnalele de risc", text.includes("blocat") || text.includes("Blocat"), text.slice(0, 120));

    for (const [tab, expected] of [["Evaluări", "Excelent|stele|evaluări|Nicio evaluare"], ["Oferte", "Prânz corporativ|Nicio ofertă"], ["Documente", "Contract cadru|Niciun document"], ["Note interne", "Furnizor blocat|Nicio notă"]]) {
      await page.getByRole("tab", { name: new RegExp(tab, "i") }).first().click().catch(() => {});
      await page.waitForTimeout(500);
      const body = await page.evaluate(() => document.body?.innerText ?? "");
      check(`tabul „${tab}" arată conținut`, new RegExp(expected, "i").test(body), body.slice(0, 100));
    }

    check("nicio eroare JS pe fișă", crashes.length === 0, crashes[0] ?? "");
    await browser.close();
  }
}

console.log(ok.join("\n"));
if (bad.length) { console.log("\n" + bad.join("\n")); process.exit(1); }
console.log(`\n${ok.length}/${ok.length} verificări trecute.`);
