// Automatizări și intrarea leadurilor: reguli care pornesc singure, cadențe, reactivare,
// distribuirea automată, repartizarea pe loturi și formularele publice de pe site.
//
// Fiecare scenariu INVOCĂ acțiunea și verifică EFECTUL pe lead (task, etichetă, responsabil,
// notiță, notificare, jurnal) — nu doar că regula s-a salvat (CLAUDE.md §3.5.1quater).
//
// Izolare: fiecare grup își face propriul workspace (`signupTenant`) în primul scenariu și scrie
// DOAR acolo. O regulă de automatizare sau de distribuire pusă în workspace-ul demo ar schimba
// leadurile celorlalte grupuri care rulează în paralel pe același server.

import {
  RUN, uid, api, anon, Session, signupTenant, expect, expectStatus, expectOk, expectClientError, expectNo5xx,
  listOf, RANDOM_UUID,
} from "../lib.mjs";

const DAY = 86_400_000;
const PASSWORD = "E2e-parola-lunga-123!";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Ajutoare comune ─────────────────────────────────────────────────────────

/** Un coleg nou în workspace, pe drumul real: invitație CRM → acceptare → sesiune. */
async function addMember(admin, role, name) {
  const email = `${uid("membru-")}@example.invalid`;
  const r = await api(admin, "POST", "/api/crm/team/invites", { email, role });
  expectStatus(r, 201, `invitația pentru ${name}: `);
  const token = decodeURIComponent(String(r.json?.inviteUrl ?? "").match(/token=([^&]+)/)?.[1] ?? "");
  expect(token, `invitația nu conține token: ${r.text.slice(0, 160)}`);
  const s = new Session(name);
  const acc = await api(s, "POST", "/api/auth/accept-invite", { token, name, password: PASSWORD });
  expectStatus(acc, 200, `acceptarea invitației lui ${name}: `);
  s.user = acc.json?.user ?? null;
  expect(s.user?.id, "acceptarea nu a întors utilizatorul");
  return s;
}

async function newLead(s, body = {}) {
  const r = await api(s, "POST", "/api/crm/leads", { fullName: `Lead ${uid()}`, ...body });
  expectStatus(r, 201, "crearea leadului: ");
  return r.json;
}
async function getLead(s, id) {
  return expectOk(await api(s, "GET", `/api/crm/leads/${id}`), "citirea leadului: ");
}
async function tasksOf(s, leadId) {
  return listOf(expectOk(await api(s, "GET", `/api/crm/tasks?leadId=${leadId}`), "taskurile leadului: ")) ?? [];
}
async function tagsOf(s, leadId) {
  return (listOf(expectOk(await api(s, "GET", `/api/crm/tags?leadId=${leadId}`), "etichetele leadului: ")) ?? []).map((t) => t.tag);
}
async function interactionsOf(s, leadId) {
  return listOf(expectOk(await api(s, "GET", `/api/crm/leads/${leadId}/interactions`), "cronologia leadului: ")) ?? [];
}
async function runsOf(s, leadId) {
  return listOf(expectOk(await api(s, "GET", `/api/crm/automations/runs?leadId=${leadId}`), "jurnalul automatizărilor: ")) ?? [];
}
async function notificationsOf(s) {
  return listOf(expectOk(await api(s, "GET", "/api/notifications"), "notificările: ")) ?? [];
}
async function automation(s, body) {
  const r = await api(s, "POST", "/api/crm/automations", { conditions: [], ...body });
  expectStatus(r, 201, `regula „${body.name}”: `);
  return r.json;
}
async function moveStage(s, leadId, stage, lostReason) {
  const r = await api(s, "PATCH", `/api/crm/leads/${leadId}/stage`, lostReason ? { stage, lostReason } : { stage });
  return r;
}
async function stagesOf(s, pipelineId) {
  const q = pipelineId ? `?pipelineId=${pipelineId}` : "";
  return listOf(expectOk(await api(s, "GET", `/api/crm/stages${q}`), "etapele: ")) ?? [];
}
async function leadsWhere(s, query) {
  const j = expectOk(await api(s, "GET", `/api/crm/leads?pageSize=100&${query}`), "lista de leaduri: ");
  return j.items ?? [];
}
async function importCsv(s, rows) {
  const text = ["Nume,Telefon,Firma,Regiune,Industrie", ...rows.map((r) => [r.name, r.phone, r.company ?? "", r.region ?? "", r.industry ?? ""].join(","))].join("\n");
  const r = await api(s, "POST", "/api/crm/import/run", { text });
  const j = expectOk(r, "importul: ");
  expect(j.created === rows.length, `importul a creat ${j.created} din ${rows.length}: ${r.text.slice(0, 200)}`);
}
async function leadIdByName(s, name) {
  const items = await leadsWhere(s, `search=${encodeURIComponent(name)}`);
  const hit = items.find((l) => l.fullName === name);
  expect(hit, `nu găsesc leadul „${name}”`);
  return hit.id;
}
const near = (iso, target, tol) => iso && Math.abs(new Date(iso).getTime() - target) <= tol;
const onlyCompany = (m) => [{ field: "company", op: "eq", value: m }];
let phoneSeq = 0;
/** Telefon moldovenesc unic pe rulare (normalizarea îl reduce la ultimele 8 cifre). */
const phone = () => `+3736${String(Date.now() % 1000).padStart(3, "0")}${String(++phoneSeq).padStart(4, "0")}`;

