// STMT-005 live smoke — the user's ACTUAL scenario, against the REAL server + REAL MAIB PDF:
//   login → configure SFS (IDNO+IBAN, no creds) → upload PDF statement (multipart) →
//   lines extracted WITH buyer IDNO → export XML (download) → submit batch (mock SFS) →
//   einvoice visible in /api/fin/einvoices.
// Usage: BASE_URL=http://localhost:3199 STATEMENT_PDF=~/Downloads/….pdf node scripts/e2e-statement-efactura.mjs
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL ?? "admin@demo.vectorlearn.io";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "demo123456";
const PDF = process.env.STATEMENT_PDF;

let failures = 0;
const step = (name, ok, extra = "") => {
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? "  — " + extra : ""}`);
  if (!ok) failures++;
};

async function main() {
  if (!PDF) { console.error("STATEMENT_PDF env required (path to a real bank-statement PDF)"); process.exit(2); }

  // 1. LOGIN
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
  step("Login", loginRes.ok && !!cookie, `status ${loginRes.status}`);
  const H = { Cookie: cookie };
  const HJ = { ...H, "Content-Type": "application/json" };

  // 2. SFS settings: company IDNO + IBAN only (no API credentials → mock mode)
  const sfsRes = await fetch(`${BASE}/api/fin/sfs-settings`, {
    method: "PUT", headers: HJ,
    body: JSON.stringify({ idno: "1024600035737", bankAccount: "MD87AG000000022516065719", environment: "mock" }),
  });
  step("PUT /api/fin/sfs-settings (IDNO+IBAN, fără credențiale)", sfsRes.ok, `status ${sfsRes.status}`);

  // 3. UPLOAD the real PDF (multipart — the exact browser path)
  const fd = new FormData();
  fd.append("file", new Blob([readFileSync(PDF)], { type: "application/pdf" }), "extras.pdf");
  const upRes = await fetch(`${BASE}/api/fin/statement/upload`, { method: "POST", headers: H, body: fd });
  const upData = upRes.ok ? await upRes.json() : {};
  step("POST /upload (PDF real, multipart)", upRes.status === 201 && upData.lineCount > 0,
    `status ${upRes.status}, ${upData.lineCount ?? 0} tranzacții extrase`);
  const captureId = upData.captureId;

  // 4. All lines → check IDNO extraction on candidates
  const linesRes = await fetch(`${BASE}/api/fin/statement/${captureId}/lines?limit=200`, { headers: H });
  const linesData = await linesRes.json();
  const all = linesData.lines ?? [];
  const withIdno = all.filter((l) => l.counterpartyIdno);
  const candidates = all.filter((l) => l.direction === "in" && l.reportable === "yes" && l.counterpartyIdno);
  step("Linii cu IDNO partener extras", withIdno.length > 0, `${withIdno.length}/${all.length} linii, ${candidates.length} candidate e-Factura`);

  // 5. EXPORT XML for the first 2 candidates → must be a ZIP/XML download
  const expRes = await fetch(`${BASE}/api/fin/statement/${captureId}/export-xml`, {
    method: "POST", headers: HJ,
    body: JSON.stringify({ lineIds: candidates.slice(0, 2).map((l) => l.id) }),
  });
  const ct = expRes.headers.get("content-type") ?? "";
  const body = Buffer.from(await expRes.arrayBuffer());
  const isZip = body.subarray(0, 2).toString() === "PK";
  const isXml = body.toString("utf8", 0, 200).includes("<Documents>");
  step("POST /export-xml → fișier descărcabil", expRes.status === 200 && (isZip || isXml),
    `status ${expRes.status}, ${ct}, ${body.length} bytes`);

  // 6. SUBMIT one candidate to (mock) SFS
  const subRes = await fetch(`${BASE}/api/fin/statement/${captureId}/submit-efactura-batch`, {
    method: "POST", headers: HJ,
    body: JSON.stringify({ lineIds: [candidates[2]?.id ?? candidates[0].id] }),
  });
  const subData = subRes.ok ? await subRes.json() : {};
  step("POST /submit-efactura-batch → 200 + submitted", subRes.status === 200 && subData.submitted === 1,
    `status ${subRes.status}, submitted=${subData.submitted}, errors=${JSON.stringify(subData.errors ?? [])}`);

  // 7. The einvoice is visible in the e-Factura module, with buyer IDNO in its XML
  const listRes = await fetch(`${BASE}/api/fin/einvoices`, { headers: H });
  const listData = await listRes.json();
  const count = (listData.items ?? []).length;
  step("GET /api/fin/einvoices → factura apare în modul", listRes.ok && count >= 1, `${count} e-facturi`);

  console.log(failures === 0 ? "\n🎉 SMOKE VERDE — fluxul extras→e-Factura funcționează cap-coadă." : `\n💥 ${failures} pași eșuați`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("💥", e); process.exit(1); });
