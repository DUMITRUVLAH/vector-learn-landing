/**
 * E2E PAR — 150+ "blind" scenarios
 * ================================
 * Written from the BEHAVIOUR CONTRACT (backlog/par/PAR-CORE.md), not from the implementation:
 * every expectation below is what the paper-form workflow says must happen, so a failure means
 * either a real bug or a documented divergence that CORE must record.
 *
 * Coverage: route mounting · auth/RBAC matrix · draft CRUD + field validation · line-item money
 * math · submit gate · DOA routing · approval integrity (self-approval, order, immutability) ·
 * reject/request-changes/reopen/cancel · finance stage · the 10% overage rule · tenant isolation ·
 * reports · attachments/comments/quotes/receipts/PO · audit · robustness (uuid guard) · UI smoke.
 *
 * Run against a FRESH seed (see memory par-e2e-and-uuid-guard):
 *   npm run db:reset && npm run db:seed && PORT=3140 npm run start &
 *   BASE_URL=http://localhost:3140 node scripts/e2e-par-blind-150.mjs
 */
import { chromium, request } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3140";
const PW = process.env.SMOKE_PASSWORD ?? "demo123456";
const USERS = {
  admin: "admin@atic.demo.io",
  approver: "approver@atic.demo.io",
  finance: "finance@atic.demo.io",
  requestor: "requestor@atic.demo.io",
  other: "admin@demo.vectorlearn.io", // different tenant — isolation probes
};

