// Comportamentul real al firmelor, produselor cu stoc, actelor și importurilor.
//
// Fiecare grup lucrează în propriul workspace (signupTenant) — nimic nu atinge clientul ATIC din
// seed. Scenariile unui grup rulează în ordine și se sprijină unele pe altele prin `ctx.fp.<grup>`;
// fiecare scenariu INVOCĂ o acțiune și citește înapoi ce s-a schimbat (§3.5.1quater).

import {
  RUN, uid, api, signupTenant, expect, expectStatus, expectOk, expectClientError, expectNo5xx,
  listOf, idOf, RANDOM_UUID,
} from "../lib.mjs";

// ── Ajutoare ────────────────────────────────────────────────────────────────

const st = (ctx, g) => ((ctx.fp ??= {})[g] ??= {});

async function mkLead(s, body) {
  const r = await api(s, "POST", "/api/crm/leads", body);
  expectOk(r, "creare lead: ");
  expect(r.status === 201, `creare lead: așteptat 201, primit ${r.status}`);
  return r.json;
}
async function getLead(s, id) {
  return expectOk(await api(s, "GET", `/api/crm/leads/${id}`), "citire lead: ");
}
async function products(s) {
  return listOf(expectOk(await api(s, "GET", "/api/crm/products?includeInactive=1")));
}
async function product(s, id) {
  const p = (await products(s)).find((x) => x.id === id);
  expect(p, `produsul ${id} nu apare în listă`);
  return p;
}
async function companies(s, search = "") {
  return listOf(expectOk(await api(s, "GET", `/api/crm/companies${search ? `?search=${encodeURIComponent(search)}` : ""}`)));
}
async function overview(s, id) {
  return expectOk(await api(s, "GET", `/api/crm/companies/${id}/overview`), "fișa firmei: ");
}
async function interactions(s, leadId) {
  return listOf(expectOk(await api(s, "GET", `/api/crm/leads/${leadId}/interactions`)));
}
async function moveStage(s, leadId, stage, lostReason) {
  const r = await api(s, "PATCH", `/api/crm/leads/${leadId}/stage`, lostReason ? { stage, lostReason } : { stage });
  return expectOk(r, `mutare în ${stage}: `);
}
async function importLeads(s, text, extra = {}) {
  const r = await api(s, "POST", "/api/crm/import/run", { text, ...extra });
  return expectOk(r, "import lead-uri: ");
}
async function previewLeads(s, text, extra = {}) {
  const r = await api(s, "POST", "/api/crm/import/preview", { text, ...extra });
  return expectOk(r, "previzualizare import: ");
}
async function leadsSearch(s, q) {
  return listOf(expectOk(await api(s, "GET", `/api/crm/leads?pageSize=100&search=${encodeURIComponent(q)}`)));
}
async function countAllLeads(s) {
  return expectOk(await api(s, "GET", "/api/crm/leads?pageSize=1")).total;
}
async function xlsxBase64(sheets) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of sheets) {
    const ws = wb.addWorksheet(name);
    for (const row of rows) ws.addRow(row);
  }
  return Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
}
const csv = (lines) => lines.join("\n");

export function register(suite) {
  firmeCrud(suite);
  firmeFisa(suite);
  firmeUnificare(suite);
  firmeImport(suite);
  produseCatalog(suite);
  produseStoc(suite);
  acteProfil(suite);
  acteOferte(suite);
  importLeaduri(suite);
  importMapari(suite);
}

