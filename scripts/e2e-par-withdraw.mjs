/**
 * E2E PAR — „Retrage și editează" (POST /api/par/:id/withdraw)
 * ============================================================
 * Cerere owner 2026-08-28: o cerere trimisă, dar ÎNCĂ NEAPROBATĂ, trebuie să poată fi corectată.
 * Testul INVOCĂ endpointul (CLAUDE.md §3.5.1quater — testăm acțiunea, nu butonul) și verifică:
 *
 *   1. PATCH pe o cerere 'pending_approval' → 403 (sigiliul body_hash nu se atinge din lateral)
 *   2. non-autor (approver) → 403
 *   3. autorul → 200, status 'draft', chain_status 'withdrawn'
 *   4. ciorna retrasă e editabilă (PATCH persistă) și se re-trimite (lanț nou, hash nou)
 *   5. aprobarea de după re-trimitere merge (nu apare "integrity_violation")
 *   6. withdraw pe o cerere APROBATĂ / plătită → 409 (acolo calea e anularea)
 *   7. withdraw după o aprobare parțială (lanț de 2 pași) → 200 + discarded_approvals ≥ 1
 *   8. timeline-ul conține evenimentul 'withdrawn'
 *
 * Rulare pe seed proaspăt:
 *   npm run db:reset && npm run db:seed
 *   PORT=3100 npm run start &
 *   BASE_URL=http://localhost:3100 node scripts/e2e-par-withdraw.mjs
 *
 * Seed PAR tenant "ATIC" (parolă demo123456):
 *   admin@atic.demo.io (par_admin) · approver@atic.demo.io · finance@atic.demo.io · requestor@atic.demo.io
 * DOA seedat: ≤5000 MDL → 1 pas (approver, final); 5000–100000 MDL → 2 pași (approver + admin).
 */
import { request } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.SMOKE_PASSWORD ?? "demo123456";
const USERS = {
  admin: "admin@atic.demo.io",
  approver: "approver@atic.demo.io",
  finance: "finance@atic.demo.io",
  requestor: "requestor@atic.demo.io",
};
const IBAN_A = "MD24AG000225100013104168";
const IDNP = "2002600012345";