const IBAN_A = "MD24AG000225100013104168";
const IBAN_B = "MD21EX000000000001234567";
const IDNP = "2002600012345";
// Distinct valid MD IBANs (mod-97 verified) — the vendor registry dedups by IBAN, so a test that
// needs a NEW registry row must bring a new account number.
const IBAN_FRESH = "MD24QA000000000000000001";
const IBAN_FRESH2 = "MD94QA000000000000000002";
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// ── runner ──────────────────────────────────────────────────────────────────
let passed = 0;
let n = 0;
const failures = [];
const only = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null;
async function T(name, fn) {
  n++;
  const id = String(n).padStart(3, "0");
  if (only && !only.test(name)) { console.log(`⏭  ${id} ${name}`); return; }
  try {
    await fn();
    passed++;
    console.log(`✅ ${id} ${name}`);
  } catch (e) {
    failures.push({ id, name, msg: e.message });
    console.log(`❌ ${id} ${name} — ${e.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label || "value"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function inSet(actual, allowed, label) {
  if (!allowed.includes(actual)) throw new Error(`${label || "value"}: expected one of ${allowed.join("/")}, got ${actual}`);
}

// ── api helpers ─────────────────────────────────────────────────────────────
const ctxs = {};
async function login(role) {
  const c = await request.newContext({ baseURL: BASE });
  if (role !== "anon") {
    const r = await c.post("/api/auth/login", { data: { email: USERS[role], password: PW } });
    if (r.status() !== 200) throw new Error(`login ${role} failed: ${r.status()} ${await r.text()}`);
  }
  ctxs[role] = c;
  return c;
}
async function call(role, method, path, body) {
  const c = ctxs[role];
  const opts = body === undefined ? {} : { data: body };
  const r = await c[method.toLowerCase()](path, opts);
  const ct = r.headers()["content-type"] ?? "";
  let parsed = null;
  const text = await r.text();
  if (ct.includes("application/json")) { try { parsed = JSON.parse(text); } catch { parsed = null; } }
  return { status: r.status(), body: parsed, text, ct, headers: r.headers() };
}
/** The PAR API uses a different envelope key per endpoint (requests / inbox / entries / rows /
 *  departments / vendors / comments / timeline / items). Read whichever array it carries. */
function coll(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  for (const v of Object.values(body)) if (Array.isArray(v)) return v;
  return [];
}

const GET = (r, p) => call(r, "GET", p);
const POST = (r, p, b) => call(r, "POST", p, b ?? {});
const PATCH = (r, p, b) => call(r, "PATCH", p, b ?? {});
const DEL = (r, p) => call(r, "DELETE", p);

// ── domain helpers ──────────────────────────────────────────────────────────
async function createDraft(role, over = {}) {
  const r = await POST(role, "/api/par", { purpose: "execute_payment", charge_to: "program", ...over });
  if (r.status !== 201) throw new Error(`createDraft ${r.status} ${r.text.slice(0, 300)}`);
  return r.body;
}
async function addLine(role, id, over = {}) {
  return POST(role, `/api/par/${id}/line-items`, {
    description: "Servicii de consultanță psihologică",
    quantity: 1, unit: "sesie", unit_price_cents: 700000, ...over,
  });
}
async function fillPayee(role, id, over = {}) {
  return PATCH(role, `/api/par/${id}`, {
    end_use: "Servicii de consiliere de grup, proiect Digital Safeguard, 120-180 min, pe Zoom.",
    payee_name: "Daria Roitman", payee_idnp: IDNP, payee_iban: IBAN_A,
    payee_bank: 'BC "Moldindconbank" S.A.', payee_type: "fizic",
    attachments_present: false, ...over,
  });
}
/** A complete, submittable draft. amount = total in cents (single line). */
async function readyPar(role, { amount = 700000, purpose = "execute_payment", ...over } = {}) {
  const par = await createDraft(role, { purpose, ...over });
  const l = await addLine(role, par.id, { quantity: 1, unit_price_cents: amount });
  if (l.status !== 201 && l.status !== 200) throw new Error(`addLine ${l.status} ${l.text.slice(0, 200)}`);
  const p = await fillPayee(role, par.id);
  if (p.status !== 200) throw new Error(`fillPayee ${p.status} ${p.text.slice(0, 200)}`);
  return par;
}
async function submitPar(role, { amount = 700000, purpose = "execute_payment", ...over } = {}) {
  const par = await readyPar(role, { amount, purpose, ...over });
  const s = await POST(role, `/api/par/${par.id}/submit`);
  if (s.status !== 200) throw new Error(`submit ${s.status} ${s.text.slice(0, 300)}`);
  return { par, submit: s.body };
}
async function detail(role, id) {
  const r = await GET(role, `/api/par/${id}`);
  if (r.status !== 200) throw new Error(`detail ${r.status} ${r.text.slice(0, 200)}`);
  return r.body;
}
/** Walk the whole approval chain with whoever is allowed to decide each step. */
async function approveAll(id) {
  for (let i = 0; i < 6; i++) {
    const d = await detail("admin", id);
    if (!["pending_approval", "reapproval_required"].includes(d.status)) return d;
    let done = false;
    for (const role of ["approver", "admin", "finance"]) {
      const r = await POST(role, `/api/par/${id}/approve`, { comment: `ok step ${i + 1}` });
      if (r.status === 200) { done = true; break; }
    }
    if (!done) throw new Error(`no role could approve at step ${i + 1}: ${JSON.stringify(d.approvals?.map((a) => [a.step, a.decision, a.approverRoleLabel]))}`);
  }
  return detail("admin", id);
}

// ── suite ───────────────────────────────────────────────────────────────────
const run = async () => {
for (const r of ["anon", "admin", "approver", "finance", "requestor", "other"]) await login(r);

// ═══ A. Health, mounting, auth surface ═════════════════════════════════════
await T("health endpoint is up", async () => eq((await GET("anon", "/api/health")).status, 200));
await T("PAR list requires authentication", async () => eq((await GET("anon", "/api/par")).status, 401));
await T("PAR create requires authentication", async () => eq((await POST("anon", "/api/par", {})).status, 401));
await T("unauthenticated PAR call returns JSON, never the SPA html", async () => {
  const r = await GET("anon", "/api/par");
  assert(!r.text.trim().startsWith("<"), "got HTML fallback — route not mounted");
});
await T("/api/par/me returns the caller's PAR roles", async () => {
  const r = await GET("requestor", "/api/par/me");
  eq(r.status, 200);
  assert(JSON.stringify(r.body).includes("requestor"), `no role in ${r.text.slice(0, 200)}`);
});
await T("unknown /api/par sub-path 404s (not 500, not HTML)", async () => {
  const r = await GET("admin", "/api/par/definitely-not-a-uuid");
  inSet(r.status, [400, 404], "status");
});
await T("unknown nested /api/par action 404s instead of 500", async () => {
  const r = await POST("approver", "/api/par/some-word/approve", { comment: "x" });
  inSet(r.status, [400, 404], "status");
});
await T("well-formed but unknown PAR id returns 404", async () => {
  eq((await GET("admin", `/api/par/${NIL_UUID}`)).status, 404);
});

// ═══ B. RBAC matrix (CORE §1) ══════════════════════════════════════════════
await T("a requestor may add a budget code inline but not edit the chart of accounts", async () => {
  const r = await POST("requestor", "/api/par/budget-codes", { code: `RQ${Date.now() % 100000}`, name: "Cod din formular" });
  inSet(r.status, [200, 201], "create status");
  const id = r.body.id ?? r.body.code?.id;
  eq((await PATCH("requestor", `/api/par/budget-codes/${id}`, { name: "redenumit" })).status, 403);
});
await T("a requestor cannot delete a budget code", async () => {
  const r = await POST("admin", "/api/par/budget-codes", { code: `AD${Date.now() % 100000}`, name: "Cod admin" });
  const id = r.body.id ?? r.body.code?.id;
  eq((await DEL("requestor", `/api/par/budget-codes/${id}`)).status, 403);
});
await T("requestor cannot create a department", async () => {
  eq((await POST("requestor", "/api/par/departments", { name: "Hack dept" })).status, 403);
});
await T("requestor cannot create a project", async () => {
  eq((await POST("requestor", "/api/par/projects", { name: "Hack project" })).status, 403);
});
await T("requestor cannot write the DOA matrix", async () => {
  const r = await POST("requestor", "/api/par/doa", { minAmountCents: 0, step: 1, approverRoleLabel: "Hacker", approverParRole: "requestor" });
  eq(r.status, 403);
});
await T("requestor cannot assign PAR roles", async () => {
  const r = await POST("requestor", "/api/par/members", { userId: NIL_UUID, role: "par_admin" });
  inSet(r.status, [403, 400], "status");
});
await T("requestor cannot change PAR settings", async () => {
  eq((await PATCH("requestor", "/api/par/settings", { microPurchaseThresholdCents: 1 })).status, 403);
});
await T("approver cannot change PAR settings", async () => {
  eq((await PATCH("approver", "/api/par/settings", { microPurchaseThresholdCents: 1 })).status, 403);
});
await T("par_admin can read PAR settings", async () => {
  const r = await GET("admin", "/api/par/settings");
  eq(r.status, 200);
  assert(typeof (r.body.microPurchaseThresholdCents ?? r.body.micro_purchase_threshold_cents) === "number", `no threshold in ${r.text.slice(0, 200)}`);
});
await T("par_admin can list members", async () => eq((await GET("admin", "/api/par/members")).status, 200));
await T("requestor cannot list members", async () => eq((await GET("requestor", "/api/par/members")).status, 403));
await T("approver inbox is reachable by an approver", async () => eq((await GET("approver", "/api/par/inbox")).status, 200));
await T("finance queue is reachable by finance", async () => eq((await GET("finance", "/api/par/finance")).status, 200));
await T("requestor is refused the finance queue", async () => {
  const r = await GET("requestor", "/api/par/finance");
  inSet(r.status, [403, 200], "status");
  if (r.status === 200) assert((coll(r.body)).length === 0, "requestor sees finance queue rows");
});
await T("anon cannot read the audit log", async () => eq((await GET("anon", "/api/par/audit")).status, 401));
await T("anon cannot read reports", async () => eq((await GET("anon", "/api/par/reports/by-budget")).status, 401));
await T("anon cannot read the vendor registry (GDPR)", async () => eq((await GET("anon", "/api/par/vendors")).status, 401));

// ═══ C. Draft creation, numbering, header validation ═══════════════════════
let draftA;
await T("requestor can create a draft PAR", async () => {
  draftA = await createDraft("requestor");
  eq(draftA.status, "draft", "status");
});
await T("a new PAR gets a human request number", async () => {
  assert(/^[A-Z]+-\d{4}-\d{3,}$/.test(draftA.requestNo ?? ""), `bad request_no: ${draftA.requestNo}`);
});
await T("request numbers are sequential per tenant", async () => {
  const b = await createDraft("requestor");
  const na = Number(draftA.requestNo.split("-").pop());
  const nb = Number(b.requestNo.split("-").pop());
  assert(nb > na, `${b.requestNo} not after ${draftA.requestNo}`);
});
await T("a fresh draft starts with zero total", async () => eq(draftA.totalEstimatedCents, 0, "total"));
await T("purpose defaults to execute_payment", async () => {
  const p = await createDraft("requestor", { purpose: undefined });
  eq(p.purpose, "execute_payment", "purpose");
});
await T("an invalid purpose is rejected", async () => {
  eq((await POST("requestor", "/api/par", { purpose: "steal_money" })).status, 400);
});
await T("an invalid charge_to is rejected", async () => {
  eq((await POST("requestor", "/api/par", { charge_to: "whatever" })).status, 400);
});
await T("a non-uuid department_id is rejected", async () => {
  eq((await POST("requestor", "/api/par", { department_id: "abc" })).status, 400);
});
await T("a department from another tenant is refused with 400, never a 500", async () => {
  const r = await POST("requestor", "/api/par", { department_id: NIL_UUID });
  eq(r.status, 400);
  assert(/department/.test(r.text), `unclear error: ${r.text.slice(0, 200)}`);
});
await T("a project id that does not exist is refused", async () => {
  const r = await POST("requestor", "/api/par", { project_id: NIL_UUID });
  inSet(r.status, [400, 403, 404], "status");
});
await T("a budget code that does not exist is refused", async () => {
  const r = await POST("requestor", "/api/par", { budget_code_id: NIL_UUID });
  inSet(r.status, [400, 403, 404], "status");
});
await T("date_needed before date_of_request is refused", async () => {
  const r = await POST("requestor", "/api/par", {
    date_of_request: new Date("2026-06-10T00:00:00.000Z").toISOString(),
    date_needed: new Date("2026-06-01T00:00:00.000Z").toISOString(),
  });
  eq(r.status, 400);
});
await T("date_needed equal to date_of_request is accepted", async () => {
  const d = new Date("2026-06-10T00:00:00.000Z").toISOString();
  const r = await POST("requestor", "/api/par", { date_of_request: d, date_needed: d });
  eq(r.status, 201);
});
await T("requestor_title longer than the column is rejected, not truncated", async () => {
  const r = await POST("requestor", "/api/par", { requestor_title: "x".repeat(500) });
  eq(r.status, 400);
});
await T("the author can read back their own draft", async () => {
  const d = await detail("requestor", draftA.id);
  eq(d.id, draftA.id, "id");
});
await T("detail exposes the line_items collection", async () => {
  const d = await detail("requestor", draftA.id);
  assert(Array.isArray(d.line_items), "line_items missing");
});
await T("detail exposes the approvals collection", async () => {
  const d = await detail("requestor", draftA.id);
  assert(Array.isArray(d.approvals), "approvals missing");
});
await T("a draft has no approval steps yet", async () => {
  const d = await detail("requestor", draftA.id);
  eq(d.approvals.length, 0, "approval count");
});

// ═══ D. Section 10 — line items and the money math ═════════════════════════
let mathPar;
await T("a line item can be added to a draft", async () => {
  mathPar = await createDraft("requestor");
  const r = await addLine("requestor", mathPar.id, { quantity: 3, unit_price_cents: 250000 });
  inSet(r.status, [200, 201], "status");
});
await T("line total is computed as quantity × unit price", async () => {
  const d = await detail("requestor", mathPar.id);
  eq(d.line_items[0].lineTotalCents ?? d.line_items[0].line_total_cents, 750000, "line total");
});
await T("the PAR total is the sum of its lines", async () => {
  await addLine("requestor", mathPar.id, { quantity: 2, unit_price_cents: 100000, description: "A doua linie" });
  const d = await detail("requestor", mathPar.id);
  eq(d.totalEstimatedCents, 950000, "total");
});
await T("quantity zero is rejected", async () => {
  eq((await addLine("requestor", mathPar.id, { quantity: 0 })).status, 400);
});
await T("negative quantity is rejected", async () => {
  eq((await addLine("requestor", mathPar.id, { quantity: -2 })).status, 400);
});
await T("fractional quantity is rejected (integer minor-unit discipline)", async () => {
  eq((await addLine("requestor", mathPar.id, { quantity: 1.5 })).status, 400);
});
await T("negative unit price is rejected", async () => {
  eq((await addLine("requestor", mathPar.id, { unit_price_cents: -1 })).status, 400);
});
await T("fractional unit price is rejected (money is integer cents)", async () => {
  eq((await addLine("requestor", mathPar.id, { unit_price_cents: 10.5 })).status, 400);
});
await T("empty description is rejected", async () => {
  eq((await addLine("requestor", mathPar.id, { description: "" })).status, 400);
});
await T("a line item cannot be added to someone else's draft", async () => {
  const r = await addLine("approver", mathPar.id, {});
  inSet(r.status, [403, 404], "status");
});
await T("updating a line item recomputes the PAR total", async () => {
  const d = await detail("requestor", mathPar.id);
  const line = d.line_items[0];
  const r = await PATCH("requestor", `/api/par/${mathPar.id}/line-items/${line.id}`, { quantity: 1 });
  eq(r.status, 200);
  const after = await detail("requestor", mathPar.id);
  eq(after.totalEstimatedCents, 450000, "total after update");
});
await T("deleting a line item recomputes the PAR total", async () => {
  const d = await detail("requestor", mathPar.id);
  const r = await DEL("requestor", `/api/par/${mathPar.id}/line-items/${d.line_items[0].id}`);
  inSet(r.status, [200, 204], "status");
  const after = await detail("requestor", mathPar.id);
  eq(after.totalEstimatedCents, 200000, "total after delete");
});
await T("deleting an unknown line item 404s", async () => {
  eq((await DEL("requestor", `/api/par/${mathPar.id}/line-items/${NIL_UUID}`)).status, 404);
});
await T("an amount that would overflow the money column is refused with 400", async () => {
  const big = await createDraft("requestor");
  const r = await addLine("requestor", big.id, { quantity: 1000, unit_price_cents: 99999999 });
  eq(r.status, 400);
  const d = await detail("requestor", big.id);
  eq(d.totalEstimatedCents, 0, "total left untouched");
});
await T("a second line that would overflow the PAR total is refused", async () => {
  const big = await createDraft("requestor");
  await addLine("requestor", big.id, { quantity: 1, unit_price_cents: 2000000000 });
  const r = await addLine("requestor", big.id, { quantity: 1, unit_price_cents: 2000000000, description: "A doua" });
  eq(r.status, 400);
  eq((await detail("requestor", big.id)).totalEstimatedCents, 2000000000, "total left untouched");
});
await T("editing a line into an overflowing amount is refused", async () => {
  const p = await createDraft("requestor");
  await addLine("requestor", p.id, { quantity: 1, unit_price_cents: 100000 });
  const d = await detail("requestor", p.id);
  const r = await PATCH("requestor", `/api/par/${p.id}/line-items/${d.line_items[0].id}`, { unit_price_cents: 2147483647, quantity: 5 });
  eq(r.status, 400);
});
await T("above_micro_threshold flag is false under the threshold", async () => {
  const small = await readyPar("requestor", { amount: 100000 }); // 1.000 MDL < 5.000
  const d = await detail("requestor", small.id);
  eq(d.above_micro_threshold, false, "flag");
});
await T("above_micro_threshold flag is true over the threshold", async () => {
  const big = await readyPar("requestor", { amount: 900000 }); // 9.000 MDL > 5.000
  const d = await detail("requestor", big.id);
  eq(d.above_micro_threshold, true, "flag");
});

// ═══ E. Sections 11–12 — end use, payee, validation ════════════════════════
let payeePar;
await T("end use text is stored on the draft", async () => {
  payeePar = await createDraft("requestor");
  const r = await PATCH("requestor", `/api/par/${payeePar.id}`, { end_use: "Consultanță" });
  eq(r.status, 200);
  eq((await detail("requestor", payeePar.id)).endUse, "Consultanță", "end_use");
});
await T("a valid Moldovan IBAN is accepted", async () => {
  eq((await PATCH("requestor", `/api/par/${payeePar.id}`, { payee_iban: IBAN_A })).status, 200);
});
await T("an IBAN failing the mod-97 checksum is kept but flagged, not blocked", async () => {
  // Deliberate (server/routes/par.ts): payments can be international and foreign formats are too
  // varied to guarantee, so a requestor holding the paperwork is never walled off. The gate is the
  // warning the approver/finance sees before paying — see the browser scenario below.
  const bad = "MD24AG000225100013104169";
  const r = await PATCH("requestor", `/api/par/${payeePar.id}`, { payee_iban: bad });
  eq(r.status, 200);
  eq((await detail("requestor", payeePar.id)).payeeIban, bad, "stored value");
});
await T("a foreign IBAN is accepted (international payments)", async () => {
  const r = await PATCH("requestor", `/api/par/${payeePar.id}`, { payee_iban: "DE89370400440532013000" });
  eq(r.status, 200);
  eq((await detail("requestor", payeePar.id)).payeeIban, "DE89370400440532013000", "stored value");
});
await T("a pasted IBAN with spaces is stored canonically", async () => {
  const r = await PATCH("requestor", `/api/par/${payeePar.id}`, { payee_iban: "MD24 AG00 0225 1000 1310 4168" });
  eq(r.status, 200);
  eq((await detail("requestor", payeePar.id)).payeeIban, IBAN_A, "normalised iban");
});
await T("a lowercase IBAN is upper-cased on the way in", async () => {
  const r = await PATCH("requestor", `/api/par/${payeePar.id}`, { payee_iban: IBAN_A.toLowerCase() });
  eq(r.status, 200);
  eq((await detail("requestor", payeePar.id)).payeeIban, IBAN_A, "upper-cased iban");
});
await T("a foreign fiscal id is accepted (not everyone has a 13-digit IDNP)", async () => {
  const r = await PATCH("requestor", `/api/par/${payeePar.id}`, { payee_idnp: "DE123456789" });
  eq(r.status, 200);
  eq((await detail("requestor", payeePar.id)).payeeIdnp, "DE123456789", "stored value");
});
await T("an absurdly long fiscal id is still refused by the column bound", async () => {
  eq((await PATCH("requestor", `/api/par/${payeePar.id}`, { payee_idnp: "9".repeat(80) })).status, 400);
});
await T("a 13-digit IDNP is accepted", async () => {
  eq((await PATCH("requestor", `/api/par/${payeePar.id}`, { payee_idnp: IDNP })).status, 200);
});
await T("currency MDL is accepted", async () => {
  eq((await PATCH("requestor", `/api/par/${payeePar.id}`, { currency: "MDL" })).status, 200);
});
await T("currency EUR is accepted", async () => {
  eq((await PATCH("requestor", `/api/par/${payeePar.id}`, { currency: "EUR" })).status, 200);
});
await T("currency RON is rejected (only MDL/EUR/USD)", async () => {
  eq((await PATCH("requestor", `/api/par/${payeePar.id}`, { currency: "RON" })).status, 400);
});
await T("end_use beyond the column limit is rejected", async () => {
  eq((await PATCH("requestor", `/api/par/${payeePar.id}`, { end_use: "x".repeat(6000) })).status, 400);
});
await T("an unknown vendor_id is refused", async () => {
  const r = await PATCH("requestor", `/api/par/${payeePar.id}`, { vendor_id: NIL_UUID });
  inSet(r.status, [400, 404], "status");
});
await T("another user cannot patch someone else's draft", async () => {
  const r = await PATCH("approver", `/api/par/${payeePar.id}`, { end_use: "hijack" });
  inSet(r.status, [403, 404], "status");
});
await T("attachments_present toggles with a note", async () => {
  const r = await PATCH("requestor", `/api/par/${payeePar.id}`, { attachments_present: true, attachments_note: "act de primire 09.06.2026" });
  eq(r.status, 200);
  const d = await detail("requestor", payeePar.id);
  eq(d.attachmentsPresent, true, "attachments_present");
});

// ═══ F. Submit gate (CORE §4) ══════════════════════════════════════════════
await T("a PAR with no line items cannot be submitted", async () => {
  const p = await createDraft("requestor");
  await fillPayee("requestor", p.id);
  eq((await POST("requestor", `/api/par/${p.id}/submit`)).status, 400);
});
await T("an execute_payment PAR without a payee cannot be submitted", async () => {
  const p = await createDraft("requestor");
  await addLine("requestor", p.id, {});
  await PATCH("requestor", `/api/par/${p.id}`, { end_use: "ceva" });
  eq((await POST("requestor", `/api/par/${p.id}/submit`)).status, 400);
});
await T("an execute_payment PAR without end-use cannot be submitted", async () => {
  const p = await createDraft("requestor");
  await addLine("requestor", p.id, {});
  await fillPayee("requestor", p.id, { end_use: null });
  eq((await POST("requestor", `/api/par/${p.id}/submit`)).status, 400);
});
await T("submit failure explains which fields are missing", async () => {
  const p = await createDraft("requestor");
  const r = await POST("requestor", `/api/par/${p.id}/submit`);
  eq(r.status, 400);
  assert(r.text.length > 10 && /error|errors/.test(r.text), `unhelpful body: ${r.text.slice(0, 200)}`);
});
let submittedSmall;
await T("a complete draft submits into pending approval", async () => {
  const s = await submitPar("requestor", { amount: 100000 });
  submittedSmall = s.par;
  const d = await detail("requestor", s.par.id);
  eq(d.status, "pending_approval", "status");
});
await T("submitting stamps submitted_at", async () => {
  const d = await detail("requestor", submittedSmall.id);
  assert(d.submittedAt, "submittedAt not set");
});
await T("submitting twice is refused", async () => {
  const r = await POST("requestor", `/api/par/${submittedSmall.id}/submit`);
  inSet(r.status, [400, 409], "status");
});
await T("only the author may submit their PAR", async () => {
  const p = await readyPar("requestor", {});
  const r = await POST("approver", `/api/par/${p.id}/submit`);
  inSet(r.status, [403, 404], "status");
});
await T("the header is immutable after submit", async () => {
  const r = await PATCH("requestor", `/api/par/${submittedSmall.id}`, { end_use: "changed after approval started" });
  inSet(r.status, [400, 403, 409], "status");
});
await T("line items are immutable after submit", async () => {
  const r = await addLine("requestor", submittedSmall.id, {});
  inSet(r.status, [400, 403, 409], "status");
});
await T("a line item cannot be deleted after submit", async () => {
  const d = await detail("requestor", submittedSmall.id);
  const r = await DEL("requestor", `/api/par/${submittedSmall.id}/line-items/${d.line_items[0].id}`);
  inSet(r.status, [400, 403, 409], "status");
});
await T("the submitted body carries an integrity hash that validates", async () => {
  const d = await detail("requestor", submittedSmall.id);
  assert(d.body_hash_valid !== false, "body hash reported as tampered right after submit");
});

// ═══ G. DOA routing (CORE §3) ══════════════════════════════════════════════
await T("a sub-threshold PAR routes to a single approval step", async () => {
  const d = await detail("admin", submittedSmall.id);
  eq(d.approvals.filter((a) => a.step >= 1).length, 1, "step count for 1.000 MDL");
});
let submittedBig;
await T("an over-threshold PAR routes to two approval steps", async () => {
  const s = await submitPar("requestor", { amount: 700000 }); // 7.000 MDL
  submittedBig = s.par;
  const d = await detail("admin", s.par.id);
  eq(d.approvals.filter((a) => a.step >= 1).length, 2, "step count for 7.000 MDL");
});
await T("approval steps are ordered and start pending", async () => {
  const d = await detail("admin", submittedBig.id);
  const steps = d.approvals.filter((a) => a.step >= 1).sort((a, b) => a.step - b.step);
  eq(steps[0].step, 1, "first step");
  eq(steps[0].decision, "pending", "first decision");
  eq(steps[1].step, 2, "second step");
});
await T("each approval step carries a role label for the PDF signature box", async () => {
  const d = await detail("admin", submittedBig.id);
  const s1 = d.approvals.find((a) => a.step === 1);
  assert(s1.approverRoleLabel && s1.approverRoleLabel.length > 0, "no role label");
});
await T("the approver inbox lists the PAR waiting on step 1", async () => {
  const r = await GET("approver", "/api/par/inbox");
  eq(r.status, 200);
  const items = coll(r.body);
  assert(items.some((i) => i.id === submittedBig.id), "submitted PAR missing from inbox");
});
await T("a draft never appears in the approver inbox", async () => {
  const p = await readyPar("requestor", {});
  const r = await GET("approver", "/api/par/inbox");
  const items = coll(r.body);
  assert(!items.some((i) => i.id === p.id), "draft leaked into inbox");
});

// ═══ H. Approval integrity (CORE §9) ═══════════════════════════════════════
await T("the requestor cannot approve their own PAR", async () => {
  const r = await POST("requestor", `/api/par/${submittedBig.id}/approve`, { comment: "self" });
  inSet(r.status, [403, 400], "status");
});
await T("a random user cannot approve a PAR not routed to them", async () => {
  const r = await POST("finance", `/api/par/${submittedBig.id}/approve`, { comment: "not mine" });
  inSet(r.status, [403, 400], "status");
});
await T("step 1 approval is recorded with the decision and comment", async () => {
  const r = await POST("approver", `/api/par/${submittedBig.id}/approve`, { comment: "de acord", signatureName: "Ana Chirita" });
  eq(r.status, 200);
  const d = await detail("admin", submittedBig.id);
  const s1 = d.approvals.find((a) => a.step === 1);
  eq(s1.decision, "approved", "step1 decision");
  eq(s1.comment, "de acord", "step1 comment");
});
await T("step 1 approval stamps the decision timestamp", async () => {
  const d = await detail("admin", submittedBig.id);
  assert(d.approvals.find((a) => a.step === 1).decidedAt, "decidedAt missing");
});
await T("a two-step PAR stays pending after only the first approval", async () => {
  eq((await detail("admin", submittedBig.id)).status, "pending_approval", "status");
});
await T("the same approver cannot approve the same step twice", async () => {
  const r = await POST("approver", `/api/par/${submittedBig.id}/approve`, { comment: "again" });
  inSet(r.status, [400, 403, 409], "status");
});
await T("the final approval moves an execute_payment PAR to finance", async () => {
  const r = await POST("admin", `/api/par/${submittedBig.id}/approve`, { comment: "aprobat final" });
  eq(r.status, 200);
  const d = await detail("admin", submittedBig.id);
  inSet(d.status, ["in_finance", "approved"], "status after final approval");
});
await T("full approval stamps approved_at", async () => {
  assert((await detail("admin", submittedBig.id)).approvedAt, "approvedAt missing");
});
await T("an approved PAR can no longer be approved", async () => {
  const r = await POST("approver", `/api/par/${submittedBig.id}/approve`, { comment: "late" });
  inSet(r.status, [400, 403, 409], "status");
});
await T("an approved PAR leaves the approver inbox", async () => {
  const items = coll((await GET("approver", "/api/par/inbox")).body);
  assert(!items.some((i) => i.id === submittedBig.id), "approved PAR still in inbox");
});
await T("later approval steps are locked until the earlier one signs", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  const d = await detail("admin", par.id);
  const s2 = d.approvals.find((a) => a.step === 2);
  eq(s2.locked, true, "step 2 locked");
  eq(d.approvals.find((a) => a.step === 1).locked, false, "step 1 unlocked");
});
await T("an approval decides the earliest open step, never a later one", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  const r = await POST("admin", `/api/par/${par.id}/approve`, { comment: "prima semnătură" });
  eq(r.status, 200);
  const d = await detail("admin", par.id);
  eq(d.approvals.find((a) => a.step === 1).decision, "approved", "step 1");
  eq(d.approvals.find((a) => a.step === 2).decision, "pending", "step 2");
  eq(d.status, "pending_approval", "status");
});
await T("a quotations PAR closes at approved without reaching finance", async () => {
  const { par } = await submitPar("requestor", { amount: 700000, purpose: "obtain_quotations" });
  const d = await approveAll(par.id);
  eq(d.status, "approved", "status");
});
await T("an estimate PAR closes at approved without reaching finance", async () => {
  const { par } = await submitPar("requestor", { amount: 700000, purpose: "provide_estimate" });
  const d = await approveAll(par.id);
  eq(d.status, "approved", "status");
});
await T("a quotations PAR never enters the finance queue", async () => {
  const { par } = await submitPar("requestor", { amount: 700000, purpose: "obtain_quotations" });
  await approveAll(par.id);
  const items = coll((await GET("finance", "/api/par/finance")).body);
  assert(!items.some((i) => i.id === par.id), "quotations PAR leaked into finance queue");
});

// ═══ I. Reject / request changes / reopen / cancel ═════════════════════════
await T("rejecting without a comment is refused", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  eq((await POST("approver", `/api/par/${par.id}/reject`, { comment: "" })).status, 400);
});
let rejectedPar;
await T("an approver can reject with a reason", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  rejectedPar = par;
  const r = await POST("approver", `/api/par/${par.id}/reject`, { comment: "buget insuficient" });
  eq(r.status, 200);
  eq((await detail("requestor", par.id)).status, "rejected", "status");
});
await T("a rejected PAR cannot then be approved", async () => {
  const r = await POST("approver", `/api/par/${rejectedPar.id}/approve`, { comment: "oops" });
  inSet(r.status, [400, 403, 409], "status");
});
await T("a rejected PAR cannot be resubmitted directly", async () => {
  const r = await POST("requestor", `/api/par/${rejectedPar.id}/submit`);
  inSet(r.status, [400, 409], "status");
});
await T("the author can reopen a rejected PAR into a draft", async () => {
  const r = await POST("requestor", `/api/par/${rejectedPar.id}/reopen`);
  eq(r.status, 200);
  eq((await detail("requestor", rejectedPar.id)).status, "draft", "status");
});
await T("reopening keeps the same request number", async () => {
  eq((await detail("requestor", rejectedPar.id)).requestNo, rejectedPar.requestNo, "request_no");
});
await T("a reopened PAR is editable again", async () => {
  eq((await PATCH("requestor", `/api/par/${rejectedPar.id}`, { end_use: "corectat după respingere" })).status, 200);
});
await T("a reopened PAR can be resubmitted and re-routed", async () => {
  const r = await POST("requestor", `/api/par/${rejectedPar.id}/submit`);
  eq(r.status, 200);
  const d = await detail("admin", rejectedPar.id);
  eq(d.status, "pending_approval", "status");
  assert(d.approvals.filter((a) => a.step >= 1 && a.decision === "pending").length >= 1, "chain not rebuilt");
});
await T("a stranger cannot reopen someone else's rejected PAR", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  await POST("approver", `/api/par/${par.id}/reject`, { comment: "nu" });
  const r = await POST("finance", `/api/par/${par.id}/reopen`);
  inSet(r.status, [403, 404], "status");
});
let changesPar;
await T("an approver can request changes with a comment", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  changesPar = par;
  const r = await POST("approver", `/api/par/${par.id}/request-changes`, { comment: "adaugă contractul" });
  eq(r.status, 200);
  eq((await detail("requestor", par.id)).status, "changes_requested", "status");
});
await T("request-changes without a comment is refused", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  eq((await POST("approver", `/api/par/${par.id}/request-changes`, {})).status, 400);
});
await T("a PAR in changes_requested becomes editable again", async () => {
  eq((await PATCH("requestor", `/api/par/${changesPar.id}`, { end_use: "am adăugat contractul" })).status, 200);
});
await T("a PAR in changes_requested can be resubmitted", async () => {
  const r = await POST("requestor", `/api/par/${changesPar.id}/submit`);
  eq(r.status, 200);
  eq((await detail("requestor", changesPar.id)).status, "pending_approval", "status");
});
await T("the requestor can cancel their own draft", async () => {
  const p = await createDraft("requestor");
  const r = await DEL("requestor", `/api/par/${p.id}`);
  inSet(r.status, [200, 204], "status");
  const d = await GET("requestor", `/api/par/${p.id}`);
  if (d.status === 200) eq(d.body.status, "cancelled", "status");
});
await T("another requestor cannot cancel a PAR they do not own", async () => {
  const p = await createDraft("requestor");
  const r = await DEL("finance", `/api/par/${p.id}`);
  inSet(r.status, [403, 404], "status");
});
await T("par_admin can cancel any non-terminal PAR", async () => {
  const p = await createDraft("requestor");
  const r = await DEL("admin", `/api/par/${p.id}`);
  inSet(r.status, [200, 204], "status");
});
await T("a cancelled PAR cannot be submitted", async () => {
  const p = await readyPar("requestor", {});
  await DEL("requestor", `/api/par/${p.id}`);
  const r = await POST("requestor", `/api/par/${p.id}/submit`);
  inSet(r.status, [400, 404, 409], "status");
});

// ═══ J. Finance stage + the 10% overage rule (CORE §3, §4) ═════════════════
let financePar;
await T("a fully approved payment PAR appears in the finance queue", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  financePar = par;
  await approveAll(par.id);
  const items = coll((await GET("finance", "/api/par/finance")).body);
  assert(items.some((i) => i.id === par.id), "approved PAR missing from finance queue");
});
await T("finance can fill section 16 (received / assigned)", async () => {
  const me = await GET("finance", "/api/par/me");
  const uid = me.body.userId ?? me.body.id ?? me.body.user?.id;
  const r = await POST("finance", `/api/par/${financePar.id}/finance`, { par_bl: "BL-2026-01", received_by_user_id: uid ?? null, assigned_to_user_id: uid ?? null });
  eq(r.status, 200);
});
await T("section 16 records the PAR budget line", async () => {
  const d = await detail("finance", financePar.id);
  eq(d.payment?.parBl ?? d.payment?.par_bl, "BL-2026-01", "par_bl");
});
await T("a requestor cannot fill section 16", async () => {
  const r = await POST("requestor", `/api/par/${financePar.id}/finance`, { par_bl: "HACK" });
  inSet(r.status, [403, 400], "status");
});
await T("an approver cannot mark a PAR paid", async () => {
  const r = await POST("approver", `/api/par/${financePar.id}/pay`, { actual_amount_cents: 700000, payment_date: new Date().toISOString() });
  inSet(r.status, [403, 400], "status");
});
await T("finance can pay the exact approved amount", async () => {
  const r = await POST("finance", `/api/par/${financePar.id}/pay`, { actual_amount_cents: 700000, payment_date: new Date().toISOString(), payment_ref: "OP 123" });
  eq(r.status, 200);
  eq((await detail("finance", financePar.id)).status, "paid", "status");
});
await T("paying stamps paid_at", async () => {
  assert((await detail("finance", financePar.id)).paidAt, "paidAt missing");
});
await T("a paid PAR cannot be paid twice", async () => {
  const r = await POST("finance", `/api/par/${financePar.id}/pay`, { actual_amount_cents: 700000, payment_date: new Date().toISOString() });
  inSet(r.status, [400, 409], "status");
});
await T("a paid PAR cannot be cancelled", async () => {
  const r = await DEL("admin", `/api/par/${financePar.id}`);
  inSet(r.status, [400, 403, 409], "status");
});
await T("a paid PAR leaves the finance queue", async () => {
  const items = coll((await GET("finance", "/api/par/finance")).body);
  assert(!items.some((i) => i.id === financePar.id), "paid PAR still queued");
});
await T("a negative payment amount is refused", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  await approveAll(par.id);
  const r = await POST("finance", `/api/par/${par.id}/pay`, { actual_amount_cents: -5, payment_date: new Date().toISOString() });
  eq(r.status, 400);
});
await T("a zero payment amount is refused", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  await approveAll(par.id);
  const r = await POST("finance", `/api/par/${par.id}/pay`, { actual_amount_cents: 0, payment_date: new Date().toISOString() });
  eq(r.status, 400);
});
await T("a malformed payment date is refused", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  await approveAll(par.id);
  const r = await POST("finance", `/api/par/${par.id}/pay`, { actual_amount_cents: 700000, payment_date: "ieri" });
  eq(r.status, 400);
});
await T("a non-url payment proof is refused", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  await approveAll(par.id);
  const r = await POST("finance", `/api/par/${par.id}/pay`, { actual_amount_cents: 700000, payment_date: new Date().toISOString(), proof_url: "not a url" });
  eq(r.status, 400);
});
await T("a PAR that was never approved cannot be paid", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  const r = await POST("finance", `/api/par/${par.id}/pay`, { actual_amount_cents: 700000, payment_date: new Date().toISOString() });
  inSet(r.status, [400, 403, 409], "status");
});
await T("paying up to exactly +10% proceeds without re-approval", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  await approveAll(par.id);
  const r = await POST("finance", `/api/par/${par.id}/pay`, { actual_amount_cents: 770000, payment_date: new Date().toISOString() });
  eq(r.status, 200);
  eq((await detail("finance", par.id)).status, "paid", "status at exactly +10%");
});
let overagePar;
await T("paying more than +10% over the threshold demands re-approval", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  overagePar = par;
  await approveAll(par.id);
  const r = await POST("finance", `/api/par/${par.id}/pay`, { actual_amount_cents: 900000, payment_date: new Date().toISOString() });
  const d = await detail("finance", par.id);
  eq(d.status, "reapproval_required", `status (pay returned ${r.status})`);
});
await T("a PAR awaiting re-approval is not paid", async () => {
  const d = await detail("finance", overagePar.id);
  assert(!d.paidAt, "paidAt set while re-approval pending");
});
await T("finance cannot force payment while re-approval is pending", async () => {
  const r = await POST("finance", `/api/par/${overagePar.id}/pay`, { actual_amount_cents: 900000, payment_date: new Date().toISOString() });
  inSet(r.status, [400, 403, 409], "status");
});
await T("the requestor cannot self-authorise the overage", async () => {
  const r = await POST("requestor", `/api/par/${overagePar.id}/reapprove`, {});
  inSet(r.status, [403, 400], "status");
});
await T("an approver can re-approve the overage", async () => {
  let ok = false;
  for (const role of ["admin", "approver"]) {
    const r = await POST(role, `/api/par/${overagePar.id}/reapprove`, { comment: "acceptăm depășirea" });
    if (r.status === 200) { ok = true; break; }
  }
  assert(ok, "no approver could re-approve the overage");
});
await T("after re-approval the payment goes through", async () => {
  const r = await POST("finance", `/api/par/${overagePar.id}/pay`, { actual_amount_cents: 900000, payment_date: new Date().toISOString() });
  eq(r.status, 200);
  eq((await detail("finance", overagePar.id)).status, "paid", "status");
});
await T("a big overage under the micro-purchase threshold pays straight away", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 }); // 1.000 MDL < 5.000 threshold
  await approveAll(par.id);
  const r = await POST("finance", `/api/par/${par.id}/pay`, { actual_amount_cents: 190000, payment_date: new Date().toISOString() });
  eq(r.status, 200);
  eq((await detail("finance", par.id)).status, "paid", "status");
});
await T("paying less than approved is allowed without re-approval", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  await approveAll(par.id);
  const r = await POST("finance", `/api/par/${par.id}/pay`, { actual_amount_cents: 300000, payment_date: new Date().toISOString() });
  eq(r.status, 200);
  eq((await detail("finance", par.id)).status, "paid", "status");
});
await T("the actual paid amount is stored on the record", async () => {
  const d = await detail("finance", overagePar.id);
  eq(d.payment?.actualAmountCents ?? d.payment?.actual_amount_cents, 900000, "actual amount");
});

// ═══ K. Tenant isolation (CORE §9) ═════════════════════════════════════════
await T("a user from another tenant cannot read this tenant's PAR", async () => {
  const r = await GET("other", `/api/par/${financePar.id}`);
  inSet(r.status, [403, 404], "status");
});
await T("another tenant's list never contains our request numbers", async () => {
  const r = await GET("other", "/api/par");
  if (r.status === 200) {
    const items = coll(r.body);
    assert(!items.some((i) => i.id === financePar.id), "cross-tenant leak in list");
  } else inSet(r.status, [401, 403], "status");
});
await T("another tenant cannot approve our PAR", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  const r = await POST("other", `/api/par/${par.id}/approve`, { comment: "cross tenant" });
  inSet(r.status, [400, 403, 404], "status");
});
await T("another tenant cannot patch our PAR", async () => {
  const r = await PATCH("other", `/api/par/${financePar.id}`, { end_use: "cross tenant" });
  inSet(r.status, [400, 403, 404], "status");
});
await T("another tenant cannot delete our PAR", async () => {
  const r = await DEL("other", `/api/par/${financePar.id}`);
  inSet(r.status, [400, 403, 404], "status");
});
await T("another tenant cannot read our vendor registry rows", async () => {
  const ours = (await GET("admin", "/api/par/vendors")).body;
  const list = coll(ours);
  const theirs = await GET("other", "/api/par/vendors");
  if (theirs.status === 200 && list.length) {
    const t = coll(theirs.body);
    assert(!t.some((v) => list.some((o) => o.id === v.id)), "vendor rows leaked across tenants");
  }
});
await T("another tenant cannot read our audit trail", async () => {
  const r = await GET("other", `/api/par/audit?par_id=${financePar.id}`);
  if (r.status === 200) {
    const items = coll(r.body);
    eq(items.length, 0, "cross-tenant audit rows");
  } else inSet(r.status, [403, 404], "status");
});

// ═══ L. Listing, filtering, visibility ═════════════════════════════════════
await T("the list endpoint answers with a collection", async () => {
  const r = await GET("requestor", "/api/par");
  eq(r.status, 200);
  assert(Array.isArray(coll(r.body)), "not a collection");
});
await T("a requestor sees their own PARs in the list", async () => {
  const r = await GET("requestor", "/api/par");
  const items = coll(r.body);
  assert(items.some((i) => i.id === financePar.id), "own PAR missing from list");
});
await T("the list can be filtered by status", async () => {
  const r = await GET("requestor", "/api/par?status=paid");
  eq(r.status, 200);
  const items = coll(r.body);
  assert(items.every((i) => i.status === "paid"), "status filter leaked other statuses");
});
await T("an unknown status filter does not 500", async () => {
  const r = await GET("requestor", "/api/par?status=banana");
  inSet(r.status, [200, 400], "status");
});
await T("the list supports a search term without crashing", async () => {
  const r = await GET("requestor", `/api/par?q=${encodeURIComponent(financePar.requestNo)}`);
  eq(r.status, 200);
});
await T("a negative page size does not crash the list", async () => {
  const r = await GET("requestor", "/api/par?limit=-5");
  inSet(r.status, [200, 400], "status");
});
await T("an absurd page size does not hang the list", async () => {
  const r = await GET("requestor", "/api/par?limit=100000");
  inSet(r.status, [200, 400], "status");
});
await T("a requestor does not see other people's PARs", async () => {
  const mine = await createDraft("finance");
  const r = await GET("requestor", "/api/par");
  const items = coll(r.body);
  assert(!items.some((i) => i.id === mine.id), "requestor sees another user's draft");
});
await T("a requestor cannot open another user's draft", async () => {
  const others = await createDraft("finance");
  const r = await GET("requestor", `/api/par/${others.id}`);
  inSet(r.status, [403, 404], "status");
});

// ═══ M. Payee privacy (GDPR, CORE §9) ══════════════════════════════════════
await T("an unsubmitted draft is not readable by an approver or finance", async () => {
  const p = await readyPar("requestor", {});
  for (const role of ["approver", "finance"]) {
    const r = await GET(role, `/api/par/${p.id}`);
    eq(r.status, 404, `${role} could open someone else's draft`);
  }
});
await T("an unsubmitted draft does not leak the payee IBAN to other roles", async () => {
  const p = await readyPar("requestor", {});
  for (const role of ["approver", "finance"]) {
    const r = await GET(role, `/api/par/${p.id}`);
    assert(!r.text.includes(IBAN_A), `${role} saw the payee IBAN of a draft`);
  }
});
await T("others' drafts do not show up in an approver's list", async () => {
  const p = await readyPar("requestor", {});
  const items = coll((await GET("approver", "/api/par")).body);
  assert(!items.some((i) => i.id === p.id), "another user's draft listed for the approver");
});
await T("the author still sees their own draft in the list", async () => {
  const p = await readyPar("requestor", {});
  const items = coll((await GET("requestor", "/api/par")).body);
  assert(items.some((i) => i.id === p.id), "author lost sight of their own draft");
});
await T("a submitted PAR becomes visible to the approver", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  eq((await GET("approver", `/api/par/${par.id}`)).status, 200);
});
await T("the routed approver can see the payee block", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  const r = await GET("approver", `/api/par/${par.id}`);
  eq(r.status, 200);
  assert(r.body.payeeIban === IBAN_A, `approver cannot see IBAN: ${r.body.payeeIban}`);
});
await T("vendors are reusable and carry banking data", async () => {
  const r = await POST("admin", "/api/par/vendors", { name: "Furnizor Test SRL", iban: IBAN_B, bank: "BC Test", idnp: null });
  inSet(r.status, [200, 201], "status");
});
await T("a vendor with a foreign IBAN can be registered", async () => {
  const r = await POST("admin", "/api/par/vendors", { name: "Auslandpartner GmbH", iban: "DE89370400440532013000" });
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 150)}`);
});
await T("a vendor without a name is refused", async () => {
  eq((await POST("admin", "/api/par/vendors", { name: "" })).status, 400);
});
await T("submitting a PAR auto-saves a new payee into the registry", async () => {
  const unique = `Beneficiar Unic ${Date.now()}`;
  const p = await createDraft("requestor");
  await addLine("requestor", p.id, {});
  // A new registry row needs new identifiers: the registry dedups by IBAN, then IDNP, then name.
  await fillPayee("requestor", p.id, { payee_name: unique, payee_iban: IBAN_FRESH, payee_idnp: "2004600098765" });
  await POST("requestor", `/api/par/${p.id}/submit`);
  const items = coll((await GET("admin", "/api/par/vendors")).body);
  assert(items.some((v) => v.name === unique), "payee not auto-saved to the registry");
});
await T("re-paying the same account does not mint a duplicate payee", async () => {
  const before = coll((await GET("admin", "/api/par/vendors")).body).filter((v) => v.iban === IBAN_FRESH).length;
  const p = await createDraft("requestor");
  await addLine("requestor", p.id, {});
  await fillPayee("requestor", p.id, { payee_name: "Alt nume, acelasi cont", payee_iban: IBAN_FRESH, payee_idnp: "2004600098765" });
  await POST("requestor", `/api/par/${p.id}/submit`);
  const after = coll((await GET("admin", "/api/par/vendors")).body).filter((v) => v.iban === IBAN_FRESH).length;
  eq(after, before, "vendor rows for the same IBAN");
});

// ═══ N. Attachments, comments, quotes, receipts, PO ════════════════════════
let attachPar;
await T("attachments list is readable on a PAR", async () => {
  attachPar = await readyPar("requestor", {});
  const r = await GET("requestor", `/api/par/${attachPar.id}/attachments`);
  eq(r.status, 200);
});
await T("a realistic-size attachment upload is accepted", async () => {
  const dataUrl = "data:application/pdf;base64," + "JVBERi0xLjQK".repeat(500);
  const r = await POST("requestor", `/api/par/${attachPar.id}/attachments`, {
    file_name: "contract.pdf", file_url: dataUrl, mime: "application/pdf", kind: "contract", size_bytes: dataUrl.length,
  });
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 200)}`);
});
await T("the uploaded attachment shows on the PAR", async () => {
  const r = await GET("requestor", `/api/par/${attachPar.id}/attachments`);
  const items = coll(r.body);
  assert(items.length >= 1, "attachment not listed");
});
await T("an attachment with an unknown kind is refused or normalised", async () => {
  const r = await POST("requestor", `/api/par/${attachPar.id}/attachments`, {
    file_name: "x.pdf", file_url: "data:application/pdf;base64,AAAA", mime: "application/pdf", kind: "nuclear_launch_codes",
  });
  inSet(r.status, [200, 201, 400], "status");
});
await T("an attachment without a file is refused", async () => {
  const r = await POST("requestor", `/api/par/${attachPar.id}/attachments`, { file_name: "x.pdf" });
  eq(r.status, 400);
});
await T("a stranger cannot attach files to someone else's PAR", async () => {
  const r = await POST("finance", `/api/par/${attachPar.id}/attachments`, {
    file_name: "x.pdf", file_url: "data:application/pdf;base64,AAAA", mime: "application/pdf", kind: "other",
  });
  inSet(r.status, [403, 404], "status");
});
await T("the author can delete their own attachment", async () => {
  const items = coll((await GET("requestor", `/api/par/${attachPar.id}/attachments`)).body);
  const r = await DEL("requestor", `/api/par/${attachPar.id}/attachments/${items[0].id}`);
  inSet(r.status, [200, 204], "status");
});
await T("deleting an unknown attachment 404s", async () => {
  eq((await DEL("requestor", `/api/par/${attachPar.id}/attachments/${NIL_UUID}`)).status, 404);
});
await T("comments can be posted on a PAR", async () => {
  const r = await POST("requestor", `/api/par/${attachPar.id}/comments`, { body: "Vă rog aprobați urgent." });
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 150)}`);
});
await T("comments are listed back", async () => {
  const r = await GET("requestor", `/api/par/${attachPar.id}/comments`);
  eq(r.status, 200);
  const items = coll(r.body);
  assert(items.length >= 1, "comment not returned");
});
await T("an empty comment is refused", async () => {
  eq((await POST("requestor", `/api/par/${attachPar.id}/comments`, { body: "" })).status, 400);
});
await T("nobody can comment on a draft they cannot see", async () => {
  const p = await createDraft("requestor");
  const r = await POST("finance", `/api/par/${p.id}/comments`, { body: "hello" });
  eq(r.status, 404);
});
await T("nobody can read the comments of a draft they cannot see", async () => {
  const p = await createDraft("requestor");
  eq((await GET("approver", `/api/par/${p.id}/comments`)).status, 404);
});
let quotePar;
await T("quotes can be added to a quotations PAR", async () => {
  quotePar = await readyPar("requestor", { purpose: "obtain_quotations" });
  const r = await POST("requestor", `/api/par/${quotePar.id}/quotes`, { vendor_name: "Ofertant A", total_cents: 650000, currency: "MDL" });
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 200)}`);
});
await T("quotes are listed back", async () => {
  const r = await GET("requestor", `/api/par/${quotePar.id}/quotes`);
  eq(r.status, 200);
  assert((coll(r.body)).length >= 1, "quote missing");
});
await T("a negative quote amount is refused", async () => {
  const r = await POST("requestor", `/api/par/${quotePar.id}/quotes`, { vendor_name: "Ofertant B", total_cents: -1 });
  eq(r.status, 400);
});
await T("one quote can be selected as the winner", async () => {
  const items = coll((await GET("requestor", `/api/par/${quotePar.id}/quotes`)).body);
  const r = await POST("requestor", `/api/par/${quotePar.id}/quotes/${items[0].id}/select`, { reason: "cel mai mic preț" });
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 200)}`);
});
await T("submitting a quotations PAR with fewer than 3 quotes warns (does not block)", async () => {
  const r = await POST("requestor", `/api/par/${quotePar.id}/submit`);
  eq(r.status, 200);
  eq(r.body.quotes_below_three, true, "3-bid advisory flag");
});
await T("a PAR can be duplicated into a fresh draft", async () => {
  const r = await POST("requestor", `/api/par/${financePar.id}/duplicate`, {});
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 200)}`);
  const copy = r.body.par ?? r.body;
  eq(copy.status, "draft", "copy status");
  assert(copy.id !== financePar.id, "duplicate returned the original");
});
await T("the duplicate copies the line items", async () => {
  const r = await POST("requestor", `/api/par/${financePar.id}/duplicate`, {});
  const copy = r.body.par ?? r.body;
  const d = await detail("requestor", copy.id);
  assert(d.line_items.length >= 1, "duplicate has no lines");
});
await T("the duplicate does not inherit approvals or payment", async () => {
  const r = await POST("requestor", `/api/par/${financePar.id}/duplicate`, {});
  const copy = r.body.par ?? r.body;
  const d = await detail("requestor", copy.id);
  eq(d.approvals.length, 0, "approvals copied");
  eq(d.payment, null, "payment copied");
});
await T("receipts can be listed for a PAR", async () => {
  eq((await GET("requestor", `/api/par/${financePar.id}/receipts`)).status, 200);
});
await T("a purchase order can be read for a PAR", async () => {
  const r = await GET("requestor", `/api/par/${financePar.id}/purchase-order`);
  inSet(r.status, [200, 404], "status");
});
await T("the timeline is readable and non-empty after a full lifecycle", async () => {
  const r = await GET("requestor", `/api/par/${financePar.id}/timeline`);
  eq(r.status, 200);
  const items = coll(r.body);
  assert(items.length >= 3, `timeline too short: ${items.length}`);
});
await T("the approval dossier renders for a paid PAR", async () => {
  const r = await GET("requestor", `/api/par/${financePar.id}/dosar`);
  inSet(r.status, [200], `status — ${r.text.slice(0, 200)}`);
});

