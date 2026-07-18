/**
 * E2E PAR-QA Faza 4 — regression for attachments (PARQA-021) + audit diff (PARQA-022).
 *   PARQA-021  content-mismatch upload (bytes ≠ declared MIME) → 400; real PDF → 201
 *   PARQA-021  finance can delete a proof THEY uploaded at the finance stage → 200
 *   PARQA-022  editing a draft writes a structured par_audit.diff shown on the timeline
 *
 * Run: npm run db:reset && npm run db:seed ; PORT=3000 npm run start & ; node scripts/e2e-par-qa-f4.mjs
 */
import { request } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.SMOKE_PASSWORD ?? "demo123456";
const USERS = { admin: "admin@atic.demo.io", approver: "approver@atic.demo.io", finance: "finance@atic.demo.io", requestor: "requestor@atic.demo.io" };
const IBAN_A = "MD24AG000225100013104168";
const IDNP = "2002600012345";
// Valid PDF: base64("%PDF-1.4\n") repeated → decodes to bytes starting with %PDF.
const PDF_DATAURL = "data:application/pdf;base64," + "JVBERi0xLjQK".repeat(40);
// Bytes that are NOT a PDF but LABELLED application/pdf (client-controlled prefix).
const FAKE_PDF = "data:application/pdf;base64," + Buffer.from("this is plainly not a pdf file").toString("base64");

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
const DEL = (r, p) => call(r, "DELETE", p);

async function main() {
  for (const role of ["admin", "approver", "finance", "requestor"]) await login(role);

  // ── PARQA-021: magic-byte MIME validation ──────────────────────────────────
  const draft = (await POST("requestor", "/api/par", {})).json.id;
  await T("PARQA-021 upload with content matching the declared PDF → 201", async () => {
    const r = await POST("requestor", `/api/par/${draft}/attachments`, {
      file_name: "real.pdf", file_url: PDF_DATAURL, mime: "application/pdf", kind: "contract",
    });
    eq(r.status, 201, "valid pdf upload");
  });
  await T("PARQA-021 upload of non-PDF bytes labelled application/pdf → 400 file_content_mismatch", async () => {
    const r = await POST("requestor", `/api/par/${draft}/attachments`, {
      file_name: "fake.pdf", file_url: FAKE_PDF, mime: "application/pdf", kind: "contract",
    });
    eq(r.status, 400, "content mismatch status");
    eq(r.json?.error, "file_content_mismatch", "error code");
  });

  // ── PARQA-021: finance can delete a proof they uploaded at the finance stage ─
  // Build an in_finance PAR: requestor submits (≤ threshold → 1 approver step), approver approves.
  const payId = (await POST("requestor", "/api/par", {})).json.id;
  await PATCH("requestor", `/api/par/${payId}`, {
    purpose: "execute_payment", currency: "MDL", end_use: "Test proof delete",
    payee_name: "Furnizor", payee_iban: IBAN_A, payee_idnp: IDNP, payee_bank: "MAIB",
  });
  await POST("requestor", `/api/par/${payId}/line-items`, { description: "x", quantity: 1, unit: "buc", unit_price_cents: 100000 });
  await POST("requestor", `/api/par/${payId}/submit`, {});
  await POST("approver", `/api/par/${payId}/approve`, {}); // → in_finance (execute_payment)

  let proofId;
  await T("PARQA-021 finance uploads a payment proof at the finance stage → 201", async () => {
    const r = await POST("finance", `/api/par/${payId}/attachments`, {
      file_name: "proof.pdf", file_url: PDF_DATAURL, mime: "application/pdf", kind: "invoice",
    });
    eq(r.status, 201, "finance upload");
    proofId = r.json?.id;
    assert(proofId, "proof id");
  });
  await T("PARQA-021 finance can DELETE the proof they uploaded → 200 (was 403 before)", async () => {
    const r = await DEL("finance", `/api/par/${payId}/attachments/${proofId}`);
    eq(r.status, 200, "finance delete own proof");
  });

  // ── PARQA-022: audit diff on edit ──────────────────────────────────────────
  const editId = (await POST("requestor", "/api/par", {})).json.id;
  await PATCH("requestor", `/api/par/${editId}`, { end_use: "prima versiune" });
  await PATCH("requestor", `/api/par/${editId}`, { end_use: "versiune corectată" });
  await T("PARQA-022 timeline 'edited' event carries a structured diff of the changed field", async () => {
    const r = await GET("requestor", `/api/par/${editId}/timeline`);
    eq(r.status, 200, "timeline status");
    const events = r.json?.timeline ?? r.json?.events ?? [];
    const edited = events.filter((e) => e.event === "edited");
    assert(edited.length > 0, "has an edited event");
    const withDiff = edited.filter((e) => e.diff);
    assert(withDiff.length >= 2, "both edits wrote a diff");
    // Timeline is chronological → the LAST edited event is the second PATCH.
    const last = withDiff[withDiff.length - 1];
    const parsed = typeof last.diff === "string" ? JSON.parse(last.diff) : last.diff;
    assert(parsed.endUse, "diff records the endUse field");
    assert(parsed.endUse.from === "prima versiune" && parsed.endUse.to === "versiune corectată",
      `diff before/after correct, got ${JSON.stringify(parsed.endUse)}`);
  });

  console.log(`\n${passed}/${n} passed`);
  if (failures.length) { console.log("FAILED:"); for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
  console.log("All PARQA Faza 4 regressions green ✅");
}
main().catch((e) => { console.error(e); process.exit(1); });
