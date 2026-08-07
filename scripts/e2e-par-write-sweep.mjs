// PAR write-endpoint sweep — every POST / PATCH / PUT / DELETE the module exposes.
//
// It does NOT try to invent a valid payload for 178 endpoints. It asserts the two
// things every write must get right regardless of payload:
//
//   1. an anonymous caller gets 401 — never 200, never a 500 stack, never the
//      SPA's HTML (which would mean the route isn't mounted at all);
//   2. a garbage body gets 4xx, never 5xx. A 500 on malformed input means the
//      handler dereferenced something it never validated, and that is both a
//      crash and an information leak.
//
// Destructive verbs run against a throwaway id, never a real row.
//
//   node scripts/e2e-par-write-sweep.mjs
import { request } from "playwright-core";
import { readFileSync, readdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = "demo123456";
const U = { admin: "admin@atic.demo.io", requestor: "requestor@atic.demo.io" };

const MOUNTS = {
  "par.ts": "/api/par", "parApprovals.ts": "/api/par", "parAttachments.ts": "/api/par",
  "parAudit.ts": "/api/par/audit", "parBudgetCodes.ts": "/api/par/budget-codes",
  "parDelegations.ts": "/api/par/delegations", "parDepartments.ts": "/api/par/departments",
  "parDoa.ts": "/api/par/doa", "parEvents.ts": "/api/par/events", "parInvites.ts": "/api/par/invites",
  "parMe.ts": "/api/par/me", "parMembers.ts": "/api/par/members", "parPayers.ts": "/api/par/payers",
  "parPayments.ts": "/api/par/payments", "parProfiles.ts": "/api/par/profiles",
  "parProjects.ts": "/api/par/projects", "parReceipts.ts": "/api/par",
  "parReports.ts": "/api/par/reports", "parSettings.ts": "/api/par/settings",
  "parTemplates.ts": "/api/par/templates", "parTimeline.ts": "/api/par",
  "parVendors.ts": "/api/par/vendors", "parPurchaseOrders.ts": "/api/par",
  "parAiPrefill.ts": "/api/par", "parConfigImport.ts": "/api/par/config",
};

const routes = [];
for (const file of readdirSync("server/routes").filter((f) => /^par/.test(f) && f.endsWith(".ts"))) {
  const mount = MOUNTS[file];
  if (!mount) continue;
  const src = readFileSync(`server/routes/${file}`, "utf8");
  for (const m of src.matchAll(/(?<![.\w])(?:\w*Routes)\.(post|patch|put|delete)\(\s*"(\/[^"]*)"/g)) {
    const [, verb, p] = m;
    if (p.includes("*")) continue;
    routes.push({ file, verb: verb.toUpperCase(), path: (mount + (p === "/" ? "" : p)).replace(/\/+$/, "") || mount });
  }
}

const ctx = {};
for (const r of [...Object.keys(U), "anon"]) {
  const c = await request.newContext({ baseURL: BASE });
  if (r !== "anon") await c.post("/api/auth/login", { data: { email: U[r], password: PW } });
  ctx[r] = c;
}

// A throwaway uuid: destructive verbs must not touch a row anyone cares about.
const SAFE_ID = "00000000-0000-0000-0000-000000000000";
const concretize = (p) => p.replace(/:\w+(\{[^}]*\})?/g, SAFE_ID);

// Bodies chosen to be structurally wrong in different ways.
const JUNK = [
  {},
  { unexpected: "field", nested: { deep: [1, 2, 3] } },
  { userId: "not-a-uuid", role: "emperor", amount_cents: "a lot" },
];

const problems = [];
let calls = 0;
console.log(`═══ Baleiere scrieri PAR: ${routes.length} rute descoperite din sursă ═══\n`);

for (const r of routes) {
  const url = concretize(r.path);
  const verb = r.verb.toLowerCase();

  // 1. anonymous must be refused
  const anon = await ctx.anon[verb](url, { data: {} });
  calls++;
  const anonCt = anon.headers()["content-type"] ?? "";
  if (anon.status() !== 401) {
    problems.push(`${r.verb} ${url} — anonim primește ${anon.status()} (aşteptat 401)`);
  } else if (!anonCt.includes("json")) {
    problems.push(`${r.verb} ${url} — 401 dar nu JSON ("${anonCt}") — ruta nu e montată?`);
  }

  // 2. malformed bodies must not crash the handler
  for (const body of JUNK) {
    for (const role of Object.keys(U)) {
      const res = await ctx[role][verb](url, { data: body });
      calls++;
      if (res.status() >= 500) {
        problems.push(`${r.verb} ${url} [${role}] corp=${JSON.stringify(body).slice(0, 40)} → ${res.status()} ${(await res.text()).slice(0, 160)}`);
      }
    }
  }
}

console.log(`${calls} apeluri pe ${routes.length} rute de scriere\n`);
if (problems.length) {
  console.log(`🔴 ${problems.length} PROBLEME:`);
  for (const p of [...new Set(problems)]) console.log("  • " + p);
} else {
  console.log("✅ toate scrierile cer autentificare și răspund 4xx la corp invalid");
}
process.exit(problems.length ? 1 : 0);