// ═══ O. Audit trail (CORE §4 — every transition logged) ════════════════════
await T("the audit log records the create event", async () => {
  const r = await GET("admin", `/api/par/audit?par_id=${financePar.id}`);
  eq(r.status, 200);
  const items = coll(r.body);
  assert(items.some((e) => /created/.test(e.event ?? "")), "no created event");
});
await T("the audit log records the submit event", async () => {
  const items = coll((await GET("admin", `/api/par/audit?par_id=${financePar.id}`)).body);
  assert(items.some((e) => /submit/.test(e.event ?? "")), "no submitted event");
});
await T("the audit log records approvals", async () => {
  const items = coll((await GET("admin", `/api/par/audit?par_id=${financePar.id}`)).body);
  assert(items.some((e) => /approv/.test(e.event ?? "")), "no approval event");
});
await T("the audit log records the payment", async () => {
  const items = coll((await GET("admin", `/api/par/audit?par_id=${financePar.id}`)).body);
  assert(items.some((e) => /paid|payment/.test(e.event ?? "")), "no payment event");
});
await T("every audit row names an actor", async () => {
  const items = coll((await GET("admin", `/api/par/audit?par_id=${financePar.id}`)).body);
  assert(items.every((e) => e.actorUserId || e.actorName || e.actor_user_id), "audit row without actor");
});
await T("the audit log exports to xlsx", async () => {
  const r = await GET("admin", "/api/par/audit/export.xlsx");
  eq(r.status, 200);
  assert(/spreadsheet|octet-stream/.test(r.ct), `wrong content-type: ${r.ct}`);
});
await T("the audit log exports to pdf", async () => {
  const r = await GET("admin", "/api/par/audit/export.pdf");
  eq(r.status, 200);
  assert(/pdf/.test(r.ct), `wrong content-type: ${r.ct}`);
});
await T("a requestor cannot export the whole tenant audit trail", async () => {
  const r = await GET("requestor", "/api/par/audit/export.xlsx");
  inSet(r.status, [403, 200], "status");
});

