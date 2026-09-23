// PAR — patenta de întreprinzător și citirea actelor personale ale beneficiarului.
//
// Per CLAUDE.md §3.5.1quater se verifică ACȚIUNEA, nu afișarea: fiecare endpoint nou e CHEMAT
// o dată, cu date realiste, și se compară răspunsul cu ce trebuia să iasă. Un buton care se
// randează nu dovedește nimic despre ce se întâmplă când e apăsat.
//
// Regresiile pe care le blochează:
//   · patenta salvată pe beneficiar dispare la scriere (coloană lipsă, zod care taie câmpul)
//   · termenul tastat „31.08.2026" intră ca text liber și nu mai poate fi comparat → nimeni
//     nu mai e avertizat că patenta a expirat
//   · endpoint-ul de acte personale întoarce 200 gol (prompt greșit, parser deconectat)
//   · patenta unui beneficiar salvat nu ajunge pe cerere → aprobatorul nu vede semnalul
//   · copia patentei se aruncă după citire → „nu e clar dacă s-a pus" (owner, 23.09.2026):
//     fișierul trebuie să URCE, să rămână pe cerere și să se DESCHIDĂ cu octeții trimiși
//
//   node scripts/e2e-par-patenta.mjs                       (server pe :3000)
//   BASE=http://localhost:3133 node scripts/e2e-par-patenta.mjs
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE || process.env.BASE_URL || "http://localhost:3000";
const ADMIN = process.env.E2E_EMAIL || "admin@atic.demo.io";
const PW = process.env.E2E_PASSWORD || "demo123456";
const SESSION_FILE = process.env.E2E_SESSION_FILE
  ? path.resolve(process.env.E2E_SESSION_FILE)
  : path.join(ROOT, ".e2e-session.json");

let n = 0, ok = 0;
const failures = [];
function check(name, pass, detail = "") {
  n++;
  if (pass) { ok++; console.log(`  ✅ ${name}`); }
  else { failures.push({ name, detail }); console.log(`  🔴 ${name}${detail ? `\n      ${detail}` : ""}`); }
}

// Sesiune refolosită — cota e 10 autentificări / 15 min (authRateLimit).
async function apiContext() {
  if (existsSync(SESSION_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
      if (saved.base === BASE) {
        const ctx = await request.newContext({ baseURL: BASE, storageState: saved.state });
        if ((await ctx.get("/api/modules")).status() === 200) return ctx;
        await ctx.dispose();
      }
    } catch { /* cache stricat */ }
  }
  const ctx = await request.newContext({ baseURL: BASE });
  const login = await ctx.post("/api/business/auth/login", { data: { email: ADMIN, password: PW } });
  if (login.status() !== 200) throw new Error(`login ${ADMIN} → ${login.status()} (server pornit? seed rulat?)`);
  return ctx;
}

const BULETIN = `REPUBLICA MOLDOVA
BULETIN DE IDENTITATE / IDENTITY CARD
Nume / Surname
ROITMAN
Prenume / Given names
DARIA
IDNP  2008001007903
Domiciliu: mun. Chisinau, str. Ion Creanga 45, ap. 12`;

const RECHIZITE = `CERTIFICAT privind rechizitele bancare
Titular: ROITMAN DARIA
Cod fiscal: 2008001007903
Cont curent IBAN: MD48ML000002259A19498121
Banca: BC Moldindconbank S.A.
Cod bancar (BIC): MOLDMD2X322`;

const PATENTA = `PATENTA DE INTREPRINZATOR
seria AA nr. 0123456
Titularul patentei: ROITMAN DARIA
IDNP 2008001007903
Valabila de la 01.08.2026 pana la 31.08.2026`;

/** Trimite un act ca fișier real în multipart — exact calea pe care merge formularul. */
async function readDoc(ctx, kind, text) {
  const res = await ctx.post("/api/par/ai-prefill/payee-doc", {
    multipart: {
      kind,
      file: { name: `${kind}.txt`, mimeType: "text/plain", buffer: Buffer.from(text, "utf8") },
    },
  });
  return { status: res.status(), body: res.status() === 200 ? await res.json() : await res.text() };
}

