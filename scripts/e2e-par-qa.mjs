/**
 * E2E PAR-QA — regression net for the PARQA Faza 1 fixes (blocante + securitate)
 * ============================================================================
 * Each check INVOKES the fixed action against the real API and asserts the new behavior
 * (CLAUDE.md §3.5.1quater — test the ACTION, not the affordance). Covers:
 *   PARQA-003  self-approval blocked (author can't approve own PAR, even as par_admin)
 *   PARQA-004  dosar GDPR gate (non-elevated non-author → 403; author/elevated → 200)
 *   PARQA-005  vendor writes role-gated (requestor PATCH → 403; POST → still allowed)
 *   PARQA-006  templates gated + owner-only delete (other user deletes → 403; owner → 200)
 *   PARQA-002  notification bell contract (rich shape: body+link+type; per-id /read → 200)
 *   PARQA-001  edit-draft building blocks (draft is re-loadable + patchable + re-submittable)
 *
 * Run against a fresh seed:
 *   npm run db:reset && npm run db:seed
 *   PORT=3000 npm run start &
 *   node scripts/e2e-par-qa.mjs        # BASE_URL defaults to http://localhost:3000
 *
 * Seeded ATIC users (all password demo123456):
 *   admin@atic.demo.io (par_admin) · approver@ · finance@ · requestor@
 * Seeded DOA: ≤5000 MDL → 1 step (approver). Micro-purchase threshold: 5000 MDL.
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
const IBAN_B = "MD21EX000000000001234567";
const IDNP = "2002600012345";

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
  try { json = await r.json(); } catch { /* non-JSON (e.g. dosar PDF) */ }
  return { status: r.status(), json, headers: r.headers() };
}
const GET = (role, p) => call(role, "GET", p);
const POST = (role, p, b) => call(role, "POST", p, b);
const PATCH = (role, p, b) => call(role, "PATCH", p, b);
const DEL = (role, p, b) => call(role, "DELETE", p, b);

async function makeSubmittedPar(role, unitPriceCents) {
  const c = await POST(role, "/api/par", {});
  const id = c.json.id;
  await PATCH(role, `/api/par/${id}`, {
    purpose: "execute_payment", currency: "MDL",
    end_use: "Materiale pentru programul educațional",
    payee_name: "Furnizor SRL", payee_iban: IBAN_A, payee_idnp: IDNP, payee_bank: "Victoriabank",
  });
  await POST(role, `/api/par/${id}/line-items`, {
    description: "Articol test", quantity: 1, unit: "buc", unit_price_cents: unitPriceCents,
  });
  const s = await POST(role, `/api/par/${id}/submit`, {});
  return { id, submit: s };
}