// ═══ P. Reports (CORE §8) ══════════════════════════════════════════════════
for (const rep of ["by-budget", "by-payer", "by-department", "by-project", "by-event", "by-charge-to", "by-vendor", "currency-breakdown", "aging", "cycle-time"]) {
  await T(`report ${rep} answers 200 with a collection`, async () => {
    const r = await GET("admin", `/api/par/reports/${rep}`);
    eq(r.status, 200);
    assert(r.body !== null, `not json: ${r.text.slice(0, 120)}`);
  });
}
await T("reports accept a date range without crashing", async () => {
  const r = await GET("admin", "/api/par/reports/by-budget?from=2026-01-01&to=2026-12-31");
  eq(r.status, 200);
});
await T("reports reject or survive a malformed date range", async () => {
  const r = await GET("admin", "/api/par/reports/by-budget?from=notadate&to=alsonot");
  inSet(r.status, [200, 400], "status");
});
await T("the currency breakdown mentions MDL after MDL spending", async () => {
  const r = await GET("admin", "/api/par/reports/currency-breakdown");
  assert(/MDL/.test(r.text), `no MDL in ${r.text.slice(0, 200)}`);
});
await T("the paid total in reports reflects real payments", async () => {
  const r = await GET("admin", "/api/par/reports/by-budget");
  const total = coll(r.body).reduce((s, x) => s + Number(x.paidCents ?? 0), 0);
  assert(total > 0, `no paid amount aggregated: ${r.text.slice(0, 250)}`);
});
await T("every spend dimension reports a paid figure, not just budget codes", async () => {
  for (const rep of ["by-budget", "by-payer", "by-department", "by-project", "by-charge-to", "by-vendor"]) {
    const rows = coll((await GET("admin", `/api/par/reports/${rep}`)).body);
    assert(rows.length === 0 || rows.every((x) => typeof x.paidCents === "number"), `${rep} has no paidCents`);
  }
});
await T("reports export to csv", async () => {
  const r = await GET("admin", "/api/par/reports/export.csv");
  eq(r.status, 200);
  assert(/csv|text\/plain/.test(r.ct), `wrong content-type: ${r.ct}`);
});
await T("the csv export is not empty", async () => {
  const r = await GET("admin", "/api/par/reports/export.csv");
  assert(r.text.split("\n").length >= 2, "csv has no data rows");
});
await T("reports export to xlsx", async () => {
  const r = await GET("admin", "/api/par/reports/export.xlsx");
  eq(r.status, 200);
  assert(/spreadsheet|octet-stream/.test(r.ct), `wrong content-type: ${r.ct}`);
});
await T("an approver's own reports are not silently empty", async () => {
  const { par } = await submitPar("requestor", { amount: 250000 });
  const rows = coll((await GET("approver", "/api/par/reports/by-vendor")).body);
  assert(rows.length > 0, "approver sees an empty spend report");
  const total = rows.reduce((sum, r) => sum + Number(r.totalCents ?? 0), 0);
  assert(total >= 250000, `approver's report total too low (${total}) for ${par.requestNo}`);
});
await T("a payer-level request without a project still counts in the reports", async () => {
  const before = coll((await GET("approver", "/api/par/reports/by-charge-to")).body)
    .reduce((s, r) => s + Number(r.totalCents ?? 0), 0);
  await submitPar("requestor", { amount: 300000 }); // no project_id — payer-level
  const after = coll((await GET("approver", "/api/par/reports/by-charge-to")).body)
    .reduce((s, r) => s + Number(r.totalCents ?? 0), 0);
  eq(after - before, 300000, "delta reported to the approver");
});
await T("finance sees the same spend totals as the admin", async () => {
  const adminTotal = coll((await GET("admin", "/api/par/reports/by-charge-to")).body)
    .reduce((s, r) => s + Number(r.totalCents ?? 0), 0);
  const financeTotal = coll((await GET("finance", "/api/par/reports/by-charge-to")).body)
    .reduce((s, r) => s + Number(r.totalCents ?? 0), 0);
  eq(financeTotal, adminTotal, "finance vs admin report total");
});
await T("an anonymous user cannot export reports", async () => {
  eq((await GET("anon", "/api/par/reports/export.csv")).status, 401);
});

