// Verificatorul solicitantului, pe serverul real (cerere owner, 23.09.2026):
// „Iulian m-a rugat ca mereu să aprobe de la colegele sale Cristina Onicov și Marina Certan
//  PAR-urile înainte să ajungă la aprobatori, și el să le poată modifica sau întoarce — singur să
//  schimbe budget line și alte modificări — și deja mai departe se duc la aprobatorii workspace-ului."
//
// Testul INVOCĂ acțiunile (CLAUDE.md §3.5.1quater): invită un verificator cu rol DOAR de solicitant
// (ca Iulian), îl leagă de solicitantul demo, trimite o cerere, o corectează ca verificator, încearcă
// ce nu are voie, o aprobă, apoi o duce până la finanțe. Și partea negativă: fără verificator setat,
// lanțul NU are pasul — o poartă care nu poate pica nu verifică nimic.
//
// Configurația se curăță la final: solicitantul demo e folosit de celelalte suite e2e.
//
//   BASE_URL=http://localhost:3134 node scripts/e2e-par-verifier.mjs
import { request } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.E2E_PASSWORD ?? "demo123456";
const U = {
  admin: "admin@atic.demo.io",
  approver: "approver@atic.demo.io",
  requestor: "requestor@atic.demo.io",
};
const IBAN = "MD24AG000225100013104168";
const IDNP = "2002600012345";

const ctx = {};
async function login(role) {
  const c = await request.newContext({ baseURL: BASE });
  const r = await c.post("/api/auth/login", { data: { email: U[role], password: PW } });
  if (r.status() !== 200) throw new Error(`login ${role} → ${r.status()} (rulează serverul + seed?)`);
  ctx[role] = c;
}
async function call(role, method, path, body) {
  const r = await ctx[role][method.toLowerCase()](path, body !== undefined ? { data: body } : {});
  let json = null;
  try { json = await r.json(); } catch { /* răspuns fără corp */ }
  return { status: r.status(), json };
}
const GET = (r, p) => call(r, "GET", p);
const POST = (r, p, b) => call(r, "POST", p, b);
const PATCH = (r, p, b) => call(r, "PATCH", p, b);

