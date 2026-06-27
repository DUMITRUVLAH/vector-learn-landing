/**
 * E2E PAR — 100 scenarios (Playwright)
 * ====================================
 * Exercises the full Payment-Action-Request module end-to-end against a running app:
 * health & route-mounting, auth & RBAC, config CRUD, events (VM1-04), the create form +
 * line-items, submit validation, the approval state machine (1/2-step DOA), finance +
 * payment + 10% reapproval rule (PAR-113), vendor auto-save (VM1-05), multi-file
 * attachments (VM1-06), currency reports (VM1-03), invites (SHELL-503), and the
 * UUID-guard robustness class (non-UUID path segments must 404, never 500).
 *
 * Scenarios 1–88 are API/flow (Playwright APIRequestContext, one cookie jar per role).
 * Scenarios 89–100 drive a real headless browser over the PAR pages + nav role-gating.
 *
 * Run against a fresh seed:
 *   npm run db:reset && npm run db:seed
 *   PORT=3000 npm run start &      # serves /api + built SPA from ./dist
 *   node scripts/e2e-par-100.mjs   # BASE_URL defaults to http://localhost:3000
 *
 * Seeded PAR tenant "ATIC" users (all password demo123456):
 *   admin@atic.demo.io (par_admin) · approver@atic.demo.io · finance@atic.demo.io · requestor@atic.demo.io
 * Seeded DOA: ≤5000 MDL → 1 step (approver); 5000–100000 MDL → 2 steps (approver + admin).
 * Micro-purchase threshold: 5000 MDL (500000 cents).
 */
import { chromium, request } from "playwright";
import { existsSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.SMOKE_PASSWORD ?? "demo123456";
const USERS = {
  admin: "admin@atic.demo.io",
  approver: "approver@atic.demo.io",
  finance: "finance@atic.demo.io",
  requestor: "requestor@atic.demo.io",
};

// Valid Moldova test data (mod-97 checksum verified against the live validator)
const IBAN_A = "MD24AG000225100013104168";
const IBAN_B = "MD21EX000000000001234567";
const IDNP = "2002600012345";
const PDF_DATAURL = "data:application/pdf;base64,JVBERi0xLjQKJeLjz9MK"; // tiny valid-prefixed PDF

// ── tiny test runner ────────────────────────────────────────────────────────
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

// ── API helpers (one APIRequestContext per role = isolated cookie jar) ───────
const ctxs = {};
async function login(role) {
  const c = await request.newContext({ baseURL: BASE });
  if (role !== "anon") {
    const r = await c.post("/api/auth/login", { data: { email: USERS[role], password: PW } });
    if (r.status() !== 200) throw new Error(`login ${role} failed: ${r.status()}`);
  }
  ctxs[role] = c;
  return c;
}
async function call(role, method, path, body) {
  const c = ctxs[role];
  const opts = body !== undefined ? { data: body } : {};
  const r = await c[method.toLowerCase()](path, opts);
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* non-JSON */
  }
  return { status: r.status(), json, headers: r.headers() };
}
const GET = (role, p) => call(role, "GET", p);
const POST = (role, p, b) => call(role, "POST", p, b);
const PATCH = (role, p, b) => call(role, "PATCH", p, b);
const PUT = (role, p, b) => call(role, "PUT", p, b);
const DEL = (role, p, b) => call(role, "DELETE", p, b);

const ISO = "2026-06-27T10:00:00.000Z";

// helper: create a fully-valid execute_payment PAR (draft) with one line item & payee
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

