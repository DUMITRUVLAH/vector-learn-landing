// PAR — the approve actions on the DETAIL page must match the inbox, exactly.
//
// Regression this locks: an approver opened a PAR from "Cereri de plată" and saw no
// Approve/Reject at all, while the SAME PAR sat in "Inbox aprobare" with both buttons. The
// detail page derived authority client-side ("the step names me personally"), which is false for
// role-based steps (approver_user_id = null — the default chain). Authority is now computed
// server-side (`my_decision` on GET /api/par/:id) with the same rules /approve enforces.
//
// Per CLAUDE.md §3.5.1quater these checks INVOKE the action, they don't just look at the flag.
//
//   node scripts/e2e-par-detail-actions.mjs          (server on :3000, seeded)
//   BASE=http://localhost:3100 node scripts/e2e-par-detail-actions.mjs
import { request } from "playwright-core";

const BASE = process.env.BASE || "http://localhost:3000";
const PW = "demo123456";
const U = { admin: "admin@atic.demo.io", approver: "approver@atic.demo.io", finance: "finance@atic.demo.io", requestor: "requestor@atic.demo.io" };
const IBAN = "MD24AG000225100013104168";
const IDNP = "2002600012345";

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
async function submitted(role, cents) {
  const c = await POST(role, "/api/par", {});
  const id = c.json.id;
  await PATCH(role, `/api/par/${id}`, {
    purpose: "execute_payment", currency: "MDL", end_use: "Verificare acțiuni pe pagina de detaliu",
    payee_name: "Vendor SRL", payee_iban: IBAN, payee_idnp: IDNP, payee_bank: "VB",
    department_id: cfg.deptId, project_id: cfg.projectId, budget_code_id: cfg.budgetCodeId,
  });
  await POST(role, `/api/par/${id}/line-items`, { description: "Serviciu", quantity: 1, unit: "buc", unit_price_cents: cents });
  const s = await POST(role, `/api/par/${id}/submit`, {});
  must(s.status === 200, `submit → ${s.status} ${JSON.stringify(s.json)}`);
  return id;
}

console.log("═══ PAR — acțiuni de aprobare pe pagina de detaliu ═══\n");
for (const r of Object.keys(U)) await login(r);
const [d, p, b] = await Promise.all([
  GET("requestor", "/api/par/departments"), GET("requestor", "/api/par/projects"), GET("requestor", "/api/par/budget-codes"),
]);
cfg.deptId = d.json.departments[0].id;
cfg.projectId = p.json.projects[0].id;
cfg.budgetCodeId = b.json.budgetCodes.find((x) => x.projectId === cfg.projectId)?.id;

// ─── 1. Paritate inbox ⇄ detaliu (bug-ul raportat) ──────────────────────────

await F("PAR trimis → apare în inbox ȘI detaliul spune can_approve", async () => {
  const id = await submitted("requestor", 50000);
  const inbox = await GET("approver", "/api/par/inbox");
  must(inbox.status === 200, `inbox → ${inbox.status}`);
  const item = inbox.json.inbox.find((i) => i.id === id);
  must(item, "cererea trimisă nu a ajuns în inboxul aprobatorului");

  const det = await GET("approver", `/api/par/${id}`);
  must(det.status === 200, `detaliu → ${det.status}`);
  must(det.json.my_decision, "GET /api/par/:id nu întoarce my_decision");
  must(det.json.my_decision.can_approve === true,
    `detaliul ascunde acțiunile deși cererea e în inbox: ${JSON.stringify(det.json.my_decision)}`);
  must(det.json.my_decision.active_step === item.my_step,
    `pas activ diferit: detaliu ${det.json.my_decision.active_step} vs inbox ${item.my_step}`);
  return `pas ${det.json.my_decision.active_step} (${det.json.my_decision.active_step_label ?? "—"})`;
});

await F("TOATE cererile din inbox sunt aprobabile și din detaliu", async () => {
  const inbox = await GET("approver", "/api/par/inbox");
  must(inbox.json.inbox.length > 0, "inbox gol — nimic de verificat");
  const mismatched = [];
  for (const item of inbox.json.inbox) {
    const det = await GET("approver", `/api/par/${item.id}`);
    if (det.status !== 200 || det.json.my_decision?.can_approve !== true) {
      mismatched.push(`${item.requestNo}: ${det.status} ${JSON.stringify(det.json?.my_decision)}`);
    }
  }
  must(mismatched.length === 0, `în inbox dar fără acțiuni în detaliu:\n      ${mismatched.join("\n      ")}`);
  return `${inbox.json.inbox.length} cereri verificate`;
});

// ─── 2. Butonul chiar funcționează (nu doar se afișează) ─────────────────────