let total = 0, passed = 0;
const failures = [];
async function T(name, fn) {
  total++;
  try {
    const detail = await fn();
    passed++;
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    failures.push({ name, message: e.message });
    console.log(`🔴 ${name}\n      ${e.message}`);
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log("═══ PAR — verificatorul solicitantului ═══\n");
for (const role of Object.keys(U)) await login(role);

// ── Verificatorul: un om nou, DOAR solicitant, invitat pe plătitorul ATIC (exact ca Iulian) ──
const payers = (await GET("admin", "/api/par/payers")).json.payers ?? [];
const atic = payers.find((p) => p.name === "ATIC") ?? payers[0];
must(atic, "nu există plătitor în seed");
const verifierEmail = `verificator+${Date.now()}@atic.demo.io`;
const invite = await POST("admin", "/api/par/invites", { email: verifierEmail, par_role: "requestor", payer_ids: [atic.id] });
must(invite.status === 201 || invite.status === 200, `invitația → ${invite.status} ${JSON.stringify(invite.json)}`);
const token = ((invite.json.inviteUrl ?? "").match(/token=([^&]+)/) || [])[1];
must(token, `invitația nu are token: ${invite.json.inviteUrl}`);
ctx.verifier = await request.newContext({ baseURL: BASE });
const accepted = await ctx.verifier.post("/api/auth/accept-invite", { data: { token, name: "Iulian Verificator", password: "verificator-e2e-123" } });
must(accepted.status() === 200 || accepted.status() === 201, `accept-invite → ${accepted.status()} ${await accepted.text()}`);

const members = (await GET("admin", "/api/par/members")).json.members ?? [];
const idOf = (email) => members.find((m) => (m.userEmail ?? "").toLowerCase() === email.toLowerCase())?.userId;
const verifierId = idOf(verifierEmail);
const requestorId = idOf(U.requestor);
must(verifierId && requestorId, `id-uri lipsă: verificator=${verifierId} solicitant=${requestorId}`);

const [depts, projects, codes] = await Promise.all([
  GET("requestor", "/api/par/departments"),
  GET("requestor", "/api/par/projects"),
  GET("requestor", "/api/par/budget-codes"),
]);
const deptId = depts.json.departments[0].id;
const projectId = projects.json.projects[0].id;
const allCodes = codes.json.budgetCodes ?? codes.json.items ?? [];
const eligible = allCodes.filter((c) => c.active !== false && (!c.projectId || c.projectId === projectId));
must(eligible.length >= 2, `seed-ul are ${eligible.length} coduri bugetare potrivite; testul are nevoie de 2`);
const [firstCode, secondCode] = eligible;

/** O cerere a solicitantului demo, trimisă. */
async function submittedPar(cents = 50000) {
  const created = await POST("requestor", "/api/par", {});
  const id = created.json.id;
  await PATCH("requestor", `/api/par/${id}`, {
    purpose: "execute_payment",
    currency: "MDL",
    end_use: "Descrierea inițială",
    payee_name: "Furnizor SRL",
    payee_iban: IBAN,
    payee_idnp: IDNP,
    payee_bank: "VB",
    department_id: deptId,
    project_id: projectId,
    budget_code_id: firstCode.id,
  });
  await POST("requestor", `/api/par/${id}/line-items`, { description: "Serviciu", quantity: 1, unit: "buc", unit_price_cents: cents });
  const sub = await POST("requestor", `/api/par/${id}/submit`, {});
  must(sub.status === 200, `submit → ${sub.status} ${JSON.stringify(sub.json)}`);
  return id;
}
const stepsOf = async (id) => ((await GET("admin", `/api/par/${id}`)).json.approvals ?? []).sort((a, b) => a.step - b.step);

try {
  await T("[blocant] administratorul setează verificatorul pe profilul solicitantului", async () => {
    const res = await PATCH("admin", `/api/par/profiles/${requestorId}`, { verifier_user_id: verifierId });
    must(res.status === 200, `PATCH profil → ${res.status} ${JSON.stringify(res.json)}`);
    const profile = await GET("admin", `/api/par/profiles/${requestorId}`);
    must(profile.json.profile?.verifierUserId === verifierId, `nesalvat: ${JSON.stringify(profile.json.profile)}`);
  });

  await T("[blocant] un om nu-și poate fi propriul verificator (400 + motiv în română)", async () => {
    const res = await PATCH("admin", `/api/par/profiles/${requestorId}`, { verifier_user_id: requestorId });
    must(res.status === 400 && res.json?.error === "verifier_self", `→ ${res.status} ${JSON.stringify(res.json)}`);
    must(/propriile cereri/.test(res.json.detail ?? ""), `motivul lipsește: ${res.json.detail}`);
  });

  await T("[blocant] lista de membri arată cine verifică pe cine", async () => {
    const list = (await GET("admin", "/api/par/members")).json.members ?? [];
    const row = list.find((m) => m.userId === requestorId);
    must(row?.verifierUserId === verifierId, `verifierUserId în listă: ${row?.verifierUserId}`);
  });

  await T("[blocant] verificatorul, doar solicitant, primește inboxul de aprobare", async () => {
    const me = await call("verifier", "GET", "/api/par/me");
    must(me.status === 200 && me.json.preApprover === true, `GET /me → ${me.status} ${JSON.stringify(me.json)}`);
    must(!(me.json.roles ?? []).includes("approver"), "verificatorul NU primește rolul general de aprobator");
  });

  const parId = await submittedPar();

  await T("[blocant] lanțul începe cu „Verificare”, pe numele verificatorului, singur și deschis", async () => {
    const steps = await stepsOf(parId);
    const first = steps.filter((s) => s.step === 1);
    must(first.length === 1, `pe pasul 1 sunt ${first.length} rânduri`);
    must(first[0].approverUserId === verifierId && first[0].approverRoleLabel === "Verificare", JSON.stringify(first[0]));
    must(first[0].locked === false, "pasul verificatorului e blocat");
    must(steps.filter((s) => s.step > 1).every((s) => s.locked), "aprobatorii trebuie să aștepte blocați");
    return `${steps.length - 1} pas(i) după solicitant`;
  });

  await T("[blocant] cererea e în inboxul verificatorului", async () => {
    const inbox = await call("verifier", "GET", "/api/par/inbox");
    must(inbox.status === 200 && (inbox.json.inbox ?? []).some((r) => r.id === parId), `inbox: ${JSON.stringify(inbox.json).slice(0, 200)}`);
  });

  await T("[blocant] aprobatorul nu poate sări peste verificare", async () => {
    const res = await POST("approver", `/api/par/${parId}/approve`, { comment: "sar peste" });
    must(res.status === 409 || res.status === 403, `→ ${res.status} ${JSON.stringify(res.json)}`);
  });

  await T("[blocant] pe fișă, verificatorul poate corecta și vede cui pleacă banii", async () => {
    const res = await call("verifier", "GET", `/api/par/${parId}`);
    must(res.status === 200, `GET → ${res.status} ${JSON.stringify(res.json)}`);
    must(res.json.verifier_amend === true, `verifier_amend = ${res.json.verifier_amend}`);
    must(res.json.payeeIban === IBAN, `IBAN ascuns pentru cine semnează: ${res.json.payeeIban}`);
  });

  await T("[blocant] verificatorul schimbă linia de buget; sigiliul rămâne valid; fișa arată cine", async () => {
    const res = await call("verifier", "PATCH", `/api/par/${parId}`, { budget_code_id: secondCode.id, budget_code_note: "corectat la verificare" });
    must(res.status === 200 && res.json.verifier_amended === true, `PATCH → ${res.status} ${JSON.stringify(res.json)}`);
    const after = await GET("requestor", `/api/par/${parId}`);
    must(after.json.budgetCodeId === secondCode.id, `nesalvat: ${after.json.budgetCodeId}`);
    must(after.json.status === "pending_approval", `status ${after.json.status}`);
    must(after.json.body_hash_valid === true, `body_hash_valid = ${after.json.body_hash_valid}`);
    const a = after.json.verifier_amendments ?? [];
    must(a.length === 1 && a[0].byName === "Iulian Verificator" && a[0].fields.includes("linia de buget"), JSON.stringify(a));
    return `${firstCode.code} → ${secondCode.code}`;
  });

  await T("[blocant] solicitantul primește notificarea corecturii", async () => {
    const n = await GET("requestor", "/api/notifications?limit=20");
    const list = n.json?.notifications ?? n.json?.items ?? n.json ?? [];
    const hit = Array.isArray(list) && list.some((x) => /corectată la verificare/i.test(x.body ?? x.message ?? ""));
    must(hit, `nicio notificare „corectată la verificare” (${n.status}): ${JSON.stringify(n.json).slice(0, 200)}`);
  });

  await T("[blocant] suma/beneficiarul NU se corectează la verificare (403 + ce să facă)", async () => {
    const res = await call("verifier", "PATCH", `/api/par/${parId}`, { payee_iban: "MD00XX0000000000000000" });
    must(res.status === 403 && res.json?.error === "forbidden_for_verifier", `→ ${res.status} ${JSON.stringify(res.json)}`);
    must(/Cere modificări/.test(res.json.detail ?? ""), `motivul nu spune ce să facă: ${res.json.detail}`);
    const after = await GET("requestor", `/api/par/${parId}`);
    must(after.json.payeeIban === IBAN, "IBAN-ul s-a schimbat!");
  });

  await T("[blocant] verificatorul aprobă → cererea trece la aprobatori", async () => {
    const res = await call("verifier", "POST", `/api/par/${parId}/approve`, { comment: "verificat" });
    must(res.status === 200, `approve → ${res.status} ${JSON.stringify(res.json)}`);
    const inbox = await GET("approver", "/api/par/inbox");
    must((inbox.json.inbox ?? []).some((r) => r.id === parId), "cererea nu a ajuns în inboxul aprobatorului");
  });

  await T("[blocant] după semnătura lui, verificatorul nu mai rescrie cererea", async () => {
    const res = await call("verifier", "PATCH", `/api/par/${parId}`, { budget_code_id: firstCode.id });
    must(res.status === 403, `→ ${res.status} ${JSON.stringify(res.json)}`);
  });

  await T("[blocant] aprobatorii semnează varianta corectată, fără alarmă de integritate", async () => {
    for (let round = 0; round < 4; round++) {
      for (const role of ["approver", "admin"]) {
        await POST(role, `/api/par/${parId}/approve`, { comment: "ok", signatureName: "Test" });
        const st = (await GET("admin", `/api/par/${parId}`)).json.status;
        if (["approved", "in_finance"].includes(st)) return `status ${st}`;
      }
    }
    throw new Error(`cererea n-a trecut de aprobatori (status ${(await GET("admin", `/api/par/${parId}`)).json.status})`);
  });

  await T("[blocant] „Cere modificări” de la verificator o întoarce; la re-trimitere trece iar pe la el", async () => {
    const id = await submittedPar(42000);
    const back = await call("verifier", "POST", `/api/par/${id}/request-changes`, { comment: "Linia de buget e pe alt contract." });
    must(back.status === 200, `request-changes → ${back.status} ${JSON.stringify(back.json)}`);
    must((await GET("requestor", `/api/par/${id}`)).json.status === "changes_requested", "statusul nu e changes_requested");
    const again = await POST("requestor", `/api/par/${id}/submit`, {});
    must(again.status === 200, `re-submit → ${again.status} ${JSON.stringify(again.json)}`);
    const first = (await stepsOf(id)).find((s) => s.step === 1);
    must(first?.approverUserId === verifierId && first.decision === "pending" && !first.locked, JSON.stringify(first));
  });

  await T("[blocant] NEGATIV: fără verificator setat, lanțul nu are pasul", async () => {
    const res = await PATCH("admin", `/api/par/profiles/${requestorId}`, { verifier_user_id: null });
    must(res.status === 200, `PATCH → ${res.status}`);
    const id = await submittedPar(31000);
    const steps = await stepsOf(id);
    must(!steps.some((s) => s.approverRoleLabel === "Verificare"), `pasul a apărut fără verificator: ${JSON.stringify(steps.map((s) => s.approverRoleLabel))}`);
  });
} finally {
  // Solicitantul demo e folosit de celelalte suite: nu-i lăsăm un verificator în profil.
  await PATCH("admin", `/api/par/profiles/${requestorId}`, { verifier_user_id: null }).catch(() => {});
  for (const c of Object.values(ctx)) await c.dispose();
}

console.log(`\n${passed}/${total} verificări trecute`);
if (failures.length) {
  console.log("\nEȘECURI:");
  for (const f of failures) console.log(` - ${f.name}: ${f.message}`);
  process.exit(1);
}
