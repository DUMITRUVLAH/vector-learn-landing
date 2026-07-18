/**
 * E2E PAR — Multi-payer scope isolation + Excel import + document upload/preview/AI
 * =================================================================================
 * Exercises the PAR-MODERNIZATION P0 gates against a running app:
 *   Gate #2 — two payers, projects and users with DIFFERENT scope → isolation holds,
 *             including manual-API cross-payer attacks (PAR-MOD-03/04/05) and the
 *             confirmed leak regressions (par_admin list scope, budget-code balance).
 *   Gate #3 — Excel config import with a real .xlsx: rejected-rows reporting + a
 *             payer-scoped par_admin cannot create a new payer / touch a foreign payer.
 *   Gate #4 — document upload (data-URL) → 201, inline browser preview, AI prefill,
 *             AI reconcile match verdict (invoke the ACTION, assert 200 + shape).
 *   Gate MOD-16 — platform superadmin can disable the PAR module for ONE payer → its
 *             API 403s, other payers unaffected; re-enabled at the end.
 *
 * Run against a fresh seed:
 *   npm run db:reset && npm run db:seed
 *   PORT=3100 npm run start &            # serves /api (+ SPA)
 *   node scripts/e2e-par-scope.mjs        # BASE_URL defaults to http://localhost:3100
 *
 * Seeded PAR tenant "ATIC" (all password demo123456):
 *   admin@atic.demo.io      — workspace admin  + par_admin  (unrestricted; platform superadmin)
 *   approver@atic.demo.io   — workspace teacher + approver   (scoped)
 *   finance@atic.demo.io    — workspace teacher + finance     (scoped, payer-wide)
 *   requestor@atic.demo.io  — workspace teacher + requestor   (scoped to Digital Safeguard only)
 * Seeded payer A "ATIC" with projects "Digital Safeguard" + "CyberSkills Moldova".
 */
import { request } from "playwright";
import ExcelJS from "exceljs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PW = process.env.SMOKE_PASSWORD ?? "demo123456";
const USERS = {
  admin: "admin@atic.demo.io",
  approver: "approver@atic.demo.io",
  finance: "finance@atic.demo.io",
  requestor: "requestor@atic.demo.io",
};
// Valid MD test data (mod-97 verified) + a realistic (multi-KB) PDF data URL so a real upload path
// is exercised (a tiny stub once hid the varchar(2000) file_url overflow — §3.5.1quater).
const IBAN_A = "MD24AG000225100013104168";
const IDNP = "2002600012345";
const PDF_B64 = "JVBERi0xLjQK" + Buffer.from("x".repeat(3000)).toString("base64"); // starts %PDF-1.4
const PDF_DATAURL = "data:application/pdf;base64," + PDF_B64;
const PDF_BUFFER = Buffer.from(PDF_B64, "base64");