// ═════════════════════════════════════════════════════════════════════════════
// FIRME — creare, căutare, editare
// ═════════════════════════════════════════════════════════════════════════════
function firmeCrud(suite) {
  const G = "firme:crud";
  const K = `Firme${RUN}`;
  suite.add(G, "workspace nou pentru firme", async (ctx) => {
    const x = st(ctx, G);
    x.s = await signupTenant(`firme-${RUN}`);
    x.b = await signupTenant(`firme-b-${RUN}`);
    expect(x.s.tenant?.id && x.b.tenant?.id && x.s.tenant.id !== x.b.tenant.id, "două workspace-uri distincte");
  });

  suite.add(G, "creez o firmă completă, cu diacritice", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.s, "POST", "/api/crm/companies", {
      name: `Agroteh Ștefănești ${K} SRL`, idno: "1003600012345", industry: "Agricultură", region: "Ștefan Vodă",
      companySize: "10-49", website: "https://agroteh.md", phone: "+373 22 123 456", email: "Office@Agroteh.MD",
      address: "str. Ștefan cel Mare 1", notes: "Client din târg",
    });
    expectStatus(r, 201);
    x.a = r.json;
    expect(x.a.id && x.a.name === `Agroteh Ștefănești ${K} SRL`, "numele nu s-a salvat");
    expect(x.a.nameNormalized === `agroteh stefanesti ${K.toLowerCase()} srl`, `nameNormalized greșit: ${x.a.nameNormalized}`);
  });

  suite.add(G, "telefonul și emailul firmei se normalizează", async (ctx) => {
    const a = st(ctx, G).a;
    expect(a.phoneNormalized === "22123456", `phoneNormalized: ${a.phoneNormalized}`);
    expect(a.emailNormalized === "office@agroteh.md", `emailNormalized: ${a.emailNormalized}`);
  });

  suite.add(G, "firma creată apare în listă cu toate câmpurile", async (ctx) => {
    const x = st(ctx, G);
    const found = (await companies(x.s)).find((c) => c.id === x.a.id);
    expect(found, "firma nu apare în listă");
    expect(found.industry === "Agricultură" && found.region === "Ștefan Vodă" && found.address === "str. Ștefan cel Mare 1", "câmpuri pierdute");
    expect(found.leadCount === 0, `leadCount la o firmă fără leaduri: ${found.leadCount}`);
  });

  suite.add(G, "o a doua și o a treia firmă", async (ctx) => {
    const x = st(ctx, G);
    x.bb = expectOk(await api(x.s, "POST", "/api/crm/companies", { name: `Brutăria Pâine ${K}`, email: "contact@paine.md", phone: "069111222" }));
    x.cc = expectOk(await api(x.s, "POST", "/api/crm/companies", { name: `Construct Nord ${K} SA`, idno: "1009600077777" }));
    expect(x.bb.id && x.cc.id, "id lipsă");
  });

  suite.add(G, "lista e ordonată după nume", async (ctx) => {
    const x = st(ctx, G);
    const names = (await companies(x.s)).map((c) => c.name);
    const sorted = [...names].sort((p, q) => (p < q ? -1 : p > q ? 1 : 0));
    expect(JSON.stringify(names) === JSON.stringify(sorted), `ordinea: ${names.join(" | ")}`);
  });

  suite.add(G, "numele de o literă e refuzat", async (ctx) => {
    const r = await api(st(ctx, G).s, "POST", "/api/crm/companies", { name: "A" });
    expectClientError(r);
    expect(r.status === 400, `status ${r.status}`);
  });
  suite.add(G, "firma fără nume e refuzată", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/companies", { idno: "1003600099999" }), 400);
  });
  suite.add(G, "IDNO peste 40 de caractere e refuzat", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/companies", { name: `Lung ${K}`, idno: "1".repeat(41) }), 400);
  });
  suite.add(G, "telefon peste 32 de caractere e refuzat", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/companies", { name: `Tel ${K}`, phone: "0".repeat(33) }), 400);
  });
  suite.add(G, "refuzurile n-au creat nimic", async (ctx) => {
    const x = st(ctx, G);
    const list = await companies(x.s);
    expect(list.length === 3, `așteptat 3 firme, sunt ${list.length}: ${list.map((c) => c.name).join(", ")}`);
  });

  suite.add(G, "caut după o parte din nume, fără să țin cont de majuscule", async (ctx) => {
    const x = st(ctx, G);
    const r = await companies(x.s, "AGROTEH");
    expect(r.length === 1 && r[0].id === x.a.id, `rezultate: ${r.map((c) => c.name)}`);
  });
  suite.add(G, "caut cu diacritice", async (ctx) => {
    const x = st(ctx, G);
    const r = await companies(x.s, "Pâine");
    expect(r.length === 1 && r[0].id === x.bb.id, `rezultate: ${r.map((c) => c.name)}`);
  });
  suite.add(G, "caut după IDNO", async (ctx) => {
    const x = st(ctx, G);
    const r = await companies(x.s, "1009600077777");
    expect(r.length === 1 && r[0].id === x.cc.id, `rezultate: ${r.map((c) => c.name)}`);
  });
  suite.add(G, "caut după email", async (ctx) => {
    const x = st(ctx, G);
    const r = await companies(x.s, "contact@paine");
    expect(r.length === 1 && r[0].id === x.bb.id, `rezultate: ${r.map((c) => c.name)}`);
  });
  suite.add(G, "caut după telefon", async (ctx) => {
    const x = st(ctx, G);
    const r = await companies(x.s, "111222");
    expect(r.length === 1 && r[0].id === x.bb.id, `rezultate: ${r.map((c) => c.name)}`);
  });
  suite.add(G, "căutarea fără potrivire întoarce listă goală", async (ctx) => {
    const r = await companies(st(ctx, G).s, `inexistent-${uid()}`);
    expect(r.length === 0, `${r.length} rezultate`);
  });
  suite.add(G, "căutare cu caractere de LIKE (% și _) nu cade", async (ctx) => {
    const r = await api(st(ctx, G).s, "GET", `/api/crm/companies?search=${encodeURIComponent("%_'\\")}`);
    expectNo5xx(r);
  });

  suite.add(G, "redenumesc firma și nameNormalized se recalculează", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "PATCH", `/api/crm/companies/${x.cc.id}`, { name: `Construcții Nord ${K} SA` }));
    expect(r.nameNormalized === `constructii nord ${K.toLowerCase()} sa`, `nameNormalized: ${r.nameNormalized}`);
    const found = (await companies(x.s, "Construcții")).find((c) => c.id === x.cc.id);
    expect(found, "firma redenumită nu se găsește după noul nume");
  });
  suite.add(G, "editarea parțială nu atinge celelalte câmpuri", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "PATCH", `/api/crm/companies/${x.a.id}`, { region: "Căușeni" }));
    const found = (await companies(x.s)).find((c) => c.id === x.a.id);
    expect(found.region === "Căușeni", `regiunea: ${found.region}`);
    expect(found.idno === "1003600012345" && found.email === "Office@Agroteh.MD" && found.notes === "Client din târg", "alte câmpuri s-au schimbat");
  });
  suite.add(G, "schimb telefonul și se renormalizează", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "PATCH", `/api/crm/companies/${x.a.id}`, { phone: "0 (68) 555-444" }));
    expect(r.phoneNormalized === "68555444", `phoneNormalized: ${r.phoneNormalized}`);
  });
  suite.add(G, "golesc emailul cu null", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "PATCH", `/api/crm/companies/${x.bb.id}`, { email: null }));
    const found = (await companies(x.s)).find((c) => c.id === x.bb.id);
    expect(found.email === null && found.emailNormalized === null, `email: ${found.email}/${found.emailNormalized}`);
  });
  suite.add(G, "redenumirea la o literă e refuzată și numele rămâne", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "PATCH", `/api/crm/companies/${x.bb.id}`, { name: "B" }), 400);
    const found = (await companies(x.s)).find((c) => c.id === x.bb.id);
    expect(found.name === `Brutăria Pâine ${K}`, `numele s-a schimbat: ${found.name}`);
  });
  suite.add(G, "editarea unei firme inexistente → 404", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "PATCH", `/api/crm/companies/${RANDOM_UUID}`, { region: "X" }), 404);
  });
  suite.add(G, "leadurile unei firme inexistente → 404", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "GET", `/api/crm/companies/${RANDOM_UUID}/leads`), 404);
  });
  suite.add(G, "leadurile unei firme fără leaduri → listă goală", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "GET", `/api/crm/companies/${x.a.id}/leads`));
    expect(Array.isArray(r.items) && r.items.length === 0, `items: ${JSON.stringify(r.items)}`);
  });
  suite.add(G, "fișa unei firme inexistente → 404", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "GET", `/api/crm/companies/${RANDOM_UUID}/overview`), 404);
  });
  suite.add(G, "fișa cu id care nu e uuid → 404, nu 500", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "GET", `/api/crm/companies/nu-e-uuid/overview`), 404);
  });
  suite.add(G, "fișa unei firme noi are statistici zero", async (ctx) => {
    const x = st(ctx, G);
    const o = await overview(x.s, x.a.id);
    expect(o.company.id === x.a.id, "altă firmă în fișă");
    expect(o.stats.deals === 0 && o.stats.openDeals === 0 && o.stats.openValueCents === 0 && o.stats.wonValueCents === 0, `stats: ${JSON.stringify(o.stats)}`);
    expect(o.stats.lastActivityAt === null, "lastActivityAt fără activitate");
    for (const k of ["deals", "contacts", "tasks", "documents", "activity"]) expect(Array.isArray(o[k]) && o[k].length === 0, `${k} nu e gol`);
  });
  suite.add(G, "alt workspace nu vede firmele în listă sau la căutare", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.b, "GET", `/api/crm/companies?search=${K}`);
    expect(listOf(expectOk(r)).length === 0 && !r.text.includes(x.a.id), "firmele se văd din alt workspace");
  });
  suite.add(G, "alt workspace nu poate edita firma", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.b, "PATCH", `/api/crm/companies/${x.a.id}`, { name: "Furată SRL" }), 404);
    const found = (await companies(x.s)).find((c) => c.id === x.a.id);
    expect(found.name.startsWith("Agroteh"), `numele s-a schimbat: ${found.name}`);
  });
  suite.add(G, "alt workspace nu deschide fișa firmei", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.b, "GET", `/api/crm/companies/${x.a.id}/overview`);
    expectStatus(r, 404);
    expect(!r.text.includes("Agroteh"), "refuzul scapă date");
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// FIRME — fișa clientului: agregatele sunt numere corecte
// ═════════════════════════════════════════════════════════════════════════════
function firmeFisa(suite) {
  const G = "firme:fisa";
  const FIRM = `Mobilier Ciocana ${RUN} SRL`;
  const OTHER = `Altă Firmă ${RUN} SRL`;
  suite.add(G, "workspace nou pentru fișa clientului", async (ctx) => {
    st(ctx, G).s = await signupTenant(`fisa-${RUN}`);
  });

  suite.add(G, "import 3 oportunități ale aceleiași firme + 1 a alteia", async (ctx) => {
    const x = st(ctx, G);
    const r = await importLeads(x.s, csv([
      "Nume;Telefon;Email;Companie;Valoare",
      `Andrei Munteanu;069200001;andrei@ciocana.md;${FIRM};1000`,
      `Irina Munteanu;069200002;irina@ciocana.md;${FIRM};2.000,50`,
      `Petru Cebotari;069200003;;${FIRM};3000`,
      `Olga Lungu;069200004;;${OTHER};9999`,
    ]));
    expect(r.created === 4, `created ${r.created}: ${JSON.stringify(r.details)}`);
  });

  suite.add(G, "importul a creat fișa firmei, o singură dată", async (ctx) => {
    const x = st(ctx, G);
    const list = await companies(x.s, "Mobilier Ciocana");
    expect(list.length === 1, `${list.length} fișe pentru aceeași firmă`);
    x.co = list[0];
    x.other = (await companies(x.s, "Altă Firmă"))[0];
    expect(x.other, "a doua firmă lipsește");
  });
  suite.add(G, "lista de firme arată 3 oportunități", async (ctx) => {
    const x = st(ctx, G);
    expect(x.co.leadCount === 3, `leadCount ${x.co.leadCount}`);
  });
  suite.add(G, "leadurile firmei sunt exact cele 3", async (ctx) => {
    const x = st(ctx, G);
    const items = listOf(expectOk(await api(x.s, "GET", `/api/crm/companies/${x.co.id}/leads`)));
    expect(items.length === 3, `${items.length} leaduri`);
    const byName = Object.fromEntries(items.map((l) => [l.fullName, l]));
    expect(byName["Andrei Munteanu"]?.valueCents === 100000, `valoare Andrei ${byName["Andrei Munteanu"]?.valueCents}`);
    expect(byName["Irina Munteanu"]?.valueCents === 200050, `valoare Irina (2.000,50) ${byName["Irina Munteanu"]?.valueCents}`);
    expect(!byName["Olga Lungu"], "leadul altei firme apare aici");
    x.ids = { a: byName["Andrei Munteanu"].id, i: byName["Irina Munteanu"].id, p: byName["Petru Cebotari"].id };
  });
  suite.add(G, "fișa: 3 oportunități deschise, valoare 6000,50", async (ctx) => {
    const x = st(ctx, G);
    const o = await overview(x.s, x.co.id);
    expect(o.stats.deals === 3 && o.stats.openDeals === 3, `stats ${JSON.stringify(o.stats)}`);
    expect(o.stats.openValueCents === 600050, `openValueCents ${o.stats.openValueCents}`);
    expect(o.stats.wonValueCents === 0, `wonValueCents ${o.stats.wonValueCents}`);
  });
  suite.add(G, "câștig oportunitatea lui Andrei", async (ctx) => {
    const x = st(ctx, G);
    const l = await moveStage(x.s, x.ids.a, "paid");
    expect(l.stage === "paid", `etapa ${l.stage}`);
  });
  suite.add(G, "pierd oportunitatea lui Petru, cu motiv", async (ctx) => {
    const x = st(ctx, G);
    const l = await moveStage(x.s, x.ids.p, "lost", "Preț prea mare");
    expect(l.stage === "lost", `etapa ${l.stage}`);
  });
  suite.add(G, "pierderea fără motiv e refuzată", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "PATCH", `/api/crm/leads/${x.ids.i}/stage`, { stage: "lost" }), 400);
    expect((await getLead(x.s, x.ids.i)).stage !== "lost", "leadul a ajuns pierdut fără motiv");
  });
  suite.add(G, "fișa: câștigat 1000, deschis 2000,50, pierdutul nu se numără", async (ctx) => {
    const x = st(ctx, G);
    const o = await overview(x.s, x.co.id);
    expect(o.stats.deals === 3, `deals ${o.stats.deals}`);
    expect(o.stats.openDeals === 1, `openDeals ${o.stats.openDeals}`);
    expect(o.stats.wonValueCents === 100000, `wonValueCents ${o.stats.wonValueCents}`);
    expect(o.stats.openValueCents === 200050, `openValueCents ${o.stats.openValueCents}`);
  });
  suite.add(G, "fișa: fiecare oportunitate are rezultatul și eticheta etapei", async (ctx) => {
    const x = st(ctx, G);
    const o = await overview(x.s, x.co.id);
    const d = Object.fromEntries(o.deals.map((v) => [v.id, v]));
    expect(d[x.ids.a]?.outcome === "won" && d[x.ids.a]?.stageLabel === "Client", `Andrei: ${JSON.stringify(d[x.ids.a])}`);
    expect(d[x.ids.p]?.outcome === "lost", `Petru: ${d[x.ids.p]?.outcome}`);
    expect(d[x.ids.i]?.outcome === "open" && d[x.ids.i]?.stageLabel === "Lead nou", `Irina: ${JSON.stringify(d[x.ids.i])}`);
  });
  suite.add(G, "fișa: persoanele leadurilor apar ca oameni de contact", async (ctx) => {
    const x = st(ctx, G);
    const o = await overview(x.s, x.co.id);
    const names = o.contacts.map((c) => c.fullName);
    for (const n of ["Andrei Munteanu", "Irina Munteanu", "Petru Cebotari"]) expect(names.includes(n), `lipsește ${n}: ${names}`);
    expect(!names.includes("Olga Lungu"), "persoana altei firme apare aici");
  });
  suite.add(G, "adaug un contact pe lead și apare în fișă, marcat principal", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "POST", "/api/crm/contacts", { leadId: x.ids.i, fullName: "Vadim Rotaru", role: "Director", phone: "+373 79 000 111", isPrimary: true }));
    const o = await overview(x.s, x.co.id);
    const c = o.contacts.find((p) => p.fullName === "Vadim Rotaru");
    expect(c && c.role === "Director" && c.isPrimary === true, `contact: ${JSON.stringify(c)}`);
  });
  suite.add(G, "un contact cu telefonul leadului nu apare de două ori", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "POST", "/api/crm/contacts", { leadId: x.ids.a, fullName: "Andrei M.", phone: "+37369200001" }));
    const o = await overview(x.s, x.co.id);
    const same = o.contacts.filter((p) => (p.phone ?? "").replace(/\D/g, "").endsWith("69200001"));
    expect(same.length === 1, `persoana cu același telefon apare de ${same.length} ori`);
  });
  suite.add(G, "o sarcină deschisă apare în fișă", async (ctx) => {
    const x = st(ctx, G);
    const t = expectOk(await api(x.s, "POST", "/api/crm/tasks", { leadId: x.ids.i, title: `Sună pentru mostre ${RUN}` }));
    x.task = idOf(t);
    const o = await overview(x.s, x.co.id);
    const found = o.tasks.find((v) => v.id === x.task);
    expect(found && found.leadName === "Irina Munteanu", `sarcina: ${JSON.stringify(found)}`);
  });
  suite.add(G, "sarcina încheiată dispare din fișă", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "POST", `/api/crm/tasks/${x.task}/complete`));
    const o = await overview(x.s, x.co.id);
    expect(!o.tasks.some((v) => v.id === x.task), "sarcina încheiată e încă în fișă");
  });
  suite.add(G, "o notiță pe lead apare în istoricul firmei, cu ultima activitate", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "POST", `/api/crm/leads/${x.ids.i}/interactions`, { type: "note", body: `Vrea mostre de stejar ${RUN}` }));
    const o = await overview(x.s, x.co.id);
    const n = o.activity.find((a) => a.body === `Vrea mostre de stejar ${RUN}`);
    expect(n && n.leadName === "Irina Munteanu", `notița: ${JSON.stringify(n)}`);
    expect(o.stats.lastActivityAt && o.stats.lastActivityAt === o.activity[0].occurredAt, `lastActivityAt ${o.stats.lastActivityAt}`);
  });
  suite.add(G, "istoricul firmei nu conține activitatea altei firme", async (ctx) => {
    const x = st(ctx, G);
    const olga = (await leadsSearch(x.s, "Olga Lungu"))[0];
    expectOk(await api(x.s, "POST", `/api/crm/leads/${olga.id}/interactions`, { type: "note", body: `Doar Olga ${RUN}` }));
    const o = await overview(x.s, x.co.id);
    expect(!o.activity.some((a) => a.body === `Doar Olga ${RUN}`), "activitatea altei firme apare în fișă");
  });
  suite.add(G, "o ofertă pe lead apare la actele firmei", async (ctx) => {
    const x = st(ctx, G);
    const d = await api(x.s, "POST", "/api/crm/documents", { leadId: x.ids.i, extraLines: [{ description: "Masă stejar", quantity: 2, unitPriceCents: 450000 }] });
    expectStatus(d, 201);
    const o = await overview(x.s, x.co.id);
    const doc = o.documents.find((v) => v.id === d.json.id);
    expect(doc && doc.totalCents === 900000 && doc.leadName === "Irina Munteanu", `act: ${JSON.stringify(doc)}`);
  });
  suite.add(G, "fișa celeilalte firme are doar oportunitatea ei", async (ctx) => {
    const x = st(ctx, G);
    const o = await overview(x.s, x.other.id);
    expect(o.stats.deals === 1 && o.stats.openValueCents === 999900, `stats ${JSON.stringify(o.stats)}`);
    expect(o.documents.length === 0, "actele altei firme apar aici");
  });
  suite.add(G, "reimportul aceluiași fișier nu dublează oportunitățile firmei", async (ctx) => {
    const x = st(ctx, G);
    const r = await importLeads(x.s, csv([
      "Nume;Telefon;Email;Companie;Valoare",
      `Andrei Munteanu;069200001;andrei@ciocana.md;${FIRM};1000`,
      `Irina Munteanu;069200002;irina@ciocana.md;${FIRM};2.000,50`,
    ]));
    expect(r.created === 0 && r.skipped === 2, `created ${r.created}, skipped ${r.skipped}`);
    const o = await overview(x.s, x.co.id);
    expect(o.stats.deals === 3, `deals ${o.stats.deals}`);
    expect((await companies(x.s, "Mobilier Ciocana")).length === 1, "a apărut o a doua fișă");
  });
  suite.add(G, "filtrul leadurilor după industria firmei (setată pe fișă)", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "PATCH", `/api/crm/companies/${x.co.id}`, { industry: `Mobilă-${RUN}` }));
    const items = listOf(expectOk(await api(x.s, "GET", `/api/crm/leads?pageSize=100&industry=${encodeURIComponent(`Mobilă-${RUN}`)}`)));
    const names = items.map((l) => l.fullName).sort();
    expect(JSON.stringify(names) === JSON.stringify(["Andrei Munteanu", "Irina Munteanu", "Petru Cebotari"]), `filtrul: ${names}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// FIRME — duplicate și unificare
// ═════════════════════════════════════════════════════════════════════════════
function firmeUnificare(suite) {
  const G = "firme:unificare";
  const NAME = `Radu Ciobanu ${RUN}`;
  suite.add(G, "workspace nou pentru unificare", async (ctx) => {
    const x = st(ctx, G);
    x.s = await signupTenant(`unif-${RUN}`);
    x.b = await signupTenant(`unif-b-${RUN}`);
  });

  suite.add(G, "două fișe ale aceluiași om (telefon + nume)", async (ctx) => {
    const x = st(ctx, G);
    x.p = await mkLead(x.s, { fullName: NAME, phone: "069300001", valueCents: 100000 });
    x.d = await mkLead(x.s, { fullName: NAME, phone: "+373 69 300 001", email: "radu@lemn.md", company: "Lemn Nord", dealName: "Ușă stejar", valueCents: 250000, notes: "Vine joi" });
    expect(x.p.id && x.d.id, "id lipsă");
  });
  suite.add(G, "două persoane cu aceeași centrală, nume diferite", async (ctx) => {
    const x = st(ctx, G);
    x.c1 = await mkLead(x.s, { fullName: `Nina Vlas ${RUN}`, phone: "022400400", company: "Centrala SRL" });
    x.c2 = await mkLead(x.s, { fullName: `Tudor Grosu ${RUN}`, phone: "022400400", company: "Centrala SRL" });
  });
  suite.add(G, "detectarea găsește perechea, cu motivul „Telefon identic”", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "GET", "/api/crm/companies/duplicates"));
    const cl = r.clusters.find((c) => c.records.some((l) => l.id === x.p.id));
    expect(cl, "perechea nu e detectată");
    expect(cl.records.some((l) => l.id === x.d.id), "duplicatul nu e în același grup");
    expect(cl.reasons.includes("Telefon identic") && cl.reasons.includes("Nume identic") && cl.score >= 60, `motive ${cl.reasons} scor ${cl.score}`);
  });
  suite.add(G, "centrala comună NU e duplicat (scor sub prag)", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "GET", "/api/crm/companies/duplicates"));
    expect(!r.clusters.some((c) => c.records.some((l) => l.id === x.c1.id)), "doi oameni cu aceeași centrală sunt dați ca duplicat");
  });
  suite.add(G, "pun etichete, contact, sarcină și notiță pe duplicat", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "POST", "/api/crm/tags", { leadId: x.p.id, tag: "vip" }));
    expectOk(await api(x.s, "POST", "/api/crm/tags", { leadId: x.d.id, tag: "vip" }));
    expectOk(await api(x.s, "POST", "/api/crm/tags", { leadId: x.d.id, tag: "lemn" }));
    x.contact = idOf(expectOk(await api(x.s, "POST", "/api/crm/contacts", { leadId: x.d.id, fullName: "Soția lui Radu", phone: "069300099" })));
    x.task = idOf(expectOk(await api(x.s, "POST", "/api/crm/tasks", { leadId: x.d.id, title: `Revino la Radu ${RUN}` })));
    expectOk(await api(x.s, "POST", `/api/crm/leads/${x.d.id}/interactions`, { type: "call", body: `Apel cu Radu ${RUN}`, direction: "outbound" }));
  });
  suite.add(G, "previzualizarea arată ce se păstrează și suma valorilor", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "POST", "/api/crm/companies/merge/preview", { primaryId: x.p.id, duplicateIds: [x.d.id] }));
    const plan = r.plan;
    expect(plan.valueCentsTotal === 350000, `valueCentsTotal ${plan.valueCentsTotal}`);
    const f = Object.fromEntries(plan.fields.map((v) => [v.field, v]));
    expect(f.email.keep === "duplicate" && f.email.value === "radu@lemn.md", `email ${JSON.stringify(f.email)}`);
    expect(f.fullName.keep === "primary" && f.phone.keep === "primary" && f.phone.value === "069300001", `phone ${JSON.stringify(f.phone)}`);
    expect(f.dealName.keep === "duplicate" && f.notes.keep === "duplicate", "golurile nu se completează din duplicat");
  });
  suite.add(G, "previzualizarea nu scrie nimic", async (ctx) => {
    const x = st(ctx, G);
    const p = await getLead(x.s, x.p.id);
    expect(p.email === null && p.valueCents === 100000, `principalul s-a schimbat: ${p.email} ${p.valueCents}`);
    const r = expectOk(await api(x.s, "GET", "/api/crm/companies/duplicates"));
    expect(r.clusters.some((c) => c.records.some((l) => l.id === x.d.id)), "duplicatul a dispărut după o simplă previzualizare");
  });
  suite.add(G, "previzualizarea cu principalul printre duplicate e refuzată", async (ctx) => {
    const x = st(ctx, G);
    expectClientError(await api(x.s, "POST", "/api/crm/companies/merge/preview", { primaryId: x.p.id, duplicateIds: [x.p.id] }));
  });
  suite.add(G, "previzualizarea cu un lead din alt workspace → 404", async (ctx) => {
    const x = st(ctx, G);
    const foreign = await mkLead(x.b, { fullName: NAME, phone: "069300001" });
    x.foreign = foreign.id;
    expectStatus(await api(x.s, "POST", "/api/crm/companies/merge/preview", { primaryId: x.p.id, duplicateIds: [foreign.id] }), 404);
  });
  suite.add(G, "unificarea într-el însuși e refuzată", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", "/api/crm/companies/merge", { primaryId: x.p.id, duplicateIds: [x.p.id] }), 400);
  });
  suite.add(G, "unificarea cu un lead inexistent → 404, nimic mutat", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", "/api/crm/companies/merge", { primaryId: x.p.id, duplicateIds: [x.d.id, RANDOM_UUID] }), 404);
    const tasks = listOf(expectOk(await api(x.s, "GET", `/api/crm/tasks?leadId=${x.d.id}`)));
    expect(tasks.some((t) => t.id === x.task), "sarcina s-a mutat deși unificarea a fost refuzată");
  });
  suite.add(G, "alt workspace nu poate unifica leadurile mele", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.b, "POST", "/api/crm/companies/merge", { primaryId: x.foreign, duplicateIds: [x.d.id] }), 404);
    expect((await getLead(x.s, x.d.id)).fullName === NAME, "duplicatul a fost atins de alt workspace");
  });
  suite.add(G, "unificarea reușește: valori însumate, goluri completate", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "POST", "/api/crm/companies/merge", { primaryId: x.p.id, duplicateIds: [x.d.id] }));
    expect(r.ok === true && r.mergedCount === 1, `răspuns ${JSON.stringify(r).slice(0, 200)}`);
    expect(r.lead.valueCents === 350000 && r.lead.email === "radu@lemn.md" && r.lead.dealName === "Ușă stejar", `lead ${JSON.stringify(r.lead).slice(0, 300)}`);
    expect(r.lead.phone === "069300001" && r.lead.company === "Lemn Nord", "telefonul principalului a fost rescris sau firma nu s-a completat");
  });
  suite.add(G, "citit înapoi: principalul are valorile unificate", async (ctx) => {
    const x = st(ctx, G);
    const p = await getLead(x.s, x.p.id);
    expect(p.valueCents === 350000 && p.email === "radu@lemn.md", `principal ${p.valueCents} ${p.email}`);
  });
  suite.add(G, "apelul duplicatului e acum în istoricul principalului", async (ctx) => {
    const x = st(ctx, G);
    const items = await interactions(x.s, x.p.id);
    expect(items.some((i) => i.body === `Apel cu Radu ${RUN}`), "apelul nu s-a mutat");
    expect(items.some((i) => i.type === "system" && /Unificare/.test(i.body ?? "")), "lipsește urma unificării");
  });
  suite.add(G, "contactul duplicatului s-a mutat pe principal", async (ctx) => {
    const x = st(ctx, G);
    const items = listOf(expectOk(await api(x.s, "GET", `/api/crm/contacts?leadId=${x.p.id}`)));
    expect(items.some((c) => c.id === x.contact), "contactul nu s-a mutat");
  });
  suite.add(G, "sarcina duplicatului s-a mutat pe principal", async (ctx) => {
    const x = st(ctx, G);
    const items = listOf(expectOk(await api(x.s, "GET", `/api/crm/tasks?leadId=${x.p.id}`)));
    expect(items.some((t) => t.id === x.task), "sarcina nu s-a mutat");
  });
  suite.add(G, "etichetele: cea nouă mutată, cea comună o singură dată", async (ctx) => {
    const x = st(ctx, G);
    const tags = listOf(expectOk(await api(x.s, "GET", `/api/crm/tags?leadId=${x.p.id}`))).map((t) => t.tag).sort();
    expect(JSON.stringify(tags) === JSON.stringify(["lemn", "vip"]), `etichete: ${tags}`);
  });
  suite.add(G, "duplicatul nu mai apare la detectare", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "GET", "/api/crm/companies/duplicates"));
    expect(!r.clusters.some((c) => c.records.some((l) => l.id === x.d.id)), "duplicatul unificat reapare la detectare");
  });
  suite.add(G, "duplicatul unificat dispare din lista de leaduri", async (ctx) => {
    const x = st(ctx, G);
    const ids = (await leadsSearch(x.s, NAME)).map((l) => l.id);
    expect(ids.includes(x.p.id), "principalul lipsește din listă");
    expect(!ids.includes(x.d.id), "duplicatul unificat e încă în lista de leaduri (se poate lucra pe el în paralel)");
  });
  suite.add(G, "duplicatul unificat dispare de pe tabla kanban", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "GET", `/api/crm/leads/pipeline?search=${encodeURIComponent(NAME)}`));
    const all = Object.values(r.grouped ?? {}).flat().map((l) => l.id);
    expect(all.includes(x.p.id), "principalul lipsește de pe tablă");
    expect(!all.includes(x.d.id), "duplicatul unificat e încă un card pe tablă");
  });
  suite.add(G, "a doua unificare a aceluiași duplicat → 404", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", "/api/crm/companies/merge", { primaryId: x.p.id, duplicateIds: [x.d.id] }), 404);
    expect((await getLead(x.s, x.p.id)).valueCents === 350000, "valoarea s-a adunat de două ori");
  });
  suite.add(G, "unific trei fișe deodată: valorile se adună toate", async (ctx) => {
    const x = st(ctx, G);
    const n = `Lilia Cozma ${RUN}`;
    const a = await mkLead(x.s, { fullName: n, email: "lilia@cozma.md", valueCents: 1000 });
    const b = await mkLead(x.s, { fullName: n, email: "LILIA@Cozma.md", valueCents: 2000 });
    const c = await mkLead(x.s, { fullName: n, email: "lilia@cozma.md", valueCents: 3000, phone: "060500500" });
    const r = expectOk(await api(x.s, "POST", "/api/crm/companies/merge", { primaryId: a.id, duplicateIds: [b.id, c.id] }));
    expect(r.mergedCount === 2 && r.lead.valueCents === 6000 && r.lead.phone === "060500500", `răspuns ${JSON.stringify(r.lead).slice(0, 200)}`);
  });
  suite.add(G, "unificarea mută oportunitatea pe firma duplicatului", async (ctx) => {
    const x = st(ctx, G);
    const firm = `Beta Grup ${RUN} SRL`;
    const n = `Sergiu Beta ${RUN}`;
    x.bp = await mkLead(x.s, { fullName: n, email: `sergiu-${RUN}@beta.md` });
    const imp = await importLeads(x.s, csv(["Nume;Email;Telefon;Companie", `${n};altul-${RUN}@beta.md;069600600;${firm}`]));
    expect(imp.created === 1, `import ${JSON.stringify(imp)}`);
    x.bd = (await leadsSearch(x.s, "069600600"))[0];
    x.beta = (await companies(x.s, "Beta Grup"))[0];
    expect(x.bd && x.beta, "duplicatul importat sau firma lui lipsesc");
    expectOk(await api(x.s, "POST", "/api/crm/companies/merge", { primaryId: x.bp.id, duplicateIds: [x.bd.id] }));
    const o = await overview(x.s, x.beta.id);
    expect(o.deals.some((d) => d.id === x.bp.id), `principalul nu a trecut pe firma Beta: ${o.deals.map((d) => d.fullName)}`);
  });
  suite.add(G, "după unificare, fișa firmei numără o singură oportunitate", async (ctx) => {
    const x = st(ctx, G);
    const o = await overview(x.s, x.beta.id);
    expect(o.stats.deals === 1 && !o.deals.some((d) => d.id === x.bd.id), `deals ${o.stats.deals}`);
    expect((await companies(x.s, "Beta Grup"))[0].leadCount === 1, "leadCount din listă numără și duplicatul");
  });
  suite.add(G, "după unificare, leadurile firmei nu mai includ duplicatul", async (ctx) => {
    const x = st(ctx, G);
    const items = listOf(expectOk(await api(x.s, "GET", `/api/crm/companies/${x.beta.id}/leads`)));
    expect(items.some((l) => l.id === x.bp.id), "principalul lipsește din leadurile firmei");
    expect(!items.some((l) => l.id === x.bd.id), `duplicatul unificat e încă listat la firmă (${items.length} leaduri, fișa spune 1)`);
  });
  suite.add(G, "corp cu duplicateIds gol e refuzat", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", "/api/crm/companies/merge", { primaryId: x.p.id, duplicateIds: [] }), 400);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// FIRME — importul listei de clienți
// ═════════════════════════════════════════════════════════════════════════════
function firmeImport(suite) {
  const G = "firme:import";
  const BASE_CSV = csv([
    "Denumire;IDNO;Telefon;Email;Raion;Domeniu;Persoana de contact",
    `Agroteh Ștefănești ${RUN} SRL;MD 1003600012345;+373 22 123 456;office@agroteh.md;Ștefan Vodă;Agricultură;Ion Rusu`,
    `Brutăria „Pâine Caldă” ${RUN};1004600054321;069111222;contact@paine.md;Chișinău;Alimentar;Maria Pop`,
    `Construct Nord ${RUN} SA;;079 333 444;info@constructnord;Bălți;Construcții;`,
    ";1009600011111;060000000;;;;",
    `Agroteh Ștefănești ${RUN} SRL (dublură);1003600012345;;;;;`,
    `Cafeneaua Ciocârlia ${RUN};;;;Orhei;HoReCa;Ana Ciobanu`,
  ]);
  const imp = (s, text, extra = {}) => api(s, "POST", "/api/crm/companies/import/run", { text, ...extra });
  const prev = (s, text, extra = {}) => api(s, "POST", "/api/crm/companies/import/preview", { text, ...extra });

  suite.add(G, "workspace nou pentru importul de firme", async (ctx) => {
    st(ctx, G).s = await signupTenant(`fimp-${RUN}`);
  });
  suite.add(G, "previzualizarea recunoaște separatorul și coloanele românești", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await prev(x.s, BASE_CSV));
    x.preview = r;
    expect(r.delimiter === ";", `separator ${r.delimiter}`);
    const m = r.mapping;
    expect(m[0] === "name" && m[1] === "idno" && m[2] === "phone" && m[3] === "email" && m[4] === "region" && m[5] === "industry" && m[6] === "notes", `mapare ${JSON.stringify(m)}`);
  });
  suite.add(G, "previzualizarea numără: 4 noi, 1 dublură, 1 eroare", async (ctx) => {
    const c = st(ctx, G).preview.counts;
    expect(c.total === 6 && c.new === 4 && c.duplicatesInFile === 1 && c.errors === 1 && c.exists === 0, `counts ${JSON.stringify(c)}`);
  });
  suite.add(G, "rândul fără denumire e eroare cu motivul spus", async (ctx) => {
    const rows = st(ctx, G).preview.rows;
    const e = rows.find((r) => r.status === "error");
    expect(e && e.errors.some((m) => /denumirea/i.test(m)), `eroarea: ${JSON.stringify(e)}`);
  });
  suite.add(G, "emailul greșit e semnalat, dar rândul rămâne importabil", async (ctx) => {
    const rows = st(ctx, G).preview.rows;
    const r = rows.find((v) => v.draft.name.startsWith("Construct Nord"));
    expect(r.status === "new" && r.warnings.some((w) => /email/i.test(w)), `rândul: ${JSON.stringify(r)}`);
  });
  suite.add(G, "previzualizarea nu scrie nimic", async (ctx) => {
    expect((await companies(st(ctx, G).s)).length === 0, "previzualizarea a creat firme");
  });
  suite.add(G, "importul creează exact cât a promis previzualizarea", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await imp(x.s, BASE_CSV, { fileName: "clienti.csv" }));
    expect(r.created === x.preview.counts.new && r.created === 4, `created ${r.created}`);
    expect(r.skipped === 2 && r.updated === 0, `skipped ${r.skipped} updated ${r.updated}`);
    expect(Array.isArray(r.details) && r.details.length === 1, `details ${JSON.stringify(r.details)}`);
    expect((await companies(x.s)).length === 4, "numărul de fișe diferă de raport");
  });
  suite.add(G, "IDNO-ul se scrie normalizat (fără MD și spații)", async (ctx) => {
    const x = st(ctx, G);
    const a = (await companies(x.s, "Agroteh"))[0];
    expect(a.idno === "1003600012345", `idno ${a.idno}`);
    expect(a.region === "Ștefan Vodă" && a.industry === "Agricultură" && a.phoneNormalized === "22123456", `câmpuri ${JSON.stringify(a).slice(0, 300)}`);
    expect(a.notes === "Ion Rusu", `notițe ${a.notes}`);
    x.agro = a;
  });
  suite.add(G, "ghilimelele românești din denumire se păstrează", async (ctx) => {
    const x = st(ctx, G);
    const b = (await companies(x.s, "Pâine Caldă"))[0];
    expect(b && b.name === `Brutăria „Pâine Caldă” ${RUN}`, `nume ${b?.name}`);
  });
  suite.add(G, "reimportul aceluiași fișier nu dublează nimic", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await imp(x.s, BASE_CSV));
    expect(r.created === 0 && r.counts.exists === 4, `created ${r.created} exists ${r.counts.exists}`);
    expect((await companies(x.s)).length === 4, "au apărut fișe dublate");
  });
  suite.add(G, "reimportul identic nu schimbă și nu raportează actualizări", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await imp(x.s, BASE_CSV));
    expect(r.updated === 0 && r.unchanged === 4, `updated ${r.updated} unchanged ${r.unchanged}`);
    const a = (await companies(x.s, "Agroteh"))[0];
    expect(a.notes === "Ion Rusu", `notițele s-au dublat: ${JSON.stringify(a.notes)}`);
  });
  suite.add(G, "același IDNO sub alt nume e aceeași firmă", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await prev(x.s, csv(["Denumire;IDNO", `SRL Agroteh (nume nou) ${RUN};1003600012345`])));
    expect(r.rows[0].status === "exists" && r.rows[0].existingId === x.agro.id, `rând ${JSON.stringify(r.rows[0])}`);
  });
  suite.add(G, "același nume fără IDNO e aceeași firmă", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await prev(x.s, csv(["Denumire;Telefon", `cafeneaua   CIOCÂRLIA ${RUN};069000000`])));
    expect(r.rows[0].status === "exists", `rând ${JSON.stringify(r.rows[0])}`);
  });
  suite.add(G, "modul „fill” completează doar golurile", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await imp(x.s, csv([
      "Denumire;Telefon;Website",
      `Cafeneaua Ciocârlia ${RUN};069777888;ciocarlia.md`,
      `Agroteh Ștefănești ${RUN} SRL;060999999;`,
    ]), { existingMode: "fill" }));
    expect(r.created === 0 && r.updated === 1, `created ${r.created} updated ${r.updated}`);
    const caf = (await companies(x.s, "Ciocârlia"))[0];
    const agro = (await companies(x.s, "Agroteh"))[0];
    expect(caf.phone === "069777888" && caf.website === "ciocarlia.md", `cafeneaua ${caf.phone} ${caf.website}`);
    expect(agro.phone === "+373 22 123 456", `telefonul existent a fost rescris în „fill”: ${agro.phone}`);
  });
  suite.add(G, "modul „overwrite” rescrie, dar nu redenumește", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await imp(x.s, csv(["Denumire;IDNO;Telefon", `Alt Nume ${RUN};1003600012345;060999999`]), { existingMode: "overwrite" }));
    expect(r.updated === 1, `updated ${r.updated}`);
    const agro = (await companies(x.s, "1003600012345"))[0];
    expect(agro.phone === "060999999" && agro.phoneNormalized === "60999999", `telefon ${agro.phone}/${agro.phoneNormalized}`);
    expect(agro.name === `Agroteh Ștefănești ${RUN} SRL`, `firma a fost redenumită: ${agro.name}`);
  });
  suite.add(G, "o celulă goală nu șterge o dată existentă nici la „overwrite”", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await imp(x.s, csv(["Denumire;IDNO;Telefon;Email", `X ${RUN};1003600012345;;`]), { existingMode: "overwrite" }));
    const agro = (await companies(x.s, "1003600012345"))[0];
    expect(agro.phone === "060999999" && agro.email === "office@agroteh.md", `date șterse: ${agro.phone} ${agro.email}`);
  });
  suite.add(G, "modul „skip” nu atinge fișele existente", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await imp(x.s, csv(["Denumire;IDNO;Telefon", `X ${RUN};1003600012345;011111111`]), { existingMode: "skip" }));
    expect(r.updated === 0, `updated ${r.updated}`);
    expect((await companies(x.s, "1003600012345"))[0].phone === "060999999", "fișa a fost modificată în modul skip");
  });
  suite.add(G, "notițele se adaugă, nu se înlocuiesc", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await imp(x.s, csv(["Denumire;IDNO;Observații", `X ${RUN};1003600012345;Plătește la 30 de zile`]), { existingMode: "fill" }));
    const agro = (await companies(x.s, "1003600012345"))[0];
    expect(agro.notes === "Ion Rusu\nPlătește la 30 de zile", `notițe ${JSON.stringify(agro.notes)}`);
  });
  suite.add(G, "rândul antetului ales sare peste titlurile exportului", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await prev(x.s, csv([
      "Export din contabilitate;;",
      "Generat la 26.09.2026;;",
      "Denumire;Cod fiscal;Localitate",
      `Vinăria Purcari Test ${RUN};1002600033333;Ștefan Vodă`,
    ]), { headerRow: 3 }));
    expect(r.counts.total === 1 && r.rows[0].draft.name === `Vinăria Purcari Test ${RUN}`, `rânduri ${JSON.stringify(r.rows.map((v) => v.draft.name))}`);
    expect(r.rows[0].draft.idno === "1002600033333" && r.rows[0].draft.region === "Ștefan Vodă", `draft ${JSON.stringify(r.rows[0].draft)}`);
    expect(r.rows[0].draft.rowNumber === 4, `rândul din fișier: ${r.rows[0].draft.rowNumber}`);
  });
  suite.add(G, "numărul rândului cu eroare e cel din fișier, și după un rând gol", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await prev(x.s, csv(["Denumire;Telefon", `Unu ${RUN};069000001`, ";", `;069000003`])));
    const e = r.rows.find((v) => v.status === "error");
    expect(e, "rândul fără nume nu e eroare");
    expect(e.draft.rowNumber === 4, `rândul raportat ${e.draft.rowNumber}, în fișier e 4`);
  });
  suite.add(G, "CSV cu virgulă și câmpuri între ghilimele", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await prev(x.s, csv(["Denumire,Adresa,Telefon", `"Alfa, Beta ${RUN} SRL","str. Ismail 1, of. 2",069123000`])));
    expect(r.delimiter === "," && r.rows[0].draft.name === `Alfa, Beta ${RUN} SRL` && r.rows[0].draft.address === "str. Ismail 1, of. 2", `draft ${JSON.stringify(r.rows[0]?.draft)}`);
  });
  suite.add(G, "BOM și CRLF nu strică antetul", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await prev(x.s, `﻿Denumire;Email\r\nGama ${RUN};gama@x.md\r\n`));
    expect(r.mapping[0] === "name" && r.mapping[1] === "email" && r.rows[0].draft.email === "gama@x.md", `mapare ${JSON.stringify(r.mapping)}`);
  });
  suite.add(G, "maparea explicită bate propunerea automată", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await prev(x.s, csv(["Denumire;Telefon", `Delta ${RUN};069000777`]), { mapping: { 0: "name", 1: "ignore" } }));
    expect(r.rows[0].draft.phone === null, `telefonul ignorat a fost citit: ${r.rows[0].draft.phone}`);
  });
  suite.add(G, "mai multe coloane pe „notes” primesc antetul în față", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await prev(x.s, csv(["Denumire;Director;Observații", `Epsilon ${RUN};Ion Popa;client vechi`])));
    expect(r.rows[0].draft.notes === "Director: Ion Popa\nObservații: client vechi", `notițe ${JSON.stringify(r.rows[0].draft.notes)}`);
  });
  suite.add(G, "țintă de mapare inventată → 400", async (ctx) => {
    expectStatus(await prev(st(ctx, G).s, "Denumire\nX SRL", { mapping: { 0: "salariu" } }), 400);
  });
  suite.add(G, "conținut gol → 400", async (ctx) => {
    expectStatus(await prev(st(ctx, G).s, ""), 400);
  });
  suite.add(G, "fișier peste 2 MB → 413 cu mesaj", async (ctx) => {
    const r = await prev(st(ctx, G).s, "Denumire\n" + `Firma Mare ${RUN}\n`.repeat(110000));
    expectStatus(r, 413);
    expect(r.json?.error, "413 fără mesaj");
  });
  suite.add(G, "registru Excel: a doua foaie se importă", async (ctx) => {
    const x = st(ctx, G);
    const b64 = await xlsxBase64([
      ["Instrucțiuni", [["Nu importa foaia asta"]]],
      ["Clienți", [["Denumire", "IDNO", "Telefon"], [`Zeta Excel ${RUN} SRL`, "1005600044444", "069444555"], [`Eta Excel ${RUN}`, "", "060111222"]]],
    ]);
    const p = expectOk(await prev(x.s, b64, { format: "xlsx", sheet: 1 }));
    expect(JSON.stringify(p.sheetNames) === JSON.stringify(["Instrucțiuni", "Clienți"]), `foi ${p.sheetNames}`);
    expect(p.counts.new === 2, `counts ${JSON.stringify(p.counts)}`);
    const r = expectOk(await imp(x.s, b64, { format: "xlsx", sheet: 1 }));
    expect(r.created === 2, `created ${r.created}`);
    expect((await companies(x.s, "Zeta Excel"))[0]?.idno === "1005600044444", "firma din Excel lipsește sau are alt IDNO");
  });
  suite.add(G, "registru Excel stricat → 400, nu 500", async (ctx) => {
    const r = await prev(st(ctx, G).s, Buffer.from("nu sunt un xlsx").toString("base64"), { format: "xlsx" });
    expectClientError(r);
  });
  suite.add(G, "importul de firme nu creează leaduri", async (ctx) => {
    expect((await countAllLeads(st(ctx, G).s)) === 0, "importul de firme a creat leaduri");
  });
  suite.add(G, "leadul importat ulterior se leagă de firma existentă după IDNO", async (ctx) => {
    const x = st(ctx, G);
    const r = await importLeads(x.s, csv(["Nume;Telefon;IDNO;Companie", `Ion Rusu ${RUN};069121212;1003600012345;Agroteh (alt nume)`]));
    expect(r.created === 1, `created ${r.created} ${JSON.stringify(r.details)}`);
    const o = await overview(x.s, x.agro.id);
    expect(o.stats.deals === 1 && o.deals[0].fullName === `Ion Rusu ${RUN}`, `fișa ${JSON.stringify(o.stats)}`);
    expect((await companies(x.s, "1003600012345")).length === 1, "s-a creat a doua fișă pentru același IDNO");
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PRODUSE — catalog
// ═════════════════════════════════════════════════════════════════════════════
function produseCatalog(suite) {
  const G = "produse:catalog";
  suite.add(G, "workspace nou pentru catalog", async (ctx) => {
    const x = st(ctx, G);
    x.s = await signupTenant(`prod-${RUN}`);
    x.b = await signupTenant(`prod-b-${RUN}`);
  });
  suite.add(G, "creez un produs complet", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.s, "POST", "/api/crm/products", {
      name: "Panou solar 450W", sku: "PS-450", category: "Energie", description: "Monocristalin", unit: "buc",
      listPriceCents: 325000, currency: "MDL", vatPercent: 20, orderIndex: 2,
    });
    expectStatus(r, 201);
    x.p = r.json;
    expect(x.p.name === "Panou solar 450W" && x.p.sku === "PS-450" && x.p.listPriceCents === 325000 && x.p.isActive === true, `produs ${JSON.stringify(x.p)}`);
    expect(Number(x.p.vatPercent) === 20, `TVA ${x.p.vatPercent}`);
  });
  suite.add(G, "produsul apare în lista implicită, fără stoc urmărit", async (ctx) => {
    const x = st(ctx, G);
    const items = listOf(expectOk(await api(x.s, "GET", "/api/crm/products")));
    const p = items.find((i) => i.id === x.p.id);
    expect(p && p.tracksStock === false && p.qtyOnHand === null && p.lowStock === false, `produs ${JSON.stringify(p)}`);
  });
  suite.add(G, "valorile implicite: buc, MDL, TVA 0", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "POST", "/api/crm/products", { name: "Consultanță" }));
    expect(r.unit === "buc" && r.currency === "MDL" && Number(r.vatPercent) === 0 && r.listPriceCents === 0 && r.sku === null, `produs ${JSON.stringify(r)}`);
    x.q = r;
  });
  suite.add(G, "denumirea de o literă e refuzată", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/products", { name: "X" }), 400);
  });
  suite.add(G, "prețul negativ e refuzat", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/products", { name: "Negativ", listPriceCents: -1 }), 400);
  });
  suite.add(G, "prețul cu zecimale în bani e refuzat", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/products", { name: "Zecimal", listPriceCents: 10.5 }), 400);
  });
  suite.add(G, "prețul trimis ca text e refuzat", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/products", { name: "Text", listPriceCents: "100" }), 400);
  });
  suite.add(G, "SKU peste 60 de caractere e refuzat", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/products", { name: "Lung", sku: "S".repeat(61) }), 400);
  });
  suite.add(G, "TVA negativ e refuzat", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/products", { name: "TVA minus", vatPercent: -5 }), 400);
  });
  suite.add(G, "TVA de 250% e refuzat", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.s, "POST", "/api/crm/products", { name: `TVA absurd ${RUN}`, vatPercent: 250 });
    expectClientError(r);
  });
  suite.add(G, "SKU dublat → 409 sku_taken", async (ctx) => {
    const r = await api(st(ctx, G).s, "POST", "/api/crm/products", { name: "Alt panou", sku: "PS-450" });
    expectStatus(r, 409);
    expect(r.json?.error === "sku_taken", `eroare ${r.json?.error}`);
  });
  suite.add(G, "două produse fără SKU nu intră în conflict", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", "/api/crm/products", { name: "Montaj" }), 201);
    expectStatus(await api(x.s, "POST", "/api/crm/products", { name: "Transport" }), 201);
  });
  suite.add(G, "același SKU e liber în alt workspace", async (ctx) => {
    expectStatus(await api(st(ctx, G).b, "POST", "/api/crm/products", { name: "Panou al altuia", sku: "PS-450" }), 201);
  });
  suite.add(G, "editez prețul și denumirea, citesc înapoi", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "PATCH", `/api/crm/products/${x.p.id}`, { listPriceCents: 299900, name: "Panou solar 450W Pro" }));
    const p = await product(x.s, x.p.id);
    expect(p.listPriceCents === 299900 && p.name === "Panou solar 450W Pro" && p.sku === "PS-450", `produs ${JSON.stringify(p)}`);
  });
  suite.add(G, "păstrez propriul SKU la editare (nu e conflict cu sine)", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "PATCH", `/api/crm/products/${x.p.id}`, { sku: "PS-450", category: "Solar" }));
    expect((await product(x.s, x.p.id)).category === "Solar", "categoria nu s-a salvat");
  });
  suite.add(G, "SKU-ul altui produs la editare → 409 și nimic schimbat", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "PATCH", `/api/crm/products/${x.q.id}`, { sku: "PS-450", name: "Consultanță Plus" }), 409);
    const q = await product(x.s, x.q.id);
    expect(q.sku === null && q.name === "Consultanță", `produs ${JSON.stringify(q)}`);
  });
  suite.add(G, "editarea unui produs inexistent → 404", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "PATCH", `/api/crm/products/${RANDOM_UUID}`, { name: "Fantomă" }), 404);
  });
  suite.add(G, "lista e ordonată după orderIndex, apoi nume", async (ctx) => {
    const x = st(ctx, G);
    const items = listOf(expectOk(await api(x.s, "GET", "/api/crm/products")));
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].orderIndex <= items[i].orderIndex, `ordinea: ${items.map((v) => `${v.name}(${v.orderIndex})`).join(", ")}`);
    }
    expect(items[items.length - 1].id === x.p.id, "produsul cu orderIndex 2 nu e ultimul");
  });
  suite.add(G, "arhivez produsul: dispare din lista implicită", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "POST", `/api/crm/products/${x.q.id}/archive`));
    expect(r.isActive === false, "isActive tot true");
    const items = listOf(expectOk(await api(x.s, "GET", "/api/crm/products")));
    expect(!items.some((i) => i.id === x.q.id), "produsul arhivat e încă în lista implicită");
  });
  suite.add(G, "produsul arhivat se vede cu includeInactive=1", async (ctx) => {
    const x = st(ctx, G);
    const p = await product(x.s, x.q.id);
    expect(p.isActive === false, "nu e marcat inactiv");
  });
  suite.add(G, "restaurez produsul: revine în lista implicită", async (ctx) => {
    const x = st(ctx, G);
    expect(expectOk(await api(x.s, "POST", `/api/crm/products/${x.q.id}/restore`)).isActive === true, "restore nu a reactivat");
    const items = listOf(expectOk(await api(x.s, "GET", "/api/crm/products")));
    expect(items.some((i) => i.id === x.q.id), "produsul restaurat lipsește");
  });
  suite.add(G, "arhivarea și restaurarea unui produs inexistent → 404", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", `/api/crm/products/${RANDOM_UUID}/archive`), 404);
    expectStatus(await api(x.s, "POST", `/api/crm/products/${RANDOM_UUID}/restore`), 404);
  });
  suite.add(G, "alt workspace nu vede, nu editează, nu arhivează produsul", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.b, "GET", "/api/crm/products?includeInactive=1");
    expect(!r.text.includes(x.p.id), "produsul se vede din alt workspace");
    expectStatus(await api(x.b, "PATCH", `/api/crm/products/${x.p.id}`, { listPriceCents: 1 }), 404);
    expectStatus(await api(x.b, "POST", `/api/crm/products/${x.p.id}/archive`), 404);
    const p = await product(x.s, x.p.id);
    expect(p.listPriceCents === 299900 && p.isActive === true, "produsul a fost atins de alt workspace");
  });
  suite.add(G, "leadul acceptă un produs din catalog și cantitatea", async (ctx) => {
    const x = st(ctx, G);
    const l = await mkLead(x.s, { fullName: `Client panouri ${RUN}`, phone: "069700700", productId: x.p.id, productQty: 4 });
    expect(l.productId === x.p.id && l.productQty === 4, `lead ${l.productId} ${l.productQty}`);
    const segs = listOf(expectOk(await api(x.s, "GET", `/api/crm/leads?productId=${x.p.id}`)));
    expect(segs.some((v) => v.id === l.id), "filtrul după produs nu găsește leadul");
  });
  suite.add(G, "cantitatea 0 pe lead e refuzată", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", "/api/crm/leads", { fullName: "Zero bucăți", phone: "069700701", productId: x.p.id, productQty: 0 }), 400);
  });
  suite.add(G, "leadul nu poate primi produsul altui workspace", async (ctx) => {
    const x = st(ctx, G);
    const foreign = expectOk(await api(x.b, "POST", "/api/crm/products", { name: `Produs străin ${RUN}` }));
    const r = await api(x.s, "POST", "/api/crm/leads", { fullName: `Lead cu produs străin ${RUN}`, phone: "069700702", productId: foreign.id });
    expectClientError(r);
  });
  suite.add(G, "leadul nu poate primi un produs inexistent", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.s, "POST", "/api/crm/leads", { fullName: `Lead cu produs fantomă ${RUN}`, phone: "069700703", productId: RANDOM_UUID });
    expectClientError(r);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// PRODUSE — stoc
// ═════════════════════════════════════════════════════════════════════════════
function produseStoc(suite) {
  const G = "produse:stoc";
  const adj = (x, delta, extra = {}) => api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/adjust`, { delta, ...extra });
  const qty = async (x, id = x.p.id) => (await product(x.s, id)).qtyOnHand;

  suite.add(G, "într-un workspace nou, primul lead creat se poate muta în altă etapă", async (ctx) => {
    // Pâlnia implicită se creează la primul lead, dar etapele ei doar când cineva citește
    // GET /stages. Un lead venit din API/formular înainte ca cineva să deschidă tabla rămâne blocat.
    const s = await signupTenant(`stoc-etape-${RUN}`);
    const l = await mkLead(s, { fullName: `Primul lead ${RUN}`, phone: "069800000" });
    const r = await api(s, "PATCH", `/api/crm/leads/${l.id}/stage`, { stage: "contacted" });
    expectOk(r, "mutarea primului lead: ");
    expect(r.json.stage === "contacted", `etapa ${r.json.stage}`);
  });
  suite.add(G, "workspace nou pentru stoc + un produs", async (ctx) => {
    const x = st(ctx, G);
    x.s = await signupTenant(`stoc-${RUN}`);
    // Ca omul care deschide tabla înainte de prima vânzare (vezi scenariul de mai sus).
    expectOk(await api(x.s, "GET", "/api/crm/stages"));
    x.p = expectOk(await api(x.s, "POST", "/api/crm/products", { name: "Invertor 5kW", sku: `INV-${RUN}`, listPriceCents: 1200000 }));
  });
  suite.add(G, "corecția înainte de pornirea stocului → 409", async (ctx) => {
    const r = await adj(st(ctx, G), 5);
    expectStatus(r, 409);
    expect(r.json?.error === "stock_not_tracked", `eroare ${r.json?.error}`);
  });
  suite.add(G, "pragul înainte de pornirea stocului → 409", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/threshold`, { minQtyAlert: 2 }), 409);
  });
  suite.add(G, "cantitatea inițială negativă e refuzată", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/enable`, { initialQty: -3 }), 400);
    expect((await product(x.s, x.p.id)).tracksStock === false, "stocul a pornit deși cererea a fost refuzată");
  });
  suite.add(G, "pornesc stocul cu 10 bucăți la 500 bani, prag 3", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/enable`, { initialQty: 10, unitCostCents: 500, minQtyAlert: 3 });
    expectStatus(r, 201);
    expect(r.json.item.qtyOnHand === 10 && r.json.product.inventoryItemId === r.json.item.id, `răspuns ${JSON.stringify(r.json).slice(0, 300)}`);
    x.itemId = r.json.item.id;
  });
  suite.add(G, "lista arată stocul: 10 buc, cost 500, prag 3, fără alertă", async (ctx) => {
    const x = st(ctx, G);
    const p = await product(x.s, x.p.id);
    expect(p.tracksStock === true && p.qtyOnHand === 10 && p.avgCostCents === 500 && p.minQtyAlert === 3 && p.lowStock === false, `produs ${JSON.stringify(p)}`);
  });
  suite.add(G, "a doua pornire nu creează alt articol și nu adaugă cantitate", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/enable`, { initialQty: 50 });
    expectStatus(r, 200);
    expect(r.json.item.id === x.itemId, "s-a creat un al doilea articol de inventar");
    expect((await qty(x)) === 10, `cantitatea s-a schimbat la ${await qty(x)}`);
  });
  suite.add(G, "recepție +5 fără cost: 15 buc, costul mediu rămâne 500", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await adj(x, 5, { notes: "Recepție parțială" }));
    expect(r.qtyOnHand === 15 && r.avgCostCents === 500, `răspuns ${JSON.stringify(r)}`);
  });
  suite.add(G, "recepție +5 la 800 bani: costul mediu devine 575", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await adj(x, 5, { unitCostCents: 800 }));
    expect(r.qtyOnHand === 20 && r.avgCostCents === 575, `răspuns ${JSON.stringify(r)}`);
    const p = await product(x.s, x.p.id);
    expect(p.qtyOnHand === 20 && p.avgCostCents === 575, `citit înapoi ${p.qtyOnHand}/${p.avgCostCents}`);
  });
  suite.add(G, "pierdere -3: 17 buc, costul mediu neschimbat", async (ctx) => {
    const r = expectOk(await adj(st(ctx, G), -3, { notes: "Deteriorate la transport" }));
    expect(r.qtyOnHand === 17 && r.avgCostCents === 575, `răspuns ${JSON.stringify(r)}`);
  });
  suite.add(G, "corecția zero e refuzată", async (ctx) => {
    expectStatus(await adj(st(ctx, G), 0), 400);
  });
  suite.add(G, "corecția cu zecimale e refuzată", async (ctx) => {
    expectStatus(await adj(st(ctx, G), 1.5), 400);
  });
  suite.add(G, "nu pot scoate mai mult decât am: 422 cu disponibilul", async (ctx) => {
    const x = st(ctx, G);
    const r = await adj(x, -100);
    expectStatus(r, 422);
    expect(r.json?.error === "insufficient_stock" && r.json.available === 17 && r.json.requested === 100, `răspuns ${JSON.stringify(r.json)}`);
    expect((await qty(x)) === 17, "cantitatea s-a schimbat după refuz");
  });
  suite.add(G, "pot coborî exact la zero, și apare alerta", async (ctx) => {
    const x = st(ctx, G);
    expect(expectOk(await adj(x, -17)).qtyOnHand === 0, "nu am ajuns la 0");
    const p = await product(x.s, x.p.id);
    expect(p.qtyOnHand === 0 && p.lowStock === true, `produs ${p.qtyOnHand} low=${p.lowStock}`);
  });
  suite.add(G, "sub zero nu se poate, nici cu o bucată", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await adj(x, -1), 422);
    expect((await qty(x)) === 0, "stoc negativ");
  });
  suite.add(G, "la 3 buc (egal cu pragul) alerta rămâne", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await adj(x, 3));
    expect((await product(x.s, x.p.id)).lowStock === true, "pragul nu e inclusiv");
  });
  suite.add(G, "la 10 buc alerta dispare", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await adj(x, 7));
    const p = await product(x.s, x.p.id);
    expect(p.qtyOnHand === 10 && p.lowStock === false, `produs ${p.qtyOnHand} low=${p.lowStock}`);
  });
  suite.add(G, "ridic pragul la 10: alerta apare fără mișcare de stoc", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/threshold`, { minQtyAlert: 10 }));
    expect(r.minQtyAlert === 10 && r.qtyOnHand === 10, `răspuns ${JSON.stringify(r)}`);
    expect((await product(x.s, x.p.id)).lowStock === true, "alerta nu apare la prag = cantitate");
  });
  suite.add(G, "pragul 0 oprește alerta", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/threshold`, { minQtyAlert: 0 }));
    expect((await product(x.s, x.p.id)).lowStock === false, "alerta persistă cu pragul 0");
  });
  suite.add(G, "pragul negativ sau cu zecimale e refuzat", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/threshold`, { minQtyAlert: -1 }), 400);
    expectStatus(await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/threshold`, { minQtyAlert: 2.5 }), 400);
  });
  suite.add(G, "pragul pe un produs inexistent → 404", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", `/api/crm/products/${RANDOM_UUID}/stock/threshold`, { minQtyAlert: 1 }), 404);
  });

  // ── Vânzarea scade stocul ──
  suite.add(G, "leadul cu 3 bucăți câștigat scade stocul cu 3", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/threshold`, { minQtyAlert: 2 }));
    x.lead = await mkLead(x.s, { fullName: `Cumpărător invertor ${RUN}`, phone: "069800001", productId: x.p.id, productQty: 3, valueCents: 3600000 });
    const r = await moveStage(x.s, x.lead.id, "paid");
    expect(r.stage === "paid" && r.stock?.status === "decremented" && r.stock.qty === 3 && r.stock.remaining === 7, `stock ${JSON.stringify(r.stock)}`);
    expect((await qty(x)) === 7, `stoc ${await qty(x)}`);
  });
  suite.add(G, "istoricul leadului spune că stocul a scăzut", async (ctx) => {
    const x = st(ctx, G);
    const items = await interactions(x.s, x.lead.id);
    expect(items.some((i) => i.type === "system" && /Stoc scăzut: -3/.test(i.body ?? "")), "lipsește urma din istoric");
  });
  suite.add(G, "o salvare a leadului câștigat nu mai scade nimic", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "PATCH", `/api/crm/leads/${x.lead.id}`, { notes: "Livrare vineri" }));
    expectOk(await api(x.s, "PATCH", `/api/crm/leads/${x.lead.id}`, { stage: "paid", valueCents: 3700000 }));
    expect((await qty(x)) === 7, `stoc ${await qty(x)}`);
  });
  suite.add(G, "a doua mutare în „câștigat” e fără efect asupra stocului", async (ctx) => {
    const x = st(ctx, G);
    const r = await moveStage(x.s, x.lead.id, "paid");
    expect(r.stock?.status === "noop", `stock ${JSON.stringify(r.stock)}`);
    expect((await qty(x)) === 7, `stoc ${await qty(x)}`);
  });
  suite.add(G, "retragerea vânzării returnează cele 3 bucăți", async (ctx) => {
    const x = st(ctx, G);
    const r = await moveStage(x.s, x.lead.id, "trial");
    expect(r.stock?.status === "restored" && r.stock.qty === 3 && r.stock.remaining === 10, `stock ${JSON.stringify(r.stock)}`);
    const p = await product(x.s, x.p.id);
    expect(p.qtyOnHand === 10 && p.avgCostCents === 575, `stoc ${p.qtyOnHand}, CMP ${p.avgCostCents}`);
  });
  suite.add(G, "trasă de trei ori peste „câștigat”, stocul scade o singură dată net", async (ctx) => {
    const x = st(ctx, G);
    for (let i = 0; i < 3; i++) {
      await moveStage(x.s, x.lead.id, "paid");
      await moveStage(x.s, x.lead.id, "contacted");
    }
    await moveStage(x.s, x.lead.id, "paid");
    expect((await qty(x)) === 7, `stoc ${await qty(x)} (trebuia 7)`);
  });
  suite.add(G, "din „câștigat” în „pierdut” returnează stocul", async (ctx) => {
    const x = st(ctx, G);
    const r = await moveStage(x.s, x.lead.id, "lost", "Clientul a renunțat");
    expect(r.stock?.status === "restored", `stock ${JSON.stringify(r.stock)}`);
    expect((await qty(x)) === 10, `stoc ${await qty(x)}`);
  });
  suite.add(G, "câștigul prin salvarea generică (fișa leadului) scade stocul", async (ctx) => {
    const x = st(ctx, G);
    const l = await mkLead(x.s, { fullName: `Fișă generică ${RUN}`, phone: "069800002", productId: x.p.id, productQty: 2 });
    expectOk(await api(x.s, "PATCH", `/api/crm/leads/${l.id}`, { stage: "paid" }));
    expect((await qty(x)) === 8, `stoc ${await qty(x)}`);
    x.l2 = l;
  });
  suite.add(G, "câștigul în masă (bulk) scade stocul pentru fiecare lead", async (ctx) => {
    const x = st(ctx, G);
    const a = await mkLead(x.s, { fullName: `Bulk A ${RUN}`, phone: "069800003", productId: x.p.id, productQty: 1 });
    const b = await mkLead(x.s, { fullName: `Bulk B ${RUN}`, phone: "069800004", productId: x.p.id, productQty: 2 });
    const r = expectOk(await api(x.s, "POST", "/api/crm/leads/bulk", { leadIds: [a.id, b.id], action: "stage", stage: "paid" }));
    expect(r.updated === 2, `updated ${r.updated}`);
    expect((await qty(x)) === 5, `stoc ${await qty(x)} (trebuia 8-3=5)`);
    x.bulk = [a.id, b.id];
  });
  suite.add(G, "sub prag după vânzare → alerta de stoc scăzut", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/threshold`, { minQtyAlert: 5 }));
    expect((await product(x.s, x.p.id)).lowStock === true, "5 buc cu prag 5 nu e alertă");
  });
  suite.add(G, "stoc insuficient: vânzarea se câștigă, stocul nu se atinge", async (ctx) => {
    const x = st(ctx, G);
    const l = await mkLead(x.s, { fullName: `Comandă mare ${RUN}`, phone: "069800005", productId: x.p.id, productQty: 1000 });
    const r = await moveStage(x.s, l.id, "paid");
    expect(r.stage === "paid", `etapa ${r.stage}`);
    expect(r.stock?.status === "insufficient" && r.stock.requested === 1000 && r.stock.available === 5, `stock ${JSON.stringify(r.stock)}`);
    expect((await qty(x)) === 5, `stoc ${await qty(x)}`);
    const items = await interactions(x.s, l.id);
    expect(items.some((i) => /Stoc insuficient/.test(i.body ?? "")), "lipsește urma lipsei de stoc");
    x.big = l;
  });
  suite.add(G, "leadul fără stoc scăzut, scos din câștig, nu adaugă stoc fantomă", async (ctx) => {
    const x = st(ctx, G);
    const r = await moveStage(x.s, x.big.id, "contacted");
    expect(r.stock?.status === "noop", `stock ${JSON.stringify(r.stock)}`);
    expect((await qty(x)) === 5, `stoc ${await qty(x)}`);
  });
  suite.add(G, "schimb cantitatea după câștig: la retragere revine exact ce s-a scăzut", async (ctx) => {
    const x = st(ctx, G);
    const l = await mkLead(x.s, { fullName: `Cantitate schimbată ${RUN}`, phone: "069800006", productId: x.p.id, productQty: 2 });
    await moveStage(x.s, l.id, "paid");
    expect((await qty(x)) === 3, `după câștig ${await qty(x)}`);
    expectOk(await api(x.s, "PATCH", `/api/crm/leads/${l.id}`, { productQty: 4 }));
    await moveStage(x.s, l.id, "contacted");
    expect((await qty(x)) === 5, `după retragere stocul e ${await qty(x)}, trebuia 5 (s-au scăzut 2, nu 4)`);
  });
  suite.add(G, "leadul creat direct în „câștigat” scade stocul", async (ctx) => {
    const x = st(ctx, G);
    const before = await qty(x);
    const l = await mkLead(x.s, { fullName: `Vânzare directă ${RUN}`, phone: "069800007", productId: x.p.id, productQty: 1, stage: "paid" });
    expect(l.stage === "paid", `etapa ${l.stage}`);
    expect((await qty(x)) === before - 1, `stoc ${await qty(x)}, înainte ${before}`);
  });
  suite.add(G, "produsul fără stoc urmărit: câștigul nu atinge nimic", async (ctx) => {
    const x = st(ctx, G);
    const svc = expectOk(await api(x.s, "POST", "/api/crm/products", { name: "Montaj invertor" }));
    const l = await mkLead(x.s, { fullName: `Doar montaj ${RUN}`, phone: "069800008", productId: svc.id, productQty: 5 });
    const r = await moveStage(x.s, l.id, "paid");
    expect(r.stock?.status === "noop", `stock ${JSON.stringify(r.stock)}`);
    expect((await product(x.s, svc.id)).tracksStock === false, "serviciul a căpătat stoc");
  });
  suite.add(G, "opresc urmărirea: produsul nu mai are stoc", async (ctx) => {
    const x = st(ctx, G);
    x.qtyBeforeDisable = await qty(x);
    const r = expectOk(await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/disable`));
    expect(r.inventoryItemId === null, "legătura a rămas");
    const p = await product(x.s, x.p.id);
    expect(p.tracksStock === false && p.qtyOnHand === null && p.lowStock === false, `produs ${JSON.stringify(p)}`);
  });
  suite.add(G, "după oprire, corecția e refuzată", async (ctx) => {
    expectStatus(await adj(st(ctx, G), 1), 409);
  });
  suite.add(G, "după oprire, câștigul nu mai încearcă să scadă", async (ctx) => {
    const x = st(ctx, G);
    const l = await mkLead(x.s, { fullName: `După oprire ${RUN}`, phone: "069800009", productId: x.p.id, productQty: 1 });
    const r = await moveStage(x.s, l.id, "paid");
    expect(r.stock?.status === "noop", `stock ${JSON.stringify(r.stock)}`);
  });
  suite.add(G, "retragerea unei vânzări după oprire eliberează ancora fără eroare", async (ctx) => {
    const x = st(ctx, G);
    const r = await moveStage(x.s, x.l2.id, "contacted");
    expect(r.stage === "contacted" && r.stock?.status === "noop", `stock ${JSON.stringify(r.stock)}`);
  });
  suite.add(G, "repornirea creează un articol nou cu cantitatea dată", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.s, "POST", `/api/crm/products/${x.p.id}/stock/enable`, { initialQty: 4, unitCostCents: 600 });
    expectStatus(r, 201);
    expect(r.json.item.id !== x.itemId && r.json.item.qtyOnHand === 4, `articol ${JSON.stringify(r.json.item).slice(0, 200)}`);
    const p = await product(x.s, x.p.id);
    expect(p.qtyOnHand === 4 && p.avgCostCents === 600, `produs ${p.qtyOnHand}/${p.avgCostCents}`);
  });
  suite.add(G, "oprirea pe un produs inexistent → 404", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", `/api/crm/products/${RANDOM_UUID}/stock/disable`), 404);
  });
  suite.add(G, "pornirea pe un produs inexistent → 404", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", `/api/crm/products/${RANDOM_UUID}/stock/enable`, {}), 404);
  });
  suite.add(G, "produsul arhivat își păstrează stocul și revine cu el la restaurare", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "POST", `/api/crm/products/${x.p.id}/archive`));
    expectOk(await api(x.s, "POST", `/api/crm/products/${x.p.id}/restore`));
    expect((await qty(x)) === 4, `stoc ${await qty(x)}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTE — datele firmei proprii
// ═════════════════════════════════════════════════════════════════════════════
function acteProfil(suite) {
  const G = "acte:profil";
  const FULL = {
    legalName: `Vector Solar ${RUN} SRL`, idno: "1012600099999", vatNumber: "0512345", address: "mun. Chișinău, str. Bănulescu-Bodoni 57",
    iban: "md24 ag00 0225 1000 1310 4168", bankName: "Moldova Agroindbank", bic: "agrnmd2x", administratorName: "Dumitru Vlah",
    administratorTitle: "Director", phone: "+373 22 000 000", email: "office@vectorsolar.md",
  };
  const get = async (s) => expectOk(await api(s, "GET", "/api/crm/company-profile"));
  suite.add(G, "workspace nou pentru datele firmei", async (ctx) => {
    const x = st(ctx, G);
    x.s = await signupTenant(`profil-${RUN}`);
    x.b = await signupTenant(`profil-b-${RUN}`);
  });
  suite.add(G, "fără profil: denumirea vine din workspace, restul lipsește", async (ctx) => {
    const x = st(ctx, G);
    const r = await get(x.s);
    expect(r.profile.legalName === x.s.tenant.name, `denumire ${r.profile.legalName}`);
    for (const m of ["IDNO", "IBAN", "Banca", "Administratorul", "Adresa juridică"]) expect(r.missing.includes(m), `lipsește din „missing”: ${m}`);
    expect(!r.missing.includes("Denumirea juridică"), "denumirea e raportată lipsă deși e cunoscută");
  });
  suite.add(G, "salvez profilul complet: nimic nu mai lipsește", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "PUT", "/api/crm/company-profile", FULL));
    expect(r.missing.length === 0, `lipsesc ${r.missing}`);
  });
  suite.add(G, "IBAN-ul se salvează compact și cu majuscule", async (ctx) => {
    const r = await get(st(ctx, G).s);
    expect(r.profile.iban === "MD24AG000225100013104168", `IBAN ${r.profile.iban}`);
  });
  suite.add(G, "BIC-ul se salvează cu majuscule", async (ctx) => {
    expect((await get(st(ctx, G).s)).profile.bic === "AGRNMD2X", "BIC nemajusculat");
  });
  suite.add(G, "IBAN invalid → 400 pe câmpul iban, profilul rămâne", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.s, "PUT", "/api/crm/company-profile", { ...FULL, iban: "MD24 123" });
    expectStatus(r, 400);
    expect(r.json?.field === "iban", `câmp ${r.json?.field}`);
    expect((await get(x.s)).profile.iban === "MD24AG000225100013104168", "IBAN-ul valid a fost pierdut");
  });
  suite.add(G, "IDNO de 14 cifre → 400", async (ctx) => {
    const r = await api(st(ctx, G).s, "PUT", "/api/crm/company-profile", { ...FULL, idno: "12345678901234" });
    expectStatus(r, 400);
    expect(r.json?.field === "idno", `câmp ${r.json?.field}`);
  });
  suite.add(G, "IDNO cu litere → 400", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "PUT", "/api/crm/company-profile", { ...FULL, idno: "ABC1234567890" }), 400);
  });
  suite.add(G, "CUI românesc cu prefix RO e acceptat", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "PUT", "/api/crm/company-profile", { ...FULL, idno: "RO12345678" }));
    expect((await get(x.s)).profile.idno === "RO12345678", "CUI-ul nu s-a salvat");
  });
  suite.add(G, "email invalid → 400", async (ctx) => {
    const r = await api(st(ctx, G).s, "PUT", "/api/crm/company-profile", { ...FULL, email: "office@" });
    expectStatus(r, 400);
    expect(r.json?.field === "email", `câmp ${r.json?.field}`);
  });
  suite.add(G, "denumirea juridică de o literă → 400", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "PUT", "/api/crm/company-profile", { ...FULL, legalName: " A " }), 400);
  });
  suite.add(G, "un câmp golit devine null și reapare în „missing”", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await api(x.s, "PUT", "/api/crm/company-profile", { ...FULL, bankName: "   ", administratorName: "" }));
    expect(r.profile.bankName === null && r.profile.administratorName === null, `profil ${JSON.stringify(r.profile)}`);
    expect(r.missing.includes("Banca") && r.missing.includes("Administratorul"), `missing ${r.missing}`);
  });
  suite.add(G, "a doua salvare actualizează același profil", async (ctx) => {
    const x = st(ctx, G);
    expectOk(await api(x.s, "PUT", "/api/crm/company-profile", { ...FULL, legalName: `Vector Solar Nou ${RUN} SRL` }));
    const r = await get(x.s);
    expect(r.profile.legalName === `Vector Solar Nou ${RUN} SRL` && r.profile.bankName === "Moldova Agroindbank", `profil ${JSON.stringify(r.profile)}`);
  });
  suite.add(G, "alt workspace nu vede profilul meu", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.b, "GET", "/api/crm/company-profile");
    expectOk(r);
    expect(!r.text.includes("MD24AG000225100013104168") && !r.text.includes("Vector Solar"), "profilul se vede din alt workspace");
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTE — oferte și contracte din lead
// ═════════════════════════════════════════════════════════════════════════════
function acteOferte(suite) {
  const G = "acte:oferte";
  const FIRM = `Hotel Codru ${RUN} SRL`;
  const doc = (s, body) => api(s, "POST", "/api/crm/documents", body);
  suite.add(G, "workspace nou, produse și un lead legat de firmă", async (ctx) => {
    const x = st(ctx, G);
    x.s = await signupTenant(`acte-${RUN}`);
    x.b = await signupTenant(`acte-b-${RUN}`);
    x.p1 = expectOk(await api(x.s, "POST", "/api/crm/products", { name: "Panou 450W", unit: "buc", listPriceCents: 100000, vatPercent: 20 }));
    x.p2 = expectOk(await api(x.s, "POST", "/api/crm/products", { name: "Montaj", unit: "ore", listPriceCents: 25000, vatPercent: 20 }));
    x.eur = expectOk(await api(x.s, "POST", "/api/crm/products", { name: "Invertor importat", listPriceCents: 90000, currency: "EUR" }));
    expectOk(await api(x.s, "POST", "/api/crm/companies/import/run", { text: csv(["Denumire;IDNO;Adresa;Email", `${FIRM};1003600055555;or. Orhei, str. Codrului 3;rezervari@codru.md`]) }));
    const r = await importLeads(x.s, csv(["Nume;Telefon;IDNO;Companie", `Mihai Codreanu ${RUN};069900001;1003600055555;${FIRM}`]));
    expect(r.created === 1, `import ${JSON.stringify(r)}`);
    x.lead = (await leadsSearch(x.s, `Mihai Codreanu ${RUN}`))[0];
    x.solo = await mkLead(x.s, { fullName: `Persoană fizică ${RUN}`, phone: "069900002", email: "pf@gmail.com" });
  });
  suite.add(G, "oferta cu produse: rânduri, cantități și total corecte", async (ctx) => {
    const x = st(ctx, G);
    const r = await doc(x.s, { leadId: x.lead.id, items: [{ productId: x.p1.id, quantity: 4 }, { productId: x.p2.id, quantity: 6 }] });
    expectStatus(r, 201);
    x.offer = r.json;
    expect(r.json.kind === "oferta_comerciala" && r.json.status, `act ${JSON.stringify(r.json).slice(0, 200)}`);
    expect(r.json.lines.length === 2 && r.json.lines[0].quantity === 4 && r.json.lines[1].unit === "ore", `rânduri ${JSON.stringify(r.json.lines)}`);
    expect(r.json.totalCents === 4 * 100000 + 6 * 25000, `total ${r.json.totalCents}`);
  });
  suite.add(G, "TVA-ul rândului vine din produs", async (ctx) => {
    const lines = st(ctx, G).offer.lines;
    expect(lines.every((l) => l.vatPercent === 20), `TVA ${lines.map((l) => l.vatPercent)}`);
  });
  suite.add(G, "contrapartea e firma leadului, cu IDNO și adresă", async (ctx) => {
    const x = st(ctx, G);
    expect(x.offer.counterpartyName === FIRM, `contraparte ${x.offer.counterpartyName}`);
    expect(x.offer.title === `Ofertă comercială — ${FIRM}`, `titlu ${x.offer.title}`);
    const snap = JSON.parse(x.offer.counterpartySnapshot || "{}");
    expect(snap.idno === "1003600055555" && /Codrului/.test(snap.adresa ?? ""), `rechizite ${JSON.stringify(snap)}`);
  });
  suite.add(G, "oferta are text din șablon, nu o pagină albă", async (ctx) => {
    const x = st(ctx, G);
    expect(x.offer.templateId && (x.offer.bodyHtml ?? "").length > 50, `templateId ${x.offer.templateId}, corp ${String(x.offer.bodyHtml ?? "").length}`);
  });
  suite.add(G, "actul apare în lista actelor leadului", async (ctx) => {
    const x = st(ctx, G);
    const items = listOf(expectOk(await api(x.s, "GET", `/api/crm/documents?leadId=${x.lead.id}`)));
    const d = items.find((v) => v.id === x.offer.id);
    expect(d && d.totalCents === 550000 && d.counterpartyId === x.lead.id && d.share === null, `act ${JSON.stringify(d)}`);
  });
  suite.add(G, "istoricul leadului consemnează crearea actului", async (ctx) => {
    const x = st(ctx, G);
    const items = await interactions(x.s, x.lead.id);
    expect(items.some((i) => i.type === "system" && /ciornă/.test(i.body ?? "")), "lipsește urma actului în istoric");
  });
  suite.add(G, "prețul negociat bate prețul din catalog", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await doc(x.s, { leadId: x.lead.id, items: [{ productId: x.p1.id, quantity: 2, unitPriceCents: 90000 }] }));
    expect(r.lines[0].unitPriceCents === 90000 && r.totalCents === 180000, `rând ${JSON.stringify(r.lines[0])}`);
    expect((await product(x.s, x.p1.id)).listPriceCents === 100000, "prețul din catalog s-a schimbat");
  });
  suite.add(G, "rândurile scrise de mână se adaugă la total", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await doc(x.s, { leadId: x.lead.id, items: [{ productId: x.p2.id }], extraLines: [{ description: "Deplasare Orhei", unit: "km", quantity: 90, unitPriceCents: 800, vatPercent: 0 }] }));
    expect(r.lines.length === 2 && r.lines[0].quantity === 1, `rânduri ${JSON.stringify(r.lines)}`);
    expect(r.totalCents === 25000 + 90 * 800, `total ${r.totalCents}`);
  });
  suite.add(G, "titlul personalizat se păstrează", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await doc(x.s, { leadId: x.lead.id, title: "Ofertă sezon rece", extraLines: [{ description: "Audit", unitPriceCents: 100 }] }));
    expect(r.title === "Ofertă sezon rece", `titlu ${r.title}`);
  });
  suite.add(G, "contractul „în baza ofertei” primește tipul și titlul lui", async (ctx) => {
    const x = st(ctx, G);
    const r = await doc(x.s, { leadId: x.lead.id, kind: "contract_servicii", basedOn: "Oferta OF-2026-0001", items: [{ productId: x.p1.id, quantity: 1 }] });
    expectStatus(r, 201);
    expect(r.json.kind === "contract_servicii" && r.json.title === `Contract — ${FIRM}`, `act ${r.json.kind} ${r.json.title}`);
  });
  suite.add(G, "actul de primire-predare se poate porni din lead", async (ctx) => {
    const x = st(ctx, G);
    const r = await doc(x.s, { leadId: x.lead.id, kind: "act_primire_predare", extraLines: [{ description: "Montaj finalizat", unitPriceCents: 0 }] });
    expectStatus(r, 201);
    expect(r.json.kind === "act_primire_predare", `tip ${r.json.kind}`);
  });
  suite.add(G, "leadul fără firmă: contrapartea e persoana", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await doc(x.s, { leadId: x.solo.id, extraLines: [{ description: "Consultanță", unitPriceCents: 50000 }] }));
    expect(r.counterpartyName === `Persoană fizică ${RUN}`, `contraparte ${r.counterpartyName}`);
    const snap = JSON.parse(r.counterpartySnapshot || "{}");
    expect(!snap.idno && snap.email === "pf@gmail.com", `rechizite ${JSON.stringify(snap)}`);
    x.soloDoc = r.id;
  });
  suite.add(G, "lista pe lead nu amestecă actele altui lead", async (ctx) => {
    const x = st(ctx, G);
    const a = listOf(expectOk(await api(x.s, "GET", `/api/crm/documents?leadId=${x.lead.id}`)));
    const b = listOf(expectOk(await api(x.s, "GET", `/api/crm/documents?leadId=${x.solo.id}`)));
    expect(!a.some((d) => d.id === x.soloDoc) && b.length === 1 && b[0].id === x.soloDoc, `a=${a.length} b=${b.length}`);
    const all = listOf(expectOk(await api(x.s, "GET", "/api/crm/documents")));
    expect(all.length === a.length + b.length, `toate ${all.length} ≠ ${a.length}+${b.length}`);
  });
  suite.add(G, "fișa firmei arată actele leadului ei", async (ctx) => {
    const x = st(ctx, G);
    const co = (await companies(x.s, "Hotel Codru"))[0];
    const o = await overview(x.s, co.id);
    expect(o.documents.some((d) => d.id === x.offer.id) && !o.documents.some((d) => d.id === x.soloDoc), `acte ${o.documents.length}`);
  });
  suite.add(G, "produse în monede diferite pe un act → 400 currency_mismatch", async (ctx) => {
    const x = st(ctx, G);
    const r = await doc(x.s, { leadId: x.lead.id, items: [{ productId: x.p1.id }, { productId: x.eur.id }] });
    expectStatus(r, 400);
    expect(r.json?.error === "currency_mismatch", `eroare ${r.json?.error}`);
  });
  suite.add(G, "moneda cerută diferă de a produselor → 400", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await doc(x.s, { leadId: x.lead.id, currency: "EUR", items: [{ productId: x.p1.id }] }), 400);
  });
  suite.add(G, "un produs în EUR face un act în EUR", async (ctx) => {
    const x = st(ctx, G);
    const r = expectOk(await doc(x.s, { leadId: x.lead.id, items: [{ productId: x.eur.id, quantity: 2 }] }));
    expect(r.currency === "EUR" && r.totalCents === 180000, `act ${r.currency} ${r.totalCents}`);
  });
  suite.add(G, "refuzurile nu au lăsat acte pe jumătate", async (ctx) => {
    const x = st(ctx, G);
    const items = listOf(expectOk(await api(x.s, "GET", `/api/crm/documents?leadId=${x.lead.id}`)));
    expect(items.length === 7, `acte pe lead: ${items.length} (așteptat 7)`);
  });
  suite.add(G, "produsul altui workspace → 404 product_not_found", async (ctx) => {
    const x = st(ctx, G);
    const foreign = expectOk(await api(x.b, "POST", "/api/crm/products", { name: `Străin ${RUN}`, listPriceCents: 1 }));
    const r = await doc(x.s, { leadId: x.lead.id, items: [{ productId: foreign.id }] });
    expectStatus(r, 404);
    expect(r.json?.error === "product_not_found" && !r.text.includes(`Străin ${RUN}`), `eroare ${r.text.slice(0, 120)}`);
  });
  suite.add(G, "leadul altui workspace → 404", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await doc(x.b, { leadId: x.lead.id, extraLines: [{ description: "x", unitPriceCents: 1 }] }), 404);
    const other = listOf(expectOk(await api(x.b, "GET", `/api/crm/documents?leadId=${x.lead.id}`)));
    expect(other.length === 0, "alt workspace vede actele leadului meu");
  });
  suite.add(G, "lead inexistent → 404", async (ctx) => {
    expectStatus(await doc(st(ctx, G).s, { leadId: RANDOM_UUID }), 404);
  });
  suite.add(G, "cantitatea zero → 400", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await doc(x.s, { leadId: x.lead.id, items: [{ productId: x.p1.id, quantity: 0 }] }), 400);
  });
  suite.add(G, "preț negativ pe rândul manual → 400", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await doc(x.s, { leadId: x.lead.id, extraLines: [{ description: "Reducere", unitPriceCents: -100 }] }), 400);
  });
  suite.add(G, "TVA peste 100% pe rândul manual → 400", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await doc(x.s, { leadId: x.lead.id, extraLines: [{ description: "X", unitPriceCents: 1, vatPercent: 120 }] }), 400);
  });
  suite.add(G, "tip de act necunoscut → 400", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await doc(x.s, { leadId: x.lead.id, kind: "factura" }), 400);
  });
  suite.add(G, "leadId care nu e uuid → 400", async (ctx) => {
    expectStatus(await doc(st(ctx, G).s, { leadId: "123" }), 400);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// IMPORT — leaduri
// ═════════════════════════════════════════════════════════════════════════════
function importLeaduri(suite) {
  const G = "import:leaduri";
  // T-CRM-103-4: 10 rânduri — 7 noi, 2 duplicate, 1 invalid.
  const TEN = csv([
    "Nume;Telefon;Email;Companie;Valoare;Etapă;Etichete;Sursa",
    `Ion Rusu ${RUN};+373 69 111 001;ion.rusu@agroteh.md;Agroteh Ștefănești ${RUN} SRL;1.234,56;Contactat;agro, sud;Facebook`,
    `Maria Popescu ${RUN};069111002;;;2000;Lead nou;agro;Recomandare`,
    `Ștefan Ciobanu ${RUN};069111003;stefan@paine.md;Brutăria Pâine Caldă ${RUN};500;;;`,
    `Ana Țurcanu ${RUN};;ana.turcanu@gmail.com;;;;;`,
    `Vasile Lungu ${RUN};069111005;;;;;;`,
    `Elena Bîrcă ${RUN};069111006;elena@x.md;;;;;`,
    `Gheorghe Moraru ${RUN};069111007;;;;;;`,
    `Ion R. dublură ${RUN};069111001;;;;;;`,
    `Ana T. dublură ${RUN};;ANA.TURCANU@gmail.com ;;;;;`,
    `Fără Contact ${RUN};;;;;;;`,
  ]);
  suite.add(G, "workspace nou pentru importul de leaduri", async (ctx) => {
    const x = st(ctx, G);
    x.s = await signupTenant(`limp-${RUN}`);
    x.me = x.s.user;
  });
  suite.add(G, "lista câmpurilor de mapare conține idno și etichete", async (ctx) => {
    const r = expectOk(await api(st(ctx, G).s, "GET", "/api/crm/import/fields"));
    const vals = r.fields.map((f) => f.value);
    for (const f of ["full_name", "phone", "email", "company", "idno", "tag", "ignore"]) expect(vals.includes(f), `lipsește ${f}`);
  });
  suite.add(G, "previzualizarea mapează antetele românești", async (ctx) => {
    const x = st(ctx, G);
    x.p = await previewLeads(x.s, TEN);
    const m = x.p.mapping;
    expect(x.p.delimiter === ";", `separator ${x.p.delimiter}`);
    expect(m[0] === "full_name" && m[1] === "phone" && m[2] === "email" && m[3] === "company" && m[4] === "value_cents" && m[5] === "stage" && m[6] === "tag" && m[7] === "source", `mapare ${JSON.stringify(m)}`);
  });
  suite.add(G, "previzualizarea: 10 rânduri, 7 noi, 2 duplicate, 1 eroare", async (ctx) => {
    const c = st(ctx, G).p.counts;
    expect(c.total === 10 && c.errors === 1 && c.duplicatesInFile === 2 && c.duplicatesInDb === 0 && c.importableNew === 7 && c.valid === 9, `counts ${JSON.stringify(c)}`);
  });
  suite.add(G, "telefonul cu prefix și fără e același om", async (ctx) => {
    const r = st(ctx, G).p.rows.find((v) => v.draft.full_name.startsWith("Ion R. dublură"));
    expect(r.status === "duplicate_in_file", `status ${r.status}`);
  });
  suite.add(G, "emailul cu majuscule și spațiu e același om", async (ctx) => {
    const r = st(ctx, G).p.rows.find((v) => v.draft.full_name.startsWith("Ana T. dublură"));
    expect(r.status === "duplicate_in_file", `status ${r.status}`);
  });
  suite.add(G, "rândul fără telefon și email e eroare explicată", async (ctx) => {
    const r = st(ctx, G).p.rows.find((v) => v.draft.full_name.startsWith("Fără Contact"));
    expect(r.errors.some((e) => /telefonul cât și emailul/.test(e)), `erori ${r.errors}`);
  });
  suite.add(G, "previzualizarea rezolvă etapa, sursa și suma", async (ctx) => {
    const rows = st(ctx, G).p.rows;
    const ion = rows[0];
    expect(ion.resolved.stage === "contacted" && ion.resolved.source === "facebook_ad" && ion.draft.value_cents === 123456, `Ion ${JSON.stringify(ion.resolved)} ${ion.draft.value_cents}`);
    expect(rows[1].resolved.stage === "new" && rows[1].resolved.source === "referral", `Maria ${JSON.stringify(rows[1].resolved)}`);
    expect(rows[2].resolved.source === "import", `sursa implicită ${rows[2].resolved.source}`);
  });
  suite.add(G, "previzualizarea nu scrie nimic", async (ctx) => {
    const x = st(ctx, G);
    expect((await countAllLeads(x.s)) === 0, "previzualizarea a creat leaduri");
    expect((await companies(x.s)).length === 0, "previzualizarea a creat firme");
  });
  suite.add(G, "importul: 7 create, 3 sărite — exact ce a promis previzualizarea", async (ctx) => {
    const x = st(ctx, G);
    const r = await importLeads(x.s, TEN, { fileName: `clienti-${RUN}.csv` });
    expect(r.created === 7 && r.created === x.p.counts.importableNew, `created ${r.created}`);
    expect(r.skipped === 3 && r.details.length === 3, `skipped ${r.skipped}`);
    expect(JSON.stringify(r.counts) === JSON.stringify(x.p.counts), "numărătorile importului diferă de previzualizare");
    expect((await countAllLeads(x.s)) === 7, "numărul real de leaduri diferă de raport");
    x.jobId = r.jobId;
    x.details = r.details;
  });
  suite.add(G, "exportul CSV al CRM-ului se reimportă într-un workspace nou fără pierderi", async (ctx) => {
    const x = st(ctx, G);
    const exp = await api(x.s, "GET", "/api/crm/leads/export.csv");
    expectStatus(exp, 200);
    const fresh = await signupTenant(`limp-rt-${RUN}`);
    const p = await previewLeads(fresh, exp.text);
    expect(p.counts.total === 7 && p.counts.importableNew === 7, `counts ${JSON.stringify(p.counts)} mapare ${JSON.stringify(p.mapping)}`);
    const r = await importLeads(fresh, exp.text);
    expect(r.created === 7, `created ${r.created}`);
    const ion = (await leadsSearch(fresh, `Ion Rusu ${RUN}`))[0];
    expect(ion && ion.valueCents === 123456 && ion.stage === "contacted" && ion.source === "facebook_ad" && ion.email === "ion.rusu@agroteh.md", `lead ${JSON.stringify(ion)}`);
    expect((await companies(fresh, "Agroteh")).length === 1, "firma nu a trecut prin export/import");
  });
  suite.add(G, "motivele sărite sunt pe rândurile corecte", async (ctx) => {
    const x = st(ctx, G);
    const d = x.details;
    expect(JSON.stringify(d.map((v) => v.rowNumber)) === JSON.stringify([8, 9, 10]), `rânduri ${JSON.stringify(d)}`);
    expect(d[0].reason === "Repetat în fișier." && d[1].reason === "Repetat în fișier." && /telefonul/.test(d[2].reason), `motive ${JSON.stringify(d)}`);
    const jobs = listOf(expectOk(await api(x.s, "GET", "/api/crm/import/jobs")));
    expect(jobs[0]?.id === x.jobId, "importul nu e primul în jurnal");
  });
  suite.add(G, "leadul importat are sursa, etapa, valoarea și firma", async (ctx) => {
    const x = st(ctx, G);
    const ion = (await leadsSearch(x.s, `Ion Rusu ${RUN}`))[0];
    expect(ion && ion.source === "facebook_ad" && ion.stage === "contacted" && ion.valueCents === 123456 && ion.company === `Agroteh Ștefănești ${RUN} SRL`, `lead ${JSON.stringify(ion)}`);
    const gh = (await leadsSearch(x.s, `Gheorghe Moraru ${RUN}`))[0];
    expect(gh.source === "import" && gh.stage === "new" && gh.valueCents === 0, `implicit ${gh.source} ${gh.stage} ${gh.valueCents}`);
  });
  suite.add(G, "etichetele din celulă sunt separate și scrise", async (ctx) => {
    const x = st(ctx, G);
    const ion = (await leadsSearch(x.s, `Ion Rusu ${RUN}`))[0];
    const tags = listOf(expectOk(await api(x.s, "GET", `/api/crm/tags?leadId=${ion.id}`))).map((t) => t.tag).sort();
    expect(JSON.stringify(tags) === JSON.stringify(["agro", "sud"]), `etichete ${tags}`);
    const byTag = listOf(expectOk(await api(x.s, "GET", "/api/crm/leads?tag=agro&pageSize=100")));
    expect(byTag.length === 2, `filtrul după eticheta „agro”: ${byTag.length}`);
  });
  suite.add(G, "firmele din fișier au fișe legate de leaduri", async (ctx) => {
    const x = st(ctx, G);
    const list = await companies(x.s);
    expect(list.length === 2, `firme ${list.map((c) => c.name)}`);
    expect(list.every((c) => c.leadCount === 1), `leadCount ${list.map((c) => c.leadCount)}`);
  });
  suite.add(G, "jurnalul importului are numerele corecte", async (ctx) => {
    const x = st(ctx, G);
    const j = listOf(expectOk(await api(x.s, "GET", "/api/crm/import/jobs")))[0];
    expect(j.fileName === `clienti-${RUN}.csv` && j.totalRows === 10 && j.createdCount === 7 && j.duplicateCount === 2 && j.errorCount === 1, `jurnal ${JSON.stringify(j)}`);
    expect(j.createdByName === "Tenant Izolat", `autor ${j.createdByName}`);
  });
  suite.add(G, "reimportul aceluiași fișier nu creează nimic", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, TEN);
    expect(p.counts.duplicatesInDb === 9 && p.counts.importableNew === 0, `counts ${JSON.stringify(p.counts)}`);
    const r = await importLeads(x.s, TEN);
    expect(r.created === 0 && (await countAllLeads(x.s)) === 7, `created ${r.created}`);
    expect((await companies(x.s)).length === 2, "reimportul a dublat firmele");
  });
  suite.add(G, "cu skipDuplicates=false se importă și duplicatele, cât promite importableAll", async (ctx) => {
    const x = st(ctx, G);
    const small = csv(["Nume;Telefon", `Vasile Lungu bis ${RUN};069111005`, `Nou Nouț ${RUN};069111099`]);
    const p = await previewLeads(x.s, small);
    expect(p.counts.importableAll === 2 && p.counts.importableNew === 1, `counts ${JSON.stringify(p.counts)}`);
    const r = await importLeads(x.s, small, { skipDuplicates: false });
    expect(r.created === 2 && (await countAllLeads(x.s)) === 9, `created ${r.created}`);
  });
  suite.add(G, "virgulă, ghilimele, ghilimele dublate și rând nou în câmp", async (ctx) => {
    const x = st(ctx, G);
    const text = `Nume,Telefon,Observații\n"Popa, Ion ${RUN}",069222001,"Zice ""vine mâine""\npe al doilea rând"\n`;
    const p = await previewLeads(x.s, text);
    expect(p.delimiter === ",", `separator ${p.delimiter}`);
    const d = p.rows[0].draft;
    expect(p.counts.total === 1 && d.full_name === `Popa, Ion ${RUN}` && d.notes === 'Zice "vine mâine"\npe al doilea rând', `draft ${JSON.stringify(d)}`);
  });
  suite.add(G, "BOM și CRLF (export Excel) se citesc corect", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, `﻿Nume;Email\r\nLuminița ${RUN};lumi@x.md\r\n`);
    expect(p.mapping[0] === "full_name" && p.rows[0].draft.email === "lumi@x.md" && p.counts.total === 1, `mapare ${JSON.stringify(p.mapping)}`);
  });
  suite.add(G, "separatorul TAB e detectat", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, `Nume\tTelefon\nTab ${RUN}\t069222002`);
    expect(p.delimiter === "\t" && p.rows[0].draft.phone === "069222002", `separator ${JSON.stringify(p.delimiter)}`);
  });
  suite.add(G, "separatorul explicit bate detecția", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, `Nume;Adresa\nIon ${RUN};str. X, bl. 2`, { delimiter: "," });
    expect(p.delimiter === "," && p.headers.length === 1 && p.headers[0] === "Nume;Adresa", `antete ${JSON.stringify(p.headers)}`);
  });
  suite.add(G, "rândurile goale din mijloc nu sunt numărate ca erori", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, csv(["Nume;Telefon", `Unu ${RUN};069222011`, "", ";", `Doi ${RUN};069222012`]));
    expect(p.counts.errors === 0 && p.counts.total === 2, `counts ${JSON.stringify(p.counts)} — un rând gol a devenit „Lipsește numele”`);
  });
  suite.add(G, "rândurile goale de la final sunt ignorate", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, `Nume;Telefon\nTrei ${RUN};069222013\n\n\n`);
    expect(p.counts.total === 1 && p.counts.errors === 0, `counts ${JSON.stringify(p.counts)}`);
  });
  suite.add(G, "emailul greșit e semnalat la previzualizare", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, csv(["Nume;Telefon;Email", `Email Stricat ${RUN};069222020;ion@@gmail`]));
    const r = p.rows[0];
    expect(r.errors.length + r.warnings.length > 0, "adresa „ion@@gmail” trece fără nicio semnalare (POST /leads ar refuza-o)");
  });
  suite.add(G, "doar firma, fără persoană: firma devine numele leadului", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, csv(["Companie;Telefon", `Doar Firmă ${RUN} SRL;069222030`]));
    expect(p.rows[0].draft.full_name === `Doar Firmă ${RUN} SRL` && p.rows[0].errors.length === 0, `draft ${JSON.stringify(p.rows[0])}`);
  });
  suite.add(G, "etapa necunoscută cade pe prima etapă, cu avertisment", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, csv(["Nume;Telefon;Etapă", `Etapă ciudată ${RUN};069222040;Negociere avansată`]));
    const r = p.rows[0];
    expect(r.resolved.stage === "new" && r.warnings.some((w) => /nu există în pâlnie/.test(w)), `rând ${JSON.stringify(r)}`);
  });
  suite.add(G, "responsabilul după email e găsit în echipă", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, csv(["Nume;Telefon;Responsabil", `Cu responsabil ${RUN};069222050;${x.me.email.toUpperCase()}`]));
    expect(p.rows[0].resolved.assignedTo === x.me.id && p.rows[0].resolved.assignedToName === "Tenant Izolat", `rezolvat ${JSON.stringify(p.rows[0].resolved)}`);
  });
  suite.add(G, "responsabilul din afara echipei rămâne neatribuit, cu avertisment", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, csv(["Nume;Telefon;Responsabil", `Fără responsabil ${RUN};069222051;nimeni-${RUN}@example.invalid`]));
    expect(p.rows[0].resolved.assignedTo === null && p.rows[0].warnings.length > 0, `rezolvat ${JSON.stringify(p.rows[0].resolved)}`);
  });
  suite.add(G, "responsabilul importat chiar e pus pe lead", async (ctx) => {
    const x = st(ctx, G);
    const r = await importLeads(x.s, csv(["Nume;Telefon;Responsabil", `Atribuit ${RUN};069222052;${x.me.email}`]));
    expect(r.created === 1, `created ${r.created}`);
    const l = (await leadsSearch(x.s, `Atribuit ${RUN}`))[0];
    expect(l.assignedTo === x.me.id, `assignedTo ${l.assignedTo}`);
  });
  suite.add(G, "maparea explicită: coloana ignorată nu ajunge pe lead", async (ctx) => {
    const x = st(ctx, G);
    const text = csv(["Nume;Telefon;Email", `Ignorat ${RUN};069222060;secret@x.md`]);
    const r = await importLeads(x.s, text, { mapping: { 0: "full_name", 1: "phone", 2: "ignore" } });
    expect(r.created === 1, `created ${r.created}`);
    const l = (await leadsSearch(x.s, `Ignorat ${RUN}`))[0];
    expect(l.email === null, `emailul ignorat s-a scris: ${l.email}`);
  });
  suite.add(G, "ținta de mapare inventată → 400", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", "/api/crm/import/preview", { text: "Nume\nX", mapping: { 0: "salariu" } }), 400);
  });
  suite.add(G, "conținutul gol → 400", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/import/preview", { text: "" }), 400);
  });
  suite.add(G, "doar antetul: zero rânduri, zero create", async (ctx) => {
    const x = st(ctx, G);
    const before = await countAllLeads(x.s);
    const r = await importLeads(x.s, "Nume;Telefon;Email");
    expect(r.created === 0 && r.counts.total === 0 && (await countAllLeads(x.s)) === before, `răspuns ${JSON.stringify(r)}`);
  });
  suite.add(G, "fișier peste 2 MB → 413 și nimic scris", async (ctx) => {
    const x = st(ctx, G);
    const before = await countAllLeads(x.s);
    const r = await api(x.s, "POST", "/api/crm/import/run", { text: "Nume;Telefon\n" + `Mare ${RUN};069000000\n`.repeat(90000) });
    expectStatus(r, 413);
    expect((await countAllLeads(x.s)) === before, "s-au scris leaduri dintr-un fișier refuzat");
  });
  suite.add(G, "câmp personalizat: coloana cu eticheta lui se mapează singură și se scrie", async (ctx) => {
    const x = st(ctx, G);
    const f = expectOk(await api(x.s, "POST", "/api/crm/custom-fields", { label: "Cod CAEN" }));
    expect(f.key === "cod_caen", `cheie ${f.key}`);
    const text = csv(["Nume;Telefon;Cod CAEN", `Cu CAEN ${RUN};069222070;4321`]);
    const p = await previewLeads(x.s, text);
    expect(p.mapping[2] === "cf:cod_caen", `mapare ${JSON.stringify(p.mapping)}`);
    const r = await importLeads(x.s, text);
    expect(r.created === 1 && r.customValuesWritten === 1, `răspuns ${JSON.stringify(r)}`);
    const l = (await leadsSearch(x.s, `Cu CAEN ${RUN}`))[0];
    const vals = listOf(expectOk(await api(x.s, "GET", `/api/crm/custom-fields/values?leadId=${l.id}`)));
    expect(vals.some((v) => v.fieldId === f.id && v.value === "4321"), `valori ${JSON.stringify(vals)}`);
  });
  suite.add(G, "câmp personalizat inexistent în mapare: coloana cade, cu avertisment", async (ctx) => {
    const x = st(ctx, G);
    const p = await previewLeads(x.s, csv(["Nume;Telefon;X", `Cf lipsă ${RUN};069222071;abc`]), { mapping: { 0: "full_name", 1: "phone", 2: "cf:nu_exista" } });
    expect(p.mapping[2] === "ignore" && p.rows[0].warnings.some((w) => /nu_exista/.test(w)), `mapare ${JSON.stringify(p.mapping)}`);
  });
  suite.add(G, "IDNO-ul unei firme cu lead existent → duplicat în bază", async (ctx) => {
    const x = st(ctx, G);
    const first = await importLeads(x.s, csv(["Nume;Telefon;IDNO;Companie", `Primul IDNO ${RUN};069222080;1003600066666;Omega ${RUN} SRL`]));
    expect(first.created === 1, `created ${first.created}`);
    const p = await previewLeads(x.s, csv(["Nume;Telefon;IDNO;Companie", `Alt om Omega ${RUN};069222081;MD1003600066666;Omega ${RUN} SRL`]));
    expect(p.rows[0].status === "duplicate_in_db", `status ${p.rows[0].status}`);
  });
  suite.add(G, "aceeași firmă cu și fără IDNO în același fișier → o singură fișă", async (ctx) => {
    const x = st(ctx, G);
    const firm = `Sigma Construct ${RUN} SRL`;
    const r = await importLeads(x.s, csv([
      "Nume;Telefon;IDNO;Companie",
      `Director Sigma ${RUN};069222090;1003600077777;${firm}`,
      `Contabil Sigma ${RUN};069222091;;${firm}`,
    ]));
    expect(r.created === 2, `created ${r.created}`);
    const list = await companies(x.s, "Sigma Construct");
    expect(list.length === 1, `${list.length} fișe pentru „${firm}”`);
  });
  suite.add(G, "registru Excel (.xlsx) cu leaduri se previzualizează", async (ctx) => {
    const x = st(ctx, G);
    const b64 = await xlsxBase64([["Leaduri", [["Nume", "Telefon", "Email"], [`Excel Unu ${RUN}`, "069222100", "unu@x.md"], [`Excel Doi ${RUN}`, "069222101", ""]]]]);
    const p = await previewLeads(x.s, b64, { format: "xlsx" });
    expect(p.counts.total === 2 && p.rows[0]?.draft.full_name === `Excel Unu ${RUN}`, `previzualizare ${JSON.stringify({ headers: p.headers, counts: p.counts }).slice(0, 200)}`);
  });
  suite.add(G, "registru Excel (.xlsx) cu leaduri se importă", async (ctx) => {
    const x = st(ctx, G);
    const b64 = await xlsxBase64([["Leaduri", [["Nume", "Telefon"], [`Excel Trei ${RUN}`, "069222102"]]]]);
    const before = await countAllLeads(x.s);
    const r = await importLeads(x.s, b64, { format: "xlsx" });
    expect(r.created === 1 && (await countAllLeads(x.s)) === before + 1, `created ${r.created}`);
    expect((await leadsSearch(x.s, `Excel Trei ${RUN}`)).length === 1, "leadul din Excel lipsește");
  });
  suite.add(G, "alt workspace nu vede jurnalul meu de importuri", async (ctx) => {
    const x = st(ctx, G);
    const other = await signupTenant(`limp-b-${RUN}`);
    const r = await api(other, "GET", "/api/crm/import/jobs");
    expect(listOf(expectOk(r)).length === 0 && !r.text.includes(x.jobId), "jurnalul se vede din alt workspace");
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// IMPORT — mapări salvate
// ═════════════════════════════════════════════════════════════════════════════
function importMapari(suite) {
  const G = "import:mapari";
  const NAME = `Export Kommo ${RUN}`;
  suite.add(G, "workspace nou pentru mapări", async (ctx) => {
    const x = st(ctx, G);
    x.s = await signupTenant(`map-${RUN}`);
    x.b = await signupTenant(`map-b-${RUN}`);
  });
  suite.add(G, "lista de mapări e goală la început", async (ctx) => {
    expect(listOf(expectOk(await api(st(ctx, G).s, "GET", "/api/crm/import/mappings"))).length === 0, "mapări din senin");
  });
  suite.add(G, "salvez o mapare → 201", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.s, "POST", "/api/crm/import/mappings", { name: NAME, mapping: { 0: "full_name", 1: "phone", 2: "tag" } });
    expectStatus(r, 201);
    x.m = r.json;
    expect(x.m.id && x.m.name === NAME && x.m.mapping["1"] === "phone", `mapare ${JSON.stringify(x.m)}`);
  });
  suite.add(G, "maparea salvată apare în listă", async (ctx) => {
    const x = st(ctx, G);
    const items = listOf(expectOk(await api(x.s, "GET", "/api/crm/import/mappings")));
    expect(items.length === 1 && items[0].id === x.m.id, `mapări ${items.length}`);
  });
  suite.add(G, "același nume actualizează maparea, nu face una nouă", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.s, "POST", "/api/crm/import/mappings", { name: NAME, mapping: { 0: "full_name", 1: "email" } });
    expectStatus(r, 200);
    expect(r.json.id === x.m.id, "s-a creat alt rând");
    const items = listOf(expectOk(await api(x.s, "GET", "/api/crm/import/mappings")));
    expect(items.length === 1 && items[0].mapping["1"] === "email" && items[0].mapping["2"] === undefined, `mapare ${JSON.stringify(items[0]?.mapping)}`);
  });
  suite.add(G, "maparea salvată se aplică la import", async (ctx) => {
    const x = st(ctx, G);
    const items = listOf(expectOk(await api(x.s, "GET", "/api/crm/import/mappings")));
    const p = await previewLeads(x.s, csv(["A;B", `Mapat ${RUN};mapat@x.md`]), { mapping: items[0].mapping });
    expect(p.rows[0].draft.full_name === `Mapat ${RUN}` && p.rows[0].draft.email === "mapat@x.md" && p.counts.valid === 1, `draft ${JSON.stringify(p.rows[0].draft)}`);
  });
  suite.add(G, "mapare cu câmp personalizat (cf:) se poate salva", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "POST", "/api/crm/import/mappings", { name: `${NAME} cf`, mapping: { 0: "full_name", 1: "cf:cod_caen" } }), 201);
  });
  suite.add(G, "ținta inventată nu se salvează", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/import/mappings", { name: `Greșită ${RUN}`, mapping: { 0: "salariu" } }), 400);
  });
  suite.add(G, "cheie cf: cu majuscule sau spații nu se salvează", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/import/mappings", { name: `Greșită cf ${RUN}`, mapping: { 0: "cf:Cod CAEN" } }), 400);
  });
  suite.add(G, "numele gol nu se salvează", async (ctx) => {
    expectStatus(await api(st(ctx, G).s, "POST", "/api/crm/import/mappings", { name: "", mapping: { 0: "full_name" } }), 400);
  });
  suite.add(G, "alt workspace nu vede și nu șterge maparea", async (ctx) => {
    const x = st(ctx, G);
    const r = await api(x.b, "GET", "/api/crm/import/mappings");
    expect(!r.text.includes(x.m.id), "maparea se vede din alt workspace");
    expectStatus(await api(x.b, "DELETE", `/api/crm/import/mappings/${x.m.id}`), 404);
    expect(listOf(expectOk(await api(x.s, "GET", "/api/crm/import/mappings"))).some((m) => m.id === x.m.id), "maparea a dispărut");
  });
  suite.add(G, "același nume în alt workspace e o mapare separată", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.b, "POST", "/api/crm/import/mappings", { name: NAME, mapping: { 0: "company" } }), 201);
    const mine = listOf(expectOk(await api(x.s, "GET", "/api/crm/import/mappings"))).find((m) => m.id === x.m.id);
    expect(mine.mapping["0"] === "full_name", "maparea mea a fost suprascrisă de alt workspace");
  });
  suite.add(G, "șterg maparea → ok, dispare din listă", async (ctx) => {
    const x = st(ctx, G);
    expect(expectOk(await api(x.s, "DELETE", `/api/crm/import/mappings/${x.m.id}`)).ok === true, "ștergerea nu confirmă");
    expect(!listOf(expectOk(await api(x.s, "GET", "/api/crm/import/mappings"))).some((m) => m.id === x.m.id), "maparea ștearsă e încă în listă");
  });
  suite.add(G, "a doua ștergere → 404", async (ctx) => {
    const x = st(ctx, G);
    expectStatus(await api(x.s, "DELETE", `/api/crm/import/mappings/${x.m.id}`), 404);
  });
}
