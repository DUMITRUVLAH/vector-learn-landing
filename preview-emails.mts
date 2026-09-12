/**
 * Previzualizare: cum arată emailurile PAR, construite cu ACELEAȘI texte ca aplicația.
 * Citește doar (SELECT) din producție; trimiterea se face separat.
 */
import postgres from "postgres";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync("/tmp/claude-501/-Users-dima-Marketing-Landing-Vector/0ece369d-cd32-48b4-91ea-ff6457e1ebcf/scratchpad/prod.env", "utf8")
    .split("\n").filter((l) => /^[A-Za-z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "").trim()]; })
);
const p = (k: string) => env["learningvectortop_POSTGRES_" + k];
const sql = postgres({ host: p("HOST"), user: p("USER"), password: p("PASSWORD"), database: p("DATABASE"), port: 5432, ssl: "require", prepare: false, max: 1 });

// A plecat vreun email PAR din producție?
const sent = await sql`select status, count(*) as n, max(created_at) as ultimul
  from messages where subject like '[PAR]%' group by status order by n desc`;
console.log("EMAILURI PAR ÎN PRODUCȚIE:", sent.length ? sent.map((r) => `${r.status}=${r.n} (ultimul ${r.ultimul?.toISOString?.().slice(0,16) ?? "—"})`).join(" · ") : "niciunul");

const rows = await sql`
  select r.id, r.request_no, r.status, r.currency, r.total_estimated_cents, r.purpose, r.end_use,
         t.name as tenant, coalesce(r.payee_name, v.name) as payee,
         pr.name as project, ev.name as event, bc.code as bc_code, bc.name as bc_name,
         u.name as requested_by
  from par_requests r
  join tenants t on t.id = r.tenant_id
  left join par_vendors v on v.id = r.vendor_id
  left join par_projects pr on pr.id = r.project_id
  left join par_events ev on ev.id = r.event_id
  left join par_budget_codes bc on bc.id = r.budget_code_id
  left join users u on u.id = r.requested_by_user_id
  where r.status in ('pending_approval','approved','in_finance','paid')
  order by r.submitted_at desc nulls last limit 10`;

const PURPOSE: Record<string, string> = {
  execute_payment: "Execută plata", obtain_quotations: "Obține oferte", provide_estimate: "Oferă o estimare",
};
const money = (c: number, cur: string) =>
  `${(Number(c) / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur ?? "MDL"}`;

const APP = "https://finflow.best";
const out: string[] = [];
rows.forEach((r, i) => {
  const lines = ["Detalii plată:", `• Sumă: ${money(r.total_estimated_cents, r.currency)}`];
  if (r.payee) lines.push(`• Către: ${r.payee}`);
  const reason = (r.end_use ?? "").trim() || PURPOSE[r.purpose] || "";
  if (reason) lines.push(`• Motiv: ${reason}`);
  if (r.project) lines.push(`• Proiect: ${r.project}`);
  if (r.event) lines.push(`• Eveniment: ${r.event}`);
  if (r.bc_code || r.bc_name) lines.push(`• Buget: ${[r.bc_code, r.bc_name].filter(Boolean).join(" — ")}`);

  out.push([
    `───────────────────────────────  ${i + 1} / 10  ───────────────────────────────`,
    `Subiect: [PAR] ${r.request_no} — aprobare necesară`,
    ``,
    `Cererea ${r.request_no} așteaptă aprobarea ta.`,
    ``,
    lines.join("\n"),
    ``,
    `Deschide cererea: ${APP}/#/business/par/${r.id}`,
    ``,
    `Workspace: ${r.tenant} · Cont destinatar: vlah.business@gmail.com`,
  ].join("\n"));
});

const ex = rows[0];
const aprobat = [
  `Subiect: [PAR] ${ex.request_no} — aprobată`,
  ``,
  `Cererea ${ex.request_no} a fost aprobată.`,
  ``,
  `Deschide cererea: ${APP}/#/business/par/${ex.id}`,
  ``,
  `Workspace: ${ex.tenant} · Cont destinatar: vlah.business@gmail.com`,
].join("\n");

const respins = [
  `Subiect: [PAR] ${ex.request_no} — respinsă`,
  ``,
  `Cererea ${ex.request_no} a fost RESPINSĂ de Ana Chirita pe 12.09.2026, 21:20.`,
  `Motiv: bugetul liniei e epuizat pentru trimestrul curent; reia cererea în octombrie`,
  `Cererea nu se oprește aici: o poți revizui și retrimite din aplicație.`,
  ``,
  `Deschide cererea: ${APP}/#/business/par/${ex.id}`,
  ``,
  `Workspace: ${ex.tenant} · Cont destinatar: vlah.business@gmail.com`,
].join("\n");

fs.writeFileSync("/tmp/claude-501/-Users-dima-Marketing-Landing-Vector/0ece369d-cd32-48b4-91ea-ff6457e1ebcf/scratchpad/preview-body.txt",
  JSON.stringify({ aprobare: out, aprobat, respins }, null, 2));
console.log(`\nGenerate: ${out.length} emailuri de aprobare + 1 aprobat + 1 respins`);
await sql.end();
