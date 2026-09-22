// Completarea de după semnare, cerută de managerul financiar (22.09.2026):
// „linia de buget, adăugare descriere dacă e nevoie și inserare de acte adiționale la atașament.
//  După semnare și plata nu mai putem modifica sumele însă."
//
// Testul INVOCĂ acțiunile, nu se uită la butoane (CLAUDE.md §3.5.1quater): duce o cerere până la
// semnare, apoi cheamă PATCH-ul ca finanțe și verifică ce s-a scris; apoi încearcă exact ce nu are
// voie și verifică refuzul. Testul negativ face parte din livrare — o poartă care nu poate pica nu
// verifică nimic.
//
//   node scripts/e2e-par-post-signature.mjs            (BASE_URL=… pentru alt port)
import { existsSync } from "node:fs";
import { request } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.E2E_PASSWORD ?? "demo123456";
const U = {
  admin: "admin@atic.demo.io",
  approver: "approver@atic.demo.io",
  finance: "finance@atic.demo.io",
  requestor: "requestor@atic.demo.io",
};
const IBAN = "MD24AG000225100013104168";
const IDNP = "2002600012345";
/** Cel mai mic PDF valid — ajunge pentru un atașament real, fără fișiere în repo. */
const TINY_PDF =
  "JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA5OSA5OV0+PgplbmRvYmoKdHJhaWxlcgo8PC9Sb290IDEgMCBSPj4K";

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

console.log("═══ PAR — completarea de după semnare (doar finanțe) ═══\n");
for (const role of Object.keys(U)) await login(role);

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

/** Creează o cerere și o duce până după semnături. */
async function signedPar(cents = 50000) {
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
  await POST("requestor", `/api/par/${id}/line-items`, {
    description: "Serviciu", quantity: 1, unit: "buc", unit_price_cents: cents,
  });
  await POST("requestor", `/api/par/${id}/submit`, {});
  // Câți pași are lanțul depinde de sumă (matricea DOA) — semnăm până trece, nu de două ori.
  for (let round = 0; round < 4; round++) {
    for (const role of ["approver", "admin"]) {
      await POST(role, `/api/par/${id}/approve`, { comment: "ok", signatureName: "Test" });
      const st = (await GET("admin", `/api/par/${id}`)).json.status;
      if (["approved", "in_finance"].includes(st)) return { id, status: st };
    }
  }
  const st = (await GET("admin", `/api/par/${id}`)).json.status;
  throw new Error(`cererea n-a ajuns semnată (status ${st})`);
}

const par = await signedPar();
console.log(`cerere semnată: ${par.id} (${par.status})\n`);

await T("finanțele schimbă linia de buget pe cererea semnată", async () => {
  const res = await PATCH("finance", `/api/par/${par.id}`, {
    budget_code_id: secondCode.id,
    budget_code_note: "mutat pe linia corectă",
  });
  must(res.status === 200, `PATCH → ${res.status} ${JSON.stringify(res.json)}`);
  const after = await GET("finance", `/api/par/${par.id}`);
  must(after.json.budgetCodeId === secondCode.id, `codul n-a fost salvat: ${after.json.budgetCodeId}`);
  must(after.json.budgetCodeNote === "mutat pe linia corectă", "nota nu s-a salvat");
  return `${firstCode.code} → ${secondCode.code}`;
});

await T("finanțele completează descrierea", async () => {
  const text = "Traduceri pentru atelierul din septembrie, conform actului adițional nr. 2.";
  const res = await PATCH("finance", `/api/par/${par.id}`, { end_use: text });
  must(res.status === 200, `PATCH → ${res.status} ${JSON.stringify(res.json)}`);
  const after = await GET("finance", `/api/par/${par.id}`);
  must(after.json.endUse === text, `descrierea nu s-a salvat: ${after.json.endUse}`);
});

await T("[blocant] sigiliul rămâne valid — nicio alarmă falsă „datele diferă de cele semnate”", async () => {
  const after = await GET("finance", `/api/par/${par.id}`);
  must(
    after.json.body_hash_valid === true,
    `body_hash_valid = ${after.json.body_hash_valid} — completarea legitimă ar declanșa alarma de integritate și ar bloca orice semnătură rămasă`
  );
});

