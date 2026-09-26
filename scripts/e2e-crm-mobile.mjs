#!/usr/bin/env node
// CRM pe telefon: fiecare ecran, pe un iPhone, un Android de 360px și o tabletă, cu date reale.
//
// Cererea ownerului (26.09.2026): „e2e pe mobil — ușor de folosit, compact unde trebuie, scroll
// unde e ok, informația ușor de văzut, ușor de adăugat". Fiecare dorință e o verificare:
//
//   ușor de văzut   → nimic nu iese lateral din ecran și nu e tăiat; text de minim 12px;
//                     pagina nu se deschide micșorată (vezi mustFit — capcana din PAR, 14.09)
//   compact         → antetul + barele fixe nu mănâncă ecranul; conținutul începe în prima treime
//   scroll unde e ok→ un tabel/kanban lat e permis DOAR într-un container care derulează orizontal
//                     (pagina rămâne pe lățimea telefonului); ultimul rând nu e acoperit de un buton fix
//   ușor de adăugat → butonul de adăugare se vede fără derulare, are 44px, iar formularul se poate
//                     trimite de pe telefon — adăugăm efectiv un lead, o firmă, un produs, un task
//   atingibil       → butoanele și linkurile au zona de apăsare de minim 44px (WCAG 2.5.5 / CLAUDE.md §3.3)
//
// Rulare (server local pornit, cu dist/ construit):
//   node scripts/e2e-crm-mobile.mjs                   # toate ecranele, 3 dispozitive
//   node scripts/e2e-crm-mobile.mjs --only pipeline   # un ecran
//   SHOTS=/tmp/crm-mobil node scripts/e2e-crm-mobile.mjs   # + capturi de ecran
// Ținta: BASE, altfel E2E_PORT, altfel .dev-port. Scrie date doar într-un workspace nou.

import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { BASE, RUN, api, signupTenant, expectOk, listOf, idOf } from "./e2e-crm/lib.mjs";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const SHOTS = process.env.SHOTS || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const DEVICES = [
  { key: "iphone", label: "iPhone 13 (390px)", ...devices["iPhone 13"] },
  {
    key: "android", label: "Android 360px",
    ...devices["Pixel 5"], viewport: { width: 360, height: 740 }, screen: { width: 360, height: 800 },
  },
  { key: "tableta", label: "iPad Mini (768px)", ...devices["iPad Mini"] },
];

let pass = 0;
const fails = [];
const warnings = [];
async function T(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fails.push(`${name} — ${e.message}`); console.log(`  ✗ ${name} — ${e.message}`); }
}
const must = (c, m) => { if (!c) throw new Error(m); };

// ── 1. Un workspace nou, populat ca unul real ────────────────────────────────
// Ecranele arată altfel pe 3 leaduri decât pe 30: nume lungi de firme, sume mari, diacritice,
// taskuri restante — exact ce rupe un layout de telefon.
console.log(`CRM pe mobil · ${BASE}\n\nPopulez un workspace de test…`);
const S = await signupTenant("mobil");
const post = async (p, body) => expectOk(await api(S, "POST", p, body), `${p}: `);

const FIRME = [
  "Agroindustrial Nord-Vest Distribuție și Logistică SRL", "Moldcomert Grup SA", "Ștefănești Construcții Civile SRL",
  "TehnoSoft Soluții Informatice Integrate SRL", "Vinăria Dealul Mare Tradițional", "Farmacia Familiei Nr. 12",
];
const companies = [];
for (const name of FIRME) companies.push(await post("/api/crm/companies", { name, phone: "+37322123456", email: `office-${companies.length}@example.invalid`, industry: "Comerț", region: "Chișinău" }));

const PRODUSE = [
  ["Licență anuală FinFlow Business — pachet complet pentru 25 de utilizatori", 1850000],
  ["Implementare și instruire la sediul clientului", 450000],
  ["Abonament lunar", 99000],
];
const products = [];
for (const [name, price] of PRODUSE) products.push(await post("/api/crm/products", { name, listPriceCents: price, currency: "MDL", unit: "buc", sku: `MOB-${RUN}-${products.length}` }));