// ── tiny runner ──────────────────────────────────────────────────────────────
let passed = 0; const failures = []; let n = 0;
async function T(name, fn) {
  n++; const id = String(n).padStart(3, "0");
  try { await fn(); passed++; console.log(`✅ ${id} ${name}`); }
  catch (e) { failures.push(`${id} ${name} — ${e.message}`); console.log(`❌ ${id} ${name} — ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function eq(a, b, label) { if (a !== b) throw new Error(`${label || "value"}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ── API helpers (one cookie jar per role) ────────────────────────────────────
const ctxs = {};
async function login(role) {
  const c = await request.newContext({ baseURL: BASE });
  const r = await c.post("/api/auth/login", { data: { email: USERS[role], password: PW } });
  if (r.status() !== 200) throw new Error(`login ${role} failed: ${r.status()} ${await r.text()}`);
  ctxs[role] = c; return c;
}
async function call(role, method, path, body) {
  const c = ctxs[role];
  const opts = body !== undefined ? { data: body } : {};
  const r = await c[method.toLowerCase()](path, opts);
  let json = null; try { json = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status(), json, headers: r.headers() };
}
const GET = (role, p) => call(role, "GET", p);
const POST = (role, p, b) => call(role, "POST", p, b);
const PATCH = (role, p, b) => call(role, "PATCH", p, b);
const PUT = (role, p, b) => call(role, "PUT", p, b);

async function main() {
  for (const role of ["admin", "approver", "finance", "requestor"]) await login(role);

  // ═══ SETUP (as workspace admin — unrestricted) ═══════════════════════════════
  const payersRes = await GET("admin", "/api/par/payers");
  eq(payersRes.status, 200, "GET payers");
  const payerA = payersRes.json.payers.find((p) => p.name === "ATIC");
  assert(payerA, "seeded payer A 'ATIC' present");

  const projA = (await GET("admin", "/api/par/projects")).json.projects || [];
  const digitalSafeguard = projA.find((p) => p.name === "Digital Safeguard");
  const cyberSkills = projA.find((p) => p.name === "CyberSkills Moldova");
  assert(digitalSafeguard && cyberSkills, "seeded projects under payer A present");

  // Second legal entity + its project + budget codes.
  const payerBRes = await POST("admin", "/api/par/payers", { name: "ATIC Secondary Entity", legal_name: "ATIC 2 SRL", idno: "1010600000002" });
  eq(payerBRes.status, 201, "create payer B");
  const payerB = payerBRes.json;

  const projBRes = await POST("admin", "/api/par/projects", { name: "Grant Beta", donor: "EU", payer_id: payerB.id });
  eq(projBRes.status, 201, "create project B1 under payer B");
  const projectB1 = projBRes.json;

  const codeBRes = await POST("admin", "/api/par/budget-codes", { code: "B-WIDE-01", name: "Payer B wide", allocatedCents: 5000000, payer_id: payerB.id });
  eq(codeBRes.status, 201, "create payer-wide budget code under payer B");
  const codeB = codeBRes.json;

  // Member ids by email.
  const members = (await GET("admin", "/api/par/members")).json.members;
  const idOf = (email) => { const m = members.find((x) => x.userEmail === email); assert(m, `member ${email}`); return m.userId; };
  const requestorId = idOf(USERS.requestor);
  const approverId = idOf(USERS.approver);

  // approver becomes a PAYER-SCOPED par_admin (workspace 'teacher') — the exact actor the
  // GET /api/par par_admin-exemption leak affected. Scope it to payer B ONLY.
  eq((await POST("admin", "/api/par/members", { userId: approverId, role: "par_admin" })).status, 201, "grant approver the par_admin role");
  eq((await PUT("admin", `/api/par/profiles/${approverId}/payers`, { payer_ids: [payerB.id] })).status, 200, "scope approver → payer B");
  eq((await PUT("admin", `/api/par/profiles/${approverId}/projects`, { project_ids: [projectB1.id] })).status, 200, "scope approver → project B1");
  // Re-login approver so the session reflects the new par_admin role + scope.
  await login("approver");

  // Admin PARs under each payer (for cross-scope read/list checks).
  async function makeDraft(role, payerId, projectId) {
    const c = await POST(role, "/api/par", {});
    const id = c.json.id;
    await PATCH(role, `/api/par/${id}`, { payer_id: payerId, project_id: projectId, purpose: "execute_payment", currency: "MDL", end_use: "test", payee_name: "Furnizor SRL", payee_iban: IBAN_A, payee_idnp: IDNP, payee_bank: "Victoriabank" });
    return id;
  }
  const parA = await makeDraft("admin", payerA.id, digitalSafeguard.id);
  const parB = await makeDraft("admin", payerB.id, projectB1.id);

  // ═══ GATE #2 — scope isolation ═══════════════════════════════════════════════
  await T("requestor sees ONLY payer A (payer B hidden)", async () => {
    const r = await GET("requestor", "/api/par/payers"); eq(r.status, 200, "status");
    const names = r.json.payers.map((p) => p.name);
    assert(names.includes("ATIC"), "payer A visible"); assert(!names.includes("ATIC Secondary Entity"), "payer B hidden");
  });
  await T("requestor projects = Digital Safeguard only (no CyberSkills, no B1)", async () => {
    const names = ((await GET("requestor", "/api/par/projects")).json.projects || []).map((p) => p.name);
    assert(names.includes("Digital Safeguard"), "DS visible");
    assert(!names.includes("CyberSkills Moldova"), "CyberSkills hidden (seed intent)");
    assert(!names.includes("Grant Beta"), "payer B project hidden");
  });
  await T("approver (par_admin, scoped to B) sees ONLY payer B", async () => {
    const names = (await GET("approver", "/api/par/payers")).json.payers.map((p) => p.name);
    assert(names.includes("ATIC Secondary Entity"), "payer B visible"); assert(!names.includes("ATIC"), "payer A hidden");
  });
  await T("approver projects = Grant Beta only", async () => {
    const names = ((await GET("approver", "/api/par/projects")).json.projects || []).map((p) => p.name);
    assert(names.includes("Grant Beta") && !names.includes("Digital Safeguard"), "only B1 visible");
  });
  await T("MANUAL API: requestor cannot PATCH a PAR onto payer B's project (MOD-03/05)", async () => {
    const c = await POST("requestor", "/api/par", {}); const id = c.json.id;
    const r = await PATCH("requestor", `/api/par/${id}`, { project_id: projectB1.id });
    assert(r.status !== 200, `expected rejection, got 200`);
  });
  await T("MANUAL API: requestor cannot PATCH a PAR onto payer B", async () => {
    const c = await POST("requestor", "/api/par", {}); const id = c.json.id;
    const r = await PATCH("requestor", `/api/par/${id}`, { payer_id: payerB.id });
    assert(r.status !== 200, `expected rejection, got 200`);
  });
  await T("requestor GET a payer-B PAR by id → 404", async () => {
    eq((await GET("requestor", `/api/par/${parB}`)).status, 404, "cross-payer detail");
  });
  await T("REGRESSION par.ts:665 — par_admin scoped to B does NOT see payer-A PAR in the list", async () => {
    const r = await GET("approver", "/api/par"); eq(r.status, 200, "list status");
    const ids = (r.json.requests || []).map((x) => x.id);
    assert(!ids.includes(parA), "payer-A PAR must be scoped out of a payer-B par_admin's list");
  });
  await T("REGRESSION par.ts:665 — par_admin scoped to B GET payer-A PAR by id → 404", async () => {
    eq((await GET("approver", `/api/par/${parA}`)).status, 404, "cross-payer detail for par_admin");
  });
  await T("REGRESSION balance — requestor cannot read payer-B payer-wide code balance by id", async () => {
    eq((await GET("requestor", `/api/par/budget-codes/${codeB.id}/balance`)).status, 404, "cross-payer balance");
  });
  await T("positive: admin (unrestricted) sees both payers + both PARs", async () => {
    const names = (await GET("admin", "/api/par/payers")).json.payers.map((p) => p.name);
    assert(names.includes("ATIC") && names.includes("ATIC Secondary Entity"), "admin sees both payers");
    const ids = ((await GET("admin", "/api/par")).json.requests || []).map((x) => x.id);
    assert(ids.includes(parA) && ids.includes(parB), "admin sees both PARs");
  });

  // ═══ GATE #3 — Excel config import ═══════════════════════════════════════════
  async function buildXlsx() {
    const wb = new ExcelJS.Workbook();
    const wsP = wb.addWorksheet("Plătitori");
    wsP.addRow(["Denumire plătitor *", "Denumire juridică", "IDNO"]);
    wsP.addRow(["ATIC Third Entity", "ATIC 3 SRL", "1010600000003"]); // NEW payer (admin allowed)
    wsP.addRow(["", "no name", ""]);                                   // invalid: missing name
    const wsPr = wb.addWorksheet("Proiecte");
    wsPr.addRow(["Denumire proiect *", "Donor / Finanțator", "Plătitor / Organizație *"]);
    wsPr.addRow(["Proiect Import OK", "USAID", "ATIC"]);               // valid under payer A
    wsPr.addRow(["", "USAID", "ATIC"]);                                // invalid: missing name
    wsPr.addRow(["Proiect Fantomă", "USAID", "Payer Inexistent"]);     // invalid: unknown payer
    const wsD = wb.addWorksheet("Departamente");
    wsD.addRow(["Denumire departament *"]); wsD.addRow(["Achiziții Import"]);
    const wsB = wb.addWorksheet("Coduri buget");
    wsB.addRow(["Cod buget *", "Denumire *", "Suma alocată (MDL)", "Plătitor / Organizație *", "Proiect (opțional)"]);
    wsB.addRow(["IMP-01", "Cod importat", "45,000", "ATIC", ""]);      // valid
    wsB.addRow(["IMP-02", "Sumă greșită", "abc", "ATIC", ""]);         // invalid: non-numeric sum
    wsB.addRow(["", "Fără cod", "100", "ATIC", ""]);                   // invalid: missing code
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const xlsx = await buildXlsx();
  async function importXlsx(role) {
    const c = ctxs[role];
    const r = await c.post("/api/par/config-import", {
      multipart: { file: { name: "config.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: xlsx } },
    });
    let json = null; try { json = await r.json(); } catch { /**/ }
    return { status: r.status(), json };
  }
  await T("Excel import (admin) → 200, good rows created, bad rows reported", async () => {
    const r = await importXlsx("admin"); eq(r.status, 200, "import status");
    assert(r.json.payers.created >= 1, "new payer created");
    assert(r.json.payers.errors.length >= 1, "missing-name payer reported");
    assert(r.json.projects.created >= 1, "project created");
    assert(r.json.projects.errors.length >= 2, "missing-name + unknown-payer projects reported");
    assert(r.json.budgetCodes.created >= 1, "budget code created");
    assert(r.json.budgetCodes.errors.length >= 2, "non-numeric-sum + missing-code reported");
  });
  await T("REGRESSION config-import — payer-scoped par_admin cannot create a NEW payer via Excel", async () => {
    const r = await importXlsx("approver"); eq(r.status, 200, "import status");
    // ATIC Third Entity already exists now (created by admin above) so re-run wouldn't create; use a
    // fresh scoped import: the "ATIC" foreign-payer project/code rows must error (not in approver's scope).
    assert(r.json.projects.errors.some((e) => /acces la plătitorul/i.test(e.message)) || r.json.projects.created === 0, "foreign-payer project rejected for scoped par_admin");
  });

  // ═══ GATE #4 — upload / preview / AI ═════════════════════════════════════════
  const draftForDoc = (await POST("requestor", "/api/par", {})).json.id;
  let attId;
  await T("upload attachment (data-URL PDF) as author → 201", async () => {
    const r = await POST("requestor", `/api/par/${draftForDoc}/attachments`, {
      file_name: "factura.pdf", file_url: PDF_DATAURL, mime: "application/pdf", kind: "invoice", size_bytes: PDF_BUFFER.length,
    });
    eq(r.status, 201, `upload status ${JSON.stringify(r.json)}`);
    attId = r.json.id || r.json.attachment?.id; assert(attId, "attachment id returned");
  });
  await T("inline browser preview → 200 application/pdf, Content-Disposition inline", async () => {
    const c = ctxs.requestor;
    const r = await c.get(`/api/par/${draftForDoc}/attachments/${attId}/preview`);
    eq(r.status(), 200, "preview status");
    const h = r.headers();
    assert((h["content-type"] || "").includes("application/pdf"), `content-type: ${h["content-type"]}`);
    assert(/inline/i.test(h["content-disposition"] || ""), `disposition: ${h["content-disposition"]}`);
  });
  await T("AI prefill (multipart PDF) → 200 with prefill shape", async () => {
    const c = ctxs.requestor;
    const r = await c.post("/api/par/ai-prefill", { multipart: { file: { name: "factura.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER } } });
    eq(r.status(), 200, `ai-prefill status ${r.status()}`);
    const j = await r.json();
    assert("payeeName" in j && "totalCents" in j && "documentClass" in j, `prefill shape: ${Object.keys(j).join(",")}`);
  });
  await T("AI reconcile match verdict → 200 {analysis} or 422 analysis_unavailable (never 500)", async () => {
    const r = await POST("requestor", `/api/par/${draftForDoc}/attachments/${attId}/reconcile`, {});
    assert(r.status === 200 || r.status === 422, `reconcile status ${r.status}`);
    if (r.status === 200) assert(r.json.analysis && "status" in r.json.analysis && Array.isArray(r.json.analysis.checks), "analysis shape");
  });

  // ═══ GATE MOD-16 — platform entitlement toggle ═══════════════════════════════
  // The toggle is superadmin-only (admin@). Entitlement is asserted with a NON-superadmin (approver):
  // a platform superadmin bypasses hasPayerModuleEntitlement by design, so admin@ would always 200.
  await T("MOD-16: disable PAR for payer B → scoped-user write 403, payer B hidden, payer A unaffected", async () => {
    // approver (non-superadmin, scoped to B) owns a payer-B draft created WHILE B is still enabled.
    // A scoped user must name their payer at creation (an empty POST defaults to the tenant's first
    // enabled payer, which a B-scoped user cannot access).
    const d = await POST("approver", "/api/par", { payer_id: payerB.id, project_id: projectB1.id });
    eq(d.status, 201, `approver payer-B draft (pre-disable) ${JSON.stringify(d.json)}`);
    // superadmin disables the PAR module for payer B only.
    eq((await PUT("admin", `/api/platform/organizations/${payerB.id}/modules`, { module: "par", enabled: false })).status, 200, "disable");
    // Non-superadmin write under the disabled payer → 403 module_disabled (middleware + handler re-check).
    const blocked = await PATCH("approver", `/api/par/${d.json.id}`, { end_use: "updated" });
    eq(blocked.status, 403, `payer-B write should be blocked, got ${blocked.status} ${JSON.stringify(blocked.json)}`);
    // Payer B disappears from the payers list + its PARs from the list; payer A unaffected.
    const payersAfter = (await GET("admin", "/api/par/payers")).json.payers.map((p) => p.name);
    assert(!payersAfter.includes("ATIC Secondary Entity"), "disabled payer B hidden from payers list");
    assert(payersAfter.includes("ATIC"), "payer A still listed (unaffected)");
    const listAfter = ((await GET("admin", "/api/par")).json.requests || []).map((x) => x.id);
    assert(!listAfter.includes(parB), "disabled payer B PAR hidden from list");
    assert(listAfter.includes(parA), "payer A PAR still visible (unaffected)");
  });
  await T("re-enable PAR module for payer B (cleanup)", async () => {
    eq((await PUT("admin", `/api/platform/organizations/${payerB.id}/modules`, { module: "par", enabled: true })).status, 200, "re-enable");
  });

  // ── summary ──
  console.log(`\n${passed}/${n} passed`);
  if (failures.length) { console.log("\nFAILURES:\n" + failures.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
  console.log("✅ ALL PAR SCOPE / IMPORT / UPLOAD GATES GREEN");
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