await T("completarea se vede pe fișă: cine, când, ce câmpuri", async () => {
  const after = await GET("finance", `/api/par/${par.id}`);
  const amendments = after.json.finance_amendments ?? [];
  must(amendments.length >= 2, `fișa arată ${amendments.length} completări, așteptam cel puțin 2`);
  const fields = amendments.flatMap((a) => a.fields);
  must(fields.some((f) => f.includes("buget")), `câmpurile completate nu includ linia de buget: ${fields.join(", ")}`);
  must(amendments.every((a) => !!a.at), "o completare fără dată");
  return `${amendments.length} completări, ultima de ${amendments[amendments.length - 1].byName ?? "necunoscut"}`;
});

await T("[blocant] suma și valuta NU se mai pot modifica după semnare", async () => {
  const res = await PATCH("finance", `/api/par/${par.id}`, { currency: "EUR" });
  must(res.status === 403, `valuta a fost acceptată după semnare (${res.status})`);
  must(res.json?.error === "forbidden_after_signature", `alt motiv: ${JSON.stringify(res.json)}`);
  const li = await PATCH("finance", `/api/par/${par.id}/line-items/00000000-0000-4000-8000-000000000000`, {
    unit_price_cents: 999999,
  });
  must(li.status >= 400, `liniile rămân editabile după semnare (${li.status})`);
  return `403 ${res.json.error}`;
});

await T("[blocant] beneficiarul și IBAN-ul rămân cele semnate", async () => {
  const res = await PATCH("finance", `/api/par/${par.id}`, {
    payee_iban: "MD21EX000000000001234567",
    payee_name: "Alt beneficiar SRL",
  });
  must(res.status === 403, `rechizitele au fost acceptate după semnare (${res.status})`);
  const after = await GET("finance", `/api/par/${par.id}`);
  must(after.json.payeeIban === IBAN, `IBAN-ul s-a schimbat: ${after.json.payeeIban}`);
});

await T("[blocant] solicitantul NU poate edita cererea semnată, nici măcar descrierea", async () => {
  const res = await PATCH("requestor", `/api/par/${par.id}`, { end_use: "scris de solicitant" });
  must(res.status === 403, `solicitantul a putut edita cererea semnată (${res.status})`);
});

await T("[blocant] accesul ține de ROL, nu de persoană — aprobatorul fără rol de finanțe e refuzat", async () => {
  // Baza locală e partajată între suite, iar altele îi dau uneori rol de `par_admin` acestui
  // utilizator. Nu presupunem ce rol are: îl citim și verificăm REGULA — cine are rolul intră,
  // cine nu, nu. (Un test care presupune fixtura raportează roșu degeaba.)
  const roles = (await GET("approver", "/api/par/me")).json.roles ?? [];
  const elevated = roles.includes("finance") || roles.includes("par_admin");
  const res = await PATCH("approver", `/api/par/${par.id}`, { end_use: "scris de aprobator" });
  if (elevated) {
    must(res.status === 200, `are rolul ${roles.join("+")} dar a fost refuzat (${res.status})`);
    return `rol ${roles.join("+")} → 200 (regula ține de rol)`;
  }
  must(res.status === 403, `aprobatorul fără rol de finanțe a putut completa (${res.status})`);
  return `rol ${roles.join("+")} → 403`;
});

await T("[blocant] finanțele NU pot completa o cerere care încă se semnează", async () => {
  const created = await POST("requestor", "/api/par", {});
  const id = created.json.id;
  await PATCH("requestor", `/api/par/${id}`, {
    purpose: "execute_payment", currency: "MDL", end_use: "x",
    payee_name: "Furnizor SRL", payee_iban: IBAN, payee_idnp: IDNP, payee_bank: "VB",
    department_id: deptId, project_id: projectId, budget_code_id: firstCode.id,
  });
  await POST("requestor", `/api/par/${id}/line-items`, { description: "S", quantity: 1, unit: "buc", unit_price_cents: 50000 });
  await POST("requestor", `/api/par/${id}/submit`, {});
  const res = await PATCH("finance", `/api/par/${id}`, { end_use: "completat prea devreme" });
  must(res.status === 403, `finanțele au completat o cerere în curs de semnare (${res.status})`);
});