const pipeline = expectOk(await api(S, "GET", "/api/crm/leads/pipeline"));
const stageKeys = (pipeline.stages ?? []).map((s) => s.key);
const OAMENI = [
  "Ștefan Țurcanu", "Ana-Maria Bălănuță-Ciobanu", "Ion Popescu", "Cristina Rusu", "Mihai Ceban", "Elena Pîrțac",
  "Alexandru Vasilache-Donțu", "Maria Grosu", "Victor Țîbîrnă", "Daniela Chiriac", "Sergiu Bîrcă", "Irina Oriol",
  "Andrei Munteanu", "Olga Știrbu", "Vlad Lupașcu", "Natalia Guțu", "Radu Pleșca", "Tatiana Bejenari",
];
const leads = [];
for (let i = 0; i < OAMENI.length; i++) {
  const c = companies[i % companies.length];
  const lead = await post("/api/crm/leads", {
    fullName: OAMENI[i], phone: `+3736900${String(1000 + i)}`, email: `lead${i}-${RUN}@example.invalid`,
    company: c.name, dealName: `Implementare FinFlow la ${c.name}`, valueCents: 1250000 + i * 987650,
    productId: products[i % products.length].id, source: ["webform", "referral", "facebook_ad", "google_ads"][i % 4],
    notes: "A cerut ofertă pentru 25 de utilizatori, cu instruire inclusă. Revenim după ședința consiliului.",
  });
  leads.push(lead);
  const stage = stageKeys[i % Math.max(1, stageKeys.length - 1)];
  if (stage) await api(S, "PATCH", `/api/crm/leads/${lead.id}/stage`, { stage });
}
const now = Date.now();
for (let i = 0; i < 8; i++) {
  await post("/api/crm/tasks", {
    leadId: leads[i].id, title: ["Sună pentru confirmarea ofertei", "Trimite contractul semnat spre verificare juridică", "Programează demonstrația"][i % 3],
    dueAt: new Date(now + (i - 3) * 86400000).toISOString(), dueHasTime: i % 2 === 0,
  });
}
for (let i = 0; i < 6; i++) {
  await api(S, "POST", `/api/crm/leads/${leads[i].id}/interactions`, { type: "note", body: "Discuție telefonică: interesat, cere reducere de 10% pentru plata anuală." });
  await api(S, "POST", "/api/crm/tags", { leadId: leads[i].id, tag: ["cald", "B2B", "revenire"][i % 3] });
}
console.log(`  ${leads.length} leaduri, ${companies.length} firme, ${products.length} produse, 8 taskuri\n`);

// ── 2. Ecranele ──────────────────────────────────────────────────────────────
// `add`: textul butonului de adăugare pe care un om îl caută pe ecranul ăla (dacă ecranul are unul).
const SCREENS = [
  { key: "home", path: "/business/crm", expect: /CRM/i },
  { key: "pipeline", path: "/business/crm/pipeline", expect: /Lead nou|Leaduri|Pipeline/i, add: /lead nou|adaugă lead|^\+$/i },
  { key: "astazi", path: "/business/crm/astazi", expect: /Astăzi|Azi|task/i },
  { key: "clienti", path: "/business/crm/clienti", expect: /Clienți|Firme/i, add: /firmă nouă|client nou|adaugă/i },
  { key: "fisa-client", path: `/business/crm/clienti/${companies[0].id}`, expect: /Agroindustrial/i },
  { key: "produse", path: "/business/crm/produse", expect: /Produse/i, add: /produs nou|adaugă produs|adaugă/i },
  { key: "rapoarte", path: "/business/crm/rapoarte", expect: /Rapoarte|Raport/i },
  { key: "palnie", path: "/business/crm/palnie", expect: /Pâlnie|Conversie/i },
  { key: "documente", path: "/business/crm/documente", expect: /Acte|Documente/i },
  { key: "automatizari", path: "/business/crm/automatizari", expect: /Automatiz/i },
  { key: "comunicare", path: "/business/crm/comunicare", expect: /Comunicare|Mesaje|E-mail/i },
  { key: "cadente", path: "/business/crm/cadente", expect: /Cadenț/i },
  { key: "repartizare", path: "/business/crm/repartizare", expect: /Repartiz|Distribu/i },
  { key: "import", path: "/business/crm/import", expect: /Import/i },
  { key: "echipa", path: "/business/crm/echipa", expect: /Echip/i },
  { key: "drepturi", path: "/business/crm/drepturi", expect: /Drepturi|Permisiuni/i },
  { key: "jurnal", path: "/business/crm/jurnal", expect: /Jurnal/i },
  { key: "firma", path: "/business/crm/firma", expect: /Firma|Profil/i },
  { key: "api", path: "/business/crm/api", expect: /API|Formular/i },
].filter((s) => !only || s.key === only);

