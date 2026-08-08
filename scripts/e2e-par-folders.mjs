// PAR — Foldere: navigarea de tip drive trebuie să se sprijine pe date reale, nu pe presupuneri.
//
// Regresia pe care o blochează: pagina Foldere PAR arăta statistici corecte, dar la click te
// arunca în lista globală de cereri, iar despre documente nu știa nimic — nu se vedea dacă
// finanțele au încărcat ordinul de plată sau confirmarea. Navigarea e acum în URL (unit-testat în
// src/pages/par/__tests__), iar sumarul de dosar vine din `GET /api/par?include_docs=1`, verificat
// aici pe server viu.
//
// Per CLAUDE.md §3.5.1quater fiecare verificare INVOCĂ acțiunea (upload, plată), nu doar citește un
// flag: dacă `include_docs` ar minți, testul pică.
//
//   node scripts/e2e-par-folders.mjs              (server pe :3000, seed rulat)
//   BASE=http://localhost:3100 node scripts/e2e-par-folders.mjs
import { request } from "playwright-core";

const BASE = process.env.BASE || "http://localhost:3000";
const PW = "demo123456";
const U = { admin: "admin@atic.demo.io", approver: "approver@atic.demo.io", finance: "finance@atic.demo.io", requestor: "requestor@atic.demo.io" };
const IBAN = "MD24AG000225100013104168";
const IDNP = "2002600012345";
// PDF minimal valid — încărcat ca ordin de plată, exact ca din UI.
const PDF_DATA_URL = "data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsOfCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nL1BhZ2VzIDIgMCBSPj4KZW5kb2JqCjIgMCBvYmoKPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjMgMCBvYmoKPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgOTkgOTldPj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKdHJhaWxlcgo8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxOTAKJSVFT0YK";

const ctx = {};
async function login(r) {
  const c = await request.newContext({ baseURL: BASE });
  const res = await c.post("/api/auth/login", { data: { email: U[r], password: PW } });
  if (res.status() !== 200) throw new Error(`login ${r} → ${res.status()} (server pornit? seed rulat?)`);
  ctx[r] = c;
}
async function call(role, m, p, b) {
  const r = await ctx[role][m.toLowerCase()](p, b !== undefined ? { data: b } : {});
  let j = null; try { j = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status(), json: j };
}
const GET = (r, p) => call(r, "GET", p), POST = (r, p, b) => call(r, "POST", p, b), PATCH = (r, p, b) => call(r, "PATCH", p, b);

let n = 0, ok = 0;
const failures = [];
async function F(name, fn) {
  n++;
  try { const d = await fn(); ok++; console.log(`✅ ${name}${d ? ` — ${d}` : ""}`); }
  catch (e) { failures.push({ name, detail: e.message }); console.log(`🔴 ${name}\n      ${e.message}`); }
}
const must = (c, m) => { if (!c) throw new Error(m); };

const cfg = {};
async function draft(role, cents, extra = {}) {
  const c = await POST(role, "/api/par", {});
  const id = c.json.id;
  await PATCH(role, `/api/par/${id}`, {
    purpose: "execute_payment", currency: "MDL", end_use: "Verificare foldere",
    payee_name: "Vendor SRL", payee_iban: IBAN, payee_idnp: IDNP, payee_bank: "VB",
    department_id: cfg.deptId, project_id: cfg.projectId, budget_code_id: cfg.budgetCodeId, ...extra,
  });
  await POST(role, `/api/par/${id}/line-items`, { description: "Serviciu", quantity: 1, unit: "buc", unit_price_cents: cents });
  return id;
}
async function fullyApprove(id) {
  for (const r of ["approver", "admin"]) {
    await POST(r, `/api/par/${id}/approve`, { comment: "ok", signatureName: "Test" });
    const s = (await GET("admin", `/api/par/${id}`)).json.status;
    if (["approved", "in_finance"].includes(s)) return s;
  }
  return (await GET("admin", `/api/par/${id}`)).json.status;
}
const docsOf = (list, id) => (list.requests ?? []).find((r) => r.id === id)?.docs;

