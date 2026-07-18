/**
 * E2E PAR-QA Faza 3 — regression for the reports changes (PARQA-019).
 * Invokes the new/changed endpoints against the real API (test the action, not the affordance).
 *   PARQA-019  GET /reports/by-vendor returns spend per payee (incl. a PAR we just created)
 *   PARQA-019  aging + cycle-time accept the from/to period filter (200, no 500)
 * (PARQA-017 multi-currency 10% rule is covered by server/lib/par/__tests__/payment.test.ts;
 *  PARQA-018 FX-block needs an FX outage to trigger and is covered by code review.)
 *
 * Run: npm run db:reset && npm run db:seed ; PORT=3000 npm run start & ; node scripts/e2e-par-qa-f3.mjs
 */
import { request } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.SMOKE_PASSWORD ?? "demo123456";
const USERS = { admin: "admin@atic.demo.io", approver: "approver@atic.demo.io", requestor: "requestor@atic.demo.io" };
const IBAN_A = "MD24AG000225100013104168";
const IDNP = "2002600012345";
const PAYEE = "Regia Test PARQA SRL";

let passed = 0; const failures = []; let n = 0;
async function T(name, fn) { n++; const id = String(n).padStart(3, "0"); try { await fn(); passed++; console.log(`✅ ${id} ${name}`); } catch (e) { failures.push(`${id} ${name} — ${e.message}`); console.log(`❌ ${id} ${name} — ${e.message}`); } }
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }
function eq(a, b, l) { if (a !== b) throw new Error(`${l || "value"}: expected ${b}, got ${a}`); }

const ctxs = {};
async function login(role) { const c = await request.newContext({ baseURL: BASE }); const r = await c.post("/api/auth/login", { data: { email: USERS[role], password: PW } }); if (r.status() !== 200) throw new Error(`login ${role}: ${r.status()}`); ctxs[role] = c; }
async function call(role, m, p, b) { const r = await ctxs[role][m.toLowerCase()](p, b !== undefined ? { data: b } : {}); let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status(), json: j }; }
const GET = (r, p) => call(r, "GET", p);
const POST = (r, p, b) => call(r, "POST", p, b);
const PATCH = (r, p, b) => call(r, "PATCH", p, b);

async function main() {
  for (const role of ["admin", "approver", "requestor"]) await login(role);

  // Create + submit a PAR with a distinct payee so by-vendor has something to group.
  const c = await POST("requestor", "/api/par", {});
  const id = c.json.id;
  await PATCH("requestor", `/api/par/${id}`, {
    purpose: "execute_payment", currency: "MDL", end_use: "Test raport beneficiar",
    payee_name: PAYEE, payee_iban: IBAN_A, payee_idnp: IDNP, payee_bank: "MAIB",
  });
  await POST("requestor", `/api/par/${id}/line-items`, { description: "x", quantity: 1, unit: "buc", unit_price_cents: 120000 });
  const sub = await POST("requestor", `/api/par/${id}/submit`, {});
  await T("PARQA-019 setup: PAR with payee submitted", () => eq(sub.status, 200, "submit"));

  await T("PARQA-019 GET /reports/by-vendor → 200 with the payee grouped", async () => {
    const r = await GET("approver", "/api/par/reports/by-vendor");
    eq(r.status, 200, "by-vendor status");
    const items = r.json?.items ?? [];
    assert(Array.isArray(items), "items is an array");
    const row = items.find((it) => it.label === PAYEE);
    assert(row, `payee "${PAYEE}" present in by-vendor`);
    assert(row.totalCents >= 120000, `totalCents >= 120000, got ${row.totalCents}`);
    assert(row.count >= 1, "count >= 1");
  });

  await T("PARQA-019 requestor is still blocked from reports → 403", async () => {
    const r = await GET("requestor", "/api/par/reports/by-vendor");
    eq(r.status, 403, "requestor by-vendor");
  });

  await T("PARQA-019 aging accepts the period filter → 200", async () => {
    const r = await GET("approver", "/api/par/reports/aging?from=2020-01-01&to=2030-12-31");
    eq(r.status, 200, "aging status");
    assert(Array.isArray(r.json?.items), "aging items array");
  });

  await T("PARQA-019 cycle-time accepts the period filter → 200", async () => {
    const r = await GET("approver", "/api/par/reports/cycle-time?from=2020-01-01&to=2030-12-31");
    eq(r.status, 200, "cycle-time status");
  });

  console.log(`\n${passed}/${n} passed`);
  if (failures.length) { console.log("FAILED:"); for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
  console.log("All PARQA Faza 3 report regressions green ✅");
}
main().catch((e) => { console.error(e); process.exit(1); });
