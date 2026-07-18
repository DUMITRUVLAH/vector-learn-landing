/**
 * E2E PAR-QA Faza 6 — control & recuperare (PARQA-008 / 011 / 014)
 * ================================================================
 * Live regression that INVOKES each new endpoint against a running app and asserts status +
 * response shape (CLAUDE.md §3.5.1quater — test the action, not the affordance). Covers:
 *
 *   PARQA-014  GET /api/par/finance surfaces `threeWayMatchEnforced` (OFF by default) and it
 *              tracks the setting (PATCH enforce on → true → off → false).
 *   PARQA-011  A rejected PAR can be reopened by its AUTHOR into an editable draft, then edited
 *              and resubmitted. Non-author reopen → 403; reopen of a non-rejected PAR → 409.
 *   PARQA-008  A role-based approver whose approval_limit_cents is below the PAR total cannot be
 *              the FINAL signature (403 over_approval_limit); within the limit → approves fine.
 *
 * Run against a fresh seed:
 *   npm run db:reset && npm run db:seed
 *   PORT=3100 npm run start &
 *   BASE_URL=http://localhost:3100 node scripts/e2e-par-qa-f6.mjs
 *
 * Seeded PAR tenant "ATIC" (all password demo123456):
 *   admin@atic.demo.io (par_admin) · approver@atic.demo.io · finance@atic.demo.io · requestor@atic.demo.io
 * Seeded DOA: ≤5000 MDL → 1 step (approver, final); 5000–100000 MDL → 2 steps (approver + admin).
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

// ── API helpers (one context per role = isolated cookie jar) ───────────────────
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

// helper: create a valid execute_payment PAR (draft) with one line item + payee, then submit it.
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
async function submit(role, id) {
  return POST(role, `/api/par/${id}/submit`, {});
}

async function main() {
  for (const role of ["admin", "approver", "finance", "requestor"]) await login(role);

  // ═══ PARQA-014 — 3-way match control visibility ═══════════════════════════════
  await T("PARQA-014: GET /api/par/finance exposes threeWayMatchEnforced (boolean)", async () => {
    const r = await GET("finance", "/api/par/finance");
    eq(r.status, 200, "status");
    assert(typeof r.json.threeWayMatchEnforced === "boolean", `field present, got ${typeof r.json.threeWayMatchEnforced}`);
  });
  await T("PARQA-014: default seed → control OFF (threeWayMatchEnforced=false)", async () => {
    const r = await GET("finance", "/api/par/finance");
    eq(r.json.threeWayMatchEnforced, false, "threeWayMatchEnforced");
  });
  await T("PARQA-014: flag tracks the setting — enforce ON → true, then OFF → false", async () => {
    let s = await PATCH("admin", "/api/par/settings", { enforceThreeWayMatch: true });
    eq(s.status, 200, "patch on status");
    let r = await GET("finance", "/api/par/finance");
    eq(r.json.threeWayMatchEnforced, true, "enforced after ON");
    s = await PATCH("admin", "/api/par/settings", { enforceThreeWayMatch: false });
    eq(s.status, 200, "patch off status");
    r = await GET("finance", "/api/par/finance");
    eq(r.json.threeWayMatchEnforced, false, "enforced after OFF");
  });

  // ═══ PARQA-011 — recovery from rejected ═══════════════════════════════════════
  let rejectedId;
  await T("PARQA-011: setup — requestor creates + submits a PAR, approver rejects it", async () => {
    rejectedId = await makePayablePar("requestor", 200000); // 2000 MDL → 1 step (approver, final)
    const sub = await submit("requestor", rejectedId);
    eq(sub.status, 200, "submit status");
    eq(sub.json.status, "pending_approval", "status after submit");
    const rej = await POST("approver", `/api/par/${rejectedId}/reject`, { comment: "Lipsește oferta de preț." });
    eq(rej.status, 200, "reject status");
    eq(rej.json.status, "rejected", "status after reject");
  });
  await T("PARQA-011: non-author reopen → 403 (only the author can reopen)", async () => {
    const r = await POST("approver", `/api/par/${rejectedId}/reopen`, {});
    eq(r.status, 403, "status");
  });
  await T("PARQA-011: author reopen → 200, PAR back to draft", async () => {
    const r = await POST("requestor", `/api/par/${rejectedId}/reopen`, {});
    eq(r.status, 200, "status");
    eq(r.json.status, "draft", "status");
    eq(r.json.chain_status, "reopened", "chain_status");
  });
  await T("PARQA-011: reopened draft is editable — PATCH end_use persists", async () => {
    const p = await PATCH("requestor", `/api/par/${rejectedId}`, { end_use: "Revizuit: am adăugat oferta de preț." });
    eq(p.status, 200, "patch status");
    const g = await GET("requestor", `/api/par/${rejectedId}`);
    assert((g.json.endUse ?? "").includes("Revizuit"), `end_use persisted, got ${JSON.stringify(g.json.endUse)}`);
  });
  await T("PARQA-011: reopened draft resubmits → pending_approval (fresh chain)", async () => {
    const r = await submit("requestor", rejectedId);
    eq(r.status, 200, "status");
    eq(r.json.status, "pending_approval", "status");
  });
  await T("PARQA-011: reopen a non-rejected PAR → 409", async () => {
    const r = await POST("requestor", `/api/par/${rejectedId}/reopen`, {}); // it's pending_approval now
    eq(r.status, 409, "status");
  });

  // ═══ PARQA-008 — approval-limit enforcement at the final step ══════════════════
  let approverUserId, originalLimit;
  await T("PARQA-008: setup — read approver's par_member id + current limit", async () => {
    const r = await GET("admin", "/api/par/members");
    eq(r.status, 200, "status");
    const row = r.json.members.find((m) => m.userEmail === USERS.approver && m.role === "approver");
    assert(row, "approver member row found");
    approverUserId = row.userId;
    originalLimit = row.approvalLimitCents;
  });
  await T("PARQA-008: set approver limit to 3000 MDL (300000 cents)", async () => {
    const r = await POST("admin", "/api/par/members", { userId: approverUserId, role: "approver", approvalLimitCents: 300000 });
    assert(r.status === 200 || r.status === 201, `status ${r.status}`);
  });
  await T("PARQA-008: approver CANNOT finalize a 4000 MDL PAR over their 3000 limit → 403 over_approval_limit", async () => {
    const id = await makePayablePar("requestor", 400000); // 4000 MDL → 1 step (approver = final)
    const sub = await submit("requestor", id);
    eq(sub.json.status, "pending_approval", "submitted");
    const r = await POST("approver", `/api/par/${id}/approve`, {});
    eq(r.status, 403, "status");
    eq(r.json.error, "over_approval_limit", "error code");
    assert(r.json.limit_cents === 300000, `limit_cents echoed, got ${r.json.limit_cents}`);
  });
  await T("PARQA-008: approver CAN finalize a 2000 MDL PAR within their 3000 limit → 200", async () => {
    const id = await makePayablePar("requestor", 200000); // 2000 MDL ≤ 3000 limit
    await submit("requestor", id);
    const r = await POST("approver", `/api/par/${id}/approve`, {});
    eq(r.status, 200, "status");
    // execute_payment fully approved → routes to finance
    assert(["in_finance", "approved"].includes(r.json.status), `final status, got ${r.json.status}`);
  });
  await T("PARQA-008: par_admin is NEVER limited — admin finalizes an over-limit 2-step PAR", async () => {
    // 7000 MDL → 2 steps (approver step 1, admin step 2 = final). Approver signs step 1 (intermediate,
    // not gated); admin finalizes (unlimited).
    const id = await makePayablePar("requestor", 700000);
    await submit("requestor", id);
    const s1 = await POST("approver", `/api/par/${id}/approve`, {});
    eq(s1.status, 200, "approver intermediate step");
    const s2 = await POST("admin", `/api/par/${id}/approve`, {});
    eq(s2.status, 200, "admin final step");
    assert(["in_finance", "approved"].includes(s2.json.status), `final status, got ${s2.json.status}`);
  });
  await T("PARQA-008: cleanup — restore approver limit", async () => {
    const r = await POST("admin", "/api/par/members", {
      userId: approverUserId,
      role: "approver",
      approvalLimitCents: originalLimit ?? null,
    });
    assert(r.status === 200 || r.status === 201, `status ${r.status}`);
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