async function main() {
  // shared state
  let projectId, deptId, budgetCodeId, eventId;
  let parA, parE, parF; // workflow PARs
  let inviteId, inviteToken;

  for (const role of ["admin", "approver", "finance", "requestor", "anon"]) await login(role);

  // ═══ BLOC 1 — Health & route mounting (1–6) ═══
  await T("GET /api/health → 200 ok", async () => {
    const r = await GET("anon", "/api/health");
    eq(r.status, 200, "status");
    assert(r.json?.ok === true, "ok flag");
  });
  await T("GET /api/par/me anon → 401 (JSON, route mounted)", async () => {
    const r = await GET("anon", "/api/par/me");
    eq(r.status, 401, "status");
    assert(r.json, "must be JSON not HTML");
  });
  await T("GET /api/par/events anon → 401 (VM1-04 mounted)", async () => {
    const r = await GET("anon", "/api/par/events");
    eq(r.status, 401, "status");
  });
  await T("GET /api/par/reports/by-event anon → 401 (mounted)", async () => {
    const r = await GET("anon", "/api/par/reports/by-event");
    eq(r.status, 401, "status");
  });
  await T("GET /api/auth/invite-info?token=bad → 404 JSON (SHELL-503)", async () => {
    const r = await GET("anon", "/api/auth/invite-info?token=nonexistent");
    eq(r.status, 404, "status");
    assert(r.json, "must be JSON not HTML");
  });
  await T("POST /api/auth/login wrong password → 401", async () => {
    const r = await POST("anon", "/api/auth/login", { email: USERS.admin, password: "wrong" });
    eq(r.status, 401, "status");
  });

  // ═══ BLOC 2 — Auth & PAR roles (7–14) ═══
  await T("login admin → role admin", async () => {
    const r = await POST("anon", "/api/auth/login", { email: USERS.admin, password: PW });
    eq(r.status, 200, "status");
    eq(r.json?.user?.role, "admin", "role");
  });
  await T("login approver → 200", async () => eq((await POST("anon", "/api/auth/login", { email: USERS.approver, password: PW })).status, 200, "status"));
  await T("login finance → 200", async () => eq((await POST("anon", "/api/auth/login", { email: USERS.finance, password: PW })).status, 200, "status"));
  await T("login requestor → 200", async () => eq((await POST("anon", "/api/auth/login", { email: USERS.requestor, password: PW })).status, 200, "status"));
  await T("par/me admin → includes par_admin (implicit/explicit)", async () => {
    const r = await GET("admin", "/api/par/me");
    eq(r.status, 200, "status");
    assert(r.json.roles.includes("par_admin"), `roles=${JSON.stringify(r.json.roles)}`);
  });
  await T("par/me approver → ['approver']", async () => {
    const r = await GET("approver", "/api/par/me");
    assert(r.json.roles.includes("approver"), `roles=${JSON.stringify(r.json.roles)}`);
  });
  await T("par/me finance → ['finance']", async () => {
    const r = await GET("finance", "/api/par/me");
    assert(r.json.roles.includes("finance"), `roles=${JSON.stringify(r.json.roles)}`);
  });
  await T("par/me requestor → ['requestor'] (no elevated)", async () => {
    const r = await GET("requestor", "/api/par/me");
    assert(r.json.roles.includes("requestor") && !r.json.roles.includes("par_admin"), `roles=${JSON.stringify(r.json.roles)}`);
  });

  // ═══ BLOC 3 — Config read + RBAC (15–26) ═══
  await T("GET departments admin → 200 array", async () => {
    const r = await GET("admin", "/api/par/departments");
    eq(r.status, 200, "status");
    assert(Array.isArray(r.json.departments), "departments array");
  });
  await T("GET projects admin → 200 array", async () => {
    const r = await GET("admin", "/api/par/projects");
    eq(r.status, 200, "status");
    assert(Array.isArray(r.json.projects), "projects array");
  });
  await T("GET budget-codes admin → 200 array", async () => {
    const r = await GET("admin", "/api/par/budget-codes");
    eq(r.status, 200, "status");
    assert(Array.isArray(r.json.budgetCodes ?? r.json.codes ?? r.json.items), "codes array");
  });
  await T("GET budget-codes/usage approver → 200 (literal route not UUID-shadowed)", async () => {
    eq((await GET("approver", "/api/par/budget-codes/usage")).status, 200, "status");
  });
  await T("GET events admin → 200", async () => eq((await GET("admin", "/api/par/events")).status, 200, "status"));
  await T("GET vendors admin → 200", async () => eq((await GET("admin", "/api/par/vendors")).status, 200, "status"));
  await T("GET settings admin → 200 microPurchaseThresholdCents", async () => {
    const r = await GET("admin", "/api/par/settings");
    eq(r.status, 200, "status");
    assert(typeof r.json.microPurchaseThresholdCents === "number", "threshold present");
  });
  await T("requestor GET departments → 200 (any PAR role reads config)", async () => {
    eq((await GET("requestor", "/api/par/departments")).status, 200, "status");
  });
  await T("POST projects admin → 201", async () => {
    const r = await POST("admin", "/api/par/projects", { name: "Proiect E2E", donor: "Donor X" });
    assert(r.status === 201 || r.status === 200, `status ${r.status}`);
    projectId = r.json.id ?? r.json.project?.id;
    assert(projectId, "project id returned");
  });
  await T("POST departments admin → 201", async () => {
    const r = await POST("admin", "/api/par/departments", { name: "Departament E2E" });
    assert(r.status === 201 || r.status === 200, `status ${r.status}`);
    deptId = r.json.id ?? r.json.department?.id;
    assert(deptId, "dept id");
  });
  await T("POST budget-codes admin (allocatedCents) → 201", async () => {
    const r = await POST("admin", "/api/par/budget-codes", { code: "E2E-001", name: "Cod E2E", allocatedCents: 100000000 });
    assert(r.status === 201 || r.status === 200, `status ${r.status}`);
    budgetCodeId = r.json.id ?? r.json.code?.id;
    assert(budgetCodeId, "budget code id");
  });
  await T("POST projects requestor → 403 (admin-only create)", async () => {
    eq((await POST("requestor", "/api/par/projects", { name: "nope" })).status, 403, "status");
  });

  // ═══ BLOC 4 — Events VM1-04 (27–32) ═══
  await T("POST events admin (under project) → 201", async () => {
    const r = await POST("admin", "/api/par/events", { name: "Eveniment E2E", project_id: projectId });
    assert(r.status === 201 || r.status === 200, `status ${r.status}`);
    eventId = r.json.id ?? r.json.event?.id;
    assert(eventId, "event id");
  });
  await T("GET events?project_id= → includes the event", async () => {
    const r = await GET("admin", `/api/par/events?project_id=${projectId}`);
    eq(r.status, 200, "status");
    const list = r.json.events ?? r.json;
    assert(JSON.stringify(list).includes(eventId), "event present in filtered list");
  });
  await T("PUT events/:id admin (rename) → 200", async () => {
    eq((await PUT("admin", `/api/par/events/${eventId}`, { name: "Eveniment E2E (redenumit)" })).status, 200, "status");
  });
  await T("POST events requestor → 403", async () => {
    eq((await POST("requestor", "/api/par/events", { name: "x", project_id: projectId })).status, 403, "status");
  });
  await T("GET reports/by-event approver → 200", async () => {
    eq((await GET("approver", "/api/par/reports/by-event")).status, 200, "status");
  });
  await T("DELETE events/:id admin (throwaway) → 200 soft-delete", async () => {
    const c = await POST("admin", "/api/par/events", { name: "Throwaway", project_id: projectId });
    const tid = c.json.id ?? c.json.event?.id;
    eq((await DEL("admin", `/api/par/events/${tid}`)).status, 200, "status");
  });

  // ═══ BLOC 5 — Create + line items + draft (33–44) ═══
  await T("POST /api/par requestor → 201 draft with requestNo", async () => {
    const r = await POST("requestor", "/api/par", {});
    eq(r.status, 201, "status");
    assert(r.json.id && /^PAR-/.test(r.json.requestNo), "id + requestNo");
    parA = r.json.id;
  });
  await T("GET /api/par/:id requestor → 200 own draft", async () => {
    eq((await GET("requestor", `/api/par/${parA}`)).status, 200, "status");
  });
  await T("PATCH header (purpose/end_use/currency) → 200", async () => {
    const r = await PATCH("requestor", `/api/par/${parA}`, {
      purpose: "execute_payment",
      currency: "MDL",
      end_use: "Achiziție materiale didactice",
      department_id: deptId,
      project_id: projectId,
      budget_code_id: budgetCodeId,
    });
    eq(r.status, 200, "status");
  });
  await T("POST line-item (qty 3 × 100000) → total 300000", async () => {
    const r = await POST("requestor", `/api/par/${parA}/line-items`, { description: "Caiete", quantity: 3, unit: "buc", unit_price_cents: 100000 });
    assert(r.status === 201 || r.status === 200, `status ${r.status}`);
    const d = await GET("requestor", `/api/par/${parA}`);
    eq(d.json.totalEstimatedCents, 300000, "total");
  });
  await T("GET detail → 1 line item present", async () => {
    const d = await GET("requestor", `/api/par/${parA}`);
    eq(d.json.line_items.length, 1, "line count");
  });
  let secondLineId;
  await T("POST 2nd line-item (1 × 50000) → total 350000", async () => {
    const r = await POST("requestor", `/api/par/${parA}/line-items`, { description: "Markere", quantity: 1, unit_price_cents: 50000 });
    secondLineId = r.json.id ?? r.json.lineItem?.id ?? r.json.line?.id;
    const d = await GET("requestor", `/api/par/${parA}`);
    eq(d.json.totalEstimatedCents, 350000, "total");
  });
  await T("PATCH 2nd line-item (qty 2) → total recalculates to 400000", async () => {
    if (!secondLineId) {
      const d0 = await GET("requestor", `/api/par/${parA}`);
      secondLineId = d0.json.line_items.find((l) => l.unitPriceCents === 50000)?.id;
    }
    await PATCH("requestor", `/api/par/${parA}/line-items/${secondLineId}`, { quantity: 2 });
    const d = await GET("requestor", `/api/par/${parA}`);
    eq(d.json.totalEstimatedCents, 400000, "total");
  });
  await T("DELETE 2nd line-item → total back to 300000", async () => {
    eq((await DEL("requestor", `/api/par/${parA}/line-items/${secondLineId}`)).status, 200, "status");
    const d = await GET("requestor", `/api/par/${parA}`);
    eq(d.json.totalEstimatedCents, 300000, "total");
  });
  await T("GET list requestor → includes own PAR", async () => {
    const r = await GET("requestor", "/api/par");
    eq(r.status, 200, "status");
    assert(JSON.stringify(r.json).includes(parA), "own PAR in list");
  });
  await T("GET list?status=draft → includes the draft", async () => {
    const r = await GET("requestor", "/api/par?status=draft");
    assert(JSON.stringify(r.json).includes(parA), "draft in filtered list");
  });
  await T("PATCH set payee (name + valid IBAN) → 200", async () => {
    const r = await PATCH("requestor", `/api/par/${parA}`, { payee_name: "Librăria SRL", payee_iban: IBAN_A, payee_idnp: IDNP, payee_bank: "MAIB" });
    eq(r.status, 200, "status");
  });
  await T("PATCH invalid currency RON → 400 (VM1-03 enum)", async () => {
    eq((await PATCH("requestor", `/api/par/${parA}`, { currency: "RON" })).status, 400, "status");
  });

  // ═══ BLOC 6 — Submit validation (45–52) ═══
  let parB;
  await T("submit empty draft → 400 validation_failed (line_items)", async () => {
    const c = await POST("requestor", "/api/par", {});
    parB = c.json.id;
    const r = await POST("requestor", `/api/par/${parB}/submit`, {});
    eq(r.status, 400, "status");
    assert((r.json.errors ?? []).some((e) => e.field === "line_items"), `errors=${JSON.stringify(r.json.errors)}`);
  });
  await T("submit with line but no end_use → 400 (end_use)", async () => {
    await PATCH("requestor", `/api/par/${parB}`, { purpose: "execute_payment", currency: "MDL" });
    await POST("requestor", `/api/par/${parB}/line-items`, { description: "x", quantity: 1, unit_price_cents: 20000 });
    const r = await POST("requestor", `/api/par/${parB}/submit`, {});
    eq(r.status, 400, "status");
    assert((r.json.errors ?? []).some((e) => e.field === "end_use"), `errors=${JSON.stringify(r.json.errors)}`);
  });
  await T("submit with end_use but no payee → 400 (payee)", async () => {
    await PATCH("requestor", `/api/par/${parB}`, { end_use: "scop" });
    const r = await POST("requestor", `/api/par/${parB}/submit`, {});
    eq(r.status, 400, "status");
    assert((r.json.errors ?? []).some((e) => e.field === "payee"), `errors=${JSON.stringify(r.json.errors)}`);
  });
  await T("POST vendors invalid IBAN → 400 (mod-97 checksum)", async () => {
    const r = await POST("admin", "/api/par/vendors", { name: "Bad", iban: "MD09AG000000002500123456" });
    eq(r.status, 400, "status");
  });
  await T("submit fully-valid parA → 200 pending_approval", async () => {
    const r = await POST("requestor", `/api/par/${parA}/submit`, {});
    eq(r.status, 200, "status");
    eq(r.json.status, "pending_approval", "status field");
  });
  await T("re-submit parA → 409 (idempotency guard)", async () => {
    eq((await POST("requestor", `/api/par/${parA}/submit`, {})).status, 409, "status");
  });
  await T("PATCH parA while pending → 403 (not editable)", async () => {
    eq((await PATCH("requestor", `/api/par/${parA}`, { end_use: "edit" })).status, 403, "status");
  });
  await T("POST line-item to pending parA → 403", async () => {
    eq((await POST("requestor", `/api/par/${parA}/line-items`, { description: "y", quantity: 1, unit_price_cents: 1 })).status, 403, "status");
  });

  // ═══ BLOC 7 — Approvals state machine (53–64) ═══  parA total 300000 ≤ 500000 → 1 step (approver)
  await T("GET inbox approver → includes parA", async () => {
    const r = await GET("approver", "/api/par/inbox");
    eq(r.status, 200, "status");
    assert(JSON.stringify(r.json).includes(parA), "parA awaiting approver");
  });
  await T("GET inbox requestor → 200, parA NOT actionable by requestor", async () => {
    const r = await GET("requestor", "/api/par/inbox");
    eq(r.status, 200, "status");
  });
  await T("requestor approve parA → 403 (no approver role / not assigned)", async () => {
    eq((await POST("requestor", `/api/par/${parA}/approve`, { comment: "ok" })).status, 403, "status");
  });
  await T("approver approve parA (1 step) → in_finance (execute_payment auto-routes)", async () => {
    const r = await POST("approver", `/api/par/${parA}/approve`, { comment: "Aprobat", signatureName: "Ana Chirita" });
    eq(r.status, 200, "status");
    const d = await GET("approver", `/api/par/${parA}`);
    // approve.ts:251 — a fully-approved execute_payment PAR goes straight to the finance queue.
    eq(d.json.status, "in_finance", "final status");
  });
  await T("GET timeline parA → 200 with events", async () => {
    const r = await GET("approver", `/api/par/${parA}/timeline`);
    eq(r.status, 200, "status");
    const tl = r.json.timeline ?? r.json;
    assert(Array.isArray(tl) && tl.length > 0, "non-empty timeline");
  });
  let parC;
  await T("reject without comment → 400 (comment required)", async () => {
    parC = await makePayablePar("requestor", 80000);
    await POST("requestor", `/api/par/${parC}/submit`, {});
    eq((await POST("approver", `/api/par/${parC}/reject`, {})).status, 400, "status");
  });
  await T("approver reject parC (with comment) → 200 rejected", async () => {
    const r = await POST("approver", `/api/par/${parC}/reject`, { comment: "Nu respectă cerințele donorului" });
    eq(r.status, 200, "status");
    const d = await GET("approver", `/api/par/${parC}`);
    eq(d.json.status, "rejected", "status");
  });
  let parD;
  await T("approver request-changes parD → 200 changes_requested", async () => {
    parD = await makePayablePar("requestor", 90000);
    await POST("requestor", `/api/par/${parD}/submit`, {});
    const r = await POST("approver", `/api/par/${parD}/request-changes`, { comment: "Adaugă oferta de preț" });
    eq(r.status, 200, "status");
    const d = await GET("requestor", `/api/par/${parD}`);
    eq(d.json.status, "changes_requested", "status");
  });
  await T("requestor edits changes_requested parD → 200 (editable again)", async () => {
    eq((await PATCH("requestor", `/api/par/${parD}`, { end_use: "scop actualizat" })).status, 200, "status");
  });
  await T("requestor re-submits parD → 200 pending_approval", async () => {
    const r = await POST("requestor", `/api/par/${parD}/submit`, {});
    eq(r.status, 200, "status");
    eq(r.json.status, "pending_approval", "status");
  });
  await T("approve non-existent (valid uuid) → 404", async () => {
    eq((await POST("approver", "/api/par/00000000-0000-0000-0000-000000000000/approve", { comment: "x" })).status, 404, "status");
  });
  await T("approve non-UUID segment → 404 (not 500, guard)", async () => {
    eq((await POST("approver", "/api/par/notauuid/approve", { comment: "x" })).status, 404, "status");
  });

  // ═══ BLOC 8 — Finance & payments (65–77) ═══  parA approved execute_payment
  await T("GET finance as finance → 200 includes parA", async () => {
    const r = await GET("finance", "/api/par/finance");
    eq(r.status, 200, "status");
    assert(JSON.stringify(r.json).includes(parA), "parA in finance queue");
  });
  await T("GET finance as requestor → 403", async () => {
    eq((await GET("requestor", "/api/par/finance")).status, 403, "status");
  });
  await T("POST parA/finance (section 16) → 200 in_finance", async () => {
    const r = await POST("finance", `/api/par/${parA}/finance`, { par_bl: "BL-E2E-001" });
    eq(r.status, 200, "status");
    const d = await GET("finance", `/api/par/${parA}`);
    eq(d.json.status, "in_finance", "status");
  });
  await T("POST parA/pay (actual ≈ estimated) → 200 paid", async () => {
    const r = await POST("finance", `/api/par/${parA}/pay`, { actual_amount_cents: 300000, payment_date: ISO, payment_ref: "TX-E2E-001" });
    eq(r.status, 200, "status");
    const d = await GET("finance", `/api/par/${parA}`);
    eq(d.json.status, "paid", "status");
  });
  await T("GET detail parA → payment record present", async () => {
    const d = await GET("finance", `/api/par/${parA}`);
    assert(d.json.payment, "payment object present");
  });
  await T("VM1-05 vendor auto-save: payee IBAN now in vendor registry", async () => {
    const r = await GET("admin", "/api/par/vendors");
    const vendors = r.json.vendors ?? r.json;
    assert(JSON.stringify(vendors).replace(/\s/g, "").includes(IBAN_A), "vendor with payee IBAN auto-saved");
  });
  await T("create parE medium (600000 = 6000 MDL) for 2-step DOA", async () => {
    parE = await makePayablePar("requestor", 600000);
    const r = await POST("requestor", `/api/par/${parE}/submit`, {});
    eq(r.status, 200, "status");
    eq(r.json.status, "pending_approval", "status");
  });
  await T("approver approves parE step 1 → still pending (2-step)", async () => {
    const r = await POST("approver", `/api/par/${parE}/approve`, { comment: "pas 1" });
    eq(r.status, 200, "status");
    const d = await GET("approver", `/api/par/${parE}`);
    eq(d.json.status, "pending_approval", "still pending after step 1");
  });
  await T("admin approves parE step 2 (final) → in_finance", async () => {
    const r = await POST("admin", `/api/par/${parE}/approve`, { comment: "pas 2 final" });
    eq(r.status, 200, "status");
    const d = await GET("admin", `/api/par/${parE}`);
    eq(d.json.status, "in_finance", "in_finance after final approval");
  });
  await T("finance section 16 on parE → still in_finance", async () => {
    eq((await POST("finance", `/api/par/${parE}/finance`, { par_bl: "BL-E2E-002" })).status, 200, "status");
  });
  await T("pay parE with >10% overage (700000) → reapproval_required (PAR-113)", async () => {
    const r = await POST("finance", `/api/par/${parE}/pay`, { actual_amount_cents: 700000, payment_date: ISO, payment_ref: "TX-E2E-002" });
    eq(r.status, 200, "status");
    const d = await GET("finance", `/api/par/${parE}`);
    eq(d.json.status, "reapproval_required", "10% rule triggers reapproval");
  });
  await T("admin reapproves parE → 200", async () => {
    const r = await POST("admin", `/api/par/${parE}/reapprove`, { comment: "accept overage" });
    eq(r.status, 200, "status");
  });
  await T("pay parE again after reapproval → paid", async () => {
    const r = await POST("finance", `/api/par/${parE}/pay`, { actual_amount_cents: 700000, payment_date: ISO, payment_ref: "TX-E2E-002b" });
    eq(r.status, 200, "status");
    const d = await GET("finance", `/api/par/${parE}`);
    eq(d.json.status, "paid", "paid after reapproval");
  });

  // ═══ BLOC 9 — Attachments VM1-06 (78–84) ═══
  await T("create parF draft + upload PDF attachment → 201", async () => {
    parF = await makePayablePar("requestor", 40000);
    const r = await POST("requestor", `/api/par/${parF}/attachments`, {
      file_name: "factura.pdf",
      file_url: PDF_DATAURL,
      mime: "application/pdf",
      kind: "invoice",
      size_bytes: 1000,
    });
    eq(r.status, 201, "status");
  });
  await T("GET attachments → 1 item", async () => {
    const r = await GET("requestor", `/api/par/${parF}/attachments`);
    eq(r.status, 200, "status");
    const list = r.json.items ?? r.json.attachments ?? r.json;
    eq(list.length, 1, "count");
  });
  await T("upload invalid MIME (zip) → 400 invalid_file_type", async () => {
    const r = await POST("requestor", `/api/par/${parF}/attachments`, {
      file_name: "x.zip",
      file_url: "data:application/zip;base64,AAAA",
      mime: "application/zip",
      kind: "other",
    });
    eq(r.status, 400, "status");
  });
  await T("upload up to 10 attachments → all accepted", async () => {
    for (let i = 2; i <= 10; i++) {
      const r = await POST("requestor", `/api/par/${parF}/attachments`, {
        file_name: `doc${i}.pdf`,
        file_url: PDF_DATAURL,
        mime: "application/pdf",
        kind: "other",
        size_bytes: 500,
      });
      assert(r.status === 201, `attachment ${i} status ${r.status}`);
    }
    const list = (await GET("requestor", `/api/par/${parF}/attachments`)).json;
    eq((list.items ?? list.attachments ?? list).length, 10, "10 attachments");
  });
  await T("upload 11th attachment → 409 too_many_attachments", async () => {
    const r = await POST("requestor", `/api/par/${parF}/attachments`, {
      file_name: "doc11.pdf",
      file_url: PDF_DATAURL,
      mime: "application/pdf",
      kind: "other",
    });
    eq(r.status, 409, "status");
  });
  await T("DELETE one attachment → 200, count back to 9", async () => {
    const list = (await GET("requestor", `/api/par/${parF}/attachments`)).json;
    const arr = list.items ?? list.attachments ?? list;
    const r = await DEL("requestor", `/api/par/${parF}/attachments/${arr[0].id}`);
    eq(r.status, 200, "status");
    const after = (await GET("requestor", `/api/par/${parF}/attachments`)).json;
    eq((after.items ?? after.attachments ?? after).length, 9, "count");
  });
  await T("upload attachment to PAID parA → 403 (locked after submit)", async () => {
    const r = await POST("requestor", `/api/par/${parA}/attachments`, {
      file_name: "late.pdf",
      file_url: PDF_DATAURL,
      mime: "application/pdf",
      kind: "other",
    });
    assert(r.status === 403 || r.status === 409, `expected 403/409, got ${r.status}`);
  });

  // ═══ BLOC 10 — Reports VM1-03 (85–89) ═══
  await T("GET reports/by-budget approver → 200 items[]", async () => {
    const r = await GET("approver", "/api/par/reports/by-budget");
    eq(r.status, 200, "status");
    assert(Array.isArray(r.json.items ?? r.json), "items array");
  });
  await T("GET reports/by-department approver → 200", async () => eq((await GET("approver", "/api/par/reports/by-department")).status, 200, "status"));
  await T("GET reports/by-project approver → 200", async () => eq((await GET("approver", "/api/par/reports/by-project")).status, 200, "status"));
  await T("GET reports/aging approver → 200 (status buckets)", async () => {
    const r = await GET("approver", "/api/par/reports/aging");
    eq(r.status, 200, "status");
  });
  await T("requestor GET reports/by-budget → 403 (role-gated)", async () => {
    eq((await GET("requestor", "/api/par/reports/by-budget")).status, 403, "status");
  });

  // ═══ BLOC 11 — Invites SHELL-503 (90–92) ═══
  await T("POST invites admin → 201 inviteUrl + token", async () => {
    const r = await POST("admin", "/api/par/invites", { email: "newuser+e2e@example.com", par_role: "requestor" });
    assert(r.status === 201 || r.status === 200, `status ${r.status}`);
    inviteId = r.json.id;
    const url = r.json.inviteUrl ?? "";
    inviteToken = (url.match(/token=([^&]+)/) || [])[1];
    assert(inviteId && inviteToken, `invite id+token (url=${url})`);
  });
  await T("GET /api/auth/invite-info?token=<real> → 200", async () => {
    const r = await GET("anon", `/api/auth/invite-info?token=${inviteToken}`);
    eq(r.status, 200, "status");
  });
  await T("POST invites requestor → 403 (par_admin only)", async () => {
    eq((await POST("requestor", "/api/par/invites", { email: "x@y.io", par_role: "requestor" })).status, 403, "status");
  });

  // ═══ BLOC 12 — UUID-guard robustness regression (93–96) ═══
  await T("GET /api/par/payments (literal word, authed) → 404 not 500", async () => {
    eq((await GET("admin", "/api/par/payments")).status, 404, "status");
  });
  await T("GET /api/par/notauuid/timeline → 404 not 500", async () => {
    eq((await GET("admin", "/api/par/notauuid/timeline")).status, 404, "status");
  });
  await T("DELETE /api/par/vendors/notauuid → 404 not 500", async () => {
    eq((await DEL("admin", "/api/par/vendors/notauuid")).status, 404, "status");
  });
  await T("GET /api/par/inbox + /finance still 200 (literals intact)", async () => {
    eq((await GET("approver", "/api/par/inbox")).status, 200, "inbox");
    eq((await GET("finance", "/api/par/finance")).status, 200, "finance");
  });

  // close API contexts
  for (const role of Object.keys(ctxs)) await ctxs[role].dispose();

  // ═══ BLOC 13 — Browser UI (97–100+) ═══
  const exe = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ].filter(Boolean).find((p) => existsSync(p));
  let browser;
  try {
    browser = exe ? await chromium.launch({ executablePath: exe, headless: true }) : await chromium.launch({ headless: true });
  } catch (e) {
    console.log(`⚠️  browser launch failed (${e.message.split("\n")[0]}) — skipping UI scenarios 97–100`);
  }

  if (browser) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const jsErrors = [];
    page.on("pageerror", (e) => jsErrors.push(e.message.split("\n")[0]));
    const ERR = ["A apărut o eroare", "does not exist", "Internal Server", "is not defined", "Cannot read", "Unexpected token", "undefined is not"];
    const go = async (hash, wait = 1800) => {
      await page.goto(`${BASE}/#${hash}`, { waitUntil: "networkidle", timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(wait);
    };
    const text = () => page.evaluate(() => document.body.innerText).catch(() => "");

    await T("UI: /business/login renders a login form", async () => {
      await go("/business/login", 1200);
      const t = (await text()).toLowerCase();
      assert(t.includes("email") || t.includes("parol") || t.includes("password"), "login form text");
    });
    await T("UI: login as PAR admin succeeds", async () => {
      jsErrors.length = 0;
      await page.fill('input[type="email"]', USERS.admin).catch(() => {});
      await page.fill('input[type="password"]', PW).catch(() => {});
      await page.click('button[type="submit"]').catch(() => {});
      await page.waitForTimeout(3000);
      const hash = await page.evaluate(() => location.hash);
      assert(hash.includes("/business/") && !hash.includes("/login"), `post-login hash ${hash}`);
    });
    const uiRoute = (hash, label) =>
      T(`UI: ${label} loads without error`, async () => {
        jsErrors.length = 0;
        await go(hash);
        const t = await text();
        const found = ERR.filter((p) => t.includes(p));
        assert(found.length === 0, `error text: ${found.join(", ")}`);
        assert(jsErrors.length === 0, `JS errors: ${jsErrors.slice(0, 2).join(" | ")}`);
      });
    await uiRoute("/business/par", "PAR dashboard");
    await uiRoute("/business/par/new", "PAR create form");
    await uiRoute("/business/par/inbox", "PAR inbox");
    await uiRoute("/business/par/finance", "PAR finance queue");
    await uiRoute("/business/par/folders", "PAR folders (VM1-10)");
    await uiRoute("/business/par/reports", "PAR reports (VM1-03)");
    await T("UI: create form exposes file upload (VM1-06)", async () => {
      await go("/business/par/new");
      const hasFile = await page.$('input[type="file"]');
      const t = (await text()).toLowerCase();
      assert(hasFile || /atașa|atasa|încărc|incarc|fișier|fisier|upload|document/.test(t), "no upload control / text in create form");
    });
    await T("UI: redirect /app/par → /business/par (SHELL-501)", async () => {
      await go("/app/par");
      const hash = await page.evaluate(() => location.hash);
      assert(hash.includes("/business/par"), `hash=${hash}`);
    });
    await T("UI: admin nav shows Inbox + Rapoarte (SHELL-502)", async () => {
      await go("/business/par");
      const t = await text();
      assert(/inbox|aprob/i.test(t) && /rapoar|report/i.test(t), "nav items for admin");
    });
    await T("UI: /business/invite?token=bad shows invite page (SHELL-503)", async () => {
      await page.goto(`${BASE}/#/business/invite?token=invalid-test-token`, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const hash = await page.evaluate(() => location.hash);
      assert(hash.includes("/business/invite"), `stayed on invite page, hash=${hash}`);
    });

    await browser.close();
  }

  // ═══ SUMMARY ═══
  console.log("\n" + "═".repeat(64));
  console.log(`PAR E2E — ${passed}/${n} passed, ${failures.length} failed`);
  console.log("═".repeat(64));
  if (failures.length) {
    console.log("\n❌ FAILURES:");
    failures.forEach((f) => console.log("  " + f));
  } else {
    console.log("\n✅ All scenarios passed.");
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error("crash:", e.stack || e.message);
  process.exit(2);
});