console.log("═══ PAR — Foldere: sumarul de dosar pe care se sprijină navigarea ═══\n");
for (const r of Object.keys(U)) await login(r);
const [d, p, b] = await Promise.all([
  GET("requestor", "/api/par/departments"), GET("requestor", "/api/par/projects"), GET("requestor", "/api/par/budget-codes"),
]);
cfg.deptId = d.json.departments[0].id;
cfg.projectId = p.json.projects[0].id;
cfg.projectName = p.json.projects[0].name;
cfg.budgetCodeId = b.json.budgetCodes.find((x) => x.projectId === cfg.projectId)?.id;

// ─── 1. Fără include_docs, răspunsul rămâne exact cum era ────────────────────

await F("GET /api/par (fără include_docs) nu adaugă câmpuri — clienții existenți nu se rup", async () => {
  const list = await GET("approver", "/api/par");
  must(list.status === 200, `listă → ${list.status}`);
  must(Array.isArray(list.json.requests), "lipsește requests[]");
  must(list.json.requests.every((r) => r.docs === undefined), "docs apare fără include_docs");
  return `${list.json.total} cereri`;
});

// ─── 2. Cerere fără documente ────────────────────────────────────────────────

let emptyId;
await F("cerere nouă → docs.count 0, fără ordin de plată, fără confirmare", async () => {
  emptyId = await draft("requestor", 40000);
  const list = await GET("requestor", "/api/par?include_docs=1");
  must(list.status === 200, `listă → ${list.status}`);
  const docs = docsOf(list.json, emptyId);
  must(docs, "cererea nu apare cu docs în listă");
  must(docs.count === 0, `docs.count = ${docs.count}, aşteptat 0`);
  must(docs.has_payment_order === false && docs.has_payment_proof === false, "raportează dovezi inexistente");
  must(docs.payment_date === null && docs.actual_amount_cents === null, "raportează plată inexistentă");
});

// ─── 3. Documentele cererii (factura) ────────────────────────────────────────

await F("upload factură → docs.count creşte şi kind-ul ajunge în listă", async () => {
  const up = await POST("requestor", `/api/par/${emptyId}/attachments`, {
    file_name: "factura-113.pdf", file_url: PDF_DATA_URL, mime: "application/pdf", kind: "invoice",
  });
  must(up.status === 200 || up.status === 201, `upload → ${up.status} ${JSON.stringify(up.json)}`);
  // …și rămâne vizibil după trimiterea la aprobare (folderul „De aprobat" arată dosarul, nu doar cererea).
  const sub = await POST("requestor", `/api/par/${emptyId}/submit`, {});
  must(sub.status === 200, `submit → ${sub.status} ${JSON.stringify(sub.json)}`);

  const docs = docsOf((await GET("approver", "/api/par?include_docs=1")).json, emptyId);
  must(docs.count === 1, `docs.count = ${docs.count}, aşteptat 1`);
  must(docs.kinds.includes("invoice"), `kinds = ${JSON.stringify(docs.kinds)}`);
  must(docs.has_invoice === true, "has_invoice fals după încărcarea facturii");
  must(docs.has_payment_order === false, "factura a fost confundată cu ordinul de plată");
});

// ─── 4. Plata: ordin de plată + confirmare ───────────────────────────────────