async function main() {
  for (const role of ["admin", "approver", "finance", "requestor", "anon"]) await login(role);

  // ── PARQA-003: self-approval blocked ───────────────────────────────────────
  // admin (par_admin ⇒ can approve) creates + submits a PAR → admin is the author.
  const adminPar = await makeSubmittedPar("admin", 100000); // 1000 MDL ≤ threshold → 1 approver step
  await T("PARQA-003 admin submits own PAR → pending_approval", () => {
    eq(adminPar.submit.status, 200, "submit status");
  });
  await T("PARQA-003 admin CANNOT approve own PAR (self-approval) → 403", async () => {
    const r = await POST("admin", `/api/par/${adminPar.id}/approve`, {});
    eq(r.status, 403, "self-approve status");
  });
  await T("PARQA-003 a different approver CAN approve it → 200", async () => {
    const r = await POST("approver", `/api/par/${adminPar.id}/approve`, {});
    eq(r.status, 200, "approver approve status");
  });

  // ── PARQA-004: dosar GDPR gate ─────────────────────────────────────────────
  // requestor is non-elevated (requestor role only) and NOT the author of adminPar.
  await T("PARQA-004 non-author non-elevated requestor → dosar 403", async () => {
    const r = await GET("requestor", `/api/par/${adminPar.id}/dosar`);
    eq(r.status, 403, "dosar status for other requestor");
  });
  await T("PARQA-004 elevated finance → dosar 200", async () => {
    const r = await GET("finance", `/api/par/${adminPar.id}/dosar`);
    eq(r.status, 200, "dosar status for finance");
  });
  await T("PARQA-004 author (admin) → dosar 200", async () => {
    const r = await GET("admin", `/api/par/${adminPar.id}/dosar`);
    eq(r.status, 200, "dosar status for author");
  });

  // ── PARQA-005: vendor writes role-gated ────────────────────────────────────
  let vendorId;
  await T("PARQA-005 requestor CAN create a vendor (POST) → 200/201", async () => {
    const r = await POST("requestor", "/api/par/vendors", { name: "QA Vendor", iban: IBAN_B, idnp: IDNP });
    assert(r.status === 200 || r.status === 201, `vendor create: got ${r.status}`);
    vendorId = r.json?.id;
    assert(vendorId, "vendor id returned");
  });
  await T("PARQA-005 requestor CANNOT PATCH a vendor (admin-only) → 403", async () => {
    const r = await PATCH("requestor", `/api/par/vendors/${vendorId}`, { bank: "Hacked Bank" });
    eq(r.status, 403, "vendor patch by requestor");
  });
  await T("PARQA-005 par_admin CAN PATCH a vendor → 200", async () => {
    const r = await PATCH("admin", `/api/par/vendors/${vendorId}`, { bank: "MAIB" });
    eq(r.status, 200, "vendor patch by admin");
  });

  // ── PARQA-006: templates gated + owner-only delete ─────────────────────────
  let tmplId;
  await T("PARQA-006 requestor saves a template → ok", async () => {
    const r = await POST("requestor", "/api/par/templates", {
      name: "QA template",
      snapshot: { purpose: "execute_payment", chargeTo: "program", lineItems: [] },
    });
    assert(r.status === 200 || r.status === 201, `template create: got ${r.status}`);
    tmplId = r.json?.id ?? r.json?.template?.id;
    assert(tmplId, "template id returned");
  });
  await T("PARQA-006 a different non-admin user CANNOT delete it → 403", async () => {
    const r = await DEL("finance", `/api/par/templates/${tmplId}`);
    eq(r.status, 403, "cross-user template delete");
  });
  await T("PARQA-006 the owner CAN delete their own template → 200", async () => {
    const r = await DEL("requestor", `/api/par/templates/${tmplId}`);
    eq(r.status, 200, "owner template delete");
  });

  // ── PARQA-002: notification bell contract ──────────────────────────────────
  // requestor submits a PAR ≤ threshold → routes to the approver, who must get a real in-app row.
  const notifPar = await makeSubmittedPar("requestor", 100000);
  await T("PARQA-002 submit routes to approver → 200", () => eq(notifPar.submit.status, 200, "submit"));
  let notifId, notifLink;
  await T("PARQA-002 approver GET /api/notifications → rich shape (body+type+link+unreadCount)", async () => {
    const r = await GET("approver", "/api/notifications");
    eq(r.status, 200, "notifications status");
    assert(typeof r.json?.unreadCount === "number", "unreadCount is a number");
    const items = r.json?.items ?? [];
    assert(Array.isArray(items) && items.length > 0, "has notification items");
    const parNotif = items.find((it) => it.type === "par" || (it.link ?? "").includes("/business/par/"));
    assert(parNotif, "a PAR notification is present");
    assert(parNotif.body && parNotif.body.trim().length > 0, "notification body is non-empty");
    assert((parNotif.link ?? "").includes("/business/par/"), "notification deep-links to the PAR");
    assert(parNotif.title && parNotif.title.length > 0, "notification has a title");
    notifId = parNotif.id;
    notifLink = parNotif.link;
  });
  await T("PARQA-002 PATCH /api/notifications/:id/read exists → 200 (was 404)", async () => {
    const r = await PATCH("approver", `/api/notifications/${notifId}/read`, {});
    eq(r.status, 200, "single mark-read status");
  });
  await T("PARQA-002 deep-link points at the submitted PAR", () => {
    assert((notifLink ?? "").includes(notifPar.id), `link ${notifLink} should include ${notifPar.id}`);
  });

  // ── PARQA-001: edit-draft building blocks (API side of the new /edit route) ─
  await T("PARQA-001 a draft is re-loadable, patchable, and re-submittable", async () => {
    const c = await POST("requestor", "/api/par", {});
    const id = c.json.id;
    await POST("requestor", `/api/par/${id}/line-items`, {
      description: "x", quantity: 1, unit: "buc", unit_price_cents: 50000,
    });
    // reload (what ParCreateForm does on /edit mount)
    const loaded = await GET("requestor", `/api/par/${id}`);
    eq(loaded.status, 200, "reload draft");
    eq(loaded.json.status, "draft", "still editable");
    assert((loaded.json.line_items ?? []).length === 1, "line items came back for the form");
    // edit + submit (what Save/Submit do)
    const patched = await PATCH("requestor", `/api/par/${id}`, {
      purpose: "execute_payment", currency: "MDL", end_use: "editat", payee_name: "P", payee_iban: IBAN_A,
    });
    eq(patched.status, 200, "patch edited header");
    const sub = await POST("requestor", `/api/par/${id}/submit`, {});
    eq(sub.status, 200, "re-submit after edit");
  });

  // ── summary ────────────────────────────────────────────────────────────────
  console.log(`\n${passed}/${n} passed`);
  if (failures.length) {
    console.log(`\n${failures.length} FAILED:`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("All PARQA Faza 1 regressions green ✅");
}

main().catch((e) => { console.error(e); process.exit(1); });