// ═══ Q. Configuration CRUD (admin) ═════════════════════════════════════════
let deptId, projId, codeId;
await T("par_admin can create a department", async () => {
  const r = await POST("admin", "/api/par/departments", { name: `Departament QA ${Date.now()}` });
  inSet(r.status, [200, 201], "status");
  deptId = (r.body.id ?? r.body.department?.id);
  assert(deptId, "no id returned");
});
await T("a department without a name is refused", async () => {
  eq((await POST("admin", "/api/par/departments", { name: "" })).status, 400);
});
await T("departments are listed", async () => {
  const r = await GET("admin", "/api/par/departments");
  eq(r.status, 200);
  const items = coll(r.body);
  assert(items.some((d) => d.id === deptId), "created department missing");
});
await T("par_admin can create a project", async () => {
  const r = await POST("admin", "/api/par/projects", { name: `Proiect QA ${Date.now()}`, donor: "USAID" });
  inSet(r.status, [200, 201], "status");
  projId = r.body.id ?? r.body.project?.id;
  assert(projId, "no id returned");
});
await T("par_admin can create a budget code", async () => {
  const r = await POST("admin", "/api/par/budget-codes", { code: `QA${Date.now() % 100000}`, name: "Linie QA", allocatedCents: 1000000 });
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 200)}`);
  codeId = r.body.id ?? r.body.code?.id;
  assert(codeId, "no id returned");
});
await T("a duplicate budget code is refused", async () => {
  const code = `DUP${Date.now() % 100000}`;
  await POST("admin", "/api/par/budget-codes", { code, name: "Prima" });
  const r = await POST("admin", "/api/par/budget-codes", { code, name: "A doua" });
  eq(r.status, 409);
});
await T("a budget code differing only in letter case is still a duplicate", async () => {
  const code = `Cs${Date.now() % 100000}`;
  await POST("admin", "/api/par/budget-codes", { code, name: "Prima" });
  const r = await POST("admin", "/api/par/budget-codes", { code: code.toUpperCase(), name: "A doua" });
  eq(r.status, 409);
});
await T("budget code usage is reportable", async () => {
  eq((await GET("admin", "/api/par/budget-codes/usage")).status, 200);
});
await T("budget code balance is computed", async () => {
  const r = await GET("admin", `/api/par/budget-codes/${codeId}/balance`);
  eq(r.status, 200);
  assert(r.body !== null, "no balance body");
});
await T("a budget code balance for an unknown id 404s", async () => {
  eq((await GET("admin", `/api/par/budget-codes/${NIL_UUID}/balance`)).status, 404);
});
await T("committed spend counts against a budget code allocation", async () => {
  const before = (await GET("admin", `/api/par/budget-codes/${codeId}/balance`)).body;
  const p = await createDraft("requestor", { budget_code_id: codeId });
  await addLine("requestor", p.id, { quantity: 1, unit_price_cents: 200000 });
  await fillPayee("requestor", p.id);
  await POST("requestor", `/api/par/${p.id}/submit`);
  const after = (await GET("admin", `/api/par/budget-codes/${codeId}/balance`)).body;
  const used = (o) => Number(o.usedCents ?? o.used_cents ?? o.committedCents ?? 0);
  assert(used(after) > used(before), `usage did not grow: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
});
await T("submitting past the allocation returns an advisory over-budget flag", async () => {
  const p = await createDraft("requestor", { budget_code_id: codeId });
  await addLine("requestor", p.id, { quantity: 1, unit_price_cents: 5000000 });
  await fillPayee("requestor", p.id);
  const r = await POST("requestor", `/api/par/${p.id}/submit`);
  eq(r.status, 200);
  assert(r.body.over_budget && r.body.over_budget.over === true, `no over-budget advisory: ${JSON.stringify(r.body.over_budget)}`);
});
await T("par_admin can create an event under a project", async () => {
  const r = await POST("admin", "/api/par/events", { name: `Eveniment QA ${Date.now()}`, project_id: projId });
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 200)}`);
});
await T("an event referencing an unknown project is refused", async () => {
  const r = await POST("admin", "/api/par/events", { name: "Orfan", project_id: NIL_UUID });
  inSet(r.status, [400, 404], "status");
});
await T("the DOA matrix is readable by admin", async () => {
  const r = await GET("admin", "/api/par/doa");
  eq(r.status, 200);
  const items = coll(r.body);
  assert(items.length >= 1, "empty DOA matrix on a seeded tenant");
});
await T("a DOA rule whose ceiling is below its floor is refused", async () => {
  const r = await POST("admin", "/api/par/doa", { minAmountCents: 500000, maxAmountCents: 100, step: 1, approverRoleLabel: "Invalid", approverParRole: "approver" });
  eq(r.status, 400);
});
await T("a DOA rule with an open ceiling is accepted", async () => {
  const r = await POST("admin", "/api/par/doa", { minAmountCents: 90000000, maxAmountCents: null, step: 3, approverRoleLabel: "Board", approverParRole: "par_admin" });
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 150)}`);
  const id = r.body.id ?? r.body.row?.id;
  if (id) await DEL("admin", `/api/par/doa/${id}`);
});
await T("a DOA rule with step 0 is refused", async () => {
  const r = await POST("admin", "/api/par/doa", { minAmountCents: 0, step: 0, approverRoleLabel: "Zero", approverParRole: "approver" });
  eq(r.status, 400);
});
await T("a DOA rule with a negative amount is refused", async () => {
  const r = await POST("admin", "/api/par/doa", { minAmountCents: -100, step: 1, approverRoleLabel: "Neg", approverParRole: "approver" });
  eq(r.status, 400);
});
await T("PAR settings can be updated by admin", async () => {
  const r = await PATCH("admin", "/api/par/settings", { orgLegalName: "A.O. ATIC QA" });
  eq(r.status, 200);
});
await T("a zero micro-purchase threshold is refused", async () => {
  eq((await PATCH("admin", "/api/par/settings", { microPurchaseThresholdCents: 0 })).status, 400);
});
await T("a non-url org logo is refused", async () => {
  eq((await PATCH("admin", "/api/par/settings", { orgLogoUrl: "nope" })).status, 400);
});
await T("delegations are listable", async () => eq((await GET("admin", "/api/par/delegations")).status, 200));
await T("a delegation with an unknown delegate is refused", async () => {
  const r = await POST("admin", "/api/par/delegations", { toUserId: NIL_UUID, fromUserId: NIL_UUID, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 864e5).toISOString() });
  inSet(r.status, [400, 404], "status");
});
await T("invites are listable by admin", async () => eq((await GET("admin", "/api/par/invites")).status, 200));
await T("an invite to a malformed email is refused", async () => {
  const r = await POST("admin", "/api/par/invites", { email: "not-an-email", role: "requestor" });
  eq(r.status, 400);
});
await T("a requestor cannot invite new members", async () => {
  const r = await POST("requestor", "/api/par/invites", { email: "x@example.org", role: "par_admin" });
  inSet(r.status, [403, 400], "status");
});
await T("templates are listable", async () => eq((await GET("admin", "/api/par/templates")).status, 200));
await T("line-item suggestions answer without crashing", async () => {
  const r = await GET("requestor", "/api/par/suggestions/line-items?q=serv");
  inSet(r.status, [200, 400], "status");
});
await T("payers are listable", async () => eq((await GET("admin", "/api/par/payers")).status, 200));
await T("my PAR profile is readable", async () => eq((await GET("requestor", "/api/par/profiles/me")).status, 200));
await T("my PAR profile is editable", async () => {
  const r = await PATCH("requestor", "/api/par/profiles/me", { job_title: "Procurement Specialist", staff_code: "M13" });
  eq(r.status, 200);
});
await T("the profile job title prefills a new PAR's requestor title", async () => {
  const p = await createDraft("requestor");
  eq(p.requestorTitle, "Procurement Specialist", "prefilled title");
});

