// Matricile generice: fiecare rută din catalog primește aceleași verificări de robustețe.
// Nu testează ce face ruta — asta e treaba grupurilor pe domenii — ci că nu cade, nu scapă
// date și nu acceptă gunoi, oricine ar trimite orice.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  ROOT, RUN, api, anon, expect, expectStatus, expectClientError, expectNo5xx, expectOk, listOf, idOf,
  ZERO_UUID, RANDOM_UUID,
} from "../lib.mjs";
import { ENDPOINTS, hasParam, withParam, hasBody, label } from "../catalog.mjs";

const NON_UUIDS = [
  ["abc", "text"],
  ["12345", "număr"],
  ["1' OR '1'='1", "injecție SQL"],
];

const BROKEN_BODIES = [
  ["{stricat", "JSON stricat"],
  ["[]", "listă în loc de obiect"],
  ["null", "null"],
  ['"doar un text"', "string"],
  ["42", "număr"],
  ["", "corp gol"],
];

// Valori ostile puse pe TOATE câmpurile uzuale de nume/text ale unei creări. Ruta poate
// accepta (201) sau refuza (400) — dar niciodată să cadă (500).
const HOSTILE = [
  ["text de 20.000 de caractere", "A".repeat(20000)],
  ["HTML/XSS", `<img src=x onerror=alert(1)>"'<script>alert(1)</script>`],
  ["injecție SQL", `'; DROP TABLE leads; --`],
  ["octet nul", "Nume\u0000cu octet nul"],
  ["tipuri greșite", { nested: [1, 2, 3] }],
];
const TEXT_KEYS = ["name", "fullName", "label", "title", "tag", "body", "notes", "company", "description", "subject", "email", "phone", "key", "sku"];

// Ruta cere drepturi pe care un agent de vânzări (rol `teacher`) NU le are
// (server/lib/crm/permissions.ts). Verificarea de drept rulează ÎNAINTEA oricărei căutări
// după id, deci un id inexistent tot trebuie să dea 403, nu 404.
const AGENT_FORBIDDEN = [
  ["POST", "/api/crm/stages"], ["PATCH", "/api/crm/stages/:id"], ["DELETE", "/api/crm/stages/:id"],
  ["POST", "/api/crm/stages/reorder"],
  ["POST", "/api/crm/pipelines"], ["PATCH", "/api/crm/pipelines/:id"], ["DELETE", "/api/crm/pipelines/:id"],
  ["POST", "/api/crm/products"], ["PATCH", "/api/crm/products/:id"], ["POST", "/api/crm/products/:id/archive"],
  ["POST", "/api/crm/products/:id/stock/adjust"],
  ["POST", "/api/crm/automations"], ["PATCH", "/api/crm/automations/:id"], ["DELETE", "/api/crm/automations/:id"],
  ["POST", "/api/crm/assignment/rules"], ["PATCH", "/api/crm/assignment/rules/:id"], ["DELETE", "/api/crm/assignment/rules/:id"],
  ["POST", "/api/crm/distribution/run"], ["POST", "/api/crm/distribution/preview"],
  ["PUT", "/api/crm/kpi-targets"], ["DELETE", "/api/crm/kpi-targets/:id"],
  ["GET", "/api/crm/audit"], ["GET", "/api/crm/permissions/team"], ["GET", "/api/crm/team"],
  ["GET", "/api/crm/gdpr/export/:leadId"], ["POST", "/api/crm/gdpr/anonymize/:leadId"],
  ["GET", "/api/crm/leads/export.csv"],
  ["POST", "/api/crm/capture-sources"], ["PATCH", "/api/crm/capture-sources/:id"], ["DELETE", "/api/crm/capture-sources/:id"],
  ["PUT", "/api/crm/company-profile"],
  ["POST", "/api/crm/cadences"], ["PATCH", "/api/crm/cadences/:id"], ["DELETE", "/api/crm/cadences/:id"],
];