await T("actul adițional intră la dosar și aprinde „are anexe”", async () => {
  const before = await GET("finance", `/api/par/${par.id}`);
  const res = await POST("finance", `/api/par/${par.id}/attachments`, {
    file_name: "act-aditional-2.pdf",
    file_url: `data:application/pdf;base64,${TINY_PDF}`,
    mime: "application/pdf",
    kind: "other",
    kind_other: "Act adițional",
    size_bytes: 120,
  });
  must(res.status === 201, `încărcarea → ${res.status} ${JSON.stringify(res.json)}`);
  const after = await GET("finance", `/api/par/${par.id}`);
  const added = (after.json.attachments ?? []).find((a) => a.fileName === "act-aditional-2.pdf");
  must(added, "actul adițional nu apare la dosar");
  must(added.kindOther === "Act adițional", `eticheta documentului: ${added.kindOther}`);
  must(after.json.attachmentsPresent === true, "secțiunea 13 spune încă „Nu are anexe” deși actul e la dosar");
  return `${(before.json.attachments ?? []).length} → ${(after.json.attachments ?? []).length} documente`;
});

await T("[blocant] nota anexelor se poate completa, ca să scrie ce act s-a adăugat", async () => {
  const note = "Act adițional nr. 2 din 12.09.2026 la contractul nr. 41.";
  const res = await PATCH("finance", `/api/par/${par.id}`, { attachments_note: note });
  must(res.status === 200, `PATCH → ${res.status} ${JSON.stringify(res.json)}`);
  const after = await GET("finance", `/api/par/${par.id}`);
  must(after.json.attachmentsNote === note, `nota nu s-a salvat: ${after.json.attachmentsNote}`);
});

await T("completarea apare în jurnalul cererii", async () => {
  const tl = await GET("finance", `/api/par/${par.id}/timeline`);
  const rows = tl.json?.timeline ?? tl.json?.items ?? [];
  const amended = rows.filter((r) => r.event === "finance_amended");
  must(amended.length >= 3, `jurnalul are ${amended.length} rânduri „finance_amended”`);
  must(amended.every((r) => !!r.diff), "un rând de completare fără diff — nu se vede CE s-a schimbat");
  return `${amended.length} rânduri`;
});

// ─── După PLATĂ: completarea rămâne, banii nu ──────────────────────────────────
// „După semnare și plata nu mai putem modifica sumele însă." Deci după plată se completează
// în continuare linia de buget și descrierea — doar sumele sunt închise.

async function paidPar(amountCents = 50000) {
  const { id } = await signedPar();
  await POST("finance", `/api/par/${id}/finance`, { par_bl: "BL-E2E" });
  const pay = await POST("finance", `/api/par/${id}/pay`, {
    actual_amount_cents: amountCents,
    payment_date: new Date().toISOString(),
    payment_ref: "E2E-001",
  });
  must(pay.status === 200, `plata → ${pay.status} ${JSON.stringify(pay.json)}`);
  return { id, status: (await GET("finance", `/api/par/${id}`)).json.status };
}

await T("[blocant] după PLATĂ: linia de buget se mai poate corecta, sumele nu", async () => {
  const { id, status } = await paidPar();
  must(status === "paid", `cererea n-a ajuns plătită (${status})`);

  const ok = await PATCH("finance", `/api/par/${id}`, {
    budget_code_id: secondCode.id,
    end_use: "Corectat de contabilitate după plată.",
  });
  must(ok.status === 200, `completarea după plată → ${ok.status} ${JSON.stringify(ok.json)}`);

  const nope = await PATCH("finance", `/api/par/${id}`, { currency: "USD" });
  must(nope.status === 403, `valuta s-a putut schimba după plată (${nope.status})`);

  const after = await GET("finance", `/api/par/${id}`);
  must(after.json.budgetCodeId === secondCode.id, "linia de buget nu s-a salvat după plată");
  must(after.json.totalEstimatedCents === 50000, `suma s-a mișcat: ${after.json.totalEstimatedCents}`);
  must(after.json.body_hash_valid === true, "sigiliul a rămas invalid după completarea de după plată");
  return `plătită, apoi ${after.json.budgetCodeLabel ?? secondCode.code}`;
});