// ════════════════════════════════════════════════════════════════════════════
// auto:crud — salvarea, validarea și drepturile regulilor
// ════════════════════════════════════════════════════════════════════════════
function registerAutoCrud(suite) {
  const G = "auto:crud";
  const S = {};
  const base = (n) => ({ name: `${n} ${RUN}`, trigger: { kind: "lead.created" }, actions: [{ type: "create_task", title: "Sună clientul" }] });

  suite.add(G, "workspace nou, cu un agent invitat, pornește fără nicio regulă", async () => {
    S.a = await signupTenant("auto-crud");
    S.agent = await addMember(S.a, "teacher", "Agent Crud");
    const j = expectOk(await api(S.a, "GET", "/api/crm/automations"));
    expect(Array.isArray(j.items) && j.items.length === 0, `workspace nou cu reguli: ${JSON.stringify(j).slice(0, 120)}`);
  });

  suite.add(G, "regula nouă se salvează pornită, pe poziția 0", async () => {
    S.r1 = await automation(S.a, base("Prima"));
    expect(S.r1.enabled === true, "regula nu e pornită implicit");
    expect(S.r1.orderIndex === 0, `ordinea primei reguli: ${S.r1.orderIndex}`);
    expect(S.r1.trigger?.kind === "lead.created" && S.r1.actions?.[0]?.title === "Sună clientul", "declanșatorul/acțiunea nu s-au salvat");
    expect(Array.isArray(S.r1.conditions) && S.r1.conditions.length === 0 && S.r1.templateKey === null, "condiții/templateKey neașteptate");
  });

  suite.add(G, "a doua regulă intră la final (poziția 1)", async () => {
    S.r2 = await automation(S.a, { ...base("A doua"), templateKey: "new-lead-call" });
    expect(S.r2.orderIndex === 1, `ordinea: ${S.r2.orderIndex}`);
  });

  suite.add(G, "lista întoarce regulile în ordinea lor", async () => {
    const items = expectOk(await api(S.a, "GET", "/api/crm/automations")).items;
    expect(items.map((x) => x.id).join() === [S.r1.id, S.r2.id].join(), "ordinea din listă e greșită");
  });

  suite.add(G, "redenumirea se păstrează la recitire", async () => {
    expectOk(await api(S.a, "PATCH", `/api/crm/automations/${S.r1.id}`, { name: `Redenumită ${RUN}` }));
    const items = expectOk(await api(S.a, "GET", "/api/crm/automations")).items;
    expect(items.find((x) => x.id === S.r1.id)?.name === `Redenumită ${RUN}`, "numele nu s-a salvat");
  });

  suite.add(G, "oprirea regulii nu îi șterge acțiunile", async () => {
    const j = expectOk(await api(S.a, "PATCH", `/api/crm/automations/${S.r1.id}`, { enabled: false }));
    expect(j.enabled === false && j.actions?.length === 1 && j.actions[0].type === "create_task", `după oprire: ${JSON.stringify(j).slice(0, 200)}`);
  });

  suite.add(G, "redenumirea nu pierde scenariul de origine (templateKey)", async () => {
    const j = expectOk(await api(S.a, "PATCH", `/api/crm/automations/${S.r2.id}`, { name: `Scenariu ${RUN}` }));
    expect(j.templateKey === "new-lead-call", `templateKey după PATCH: ${j.templateKey}`);
  });

  suite.add(G, "trecerea la „lead uitat” fără număr de zile e refuzată cu explicație", async () => {
    const r = await api(S.a, "PATCH", `/api/crm/automations/${S.r1.id}`, { trigger: { kind: "lead.idle" } });
    expectStatus(r, 400);
    expect(r.json?.error === "invalid_automation" && Array.isArray(r.json.problems) && r.json.problems.length > 0, `răspuns: ${r.text.slice(0, 160)}`);
  });

  suite.add(G, "„lead uitat” cu 5 zile se salvează", async () => {
    const j = expectOk(await api(S.a, "PATCH", `/api/crm/automations/${S.r1.id}`, { trigger: { kind: "lead.idle", idleDays: 5 } }));
    expect(j.trigger?.kind === "lead.idle" && j.trigger.idleDays === 5, `declanșator: ${JSON.stringify(j.trigger)}`);
  });

  suite.add(G, "înapoi la „lead nou”, pragul de zile dispare", async () => {
    const j = expectOk(await api(S.a, "PATCH", `/api/crm/automations/${S.r1.id}`, { trigger: { kind: "lead.created", idleDays: 9 } }));
    expect(j.trigger?.kind === "lead.created" && j.trigger.idleDays === undefined, `declanșator: ${JSON.stringify(j.trigger)}`);
  });

  suite.add(G, "PATCH cu lista de acțiuni goală e refuzat", async () => {
    expectClientError(await api(S.a, "PATCH", `/api/crm/automations/${S.r1.id}`, { actions: [] }));
    const items = expectOk(await api(S.a, "GET", "/api/crm/automations")).items;
    expect(items.find((x) => x.id === S.r1.id)?.actions?.length === 1, "acțiunile s-au pierdut");
  });

  suite.add(G, "PATCH care mută leadul în chiar etapa declanșatoare e refuzat (buclă)", async () => {
    const r = await api(S.a, "PATCH", `/api/crm/automations/${S.r1.id}`, {
      trigger: { kind: "lead.stage_changed", toStage: "contacted" },
      actions: [{ type: "move_stage", stageKey: "contacted" }],
    });
    expectStatus(r, 400);
  });

  const invalid = [
    ["fără nume", { ...base("x"), name: "" }],
    ["fără acțiuni", { ...base("x"), actions: [] }],
    ["cu 11 acțiuni", { ...base("x"), actions: Array.from({ length: 11 }, () => ({ type: "add_tag", tag: "x" })) }],
    ["declanșator necunoscut", { ...base("x"), trigger: { kind: "lead.deleted" } }],
    ["acțiune necunoscută", { ...base("x"), actions: [{ type: "send_sms", text: "x" }] }],
    ["„lead uitat” fără zile", { ...base("x"), trigger: { kind: "lead.idle" } }],
    ["„lead uitat” cu 0 zile", { ...base("x"), trigger: { kind: "lead.idle", idleDays: 0 } }],
    ["„lead uitat” cu 366 de zile", { ...base("x"), trigger: { kind: "lead.idle", idleDays: 366 } }],
    ["mutare în etapa declanșatoare", { ...base("x"), trigger: { kind: "lead.stage_changed", toStage: "trial" }, actions: [{ type: "move_stage", stageKey: "trial" }] }],
    ["notificare către „un om” fără om", { ...base("x"), actions: [{ type: "notify", to: "user", message: "salut" }] }],
    ["notificare cu text gol", { ...base("x"), actions: [{ type: "notify", to: "admins", message: "   " }] }],
    ["atribuire fără om și fără strategie", { ...base("x"), actions: [{ type: "assign" }] }],
    ["task cu titlu din spații", { ...base("x"), actions: [{ type: "create_task", title: "   " }] }],
    ["task cu scadență peste un an", { ...base("x"), actions: [{ type: "create_task", title: "x", dueInDays: 400 }] }],
    ["task dat unui id care nu e uuid", { ...base("x"), actions: [{ type: "create_task", title: "x", assignTo: "abc" }] }],
    ["etichetă din spații", { ...base("x"), actions: [{ type: "add_tag", tag: "  " }] }],
    ["scoatere de etichetă goală", { ...base("x"), actions: [{ type: "remove_tag", tag: "  " }] }],
    ["operator de condiție necunoscut", { ...base("x"), conditions: [{ field: "source", op: "regex", value: ".*" }] }],
    ["21 de condiții", { ...base("x"), conditions: Array.from({ length: 21 }, () => ({ field: "source", op: "exists" })) }],
  ];
  suite.each(G, invalid, ([what]) => `regula ${what} e refuzată (400)`, async ([, body]) => {
    expectStatus(await api(S.a, "POST", "/api/crm/automations", body), 400);
  });

  suite.add(G, "nicio regulă refuzată n-a ajuns totuși în listă", async () => {
    const items = expectOk(await api(S.a, "GET", "/api/crm/automations")).items;
    expect(items.length === 2, `lista are ${items.length} reguli, așteptat 2`);
  });

  suite.add(G, "previzualizarea pe un lead inexistent → 404", async () => {
    expectStatus(await api(S.a, "POST", "/api/crm/automations/preview", { leadId: RANDOM_UUID }), 404);
  });

  suite.add(G, "previzualizarea cu un id care nu e uuid → 400", async () => {
    expectStatus(await api(S.a, "POST", "/api/crm/automations/preview", { leadId: "abc" }), 400);
  });

  suite.add(G, "jurnalul filtrat cu un leadId stricat nu cade (fără 500)", async () => {
    expectNo5xx(await api(S.a, "GET", "/api/crm/automations/runs?leadId=abc"));
  });

  suite.add(G, "agentul vede regulile echipei", async () => {
    const items = expectOk(await api(S.agent, "GET", "/api/crm/automations")).items;
    expect(items.some((x) => x.id === S.r2.id), "agentul nu vede regulile");
  });

  suite.add(G, "agentul nu poate crea o regulă (403) și nimic nu se salvează", async () => {
    expectStatus(await api(S.agent, "POST", "/api/crm/automations", base("Agent")), 403);
    const items = expectOk(await api(S.a, "GET", "/api/crm/automations")).items;
    expect(items.length === 2, "regula agentului s-a salvat totuși");
  });

  suite.add(G, "agentul nu poate opri o regulă (403) — rămâne pornită", async () => {
    expectStatus(await api(S.agent, "PATCH", `/api/crm/automations/${S.r2.id}`, { enabled: false }), 403);
    const items = expectOk(await api(S.a, "GET", "/api/crm/automations")).items;
    expect(items.find((x) => x.id === S.r2.id)?.enabled === true, "regula a fost oprită de agent");
  });

  suite.add(G, "agentul nu poate șterge o regulă (403)", async () => {
    expectStatus(await api(S.agent, "DELETE", `/api/crm/automations/${S.r2.id}`), 403);
  });

  suite.add(G, "alt client nu vede regulile mele", async (ctx) => {
    const r = await api(ctx.other, "GET", "/api/crm/automations");
    expectNo5xx(r);
    expect(!r.text.includes(S.r1.id) && !r.text.includes(S.r2.id), "lista altui client conține regulile mele");
  });

  suite.add(G, "alt client nu îmi poate modifica regula (404), iar ea rămâne neatinsă", async (ctx) => {
    expectStatus(await api(ctx.other, "PATCH", `/api/crm/automations/${S.r2.id}`, { name: "furat", enabled: false }), 404);
    const it = expectOk(await api(S.a, "GET", "/api/crm/automations")).items.find((x) => x.id === S.r2.id);
    expect(it?.enabled === true && it.name === `Scenariu ${RUN}`, `regula a fost atinsă: ${JSON.stringify(it)}`);
  });

  suite.add(G, "ștergerea scoate regula din listă", async () => {
    expectOk(await api(S.a, "DELETE", `/api/crm/automations/${S.r1.id}`));
    const items = expectOk(await api(S.a, "GET", "/api/crm/automations")).items;
    expect(!items.some((x) => x.id === S.r1.id), "regula ștearsă e încă în listă");
  });

  suite.add(G, "a doua ștergere a aceleiași reguli → 404", async () => {
    expectStatus(await api(S.a, "DELETE", `/api/crm/automations/${S.r1.id}`), 404);
  });

  suite.add(G, "modificarea unei reguli șterse → 404", async () => {
    expectStatus(await api(S.a, "PATCH", `/api/crm/automations/${S.r1.id}`, { name: "înviată" }), 404);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// auto:declanșare — „lead nou” chiar face ce spune regula
// ════════════════════════════════════════════════════════════════════════════
function registerAutoTriggers(suite) {
  const G = "auto:declanșare";
  const S = {};
  const mark = () => uid("Firma-");

  suite.add(G, "workspace nou cu doi agenți invitați", async () => {
    S.a = await signupTenant("auto-trig");
    S.b = await addMember(S.a, "teacher", "Agent Bogdan");
    S.c = await addMember(S.a, "teacher", "Agent Carla");
    await stagesOf(S.a);
    const team = expectOk(await api(S.a, "GET", "/api/crm/assignment/members")).items;
    expect(team.length === 3, `rosterul are ${team.length} oameni, așteptat 3`);
  });

  suite.add(G, "lead nou → task „Sună clientul”, scadent azi", async () => {
    S.m1 = mark();
    S.rCall = await automation(S.a, { name: `Sună ${S.m1}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(S.m1), actions: [{ type: "create_task", title: `Sună ${S.m1}`, dueInDays: 0 }] });
    S.l1 = await newLead(S.a, { company: S.m1 });
    const t = (await tasksOf(S.a, S.l1.id)).find((x) => x.title === `Sună ${S.m1}`);
    expect(t, "taskul automat nu a fost creat");
    expect(near(t.dueAt, Date.now(), DAY), `scadența nu e azi: ${t.dueAt}`);
  });

  suite.add(G, "jurnalul notează rularea: regula, leadul, „ok”, acțiunea", async () => {
    const runs = await runsOf(S.a, S.l1.id);
    const run = runs.find((x) => x.automationId === S.rCall.id);
    expect(run, `nicio rulare în jurnal: ${JSON.stringify(runs).slice(0, 200)}`);
    expect(run.status === "ok" && run.triggerKind === "lead.created" && run.actions?.[0]?.action === "create_task", `rulare: ${JSON.stringify(run)}`);
    expect(run.automationName === `Sună ${S.m1}`, "numele regulii lipsește din jurnal");
  });

  suite.add(G, "leadul care nu îndeplinește condiția nu primește task și nu apare în jurnal", async () => {
    const l = await newLead(S.a, { company: mark() });
    expect(!(await tasksOf(S.a, l.id)).some((x) => x.title === `Sună ${S.m1}`), "taskul a apărut pe un lead care nu se potrivește");
    expect(!(await runsOf(S.a, l.id)).some((x) => x.automationId === S.rCall.id), "jurnalul are o rulare pentru un lead nepotrivit");
  });

  suite.add(G, "„peste 3 zile” pune scadența la 3 zile de acum", async () => {
    const m = mark();
    await automation(S.a, { name: `3z ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "create_task", title: `Ofertă ${m}`, dueInDays: 3 }] });
    const l = await newLead(S.a, { company: m });
    const t = (await tasksOf(S.a, l.id)).find((x) => x.title === `Ofertă ${m}`);
    expect(t && near(t.dueAt, Date.now() + 3 * DAY, DAY / 4), `scadența: ${t?.dueAt}`);
  });

  suite.add(G, "taskul se dă colegului ales în regulă", async () => {
    const m = mark();
    await automation(S.a, { name: `Carla ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "create_task", title: `Pentru Carla ${m}`, assignTo: S.c.user.id }] });
    const l = await newLead(S.a, { company: m });
    const t = (await tasksOf(S.a, l.id)).find((x) => x.title === `Pentru Carla ${m}`);
    expect(t?.assignedTo === S.c.user.id, `taskul e la ${t?.assignedTo}, nu la Carla`);
  });

  suite.add(G, "fără om ales, taskul merge la responsabilul leadului", async () => {
    const m = mark();
    await automation(S.a, { name: `Resp ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "create_task", title: `Resp ${m}` }] });
    const l = await newLead(S.a, { company: m, assignedTo: S.b.user.id });
    const t = (await tasksOf(S.a, l.id)).find((x) => x.title === `Resp ${m}`);
    expect(t?.assignedTo === S.b.user.id, `taskul e la ${t?.assignedTo}, nu la responsabil`);
  });

  suite.add(G, "un om din alt workspace ales în regulă → taskul revine responsabilului", async (ctx) => {
    const m = mark();
    await automation(S.a, { name: `Străin ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "create_task", title: `Străin ${m}`, assignTo: ctx.other.user.id }] });
    const l = await newLead(S.a, { company: m, assignedTo: S.b.user.id });
    const t = (await tasksOf(S.a, l.id)).find((x) => x.title === `Străin ${m}`);
    expect(t && t.assignedTo === S.b.user.id, `taskul a ajuns la ${t?.assignedTo} (om din alt workspace?)`);
  });

  suite.add(G, "eticheta se pune pe leadul nou", async () => {
    const m = mark();
    await automation(S.a, { name: `Tag ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "add_tag", tag: `vip-${m}` }] });
    const l = await newLead(S.a, { company: m });
    expect((await tagsOf(S.a, l.id)).includes(`vip-${m}`), "eticheta nu a fost pusă");
  });

  suite.add(G, "două reguli cu aceeași etichetă → eticheta apare o singură dată", async () => {
    const m = mark();
    for (const n of [1, 2]) await automation(S.a, { name: `Dublu${n} ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "add_tag", tag: "dublu" }] });
    const l = await newLead(S.a, { company: m });
    const tags = await tagsOf(S.a, l.id);
    expect(tags.filter((t) => t === "dublu").length === 1, `eticheta apare de ${tags.filter((t) => t === "dublu").length} ori`);
  });

  suite.add(G, "notița automată apare în cronologie, marcată ca automată", async () => {
    const m = mark();
    await automation(S.a, { name: `Notă ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "add_note", body: `Lead de pe expoziție ${m}` }] });
    const l = await newLead(S.a, { company: m });
    const n = (await interactionsOf(S.a, l.id)).find((x) => x.type === "note" && x.body === `Lead de pe expoziție ${m}`);
    expect(n && n.metadata?.automation === true, `notița: ${JSON.stringify(n)}`);
  });

  suite.add(G, "administratorii sunt anunțați", async () => {
    const m = mark();
    await automation(S.a, { name: `Adm ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "notify", to: "admins", message: `afacere nouă ${m}` }] });
    await newLead(S.a, { company: m });
    expect((await notificationsOf(S.a)).some((n) => String(n.body).includes(`afacere nouă ${m}`)), "administratorul nu a primit notificarea");
    expect(!(await notificationsOf(S.b)).some((n) => String(n.body).includes(m)), "un agent a primit notificarea pentru administratori");
  });

  suite.add(G, "responsabilul leadului e anunțat, nu altcineva", async () => {
    const m = mark();
    await automation(S.a, { name: `Asig ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "notify", to: "assignee", message: `e al tău ${m}` }] });
    await newLead(S.a, { company: m, assignedTo: S.b.user.id });
    expect((await notificationsOf(S.b)).some((n) => String(n.body).includes(`e al tău ${m}`)), "responsabilul nu a primit notificarea");
    expect(!(await notificationsOf(S.c)).some((n) => String(n.body).includes(m)), "un coleg care nu e responsabil a fost anunțat");
  });

  suite.add(G, "notificarea către un coleg anume ajunge la el", async () => {
    const m = mark();
    await automation(S.a, { name: `Om ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "notify", to: "user", userId: S.c.user.id, message: `uite ${m}` }] });
    await newLead(S.a, { company: m });
    expect((await notificationsOf(S.c)).some((n) => String(n.body).includes(`uite ${m}`)), "Carla nu a primit notificarea");
  });

  suite.add(G, "anunțul către responsabil, pe un lead fără responsabil, spune în jurnal că n-a anunțat pe nimeni", async () => {
    const m = mark();
    const rule = await automation(S.a, { name: `Gol ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "notify", to: "assignee", message: "x" }] });
    const l = await newLead(S.a, { company: m });
    const run = (await runsOf(S.a, l.id)).find((x) => x.automationId === rule.id);
    expect(run && /nimeni/.test(run.actions?.[0]?.detail ?? ""), `jurnal: ${JSON.stringify(run)}`);
  });

  suite.add(G, "atribuirea directă pune responsabilul (în răspunsul creării și la recitire)", async () => {
    const m = mark();
    await automation(S.a, { name: `Dă ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "assign", userId: S.b.user.id }] });
    const l = await newLead(S.a, { company: m });
    expect(l.assignedTo === S.b.user.id, `răspunsul creării are responsabilul ${l.assignedTo}`);
    expect((await getLead(S.a, l.id)).assignedTo === S.b.user.id, "la recitire leadul nu e al lui Bogdan");
  });

  suite.add(G, "atribuirea către un om din alt workspace nu scrie nimic", async (ctx) => {
    const m = mark();
    const rule = await automation(S.a, { name: `DăStrăin ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "assign", userId: ctx.other.user.id }] });
    const l = await newLead(S.a, { company: m });
    expect((await getLead(S.a, l.id)).assignedTo === null, "leadul a ajuns la un om din alt workspace");
    const run = (await runsOf(S.a, l.id)).find((x) => x.automationId === rule.id);
    expect(run && /nu mai e în echipă/.test(run.actions?.[0]?.detail ?? ""), `jurnal: ${JSON.stringify(run)}`);
  });

  suite.add(G, "atribuirea „după strategie” fără reguli de distribuire lasă leadul liber, cu explicație", async () => {
    const m = mark();
    const rule = await automation(S.a, { name: `Strat ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "assign", strategy: "round_robin" }] });
    const l = await newLead(S.a, { company: m });
    expect((await getLead(S.a, l.id)).assignedTo === null, "leadul a fost atribuit fără nicio regulă de distribuire");
    const run = (await runsOf(S.a, l.id)).find((x) => x.automationId === rule.id);
    expect(run && /niciun agent/.test(run.actions?.[0]?.detail ?? ""), `jurnal: ${JSON.stringify(run)}`);
  });

  suite.add(G, "„este unul dintre” prinde sursele din listă (Instagram da, Google nu)", async () => {
    const m = mark();
    await automation(S.a, { name: `Social ${m}`, trigger: { kind: "lead.created" }, conditions: [...onlyCompany(m), { field: "source", op: "in", value: "facebook_ad, Instagram" }], actions: [{ type: "add_tag", tag: "social" }] });
    const yes = await newLead(S.a, { company: m, source: "instagram" });
    const no = await newLead(S.a, { company: m, source: "google_ads" });
    expect((await tagsOf(S.a, yes.id)).includes("social"), "leadul din Instagram nu e marcat");
    expect(!(await tagsOf(S.a, no.id)).includes("social"), "leadul din Google a fost marcat „social”");
  });

  suite.add(G, "„≥” pe valoare: 10 000 da, 9 999 nu", async () => {
    const m = mark();
    await automation(S.a, { name: `Mare ${m}`, trigger: { kind: "lead.created" }, conditions: [...onlyCompany(m), { field: "valueCents", op: "gte", value: 1_000_000 }], actions: [{ type: "add_tag", tag: "mare" }] });
    const big = await newLead(S.a, { company: m, valueCents: 1_000_000 });
    const small = await newLead(S.a, { company: m, valueCents: 999_900 });
    expect((await tagsOf(S.a, big.id)).includes("mare"), "afacerea de 10 000 nu e marcată");
    expect(!(await tagsOf(S.a, small.id)).includes("mare"), "afacerea de 9 999 a fost marcată");
  });

  suite.add(G, "„conține” nu ține cont de majuscule", async () => {
    const m = mark();
    await automation(S.a, { name: `Nume ${m}`, trigger: { kind: "lead.created" }, conditions: [...onlyCompany(m), { field: "fullName", op: "contains", value: "popescu" }], actions: [{ type: "add_tag", tag: "familie" }] });
    const l = await newLead(S.a, { company: m, fullName: "Ion POPESCU" });
    expect((await tagsOf(S.a, l.id)).includes("familie"), "„POPESCU” nu a fost prins de „popescu”");
  });

  suite.add(G, "„nu există” pe email: fără email da, cu email nu", async () => {
    const m = mark();
    await automation(S.a, { name: `FărăEmail ${m}`, trigger: { kind: "lead.created" }, conditions: [...onlyCompany(m), { field: "email", op: "not_exists" }], actions: [{ type: "add_tag", tag: "cere-email" }] });
    const no = await newLead(S.a, { company: m });
    const yes = await newLead(S.a, { company: m, email: `${uid("x")}@example.invalid` });
    expect((await tagsOf(S.a, no.id)).includes("cere-email"), "leadul fără email nu e marcat");
    expect(!(await tagsOf(S.a, yes.id)).includes("cere-email"), "leadul cu email a fost marcat");
  });

  suite.add(G, "toate condițiile trebuie să treacă (ȘI): una picată → regula nu rulează", async () => {
    const m = mark();
    const rule = await automation(S.a, { name: `ȘI ${m}`, trigger: { kind: "lead.created" }, conditions: [...onlyCompany(m), { field: "source", op: "eq", value: "referral" }], actions: [{ type: "add_tag", tag: "recomandat" }] });
    const l = await newLead(S.a, { company: m, source: "webform" });
    expect(!(await tagsOf(S.a, l.id)).includes("recomandat"), "regula a rulat cu o condiție picată");
    expect(!(await runsOf(S.a, l.id)).some((x) => x.automationId === rule.id), "jurnalul are o rulare cu condiție picată");
  });

  suite.add(G, "regula creată oprită nu pornește", async () => {
    const m = mark();
    await automation(S.a, { name: `Oprită ${m}`, enabled: false, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "create_task", title: `Oprită ${m}` }] });
    const l = await newLead(S.a, { company: m });
    expect(!(await tasksOf(S.a, l.id)).some((x) => x.title === `Oprită ${m}`), "o regulă oprită a creat task");
  });

  suite.add(G, "oprirea unei reguli pornite o face să nu mai ruleze", async () => {
    S.mToggle = mark();
    S.rToggle = await automation(S.a, { name: `Comutată ${S.mToggle}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(S.mToggle), actions: [{ type: "create_task", title: `Comutată ${S.mToggle}` }] });
    S.lToggleOn = await newLead(S.a, { company: S.mToggle });
    expect((await tasksOf(S.a, S.lToggleOn.id)).some((x) => x.title === `Comutată ${S.mToggle}`), "regula pornită nu a rulat");
    expectOk(await api(S.a, "PATCH", `/api/crm/automations/${S.rToggle.id}`, { enabled: false }));
    const l = await newLead(S.a, { company: S.mToggle });
    expect(!(await tasksOf(S.a, l.id)).some((x) => x.title === `Comutată ${S.mToggle}`), "regula oprită a rulat");
  });

  suite.add(G, "repornirea o face să ruleze din nou", async () => {
    expectOk(await api(S.a, "PATCH", `/api/crm/automations/${S.rToggle.id}`, { enabled: true }));
    const l = await newLead(S.a, { company: S.mToggle });
    expect((await tasksOf(S.a, l.id)).some((x) => x.title === `Comutată ${S.mToggle}`), "regula repornită nu a rulat");
  });

  suite.add(G, "ștergerea regulii o oprește definitiv", async () => {
    expectOk(await api(S.a, "DELETE", `/api/crm/automations/${S.rToggle.id}`));
    const l = await newLead(S.a, { company: S.mToggle });
    expect(!(await tasksOf(S.a, l.id)).some((x) => x.title === `Comutată ${S.mToggle}`), "regula ștearsă a rulat");
  });

  suite.add(G, "jurnalul păstrează rularea veche după ștergerea regulii", async () => {
    const run = (await runsOf(S.a, S.lToggleOn.id)).find((x) => x.automationName === `Comutată ${S.mToggle}`);
    expect(run && run.status === "ok", "rularea regulii șterse a dispărut din jurnal");
  });

  suite.add(G, "două reguli potrivite rulează amândouă, fiecare cu rândul ei în jurnal", async () => {
    const m = mark();
    const r1 = await automation(S.a, { name: `Unu ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "add_note", body: `unu ${m}` }] });
    const r2 = await automation(S.a, { name: `Doi ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "add_note", body: `doi ${m}` }] });
    const l = await newLead(S.a, { company: m });
    const bodies = (await interactionsOf(S.a, l.id)).map((x) => x.body);
    expect(bodies.includes(`unu ${m}`) && bodies.includes(`doi ${m}`), `notițe: ${bodies.join(" | ")}`);
    const ids = (await runsOf(S.a, l.id)).map((x) => x.automationId);
    expect(ids.includes(r1.id) && ids.includes(r2.id), "jurnalul nu are ambele rulări");
  });

  suite.add(G, "a doua regulă vede responsabilul pus de prima", async () => {
    const m = mark();
    await automation(S.a, { name: `Pas1 ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "assign", userId: S.b.user.id }] });
    await automation(S.a, { name: `Pas2 ${m}`, trigger: { kind: "lead.created" }, conditions: [...onlyCompany(m), { field: "assignedTo", op: "eq", value: S.b.user.id }], actions: [{ type: "create_task", title: `Bun venit ${m}` }] });
    const l = await newLead(S.a, { company: m });
    const t = (await tasksOf(S.a, l.id)).find((x) => x.title === `Bun venit ${m}`);
    expect(t, "a doua regulă nu a văzut responsabilul pus de prima");
    expect(t.assignedTo === S.b.user.id, `taskul nu e la noul responsabil: ${t.assignedTo}`);
  });

  suite.add(G, "a doua regulă vede eticheta pusă de prima (condiție pe etichete)", async () => {
    const m = mark();
    await automation(S.a, { name: `Et1 ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "add_tag", tag: `cald-${m}` }] });
    await automation(S.a, { name: `Et2 ${m}`, trigger: { kind: "lead.created" }, conditions: [...onlyCompany(m), { field: "tags", op: "contains", value: `cald-${m}` }], actions: [{ type: "add_note", body: `e cald ${m}` }] });
    const l = await newLead(S.a, { company: m });
    expect((await interactionsOf(S.a, l.id)).some((x) => x.body === `e cald ${m}`), "condiția pe etichete nu a văzut eticheta proaspăt pusă");
  });

  suite.add(G, "mutarea într-o etapă inexistentă nu strică salvarea leadului", async () => {
    const m = mark();
    const rule = await automation(S.a, { name: `Fantomă ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "move_stage", stageKey: "nu-exista" }] });
    const l = await newLead(S.a, { company: m });
    expect(l.stage === "new", `leadul a ajuns în etapa „${l.stage}”`);
    const run = (await runsOf(S.a, l.id)).find((x) => x.automationId === rule.id);
    expect(run && /nu există/.test(run.actions?.[0]?.detail ?? ""), `jurnal: ${JSON.stringify(run)}`);
  });

  suite.add(G, "previzualizarea arată regula potrivită, cu acțiunile ei", async () => {
    S.mPrev = mark();
    S.lPrev = await newLead(S.a, { company: S.mPrev });
    S.rPrev = await automation(S.a, { name: `Prev ${S.mPrev}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(S.mPrev), actions: [{ type: "create_task", title: `Prev ${S.mPrev}` }] });
    const plan = expectOk(await api(S.a, "POST", "/api/crm/automations/preview", { leadId: S.lPrev.id })).plan;
    const p = plan.find((x) => x.automationId === S.rPrev.id);
    expect(p && p.matched === true && p.actions?.[0]?.title === `Prev ${S.mPrev}`, `plan: ${JSON.stringify(p)}`);
  });

  suite.add(G, "previzualizarea nu scrie nimic (niciun task, nicio rulare)", async () => {
    expect(!(await tasksOf(S.a, S.lPrev.id)).some((x) => x.title === `Prev ${S.mPrev}`), "previzualizarea a creat task");
    expect(!(await runsOf(S.a, S.lPrev.id)).some((x) => x.automationId === S.rPrev.id), "previzualizarea a scris în jurnal");
  });

  suite.add(G, "previzualizarea arată și regulile care cad pe condiții (fără acțiuni)", async () => {
    const plan = expectOk(await api(S.a, "POST", "/api/crm/automations/preview", { leadId: S.lPrev.id })).plan;
    const p = plan.find((x) => x.automationId === S.rCall.id);
    expect(p && p.matched === false && p.actions.length === 0, `regula nepotrivită: ${JSON.stringify(p)}`);
  });

  suite.add(G, "regula oprită nu apare în previzualizare", async () => {
    expectOk(await api(S.a, "PATCH", `/api/crm/automations/${S.rPrev.id}`, { enabled: false }));
    const plan = expectOk(await api(S.a, "POST", "/api/crm/automations/preview", { leadId: S.lPrev.id })).plan;
    expect(!plan.some((x) => x.automationId === S.rPrev.id), "regula oprită apare în plan");
  });

  suite.add(G, "previzualizarea pe „schimbare de etapă” nu include regulile de „lead nou”", async () => {
    const plan = expectOk(await api(S.a, "POST", "/api/crm/automations/preview", { leadId: S.lPrev.id, kind: "lead.stage_changed", toStage: "contacted" })).plan;
    expect(!plan.some((x) => x.automationId === S.rCall.id), "o regulă de „lead nou” apare la schimbarea de etapă");
  });

  suite.add(G, "leadul creat de un agent declanșează și el automatizările", async () => {
    const m = mark();
    await automation(S.a, { name: `DeAgent ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "create_task", title: `DeAgent ${m}` }] });
    const l = await newLead(S.b, { company: m });
    expect((await tasksOf(S.a, l.id)).some((x) => x.title === `DeAgent ${m}`), "leadul agentului nu a declanșat regula");
  });

  suite.add(G, "jurnalul altui client nu conține leadurile mele", async (ctx) => {
    const r = await api(ctx.other, "GET", "/api/crm/automations/runs");
    expectNo5xx(r);
    expect(!r.text.includes(S.l1.id) && !r.text.includes(S.rCall.id), "jurnalul altui client conține rulările mele");
  });

  suite.add(G, "alt client nu poate previzualiza regulile pe leadul meu (404)", async (ctx) => {
    expectStatus(await api(ctx.other, "POST", "/api/crm/automations/preview", { leadId: S.l1.id }), 404);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// auto:etape — schimbarea de etapă ca declanșator, lanțuri, scenarii de câștig/pierdere
// ════════════════════════════════════════════════════════════════════════════
function registerAutoStages(suite) {
  const G = "auto:etape";
  const S = {};
  const mark = () => uid("Etapa-");

  suite.add(G, "workspace nou, cu pâlnia standard și un agent", async () => {
    S.a = await signupTenant("auto-etape");
    S.agent = await addMember(S.a, "teacher", "Agent Etape");
    S.stages = await stagesOf(S.a);
    S.won = S.stages.find((s) => s.isWon)?.key;
    S.lost = S.stages.find((s) => s.isLost)?.key;
    expect(S.stages.some((s) => s.key === "contacted") && S.won && S.lost, `etape: ${S.stages.map((s) => s.key).join(",")}`);
  });

  suite.add(G, "intrarea în „Contactat” creează taskul regulii", async () => {
    S.m1 = mark();
    S.r1 = await automation(S.a, { name: `Contactat ${S.m1}`, trigger: { kind: "lead.stage_changed", toStage: "contacted" }, conditions: onlyCompany(S.m1), actions: [{ type: "create_task", title: `Trimite prezentarea ${S.m1}` }] });
    S.l1 = await newLead(S.a, { company: S.m1 });
    expect(!(await tasksOf(S.a, S.l1.id)).some((x) => x.title === `Trimite prezentarea ${S.m1}`), "taskul a apărut înainte de mutare");
    expectOk(await moveStage(S.a, S.l1.id, "contacted"));
    expect((await tasksOf(S.a, S.l1.id)).some((x) => x.title === `Trimite prezentarea ${S.m1}`), "mutarea nu a creat taskul");
  });

  suite.add(G, "jurnalul notează declanșatorul „lead.stage_changed”", async () => {
    const run = (await runsOf(S.a, S.l1.id)).find((x) => x.automationId === S.r1.id);
    expect(run?.triggerKind === "lead.stage_changed" && run.status === "ok", `rulare: ${JSON.stringify(run)}`);
  });

  suite.add(G, "mutarea în altă etapă nu pornește regula de „Contactat”", async () => {
    const l = await newLead(S.a, { company: S.m1 });
    expectOk(await moveStage(S.a, l.id, "trial"));
    expect(!(await tasksOf(S.a, l.id)).some((x) => x.title === `Trimite prezentarea ${S.m1}`), "regula de „Contactat” a pornit la „trial”");
  });

  suite.add(G, "regula fără etapă anume pornește la orice mutare", async () => {
    const m = mark();
    await automation(S.a, { name: `Orice ${m}`, trigger: { kind: "lead.stage_changed" }, conditions: onlyCompany(m), actions: [{ type: "add_tag", tag: "s-a-mișcat" }] });
    const l = await newLead(S.a, { company: m });
    expectOk(await moveStage(S.a, l.id, "trial"));
    expect((await tagsOf(S.a, l.id)).includes("s-a-mișcat"), "regula generală de etapă nu a pornit");
  });

  suite.add(G, "„lead nou → mută în Contactat”: leadul se naște direct în Contactat, cu urmă automată", async () => {
    const m = mark();
    await automation(S.a, { name: `Muta ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "move_stage", stageKey: "contacted" }] });
    const l = await newLead(S.a, { company: m });
    expect(l.stage === "contacted", `răspunsul creării are etapa „${l.stage}”`);
    const ch = (await interactionsOf(S.a, l.id)).find((x) => x.type === "stage_change");
    expect(ch && ch.metadata?.automation === true && ch.metadata?.to === "contacted", `urma mutării: ${JSON.stringify(ch)}`);
  });

  suite.add(G, "mutarea automată declanșează la rândul ei regulile de etapă (lanț)", async () => {
    const m = mark();
    await automation(S.a, { name: `Lanț1 ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "move_stage", stageKey: "contacted" }] });
    await automation(S.a, { name: `Lanț2 ${m}`, trigger: { kind: "lead.stage_changed", toStage: "contacted" }, conditions: onlyCompany(m), actions: [{ type: "add_tag", tag: "lanț" }] });
    const l = await newLead(S.a, { company: m });
    expect((await tagsOf(S.a, l.id)).includes("lanț"), "regula de etapă nu a pornit după mutarea automată");
  });

  suite.add(G, "două reguli care se mută reciproc nu blochează cererea (lanțul e plafonat)", async () => {
    const m = mark();
    await automation(S.a, { name: `Start ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "move_stage", stageKey: "contacted" }] });
    await automation(S.a, { name: `Înainte ${m}`, trigger: { kind: "lead.stage_changed", toStage: "contacted" }, conditions: onlyCompany(m), actions: [{ type: "move_stage", stageKey: "trial" }] });
    await automation(S.a, { name: `Înapoi ${m}`, trigger: { kind: "lead.stage_changed", toStage: "trial" }, conditions: onlyCompany(m), actions: [{ type: "move_stage", stageKey: "contacted" }] });
    const t0 = Date.now();
    const r = await api(S.a, "POST", "/api/crm/leads", { fullName: `Buclă ${m}`, company: m });
    expectStatus(r, 201);
    expect(Date.now() - t0 < 15_000, `cererea a durat ${Date.now() - t0} ms`);
    const runs = await runsOf(S.a, r.json.id);
    expect(runs.some((x) => (x.actions ?? []).some((a) => /lanț prea lung/.test(a.detail ?? ""))), `lanțul nu a fost oprit explicit: ${JSON.stringify(runs.map((x) => x.actions))}`);
    const fresh = await getLead(S.a, r.json.id);
    expect(["contacted", "trial"].includes(fresh.stage), `etapa finală: ${fresh.stage}`);
  });

  suite.add(G, "câștigat → task „Trimite factura și contractul” pe mâine + administratorii anunțați", async () => {
    await automation(S.a, {
      name: "Pașii de după vânzare", templateKey: "won-handoff",
      trigger: { kind: "lead.stage_changed", toStage: S.won },
      actions: [{ type: "create_task", title: "Trimite factura și contractul", dueInDays: 1 }, { type: "notify", to: "admins", message: "vânzare câștigată" }],
    });
    const who = `Client Câștigat ${RUN}`;
    const l = await newLead(S.a, { fullName: who });
    expectOk(await moveStage(S.a, l.id, S.won));
    const t = (await tasksOf(S.a, l.id)).find((x) => x.title === "Trimite factura și contractul");
    expect(t && near(t.dueAt, Date.now() + DAY, DAY / 4), `taskul de după vânzare: ${JSON.stringify(t)}`);
    expect((await notificationsOf(S.a)).some((n) => String(n.body).includes(who) && String(n.body).includes("vânzare câștigată")), "administratorul nu a aflat de vânzare");
  });

  suite.add(G, "„pierdut” fără motiv e refuzat și nu pornește nimic", async () => {
    await automation(S.a, { name: "Revino peste 3 luni", templateKey: "lost-recontact", trigger: { kind: "lead.stage_changed", toStage: S.lost }, actions: [{ type: "create_task", title: "Recontactează clientul", dueInDays: 90 }] });
    S.lLost = await newLead(S.a);
    const r = await moveStage(S.a, S.lLost.id, S.lost);
    expectStatus(r, 400);
    expect(r.json?.error === "lost_reason_required", `eroare: ${r.text.slice(0, 120)}`);
    expect(!(await tasksOf(S.a, S.lLost.id)).some((x) => x.title === "Recontactează clientul"), "regula de pierdere a pornit fără mutare");
  });

  suite.add(G, "„pierdut” cu motiv → task „Recontactează clientul” peste ~90 de zile", async () => {
    expectOk(await moveStage(S.a, S.lLost.id, S.lost, "Preț prea mare"));
    const t = (await tasksOf(S.a, S.lLost.id)).find((x) => x.title === "Recontactează clientul");
    expect(t && near(t.dueAt, Date.now() + 90 * DAY, DAY), `taskul: ${JSON.stringify(t)}`);
  });

  suite.add(G, "„scoate rece”: eticheta pusă de mână dispare la mutare", async () => {
    const m = mark();
    const rule = await automation(S.a, { name: `Cald ${m}`, trigger: { kind: "lead.stage_changed" }, conditions: [...onlyCompany(m), { field: "tags", op: "contains", value: "rece" }], actions: [{ type: "remove_tag", tag: "rece" }] });
    const l = await newLead(S.a, { company: m });
    expectOk(await api(S.a, "POST", "/api/crm/tags", { leadId: l.id, tag: "rece" }));
    expect((await tagsOf(S.a, l.id)).includes("rece"), "eticheta „rece” nu s-a pus");
    expectOk(await moveStage(S.a, l.id, "contacted"));
    expect(!(await tagsOf(S.a, l.id)).includes("rece"), "eticheta „rece” nu a dispărut la mutare");
    const run = (await runsOf(S.a, l.id)).find((x) => x.automationId === rule.id);
    expect(run && /scos/.test(run.actions?.[0]?.detail ?? ""), `jurnal: ${JSON.stringify(run)}`);
  });

  suite.add(G, "mutarea în masă pornește automatizarea pentru fiecare lead", async () => {
    const m = mark();
    await automation(S.a, { name: `Masă ${m}`, trigger: { kind: "lead.stage_changed", toStage: "trial" }, conditions: onlyCompany(m), actions: [{ type: "create_task", title: `Demo ${m}` }] });
    const a = await newLead(S.a, { company: m });
    const b = await newLead(S.a, { company: m });
    const j = expectOk(await api(S.a, "POST", "/api/crm/leads/bulk", { leadIds: [a.id, b.id], action: "stage", stage: "trial" }));
    expect(j.updated === 2, `bulk: ${JSON.stringify(j)}`);
    for (const l of [a, b]) expect((await tasksOf(S.a, l.id)).some((x) => x.title === `Demo ${m}`), `leadul ${l.id} nu a primit taskul`);
  });

  suite.add(G, "previzualizarea pe etapa corectă arată regula de etapă", async () => {
    const plan = expectOk(await api(S.a, "POST", "/api/crm/automations/preview", { leadId: S.l1.id, kind: "lead.stage_changed", toStage: "contacted" })).plan;
    expect(plan.some((x) => x.automationId === S.r1.id && x.matched), "regula de „Contactat” lipsește din plan");
    const other = expectOk(await api(S.a, "POST", "/api/crm/automations/preview", { leadId: S.l1.id, kind: "lead.stage_changed", toStage: "trial" })).plan;
    expect(!other.some((x) => x.automationId === S.r1.id), "regula de „Contactat” apare la „trial”");
  });

  suite.add(G, "o automatizare nu mută leadul într-o etapă care nu e în pâlnia lui", async () => {
    const p = expectOk(await api(S.a, "POST", "/api/crm/pipelines", { name: `SPANCO ${RUN}`, template: "spanco" }));
    const spancoKeys = (await stagesOf(S.a, p.id)).map((s) => s.key);
    expect(spancoKeys.includes("negotiation"), `SPANCO fără „negotiation”: ${spancoKeys}`);
    const m = mark();
    await automation(S.a, { name: `AltăPâlnie ${m}`, trigger: { kind: "lead.created" }, conditions: onlyCompany(m), actions: [{ type: "move_stage", stageKey: "negotiation" }] });
    const l = await newLead(S.a, { company: m });
    const own = (await stagesOf(S.a, l.pipelineId)).map((s) => s.key);
    const fresh = await getLead(S.a, l.id);
    expect(own.includes(fresh.stage), `leadul din pâlnia implicită a ajuns în etapa „${fresh.stage}”, care nu există în pâlnia lui (${own.join(",")}) — e invizibil pe tablă`);
  });

  suite.add(G, "„atribuie după regulă” la schimbarea etapei chiar atribuie leadul", async () => {
    const m = mark();
    const l = await newLead(S.a, { company: m });
    expect(l.assignedTo === null, "leadul are deja responsabil");
    const rule = expectOk(await api(S.a, "POST", "/api/crm/assignment/rules", { name: `Doar agentul ${m}`, strategy: "round_robin", userIds: [S.agent.user.id], conditions: onlyCompany(m) }));
    const auto = await automation(S.a, { name: `Atribuie la calificare ${m}`, trigger: { kind: "lead.stage_changed", toStage: "trial" }, conditions: onlyCompany(m), actions: [{ type: "assign", strategy: "round_robin" }] });
    expectOk(await moveStage(S.a, l.id, "trial"));
    const fresh = await getLead(S.a, l.id);
    const run = (await runsOf(S.a, l.id)).find((x) => x.automationId === auto.id);
    await api(S.a, "DELETE", `/api/crm/assignment/rules/${rule.id}`);
    expect(fresh.assignedTo === S.agent.user.id, `leadul nu a fost atribuit la mutare (responsabil ${fresh.assignedTo}); jurnal: ${JSON.stringify(run?.actions)}`);
  });

  suite.add(G, "agentul care mută leadul declanșează aceleași reguli", async () => {
    const l = await newLead(S.a, { company: S.m1 });
    expectOk(await moveStage(S.agent, l.id, "contacted"));
    expect((await tasksOf(S.a, l.id)).some((x) => x.title === `Trimite prezentarea ${S.m1}`), "mutarea agentului nu a declanșat regula");
  });
}