await F("aprobare pornită din detaliu → 200 și pasul e semnat", async () => {
  const id = await submitted("requestor", 50000);
  const before = await GET("approver", `/api/par/${id}`);
  must(before.json.my_decision.can_approve === true, "detaliul nu oferă aprobarea");

  const res = await POST("approver", `/api/par/${id}/approve`, { comment: "ok", signatureName: "Test aprobator" });
  must(res.status === 200, `approve → ${res.status} ${JSON.stringify(res.json)}`);

  const after = await GET("approver", `/api/par/${id}`);
  const decided = after.json.approvals.filter((a) => a.decision === "approved");
  must(decided.length >= 1, "niciun pas nu s-a marcat aprobat");
  must(after.json.my_decision.can_approve === false, "detaliul încă oferă aprobarea după decizie");
  return `status ${after.json.status}, ${decided.length} pas(i) aprobat(i)`;
});

await F("sigiliul de integritate rezistă la auto-salvarea beneficiarului", async () => {
  // Regresie: autosaveVendorFromPar scria `vendor_id` pe cerere DUPĂ ce submit-ul îi calculase
  // hash-ul corpului — iar vendor_id face parte din corpul semnat. Rezultat: ORICE aprobare
  // răspundea 409 "integrity_violation". Aprobarea de mai jos trebuie să treacă, nu să pice pe hash.
  const id = await submitted("requestor", 50000);
  const det = await GET("requestor", `/api/par/${id}`);
  must(det.json.body_hash_valid !== false, `sigiliul corpului e invalid imediat după submit: ${JSON.stringify(det.json.body_hash_valid)}`);
  const res = await POST("approver", `/api/par/${id}/approve`, { comment: "ok" });
  must(res.status === 200, `approve → ${res.status} ${JSON.stringify(res.json)}`);
  return "hash stabil la submit";
});

await F("respingere pornită din detaliu → 200 și cererea devine `rejected`", async () => {
  const id = await submitted("requestor", 50000);
  must((await GET("approver", `/api/par/${id}`)).json.my_decision.can_approve === true, "detaliul nu oferă respingerea");
  const res = await POST("approver", `/api/par/${id}/reject`, { comment: "Documentație incompletă" });
  must(res.status === 200, `reject → ${res.status} ${JSON.stringify(res.json)}`);
  const after = await GET("approver", `/api/par/${id}`);
  must(after.json.status === "rejected", `status după respingere: ${after.json.status}`);
  return "rejected";
});

await F("cerere de modificări pornită din detaliu → 200", async () => {
  const id = await submitted("requestor", 50000);
  const res = await POST("approver", `/api/par/${id}/request-changes`, { comment: "Adaugă oferta a doua" });
  must(res.status === 200, `request-changes → ${res.status} ${JSON.stringify(res.json)}`);
  const after = await GET("approver", `/api/par/${id}`);
  must(after.json.status === "changes_requested", `status: ${after.json.status}`);
  return "changes_requested";
});

// ─── 3. Cazurile în care NU trebuie să apară butoanele ───────────────────────

await F("autorul nu-și poate aproba propria cerere (motiv: self_approval)", async () => {
  // Adminul e implicit par_admin: dacă trimite el cererea, tot nu are voie să o aprobe.
  const id = await submitted("admin", 50000);
  const det = await GET("admin", `/api/par/${id}`);
  must(det.json.my_decision.can_approve === false, "detaliul oferă auto-aprobarea");
  must(det.json.my_decision.reason === "self_approval", `motiv: ${det.json.my_decision.reason}`);
  const res = await POST("admin", `/api/par/${id}/approve`, {});
  must(res.status === 403, `serverul a acceptat auto-aprobarea: ${res.status}`);
  return "blocat pe ambele straturi";
});

await F("cerere deja decisă → fără acțiuni (motiv: not_pending_approval)", async () => {
  const id = await submitted("requestor", 50000);
  await POST("approver", `/api/par/${id}/reject`, { comment: "Nu" });
  const det = await GET("approver", `/api/par/${id}`);
  must(det.json.my_decision.can_approve === false, "detaliul oferă acțiuni pe o cerere respinsă");
  must(det.json.my_decision.reason === "not_pending_approval", `motiv: ${det.json.my_decision.reason}`);
  return det.json.my_decision.reason;
});

await F("ciorna proprie a solicitantului → fără acțiuni de aprobare", async () => {
  const c = await POST("requestor", "/api/par", {});
  const det = await GET("requestor", `/api/par/${c.json.id}`);
  must(det.json.my_decision.can_approve === false, "ciorna oferă aprobare");
  return det.json.my_decision.reason;
});

console.log(`\n═══ ${ok}/${n} verificări trecute ═══`);
if (failures.length) {
  console.log("\nEșecuri:");
  for (const f of failures) console.log(`  · ${f.name}: ${f.detail}`);
  process.exit(1);
}
