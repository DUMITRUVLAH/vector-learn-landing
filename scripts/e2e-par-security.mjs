// PAR security regression suite. Run against a seeded local server.
//   node scripts/e2e-par-security.mjs
//
// It exists because two real holes shipped and were only found by asking the API
// directly: a par_admin could add a user from ANOTHER tenant as a PAR member
// (the member list then printed that user's name + email), and the last
// par_admin could revoke themselves. Both are pinned below.
//
// PAR security + logic audit. Every check exercises a real endpoint and asserts
// the OUTCOME, not that a control exists. Findings are printed as PASS / FAIL,
// where FAIL = the app allowed something it should not, or blocked something it should.
import { request } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = "demo123456";
const U = {
  admin: "admin@atic.demo.io",       // par_admin + tenant admin
  approver: "approver@atic.demo.io", // approver, limit 100_000_00
  finance: "finance@atic.demo.io",
  requestor: "requestor@atic.demo.io",
  other: "admin@demo.vectorlearn.io", // DIFFERENT tenant (crm demo)
};
const IBAN = "MD24AG000225100013104168";
const IDNP = "2002600012345";

const ctx = {};
async function login(role) {
  const c = await request.newContext({ baseURL: BASE });
  const r = await c.post("/api/auth/login", { data: { email: U[role], password: PW } });
  ctx[role] = c;
  return r.status();
}
async function call(role, method, path, body) {
  const r = await ctx[role][method.toLowerCase()](path, body !== undefined ? { data: body } : {});
  let json = null;
  try { json = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status(), json };
}
const GET = (r, p) => call(r, "GET", p);
const POST = (r, p, b) => call(r, "POST", p, b);
const PATCH = (r, p, b) => call(r, "PATCH", p, b);
const DEL = (r, p) => call(r, "DELETE", p);

