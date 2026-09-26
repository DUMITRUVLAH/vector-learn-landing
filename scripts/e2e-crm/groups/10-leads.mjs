// LEADS CORE — comportamentul real al leadurilor, pe serverul REAL.
//
// Fiecare scenariu INVOCĂ o acțiune cu date realiste și verifică rezultatul citindu-l înapoi
// (§3.5.1quater: testăm acțiunea, nu faptul că butonul există). Acoperă: CRUD + validare,
// etape (câștigat/pierdut/redeschis/pâlnii), tabla kanban (numărători și sume), lista (căutare,
// filtre, paginare, sortare, segmente), exportul CSV, acțiunile în masă, cronologia și apelurile,
// istoricul persoanei + duplicatele, GDPR (export, retragere, anonimizare) și izolarea între clienți.
//
// Izolare: fiecare grup își face PROPRIUL workspace nou (signupTenant). Nu scriem nimic în
// tenantul semănat (ctx.admin) și nu atingem utilizatorii lui.

import {
  BASE, RUN, uid, api, expect, expectStatus, expectClientError, expectNo5xx, signupTenant, RANDOM_UUID,
} from "../lib.mjs";

// ── Ajutoare locale ──────────────────────────────────────────────────────────

/** Cerere brută, ca să citim antetele răspunsului (content-disposition, x-export-*). */
const rawGet = (s, p) => fetch(`${BASE}${p}`, { headers: { cookie: s.cookieHeader() } });

const short = (x) => JSON.stringify(x)?.slice(0, 220);
const L = "/api/crm/leads";
const GDPR_REMOVED = "[GDPR_REMOVED]";

/**
 * Workspace nou-nouț. Implicit deschide tabla o dată, exact ca interfața la primul ecran CRM:
 * etapele pâlniei implicite se seamănă abia la `GET /pipeline` (vezi grupul `leads:workspace-nou`,
 * care verifică separat ce se întâmplă când NU s-a deschis tabla).
 */
async function newTenant(ctx, key, label, { openBoard = true } = {}) {
  ctx[key] = await signupTenant(label);
  expect(ctx[key].user?.id, `signup fără user: ${short(ctx[key])}`);
  expect(ctx[key].tenant?.id, `signup fără tenant: ${short(ctx[key])}`);
  if (openBoard) await board(ctx[key]);
  return ctx[key];
}

async function createLead(s, body) {
  const r = await api(s, "POST", L, body);
  expectStatus(r, 201, `creare lead ${short(body)}: `);
  expect(typeof r.json?.id === "string", `creare fără id: ${r.text.slice(0, 120)}`);
  return r.json;
}

async function getLead(s, id) {
  const r = await api(s, "GET", `${L}/${id}`);
  expectStatus(r, 200, `GET lead: `);
  return r.json;
}

function qs(q = {}) {
  const s = new URLSearchParams(q).toString();
  return s ? `?${s}` : "";
}

async function listLeads(s, q = {}) {
  const r = await api(s, "GET", `${L}${qs(q)}`);
  expectStatus(r, 200, `listă ${qs(q)}: `);
  expect(Array.isArray(r.json?.items), `listă fără items: ${r.text.slice(0, 120)}`);
  return r.json;
}

async function board(s, q = {}) {
  const r = await api(s, "GET", `${L}/pipeline${qs(q)}`);
  expectStatus(r, 200, `tablă ${qs(q)}: `);
  expect(Array.isArray(r.json?.stages) && r.json.counts && r.json.grouped, `tablă incompletă: ${r.text.slice(0, 160)}`);
  return r.json;
}

const moveStage = (s, id, stage, lostReason) =>
  api(s, "PATCH", `${L}/${id}/stage`, lostReason === undefined ? { stage } : { stage, lostReason });

async function timeline(s, id) {
  const r = await api(s, "GET", `${L}/${id}/interactions`);
  expectStatus(r, 200, `cronologie: `);
  expect(Array.isArray(r.json?.items), `cronologie fără items: ${r.text.slice(0, 120)}`);
  return r.json.items;
}

const addInteraction = (s, id, body) => api(s, "POST", `${L}/${id}/interactions`, body);

async function audit(s, targetId) {
  const r = await api(s, "GET", `/api/crm/audit${qs({ targetId, limit: "200" })}`);
  expectStatus(r, 200, `jurnal: `);
  return r.json.items ?? [];
}

async function defaultPipelineId(s) {
  const r = await api(s, "GET", "/api/crm/pipelines");
  expectStatus(r, 200, "pâlnii: ");
  const def = r.json.items.find((p) => p.isDefault) ?? r.json.items[0];
  expect(def?.id, `nicio pâlnie: ${r.text.slice(0, 120)}`);
  return def.id;
}

async function createPipeline(s, name, template) {
  const r = await api(s, "POST", "/api/crm/pipelines", template ? { name, template } : { name });
  expectStatus(r, 201, "creare pâlnie: ");
  return r.json;
}

