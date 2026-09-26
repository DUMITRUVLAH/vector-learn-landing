// Procesul comercial (pâlnii, etape), rapoartele (cifre corecte pe un set de date construit aici,
// norme KPI, aranjament), echipa (invitații, roluri, drepturi, acces, dezactivare), jurnalul,
// diagnosticul și cronul.
//
// Fiecare grup își face PROPRIUL workspace (signupTenant) și, unde are nevoie de un al doilea om,
// îl aduce prin fluxul real: invitație CRM → POST /api/auth/accept-invite. Nimic nu atinge
// workspace-ul semănat (ctx.admin / ctx.agent) — alte grupuri depind de el.
//
// Regula suitei (§3.5.1quater): fiecare scenariu INVOCĂ acțiunea și citește înapoi efectul.

import {
  RUN, uid, api, anon, Session, login, signupTenant,
  expect, expectStatus, expectOk, expectClientError, expectNo5xx, listOf,
  RANDOM_UUID,
} from "../lib.mjs";

// ── Ajutoare ────────────────────────────────────────────────────────────────
const PWD = "E2e-parola-lunga-456!";
const DAY = 86_400_000;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
// Perioada raportului: 14 zile centrate pe azi — tot ce se creează în rulare cade înăuntru.
const FROM = iso(NOW - 7 * DAY);
const TO = iso(NOW + 7 * DAY);
const YESTERDAY = iso(NOW - DAY);
const TOMORROW = iso(NOW + DAY);

const J = (v) => JSON.stringify(v);
function same(actual, want, msg) {
  expect(J(actual) === J(want), `${msg}: așteptat ${J(want)}, primit ${J(actual)}`);
}
function st(ctx, g) {
  ctx.g40 ??= {};
  return (ctx.g40[g] ??= {});
}
const qs = (o) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null);
  return p.length ? `?${p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}` : "";
};

function tokenOf(url) {
  const m = /[?&]token=([^&]+)/.exec(url || "");
  return m ? decodeURIComponent(m[1]) : null;
}
async function invite(adminS, role, email = `${uid("e2e-crm-m-")}@example.invalid`) {
  const r = await api(adminS, "POST", "/api/crm/team/invites", { email, role });
  expectStatus(r, 201, "invitația: ");
  const token = tokenOf(r.json?.inviteUrl);
  expect(token, `invitația nu are token în link: ${r.json?.inviteUrl}`);
  return { ...r.json, email, token };
}
async function accept(token, name, password = PWD) {
  const s = new Session(name);
  const r = await api(s, "POST", "/api/auth/accept-invite", { token, name, password });
  if (r.ok) s.user = r.json?.user ?? null;
  return { s, r };
}
/** Un coleg nou în workspace-ul adminului, adus prin invitația CRM reală. */
async function join(adminS, role, name) {
  const inv = await invite(adminS, role);
  const { s, r } = await accept(inv.token, name);
  expectStatus(r, 200, "acceptarea invitației: ");
  s.email = inv.email;
  return s;
}
async function mkLead(s, body = {}) {
  const r = await api(s, "POST", "/api/crm/leads", { fullName: `Lead ${uid()}`, ...body });
  expectStatus(r, 201, "lead nou: ");
  return r.json;
}
async function getLead(s, id) {
  const r = await api(s, "GET", `/api/crm/leads/${id}`);
  const j = expectOk(r, "citirea leadului: ");
  return j?.lead ?? j;
}
async function move(s, id, stage, lostReason) {
  const r = await api(s, "PATCH", `/api/crm/leads/${id}/stage`, lostReason ? { stage, lostReason } : { stage });
  expectStatus(r, 200, `mutarea în ${stage}: `);
  return r.json;
}
async function stagesOf(s, pipelineId) {
  const r = await api(s, "GET", `/api/crm/stages${qs({ pipelineId })}`);
  return expectOk(r, "etapele: ").items;
}
async function pipelinesOf(s) {
  return expectOk(await api(s, "GET", "/api/crm/pipelines"), "pâlniile: ").items;
}
async function auditOf(s, q = {}) {
  return expectOk(await api(s, "GET", `/api/crm/audit${qs({ limit: 200, ...q })}`), "jurnalul: ").items;
}
function auditEntry(items, action, targetId) {
  return items.find((i) => i.actionType === `crm.${action}` && (!targetId || i.targetId === targetId));
}
async function report(s, q = {}) {
  return expectOk(await api(s, "GET", `/api/crm/reports${qs(q)}`), "raportul: ");
}
async function funnel(s, q = {}) {
  return expectOk(await api(s, "GET", `/api/crm/reports/funnel${qs(q)}`), "pâlnia: ");
}
const row = (rows, key) => {
  const r = (rows ?? []).find((x) => x.key === key);
  expect(r, `nu există rândul „${key}” în ${J((rows ?? []).map((x) => x.key))}`);
  return r;
};
async function myPerms(s) {
  return expectOk(await api(s, "GET", "/api/crm/permissions"), "drepturile: ");
}
async function team(s) {
  return expectOk(await api(s, "GET", "/api/crm/team"), "echipa: ");
}

// Matricea documentată în server/lib/crm/permissions.ts.
const BASE = ["crm.access", "leads.view_all", "leads.view_own", "leads.edit", "reports.view_own", "documents.create"];
const ADMIN_ALL = [
  "crm.access", "leads.view_all", "leads.view_own", "leads.edit", "leads.delete", "leads.export",
  "reports.view_team", "reports.view_own", "documents.create", "products.manage", "pipelines.manage",
  "automations.manage", "assignment.manage", "cadences.manage", "audit.view",
];
const MANAGER = [...BASE, "leads.delete", "leads.export", "reports.view_team", "products.manage", "pipelines.manage",
  "automations.manage", "assignment.manage", "cadences.manage", "audit.view"];
const sorted = (a) => [...(a ?? [])].sort();

export function register(suite) {
  pipelinesGroup(suite);
  stagesGroup(suite);
  reportNumbersGroup(suite);
  targetsGroup(suite);
  invitesGroup(suite);
  rolesGroup(suite);
  accessGroup(suite);
  auditGroup(suite);
  healthGroup(suite);
}

