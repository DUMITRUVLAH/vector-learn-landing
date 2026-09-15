/**
 * Randează corpul actelor pornite din CRM pentru un workspace de demonstrație.
 *
 * De ce e separat de `seed-crm-demo.mjs`: popularea scrie rânduri, iar randarea are nevoie de
 * modulele REALE ale produsului (biblioteca de șabloane, tabelul pozițiilor, suma în litere).
 * Le importăm în loc să rescriem o a doua randare — un act de demonstrație care arată altfel
 * decât unul adevărat nu demonstrează nimic.
 *
 * Ce face: pentru fiecare act al workspace-ului legat de un lead (`counterparty_kind = 'crm_lead'`),
 * ia șablonul de sistem potrivit tipului, completează câmpurile pe care le știe (părțile, numărul,
 * data, locul, totalul, suma în litere), inserează tabelul pozițiilor din rândurile actului și
 * scrie rezultatul în `body_html`. Câmpurile necunoscute rămân în corp ca acolade — exact ca la
 * un act real, unde `blanks.ts` le tipărește la export ca rânduri de completat.
 *
 * Implicit nu scrie nimic: fără `--apply` doar spune câte acte ar atinge.
 *
 *   npx tsx scripts/render-crm-demo-docs.ts --email vlah.business@gmail.com
 *   npx tsx scripts/render-crm-demo-docs.ts --email vlah.business@gmail.com --apply
 */
import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SYSTEM_TEMPLATES } from "../server/lib/docs/systemTemplates";
import { insertLinesTable, type TableLine } from "../server/lib/docs/linesTable";
import { amountToWordsRo } from "../server/lib/docs/amountToWords";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const APPLY = args.includes("--apply");
/**
 * Implicit atingem DOAR actele cu corp-schelet, scrise de popularea de demonstrație
 * (`<p>Document generat pentru …`). Un act cu corp adevărat poate fi al omului, nu al
 * demonstrației — pe acela nu-l rescriem decât dacă i se cere explicit, cu `--all`.
 */
const ALL = args.includes("--all");
const EMAIL = flag("email");
const TENANT_ARG = flag("tenant");
const ENV_FILE = flag("env-file") ?? path.join(process.env.HOME ?? "", "vector-learn-landing/.env.vercel");

function connectionString(): string | null {
  const direct = flag("url") ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (direct) return direct;
  if (existsSync(ENV_FILE)) {
    const env = Object.fromEntries(
      readFileSync(ENV_FILE, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
        })
    );
    const key =
      Object.keys(env).find((k) => k.endsWith("POSTGRES_URL_NON_POOLING")) ??
      Object.keys(env).find((k) => k.endsWith("POSTGRES_URL"));
    if (key) return env[key];
  }
  return null;
}

/** Șablonul potrivit unui tip de act; pentru oferte și contracte, cel scris pentru vânzări. */
function templateFor(kind: string): (typeof SYSTEM_TEMPLATES)[number] | undefined {
  if (kind === "oferta_comerciala") return SYSTEM_TEMPLATES.find((t) => t.name === "Ofertă comercială");
  if (kind === "contract_servicii") return SYSTEM_TEMPLATES.find((t) => t.name === "Contract de prestări servicii");
  if (kind === "act_primire_predare")
    return SYSTEM_TEMPLATES.find((t) => t.name === "Act de primire-predare — servicii prestate");
  return SYSTEM_TEMPLATES.find((t) => t.kind === kind);
}

function fill(html: string, values: Record<string, string | null | undefined>): string {
  let out = html;
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") continue;
    out = out.split(`{{${key}}}`).join(String(value));
  }
  return out;
}

