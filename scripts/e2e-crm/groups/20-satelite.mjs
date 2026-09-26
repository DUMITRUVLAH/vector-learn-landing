// Ce atârnă de un lead: taskuri, etichete, contacte, câmpuri personalizate, vizualizări salvate,
// motive de pierdere, fișiere și comunicare.
//
// Fiecare grup își face PROPRIUL workspace (signupTenant) și, unde e nevoie, un al doilea
// workspace „intrus" pentru izolarea între clienți. Nu scriem nimic în tenantul semănat.
// Fiecare scenariu invocă acțiunea cu date realiste și verifică efectul RECITIND datele
// (§3.5.1quater: testăm acțiunea, nu butonul).

import {
  RUN, uid, api, signupTenant, Session, expect, expectStatus, expectOk, expectClientError, expectNo5xx,
  listOf, ZERO_UUID, RANDOM_UUID,
} from "../lib.mjs";

// ── Ajutoare locale ──────────────────────────────────────────────────────────

const DAY = 86_400_000;
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

async function mkLead(sess, fullName, extra = {}) {
  const r = await api(sess, "POST", "/api/crm/leads", { fullName: `${fullName} ${RUN}`, ...extra });
  const j = expectOk(r, `creare lead „${fullName}”: `);
  expect(typeof j?.id === "string", "leadul creat nu are id");
  return j;
}

/** Un membru nou (rol `teacher` = agent de vânzări) în workspace-ul `admin`, cu sesiune proprie. */
async function inviteAgent(admin, role = "teacher") {
  const email = `${uid("agent-")}@example.invalid`;
  const inv = await api(admin, "POST", "/api/crm/team/invites", { email, role });
  const j = expectOk(inv, "invitație agent: ");
  const token = String(j.inviteUrl).split("token=")[1];
  expect(token, `invitația nu are token: ${j.inviteUrl}`);
  const s = new Session(`agent-${RUN}`);
  const acc = await api(s, "POST", "/api/auth/accept-invite", { token, name: "Agent Vânzări", password: "E2e-parola-lunga-123!" });
  const aj = expectOk(acc, "acceptare invitație: ");
  s.user = aj.user;
  return s;
}

async function tasksOf(sess, leadId) {
  const r = await api(sess, "GET", `/api/crm/tasks?leadId=${leadId}`);
  return listOf(expectOk(r, "listare taskuri: "));
}
async function upcoming(sess, owner) {
  const r = await api(sess, "GET", `/api/crm/tasks?scope=upcoming${owner ? `&owner=${owner}` : ""}`);
  return listOf(expectOk(r, "listare upcoming: "));
}
async function today(sess, owner) {
  const r = await api(sess, "GET", `/api/crm/tasks/today${owner ? `?owner=${owner}` : ""}`);
  return expectOk(r, "azi: ");
}
async function newTask(sess, leadId, body = {}) {
  const r = await api(sess, "POST", "/api/crm/tasks", { leadId, title: `Task ${uid()}`, ...body });
  expectStatus(r, 201, "creare task: ");
  return r.json;
}
async function tagsOf(sess, leadId) {
  return listOf(expectOk(await api(sess, "GET", `/api/crm/tags?leadId=${leadId}`), "listare etichete: "));
}
async function contactsOf(sess, leadId) {
  return listOf(expectOk(await api(sess, "GET", `/api/crm/contacts?leadId=${leadId}`), "listare contacte: "));
}
async function fieldsOf(sess) {
  return listOf(expectOk(await api(sess, "GET", "/api/crm/custom-fields"), "listare câmpuri: "));
}
async function valuesOf(sess, leadId) {
  return listOf(expectOk(await api(sess, "GET", `/api/crm/custom-fields/values?leadId=${leadId}`), "listare valori: "));
}
async function viewsOf(sess) {
  return listOf(expectOk(await api(sess, "GET", "/api/crm/saved-views"), "listare vizualizări: "));
}
async function reasonsOf(sess) {
  return listOf(expectOk(await api(sess, "GET", "/api/crm/lost-reasons"), "listare motive: "));
}
async function interactionsOf(sess, leadId) {
  return listOf(expectOk(await api(sess, "GET", `/api/crm/leads/${leadId}/interactions`), "istoric lead: "));
}
async function feed(sess, qs = "") {
  return listOf(expectOk(await api(sess, "GET", `/api/crm/comms/feed${qs}`), "flux: "));
}
async function getLead(sess, id) {
  return expectOk(await api(sess, "GET", `/api/crm/leads/${id}`), "citire lead: ");
}
const ids = (arr) => arr.map((x) => x.id);

