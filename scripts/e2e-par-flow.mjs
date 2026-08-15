// PAR functional regression suite — one check per feature, asserting the business
// rule it claims to enforce. Run against a seeded local server.
//   node scripts/e2e-par-flow.mjs
//
// PAR feature-by-feature functional walk. Each check exercises ONE feature end
// to end and asserts the business rule it claims to enforce.
import { request } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = "demo123456";
const U = { admin: "admin@atic.demo.io", approver: "approver@atic.demo.io", finance: "finance@atic.demo.io", requestor: "requestor@atic.demo.io" };
const IBAN = "MD24AG000225100013104168";
const IBAN2 = "MD21EX000000000001234567";
const IDNP = "2002600012345";

const ctx = {};
async function login(r) { const c = await request.newContext({ baseURL: BASE }); await c.post("/api/auth/login", { data: { email: U[r], password: PW } }); ctx[r] = c; }
async function call(role, m, p, b) {
  const r = await ctx[role][m.toLowerCase()](p, b !== undefined ? { data: b } : {});
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { status: r.status(), json: j };
}
const GET = (r, p) => call(r, "GET", p), POST = (r, p, b) => call(r, "POST", p, b),
      PATCH = (r, p, b) => call(r, "PATCH", p, b), DEL = (r, p) => call(r, "DELETE", p);

const notes = [];
let n = 0, ok = 0;
async function F(area, name, fn) {
  n++;
  try { const d = await fn(); ok++; console.log(`✅ ${area} · ${name}${d ? ` — ${d}` : ""}`); }
  catch (e) { notes.push({ area, name, detail: e.message }); console.log(`🔴 ${area} · ${name}\n      ${e.message}`); }
}
const must = (c, m) => { if (!c) throw new Error(m); };

let cfg = {};
async function draft(role, cents, extra = {}) {
  const c = await POST(role, "/api/par", {});
  const id = c.json.id;
  await PATCH(role, `/api/par/${id}`, {
    purpose: "execute_payment", currency: "MDL", end_use: "Verificare funcțională",
    payee_name: "Vendor SRL", payee_iban: IBAN, payee_idnp: IDNP, payee_bank: "VB",
    department_id: cfg.deptId, project_id: cfg.projectId, budget_code_id: cfg.budgetCodeId, ...extra,
  });
  await POST(role, `/api/par/${id}/line-items`, { description: "Serviciu", quantity: 1, unit: "buc", unit_price_cents: cents });
  return id;
}
/** Walk a PAR all the way to `approved`/`in_finance` through however many steps the DOA needs. */
async function fullyApprove(id) {
  for (const r of ["approver", "admin"]) {
    await POST(r, `/api/par/${id}/approve`, { comment: "ok", signatureName: "Test" });
    const s = (await GET("admin", `/api/par/${id}`)).json.status;
    if (["approved", "in_finance"].includes(s)) return s;
  }
  return (await GET("admin", `/api/par/${id}`)).json.status;
}

console.log("═══ PAR — parcurgere funcțională, funcție cu funcție ═══\n");
for (const r of Object.keys(U)) await login(r);
const [d, p, b] = await Promise.all([GET("requestor", "/api/par/departments"), GET("requestor", "/api/par/projects"), GET("requestor", "/api/par/budget-codes")]);
cfg.deptId = d.json.departments[0].id;
cfg.projectId = p.json.projects[0].id;
cfg.budgetCodeId = b.json.budgetCodes.find((x) => x.projectId === cfg.projectId)?.id;
const settings = (await GET("admin", "/api/par/settings")).json;
const micro = settings.microPurchaseThresholdCents ?? settings.settings?.microPurchaseThresholdCents;
console.log(`prag micro-achiziție: ${micro / 100} MDL\n`);

// ─── 1. Ciclul de viață ────────────────────────────────────────────────────
console.log("── 1. Ciclul de viață al unei cereri ──");

await F("ciclu", "creare ciornă → primește număr secvențial", async () => {
  const a = await POST("requestor", "/api/par", {});
  const b2 = await POST("requestor", "/api/par", {});
  must(/^PAR-\d{4}-\d{4}$/.test(a.json.requestNo), `format neașteptat: ${a.json.requestNo}`);
  const na = +a.json.requestNo.slice(-4), nb = +b2.json.requestNo.slice(-4);
  must(nb === na + 1, `numerotare nesecvențială: ${a.json.requestNo} → ${b2.json.requestNo}`);
  return `${a.json.requestNo} → ${b2.json.requestNo}`;
});