// ═════════════════════════════════════════════════════════════════════════════
// proces:pâlnii — CRUD, șabloane, implicita, ștergerea unei pâlnii cu leaduri
// ═════════════════════════════════════════════════════════════════════════════
function pipelinesGroup(suite) {
  const G = "proces:pâlnii";
  const add = (name, fn) => suite.add(G, name, (ctx) => fn(st(ctx, G), ctx));

  add("workspace nou → o singură pâlnie implicită „Vânzări”", async (s) => {
    s.a = await signupTenant(`pâlnii-${RUN}`);
    s.intruder = await signupTenant(`intrus-pâlnii-${RUN}`);
    const items = await pipelinesOf(s.a);
    expect(items.length === 1, `așteptam 1 pâlnie, am ${items.length}`);
    expect(items[0].isDefault === true && items[0].name === "Vânzări", `implicita greșită: ${J(items[0])}`);
    s.def = items[0].id;
  });

  add("implicita are cele 5 etape standard, cu flaguri și probabilități", async (s) => {
    const items = await stagesOf(s.a, s.def);
    same(items.map((x) => x.key), ["new", "contacted", "trial", "paid", "lost"], "cheile");
    same(items.map((x) => x.probabilityPct), [10, 25, 50, 100, 0], "probabilitățile");
    same(items.filter((x) => x.isWon).map((x) => x.key), ["paid"], "etapa câștigată");
    same(items.filter((x) => x.isLost).map((x) => x.key), ["lost"], "etapa pierdută");
    expect(items.every((x) => x.isDefault && x.pipelineId === s.def), "etapele semănate nu sunt marcate implicite/în pâlnie");
  });

  add("GET /stages fără pâlnie = etapele implicitei", async (s) => {
    const j = expectOk(await api(s.a, "GET", "/api/crm/stages"));
    expect(j.pipelineId === s.def, `pipelineId=${j.pipelineId}, implicita=${s.def}`);
  });

  add("șablonul SPANCO creează cele 7 etape documentate", async (s) => {
    const r = await api(s.a, "POST", "/api/crm/pipelines", { name: `SPANCO ${RUN}`, template: "spanco" });
    expectStatus(r, 201);
    expect(r.json.isDefault === false, "o pâlnie nouă nu poate fi implicită");
    s.spanco = r.json.id;
    const items = await stagesOf(s.a, s.spanco);
    same(items.map((x) => x.key), ["suspect", "prospect", "analysis", "negotiation", "conclusion", "order", "lost"], "cheile SPANCO");
    same(items.map((x) => x.label), ["Suspect", "Prospect", "Analysis", "Negotiation", "Conclusion", "Order", "Lost"], "etichetele SPANCO");
  });

  add("SPANCO: câștigat = Order, pierdut = Lost", async (s) => {
    const items = await stagesOf(s.a, s.spanco);
    same(items.filter((x) => x.isWon).map((x) => x.key), ["order"], "câștigat");
    same(items.filter((x) => x.isLost).map((x) => x.key), ["lost"], "pierdut");
  });

  add("SPANCO: probabilitățile cresc monoton până la 100", async (s) => {
    const items = await stagesOf(s.a, s.spanco);
    same(items.map((x) => x.probabilityPct), [5, 15, 35, 60, 85, 100, 0], "probabilitățile");
  });

  add("șablonul call-center creează 8 etape, cu diacritice", async (s) => {
    const r = await api(s.a, "POST", "/api/crm/pipelines", { name: `Call-center ${RUN}`, template: "call_center" });
    expectStatus(r, 201);
    s.cc = r.json.id;
    const items = await stagesOf(s.a, s.cc);
    same(items.map((x) => x.label), ["Rezervă rece", "Repartizat", "Apel în lucru", "Decident atins", "Ofertă trimisă", "Negociere", "Contract", "Pierdut"], "etichetele");
    same(items.map((x) => x.orderIndex), [0, 1, 2, 3, 4, 5, 6, 7], "ordinea");
  });

  add("call-center: câștigat = Contract, pierdut = Pierdut", async (s) => {
    const items = await stagesOf(s.a, s.cc);
    same(items.filter((x) => x.isWon).map((x) => x.key), ["contract"], "câștigat");
    same(items.filter((x) => x.isLost).map((x) => x.key), ["pierdut"], "pierdut");
  });

  add("șablonul „default” explicit dă cele 5 etape standard", async (s) => {
    const r = await api(s.a, "POST", "/api/crm/pipelines", { name: `Standard ${RUN}`, template: "default" });
    expectStatus(r, 201);
    same((await stagesOf(s.a, r.json.id)).map((x) => x.key), ["new", "contacted", "trial", "paid", "lost"], "cheile");
    s.std = r.json.id;
  });

  add("fără șablon → tot cele 5 etape standard", async (s) => {
    const r = await api(s.a, "POST", "/api/crm/pipelines", { name: `  B2B Export ${RUN}  ` });
    expectStatus(r, 201);
    s.b2b = r.json.id;
    same((await stagesOf(s.a, s.b2b)).map((x) => x.key), ["new", "contacted", "trial", "paid", "lost"], "cheile");
  });

  add("numele pâlniei se salvează fără spațiile de la capete", async (s) => {
    const p = (await pipelinesOf(s.a)).find((x) => x.id === s.b2b);
    expect(p?.name === `B2B Export ${RUN}`, `nume salvat: ${J(p?.name)}`);
  });

  add("orderIndex crește cu fiecare pâlnie nouă, lista e în ordinea asta", async (s) => {
    const items = await pipelinesOf(s.a);
    same(items.map((x) => x.id), [s.def, s.spanco, s.cc, s.std, s.b2b], "ordinea pâlniilor");
    const idx = items.map((x) => x.orderIndex);
    expect(idx.every((v, i) => i === 0 || v > idx[i - 1]), `orderIndex nu crește: ${J(idx)}`);
  });

  add("șablon necunoscut → 400 și nicio pâlnie creată", async (s) => {
    const before = (await pipelinesOf(s.a)).length;
    expectClientError(await api(s.a, "POST", "/api/crm/pipelines", { name: "Kanban", template: "kanban" }));
    expect((await pipelinesOf(s.a)).length === before, "s-a creat totuși o pâlnie");
  });

  add("nume gol / doar spații / de 201 caractere → 400", async (s) => {
    for (const name of ["", "    ", "x".repeat(201)]) {
      expectStatus(await api(s.a, "POST", "/api/crm/pipelines", { name }), 400, `nume ${J(name.slice(0, 8))}: `);
    }
  });

  add("redenumirea se vede la recitire", async (s) => {
    const r = await api(s.a, "PATCH", `/api/crm/pipelines/${s.b2b}`, { name: `Export UE ${RUN}` });
    expectStatus(r, 200);
    const p = (await pipelinesOf(s.a)).find((x) => x.id === s.b2b);
    expect(p?.name === `Export UE ${RUN}`, `numele recitit: ${p?.name}`);
  });

  add("redenumirea cu nume gol → 400, numele rămâne", async (s) => {
    expectStatus(await api(s.a, "PATCH", `/api/crm/pipelines/${s.b2b}`, { name: "  " }), 400);
    const p = (await pipelinesOf(s.a)).find((x) => x.id === s.b2b);
    expect(p?.name === `Export UE ${RUN}`, `numele s-a schimbat: ${p?.name}`);
  });

  add("redenumirea unei pâlnii inexistente → 404", async (s) => {
    expectStatus(await api(s.a, "PATCH", `/api/crm/pipelines/${RANDOM_UUID}`, { name: "Nimic" }), 404);
  });

  add("alt client nu poate redenumi pâlnia noastră (404) și numele rămâne", async (s) => {
    expectStatus(await api(s.intruder, "PATCH", `/api/crm/pipelines/${s.b2b}`, { name: "Furat" }), 404);
    const p = (await pipelinesOf(s.a)).find((x) => x.id === s.b2b);
    expect(p?.name === `Export UE ${RUN}`, `intrusul a redenumit: ${p?.name}`);
  });

  add("alt client nu poate șterge pâlnia noastră (404) și ea rămâne", async (s) => {
    expectStatus(await api(s.intruder, "DELETE", `/api/crm/pipelines/${s.b2b}`), 404);
    expect((await pipelinesOf(s.a)).some((x) => x.id === s.b2b), "pâlnia a dispărut");
  });

  add("alt client nu vede pâlniile noastre și nici etapele lor", async (s) => {
    const theirs = await pipelinesOf(s.intruder);
    const ours = new Set([s.def, s.spanco, s.cc, s.std, s.b2b]);
    expect(!theirs.some((x) => ours.has(x.id)), "intrusul vede pâlnii străine");
    expectStatus(await api(s.intruder, "GET", `/api/crm/stages?pipelineId=${s.spanco}`), 404);
    s.intruderDef = theirs.find((x) => x.isDefault)?.id;
  });

  add("implicita nu se poate șterge (400 pipeline_is_default)", async (s) => {
    const r = expectStatus(await api(s.a, "DELETE", `/api/crm/pipelines/${s.def}`), 400);
    expect(r.json?.error === "pipeline_is_default", `eroare: ${r.text}`);
    expect((await pipelinesOf(s.a)).some((x) => x.id === s.def), "implicita a dispărut");
  });

  add("leadul creat în SPANCO intră pe prima ei etapă (suspect)", async (s) => {
    const l = await mkLead(s.a, { pipelineId: s.spanco, valueCents: 10000 });
    expect(l.stage === "suspect" && l.pipelineId === s.spanco, `lead: stage=${l.stage} pipeline=${l.pipelineId}`);
    s.leadSp = l.id;
  });

  add("leadul creat fără pâlnie intră în implicita, pe „new”", async (s) => {
    const l = await mkLead(s.a, {});
    expect(l.stage === "new" && l.pipelineId === s.def, `lead: stage=${l.stage} pipeline=${l.pipelineId}`);
    s.leadDef = l.id;
  });

  add("pâlnia cu leaduri nu se șterge: 409 pipeline_not_empty cu numărul lor", async (s) => {
    const r = expectStatus(await api(s.a, "DELETE", `/api/crm/pipelines/${s.spanco}`), 409);
    expect(r.json?.error === "pipeline_not_empty" && r.json?.leads === 1, `răspuns: ${r.text}`);
  });

  add("după refuz, pâlnia și cele 7 etape ale ei sunt intacte", async (s) => {
    expect((await pipelinesOf(s.a)).some((x) => x.id === s.spanco), "pâlnia a dispărut");
    expect((await stagesOf(s.a, s.spanco)).length === 7, "etapele s-au pierdut");
  });

  add("mutarea în altă pâlnie reașază leadul pe prima etapă a țintei", async (s) => {
    const r = expectStatus(await api(s.a, "PATCH", `/api/crm/leads/${s.leadSp}/pipeline`, { pipelineId: s.def }), 200);
    expect(r.json.pipelineId === s.def && r.json.stage === "new", `după mutare: ${r.json.pipelineId}/${r.json.stage}`);
    const back = await getLead(s.a, s.leadSp);
    expect(back.pipelineId === s.def && back.stage === "new", `recitit: ${back.pipelineId}/${back.stage}`);
  });

  add("mutarea lasă o urmă „system” în istoricul leadului", async (s) => {
    const items = listOf(expectOk(await api(s.a, "GET", `/api/crm/leads/${s.leadSp}/interactions`))) ?? [];
    const t = items.find((i) => i.type === "system" && i.metadata?.toPipelineId === s.def);
    expect(t && t.metadata.fromPipelineId === s.spanco && t.metadata.toStage === "new", `urmă lipsă/greșită: ${J(items.map((i) => i.type))}`);
  });

  add("pâlnia golită se șterge, iar etapele ei dispar", async (s) => {
    expectStatus(await api(s.a, "DELETE", `/api/crm/pipelines/${s.spanco}`), 200);
    expect(!(await pipelinesOf(s.a)).some((x) => x.id === s.spanco), "pâlnia e încă listată");
    expectStatus(await api(s.a, "GET", `/api/crm/stages?pipelineId=${s.spanco}`), 404);
  });

  add("ștergerea a doua oară → 404", async (s) => {
    expectStatus(await api(s.a, "DELETE", `/api/crm/pipelines/${s.spanco}`), 404);
  });

  add("mutarea cu etapă „pierdut” cerută aterizează pe prima etapă nepierdută", async (s) => {
    const r = expectStatus(await api(s.a, "PATCH", `/api/crm/leads/${s.leadDef}/pipeline`, { pipelineId: s.cc, stage: "pierdut" }), 200);
    expect(r.json.stage === "rezerva", `a aterizat pe ${r.json.stage}`);
  });

  add("mutarea cu o etapă existentă în țintă o respectă", async (s) => {
    const r = expectStatus(await api(s.a, "PATCH", `/api/crm/leads/${s.leadDef}/pipeline`, { pipelineId: s.cc, stage: "negociere" }), 200);
    expect(r.json.stage === "negociere" && r.json.pipelineId === s.cc, `lead: ${r.json.pipelineId}/${r.json.stage}`);
  });

  add("mutarea într-o pâlnie a altui client → 404, leadul rămâne pe loc", async (s) => {
    expectStatus(await api(s.a, "PATCH", `/api/crm/leads/${s.leadDef}/pipeline`, { pipelineId: s.intruderDef }), 404);
    const l = await getLead(s.a, s.leadDef);
    expect(l.pipelineId === s.cc && l.stage === "negociere", `leadul s-a mișcat: ${l.pipelineId}/${l.stage}`);
  });

  add("etapa altei pâlnii e refuzată la mutare (400 unknown_stage)", async (s) => {
    const r = expectStatus(await api(s.a, "PATCH", `/api/crm/leads/${s.leadSp}/stage`, { stage: "rezerva" }), 400);
    expect(r.json?.error === "unknown_stage", r.text);
    expect((await getLead(s.a, s.leadSp)).stage === "new", "etapa s-a schimbat");
  });

  add("pierdut fără motiv → 400 lost_reason_required, etapa rămâne", async (s) => {
    const r = expectStatus(await api(s.a, "PATCH", `/api/crm/leads/${s.leadSp}/stage`, { stage: "lost" }), 400);
    expect(r.json?.error === "lost_reason_required", r.text);
    expect((await getLead(s.a, s.leadSp)).stage === "new", "etapa s-a schimbat");
  });

  add("pierdut cu motiv din spații → 400", async (s) => {
    expectStatus(await api(s.a, "PATCH", `/api/crm/leads/${s.leadSp}/stage`, { stage: "lost", lostReason: "   " }), 400);
  });

  add("pierdut cu motiv → 200, motivul se salvează pe lead", async (s) => {
    await move(s.a, s.leadSp, "lost", "A ales concurența");
    const l = await getLead(s.a, s.leadSp);
    expect(l.stage === "lost" && l.lostReason === "A ales concurența", `lead: ${l.stage}/${l.lostReason}`);
  });

  add("raportul pe pâlnia call-center folosește etapele ei", async (s) => {
    const j = await report(s.a, { pipelineId: s.cc });
    expect(j.pipelineId === s.cc, `pipelineId=${j.pipelineId}`);
    same(j.stages.map((x) => x.key), ["rezerva", "repartizat", "in_lucru", "decident", "oferta", "negociere", "contract", "pierdut"], "etapele raportului");
    same(j.funnel.map((x) => x.key), ["rezerva", "repartizat", "in_lucru", "decident", "oferta", "negociere", "contract", "pierdut"], "pâlnia (pierdut la coadă)");
    expect(row(j.funnel, "negociere").currentCount === 1, "leadul din negociere lipsește din pâlnie");
  });

  add("raportul pe „all” nu are pâlnie proprie", async (s) => {
    const j = await report(s.a, { pipelineId: "all" });
    expect(j.pipelineId === null && Array.isArray(j.funnel) && j.funnel.length === 0, `pipelineId=${j.pipelineId} funnel=${j.funnel?.length}`);
  });

  add("raportul cu pâlnia altui client cade pe implicita noastră", async (s) => {
    const j = await report(s.a, { pipelineId: s.intruderDef });
    expect(j.pipelineId === s.def, `pipelineId=${j.pipelineId}`);
  });

  add("jurnalul: pâlnia creată (cu șablonul), redenumită, ștearsă — cu autorul", async (s) => {
    const items = await auditOf(s.a);
    const created = auditEntry(items, "pipeline.created", s.spanco);
    const renamed = auditEntry(items, "pipeline.renamed", s.b2b);
    const deleted = auditEntry(items, "pipeline.deleted", s.spanco);
    expect(created?.newValue?.template === "spanco", `creare: ${J(created)}`);
    expect(renamed?.newValue?.name === `Export UE ${RUN}`, `redenumire: ${J(renamed)}`);
    expect(deleted, "ștergerea lipsește din jurnal");
    for (const e of [created, renamed, deleted]) {
      expect(e.actorId === s.a.user.id && e.actorName === "Tenant Izolat", `autor greșit: ${J(e)}`);
    }
  });

  add("jurnalul: mutarea între pâlnii are before/after", async (s) => {
    const e = auditEntry(await auditOf(s.a, { targetId: s.leadSp }), "lead.pipeline_changed", s.leadSp);
    expect(e?.oldValue?.pipelineId === s.spanco && e?.newValue?.pipelineId === s.def && e?.newValue?.stage === "new", `intrare: ${J(e)}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// proces:etape — chei din etichete românești, reordonare, won/lost, ștergere
// ═════════════════════════════════════════════════════════════════════════════
function stagesGroup(suite) {
  const G = "proces:etape";
  const add = (name, fn) => suite.add(G, name, (ctx) => fn(st(ctx, G), ctx));
  const create = (s, body) => api(s.a, "POST", "/api/crm/stages", body);

  add("workspace nou cu a doua pâlnie „Cursuri”", async (s) => {
    s.a = await signupTenant(`etape-${RUN}`);
    s.intruder = await signupTenant(`intrus-etape-${RUN}`);
    s.def = (await pipelinesOf(s.a))[0].id;
    s.defStages = await stagesOf(s.a, s.def);
    const r = expectStatus(await api(s.a, "POST", "/api/crm/pipelines", { name: `Cursuri ${RUN}` }), 201);
    s.curs = r.json.id;
    s.intruderStages = await stagesOf(s.intruder);
  });

  add("„Ofertă trimisă” → cheia oferta_trimisa, la coada pâlniei", async (s) => {
    const r = expectStatus(await create(s, { label: "Ofertă trimisă", probabilityPct: 60 }), 201);
    expect(r.json.key === "oferta_trimisa", `cheie: ${r.json.key}`);
    expect(r.json.orderIndex === 5 && r.json.pipelineId === s.def && r.json.isDefault === false, `rând: ${J(r.json)}`);
    s.oferta = r.json.id;
  });

  const keyCases = [
    ["Școală de vară!", "scoala_de_vara"],
    ["Ţară Şcoală (sedilă)", "tara_scoala_sedila"],
    ["Întâlnire în Iași", "intalnire_in_iasi"],
    ["  --Așteaptă   plata--  ", "asteapta_plata"],
    ["Etapa 2: Contract semnat", "etapa_2_contract_semnat"],
  ];
  for (const [label, key] of keyCases) {
    add(`cheia din „${label.trim()}” e ${key}`, async (s) => {
      const r = expectStatus(await create(s, { label }), 201);
      expect(r.json.key === key, `cheie: ${r.json.key}`);
      expect(r.json.label === label, `eticheta s-a alterat: ${J(r.json.label)}`);
    });
  }

  add("etichetă fără litere latine (★★) → cheia „etapa”", async (s) => {
    const r = expectStatus(await create(s, { label: "★★" }), 201);
    expect(r.json.key === "etapa", `cheie: ${r.json.key}`);
  });

  add("a doua etichetă fără litere → 409 stage_key_taken", async (s) => {
    const r = expectStatus(await create(s, { label: "🙂" }), 409);
    expect(r.json?.error === "stage_key_taken", r.text);
  });

  add("cheia explicită are prioritate asupra etichetei", async (s) => {
    const r = expectStatus(await create(s, { label: "Clienți VIP", key: "vip" }), 201);
    expect(r.json.key === "vip", `cheie: ${r.json.key}`);
    s.vip = r.json.id;
  });

  add("aceeași etichetă în aceeași pâlnie → 409", async (s) => {
    expectStatus(await create(s, { label: "Ofertă trimisă" }), 409);
  });

  add("aceeași cheie în altă pâlnie → 201 (unicitatea e pe pâlnie)", async (s) => {
    const r = expectStatus(await create(s, { label: "Clienți VIP", key: "vip", pipelineId: s.curs }), 201);
    expect(r.json.pipelineId === s.curs, `pâlnia: ${r.json.pipelineId}`);
    s.vipCurs = r.json.id;
  });

  add("eticheta de 100 de caractere → cheie plafonată la 64", async (s) => {
    const label = `Etapă ${RUN} ${"foarte lungă ".repeat(10)}`.slice(0, 100);
    const r = expectStatus(await create(s, { label }), 201);
    expect(r.json.key.length <= 64 && !r.json.key.endsWith("_") && r.json.label === label, `cheie: ${r.json.key} (${r.json.key.length})`);
  });

  add("eticheta de 101+ caractere → 400 (nu 500), la creare și la redenumire", async (s) => {
    const label = `Etapă ${"foarte lungă ".repeat(12)}${RUN}`;
    expectClientError(await create(s, { label }), "creare: ");
    expectClientError(await api(s.a, "PATCH", `/api/crm/stages/${s.oferta}`, { label }), "redenumire: ");
  });

  add("etichetă goală → 400", async (s) => {
    expectStatus(await create(s, { label: "" }), 400);
  });

  add("probabilitate 101 / -5 / 55,5 → 400", async (s) => {
    for (const p of [101, -5, 55.5]) expectStatus(await create(s, { label: `P ${p}`, probabilityPct: p }), 400, `p=${p}: `);
  });

  add("culoare de 41 de caractere → 400", async (s) => {
    expectStatus(await create(s, { label: "Culoare lungă", color: "c".repeat(41) }), 400);
  });

  add("etapa într-o pâlnie a altui client → 404", async (s) => {
    const theirs = (await pipelinesOf(s.intruder))[0].id;
    expectStatus(await create(s, { label: "Infiltrat", pipelineId: theirs }), 404);
    expect((await stagesOf(s.intruder)).every((x) => x.label !== "Infiltrat"), "etapa a ajuns la intrus");
  });

  add("probabilitatea și culoarea se recitesc exact", async (s) => {
    const r = expectStatus(await create(s, { label: "Negociere finală", probabilityPct: 70, color: "peach" }), 201);
    const back = (await stagesOf(s.a, s.def)).find((x) => x.id === r.json.id);
    expect(back?.probabilityPct === 70 && back?.color === "peach", `recitit: ${J(back)}`);
    s.negFinal = r.json.id;
  });

  add("PATCH pe cheie → 400 stage_key_immutable, cheia rămâne", async (s) => {
    const r = expectStatus(await api(s.a, "PATCH", `/api/crm/stages/${s.oferta}`, { key: "altceva" }), 400);
    expect(r.json?.error === "stage_key_immutable", r.text);
    expect((await stagesOf(s.a, s.def)).find((x) => x.id === s.oferta)?.key === "oferta_trimisa", "cheia s-a schimbat");
  });

  add("redenumirea schimbă eticheta, nu cheia", async (s) => {
    expectStatus(await api(s.a, "PATCH", `/api/crm/stages/${s.oferta}`, { label: "Ofertă trimisă clientului" }), 200);
    const back = (await stagesOf(s.a, s.def)).find((x) => x.id === s.oferta);
    expect(back?.label === "Ofertă trimisă clientului" && back?.key === "oferta_trimisa", `recitit: ${J(back)}`);
  });

  add("PATCH probabilitate 101 → 400, valoarea rămâne 60", async (s) => {
    expectStatus(await api(s.a, "PATCH", `/api/crm/stages/${s.oferta}`, { probabilityPct: 101 }), 400);
    expect((await stagesOf(s.a, s.def)).find((x) => x.id === s.oferta)?.probabilityPct === 60, "probabilitatea s-a schimbat");
  });

  add("PATCH isWon pe o etapă nouă persistă", async (s) => {
    expectStatus(await api(s.a, "PATCH", `/api/crm/stages/${s.negFinal}`, { isWon: true, probabilityPct: 100 }), 200);
    const back = (await stagesOf(s.a, s.def)).find((x) => x.id === s.negFinal);
    expect(back?.isWon === true && back?.probabilityPct === 100, `recitit: ${J(back)}`);
  });

  add("PATCH / DELETE pe o etapă inexistentă → 404", async (s) => {
    expectStatus(await api(s.a, "PATCH", `/api/crm/stages/${RANDOM_UUID}`, { label: "X" }), 404);
    expectStatus(await api(s.a, "DELETE", `/api/crm/stages/${RANDOM_UUID}`), 404);
  });

  add("etapa altui client: PATCH → 404 și nu se schimbă", async (s) => {
    const target = s.intruderStages[0];
    expectStatus(await api(s.a, "PATCH", `/api/crm/stages/${target.id}`, { label: "Spart" }), 404);
    expect((await stagesOf(s.intruder)).find((x) => x.id === target.id)?.label === target.label, "eticheta intrusului s-a schimbat");
  });

  add("etapa altui client: DELETE → 404 și rămâne", async (s) => {
    const target = s.intruderStages[1];
    expectStatus(await api(s.a, "DELETE", `/api/crm/stages/${target.id}`), 404);
    expect((await stagesOf(s.intruder)).some((x) => x.id === target.id), "etapa intrusului a dispărut");
  });

  add("reordonarea inversă se vede la recitire, cu indexuri 0..n-1", async (s) => {
    const cur = await stagesOf(s.a, s.def);
    const ids = cur.map((x) => x.id).reverse();
    expectStatus(await api(s.a, "POST", "/api/crm/stages/reorder", { ids }), 200);
    const back = await stagesOf(s.a, s.def);
    same(back.map((x) => x.id), ids, "ordinea recitită");
    same(back.map((x) => x.orderIndex), ids.map((_, i) => i), "orderIndex");
  });

  add("reordonarea unui subset păstrează indexurile celorlalte", async (s) => {
    const cur = await stagesOf(s.a, s.def);
    const std = ["new", "contacted", "trial", "paid", "lost"].map((k) => cur.find((x) => x.key === k).id);
    const rest = cur.filter((x) => !std.includes(x.id)).map((x) => x.id);
    // Standardul în față, restul în urmă — apoi un subset de două.
    expectStatus(await api(s.a, "POST", "/api/crm/stages/reorder", { ids: [...std, ...rest] }), 200);
    const before = await stagesOf(s.a, s.def);
    const idxBefore = new Map(before.map((x) => [x.id, x.orderIndex]));
    expectStatus(await api(s.a, "POST", "/api/crm/stages/reorder", { ids: [std[1], std[0]] }), 200);
    const after = new Map((await stagesOf(s.a, s.def)).map((x) => [x.id, x.orderIndex]));
    expect(after.get(std[1]) === 0 && after.get(std[0]) === 1, `subsetul: ${after.get(std[1])}/${after.get(std[0])}`);
    for (const id of rest) expect(after.get(id) === idxBefore.get(id), `etapa ${id} și-a schimbat indexul`);
    // Înapoi la ordinea standard, pentru pașii următori.
    expectStatus(await api(s.a, "POST", "/api/crm/stages/reorder", { ids: [...std, ...rest] }), 200);
  });

  add("id-urile altui client din reordonare sunt ignorate", async (s) => {
    const theirIds = s.intruderStages.map((x) => x.id);
    const mine = (await stagesOf(s.a, s.def)).map((x) => x.id);
    expectStatus(await api(s.a, "POST", "/api/crm/stages/reorder", { ids: [...theirIds].reverse().concat(mine) }), 200);
    const theirsAfter = await stagesOf(s.intruder);
    same(theirsAfter.map((x) => x.id), theirIds, "ordinea etapelor intrusului");
    same(theirsAfter.map((x) => x.orderIndex), s.intruderStages.map((x) => x.orderIndex), "indexurile intrusului");
  });

  add("reordonare cu listă goală / id non-uuid → 400", async (s) => {
    expectStatus(await api(s.a, "POST", "/api/crm/stages/reorder", { ids: [] }), 400);
    expectStatus(await api(s.a, "POST", "/api/crm/stages/reorder", { ids: ["abc"] }), 400);
  });

  add("leadul mutat în „Ofertă trimisă” numără la oferte trimise în raport", async (s) => {
    s.lead = (await mkLead(s.a, { valueCents: 90000 })).id;
    await move(s.a, s.lead, "oferta_trimisa");
    const j = await report(s.a, { from: FROM, to: TO });
    expect(j.kpis.offersSent === 1, `offersSent=${j.kpis.offersSent}`);
  });

  add("etapa cu lead nu se șterge: 409 stage_not_empty {leads:1}", async (s) => {
    const r = expectStatus(await api(s.a, "DELETE", `/api/crm/stages/${s.oferta}`), 409);
    expect(r.json?.error === "stage_not_empty" && r.json?.leads === 1, r.text);
  });

  add("după refuz, leadul și etapa sunt neatinse", async (s) => {
    expect((await getLead(s.a, s.lead)).stage === "oferta_trimisa", "leadul a pierdut etapa");
    expect((await stagesOf(s.a, s.def)).some((x) => x.id === s.oferta), "etapa a dispărut");
  });

  add("leadul mutat → etapa se șterge și dispare din listă", async (s) => {
    await move(s.a, s.lead, "contacted");
    expectStatus(await api(s.a, "DELETE", `/api/crm/stages/${s.oferta}`), 200);
    expect(!(await stagesOf(s.a, s.def)).some((x) => x.id === s.oferta), "etapa e încă listată");
  });

  add("mutarea pe o etapă ștearsă → 400 unknown_stage", async (s) => {
    const r = expectStatus(await api(s.a, "PATCH", `/api/crm/leads/${s.lead}/stage`, { stage: "oferta_trimisa" }), 400);
    expect(r.json?.error === "unknown_stage", r.text);
  });

  add("etapa implicită goală tot nu se șterge (400 stage_is_default)", async (s) => {
    const trial = (await stagesOf(s.a, s.def)).find((x) => x.key === "trial");
    const r = expectStatus(await api(s.a, "DELETE", `/api/crm/stages/${trial.id}`), 400);
    expect(r.json?.error === "stage_is_default", r.text);
  });

  add("cheia „vip” din altă pâlnie se șterge chiar dacă implicita are leaduri pe „vip”", async (s) => {
    await move(s.a, s.lead, "vip");
    expectStatus(await api(s.a, "DELETE", `/api/crm/stages/${s.vipCurs}`), 200);
    expect(!(await stagesOf(s.a, s.curs)).some((x) => x.id === s.vipCurs), "etapa din Cursuri e încă acolo");
  });

  add("„vip” din implicită (cu lead) nu se șterge: 409", async (s) => {
    expectStatus(await api(s.a, "DELETE", `/api/crm/stages/${s.vip}`), 409);
    expect((await getLead(s.a, s.lead)).stage === "vip", "leadul a fost orfanizat");
  });

  add("o etapă personalizată marcată pierdută cere motiv", async (s) => {
    expectStatus(await create(s, { label: "Anulat de client", isLost: true }), 201);
    const r = expectStatus(await api(s.a, "PATCH", `/api/crm/leads/${s.lead}/stage`, { stage: "anulat_de_client" }), 400);
    expect(r.json?.error === "lost_reason_required", r.text);
    const l = await move(s.a, s.lead, "anulat_de_client", "Și-a mutat copilul la altă școală");
    expect(l.lostReason === "Și-a mutat copilul la altă școală", `motiv: ${l.lostReason}`);
  });

  add("o etapă nouă marcată câștigată numără la contracte și la valoare", async (s) => {
    const before = await report(s.a, { from: FROM, to: TO });
    const l = await mkLead(s.a, { valueCents: 123400 });
    await move(s.a, l.id, "negociere_finala");
    const after = await report(s.a, { from: FROM, to: TO });
    expect(after.outcomes.wonCount === before.outcomes.wonCount + 1, `wonCount ${before.outcomes.wonCount} → ${after.outcomes.wonCount}`);
    expect(after.outcomes.wonValueCents === before.outcomes.wonValueCents + 123400, `valoare ${before.outcomes.wonValueCents} → ${after.outcomes.wonValueCents}`);
    expect(after.kpis.contractsSigned === before.kpis.contractsSigned + 1, "contractsSigned nu a crescut");
  });

  add("prima etapă adăugată într-un workspace nou nu înlocuiește cele 5 implicite", async () => {
    const fresh = await signupTenant(`etape-prima-${RUN}`);
    expectStatus(await api(fresh, "POST", "/api/crm/stages", { label: "Ofertă trimisă" }), 201);
    const keys = (await stagesOf(fresh)).map((x) => x.key);
    same(keys, ["new", "contacted", "trial", "paid", "lost", "oferta_trimisa"], "etapele după prima adăugare (fără ele: fără „Client”, fără „Pierdut”, iar leadurile noi intră direct pe „Ofertă trimisă”)");
  });

  add("primul lead dintr-un workspace nou se poate muta pe etape", async () => {
    const fresh = await signupTenant(`etape-primul-lead-${RUN}`);
    const l = await mkLead(fresh, { valueCents: 1000 });
    const r = await api(fresh, "PATCH", `/api/crm/leads/${l.id}/stage`, { stage: "contacted" });
    expect(r.status === 200 && r.json?.stage === "contacted", `leadul creat înainte de deschiderea tablei (stage=${l.stage}) nu se poate muta: ${r.status} ${r.text.slice(0, 100)}`);
  });

  add("jurnalul: crearea, modificarea și ștergerea etapei", async (s) => {
    const items = await auditOf(s.a, { targetId: s.oferta });
    const created = auditEntry(items, "stage.created");
    const updated = items.filter((i) => i.actionType === "crm.stage.updated");
    const deleted = auditEntry(items, "stage.deleted");
    expect(created?.newValue?.key === "oferta_trimisa" && created.targetType === "crm_stage", `creare: ${J(created)}`);
    expect(updated.some((u) => u.newValue?.label === "Ofertă trimisă clientului"), `modificări: ${J(updated.map((u) => u.newValue))}`);
    expect(deleted?.oldValue?.key === "oferta_trimisa", `ștergere: ${J(deleted)}`);
    expect([created, deleted].every((e) => e.actorId === s.a.user.id), "autorul lipsește");
  });

  add("jurnalul nu scrie modificări respinse (PATCH key refuzat)", async (s) => {
    const items = await auditOf(s.a, { targetId: s.oferta });
    expect(!items.some((i) => i.actionType === "crm.stage.updated" && i.newValue?.key !== undefined), "o modificare respinsă a ajuns în jurnal");
  });

  add("jurnalul: schimbarea de etapă a leadului are before/after și motivul", async (s) => {
    const items = await auditOf(s.a, { targetId: s.lead });
    const lost = items.find((i) => i.actionType === "crm.lead.stage_changed" && i.newValue?.stage === "anulat_de_client");
    expect(lost?.oldValue?.stage === "vip" && lost.newValue.lostReason === "Și-a mutat copilul la altă școală", `intrare: ${J(lost)}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// rapoarte:cifre — un set de date cunoscut, apoi fiecare cifră verificată
// ═════════════════════════════════════════════════════════════════════════════
//
// Setul (pâlnia implicită, etapa „Ofertă trimisă” pusă între Trial și Client):
//   L1  A  1.000,00  facebook_ad  Engleză B2   new→contacted→trial→oferta→paid   (câștigat)
//   L2  B  2.500,00  referral     Engleză B2   new→paid                          (câștigat)
//   L3  A    500,00  facebook_ad  Programare   new→contacted→lost „Preț prea mare”
//   L4  B    300,00  manual       Programare   new→contacted
//   L5  A    200,00  instagram    —            new (probabilitate proprie 40%)
//   Apeluri: L1 answered + no_answer, L4 gatekeeper; întâlnire pe L2.
//   Taskuri pe L4: unul restant, unul în termen, unul terminat.
function reportNumbersGroup(suite) {
  const G = "rapoarte:cifre";
  const add = (name, fn) => suite.add(G, name, (ctx) => fn(st(ctx, G), ctx));
  const R = (s, extra = {}) => report(s.a, { from: FROM, to: TO, ...extra });

  add("workspace nou + agentul B adus prin invitație", async (s) => {
    s.a = await signupTenant(`rapoarte-${RUN}`);
    s.b = await join(s.a, "teacher", "Bogdan Agent");
    s.A = s.a.user.id;
    s.B = s.b.user.id;
    expect(s.B && s.B !== s.A, "agentul nu are id");
  });

  add("etapa „Ofertă trimisă” se așază între Trial și Client", async (s) => {
    // Ca în interfață: tabla (GET /stages) se deschide înainte de editorul de etape.
    expect((await stagesOf(s.a)).length === 5, "workspace-ul nou nu are cele 5 etape");
    const o = expectStatus(await api(s.a, "POST", "/api/crm/stages", { label: "Ofertă trimisă", probabilityPct: 60 }), 201).json;
    const cur = await stagesOf(s.a);
    const id = (k) => cur.find((x) => x.key === k).id;
    expectStatus(await api(s.a, "POST", "/api/crm/stages/reorder", { ids: [id("new"), id("contacted"), id("trial"), o.id, id("paid"), id("lost")] }), 200);
    same((await R(s)).stages.map((x) => x.key), ["new", "contacted", "trial", "oferta_trimisa", "paid", "lost"], "etapele raportului");
  });

  add("cele 5 leaduri ale setului se creează cu agentul, valoarea și sursa lor", async (s) => {
    const spec = [
      { assignedTo: s.A, valueCents: 100000, source: "facebook_ad", interestCourse: "Engleză B2" },
      { assignedTo: s.B, valueCents: 250000, source: "referral", interestCourse: "Engleză B2" },
      { assignedTo: s.A, valueCents: 50000, source: "facebook_ad", interestCourse: "Programare" },
      { assignedTo: s.B, valueCents: 30000, source: "manual", interestCourse: "Programare" },
      { assignedTo: s.A, valueCents: 20000, source: "instagram", probabilityPct: 40 },
    ];
    s.L = [];
    for (const [i, body] of spec.entries()) {
      const l = await mkLead(s.a, { fullName: `Client ${i + 1} ${RUN}`, ...body });
      expect(l.assignedTo === body.assignedTo && l.valueCents === body.valueCents && l.stage === "new", `L${i + 1}: ${J(l)}`);
      s.L.push(l.id);
    }
  });

  add("L1 parcurge pâlnia până la Client", async (s) => {
    for (const k of ["contacted", "trial", "oferta_trimisa", "paid"]) await move(s.a, s.L[0], k);
    expect((await getLead(s.a, s.L[0])).stage === "paid", "L1 nu e câștigat");
  });

  add("L2 sare direct la Client, L3 se pierde din Contactat, L4 rămâne în Contactat", async (s) => {
    await move(s.a, s.L[1], "paid");
    await move(s.a, s.L[2], "contacted");
    await move(s.a, s.L[2], "lost", "Preț prea mare");
    await move(s.a, s.L[3], "contacted");
    const l3 = await getLead(s.a, s.L[2]);
    expect(l3.stage === "lost" && l3.lostReason === "Preț prea mare", `L3: ${l3.stage}/${l3.lostReason}`);
  });

  add("apelurile și întâlnirea se înregistrează", async (s) => {
    const call = (id, outcome) => api(s.a, "POST", `/api/crm/leads/${id}/interactions`, { type: "call", direction: "outbound", body: "Apel", metadata: { outcome } });
    for (const r of [await call(s.L[0], "answered"), await call(s.L[0], "no_answer"), await call(s.L[3], "gatekeeper")]) expectStatus(r, 201);
    expectStatus(await api(s.a, "POST", `/api/crm/leads/${s.L[1]}/interactions`, { type: "meeting", body: "Întâlnire la sediu" }), 201);
    const l1 = await getLead(s.a, s.L[0]);
    expect(l1.callAttempts === 2 && l1.lastCallOutcome === "no_answer", `L1 apeluri: ${l1.callAttempts}/${l1.lastCallOutcome}`);
  });

  add("taskurile: unul restant, unul în termen, unul terminat", async (s) => {
    const t = (title, dueAt, assignedTo) => api(s.a, "POST", "/api/crm/tasks", { leadId: s.L[3], title, dueAt, assignedTo });
    expectStatus(await t("Sună înapoi (restant)", YESTERDAY, s.A), 201);
    expectStatus(await t("Trimite programa", TOMORROW, s.B), 201);
    const done = expectStatus(await t("Confirmă grupa", TOMORROW, s.B), 201).json;
    const c = expectStatus(await api(s.a, "POST", `/api/crm/tasks/${done.id}/complete`), 200);
    expect(c.json.status === "done" && c.json.completedAt, `task terminat: ${J(c.json)}`);
  });

  add("rezultate: 5 leaduri noi, 2 câștigate, 1 pierdut", async (s) => {
    const o = (await R(s)).outcomes;
    expect(o.newLeads === 5 && o.wonCount === 2 && o.lostCount === 1, `outcomes: ${J(o)}`);
  });

  add("valoarea câștigată = 1.000 + 2.500; pierdută = 500", async (s) => {
    const o = (await R(s)).outcomes;
    expect(o.wonValueCents === 350000 && o.lostValueCents === 50000, `valori: ${o.wonValueCents}/${o.lostValueCents}`);
  });

  add("rata de câștig = 2 din 3 decise = 67%, valoarea medie 1.750", async (s) => {
    const o = (await R(s)).outcomes;
    expect(o.winRatePct === 67 && o.avgDealCents === 175000, `rata=${o.winRatePct} medie=${o.avgDealCents}`);
  });

  add("KPI echipă: 5 leaduri, 2 contracte, vânzări 3.500", async (s) => {
    const k = (await R(s)).kpis;
    expect(k.leadsAllocated === 5 && k.contractsSigned === 2 && k.salesValueCents === 350000, `kpis: ${J(k)}`);
  });

  add("KPI: o singură ofertă trimisă (L1 prin „Ofertă trimisă”)", async (s) => {
    expect((await R(s)).kpis.offersSent === 1, "offersSent greșit");
  });

  add("KPI: 3 apeluri, 1 contact reușit, 1 întâlnire", async (s) => {
    const k = (await R(s)).kpis;
    expect(k.callsMade === 3 && k.successfulContacts === 1 && k.meetings === 1, `kpis: ${J(k)}`);
  });

  add("KPI: 1 task terminat în perioadă, 1 restant", async (s) => {
    const k = (await R(s)).kpis;
    expect(k.tasksDone === 1 && k.tasksOverdue === 1, `tasks: ${k.tasksDone}/${k.tasksOverdue}`);
  });

  add("conformitatea taskurilor: 1 terminat, 1 restant, 1 în termen = 33%", async (s) => {
    const t = (await R(s)).taskCompliance;
    same(t, { done: 1, overdue: 1, openNotYetDue: 1, totalPct: 33 }, "taskCompliance");
  });

  add("pâlnia de apeluri: 3 formate, 2 conectate, 1 decident, 2 leaduri", async (s) => {
    const f = (await R(s)).callFunnel;
    expect(f.dialed === 3 && f.connected === 2 && f.decisionMakers === 1 && f.leadsTouched === 2 && f.callsPerDecisionMaker === 3, `callFunnel: ${J(f)}`);
    same(sorted(f.byOutcome.map((x) => `${x.outcome}:${x.count}`)), ["answered:1", "gatekeeper:1", "no_answer:1"], "pe rezultat");
  });

  add("filtrul pe agentul A: 3 leaduri, 1 contract de 1.000, 2 apeluri", async (s) => {
    const k = (await R(s, { owner: s.A })).kpis;
    expect(k.leadsAllocated === 3 && k.contractsSigned === 1 && k.salesValueCents === 100000 && k.callsMade === 2, `kpis A: ${J(k)}`);
  });

  add("filtrul pe agentul A: 1 câștigat, 1 pierdut → 50%", async (s) => {
    const o = (await R(s, { owner: s.A })).outcomes;
    expect(o.wonCount === 1 && o.lostCount === 1 && o.winRatePct === 50, `outcomes A: ${J(o)}`);
  });

  add("filtrul pe agentul B: 2 leaduri, 1 contract de 2.500, 0 pierderi, 100%", async (s) => {
    const j = await R(s, { owner: s.B });
    expect(j.kpis.leadsAllocated === 2 && j.kpis.salesValueCents === 250000 && j.outcomes.lostCount === 0 && j.outcomes.winRatePct === 100, `B: ${J(j.kpis)} ${J(j.outcomes)}`);
  });

  add("filtrul pe agentul B: 1 apel, 1 întâlnire", async (s) => {
    const k = (await R(s, { owner: s.B })).kpis;
    expect(k.callsMade === 1 && k.meetings === 1, `kpis B: ${J(k)}`);
  });

  add("filtrul pe un agent necunoscut: zero peste tot", async (s) => {
    const j = await R(s, { owner: RANDOM_UUID });
    expect(j.kpis.leadsAllocated === 0 && j.outcomes.wonCount === 0 && j.kpis.callsMade === 0, `kpis: ${J(j.kpis)}`);
  });

  add("pe agent (perOwner): cifrele fiecăruia", async (s) => {
    const p = (await R(s)).perOwner;
    const a = p.find((x) => x.ownerKey === s.A);
    const b = p.find((x) => x.ownerKey === s.B);
    expect(a?.leadsAllocated === 3 && a.contractsSigned === 1 && a.salesValueCents === 100000, `A: ${J(a)}`);
    expect(b?.leadsAllocated === 2 && b.contractsSigned === 1 && b.salesValueCents === 250000 && b.ownerName === "Bogdan Agent", `B: ${J(b)}`);
  });

  add("clasamentul: câștigate + deschise pe fiecare agent", async (s) => {
    const lb = (await R(s)).leaderboard;
    const a = lb.find((x) => x.ownerKey === s.A);
    const b = lb.find((x) => x.ownerKey === s.B);
    expect(a?.wonCount === 1 && a.lostCount === 1 && a.openCount === 1 && a.openValueCents === 20000, `A: ${J(a)}`);
    expect(b?.wonCount === 1 && b.lostCount === 0 && b.openCount === 1 && b.openValueCents === 30000, `B: ${J(b)}`);
  });

  add("insight: cel mai bun vânzător e B, cu 71% din vânzări", async (s) => {
    const top = (await R(s)).insights.find((i) => i.kind === "topSeller");
    expect(top?.ownerKey === s.B && top.wonValueCents === 250000 && top.sharePct === 71 && top.sellers === 2, `topSeller: ${J(top)}`);
  });

  add("conversia etapă-cu-etapă din tranzițiile reale", async (s) => {
    const c = (await R(s)).conversion;
    const at = (from) => c.find((x) => x.fromKey === from);
    expect(at("contacted")?.reached === 3 && at("contacted").advanced === 1 && at("contacted").conversionPct === 33, `contacted: ${J(at("contacted"))}`);
    expect(at("trial")?.reached === 1 && at("trial").conversionPct === 100, `trial: ${J(at("trial"))}`);
    expect(at("oferta_trimisa")?.toKey === "paid" && at("oferta_trimisa").advanced === 1, `oferta: ${J(at("oferta_trimisa"))}`);
    expect(!c.some((x) => x.fromKey === "lost" || x.toKey === "lost"), "etapa pierdută a intrat în lanțul de conversie");
  });

  add("ciclul mediu de vânzare e sub o zi (câștigate azi)", async (s) => {
    const d = (await R(s)).cycleDays;
    expect(typeof d === "number" && d >= 0 && d < 1, `cycleDays=${d}`);
  });

  add("pe produs: Engleză B2 2/2 câștigate, Programare 0/2 cu 1 pierdut", async (s) => {
    const p = (await R(s)).perProduct;
    const en = p.find((x) => x.product === "Engleză B2");
    const pr = p.find((x) => x.product === "Programare");
    const none = p.find((x) => x.product === "Fără produs");
    expect(en?.total === 2 && en.won === 2 && en.valueCents === 350000 && en.winRatePct === 100, `Engleză: ${J(en)}`);
    expect(pr?.total === 2 && pr.won === 0 && pr.lost === 1 && pr.winRatePct === 0, `Programare: ${J(pr)}`);
    expect(none?.total === 1, `Fără produs: ${J(none)}`);
  });

  add("motivele de pierdere: „Preț prea mare” 1 × 500, 100%", async (s) => {
    same((await R(s)).lostReasons, [{ reason: "Preț prea mare", count: 1, valueCents: 50000, pct: 100 }], "lostReasons");
  });

  add("pe sursă: referral 100%, facebook_ad 50%, manual/instagram deschise", async (s) => {
    const src = (await R(s)).sources;
    const by = Object.fromEntries(src.map((x) => [x.source, x]));
    expect(src[0]?.source === "referral", `ordinea (după valoare): ${J(src.map((x) => x.source))}`);
    expect(by.referral?.won === 1 && by.referral.wonValueCents === 250000 && by.referral.winRatePct === 100, `referral: ${J(by.referral)}`);
    expect(by.facebook_ad?.leads === 2 && by.facebook_ad.won === 1 && by.facebook_ad.lost === 1 && by.facebook_ad.winRatePct === 50, `facebook: ${J(by.facebook_ad)}`);
    expect(by.manual?.open === 1 && by.manual.winRatePct === null && by.instagram?.open === 1, `deschise: ${J(by.manual)} ${J(by.instagram)}`);
  });

  add("dimensiunea „Agent” are câte un rând pe agent", async (s) => {
    const dim = (await R(s)).dimensions.find((d) => d.key === "owner");
    const b = dim?.rows.find((r) => r.value === s.B);
    const a = dim?.rows.find((r) => r.value === s.A);
    expect(a?.leads === 3 && a.won === 1 && b?.leads === 2 && b.won === 1 && b.wonValueCents === 250000, `rânduri: ${J(dim?.rows)}`);
  });

  add("evoluția: suma pe zile = 5 leaduri, 1 ofertă, 2 contracte, 3.500, 1 pierdere", async (s) => {
    const j = await R(s);
    expect(j.bucketSize === "day", `bucketSize=${j.bucketSize}`);
    const sum = (k) => j.timeline.reduce((n, b) => n + (b[k] ?? 0), 0);
    same([sum("leadsCreated"), sum("offersSent"), sum("contractsSigned"), sum("salesValueCents"), sum("lostCount")], [5, 1, 2, 350000, 1], "totalurile evoluției");
  });

  add("perioada anterioară (14 zile înainte) e goală", async (s) => {
    const p = (await R(s)).previous;
    expect(p?.range?.to === FROM && p.outcomes.wonCount === 0 && p.kpis.leadsAllocated === 0, `previous: ${J(p?.range)} ${J(p?.outcomes)}`);
  });

  add("pâlnia vizuală: 5 leaduri, câte sunt ACUM pe fiecare etapă", async (s) => {
    const f = await funnel(s.a);
    expect(f.totalLeads === 5, `totalLeads=${f.totalLeads}`);
    same(f.stages.map((x) => `${x.key}:${x.currentCount}`), ["new:1", "contacted:1", "trial:0", "oferta_trimisa:0", "paid:2", "lost:1"], "currentCount");
  });

  add("pâlnia vizuală: banii blocați pe fiecare etapă", async (s) => {
    const f = await funnel(s.a);
    same(f.stages.map((x) => x.currentValueCents), [20000, 30000, 0, 0, 350000, 50000], "currentValueCents");
  });

  add("pâlnia vizuală: ponderat cu probabilitatea leadului, altfel a etapei", async (s) => {
    const f = await funnel(s.a);
    expect(row(f.stages, "new").weightedValueCents === 8000, `new (40% proprii): ${row(f.stages, "new").weightedValueCents}`);
    expect(row(f.stages, "contacted").weightedValueCents === 7500, `contacted (25% etapă): ${row(f.stages, "contacted").weightedValueCents}`);
    expect(row(f.stages, "paid").weightedValueCents === 350000 && row(f.stages, "lost").weightedValueCents === 0, "paid/lost ponderat greșit");
  });

  add("pâlnia vizuală: au ajuns 5/4/2/2/2, cădere 20% la Lead nou și 50% la Contactat", async (s) => {
    const f = await funnel(s.a);
    same(f.stages.filter((x) => !x.isLost).map((x) => x.reached), [5, 4, 2, 2, 2], "reached");
    expect(row(f.stages, "new").dropRatePct === 20 && row(f.stages, "contacted").dropRatePct === 50, `cădere: ${row(f.stages, "new").dropRatePct}/${row(f.stages, "contacted").dropRatePct}`);
    expect(row(f.stages, "contacted").conversionPct === 50 && row(f.stages, "trial").dropped === 0, "conversia de la Contactat greșită");
  });

  add("pâlnia vizuală: câștigatul nu are cădere, pierdutul e la coadă cu 100%", async (s) => {
    const f = await funnel(s.a);
    const paid = row(f.stages, "paid");
    const lost = f.stages[f.stages.length - 1];
    expect(paid.dropRatePct === 0 && paid.advanced === paid.reached, `paid: ${J(paid)}`);
    expect(lost.key === "lost" && lost.isLost && lost.dropRatePct === 100 && lost.currentCount === 1, `lost: ${J(lost)}`);
  });

  add("pâlnia pe agenți: A are L1+L3+L5, B are L2+L4", async (s) => {
    const f = await funnel(s.a);
    const a = f.byOwner.find((o) => o.userId === s.A);
    const b = f.byOwner.find((o) => o.userId === s.B);
    const cnt = (o) => o.stages.reduce((n, x) => n + x.currentCount, 0);
    expect(a && b && cnt(a) === 3 && cnt(b) === 2, `byOwner: A=${a && cnt(a)} B=${b && cnt(b)}`);
    expect(row(b.stages, "paid").currentValueCents === 250000 && b.name === "Bogdan Agent", `B: ${J(row(b.stages, "paid"))}`);
  });

  add("pâlnia filtrată pe B: 2 leaduri, doar ale lui", async (s) => {
    const f = await funnel(s.a, { owner: s.B });
    expect(f.totalLeads === 2 && row(f.stages, "contacted").currentCount === 1 && row(f.stages, "paid").currentCount === 1, `B: ${f.totalLeads}`);
  });

  add("pâlnia pe 2020: 0 leaduri", async (s) => {
    expect((await funnel(s.a, { from: "2020-01-01T00:00:00Z", to: "2021-01-01T00:00:00Z" })).totalLeads === 0, "leaduri din afara perioadei");
  });

  add("pâlnia de mâine încolo: 0 leaduri", async (s) => {
    expect((await funnel(s.a, { from: TOMORROW })).totalLeads === 0, "leaduri din viitor");
  });

  add("pâlnia de ieri încolo (fără sfârșit): toate 5", async (s) => {
    expect((await funnel(s.a, { from: YESTERDAY })).totalLeads === 5, "perioada deschisă a pierdut leaduri");
  });

  add("pâlnia până ieri (sfârșit exclusiv): 0 leaduri", async (s) => {
    expect((await funnel(s.a, { to: YESTERDAY })).totalLeads === 0, "leaduri de azi intrate înainte de ieri");
  });

  add("raportul pe 2020: zero leaduri, contracte, vânzări, apeluri", async (s) => {
    const j = await report(s.a, { from: "2020-01-01T00:00:00Z", to: "2021-01-01T00:00:00Z" });
    expect(j.kpis.leadsAllocated === 0 && j.kpis.contractsSigned === 0 && j.kpis.salesValueCents === 0 && j.kpis.callsMade === 0, `kpis: ${J(j.kpis)}`);
    expect(j.outcomes.newLeads === 0 && j.lostReasons.length === 0 && j.perProduct.length === 0, "secțiunile nu respectă perioada");
    expect(j.bucketSize === "week", `bucketSize pe un an: ${j.bucketSize}`);
  });

  add("raportul fără perioadă (tot timpul): cifrele sunt acolo, luna ca găleată", async (s) => {
    const j = await report(s.a, {});
    expect(j.kpis.contractsSigned === 2 && j.outcomes.newLeads === 5 && j.bucketSize === "month" && j.previous === null, `kpis=${J(j.kpis)} bucket=${j.bucketSize}`);
  });

  add("revenirea din câștigat și re-câștigarea nu dublează contractul", async (s) => {
    await move(s.a, s.L[1], "trial");
    await move(s.a, s.L[1], "paid");
    const j = await R(s);
    expect(j.kpis.contractsSigned === 2 && j.kpis.salesValueCents === 350000 && j.outcomes.wonCount === 2, `kpis: ${J(j.kpis)}`);
  });

  add("un lead nou intră în cifre la recitire", async (s) => {
    s.L6 = (await mkLead(s.a, { assignedTo: s.B, valueCents: 7000 })).id;
    const j = await R(s);
    expect(j.outcomes.newLeads === 6 && (await funnel(s.a)).totalLeads === 6, `newLeads=${j.outcomes.newLeads}`);
  });

  add("alt client nu vede nimic din cifrele noastre", async (s) => {
    const other = await signupTenant(`intrus-rapoarte-${RUN}`);
    const j = await report(other, { from: FROM, to: TO });
    expect(j.outcomes.newLeads === 0 && j.kpis.contractsSigned === 0, `intrusul vede cifre: ${J(j.outcomes)}`);
    expect(!j.owners.some((o) => o.id === s.A || o.id === s.B), "intrusul vede agenții noștri");
    const f = await funnel(other, { owner: s.B });
    expect(f.totalLeads === 0, "intrusul vede pâlnia agentului nostru");
  });

  add("un „stage_change” scris de mână în istoric nu umflă contractele", async (s) => {
    const before = (await R(s)).kpis.contractsSigned;
    const r = await api(s.a, "POST", `/api/crm/leads/${s.L[4]}/interactions`, { type: "stage_change", body: "fals", metadata: { from: "new", to: "paid" } });
    expectNo5xx(r);
    const after = (await R(s)).kpis.contractsSigned;
    const lead = await getLead(s.a, s.L[4]);
    expect(after === before, `un rând de istoric falsificat a transformat L5 (încă „${lead.stage}”) în contract semnat: ${before} → ${after} (POST interactions a răspuns ${r.status})`);
  });

  add("agentul (fără reports.view_team) nu vede cifrele colegilor", async (s) => {
    const r = await api(s.b, "GET", `/api/crm/reports${qs({ from: FROM, to: TO })}`);
    expectNo5xx(r);
    if (r.status === 403) return;
    expectOk(r);
    const others = [...(r.json.perOwner ?? []), ...(r.json.leaderboard ?? [])].filter((x) => x.ownerKey !== s.B);
    expect(others.length === 0, `agentul B vede cifrele lui A: ${J(others.map((x) => ({ owner: x.ownerKey, won: x.wonValueCents ?? x.salesValueCents })))}`);
  });

  add("pâlnia unui lead pierdut direct din prima etapă îl numără la prima etapă", async (s) => {
    const p = expectStatus(await api(s.a, "POST", "/api/crm/pipelines", { name: `Cădere ${RUN}` }), 201).json;
    const l = await mkLead(s.a, { pipelineId: p.id, valueCents: 1000 });
    await move(s.a, l.id, "lost", "Nu răspunde");
    const f = await funnel(s.a, { pipelineId: p.id });
    const first = row(f.stages, "new");
    expect(first.reached === 1 && first.dropped === 1 && first.dropRatePct === 100,
      `leadul a stat în „Lead nou” și a căzut de acolo (tranziția new→lost există), dar pâlnia spune reached=${first.reached} dropped=${first.dropped}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// rapoarte:norme — normele KPI (upsert/ștergere/scalare) și aranjamentul personal
// ═════════════════════════════════════════════════════════════════════════════
function targetsGroup(suite) {
  const G = "rapoarte:norme";
  const add = (name, fn) => suite.add(G, name, (ctx) => fn(st(ctx, G), ctx));
  const put = (s, body, who = s.a) => api(who, "PUT", "/api/crm/kpi-targets", body);
  const list = async (s, who = s.a) => expectOk(await api(who, "GET", "/api/crm/kpi-targets")).items;

  add("workspace nou + agent; fără norme lista e goală", async (s) => {
    s.a = await signupTenant(`norme-${RUN}`);
    s.b = await join(s.a, "teacher", "Bianca Agent");
    s.intruder = await signupTenant(`intrus-norme-${RUN}`);
    expect((await list(s)).length === 0, "norme din senin");
  });

  add("normă generală: 60 apeluri/săptămână → 201", async (s) => {
    const r = expectStatus(await put(s, { metric: "callsMade", period: "week", target: 60 }), 201);
    expect(r.json.userId === null && r.json.target === 60 && r.json.period === "week", J(r.json));
    s.gen = r.json.id;
  });

  add("aceeași normă din nou se actualizează (200, același id)", async (s) => {
    const r = expectStatus(await put(s, { metric: "callsMade", period: "week", target: 80 }), 200);
    expect(r.json.id === s.gen && r.json.target === 80, J(r.json));
    const items = await list(s);
    expect(items.length === 1 && items[0].target === 80, `lista: ${J(items)}`);
  });

  add("perioada lipsă înseamnă „week” (actualizează aceeași normă)", async (s) => {
    const r = expectStatus(await put(s, { metric: "callsMade", target: 70 }), 200);
    expect(r.json.id === s.gen && r.json.period === "week", J(r.json));
  });

  add("norma lunară e separată de cea săptămânală", async (s) => {
    const r = expectStatus(await put(s, { metric: "callsMade", period: "month", target: 250 }), 201);
    expect(r.json.id !== s.gen, "a suprascris norma săptămânală");
    expect((await list(s)).filter((x) => x.metric === "callsMade").length === 2, "nu sunt două norme");
    s.month = r.json.id;
  });

  add("normă personală pentru agent → 201 cu userId", async (s) => {
    const r = expectStatus(await put(s, { userId: s.b.user.id, metric: "callsMade", period: "week", target: 14 }), 201);
    expect(r.json.userId === s.b.user.id, J(r.json));
    s.pers = r.json.id;
  });

  add("normă pentru un om inexistent → 400 unknown_member", async (s) => {
    const r = expectStatus(await put(s, { userId: RANDOM_UUID, metric: "meetings", target: 5 }), 400);
    expect(r.json?.error === "unknown_member", r.text);
  });

  add("normă pentru un om din alt workspace → 400, nimic salvat", async (s) => {
    expectStatus(await put(s, { userId: s.intruder.user.id, metric: "meetings", target: 5 }), 400);
    expect(!(await list(s)).some((x) => x.metric === "meetings"), "norma s-a salvat");
  });

  add("indicator în afara listei (leadsAllocated) → 400", async (s) => {
    expectStatus(await put(s, { metric: "leadsAllocated", target: 5 }), 400);
  });

  add("perioadă „year” / țintă negativă / țintă fracționară → 400", async (s) => {
    expectStatus(await put(s, { metric: "meetings", period: "year", target: 5 }), 400);
    expectStatus(await put(s, { metric: "meetings", target: -1 }), 400);
    expectStatus(await put(s, { metric: "meetings", target: 2.5 }), 400);
  });

  add("țintă 0 șterge norma", async (s) => {
    const r = expectStatus(await put(s, { metric: "callsMade", period: "month", target: 0 }), 200);
    expect(r.json?.removed === true, r.text);
    expect(!(await list(s)).some((x) => x.id === s.month), "norma lunară e încă acolo");
  });

  add("țintă 0 pe o normă inexistentă nu strică nimic", async (s) => {
    const before = (await list(s)).length;
    expectStatus(await put(s, { metric: "tasksDone", target: 0 }), 200);
    expect((await list(s)).length === before, "lista s-a schimbat");
  });

  add("DELETE /:id scoate norma; a doua oară → 404", async (s) => {
    const r = expectStatus(await put(s, { metric: "meetings", target: 3 }), 201);
    expectStatus(await api(s.a, "DELETE", `/api/crm/kpi-targets/${r.json.id}`), 200);
    expect(!(await list(s)).some((x) => x.id === r.json.id), "norma e încă listată");
    expectStatus(await api(s.a, "DELETE", `/api/crm/kpi-targets/${r.json.id}`), 404);
    s.deletedTarget = r.json.id;
  });

  add("agentul își citește normele (200)", async (s) => {
    const items = await list(s, s.b);
    expect(items.some((x) => x.id === s.pers), "agentul nu-și vede norma");
  });

  add("agentul nu poate pune sau șterge norme (403)", async (s) => {
    expectStatus(await put(s, { metric: "callsMade", target: 1 }, s.b), 403);
    expectStatus(await api(s.b, "DELETE", `/api/crm/kpi-targets/${s.gen}`), 403);
    expect((await list(s)).find((x) => x.id === s.gen)?.target === 70, "norma s-a schimbat");
  });

  add("alt client nu vede și nu șterge normele noastre", async (s) => {
    expect(!(await list(s, s.intruder)).some((x) => x.id === s.gen), "intrusul vede normele");
    expectStatus(await api(s.intruder, "DELETE", `/api/crm/kpi-targets/${s.gen}`), 404);
    expect((await list(s)).some((x) => x.id === s.gen), "norma a dispărut");
  });

  add("realizarea: 1 apel față de 7/săpt. pe 14 zile = 14 → 7%", async (s) => {
    expectStatus(await put(s, { metric: "callsMade", period: "week", target: 7 }), 200);
    s.lead = (await mkLead(s.a, { assignedTo: s.b.user.id, valueCents: 5000 })).id;
    expectStatus(await api(s.a, "POST", `/api/crm/leads/${s.lead}/interactions`, { type: "call", metadata: { outcome: "answered" } }), 201);
    const a = (await report(s.a, { from: FROM, to: TO })).attainment;
    same(a.callsMade, { target: 14, achieved: 1, pct: 7 }, "attainment.callsMade");
  });

  add("norma lunară se scalează: 30 contracte/lună pe 14 zile = 14", async (s) => {
    expectStatus(await put(s, { metric: "contractsSigned", period: "month", target: 30 }), 201);
    await move(s.a, s.lead, "paid");
    same((await report(s.a, { from: FROM, to: TO })).attainment.contractsSigned, { target: 14, achieved: 1, pct: 7 }, "attainment.contractsSigned");
  });

  add("norma personală bate norma generală când filtrezi pe agent", async (s) => {
    const a = (await report(s.a, { from: FROM, to: TO, owner: s.b.user.id })).attainment;
    same(a.callsMade, { target: 28, achieved: 1, pct: 4 }, "attainment.callsMade pe agent (14/săpt. × 2)");
  });

  add("fără perioadă, gradul de realizare lipsește (nu 0%)", async (s) => {
    const j = await report(s.a, {});
    same(j.attainment, {}, "attainment pe tot timpul");
    expect(j.targets.length >= 2, "normele nu se întorc în raport");
  });

  add("indicator fără normă nu apare la realizare", async (s) => {
    const a = (await report(s.a, { from: FROM, to: TO })).attainment;
    expect(!("meetings" in a) && !("tasksDone" in a), `chei: ${Object.keys(a)}`);
  });

  add("jurnalul: norma creată, actualizată, scoasă", async (s) => {
    const items = await auditOf(s.a, { targetType: "crm_kpi_target" });
    expect(auditEntry(items, "kpi_target.created", s.gen)?.newValue?.target === 60, "crearea lipsește");
    expect(items.some((i) => i.actionType === "crm.kpi_target.updated" && i.targetId === s.gen && i.oldValue?.target === 60 && i.newValue?.target === 80), "actualizarea 60→80 lipsește");
    expect(auditEntry(items, "kpi_target.removed", s.month)?.oldValue?.target === 250, "ștergerea prin țintă 0 lipsește");
    expect(auditEntry(items, "kpi_target.removed", s.deletedTarget), "ștergerea prin DELETE lipsește");
  });

  // ── Aranjamentul personal al rapoartelor ──
  const LAYOUT = { order: ["funnel", "kpis", "sources"], hidden: ["aging"], hiddenMetrics: ["tasksDone"], segmentDimension: "source" };

  add("fără aranjament salvat → layout null", async (s) => {
    same(expectOk(await api(s.a, "GET", "/api/crm/reports/layout")), { layout: null }, "layout inițial");
  });

  add("aranjamentul se salvează și se recitește identic", async (s) => {
    const r = expectStatus(await api(s.a, "PUT", "/api/crm/reports/layout", LAYOUT), 200);
    expect(r.json.saved === true, r.text);
    same(expectOk(await api(s.a, "GET", "/api/crm/reports/layout")).layout, LAYOUT, "layout recitit");
  });

  add("al doilea PUT îl înlocuiește complet", async (s) => {
    const next = { order: ["kpis"], segmentDimension: null };
    expectStatus(await api(s.a, "PUT", "/api/crm/reports/layout", next), 200);
    same(expectOk(await api(s.a, "GET", "/api/crm/reports/layout")).layout, next, "layout după înlocuire");
  });

  add("aranjamentul e personal: agentul are încă null", async (s) => {
    same(expectOk(await api(s.b, "GET", "/api/crm/reports/layout")).layout, null, "layout agent");
  });

  add("aranjamentul agentului nu îl atinge pe al adminului", async (s) => {
    expectStatus(await api(s.b, "PUT", "/api/crm/reports/layout", { order: ["sources"] }), 200);
    same(expectOk(await api(s.b, "GET", "/api/crm/reports/layout")).layout, { order: ["sources"] }, "layout agent");
    same(expectOk(await api(s.a, "GET", "/api/crm/reports/layout")).layout, { order: ["kpis"], segmentDimension: null }, "layout admin");
  });

  add("aranjament invalid (cheie goală, 41 de secțiuni, tip greșit) → 400", async (s) => {
    expectStatus(await api(s.a, "PUT", "/api/crm/reports/layout", { order: [""] }), 400);
    expectStatus(await api(s.a, "PUT", "/api/crm/reports/layout", { order: Array.from({ length: 41 }, (_, i) => `s${i}`) }), 400);
    expectStatus(await api(s.a, "PUT", "/api/crm/reports/layout", { hidden: "kpis" }), 400);
    same(expectOk(await api(s.a, "GET", "/api/crm/reports/layout")).layout, { order: ["kpis"], segmentDimension: null }, "layout după respingeri");
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// echipa:invitații — invită, în așteptare, anulează, acceptă, re-invită
// ═════════════════════════════════════════════════════════════════════════════
function invitesGroup(suite) {
  const G = "echipa:invitații";
  const add = (name, fn) => suite.add(G, name, (ctx) => fn(st(ctx, G), ctx));

  add("echipa unui workspace nou: doar adminul, fără invitații", async (s) => {
    s.a = await signupTenant(`invitatii-${RUN}`);
    s.intruder = await signupTenant(`intrus-invitatii-${RUN}`);
    const t = await team(s.a);
    expect(t.canManage === true && t.invites.length === 0, J(t));
    same(t.roles.map((r) => r.key), ["receptionist", "teacher", "manager", "admin"], "rolurile");
    same(t.roles.map((r) => r.label), ["Operator", "Agent vânzări", "Manager vânzări", "Administrator"], "etichetele");
    expect(t.members.length === 1 && t.members[0].isSelf && t.members[0].role === "admin" && t.members[0].crmAccess, J(t.members));
  });

  add("invitația de agent → 201 cu link, rol și expirare peste ~7 zile", async (s) => {
    s.inv1 = await invite(s.a, "teacher");
    const days = (new Date(s.inv1.expiresAt).getTime() - Date.now()) / DAY;
    expect(s.inv1.role === "teacher" && days > 6 && days <= 7.01, `expiră în ${days.toFixed(2)} zile`);
    expect(s.inv1.emailed === false, "emailul a plecat spre un domeniu .invalid");
  });

  add("invitația apare în așteptare în lista echipei", async (s) => {
    const inv = (await team(s.a)).invites.find((i) => i.id === s.inv1.id);
    expect(inv?.email === s.inv1.email && inv.role === "teacher", J(inv));
  });

  add("email invalid / rol „student” / rol lipsă → 400", async (s) => {
    expectStatus(await api(s.a, "POST", "/api/crm/team/invites", { email: "nu-e-email", role: "teacher" }), 400);
    expectStatus(await api(s.a, "POST", "/api/crm/team/invites", { email: `${uid("x")}@example.invalid`, role: "student" }), 400);
    expectStatus(await api(s.a, "POST", "/api/crm/team/invites", { email: `${uid("x")}@example.invalid` }), 400);
  });

  add("emailul cu majuscule se salvează cu litere mici", async (s) => {
    const raw = `Ana.POP.${RUN}@Example.Invalid`;
    const r = expectStatus(await api(s.a, "POST", "/api/crm/team/invites", { email: raw, role: "receptionist" }), 201);
    expect(r.json.email === raw.toLowerCase(), `salvat: ${r.json.email}`);
    s.upper = { id: r.json.id, email: raw.toLowerCase(), token: tokenOf(r.json.inviteUrl) };
  });

  add("re-invitația înlocuiește invitația veche (una singură, rol nou)", async (s) => {
    const r = expectStatus(await api(s.a, "POST", "/api/crm/team/invites", { email: s.upper.email, role: "manager" }), 201);
    const mine = (await team(s.a)).invites.filter((i) => i.email === s.upper.email);
    expect(mine.length === 1 && mine[0].role === "manager" && mine[0].id === r.json.id, J(mine));
    s.upper.newId = r.json.id;
    s.upper.newToken = tokenOf(r.json.inviteUrl);
  });

  add("linkul vechi nu mai merge după re-invitație (404)", async (s) => {
    const { r } = await accept(s.upper.token, "Ana Pop");
    expectStatus(r, 404);
  });

  add("anularea invitației o scoate din listă", async (s) => {
    expectStatus(await api(s.a, "DELETE", `/api/crm/team/invites/${s.upper.newId}`), 200);
    expect(!(await team(s.a)).invites.some((i) => i.id === s.upper.newId), "invitația e încă în așteptare");
  });

  add("anularea de două ori → 404; linkul anulat nu mai merge", async (s) => {
    expectStatus(await api(s.a, "DELETE", `/api/crm/team/invites/${s.upper.newId}`), 404);
    expectStatus((await accept(s.upper.newToken, "Ana Pop")).r, 404);
  });

  add("id invalid la anulare → 4xx, nu 500", async (s) => {
    expectClientError(await api(s.a, "DELETE", "/api/crm/team/invites/abc"));
  });

  add("token inexistent → 404", async () => {
    expectStatus((await accept("token-inventat-" + RUN, "Nimeni")).r, 404);
  });

  add("parolă scurtă la acceptare → 400, invitația rămâne valabilă", async (s) => {
    const { r } = await accept(s.inv1.token, "Tudor Agent", "scurt");
    expectStatus(r, 400);
    expect((await team(s.a)).invites.some((i) => i.id === s.inv1.id), "invitația s-a consumat");
  });

  add("acceptarea creează contul cu rolul ales și duce în CRM", async (s) => {
    const { s: b, r } = await accept(s.inv1.token, "Tudor Agent");
    expectStatus(r, 200);
    expect(r.json.user.role === "teacher" && r.json.redirect === "/business/crm", J(r.json));
    const p = await myPerms(b);
    expect(p.role === "teacher", `rolul în CRM: ${p.role}`);
    s.b = b;
  });

  add("același link a doua oară → 404", async (s) => {
    expectStatus((await accept(s.inv1.token, "Tudor Agent")).r, 404);
  });

  add("invitatul se loghează cu parola aleasă", async (s) => {
    const b2 = await login(s.inv1.email, PWD);
    expect(b2.user.role === "teacher" && b2.tenant.id === s.a.tenant.id, `login: ${J(b2.user)} ${J(b2.tenant)}`);
  });

  add("după acceptare: nu mai e în așteptare, apare membru activ cu CRM", async (s) => {
    const t = await team(s.a);
    const m = t.members.find((x) => x.email === s.inv1.email);
    expect(!t.invites.some((i) => i.id === s.inv1.id), "invitația e încă în așteptare");
    expect(m?.role === "teacher" && m.isActive && m.crmAccess && !m.isSelf && m.name === "Tudor Agent", J(m));
  });

  add("invitarea unui membru care are deja CRM → 409 already_member", async (s) => {
    const r = expectStatus(await api(s.a, "POST", "/api/crm/team/invites", { email: s.inv1.email, role: "manager" }), 409);
    expect(r.json?.error === "already_member", r.text);
  });

  add("invitarea propriului admin → 409", async (s) => {
    expectStatus(await api(s.a, "POST", "/api/crm/team/invites", { email: s.a.user.email, role: "teacher" }), 409);
  });

  add("agentul nu poate invita și nu poate anula (403)", async (s) => {
    expectStatus(await api(s.b, "POST", "/api/crm/team/invites", { email: `${uid("x")}@example.invalid`, role: "teacher" }), 403);
    const pending = await invite(s.a, "receptionist");
    expectStatus(await api(s.b, "DELETE", `/api/crm/team/invites/${pending.id}`), 403);
    expect((await team(s.a)).invites.some((i) => i.id === pending.id), "agentul a anulat invitația");
    s.pending = pending;
  });

  add("agentul nu vede echipa (403, fără audit.view)", async (s) => {
    expectStatus(await api(s.b, "GET", "/api/crm/team"), 403);
  });

  add("managerul vede echipa, dar nu poate invita (canManage false, 403)", async (s) => {
    s.m = await join(s.a, "manager", "Mihai Manager");
    const t = await team(s.m);
    expect(t.canManage === false && t.members.length === 3, `canManage=${t.canManage} membri=${t.members.length}`);
    expectStatus(await api(s.m, "POST", "/api/crm/team/invites", { email: `${uid("x")}@example.invalid`, role: "teacher" }), 403);
  });

  add("invitația de administrator dă rol admin și dreptul de a gestiona echipa", async (s) => {
    s.admin2 = await join(s.a, "admin", "Ada Admin");
    const t = await team(s.admin2);
    expect(s.admin2.user.role === "admin" && t.canManage === true, `rol=${s.admin2.user.role} canManage=${t.canManage}`);
  });

  add("alt client nu poate anula invitațiile noastre (404) și nu ne vede echipa", async (s) => {
    expectStatus(await api(s.intruder, "DELETE", `/api/crm/team/invites/${s.pending.id}`), 404);
    expect((await team(s.a)).invites.some((i) => i.id === s.pending.id), "invitația a dispărut");
    const t = await team(s.intruder);
    expect(t.members.length === 1 && t.invites.every((i) => i.id !== s.pending.id), "intrusul vede echipa noastră");
  });

  add("acceptarea pe un cont existent cu parolă greșită → 401, invitația rămâne", async (s) => {
    // Managerul scos din CRM se poate re-invita; contul există deja, deci cere parola lui.
    expectStatus(await api(s.a, "PUT", `/api/crm/team/members/${s.m.user.id}/access`, { crmAccess: false }), 200);
    s.reinv = await invite(s.a, "receptionist", s.m.email);
    const { r } = await accept(s.reinv.token, "Mihai Manager", "parola-gresita-123");
    expectStatus(r, 401);
    expect(r.json?.error === "wrong_password", r.text);
  });

  add("re-invitat ca operator, managerul rămâne manager și își recapătă CRM-ul", async (s) => {
    const { s: m2, r } = await accept(s.reinv.token, "Mihai Manager");
    expectStatus(r, 200);
    const mem = (await team(s.a)).members.find((x) => x.id === s.m.user.id);
    expect(mem?.role === "manager" && mem.crmAccess === true, `după re-invitație: ${J(mem)}`);
    expectStatus(await api(m2, "GET", "/api/crm/leads"), 200);
  });

  add("jurnalul: invitația trimisă și cea anulată, cu autorul", async (s) => {
    const items = await auditOf(s.a, { targetType: "crm_invite" });
    const inv = auditEntry(items, "team.invited", s.inv1.id);
    const rev = auditEntry(items, "team.invite_revoked", s.upper.newId);
    expect(inv?.newValue?.email === s.inv1.email && inv.newValue.role === "teacher" && inv.actorId === s.a.user.id, `invitat: ${J(inv)}`);
    expect(rev?.oldValue?.email === s.upper.email && rev.actorId === s.a.user.id, `anulat: ${J(rev)}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// echipa:roluri — matricea de drepturi, schimbarea rolului, excepțiile pe om
// ═════════════════════════════════════════════════════════════════════════════
function rolesGroup(suite) {
  const G = "echipa:roluri";
  const add = (name, fn) => suite.add(G, name, (ctx) => fn(st(ctx, G), ctx));
  const setRole = (s, role, who = s.a, id = s.b.user.id) => api(who, "PATCH", `/api/crm/team/members/${id}`, { role });
  const setPerm = (s, permission, granted, who = s.a) => api(who, "PUT", "/api/crm/permissions/team", { userId: s.b.user.id, permission, granted });
  const newStage = (who) => api(who, "POST", "/api/crm/stages", { label: `Etapă ${uid()}` });

  add("workspace nou + agent (teacher) adus prin invitație", async (s) => {
    s.a = await signupTenant(`roluri-${RUN}`);
    s.b = await join(s.a, "teacher", "Radu Agent");
    s.intruder = await signupTenant(`intrus-roluri-${RUN}`);
  });

  add("adminul are exact cele 15 drepturi CRM", async (s) => {
    const p = await myPerms(s.a);
    same(sorted(p.permissions), sorted(ADMIN_ALL), "drepturile adminului");
    same(sorted(p.fromRole), sorted(ADMIN_ALL), "fromRole");
  });

  add("agentul (teacher) are exact cele 6 drepturi comerciale", async (s) => {
    const p = await myPerms(s.b);
    expect(p.role === "teacher", p.role);
    same(sorted(p.permissions), sorted(BASE), "drepturile agentului");
  });

  add("agentul nu poate crea etape și nu vede jurnalul (403)", async (s) => {
    const r = expectStatus(await newStage(s.b), 403);
    expect(r.json?.permission === "pipelines.manage", r.text);
    expectStatus(await api(s.b, "GET", "/api/crm/audit"), 403);
    expectStatus(await api(s.b, "PUT", "/api/crm/kpi-targets", { metric: "meetings", target: 1 }), 403);
  });

  add("matricea din /permissions/team este cea documentată", async (s) => {
    const j = expectOk(await api(s.a, "GET", "/api/crm/permissions/team"));
    same(sorted(j.roleMatrix.admin), sorted(ADMIN_ALL), "admin");
    same(sorted(j.roleMatrix.manager), sorted(MANAGER), "manager");
    same(sorted(j.roleMatrix.teacher), sorted(BASE), "teacher");
    same(sorted(j.roleMatrix.receptionist), sorted(BASE), "receptionist");
    same([j.roleMatrix.student, j.roleMatrix.parent], [[], []], "student/parent");
  });

  add("/permissions/team: ambii membri, cu drepturile efective", async (s) => {
    const j = expectOk(await api(s.a, "GET", "/api/crm/permissions/team"));
    const b = j.members.find((m) => m.id === s.b.user.id);
    expect(j.members.length === 2 && b?.role === "teacher" && b.overrides.length === 0, J(j.members));
    same(sorted(b.effective), sorted(BASE), "efectiv agent");
  });

  add("rol → manager: drepturile se schimbă pe loc", async (s) => {
    expectStatus(await setRole(s, "manager"), 200);
    const p = await myPerms(s.b);
    expect(p.role === "manager", p.role);
    same(sorted(p.permissions), sorted(MANAGER), "drepturile managerului");
  });

  add("managerul poate acum crea etape și vede jurnalul", async (s) => {
    expectStatus(await newStage(s.b), 201);
    expectStatus(await api(s.b, "GET", "/api/crm/audit"), 200);
  });

  add("managerul nu poate da drepturi (403, doar adminul)", async (s) => {
    expectStatus(await setPerm(s, "leads.delete", true, s.b), 403);
  });

  add("rol → operator: 6 drepturi, jurnalul 403", async (s) => {
    expectStatus(await setRole(s, "receptionist"), 200);
    const p = await myPerms(s.b);
    expect(p.role === "receptionist", p.role);
    same(sorted(p.permissions), sorted(BASE), "drepturile operatorului");
    expectStatus(await api(s.b, "GET", "/api/crm/audit"), 403);
  });

  add("rol → admin: toate cele 15; înapoi la agent: 6", async (s) => {
    expectStatus(await setRole(s, "admin"), 200);
    same(sorted((await myPerms(s.b)).permissions), sorted(ADMIN_ALL), "admin");
    expectStatus(await setRole(s, "teacher"), 200);
    same(sorted((await myPerms(s.b)).permissions), sorted(BASE), "înapoi la agent");
  });

  add("același rol din nou → 200, fără intrare nouă în jurnal", async (s) => {
    const before = (await auditOf(s.a, { targetId: s.b.user.id })).length;
    expectStatus(await setRole(s, "teacher"), 200);
    expect((await auditOf(s.a, { targetId: s.b.user.id })).length === before, "o schimbare fără efect a ajuns în jurnal");
  });

  add("rol invalid („owner”, „student”) → 400, rolul rămâne", async (s) => {
    expectStatus(await setRole(s, "owner"), 400);
    expectStatus(await setRole(s, "student"), 400);
    expect((await myPerms(s.b)).role === "teacher", "rolul s-a schimbat");
  });

  add("propriul rol nu se poate schimba (409 cannot_change_self)", async (s) => {
    const r = expectStatus(await setRole(s, "teacher", s.a, s.a.user.id), 409);
    expect(r.json?.error === "cannot_change_self", r.text);
    expect((await myPerms(s.a)).role === "admin", "adminul s-a retrogradat");
  });

  add("membru inexistent / din alt workspace → 404; id invalid → 4xx", async (s) => {
    expectStatus(await setRole(s, "manager", s.a, RANDOM_UUID), 404);
    expectStatus(await setRole(s, "manager", s.a, s.intruder.user.id), 404);
    expectClientError(await setRole(s, "manager", s.a, "abc"));
    expect((await myPerms(s.intruder)).role === "admin", "rolul intrusului s-a schimbat");
  });

  add("agentul nu poate schimba roluri (403)", async (s) => {
    expectStatus(await setRole(s, "admin", s.b, s.b.user.id), 403);
    expectStatus(await setRole(s, "teacher", s.b, s.a.user.id), 403);
    expect((await myPerms(s.a)).role === "admin", "adminul a fost retrogradat de agent");
  });

  add("excepție acordată: pipelines.manage → agentul poate crea etape", async (s) => {
    expectStatus(await setPerm(s, "pipelines.manage", true), 200);
    const p = await myPerms(s.b);
    expect(p.permissions.includes("pipelines.manage") && !p.fromRole.includes("pipelines.manage"), J(p));
    expectStatus(await newStage(s.b), 201);
  });

  add("excepția apare la membru în /permissions/team", async (s) => {
    const b = expectOk(await api(s.a, "GET", "/api/crm/permissions/team")).members.find((m) => m.id === s.b.user.id);
    same(b.overrides, [{ permission: "pipelines.manage", granted: true }], "overrides");
    expect(b.effective.includes("pipelines.manage"), "efectiv fără excepție");
  });

  add("excepție retrasă: fără documents.create", async (s) => {
    expectStatus(await setPerm(s, "documents.create", false), 200);
    const p = await myPerms(s.b);
    expect(!p.permissions.includes("documents.create") && p.fromRole.includes("documents.create"), J(p.permissions));
  });

  add("excepția ștearsă (null) → revine la rol, etapele iar 403", async (s) => {
    expectStatus(await setPerm(s, "pipelines.manage", null), 200);
    expectStatus(await setPerm(s, "documents.create", null), 200);
    same(sorted((await myPerms(s.b)).permissions), sorted(BASE), "după ștergerea excepțiilor");
    expectStatus(await newStage(s.b), 403);
  });

  add("agentul nu își poate da singur drepturi (403)", async (s) => {
    expectStatus(await setPerm(s, "audit.view", true, s.b), 403);
    expect(!(await myPerms(s.b)).permissions.includes("audit.view"), "și-a dat singur jurnalul");
  });

  add("drepturi pentru un om din alt workspace → 404", async (s) => {
    const r = await api(s.a, "PUT", "/api/crm/permissions/team", { userId: s.intruder.user.id, permission: "audit.view", granted: false });
    expectStatus(r, 404);
    expectStatus(await api(s.intruder, "GET", "/api/crm/audit"), 200);
  });

  add("schimbarea de rol apare în jurnal cu vechiul și noul rol", async (s) => {
    const items = await auditOf(s.a, { targetId: s.b.user.id });
    const e = items.find((i) => i.actionType === "crm.team.role_changed" && i.newValue?.role === "manager");
    expect(e?.oldValue?.role === "teacher" && e.targetType === "crm_user" && e.actorId === s.a.user.id, `intrare: ${J(e)}`);
  });

  add("schimbarea de drept apare în jurnal ca permission.changed pe utilizator", async (s) => {
    const items = await auditOf(s.a, { targetId: s.b.user.id });
    const e = items.find((i) => i.actionType === "crm.permission.changed" && i.newValue?.permission === "pipelines.manage" && i.newValue?.granted === true);
    expect(e, "intrarea lipsește");
    expect(e.targetType === "crm_user", `ținta e un om, dar jurnalul o trece ca „${e.targetType}” — filtrul pe targetType=crm_user n-o găsește`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// echipa:acces — scos din CRM (403 crm_access_revoked), dezactivat (sesiunea moare)
// ═════════════════════════════════════════════════════════════════════════════
function accessGroup(suite) {
  const G = "echipa:acces";
  const add = (name, fn) => suite.add(G, name, (ctx) => fn(st(ctx, G), ctx));
  const access = (s, id, crmAccess, who = s.a) => api(who, "PUT", `/api/crm/team/members/${id}/access`, { crmAccess });
  const active = (s, id, on, who = s.a) => api(who, "PUT", `/api/crm/team/members/${id}/active`, { active: on });
  const member = async (s, id) => (await team(s.a)).members.find((m) => m.id === id);

  add("workspace nou + agent cu un lead atribuit", async (s) => {
    s.a = await signupTenant(`acces-${RUN}`);
    s.b = await join(s.a, "teacher", "Bianca Scoasă");
    s.lead = (await mkLead(s.a, { assignedTo: s.b.user.id, valueCents: 4000 })).id;
    expectStatus(await api(s.b, "GET", "/api/crm/leads"), 200);
  });

  add("scos din CRM → 403 crm_access_revoked pe /api/crm/leads", async (s) => {
    expectStatus(await access(s, s.b.user.id, false), 200);
    const r = expectStatus(await api(s.b, "GET", "/api/crm/leads"), 403);
    expect(r.json?.error === "crm_access_revoked", r.text);
  });

  add("scos din CRM → blocat și la scriere, rapoarte, etape, drepturi", async (s) => {
    const calls = [
      ["GET", "/api/crm/reports"], ["GET", "/api/crm/stages"], ["GET", "/api/crm/permissions"],
      ["GET", `/api/crm/leads/${s.lead}`], ["PATCH", `/api/crm/leads/${s.lead}/stage`, { stage: "contacted" }],
      ["POST", "/api/crm/leads", { fullName: "Lead de contrabandă" }],
    ];
    for (const [m, p, b] of calls) {
      const r = await api(s.b, m, p, b);
      expect(r.status === 403 && r.json?.error === "crm_access_revoked", `${m} ${p} → ${r.status} ${r.text.slice(0, 80)}`);
    }
    expect((await getLead(s.a, s.lead)).stage === "new", "leadul s-a mutat totuși");
  });

  add("scos din CRM rămâne logat în workspace (/api/auth/me 200)", async (s) => {
    const r = expectStatus(await api(s.b, "GET", "/api/auth/me"), 200);
    expect(r.json.user.id === s.b.user.id, r.text);
  });

  add("lista echipei: crmAccess false, contul încă activ", async (s) => {
    const m = await member(s, s.b.user.id);
    expect(m?.crmAccess === false && m.isActive === true, J(m));
  });

  add("readus în CRM → lucrează din nou (200)", async (s) => {
    expectStatus(await access(s, s.b.user.id, true), 200);
    expectStatus(await api(s.b, "GET", "/api/crm/leads"), 200);
    expect((await member(s, s.b.user.id))?.crmAccess === true, "crmAccess încă false");
  });

  add("adminul nu poate fi scos din CRM (409 admin_always_has_access)", async (s) => {
    s.c = await join(s.a, "admin", "Cezar Admin");
    const r = expectStatus(await access(s, s.c.user.id, false), 409);
    expect(r.json?.error === "admin_always_has_access", r.text);
    expectStatus(await api(s.c, "GET", "/api/crm/leads"), 200);
  });

  add("propriul acces / propriul cont nu se pot schimba (409)", async (s) => {
    expectStatus(await access(s, s.a.user.id, false), 409);
    expectStatus(await active(s, s.a.user.id, false), 409);
    expectStatus(await api(s.a, "GET", "/api/crm/leads"), 200);
  });

  add("agentul nu poate scoate sau dezactiva pe altcineva (403)", async (s) => {
    expectStatus(await access(s, s.c.user.id, false, s.b), 403);
    expectStatus(await active(s, s.a.user.id, false, s.b), 403);
    expectStatus(await api(s.a, "GET", "/api/crm/leads"), 200);
  });

  add("managerul nu poate dezactiva (403, doar adminul)", async (s) => {
    expectStatus(await api(s.a, "PATCH", `/api/crm/team/members/${s.b.user.id}`, { role: "manager" }), 200);
    expectStatus(await active(s, s.c.user.id, false, s.b), 403);
    expectStatus(await api(s.a, "PATCH", `/api/crm/team/members/${s.b.user.id}`, { role: "teacher" }), 200);
    expectStatus(await api(s.c, "GET", "/api/crm/leads"), 200);
  });

  add("dezactivat → sesiunea lui moare pe loc (401)", async (s) => {
    expectStatus(await active(s, s.b.user.id, false), 200);
    const r = expectStatus(await api(s.b, "GET", "/api/crm/leads"), 401);
    expect(r.json?.error, r.text);
  });

  add("dezactivat → și /api/auth/me dă 401", async (s) => {
    expectStatus(await api(s.b, "GET", "/api/auth/me"), 401);
  });

  add("dezactivat → nu se mai poate loga", async (s) => {
    const r = await api(new Session("b-login"), "POST", "/api/business/auth/login", { email: s.b.email, password: PWD });
    expect(r.status === 401 || r.status === 403, `login dezactivat → ${r.status} ${r.text.slice(0, 120)}`);
  });

  add("dezactivatul: inactiv în echipă, scos din /permissions/team", async (s) => {
    expect((await member(s, s.b.user.id))?.isActive === false, "încă activ în lista echipei");
    const pt = expectOk(await api(s.a, "GET", "/api/crm/permissions/team"));
    expect(!pt.members.some((m) => m.id === s.b.user.id), "dezactivatul apare în drepturi");
  });

  add("leadurile dezactivatului rămân atribuite lui", async (s) => {
    expect((await getLead(s.a, s.lead)).assignedTo === s.b.user.id, "leadul și-a pierdut responsabilul");
  });

  add("dezactivarea agentului nu atinge sesiunile celorlalți", async (s) => {
    expectStatus(await api(s.a, "GET", "/api/crm/leads"), 200);
    expectStatus(await api(s.c, "GET", "/api/crm/leads"), 200);
  });

  add("reactivat → se loghează din nou și lucrează în CRM", async (s) => {
    expectStatus(await active(s, s.b.user.id, true), 200);
    s.b2 = await login(s.b.email, PWD);
    expectStatus(await api(s.b2, "GET", "/api/crm/leads"), 200);
  });

  add("sesiunea veche rămâne moartă după reactivare (401)", async (s) => {
    expectStatus(await api(s.b, "GET", "/api/crm/leads"), 401);
  });

  add("un admin se poate dezactiva când mai există alt admin activ", async (s) => {
    expectStatus(await active(s, s.c.user.id, false), 200);
    expectStatus(await api(s.c, "GET", "/api/crm/leads"), 401);
    expectStatus(await active(s, s.c.user.id, true), 200);
  });

  add("re-invitarea unui cont dezactivat e permisă și îl reactivează", async (s) => {
    expectStatus(await active(s, s.b.user.id, false), 200);
    const inv = await invite(s.a, "teacher", s.b.email);
    const { s: b3, r } = await accept(inv.token, "Bianca Scoasă");
    expectStatus(r, 200);
    expect((await member(s, s.b.user.id))?.isActive === true, "contul nu s-a reactivat");
    expectStatus(await api(b3, "GET", "/api/crm/leads"), 200);
  });

  add("jurnalul: scoaterea, readucerea, dezactivarea și reactivarea", async (s) => {
    const items = await auditOf(s.a, { targetId: s.b.user.id, targetType: "crm_user" });
    for (const a of ["team.access_revoked", "team.access_granted", "team.deactivated", "team.reactivated"]) {
      const e = auditEntry(items, a, s.b.user.id);
      expect(e && e.actorId === s.a.user.id, `${a} lipsește sau fără autor`);
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// echipa:jurnal — ce ai făcut apare în jurnal, cu autorul și obiectul
// ═════════════════════════════════════════════════════════════════════════════
function auditGroup(suite) {
  const G = "echipa:jurnal";
  const add = (name, fn) => suite.add(G, name, (ctx) => fn(st(ctx, G), ctx));

  add("workspace nou + manager (cu jurnal) + agent (fără)", async (s) => {
    s.a = await signupTenant(`jurnal-${RUN}`);
    s.m = await join(s.a, "manager", "Monica Manager");
    s.t = await join(s.a, "teacher", "Teo Agent");
    s.intruder = await signupTenant(`intrus-jurnal-${RUN}`);
    // Ca în interfață: tabla se deschide înaintea primului lead (semănatul etapelor).
    expect((await stagesOf(s.a)).length === 5, "etapele implicite lipsesc");
  });

  add("crearea leadului: lead.created cu autorul, numele și etapa", async (s) => {
    const l = await mkLead(s.a, { fullName: `Ion Jurnal ${RUN}`, source: "referral" });
    s.lead = l.id;
    const e = auditEntry(await auditOf(s.a, { targetId: l.id }), "lead.created", l.id);
    expect(e?.actorId === s.a.user.id && e.actorName === "Tenant Izolat" && e.targetType === "crm_lead", `intrare: ${J(e)}`);
    same([e.newValue.fullName, e.newValue.stage, e.newValue.source], [`Ion Jurnal ${RUN}`, "new", "referral"], "newValue");
  });

  add("editarea: lead.updated doar cu câmpurile atinse", async (s) => {
    expectStatus(await api(s.a, "PATCH", `/api/crm/leads/${s.lead}`, { valueCents: 12345 }), 200);
    const e = auditEntry(await auditOf(s.a, { targetId: s.lead }), "lead.updated", s.lead);
    same(e?.newValue, { valueCents: 12345 }, "newValue");
  });

  add("schimbarea de etapă: lead.stage_changed cu before/after", async (s) => {
    await move(s.a, s.lead, "trial");
    const e = auditEntry(await auditOf(s.a, { targetId: s.lead }), "lead.stage_changed", s.lead);
    expect(e?.oldValue?.stage === "new" && e.newValue?.stage === "trial", `intrare: ${J(e)}`);
  });

  add("pierderea: motivul ajunge în jurnal", async (s) => {
    await move(s.a, s.lead, "lost", "Buget tăiat");
    const e = (await auditOf(s.a, { targetId: s.lead })).find((i) => i.actionType === "crm.lead.stage_changed" && i.newValue?.stage === "lost");
    expect(e?.newValue?.lostReason === "Buget tăiat" && e.oldValue?.stage === "trial", `intrare: ${J(e)}`);
  });

  add("acțiunea managerului apare cu autorul manager", async (s) => {
    expectStatus(await api(s.m, "PATCH", `/api/crm/leads/${s.lead}`, { notes: "Revenim în toamnă" }), 200);
    const e = (await auditOf(s.a, { targetId: s.lead })).find((i) => i.actionType === "crm.lead.updated" && i.newValue?.notes);
    expect(e?.actorId === s.m.user.id && e.actorName === "Monica Manager", `autor: ${J(e)}`);
  });

  add("managerul citește același jurnal (200)", async (s) => {
    const items = await auditOf(s.m, { targetId: s.lead });
    expect(items.length >= 5, `managerul vede ${items.length} intrări`);
  });

  add("agentul nu vede jurnalul (403), nici pe un singur lead", async (s) => {
    expectStatus(await api(s.t, "GET", "/api/crm/audit"), 403);
    expectStatus(await api(s.t, "GET", `/api/crm/audit?targetId=${s.lead}`), 403);
  });

  add("un PATCH respins (etapă necunoscută) nu scrie în jurnal", async (s) => {
    const before = (await auditOf(s.a, { targetId: s.lead })).length;
    expectStatus(await api(s.a, "PATCH", `/api/crm/leads/${s.lead}/stage`, { stage: "nu_exista" }), 400);
    expect((await auditOf(s.a, { targetId: s.lead })).length === before, "refuzul a lăsat urmă în jurnal");
  });

  add("filtrul targetId întoarce doar istoricul leadului", async (s) => {
    const items = await auditOf(s.a, { targetId: s.lead });
    expect(items.length >= 5 && items.every((i) => i.targetId === s.lead), `intrări: ${J(items.map((i) => i.targetId))}`);
  });

  add("ordinea: cea mai nouă intrare prima", async (s) => {
    const t = (await auditOf(s.a)).map((i) => new Date(i.occurredAt).getTime());
    expect(t.every((v, i) => i === 0 || v <= t[i - 1]), "jurnalul nu e descrescător în timp");
  });

  add("filtrul targetType=crm_stage întoarce doar etape", async (s) => {
    const st1 = expectStatus(await api(s.a, "POST", "/api/crm/stages", { label: "Etapă de jurnal" }), 201).json;
    expectStatus(await api(s.a, "DELETE", `/api/crm/stages/${st1.id}`), 200);
    const items = await auditOf(s.a, { targetType: "crm_stage" });
    expect(items.length >= 2 && items.every((i) => i.targetType === "crm_stage"), J(items.map((i) => i.targetType)));
    expect(auditEntry(items, "stage.deleted", st1.id)?.oldValue?.key === "etapa_de_jurnal", "ștergerea etapei fără cheie");
  });

  add("jurnalul conține doar acțiuni CRM (prefix crm.)", async (s) => {
    expect((await auditOf(s.a)).every((i) => i.actionType.startsWith("crm.")), "intrări din alte module");
  });

  add("limit=2 → 2 intrări; limit=0 → implicit; limit=500 → cel mult 200; limit=abc → fără 500", async (s) => {
    const n = async (limit) => expectOk(await api(s.a, "GET", `/api/crm/audit?limit=${limit}`)).items.length;
    expect((await n(2)) === 2, "limit=2");
    expect((await n(0)) >= 1, "limit=0 nu întoarce nimic");
    expect((await n(500)) <= 200, "limit=500 depășește 200");
    expect((await n("abc")) >= 2, "limit=abc");
  });

  add("alt client nu vede jurnalul nostru", async (s) => {
    const items = await auditOf(s.intruder, { targetId: s.lead });
    expect(items.length === 0, `intrusul vede ${items.length} intrări`);
    expect(!(await auditOf(s.intruder)).some((i) => i.targetId === s.lead), "intrusul vede leadul nostru în jurnal");
  });

  add("jurnalul intrusului conține doar ce a făcut el", async (s) => {
    await mkLead(s.intruder, { fullName: `Lead intrus ${RUN}` });
    const items = await auditOf(s.intruder);
    expect(items.length >= 1 && items.every((i) => i.actorId === s.intruder.user.id), J(items.map((i) => i.actorId)));
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// echipa:sănătate — diagnosticul CRM, cronul zilnic, digestul la cerere
// ═════════════════════════════════════════════════════════════════════════════
function healthGroup(suite) {
  const G = "echipa:sănătate";
  const add = (name, fn) => suite.add(G, name, (ctx) => fn(st(ctx, G), ctx));

  add("diagnosticul răspunde fără sesiune, cu toate tabelele ok", async (s) => {
    s.a = await signupTenant(`sanatate-${RUN}`);
    s.secretEmail = `secret-${RUN}@example.invalid`;
    await mkLead(s.a, { fullName: `Pacient Secret ${RUN}`, email: s.secretEmail });
    const r = expectStatus(await api(anon, "GET", "/api/crm/health"), 200);
    const bad = Object.entries(r.json.tables).filter(([, v]) => !v.ok);
    expect(r.json.ok === true && bad.length === 0 && r.json.pipelineQuery?.ok === true, `probleme: ${J(bad)}`);
    s.health = r;
  });

  add("diagnosticul nu scurge date: fără nume, emailuri; id-uri trunchiate", async (s) => {
    const txt = s.health.text;
    for (const leak of [s.secretEmail, `Pacient Secret ${RUN}`, s.a.tenant.name, s.a.user.email, s.a.tenant.id]) {
      expect(!txt.includes(leak), `diagnosticul conține „${leak}”`);
    }
    expect(s.health.json.perTenant.every((t) => t.id.length === 8 && Object.keys(t).every((k) => ["id", "leads", "ok", "error"].includes(k))), "perTenant expune mai mult decât id/leads/ok");
  });

  add("diagnosticul spune ce build rulează", async (s) => {
    const b = s.health.json.build;
    expect(typeof b?.commit === "string" && typeof b?.env === "string", J(b));
  });

  add("cronul zilnic fără secret / cu Bearer greșit nu rulează", async () => {
    for (const h of [{}, { authorization: "Bearer ghicit" }, { authorization: "" }]) {
      const r = await api(anon, "GET", "/api/crm/cron/daily", undefined, h);
      expect((r.status === 401 || r.status === 503) && r.json?.error, `cron ${J(h)} → ${r.status} ${r.text.slice(0, 100)}`);
    }
  });

  add("digestul la cerere fără sesiune → 401", async () => {
    expectStatus(await api(anon, "POST", "/api/crm/cron/digest-now"), 401);
  });

  add("digestul fără taskuri restante → 0 destinatari", async (s) => {
    const r = expectStatus(await api(s.a, "POST", "/api/crm/cron/digest-now"), 200);
    expect(r.json.ok === true && r.json.recipients === 0 && r.json.emails === 0, r.text);
  });

  add("digestul cu un task restant al meu → 1 destinatar", async (s) => {
    const l = await mkLead(s.a, { fullName: `Digest ${RUN}` });
    s.digestLead = l.id;
    expectStatus(await api(s.a, "POST", "/api/crm/tasks", { leadId: l.id, title: "Sună clientul", dueAt: YESTERDAY, assignedTo: s.a.user.id }), 201);
    const r = expectStatus(await api(s.a, "POST", "/api/crm/cron/digest-now"), 200);
    expect(r.json.recipients === 1, r.text);
  });

  add("digestul meu nu include taskul restant al colegului", async (s) => {
    const b = await join(s.a, "teacher", "Coleg Digest");
    expectStatus(await api(s.a, "POST", "/api/crm/tasks", { leadId: s.digestLead, title: "Trimite oferta", dueAt: YESTERDAY, assignedTo: b.user.id }), 201);
    const r = expectStatus(await api(s.a, "POST", "/api/crm/cron/digest-now"), 200);
    expect(r.json.recipients === 1, `digestul adminului a mers la ${r.json.recipients} oameni`);
    const rb = expectStatus(await api(b, "POST", "/api/crm/cron/digest-now"), 200);
    expect(rb.json.recipients === 1, `digestul colegului: ${rb.text}`);
  });
}