const ERROR_TEXT = /internal_error|Unexpected token|Something went wrong|A apărut o eroare|Eroare la încărcare|Nu s-a putut încărca/i;

/** Măsurătorile unei pagini, într-o singură trecere prin DOM. */
function measure(deviceW) {
  // Lățimea TELEFONULUI, nu a documentului: pe o pagină lățită, clientWidth e chiar valoarea greșită.
  const vw = deviceW || document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
  };
  // Un element e „într-un container care derulează orizontal" (ok) sau „în afara ecranului" (nu e ok).
  const inHScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (/(auto|scroll)/.test(st.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  const describe = (el) => {
    const t = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.getAttribute("placeholder") || el.tagName).replace(/\s+/g, " ").trim();
    return t.slice(0, 40) || el.tagName.toLowerCase();
  };

  // 1. Conținut tăiat lateral: element vizibil cu text care iese din ecran și NU e într-un scroller.
  const clipped = [];
  for (const el of document.querySelectorAll("main *, [role=dialog] *")) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 2 || r.left < -2) && !inHScroller(el)) clipped.push(`${describe(el)} (${Math.round(r.left)}→${Math.round(r.right)}px)`);
  }

  // 2. Text prea mic de citit.
  const tiny = new Set();
  for (const el of document.querySelectorAll("main *")) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
    if (!visible(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11.5) tiny.add(`${describe(el)} (${fs}px)`);
  }

  // 3. Zone de apăsare — măsurate separat, în smallTargets(), fiindcă cer derularea paginii.

  // 4. Cât din ecran mănâncă ce e fix/lipit sus și unde începe conținutul.
  let fixedTop = 0, fixedBottom = 0;
  for (const el of document.querySelectorAll("body *")) {
    const st = getComputedStyle(el);
    if (st.position !== "fixed" && st.position !== "sticky") continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.5) continue; // butoane plutitoare, nu bare
    if (r.top <= 1 && r.bottom < vh * 0.6) fixedTop = Math.max(fixedTop, r.bottom);
    if (r.bottom >= vh - 1 && r.top > vh * 0.4) fixedBottom = Math.max(fixedBottom, vh - r.top);
  }
  const main = document.querySelector("main") || document.body;
  const h1 = main.querySelector("h1, h2");
  const contentTop = h1 ? h1.getBoundingClientRect().top + window.scrollY : 0;

  // Cine lățește pagina: cel mai lat element care trece de marginea din dreapta, în afara unui scroller.
  let widest = null;
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    // Barele fixe (navigarea de jos) se întind după fereastra deja lățită — nu ele sunt cauza.
    if (getComputedStyle(el).position === "fixed" || el.closest("nav.fixed")) continue;
    if (r.right > vw + 1 && visible(el) && !inHScroller(el) && (!widest || r.right < widest.right)) {
      widest = { right: Math.round(r.right), what: `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 4).join(".")} „${describe(el)}”` };
    }
  }

  return {
    widest,
    vw, vh, scrollW: document.documentElement.scrollWidth, layoutW: window.innerWidth,
    clipped: clipped.slice(0, 8), clippedN: clipped.length,
    tiny: [...tiny].slice(0, 8), tinyN: tiny.size,
    fixedTop: Math.round(fixedTop), fixedBottom: Math.round(fixedBottom), contentTop: Math.round(contentTop),
    text: document.body.innerText,
  };
}