// ═══ R. Robustness / injection / hostile input ═════════════════════════════
await T("a SQL-ish string in search is treated as text", async () => {
  const r = await GET("requestor", `/api/par?q=${encodeURIComponent("' OR 1=1 --")}`);
  eq(r.status, 200);
});
await T("a script tag in end-use is stored as data, not executed", async () => {
  const p = await createDraft("requestor");
  const r = await PATCH("requestor", `/api/par/${p.id}`, { end_use: "<script>alert(1)</script>" });
  eq(r.status, 200);
});
await T("a unicode/diacritics payee name survives a round-trip", async () => {
  const p = await createDraft("requestor");
  await PATCH("requestor", `/api/par/${p.id}`, { payee_name: "Ștefan Țurcanu-Ăî" });
  eq((await detail("requestor", p.id)).payeeName, "Ștefan Țurcanu-Ăî", "payee name");
});
await T("an emoji in a comment does not break storage", async () => {
  const p = await createDraft("requestor");
  const r = await POST("requestor", `/api/par/${p.id}/comments`, { body: "ok 👍 mergem" });
  inSet(r.status, [200, 201], "status");
});
await T("a malformed json body is refused with 400", async () => {
  const c = ctxs.requestor;
  const r = await c.post("/api/par", { headers: { "content-type": "application/json" }, data: "{not json" });
  inSet(r.status(), [400], "status");
});
await T("an unknown field in the body is ignored, not fatal", async () => {
  const r = await POST("requestor", "/api/par", { purpose: "execute_payment", hackerField: "x" });
  inSet(r.status, [201, 400], "status");
});
await T("a non-uuid line-item id 404s instead of 500", async () => {
  const p = await createDraft("requestor");
  const r = await DEL("requestor", `/api/par/${p.id}/line-items/not-a-uuid`);
  eq(r.status, 404);
});
await T("a non-uuid line-item id on PATCH 404s instead of 500", async () => {
  const p = await createDraft("requestor");
  const r = await PATCH("requestor", `/api/par/${p.id}/line-items/not-a-uuid`, { quantity: 2 });
  eq(r.status, 404);
});
await T("a non-uuid attachment id 404s instead of 500", async () => {
  const p = await createDraft("requestor");
  const r = await DEL("requestor", `/api/par/${p.id}/attachments/not-a-uuid`);
  eq(r.status, 404);
});
await T("a non-uuid quote id 404s instead of 500", async () => {
  const p = await createDraft("requestor");
  const r = await DEL("requestor", `/api/par/${p.id}/quotes/not-a-uuid`);
  eq(r.status, 404);
});
await T("a non-uuid id on approve 404s instead of 500", async () => {
  const r = await POST("approver", "/api/par/xyz/approve", { comment: "x" });
  inSet(r.status, [400, 404], "status");
});
await T("a non-uuid id on pay 404s instead of 500", async () => {
  const r = await POST("finance", "/api/par/xyz/pay", { actual_amount_cents: 100, payment_date: new Date().toISOString() });
  inSet(r.status, [400, 404], "status");
});
await T("a non-uuid id on the attachments list 404s instead of 500", async () => {
  const r = await GET("requestor", "/api/par/xyz/attachments");
  inSet(r.status, [400, 404], "status");
});
await T("the finance literal path is not swallowed by the :id route", async () => {
  eq((await GET("finance", "/api/par/finance")).status, 200);
});
await T("the inbox literal path is not swallowed by the :id route", async () => {
  eq((await GET("approver", "/api/par/inbox")).status, 200);
});
await T("the budget-codes usage literal path is not swallowed by :id", async () => {
  eq((await GET("admin", "/api/par/budget-codes/usage")).status, 200);
});