async function main() {
  console.log(`\n═══ PAR — patentă + acte personale (${BASE}) ═══\n`);
  const ctx = await apiContext();

  // ── 1. Registrul de beneficiari ține patenta ────────────────────────────────
  console.log("▶ Beneficiar salvat cu patentă");
  const created = await ctx.post("/api/par/vendors", {
    data: {
      name: `Patentar E2E ${Date.now()}`,
      idnp: "2008001007903",
      iban: `MD${String(Date.now()).slice(-2)}ML000002259A1949812`.slice(0, 24),
      is_patent_holder: true,
      patent_series: "AA 0123456",
      // Tastat ca în Moldova: serverul trebuie să-l normalizeze la ISO, altfel comparația de
      // expirare nu mai funcționează niciodată.
      patent_valid_until: "31.08.2026",
    },
  });
  const vendor = created.status() < 300 ? await created.json() : null;
  check("POST /api/par/vendors cu patentă → 2xx", created.status() < 300, `status ${created.status()}`);
  check("termenul 31.08.2026 e normalizat la ISO", vendor?.patentValidUntil === "2026-08-31", `primit ${vendor?.patentValidUntil}`);
  check("bifa și seria se salvează", vendor?.isPatentHolder === true && vendor?.patentSeries === "AA 0123456",
    JSON.stringify({ h: vendor?.isPatentHolder, s: vendor?.patentSeries }));

  const listed = await (await ctx.get("/api/par/vendors")).json();
  const back = (listed.vendors ?? listed.items ?? []).find((v) => v.id === vendor?.id);
  check("beneficiarul se citește înapoi cu patenta lui", back?.patentValidUntil === "2026-08-31", JSON.stringify(back?.patentValidUntil));

  // ── 2. Patenta ajunge pe CERERE (acolo o vede aprobatorul) ──────────────────
  console.log("\n▶ Cererea poartă patenta");
  const draft = await (await ctx.post("/api/par", { data: { purpose: "execute_payment" } })).json();
  const parId = draft.id ?? draft.par?.id;
  check("ciornă creată", !!parId, JSON.stringify(draft).slice(0, 200));

  if (parId) {
    const patched = await ctx.patch(`/api/par/${parId}`, {
      data: {
        payee_name: "Roitman Daria",
        payee_type: "fizic",
        payee_is_patent_holder: true,
        payee_patent_series: "AA 0123456",
        payee_patent_valid_until: "2020-01-31", // patentă EXPIRATĂ intenționat
      },
    });
    check("PATCH cu datele patentei → 200", patched.status() === 200, `status ${patched.status()}`);
    const read = await (await ctx.get(`/api/par/${parId}`)).json();
    const par = read.par ?? read;
    check("cererea întoarce termenul patentei", par.payeePatentValidUntil === "2020-01-31", JSON.stringify(par.payeePatentValidUntil));
    check("cererea întoarce seria", par.payeePatentSeries === "AA 0123456", JSON.stringify(par.payeePatentSeries));

    // Alegerea unui beneficiar salvat trebuie să ADUCĂ patenta lui pe cerere.
    if (vendor?.id) {
      await ctx.patch(`/api/par/${parId}`, { data: { vendor_id: vendor.id } });
      const afterVendor = await (await ctx.get(`/api/par/${parId}`)).json();
      const p2 = afterVendor.par ?? afterVendor;
      check("alegerea beneficiarului salvat copiază patenta pe cerere", p2.payeePatentValidUntil === "2026-08-31",
        JSON.stringify(p2.payeePatentValidUntil));
    }
  }

  // ── 2b. Copia patentei: urcă, rămâne pe cerere, se deschide ────────────────
  console.log("\n▶ Copia patentei (fișierul)");
  const copyDraft = await (await ctx.post("/api/par", { data: { purpose: "execute_payment" } })).json();
  const copyParId = copyDraft.id ?? copyDraft.par?.id;
  if (copyParId) {
    await ctx.patch(`/api/par/${copyParId}`, {
      data: { payee_name: "Boghean Natalia", payee_type: "fizic", payee_is_patent_holder: true },
    });
    const pdf = Buffer.from(`%PDF-1.4\n% patenta e2e ${Date.now()}\n%%EOF\n`);
    const signRes = await ctx.post(`/api/par/${copyParId}/payee-patent/sign`, {
      data: { file_name: "patenta Boghean.pdf", mime: "application/pdf", size_bytes: pdf.byteLength },
    });
    check("POST payee-patent/sign → 200", signRes.status() === 200, `status ${signRes.status()} ${await signRes.text()}`);
    if (signRes.status() === 200) {
      const { path: objectPath, signed_url } = await signRes.json();
      // Pasul browserului: PUT direct în Storage, fără cookie-urile noastre.
      const put = await fetch(signed_url, { method: "PUT", headers: { "content-type": "application/pdf" }, body: pdf });
      check("PUT în Storage → 2xx", put.ok, `status ${put.status}`);
      const fin = await ctx.post(`/api/par/${copyParId}/payee-patent/finalize`, {
        data: { path: objectPath, file_name: "patenta Boghean.pdf", mime: "application/pdf" },
      });
      const finBody = fin.status() === 201 ? await fin.json() : await fin.text();
      check("POST payee-patent/finalize → 201 cu numele fișierului", fin.status() === 201 && finBody?.payeePatentFileName === "patenta Boghean.pdf",
        `status ${fin.status()} ${JSON.stringify(finBody).slice(0, 200)}`);

      const detail = await (await ctx.get(`/api/par/${copyParId}`)).json();
      const pd = detail.par ?? detail;
      check("cererea redeschisă poartă copia (formularul arată bifa)", pd.payeePatentFileName === "patenta Boghean.pdf",
        JSON.stringify(pd.payeePatentFileName));

      const opened = await ctx.get(`/api/par/${copyParId}/payee-patent`);
      const openedBytes = opened.status() === 200 ? Buffer.from(await opened.body()) : Buffer.alloc(0);
      check("GET payee-patent → 200 PDF, exact octeții urcați", opened.status() === 200 && openedBytes.equals(pdf),
        `status ${opened.status()} ${opened.headers()["content-type"]} ${openedBytes.byteLength}B`);
      // Vizualizatorul o pune într-un <iframe>: cu DENY, „Deschide" arăta „refused to connect".
      check("copia se poate încadra în vizualizatorul aplicației (SAMEORIGIN)",
        opened.headers()["x-frame-options"] === "SAMEORIGIN", `x-frame-options ${opened.headers()["x-frame-options"]}`);

      // „Scoate copia" → cererea rămâne fără, iar deschiderea spune clar 404.
      await ctx.patch(`/api/par/${copyParId}`, { data: { payee_patent_file: "none" } });
      const gone = await ctx.get(`/api/par/${copyParId}/payee-patent`);
      check("după „scoate copia” → 404", gone.status() === 404, `status ${gone.status()}`);
    }
    // Testul negativ: un „PDF" care nu e PDF nu intră pe cerere.
    const bad = await ctx.post(`/api/par/${copyParId}/payee-patent/sign`, {
      data: { file_name: "patenta.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size_bytes: 100 },
    });
    check("Word ca patentă → 400", bad.status() === 400, `status ${bad.status()}`);

    // Salvarea parțială (formularul trimite `PATCH {}` după antet) nu are voie să șteargă beneficiarul.
    await ctx.patch(`/api/par/${copyParId}`, { data: {} });
    const afterEmpty = await (await ctx.get(`/api/par/${copyParId}`)).json();
    check("PATCH {} lasă numele beneficiarului neatins", (afterEmpty.par ?? afterEmpty).payeeName === "Boghean Natalia",
      JSON.stringify((afterEmpty.par ?? afterEmpty).payeeName));
  } else {
    check("ciornă pentru copia patentei", false, JSON.stringify(copyDraft).slice(0, 200));
  }

  // ── 3. Actele personale — endpoint-ul e CHEMAT, nu doar montat ──────────────
  console.log("\n▶ Citirea actelor beneficiarului");
  const bul = await readDoc(ctx, "buletin", BULETIN);
  check("POST payee-doc (buletin) → 200", bul.status === 200, String(bul.body).slice(0, 200));
  check("buletinul dă numele", bul.body?.name === "ROITMAN DARIA", JSON.stringify(bul.body?.name));
  check("buletinul dă IDNP-ul, nu seria actului", bul.body?.idnp === "2008001007903", JSON.stringify(bul.body?.idnp));

  const rec = await readDoc(ctx, "rechizite", RECHIZITE);
  check("POST payee-doc (rechizite) → 200", rec.status === 200, String(rec.body).slice(0, 200));
  check("rechizitele dau IBAN-ul verificat", rec.body?.iban === "MD48ML000002259A19498121", JSON.stringify(rec.body?.iban));
  check("rechizitele dau codul bancar", rec.body?.bic === "MOLDMD2X322", JSON.stringify(rec.body?.bic));

  const pat = await readDoc(ctx, "patenta", PATENTA);
  check("POST payee-doc (patentă) → 200", pat.status === 200, String(pat.body).slice(0, 200));
  check("patenta dă seria", pat.body?.patentSeries === "AA 0123456", JSON.stringify(pat.body?.patentSeries));
  check("patenta dă TERMENUL (data a doua), nu data de început", pat.body?.patentValidUntil === "2026-08-31",
    JSON.stringify(pat.body?.patentValidUntil));

  // Testul negativ face parte din livrare: fără fișier, endpoint-ul trebuie să refuze clar.
  const noFile = await ctx.post("/api/par/ai-prefill/payee-doc", { multipart: { kind: "buletin" } });
  check("fără fișier → 400, nu 200 gol", noFile.status() === 400, `status ${noFile.status()}`);

  console.log(`\n═══ ${ok}/${n} au trecut ═══`);
  if (failures.length) {
    console.log("\nCe a picat:");
    for (const f of failures) console.log(`  · ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    process.exit(1);
  }
  await ctx.dispose();
}

main().catch((e) => { console.error(e); process.exit(1); });