export function register(suite) {
  // ════════════════════════════════════════════════════════════════════════════
  // TASKURI
  // ════════════════════════════════════════════════════════════════════════════
  const T = "satelite:taskuri";

  suite.add(T, "pregătire: workspace, două leaduri, un agent și un intrus", async (ctx) => {
    const admin = await signupTenant("taskuri");
    const intrus = await signupTenant("taskuri-intrus");
    const leadX = await mkLead(admin, "Andrei Popescu");
    const leadY = await mkLead(admin, "Elena Rusu");
    const leadZ = await mkLead(admin, "Victor Ciobanu");
    const leadIntrus = await mkLead(intrus, "Lead străin");
    const agent = await inviteAgent(admin);
    ctx.t = { admin, intrus, leadX, leadY, leadZ, leadIntrus, agent, tasks: {} };
    expect(agent.user?.id && admin.user?.id, "lipsesc id-urile de utilizator");
  });

  suite.add(T, "creare task cu dată și oră: 201, deschis, autorul e cel logat", async ({ t }) => {
    const due = iso(2 * DAY);
    const r = await api(t.admin, "POST", "/api/crm/tasks", { leadId: t.leadX.id, title: "Sună clientul pentru ofertă", dueAt: due, dueHasTime: true });
    expectStatus(r, 201);
    const j = r.json;
    expect(j.id && j.leadId === t.leadX.id, "id/leadId greșit");
    expect(j.status === "open", `status ${j.status}`);
    expect(j.dueHasTime === true, "dueHasTime nu e true");
    expect(new Date(j.dueAt).getTime() === new Date(due).getTime(), `dueAt ${j.dueAt} ≠ ${due}`);
    expect(j.createdBy === t.admin.user.id, "createdBy nu e utilizatorul logat");
    expect(j.completedAt === null, "completedAt setat la creare");
    t.tasks.timed = j;
  });

  suite.add(T, "taskul creat apare în lista leadului", async ({ t }) => {
    const items = await tasksOf(t.admin, t.leadX.id);
    const row = items.find((x) => x.id === t.tasks.timed.id);
    expect(row, "taskul nu apare în lista leadului");
    expect(row.title === "Sună clientul pentru ofertă", `titlu ${row.title}`);
  });

  suite.add(T, "titlul cu spații la capete se salvează curățat", async ({ t }) => {
    const j = await newTask(t.admin, t.leadX.id, { title: "   Trimite contractul   " });
    expect(j.title === "Trimite contractul", `titlu „${j.title}”`);
  });

  suite.add(T, "task fără scadență: dueAt null și „cu oră” fals", async ({ t }) => {
    const j = await newTask(t.admin, t.leadX.id, { title: "Verifică datele firmei" });
    expect(j.dueAt === null && j.dueHasTime === false, JSON.stringify(j));
    t.tasks.noDue = j;
  });

  suite.add(T, "„cu oră” fără dată se salvează fals (ora n-are sens fără zi)", async ({ t }) => {
    const j = await newTask(t.admin, t.leadX.id, { title: "Oră fără zi", dueHasTime: true });
    expect(j.dueAt === null && j.dueHasTime === false, JSON.stringify(j));
  });

  suite.add(T, "dată fără „cu oră” = task „toată ziua”", async ({ t }) => {
    const j = await newTask(t.admin, t.leadX.id, { title: "Pregătește oferta", dueAt: iso(3 * DAY) });
    expect(j.dueHasTime === false, "dueHasTime ar trebui fals implicit");
    t.tasks.allDay = j;
  });

  suite.add(T, "lista leadului e ordonată după scadență, cele fără dată la final", async ({ t }) => {
    const items = await tasksOf(t.admin, t.leadX.id);
    const dated = items.filter((x) => x.dueAt);
    for (let i = 1; i < dated.length; i++) {
      expect(new Date(dated[i - 1].dueAt) <= new Date(dated[i].dueAt), "scadențele nu sunt crescătoare");
    }
    const firstNull = items.findIndex((x) => !x.dueAt);
    expect(firstNull === -1 || items.slice(firstNull).every((x) => !x.dueAt), "un task fără dată stă înaintea unuia cu dată");
    expect(firstNull >= 0, "taskurile fără dată lipsesc din listă");
  });

  suite.add(T, "taskul leadului X nu apare la leadul Y", async ({ t }) => {
    const y = await newTask(t.admin, t.leadY.id, { title: "Task pe Y", dueAt: iso(DAY) });
    t.tasks.onY = y;
    const itemsY = await tasksOf(t.admin, t.leadY.id);
    expect(itemsY.every((x) => x.leadId === t.leadY.id), "lista lui Y conține taskuri străine");
    expect(!itemsY.some((x) => x.id === t.tasks.timed.id), "taskul lui X apare la Y");
    expect(itemsY.some((x) => x.id === y.id), "taskul lui Y lipsește");
  });

  suite.add(T, "listarea fără leadId și fără scope e refuzată", async ({ t }) => {
    expectClientError(await api(t.admin, "GET", "/api/crm/tasks"));
  });

  suite.add(T, "listarea pe leadul altui workspace dă 404", async ({ t }) => {
    expectStatus(await api(t.admin, "GET", `/api/crm/tasks?leadId=${t.leadIntrus.id}`), 404);
  });

  suite.add(T, "creare fără titlu e refuzată", async ({ t }) => {
    expectClientError(await api(t.admin, "POST", "/api/crm/tasks", { leadId: t.leadX.id, title: "" }));
  });

  suite.add(T, "creare cu titlu doar din spații e refuzată", async ({ t }) => {
    const r = await api(t.admin, "POST", "/api/crm/tasks", { leadId: t.leadX.id, title: "    " });
    expectClientError(r, "titlu gol după curățare: ");
  });

  suite.add(T, "titlu de 300 de caractere e acceptat, 301 nu", async ({ t }) => {
    expectStatus(await api(t.admin, "POST", "/api/crm/tasks", { leadId: t.leadX.id, title: "A".repeat(300) }), 201);
    expectClientError(await api(t.admin, "POST", "/api/crm/tasks", { leadId: t.leadX.id, title: "A".repeat(301) }));
  });

  suite.add(T, "scadență scrisă în cuvinte („mâine”) e refuzată", async ({ t }) => {
    expectClientError(await api(t.admin, "POST", "/api/crm/tasks", { leadId: t.leadX.id, title: "X", dueAt: "mâine" }));
  });

  suite.add(T, "leadId care nu e uuid e refuzat", async ({ t }) => {
    expectClientError(await api(t.admin, "POST", "/api/crm/tasks", { leadId: "lead-42", title: "X" }));
  });

  suite.add(T, "leadId inexistent → 404", async ({ t }) => {
    expectStatus(await api(t.admin, "POST", "/api/crm/tasks", { leadId: RANDOM_UUID, title: "X" }), 404);
  });

  suite.add(T, "task pe leadul altui workspace → 404, nimic creat acolo", async ({ t }) => {
    expectStatus(await api(t.admin, "POST", "/api/crm/tasks", { leadId: t.leadIntrus.id, title: "Infiltrat" }), 404);
    const theirs = await tasksOf(t.intrus, t.leadIntrus.id);
    expect(theirs.length === 0, "a apărut un task în workspace-ul străin");
  });

  suite.add(T, "task alocat agentului din echipă se salvează cu responsabilul", async ({ t }) => {
    const j = await newTask(t.admin, t.leadY.id, { title: "Agentul sună", dueAt: iso(DAY + 3600e3), assignedTo: t.agent.user.id });
    expect(j.assignedTo === t.agent.user.id, "assignedTo nu s-a salvat");
    t.tasks.agent = j;
  });

  suite.add(T, "task alocat unui om din alt workspace e refuzat", async ({ t }) => {
    const r = await api(t.admin, "POST", "/api/crm/tasks", { leadId: t.leadX.id, title: "Străin", assignedTo: t.intrus.user.id });
    expectClientError(r, "responsabil din alt workspace: ");
  });

  suite.add(T, "task alocat unui utilizator inexistent → eroare de client, nu 500", async ({ t }) => {
    const r = await api(t.admin, "POST", "/api/crm/tasks", { leadId: t.leadX.id, title: "Fantomă", assignedTo: RANDOM_UUID });
    expectClientError(r, "responsabil inexistent: ");
  });

  suite.add(T, "editarea titlului persistă", async ({ t }) => {
    const r = await api(t.admin, "PATCH", `/api/crm/tasks/${t.tasks.timed.id}`, { title: "Sună clientul — ofertă revizuită" });
    expectOk(r);
    const row = (await tasksOf(t.admin, t.leadX.id)).find((x) => x.id === t.tasks.timed.id);
    expect(row.title === "Sună clientul — ofertă revizuită", `titlu ${row.title}`);
  });

  suite.add(T, "mutarea scadenței păstrează ora aleasă", async ({ t }) => {
    const due = iso(4 * DAY);
    const j = expectOk(await api(t.admin, "PATCH", `/api/crm/tasks/${t.tasks.timed.id}`, { dueAt: due }));
    expect(new Date(j.dueAt).getTime() === new Date(due).getTime(), "dueAt nu s-a mutat");
    expect(j.dueHasTime === true, "ora s-a pierdut la mutarea datei");
  });

  suite.add(T, "adăugarea orei pe un task „toată ziua” (doar dueHasTime) persistă", async ({ t }) => {
    const j = expectOk(await api(t.admin, "PATCH", `/api/crm/tasks/${t.tasks.allDay.id}`, { dueHasTime: true }));
    expect(j.dueAt !== null, "scadența a dispărut");
    expect(j.dueHasTime === true, `dueHasTime=${j.dueHasTime}: ora cerută pe un task care ARE dată s-a pierdut`);
  });

  suite.add(T, "ștergerea datei șterge și ora", async ({ t }) => {
    const j = expectOk(await api(t.admin, "PATCH", `/api/crm/tasks/${t.tasks.timed.id}`, { dueAt: null }));
    expect(j.dueAt === null && j.dueHasTime === false, JSON.stringify(j));
    // readback
    const row = (await tasksOf(t.admin, t.leadX.id)).find((x) => x.id === t.tasks.timed.id);
    expect(row.dueAt === null && row.dueHasTime === false, "recitirea arată altceva");
    // puneți data la loc pentru pașii următori
    expectOk(await api(t.admin, "PATCH", `/api/crm/tasks/${t.tasks.timed.id}`, { dueAt: iso(2 * DAY), dueHasTime: true }));
  });

  suite.add(T, "editare cu titlu gol e refuzată și titlul rămâne", async ({ t }) => {
    expectClientError(await api(t.admin, "PATCH", `/api/crm/tasks/${t.tasks.timed.id}`, { title: "" }));
    const row = (await tasksOf(t.admin, t.leadX.id)).find((x) => x.id === t.tasks.timed.id);
    expect(row.title.length > 0, "titlul s-a golit");
  });

  suite.add(T, "editarea unui task inexistent → 404", async ({ t }) => {
    expectStatus(await api(t.admin, "PATCH", `/api/crm/tasks/${RANDOM_UUID}`, { title: "X" }), 404);
  });

  suite.add(T, "alt workspace nu poate edita taskul și el rămâne neschimbat", async ({ t }) => {
    expectStatus(await api(t.intrus, "PATCH", `/api/crm/tasks/${t.tasks.onY.id}`, { title: "Spart" }), 404);
    const row = (await tasksOf(t.admin, t.leadY.id)).find((x) => x.id === t.tasks.onY.id);
    expect(row.title === "Task pe Y", `titlu ${row.title}`);
  });

  suite.add(T, "încheierea: status done și completedAt setat", async ({ t }) => {
    const j = expectOk(await api(t.admin, "POST", `/api/crm/tasks/${t.tasks.onY.id}/complete`));
    expect(j.status === "done" && j.completedAt, JSON.stringify(j));
    const row = (await tasksOf(t.admin, t.leadY.id)).find((x) => x.id === t.tasks.onY.id);
    expect(row.status === "done" && row.completedAt, "recitirea nu arată done");
  });

  suite.add(T, "încheierea lasă o urmă „system” în istoricul leadului (T-CRM-107-3)", async ({ t }) => {
    const items = await interactionsOf(t.admin, t.leadY.id);
    const trace = items.find((i) => i.type === "system" && (i.body ?? "").includes("Task pe Y"));
    expect(trace, `nicio interacțiune system după încheierea taskului; tipuri: ${items.map((i) => i.type).join(",") || "(niciuna)"}`);
  });

  suite.add(T, "taskul încheiat nu mai apare în clopoțel", async ({ t }) => {
    const items = await upcoming(t.admin);
    expect(!items.some((x) => x.id === t.tasks.onY.id), "taskul done e încă în upcoming");
  });

  suite.add(T, "încheierea de două ori rămâne done (idempotent)", async ({ t }) => {
    const j = expectOk(await api(t.admin, "POST", `/api/crm/tasks/${t.tasks.onY.id}/complete`));
    expect(j.status === "done", `status ${j.status}`);
  });

  suite.add(T, "redeschiderea: status open și completedAt golit", async ({ t }) => {
    const j = expectOk(await api(t.admin, "POST", `/api/crm/tasks/${t.tasks.onY.id}/reopen`));
    expect(j.status === "open" && j.completedAt === null, JSON.stringify(j));
    const row = (await tasksOf(t.admin, t.leadY.id)).find((x) => x.id === t.tasks.onY.id);
    expect(row.status === "open" && row.completedAt === null, "recitirea nu arată open");
  });

  suite.add(T, "taskul redeschis revine în clopoțel", async ({ t }) => {
    const items = await upcoming(t.admin);
    expect(items.some((x) => x.id === t.tasks.onY.id), "taskul redeschis lipsește din upcoming");
  });

  suite.add(T, "alt workspace nu poate încheia/redeschide taskul", async ({ t }) => {
    expectStatus(await api(t.intrus, "POST", `/api/crm/tasks/${t.tasks.onY.id}/complete`), 404);
    expectStatus(await api(t.intrus, "POST", `/api/crm/tasks/${t.tasks.onY.id}/reopen`), 404);
    const row = (await tasksOf(t.admin, t.leadY.id)).find((x) => x.id === t.tasks.onY.id);
    expect(row.status === "open", `status ${row.status}`);
  });

  suite.add(T, "încheierea unui task inexistent → 404", async ({ t }) => {
    expectStatus(await api(t.admin, "POST", `/api/crm/tasks/${RANDOM_UUID}/complete`), 404);
  });

  suite.add(T, "amânarea cu 2 zile împinge scadența exact cu 48 h", async ({ t }) => {
    const before = (await tasksOf(t.admin, t.leadX.id)).find((x) => x.id === t.tasks.timed.id);
    const j = expectOk(await api(t.admin, "POST", `/api/crm/tasks/${t.tasks.timed.id}/snooze`, { days: 2 }));
    expect(new Date(j.dueAt).getTime() - new Date(before.dueAt).getTime() === 2 * DAY, `diferență ${new Date(j.dueAt) - new Date(before.dueAt)} ms`);
    const row = (await tasksOf(t.admin, t.leadX.id)).find((x) => x.id === t.tasks.timed.id);
    expect(row.dueAt === j.dueAt, "recitirea nu arată scadența nouă");
  });

  suite.add(T, "amânarea unui task fără dată îi dă scadență ≈ acum + zile", async ({ t }) => {
    const t0 = Date.now();
    const j = expectOk(await api(t.admin, "POST", `/api/crm/tasks/${t.tasks.noDue.id}/snooze`, { days: 3 }));
    const d = new Date(j.dueAt).getTime() - t0;
    expect(Math.abs(d - 3 * DAY) < 60_000, `scadența nouă e la ${d} ms de acum`);
  });

  suite.add(T, "taskul amânat rămâne în clopoțel, cu scadența nouă", async ({ t }) => {
    const items = await upcoming(t.admin);
    const row = items.find((x) => x.id === t.tasks.timed.id);
    expect(row, "taskul amânat a dispărut din clopoțel (status „snoozed” e filtrat afară) — nu mai revine niciodată");
  });

  suite.add(T, "leadul cu un task amânat nu e „fără pas următor”", async ({ t }) => {
    const lead = await mkLead(t.admin, "Amânat Singur");
    const task = await newTask(t.admin, lead.id, { title: "Revino luni", dueAt: iso(DAY) });
    expectOk(await api(t.admin, "POST", `/api/crm/tasks/${task.id}/snooze`, { days: 1 }));
    const b = await today(t.admin);
    expect(!b.noNextStep.some((l) => l.id === lead.id), "leadul cu task amânat apare ca „fără pas următor”");
  });

  suite.add(T, "amânare cu 0 zile e refuzată", async ({ t }) => {
    expectClientError(await api(t.admin, "POST", `/api/crm/tasks/${t.tasks.timed.id}/snooze`, { days: 0 }));
  });

  suite.add(T, "amânare cu 366 de zile e refuzată", async ({ t }) => {
    expectClientError(await api(t.admin, "POST", `/api/crm/tasks/${t.tasks.timed.id}/snooze`, { days: 366 }));
  });

  suite.add(T, "amânare cu zile fracționare sau text e refuzată, scadența rămâne", async ({ t }) => {
    const before = (await tasksOf(t.admin, t.leadX.id)).find((x) => x.id === t.tasks.timed.id);
    expectClientError(await api(t.admin, "POST", `/api/crm/tasks/${t.tasks.timed.id}/snooze`, { days: 1.5 }));
    expectClientError(await api(t.admin, "POST", `/api/crm/tasks/${t.tasks.timed.id}/snooze`, { days: "2" }));
    const after = (await tasksOf(t.admin, t.leadX.id)).find((x) => x.id === t.tasks.timed.id);
    expect(before.dueAt === after.dueAt, "scadența s-a mutat pe input refuzat");
  });

  suite.add(T, "alt workspace nu poate amâna taskul", async ({ t }) => {
    expectStatus(await api(t.intrus, "POST", `/api/crm/tasks/${t.tasks.agent.id}/snooze`, { days: 1 }), 404);
  });

  suite.add(T, "clopoțelul: doar deschise cu scadență, cu numele leadului", async ({ t }) => {
    const items = await upcoming(t.admin);
    expect(items.every((x) => x.status === "open" && x.dueAt), "upcoming conține done sau fără dată");
    const row = items.find((x) => x.id === t.tasks.agent.id);
    expect(row, "taskul agentului lipsește din upcoming");
    expect(row.leadFullName === t.leadY.fullName, `leadFullName ${row.leadFullName}`);
  });

  suite.add(T, "clopoțelul e ordonat crescător după scadență", async ({ t }) => {
    const items = await upcoming(t.admin);
    for (let i = 1; i < items.length; i++) {
      expect(new Date(items[i - 1].dueAt) <= new Date(items[i].dueAt), "upcoming nu e crescător");
    }
  });

  suite.add(T, "clopoțelul agentului: ale lui + nealocate, nu ale altora", async ({ t }) => {
    const mine = await newTask(t.admin, t.leadZ.id, { title: "Al adminului", dueAt: iso(DAY), assignedTo: t.admin.user.id });
    const free = await newTask(t.admin, t.leadZ.id, { title: "Nealocat", dueAt: iso(DAY) });
    const items = await upcoming(t.admin, t.agent.user.id);
    expect(items.some((x) => x.id === t.tasks.agent.id), "lipsește taskul agentului");
    expect(items.some((x) => x.id === free.id), "lipsește taskul nealocat");
    expect(!items.some((x) => x.id === mine.id), "apare taskul adminului");
  });

  suite.add(T, "clopoțelul altui workspace nu vede taskurile noastre", async ({ t }) => {
    const items = await upcoming(t.intrus);
    expect(!items.some((x) => x.id === t.tasks.agent.id || x.leadId === t.leadX.id), "scurgere între workspace-uri");
  });

  suite.add(T, "clopoțel cu owner nevalid nu cade cu 500", async ({ t }) => {
    expectNo5xx(await api(t.admin, "GET", "/api/crm/tasks?scope=upcoming&owner=nu-e-uuid"));
  });

  suite.add(T, "„azi”: taskul cu oră trecută e restant", async ({ t }) => {
    const lead = await mkLead(t.admin, "Restant Cu Oră");
    const task = await newTask(t.admin, lead.id, { title: "Sună la 9", dueAt: iso(-2 * 3600e3), dueHasTime: true });
    t.tasks.overdueTimed = task;
    const b = await today(t.admin);
    expect(b.overdueTasks.some((o) => o.task.id === task.id && o.lead.id === lead.id), "taskul restant lipsește din „azi”");
  });

  suite.add(T, "„azi”: taskul cu oră viitoare nu e restant", async ({ t }) => {
    const task = await newTask(t.admin, t.leadZ.id, { title: "Sună mâine", dueAt: iso(DAY), dueHasTime: true });
    const b = await today(t.admin);
    expect(!b.overdueTasks.some((o) => o.task.id === task.id), "task viitor marcat restant");
  });

  suite.add(T, "„azi”: taskul „toată ziua” scadent AZI nu e restant (CRM-U04)", async ({ t }) => {
    const now = new Date();
    // Ora stocată e în trecut, dar ziua nu s-a terminat — exact cazul reparat pe client în U04.
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() >= 12 ? 12 : 0, now.getHours() >= 12 ? 0 : 1);
    if (base >= now) return; // rulat în primul minut după miezul nopții — cazul nu se poate construi
    const lead = await mkLead(t.admin, "Toată Ziua Azi");
    const task = await newTask(t.admin, lead.id, { title: "Trimite oferta azi", dueAt: base.toISOString() });
    expect(task.dueHasTime === false, "taskul ar trebui să fie „toată ziua”");
    const b = await today(t.admin);
    expect(!b.overdueTasks.some((o) => o.task.id === task.id),
      `taskul „toată ziua” de azi (${base.toISOString()}) e listat ca RESTANT la /today — ziua lui nu s-a terminat`);
  });

  suite.add(T, "„azi”: taskul „toată ziua” de ieri e restant", async ({ t }) => {
    const now = new Date();
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0);
    const lead = await mkLead(t.admin, "Toată Ziua Ieri");
    const task = await newTask(t.admin, lead.id, { title: "Oferta de ieri", dueAt: y.toISOString() });
    const b = await today(t.admin);
    expect(b.overdueTasks.some((o) => o.task.id === task.id), "taskul de ieri nu e restant");
  });

  suite.add(T, "„azi”: restanțele sunt ordonate de la cea mai veche", async ({ t }) => {
    const lead = await mkLead(t.admin, "Restanță Veche");
    await newTask(t.admin, lead.id, { title: "Foarte vechi", dueAt: iso(-10 * DAY), dueHasTime: true });
    const b = await today(t.admin);
    const d = b.overdueTasks.map((o) => new Date(o.task.dueAt).getTime());
    for (let i = 1; i < d.length; i++) expect(d[i - 1] <= d[i], "restanțele nu sunt crescătoare");
    expect(b.overdueTasks[0].task.title === "Foarte vechi", `prima restanță: ${b.overdueTasks[0]?.task.title}`);
  });

  suite.add(T, "„azi”: taskul restant încheiat iese din restanțe", async ({ t }) => {
    expectOk(await api(t.admin, "POST", `/api/crm/tasks/${t.tasks.overdueTimed.id}/complete`));
    const b = await today(t.admin);
    expect(!b.overdueTasks.some((o) => o.task.id === t.tasks.overdueTimed.id), "taskul done e încă restant");
  });

  suite.add(T, "„azi”: leadul fără task deschis e „fără pas următor”, cel cu task nu", async ({ t }) => {
    const lone = await mkLead(t.admin, "Fără Task");
    const b = await today(t.admin);
    expect(b.noNextStep.some((l) => l.id === lone.id), "leadul fără task lipsește din noNextStep");
    expect(!b.noNextStep.some((l) => l.id === t.leadY.id), "leadul cu task deschis apare în noNextStep");
  });

  suite.add(T, "„azi” pe agent: doar leadurile alocate lui", async ({ t }) => {
    expectOk(await api(t.admin, "PATCH", `/api/crm/leads/${t.leadZ.id}`, { assignedTo: t.agent.user.id }));
    const b = await today(t.admin, t.agent.user.id);
    const all = [...b.uncontacted, ...b.noNextStep, ...b.neglected, ...b.overdueTasks.map((o) => o.lead)];
    expect(all.every((l) => l.assignedTo === t.agent.user.id), "apar leaduri ale altora");
    expect(!all.some((l) => l.id === t.leadX.id), "leadul X (nealocat agentului) apare");
  });

  suite.add(T, "„azi” al altui workspace nu vede leadurile noastre", async ({ t }) => {
    const b = await today(t.intrus);
    const all = [...b.uncontacted, ...b.noNextStep, ...b.neglected, ...b.overdueTasks.map((o) => o.lead)];
    expect(!all.some((l) => l.id === t.leadX.id || l.id === t.leadY.id), "scurgere în „azi”");
  });

  suite.add(T, "cartonașul din pâlnie arată cel mai apropiat task deschis", async ({ t }) => {
    const lead = await mkLead(t.admin, "Cartonaș Cu Task");
    await newTask(t.admin, lead.id, { title: "Mai târziu", dueAt: iso(5 * DAY) });
    await newTask(t.admin, lead.id, { title: "Primul pas", dueAt: iso(DAY), dueHasTime: true });
    const p = expectOk(await api(t.admin, "GET", "/api/crm/leads/pipeline"));
    const card = Object.values(p.grouped).flat().find((c) => c.id === lead.id);
    expect(card, "leadul lipsește din pâlnie");
    expect(card.nextTask?.title === "Primul pas", `nextTask ${JSON.stringify(card.nextTask)}`);
    expect(card.nextTask.dueHasTime === true, "nextTask.dueHasTime lipsă");
  });

  suite.add(T, "ștergerea taskului: dispare din listă", async ({ t }) => {
    const task = await newTask(t.admin, t.leadX.id, { title: "De șters" });
    expectOk(await api(t.admin, "DELETE", `/api/crm/tasks/${task.id}`));
    const items = await tasksOf(t.admin, t.leadX.id);
    expect(!items.some((x) => x.id === task.id), "taskul șters încă apare");
    t.tasks.deleted = task;
  });

  suite.add(T, "a doua ștergere a aceluiași task → 404", async ({ t }) => {
    expectStatus(await api(t.admin, "DELETE", `/api/crm/tasks/${t.tasks.deleted.id}`), 404);
  });

  suite.add(T, "alt workspace nu poate șterge taskul, care rămâne", async ({ t }) => {
    expectStatus(await api(t.intrus, "DELETE", `/api/crm/tasks/${t.tasks.agent.id}`), 404);
    const items = await tasksOf(t.admin, t.leadY.id);
    expect(items.some((x) => x.id === t.tasks.agent.id), "taskul a dispărut");
  });

  suite.add(T, "agentul poate crea și încheia un task pe leadul lui", async ({ t }) => {
    const r = await api(t.agent, "POST", "/api/crm/tasks", { leadId: t.leadZ.id, title: "Apel agent", dueAt: iso(DAY) });
    expectStatus(r, 201);
    const done = expectOk(await api(t.agent, "POST", `/api/crm/tasks/${r.json.id}/complete`));
    expect(done.status === "done", `status ${done.status}`);
    expect(r.json.createdBy === t.agent.user.id, "createdBy nu e agentul");
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ETICHETE
  // ════════════════════════════════════════════════════════════════════════════
  const E = "satelite:etichete";

  suite.add(E, "pregătire: workspace cu trei leaduri și un intrus", async (ctx) => {
    const admin = await signupTenant("etichete");
    const intrus = await signupTenant("etichete-intrus");
    ctx.e = {
      admin, intrus,
      a: await mkLead(admin, "Maria Lungu"),
      b: await mkLead(admin, "Ion Botnaru"),
      c: await mkLead(admin, "Dan Cojocaru"),
      x: await mkLead(intrus, "Străin Etichete"),
      tags: {},
    };
  });

  suite.add(E, "adăugarea etichetei „vip”: 201 și apare pe lead", async ({ e }) => {
    const r = await api(e.admin, "POST", "/api/crm/tags", { leadId: e.a.id, tag: "vip" });
    expectStatus(r, 201);
    expect(r.json.tag === "vip" && r.json.leadId === e.a.id, JSON.stringify(r.json));
    e.tags.vipA = r.json;
    expect((await tagsOf(e.admin, e.a.id)).some((x) => x.id === r.json.id), "eticheta nu apare la recitire");
  });

  suite.add(E, "aceeași etichetă a doua oară nu se dublează (200, același rând)", async ({ e }) => {
    const r = await api(e.admin, "POST", "/api/crm/tags", { leadId: e.a.id, tag: "vip" });
    expectStatus(r, 200);
    expect(r.json.id === e.tags.vipA.id, "a întors alt rând");
    expect((await tagsOf(e.admin, e.a.id)).filter((x) => x.tag === "vip").length === 1, "eticheta s-a dublat");
  });

  suite.add(E, "eticheta cu spații la capete e aceeași etichetă", async ({ e }) => {
    const r = await api(e.admin, "POST", "/api/crm/tags", { leadId: e.a.id, tag: "  vip  " });
    expectStatus(r, 200);
    expect(r.json.id === e.tags.vipA.id, "spațiile au creat o etichetă nouă");
  });

  suite.add(E, "eticheta cu diacritice se păstrează exact", async ({ e }) => {
    const r = await api(e.admin, "POST", "/api/crm/tags", { leadId: e.a.id, tag: "școală de vară" });
    expectStatus(r, 201);
    expect((await tagsOf(e.admin, e.a.id)).some((x) => x.tag === "școală de vară"), "diacriticele s-au pierdut");
  });

  suite.add(E, "etichetele unui lead sunt ordonate alfabetic", async ({ e }) => {
    await api(e.admin, "POST", "/api/crm/tags", { leadId: e.a.id, tag: "abonament" });
    const tags = (await tagsOf(e.admin, e.a.id)).map((x) => x.tag);
    const sorted = [...tags].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    expect(JSON.stringify(tags) === JSON.stringify(sorted), `ordine: ${tags.join(", ")}`);
  });

  suite.add(E, "eticheta goală e refuzată", async ({ e }) => {
    expectClientError(await api(e.admin, "POST", "/api/crm/tags", { leadId: e.a.id, tag: "" }));
  });

  suite.add(E, "eticheta doar din spații e refuzată (nu se salvează o etichetă goală)", async ({ e }) => {
    const r = await api(e.admin, "POST", "/api/crm/tags", { leadId: e.b.id, tag: "     " });
    expectClientError(r, "etichetă goală după curățare: ");
    expect(!(await tagsOf(e.admin, e.b.id)).some((x) => x.tag.trim() === ""), "s-a salvat o etichetă goală");
  });

  suite.add(E, "etichetă de 100 de caractere acceptată, de 101 refuzată", async ({ e }) => {
    expectStatus(await api(e.admin, "POST", "/api/crm/tags", { leadId: e.c.id, tag: "t".repeat(100) }), 201);
    expectClientError(await api(e.admin, "POST", "/api/crm/tags", { leadId: e.c.id, tag: "t".repeat(101) }));
  });

  suite.add(E, "etichetă pe lead inexistent → 404", async ({ e }) => {
    expectStatus(await api(e.admin, "POST", "/api/crm/tags", { leadId: RANDOM_UUID, tag: "vip" }), 404);
  });

  suite.add(E, "etichetă pe leadul altui workspace → 404, nimic scris acolo", async ({ e }) => {
    expectStatus(await api(e.admin, "POST", "/api/crm/tags", { leadId: e.x.id, tag: "infiltrat" }), 404);
    expect((await tagsOf(e.intrus, e.x.id)).length === 0, "eticheta a ajuns pe leadul străin");
  });

  suite.add(E, "leadId nevalid e refuzat", async ({ e }) => {
    expectClientError(await api(e.admin, "POST", "/api/crm/tags", { leadId: "abc", tag: "vip" }));
  });

  suite.add(E, "listarea fără leadId e refuzată", async ({ e }) => {
    expectClientError(await api(e.admin, "GET", "/api/crm/tags"));
  });

  suite.add(E, "listarea pe leadul altui workspace → 404", async ({ e }) => {
    expectStatus(await api(e.admin, "GET", `/api/crm/tags?leadId=${e.x.id}`), 404);
  });

  suite.add(E, "etichetele lui A nu apar la B", async ({ e }) => {
    await api(e.admin, "POST", "/api/crm/tags", { leadId: e.b.id, tag: "vip" });
    await api(e.admin, "POST", "/api/crm/tags", { leadId: e.b.id, tag: "recomandat" });
    const b = await tagsOf(e.admin, e.b.id);
    expect(b.every((x) => x.leadId === e.b.id), "lista lui B conține etichete străine");
    expect(!b.some((x) => x.tag === "școală de vară"), "eticheta lui A apare la B");
  });

  suite.add(E, "sugestiile: distincte pe tot workspace-ul, sortate", async ({ e }) => {
    const s = listOf(expectOk(await api(e.admin, "GET", "/api/crm/tags/suggestions")));
    expect(s.filter((x) => x === "vip").length === 1, "„vip” apare de mai multe ori");
    for (const want of ["vip", "recomandat", "școală de vară", "abonament"]) expect(s.includes(want), `lipsește „${want}”`);
    const sorted = [...s].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    expect(JSON.stringify(s) === JSON.stringify(sorted), "sugestiile nu sunt sortate");
  });

  suite.add(E, "sugestiile altui workspace nu includ etichetele noastre", async ({ e }) => {
    const mark = `secret-${RUN}`;
    await api(e.admin, "POST", "/api/crm/tags", { leadId: e.c.id, tag: mark });
    const s = listOf(expectOk(await api(e.intrus, "GET", "/api/crm/tags/suggestions")));
    expect(!s.includes(mark), "eticheta noastră apare la alt client");
  });

  suite.add(E, "filtrul de leaduri după etichetă întoarce exact leadurile etichetate", async ({ e }) => {
    const r = expectOk(await api(e.admin, "GET", "/api/crm/leads?tag=vip&pageSize=100"));
    const got = ids(listOf(r));
    expect(got.includes(e.a.id) && got.includes(e.b.id), "lipsesc leaduri etichetate „vip”");
    expect(!got.includes(e.c.id), "leadul fără „vip” apare în filtru");
  });

  suite.add(E, "ștergerea etichetei: dispare de pe lead", async ({ e }) => {
    const tag = (await tagsOf(e.admin, e.b.id)).find((x) => x.tag === "recomandat");
    expectOk(await api(e.admin, "DELETE", `/api/crm/tags/${tag.id}`));
    expect(!(await tagsOf(e.admin, e.b.id)).some((x) => x.id === tag.id), "eticheta ștearsă încă apare");
    e.tags.deleted = tag;
  });

  suite.add(E, "eticheta scoasă de pe ultimul lead dispare din sugestii", async ({ e }) => {
    const s = listOf(expectOk(await api(e.admin, "GET", "/api/crm/tags/suggestions")));
    expect(!s.includes("recomandat"), "sugestia rămâne după ștergerea ultimei utilizări");
  });

  suite.add(E, "a doua ștergere → 404", async ({ e }) => {
    expectStatus(await api(e.admin, "DELETE", `/api/crm/tags/${e.tags.deleted.id}`), 404);
  });

  suite.add(E, "alt workspace nu poate șterge eticheta, care rămâne", async ({ e }) => {
    expectStatus(await api(e.intrus, "DELETE", `/api/crm/tags/${e.tags.vipA.id}`), 404);
    expect((await tagsOf(e.admin, e.a.id)).some((x) => x.id === e.tags.vipA.id), "eticheta a dispărut");
  });

  suite.add(E, "după ștergere, eticheta se poate adăuga din nou (201)", async ({ e }) => {
    expectStatus(await api(e.admin, "POST", "/api/crm/tags", { leadId: e.b.id, tag: "recomandat" }), 201);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // CONTACTE
  // ════════════════════════════════════════════════════════════════════════════
  const C = "satelite:contacte";

  suite.add(C, "pregătire: workspace cu două leaduri B2B și un intrus", async (ctx) => {
    const admin = await signupTenant("contacte");
    const intrus = await signupTenant("contacte-intrus");
    ctx.c = {
      admin, intrus,
      a: await mkLead(admin, "Oferta Clinica Dentară", { company: "Clinica Dent SRL" }),
      b: await mkLead(admin, "Oferta Fabrica", { company: "Fabrica Nord SA" }),
      x: await mkLead(intrus, "Străin Contacte"),
      k: {},
    };
  });

  suite.add(C, "adăugarea unui contact complet: 201 cu toate câmpurile", async ({ c }) => {
    const r = await api(c.admin, "POST", "/api/crm/contacts", {
      leadId: c.a.id, fullName: "Nicolae Popovici", role: "Director", phone: "+373 69 123 456", email: "nicolae@example.invalid", isPrimary: true,
    });
    expectStatus(r, 201);
    const j = r.json;
    expect(j.fullName === "Nicolae Popovici" && j.role === "Director" && j.phone === "+373 69 123 456", JSON.stringify(j));
    expect(j.email === "nicolae@example.invalid" && !!j.isPrimary, JSON.stringify(j));
    c.k.first = j;
  });

  suite.add(C, "al doilea contact principal îl retrogradează pe primul: exact unul principal", async ({ c }) => {
    const r = await api(c.admin, "POST", "/api/crm/contacts", { leadId: c.a.id, fullName: "Ana Contabila", role: "Contabil", isPrimary: true });
    expectStatus(r, 201);
    c.k.second = r.json;
    const list = await contactsOf(c.admin, c.a.id);
    const prim = list.filter((x) => !!x.isPrimary);
    expect(prim.length === 1 && prim[0].id === r.json.id, `principali: ${prim.map((x) => x.fullName).join(", ")}`);
  });

  suite.add(C, "un contact nemarcat nu devine principal", async ({ c }) => {
    const r = await api(c.admin, "POST", "/api/crm/contacts", { leadId: c.a.id, fullName: "Tehnicianul Vasile" });
    expectStatus(r, 201);
    expect(!r.json.isPrimary, "contactul nemarcat e principal");
    c.k.third = r.json;
  });

  suite.add(C, "lista: principalul primul, apoi în ordinea adăugării", async ({ c }) => {
    const list = await contactsOf(c.admin, c.a.id);
    expect(list[0].id === c.k.second.id, `primul: ${list[0].fullName}`);
    const rest = list.slice(1).map((x) => x.id);
    expect(JSON.stringify(rest) === JSON.stringify([c.k.first.id, c.k.third.id]), `ordine: ${list.map((x) => x.fullName).join(", ")}`);
  });

  suite.add(C, "marcarea altui contact ca principal prin editare îi scoate pe ceilalți", async ({ c }) => {
    expectOk(await api(c.admin, "PATCH", `/api/crm/contacts/${c.k.third.id}`, { isPrimary: true }));
    const list = await contactsOf(c.admin, c.a.id);
    const prim = list.filter((x) => !!x.isPrimary);
    expect(prim.length === 1 && prim[0].id === c.k.third.id, `principali: ${prim.map((x) => x.fullName).join(", ")}`);
  });

  suite.add(C, "scoaterea marcajului de principal lasă leadul fără principal", async ({ c }) => {
    expectOk(await api(c.admin, "PATCH", `/api/crm/contacts/${c.k.third.id}`, { isPrimary: false }));
    const list = await contactsOf(c.admin, c.a.id);
    expect(list.every((x) => !x.isPrimary), "a rămas un principal");
  });

  suite.add(C, "editarea rolului și telefonului persistă", async ({ c }) => {
    expectOk(await api(c.admin, "PATCH", `/api/crm/contacts/${c.k.first.id}`, { role: "Administrator", phone: "069000111" }));
    const row = (await contactsOf(c.admin, c.a.id)).find((x) => x.id === c.k.first.id);
    expect(row.role === "Administrator" && row.phone === "069000111", JSON.stringify(row));
    expect(row.fullName === "Nicolae Popovici", "numele s-a schimbat fără să fie cerut");
  });

  suite.add(C, "emailul gol șterge adresa (null, nu șir gol)", async ({ c }) => {
    expectOk(await api(c.admin, "PATCH", `/api/crm/contacts/${c.k.first.id}`, { email: "" }));
    const row = (await contactsOf(c.admin, c.a.id)).find((x) => x.id === c.k.first.id);
    expect(row.email === null, `email ${JSON.stringify(row.email)}`);
  });

  suite.add(C, "emailul nevalid e refuzat, adresa rămâne", async ({ c }) => {
    expectClientError(await api(c.admin, "PATCH", `/api/crm/contacts/${c.k.second.id}`, { email: "ana@@firma" }));
    expectClientError(await api(c.admin, "POST", "/api/crm/contacts", { leadId: c.a.id, fullName: "Greșit Email", email: "fara-arond" }));
  });

  suite.add(C, "numele de o literă e refuzat (și după curățarea spațiilor)", async ({ c }) => {
    expectClientError(await api(c.admin, "POST", "/api/crm/contacts", { leadId: c.a.id, fullName: "A" }));
    expectClientError(await api(c.admin, "POST", "/api/crm/contacts", { leadId: c.a.id, fullName: "   A   " }));
  });

  suite.add(C, "numele cu spații la capete se salvează curățat", async ({ c }) => {
    const r = await api(c.admin, "POST", "/api/crm/contacts", { leadId: c.b.id, fullName: "   Irina Moraru  " });
    expectStatus(r, 201);
    expect(r.json.fullName === "Irina Moraru", `nume „${r.json.fullName}”`);
    c.k.onB = r.json;
  });

  suite.add(C, "telefon de 33 de caractere e refuzat", async ({ c }) => {
    expectClientError(await api(c.admin, "POST", "/api/crm/contacts", { leadId: c.b.id, fullName: "Telefon Lung", phone: "1".repeat(33) }));
  });

  suite.add(C, "contact pe leadul altui workspace → 404, nimic scris", async ({ c }) => {
    expectStatus(await api(c.admin, "POST", "/api/crm/contacts", { leadId: c.x.id, fullName: "Infiltrat Ion" }), 404);
    expect((await contactsOf(c.intrus, c.x.id)).length === 0, "contactul a ajuns la client străin");
  });

  suite.add(C, "contact pe lead inexistent → 404", async ({ c }) => {
    expectStatus(await api(c.admin, "POST", "/api/crm/contacts", { leadId: RANDOM_UUID, fullName: "Nimeni Nicăieri" }), 404);
  });

  suite.add(C, "principalul de pe B nu-l atinge pe cel de pe A", async ({ c }) => {
    expectOk(await api(c.admin, "PATCH", `/api/crm/contacts/${c.k.first.id}`, { isPrimary: true }));
    expectOk(await api(c.admin, "PATCH", `/api/crm/contacts/${c.k.onB.id}`, { isPrimary: true }));
    const a = await contactsOf(c.admin, c.a.id);
    expect(a.find((x) => x.id === c.k.first.id)?.isPrimary, "principalul lui A a fost retrogradat de B");
  });

  suite.add(C, "contactele lui A nu apar la B", async ({ c }) => {
    const b = await contactsOf(c.admin, c.b.id);
    expect(b.length === 1 && b[0].id === c.k.onB.id, `B are ${b.length} contacte`);
  });

  suite.add(C, "listarea fără leadId e refuzată", async ({ c }) => {
    expectClientError(await api(c.admin, "GET", "/api/crm/contacts"));
  });

  suite.add(C, "listarea contactelor unui lead străin nu scapă nimic", async ({ c }) => {
    const r = await api(c.intrus, "GET", `/api/crm/contacts?leadId=${c.a.id}`);
    expectNo5xx(r);
    expect(!r.ok || (listOf(r.json) ?? []).length === 0, "contactele noastre sunt vizibile altui client");
  });

  suite.add(C, "alt workspace nu poate edita sau șterge contactul", async ({ c }) => {
    expectStatus(await api(c.intrus, "PATCH", `/api/crm/contacts/${c.k.first.id}`, { fullName: "Spart Complet" }), 404);
    expectStatus(await api(c.intrus, "DELETE", `/api/crm/contacts/${c.k.first.id}`), 404);
    const row = (await contactsOf(c.admin, c.a.id)).find((x) => x.id === c.k.first.id);
    expect(row && row.fullName === "Nicolae Popovici", "contactul a fost modificat de alt client");
  });

  suite.add(C, "editarea unui contact inexistent → 404", async ({ c }) => {
    expectStatus(await api(c.admin, "PATCH", `/api/crm/contacts/${RANDOM_UUID}`, { role: "X" }), 404);
  });

  suite.add(C, "ștergerea contactului: dispare; a doua oară 404", async ({ c }) => {
    expectOk(await api(c.admin, "DELETE", `/api/crm/contacts/${c.k.second.id}`));
    expect(!(await contactsOf(c.admin, c.a.id)).some((x) => x.id === c.k.second.id), "contactul șters apare");
    expectStatus(await api(c.admin, "DELETE", `/api/crm/contacts/${c.k.second.id}`), 404);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // CÂMPURI PERSONALIZATE
  // ════════════════════════════════════════════════════════════════════════════
  const F = "satelite:campuri";

  suite.add(F, "pregătire: workspace cu două leaduri și un intrus", async (ctx) => {
    const admin = await signupTenant("campuri");
    const intrus = await signupTenant("campuri-intrus");
    ctx.f = {
      admin, intrus,
      a: await mkLead(admin, "Cursant Engleză"),
      b: await mkLead(admin, "Cursant Germană"),
      x: await mkLead(intrus, "Străin Câmpuri"),
      fl: {},
    };
  });

  suite.add(F, "câmp text „Nr. contract”: cheia derivată nr_contract, primul în ordine", async ({ f }) => {
    const r = await api(f.admin, "POST", "/api/crm/custom-fields", { label: "Nr. contract" });
    expectStatus(r, 201);
    expect(r.json.key === "nr_contract" && r.json.type === "text" && r.json.orderIndex === 0, JSON.stringify(r.json));
    f.fl.text = r.json;
  });

  suite.add(F, "câmp select „Ediție” cu opțiuni: cheia fără diacritice, opțiunile salvate", async ({ f }) => {
    const r = await api(f.admin, "POST", "/api/crm/custom-fields", { label: "Ediție", type: "select", options: ["Primăvară 2026", "Toamnă 2026"] });
    expectStatus(r, 201);
    expect(r.json.key === "editie" && r.json.type === "select", JSON.stringify(r.json));
    expect(JSON.stringify(r.json.options) === JSON.stringify(["Primăvară 2026", "Toamnă 2026"]), `opțiuni ${JSON.stringify(r.json.options)}`);
    expect(r.json.orderIndex === 1, `orderIndex ${r.json.orderIndex}`);
    f.fl.select = r.json;
  });

  suite.add(F, "câmp numeric „Buget (MDL)”: tip number, al treilea în ordine", async ({ f }) => {
    const r = await api(f.admin, "POST", "/api/crm/custom-fields", { label: "Buget (MDL)", type: "number" });
    expectStatus(r, 201);
    expect(r.json.type === "number" && r.json.key === "buget_mdl" && r.json.orderIndex === 2, JSON.stringify(r.json));
    f.fl.number = r.json;
  });

  suite.add(F, "eticheta care dă aceeași cheie („nr contract”) → 409", async ({ f }) => {
    const r = await api(f.admin, "POST", "/api/crm/custom-fields", { label: "NR contract" });
    expectStatus(r, 409);
    expect(r.json?.error === "field_key_taken", JSON.stringify(r.json));
    expect((await fieldsOf(f.admin)).filter((x) => x.key === "nr_contract").length === 1, "câmpul s-a dublat");
  });

  suite.add(F, "eticheta doar din simboluri primește cheia generică „camp”", async ({ f }) => {
    const r = await api(f.admin, "POST", "/api/crm/custom-fields", { label: "!!!" });
    expectStatus(r, 201);
    expect(r.json.key === "camp", `cheie ${r.json.key}`);
    f.fl.symbols = r.json;
  });

  suite.add(F, "eticheta goală sau doar din spații e refuzată", async ({ f }) => {
    expectClientError(await api(f.admin, "POST", "/api/crm/custom-fields", { label: "" }));
    expectClientError(await api(f.admin, "POST", "/api/crm/custom-fields", { label: "    " }));
  });

  suite.add(F, "tip necunoscut („date”) e refuzat", async ({ f }) => {
    expectClientError(await api(f.admin, "POST", "/api/crm/custom-fields", { label: "Data semnării", type: "date" }));
  });

  suite.add(F, "mai mult de 50 de opțiuni e refuzat", async ({ f }) => {
    const options = Array.from({ length: 51 }, (_, i) => `Opțiunea ${i + 1}`);
    expectClientError(await api(f.admin, "POST", "/api/crm/custom-fields", { label: "Prea multe", type: "select", options }));
  });

  suite.add(F, "lista câmpurilor e în ordinea afișării", async ({ f }) => {
    const list = await fieldsOf(f.admin);
    for (let i = 1; i < list.length; i++) expect(list[i - 1].orderIndex <= list[i].orderIndex, "ordinea nu e crescătoare");
    expect(list[0].id === f.fl.text.id, `primul: ${list[0].label}`);
  });

  suite.add(F, "redenumirea schimbă eticheta, nu și cheia", async ({ f }) => {
    const j = expectOk(await api(f.admin, "PATCH", `/api/crm/custom-fields/${f.fl.text.id}`, { label: "Număr contract" }));
    expect(j.label === "Număr contract" && j.key === "nr_contract", JSON.stringify(j));
    const row = (await fieldsOf(f.admin)).find((x) => x.id === f.fl.text.id);
    expect(row.label === "Număr contract" && row.key === "nr_contract", "recitirea diferă");
  });

  suite.add(F, "tipul nu se poate schimba prin editare", async ({ f }) => {
    await api(f.admin, "PATCH", `/api/crm/custom-fields/${f.fl.text.id}`, { type: "number" });
    const row = (await fieldsOf(f.admin)).find((x) => x.id === f.fl.text.id);
    expect(row.type === "text", `tipul a devenit ${row.type}`);
  });

  suite.add(F, "opțiunile unui select se pot actualiza", async ({ f }) => {
    const opts = ["Primăvară 2026", "Toamnă 2026", "Iarnă 2027"];
    expectOk(await api(f.admin, "PATCH", `/api/crm/custom-fields/${f.fl.select.id}`, { options: opts }));
    const row = (await fieldsOf(f.admin)).find((x) => x.id === f.fl.select.id);
    expect(JSON.stringify(row.options) === JSON.stringify(opts), `opțiuni ${JSON.stringify(row.options)}`);
  });

  suite.add(F, "schimbarea ordinii mută câmpul în listă", async ({ f }) => {
    expectOk(await api(f.admin, "PATCH", `/api/crm/custom-fields/${f.fl.number.id}`, { orderIndex: 0 }));
    expectOk(await api(f.admin, "PATCH", `/api/crm/custom-fields/${f.fl.text.id}`, { orderIndex: 5 }));
    const list = await fieldsOf(f.admin);
    expect(list[0].id === f.fl.number.id, `primul: ${list[0].label}`);
    expect(list.findIndex((x) => x.id === f.fl.text.id) === list.length - 1, "„Număr contract” nu e ultimul");
  });

  suite.add(F, "ordine negativă e refuzată", async ({ f }) => {
    expectClientError(await api(f.admin, "PATCH", `/api/crm/custom-fields/${f.fl.number.id}`, { orderIndex: -1 }));
  });

  suite.add(F, "editarea unui câmp inexistent → 404", async ({ f }) => {
    expectStatus(await api(f.admin, "PATCH", `/api/crm/custom-fields/${RANDOM_UUID}`, { label: "X" }), 404);
  });

  suite.add(F, "alt workspace nu vede și nu poate edita câmpurile noastre", async ({ f }) => {
    const theirs = await fieldsOf(f.intrus);
    expect(!theirs.some((x) => x.id === f.fl.text.id), "câmpul nostru apare la alt client");
    expectStatus(await api(f.intrus, "PATCH", `/api/crm/custom-fields/${f.fl.text.id}`, { label: "Spart" }), 404);
    const row = (await fieldsOf(f.admin)).find((x) => x.id === f.fl.text.id);
    expect(row.label === "Număr contract", "eticheta a fost schimbată de alt client");
  });

  suite.add(F, "valoarea text pe lead: 201 la prima scriere și se recitește", async ({ f }) => {
    const r = await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: f.fl.text.id, value: "CTR-2026-0042" });
    expectStatus(r, 201);
    const v = (await valuesOf(f.admin, f.a.id)).find((x) => x.fieldId === f.fl.text.id);
    expect(v?.value === "CTR-2026-0042", `valoare ${v?.value}`);
  });

  suite.add(F, "a doua scriere actualizează același rând (200, nu dublură)", async ({ f }) => {
    const r = await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: f.fl.text.id, value: "CTR-2026-0043" });
    expectStatus(r, 200);
    const vs = (await valuesOf(f.admin, f.a.id)).filter((x) => x.fieldId === f.fl.text.id);
    expect(vs.length === 1 && vs[0].value === "CTR-2026-0043", JSON.stringify(vs));
  });

  suite.add(F, "valoarea se salvează fără spațiile de la capete", async ({ f }) => {
    expectOk(await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: f.fl.text.id, value: "  CTR-7  " }));
    const v = (await valuesOf(f.admin, f.a.id)).find((x) => x.fieldId === f.fl.text.id);
    expect(v.value === "CTR-7", `valoare „${v.value}”`);
  });

  suite.add(F, "valoarea goală șterge rândul", async ({ f }) => {
    const j = expectOk(await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: f.fl.text.id, value: "" }));
    expect(j.value === null, JSON.stringify(j));
    expect(!(await valuesOf(f.admin, f.a.id)).some((x) => x.fieldId === f.fl.text.id), "rândul gol a rămas");
  });

  suite.add(F, "valoarea null șterge rândul", async ({ f }) => {
    expectOk(await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: f.fl.text.id, value: "Temporar" }));
    expectOk(await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: f.fl.text.id, value: null }));
    expect(!(await valuesOf(f.admin, f.a.id)).some((x) => x.fieldId === f.fl.text.id), "valoarea null nu a șters rândul");
  });

  suite.add(F, "câmp numeric: „1500” se salvează", async ({ f }) => {
    expectOk(await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: f.fl.number.id, value: "1500" }));
    const v = (await valuesOf(f.admin, f.a.id)).find((x) => x.fieldId === f.fl.number.id);
    expect(v?.value === "1500", `valoare ${v?.value}`);
  });

  suite.add(F, "câmp numeric: text („mult”) e refuzat, valoarea veche rămâne", async ({ f }) => {
    const r = await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: f.fl.number.id, value: "mult" });
    expectClientError(r, "text într-un câmp numeric: ");
    const v = (await valuesOf(f.admin, f.a.id)).find((x) => x.fieldId === f.fl.number.id);
    expect(v?.value === "1500", `valoarea a devenit ${v?.value}`);
  });

  suite.add(F, "câmp select: o opțiune din listă se salvează", async ({ f }) => {
    expectOk(await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: f.fl.select.id, value: "Toamnă 2026" }));
    const v = (await valuesOf(f.admin, f.a.id)).find((x) => x.fieldId === f.fl.select.id);
    expect(v?.value === "Toamnă 2026", `valoare ${v?.value}`);
  });

  suite.add(F, "câmp select: o valoare din afara listei e refuzată", async ({ f }) => {
    const r = await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: f.fl.select.id, value: "Vara 1999" });
    expectClientError(r, "opțiune inexistentă într-un select: ");
    const v = (await valuesOf(f.admin, f.a.id)).find((x) => x.fieldId === f.fl.select.id);
    expect(v?.value === "Toamnă 2026", `valoarea a devenit ${v?.value}`);
  });

  suite.add(F, "valoare de 1001 caractere e refuzată", async ({ f }) => {
    expectClientError(await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: f.fl.text.id, value: "x".repeat(1001) }));
  });

  suite.add(F, "valorile lui A nu apar la B", async ({ f }) => {
    const b = await valuesOf(f.admin, f.b.id);
    expect(b.length === 0, `B are ${b.length} valori`);
  });

  suite.add(F, "valoare pe leadul altui workspace → 404", async ({ f }) => {
    expectStatus(await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.x.id, fieldId: f.fl.text.id, value: "X" }), 404);
  });

  suite.add(F, "valoare pe câmpul altui workspace → 404", async ({ f }) => {
    const theirs = await api(f.intrus, "POST", "/api/crm/custom-fields", { label: `Câmp străin ${RUN}` });
    expectStatus(theirs, 201);
    expectStatus(await api(f.admin, "PUT", "/api/crm/custom-fields/values", { leadId: f.a.id, fieldId: theirs.json.id, value: "X" }), 404);
    expect(!(await valuesOf(f.admin, f.a.id)).some((x) => x.fieldId === theirs.json.id), "valoarea pe câmp străin s-a scris");
  });

  suite.add(F, "valorile unui lead străin nu se văd", async ({ f }) => {
    const r = await api(f.intrus, "GET", `/api/crm/custom-fields/values?leadId=${f.a.id}`);
    expectNo5xx(r);
    expect(!r.ok || (listOf(r.json) ?? []).length === 0, "valorile noastre sunt vizibile altui client");
  });

  suite.add(F, "citirea valorilor fără leadId e refuzată", async ({ f }) => {
    expectClientError(await api(f.admin, "GET", "/api/crm/custom-fields/values"));
  });

  suite.add(F, "ștergerea câmpului șterge și valorile lui", async ({ f }) => {
    expectOk(await api(f.admin, "DELETE", `/api/crm/custom-fields/${f.fl.select.id}`));
    expect(!(await fieldsOf(f.admin)).some((x) => x.id === f.fl.select.id), "câmpul șters apare");
    expect(!(await valuesOf(f.admin, f.a.id)).some((x) => x.fieldId === f.fl.select.id), "valorile câmpului șters au rămas");
  });

  suite.add(F, "a doua ștergere a câmpului → 404", async ({ f }) => {
    expectStatus(await api(f.admin, "DELETE", `/api/crm/custom-fields/${f.fl.select.id}`), 404);
  });

  suite.add(F, "alt workspace nu poate șterge câmpul nostru", async ({ f }) => {
    expectStatus(await api(f.intrus, "DELETE", `/api/crm/custom-fields/${f.fl.number.id}`), 404);
    expect((await fieldsOf(f.admin)).some((x) => x.id === f.fl.number.id), "câmpul a dispărut");
    expect((await valuesOf(f.admin, f.a.id)).some((x) => x.fieldId === f.fl.number.id), "valoarea a dispărut");
  });

  suite.add(F, "după ștergere, cheia se poate refolosi", async ({ f }) => {
    const r = await api(f.admin, "POST", "/api/crm/custom-fields", { label: "Ediție", type: "select", options: ["Unică"] });
    expectStatus(r, 201);
    expect(r.json.key === "editie", `cheie ${r.json.key}`);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // VIZUALIZĂRI SALVATE
  // ════════════════════════════════════════════════════════════════════════════
  const V = "satelite:vederi";

  suite.add(V, "pregătire: workspace, un agent, leaduri din surse diferite, un intrus", async (ctx) => {
    const admin = await signupTenant("vederi");
    const intrus = await signupTenant("vederi-intrus");
    const agent = await inviteAgent(admin);
    ctx.v = {
      admin, intrus, agent,
      ref: await mkLead(admin, "Recomandat Popa", { source: "referral" }),
      man: await mkLead(admin, "Manual Rusu", { source: "manual" }),
      vw: {},
    };
  });

  suite.add(V, "salvarea filtrelor curente: 201, personală implicit, filtrele identice", async ({ v }) => {
    const filters = { source: "referral", view: "list", sort: "createdAt", dir: "desc", industry: "Energie", minConsumptionKwh: 500 };
    const r = await api(v.admin, "POST", "/api/crm/saved-views", { name: "Recomandări energie", filters });
    expectStatus(r, 201);
    expect(r.json.isShared === false, "vizualizarea e partajată implicit");
    expect(r.json.createdByUserId === v.admin.user.id, "autorul greșit");
    for (const [k, val] of Object.entries(filters)) expect(r.json.filters[k] === val, `filtrul ${k}: ${r.json.filters[k]}`);
    v.vw.personal = r.json;
  });

  suite.add(V, "vizualizarea salvată apare în lista autorului, cu filtrele", async ({ v }) => {
    const row = (await viewsOf(v.admin)).find((x) => x.id === v.vw.personal.id);
    expect(row && row.filters.source === "referral" && row.filters.minConsumptionKwh === 500, JSON.stringify(row));
  });

  suite.add(V, "reaplicarea filtrelor salvate aduce exact leadurile potrivite", async ({ v }) => {
    const row = (await viewsOf(v.admin)).find((x) => x.id === v.vw.personal.id);
    const got = ids(listOf(expectOk(await api(v.admin, "GET", `/api/crm/leads?source=${row.filters.source}&pageSize=100`))));
    expect(got.includes(v.ref.id) && !got.includes(v.man.id), `rezultat: ${got.length} leaduri`);
  });

  suite.add(V, "cheile de filtru necunoscute sunt ignorate, nu salvate", async ({ v }) => {
    const r = await api(v.admin, "POST", "/api/crm/saved-views", { name: "Cu gunoi", filters: { source: "manual", hacker: "<script>" } });
    expectStatus(r, 201);
    expect(!("hacker" in r.json.filters), "cheia necunoscută s-a salvat");
    expectOk(await api(v.admin, "DELETE", `/api/crm/saved-views/${r.json.id}`));
  });

  suite.add(V, "fără nume e refuzat", async ({ v }) => {
    expectClientError(await api(v.admin, "POST", "/api/crm/saved-views", { name: "   ", filters: {} }));
  });

  suite.add(V, "fără filtre e refuzat", async ({ v }) => {
    expectClientError(await api(v.admin, "POST", "/api/crm/saved-views", { name: "Goală" }));
  });

  suite.add(V, "direcție de sortare necunoscută e refuzată", async ({ v }) => {
    expectClientError(await api(v.admin, "POST", "/api/crm/saved-views", { name: "Sortare", filters: { dir: "lateral" } }));
  });

  suite.add(V, "responsabil care nu e uuid e refuzat", async ({ v }) => {
    expectClientError(await api(v.admin, "POST", "/api/crm/saved-views", { name: "Resp", filters: { assignedTo: "Ion" } }));
  });

  suite.add(V, "consum negativ e refuzat", async ({ v }) => {
    expectClientError(await api(v.admin, "POST", "/api/crm/saved-views", { name: "Consum", filters: { minConsumptionKwh: -5 } }));
  });

  suite.add(V, "agentul nu vede vizualizarea personală a adminului", async ({ v }) => {
    expect(!(await viewsOf(v.agent)).some((x) => x.id === v.vw.personal.id), "vizualizarea personală e vizibilă colegului");
  });

  suite.add(V, "după partajare, agentul o vede", async ({ v }) => {
    const j = expectOk(await api(v.admin, "PATCH", `/api/crm/saved-views/${v.vw.personal.id}`, { isShared: true }));
    expect(j.isShared === true, "isShared nu s-a salvat");
    expect((await viewsOf(v.agent)).some((x) => x.id === v.vw.personal.id), "agentul nu vede vizualizarea partajată");
  });

  suite.add(V, "agentul nu poate redenumi vizualizarea partajată a adminului", async ({ v }) => {
    expectStatus(await api(v.agent, "PATCH", `/api/crm/saved-views/${v.vw.personal.id}`, { name: "Furată" }), 403);
    const row = (await viewsOf(v.admin)).find((x) => x.id === v.vw.personal.id);
    expect(row.name === "Recomandări energie", `nume ${row.name}`);
  });

  suite.add(V, "agentul nu poate șterge vizualizarea partajată a adminului", async ({ v }) => {
    expectStatus(await api(v.agent, "DELETE", `/api/crm/saved-views/${v.vw.personal.id}`), 403);
    expect((await viewsOf(v.admin)).some((x) => x.id === v.vw.personal.id), "vizualizarea a dispărut");
  });

  suite.add(V, "vizualizarea personală a agentului nu apare la admin", async ({ v }) => {
    const r = await api(v.agent, "POST", "/api/crm/saved-views", { name: "Leadurile mele", filters: { onlyMine: true } });
    expectStatus(r, 201);
    v.vw.agentOwn = r.json;
    expect((await viewsOf(v.agent)).some((x) => x.id === r.json.id), "agentul nu-și vede vizualizarea");
    expect(!(await viewsOf(v.admin)).some((x) => x.id === r.json.id), "adminul vede vizualizarea personală a agentului");
  });

  suite.add(V, "agentul își poate redenumi propria vizualizare", async ({ v }) => {
    expectOk(await api(v.agent, "PATCH", `/api/crm/saved-views/${v.vw.agentOwn.id}`, { name: "Doar ale mele" }));
    expect((await viewsOf(v.agent)).find((x) => x.id === v.vw.agentOwn.id)?.name === "Doar ale mele", "redenumirea nu a persistat");
  });

  suite.add(V, "înlocuirea filtrelor persistă întocmai", async ({ v }) => {
    const nf = { stage: "contacted", view: "kanban" };
    expectOk(await api(v.admin, "PATCH", `/api/crm/saved-views/${v.vw.personal.id}`, { filters: nf }));
    const row = (await viewsOf(v.admin)).find((x) => x.id === v.vw.personal.id);
    expect(row.filters.stage === "contacted" && row.filters.view === "kanban" && row.filters.source === undefined, JSON.stringify(row.filters));
  });

  suite.add(V, "lista e ordonată după nume", async ({ v }) => {
    await api(v.admin, "POST", "/api/crm/saved-views", { name: "Alfa restanțe", filters: {} });
    const names = (await viewsOf(v.admin)).map((x) => x.name);
    const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(JSON.stringify(names) === JSON.stringify(sorted), `ordine: ${names.join(", ")}`);
  });

  suite.add(V, "retragerea partajării o ascunde din nou de agent", async ({ v }) => {
    expectOk(await api(v.admin, "PATCH", `/api/crm/saved-views/${v.vw.personal.id}`, { isShared: false }));
    expect(!(await viewsOf(v.agent)).some((x) => x.id === v.vw.personal.id), "agentul încă o vede");
  });

  suite.add(V, "alt workspace nu vede, nu editează și nu șterge", async ({ v }) => {
    expectOk(await api(v.admin, "PATCH", `/api/crm/saved-views/${v.vw.personal.id}`, { isShared: true }));
    expect(!(await viewsOf(v.intrus)).some((x) => x.id === v.vw.personal.id), "vizualizarea partajată scapă la alt client");
    expectStatus(await api(v.intrus, "PATCH", `/api/crm/saved-views/${v.vw.personal.id}`, { name: "Spart" }), 404);
    expectStatus(await api(v.intrus, "DELETE", `/api/crm/saved-views/${v.vw.personal.id}`), 404);
  });

  suite.add(V, "adminul poate face curat în vizualizarea unui agent", async ({ v }) => {
    expectOk(await api(v.admin, "DELETE", `/api/crm/saved-views/${v.vw.agentOwn.id}`));
    expect(!(await viewsOf(v.agent)).some((x) => x.id === v.vw.agentOwn.id), "vizualizarea agentului a rămas");
  });

  suite.add(V, "ștergerea de către autor: dispare; a doua oară 404", async ({ v }) => {
    expectOk(await api(v.admin, "DELETE", `/api/crm/saved-views/${v.vw.personal.id}`));
    expect(!(await viewsOf(v.admin)).some((x) => x.id === v.vw.personal.id), "vizualizarea ștearsă apare");
    expectStatus(await api(v.admin, "DELETE", `/api/crm/saved-views/${v.vw.personal.id}`), 404);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // MOTIVE DE PIERDERE
  // ════════════════════════════════════════════════════════════════════════════
  const M = "satelite:motive";

  suite.add(M, "pregătire: workspace nou și un intrus", async (ctx) => {
    ctx.m = { admin: await signupTenant("motive"), intrus: await signupTenant("motive-intrus"), r: {} };
    ctx.m.lead = await mkLead(ctx.m.admin, "Client Pierdut");
    ctx.m.early = await mkLead(ctx.m.admin, "Mutat Din Prima Zi");
  });

  suite.add(M, "workspace nou: mutarea leadului merge și fără să fi deschis tabla", async ({ m }) => {
    // Nimeni n-a apelat încă GET /api/crm/stages sau /leads/pipeline (care seamănă etapele pâlniei).
    const r = await api(m.admin, "PATCH", `/api/crm/leads/${m.early.id}/stage`, { stage: "contacted" });
    expectOk(r, "prima mutare într-un workspace nou: ");
    expect(r.json.stage === "contacted", `etapă ${r.json.stage}`);
  });

  suite.add(M, "deschiderea tablei (GET etape) seamănă etapele implicite ale pâlniei", async ({ m }) => {
    const list = listOf(expectOk(await api(m.admin, "GET", "/api/crm/stages")));
    const keys = list.map((x) => x.key);
    for (const k of ["new", "contacted", "lost"]) expect(keys.includes(k), `lipsește etapa ${k}`);
    expect(list.find((x) => x.key === "lost")?.isLost === true, "etapa „lost” nu e marcată isLost");
  });

  suite.add(M, "prima citire semănă cele 6 motive implicite, „Altul” ultimul", async ({ m }) => {
    const list = await reasonsOf(m.admin);
    expect(list.length === 6, `${list.length} motive`);
    expect(list[0].label === "Preț prea mare" && list[5].label === "Altul", list.map((x) => x.label).join(", "));
    list.forEach((x, i) => expect(x.orderIndex === i, `orderIndex ${x.label}=${x.orderIndex}`));
  });

  suite.add(M, "a doua citire nu le mai dublează", async ({ m }) => {
    const [a, b] = await Promise.all([reasonsOf(m.admin), reasonsOf(m.admin)]);
    expect(a.length === 6 && b.length === 6, `${a.length}/${b.length} motive`);
  });

  suite.add(M, "motiv nou: intră la finalul ordinii", async ({ m }) => {
    const r = await api(m.admin, "POST", "/api/crm/lost-reasons", { label: "A plecat din țară" });
    expectStatus(r, 201);
    expect(r.json.orderIndex === 6, `orderIndex ${r.json.orderIndex}`);
    const list = await reasonsOf(m.admin);
    expect(list[list.length - 1].id === r.json.id, "motivul nou nu e ultimul");
    m.r.custom = r.json;
  });

  suite.add(M, "motiv fără text e refuzat", async ({ m }) => {
    expectClientError(await api(m.admin, "POST", "/api/crm/lost-reasons", { label: "" }));
  });

  suite.add(M, "motiv doar din spații e refuzat", async ({ m }) => {
    const r = await api(m.admin, "POST", "/api/crm/lost-reasons", { label: "    " });
    expectClientError(r, "motiv gol: ");
  });

  suite.add(M, "motiv de 201 caractere e refuzat", async ({ m }) => {
    expectClientError(await api(m.admin, "POST", "/api/crm/lost-reasons", { label: "m".repeat(201) }));
  });

  suite.add(M, "redenumirea persistă și nu schimbă ordinea", async ({ m }) => {
    const j = expectOk(await api(m.admin, "PATCH", `/api/crm/lost-reasons/${m.r.custom.id}`, { label: "S-a mutat în alt oraș" }));
    expect(j.label === "S-a mutat în alt oraș" && j.orderIndex === m.r.custom.orderIndex, JSON.stringify(j));
    expect((await reasonsOf(m.admin)).find((x) => x.id === m.r.custom.id)?.label === "S-a mutat în alt oraș", "recitirea diferă");
  });

  suite.add(M, "redenumirea cu text gol e refuzată", async ({ m }) => {
    expectClientError(await api(m.admin, "PATCH", `/api/crm/lost-reasons/${m.r.custom.id}`, { label: "" }));
  });

  suite.add(M, "redenumirea unui motiv inexistent → 404", async ({ m }) => {
    expectStatus(await api(m.admin, "PATCH", `/api/crm/lost-reasons/${RANDOM_UUID}`, { label: "X" }), 404);
  });

  suite.add(M, "reordonarea inversă se reflectă în listă, cu indici 0..n-1", async ({ m }) => {
    const list = await reasonsOf(m.admin);
    const rev = ids(list).reverse();
    const j = expectOk(await api(m.admin, "POST", "/api/crm/lost-reasons/reorder", { ids: rev }));
    expect(JSON.stringify(ids(listOf(j))) === JSON.stringify(rev), "răspunsul nu are ordinea cerută");
    const after = await reasonsOf(m.admin);
    expect(JSON.stringify(ids(after)) === JSON.stringify(rev), "recitirea nu are ordinea cerută");
    after.forEach((x, i) => expect(x.orderIndex === i, `orderIndex ${x.label}=${x.orderIndex}`));
  });

  suite.add(M, "reordonarea cu un id străin îl ignoră și ordonează restul", async ({ m }) => {
    const theirs = (await reasonsOf(m.intrus))[0];
    const mine = ids(await reasonsOf(m.admin));
    const wanted = [mine[2], mine[0], mine[1], ...mine.slice(3)];
    expectOk(await api(m.admin, "POST", "/api/crm/lost-reasons/reorder", { ids: [theirs.id, ...wanted] }));
    expect(JSON.stringify(ids(await reasonsOf(m.admin))) === JSON.stringify(wanted), "ordinea nu e cea cerută");
    const theirsAfter = (await reasonsOf(m.intrus)).find((x) => x.id === theirs.id);
    expect(theirsAfter.orderIndex === theirs.orderIndex, "ordinea altui client s-a schimbat");
  });

  suite.add(M, "reordonare cu listă goală sau id-uri nevalide e refuzată", async ({ m }) => {
    expectClientError(await api(m.admin, "POST", "/api/crm/lost-reasons/reorder", { ids: [] }));
    expectClientError(await api(m.admin, "POST", "/api/crm/lost-reasons/reorder", { ids: ["preț"] }));
  });

  suite.add(M, "alt workspace nu vede motivele noastre și nu le poate edita", async ({ m }) => {
    const theirs = await reasonsOf(m.intrus);
    expect(!theirs.some((x) => x.id === m.r.custom.id), "motivul nostru apare la alt client");
    expect(theirs.length === 6, `intrusul are ${theirs.length} motive`);
    expectStatus(await api(m.intrus, "PATCH", `/api/crm/lost-reasons/${m.r.custom.id}`, { label: "Spart" }), 404);
    expectStatus(await api(m.intrus, "DELETE", `/api/crm/lost-reasons/${m.r.custom.id}`), 404);
  });

  suite.add(M, "marcarea „pierdut” fără motiv e refuzată și etapa rămâne", async ({ m }) => {
    const r = await api(m.admin, "PATCH", `/api/crm/leads/${m.lead.id}/stage`, { stage: "lost" });
    expectStatus(r, 400);
    expect(r.json?.error === "lost_reason_required", JSON.stringify(r.json));
    expect((await getLead(m.admin, m.lead.id)).stage === "new", "etapa s-a schimbat fără motiv");
  });

  suite.add(M, "marcarea „pierdut” cu motiv doar din spații e refuzată", async ({ m }) => {
    expectStatus(await api(m.admin, "PATCH", `/api/crm/leads/${m.lead.id}/stage`, { stage: "lost", lostReason: "   " }), 400);
  });

  suite.add(M, "motiv de pierdere de 501 caractere e refuzat", async ({ m }) => {
    expectClientError(await api(m.admin, "PATCH", `/api/crm/leads/${m.lead.id}/stage`, { stage: "lost", lostReason: "x".repeat(501) }));
  });

  suite.add(M, "marcarea „pierdut” cu motiv din listă: etapa și motivul se salvează", async ({ m }) => {
    const reason = (await reasonsOf(m.admin)).find((x) => x.id === m.r.custom.id).label;
    const j = expectOk(await api(m.admin, "PATCH", `/api/crm/leads/${m.lead.id}/stage`, { stage: "lost", lostReason: reason }));
    expect(j.stage === "lost" && j.lostReason === reason, JSON.stringify({ stage: j.stage, lostReason: j.lostReason }));
    const lead = await getLead(m.admin, m.lead.id);
    expect(lead.stage === "lost" && lead.lostReason === reason, "recitirea diferă");
  });

  suite.add(M, "pierderea lasă în istoric un stage_change cu motivul", async ({ m }) => {
    const items = await interactionsOf(m.admin, m.lead.id);
    const sc = items.find((i) => i.type === "stage_change" && i.metadata?.to === "lost");
    expect(sc && sc.metadata.lostReason === "S-a mutat în alt oraș", JSON.stringify(sc));
  });

  suite.add(M, "ștergerea definiției motivului nu atinge leadul pierdut", async ({ m }) => {
    expectOk(await api(m.admin, "DELETE", `/api/crm/lost-reasons/${m.r.custom.id}`));
    expect(!(await reasonsOf(m.admin)).some((x) => x.id === m.r.custom.id), "motivul șters apare");
    expect((await getLead(m.admin, m.lead.id)).lostReason === "S-a mutat în alt oraș", "leadul și-a pierdut motivul");
  });

  suite.add(M, "a doua ștergere a motivului → 404", async ({ m }) => {
    expectStatus(await api(m.admin, "DELETE", `/api/crm/lost-reasons/${m.r.custom.id}`), 404);
  });

  suite.add(M, "etapă inexistentă → 400 unknown_stage", async ({ m }) => {
    const r = await api(m.admin, "PATCH", `/api/crm/leads/${m.lead.id}/stage`, { stage: "anulat_de_tot" });
    expectStatus(r, 400);
    expect(r.json?.error === "unknown_stage", JSON.stringify(r.json));
  });

  suite.add(M, "readucerea leadului în lucru nu cere motiv", async ({ m }) => {
    const j = expectOk(await api(m.admin, "PATCH", `/api/crm/leads/${m.lead.id}/stage`, { stage: "contacted" }));
    expect(j.stage === "contacted", `etapă ${j.stage}`);
  });

  suite.add(M, "alt workspace nu poate marca pierdut leadul nostru", async ({ m }) => {
    expectStatus(await api(m.intrus, "PATCH", `/api/crm/leads/${m.lead.id}/stage`, { stage: "lost", lostReason: "Preț prea mare" }), 404);
    expect((await getLead(m.admin, m.lead.id)).stage === "contacted", "etapa a fost schimbată de alt client");
  });

  // ════════════════════════════════════════════════════════════════════════════
  // FIȘIERE
  // ════════════════════════════════════════════════════════════════════════════
  // Serverul local folosește Storage-ul Supabase la distanță (nu există bucket local). Nu urcăm
  // nimic acolo din teste: verificăm doar căile de validare care răspund ÎNAINTE de Storage,
  // plus o citire a unui obiect inexistent (inofensivă).
  const L = "satelite:fisiere";

  suite.add(L, "pregătire: workspace cu un lead și un intrus", async (ctx) => {
    const admin = await signupTenant("fisiere");
    const intrus = await signupTenant("fisiere-intrus");
    ctx.l = { admin, intrus, lead: await mkLead(admin, "Lead Cu Acte"), x: await mkLead(intrus, "Străin Acte") };
  });

  suite.add(L, "leadul nou nu are fișiere", async ({ l }) => {
    const items = listOf(expectOk(await api(l.admin, "GET", `/api/crm/lead-files?leadId=${l.lead.id}`)));
    expect(items.length === 0, `${items.length} fișiere`);
  });

  suite.add(L, "listarea fără leadId e refuzată", async ({ l }) => {
    expectClientError(await api(l.admin, "GET", "/api/crm/lead-files"));
  });

  suite.add(L, "listarea fișierelor unui lead străin nu scapă nimic", async ({ l }) => {
    const r = await api(l.admin, "GET", `/api/crm/lead-files?leadId=${l.x.id}`);
    expectNo5xx(r);
    expect(!r.ok || (listOf(r.json) ?? []).length === 0, "listă nevidă pe lead străin");
  });

  const sign = (l, over = {}) => api(l.admin, "POST", "/api/crm/lead-files/sign", {
    leadId: l.lead.id, fileName: "oferta.pdf", mime: "application/pdf", sizeBytes: 120_000, ...over,
  });

  suite.add(L, "SVG e refuzat (poartă script în previzualizare)", async ({ l }) => {
    const r = await sign(l, { fileName: "logo.svg", mime: "image/svg+xml" });
    expectStatus(r, 400);
    expect(r.json?.error === "invalid_file_type", JSON.stringify(r.json));
  });

  suite.add(L, "executabil e refuzat", async ({ l }) => {
    const r = await sign(l, { fileName: "factura.exe", mime: "application/x-msdownload" });
    expectStatus(r, 400);
    expect(r.json?.error === "invalid_file_type", JSON.stringify(r.json));
  });

  suite.add(L, "fișier de 0 octeți e refuzat", async ({ l }) => {
    expectClientError(await sign(l, { sizeBytes: 0 }));
  });

  suite.add(L, "fișier peste 15 MB e refuzat", async ({ l }) => {
    expectClientError(await sign(l, { sizeBytes: 15 * 1024 * 1024 + 1 }));
  });

  suite.add(L, "fișier fără nume e refuzat", async ({ l }) => {
    expectClientError(await sign(l, { fileName: "" }));
  });

  suite.add(L, "semnarea pe leadul altui workspace → 404", async ({ l }) => {
    expectStatus(await sign(l, { leadId: l.x.id }), 404);
  });

  const finalize = (l, over = {}) => api(l.admin, "POST", "/api/crm/lead-files/finalize", {
    leadId: l.lead.id, path: `${l.admin.tenant.id}/oferta-${RUN}.pdf`, fileName: "oferta.pdf", mime: "application/pdf", ...over,
  });

  suite.add(L, "finalizare cu calea altui workspace → invalid_path", async ({ l }) => {
    const r = await finalize(l, { path: `${l.intrus.tenant.id}/contract.pdf` });
    expectStatus(r, 400);
    expect(r.json?.error === "invalid_path", JSON.stringify(r.json));
  });

  suite.add(L, "finalizare cu „..” în cale → invalid_path", async ({ l }) => {
    const r = await finalize(l, { path: `${l.admin.tenant.id}/../${l.intrus.tenant.id}/contract.pdf` });
    expectStatus(r, 400);
    expect(r.json?.error === "invalid_path", JSON.stringify(r.json));
  });

  suite.add(L, "finalizare cu subdirector în cale → invalid_path", async ({ l }) => {
    const r = await finalize(l, { path: `${l.admin.tenant.id}/acte/contract.pdf` });
    expectStatus(r, 400);
    expect(r.json?.error === "invalid_path", JSON.stringify(r.json));
  });

  suite.add(L, "finalizare cu tip nepermis → invalid_file_type", async ({ l }) => {
    const r = await finalize(l, { mime: "text/html", fileName: "pagina.html", path: `${l.admin.tenant.id}/pagina.html` });
    expectStatus(r, 400);
    expect(r.json?.error === "invalid_file_type", JSON.stringify(r.json));
  });

  suite.add(L, "finalizare pe leadul altui workspace → 404", async ({ l }) => {
    expectStatus(await finalize(l, { leadId: l.x.id }), 404);
  });

  suite.add(L, "finalizarea unui fișier care n-a fost urcat → 400, niciun rând creat", async ({ l }) => {
    const r = await finalize(l, { path: `${l.admin.tenant.id}/nu-exista-${RUN}.pdf` });
    expectStatus(r, 400);
    expect(r.json?.error === "upload_not_found", JSON.stringify(r.json));
    const items = listOf(expectOk(await api(l.admin, "GET", `/api/crm/lead-files?leadId=${l.lead.id}`)));
    expect(items.length === 0, "s-a creat un rând pentru un fișier inexistent");
  });

  suite.add(L, "previzualizarea unui fișier inexistent → 404", async ({ l }) => {
    expectStatus(await api(l.admin, "GET", `/api/crm/lead-files/${RANDOM_UUID}/preview`), 404);
  });

  suite.add(L, "ștergerea unui fișier inexistent → 404", async ({ l }) => {
    expectStatus(await api(l.admin, "DELETE", `/api/crm/lead-files/${ZERO_UUID}`), 404);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // COMUNICARE
  // ════════════════════════════════════════════════════════════════════════════
  // Toate adresele sunt pe `.invalid` — emailGuard le blochează oriunde, deci nimic nu pleacă
  // real, indiferent de EMAIL_SEND_MODE sau de cheia Resend din .env.
  const K = "satelite:comunicare";

  suite.add(K, "pregătire: workspace, lead cu email, lead fără email, un intrus", async (ctx) => {
    const admin = await signupTenant("comunicare");
    const intrus = await signupTenant("comunicare-intrus");
    ctx.k = {
      admin, intrus,
      lead: await mkLead(admin, "Olga Țurcanu", { email: `olga-${RUN}@example.invalid` }),
      noMail: await mkLead(admin, "Petru Fără Email"),
      x: await mkLead(intrus, "Străin Comunicare"),
      i: {},
    };
    // Ca în interfață: tabla se deschide înainte de orice mutare (seamănă etapele pâlniei).
    expectOk(await api(admin, "GET", "/api/crm/stages"));
  });

  suite.add(K, "apel ieșit cu durată și rezultat: 201, textul compus corect", async ({ k }) => {
    const r = await api(k.admin, "POST", "/api/crm/comms/log", {
      leadId: k.lead.id, channel: "call", direction: "outbound", outcome: "A răspuns", body: "Discutat oferta de toamnă", durationSec: 125,
    });
    expectStatus(r, 201);
    const j = r.json;
    expect(j.type === "call" && j.direction === "outbound", JSON.stringify(j));
    expect(j.body === "A răspuns · Discutat oferta de toamnă · 2 min 5 s", `body „${j.body}”`);
    expect(j.metadata?.durationSec === 125 && j.metadata?.outcome === "A răspuns", JSON.stringify(j.metadata));
    expect(j.userId === k.admin.user.id, "userId greșit");
    k.i.call = j;
  });

  suite.add(K, "apelul apare în istoricul leadului", async ({ k }) => {
    expect((await interactionsOf(k.admin, k.lead.id)).some((x) => x.id === k.i.call.id), "apelul lipsește din istoric");
  });

  suite.add(K, "durata sub un minut se scrie în secunde", async ({ k }) => {
    const r = await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.lead.id, channel: "call", durationSec: 45 });
    expectStatus(r, 201);
    expect(r.json.body === "45 s", `body „${r.json.body}”`);
  });

  suite.add(K, "durata 0 nu apare în text", async ({ k }) => {
    const r = await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.lead.id, channel: "call", outcome: "Nu răspunde", durationSec: 0 });
    expectStatus(r, 201);
    expect(r.json.body === "Nu răspunde", `body „${r.json.body}”`);
  });

  suite.add(K, "atingere fără text: body null", async ({ k }) => {
    const r = await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.lead.id, channel: "meeting" });
    expectStatus(r, 201);
    expect(r.json.body === null, `body ${JSON.stringify(r.json.body)}`);
  });

  suite.add(K, "direcția implicită e „outbound”", async ({ k }) => {
    const r = await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.lead.id, channel: "sms", body: "Confirmare programare" });
    expectStatus(r, 201);
    expect(r.json.direction === "outbound", `direcție ${r.json.direction}`);
  });

  suite.add(K, "notă internă: tip note, direcție internal", async ({ k }) => {
    const r = await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.lead.id, channel: "note", direction: "internal", body: "Preferă apeluri după 18:00" });
    expectStatus(r, 201);
    expect(r.json.type === "note" && r.json.direction === "internal", JSON.stringify(r.json));
  });

  suite.add(K, "mesaj WhatsApp primit: direcție inbound", async ({ k }) => {
    const r = await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.noMail.id, channel: "whatsapp", direction: "inbound", body: "Bună, mai e loc la curs?" });
    expectStatus(r, 201);
    expect(r.json.direction === "inbound" && r.json.type === "whatsapp", JSON.stringify(r.json));
  });

  suite.add(K, "după primul contact, leadul nu mai e „necontactat”", async ({ k }) => {
    const fresh = await mkLead(k.admin, "Încă Necontactat");
    let b = await today(k.admin);
    expect(b.uncontacted.some((l) => l.id === fresh.id), "leadul nou nu e necontactat");
    expectStatus(await api(k.admin, "POST", "/api/crm/comms/log", { leadId: fresh.id, channel: "call", outcome: "Discutat" }), 201);
    b = await today(k.admin);
    expect(!b.uncontacted.some((l) => l.id === fresh.id), "leadul contactat e încă „necontactat”");
  });

  suite.add(K, "canal necunoscut („fax”) e refuzat", async ({ k }) => {
    expectClientError(await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.lead.id, channel: "fax" }));
  });

  suite.add(K, "direcție necunoscută e refuzată", async ({ k }) => {
    expectClientError(await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.lead.id, channel: "call", direction: "sideways" }));
  });

  suite.add(K, "durată negativă sau peste o zi e refuzată", async ({ k }) => {
    expectClientError(await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.lead.id, channel: "call", durationSec: -1 }));
    expectClientError(await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.lead.id, channel: "call", durationSec: 86_401 }));
  });

  suite.add(K, "text de peste 2000 de caractere e refuzat", async ({ k }) => {
    expectClientError(await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.lead.id, channel: "note", body: "n".repeat(2001) }));
  });

  suite.add(K, "înregistrare pe leadul altui workspace → 404, nimic scris", async ({ k }) => {
    expectStatus(await api(k.admin, "POST", "/api/crm/comms/log", { leadId: k.x.id, channel: "call", body: "Infiltrat" }), 404);
    expect((await interactionsOf(k.intrus, k.x.id)).length === 0, "interacțiunea a ajuns la client străin");
  });

  suite.add(K, "email către adresă nelivrabilă: 200 „blocked”, urmă în istoric, nimic trimis", async ({ k }) => {
    const r = await api(k.admin, "POST", "/api/crm/comms/email", { leadId: k.lead.id, subject: "Oferta de toamnă", body: "Bună ziua, vă trimit oferta." });
    expectStatus(r, 200);
    expect(r.json.status === "blocked" && typeof r.json.detail === "string", JSON.stringify(r.json));
    const it = r.json.interaction;
    expect(it?.type === "email" && it.direction === "outbound", JSON.stringify(it));
    expect(it.metadata?.status === "blocked" && it.metadata?.to === `olga-${RUN}@example.invalid`, JSON.stringify(it.metadata));
    expect(it.body.startsWith("Oferta de toamnă\n\nBună ziua"), `body „${it.body}”`);
    expect((await interactionsOf(k.admin, k.lead.id)).some((x) => x.id === it.id), "emailul nu apare în istoric");
    k.i.email = it;
  });

  suite.add(K, "email cu destinatar explicit îl folosește pe acela", async ({ k }) => {
    const to = `contabil-${RUN}@example.invalid`;
    const r = await api(k.admin, "POST", "/api/crm/comms/email", { leadId: k.lead.id, subject: "Factura", body: "Atașat factura.", to });
    expectStatus(r, 200);
    expect(r.json.interaction?.metadata?.to === to, JSON.stringify(r.json.interaction?.metadata));
  });

  suite.add(K, "email către lead fără adresă: 400 no_address, nicio urmă", async ({ k }) => {
    const before = (await interactionsOf(k.admin, k.noMail.id)).length;
    const r = await api(k.admin, "POST", "/api/crm/comms/email", { leadId: k.noMail.id, subject: "Salut", body: "Text" });
    expectStatus(r, 400);
    expect(r.json?.error === "no_address", JSON.stringify(r.json));
    expect((await interactionsOf(k.admin, k.noMail.id)).length === before, "s-a scris o interacțiune pentru un email imposibil");
  });

  suite.add(K, "email fără subiect sau fără text e refuzat", async ({ k }) => {
    expectClientError(await api(k.admin, "POST", "/api/crm/comms/email", { leadId: k.lead.id, subject: "", body: "Text" }));
    expectClientError(await api(k.admin, "POST", "/api/crm/comms/email", { leadId: k.lead.id, subject: "Subiect", body: "" }));
  });

  suite.add(K, "subiect de 201 caractere e refuzat", async ({ k }) => {
    expectClientError(await api(k.admin, "POST", "/api/crm/comms/email", { leadId: k.lead.id, subject: "s".repeat(201), body: "Text" }));
  });

  suite.add(K, "destinatar explicit nevalid e refuzat", async ({ k }) => {
    expectClientError(await api(k.admin, "POST", "/api/crm/comms/email", { leadId: k.lead.id, subject: "S", body: "T", to: "olga la firma" }));
  });

  suite.add(K, "email pe leadul altui workspace → 404", async ({ k }) => {
    expectStatus(await api(k.admin, "POST", "/api/crm/comms/email", { leadId: k.x.id, subject: "S", body: "T", to: `x-${RUN}@example.invalid` }), 404);
  });

  suite.add(K, "fluxul echipei: atingerile noastre, cele mai noi primele, cu numele leadului", async ({ k }) => {
    const items = await feed(k.admin);
    expect(items.some((x) => x.id === k.i.call.id), "apelul lipsește din flux");
    const row = items.find((x) => x.id === k.i.email.id);
    expect(row && row.leadName === k.lead.fullName, `leadName ${row?.leadName}`);
    for (let i = 1; i < items.length; i++) expect(new Date(items[i - 1].occurredAt) >= new Date(items[i].occurredAt), "fluxul nu e descrescător");
  });

  suite.add(K, "fluxul nu include schimbările de etapă", async ({ k }) => {
    expectOk(await api(k.admin, "PATCH", `/api/crm/leads/${k.lead.id}/stage`, { stage: "contacted" }));
    const items = await feed(k.admin);
    expect(!items.some((x) => x.type === "stage_change" || x.type === "system"), "zgomot de aplicație în flux");
  });

  suite.add(K, "filtrul pe canal „call” întoarce doar apeluri", async ({ k }) => {
    const items = await feed(k.admin, "?channel=call");
    expect(items.length >= 3 && items.every((x) => x.type === "call"), `tipuri: ${[...new Set(items.map((x) => x.type))].join(",")}`);
  });

  suite.add(K, "canal necunoscut în filtru revine la fluxul implicit", async ({ k }) => {
    const items = await feed(k.admin, "?channel=stage_change");
    expect(items.length > 0 && !items.some((x) => x.type === "stage_change"), "filtrul a lăsat să treacă stage_change");
  });

  suite.add(K, "filtrul pe autor: doar atingerile lui", async ({ k }) => {
    const mine = await feed(k.admin, `?owner=${k.admin.user.id}`);
    expect(mine.length > 0, "fluxul meu e gol");
    const nobody = await feed(k.admin, `?owner=${RANDOM_UUID}`);
    expect(nobody.length === 0, `${nobody.length} atingeri ale unui autor inexistent`);
  });

  suite.add(K, "filtru pe autor nevalid nu cade cu 500", async ({ k }) => {
    expectNo5xx(await api(k.admin, "GET", "/api/crm/comms/feed?owner=nu-e-uuid"));
  });

  suite.add(K, "fluxul altui workspace nu conține atingerile noastre", async ({ k }) => {
    const items = await feed(k.intrus);
    expect(!items.some((x) => x.leadId === k.lead.id || x.id === k.i.call.id), "scurgere în fluxul altui client");
  });
}