async function main() {
  const conn = connectionString();
  if (!conn) throw new Error("Nicio conexiune: dă `--url`, `DATABASE_URL` sau `--env-file`.");
  const sql = postgres(conn, { ssl: conn.includes("localhost") ? false : "require", max: 1, connect_timeout: 20 });

  try {
    let tenantId = TENANT_ARG;
    if (EMAIL) {
      const [u] = await sql`select tenant_id from users where lower(email) = ${EMAIL.toLowerCase()}`;
      if (!u) throw new Error(`Nu există niciun utilizator cu e-mailul ${EMAIL}.`);
      tenantId = u.tenant_id;
    }
    if (!tenantId) throw new Error("Lipsește `--email` sau `--tenant`.");

    // Partea „noastră": întâi setările organizației, apoi plătitorul — aceeași ordine ca
    // `fieldResolver.ts`, ca actul randat aici să arate ca unul randat de aplicație.
    const [settings] = await sql`
      select org_legal_name from par_settings where tenant_id = ${tenantId} limit 1`;
    const [payer] = await sql`
      select name, legal_name, idno, address, iban, bank_name from par_payers where tenant_id = ${tenantId} order by created_at limit 1`;
    const us = {
      "noi.denumire": settings?.org_legal_name ?? payer?.legal_name ?? payer?.name ?? null,
      // IDNO-ul și adresa nu stau în setări, ci pe plătitor (par_payers) — aceeași sursă din
      // care le ia și aplicația când randează un act adevărat.
      "noi.idno": payer?.idno ?? null,
      "noi.adresa": payer?.address ?? null,
      "noi.iban": payer?.iban ?? null,
      "noi.banca": payer?.bank_name ?? null,
    };

    const docs = await sql`
      select id, kind, doc_number, doc_year, doc_date, title, total_cents, currency,
             counterparty_name, counterparty_snapshot, context, body_html
      from doc_documents
      where tenant_id = ${tenantId} and counterparty_kind = 'crm_lead'
        ${ALL ? sql`` : sql`and body_html like '%Document generat pentru%'`}
      order by doc_date`;

    console.log(`\nActe legate de leaduri: ${docs.length}`);
    console.log(APPLY ? "Mod: SCRIE ÎN BAZĂ (--apply)\n" : "Mod: simulare (fără --apply nu se scrie nimic)\n");

    let touched = 0;
    for (const doc of docs) {
      const tpl = templateFor(doc.kind);
      if (!tpl) {
        console.log(`  · ${doc.title} — fără șablon pentru tipul ${doc.kind}, sărit`);
        continue;
      }
      const lines = await sql`
        select description, unit, quantity, unit_price_cents, line_total_cents
        from doc_document_lines where document_id = ${doc.id} order by position`;

      const snapshot = (() => {
        try {
          return JSON.parse(doc.counterparty_snapshot ?? "{}") as Record<string, string>;
        } catch {
          return {} as Record<string, string>;
        }
      })();

      const date = new Date(doc.doc_date);
      const rendered = insertLinesTable(
        fill(tpl.bodyHtml, {
          ...us,
          "contraparte.denumire": snapshot.denumire ?? doc.counterparty_name,
          "contraparte.idno": snapshot.idno,
          "contraparte.adresa": snapshot.adresa,
          "document.numar": doc.doc_number ?? "(ciornă)",
          "document.data": date.toLocaleDateString("ro-MD", { day: "2-digit", month: "long", year: "numeric" }),
          "document.loc": "Chișinău",
          "document.baza": doc.kind === "contract_servicii" ? "oferta comercială acceptată" : "contractul de prestări servicii",
          "total.suma": new Intl.NumberFormat("ro-MD", { minimumFractionDigits: 2 }).format(doc.total_cents / 100),
          "total.valuta": doc.currency,
          "total.in_litere": amountToWordsRo(doc.total_cents, { currency: doc.currency }),
        }),
        lines.map(
          (l): TableLine => ({
            description: l.description,
            unit: l.unit,
            quantity: l.quantity,
            unitPriceCents: l.unit_price_cents,
            lineTotalCents: l.line_total_cents,
          })
        ),
        doc.currency
      );

      touched++;
      if (APPLY) {
        await sql`update doc_documents set body_html = ${rendered}, updated_at = now() where id = ${doc.id}`;
      }
      console.log(`  ${APPLY ? "✓" : "·"} ${doc.doc_number ?? "ciornă"} — ${doc.title} (${rendered.length} caractere)`);
    }

    console.log(`\n${APPLY ? "Randate" : "S-ar randa"}: ${touched} acte.\n`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\nEȘEC:", err instanceof Error ? err.message : err);
  process.exit(1);
});