/**
 * Zonele de apăsare, pe toată pagina: derulăm ecran cu ecran și măsurăm doar ce e departe de
 * margini (un element tăiat de marginea ecranului n-are cum fi măsurat corect). O zonă poate fi mai
 * mare decât elementul (padding pe părinte, pseudo-element — vezi Switch): o considerăm suficientă
 * dacă punctele de la ±min/2 din centru ajung tot în element. Un link dintr-un rând de tabel pe care
 * îl apeși întreg (cursor: pointer, ≥ min) are ca țintă rândul.
 */
async function smallTargets(page, min, rootSel = "main") {
  return page.evaluate(async ([MIN, ROOT]) => {
    const root = [...document.querySelectorAll(ROOT)].pop();
    if (!root) return [];
    const vh = window.innerHeight;
    const seen = new Set();
    const small = [];
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const st = getComputedStyle(el);
      return st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
    };
    const describe = (el) => (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.getAttribute("placeholder") || el.tagName).replace(/\s+/g, " ").trim().slice(0, 40);
    const H = MIN / 2 - 1;
    let scroller = null;
    for (let p = root; p; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1) { scroller = p; break; }
    }
    const total = scroller ? scroller.scrollHeight : document.documentElement.scrollHeight;
    for (let y = 0; y < total; y += Math.max(200, vh - 200)) {
      if (scroller) scroller.scrollTo({ top: y, behavior: "instant" }); else window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 30));
      const targets = root.querySelectorAll("button, a[href], [role=button], input:not([type=hidden]), select, [role=tab], [role=checkbox], [role=switch]");
      for (const el of targets) {
        if (seen.has(el) || !visible(el) || el.closest("[aria-hidden=true]") || el.disabled) continue;
        const r = el.getBoundingClientRect();
        const cy = r.top + r.height / 2, cx = r.left + r.width / 2;
        if (cy - MIN < 70 || cy + MIN > vh - 90) continue; // lângă bare/margini — îl prindem la pasul următor
        seen.add(el);
        const hits = (x, y2) => { const h = document.elementFromPoint(x, y2); return !!h && (h === el || el.contains(h)); };
        const hOk = r.height >= MIN - 0.5 || (hits(cx, cy - H) && hits(cx, cy + H));
        const wOk = r.width >= MIN - 0.5 || (hits(cx - H, cy) && hits(cx + H, cy));
        if (hOk && wOk) continue;
        const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
        const tr = el.closest("tr");
        const rowTarget = tr && getComputedStyle(tr).cursor === "pointer" && tr.getBoundingClientRect().height >= MIN - 0.5;
        if (!inline && !rowTarget) small.push(`${describe(el)} (${Math.round(r.width)}×${Math.round(r.height)})`);
      }
    }
    if (scroller) scroller.scrollTo({ top: 0, behavior: "instant" }); else window.scrollTo({ top: 0, behavior: "instant" });
    return small;
  }, [min, rootSel]);
}