/** CSV cu separator `;`, ghilimele dublate, CRLF, BOM — parser minimal, strict. */
function parseCsv(text) {
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ";") { row.push(cell); cell = ""; }
    else if (ch === "\r" && t[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function exportCsv(s, q = {}) {
  const r = await api(s, "GET", `${L}/export.csv${qs(q)}`);
  expectStatus(r, 200, `export ${qs(q)}: `);
  expect(/text\/csv/.test(r.ct), `exportul nu e CSV: ${r.ct}`);
  const rows = parseCsv(r.text);
  return { r, rows, header: rows[0], data: rows.slice(1) };
}

// ═════════════════════════════════════════════════════════════════════════════

export function register(suite) {
  // ── leads:crud — creare, citire, editare, validare ─────────────────────────
  {
    const G = "leads:crud";
    const BAD = `INVALID-${RUN}`;

    suite.add(G, "workspace nou cu drepturi CRM complete de administrator", async (ctx) => {
      const s = await newTenant(ctx, "leadsT", "leads");
      ctx.leadsT2 = await signupTenant("leads-b");
      const r = await api(s, "GET", "/api/crm/permissions");
      expectStatus(r, 200);
      for (const p of ["leads.edit", "leads.export", "leads.delete", "audit.view"]) {
        expect(r.json.permissions?.includes(p), `lipsește dreptul ${p}: ${short(r.json.permissions)}`);
      }
    });

    suite.add(G, "lead creat doar cu nume intră pe prima etapă, sursă manuală, valoare 0", async (ctx) => {
      const s = ctx.leadsT;
      const lead = await createLead(s, { fullName: `Minim ${uid()}` });
      const pid = await defaultPipelineId(s);
      expect(lead.stage === "new", `etapa: ${lead.stage}`);
      expect(lead.source === "manual", `sursa: ${lead.source}`);
      expect(lead.valueCents === 0, `valoarea: ${lead.valueCents}`);
      expect(lead.pipelineId === pid, `pâlnia ${lead.pipelineId} ≠ implicita ${pid}`);
      expect(lead.lostReason === null && lead.assignedTo === null, `câmpuri neașteptate: ${short(lead)}`);
      ctx.crudMin = lead;
    });

    suite.add(G, "leadul creat se citește înapoi identic", async (ctx) => {
      const back = await getLead(ctx.leadsT, ctx.crudMin.id);
      expect(back.id === ctx.crudMin.id && back.fullName === ctx.crudMin.fullName, `citit: ${short(back)}`);
      expect(back.stage === "new" && back.pipelineId === ctx.crudMin.pipelineId, `citit: ${short(back)}`);
    });

    suite.add(G, "lead complet cu diacritice: toate câmpurile se salvează", async (ctx) => {
      const body = {
        fullName: `Ștefan Țurcanu ${RUN}`,
        phone: "+373 69 123 456",
        email: `Stefan.Turcanu-${RUN}@Example.invalid`,
        company: "Țesătoria Nord SRL",
        dealName: "Curs engleză B2 — grupă de seară",
        interestCourse: "Engleză B2",
        valueCents: 450000,
        probabilityPct: 40,
        source: "facebook_ad",
        notes: "Preferă apeluri după ora 18:00; întreabă de reducere.",
      };
      const lead = await createLead(ctx.leadsT, body);
      const back = await getLead(ctx.leadsT, lead.id);
      for (const k of ["fullName", "phone", "email", "company", "dealName", "interestCourse", "valueCents", "probabilityPct", "source"]) {
        expect(back[k] === body[k], `${k}: trimis ${short(body[k])}, citit ${short(back[k])}`);
      }
      ctx.crudFull = lead;
    });

    suite.add(G, "telefonul și emailul se normalizează la creare", async (ctx) => {
      const l = ctx.crudFull;
      expect(l.phoneNormalized === "69123456", `phoneNormalized: ${l.phoneNormalized}`);
      expect(l.emailNormalized === `stefan.turcanu-${RUN}@example.invalid`, `emailNormalized: ${l.emailNormalized}`);
    });

    suite.add(G, "numele cu diacritice rămâne neatins (Ș, Ț, ă, â, î)", async (ctx) => {
      const name = `Ălina Îngerașu-Țâru ${RUN}`;
      const l = await createLead(ctx.leadsT, { fullName: name });
      const back = await getLead(ctx.leadsT, l.id);
      expect(back.fullName === name, `citit „${back.fullName}”`);
    });

    suite.add(G, "fișa de detaliu aduce leadul, cronologia și etapa curentă", async (ctx) => {
      const r = await api(ctx.leadsT, "GET", `${L}/${ctx.crudFull.id}/detail`);
      expectStatus(r, 200);
      expect(r.json.lead?.id === ctx.crudFull.id, `lead: ${short(r.json.lead)}`);
      expect(Array.isArray(r.json.interactions), "fără interactions");
      expect(r.json.stage?.key === "new" && r.json.stage?.label === "Lead nou", `etapa: ${short(r.json.stage)}`);
    });

    suite.add(G, "editarea numelui se salvează și avansează updatedAt", async (ctx) => {
      const before = await getLead(ctx.leadsT, ctx.crudMin.id);
      await new Promise((res) => setTimeout(res, 15));
      const name = `Minim Redenumit ${RUN}`;
      const r = await api(ctx.leadsT, "PATCH", `${L}/${ctx.crudMin.id}`, { fullName: name });
      expectStatus(r, 200);
      const back = await getLead(ctx.leadsT, ctx.crudMin.id);
      expect(back.fullName === name, `nume: ${back.fullName}`);
      expect(new Date(back.updatedAt) > new Date(before.updatedAt), `updatedAt nu a avansat: ${before.updatedAt} → ${back.updatedAt}`);
    });

    suite.add(G, "editarea telefonului recalculează forma normalizată", async (ctx) => {
      const r = await api(ctx.leadsT, "PATCH", `${L}/${ctx.crudMin.id}`, { phone: "0 (22) 45-67-89" });
      expectStatus(r, 200);
      expect(r.json.phoneNormalized === "22456789", `phoneNormalized: ${r.json.phoneNormalized}`);
      const back = await getLead(ctx.leadsT, ctx.crudMin.id);
      expect(back.phone === "0 (22) 45-67-89", `phone: ${back.phone}`);
    });

    suite.add(G, "emailul se poate șterge (null)", async (ctx) => {
      const id = ctx.crudFull.id;
      expectStatus(await api(ctx.leadsT, "PATCH", `${L}/${id}`, { email: null }), 200);
      const back = await getLead(ctx.leadsT, id);
      expect(back.email === null, `email: ${back.email}`);
    });

    suite.add(G, "valoarea și probabilitatea se editează; probabilitatea poate reveni la null", async (ctx) => {
      const id = ctx.crudFull.id;
      expectStatus(await api(ctx.leadsT, "PATCH", `${L}/${id}`, { valueCents: 99900, probabilityPct: null }), 200);
      const back = await getLead(ctx.leadsT, id);
      expect(back.valueCents === 99900, `valoare: ${back.valueCents}`);
      expect(back.probabilityPct === null, `probabilitate: ${back.probabilityPct}`);
    });

    suite.add(G, "PATCH generic nu mută leadul în altă pâlnie", async (ctx) => {
      const s = ctx.leadsT;
      const p = await createPipeline(s, `Alta ${RUN}`);
      const r = await api(s, "PATCH", `${L}/${ctx.crudFull.id}`, { pipelineId: p.id });
      expectNo5xx(r);
      const back = await getLead(s, ctx.crudFull.id);
      expect(back.pipelineId === ctx.crudFull.pipelineId, `pâlnia s-a schimbat: ${back.pipelineId}`);
    });

    suite.add(G, "creare cu etapă explicită existentă („trial”) intră direct acolo", async (ctx) => {
      const l = await createLead(ctx.leadsT, { fullName: `Trial Direct ${RUN}`, stage: "trial" });
      expect((await getLead(ctx.leadsT, l.id)).stage === "trial", "etapa nu e trial");
    });

    suite.add(G, "id inexistent: GET, detail și PATCH → 404", async (ctx) => {
      const s = ctx.leadsT;
      expectStatus(await api(s, "GET", `${L}/${RANDOM_UUID}`), 404);
      expectStatus(await api(s, "GET", `${L}/${RANDOM_UUID}/detail`), 404);
      expectStatus(await api(s, "PATCH", `${L}/${RANDOM_UUID}`, { fullName: "Nume Valid" }), 404);
    });

    // Validare: input greșit realist → 400, nimic creat.
    const invalid = [
      ["nume de un singur caracter", { fullName: "A" }],
      ["fără nume", { phone: "069123456" }],
      ["email fără domeniu „stefan@”", { email: "stefan@" }],
      ["email „nu-e-email”", { email: "nu-e-email" }],
      ["valoare negativă", { valueCents: -100 }],
      ["valoare cu zecimale (12.5 cenți)", { valueCents: 12.5 }],
      ["valoare ca text „1000”", { valueCents: "1000" }],
      ["probabilitate 101%", { probabilityPct: 101 }],
      ["probabilitate -1%", { probabilityPct: -1 }],
      ["sursă necunoscută „tiktok”", { source: "tiktok" }],
      ["cantitate de produs 0", { productQty: 0 }],
      ["telefon de 33 de caractere", { phone: "0".repeat(33) }],
      ["responsabil care nu e uuid", { assignedTo: "abc" }],
      ["pâlnie care nu e uuid", { pipelineId: "pâlnia-mea" }],
      ["etapă goală", { stage: "" }],
    ];
    for (const [what, extra] of invalid) {
      suite.add(G, `creare refuzată: ${what} → 400`, async (ctx) => {
        const body = { fullName: `${BAD}-zod ${what}`, ...extra };
        if (!("fullName" in extra) && what === "fără nume") delete body.fullName;
        const r = await api(ctx.leadsT, "POST", L, body);
        expectStatus(r, 400, `${what}: `);
      });
    }

    suite.add(G, "numele doar din spații este refuzat", async (ctx) => {
      const r = await api(ctx.leadsT, "POST", L, { fullName: "     ", email: `spatii-${RUN}@example.invalid` });
      expectStatus(r, 400, "nume gol din spații: ");
    });

    suite.add(G, "numele de 201 caractere → 400, nu 500", async (ctx) => {
      const r = await api(ctx.leadsT, "POST", L, { fullName: `${BAD} ${"N".repeat(201)}` });
      expectStatus(r, 400, "nume prea lung: ");
    });

    suite.add(G, "valoarea peste limita coloanei (30 mil. lei în cenți) → 400, nu 500", async (ctx) => {
      const r = await api(ctx.leadsT, "POST", L, { fullName: `${BAD} valoare mare`, valueCents: 3_000_000_000 });
      expectStatus(r, 400, "valoare peste int32: ");
    });

    suite.add(G, "responsabil = uuid care nu e niciun utilizator → 4xx, nu 500", async (ctx) => {
      const r = await api(ctx.leadsT, "POST", L, { fullName: `${BAD} resp fantomă`, assignedTo: RANDOM_UUID });
      expectClientError(r, "responsabil inexistent: ");
    });

    suite.add(G, "responsabil dintr-un alt workspace este refuzat", async (ctx) => {
      const r = await api(ctx.leadsT, "POST", L, { fullName: `${BAD} resp străin`, assignedTo: ctx.leadsT2.user.id });
      expectClientError(r, "responsabil din alt client: ");
    });

    suite.add(G, "creare cu etapă inexistentă → refuzată (altfel leadul dispare de pe tablă)", async (ctx) => {
      const r = await api(ctx.leadsT, "POST", L, { fullName: `${BAD} etapă fantomă`, stage: "etapa-inexistenta" });
      expectStatus(r, 400, "etapă necunoscută la creare: ");
    });

    suite.add(G, "JSON stricat la creare → 400", async (ctx) => {
      expectClientError(await api(ctx.leadsT, "POST", L, "{fullName: Ion"));
    });

    suite.add(G, "niciuna dintre cele 15 creări refuzate de validare nu a lăsat vreun lead", async (ctx) => {
      const j = await listLeads(ctx.leadsT, { search: `${BAD}-zod`, pageSize: "100" });
      expect(j.total === 0, `s-au creat ${j.total} leaduri invalide: ${short(j.items.map((i) => i.fullName))}`);
    });

    suite.add(G, "editare cu email invalid → 400 și emailul vechi rămâne", async (ctx) => {
      const s = ctx.leadsT;
      const l = await createLead(s, { fullName: `Email Stabil ${RUN}`, email: `stabil-${RUN}@example.invalid` });
      expectStatus(await api(s, "PATCH", `${L}/${l.id}`, { email: "stabil@" }), 400);
      expect((await getLead(s, l.id)).email === `stabil-${RUN}@example.invalid`, "emailul s-a stricat");
      ctx.crudStable = l;
    });

    suite.add(G, "editare cu nume de un caracter → 400 și numele rămâne", async (ctx) => {
      const s = ctx.leadsT;
      expectStatus(await api(s, "PATCH", `${L}/${ctx.crudStable.id}`, { fullName: "X" }), 400);
      expect((await getLead(s, ctx.crudStable.id)).fullName === `Email Stabil ${RUN}`, "numele s-a schimbat");
    });

    suite.add(G, "editare cu valoare negativă → 400 și valoarea rămâne", async (ctx) => {
      const s = ctx.leadsT;
      expectStatus(await api(s, "PATCH", `${L}/${ctx.crudStable.id}`, { valueCents: -5 }), 400);
      expect((await getLead(s, ctx.crudStable.id)).valueCents === 0, "valoarea s-a schimbat");
    });

    suite.add(G, "PATCH generic nu poate marca „pierdut” fără motiv (ocolind regula de pe /stage)", async (ctx) => {
      const s = ctx.leadsT;
      const l = await createLead(s, { fullName: `Ocolire Pierdut ${RUN}` });
      const r = await api(s, "PATCH", `${L}/${l.id}`, { stage: "lost" });
      const back = await getLead(s, l.id);
      expect(!(r.ok && back.stage === "lost" && !back.lostReason),
        `leadul a ajuns „pierdut” fără motiv prin PATCH generic (HTTP ${r.status})`);
    });

    suite.add(G, "PATCH generic cu etapă inexistentă → refuzat, etapa rămâne", async (ctx) => {
      const s = ctx.leadsT;
      const l = await createLead(s, { fullName: `Etapă Orfană ${RUN}` });
      const r = await api(s, "PATCH", `${L}/${l.id}`, { stage: "nu-exista" });
      const back = await getLead(s, l.id);
      expect(back.stage === "new", `leadul are acum etapa orfană „${back.stage}” (HTTP ${r.status})`);
    });

    suite.add(G, "crearea lasă urmă în jurnalul de audit (crm.lead.created)", async (ctx) => {
      const items = await audit(ctx.leadsT, ctx.crudFull.id);
      expect(items.some((i) => i.actionType === "crm.lead.created"), `jurnal: ${short(items.map((i) => i.actionType))}`);
    });
  }

  // ── leads:etape — tranziții, câștigat/pierdut, redeschidere, pâlnii ─────────
  {
    const G = "leads:etape";

    suite.add(G, "workspace nou pentru etape + pâlnie SPANCO", async (ctx) => {
      const s = await newTenant(ctx, "leadsStages", "leads-etape");
      ctx.stSpanco = await createPipeline(s, `SPANCO ${RUN}`, "spanco");
      ctx.stDefault = await defaultPipelineId(s);
      ctx.stLead = await createLead(s, { fullName: `Parcurs Complet ${RUN}`, valueCents: 50000 });
      expect(ctx.stLead.stage === "new", `etapa inițială ${ctx.stLead.stage}`);
    });

    suite.add(G, "new → contacted: răspuns cu etapa nouă și rezultatul de stoc", async (ctx) => {
      const r = await moveStage(ctx.leadsStages, ctx.stLead.id, "contacted");
      expectStatus(r, 200);
      expect(r.json.stage === "contacted", `etapa: ${r.json.stage}`);
      expect("stock" in r.json, `lipsește „stock” din răspuns: ${Object.keys(r.json)}`);
      expect((await getLead(ctx.leadsStages, ctx.stLead.id)).stage === "contacted", "citit: nu e contacted");
    });

    suite.add(G, "schimbarea de etapă scrie „new → contacted” în cronologie", async (ctx) => {
      const items = await timeline(ctx.leadsStages, ctx.stLead.id);
      const sc = items.find((i) => i.type === "stage_change");
      expect(sc, `nicio schimbare de etapă: ${short(items)}`);
      expect(sc.body === "new → contacted", `corp: ${sc.body}`);
      expect(sc.metadata?.from === "new" && sc.metadata?.to === "contacted", `metadata: ${short(sc.metadata)}`);
      expect(sc.userId === ctx.leadsStages.user.id, `autor: ${sc.userId}`);
    });

    suite.add(G, "contacted → trial → paid (câștigat)", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsStages, ctx.stLead.id, "trial"), 200);
      const r = await moveStage(ctx.leadsStages, ctx.stLead.id, "paid");
      expectStatus(r, 200);
      expect((await getLead(ctx.leadsStages, ctx.stLead.id)).stage === "paid", "nu e paid");
    });

    suite.add(G, "cronologia are toate cele 3 mutări, cea mai recentă prima", async (ctx) => {
      const sc = (await timeline(ctx.leadsStages, ctx.stLead.id)).filter((i) => i.type === "stage_change");
      expect(sc.length === 3, `${sc.length} schimbări: ${short(sc.map((x) => x.body))}`);
      expect(sc[0].body === "trial → paid" && sc[2].body === "new → contacted", `ordine: ${short(sc.map((x) => x.body))}`);
    });

    suite.add(G, "jurnalul de audit are fiecare schimbare cu etapa dinainte și de după", async (ctx) => {
      const items = (await audit(ctx.leadsStages, ctx.stLead.id)).filter((i) => i.actionType === "crm.lead.stage_changed");
      expect(items.length === 3, `${items.length} rânduri de audit`);
      expect(items.some((i) => i.oldValue?.stage === "trial" && i.newValue?.stage === "paid"), `audit: ${short(items)}`);
    });

    suite.add(G, "înapoi: câștigat → trial e permis (vânzătorii sar pași)", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsStages, ctx.stLead.id, "trial"), 200);
      expect((await getLead(ctx.leadsStages, ctx.stLead.id)).stage === "trial", "nu a revenit");
    });

    suite.add(G, "„pierdut” fără motiv → 400 lost_reason_required, etapa rămâne", async (ctx) => {
      const r = await moveStage(ctx.leadsStages, ctx.stLead.id, "lost");
      expectStatus(r, 400);
      expect(r.json?.error === "lost_reason_required", `eroare: ${short(r.json)}`);
      expect((await getLead(ctx.leadsStages, ctx.stLead.id)).stage === "trial", "etapa s-a schimbat");
    });

    suite.add(G, "„pierdut” cu motiv gol → 400", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsStages, ctx.stLead.id, "lost", ""), 400);
    });

    suite.add(G, "„pierdut” cu motiv doar din spații → 400", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsStages, ctx.stLead.id, "lost", "    "), 400);
    });

    suite.add(G, "„pierdut” cu motiv de 501 caractere → 400", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsStages, ctx.stLead.id, "lost", "m".repeat(501)), 400);
    });

    suite.add(G, "„pierdut” cu motiv „Preț prea mare” → salvat pe lead și în cronologie", async (ctx) => {
      const r = await moveStage(ctx.leadsStages, ctx.stLead.id, "lost", "Preț prea mare");
      expectStatus(r, 200);
      const back = await getLead(ctx.leadsStages, ctx.stLead.id);
      expect(back.stage === "lost" && back.lostReason === "Preț prea mare", `lead: ${short(back)}`);
      const sc = (await timeline(ctx.leadsStages, ctx.stLead.id)).find((i) => i.type === "stage_change");
      expect(sc.metadata?.lostReason === "Preț prea mare", `metadata: ${short(sc.metadata)}`);
    });

    suite.add(G, "leadul pierdut se redeschide (lost → new)", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsStages, ctx.stLead.id, "new"), 200);
      expect((await getLead(ctx.leadsStages, ctx.stLead.id)).stage === "new", "nu s-a redeschis");
    });

    suite.add(G, "etapă necunoscută → 400 unknown_stage, etapa rămâne", async (ctx) => {
      const r = await moveStage(ctx.leadsStages, ctx.stLead.id, "semnat-dar-nu-exista");
      expectStatus(r, 400);
      expect(r.json?.error === "unknown_stage", `eroare: ${short(r.json)}`);
      expect((await getLead(ctx.leadsStages, ctx.stLead.id)).stage === "new", "etapa s-a schimbat");
    });

    suite.add(G, "etapă goală sau lipsă → 400", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsStages, ctx.stLead.id, ""), 400);
      expectStatus(await api(ctx.leadsStages, "PATCH", `${L}/${ctx.stLead.id}/stage`, {}), 400);
    });

    suite.add(G, "cheie de etapă de 65 de caractere → 400", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsStages, ctx.stLead.id, "k".repeat(65)), 400);
    });

    suite.add(G, "etapă din ALTĂ pâlnie („negotiation” din SPANCO) → 400 unknown_stage", async (ctx) => {
      const r = await moveStage(ctx.leadsStages, ctx.stLead.id, "negotiation");
      expectStatus(r, 400);
      expect((await getLead(ctx.leadsStages, ctx.stLead.id)).stage === "new", "a sărit în etapa altei pâlnii");
    });

    suite.add(G, "schimbare de etapă pe lead inexistent → 404", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsStages, RANDOM_UUID, "contacted"), 404);
    });

    suite.add(G, "lead creat în pâlnia SPANCO intră pe prima ei etapă („suspect”)", async (ctx) => {
      const l = await createLead(ctx.leadsStages, { fullName: `Spanco Lead ${RUN}`, pipelineId: ctx.stSpanco.id });
      expect(l.pipelineId === ctx.stSpanco.id, `pâlnia ${l.pipelineId}`);
      expect(l.stage === "suspect", `etapa ${l.stage}`);
      ctx.stSpLead = l;
    });

    suite.add(G, "lead SPANCO: „negotiation” merge, „trial” (din pâlnia implicită) nu", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsStages, ctx.stSpLead.id, "negotiation"), 200);
      expectStatus(await moveStage(ctx.leadsStages, ctx.stSpLead.id, "trial"), 400);
      expect((await getLead(ctx.leadsStages, ctx.stSpLead.id)).stage === "negotiation", "etapa greșită");
    });

    suite.add(G, "lead SPANCO: „lost” cere și acolo motiv", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsStages, ctx.stSpLead.id, "lost"), 400);
      expectStatus(await moveStage(ctx.leadsStages, ctx.stSpLead.id, "lost", "A ales concurența"), 200);
      expectStatus(await moveStage(ctx.leadsStages, ctx.stSpLead.id, "prospect"), 200);
    });

    suite.add(G, "fișa unui lead SPANCO „lost” arată etapa pâlniei LUI („Lost”), nu a celei implicite", async (ctx) => {
      const s = ctx.leadsStages;
      const l = await createLead(s, { fullName: `Spanco Pierdut ${RUN}`, pipelineId: ctx.stSpanco.id });
      expectStatus(await moveStage(s, l.id, "lost", "Fără buget"), 200);
      const r = await api(s, "GET", `${L}/${l.id}/detail`);
      expectStatus(r, 200);
      expect(r.json.stage?.pipelineId === ctx.stSpanco.id && r.json.stage?.label === "Lost", `etapa: ${short(r.json.stage)}`);
    });

    suite.add(G, "mutare în altă pâlnie: etapa se reașază pe prima etapă a țintei", async (ctx) => {
      const r = await api(ctx.leadsStages, "PATCH", `${L}/${ctx.stLead.id}/pipeline`, { pipelineId: ctx.stSpanco.id });
      expectStatus(r, 200);
      const back = await getLead(ctx.leadsStages, ctx.stLead.id);
      expect(back.pipelineId === ctx.stSpanco.id && back.stage === "suspect", `lead: ${short(back)}`);
    });

    suite.add(G, "mutarea între pâlnii lasă urmă „Mutat în pâlnia …” în cronologie", async (ctx) => {
      const sys = (await timeline(ctx.leadsStages, ctx.stLead.id)).find((i) => i.type === "system");
      expect(sys && /Mutat în pâlnia/.test(sys.body), `nicio urmă: ${short(sys)}`);
      expect(sys.metadata?.toPipelineId === ctx.stSpanco.id && sys.metadata?.fromStage === "new", `metadata: ${short(sys.metadata)}`);
    });

    suite.add(G, "mutare în pâlnie cu etapă cerută existentă („analysis”)", async (ctx) => {
      const s = ctx.leadsStages;
      expectStatus(await api(s, "PATCH", `${L}/${ctx.stLead.id}/pipeline`, { pipelineId: ctx.stDefault }), 200);
      const r = await api(s, "PATCH", `${L}/${ctx.stLead.id}/pipeline`, { pipelineId: ctx.stSpanco.id, stage: "analysis" });
      expectStatus(r, 200);
      expect((await getLead(s, ctx.stLead.id)).stage === "analysis", "nu a aterizat pe analysis");
    });

    suite.add(G, "mutare în pâlnie cu etapa „pierdut” cerută → aterizează pe o etapă activă", async (ctx) => {
      const s = ctx.leadsStages;
      const r = await api(s, "PATCH", `${L}/${ctx.stLead.id}/pipeline`, { pipelineId: ctx.stDefault, stage: "lost" });
      expectStatus(r, 200);
      const back = await getLead(s, ctx.stLead.id);
      expect(back.stage === "new" && back.pipelineId === ctx.stDefault, `lead: ${short(back)}`);
    });

    suite.add(G, "mutare în pâlnie cu etapă inexistentă acolo → prima etapă", async (ctx) => {
      const s = ctx.leadsStages;
      expectStatus(await api(s, "PATCH", `${L}/${ctx.stLead.id}/pipeline`, { pipelineId: ctx.stSpanco.id, stage: "trial" }), 200);
      expect((await getLead(s, ctx.stLead.id)).stage === "suspect", "nu e pe prima etapă");
    });

    suite.add(G, "mutare în pâlnie inexistentă → 404, leadul rămâne pe loc", async (ctx) => {
      const s = ctx.leadsStages;
      expectStatus(await api(s, "PATCH", `${L}/${ctx.stLead.id}/pipeline`, { pipelineId: RANDOM_UUID }), 404);
      const back = await getLead(s, ctx.stLead.id);
      expect(back.pipelineId === ctx.stSpanco.id && back.stage === "suspect", `lead: ${short(back)}`);
    });

    suite.add(G, "mutare în pâlnie cu id care nu e uuid → 400", async (ctx) => {
      expectStatus(await api(ctx.leadsStages, "PATCH", `${L}/${ctx.stLead.id}/pipeline`, { pipelineId: "b2b" }), 400);
    });

    suite.add(G, "lista filtrată pe pâlnia SPANCO arată doar leadurile ei", async (ctx) => {
      const sp = await listLeads(ctx.leadsStages, { pipelineId: ctx.stSpanco.id });
      const ids = sp.items.map((i) => i.id);
      expect(ids.includes(ctx.stLead.id) && ids.includes(ctx.stSpLead.id), `SPANCO: ${short(ids)}`);
      const def = await listLeads(ctx.leadsStages, { pipelineId: ctx.stDefault });
      expect(!def.items.some((i) => i.id === ctx.stLead.id), "leadul mutat apare încă în pâlnia implicită");
    });

    suite.add(G, "tabla pâlniei SPANCO are coloanele ei și leadul în coloana corectă", async (ctx) => {
      const b = await board(ctx.leadsStages, { pipelineId: ctx.stSpanco.id });
      expect(b.pipelineId === ctx.stSpanco.id, `pipelineId ${b.pipelineId}`);
      expect(b.stages.map((x) => x.key).join(",") === "suspect,prospect,analysis,negotiation,conclusion,order,lost", `etape: ${b.stages.map((x) => x.key)}`);
      expect(b.grouped.suspect.some((c) => c.id === ctx.stLead.id), "leadul nu e în coloana suspect");
      expect(b.grouped.prospect.some((c) => c.id === ctx.stSpLead.id), "leadul SPANCO nu e în prospect");
    });

    suite.add(G, "tabla cu pâlnie inexistentă → 404, nu tabla implicită", async (ctx) => {
      expectStatus(await api(ctx.leadsStages, "GET", `${L}/pipeline?pipelineId=${RANDOM_UUID}`), 404);
    });
  }

  // ── leads:tabla — numărători și sume pe coloane ─────────────────────────────
  {
    const G = "leads:tabla";

    suite.add(G, "workspace nou: tabla are cele 5 etape implicite, goale", async (ctx) => {
      const s = await newTenant(ctx, "leadsBoard", "leads-tabla");
      const b = await board(s);
      expect(b.stages.map((x) => x.key).join(",") === "new,contacted,trial,paid,lost", `etape: ${b.stages.map((x) => x.key)}`);
      for (const k of ["new", "contacted", "trial", "paid", "lost"]) {
        expect(b.counts[k] === 0 && b.valueSums[k] === 0 && b.grouped[k].length === 0, `coloana ${k} nu e goală`);
      }
      expect(b.totalValueCents === 0 && b.segmented === false, `total ${b.totalValueCents}, segmented ${b.segmented}`);
    });

    suite.add(G, "3 leaduri noi: coloana „new” numără 3 și însumează 600 lei", async (ctx) => {
      const s = ctx.leadsBoard;
      ctx.bd = [];
      for (const v of [10000, 20000, 30000]) ctx.bd.push(await createLead(s, { fullName: `Card ${v} ${RUN}`, valueCents: v, source: v === 10000 ? "referral" : "manual" }));
      const b = await board(s);
      expect(b.counts.new === 3 && b.valueSums.new === 60000, `new: ${b.counts.new} / ${b.valueSums.new}`);
      expect(b.totalValueCents === 60000, `total ${b.totalValueCents}`);
    });

    suite.add(G, "cardurile poartă datele leadului și semnalul de task (null fără task)", async (ctx) => {
      const b = await board(ctx.leadsBoard);
      const card = b.grouped.new.find((c) => c.id === ctx.bd[0].id);
      expect(card && card.fullName === ctx.bd[0].fullName && card.valueCents === 10000, `card: ${short(card)}`);
      expect(card.nextTask === null, `nextTask: ${short(card.nextTask)}`);
    });

    suite.add(G, "cardurile dintr-o coloană sunt cele mai noi primele", async (ctx) => {
      const b = await board(ctx.leadsBoard);
      const ids = b.grouped.new.map((c) => c.id);
      expect(ids[0] === ctx.bd[2].id && ids[2] === ctx.bd[0].id, `ordine: ${short(ids)}`);
    });

    suite.add(G, "task deschis pe lead → apare ca semnal pe cardul lui", async (ctx) => {
      const s = ctx.leadsBoard;
      const due = new Date(Date.now() + 86400000).toISOString();
      const r = await api(s, "POST", "/api/crm/tasks", { leadId: ctx.bd[1].id, title: `Sună clientul ${RUN}`, dueAt: due });
      expectStatus(r, 201, "creare task: ");
      const card = (await board(s)).grouped.new.find((c) => c.id === ctx.bd[1].id);
      expect(card?.nextTask?.title === `Sună clientul ${RUN}`, `nextTask: ${short(card?.nextTask)}`);
    });

    suite.add(G, "mutarea în „contacted” mută numărul ȘI suma între coloane", async (ctx) => {
      const s = ctx.leadsBoard;
      expectStatus(await moveStage(s, ctx.bd[2].id, "contacted"), 200);
      const b = await board(s);
      expect(b.counts.new === 2 && b.valueSums.new === 30000, `new: ${b.counts.new}/${b.valueSums.new}`);
      expect(b.counts.contacted === 1 && b.valueSums.contacted === 30000, `contacted: ${b.counts.contacted}/${b.valueSums.contacted}`);
      expect(b.totalValueCents === 60000, `totalul s-a schimbat: ${b.totalValueCents}`);
      expect(b.grouped.contacted.some((c) => c.id === ctx.bd[2].id), "cardul nu e în contacted");
      expect(!b.grouped.new.some((c) => c.id === ctx.bd[2].id), "cardul a rămas și în new");
    });

    suite.add(G, "mutare refuzată (pierdut fără motiv) nu schimbă numărătorile", async (ctx) => {
      const s = ctx.leadsBoard;
      expectStatus(await moveStage(s, ctx.bd[0].id, "lost"), 400);
      const b = await board(s);
      expect(b.counts.new === 2 && b.counts.lost === 0, `new ${b.counts.new}, lost ${b.counts.lost}`);
    });

    suite.add(G, "pierdut cu motiv: coloana „lost” primește leadul și valoarea lui", async (ctx) => {
      const s = ctx.leadsBoard;
      expectStatus(await moveStage(s, ctx.bd[0].id, "lost", "Nu a răspuns 3 săptămâni"), 200);
      const b = await board(s);
      expect(b.counts.lost === 1 && b.valueSums.lost === 10000, `lost ${b.counts.lost}/${b.valueSums.lost}`);
      expect(b.counts.new === 1, `new ${b.counts.new}`);
    });

    suite.add(G, "câștigat: coloana „paid” (isWon) crește", async (ctx) => {
      const s = ctx.leadsBoard;
      expectStatus(await moveStage(s, ctx.bd[2].id, "paid"), 200);
      const b = await board(s);
      expect(b.counts.paid === 1 && b.valueSums.paid === 30000 && b.counts.contacted === 0, `paid ${b.counts.paid}/${b.valueSums.paid}`);
      expect(b.stages.find((x) => x.key === "paid")?.isWon === true, "etapa paid nu e isWon");
    });

    suite.add(G, "editarea valorii se vede în suma coloanei", async (ctx) => {
      const s = ctx.leadsBoard;
      expectStatus(await api(s, "PATCH", `${L}/${ctx.bd[1].id}`, { valueCents: 25000 }), 200);
      const b = await board(s);
      expect(b.valueSums.new === 25000, `new: ${b.valueSums.new}`);
      expect(b.totalValueCents === 65000, `total ${b.totalValueCents}`);
    });

    suite.add(G, "căutarea pe tablă restrânge numărătorile la rezultat și marchează „segmentat”", async (ctx) => {
      const b = await board(ctx.leadsBoard, { search: `Card 20000 ${RUN}` });
      expect(b.segmented === true, "segmented ≠ true");
      const total = Object.values(b.counts).reduce((a, n) => a + n, 0);
      expect(total === 1 && b.counts.new === 1, `numărători: ${short(b.counts)}`);
    });

    suite.add(G, "filtrul de sursă pe tablă („referral”) arată doar leadul recomandat", async (ctx) => {
      const b = await board(ctx.leadsBoard, { source: "referral" });
      const total = Object.values(b.counts).reduce((a, n) => a + n, 0);
      expect(total === 1 && b.counts.lost === 1, `numărători: ${short(b.counts)}`);
    });

    suite.add(G, "sume mari (2 × 20 mil. lei) nu depășesc capacitatea totalului", async (ctx) => {
      const s = ctx.leadsBoard;
      const before = (await board(s)).totalValueCents;
      await createLead(s, { fullName: `Contract Mare A ${RUN}`, valueCents: 2_000_000_000 });
      await createLead(s, { fullName: `Contract Mare B ${RUN}`, valueCents: 2_000_000_000 });
      const b = await board(s);
      expect(b.totalValueCents === before + 4_000_000_000, `total ${b.totalValueCents}, așteptat ${before + 4_000_000_000}`);
      expect(b.valueSums.new === 25000 + 4_000_000_000, `new ${b.valueSums.new}`);
    });

    suite.add(G, "tabla cu pipelineId care nu e uuid → 404, nu 500", async (ctx) => {
      expectStatus(await api(ctx.leadsBoard, "GET", `${L}/pipeline?pipelineId=abc`), 404);
    });
  }

  // ── leads:lista — căutare, filtre, paginare, sortare, segmente ──────────────
  {
    const G = "leads:lista";
    const TAG = `vip-${RUN}`;

    suite.add(G, "workspace nou + 25 de leaduri variate", async (ctx) => {
      const s = await newTenant(ctx, "leadsList", "leads-lista");
      ctx.lsFb = 0;
      for (let i = 0; i < 20; i++) {
        const src = i % 4 === 0 ? "facebook_ad" : "manual";
        if (src === "facebook_ad") ctx.lsFb++;
        await createLead(s, { fullName: `Elev ${String(i).padStart(2, "0")} ${RUN}`, source: src, valueCents: i * 100 });
      }
      ctx.lsStefan = await createLead(s, {
        fullName: "Ștefan Țurcanu",
        phone: "+373 69 123 456",
        email: `Stefan.Turcanu-${RUN}@Example.invalid`,
        company: "Țesătoria Nord SRL",
      });
      ctx.lsSort = [];
      for (const [n, v] of [["Alfa", 100], ["Beta", 300], ["Gama", 200]]) {
        ctx.lsSort.push(await createLead(s, { fullName: `Sortare-${RUN} ${n}`, valueCents: v }));
      }
      ctx.lsPct = await createLead(s, { fullName: `Reducere 100% ${RUN}` });
      const j = await listLeads(s, { pageSize: "100" });
      expect(j.total === 25, `total ${j.total}`);
      ctx.lsTotal = j.total;
    });

    suite.add(G, "lista implicită: 20 pe pagină, total și numărul de pagini corecte", async (ctx) => {
      const j = await listLeads(ctx.leadsList);
      expect(j.page === 1 && j.pageSize === 20 && j.items.length === 20, `pagina: ${j.page}/${j.pageSize}/${j.items.length}`);
      expect(j.total === 25 && j.totalPages === 2, `total ${j.total}, pagini ${j.totalPages}`);
      ctx.lsP1 = j.items.map((i) => i.id);
    });

    suite.add(G, "pagina 2 are restul, fără suprapuneri cu pagina 1", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { page: "2" });
      expect(j.items.length === 5, `pagina 2 are ${j.items.length}`);
      expect(!j.items.some((i) => ctx.lsP1.includes(i.id)), "rânduri duplicate între pagini");
    });

    suite.add(G, "pageSize=5 → 5 rânduri și 5 pagini", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { pageSize: "5" });
      expect(j.items.length === 5 && j.totalPages === 5, `${j.items.length} / ${j.totalPages}`);
    });

    suite.add(G, "pageSize=500 este plafonat la 100", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { pageSize: "500" });
      expect(j.pageSize === 100 && j.items.length === 25, `${j.pageSize} / ${j.items.length}`);
    });

    suite.add(G, "pageSize negativ sau text → valoare sigură, nu eroare", async (ctx) => {
      const a = await listLeads(ctx.leadsList, { pageSize: "-3" });
      expect(a.pageSize >= 1 && a.items.length <= a.pageSize, `negativ: ${a.pageSize}/${a.items.length}`);
      const b = await listLeads(ctx.leadsList, { pageSize: "multe", page: "abc" });
      expect(b.pageSize === 20 && b.page === 1, `text: ${b.pageSize}/${b.page}`);
    });

    suite.add(G, "pagina 999 → listă goală, totalul rămâne", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { page: "999" });
      expect(j.items.length === 0 && j.total === 25, `${j.items.length} / ${j.total}`);
    });

    suite.add(G, "sortarea implicită: cel mai nou creat e primul", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { pageSize: "3" });
      expect(j.items[0].id === ctx.lsPct.id, `primul: ${j.items[0].fullName}`);
    });

    suite.add(G, "sortare după nume crescător", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { search: `Sortare-${RUN}`, sort: "fullName", dir: "asc" });
      expect(j.items.map((i) => i.fullName.split(" ")[1]).join(",") === "Alfa,Beta,Gama", `ordine: ${j.items.map((i) => i.fullName)}`);
    });

    suite.add(G, "sortare după valoare descrescător", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { search: `Sortare-${RUN}`, sort: "valueCents", dir: "desc" });
      expect(j.items.map((i) => i.valueCents).join(",") === "300,200,100", `ordine: ${j.items.map((i) => i.valueCents)}`);
    });

    suite.add(G, "sortare după o coloană necunoscută → ordinea implicită, nu eroare", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { sort: "parola", pageSize: "1" });
      expect(j.items[0].id === ctx.lsPct.id, `primul: ${j.items[0]?.fullName}`);
    });

    const find = async (ctx, search) => (await listLeads(ctx.leadsList, { search, pageSize: "100" })).items.map((i) => i.id);

    suite.add(G, "căutare după numele complet cu diacritice „Ștefan Țurcanu”", async (ctx) => {
      const ids = await find(ctx, "Ștefan Țurcanu");
      expect(ids.length === 1 && ids[0] === ctx.lsStefan.id, `găsite: ${ids.length}`);
    });

    suite.add(G, "căutare după o parte din nume „Țurcanu”", async (ctx) => {
      expect((await find(ctx, "Țurcanu")).includes(ctx.lsStefan.id), "negăsit");
    });

    suite.add(G, "căutare cu litere mici „ștefan țurcanu”", async (ctx) => {
      expect((await find(ctx, "ștefan țurcanu")).includes(ctx.lsStefan.id), "negăsit cu litere mici");
    });

    suite.add(G, "căutare fără diacritice „Stefan Turcanu” găsește „Ștefan Țurcanu”", async (ctx) => {
      expect((await find(ctx, "Stefan Turcanu")).includes(ctx.lsStefan.id), "negăsit fără diacritice");
    });

    suite.add(G, "căutare după fragment de email", async (ctx) => {
      expect((await find(ctx, `turcanu-${RUN}`)).includes(ctx.lsStefan.id), "negăsit după email");
    });

    suite.add(G, "căutare după email cu majuscule diferite", async (ctx) => {
      expect((await find(ctx, `STEFAN.TURCANU-${RUN}@EXAMPLE.INVALID`.toUpperCase())).includes(ctx.lsStefan.id), "negăsit");
    });

    suite.add(G, "căutare după telefon așa cum e scris („69 123 456”)", async (ctx) => {
      expect((await find(ctx, "69 123 456")).includes(ctx.lsStefan.id), "negăsit după telefon");
    });

    suite.add(G, "căutare după telefon în alt format („069123456”) găsește același om", async (ctx) => {
      expect((await find(ctx, "069123456")).includes(ctx.lsStefan.id), "negăsit după telefonul normalizat");
    });

    suite.add(G, "căutare după companie „Țesătoria”", async (ctx) => {
      expect((await find(ctx, "Țesătoria")).includes(ctx.lsStefan.id), "negăsit după companie");
    });

    suite.add(G, "căutare fără potriviri → total 0, listă goală", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { search: `nimeni-${uid()}` });
      expect(j.total === 0 && j.items.length === 0 && j.totalPages === 1, `${j.total}/${j.items.length}/${j.totalPages}`);
    });

    suite.add(G, "căutarea „%” găsește doar leadul care conține „%”, nu toată baza", async (ctx) => {
      const ids = await find(ctx, "%");
      expect(ids.length === 1 && ids[0] === ctx.lsPct.id, `„%” e tratat ca wildcard: ${ids.length} rezultate`);
    });

    suite.add(G, "căutarea „_” nu se comportă ca wildcard", async (ctx) => {
      const ids = await find(ctx, "_");
      expect(ids.length === 0, `„_” a potrivit ${ids.length} leaduri fără underscore`);
    });

    suite.add(G, "căutare cu injecție SQL → listă goală, nu eroare", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { search: "'; DROP TABLE leads; --" });
      expect(j.total === 0, `total ${j.total}`);
      expect((await listLeads(ctx.leadsList)).total === 25, "baza s-a schimbat");
    });

    suite.add(G, "filtru sursă „facebook_ad” → doar leadurile din Facebook", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { source: "facebook_ad", pageSize: "100" });
      expect(j.total === ctx.lsFb && j.items.every((i) => i.source === "facebook_ad"), `${j.total} vs ${ctx.lsFb}`);
    });

    suite.add(G, "filtru sursă necunoscută e ignorat (toată lista), nu eroare", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { source: "tiktok" });
      expect(j.total === 25, `total ${j.total}`);
    });

    suite.add(G, "filtru etapă „contacted” → doar leadurile contactate", async (ctx) => {
      const s = ctx.leadsList;
      expectStatus(await moveStage(s, ctx.lsSort[0].id, "contacted"), 200);
      expectStatus(await moveStage(s, ctx.lsSort[1].id, "contacted"), 200);
      const j = await listLeads(s, { stage: "contacted" });
      expect(j.total === 2 && j.items.every((i) => i.stage === "contacted"), `${j.total}: ${short(j.items.map((i) => i.stage))}`);
    });

    suite.add(G, "filtru etapă inexistentă → listă goală", async (ctx) => {
      expect((await listLeads(ctx.leadsList, { stage: "nu-exista" })).total === 0, "nu e gol");
    });

    suite.add(G, "filtru responsabil → doar leadurile atribuite lui", async (ctx) => {
      const s = ctx.leadsList;
      expectStatus(await api(s, "PATCH", `${L}/${ctx.lsStefan.id}`, { assignedTo: s.user.id }), 200);
      const j = await listLeads(s, { assignedTo: s.user.id });
      expect(j.total === 1 && j.items[0].id === ctx.lsStefan.id && j.items[0].assignedTo === s.user.id, `${j.total}`);
    });

    suite.add(G, "filtru responsabil care nu e uuid → 4xx sau listă goală, nu 500", async (ctx) => {
      const r = await api(ctx.leadsList, "GET", `${L}?assignedTo=ion`);
      expectNo5xx(r, "assignedTo=ion: ");
      if (r.ok) expect(r.json.total === 0, `total ${r.json.total}`);
    });

    suite.add(G, "filtru pâlnie care nu e uuid → 4xx, nu 500", async (ctx) => {
      expectClientError(await api(ctx.leadsList, "GET", `${L}?pipelineId=vanzari`), "pipelineId=vanzari: ");
    });

    suite.add(G, "filtru pâlnie inexistentă → 404", async (ctx) => {
      expectStatus(await api(ctx.leadsList, "GET", `${L}?pipelineId=${RANDOM_UUID}`), 404);
    });

    suite.add(G, "filtre combinate: căutare + etapă → intersecția", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { search: `Sortare-${RUN}`, stage: "contacted", sort: "fullName", dir: "asc" });
      expect(j.total === 2 && j.items[0].id === ctx.lsSort[0].id, `${j.total}`);
      const none = await listLeads(ctx.leadsList, { search: `Sortare-${RUN}`, source: "facebook_ad" });
      expect(none.total === 0, `sursă+căutare: ${none.total}`);
    });

    suite.add(G, "etichetă pusă pe lead → filtrul tag îl găsește doar pe el", async (ctx) => {
      const s = ctx.leadsList;
      expectStatus(await api(s, "POST", "/api/crm/tags", { leadId: ctx.lsStefan.id, tag: TAG }), 201);
      const j = await listLeads(s, { tag: TAG });
      expect(j.total === 1 && j.items[0].id === ctx.lsStefan.id, `${j.total}`);
    });

    suite.add(G, "produs pe lead → filtrul productId îl găsește doar pe el", async (ctx) => {
      const s = ctx.leadsList;
      const p = await api(s, "POST", "/api/crm/products", { name: `Abonament Premium ${RUN}`, listPriceCents: 120000 });
      expectStatus(p, 201, "creare produs: ");
      ctx.lsProduct = p.json;
      expectStatus(await api(s, "PATCH", `${L}/${ctx.lsSort[2].id}`, { productId: p.json.id }), 200);
      const j = await listLeads(s, { productId: p.json.id });
      expect(j.total === 1 && j.items[0].id === ctx.lsSort[2].id && j.items[0].productId === p.json.id, `${j.total}`);
    });

    suite.add(G, "segmentele listează produsul activ, eticheta folosită și industria firmei", async (ctx) => {
      const s = ctx.leadsList;
      expectStatus(await api(s, "POST", "/api/crm/companies", { name: `Energo Sud ${RUN}`, industry: "Energie", region: "Sud", companySize: "50-249" }), 201);
      const r = await api(s, "GET", `${L}/segments`);
      expectStatus(r, 200);
      expect(r.json.products?.some((p) => p.id === ctx.lsProduct.id), `produse: ${short(r.json.products)}`);
      expect(r.json.tags?.includes(TAG), `etichete: ${short(r.json.tags)}`);
      expect(r.json.industries?.includes("Energie") && r.json.regions?.includes("Sud") && r.json.sizes?.includes("50-249"), `firmografie: ${short(r.json)}`);
    });

    suite.add(G, "filtru industrie: leadurile fără firmă nu intră în segment", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { industry: "Energie" });
      expect(j.total === 0, `total ${j.total}`);
    });

    suite.add(G, "praguri de consum ne-numerice sunt ignorate, nu eroare", async (ctx) => {
      const j = await listLeads(ctx.leadsList, { minConsumptionKwh: "mult", maxConsumptionKwh: "-5" });
      expect(j.total === 25, `total ${j.total}`);
    });
  }

  // ── leads:export — CSV-ul filtrat ───────────────────────────────────────────
  {
    const G = "leads:export";
    const TRICKY = `Ion "Vânătorul" Popescu; SRL, Chișinău ${RUN}`;

    suite.add(G, "workspace nou + lead cu ghilimele, punct și virgulă, virgulă, diacritice", async (ctx) => {
      const s = await newTenant(ctx, "leadsCsv", "leads-export");
      ctx.csvTricky = await createLead(s, {
        fullName: TRICKY,
        company: "Mobilă, Uși & Ferestre „Nord” SRL",
        phone: "069 000 111",
        email: `ion.popescu-${RUN}@example.invalid`,
        dealName: `Ofertă „Cabinet”; 3 camere`,
        valueCents: 123456,
        probabilityPct: 35,
        source: "referral",
      });
      ctx.csvPlain = await createLead(s, { fullName: `Simplu Exportat ${RUN}`, valueCents: 5000 });
    });

    suite.add(G, "exportul e un fișier CSV atașat, cu BOM UTF-8 și nume datat", async (ctx) => {
      const raw = await rawGet(ctx.leadsCsv, `${L}/export.csv`);
      // `Response.text()` înghite BOM-ul, deci îl căutăm în octeții bruți.
      const bytes = new Uint8Array(await raw.clone().arrayBuffer());
      expect(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, `primii octeți: ${[...bytes.slice(0, 3)]}`);
      const disp = raw.headers.get("content-disposition") ?? "";
      expect(/attachment; filename="leaduri-\d{4}-\d{2}-\d{2}\.csv"/.test(disp), `content-disposition: ${disp}`);
    });

    suite.add(G, "antetul are cele 20 de coloane în ordinea documentată", async (ctx) => {
      const { header } = await exportCsv(ctx.leadsCsv);
      expect(header.length === 20, `${header.length} coloane: ${short(header)}`);
      expect(header[0] === "Nume" && header[5] === "Etapă" && header[8] === "Valoare" && header[17] === "Consimțământ", `antet: ${short(header)}`);
    });

    suite.add(G, "liniile se termină cu CRLF (Excel în română)", async (ctx) => {
      const { r } = await exportCsv(ctx.leadsCsv);
      const lines = r.text.split("\r\n");
      expect(lines.length === 4 && lines[3] === "", `linii CRLF: ${lines.length}`);
      expect(!/[^\r]\n/.test(r.text), "există LF fără CR");
    });

    suite.add(G, "ghilimelele, „;” și virgula din nume ies înapoi exact", async (ctx) => {
      const { data } = await exportCsv(ctx.leadsCsv);
      const row = data.find((d) => d[0] === TRICKY);
      expect(row, `rândul nu se regăsește intact: ${short(data.map((d) => d[0]))}`);
      expect(row.length === 20, `rândul are ${row.length} celule — separatorul a scăpat necitat`);
    });

    suite.add(G, "compania cu virgulă și ghilimele românești, oportunitatea cu „;” — intacte", async (ctx) => {
      const { data } = await exportCsv(ctx.leadsCsv);
      const row = data.find((d) => d[0] === TRICKY);
      expect(row[2] === "Mobilă, Uși & Ferestre „Nord” SRL", `companie: ${row[2]}`);
      expect(row[1] === `Ofertă „Cabinet”; 3 camere`, `oportunitate: ${row[1]}`);
    });

    suite.add(G, "valoarea 123456 cenți iese „1234,56” (virgulă zecimală)", async (ctx) => {
      const { data } = await exportCsv(ctx.leadsCsv);
      const row = data.find((d) => d[0] === TRICKY);
      expect(row[8] === "1234,56" && row[9] === "35", `valoare ${row[8]}, probabilitate ${row[9]}`);
    });

    suite.add(G, "etapa iese cu eticheta („Lead nou”), nu cu cheia", async (ctx) => {
      const { data } = await exportCsv(ctx.leadsCsv);
      expect(data.find((d) => d[0] === TRICKY)[5] === "Lead nou", "eticheta etapei lipsește");
    });

    suite.add(G, "antetul X-Export-Count egal cu numărul de rânduri", async (ctx) => {
      const { r, data } = await exportCsv(ctx.leadsCsv);
      const raw = await rawGet(ctx.leadsCsv, `${L}/export.csv`);
      expect(raw.headers.get("x-export-count") === String(data.length), `count ${raw.headers.get("x-export-count")} vs ${data.length}`);
      expect(raw.headers.get("x-export-truncated") === "false", "truncated ≠ false");
      expect(r.ok, "export eșuat");
    });

    suite.add(G, "exportul respectă căutarea: doar leadul căutat", async (ctx) => {
      const { data } = await exportCsv(ctx.leadsCsv, { search: `Simplu Exportat ${RUN}` });
      expect(data.length === 1 && data[0][0] === `Simplu Exportat ${RUN}`, `rânduri: ${data.length}`);
    });

    suite.add(G, "exportul respectă filtrul de etapă", async (ctx) => {
      expectStatus(await moveStage(ctx.leadsCsv, ctx.csvPlain.id, "lost", "Buget tăiat; revine în toamnă"), 200);
      const { data } = await exportCsv(ctx.leadsCsv, { stage: "lost" });
      expect(data.length === 1 && data[0][0] === `Simplu Exportat ${RUN}`, `rânduri: ${data.length}`);
    });

    suite.add(G, "motivul pierderii (cu „;”) apare în coloana lui", async (ctx) => {
      const { data } = await exportCsv(ctx.leadsCsv, { stage: "lost" });
      expect(data[0][11] === "Buget tăiat; revine în toamnă" && data[0][5] === "Pierdut", `motiv ${data[0][11]}, etapă ${data[0][5]}`);
    });

    suite.add(G, "nota de interes pe mai multe rânduri rămâne o singură celulă", async (ctx) => {
      const s = ctx.leadsCsv;
      expectStatus(await api(s, "PATCH", `${L}/${ctx.csvTricky.id}`, { interestCourse: "Curs A\r\nCurs B" }), 200);
      const { data } = await exportCsv(s, { search: `Vânătorul` });
      expect(data.length === 1 && data[0][16] === "Curs A\r\nCurs B", `celula: ${short(data[0]?.[16])}, rânduri ${data.length}`);
    });

    suite.add(G, "responsabilul iese cu numele omului, nu cu id-ul", async (ctx) => {
      const s = ctx.leadsCsv;
      expectStatus(await api(s, "PATCH", `${L}/${ctx.csvTricky.id}`, { assignedTo: s.user.id }), 200);
      const { data } = await exportCsv(s, { search: "Vânătorul" });
      expect(data[0][10] === "Tenant Izolat", `responsabil: ${data[0][10]}`);
    });

    suite.add(G, "consimțământ retras → coloana spune „RETRAS”", async (ctx) => {
      const s = ctx.leadsCsv;
      expectStatus(await api(s, "POST", `/api/crm/gdpr/revoke/${ctx.csvTricky.id}`), 200);
      const { data } = await exportCsv(s, { search: "Vânătorul" });
      expect(data[0][17] === "RETRAS", `consimțământ: ${data[0][17]}`);
    });

    suite.add(G, "o formulă în nume („=HYPERLINK…”) nu iese executabilă în Excel", async (ctx) => {
      const s = ctx.leadsCsv;
      const evil = `=HYPERLINK("http://evil.invalid";"Deschide")`;
      await createLead(s, { fullName: evil });
      const { data } = await exportCsv(s, { search: "HYPERLINK" });
      expect(data.length === 1, `rânduri ${data.length}`);
      expect(!/^[=+\-@]/.test(data[0][0]), `celula începe cu formulă: ${data[0][0]}`);
    });

    suite.add(G, "exportul se consemnează în jurnal cu numărul de rânduri", async (ctx) => {
      const r = await api(ctx.leadsCsv, "GET", `/api/crm/audit?limit=200`);
      expectStatus(r, 200);
      const ex = r.json.items.filter((i) => i.actionType === "crm.lead.exported");
      expect(ex.length > 0 && typeof ex[0].newValue?.count === "number", `jurnal: ${short(ex[0])}`);
    });

    suite.add(G, "export cu pâlnie inexistentă → 404", async (ctx) => {
      expectStatus(await api(ctx.leadsCsv, "GET", `${L}/export.csv?pipelineId=${RANDOM_UUID}`), 404);
    });

    suite.add(G, "export cu pipelineId care nu e uuid → 4xx, nu 500", async (ctx) => {
      expectClientError(await api(ctx.leadsCsv, "GET", `${L}/export.csv?pipelineId=toate`), "export pipelineId=toate: ");
    });
  }

  // ── leads:bulk — acțiuni în masă ────────────────────────────────────────────
  {
    const G = "leads:bulk";
    const TAG = `campanie-toamna-${RUN}`;
    const bulk = (s, body) => api(s, "POST", `${L}/bulk`, body);

    suite.add(G, "workspace nou + 5 leaduri de repartizat", async (ctx) => {
      const s = await newTenant(ctx, "leadsBulk", "leads-bulk");
      ctx.bkOther = await signupTenant("leads-bulk-b");
      ctx.bkIds = [];
      for (let i = 0; i < 5; i++) ctx.bkIds.push((await createLead(s, { fullName: `Masă ${i} ${RUN}`, valueCents: 1000 })).id);
      ctx.bkForeign = (await createLead(ctx.bkOther, { fullName: `Străin ${RUN}` })).id;
    });

    suite.add(G, "atribuire în masă → toate 5 au responsabilul, nimic sărit", async (ctx) => {
      const s = ctx.leadsBulk;
      const r = await bulk(s, { leadIds: ctx.bkIds, action: "assign", assignedTo: s.user.id });
      expectStatus(r, 200);
      expect(r.json.updated === 5 && r.json.skipped.length === 0, `răspuns: ${short(r.json)}`);
      for (const id of ctx.bkIds) expect((await getLead(s, id)).assignedTo === s.user.id, `${id} neatribuit`);
    });

    suite.add(G, "atribuirea în masă lasă urmă în cronologia fiecărui lead", async (ctx) => {
      const items = await timeline(ctx.leadsBulk, ctx.bkIds[0]);
      const sys = items.find((i) => i.type === "system" && /acțiune în masă/.test(i.body ?? ""));
      expect(sys && sys.metadata?.bulk === true && sys.metadata?.to === ctx.leadsBulk.user.id, `urmă: ${short(sys)}`);
    });

    suite.add(G, "repartizarea automată sare leadurile deja atribuite", async (ctx) => {
      const r = await bulk(ctx.leadsBulk, { leadIds: ctx.bkIds.slice(0, 2), action: "auto-assign" });
      expectStatus(r, 200);
      expect(r.json.updated === 0 && r.json.skipped.every((x) => x.reason === "already_assigned"), `răspuns: ${short(r.json)}`);
    });

    suite.add(G, "scoaterea responsabilului în masă (null)", async (ctx) => {
      const s = ctx.leadsBulk;
      const r = await bulk(s, { leadIds: ctx.bkIds.slice(0, 2), action: "assign", assignedTo: null });
      expectStatus(r, 200);
      expect(r.json.updated === 2, `updated ${r.json.updated}`);
      expect((await getLead(s, ctx.bkIds[0])).assignedTo === null, "responsabilul a rămas");
    });

    suite.add(G, "repartizare automată fără reguli → „no_rule_matched”, leadul rămâne liber", async (ctx) => {
      const s = ctx.leadsBulk;
      const r = await bulk(s, { leadIds: [ctx.bkIds[0]], action: "auto-assign" });
      expectStatus(r, 200);
      expect(r.json.updated === 0 && r.json.skipped[0]?.reason === "no_rule_matched", `răspuns: ${short(r.json)}`);
      expect((await getLead(s, ctx.bkIds[0])).assignedTo === null, "a fost atribuit totuși");
    });

    suite.add(G, "atribuire în masă către un om din alt workspace → refuzată", async (ctx) => {
      const s = ctx.leadsBulk;
      const r = await bulk(s, { leadIds: [ctx.bkIds[4]], action: "assign", assignedTo: ctx.bkOther.user.id });
      const back = await getLead(s, ctx.bkIds[4]);
      expect(back.assignedTo !== ctx.bkOther.user.id, `leadul a fost dat unui om din alt client (HTTP ${r.status})`);
      expectClientError(r, "responsabil străin: ");
    });

    suite.add(G, "atribuire în masă către un uuid inexistent → 4xx, nu 500", async (ctx) => {
      expectClientError(await bulk(ctx.leadsBulk, { leadIds: [ctx.bkIds[3]], action: "assign", assignedTo: RANDOM_UUID }));
    });

    suite.add(G, "mutare în masă în „contacted” → toate mutate, fiecare cu urmă „bulk”", async (ctx) => {
      const s = ctx.leadsBulk;
      const r = await bulk(s, { leadIds: ctx.bkIds, action: "stage", stage: "contacted" });
      expectStatus(r, 200);
      expect(r.json.updated === 5, `updated ${r.json.updated}`);
      for (const id of ctx.bkIds) expect((await getLead(s, id)).stage === "contacted", `${id} nu e contacted`);
      const sc = (await timeline(s, ctx.bkIds[2])).find((i) => i.type === "stage_change");
      expect(sc?.metadata?.bulk === true && sc.body === "new → contacted", `urmă: ${short(sc)}`);
    });

    suite.add(G, "tabla reflectă mutarea în masă (5 în contacted, 5000 în total)", async (ctx) => {
      const b = await board(ctx.leadsBulk);
      expect(b.counts.contacted === 5 && b.valueSums.contacted === 5000 && b.counts.new === 0, `numărători ${short(b.counts)}`);
    });

    suite.add(G, "„pierdut” în masă fără motiv → nimic mutat, fiecare cu „lost_reason_required”", async (ctx) => {
      const s = ctx.leadsBulk;
      const r = await bulk(s, { leadIds: ctx.bkIds.slice(0, 2), action: "stage", stage: "lost" });
      expectStatus(r, 200);
      expect(r.json.updated === 0 && r.json.skipped.length === 2 && r.json.skipped.every((x) => x.reason === "lost_reason_required"), `răspuns: ${short(r.json)}`);
      expect((await getLead(s, ctx.bkIds[0])).stage === "contacted", "s-a mutat fără motiv");
    });

    suite.add(G, "„pierdut” în masă cu motiv → motivul se salvează pe fiecare", async (ctx) => {
      const s = ctx.leadsBulk;
      const r = await bulk(s, { leadIds: ctx.bkIds.slice(0, 2), action: "stage", stage: "lost", lostReason: "Listă cumpărată expirată" });
      expectStatus(r, 200);
      expect(r.json.updated === 2, `updated ${r.json.updated}`);
      const back = await getLead(s, ctx.bkIds[1]);
      expect(back.stage === "lost" && back.lostReason === "Listă cumpărată expirată", `lead: ${short(back)}`);
    });

    suite.add(G, "etapă necunoscută în masă → toate sărite cu „unknown_stage”", async (ctx) => {
      const r = await bulk(ctx.leadsBulk, { leadIds: ctx.bkIds.slice(2), action: "stage", stage: "nu-exista" });
      expectStatus(r, 200);
      expect(r.json.updated === 0 && r.json.skipped.every((x) => x.reason === "unknown_stage"), `răspuns: ${short(r.json)}`);
    });

    suite.add(G, "mutare în masă peste două pâlnii: leadul din SPANCO e sărit, nu stricat", async (ctx) => {
      const s = ctx.leadsBulk;
      const sp = await createPipeline(s, `SPANCO bulk ${RUN}`, "spanco");
      const spLead = await createLead(s, { fullName: `Masă Spanco ${RUN}`, pipelineId: sp.id });
      const r = await bulk(s, { leadIds: [spLead.id, ctx.bkIds[2]], action: "stage", stage: "trial" });
      expectStatus(r, 200);
      expect(r.json.updated === 1 && r.json.skipped.length === 1 && r.json.skipped[0].leadId === spLead.id && r.json.skipped[0].reason === "unknown_stage", `răspuns: ${short(r.json)}`);
      expect((await getLead(s, spLead.id)).stage === "suspect", "leadul SPANCO are etapă orfană");
      expect((await getLead(s, ctx.bkIds[2])).stage === "trial", "leadul implicit nu s-a mutat");
    });

    suite.add(G, "acțiunea „stage” fără etapă → 400", async (ctx) => {
      expectStatus(await bulk(ctx.leadsBulk, { leadIds: ctx.bkIds, action: "stage" }), 400);
    });

    suite.add(G, "etichetare în masă → eticheta apare pe fiecare lead", async (ctx) => {
      const s = ctx.leadsBulk;
      const r = await bulk(s, { leadIds: ctx.bkIds, action: "tag", tag: TAG });
      expectStatus(r, 200);
      expect(r.json.updated === 5, `updated ${r.json.updated}`);
      const t = await api(s, "GET", `/api/crm/tags?leadId=${ctx.bkIds[3]}`);
      expectStatus(t, 200);
      expect(t.json.items.some((x) => x.tag === TAG), `etichete: ${short(t.json.items)}`);
      expect((await listLeads(s, { tag: TAG })).total === 5, "filtrul pe etichetă nu le găsește pe toate 5");
    });

    suite.add(G, "etichetare repetată e idempotentă: 0 noi, toate „already_tagged”", async (ctx) => {
      const s = ctx.leadsBulk;
      const r = await bulk(s, { leadIds: ctx.bkIds, action: "tag", tag: TAG });
      expectStatus(r, 200);
      expect(r.json.updated === 0 && r.json.skipped.length === 5 && r.json.skipped.every((x) => x.reason === "already_tagged"), `răspuns: ${short(r.json)}`);
      const t = await api(s, "GET", `/api/crm/tags?leadId=${ctx.bkIds[0]}`);
      expect(t.json.items.filter((x) => x.tag === TAG).length === 1, "eticheta s-a dublat");
    });

    suite.add(G, "acțiunea „tag” fără etichetă → 400", async (ctx) => {
      expectStatus(await bulk(ctx.leadsBulk, { leadIds: ctx.bkIds, action: "tag" }), 400);
    });

    suite.add(G, "id inexistent în selecție → „not_found” pentru el, restul se fac", async (ctx) => {
      const s = ctx.leadsBulk;
      const r = await bulk(s, { leadIds: [ctx.bkIds[0], RANDOM_UUID], action: "tag", tag: `alt-${RUN}` });
      expectStatus(r, 200);
      expect(r.json.updated === 1 && r.json.skipped.length === 1 && r.json.skipped[0].leadId === RANDOM_UUID && r.json.skipped[0].reason === "not_found", `răspuns: ${short(r.json)}`);
    });

    suite.add(G, "leadul altui client în selecție → „not_found” și rămâne neatins", async (ctx) => {
      const r = await bulk(ctx.leadsBulk, { leadIds: [ctx.bkForeign], action: "stage", stage: "contacted" });
      expectStatus(r, 200);
      expect(r.json.updated === 0 && r.json.skipped[0]?.reason === "not_found", `răspuns: ${short(r.json)}`);
      expect((await getLead(ctx.bkOther, ctx.bkForeign)).stage === "new", "leadul străin s-a mutat");
    });

    suite.add(G, "selecție goală → 400", async (ctx) => {
      expectStatus(await bulk(ctx.leadsBulk, { leadIds: [], action: "assign", assignedTo: null }), 400);
    });

    suite.add(G, "peste 100 de leaduri într-o cerere → 400", async (ctx) => {
      const ids = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
      expectStatus(await bulk(ctx.leadsBulk, { leadIds: ids, action: "tag", tag: "x" }), 400);
    });

    suite.add(G, "acțiune nesuportată („delete”) → 400, nimic șters", async (ctx) => {
      const s = ctx.leadsBulk;
      expectStatus(await bulk(s, { leadIds: ctx.bkIds, action: "delete" }), 400);
      expect((await listLeads(s, { search: `Masă` })).total >= 5, "leaduri dispărute");
    });

    suite.add(G, "id-uri care nu sunt uuid → 400", async (ctx) => {
      expectStatus(await bulk(ctx.leadsBulk, { leadIds: ["1", "2"], action: "tag", tag: "x" }), 400);
    });
  }

  // ── leads:interactiuni — cronologie și apeluri ──────────────────────────────
  {
    const G = "leads:interactiuni";

    suite.add(G, "workspace nou; un lead nou are cronologia goală", async (ctx) => {
      const s = await newTenant(ctx, "leadsInt", "leads-interactiuni");
      ctx.inLead = await createLead(s, { fullName: `Cronologie ${RUN}`, phone: "060 111 222" });
      const items = await timeline(s, ctx.inLead.id);
      expect(items.length === 0, `cronologie: ${short(items)}`);
    });

    suite.add(G, "notă adăugată → 201, direcție internă implicit, autor = eu", async (ctx) => {
      const s = ctx.leadsInt;
      const r = await addInteraction(s, ctx.inLead.id, { type: "note", body: "Mama întreabă de orarul de sâmbătă." });
      expectStatus(r, 201);
      expect(r.json.type === "note" && r.json.direction === "internal" && r.json.userId === s.user.id, `rând: ${short(r.json)}`);
      expect(r.json.leadId === ctx.inLead.id && r.json.body === "Mama întreabă de orarul de sâmbătă.", `rând: ${short(r.json)}`);
      ctx.inNote = r.json;
    });

    suite.add(G, "nota apare în cronologia leadului", async (ctx) => {
      const items = await timeline(ctx.leadsInt, ctx.inLead.id);
      expect(items.some((i) => i.id === ctx.inNote.id && i.body === ctx.inNote.body), "nota lipsește");
    });

    for (const [type, direction, body] of [
      ["email", "outbound", "Am trimis oferta pentru semestrul de toamnă."],
      ["whatsapp", "inbound", "Bună, mai sunt locuri la grupa de 10 ani?"],
      ["sms", "outbound", "Reamintire: lecția demo e mâine la 17:00."],
      ["meeting", "internal", "Întâlnire la sediu, a vizitat sălile."],
    ]) {
      suite.add(G, `interacțiune de tip „${type}” (${direction}) se salvează și se citește`, async (ctx) => {
        const s = ctx.leadsInt;
        const r = await addInteraction(s, ctx.inLead.id, { type, direction, body });
        expectStatus(r, 201);
        const items = await timeline(s, ctx.inLead.id);
        const it = items.find((i) => i.id === r.json.id);
        expect(it && it.type === type && it.direction === direction && it.body === body, `citit: ${short(it)}`);
      });
    }

    suite.add(G, "cronologia e în ordine inversă cronologică (cea mai nouă prima)", async (ctx) => {
      const items = await timeline(ctx.leadsInt, ctx.inLead.id);
      expect(items.length === 5, `${items.length} interacțiuni`);
      for (let i = 1; i < items.length; i++) {
        expect(new Date(items[i - 1].occurredAt) >= new Date(items[i].occurredAt), `ordine greșită la ${i}`);
      }
      expect(items[0].type === "meeting" && items[items.length - 1].type === "note", `capete: ${items[0].type} … ${items[items.length - 1].type}`);
    });

    suite.add(G, "fișa de detaliu are aceeași cronologie", async (ctx) => {
      const r = await api(ctx.leadsInt, "GET", `${L}/${ctx.inLead.id}/detail`);
      expectStatus(r, 200);
      expect(r.json.interactions.length === 5 && r.json.interactions[0].type === "meeting", `detail: ${r.json.interactions.length}`);
    });

    suite.add(G, "apel „answered” → 1 încercare, ultimul rezultat și ora apelului pe lead", async (ctx) => {
      const s = ctx.leadsInt;
      const r = await addInteraction(s, ctx.inLead.id, { type: "call", direction: "outbound", body: "A confirmat interesul.", metadata: { outcome: "answered" } });
      expectStatus(r, 201);
      const back = await getLead(s, ctx.inLead.id);
      expect(back.callAttempts === 1 && back.lastCallOutcome === "answered" && back.lastCallAt, `lead: ${short(back)}`);
    });

    suite.add(G, "apel fără rezultat → încercarea crește, rezultatul devine null", async (ctx) => {
      const s = ctx.leadsInt;
      expectStatus(await addInteraction(s, ctx.inLead.id, { type: "call", direction: "outbound" }), 201);
      const back = await getLead(s, ctx.inLead.id);
      expect(back.callAttempts === 2 && back.lastCallOutcome === null, `lead: ${back.callAttempts}/${back.lastCallOutcome}`);
    });

    suite.add(G, "apel „no_answer” → încercarea crește", async (ctx) => {
      const s = ctx.leadsInt;
      expectStatus(await addInteraction(s, ctx.inLead.id, { type: "call", metadata: { outcome: "no_answer" } }), 201);
      const back = await getLead(s, ctx.inLead.id);
      expect(back.callAttempts === 3 && back.lastCallOutcome === "no_answer", `lead: ${back.callAttempts}/${back.lastCallOutcome}`);
    });

    suite.add(G, "apel „wrong_number” (terminal) → contorul NU crește, rezultatul se notează", async (ctx) => {
      const s = ctx.leadsInt;
      expectStatus(await addInteraction(s, ctx.inLead.id, { type: "call", metadata: { outcome: "wrong_number" } }), 201);
      const back = await getLead(s, ctx.inLead.id);
      expect(back.callAttempts === 3 && back.lastCallOutcome === "wrong_number", `lead: ${back.callAttempts}/${back.lastCallOutcome}`);
    });

    suite.add(G, "apel „refused” (terminal) → contorul NU crește", async (ctx) => {
      const s = ctx.leadsInt;
      expectStatus(await addInteraction(s, ctx.inLead.id, { type: "call", metadata: { outcome: "refused" } }), 201);
      const back = await getLead(s, ctx.inLead.id);
      expect(back.callAttempts === 3 && back.lastCallOutcome === "refused", `lead: ${back.callAttempts}/${back.lastCallOutcome}`);
    });

    suite.add(G, "fiecare rezultat valid de apel e acceptat (gatekeeper, callback, busy, not_interested)", async (ctx) => {
      const s = ctx.leadsInt;
      const l = await createLead(s, { fullName: `Rezultate Apel ${RUN}` });
      for (const outcome of ["gatekeeper", "callback", "busy", "not_interested"]) {
        const r = await addInteraction(s, l.id, { type: "call", metadata: { outcome } });
        expectStatus(r, 201, `${outcome}: `);
        expect((await getLead(s, l.id)).lastCallOutcome === outcome, `${outcome} nu s-a notat`);
      }
      expect((await getLead(s, l.id)).callAttempts === 4, "contorul nu e 4");
    });

    suite.add(G, "rezultat de apel necunoscut („nu raspunde”) → 400, contorul rămâne", async (ctx) => {
      const s = ctx.leadsInt;
      expectStatus(await addInteraction(s, ctx.inLead.id, { type: "call", metadata: { outcome: "nu raspunde" } }), 400);
      expect((await getLead(s, ctx.inLead.id)).callAttempts === 3, "contorul s-a schimbat");
    });

    suite.add(G, "rezultat de apel numeric → 400", async (ctx) => {
      expectStatus(await addInteraction(ctx.leadsInt, ctx.inLead.id, { type: "call", metadata: { outcome: 1 } }), 400);
    });

    suite.add(G, "tip de interacțiune necunoscut („fax”) → 400", async (ctx) => {
      expectStatus(await addInteraction(ctx.leadsInt, ctx.inLead.id, { type: "fax", body: "x" }), 400);
    });

    suite.add(G, "direcție necunoscută („sideways”) → 400", async (ctx) => {
      expectStatus(await addInteraction(ctx.leadsInt, ctx.inLead.id, { type: "note", direction: "sideways", body: "x" }), 400);
    });

    suite.add(G, "corp de 2001 de caractere → 400", async (ctx) => {
      expectStatus(await addInteraction(ctx.leadsInt, ctx.inLead.id, { type: "note", body: "a".repeat(2001) }), 400);
    });

    suite.add(G, "metadata ca listă în loc de obiect → 400", async (ctx) => {
      expectStatus(await addInteraction(ctx.leadsInt, ctx.inLead.id, { type: "note", body: "x", metadata: [1, 2] }), 400);
    });

    suite.add(G, "o „schimbare de etapă” nu se poate falsifica manual în cronologie", async (ctx) => {
      const s = ctx.leadsInt;
      const r = await addInteraction(s, ctx.inLead.id, { type: "stage_change", body: "new → paid", metadata: { from: "new", to: "paid" } });
      expectClientError(r, "stage_change manual: ");
    });

    suite.add(G, "interacțiuni pe lead inexistent → 404 (citire și scriere)", async (ctx) => {
      expectStatus(await api(ctx.leadsInt, "GET", `${L}/${RANDOM_UUID}/interactions`), 404);
      expectStatus(await addInteraction(ctx.leadsInt, RANDOM_UUID, { type: "note", body: "x" }), 404);
    });

    suite.add(G, "niciuna dintre interacțiunile invalide nu a ajuns în cronologie", async (ctx) => {
      // Falsificarea „stage_change” are scenariul ei; aici numărăm doar restul.
      const items = (await timeline(ctx.leadsInt, ctx.inLead.id)).filter((i) => i.type !== "stage_change");
      // 5 inițiale + 5 apeluri valide (answered, fără rezultat, no_answer, wrong_number, refused)
      expect(items.length === 10, `${items.length} interacțiuni: ${short(items.map((i) => i.type))}`);
    });
  }

  // ── leads:persoana — istoricul aceleiași persoane + duplicate ───────────────
  {
    const G = "leads:persoana";
    const hist = async (s, id) => {
      const r = await api(s, "GET", `${L}/${id}/person-history`);
      expectStatus(r, 200, "istoric persoană: ");
      expect(Array.isArray(r.json?.leads) && r.json.notesByLead, `formă: ${r.text.slice(0, 120)}`);
      return r.json;
    };

    suite.add(G, "workspace nou; Ion Rusu revine după un an cu alt format de telefon", async (ctx) => {
      const s = await newTenant(ctx, "leadsPerson", "leads-persoana");
      ctx.psA = await createLead(s, { fullName: "Ion Rusu", phone: "+373 69 555 111", email: `Ion.Rusu-${RUN}@Example.invalid` });
      expectStatus(await addInteraction(s, ctx.psA.id, { type: "note", body: "A cerut ofertă pentru 2 copii, a refuzat prețul." }), 201);
      expectStatus(await moveStage(s, ctx.psA.id, "contacted"), 200);
      ctx.psB = await createLead(s, { fullName: "Ion Rusu", phone: "069555111" });
    });

    suite.add(G, "noul lead îl vede pe cel vechi prin telefonul normalizat", async (ctx) => {
      const h = await hist(ctx.leadsPerson, ctx.psB.id);
      expect(h.leads.some((l) => l.id === ctx.psA.id), `înrudite: ${short(h.leads.map((l) => l.id))}`);
    });

    suite.add(G, "comentariile leadului vechi vin cu el, fără schimbările de etapă", async (ctx) => {
      const h = await hist(ctx.leadsPerson, ctx.psB.id);
      const notes = h.notesByLead[ctx.psA.id] ?? [];
      expect(notes.some((n) => n.body === "A cerut ofertă pentru 2 copii, a refuzat prețul."), `note: ${short(notes)}`);
      expect(!notes.some((n) => n.type === "stage_change"), "schimbarea de etapă a intrat în comentarii");
    });

    suite.add(G, "potrivire după email cu altă scriere (litere mici, spații)", async (ctx) => {
      const s = ctx.leadsPerson;
      ctx.psC = await createLead(s, { fullName: "I. Rusu", email: `  ion.rusu-${RUN}@example.invalid ` .trim() });
      const h = await hist(s, ctx.psC.id);
      expect(h.leads.some((l) => l.id === ctx.psA.id), `înrudite: ${short(h.leads.map((l) => l.fullName))}`);
    });

    suite.add(G, "leadul vechi le vede pe amândouă cele noi, dar nu pe el însuși", async (ctx) => {
      const h = await hist(ctx.leadsPerson, ctx.psA.id);
      const ids = h.leads.map((l) => l.id);
      expect(ids.includes(ctx.psB.id) && ids.includes(ctx.psC.id) && !ids.includes(ctx.psA.id), `înrudite: ${short(ids)}`);
    });

    suite.add(G, "lead fără telefon și email → niciun istoric (numele singur nu leagă oameni)", async (ctx) => {
      const s = ctx.leadsPerson;
      ctx.psD = await createLead(s, { fullName: "Ion Rusu" });
      const h = await hist(s, ctx.psD.id);
      expect(h.leads.length === 0, `înrudite: ${h.leads.length}`);
    });

    suite.add(G, "alt om, alt telefon → nu apare în istoricul lui Ion", async (ctx) => {
      const s = ctx.leadsPerson;
      ctx.psE = await createLead(s, { fullName: "Vasile Ciobanu", phone: "078 999 888" });
      const h = await hist(s, ctx.psA.id);
      expect(!h.leads.some((l) => l.id === ctx.psE.id), "persoana străină apare în istoric");
    });

    suite.add(G, "după corectarea telefonului, leadul intră în istoricul persoanei", async (ctx) => {
      const s = ctx.leadsPerson;
      expectStatus(await api(s, "PATCH", `${L}/${ctx.psE.id}`, { phone: "0 69 555 111" }), 200);
      const h = await hist(s, ctx.psA.id);
      expect(h.leads.some((l) => l.id === ctx.psE.id), "telefonul corectat nu leagă");
    });

    suite.add(G, "istoricul persoanei pentru lead inexistent → 404", async (ctx) => {
      expectStatus(await api(ctx.leadsPerson, "GET", `${L}/${RANDOM_UUID}/person-history`), 404);
    });

    suite.add(G, "detectorul de duplicate grupează cele două fișe „Ion Rusu” cu același telefon", async (ctx) => {
      const r = await api(ctx.leadsPerson, "GET", "/api/crm/companies/duplicates");
      expectStatus(r, 200);
      const cl = r.json.clusters.find((c) => c.records.some((x) => x.id === ctx.psA.id));
      expect(cl && cl.records.some((x) => x.id === ctx.psB.id), `clustere: ${short(r.json.clusters.map((c) => c.records.map((x) => x.fullName)))}`);
      expect(cl.score >= 60, `scor ${cl.score}`);
    });

    suite.add(G, "fișele cu același nume dar fără telefon/email nu sunt duplicate", async (ctx) => {
      const s = ctx.leadsPerson;
      const m1 = await createLead(s, { fullName: `Maria Popa ${RUN}` });
      const m2 = await createLead(s, { fullName: `Maria Popa ${RUN}` });
      const r = await api(s, "GET", "/api/crm/companies/duplicates");
      expectStatus(r, 200);
      const hit = r.json.clusters.some((c) => c.records.some((x) => x.id === m1.id) && c.records.some((x) => x.id === m2.id));
      expect(!hit, "două fișe fără date de contact au fost declarate duplicate");
    });
  }

  // ── leads:gdpr — export, retragere, anonimizare ─────────────────────────────
  {
    const G = "leads:gdpr";
    const NAME = `Cristina Munteanu ${RUN}`;
    const EMAIL = `cristina.munteanu-${RUN}@example.invalid`;
    const PHONE = "+373 79 246 810";
    const NOTE = "Mama Mariei; plătește la început de lună.";
    const CALL = "A spus că Maria vrea și la pian.";

    suite.add(G, "workspace nou + lead cu date personale, note, apel, etichetă și contact", async (ctx) => {
      const s = await newTenant(ctx, "leadsGdpr", "leads-gdpr");
      ctx.gdLead = await createLead(s, { fullName: NAME, email: EMAIL, phone: PHONE, notes: NOTE, company: "Familia Munteanu", valueCents: 240000 });
      expectStatus(await addInteraction(s, ctx.gdLead.id, { type: "call", direction: "outbound", body: CALL, metadata: { outcome: "answered" } }), 201);
      expectStatus(await moveStage(s, ctx.gdLead.id, "lost", "S-a mutat în alt oraș"), 200);
      expectStatus(await api(s, "POST", "/api/crm/tags", { leadId: ctx.gdLead.id, tag: `parinte-${RUN}` }), 201);
      expectStatus(await api(s, "POST", "/api/crm/contacts", { leadId: ctx.gdLead.id, fullName: "Maria Munteanu", role: "elevă", phone: "069 777 666" }), 201);
      ctx.gdSibling = await createLead(s, { fullName: "C. Munteanu", phone: "079246810" });
    });

    suite.add(G, "exportul GDPR e un JSON descărcabil (attachment gdpr-lead-<id>.json)", async (ctx) => {
      const raw = await rawGet(ctx.leadsGdpr, `/api/crm/gdpr/export/${ctx.gdLead.id}`);
      expect(raw.status === 200, `HTTP ${raw.status}`);
      expect((raw.headers.get("content-disposition") ?? "").includes(`gdpr-lead-${ctx.gdLead.id}.json`), `disposition: ${raw.headers.get("content-disposition")}`);
      ctx.gdExport = JSON.parse(await raw.text());
    });

    suite.add(G, "exportul conține datele de identitate exact cum sunt în fișă", async (ctx) => {
      const l = ctx.gdExport.lead;
      expect(l.id === ctx.gdLead.id && l.fullName === NAME && l.email === EMAIL && l.phone === PHONE && l.notes === NOTE, `lead: ${short(l)}`);
      expect(ctx.gdExport.exportedBy === ctx.leadsGdpr.user.email, `exportedBy: ${ctx.gdExport.exportedBy}`);
    });

    suite.add(G, "exportul conține cronologia, etichetele și persoanele de contact", async (ctx) => {
      const e = ctx.gdExport;
      expect(e.interactions.some((i) => i.type === "call" && i.body === CALL), `interacțiuni: ${short(e.interactions)}`);
      expect(e.tags.includes(`parinte-${RUN}`), `etichete: ${short(e.tags)}`);
      expect(e.contacts.some((c) => c.fullName === "Maria Munteanu"), `contacte: ${short(e.contacts)}`);
      expect("consent" in e && "tasks" in e && "files" in e && "customFields" in e, `secțiuni: ${Object.keys(e)}`);
    });

    suite.add(G, "exportul GDPR se consemnează în jurnal", async (ctx) => {
      const items = await audit(ctx.leadsGdpr, ctx.gdLead.id);
      expect(items.some((i) => i.actionType === "crm.gdpr.exported"), `jurnal: ${short(items.map((i) => i.actionType))}`);
    });

    suite.add(G, "export GDPR pentru lead inexistent → 404", async (ctx) => {
      expectStatus(await api(ctx.leadsGdpr, "GET", `/api/crm/gdpr/export/${RANDOM_UUID}`), 404);
    });

    suite.add(G, "retragerea consimțământului → 200 cu data retragerii", async (ctx) => {
      const r = await api(ctx.leadsGdpr, "POST", `/api/crm/gdpr/revoke/${ctx.gdSibling.id}`);
      expectStatus(r, 200);
      expect(r.json.ok === true && !Number.isNaN(Date.parse(r.json.consentRevokedAt)), `răspuns: ${short(r.json)}`);
      ctx.gdRevokedAt = r.json.consentRevokedAt;
    });

    suite.add(G, "fișa leadului arată consimțământul retras", async (ctx) => {
      const back = await getLead(ctx.leadsGdpr, ctx.gdSibling.id);
      expect(back.consentRevokedAt && Date.parse(back.consentRevokedAt) === Date.parse(ctx.gdRevokedAt), `consentRevokedAt: ${back.consentRevokedAt}`);
    });

    suite.add(G, "retragerea lasă o notă de sistem în cronologie și nu șterge nimic", async (ctx) => {
      const s = ctx.leadsGdpr;
      const items = await timeline(s, ctx.gdSibling.id);
      expect(items.some((i) => i.type === "system" && /Consimțământ retras/.test(i.body ?? "")), `cronologie: ${short(items)}`);
      const back = await getLead(s, ctx.gdSibling.id);
      expect(back.fullName === "C. Munteanu" && back.phone === "079246810", "retragerea a șters date");
    });

    suite.add(G, "exportul GDPR după retragere arată data retragerii", async (ctx) => {
      const r = await api(ctx.leadsGdpr, "GET", `/api/crm/gdpr/export/${ctx.gdSibling.id}`);
      expectStatus(r, 200);
      expect(r.json.consent?.revokedAt && Date.parse(r.json.consent.revokedAt) === Date.parse(ctx.gdRevokedAt), `consent: ${short(r.json.consent)}`);
    });

    suite.add(G, "a doua retragere păstrează data primei retrageri (dovada cererii)", async (ctx) => {
      const s = ctx.leadsGdpr;
      await new Promise((res) => setTimeout(res, 20));
      expectStatus(await api(s, "POST", `/api/crm/gdpr/revoke/${ctx.gdSibling.id}`), 200);
      const back = await getLead(s, ctx.gdSibling.id);
      expect(Date.parse(back.consentRevokedAt) === Date.parse(ctx.gdRevokedAt), `data s-a rescris: ${ctx.gdRevokedAt} → ${back.consentRevokedAt}`);
    });

    suite.add(G, "retragere pe lead inexistent → 404", async (ctx) => {
      expectStatus(await api(ctx.leadsGdpr, "POST", `/api/crm/gdpr/revoke/${RANDOM_UUID}`), 404);
    });

    suite.add(G, "înainte de anonimizare: leadul se găsește după email și e în istoricul „fratelui”", async (ctx) => {
      const s = ctx.leadsGdpr;
      expect((await listLeads(s, { search: EMAIL })).total === 1, "negăsit după email");
      const h = await api(s, "GET", `${L}/${ctx.gdSibling.id}/person-history`);
      expect(h.json.leads.some((l) => l.id === ctx.gdLead.id), "nu e în istoricul persoanei");
      ctx.gdTimelineCount = (await timeline(s, ctx.gdLead.id)).length;
    });

    suite.add(G, "anonimizarea → 200 ok", async (ctx) => {
      const r = await api(ctx.leadsGdpr, "POST", `/api/crm/gdpr/anonymize/${ctx.gdLead.id}`);
      expectStatus(r, 200);
      expect(r.json.ok === true, `răspuns: ${short(r.json)}`);
    });

    suite.add(G, "după anonimizare: nume marcat, telefon/email șterse, consimțământ retras", async (ctx) => {
      const back = await getLead(ctx.leadsGdpr, ctx.gdLead.id);
      expect(back.fullName === GDPR_REMOVED && back.phone === null && back.email === null, `lead: ${short(back)}`);
      expect(back.consentRevokedAt, "consimțământul nu e marcat retras");
    });

    suite.add(G, "după anonimizare: faptele comerciale rămân (valoare, etapă, motiv)", async (ctx) => {
      const back = await getLead(ctx.leadsGdpr, ctx.gdLead.id);
      expect(back.valueCents === 240000 && back.stage === "lost" && back.lostReason === "S-a mutat în alt oraș", `lead: ${short(back)}`);
    });

    suite.add(G, "căutarea după vechiul email, nume sau telefon nu mai găsește leadul", async (ctx) => {
      const s = ctx.leadsGdpr;
      for (const q of [EMAIL, NAME, "79 246 810"]) {
        const j = await listLeads(s, { search: q });
        expect(!j.items.some((i) => i.id === ctx.gdLead.id), `găsit după „${q}”`);
      }
    });

    suite.add(G, "cronologia păstrează tipul și data, dar conținutul e șters", async (ctx) => {
      const items = await timeline(ctx.leadsGdpr, ctx.gdLead.id);
      expect(items.length === ctx.gdTimelineCount, `${items.length} vs ${ctx.gdTimelineCount}`);
      expect(items.every((i) => i.body === GDPR_REMOVED && i.metadata === null && i.occurredAt), `cronologie: ${short(items)}`);
      expect(items.some((i) => i.type === "call"), "tipul apelului s-a pierdut");
    });

    suite.add(G, "persoanele de contact ale leadului dispar complet", async (ctx) => {
      const r = await api(ctx.leadsGdpr, "GET", `/api/crm/contacts?leadId=${ctx.gdLead.id}`);
      expectStatus(r, 200);
      expect(r.json.items.length === 0, `contacte rămase: ${short(r.json.items)}`);
    });

    suite.add(G, "leadul anonimizat nu mai apare în istoricul persoanei cu același telefon", async (ctx) => {
      const r = await api(ctx.leadsGdpr, "GET", `${L}/${ctx.gdSibling.id}/person-history`);
      expectStatus(r, 200);
      expect(!r.json.leads.some((l) => l.id === ctx.gdLead.id), "încă legat prin telefon");
    });

    suite.add(G, "exportul GDPR după anonimizare nu mai conține nicio dată personală", async (ctx) => {
      const r = await api(ctx.leadsGdpr, "GET", `/api/crm/gdpr/export/${ctx.gdLead.id}`);
      expectStatus(r, 200);
      for (const pii of [NAME, EMAIL, PHONE, NOTE, CALL, "Maria Munteanu"]) {
        expect(!r.text.includes(pii), `exportul încă conține „${pii}”`);
      }
    });

    suite.add(G, "exportul CSV nu mai conține numele sau emailul vechi", async (ctx) => {
      const { r } = await exportCsv(ctx.leadsGdpr);
      expect(!r.text.includes(NAME) && !r.text.includes(EMAIL), "CSV-ul conține încă date personale");
    });

    suite.add(G, "jurnalul de audit nu mai păstrează numele sau emailul persoanei anonimizate", async (ctx) => {
      const items = await audit(ctx.leadsGdpr, ctx.gdLead.id);
      expect(items.some((i) => i.actionType === "crm.gdpr.anonymized"), "anonimizarea nu e în jurnal");
      const text = JSON.stringify(items);
      expect(!text.includes(NAME) && !text.includes(EMAIL), `jurnalul păstrează PII: ${short(items.filter((i) => JSON.stringify(i).includes(NAME)).map((i) => i.actionType))}`);
    });

    suite.add(G, "a doua anonimizare e idempotentă", async (ctx) => {
      const s = ctx.leadsGdpr;
      expectStatus(await api(s, "POST", `/api/crm/gdpr/anonymize/${ctx.gdLead.id}`), 200);
      const back = await getLead(s, ctx.gdLead.id);
      expect(back.fullName === GDPR_REMOVED && back.valueCents === 240000, `lead: ${short(back)}`);
    });

    suite.add(G, "anonimizare pe lead inexistent → 404", async (ctx) => {
      expectStatus(await api(ctx.leadsGdpr, "POST", `/api/crm/gdpr/anonymize/${RANDOM_UUID}`), 404);
    });

    suite.add(G, "valoarea pâlniei rămâne aceeași după anonimizare", async (ctx) => {
      const b = await board(ctx.leadsGdpr);
      expect(b.valueSums.lost === 240000, `lost: ${b.valueSums.lost}`);
    });
  }

  // ── leads:workspace-nou — primul lead, înainte ca cineva să deschidă tabla ──
  {
    const G = "leads:workspace-nou";

    suite.add(G, "workspace nou, fără tabla deschisă: primul lead se creează pe „new”", async (ctx) => {
      const s = await newTenant(ctx, "leadsFresh", "leads-fresh", { openBoard: false });
      ctx.frLead = await createLead(s, { fullName: `Primul Lead ${RUN}`, valueCents: 1500 });
      expect(ctx.frLead.stage === "new", `etapa ${ctx.frLead.stage}`);
    });

    suite.add(G, "primul lead se poate muta în „contacted” fără să fi deschis tabla", async (ctx) => {
      const r = await moveStage(ctx.leadsFresh, ctx.frLead.id, "contacted");
      expectStatus(r, 200, "PATCH /stage într-un workspace nou: ");
    });

    suite.add(G, "fișa primului lead arată eticheta etapei, nu null", async (ctx) => {
      const r = await api(ctx.leadsFresh, "GET", `${L}/${ctx.frLead.id}/detail`);
      expectStatus(r, 200);
      expect(r.json.stage?.label, `etapa din fișă: ${short(r.json.stage)}`);
    });

    suite.add(G, "mutarea în masă a primului lead funcționează fără tabla deschisă", async (ctx) => {
      const r = await api(ctx.leadsFresh, "POST", `${L}/bulk`, { leadIds: [ctx.frLead.id], action: "stage", stage: "trial" });
      expectStatus(r, 200);
      expect(r.json.updated === 1, `răspuns: ${short(r.json)}`);
    });

    suite.add(G, "mutarea primului lead în pâlnia implicită nu dă „pipeline_has_no_stages”", async (ctx) => {
      const pid = await defaultPipelineId(ctx.leadsFresh);
      expectStatus(await api(ctx.leadsFresh, "PATCH", `${L}/${ctx.frLead.id}/pipeline`, { pipelineId: pid }), 200);
    });

    suite.add(G, "după deschiderea tablei, primul lead e pe coloana lui", async (ctx) => {
      const b = await board(ctx.leadsFresh);
      const all = Object.values(b.grouped).flat();
      expect(all.some((c) => c.id === ctx.frLead.id), "primul lead nu apare pe tablă");
    });
  }

  // ── leads:izolare — un client nu vede și nu atinge leadurile altuia ─────────
  {
    const G = "leads:izolare";

    suite.add(G, "două workspace-uri noi, fiecare cu leadul, pâlnia și produsul lui", async (ctx) => {
      const a = await newTenant(ctx, "leadsIsoA", "leads-izo-a");
      const b = await newTenant(ctx, "leadsIsoB", "leads-izo-b");
      ctx.isoBLead = await createLead(b, { fullName: `Secret B ${RUN}`, email: `secret-b-${RUN}@example.invalid`, phone: "068 321 654", valueCents: 7700 });
      expectStatus(await addInteraction(b, ctx.isoBLead.id, { type: "note", body: "Notă confidențială B" }), 201);
      ctx.isoBPipeline = await defaultPipelineId(b);
      const p = await api(b, "POST", "/api/crm/products", { name: `Produs B ${RUN}` });
      expectStatus(p, 201);
      ctx.isoBProduct = p.json.id;
      ctx.isoALead = await createLead(a, { fullName: `Propriu A ${RUN}`, phone: "068 321 654" });
    });

    suite.add(G, "citirea leadului altui client → 404 (lead, detail, cronologie, istoric)", async (ctx) => {
      const a = ctx.leadsIsoA;
      const id = ctx.isoBLead.id;
      for (const p of [`${L}/${id}`, `${L}/${id}/detail`, `${L}/${id}/interactions`, `${L}/${id}/person-history`]) {
        expectStatus(await api(a, "GET", p), 404, `${p}: `);
      }
    });

    suite.add(G, "editarea leadului altui client → 404 și leadul rămâne neatins", async (ctx) => {
      expectStatus(await api(ctx.leadsIsoA, "PATCH", `${L}/${ctx.isoBLead.id}`, { fullName: "Furat de A" }), 404);
      expect((await getLead(ctx.leadsIsoB, ctx.isoBLead.id)).fullName === `Secret B ${RUN}`, "numele s-a schimbat");
    });

    suite.add(G, "mutarea de etapă / pâlnie pe leadul altui client → 404", async (ctx) => {
      const a = ctx.leadsIsoA;
      expectStatus(await moveStage(a, ctx.isoBLead.id, "contacted"), 404);
      expectStatus(await api(a, "PATCH", `${L}/${ctx.isoBLead.id}/pipeline`, { pipelineId: ctx.isoBPipeline }), 404);
      expect((await getLead(ctx.leadsIsoB, ctx.isoBLead.id)).stage === "new", "etapa s-a schimbat");
    });

    suite.add(G, "scrierea în cronologia altui client → 404, cronologia lui rămâne", async (ctx) => {
      expectStatus(await addInteraction(ctx.leadsIsoA, ctx.isoBLead.id, { type: "note", body: "injectat de A" }), 404);
      const items = await timeline(ctx.leadsIsoB, ctx.isoBLead.id);
      expect(items.length === 1 && !items.some((i) => i.body === "injectat de A"), `cronologie B: ${short(items)}`);
    });

    suite.add(G, "GDPR pe leadul altui client: export, retragere, anonimizare → 404, nimic schimbat", async (ctx) => {
      const a = ctx.leadsIsoA;
      const id = ctx.isoBLead.id;
      expectStatus(await api(a, "GET", `/api/crm/gdpr/export/${id}`), 404);
      expectStatus(await api(a, "POST", `/api/crm/gdpr/revoke/${id}`), 404);
      expectStatus(await api(a, "POST", `/api/crm/gdpr/anonymize/${id}`), 404);
      const back = await getLead(ctx.leadsIsoB, id);
      expect(back.fullName === `Secret B ${RUN}` && back.consentRevokedAt === null && back.email, `lead B: ${short(back)}`);
    });

    suite.add(G, "lista, căutarea și tabla lui A nu conțin leadul lui B", async (ctx) => {
      const a = ctx.leadsIsoA;
      expect((await listLeads(a, { search: `Secret B ${RUN}` })).total === 0, "căutarea găsește leadul lui B");
      const all = await listLeads(a, { pageSize: "100" });
      expect(!all.items.some((i) => i.id === ctx.isoBLead.id), "lista conține leadul lui B");
      const b = await board(a);
      expect(!Object.values(b.grouped).flat().some((c) => c.id === ctx.isoBLead.id), "tabla conține leadul lui B");
    });

    suite.add(G, "exportul CSV al lui A nu conține leadul lui B", async (ctx) => {
      const { r } = await exportCsv(ctx.leadsIsoA);
      expect(!r.text.includes(`Secret B ${RUN}`) && !r.text.includes(`secret-b-${RUN}`), "CSV-ul lui A conține datele lui B");
    });

    suite.add(G, "istoricul persoanei nu trece granița dintre clienți (același telefon)", async (ctx) => {
      const r = await api(ctx.leadsIsoA, "GET", `${L}/${ctx.isoALead.id}/person-history`);
      expectStatus(r, 200);
      expect(!r.json.leads.some((l) => l.id === ctx.isoBLead.id), "istoricul lui A arată leadul lui B");
    });

    suite.add(G, "tabla lui A cu pâlnia lui B → 404", async (ctx) => {
      expectStatus(await api(ctx.leadsIsoA, "GET", `${L}/pipeline?pipelineId=${ctx.isoBPipeline}`), 404);
      expectStatus(await api(ctx.leadsIsoA, "GET", `${L}?pipelineId=${ctx.isoBPipeline}`), 404);
    });

    suite.add(G, "mutarea leadului lui A în pâlnia lui B → 404", async (ctx) => {
      expectStatus(await api(ctx.leadsIsoA, "PATCH", `${L}/${ctx.isoALead.id}/pipeline`, { pipelineId: ctx.isoBPipeline }), 404);
      expect((await getLead(ctx.leadsIsoA, ctx.isoALead.id)).pipelineId !== ctx.isoBPipeline, "leadul a ajuns în pâlnia lui B");
    });

    suite.add(G, "lead creat de A cu pâlnia lui B nu ajunge în pâlnia lui B", async (ctx) => {
      const r = await api(ctx.leadsIsoA, "POST", L, { fullName: `Țintă B ${RUN}`, pipelineId: ctx.isoBPipeline });
      expectNo5xx(r);
      if (r.status === 201) expect(r.json.pipelineId !== ctx.isoBPipeline && r.json.tenantId === ctx.leadsIsoA.tenant.id, `lead: ${short(r.json)}`);
      const bb = await board(ctx.leadsIsoB);
      expect(!Object.values(bb.grouped).flat().some((c) => c.fullName === `Țintă B ${RUN}`), "leadul lui A apare pe tabla lui B");
    });

    suite.add(G, "lead creat de A cu produsul lui B → refuzat", async (ctx) => {
      const r = await api(ctx.leadsIsoA, "POST", L, { fullName: `Produs Străin ${RUN}`, productId: ctx.isoBProduct });
      expectClientError(r, "productId din alt client: ");
    });

    suite.add(G, "leadul lui A nu poate fi atribuit unui om din B (PATCH)", async (ctx) => {
      const r = await api(ctx.leadsIsoA, "PATCH", `${L}/${ctx.isoALead.id}`, { assignedTo: ctx.leadsIsoB.user.id });
      const back = await getLead(ctx.leadsIsoA, ctx.isoALead.id);
      expect(back.assignedTo !== ctx.leadsIsoB.user.id, `leadul lui A e atribuit unui om din B (HTTP ${r.status})`);
    });
  }
}