// Ce poate face agentul (drepturile comerciale de bază).
const AGENT_ALLOWED_READS = [
  "/api/crm/leads", "/api/crm/leads/pipeline", "/api/crm/stages", "/api/crm/pipelines", "/api/crm/products",
  "/api/crm/tasks?scope=upcoming", "/api/crm/tasks/today", "/api/crm/companies", "/api/crm/tags/suggestions", "/api/crm/lost-reasons",
  "/api/crm/permissions", "/api/crm/reports", "/api/crm/saved-views", "/api/crm/custom-fields",
];

// Resursa din spatele parametrului unei rute — pentru izolarea între clienți.
function resourceOf(p) {
  const table = [
    [/\/team\/members\/:id|\/assignment\/members\/:userId/, "member"],
    [/\/stages\/:id/, "stage"], [/\/pipelines\/:id/, "pipeline"], [/\/saved-views\/:id/, "view"],
    [/\/contacts\/:id/, "contact"], [/\/custom-fields\/:id/, "field"], [/\/gdpr\/.*:leadId/, "lead"],
    [/\/companies\/:id/, "company"], [/\/tags\/:id/, "tag"], [/\/lost-reasons\/:id/, "lostReason"],
    [/\/tasks\/:id/, "task"], [/\/leads\/:id/, "lead"], [/\/products\/:id/, "product"],
    [/\/capture-sources\/:id/, "captureSource"], [/^\/api\/crm\/cadences\/:id/, "cadence"],
  ];
  for (const [re, key] of table) if (re.test(p)) return key;
  return null;
}

const MARK = `IZOLARE-${RUN}`;