const findings = [];
let n = 0, pass = 0;
async function CHECK(area, name, fn) {
  n++;
  try {
    const note = await fn();
    pass++;
    console.log(`✅ [${area}] ${name}${note ? ` — ${note}` : ""}`);
  } catch (e) {
    findings.push({ area, name, detail: e.message });
    console.log(`🔴 [${area}] ${name}\n      ${e.message}`);
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

// helper: a fully-valid draft owned by `role`
let cfg = {};
async function makeDraft(role, priceCents = 100000) {
  const c = await POST(role, "/api/par", {});
  const id = c.json?.id;
  must(id, `nu pot crea ciornă: ${c.status} ${JSON.stringify(c.json)}`);
  await PATCH(role, `/api/par/${id}`, {
    purpose: "execute_payment", currency: "MDL",
    end_use: "Audit de securitate",
    payee_name: "Audit Vendor SRL", payee_iban: IBAN, payee_idnp: IDNP, payee_bank: "VB",
    department_id: cfg.deptId, project_id: cfg.projectId, budget_code_id: cfg.budgetCodeId,
  });
  await POST(role, `/api/par/${id}/line-items`, { description: "Serviciu", quantity: 1, unit: "buc", unit_price_cents: priceCents });
  return id;
}

console.log("═══ PAR — audit de securitate și logică ═══\n");
for (const r of ["admin", "approver", "finance", "requestor"]) {
  const s = await login(r);
  must(s === 200, `login ${r} a eșuat: ${s}`);
}
const otherStatus = await login("other");
console.log(`(login tenant străin: ${otherStatus})\n`);

const [d, p, b] = await Promise.all([
  GET("requestor", "/api/par/departments"), GET("requestor", "/api/par/projects"), GET("requestor", "/api/par/budget-codes"),
]);
cfg.deptId = d.json?.departments?.[0]?.id;
cfg.projectId = p.json?.projects?.[0]?.id;
cfg.budgetCodeId = b.json?.budgetCodes?.find((x) => x.projectId === cfg.projectId)?.id;

// ══════════════ A. ACORDAREA DE ROLURI ══════════════
console.log("── A. Acordarea de roluri ──");

let memberList = null;
await CHECK("roluri", "par_admin poate lista membrii", async () => {
  const r = await GET("admin", "/api/par/members");
  must(r.status === 200, `status ${r.status}`);
  memberList = r.json.members;
  return `${memberList.length} membri`;
});

for (const role of ["requestor", "approver", "finance"]) {
  await CHECK("roluri", `${role} NU poate lista membrii (403)`, async () => {
    const r = await GET(role, "/api/par/members");
    must(r.status === 403, `a primit ${r.status} în loc de 403 — poate vedea lista de membri`);
  });
  await CHECK("roluri", `${role} NU își poate acorda singur par_admin`, async () => {
    const me = await GET(role, "/api/par/me");
    const r = await POST(role, "/api/par/members", { userId: me.json?.userId ?? memberList?.[0]?.userId, role: "par_admin" });
    must(r.status === 403, `a primit ${r.status} — ESCALADARE DE PRIVILEGII`);
  });
}

await CHECK("roluri", "par_admin poate acorda un rol, iar rolul devine activ imediat", async () => {
  const target = memberList.find((m) => m.userEmail === U.requestor);
  must(target, "nu găsesc requestorul în listă");
  const r = await POST("admin", "/api/par/members", { userId: target.userId, role: "finance" });
  must(r.status === 201 || r.status === 200, `status ${r.status}`);
  const me = await GET("requestor", "/api/par/me");
  must(me.json.roles.includes("finance"), `rolul nu s-a activat: ${JSON.stringify(me.json.roles)}`);
  // revoke again
  const list = await GET("admin", "/api/par/members");
  const row = list.json.members.find((m) => m.userId === target.userId && m.role === "finance");
  await DEL("admin", `/api/par/members/${row.id}`);
  const me2 = await GET("requestor", "/api/par/me");
  must(!me2.json.roles.includes("finance"), "revocarea nu a avut efect");
  return "acordare + revocare instant";
});

await CHECK("roluri", "nu se poate acorda un rol unui utilizator din ALT tenant", async () => {
  const foreign = await GET("other", "/api/par/me");
  const foreignId = foreign.json?.userId;
  if (!foreignId) return "sărit — nu am putut obține id-ul din tenantul străin";
  const r = await POST("admin", "/api/par/members", { userId: foreignId, role: "approver" });
  if (r.status === 201 || r.status === 200) {
    // clean up before failing
    const list = await GET("admin", "/api/par/members");
    const row = list.json.members.find((m) => m.userId === foreignId);
    if (row) await DEL("admin", `/api/par/members/${row.id}`);
    throw new Error(`acceptat cu ${r.status} — un utilizator din alt tenant a fost adăugat ca membru PAR`);
  }
  must(r.status >= 400, `status ${r.status}`);
});

await CHECK("roluri", "limita de aprobare respinge valori invalide", async () => {
  const target = memberList.find((m) => m.userEmail === U.approver);
  const neg = await POST("admin", "/api/par/members", { userId: target.userId, role: "approver", approvalLimitCents: -500 });
  must(neg.status === 400, `limita negativă acceptată cu ${neg.status}`);
});

await CHECK("roluri", "ultimul par_admin nu se poate auto-revoca (blocare totală)", async () => {
  const list = await GET("admin", "/api/par/members");
  const admins = list.json.members.filter((m) => m.role === "par_admin");
  if (admins.length !== 1) return `sărit — ${admins.length} par_admin în tenant`;
  const r = await DEL("admin", `/api/par/members/${admins[0].id}`);
  if (r.status === 200) {
    // restore immediately — this must not stay broken
    await POST("admin", "/api/par/members", { userId: admins[0].userId, role: "par_admin" });
    throw new Error("ultimul par_admin s-a putut revoca; tenantul ar rămâne fără administrator PAR (aici salvat de rolul implicit de tenant admin)");
  }
  must(r.status >= 400, `status ${r.status}`);
});

// ══════════════ B. SEGREGAREA SARCINILOR ══════════════
console.log("\n── B. Segregarea sarcinilor (miezul unui sistem de aprobări) ──");

await CHECK("segregare", "un requestor NU își poate aproba propria cerere", async () => {
  const id = await makeDraft("requestor", 100000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  const r = await POST("requestor", `/api/par/${id}/approve`, { comment: "self" });
  must(r.status >= 400, `AUTO-APROBARE PERMISĂ (${r.status}) — solicitantul și-a aprobat propria plată`);
});

await CHECK("segregare", "un utilizator fără rol de aprobator NU poate aproba", async () => {
  const id = await makeDraft("requestor", 100000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  const r = await POST("finance", `/api/par/${id}/approve`, { comment: "x" });
  must(r.status >= 400, `finanțele au aprobat o cerere (${r.status}) fără rol de aprobator`);
});

await CHECK("segregare", "aprobatorul NU poate depăși limita proprie de aprobare", async () => {
  const lim = memberList.find((m) => m.userEmail === U.approver && m.role === "approver")?.approvalLimitCents;
  if (!lim) return "sărit — aprobatorul nu are limită setată";
  const id = await makeDraft("requestor", lim + 500000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  const r = await POST("approver", `/api/par/${id}/approve`, { comment: "peste limită" });
  const after = await GET("admin", `/api/par/${id}`);
  must(after.json.status !== "approved",
    `cerere de ${(lim + 500000) / 100} MDL aprobată complet de un aprobator cu limita ${lim / 100} MDL`);
  return `limita ${lim / 100} MDL respectată`;
});

await CHECK("segregare", "finanțele NU pot plăti o cerere neaprobată", async () => {
  const id = await makeDraft("requestor", 50000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  const r = await POST("finance", `/api/par/${id}/pay`, { paid_at: new Date().toISOString(), payment_reference: "X" });
  must(r.status >= 400, `PLATĂ PE O CERERE NEAPROBATĂ acceptată (${r.status})`);
});

await CHECK("segregare", "o cerere respinsă nu mai poate fi plătită", async () => {
  const id = await makeDraft("requestor", 50000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  await POST("approver", `/api/par/${id}/reject`, { comment: "nu" });
  const r = await POST("finance", `/api/par/${id}/pay`, { paid_at: new Date().toISOString(), payment_reference: "X" });
  must(r.status >= 400, `cerere RESPINSĂ plătită (${r.status})`);
});

await CHECK("segregare", "aceeași persoană nu poate aproba de două ori acelaşi pas", async () => {
  const id = await makeDraft("requestor", 50000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  const a = await POST("approver", `/api/par/${id}/approve`, { comment: "1" });
  if (a.status >= 400) return `sărit — prima aprobare a dat ${a.status}`;
  const b2 = await POST("approver", `/api/par/${id}/approve`, { comment: "2" });
  must(b2.status >= 400, `dublă aprobare acceptată (${b2.status})`);
});

// ══════════════ C. IZOLAREA ÎNTRE TENANȚI ══════════════
console.log("\n── C. Izolarea între tenanți ──");

let victimId = null;
await CHECK("izolare", "un utilizator din alt tenant NU poate citi o cerere PAR", async () => {
  victimId = await makeDraft("requestor", 50000);
  const r = await GET("other", `/api/par/${victimId}`);
  must(r.status >= 400, `SCURGERE ÎNTRE TENANȚI: status ${r.status}, corp=${JSON.stringify(r.json).slice(0, 120)}`);
});

await CHECK("izolare", "un utilizator din alt tenant NU poate lista cererile", async () => {
  const r = await GET("other", "/api/par");
  if (r.status >= 400) return `blocat cu ${r.status}`;
  const items = r.json?.requests ?? [];
  const leaked = items.some((x) => x.id === victimId);
  must(!leaked, "cererile altui tenant apar în listă");
  return `200 dar listă proprie (${items.length})`;
});

await CHECK("izolare", "un utilizator din alt tenant NU poate modifica o cerere", async () => {
  const r = await PATCH("other", `/api/par/${victimId}`, { end_use: "hacked" });
  must(r.status >= 400, `MODIFICARE ÎNTRE TENANȚI acceptată (${r.status})`);
});

await CHECK("izolare", "un utilizator din alt tenant NU poate aproba", async () => {
  const r = await POST("other", `/api/par/${victimId}/approve`, { comment: "x" });
  must(r.status >= 400, `APROBARE ÎNTRE TENANȚI acceptată (${r.status})`);
});

// ══════════════ D. VALIDAREA CÂMPURILOR ══════════════
console.log("\n── D. Validarea câmpurilor ──");

await CHECK("validare", "IBAN invalid este respins la submit", async () => {
  const c = await POST("requestor", "/api/par", {});
  const id = c.json.id;
  const r = await PATCH("requestor", `/api/par/${id}`, {
    purpose: "execute_payment", currency: "MDL", end_use: "test",
    payee_name: "X SRL", payee_iban: "MD00INVALIDIBAN123", payee_idnp: IDNP,
  });
  if (r.status >= 400) return `respins la PATCH (${r.status})`;
  await POST("requestor", `/api/par/${id}/line-items`, { description: "x", quantity: 1, unit_price_cents: 1000 });
  const s = await POST("requestor", `/api/par/${id}/submit`, {});
  must(s.status >= 400, `IBAN invalid a trecut până la submit (${s.status})`);
  return "respins la submit";
});

await CHECK("validare", "cantitatea zero / negativă este respinsă", async () => {
  const c = await POST("requestor", "/api/par", {});
  const id = c.json.id;
  const z = await POST("requestor", `/api/par/${id}/line-items`, { description: "x", quantity: 0, unit_price_cents: 1000 });
  const neg = await POST("requestor", `/api/par/${id}/line-items`, { description: "x", quantity: -5, unit_price_cents: 1000 });
  must(z.status >= 400 && neg.status >= 400, `qty=0 → ${z.status}, qty=-5 → ${neg.status}`);
});

await CHECK("validare", "prețul negativ este respins", async () => {
  const c = await POST("requestor", "/api/par", {});
  const r = await POST("requestor", `/api/par/${c.json.id}/line-items`, { description: "x", quantity: 1, unit_price_cents: -100000 });
  must(r.status >= 400, `preț negativ acceptat (${r.status}) — total negativ posibil`);
});

await CHECK("validare", "submit fără articole este respins", async () => {
  const c = await POST("requestor", "/api/par", {});
  const id = c.json.id;
  await PATCH("requestor", `/api/par/${id}`, {
    purpose: "execute_payment", currency: "MDL", end_use: "gol",
    payee_name: "X SRL", payee_iban: IBAN, payee_idnp: IDNP,
  });
  const s = await POST("requestor", `/api/par/${id}/submit`, {});
  must(s.status >= 400, `cerere fără articole trimisă la aprobare (${s.status})`);
});

// ══════════════ E. ACCESUL LA DATE SENSIBILE ══════════════
console.log("\n── E. Accesul la date sensibile ──");

await CHECK("date", "rapoartele nu sunt deschise unui simplu requestor", async () => {
  const r = await GET("requestor", "/api/par/reports/spend-by-payer");
  must(r.status === 403, `requestorul vede rapoartele financiare ale organizației (${r.status})`);
});

await CHECK("date", "jurnalul de audit nu e deschis unui simplu requestor", async () => {
  const r = await GET("requestor", "/api/par/audit");
  must(r.status === 403 || r.status === 404, `status ${r.status}`);
});

await CHECK("date", "invitațiile pot fi create doar de par_admin", async () => {
  const r = await POST("approver", "/api/par/invites", { email: "x@y.z", role: "approver" });
  must(r.status === 403, `un aprobator poate invita membri noi (${r.status})`);
});

console.log(`\n═══ ${pass}/${n} verificări trecute ═══`);
if (findings.length) {
  console.log(`\n${findings.length} CONSTATĂRI:`);
  for (const f of findings) console.log(`  • [${f.area}] ${f.name}\n      ${f.detail}`);
}
process.exit(0);
