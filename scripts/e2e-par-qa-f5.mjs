/**
 * E2E PAR-QA Faza 5 — regression for DOA required-role enforcement (PARQA-007).
 * A DOA step configured "must be signed by finance" must be decidable ONLY by a finance user
 * (par_admin overrides), not by any plain approver. Also confirms generic approver steps still work.
 *
 * Run: npm run db:reset && npm run db:seed ; PORT=3000 npm run start & ; node scripts/e2e-par-qa-f5.mjs
 */
import { request } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.SMOKE_PASSWORD ?? "demo123456";
const USERS = { admin: "admin@atic.demo.io", approver: "approver@atic.demo.io", finance: "finance@atic.demo.io", requestor: "requestor@atic.demo.io" };
const IBAN_A = "MD24AG000225100013104168";
const IDNP = "2002600012345";

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

async function makeSubmitted(chargeTo) {
  const id = (await POST("requestor", "/api/par", {})).json.id;
  await PATCH("requestor", `/api/par/${id}`, {
    purpose: "execute_payment", charge_to: chargeTo, currency: "MDL", end_use: "Test DOA role",
    payee_name: "Furnizor", payee_iban: IBAN_A, payee_idnp: IDNP, payee_bank: "MAIB",
  });
  await POST("requestor", `/api/par/${id}/line-items`, { description: "x", quantity: 1, unit: "buc", unit_price_cents: 100000 }); // 1000 MDL ≤ threshold
  const s = await POST("requestor", `/api/par/${id}/submit`, {});
  return { id, submit: s };
}

async function main() {
  for (const role of ["admin", "approver", "finance", "requestor"]) await login(role);

  // Admin configures a DOA step for charge_to=operations that MUST be signed by finance.
  await T("PARQA-007 admin creates a DOA step requiring the finance role → 201", async () => {
    const r = await POST("admin", "/api/par/doa", {
      chargeTo: "operations", minAmountCents: 0, maxAmountCents: null, step: 1,
      approverParRole: "finance", approverRoleLabel: "Finance sign", active: true,
    });
    assert(r.status === 200 || r.status === 201, `doa create: got ${r.status}`);
  });

  // A PAR charged to operations routes to that finance-required step.
  const finPar = await makeSubmitted("operations");
  await T("PARQA-007 operations PAR submits (routes to the finance-required step) → 200", () => eq(finPar.submit.status, 200, "submit"));

  await T("PARQA-007 a plain APPROVER cannot approve the finance-required step → 403", async () => {
    const r = await POST("approver", `/api/par/${finPar.id}/approve`, {});
    eq(r.status, 403, "approver on finance step");
  });

  await T("PARQA-007 a FINANCE user CAN approve the finance-required step → 200", async () => {
    const r = await POST("finance", `/api/par/${finPar.id}/approve`, {});
    eq(r.status, 200, "finance on finance step");
  });

  // Control: a normal (non-role-specific) PAR still works for a plain approver.
  const normalPar = await makeSubmitted("program");
  await T("PARQA-007 control: a generic approver step is still approvable by an approver → 200", async () => {
    eq(normalPar.submit.status, 200, "submit control");
    const r = await POST("approver", `/api/par/${normalPar.id}/approve`, {});
    eq(r.status, 200, "approver on generic step");
  });

  console.log(`\n${passed}/${n} passed`);
  if (failures.length) { console.log("FAILED:"); for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
  console.log("All PARQA Faza 5 (DOA role enforcement) regressions green ✅");
}
main().catch((e) => { console.error(e); process.exit(1); });