export function register(suite) {
  const ep = ENDPOINTS;

  // ── 0. Catalogul acoperă tot ce e montat ────────────────────────────────────
  suite.add("matrix:catalog", "fiecare rută din server/routes/crm*.ts e în catalogul suitei", () => {
    const dir = path.join(ROOT, "server/routes");
    const app = readFileSync(path.join(ROOT, "server/app.ts"), "utf8");
    const known = new Set(ep.map((e) => `${e.method} ${e.path}`));
    const missing = [];
    for (const f of readdirSync(dir).filter((x) => /^crm[A-Z].*\.ts$/.test(x))) {
      const src = readFileSync(path.join(dir, f), "utf8");
      const varName = src.match(/export const (\w+Routes) = new Hono/)?.[1];
      if (!varName) continue;
      const mount = app.match(new RegExp(`app\\.route\\("([^"]+)",\\s*${varName}\\)`))?.[1];
      if (!mount) { missing.push(`${f}: routerul nu e montat`); continue; }
      const re = new RegExp(`${varName}\\.(get|post|put|patch|delete)\\(\\s*"([^"]+)"`, "g");
      for (const m of src.matchAll(re)) {
        const sub = m[2];
        if (sub.endsWith("/*")) continue; // middleware de drepturi, nu rută
        // Middleware-ul de drepturi e înregistrat pe calea exactă înainte de handler.
        const next = src.slice(m.index, m.index + 200);
        if (/^\S+\(\s*"[^"]+",\s*requireCrmPermission\([^)]*\)\s*\);/.test(next)) continue;
        const full = `${m[1].toUpperCase()} ${mount}${sub === "/" ? "" : sub}`;
        if (!known.has(full)) missing.push(full);
      }
    }
    expect(missing.length === 0, `rute fără scenarii: ${missing.join(", ")}`);
  });

  // ── 1. Fără sesiune: 401 JSON pe tot (nu HTML, nu 500, nu date) ─────────────
  suite.each(
    "matrix:anon",
    ep.filter((e) => !e.public),
    (e) => `fără sesiune → 401 · ${label(e)}`,
    async (e) => {
      const r = await api(anon, e.method, withParam(e, ZERO_UUID), hasBody(e) ? {} : undefined);
      expectStatus(r, 401);
      expect(r.json && r.json.error, `401 fără corp JSON: ${r.text.slice(0, 80)}`);
    }
  );

  // ── 2. Id inexistent (uuid valid): 4xx curat, niciodată 500 sau 2xx cu date ──
  for (const [id, what] of [[ZERO_UUID, "uuid zero"], [RANDOM_UUID, "uuid aleator"]]) {
    suite.each(
      "matrix:id-inexistent",
      ep.filter(hasParam),
      (e) => `${what} → 4xx · ${label(e)}`,
      async (e, ctx) => {
        const r = await api(ctx.admin, e.method, withParam(e, id), hasBody(e) ? {} : undefined);
        expectClientError(r);
      }
    );
  }

  // ── 3. Id care nu e uuid: 400/404, nu o eroare de Postgres „invalid input syntax" ──
  for (const [id, what] of NON_UUIDS) {
    suite.each(
      "matrix:id-invalid",
      ep.filter(hasParam),
      (e) => `id „${what}" → 4xx · ${label(e)}`,
      async (e, ctx) => {
        const r = await api(ctx.admin, e.method, withParam(e, encodeURIComponent(id)), hasBody(e) ? {} : undefined);
        expectClientError(r);
      }
    );
  }

  // ── 4. Corp stricat: 4xx sau acțiune fără corp, dar niciodată 500 ───────────
  for (const [raw, what] of BROKEN_BODIES) {
    suite.each(
      "matrix:corp-stricat",
      ep.filter(hasBody),
      (e) => `corp „${what}" → fără 500 · ${label(e)}`,
      async (e, ctx) => {
        const r = await api(ctx.admin, e.method, withParam(e, ZERO_UUID), raw);
        expectNo5xx(r);
      }
    );
  }

  // ── 5. Valori ostile pe câmpurile de text ale creărilor ─────────────────────
  const creates = ep.filter((e) => e.method === "POST" && !hasParam(e) && !e.public && !/run|apply|preview|reorder|bulk|merge|email|sign|finalize|digest|enroll/.test(e.path));
  for (const [what, value] of HOSTILE) {
    suite.each(
      "matrix:valori-ostile",
      creates,
      (e) => `${what} → fără 500 · ${label(e)}`,
      async (e, ctx) => {
        const body = Object.fromEntries(TEXT_KEYS.map((k) => [k, value]));
        const r = await api(ctx.admin, e.method, e.path, body);
        expectNo5xx(r);
      }
    );
  }

  // ── 6. Agentul de vânzări nu umblă la setări ────────────────────────────────
  suite.each(
    "matrix:rol-agent",
    AGENT_FORBIDDEN,
    ([m, p]) => `agentul primește 403 · ${m} ${p}`,
    async ([m, p], ctx) => {
      expect(ctx.agent.user?.role === "teacher", `seed-ul s-a schimbat: approver@atic are rolul ${ctx.agent.user?.role}`);
      const r = await api(ctx.agent, m, p.replace(/:[a-zA-Z]+/g, ZERO_UUID), ["POST", "PUT", "PATCH"].includes(m) ? { name: "x", label: "x" } : undefined);
      expectStatus(r, 403);
    }
  );
  suite.each(
    "matrix:rol-agent",
    AGENT_ALLOWED_READS,
    (p) => `agentul poate citi · GET ${p}`,
    async (p, ctx) => { expectOk(await api(ctx.agent, "GET", p)); }
  );

  // ── 7. Izolarea între clienți ──────────────────────────────────────────────
  // Clientul A (admin ATIC) creează câte o resursă din fiecare tip, cu un marcaj unic. Clientul B
  // (workspace nou) încearcă să le citească, modifice, șteargă și să le vadă în listele lui.
  const G = "matrix:izolare";
  suite.add(G, "clientul A își creează resursele (lead, firmă, produs, task, etichetă, contact, …)", async (ctx) => {
    const a = ctx.admin;
    const ids = (ctx.aIds = {});
    const mk = async (key, p, body) => {
      const r = await api(a, "POST", p, body);
      expectOk(r, `${key}: `);
      ids[key] = idOf(r.json);
      expect(ids[key], `${key}: răspunsul nu conține id — ${r.text.slice(0, 120)}`);
    };
    await mk("pipeline", "/api/crm/pipelines", { name: `${MARK} pâlnie` });
    await mk("stage", "/api/crm/stages", { label: `${MARK} etapă`, pipelineId: ids.pipeline });
    await mk("company", "/api/crm/companies", { name: `${MARK} SRL` });
    await mk("product", "/api/crm/products", { name: `${MARK} produs`, listPriceCents: 1000 });
    await mk("lead", "/api/crm/leads", { fullName: `${MARK} Lead`, email: `izolare-${RUN}@example.invalid`, phone: "+37360000001", valueCents: 50000 });
    await mk("task", "/api/crm/tasks", { leadId: ids.lead, title: `${MARK} task` });
    await mk("contact", "/api/crm/contacts", { leadId: ids.lead, fullName: `${MARK} Contact` });
    await mk("tag", "/api/crm/tags", { leadId: ids.lead, tag: `${MARK}-tag` });
    await mk("view", "/api/crm/saved-views", { name: `${MARK} vedere`, filters: {} });
    await mk("field", "/api/crm/custom-fields", { label: `${MARK} câmp` });
    await mk("lostReason", "/api/crm/lost-reasons", { label: `${MARK} motiv` });
    await mk("captureSource", "/api/crm/capture-sources", { name: `${MARK} formular` });
    await mk("cadence", "/api/crm/cadences", { name: `${MARK} cadență` });
    ids.member = ctx.agent.user?.id;
  });

  // Fără asta, izolarea ar trece și dacă clientul B ar primi 403 pe tot CRM-ul — un test care nu poate pica.
  suite.add(G, "clientul B chiar are CRM (își creează și își vede propriul lead)", async (ctx) => {
    const created = expectOk(await api(ctx.other, "POST", "/api/crm/leads", { fullName: `Propriu ${RUN}` }));
    const mine = listOf(expectOk(await api(ctx.other, "GET", "/api/crm/leads")));
    expect(mine.some((l) => l.id === idOf(created)), "clientul B nu își vede propriul lead");
  });

  const isolated = ep.filter((e) => hasParam(e) && resourceOf(e.path));
  suite.each(
    G,
    isolated,
    (e) => `clientul B e refuzat · ${label(e)}`,
    async (e, ctx) => {
      const id = ctx.aIds?.[resourceOf(e.path)];
      expect(id, "resursa clientului A nu a fost creată (vezi scenariul de setup)");
      const body = hasBody(e) ? { name: "furat", fullName: "Furat", label: "furat", title: "furat", stage: "won", role: "admin", active: false, enabled: false, crmAccess: false, qty: 5, delta: 5, threshold: 1 } : undefined;
      const r = await api(ctx.other, e.method, withParam(e, id), body);
      if (r.status >= 500) throw new Error(`eroare de server: HTTP ${r.status} ${r.text.slice(0, 120)}`);
      expect(r.status >= 400, `clientul B a primit HTTP ${r.status} pe resursa clientului A: ${r.text.slice(0, 160)}`);
      expect(!r.text.includes(MARK), "răspunsul refuzului conține date ale clientului A");
    }
  );

  const lists = [
    "/api/crm/leads", "/api/crm/leads/pipeline", "/api/crm/leads/segments", "/api/crm/companies", "/api/crm/products",
    "/api/crm/tasks?scope=upcoming", "/api/crm/tasks/today", "/api/crm/tags/suggestions", "/api/crm/contacts",
    "/api/crm/saved-views", "/api/crm/custom-fields", "/api/crm/lost-reasons", "/api/crm/pipelines", "/api/crm/stages",
    "/api/crm/capture-sources", "/api/crm/cadences", "/api/crm/reports", "/api/crm/reports/funnel", "/api/crm/audit",
    "/api/crm/team", "/api/crm/comms/feed", "/api/crm/companies/duplicates", "/api/crm/automations/runs",
    "/api/crm/assignment/members", "/api/crm/documents", `/api/crm/leads?search=${MARK}`, `/api/crm/companies?search=${MARK}`,
  ];
  suite.each(G, lists, (p) => `listele clientului B nu conțin nimic din A · GET ${p}`, async (p, ctx) => {
    const r = await api(ctx.other, "GET", p);
    expectNo5xx(r);
    expect(!r.text.includes(MARK), "lista clientului B conține date ale clientului A");
    for (const id of Object.values(ctx.aIds ?? {})) {
      if (id && id !== ctx.aIds.member) expect(!r.text.includes(id), `lista clientului B conține id-ul ${id} al clientului A`);
    }
  });

  // IDOR prin query: clientul B pune în `?leadId=` / `?companyId=` id-ul unui lead al clientului A.
  const byQuery = [
    "/api/crm/contacts?leadId=:lead", "/api/crm/tasks?leadId=:lead", "/api/crm/tags?leadId=:lead",
    "/api/crm/custom-fields/values?leadId=:lead", "/api/crm/lead-files?leadId=:lead",
    "/api/crm/cadences/enrollments?leadId=:lead", "/api/crm/comms/feed?leadId=:lead",
    "/api/crm/documents?leadId=:lead", "/api/crm/audit?leadId=:lead", "/api/crm/leads?companyId=:company",
    "/api/crm/documents?companyId=:company", "/api/crm/stages?pipelineId=:pipeline",
    "/api/crm/leads/pipeline?pipelineId=:pipeline", "/api/crm/reports?pipelineId=:pipeline",
    "/api/crm/reports/funnel?pipelineId=:pipeline",
  ];
  suite.each(G, byQuery, (p) => `clientul B nu citește prin query · GET ${p}`, async (p, ctx) => {
    const url = p.replace(/:(lead|company|pipeline)\b/, (_, k) => ctx.aIds[k]);
    const r = await api(ctx.other, "GET", url);
    expectNo5xx(r);
    expect(!r.text.includes(MARK), `clientul B vede date ale clientului A: ${r.text.slice(0, 160)}`);
    const items = r.ok ? listOf(r.json) : null;
    expect(!items || items.length === 0 || !items.some((x) => JSON.stringify(x).includes(RUN)), "lista conține rânduri ale clientului A");
  });

  suite.add(G, "după toate încercările clientului B, datele clientului A sunt neatinse", async (ctx) => {
    const a = ctx.admin, ids = ctx.aIds;
    const lead = expectOk(await api(a, "GET", `/api/crm/leads/${ids.lead}`));
    const l = lead.lead ?? lead;
    expect(l.fullName === `${MARK} Lead`, `numele leadului s-a schimbat: ${l.fullName}`);
    expect(l.email === `izolare-${RUN}@example.invalid`, `leadul a fost anonimizat de clientul B: ${l.email}`);
    const prods = listOf(expectOk(await api(a, "GET", "/api/crm/products")));
    const p = prods.find((x) => x.id === ids.product);
    expect(p && !p.archivedAt && p.name === `${MARK} produs`, "produsul clientului A a fost modificat/arhivat");
    const tasks = listOf(expectOk(await api(a, "GET", `/api/crm/tasks?leadId=${ids.lead}`)));
    expect(tasks.some((t) => t.id === ids.task), "taskul clientului A a dispărut");
    const stages = listOf(expectOk(await api(a, "GET", `/api/crm/stages?pipelineId=${ids.pipeline}`)));
    expect(stages.some((s) => s.id === ids.stage), "etapa clientului A a dispărut");
    const team = expectOk(await api(a, "GET", "/api/crm/team"));
    const agent = team.members.find((m) => m.id === ids.member);
    expect(agent && agent.isActive && agent.crmAccess && agent.role === "teacher", `agentul clientului A a fost modificat: ${JSON.stringify(agent)}`);
  });
}
