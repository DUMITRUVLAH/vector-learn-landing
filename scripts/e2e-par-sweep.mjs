// PAR endpoint sweep — hits EVERY read endpoint the module exposes, as each role
// plus anonymously, and asserts three things that no unit test covers:
//
//   1. nothing 500s (a 500 on a GET means a broken query reached the client),
//   2. nothing answers HTML (that means the route isn't mounted and the SPA
//      fallback replied — the "Unexpected token '<'" class of bug),
//   3. anonymous callers get 401, never data.
//
// It complements e2e-par-security.mjs (which asserts *policy*) by covering
// *reachability* across the whole surface: 224 endpoints, of which the targeted
// suites only touch ~20.
//
//   node scripts/e2e-par-sweep.mjs
import { request } from "playwright-core";
import { readFileSync, readdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = "demo123456";
const U = { admin: "admin@atic.demo.io", approver: "approver@atic.demo.io", finance: "finance@atic.demo.io", requestor: "requestor@atic.demo.io" };

// ── discover every GET route straight from the source, so the sweep can't drift ──
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
};

const routes = [];
for (const file of readdirSync("server/routes").filter((f) => /^par[A-Z]?.*\.ts$/.test(f) || f === "par.ts")) {
  const mount = MOUNTS[file];
  if (!mount) continue;
  const src = readFileSync(`server/routes/${file}`, "utf8");
  // `\.get("…")` also matches Hono's context getter `c.get("user")` — require the
  // route object and a path that starts with "/".
  for (const m of src.matchAll(/(?<![.\w])(?:\w*Routes)\.get\(\s*"(\/[^"]*)"/g)) {
    const p = m[1];
    if (p.includes("*")) continue;
    routes.push({ file, path: (mount + (p === "/" ? "" : p)).replace(/\/+$/, "") || mount });
  }
}

const ctx = {};
async function login(r) {
  const c = await request.newContext({ baseURL: BASE });
  if (r !== "anon") await c.post("/api/auth/login", { data: { email: U[r], password: PW } });
  ctx[r] = c;
}
for (const r of [...Object.keys(U), "anon"]) await login(r);

// Real ids so `:id` routes exercise a real row instead of 404-ing out of the check.
const list = await (await ctx.admin.get("/api/par?limit=5")).json();
const parId = list.requests?.[0]?.id;
const members = await (await ctx.admin.get("/api/par/members")).json();
const userId = members.members?.[0]?.userId;
const subs = {
  ":id": parId, ":parId": parId, ":userId": userId, ":quoteId": parId,
  ":attachmentId": parId, ":lineId": parId, ":token": "sweep-token",
};
function concretize(p) {
  return p.replace(/:\w+(\{[^}]*\})?/g, (m) => {
    const key = ":" + m.slice(1).replace(/\{.*/, "");
    return subs[key] ?? "00000000-0000-0000-0000-000000000000";
  });
}

const problems = [];
let checked = 0, skipped = 0;
console.log(`═══ Baleiere PAR: ${routes.length} rute GET descoperite din sursă ═══\n`);

for (const r of routes) {
  const url = concretize(r.path);
  if (url.includes("undefined")) { skipped++; continue; }

  // anonymous must never receive data
  const anon = await ctx.anon.get(url);
  if (anon.status() !== 401) {
    const body = (await anon.text()).slice(0, 60);
    problems.push(`${url} — anonim primește ${anon.status()} în loc de 401 · ${body}`);
  }

  for (const role of Object.keys(U)) {
    const res = await ctx[role].get(url);
    checked++;
    const ct = res.headers()["content-type"] ?? "";
    if (res.status() >= 500) {
      problems.push(`${url} [${role}] → ${res.status()} ${(await res.text()).slice(0, 140)}`);
    } else if (!ct.includes("json") && res.status() < 400) {
      // A 200 that isn't JSON means the SPA fallback answered — route not mounted.
      if (!/csv|sheet|pdf|octet|xml/.test(ct)) {
        problems.push(`${url} [${role}] → 200 dar content-type "${ct}" (ruta nu e montată?)`);
      }
    }
  }
}

console.log(`${checked} apeluri, ${skipped} rute sărite (fără id disponibil)\n`);
if (problems.length) {
  console.log(`🔴 ${problems.length} PROBLEME:`);
  for (const p of problems) console.log("  • " + p);
} else {
  console.log("✅ nicio eroare 500, niciun răspuns HTML, niciun acces anonim");
}
process.exit(problems.length ? 1 : 0);