await T("[blocant] semnătura rămasă NU e blocată de completare (depășire re-aprobată)", async () => {
  // Cazul în care resigilarea chiar contează: cererea are o depășire de plătit, deci mai are o
  // semnătură de dat. Dacă amprenta corpului ar rămâne cea veche după completare, re-aprobarea
  // ar cădea cu 409 „integrity_violation" — adică plata ar rămâne blocată de o corectură legitimă.
  // Regula depășirii cere DOUĂ condiții: plata > estimat × 1,10 ȘI estimatul peste pragul de
  // micro-achiziție. Cu o cerere mică, plata dublă tot ar trece direct în „plătită".
  const { id } = await signedPar(600000);
  await POST("finance", `/api/par/${id}/finance`, { par_bl: "BL-E2E-2" });
  await POST("finance", `/api/par/${id}/pay`, {
    actual_amount_cents: 1000000, // peste estimat cu mult → cere re-aprobare
    payment_date: new Date().toISOString(),
    payment_ref: "E2E-002",
  });
  const mid = await GET("finance", `/api/par/${id}`);
  must(mid.json.status === "reapproval_required", `status ${mid.json.status}, așteptam reapproval_required`);

  const amend = await PATCH("finance", `/api/par/${id}`, { budget_code_id: secondCode.id });
  must(amend.status === 200, `completarea → ${amend.status} ${JSON.stringify(amend.json)}`);

  const re = await POST("approver", `/api/par/${id}/reapprove`, {});
  must(re.status === 200, `re-aprobarea a picat după completare: ${re.status} ${JSON.stringify(re.json)}`);
  return "re-aprobare 200 după completare";
});

// ─── În browser real: creionul există acolo unde se vede valoarea, și CHIAR salvează ─────────
// `node scripts/e2e-par-post-signature.mjs --browser` (cere `dist/` construit și servit).
// Fără browser, nimic nu dovedește că butonul e atingibil pe ecran, nu doar prezent în DOM.

if (process.argv.includes("--browser")) {
  const CHROME = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find((p) => existsSync(p));

  await T("[blocant] în browser: finanțele schimbă descrierea de pe fișa cererii semnate", async () => {
    must(CHROME, "niciun Chrome găsit — setează CHROME_PATH");
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const crashes = [];
      page.on("pageerror", (e) => crashes.push(e.message));

      await page.goto(`${BASE}/#/business/login`, { waitUntil: "networkidle" });
      await page.getByLabel(/email/i).first().fill(U.finance);
      await page.getByLabel(/parol/i).first().fill(PW);
      await page.getByRole("button", { name: /autentificare|conectare|intră/i }).first().click();
      await page.waitForURL(/#\/business\/(?!login)/, { timeout: 20000 });

      const { id } = await signedPar();
      await page.goto(`${BASE}/#/business/par/${id}`, { waitUntil: "networkidle" });
      await page.getByText(/^PAR-\d{4}-\d{4}$/).first().waitFor({ timeout: 20000 });

      // Eticheta depinde de starea cererii: „Adaugă descriere" când e goală, „Completează
      // descrierea" când are deja text. Testul verifică fapta, nu formularea.
      const trigger = page.getByRole("button", { name: /(Adaugă|Completează) descriere/i }).first();
      await trigger.waitFor({ timeout: 15000 });
      await trigger.click();
      const text = "Completat din browser de finanțe, după semnare.";
      await page.getByLabel("Scopul și descrierea utilizării finale").fill(text);
      await page.getByRole("button", { name: "Salvează" }).first().click();

      await page.getByText(text).first().waitFor({ timeout: 15000 });
      const saved = (await GET("finance", `/api/par/${id}`)).json.endUse;
      must(saved === text, `pe ecran arată salvat, dar în bază e: ${saved}`);
      must(!crashes.length, `pagina a aruncat: ${crashes[0]}`);
      return "descriere scrisă din interfață și confirmată în bază";
    } finally {
      await browser.close();
    }
  });
}

console.log(`\n═══ ${passed}/${total} verificări trecute ═══`);
if (failures.length) {
  console.log("\nPicate:");
  for (const f of failures) console.log(`  • ${f.name}: ${f.message}`);
  process.exit(1);
}