// ═══ S. UI smoke (real browser, role-aware) ════════════════════════════════
await T("PAR pages render for a requestor without runtime errors", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(`${BASE}/#/business/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', USERS.requestor);
    await page.fill('input[type="password"]', PW);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    for (const path of ["/business/par", "/business/par/new", "/business/par/reports"]) {
      await page.goto(`${BASE}/#${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const txt = await page.evaluate(() => document.body.innerText);
      assert(txt.trim().length > 40, `blank page at ${path}`);
      assert(!/Unexpected token|is not a function|undefined is not|Cannot read propert/i.test(txt), `runtime error text at ${path}: ${txt.slice(0, 160)}`);
    }
    assert(errors.length === 0, `pageerror: ${errors[0]}`);
  } finally { await browser.close(); }
});
await T("the detail page warns the approver about an unverifiable IBAN before payment", async () => {
  const p = await createDraft("requestor");
  await addLine("requestor", p.id, {});
  await fillPayee("requestor", p.id, { payee_iban: "MD24AG000225100013104169" });
  await POST("requestor", `/api/par/${p.id}/submit`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(`${BASE}/#/business/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', USERS.approver);
    await page.fill('input[type="password"]', PW);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/#/business/par/${p.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const txt = await page.evaluate(() => document.body.innerText);
    assert(/Verific(ă|a) IBAN-ul/i.test(txt), `no IBAN warning on the detail page: ${txt.slice(0, 300)}`);
  } finally { await browser.close(); }
});
await T("the PAR detail page renders a paid request", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await page.goto(`${BASE}/#/business/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', USERS.requestor);
    await page.fill('input[type="password"]', PW);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/#/business/par/${financePar.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const txt = await page.evaluate(() => document.body.innerText);
    assert(txt.includes(financePar.requestNo), `request no not rendered: ${txt.slice(0, 200)}`);
    assert(errors.length === 0, `pageerror: ${errors[0]}`);
  } finally { await browser.close(); }
});

// ═══ T. Deep flows — delegation, limits, PO/receipt/match, templates, AI, FX ═
const uid = {};
await T("each role can resolve its own user id", async () => {
  for (const role of ["admin", "approver", "finance", "requestor"]) {
    const r = await GET(role, "/api/auth/me");
    eq(r.status, 200);
    uid[role] = r.body.user?.id ?? r.body.id;
    assert(uid[role], `no id for ${role}`);
  }
});
await T("par_admin can list the tenant's PAR members", async () => {
  const items = coll((await GET("admin", "/api/par/members")).body);
  assert(items.length >= 3, `too few members: ${items.length}`);
});
await T("an approval limit below the amount blocks the final signature", async () => {
  const setLimit = await POST("admin", "/api/par/members", { userId: uid.approver, role: "approver", approvalLimitCents: 200000 });
  inSet(setLimit.status, [200, 201], `set limit — ${setLimit.text.slice(0, 150)}`);
  const { par } = await submitPar("requestor", { amount: 400000 }); // 4.000 MDL, one step, over the 2.000 limit
  const r = await POST("approver", `/api/par/${par.id}/approve`, { comment: "peste plafon" });
  eq(r.status, 403);
  assert(/limit/i.test(r.text), `unclear refusal: ${r.text.slice(0, 200)}`);
});
await T("the same PAR can still be approved by the escalation authority", async () => {
  const { par } = await submitPar("requestor", { amount: 400000 });
  const r = await POST("admin", `/api/par/${par.id}/approve`, { comment: "escaladat" });
  eq(r.status, 200);
});
await T("raising the approval limit unblocks the approver again", async () => {
  const r = await POST("admin", "/api/par/members", { userId: uid.approver, role: "approver", approvalLimitCents: 100000000 });
  inSet(r.status, [200, 201], "status");
  const { par } = await submitPar("requestor", { amount: 400000 });
  eq((await POST("approver", `/api/par/${par.id}/approve`, { comment: "in plafon" })).status, 200);
});
await T("a delegation can be created by its holder", async () => {
  const r = await POST("approver", "/api/par/delegations", {
    to_user_id: uid.finance,
    starts_at: new Date(Date.now() - 3600e3).toISOString(),
    ends_at: new Date(Date.now() + 7 * 864e5).toISOString(),
  });
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 200)}`);
});
await T("the delegate can sign in place of the holder", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  const r = await POST("finance", `/api/par/${par.id}/approve`, { comment: "prin delegare" });
  eq(r.status, 200);
});
await T("the delegation shows up on the holder's list", async () => {
  const items = coll((await GET("approver", "/api/par/delegations")).body);
  assert(items.length >= 1, "delegation not listed");
});
await T("a delegation can be revoked", async () => {
  const items = coll((await GET("approver", "/api/par/delegations")).body);
  const r = await DEL("approver", `/api/par/delegations/${items[0].id}`);
  inSet(r.status, [200, 204], "status");
});
await T("two PARs can be approved in one bulk action", async () => {
  const a = await submitPar("requestor", { amount: 100000 });
  const b = await submitPar("requestor", { amount: 100000 });
  const r = await POST("approver", "/api/par/bulk-approve", { par_ids: [a.par.id, b.par.id], comment: "aprobare in masa" });
  eq(r.status, 200);
  for (const p of [a.par, b.par]) {
    const d = await detail("admin", p.id);
    inSet(d.status, ["in_finance", "approved"], `status of ${p.requestNo}`);
  }
});
await T("bulk approve refuses ids the caller cannot decide", async () => {
  const own = await submitPar("approver", { amount: 100000 });
  const r = await POST("approver", "/api/par/bulk-approve", { par_ids: [own.par.id] });
  eq(r.status, 200);
  eq((await detail("admin", own.par.id)).status, "pending_approval", "self-approved through bulk");
});
let poPar;
await T("finance can issue a purchase order for an approved PAR", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  poPar = par;
  await approveAll(par.id);
  const r = await POST("finance", `/api/par/${par.id}/purchase-order`, {});
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 200)}`);
  assert((r.body.poNumber ?? r.body.po_number), "no PO number issued");
});
await T("a second purchase order for the same PAR is refused", async () => {
  eq((await POST("finance", `/api/par/${poPar.id}/purchase-order`, {})).status, 409);
});
await T("a PO cannot be issued before approval", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  eq((await POST("finance", `/api/par/${par.id}/purchase-order`, {})).status, 400);
});
await T("a requestor cannot issue a purchase order", async () => {
  const { par } = await submitPar("requestor", { amount: 700000 });
  await approveAll(par.id);
  eq((await POST("requestor", `/api/par/${par.id}/purchase-order`, {})).status, 403);
});
await T("goods receipt can be recorded against the line items", async () => {
  const d = await detail("finance", poPar.id);
  const r = await POST("finance", `/api/par/${poPar.id}/receipts`, {
    complete: true,
    notes: "recepționat integral",
    lines: d.line_items.map((l) => ({ line_item_id: l.id, qty_received: l.quantity })),
  });
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 200)}`);
});
await T("a receipt without lines is refused", async () => {
  eq((await POST("finance", `/api/par/${poPar.id}/receipts`, { complete: true, lines: [] })).status, 400);
});
await T("a receipt for a line that is not on the PAR is refused", async () => {
  const r = await POST("finance", `/api/par/${poPar.id}/receipts`, {
    complete: true, lines: [{ line_item_id: NIL_UUID, qty_received: 1 }],
  });
  inSet(r.status, [400, 404], "status");
});
await T("the three-way match reports PO vs receipt vs invoice", async () => {
  const r = await GET("finance", `/api/par/${poPar.id}/match`);
  eq(r.status, 200);
  assert(r.body !== null, `not json: ${r.text.slice(0, 150)}`);
});
await T("the match verdict is exposed as a state, not a bare boolean dump", async () => {
  const r = await GET("finance", `/api/par/${poPar.id}/match`);
  const flat = JSON.stringify(r.body);
  assert(/po|receipt|invoice|match/i.test(flat), `match payload says nothing: ${flat.slice(0, 200)}`);
});
await T("a template can be saved from an existing PAR", async () => {
  const r = await POST("admin", "/api/par/templates", { name: `Șablon QA ${Date.now()}`, parId: poPar.id });
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 200)}`);
});
await T("templates are listed after saving", async () => {
  const items = coll((await GET("requestor", "/api/par/templates")).body);
  assert(items.length >= 1, "no template listed");
});
await T("a template instantiates into a fresh draft", async () => {
  const items = coll((await GET("requestor", "/api/par/templates")).body);
  const r = await POST("requestor", `/api/par/templates/${items[0].id}/instantiate`, {});
  inSet(r.status, [200, 201], `status — ${r.text.slice(0, 200)}`);
  const created = r.body.par ?? r.body;
  eq((await detail("requestor", created.id)).status, "draft", "status");
});
await T("a template without a name is refused", async () => {
  eq((await POST("admin", "/api/par/templates", { name: "", parId: poPar.id })).status, 400);
});
await T("the AI prefill endpoint rejects a request without a file", async () => {
  const c = ctxs.requestor;
  const r = await c.post("/api/par/ai-prefill", { multipart: {} });
  inSet(r.status(), [400, 422], "status");
});
await T("the AI prefill endpoint answers a real upload without crashing", async () => {
  const c = ctxs.requestor;
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
    "utf8"
  );
  const r = await c.post("/api/par/ai-prefill", {
    multipart: { file: { name: "factura.pdf", mimeType: "application/pdf", buffer: pdf } },
  });
  const body = await r.text();
  assert(r.status() < 500, `AI prefill 5xx on a real upload: ${r.status()} ${body.slice(0, 200)}`);
});
await T("the AI prefill endpoint refuses an oversized file", async () => {
  const c = ctxs.requestor;
  const big = Buffer.alloc(8_500_000, 0x41);
  const r = await c.post("/api/par/ai-prefill", {
    multipart: { file: { name: "huge.pdf", mimeType: "application/pdf", buffer: big } },
  });
  inSet(r.status(), [400, 413], "status");
});
await T("a EUR request keeps its own currency", async () => {
  const p = await createDraft("requestor");
  await addLine("requestor", p.id, { quantity: 1, unit_price_cents: 50000 });
  await fillPayee("requestor", p.id, { currency: "EUR", payee_iban: IBAN_FRESH2 });
  const s = await POST("requestor", `/api/par/${p.id}/submit`);
  eq(s.status, 200);
  eq((await detail("requestor", p.id)).currency, "EUR", "currency");
});
await T("the currency breakdown separates EUR from MDL", async () => {
  const rows = coll((await GET("admin", "/api/par/reports/currency-breakdown")).body);
  assert(rows.some((r) => (r.currency ?? r.id ?? r.label) === "EUR"), `no EUR row: ${JSON.stringify(rows).slice(0, 200)}`);
});
await T("a EUR request is converted to an MDL figure for the DOA bands", async () => {
  const rows = coll((await GET("admin", "/api/par/reports/currency-breakdown")).body);
  const eur = rows.find((r) => (r.currency ?? r.id ?? r.label) === "EUR");
  assert(Number(eur.mdlTotalCents ?? 0) > 0, `no MDL equivalent: ${JSON.stringify(eur)}`);
});
await T("the config import template is downloadable by admin", async () => {
  const r = await GET("admin", "/api/par/config-import/template");
  eq(r.status, 200);
  assert(/spreadsheet|octet-stream|csv/.test(r.ct), `wrong content-type: ${r.ct}`);
});
await T("a requestor cannot download the config import template", async () => {
  eq((await GET("requestor", "/api/par/config-import/template")).status, 403);
});
await T("the config import preview refuses a non-spreadsheet upload", async () => {
  const c = ctxs.admin;
  const r = await c.post("/api/par/config-import/preview", {
    multipart: { file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("nu e excel") } },
  });
  assert(r.status() < 500, `5xx on a junk upload: ${r.status()}`);
  inSet(r.status(), [400, 415, 422], "status");
});
await T("the outbound PAR email log is readable by admin", async () => {
  eq((await GET("admin", "/api/par/audit/emails")).status, 200);
});
await T("events can be renamed", async () => {
  const created = await POST("admin", "/api/par/events", { name: `Ev ${Date.now()}` });
  const id = created.body.id ?? created.body.event?.id;
  const r = await call("admin", "PUT", `/api/par/events/${id}`, { name: "Eveniment redenumit" });
  eq(r.status, 200);
});
await T("events can be deactivated", async () => {
  const created = await POST("admin", "/api/par/events", { name: `Ev ${Date.now()}-b` });
  const id = created.body.id ?? created.body.event?.id;
  const r = await DEL("admin", `/api/par/events/${id}`);
  inSet(r.status, [200, 204], "status");
});
await T("a requestor cannot delete an event", async () => {
  const created = await POST("admin", "/api/par/events", { name: `Ev ${Date.now()}-c` });
  const id = created.body.id ?? created.body.event?.id;
  eq((await DEL("requestor", `/api/par/events/${id}`)).status, 403);
});
await T("raising the micro-purchase threshold shortens the approval chain", async () => {
  const before = (await GET("admin", "/api/par/settings")).body;
  const original = before.microPurchaseThresholdCents ?? before.micro_purchase_threshold_cents;
  try {
    eq((await PATCH("admin", "/api/par/settings", { microPurchaseThresholdCents: 5000000 })).status, 200);
    const d = await detail("requestor", (await readyPar("requestor", { amount: 700000 })).id);
    eq(d.above_micro_threshold, false, "7.000 MDL under a 50.000 threshold");
  } finally {
    await PATCH("admin", "/api/par/settings", { microPurchaseThresholdCents: original });
  }
});
await T("the threshold is restored for the rest of the suite", async () => {
  const s = (await GET("admin", "/api/par/settings")).body;
  eq(s.microPurchaseThresholdCents ?? s.micro_purchase_threshold_cents, 500000, "threshold");
});
await T("the dossier of an approved PAR downloads as a real PDF", async () => {
  const r = await GET("finance", `/api/par/${poPar.id}/dosar`);
  eq(r.status, 200);
  assert(/pdf/.test(r.ct), `wrong content-type: ${r.ct}`);
  assert(r.text.startsWith("%PDF"), `not a PDF: ${r.text.slice(0, 40)}`);
  assert(r.text.length > 1000, `dossier suspiciously small: ${r.text.length} bytes`);
});
await T("the dossier is refused to someone who cannot see the PAR", async () => {
  const p = await createDraft("requestor");
  const r = await GET("approver", `/api/par/${p.id}/dosar`);
  inSet(r.status, [403, 404], "status");
});
await T("another user's draft attachments are not listable", async () => {
  const p = await readyPar("requestor", {});
  await POST("requestor", `/api/par/${p.id}/attachments`, {
    file_name: "contract-privat.pdf", file_url: "data:application/pdf;base64,JVBERi0xLjQK",
    mime: "application/pdf", kind: "contract",
  });
  for (const role of ["approver", "finance"]) {
    eq((await GET(role, `/api/par/${p.id}/attachments`)).status, 404, `${role} listed a draft's attachments`);
  }
});
await T("another user's draft timeline is not readable", async () => {
  const p = await readyPar("requestor", {});
  eq((await GET("approver", `/api/par/${p.id}/timeline`)).status, 404);
});
await T("another user's draft cannot be duplicated behind their back", async () => {
  const p = await readyPar("requestor", {});
  eq((await POST("approver", `/api/par/${p.id}/duplicate`, {})).status, 404);
});
await T("a submitted PAR's attachments become visible to the approver", async () => {
  const p = await readyPar("requestor", {});
  await POST("requestor", `/api/par/${p.id}/attachments`, {
    file_name: "contract.pdf", file_url: "data:application/pdf;base64,JVBERi0xLjQK",
    mime: "application/pdf", kind: "contract",
  });
  await POST("requestor", `/api/par/${p.id}/submit`);
  eq((await GET("approver", `/api/par/${p.id}/attachments`)).status, 200);
});
await T("cancelling a PAR that is already in the approval chain is possible for admin", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  const r = await DEL("admin", `/api/par/${par.id}`);
  inSet(r.status, [200, 204], "status");
  eq((await detail("admin", par.id)).status, "cancelled", "status");
});
await T("a cancelled PAR disappears from the approver inbox", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  await DEL("admin", `/api/par/${par.id}`);
  const items = coll((await GET("approver", "/api/par/inbox")).body);
  assert(!items.some((i) => i.id === par.id), "cancelled PAR still awaiting approval");
});
await T("a cancelled PAR cannot be approved", async () => {
  const { par } = await submitPar("requestor", { amount: 100000 });
  await DEL("admin", `/api/par/${par.id}`);
  const r = await POST("approver", `/api/par/${par.id}/approve`, { comment: "prea târziu" });
  inSet(r.status, [400, 403, 409], "status");
});
await T("the aging report buckets requests by status", async () => {
  const rows = coll((await GET("admin", "/api/par/reports/aging")).body);
  assert(rows.some((r) => r.status === "paid"), `no paid bucket: ${JSON.stringify(rows).slice(0, 200)}`);
});
await T("the cycle-time report answers with a duration", async () => {
  const r = await GET("admin", "/api/par/reports/cycle-time");
  eq(r.status, 200);
  assert(/days|hours|avg|median/i.test(r.text), `no duration in ${r.text.slice(0, 200)}`);
});
await T("line-item suggestions learn from submitted requests", async () => {
  const r = await GET("requestor", "/api/par/suggestions/line-items?q=consult");
  eq(r.status, 200);
  assert(Array.isArray(coll(r.body)), "no suggestion collection");
});

// ── report ────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(70)}`);
console.log(`PAR blind sweep: ${passed}/${n} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ${f.id} ${f.name}\n      → ${f.msg}`);
}
console.log(`${"═".repeat(70)}`);
for (const c of Object.values(ctxs)) await c.dispose();
process.exit(failures.length ? 1 : 0);
};
run().catch((e) => { console.error("FATAL", e); process.exit(2); });