// ════════════════════════════════════════════════════════════════════════════
// auto:scenarii — cele 8 scenarii gata făcute, construite ca în pagina de automatizări
// ════════════════════════════════════════════════════════════════════════════
function registerAutoScenarios(suite) {
  const G = "auto:scenarii";
  const S = {};

  suite.add(G, "workspace nou pentru scenariile gata făcute", async () => {
    S.a = await signupTenant("auto-scen");
    S.stages = await stagesOf(S.a);
  });

  suite.add(G, "„Marchează lead-urile din rețele sociale”: Facebook primește „social”", async () => {
    S.social = await automation(S.a, { name: "Marchează lead-urile din rețele sociale", templateKey: "social-tag", trigger: { kind: "lead.created" }, conditions: [{ field: "source", op: "in", value: "facebook_ad,instagram" }], actions: [{ type: "add_tag", tag: "social" }] });
    const l = await newLead(S.a, { source: "facebook_ad" });
    expect((await tagsOf(S.a, l.id)).includes("social"), "leadul din Facebook nu e „social”");
  });

  suite.add(G, "„…rețele sociale”: Instagram primește „social”", async () => {
    const l = await newLead(S.a, { source: "instagram" });
    expect((await tagsOf(S.a, l.id)).includes("social"), "leadul din Instagram nu e „social”");
  });

  suite.add(G, "„…rețele sociale”: un lead introdus de mână nu primește „social”", async () => {
    const l = await newLead(S.a);
    expect(!(await tagsOf(S.a, l.id)).includes("social"), "un lead manual a fost marcat „social”");
  });

  suite.add(G, "„Anunță conducerea la o afacere mare”: 10 000 → etichetă + administrator anunțat", async () => {
    await automation(S.a, { name: "Anunță conducerea la o afacere mare", templateKey: "big-deal", trigger: { kind: "lead.created" }, conditions: [{ field: "valueCents", op: "gte", value: 1_000_000 }], actions: [{ type: "add_tag", tag: "afacere mare" }, { type: "notify", to: "admins", message: "a intrat o afacere mare" }] });
    const who = `Fabrica Mare ${RUN}`;
    const l = await newLead(S.a, { fullName: who, valueCents: 1_500_000 });
    expect((await tagsOf(S.a, l.id)).includes("afacere mare"), "eticheta „afacere mare” lipsește");
    expect((await notificationsOf(S.a)).some((n) => String(n.body).includes(who) && String(n.body).includes("afacere mare")), "administratorul nu a fost anunțat");
  });

  suite.add(G, "„…afacere mare”: 9 999 nu declanșează nimic", async () => {
    const who = `Firmă Mică ${RUN}`;
    const l = await newLead(S.a, { fullName: who, valueCents: 999_999 });
    expect(!(await tagsOf(S.a, l.id)).includes("afacere mare"), "afacerea mică a fost marcată mare");
    expect(!(await notificationsOf(S.a)).some((n) => String(n.body).includes(who)), "administratorul a fost anunțat pentru o afacere mică");
  });

  suite.add(G, "„Scoate „rece” când lead-ul se mișcă”: eticheta dispare la mutare", async () => {
    S.warm = await automation(S.a, { name: "Scoate „rece” când lead-ul se mișcă", templateKey: "warm-again", trigger: { kind: "lead.stage_changed" }, conditions: [{ field: "tags", op: "contains", value: "rece" }], actions: [{ type: "remove_tag", tag: "rece" }] });
    const l = await newLead(S.a);
    expectOk(await api(S.a, "POST", "/api/crm/tags", { leadId: l.id, tag: "rece" }));
    expectOk(await moveStage(S.a, l.id, "contacted"));
    expect(!(await tagsOf(S.a, l.id)).includes("rece"), "„rece” a rămas după mutare");
  });

  suite.add(G, "„…rece”: pe un lead fără „rece” regula nu lasă urmă în jurnal", async () => {
    const l = await newLead(S.a);
    expectOk(await moveStage(S.a, l.id, "contacted"));
    expect(!(await runsOf(S.a, l.id)).some((x) => x.automationId === S.warm.id), "regula a rulat fără eticheta „rece”");
  });

  suite.add(G, "„Nu lăsa lead-urile uitate” se salvează cu 3 zile și două acțiuni", async () => {
    S.idle3 = await automation(S.a, { name: "Nu lăsa lead-urile uitate", templateKey: "idle-3-days", trigger: { kind: "lead.idle", idleDays: 3 }, actions: [{ type: "create_task", title: "Revino la client", dueInDays: 0 }, { type: "notify", to: "assignee", message: "stă neatins de 3 zile" }] });
    expect(S.idle3.trigger.idleDays === 3 && S.idle3.actions.length === 2, `regula: ${JSON.stringify(S.idle3)}`);
  });

  suite.add(G, "„Marchează lead-urile reci” se salvează cu 14 zile", async () => {
    S.idle14 = await automation(S.a, { name: "Marchează lead-urile reci", templateKey: "idle-14-cold", trigger: { kind: "lead.idle", idleDays: 14 }, actions: [{ type: "add_tag", tag: "rece" }] });
    expect(S.idle14.trigger.idleDays === 14, `prag: ${S.idle14.trigger.idleDays}`);
  });

  suite.add(G, "previzualizarea „lead uitat” arată ambele reguli de liniște", async () => {
    const l = await newLead(S.a);
    const plan = expectOk(await api(S.a, "POST", "/api/crm/automations/preview", { leadId: l.id, kind: "lead.idle", toStage: "new" })).plan;
    const ids = plan.filter((x) => x.matched).map((x) => x.automationId);
    expect(ids.includes(S.idle3.id) && ids.includes(S.idle14.id), `plan: ${JSON.stringify(plan)}`);
    expect(!plan.some((x) => x.automationId === S.social.id), "o regulă de „lead nou” apare în planul de liniște");
  });

  suite.add(G, "o regulă „lead uitat” nu rulează la crearea leadului", async () => {
    const l = await newLead(S.a);
    expect(!(await tasksOf(S.a, l.id)).some((x) => x.title === "Revino la client"), "regula de liniște a pornit la creare");
  });

  suite.add(G, "„Pașii de după vânzare” se construiește pe etapa marcată câștigat", async () => {
    const won = S.stages.find((s) => s.isWon)?.key;
    const r = await automation(S.a, { name: "Pașii de după vânzare", templateKey: "won-handoff", trigger: { kind: "lead.stage_changed", toStage: won }, actions: [{ type: "create_task", title: "Trimite factura și contractul", dueInDays: 1 }, { type: "notify", to: "admins", message: "vânzare câștigată" }] });
    expect(r.trigger.toStage === won, `etapa: ${r.trigger.toStage}`);
  });

  suite.add(G, "„Revino peste 3 luni la cei pierduți” se construiește pe etapa marcată pierdut", async () => {
    const lost = S.stages.find((s) => s.isLost)?.key;
    const r = await automation(S.a, { name: "Revino peste 3 luni la cei pierduți", templateKey: "lost-recontact", trigger: { kind: "lead.stage_changed", toStage: lost }, actions: [{ type: "create_task", title: "Recontactează clientul", dueInDays: 90 }] });
    expect(r.trigger.toStage === lost && r.actions[0].dueInDays === 90, `regula: ${JSON.stringify(r)}`);
  });

  suite.add(G, "„Sună fiecare lead nou în aceeași zi”: orice lead nou primește taskul, scadent azi", async () => {
    await automation(S.a, { name: "Sună fiecare lead nou în aceeași zi", templateKey: "new-lead-call", trigger: { kind: "lead.created" }, actions: [{ type: "create_task", title: "Sună clientul", dueInDays: 0 }] });
    for (const src of ["manual", "webform", "referral"]) {
      const l = await newLead(S.a, { source: src });
      const t = (await tasksOf(S.a, l.id)).find((x) => x.title === "Sună clientul");
      expect(t && near(t.dueAt, Date.now(), DAY), `leadul din „${src}” nu are task de sunat azi`);
    }
  });

  suite.add(G, "lista ține minte ce scenarii sunt pornite (templateKey)", async () => {
    const keys = new Set(expectOk(await api(S.a, "GET", "/api/crm/automations")).items.map((x) => x.templateKey));
    for (const k of ["social-tag", "big-deal", "warm-again", "idle-3-days", "idle-14-cold", "won-handoff", "lost-recontact", "new-lead-call"]) {
      expect(keys.has(k), `scenariul „${k}” nu apare ca pornit`);
    }
  });

  suite.add(G, "cronul zilnic nu pornește fără secret (nu e o ușă publică)", async () => {
    const r = await api(anon, "GET", "/api/crm/cron/daily");
    expectStatus(r, [401, 503]);
    expect(r.json?.error, "răspunsul cronului refuzat nu e JSON");
  });

  suite.add(G, "cronul cu un secret greșit e refuzat", async () => {
    expectStatus(await api(anon, "GET", "/api/crm/cron/daily", undefined, { authorization: "Bearer ghicit" }), [401, 503]);
  });

  suite.add(G, "digestul „trimite-mi acum” cere sesiune", async () => {
    expectStatus(await api(anon, "POST", "/api/crm/cron/digest-now"), 401);
  });

  suite.add(G, "digestul „trimite-mi acum” răspunde pentru utilizatorul logat", async () => {
    const j = expectOk(await api(S.a, "POST", "/api/crm/cron/digest-now"));
    expect(j.ok === true, `digest: ${JSON.stringify(j)}`);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// cadente:secvențe — cadențe de urmărire: pași, înscrieri, rulare, oprire
// ════════════════════════════════════════════════════════════════════════════
function registerCadences(suite) {
  const G = "cadente:secvențe";
  const S = {};
  const mark = () => uid("C-");
  async function enrollmentsOf(s, leadId) {
    return listOf(expectOk(await api(s, "GET", `/api/crm/cadences/enrollments?leadId=${leadId}`))) ?? [];
  }
  async function cadence(s, body) {
    const r = await api(s, "POST", "/api/crm/cadences", body);
    expectStatus(r, 201, `cadența „${body.name}”: `);
    return r.json;
  }
  async function enroll(s, leadId, cadenceId) {
    const r = await api(s, "POST", "/api/crm/cadences/enroll", { leadId, cadenceId });
    expectStatus(r, 201, "înscrierea: ");
    return r.json;
  }
  const run = async (s) => expectOk(await api(s, "POST", "/api/crm/cadences/run"), "rularea cadențelor: ");

  suite.add(G, "workspace nou, cu un agent, fără cadențe", async () => {
    S.a = await signupTenant("cadente");
    S.agent = await addMember(S.a, "teacher", "Agent Cadențe");
    S.b = await signupTenant("cadente-alt");
    await stagesOf(S.a);
    const j = expectOk(await api(S.a, "GET", "/api/crm/cadences"));
    expect(j.items.length === 0, "workspace nou cu cadențe");
  });

  suite.add(G, "cadența cu trei pași se salvează cu pașii în ordine", async () => {
    S.m = mark();
    S.k1 = await cadence(S.a, { name: `Urmărire ${S.m}`, steps: [{ dayOffset: 0, action: "task", title: `Sună ${S.m}` }, { dayOffset: 0, action: "note", title: `Notă ${S.m}` }, { dayOffset: 3, action: "task", title: `Revino ${S.m}` }] });
    expect(S.k1.steps.length === 3 && S.k1.steps[2].dayOffset === 3 && S.k1.enabled === true, `cadența: ${JSON.stringify(S.k1)}`);
  });

  const bad = [
    ["fără nume", { name: "  " }],
    ["cu un pas în trecut (zi negativă)", { name: "x", steps: [{ dayOffset: -1, action: "task", title: "x" }] }],
    ["cu o acțiune necunoscută", { name: "x", steps: [{ dayOffset: 0, action: "email", title: "x" }] }],
    ["cu un pas fără titlu", { name: "x", steps: [{ dayOffset: 0, action: "task", title: "   " }] }],
    ["cu un pas peste un an", { name: "x", steps: [{ dayOffset: 366, action: "task", title: "x" }] }],
    ["cu 21 de pași", { name: "x", steps: Array.from({ length: 21 }, (_, i) => ({ dayOffset: i, action: "task", title: `p${i}` })) }],
  ];
  suite.each(G, bad, ([w]) => `cadența ${w} e refuzată (400)`, async ([, body]) => {
    expectStatus(await api(S.a, "POST", "/api/crm/cadences", body), 400);
  });

  suite.add(G, "înscrierea programează primul pas acum", async () => {
    S.l1 = await newLead(S.a);
    const e = await enroll(S.a, S.l1.id, S.k1.id);
    expect(e.status === "active" && e.currentStep === 0 && near(e.nextFireAt, Date.now(), 60_000), `înscriere: ${JSON.stringify(e)}`);
    S.e1 = e;
  });

  suite.add(G, "înscrierile leadului apar în fișă, cu numele cadenței", async () => {
    const items = await enrollmentsOf(S.a, S.l1.id);
    expect(items.some((x) => x.id === S.e1.id && x.cadenceName === `Urmărire ${S.m}`), `înscrieri: ${JSON.stringify(items)}`);
  });

  suite.add(G, "înscrierile fără leadId → 400", async () => {
    expectStatus(await api(S.a, "GET", "/api/crm/cadences/enrollments"), 400);
  });

  suite.add(G, "rularea aprinde pasul 1: taskul apare pe lead", async () => {
    const j = await run(S.a);
    expect(j.ok === true && j.advanced >= 1, `rulare: ${JSON.stringify(j)}`);
    expect((await tasksOf(S.a, S.l1.id)).some((x) => x.title === `Sună ${S.m}`), "taskul pasului 1 lipsește");
    const e = (await enrollmentsOf(S.a, S.l1.id)).find((x) => x.id === S.e1.id);
    expect(e.currentStep === 1 && e.status === "active", `după pasul 1: ${JSON.stringify(e)}`);
  });

  suite.add(G, "rularea următoare aprinde pasul 2: notița apare în cronologie", async () => {
    await run(S.a);
    const n = (await interactionsOf(S.a, S.l1.id)).find((x) => x.type === "note" && x.body === `Notă ${S.m}`);
    expect(n && n.metadata?.cadenceStep === 1, `notița: ${JSON.stringify(n)}`);
    const e = (await enrollmentsOf(S.a, S.l1.id)).find((x) => x.id === S.e1.id);
    expect(e.currentStep === 2 && near(e.nextFireAt, Date.now() + 3 * DAY, DAY / 4), `după pasul 2: ${JSON.stringify(e)}`);
  });

  suite.add(G, "pasul de peste 3 zile nu se aprinde azi", async () => {
    await run(S.a);
    expect(!(await tasksOf(S.a, S.l1.id)).some((x) => x.title === `Revino ${S.m}`), "pasul de peste 3 zile s-a aprins azi");
    const e = (await enrollmentsOf(S.a, S.l1.id)).find((x) => x.id === S.e1.id);
    expect(e.currentStep === 2, `pasul curent: ${e.currentStep}`);
  });

  suite.add(G, "pasul 1 nu se repetă la rulări succesive", async () => {
    const n = (await tasksOf(S.a, S.l1.id)).filter((x) => x.title === `Sună ${S.m}`).length;
    expect(n === 1, `taskul pasului 1 apare de ${n} ori`);
  });

  suite.add(G, "a doua înscriere manuală în aceeași cadență activă nu dublează urmărirea", async () => {
    const r = await api(S.a, "POST", "/api/crm/cadences/enroll", { leadId: S.l1.id, cadenceId: S.k1.id });
    expectNo5xx(r);
    const active = (await enrollmentsOf(S.a, S.l1.id)).filter((x) => x.cadenceId === S.k1.id && x.status === "active");
    expect(active.length === 1, `leadul are ${active.length} înscrieri active în aceeași cadență — pașii s-ar aprinde de două ori`);
  });

  suite.add(G, "cadența fără pași se înscrie direct ca terminată", async () => {
    const k0 = await cadence(S.a, { name: `Goală ${mark()}` });
    const e = await enroll(S.a, (await newLead(S.a)).id, k0.id);
    expect(e.status === "done" && e.nextFireAt === null, `înscriere: ${JSON.stringify(e)}`);
  });

  suite.add(G, "oprirea înscrierii o anulează, iar rularea n-o mai aprinde", async () => {
    const m = mark();
    const k = await cadence(S.a, { name: `Anulabilă ${m}`, steps: [{ dayOffset: 0, action: "task", title: `Anulat ${m}` }] });
    const l = await newLead(S.a);
    const e = await enroll(S.a, l.id, k.id);
    const c = expectOk(await api(S.a, "POST", `/api/crm/cadences/enrollments/${e.id}/cancel`));
    expect(c.status === "cancelled" && c.nextFireAt === null, `anulare: ${JSON.stringify(c)}`);
    await run(S.a);
    expect(!(await tasksOf(S.a, l.id)).some((x) => x.title === `Anulat ${m}`), "înscrierea anulată s-a aprins");
  });

  suite.add(G, "oprirea unei înscrieri inexistente → 404", async () => {
    expectStatus(await api(S.a, "POST", `/api/crm/cadences/enrollments/${RANDOM_UUID}/cancel`), 404);
  });

  suite.add(G, "înscrierea unui lead din alt workspace → 404", async () => {
    const foreign = await newLead(S.b);
    expectStatus(await api(S.a, "POST", "/api/crm/cadences/enroll", { leadId: foreign.id, cadenceId: S.k1.id }), 404);
  });

  suite.add(G, "înscrierea într-o cadență din alt workspace → 404", async () => {
    const kb = await cadence(S.b, { name: `Străină ${mark()}`, steps: [{ dayOffset: 0, action: "task", title: "x" }] });
    S.kb = kb;
    expectStatus(await api(S.a, "POST", "/api/crm/cadences/enroll", { leadId: S.l1.id, cadenceId: kb.id }), 404);
  });

  suite.add(G, "intrarea în etapa declanșatoare înscrie leadul automat", async () => {
    S.mk2 = mark();
    S.k2 = await cadence(S.a, { name: `La contactare ${S.mk2}`, triggerStage: "contacted", steps: [{ dayOffset: 0, action: "task", title: `Primul apel ${S.mk2}` }] });
    S.l3 = await newLead(S.a);
    expectOk(await moveStage(S.a, S.l3.id, "contacted"));
    const e = (await enrollmentsOf(S.a, S.l3.id)).filter((x) => x.cadenceId === S.k2.id);
    expect(e.length === 1 && e[0].status === "active", `înscrieri: ${JSON.stringify(e)}`);
  });

  suite.add(G, "mutarea înainte-înapoi nu înscrie leadul de două ori", async () => {
    expectOk(await moveStage(S.a, S.l3.id, "new"));
    expectOk(await moveStage(S.a, S.l3.id, "contacted"));
    const e = (await enrollmentsOf(S.a, S.l3.id)).filter((x) => x.cadenceId === S.k2.id && x.status === "active");
    expect(e.length === 1, `leadul are ${e.length} înscrieri active`);
  });

  suite.add(G, "cadența oprită nu înscrie automat la intrarea în etapă", async () => {
    const k3 = await cadence(S.a, { name: `Oprită ${mark()}`, triggerStage: "trial", enabled: false, steps: [{ dayOffset: 0, action: "task", title: "x" }] });
    expectOk(await moveStage(S.a, S.l3.id, "trial"));
    expect(!(await enrollmentsOf(S.a, S.l3.id)).some((x) => x.cadenceId === k3.id), "cadența oprită a înscris leadul");
  });

  suite.add(G, "mutarea în masă înscrie fiecare lead în cadența etapei", async () => {
    const a = await newLead(S.a);
    const b = await newLead(S.a);
    expectOk(await api(S.a, "POST", "/api/crm/leads/bulk", { leadIds: [a.id, b.id], action: "stage", stage: "contacted" }));
    for (const l of [a, b]) expect((await enrollmentsOf(S.a, l.id)).some((x) => x.cadenceId === S.k2.id), `leadul ${l.id} nu a fost înscris`);
  });

  suite.add(G, "o cadență oprită nu mai aprinde pașii înscrierilor existente", async () => {
    const m = mark();
    const k = await cadence(S.a, { name: `De oprit ${m}`, steps: [{ dayOffset: 0, action: "task", title: `Nu trebuia ${m}` }] });
    const l = await newLead(S.a);
    await enroll(S.a, l.id, k.id);
    expectOk(await api(S.a, "PATCH", `/api/crm/cadences/${k.id}`, { enabled: false }));
    await run(S.a);
    expect(!(await tasksOf(S.a, l.id)).some((x) => x.title === `Nu trebuia ${m}`), "cadența oprită (comutatorul „Pornit/oprit”) a aprins totuși un pas");
  });

  suite.add(G, "clientul care răspunde (interacțiune primită) își oprește cadența", async () => {
    const m = mark();
    const k = await cadence(S.a, { name: `Răspuns ${m}`, steps: [{ dayOffset: 0, action: "task", title: `R1 ${m}` }, { dayOffset: 5, action: "task", title: `R2 ${m}` }] });
    const l = await newLead(S.a);
    const e = await enroll(S.a, l.id, k.id);
    await run(S.a);
    expectOk(await api(S.a, "POST", `/api/crm/leads/${l.id}/interactions`, { type: "email", direction: "inbound", body: "Mulțumesc, revin eu" }));
    const after = (await enrollmentsOf(S.a, l.id)).find((x) => x.id === e.id);
    expect(after?.status === "cancelled", `înscrierea după răspuns: ${JSON.stringify(after)}`);
    expect((await interactionsOf(S.a, l.id)).some((x) => x.type === "system" && /s-a oprit/.test(x.body ?? "")), "lipsește nota de sistem despre oprire");
  });

  suite.add(G, "un apel dat de noi (ieșire) nu oprește cadența", async () => {
    const k = await cadence(S.a, { name: `Ieșire ${mark()}`, steps: [{ dayOffset: 2, action: "task", title: "x" }] });
    const l = await newLead(S.a);
    const e = await enroll(S.a, l.id, k.id);
    expectOk(await api(S.a, "POST", `/api/crm/leads/${l.id}/interactions`, { type: "call", direction: "outbound", body: "nu răspunde" }));
    expect((await enrollmentsOf(S.a, l.id)).find((x) => x.id === e.id)?.status === "active", "apelul nostru a oprit cadența");
  });

  suite.add(G, "editarea numelui și a pașilor se păstrează", async () => {
    expectOk(await api(S.a, "PATCH", `/api/crm/cadences/${S.k1.id}`, { name: `Urmărire nouă ${S.m}`, steps: [{ dayOffset: 1, action: "task", title: "Unic" }] }));
    const k = expectOk(await api(S.a, "GET", "/api/crm/cadences")).items.find((x) => x.id === S.k1.id);
    expect(k.name === `Urmărire nouă ${S.m}` && k.steps.length === 1 && k.steps[0].title === "Unic", `cadența: ${JSON.stringify(k)}`);
  });

  suite.add(G, "editarea unei cadențe inexistente → 404", async () => {
    expectStatus(await api(S.a, "PATCH", `/api/crm/cadences/${RANDOM_UUID}`, { name: "x" }), 404);
  });

  suite.add(G, "agentul vede cadențele", async () => {
    expect(expectOk(await api(S.agent, "GET", "/api/crm/cadences")).items.some((x) => x.id === S.k1.id), "agentul nu vede cadențele");
  });

  suite.add(G, "agentul poate înscrie un lead într-o cadență existentă", async () => {
    const l = await newLead(S.agent);
    S.agentEnr = await enroll(S.agent, l.id, S.k2.id);
  });

  suite.add(G, "agentul poate opri înscrierea făcută", async () => {
    expect(expectOk(await api(S.agent, "POST", `/api/crm/cadences/enrollments/${S.agentEnr.id}/cancel`)).status === "cancelled", "agentul nu a putut opri");
  });

  const agentForbidden = [
    ["creeze o cadență", "POST", "/api/crm/cadences", { name: "Agent" }],
    ["editeze o cadență", "PATCH", "/api/crm/cadences/:k", { name: "Agent" }],
    ["șteargă o cadență", "DELETE", "/api/crm/cadences/:k", undefined],
    ["pornească rularea pe tot workspace-ul", "POST", "/api/crm/cadences/run", undefined],
  ];
  suite.each(G, agentForbidden, ([w]) => `agentul nu poate să ${w} (403)`, async ([, m, p, body]) => {
    expectStatus(await api(S.agent, m, p.replace(":k", S.k2.id), body), 403);
  });

  suite.add(G, "rularea mea nu aprinde înscrierile altui workspace", async () => {
    const lb = await newLead(S.b);
    const eb = await enroll(S.b, lb.id, S.kb.id);
    await run(S.a);
    const after = (await enrollmentsOf(S.b, lb.id)).find((x) => x.id === eb.id);
    expect(after?.currentStep === 0 && after.status === "active", `înscrierea altui client a fost atinsă: ${JSON.stringify(after)}`);
  });

  suite.add(G, "ștergerea cadenței îi șterge și înscrierile", async () => {
    expectOk(await api(S.a, "DELETE", `/api/crm/cadences/${S.k2.id}`));
    expect(!(await enrollmentsOf(S.a, S.l3.id)).some((x) => x.cadenceId === S.k2.id), "înscrierile cadenței șterse au rămas");
  });

  suite.add(G, "a doua ștergere a cadenței → 404", async () => {
    expectStatus(await api(S.a, "DELETE", `/api/crm/cadences/${S.k2.id}`), 404);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// cadente:reactivare — clienții pierduți treziți după N luni
// ════════════════════════════════════════════════════════════════════════════
function registerReengagement(suite) {
  const G = "cadente:reactivare";
  const S = {};
  const P = "/api/crm/cadences/reengagement";

  suite.add(G, "workspace nou, cu un agent, fără reguli de reactivare", async () => {
    S.a = await signupTenant("reactivare");
    S.agent = await addMember(S.a, "teacher", "Agent Reactivare");
    S.b = await signupTenant("reactivare-alt");
    await stagesOf(S.a);
    expect(expectOk(await api(S.a, "GET", `${P}/rules`)).items.length === 0, "workspace nou cu reguli");
  });

  suite.add(G, "regula „task după 3 luni” se salvează", async () => {
    const r = await api(S.a, "POST", `${P}/rules`, { name: `Recâștigă ${RUN}`, afterMonths: 3, action: "create_task", taskTitle: "Sună din nou", lostReasons: ["Preț"] });
    expectStatus(r, 201);
    S.r1 = r.json;
    expect(S.r1.afterMonths === 3 && S.r1.action === "create_task" && S.r1.enabled === true && S.r1.orderIndex === 0, `regula: ${r.text.slice(0, 200)}`);
  });

  const bad = [
    ["după 0 luni", { name: "x", afterMonths: 0, action: "create_task" }],
    ["după 61 de luni", { name: "x", afterMonths: 61, action: "create_task" }],
    ["cu acțiune necunoscută", { name: "x", afterMonths: 3, action: "send_sms" }],
    ["fără nume", { name: "  ", afterMonths: 3, action: "create_task" }],
    ["cu o cadență care nu e uuid", { name: "x", afterMonths: 3, action: "enroll_cadence", cadenceId: "abc" }],
  ];
  suite.each(G, bad, ([w]) => `regula ${w} e refuzată (400)`, async ([, body]) => {
    expectStatus(await api(S.a, "POST", `${P}/rules`, body), 400);
  });

  suite.add(G, "„înscrie în cadență” fără cadență aleasă e refuzată (n-ar putea rula niciodată)", async () => {
    const r = await api(S.a, "POST", `${P}/rules`, { name: `FărăCadență ${RUN}`, afterMonths: 2, action: "enroll_cadence" });
    // Curățenie înainte de aserțiune: regula acceptată greșit n-are voie să strice ordinea din scenariile următoare.
    if (r.ok && r.json?.id) await api(S.a, "DELETE", `${P}/rules/${r.json.id}`);
    expectClientError(r);
  });

  suite.add(G, "„înscrie în cadență” cu o cadență proprie se salvează", async () => {
    const k = expectOk(await api(S.a, "POST", "/api/crm/cadences", { name: `Reactivare ${RUN}`, steps: [{ dayOffset: 0, action: "task", title: "Salut din nou" }] }));
    const r = await api(S.a, "POST", `${P}/rules`, { name: `Cadență ${RUN}`, afterMonths: 6, action: "enroll_cadence", cadenceId: k.id });
    expectStatus(r, 201);
    S.r2 = r.json;
    expect(S.r2.cadenceId === k.id && S.r2.orderIndex === 1, `regula: ${r.text.slice(0, 200)}`);
  });

  suite.add(G, "o cadență din alt workspace nu poate fi pusă pe regulă (404)", async () => {
    S.kb = expectOk(await api(S.b, "POST", "/api/crm/cadences", { name: `Străină ${RUN}` }));
    expectStatus(await api(S.a, "POST", `${P}/rules`, { name: "x", afterMonths: 3, action: "enroll_cadence", cadenceId: S.kb.id }), 404);
  });

  suite.add(G, "nici prin editare nu se poate lega o cadență din alt workspace", async () => {
    const r = await api(S.a, "PATCH", `${P}/rules/${S.r2.id}`, { cadenceId: S.kb.id });
    expectNo5xx(r);
    const rule = expectOk(await api(S.a, "GET", `${P}/rules`)).items.find((x) => x.id === S.r2.id);
    expect(r.status >= 400 && rule.cadenceId !== S.kb.id, `editarea a acceptat cadența altui client (HTTP ${r.status}, cadenceId=${rule.cadenceId})`);
  });

  suite.add(G, "editarea pragului se păstrează", async () => {
    expectOk(await api(S.a, "PATCH", `${P}/rules/${S.r1.id}`, { afterMonths: 12, enabled: false }));
    const rule = expectOk(await api(S.a, "GET", `${P}/rules`)).items.find((x) => x.id === S.r1.id);
    expect(rule.afterMonths === 12 && rule.enabled === false, `regula: ${JSON.stringify(rule)}`);
    expectOk(await api(S.a, "PATCH", `${P}/rules/${S.r1.id}`, { afterMonths: 1, enabled: true }));
  });

  suite.add(G, "editarea unei reguli inexistente → 404", async () => {
    expectStatus(await api(S.a, "PATCH", `${P}/rules/${RANDOM_UUID}`, { afterMonths: 2 }), 404);
  });

  suite.add(G, "un client pierdut azi nu e încă de trezit (previzualizare goală)", async () => {
    S.lost = await newLead(S.a);
    expectOk(await moveStage(S.a, S.lost.id, "lost", "Preț"));
    const items = expectOk(await api(S.a, "GET", `${P}/preview`)).items;
    expect(!items.some((x) => x.leadId === S.lost.id), `clientul pierdut azi apare de trezit: ${JSON.stringify(items)}`);
  });

  suite.add(G, "rularea acum nu atinge clientul pierdut azi", async () => {
    const before = (await tasksOf(S.a, S.lost.id)).length;
    const j = expectOk(await api(S.a, "POST", `${P}/run`));
    expect(j.ok === true && j.due === 0 && j.applied === 0, `rulare: ${JSON.stringify(j)}`);
    expect((await tasksOf(S.a, S.lost.id)).length === before, "rularea a creat un task pe clientul pierdut azi");
  });

  suite.add(G, "agentul poate vedea previzualizarea", async () => {
    expectOk(await api(S.agent, "GET", `${P}/preview`));
  });

  const agentForbidden = [
    ["creeze o regulă", "POST", `${P}/rules`, { name: "x", afterMonths: 3, action: "create_task" }],
    ["editeze o regulă", "PATCH", `${P}/rules/:r`, { afterMonths: 2 }],
    ["șteargă o regulă", "DELETE", `${P}/rules/:r`, undefined],
    ["pornească reactivarea", "POST", `${P}/run`, undefined],
  ];
  suite.each(G, agentForbidden, ([w]) => `agentul nu poate să ${w} (403)`, async ([, m, p, body]) => {
    expectStatus(await api(S.agent, m, p.replace(":r", S.r1.id), body), 403);
  });

  suite.add(G, "alt client nu vede și nu poate șterge regulile mele", async (ctx) => {
    const r = await api(ctx.other, "GET", `${P}/rules`);
    expectNo5xx(r);
    expect(!r.text.includes(S.r1.id), "lista altui client conține regula mea");
    expectStatus(await api(ctx.other, "DELETE", `${P}/rules/${S.r1.id}`), 404);
  });

  suite.add(G, "ștergerea scoate regula din listă", async () => {
    expectOk(await api(S.a, "DELETE", `${P}/rules/${S.r1.id}`));
    expect(!expectOk(await api(S.a, "GET", `${P}/rules`)).items.some((x) => x.id === S.r1.id), "regula ștearsă e încă în listă");
  });

  suite.add(G, "a doua ștergere a regulii → 404", async () => {
    expectStatus(await api(S.a, "DELETE", `${P}/rules/${S.r1.id}`), 404);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// repartizare:reguli — distribuirea automată a leadurilor noi între agenți
// ════════════════════════════════════════════════════════════════════════════
function registerAssignment(suite) {
  const G = "repartizare:reguli";
  const S = {};
  const R = "/api/crm/assignment";
  const members = async () => expectOk(await api(S.a, "GET", `${R}/members`)).items;
  const logOf = async (leadId) => expectOk(await api(S.a, "GET", `${R}/log?leadId=${leadId}`)).items;
  async function rule(body) {
    const r = await api(S.a, "POST", `${R}/rules`, body);
    expectStatus(r, 201, `regula „${body.name}”: `);
    return r.json;
  }
  const setMember = async (id, body) => expectOk(await api(S.a, "PATCH", `${R}/members/${id}`, body), "setările omului: ");

  suite.add(G, "workspace cu administrator + doi agenți + un manager, toți cu setări implicite", async () => {
    S.a = await signupTenant("repartizare");
    S.A = await addMember(S.a, "teacher", "Agent Ana");
    S.B = await addMember(S.a, "teacher", "Agent Bogdan");
    S.C = await addMember(S.a, "manager", "Manager Cristi");
    await stagesOf(S.a);
    const m = await members();
    expect(m.length === 4, `rosterul are ${m.length} oameni`);
    expect(m.every((x) => x.isActive && x.dailyCapacity === 20 && x.weight === 1 && x.hasSettings === false && x.assignedToday === 0), `setări: ${JSON.stringify(m)}`);
  });

  suite.add(G, "fără nicio regulă, leadul nou rămâne neatribuit și jurnalul tace", async () => {
    const l = await newLead(S.a);
    expect(l.assignedTo === null, "leadul a fost atribuit fără reguli");
    expect((await logOf(l.id)).length === 0, "jurnalul are un rând fără nicio regulă");
  });

  suite.add(G, "regula „pe rând” între Ana și Bogdan se salvează", async () => {
    S.rr = await rule({ name: `Pe rând ${RUN}`, strategy: "round_robin", userIds: [S.A.user.id, S.B.user.id], templateKey: "dist-round-robin" });
    expect(S.rr.enabled === true && S.rr.orderIndex === 0 && S.rr.templateKey === "dist-round-robin", `regula: ${JSON.stringify(S.rr)}`);
  });

  suite.add(G, "patru leaduri noi se împart alternativ: Ana, Bogdan, Ana, Bogdan", async () => {
    S.rrLeads = [];
    for (let i = 0; i < 4; i++) S.rrLeads.push(await newLead(S.a, { fullName: `Rotație ${i} ${RUN}` }));
    const who = S.rrLeads.map((l) => l.assignedTo);
    const ab = new Set([S.A.user.id, S.B.user.id]);
    expect(who.every((w) => ab.has(w)), `responsabili: ${who}`);
    for (let i = 1; i < who.length; i++) expect(who[i] !== who[i - 1], `rotația nu alternează: ${who.join(" → ")}`);
  });

  suite.add(G, "fiecare lead atribuit are în cronologie „Atribuit automat lui …”", async () => {
    const it = (await interactionsOf(S.a, S.rrLeads[0].id)).find((x) => x.type === "system" && /Atribuit automat lui/.test(x.body ?? ""));
    expect(it && it.metadata?.auto === true && it.metadata?.ruleId === S.rr.id, `urma: ${JSON.stringify(it)}`);
  });

  suite.add(G, "jurnalul explică atribuirea: regula, strategia, omul, motivul", async () => {
    const e = (await logOf(S.rrLeads[1].id))[0];
    expect(e && e.ruleName === `Pe rând ${RUN}` && e.strategy === "round_robin" && e.userId === S.rrLeads[1].assignedTo, `jurnal: ${JSON.stringify(e)}`);
    expect(/Agent (Ana|Bogdan)/.test(e.reason) && e.userName, `motivul nu spune cine: ${e.reason}`);
  });

  suite.add(G, "jurnalul filtrat pe un lead întoarce doar leadul acela", async () => {
    const items = await logOf(S.rrLeads[2].id);
    expect(items.length === 1 && items[0].leadId === S.rrLeads[2].id, `jurnal: ${JSON.stringify(items)}`);
  });

  suite.add(G, "jurnalul cu un leadId stricat → 400", async () => {
    expectStatus(await api(S.a, "GET", `${R}/log?leadId=abc`), 400);
  });

  suite.add(G, "leadul atribuit explicit la creare nu e furat de regulă", async () => {
    const l = await newLead(S.a, { assignedTo: S.C.user.id });
    expect(l.assignedTo === S.C.user.id, `leadul lui Cristi a ajuns la ${l.assignedTo}`);
    expect((await logOf(l.id)).length === 0, "jurnalul are o atribuire automată pe un lead deja atribuit");
  });

  suite.add(G, "regula condiționată (Google Ads → Cristi) bate regula generală, deși e scrisă după ea", async () => {
    S.google = await rule({ name: `Google la Cristi ${RUN}`, strategy: "fixed", userIds: [S.C.user.id], conditions: [{ field: "source", op: "eq", value: "google_ads" }] });
    expect(S.google.orderIndex === 1, `ordinea: ${S.google.orderIndex}`);
    S.gLead = await newLead(S.a, { source: "google_ads" });
    expect(S.gLead.assignedTo === S.C.user.id, `leadul Google a ajuns la ${S.gLead.assignedTo}`);
  });

  suite.add(G, "leadurile care nu vin din Google rămân pe rotația Ana/Bogdan", async () => {
    const l = await newLead(S.a, { source: "webform" });
    expect([S.A.user.id, S.B.user.id].includes(l.assignedTo), `leadul a ajuns la ${l.assignedTo}`);
  });

  suite.add(G, "previzualizarea arată cui i-ar reveni leadul, fără să scrie nimic", async () => {
    await importCsv(S.a, [{ name: `Importat Unu ${RUN}`, phone: phone() }]);
    S.imp1 = await leadIdByName(S.a, `Importat Unu ${RUN}`);
    const j = expectOk(await api(S.a, "POST", `${R}/preview`, { leadId: S.imp1 }));
    expect([S.A.user.id, S.B.user.id].includes(j.decision?.userId) && j.decision.outcome === "assigned", `decizie: ${JSON.stringify(j.decision)}`);
    expect(Array.isArray(j.candidates) && j.candidates.length === 4 && j.userName, `candidați: ${JSON.stringify(j.candidates)}`);
    S.previewUser = j.decision.userId;
    expect((await getLead(S.a, S.imp1)).assignedTo === null, "previzualizarea a atribuit leadul");
    expect((await logOf(S.imp1)).length === 0, "previzualizarea a scris în jurnal");
  });

  suite.add(G, "aplicarea scrie exact ce a arătat previzualizarea", async () => {
    const j = expectOk(await api(S.a, "POST", `${R}/apply`, { leadId: S.imp1 }));
    expect(j.decision?.userId === S.previewUser, `previzualizare ${S.previewUser}, aplicare ${j.decision?.userId}`);
    expect((await getLead(S.a, S.imp1)).assignedTo === S.previewUser, "leadul nu a fost atribuit");
    expect((await logOf(S.imp1)).length === 1, "aplicarea nu a scris în jurnal");
  });

  suite.add(G, "previzualizarea/aplicarea pe un lead inexistent → 404", async () => {
    expectStatus(await api(S.a, "POST", `${R}/preview`, { leadId: RANDOM_UUID }), 404);
    expectStatus(await api(S.a, "POST", `${R}/apply`, { leadId: RANDOM_UUID }), 404);
  });

  suite.add(G, "regula generală oprită → leadul nou rămâne neatribuit, fără rând în jurnal", async () => {
    const j = expectOk(await api(S.a, "PATCH", `${R}/rules/${S.rr.id}`, { enabled: false }));
    expect(j.enabled === false, "regula nu s-a oprit");
    S.noRule = await newLead(S.a, { source: "webform" });
    expect(S.noRule.assignedTo === null, `leadul a ajuns la ${S.noRule.assignedTo}`);
    expect((await logOf(S.noRule.id)).length === 0, "jurnalul are un rând fără regulă potrivită");
  });

  suite.add(G, "aplicarea cerută explicit, fără regulă potrivită, lasă un răspuns scris în jurnal", async () => {
    const j = expectOk(await api(S.a, "POST", `${R}/apply`, { leadId: S.noRule.id }));
    expect(j.decision?.outcome === "no_rule" && j.decision.userId === null, `decizie: ${JSON.stringify(j.decision)}`);
    const e = (await logOf(S.noRule.id))[0];
    expect(e && e.userId === null && /Nicio regulă/.test(e.reason), `jurnal: ${JSON.stringify(e)}`);
  });

  suite.add(G, "agentul scos din tragere nu mai primește leaduri", async () => {
    expectOk(await api(S.a, "PATCH", `${R}/rules/${S.rr.id}`, { enabled: true }));
    const u = await setMember(S.A.user.id, { isActive: false });
    expect(u.isActive === false && u.hasSettings === true && u.userId === S.A.user.id, `setări: ${JSON.stringify(u)}`);
    for (let i = 0; i < 2; i++) {
      const l = await newLead(S.a);
      expect(l.assignedTo === S.B.user.id, `leadul ${i} a ajuns la ${l.assignedTo}, nu la Bogdan`);
    }
  });

  suite.add(G, "agentul repus în tragere primește din nou", async () => {
    await setMember(S.A.user.id, { isActive: true });
    const l = await newLead(S.a);
    expect(l.assignedTo === S.A.user.id, `după Bogdan, leadul a ajuns la ${l.assignedTo}, nu la Ana`);
  });

  suite.add(G, "după capacitate: cine mai are loc azi primește", async () => {
    S.cap = await rule({ name: `Capacitate ${RUN}`, strategy: "capacity", userIds: [S.A.user.id, S.B.user.id], conditions: [{ field: "source", op: "eq", value: "referral" }] });
    const m = await members();
    const a = m.find((x) => x.userId === S.A.user.id), b = m.find((x) => x.userId === S.B.user.id);
    expect(b.assignedToday > 0, `Bogdan nu are atribuiri azi: ${b.assignedToday}`);
    await setMember(S.A.user.id, { dailyCapacity: a.assignedToday + 5 });
    await setMember(S.B.user.id, { dailyCapacity: b.assignedToday });
    const l = await newLead(S.a, { source: "referral" });
    expect(l.assignedTo === S.A.user.id, `leadul a ajuns la ${l.assignedTo}; Bogdan era plin`);
  });

  suite.add(G, "toți plini → leadul rămâne neatribuit, iar jurnalul spune de ce", async () => {
    const a = (await members()).find((x) => x.userId === S.A.user.id);
    await setMember(S.A.user.id, { dailyCapacity: a.assignedToday });
    const l = await newLead(S.a, { source: "referral" });
    expect(l.assignedTo === null, `leadul a fost dat peste normă lui ${l.assignedTo}`);
    const e = (await logOf(l.id))[0];
    expect(e && e.userId === null && e.strategy === "capacity" && /norma/.test(e.reason), `jurnal: ${JSON.stringify(e)}`);
  });

  suite.add(G, "norma 0 înseamnă nelimitat", async () => {
    await setMember(S.B.user.id, { dailyCapacity: 0 });
    const l = await newLead(S.a, { source: "referral" });
    expect(l.assignedTo === S.B.user.id, `leadul a ajuns la ${l.assignedTo}; Bogdan are normă nelimitată`);
  });

  suite.add(G, "ponderat: greutatea mare ia leadurile până se echilibrează raportul", async () => {
    await rule({ name: `Ponderat ${RUN}`, strategy: "weighted", userIds: [S.A.user.id, S.B.user.id], conditions: [{ field: "source", op: "eq", value: "instagram" }] });
    await setMember(S.A.user.id, { weight: 100 });
    await setMember(S.B.user.id, { weight: 1 });
    for (let i = 0; i < 3; i++) {
      const m = (await members()).filter((x) => [S.A.user.id, S.B.user.id].includes(x.userId));
      const ratio = (x) => x.assignedToday / (x.weight > 0 ? x.weight : 1);
      const expected = [...m].sort((x, y) => ratio(x) - ratio(y) || x.orderIndex - y.orderIndex || x.userId.localeCompare(y.userId))[0].userId;
      const l = await newLead(S.a, { source: "instagram" });
      expect(l.assignedTo === expected, `leadul ${i} a ajuns la ${l.assignedTo}, așteptat ${expected} (cel mai mic raport primite/greutate)`);
    }
  });

  suite.add(G, "teritoriu: leadul din Nord ajunge la agentul din Nord, cel din Sud la cel din Sud", async () => {
    await rule({ name: `Teritoriu ${RUN}`, strategy: "territory", userIds: [S.A.user.id, S.B.user.id], conditions: [{ field: "region", op: "exists" }] });
    await setMember(S.A.user.id, { regions: ["Nord"] });
    await setMember(S.B.user.id, { regions: ["Sud"] });
    await importCsv(S.a, [
      { name: `Nordic ${RUN}`, phone: phone(), company: `Nord SRL ${RUN}`, region: "Nord" },
      { name: `Sudic ${RUN}`, phone: phone(), company: `Sud SRL ${RUN}`, region: "Sud" },
      { name: `Estic ${RUN}`, phone: phone(), company: `Est SRL ${RUN}`, region: "Est" },
    ]);
    const n = expectOk(await api(S.a, "POST", `${R}/apply`, { leadId: await leadIdByName(S.a, `Nordic ${RUN}`) }));
    const s = expectOk(await api(S.a, "POST", `${R}/apply`, { leadId: await leadIdByName(S.a, `Sudic ${RUN}`) }));
    expect(n.decision.userId === S.A.user.id, `Nord → ${n.decision.userId} (${n.decision.reason})`);
    expect(s.decision.userId === S.B.user.id, `Sud → ${s.decision.userId} (${s.decision.reason})`);
  });

  suite.add(G, "teritoriu neacoperit de nimeni → neatribuit, cu motiv „teritoriu”", async () => {
    S.est = await leadIdByName(S.a, `Estic ${RUN}`);
    const j = expectOk(await api(S.a, "POST", `${R}/preview`, { leadId: S.est }));
    expect(j.decision.userId === null && j.decision.outcome === "no_candidates" && /teritoriu/.test(j.decision.reason), `decizie: ${JSON.stringify(j.decision)}`);
  });

  suite.add(G, "agentul fără regiuni acoperă orice regiune", async () => {
    await setMember(S.B.user.id, { regions: [] });
    const j = expectOk(await api(S.a, "POST", `${R}/apply`, { leadId: S.est }));
    expect(j.decision.userId === S.B.user.id, `Est → ${j.decision.userId}`);
  });

  suite.add(G, "o regulă doar cu oameni din alt workspace nu găsește pe nimeni eligibil", async (ctx) => {
    const foreign = await rule({ name: `Străini ${RUN}`, strategy: "fixed", userIds: [ctx.other.user.id], conditions: [{ field: "source", op: "eq", value: "import" }] });
    await importCsv(S.a, [{ name: `FărăFirmă ${RUN}`, phone: phone() }]);
    const id = await leadIdByName(S.a, `FărăFirmă ${RUN}`);
    const j = expectOk(await api(S.a, "POST", `${R}/preview`, { leadId: id }));
    await api(S.a, "DELETE", `${R}/rules/${foreign.id}`);
    expect(j.decision.ruleId === foreign.id && j.decision.userId === null && j.decision.outcome === "no_candidates", `decizie: ${JSON.stringify(j.decision)}`);
  });

  suite.add(G, "reordonarea schimbă prioritățile; id-urile străine sunt ignorate", async () => {
    const ids = expectOk(await api(S.a, "GET", `${R}/rules`)).items.map((x) => x.id);
    const rev = [...ids].reverse();
    const j = expectOk(await api(S.a, "POST", `${R}/rules/reorder`, { ids: [RANDOM_UUID, ...rev] }));
    expect(j.items.map((x) => x.id).join() === rev.join(), `ordinea nouă: ${j.items.map((x) => x.name).join(", ")}`);
    const again = expectOk(await api(S.a, "GET", `${R}/rules`)).items;
    expect(again.every((x, i) => x.orderIndex === i && x.id === rev[i]), "ordinea nu s-a păstrat la recitire");
  });

  suite.add(G, "reordonarea fără id-uri → 400", async () => {
    expectStatus(await api(S.a, "POST", `${R}/rules/reorder`, { ids: [] }), 400);
  });

  suite.add(G, "editarea unei reguli inexistente → 404", async () => {
    expectStatus(await api(S.a, "PATCH", `${R}/rules/${RANDOM_UUID}`, { name: "Nimic" }), 404);
  });

  suite.add(G, "ștergerea unei reguli păstrează motivele atribuirilor deja făcute", async () => {
    expectOk(await api(S.a, "DELETE", `${R}/rules/${S.google.id}`));
    const e = (await logOf(S.gLead.id))[0];
    expect(e && e.userId === S.C.user.id && /Google la Cristi/.test(e.reason) && e.ruleId === null, `jurnal după ștergere: ${JSON.stringify(e)}`);
  });

  suite.add(G, "după ștergerea regulii Google, un lead Google intră în rotația generală", async () => {
    const l = await newLead(S.a, { source: "google_ads" });
    expect(l.assignedTo !== S.C.user.id, "regula ștearsă încă trimite la Cristi");
  });

  suite.add(G, "setările unui om din alt workspace nu se pot schimba (404)", async (ctx) => {
    expectStatus(await api(S.a, "PATCH", `${R}/members/${ctx.other.user.id}`, { dailyCapacity: 999 }), 404);
  });

  const badSettings = [["normă negativă", { dailyCapacity: -1 }], ["greutate peste 100", { weight: 101 }], ["normă peste 1000", { dailyCapacity: 1001 }]];
  suite.each(G, badSettings, ([w]) => `setarea cu ${w} e refuzată (400)`, async ([, body]) => {
    expectStatus(await api(S.a, "PATCH", `${R}/members/${S.A.user.id}`, body), 400);
  });

  const badRules = [["nume de o literă", { name: "x" }], ["strategie necunoscută", { name: "Regulă", strategy: "random" }], ["om care nu e uuid", { name: "Regulă", userIds: ["abc"] }]];
  suite.each(G, badRules, ([w]) => `regula cu ${w} e refuzată (400)`, async ([, body]) => {
    expectStatus(await api(S.a, "POST", `${R}/rules`, body), 400);
  });

  suite.add(G, "agentul vede rosterul și regulile", async () => {
    expectOk(await api(S.A, "GET", `${R}/members`));
    expectOk(await api(S.A, "GET", `${R}/rules`));
  });

  suite.add(G, "agentul nu poate crea reguli (403)", async () => {
    expectStatus(await api(S.A, "POST", `${R}/rules`, { name: "Toate la mine" }), 403);
  });

  suite.add(G, "agentul nu își poate mări singur norma (403)", async () => {
    expectStatus(await api(S.A, "PATCH", `${R}/members/${S.A.user.id}`, { dailyCapacity: 1000 }), 403);
  });

  suite.add(G, "managerul poate administra regulile", async () => {
    const r = await api(S.C, "POST", `${R}/rules`, { name: `De la manager ${RUN}`, enabled: false });
    expectStatus(r, 201);
    expectOk(await api(S.C, "DELETE", `${R}/rules/${r.json.id}`));
  });

  suite.add(G, "omul dezactivat din echipă iese din tragere", async () => {
    expectOk(await api(S.a, "PUT", `/api/crm/team/members/${S.C.user.id}/active`, { active: false }));
    const m = await members();
    expect(!m.some((x) => x.userId === S.C.user.id), "omul dezactivat e încă în roster");
  });

  suite.add(G, "alt client nu vede rosterul și jurnalul meu", async (ctx) => {
    for (const p of [`${R}/members`, `${R}/log`, `${R}/rules`]) {
      const r = await api(ctx.other, "GET", p);
      expectNo5xx(r);
      expect(!r.text.includes(S.A.user.id) && !r.text.includes(S.rr.id), `${p} scurge date către alt client`);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// repartizare:loturi — „200 lui Ana, 200 lui Bo, restul rămân în rezervă”
// ════════════════════════════════════════════════════════════════════════════
function registerDistribution(suite) {
  const G = "repartizare:loturi";
  const S = {};
  const D = "/api/crm/distribution";
  const pool = async (q = "") => expectOk(await api(S.a, "GET", `${D}/pool${q}`)).pool;
  const preview = async (body) => expectOk(await api(S.a, "POST", `${D}/preview`, body), "previzualizarea: ");
  const ownedBy = async (u) => (await leadsWhere(S.a, `assignedTo=${u}`));

  suite.add(G, "workspace cu doi agenți, 10 contacte importate (în două loturi) și un client pierdut", async () => {
    S.a = await signupTenant("loturi");
    S.A = await addMember(S.a, "teacher", "Agent Ana");
    S.B = await addMember(S.a, "teacher", "Agent Bogdan");
    await stagesOf(S.a);
    await importCsv(S.a, ["Nord", "Nord", "Nord", "Sud", "Sud"].map((region, i) => ({ name: `Vechi${i} ${RUN}`, phone: phone(), company: `Vechi${i} SRL ${RUN}`, region })));
    await sleep(50);
    await importCsv(S.a, ["Nord", "Sud", "Nord", "Sud", "Nord"].map((region, i) => ({ name: `Nou${i} ${RUN}`, phone: phone(), company: `Nou${i} SRL ${RUN}`, region })));
    const lost = await newLead(S.a, { fullName: `Pierdut ${RUN}` });
    expectOk(await moveStage(S.a, lost.id, "lost", "Nu are buget"));
    S.lost = lost.id;
  });

  suite.add(G, "rezerva numără doar contactele deschise nerepartizate", async () => {
    S.pool0 = await pool();
    const p = await preview({ allocations: [{ userId: S.A.user.id, count: 1 }] });
    expect(p.available === 10, `disponibile la repartizare: ${p.available}`);
    expect(S.pool0 === p.available, `rezerva arată ${S.pool0}, dar repartizarea are ${p.available} disponibile — clientul pierdut e numărat în rezervă`);
  });

  suite.add(G, "rezerva filtrată pe regiunea Nord", async () => {
    expect((await pool("?region=Nord")) === 6, `rezerva Nord: ${await pool("?region=Nord")}`);
  });

  suite.add(G, "previzualizarea manuală: Ana 3, Bogdan 2 din 10", async () => {
    const p = await preview({ allocations: [{ userId: S.A.user.id, count: 3 }, { userId: S.B.user.id, count: 2 }] });
    const a = p.allocations.find((x) => x.userId === S.A.user.id), b = p.allocations.find((x) => x.userId === S.B.user.id);
    expect(p.available === 10 && p.requested === 5 && p.remaining === 5 && p.shortfall === 0, `plan: ${JSON.stringify(p)}`);
    expect(a.given === 3 && b.given === 2 && a.name === "Agent Ana", `alocări: ${JSON.stringify(p.allocations)}`);
    expect(p.picks === undefined, "previzualizarea expune id-urile interne");
  });

  suite.add(G, "previzualizarea nu mută nimic", async () => {
    expect((await pool()) === S.pool0, "rezerva s-a schimbat după o previzualizare");
    expect((await ownedBy(S.A.user.id)).length === 0, "Ana are deja contacte după previzualizare");
  });

  suite.add(G, "repartizarea dă Anei 3 și lui Bogdan 2 contacte", async () => {
    const j = expectOk(await api(S.a, "POST", `${D}/run`, { allocations: [{ userId: S.A.user.id, count: 3 }, { userId: S.B.user.id, count: 2 }] }));
    expect(j.ok === true && j.shortfall === 0, `rulare: ${JSON.stringify(j)}`);
    S.aLeads = await ownedBy(S.A.user.id);
    S.bLeads = await ownedBy(S.B.user.id);
    expect(S.aLeads.length === 3 && S.bLeads.length === 2, `Ana ${S.aLeads.length}, Bogdan ${S.bLeads.length}`);
  });

  suite.add(G, "se dau cele mai vechi contacte întâi", async () => {
    const names = [...S.aLeads, ...S.bLeads].map((l) => l.fullName);
    expect(names.every((n) => n.startsWith("Vechi")), `au fost date: ${names.join(", ")}`);
  });

  suite.add(G, "fiecare contact dat are o linie în cronologie", async () => {
    const it = (await interactionsOf(S.a, S.aLeads[0].id)).find((x) => x.type === "system" && /Repartizat către Agent Ana/.test(x.body ?? ""));
    expect(it, "cronologia nu spune de ce a primit Ana contactul");
  });

  suite.add(G, "rezerva scade exact cu cât s-a dat", async () => {
    expect((await pool()) === S.pool0 - 5, `rezerva: ${await pool()}, înainte ${S.pool0}`);
  });

  suite.add(G, "a doua previzualizare nu mai numără ce s-a dat", async () => {
    expect((await preview({ allocations: [{ userId: S.A.user.id, count: 1 }] })).available === 5, "contactele date sunt încă disponibile");
  });

  suite.add(G, "cu „și cele deja repartizate”, se numără toate cele deschise (fără clientul pierdut)", async () => {
    const p = await preview({ onlyUnassigned: false, allocations: [{ userId: S.A.user.id, count: 1 }] });
    expect(p.available === 10, `disponibile: ${p.available}`);
  });

  suite.add(G, "etapa cerută explicit („pierdut”) aduce doar clientul pierdut", async () => {
    expect((await preview({ stage: "lost", allocations: [{ userId: S.A.user.id, count: 1 }] })).available === 1, "filtrul pe etapă nu funcționează");
  });

  suite.add(G, "cerere peste stoc → lipsa se raportează, nu se inventează contacte", async () => {
    const p = await preview({ allocations: [{ userId: S.A.user.id, count: 50 }] });
    expect(p.allocations[0].given === 5 && p.shortfall === 45 && p.remaining === 0, `plan: ${JSON.stringify(p)}`);
  });

  suite.add(G, "un om din alt workspace → 400 și nimic nu se mută", async (ctx) => {
    const before = await pool();
    const r = await api(S.a, "POST", `${D}/run`, { allocations: [{ userId: S.A.user.id, count: 1 }, { userId: ctx.other.user.id, count: 1 }] });
    expectStatus(r, 400);
    expect(r.json?.error === "unknown_members" && r.json.members?.includes(ctx.other.user.id), `răspuns: ${r.text.slice(0, 160)}`);
    expect((await pool()) === before, "o repartizare refuzată a mutat totuși contacte");
  });

  const bad = [
    ["manual fără alocări", { mode: "manual" }],
    ["automat fără agenți bifați", { mode: "auto", userIds: [] }],
    ["peste 5000 de contacte", { mode: "auto", userIds: [RANDOM_UUID], count: 5001 }],
    ["alocare de 0 contacte", { allocations: [{ userId: RANDOM_UUID, count: 0 }] }],
    ["strategie necunoscută", { mode: "auto", userIds: [RANDOM_UUID], strategy: "random" }],
  ];
  suite.each(G, bad, ([w]) => `cererea ${w} e refuzată (400)`, async ([, body]) => {
    expectStatus(await api(S.a, "POST", `${D}/preview`, body), 400);
  });

  suite.add(G, "automat, pe rând: 4 contacte → 2 și 2", async () => {
    const p = await preview({ mode: "auto", userIds: [S.A.user.id, S.B.user.id], count: 4, strategy: "round_robin" });
    expect(p.allocations.map((x) => x.given).sort().join() === "2,2" && p.requested === 4, `plan: ${JSON.stringify(p.allocations)}`);
  });

  suite.add(G, "automat, ponderat 3:1 → 3 și 1", async () => {
    expectOk(await api(S.a, "PATCH", `/api/crm/assignment/members/${S.A.user.id}`, { weight: 3 }));
    expectOk(await api(S.a, "PATCH", `/api/crm/assignment/members/${S.B.user.id}`, { weight: 1 }));
    const p = await preview({ mode: "auto", userIds: [S.A.user.id, S.B.user.id], count: 4, strategy: "weighted" });
    const a = p.allocations.find((x) => x.userId === S.A.user.id)?.given, b = p.allocations.find((x) => x.userId === S.B.user.id)?.given;
    expect(a === 3 && b === 1, `Ana ${a}, Bogdan ${b}`);
  });

  suite.add(G, "automat, după capacitate: agentul plin nu primește, restul rămâne în rezervă", async () => {
    expectOk(await api(S.a, "PATCH", `/api/crm/assignment/members/${S.A.user.id}`, { dailyCapacity: 3 }));
    expectOk(await api(S.a, "PATCH", `/api/crm/assignment/members/${S.B.user.id}`, { dailyCapacity: 3 }));
    const p = await preview({ mode: "auto", userIds: [S.A.user.id, S.B.user.id], count: 4, strategy: "capacity" });
    const a = p.allocations.find((x) => x.userId === S.A.user.id)?.given ?? 0, b = p.allocations.find((x) => x.userId === S.B.user.id)?.given ?? 0;
    expect(a === 0 && b === 1 && p.shortfall === 3, `Ana ${a} (plină, 3/3), Bogdan ${b} (2/3), lipsă ${p.shortfall}`);
  });

  suite.add(G, "automat, după regulile de distribuire, fără reguli active → nu se dă nimic", async () => {
    const p = await preview({ mode: "auto", userIds: [S.A.user.id, S.B.user.id], strategy: "rules" });
    expect(p.allocations.every((x) => x.given === 0) && p.remaining === p.available, `plan: ${JSON.stringify(p)}`);
  });

  suite.add(G, "repartizarea automată pe rând chiar mută contactele", async () => {
    const beforeA = (await ownedBy(S.A.user.id)).length, beforeB = (await ownedBy(S.B.user.id)).length;
    const j = expectOk(await api(S.a, "POST", `${D}/run`, { mode: "auto", userIds: [S.A.user.id, S.B.user.id], count: 2, strategy: "round_robin" }));
    expect(j.ok === true, `rulare: ${JSON.stringify(j)}`);
    expect((await ownedBy(S.A.user.id)).length === beforeA + 1 && (await ownedBy(S.B.user.id)).length === beforeB + 1, "contactele nu au fost împărțite 1 și 1");
  });

  suite.add(G, "filtrul de regiune din repartizare dă același număr ca rezerva filtrată", async () => {
    const p = await preview({ filters: { region: "Sud" }, allocations: [{ userId: S.A.user.id, count: 1 }] });
    expect(p.available === (await pool("?region=Sud")), `repartizare ${p.available}, rezervă ${await pool("?region=Sud")}`);
  });

  suite.add(G, "o pâlnie nouă, goală, nu are nimic de repartizat", async () => {
    const pl = expectOk(await api(S.a, "POST", "/api/crm/pipelines", { name: `Goală ${RUN}`, template: "call_center" }));
    expect((await preview({ pipelineId: pl.id, allocations: [{ userId: S.A.user.id, count: 1 }] })).available === 0, "pâlnia goală are contacte disponibile");
    expect((await pool(`?pipelineId=${pl.id}`)) === 0, "rezerva pâlniei goale nu e 0");
  });

  suite.add(G, "repartizarea lasă urmă în jurnalul CRM", async () => {
    const items = listOf(expectOk(await api(S.a, "GET", "/api/crm/audit"))) ?? [];
    expect(items.some((x) => /leads\.distributed/.test(x.actionType ?? "")), `jurnal: ${items.map((x) => x.actionType).join(", ")}`);
  });

  suite.add(G, "agentul vede rezerva", async () => {
    expectOk(await api(S.A, "GET", `${D}/pool`));
  });

  suite.add(G, "agentul nu poate previzualiza o repartizare (403)", async () => {
    expectStatus(await api(S.A, "POST", `${D}/preview`, { allocations: [{ userId: S.A.user.id, count: 1 }] }), 403);
  });

  suite.add(G, "agentul nu își poate da singur contacte (403)", async () => {
    const before = await pool();
    expectStatus(await api(S.A, "POST", `${D}/run`, { allocations: [{ userId: S.A.user.id, count: 3 }] }), 403);
    expect((await pool()) === before, "agentul și-a luat totuși contacte");
  });

  suite.add(G, "întoarcerea în rezervă e oprită implicit (14 zile)", async () => {
    const j = expectOk(await api(S.a, "GET", `${D}/recall`));
    expect(j.enabled === false && j.days === 14 && j.due === 0, `setări: ${JSON.stringify(j)}`);
  });

  suite.add(G, "pornirea întoarcerii după 7 zile se salvează", async () => {
    const j = expectOk(await api(S.a, "PUT", `${D}/recall`, { enabled: true, days: 7 }));
    expect(j.enabled === true && j.days === 7, `răspuns: ${JSON.stringify(j)}`);
    const g = expectOk(await api(S.a, "GET", `${D}/recall`));
    expect(g.enabled === true && g.days === 7, `la recitire: ${JSON.stringify(g)}`);
  });

  suite.add(G, "contactele date azi nu sunt de întors (due = 0)", async () => {
    expect(expectOk(await api(S.a, "GET", `${D}/recall`)).due === 0, "contacte proaspăt date apar ca neatinse");
  });

  const badRecall = [["0 zile", { enabled: true, days: 0 }], ["366 de zile", { enabled: true, days: 366 }], ["fără „pornit”", { days: 7 }]];
  suite.each(G, badRecall, ([w]) => `întoarcerea cu ${w} e refuzată (400)`, async ([, body]) => {
    expectStatus(await api(S.a, "PUT", `${D}/recall`, body), 400);
  });

  suite.add(G, "agentul nu poate schimba regula care îi ia contactele (403)", async () => {
    const r = await api(S.A, "PUT", `${D}/recall`, { enabled: false, days: 365 });
    const g = expectOk(await api(S.a, "GET", `${D}/recall`));
    if (r.ok) await api(S.a, "PUT", `${D}/recall`, { enabled: true, days: 7 });
    expectStatus(r, 403);
    expect(g.enabled === true && g.days === 7, `agentul a schimbat setarea: ${JSON.stringify(g)}`);
  });

  suite.add(G, "alt client nu vede rezerva și setările mele", async (ctx) => {
    const r = await api(ctx.other, "GET", `${D}/recall`);
    expectNo5xx(r);
    expect(!(r.json?.enabled === true && r.json?.days === 7), "alt client vede setarea mea de întoarcere");
  });
}

// ════════════════════════════════════════════════════════════════════════════
// captare:formular — formularul de pe site, până la leadul din CRM
// ════════════════════════════════════════════════════════════════════════════
function registerCapture(suite) {
  const G = "captare:formular";
  const S = {};
  const C = "/api/crm/capture-sources";
  const W = "/api/crm/intake/webform";
  const submit = (body, headers = {}, sess = anon) => api(sess, "POST", W, body, headers);
  async function source(s, body) {
    const r = await api(s, "POST", C, body);
    expectStatus(r, 201, `formularul „${body.name}”: `);
    return r.json;
  }
  const sourceById = async (id) => expectOk(await api(S.a, "GET", C)).items.find((x) => x.id === id);
  const countByName = async (name) => (await leadsWhere(S.a, `search=${encodeURIComponent(name)}`)).filter((l) => l.fullName === name).length;

  suite.add(G, "workspace nou, cu un agent, fără formulare", async () => {
    S.a = await signupTenant("captare");
    S.agent = await addMember(S.a, "teacher", "Agent Captare");
    S.b = await signupTenant("captare-alt");
    expect(expectOk(await api(S.a, "GET", C)).items.length === 0, "workspace nou cu formulare");
  });

  suite.add(G, "formularul nou primește un token public greu de ghicit", async () => {
    S.f = await source(S.a, { name: `Cerere ofertă ${RUN}` });
    expect(typeof S.f.token === "string" && S.f.token.length >= 24, `token: ${S.f.token}`);
    expect(S.f.active === true && S.f.defaultSource === "webform" && S.f.leadsCaptured === 0 && S.f.allowedOrigins.length === 0, `formular: ${JSON.stringify(S.f)}`);
  });

  suite.add(G, "două formulare au tokenuri diferite", async () => {
    S.f2 = await source(S.a, { name: `Newsletter ${RUN}` });
    expect(S.f2.token !== S.f.token, "două formulare au același token");
  });

  suite.add(G, "un vizitator fără cont trimite formularul → lead nou (201)", async () => {
    S.name1 = `Vizitator ${RUN}`;
    S.phone1 = `+373 69 ${String(Date.now()).slice(-3)} ${String(Date.now()).slice(-6, -3)}`;
    const r = await submit({
      token: S.f.token, fullName: S.name1, phone: S.phone1, email: `vizitator-${RUN}@example.invalid`,
      message: "Vreau o ofertă pentru panouri", interestCourse: "Panouri 10 kW",
      utmSource: "facebook", utmMedium: "cpc", utmCampaign: "toamna", consentText: "Sunt de acord să fiu contactat", consentAt: new Date().toISOString(),
    });
    expectStatus(r, 201);
    expect(r.json?.ok === true && r.json.isDuplicate === false && /^[0-9a-f-]{36}$/.test(r.json.leadId), `răspuns: ${r.text}`);
    S.lead1 = r.json.leadId;
  });

  suite.add(G, "leadul captat într-un workspace nou poate fi mutat imediat pe tablă", async () => {
    const r = await moveStage(S.a, S.lead1, "contacted");
    expectStatus(r, 200, "leadul venit de pe site nu se poate muta (etapele pâlniei n-au fost create la captare): ");
  });

  suite.add(G, "leadul captat e în workspace-ul formularului, cu sursa „webform” și în pâlnia implicită", async () => {
    const l = await getLead(S.a, S.lead1);
    const def = expectOk(await api(S.a, "GET", "/api/crm/pipelines")).items.find((p) => p.isDefault);
    expect(l.fullName === S.name1 && l.source === "webform" && l.phone === S.phone1, `lead: ${JSON.stringify(l).slice(0, 200)}`);
    expect(l.pipelineId === def.id, `pâlnia leadului: ${l.pipelineId}, implicita ${def.id}`);
    expect(l.consentAt, "data consimțământului nu s-a salvat");
  });

  suite.add(G, "consimțământul și mesajul ajung în fișă (dovada GDPR)", async () => {
    const j = expectOk(await api(S.a, "GET", `/api/crm/gdpr/export/${S.lead1}`));
    expect(j.consent?.text === "Sunt de acord să fiu contactat" && j.consent.givenAt, `consimțământ: ${JSON.stringify(j.consent)}`);
    expect(/Vreau o ofertă pentru panouri/.test(j.lead?.notes ?? "") && /Interes: Panouri 10 kW/.test(j.lead.notes), `notițe: ${j.lead?.notes}`);
    expect(j.lead.interestCourse === "Panouri 10 kW", `interes: ${j.lead.interestCourse}`);
  });

  suite.add(G, "contorul formularului crește și data ultimei captări se completează", async () => {
    const f = await sourceById(S.f.id);
    expect(f.leadsCaptured === 1 && f.lastCaptureAt, `formular: ${JSON.stringify(f)}`);
  });

  suite.add(G, "captarea lasă urmă în jurnalul CRM", async () => {
    const items = listOf(expectOk(await api(S.a, "GET", "/api/crm/audit"))) ?? [];
    expect(items.some((x) => x.targetId === S.lead1 && /lead\.captured/.test(x.actionType ?? "")), "captarea nu apare în jurnal");
  });

  suite.add(G, "a doua cerere cu același telefon, scris altfel → duplicat, fără lead nou", async () => {
    const local = "0" + S.phone1.replace(/\D/g, "").slice(3);
    const r = await submit({ token: S.f.token, fullName: `Alt Nume ${RUN}`, phone: local, message: "Mai vreau o dată" });
    expectStatus(r, 200);
    expect(r.json?.ok === true && r.json.isDuplicate === true && r.json.leadId === undefined, `răspuns: ${r.text}`);
    expect(Object.keys(r.json).sort().join() === "isDuplicate,ok", `răspunsul public scurge date: ${r.text}`);
    expect((await countByName(`Alt Nume ${RUN}`)) === 0, "duplicatul a creat un lead nou");
  });

  suite.add(G, "duplicatul lasă pe leadul existent o notă „Cerere nouă”, primită", async () => {
    const n = (await interactionsOf(S.a, S.lead1)).find((x) => x.type === "note" && /Cerere nouă/.test(x.body ?? ""));
    expect(n && n.direction === "inbound" && /Mai vreau o dată/.test(n.body), `notă: ${JSON.stringify(n)}`);
  });

  suite.add(G, "duplicat după email, scris cu majuscule", async () => {
    const r = await submit({ token: S.f.token, fullName: `Email Mare ${RUN}`, email: `VIZITATOR-${RUN}@EXAMPLE.INVALID`.replace("VIZITATOR", "Vizitator") });
    expectStatus(r, 200);
    expect(r.json?.isDuplicate === true, `răspuns: ${r.text}`);
  });

  suite.add(G, "și duplicatele cresc contorul formularului", async () => {
    expect((await sourceById(S.f.id)).leadsCaptured === 3, `contor: ${(await sourceById(S.f.id)).leadsCaptured}`);
  });

  suite.add(G, "leadul captat e unul singur, oricâte cereri a trimis", async () => {
    expect((await countByName(S.name1)) === 1, "leadul captat s-a dublat");
  });

  suite.add(G, "token greșit → 401 invalid_token", async () => {
    const r = await submit({ token: "x".repeat(32), fullName: "Străin Total" });
    expectStatus(r, 401);
    expect(r.json?.error === "invalid_token", `răspuns: ${r.text}`);
  });

  suite.add(G, "fără token → 400", async () => {
    expectStatus(await submit({ fullName: "Fără Token" }), 400);
  });

  suite.add(G, "token prea scurt → 400", async () => {
    expectStatus(await submit({ token: "abc", fullName: "Token Scurt" }), 400);
  });

  suite.add(G, "formularul oprit refuză cu același mesaj ca un token greșit", async () => {
    expectOk(await api(S.a, "PATCH", `${C}/${S.f2.id}`, { active: false }));
    const r = await submit({ token: S.f2.token, fullName: `Oprit ${RUN}` });
    expectStatus(r, 401);
    expect(r.json?.error === "invalid_token", `răspuns: ${r.text}`);
    expect((await countByName(`Oprit ${RUN}`)) === 0, "formularul oprit a creat lead");
  });

  suite.add(G, "formularul repornit acceptă din nou", async () => {
    expectOk(await api(S.a, "PATCH", `${C}/${S.f2.id}`, { active: true }));
    expectStatus(await submit({ token: S.f2.token, fullName: `Repornit ${RUN}` }), 201);
  });

  suite.add(G, "formularul șters nu mai primește nimic", async () => {
    const f = await source(S.a, { name: `Temporar ${RUN}` });
    expectOk(await api(S.a, "DELETE", `${C}/${f.id}`));
    expectStatus(await submit({ token: f.token, fullName: `Șters ${RUN}` }), 401);
  });

  suite.add(G, "formular cu domeniu permis: fără Origin → 403", async () => {
    S.fo = await source(S.a, { name: `Doar site ${RUN}`, allowedOrigins: ["https://site.example"] });
    const r = await submit({ token: S.fo.token, fullName: `Fără Origin ${RUN}` });
    expectStatus(r, 403);
    expect(r.json?.error === "origin_not_allowed", `răspuns: ${r.text}`);
  });

  suite.add(G, "formular cu domeniu permis: alt domeniu → 403 și niciun lead", async () => {
    expectStatus(await submit({ token: S.fo.token, fullName: `Evil ${RUN}` }, { origin: "https://evil.example" }), 403);
    expectStatus(await submit({ token: S.fo.token, fullName: `Evil ${RUN}` }, { origin: "https://site.example.evil.example" }), 403);
    expect((await countByName(`Evil ${RUN}`)) === 0, "o cerere de pe alt domeniu a creat lead");
  });

  suite.add(G, "formular cu domeniu permis: de pe site → 201", async () => {
    expectStatus(await submit({ token: S.fo.token, fullName: `De pe site ${RUN}` }, { origin: "https://site.example" }), 201);
  });

  suite.add(G, "fără Origin, dar cu Referer de pe o pagină a site-ului → 201", async () => {
    expectStatus(await submit({ token: S.fo.token, fullName: `Referer ${RUN}` }, { referer: "https://site.example/cerere?camp=1" }), 201);
  });

  suite.add(G, "domeniul permis scris cu o cale se compară după origine", async () => {
    const f = await source(S.a, { name: `Cu cale ${RUN}`, allowedOrigins: ["https://site.example/contact"] });
    expectStatus(await submit({ token: f.token, fullName: `Cu cale ${RUN}` }, { origin: "https://site.example" }), 201);
  });

  suite.add(G, "consimțământ vechi de 10 minute → 400 consent_expired, fără lead", async () => {
    const r = await submit({ token: S.f.token, fullName: `Consimțământ vechi ${RUN}`, consentAt: new Date(Date.now() - 10 * 60_000).toISOString() });
    expectStatus(r, 400);
    expect(r.json?.error === "consent_expired", `răspuns: ${r.text}`);
    expect((await countByName(`Consimțământ vechi ${RUN}`)) === 0, "leadul s-a creat cu un consimțământ expirat");
  });

  suite.add(G, "consimțământ datat în viitor → 400", async () => {
    expectStatus(await submit({ token: S.f.token, fullName: `Viitor ${RUN}`, consentAt: new Date(Date.now() + 10 * 60_000).toISOString() }), 400);
  });

  suite.add(G, "consimțământ de acum un minut → acceptat", async () => {
    expectStatus(await submit({ token: S.f.token, fullName: `Proaspăt ${RUN}`, consentAt: new Date(Date.now() - 60_000).toISOString() }), 201);
  });

  const bad = [
    ["nume de o literă", { fullName: "A" }],
    ["email invalid", { fullName: "Nume Bun", email: "nu-e-email" }],
    ["dată de consimțământ care nu e dată", { fullName: "Nume Bun", consentAt: "ieri" }],
    ["mesaj de 3000 de caractere", { fullName: "Nume Bun", message: "x".repeat(3000) }],
  ];
  suite.each(G, bad, ([w]) => `formularul cu ${w} e refuzat (400)`, async ([, body]) => {
    expectStatus(await submit({ token: S.f.token, ...body }), 400);
  });

  suite.add(G, "JSON stricat → 400, nu 500", async () => {
    expectClientError(await api(anon, "POST", W, "{stricat"));
  });

  suite.add(G, "numele cu HTML se salvează ca text, fără să cadă", async () => {
    const name = `<b>Ion</b> ${RUN}`;
    const r = await submit({ token: S.f.token, fullName: name });
    expectStatus(r, 201);
    expect((await getLead(S.a, r.json.leadId)).fullName === name, "numele s-a alterat");
  });

  suite.add(G, "câmpurile trimise în plus (tenant, etapă, responsabil) sunt ignorate", async () => {
    const r = await submit({ token: S.f.token, fullName: `Șmecher ${RUN}`, tenantId: S.b.tenant.id, stage: "paid", assignedTo: S.agent.user.id, source: "referral" });
    expectStatus(r, 201);
    const l = await getLead(S.a, r.json.leadId);
    expect(l.stage !== "paid" && l.assignedTo === null && l.source === "webform", `lead: ${JSON.stringify(l).slice(0, 200)}`);
  });

  suite.add(G, "o sesiune străină trimisă odată cu formularul nu mută leadul în alt workspace", async () => {
    const r = await submit({ token: S.f.token, fullName: `Cu cookie ${RUN}` }, {}, S.b);
    expectStatus(r, 201);
    expectOk(await api(S.a, "GET", `/api/crm/leads/${r.json.leadId}`));
    expectStatus(await api(S.b, "GET", `/api/crm/leads/${r.json.leadId}`), 404);
  });

  suite.add(G, "sursa implicită a formularului (Facebook) ajunge pe lead", async () => {
    const f = await source(S.a, { name: `Facebook ${RUN}`, defaultSource: "facebook_ad" });
    const r = await submit({ token: f.token, fullName: `Din Facebook ${RUN}` });
    expectStatus(r, 201);
    expect((await getLead(S.a, r.json.leadId)).source === "facebook_ad", "sursa nu e Facebook");
  });

  suite.add(G, "formular legat de pâlnia SPANCO → leadul intră pe prima ei etapă", async () => {
    const p = expectOk(await api(S.a, "POST", "/api/crm/pipelines", { name: `SPANCO ${RUN}`, template: "spanco" }));
    const first = (await stagesOf(S.a, p.id))[0]?.key;
    const f = await source(S.a, { name: `B2B ${RUN}`, pipelineId: p.id });
    expect(f.pipelineId === p.id, "pâlnia nu s-a salvat pe formular");
    const r = await submit({ token: f.token, fullName: `Firmă B2B ${RUN}` });
    expectStatus(r, 201);
    const l = await getLead(S.a, r.json.leadId);
    expect(l.pipelineId === p.id, `pâlnia leadului: ${l.pipelineId}`);
    expect(l.stage === first, `leadul a intrat în etapa „${l.stage}”, care nu există în SPANCO (prima e „${first}”) — e invizibil pe tablă`);
  });

  suite.add(G, "un formular nu poate fi legat de pâlnia altui client", async () => {
    const foreign = expectOk(await api(S.b, "GET", "/api/crm/pipelines")).items[0]
      ?? expectOk(await api(S.b, "POST", "/api/crm/pipelines", { name: "Pâlnia lui B" }));
    const r = await api(S.a, "POST", C, { name: `Furt de pâlnie ${RUN}`, pipelineId: foreign.id });
    if (r.ok) await api(S.a, "DELETE", `${C}/${r.json.id}`);
    expectClientError(r, "formularul a acceptat pâlnia altui workspace: ");
  });

  suite.add(G, "nici prin editare nu se poate lega pâlnia altui client", async () => {
    const foreign = expectOk(await api(S.b, "GET", "/api/crm/pipelines")).items[0];
    const r = await api(S.a, "PATCH", `${C}/${S.f2.id}`, { pipelineId: foreign.id });
    const f = await sourceById(S.f2.id);
    if (r.ok) await api(S.a, "PATCH", `${C}/${S.f2.id}`, { pipelineId: null });
    expectClientError(r, "editarea a acceptat pâlnia altui workspace: ");
    expect(f.pipelineId !== foreign.id, "formularul a rămas legat de pâlnia altui client");
  });

  suite.add(G, "captarea pornește automatizările (task pe leadul venit de pe site)", async () => {
    const m = uid("Site-");
    const rule = await automation(S.a, { name: `Site ${m}`, trigger: { kind: "lead.created" }, conditions: [{ field: "source", op: "eq", value: "webform" }, ...onlyCompany(m)], actions: [{ type: "create_task", title: `Răspunde la cerere ${m}`, dueInDays: 0 }] });
    const r = await submit({ token: S.f.token, fullName: `Automat ${RUN}`, company: m });
    expectStatus(r, 201);
    expect((await tasksOf(S.a, r.json.leadId)).some((x) => x.title === `Răspunde la cerere ${m}`), "captarea nu a pornit automatizarea");
    expect((await runsOf(S.a, r.json.leadId)).some((x) => x.automationId === rule.id && x.status === "ok"), "rularea nu apare în jurnal");
  });

  suite.add(G, "captarea pornește distribuirea automată către agent", async () => {
    const m = uid("Distr-");
    const rule = expectOk(await api(S.a, "POST", "/api/crm/assignment/rules", { name: `Site → agent ${m}`, strategy: "fixed", userIds: [S.agent.user.id], conditions: onlyCompany(m) }));
    const r = await submit({ token: S.f.token, fullName: `Distribuit ${RUN}`, company: m, phone: phone() });
    expectStatus(r, 201);
    S.distLead = r.json.leadId;
    S.distPhone = null;
    await api(S.a, "DELETE", `/api/crm/assignment/rules/${rule.id}`);
    expect((await getLead(S.a, r.json.leadId)).assignedTo === S.agent.user.id, "leadul de pe site nu a ajuns la agent");
  });

  suite.add(G, "clientul care retrimite formularul își oprește cadența de urmărire", async () => {
    const ph = phone();
    const r = await submit({ token: S.f.token, fullName: `Revine ${RUN}`, phone: ph });
    expectStatus(r, 201);
    const k = expectOk(await api(S.a, "POST", "/api/crm/cadences", { name: `Urmărire site ${RUN}`, steps: [{ dayOffset: 2, action: "task", title: "Revino" }] }));
    const e = expectOk(await api(S.a, "POST", "/api/crm/cadences/enroll", { leadId: r.json.leadId, cadenceId: k.id }));
    const again = await submit({ token: S.f.token, fullName: `Revine ${RUN}`, phone: ph, message: "V-am scris din nou" });
    expect(again.json?.isDuplicate === true, `a doua cerere: ${again.text}`);
    const after = listOf(expectOk(await api(S.a, "GET", `/api/crm/cadences/enrollments?leadId=${r.json.leadId}`))).find((x) => x.id === e.id);
    expect(after?.status === "cancelled", `clientul a răspuns prin formular, dar cadența a rămas „${after?.status}” — agentul va primi „sună, nu răspunde”`);
  });

  suite.add(G, "agentul nu poate crea formulare (403)", async () => {
    expectStatus(await api(S.agent, "POST", C, { name: "Al meu" }), 403);
  });

  suite.add(G, "agentul nu poate opri un formular (403) — rămâne activ", async () => {
    expectStatus(await api(S.agent, "PATCH", `${C}/${S.f.id}`, { active: false }), 403);
    expect((await sourceById(S.f.id)).active === true, "formularul a fost oprit de agent");
  });

  suite.add(G, "alt client nu vede formularele și tokenurile mele", async () => {
    const r = await api(S.b, "GET", C);
    expectNo5xx(r);
    expect(!r.text.includes(S.f.token) && !r.text.includes(S.f.id), "lista altui client conține formularul meu");
  });

  suite.add(G, "alt client nu poate opri sau șterge formularul meu (404)", async () => {
    expectStatus(await api(S.b, "PATCH", `${C}/${S.f.id}`, { active: false }), 404);
    expectStatus(await api(S.b, "DELETE", `${C}/${S.f.id}`), 404);
    expect((await sourceById(S.f.id))?.active === true, "formularul meu a fost atins de alt client");
  });

  suite.add(G, "editarea unui formular inexistent → 404", async () => {
    expectStatus(await api(S.a, "PATCH", `${C}/${RANDOM_UUID}`, { name: "x" }), 404);
  });

  suite.add(G, "formularul cu sursă necunoscută e refuzat (400)", async () => {
    expectStatus(await api(S.a, "POST", C, { name: "x", defaultSource: "tiktok" }), 400);
  });

  suite.add(G, "GET pe adresa publică a formularului nu cade", async () => {
    expectClientError(await api(anon, "GET", W));
  });
}

export function register(suite) {
  registerAutoCrud(suite);
  registerAutoTriggers(suite);
  registerAutoStages(suite);
  registerAutoScenarios(suite);
  registerCadences(suite);
  registerReengagement(suite);
  registerAssignment(suite);
  registerDistribution(suite);
  registerCapture(suite);
}