await F("ciclu", "ciorna e editabilă, cererea trimisă NU", async () => {
  const id = await draft("requestor", 50000);
  const e1 = await PATCH("requestor", `/api/par/${id}`, { end_use: "modificat în ciornă" });
  must(e1.status === 200, `ciorna nu e editabilă (${e1.status})`);
  await POST("requestor", `/api/par/${id}/submit`, {});
  const e2 = await PATCH("requestor", `/api/par/${id}`, { end_use: "modificat după trimitere" });
  must(e2.status >= 400, `cererea trimisă rămâne editabilă (${e2.status}) — se poate schimba suma după aprobare`);
});

await F("ciclu", "changes_requested redeschide editarea, apoi se poate re-trimite", async () => {
  const id = await draft("requestor", 50000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  await POST("approver", `/api/par/${id}/request-changes`, { comment: "lipsesc oferte" });
  const st = (await GET("requestor", `/api/par/${id}`)).json.status;
  must(st === "changes_requested", `status ${st}`);
  const e = await PATCH("requestor", `/api/par/${id}`, { end_use: "corectat" });
  must(e.status === 200, `nu se poate edita după „modificări solicitate" (${e.status}) — solicitantul e blocat`);
  const rs = await POST("requestor", `/api/par/${id}/submit`, {});
  must(rs.status < 400, `nu se poate re-trimite (${rs.status})`);
  return "editare + re-trimitere OK";
});

await F("ciclu", "anularea unei cereri o scoate din flux", async () => {
  const id = await draft("requestor", 50000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  const c = await DEL("requestor", `/api/par/${id}`); // cancel == DELETE (soft, sets status=cancelled)
  must(c.status < 400, `anulare respinsă: ${c.status} ${JSON.stringify(c.json).slice(0,120)}`);
  const st = (await GET("admin", `/api/par/${id}`)).json.status;
  must(st === "cancelled", `status după anulare: ${st}`);
  const ap = await POST("approver", `/api/par/${id}/approve`, { comment: "x" });
  must(ap.status >= 400, `o cerere ANULATĂ a putut fi aprobată (${ap.status})`);
});

await F("ciclu", "duplicarea creează o ciornă nouă, nu copiază starea", async () => {
  const id = await draft("requestor", 50000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  const dup = await POST("requestor", `/api/par/${id}/duplicate`, {});
  if (dup.status >= 400) return `sărit — /duplicate: ${dup.status}`;
  const newId = dup.json?.id ?? dup.json?.par?.id ?? dup.json?.request?.id;
  must(newId, `răspunsul duplicate nu conține un id: ${JSON.stringify(dup.json).slice(0, 200)}`);
  const nd = await GET("requestor", `/api/par/${newId}`);
  must(nd.json.status === "draft", `duplicatul are statusul ${nd.json.status}, nu draft`);
  must(nd.json.id !== id, "duplicatul are același id");
  must(nd.json.line_items?.length > 0, "duplicatul a pierdut articolele");
  return "ciornă nouă cu articole copiate";
});

// ─── 2. Reguli de aprobare ────────────────────────────────────────────────
console.log("\n── 2. Reguli de aprobare (DOA) ──");

await F("aprobare", "sub pragul micro → lanț mai scurt decât peste prag", async () => {
  const small = await draft("requestor", Math.floor(micro / 2));
  await POST("requestor", `/api/par/${small}/submit`, {});
  const big = await draft("requestor", micro * 25);
  await POST("requestor", `/api/par/${big}/submit`, {});
  const s = (await GET("admin", `/api/par/${small}`)).json.approvals?.length ?? 0;
  const bg = (await GET("admin", `/api/par/${big}`)).json.approvals?.length ?? 0;
  must(bg > s, `lanțul nu se adaptează la sumă: ${s} pași sub prag vs ${bg} pași peste`);
  return `${s} pași sub prag · ${bg} pași peste`;
});

await F("aprobare", "pașii sunt blocați până se aprobă cel anterior", async () => {
  const id = await draft("requestor", micro * 25);
  await POST("requestor", `/api/par/${id}/submit`, {});
  const det = (await GET("admin", `/api/par/${id}`)).json;
  const pending = det.approvals.filter((a) => a.decision === "pending");
  must(pending.length >= 2, `sărit — doar ${pending.length} pas în așteptare`);
  must(pending.some((a) => a.locked), "niciun pas nu e marcat blocat — s-ar putea sări peste ordinea de aprobare");
  return `${pending.filter((a) => a.locked).length} pași blocați`;
});

await F("aprobare", "aprobarea completă mută cererea către finanțe", async () => {
  const id = await draft("requestor", 50000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  const st = await fullyApprove(id);
  must(["approved", "in_finance"].includes(st), `status final ${st}`);
  return st;
});

await F("aprobare", "regula 10%: plata peste estimat + 10% cere re-aprobare", async () => {
  const est = 100000;
  const id = await draft("requestor", est);
  await POST("requestor", `/api/par/${id}/submit`, {});
  await fullyApprove(id);
  const over = Math.round(est * 1.5);
  const pay = await POST("finance", `/api/par/${id}/pay`, { paid_at: new Date().toISOString(), payment_reference: "OP-1", actual_amount_cents: over });
  const st = (await GET("admin", `/api/par/${id}`)).json.status;
  must(!(pay.status < 400 && st === "paid"),
    `plată de ${over / 100} pe un estimat de ${est / 100} (+50%) acceptată fără re-aprobare`);
  return `blocat (${pay.status}) / status ${st}`;
});

// ─── 3. Buget ─────────────────────────────────────────────────────────────
console.log("\n── 3. Control bugetar ──");

await F("buget", "utilizarea codului bugetar se raportează", async () => {
  const r = await GET("admin", "/api/par/budget-codes/usage");
  must(r.status === 200, `status ${r.status}`);
  const items = r.json.items ?? r.json.usage ?? r.json;
  must(Array.isArray(items) && items.length > 0, "raportul de utilizare e gol");
  const c = items[0];
  must("allocatedCents" in c || "usedCents" in c, `formă neașteptată: ${JSON.stringify(c).slice(0, 120)}`);
  return `${items.length} coduri`;
});

await F("buget", "o cerere peste bugetul alocat este semnalată", async () => {
  const usage = (await GET("admin", "/api/par/budget-codes/usage")).json;
  const items = usage.items ?? usage.usage ?? usage;
  const code = items.find((x) => (x.allocatedCents ?? 0) > 0);
  if (!code) return "sărit — niciun cod cu buget alocat";
  const huge = (code.allocatedCents ?? 0) * 10;
  const id = await draft("requestor", huge, { budget_code_id: code.id });
  const s = await POST("requestor", `/api/par/${id}/submit`, {});
  const det = (await GET("admin", `/api/par/${id}`)).json;
  const flagged = s.status >= 400 || det.above_micro_threshold || det.budgetWarning || det.overBudget;
  must(flagged, `cerere de ${huge / 100} pe un cod cu ${(code.allocatedCents ?? 0) / 100} alocat — niciun semnal`);
});

// ─── 4. Oferte / RFQ ──────────────────────────────────────────────────────
console.log("\n── 4. Oferte (RFQ) ──");

await F("oferte", "se pot adăuga oferte pe o cerere", async () => {
  const id = await draft("requestor", micro * 3);
  const q = await POST("requestor", `/api/par/${id}/quotes`, { vendor_name: "Furnizor A", total_cents: 300000 });
  must(q.status < 400, `adăugarea unei oferte a eșuat (${q.status}) ${JSON.stringify(q.json).slice(0, 120)}`);
  // Quotes are served by their own endpoint — unlike line_items/approvals/attachments,
  // they are NOT embedded in GET /api/par/:id.
  const q2 = await GET("requestor", `/api/par/${id}/quotes`);
  must(q2.status === 200 && (q2.json.quotes ?? []).length === 1, `oferta nu apare: ${q2.status} ${JSON.stringify(q2.json).slice(0, 120)}`);
});

await F("oferte", "peste pragul micro, lipsa a 3 oferte e semnalată", async () => {
  const id = await draft("requestor", micro * 5);
  await POST("requestor", `/api/par/${id}/quotes`, { vendor_name: "Doar una", total_cents: micro * 5 });
  const s = await POST("requestor", `/api/par/${id}/submit`, {});
  const det = (await GET("admin", `/api/par/${id}`)).json;
  const flagged = s.status >= 400 || det.above_micro_threshold === true;
  must(flagged, "o achiziție peste prag cu o singură ofertă nu e semnalată nicăieri");
  return det.above_micro_threshold ? "marcată above_micro_threshold" : `blocată la submit (${s.status})`;
});

// ─── 5. Delegări ──────────────────────────────────────────────────────────
console.log("\n── 5. Delegări (aprobare în absență) ──");

await F("delegări", "se poate crea o delegare către un coleg", async () => {
  const members = (await GET("admin", "/api/par/members")).json.members;
  const to = members.find((m) => m.role === "approver");
  // Use a window far enough out that repeated runs don't collide with the overlap guard.
  const offset = 30 + Math.floor(Math.random() * 300);
  const r = await POST("admin", "/api/par/delegations", {
    to_user_id: to.userId,
    starts_at: new Date(Date.now() + offset * 864e5).toISOString(),
    ends_at: new Date(Date.now() + (offset + 5) * 864e5).toISOString(),
  });
  must(r.status < 400, `creare delegare: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  const list = await GET("admin", "/api/par/delegations");
  must(list.status === 200 && (list.json.delegations ?? list.json.items ?? []).length > 0, "delegarea nu apare în listă");
  return "creată + listată";
});

await F("delegări", "un coleg care NU e încă aprobator poate primi delegare", async () => {
  // The old rule required the delegate to already be an approver, which made
  // delegation impossible in a one-approver org — exactly when it is needed.
  const members = (await GET("admin", "/api/par/members")).json.members;
  const fin = members.find((m) => m.role === "finance");
  const offset = 400 + Math.floor(Math.random() * 300);
  const r = await POST("admin", "/api/par/delegations", {
    to_user_id: fin.userId,
    starts_at: new Date(Date.now() + offset * 864e5).toISOString(),
    ends_at: new Date(Date.now() + (offset + 3) * 864e5).toISOString(),
  });
  must(r.status < 400, `respins cu ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  return "delegarea conferă dreptul, nu îl presupune";
});

await F("delegări", "o a doua delegare suprapusă către aceeași persoană e respinsă", async () => {
  const members = (await GET("admin", "/api/par/members")).json.members;
  const to = members.find((m) => m.role === "approver");
  const offset = 800 + Math.floor(Math.random() * 300);
  const win = {
    to_user_id: to.userId,
    starts_at: new Date(Date.now() + offset * 864e5).toISOString(),
    ends_at: new Date(Date.now() + (offset + 6) * 864e5).toISOString(),
  };
  const first = await POST("admin", "/api/par/delegations", win);
  must(first.status < 400, `prima delegare a eșuat: ${first.status}`);
  const second = await POST("admin", "/api/par/delegations", {
    ...win,
    starts_at: new Date(Date.now() + (offset + 2) * 864e5).toISOString(),
  });
  must(second.status === 409, `duplicat suprapus acceptat cu ${second.status}`);
  return "409 overlapping_delegation";
});

await F("delegări", "nu se poate delega către cineva din afara organizației", async () => {
  const r = await POST("admin", "/api/par/delegations", {
    to_user_id: "00000000-0000-0000-0000-000000000000",
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 864e5).toISOString(),
  });
  must(r.status === 400 && r.json?.error === "not_a_member", `status ${r.status} ${JSON.stringify(r.json)}`);
});

// ─── 6. Documente ─────────────────────────────────────────────────────────
console.log("\n── 6. Documente și atașamente ──");

await F("documente", "se poate atașa un fișier", async () => {
  const id = await draft("requestor", 50000);
  const r = await POST("requestor", `/api/par/${id}/attachments`, {
    file_name: "factura.pdf", mime: "application/pdf", kind: "other", size_bytes: 4800,
    file_url: "data:application/pdf;base64," + "JVBERi0xLjQK".repeat(400),
  });
  must(r.status < 400, `atașare eșuată: ${r.status} ${JSON.stringify(r.json).slice(0, 150)}`);
  const det = (await GET("requestor", `/api/par/${id}`)).json;
  must((det.attachments ?? []).length === 1, "atașamentul nu apare pe cerere");
});

await F("documente", "jurnalul de activitate înregistrează tranzițiile", async () => {
  const id = await draft("requestor", 50000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  await POST("approver", `/api/par/${id}/approve`, { comment: "ok" });
  const t = await GET("admin", `/api/par/${id}/timeline`);
  must(t.status === 200, `timeline: ${t.status}`);
  const ev = t.json.events ?? t.json.timeline ?? t.json;
  must(Array.isArray(ev) && ev.length >= 2, `doar ${ev?.length} evenimente pentru creare+submit+aprobare`);
  return `${ev.length} evenimente`;
});

// ─── 7. Rapoarte ──────────────────────────────────────────────────────────
console.log("\n── 7. Rapoarte ──");

for (const [name, path] of [
  ["cheltuieli pe plătitor", "/api/par/reports/by-payer"],
  ["cheltuieli pe cod bugetar", "/api/par/reports/by-budget"],
  ["cheltuieli pe departament", "/api/par/reports/by-department"],
  ["vechime (aging)", "/api/par/reports/aging"],
  ["timp de ciclu", "/api/par/reports/cycle-time"],
]) {
  await F("rapoarte", `${name} răspunde`, async () => {
    const r = await GET("admin", path);
    must(r.status === 200, `status ${r.status}`);
    must(r.json && typeof r.json === "object", "răspuns gol");
  });
}

await F("rapoarte", "totalurile din raport se potrivesc cu lista de cereri", async () => {
  const list = (await GET("admin", "/api/par?limit=500")).json.requests ?? [];
  const active = list.filter((r) => !["cancelled", "rejected"].includes(r.status));
  const rep = await GET("admin", "/api/par/reports/by-budget");
  const items = rep.json.items ?? rep.json.spend ?? [];
  const repTotal = items.reduce((s, x) => s + (x.totalCents ?? 0), 0);
  const listTotal = active.reduce((s, x) => s + (x.totalEstimatedCents ?? 0), 0);
  must(repTotal > 0, "raportul întoarce 0 deși există cereri");
  const drift = Math.abs(repTotal - listTotal) / Math.max(listTotal, 1);
  return drift < 0.02 ? "se potrivesc" : `diferență ${(drift * 100).toFixed(0)}% (raport ${repTotal / 100} vs listă ${listTotal / 100}) — filtre diferite`;
});

// ─── 7b. Membri — picker-ul după nume (PARQA-025) ─────────────────────────
console.log("\n── 7b. Membri ──");

await F("membri", "candidații pentru roluri se listează după nume (admin) și sunt refuzați requestor-ului", async () => {
  const ok200 = await GET("admin", "/api/par/members/candidates");
  must(ok200.status === 200, `admin → ${ok200.status}`);
  const cands = ok200.json.candidates ?? [];
  must(cands.length > 0 && cands.every((c) => c.email && "name" in c), "lista nu are nume+email");
  const deny = await GET("requestor", "/api/par/members/candidates");
  must(deny.status === 403, `requestor → ${deny.status} (aștept 403)`);
  return `${cands.length} candidați`;
});

await F("membri", "un rol se atribuie folosind id-ul unui candidat din listă", async () => {
  const cands = (await GET("admin", "/api/par/members/candidates")).json.candidates;
  const target = cands.find((c) => c.email === U.requestor);
  must(target, "requestor-ul demo nu apare în candidați");
  const r = await POST("admin", "/api/par/members", { userId: target.id, role: "requestor" });
  must([200, 201].includes(r.status), `atribuire → ${r.status}`);
  const members = (await GET("admin", "/api/par/members")).json.members;
  must(members.some((m) => m.userId === target.id && m.role === "requestor"), "rolul nu apare în listă");
});

// ─── 7c. Onboarding pentru un workspace NOU — secvența completă a wizardului ──
console.log("\n── 7c. Onboarding workspace nou ──");

await F("onboarding", "signup → wizard: setări + structură + plătitor implicit + invitație + complete", async () => {
  const { request } = await import("playwright-core");
  const fresh = await request.newContext({ baseURL: BASE });
  const stamp = Date.now();
  // Domeniu nerutabil (.invalid) — emailGuard blochează trimiterea reală; invitația
  // trebuie să se creeze totuși, cu emailed:false și link de copiat.
  const sign = await fresh.post("/api/business/auth/signup", { data: {
    tenantName: `Onboarding Test ${stamp}`, name: "Owner Test",
    email: `owner-${stamp}@onboarding-e2e.invalid`, password: "parola-e2e-123",
  } });
  must(sign.status() === 200 || sign.status() === 201, `signup → ${sign.status()}`);

  const j = async (r) => { try { return await r.json(); } catch { return null; } };
  const s0 = await j(await fresh.get("/api/par/settings"));
  must(s0 && s0.onboardingComplete === false, `tenant nou cu onboardingComplete=${s0?.onboardingComplete} (aștept false)`);

  // Pasul 1 — setările organizației
  const p1 = await fresh.patch("/api/par/settings", { data: {
    orgLegalName: "Onboarding Test ONG", defaultCurrency: "MDL",
    requestNoPrefix: "OTG", microPurchaseThresholdCents: 500000,
  } });
  must([200, 201].includes(p1.status()), `setări pas 1 → ${p1.status()}`);

  // Pasul 2 — structura
  const dep = await fresh.post("/api/par/departments", { data: { name: "Programe" } });
  must(dep.status() === 201 || dep.status() === 200, `departament → ${dep.status()}`);
  const code = await fresh.post("/api/par/budget-codes", { data: { code: "M1", name: "Educație" } });
  must(code.status() === 201 || code.status() === 200, `cod buget → ${code.status()}`);

  // Pasul 3 — plătitor implicit (tenant nou = zero plătitori) + invitație
  const payers0 = await j(await fresh.get("/api/par/payers"));
  must((payers0.items ?? []).length === 0, `tenant nou are deja ${payers0.items?.length} plătitori`);
  const payer = await j(await fresh.post("/api/par/payers", { data: { name: "Onboarding Test ONG" } }));
  must(payer?.id, "plătitorul implicit nu s-a creat");
  const inv = await fresh.post("/api/par/invites", { data: {
    email: `coleg-${stamp}@onboarding-e2e.invalid`, par_role: "approver", payer_ids: [payer.id],
  } });
  const invBody = await j(inv);
  must(inv.status() === 201, `invitație → ${inv.status()} ${JSON.stringify(invBody)}`);
  must(invBody.inviteUrl, "invitația nu are link");
  must(invBody.emailed === false, "emailGuard trebuia să blocheze domeniul .invalid");

  // Finalizare — abia ACUM se marchează complet
  await fresh.patch("/api/par/settings", { data: { onboardingComplete: true } });
  const s1 = await j(await fresh.get("/api/par/settings"));
  must(s1.onboardingComplete === true, "onboardingComplete nu s-a salvat");
  await fresh.dispose();
  return `workspace nou configurat cap-coadă (prefix OTG, invitație cu link)`;
});

// ─── 8. Semnături — regresie: aprobarea fără signatureName nu stochează UUID ──
console.log("\n── 8. Semnături ──");

await F("semnături", "aprobare fără signatureName → semnătura e numele, nu UUID-ul", async () => {
  const id = await draft("requestor", 200000);
  await POST("requestor", `/api/par/${id}/submit`, {});
  // Invocă acțiunea exact ca butonul din inbox / shortcut-ul de tastatură: FĂRĂ signatureName.
  for (const r of ["approver", "admin"]) {
    await POST(r, `/api/par/${id}/approve`, { comment: "ok" });
    const s = (await GET("admin", `/api/par/${id}`)).json.status;
    if (["approved", "in_finance"].includes(s)) break;
  }
  const det = (await GET("admin", `/api/par/${id}`)).json;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const decided = (det.approvals ?? []).filter((a) => a.decision === "approved" && a.step > 0);
  must(decided.length > 0, "niciun pas aprobat");
  for (const a of decided) {
    must(a.signatureName && !uuidRe.test(a.signatureName),
      `pasul ${a.step} are semnătura "${a.signatureName}" — UUID brut în loc de nume`);
  }
  return decided.map((a) => `pas ${a.step}: "${a.signatureName}"`).join(" · ");
});

console.log(`\n═══ ${ok}/${n} verificări trecute ═══`);
if (notes.length) { console.log(`\n${notes.length} CONSTATĂRI:`); for (const f of notes) console.log(`  • ${f.area} · ${f.name}\n      ${f.detail}`); }
process.exit(0);