// ── tiny test runner ─────────────────────────────────────────────────────────
let passed = 0;
const failures = [];
let n = 0;
async function T(name, fn) {
  n++;
  const id = String(n).padStart(3, "0");
  try {
    await fn();
    passed++;
    console.log(`✅ ${id} ${name}`);
  } catch (e) {
    failures.push(`${id} ${name} — ${e.message}`);
    console.log(`❌ ${id} ${name} — ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label || "value"}: expected ${expected}, got ${actual}`);
}

// ── API helpers (un context per rol = cookie jar izolat) ─────────────────────
const ctxs = {};
async function login(role) {
  const c = await request.newContext({ baseURL: BASE });
  const r = await c.post("/api/auth/login", { data: { email: USERS[role], password: PW } });
  if (r.status() !== 200) throw new Error(`login ${role} failed: ${r.status()}`);
  ctxs[role] = c;
  return c;
}
async function call(role, method, path, body) {
  const c = ctxs[role];
  const opts = body !== undefined ? { data: body } : {};
  const r = await c[method.toLowerCase()](path, opts);
  let json = null;
  try { json = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status(), json };
}
const GET = (role, p) => call(role, "GET", p);
const POST = (role, p, b) => call(role, "POST", p, b);
const PATCH = (role, p, b) => call(role, "PATCH", p, b);

async function makePayablePar(role, unitPriceCents, qty = 1) {
  const c = await POST(role, "/api/par", {});
  const id = c.json.id;
  await PATCH(role, `/api/par/${id}`, {
    purpose: "execute_payment",
    currency: "MDL",
    end_use: "Materiale pentru programul educațional",
    payee_name: "Furnizor SRL",
    payee_iban: IBAN_A,
    payee_idnp: IDNP,
    payee_bank: "Victoriabank",
  });
  await POST(role, `/api/par/${id}/line-items`, {
    description: "Articol test",
    quantity: qty,
    unit: "buc",
    unit_price_cents: unitPriceCents,
  });
  return id;
}
const submit = (role, id) => POST(role, `/api/par/${id}/submit`, {});

async function main() {
  for (const role of ["admin", "approver", "finance", "requestor"]) await login(role);

  // ═══ Cazul de bază: 1 pas de aprobare, nicio decizie dată ═════════════════════
  let id;
  await T("setup — requestorul creează și trimite o cerere de 2000 MDL (1 pas)", async () => {
    id = await makePayablePar("requestor", 200000);
    const r = await submit("requestor", id);
    eq(r.status, 200, "submit status");
    eq(r.json.status, "pending_approval", "status după submit");
  });

  await T("PATCH direct pe 'pending_approval' → 403 (corectura nu rupe sigiliul)", async () => {
    const r = await PATCH("requestor", `/api/par/${id}`, { end_use: "editare pe furiș" });
    eq(r.status, 403, "status");
  });

  await T("non-autorul (approver) nu poate retrage → 403", async () => {
    const r = await POST("approver", `/api/par/${id}/withdraw`, {});
    eq(r.status, 403, "status");
  });

  await T("autorul retrage → 200, status 'draft', chain_status 'withdrawn'", async () => {
    const r = await POST("requestor", `/api/par/${id}/withdraw`, {});
    eq(r.status, 200, "status");
    eq(r.json.status, "draft", "status PAR");
    eq(r.json.chain_status, "withdrawn", "chain_status");
    eq(r.json.discarded_approvals, 0, "discarded_approvals (nicio decizie dată)");
    assert(r.json.bodyHash == null, `bodyHash resetat, got ${JSON.stringify(r.json.bodyHash)}`);
  });

  await T("ciorna retrasă e editabilă — PATCH end_use persistă", async () => {
    const p = await PATCH("requestor", `/api/par/${id}`, { end_use: "Corectat: suma și scopul reale." });
    eq(p.status, 200, "patch status");
    const g = await GET("requestor", `/api/par/${id}`);
    assert((g.json.endUse ?? "").includes("Corectat"), `end_use persistat, got ${JSON.stringify(g.json.endUse)}`);
  });

  await T("cererea corectată se re-trimite → pending_approval (lanț nou)", async () => {
    const r = await submit("requestor", id);
    eq(r.status, 200, "status");
    eq(r.json.status, "pending_approval", "status");
    assert(Number(r.json.approval_steps) > 0, `lanț regenerat (approval_steps), got ${r.json.approval_steps}`);
  });

  await T("aprobarea de după re-trimitere merge (fără integrity_violation)", async () => {
    const r = await POST("approver", `/api/par/${id}/approve`, {});
    eq(r.status, 200, `approve status (body: ${JSON.stringify(r.json)})`);
    assert(["approved", "in_finance"].includes(r.json.status), `status final, got ${r.json.status}`);
  });

  await T("withdraw pe o cerere deja aprobată → 409 (acolo calea e anularea)", async () => {
    const r = await POST("requestor", `/api/par/${id}/withdraw`, {});
    eq(r.status, 409, "status");
  });

  await T("timeline-ul conține evenimentul 'withdrawn'", async () => {
    const r = await GET("requestor", `/api/par/${id}/timeline`);
    eq(r.status, 200, "status");
    const events = Array.isArray(r.json) ? r.json : (r.json.events ?? r.json.timeline ?? []);
    assert(events.some((e) => e.event === "withdrawn"), `eveniment 'withdrawn' în timeline, got ${events.map((e) => e.event).join(",")}`);
  });

  // ═══ Aprobare parțială: lanț de 2 pași, primul deja aprobat ═══════════════════
  let id2;
  await T("setup — cerere de 50.000 MDL (2 pași), primul pas aprobat", async () => {
    id2 = await makePayablePar("requestor", 5000000); // 50.000 MDL → 2 pași
    const s = await submit("requestor", id2);
    eq(s.json.status, "pending_approval", "status după submit");
    const a = await POST("approver", `/api/par/${id2}/approve`, {});
    eq(a.status, 200, "primul pas aprobat");
    eq(a.json.status, "pending_approval", "încă în aprobare (mai e un pas)");
  });

  await T("retragerea anulează aprobările deja date → discarded_approvals ≥ 1", async () => {
    const r = await POST("requestor", `/api/par/${id2}/withdraw`, {});
    eq(r.status, 200, "status");
    eq(r.json.status, "draft", "status PAR");
    assert(r.json.discarded_approvals >= 1, `discarded_approvals, got ${r.json.discarded_approvals}`);
  });

  await T("după re-trimitere lanțul o ia de la capăt (primul pas e din nou pending)", async () => {
    const s = await submit("requestor", id2);
    eq(s.status, 200, "submit status");
    const g = await GET("requestor", `/api/par/${id2}`);
    // step 0 = semnătura autorului la trimitere (mereu „approved"); pașii reali sunt 1..N.
    const approvals = (g.json.approvals ?? []).filter((a) => a.step > 0);
    assert(approvals.length >= 2, `lanț regenerat cu 2 pași, got ${approvals.length}`);
    assert(
      approvals.every((a) => a.decision === "pending"),
      `toți pașii de aprobare pending din nou, got ${approvals.map((a) => `${a.step}:${a.decision}`).join(",")}`
    );
  });

  // ── summary ──────────────────────────────────────────────────────────────────
  console.log(`\n${passed}/${n} passed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log("  • " + f);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