let paidId;
await F("plată executată + ordin de plată încărcat → folderul ştie ambele", async () => {
  paidId = await draft("requestor", 250000);
  await POST("requestor", `/api/par/${paidId}/submit`, {});
  const st = await fullyApprove(paidId);
  must(["approved", "in_finance"].includes(st), `status după aprobare: ${st}`);

  await POST("finance", `/api/par/${paidId}/finance`, { par_bl: "BL-1" });
  const pay = await POST("finance", `/api/par/${paidId}/pay`, {
    actual_amount_cents: 250000,
    payment_date: new Date().toISOString(),
    payment_ref: "OP-771",
    proof_url: "https://example.org/confirmare-plata.pdf",
  });
  must(pay.status === 200, `pay → ${pay.status} ${JSON.stringify(pay.json)}`);

  const upload = await POST("finance", `/api/par/${paidId}/attachments`, {
    file_name: "ordin-plata-771.pdf", file_url: PDF_DATA_URL, mime: "application/pdf", kind: "payment_order",
  });
  must(upload.status === 200 || upload.status === 201, `upload ordin → ${upload.status}`);

  const docs = docsOf((await GET("finance", "/api/par?include_docs=1")).json, paidId);
  must(docs, "cererea plătită lipseşte din listă");
  must(docs.has_payment_order === true, "ordinul de plată încărcat nu e raportat");
  must(docs.has_payment_proof === true, "confirmarea plăţii (proof_url) nu e raportată");
  must(docs.payment_ref === "OP-771", `payment_ref = ${docs.payment_ref}`);
  must(docs.actual_amount_cents === 250000, `actual_amount_cents = ${docs.actual_amount_cents}`);
  must(docs.payment_date, "payment_date lipseşte");
  return `${docs.count} documente, ref ${docs.payment_ref}`;
});

// ─── 5. Dosarul deschis din folder — documentele acelei cereri, nu ale tuturor ─

await F("GET /api/par/:id → atașamentele acelei cereri + plata (nivelul documente)", async () => {
  const det = await GET("finance", `/api/par/${paidId}`);
  must(det.status === 200, `detaliu → ${det.status}`);
  const names = (det.json.attachments ?? []).map((a) => a.fileName);
  must(names.includes("ordin-plata-771.pdf"), `atașamente: ${JSON.stringify(names)}`);
  must(!names.includes("factura-113.pdf"), "dosarul altei cereri s-a scurs în acesta");
  must(det.json.payment?.proofUrl, "confirmarea plăţii lipseşte din detaliu");

  const att = det.json.attachments.find((a) => a.kind === "payment_order");
  const preview = await ctx.finance.get(`/api/par/${paidId}/attachments/${att.id}/preview`);
  must(preview.status() === 200, `preview ordin de plată → ${preview.status()}`);
  must((preview.headers()["content-type"] || "").includes("pdf"), `content-type ${preview.headers()["content-type"]}`);
});

// ─── 6. Scoparea pe folder (proiect + status) ────────────────────────────────

await F("folderul proiect/status filtrează server-side aceleaşi cereri ca navigarea", async () => {
  const byProject = await GET("approver", `/api/par?include_docs=1&project_id=${cfg.projectId}`);
  must(byProject.status === 200, `filtru proiect → ${byProject.status}`);
  must(byProject.json.requests.every((r) => r.projectId === cfg.projectId), "au apărut cereri din alt proiect");
  must(byProject.json.requests.some((r) => r.id === paidId), "cererea plătită lipseşte din folderul proiectului");
  must(byProject.json.requests.every((r) => r.docs), "docs lipseşte când se filtrează pe proiect");

  const paidOnly = await GET("finance", `/api/par?include_docs=1&project_id=${cfg.projectId}&status=paid`);
  must(paidOnly.json.requests.every((r) => r.status === "paid"), "folderul Platite contine alte statusuri");
  must(paidOnly.json.requests.some((r) => r.id === paidId), "cererea plătită lipseşte din folderul Plătite");
  return `${paidOnly.json.requests.length} plătite în ${cfg.projectName}`;
});

// ─── 7. Izolarea pe tenant/rol rămâne intactă ────────────────────────────────

await F("include_docs nu ocoleşte scoparea: requestor-ul vede doar dosarele lui", async () => {
  const mine = await GET("requestor", "/api/par?include_docs=1");
  must(mine.status === 200, `listă requestor → ${mine.status}`);
  must(mine.json.requests.every((r) => r.docs), "docs lipseşte pentru requestor");
  must(mine.json.requests.some((r) => r.id === emptyId), "requestorul nu-şi vede propria cerere");
});

console.log(`\n═══ ${ok}/${n} verificări trecute ═══`);
if (failures.length) {
  console.log("\nEşecuri:");
  for (const f of failures) console.log(`  🔴 ${f.name}: ${f.detail}`);
  process.exit(1);
}