async function openScreen(page, path) {
  const errors = [];
  const onErr = (e) => errors.push(e.message);
  page.on("pageerror", onErr);
  await page.goto(`${BASE}/#${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  page.off("pageerror", onErr);
  return errors;
}

const browser = await chromium.launch({ headless: true });
const cookieHeader = S.cookieHeader();
const cookies = cookieHeader.split("; ").filter(Boolean).map((kv) => {
  const i = kv.indexOf("=");
  return { name: kv.slice(0, i), value: kv.slice(i + 1), url: BASE };
});

for (const dev of DEVICES) {
  console.log(`\n── ${dev.label} ──`);
  const { key: dkey, label: _l, ...opts } = dev;
  const context = await browser.newContext({ ...opts, locale: "ro-RO" });
  await context.addCookies(cookies);
  const page = await context.newPage();
  const phone = dev.viewport.width < 600;

  for (const sc of SCREENS) {
    const where = `${dev.key} · ${sc.key}`;
    let errors = [], m = null;
    await T(`${where}: se deschide, fără erori`, async () => {
      errors = await openScreen(page, sc.path);
      must(!errors.length, `excepție JS: ${errors[0]?.slice(0, 140)}`);
      const url = page.url();
      must(url.includes(sc.path), `a ajuns la ${url.split("#")[1]} în loc de ${sc.path}`);
      m = await page.evaluate(measure, opts.viewport.width);
      must(!ERROR_TEXT.test(m.text), `pe ecran scrie o eroare: ${(m.text.match(ERROR_TEXT) || [""])[0]}`);
      must(sc.expect.test(m.text), `conținutul așteptat (${sc.expect}) lipsește`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${dev.key}-${sc.key}.png`, fullPage: true });
    });
    if (!m) continue;

    await T(`${where}: încape pe lățimea ecranului (fără zoom-out, fără derulare laterală)`, async () => {
      const w = opts.viewport.width;
      must(m.scrollW <= w + 1 && m.layoutW <= w + 1,
        `${Math.max(m.scrollW, m.layoutW)}px de conținut pe ${w}px` + (m.layoutW > w + 1 ? ` — pagina se deschide micșorată la ${Math.round((w / m.layoutW) * 100)}%` : "") + (m.widest ? ` · cel mai lat: ${m.widest.what} (până la ${m.widest.right}px)` : ""));
    });
    await T(`${where}: nimic nu e tăiat lateral (tabelele late derulează în containerul lor)`, async () => {
      must(m.clippedN === 0, `${m.clippedN} elemente ies din ecran: ${m.clipped.join("; ")}`);
    });
    await T(`${where}: textul se citește (minim 12px)`, async () => {
      must(m.tinyN === 0, `${m.tinyN} texte sub 12px: ${m.tiny.join("; ")}`);
    });
    // 44px pe telefon (CLAUDE.md §3.3); pe tabletă, 40px — decizia design system-ului (Button.tsx,
    // MOB-002: `max-sm:h-11`), unde densitatea de desktop rămâne.
    if (phone) {
      await T(`${where}: butoanele și linkurile au zonă de apăsare de 44px`, async () => {
        const small = await smallTargets(page, 44);
        must(small.length === 0, `${small.length} ținte prea mici: ${small.slice(0, 10).join("; ")}`);
      });
    } else {
      // Pe tabletă (≥ 640px) design system-ul păstrează densitatea de desktop (Button.tsx, MOB-002):
      // ce e sub 40px se raportează ca avertisment, nu pică poarta.
      const small = await smallTargets(page, 40);
      if (small.length) warnings.push(`${where}: ${small.length} ținte sub 40px — ${small.slice(0, 6).join("; ")}`);
    }
    if (phone) {
      await T(`${where}: compact — barele fixe lasă ecranul liber (≤ 25% sus, ≤ 15% jos)`, async () => {
        must(m.fixedTop <= m.vh * 0.25, `bara de sus ocupă ${m.fixedTop}px din ${m.vh}px (${Math.round((m.fixedTop / m.vh) * 100)}%)`);
        must(m.fixedBottom <= m.vh * 0.15, `bara de jos ocupă ${m.fixedBottom}px din ${m.vh}px`);
      });
      await T(`${where}: compact — titlul ecranului e în prima treime`, async () => {
        must(m.contentTop <= m.vh * 0.34, `titlul începe la ${m.contentTop}px pe un ecran de ${m.vh}px`);
      });
    }
    if (sc.add) {
      await T(`${where}: butonul de adăugare se vede fără derulare și e ușor de apăsat`, async () => {
        const btn = page.getByRole("button", { name: sc.add }).filter({ visible: true }).first();
        must(await btn.count(), `nu există un buton vizibil potrivit cu ${sc.add}`);
        const box = await btn.boundingBox();
        must(box && box.y >= 0 && box.y + box.height <= opts.viewport.height, `butonul e la y=${Math.round(box?.y ?? -1)}px, sub marginea ecranului`);
        const min = phone ? 43.5 : 39.5;
        must(box.height >= min && box.width >= min, `butonul are ${Math.round(box.width)}×${Math.round(box.height)}px`);
      });
    }
    await T(`${where}: la capătul paginii, ultimul rând nu e acoperit de un buton fix`, async () => {
      // Derulăm containerul care derulează EFECTIV: în shell nu e fereastra, ci un element interior.
      await page.evaluate(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
        for (let p = document.querySelector("main"); p; p = p.parentElement) {
          if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1) p.scrollTo({ top: p.scrollHeight, behavior: "instant" });
        }
      });
      await page.waitForTimeout(200);
      const covered = await page.evaluate(() => {
        const main = document.querySelector("main");
        if (!main) return null;
        const els = [...main.querySelectorAll("button, a[href], td, li, p, h3")].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.height > 0 && r.bottom <= window.innerHeight && r.bottom > window.innerHeight - 160;
        });
        const last = els[els.length - 1];
        if (!last) return null;
        const r = last.getBoundingClientRect();
        const h = document.elementFromPoint(r.left + Math.min(r.width / 2, 40), r.top + r.height / 2);
        return h && !last.contains(h) && !h.contains(last) && h.closest("main") !== main ? (h.innerText || h.getAttribute("aria-label") || h.tagName).slice(0, 40) : null;
      });
      must(!covered, `ultimul element e acoperit de „${covered}”`);
      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: "instant" });
        for (let p = document.querySelector("main"); p; p = p.parentElement) p.scrollTo({ top: 0, behavior: "instant" });
      });
    });
  }

  // ── 3. Adăugare reală de pe telefon (acțiunea, nu butonul) ──────────────────
  if (phone && (!only || only === "pipeline")) {
    await T(`${dev.key}: adaug un lead de pe telefon și îl găsesc pe tablă`, async () => {
      await openScreen(page, "/business/crm/pipeline");
      await page.getByRole("button", { name: /lead nou|adaugă lead/i }).filter({ visible: true }).first().click();
      const dialog = page.getByRole("dialog").last();
      await dialog.waitFor({ timeout: 5000 });
      const box = await dialog.boundingBox();
      must(box && box.width <= opts.viewport.width + 1, `formularul are ${Math.round(box?.width ?? 0)}px pe un ecran de ${opts.viewport.width}px`);
      const name = `Telefon ${dev.key} ${RUN}`;
      await dialog.getByLabel(/nume/i).first().fill(name);
      const submit = dialog.getByRole("button", { name: /salvează|adaugă|creează/i }).last();
      await submit.click({ timeout: 5000 });
      await page.waitForTimeout(1200);
      const found = listOf(expectOk(await api(S, "GET", `/api/crm/leads?search=${encodeURIComponent(name)}`)));
      must(found?.some((l) => l.fullName === name), "leadul nu a ajuns în bază");
    });
    await T(`${dev.key}: deschid fișa unui lead pe telefon și o pot citi și închide`, async () => {
      await openScreen(page, "/business/crm/pipeline");
      // Cartonașul poartă numele afacerii (dealName), nu al omului.
      await page.getByText(/^Implementare FinFlow la/).filter({ visible: true }).first().click({ timeout: 5000 });
      const sheet = page.getByRole("dialog").last();
      await sheet.waitFor({ timeout: 5000 });
      await page.waitForTimeout(500); // animația de intrare (translate) trebuie să se termine
      const box = await sheet.boundingBox();
      must(box && box.width <= opts.viewport.width + 1 && box.x >= -1, `fișa are ${Math.round(box?.width ?? 0)}px, de la x=${Math.round(box?.x ?? 0)}`);
      const sm = await page.evaluate(measure, opts.viewport.width);
      must(sm.clippedN === 0, `în fișă ies din ecran: ${sm.clipped.join("; ")}`);
      must(sm.tinyN === 0, `în fișă, text sub 12px: ${sm.tiny.join("; ")}`);
      const smallInSheet = await smallTargets(page, 44, "[role=dialog]");
      must(smallInSheet.length === 0, `în fișă, ${smallInSheet.length} ținte sub 44px: ${smallInSheet.slice(0, 8).join("; ")}`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${dev.key}-fisa-lead.png` });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      must(!(await page.getByRole("dialog").count()), "fișa nu se închide cu Escape");
    });
  }
  await context.close();
}

await browser.close();
console.log(`\n${pass} trec, ${fails.length} pică`);
if (warnings.length) { console.log(`\nAvertismente (${warnings.length}):`); for (const w of warnings) console.log(`  · ${w}`); }
if (fails.length) { console.log("\nCe pică:"); for (const f of fails) console.log(`  - ${f}`); }
process.exit(fails.length ? 1 : 0);
