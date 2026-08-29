/**
 * @vitest-environment node
 *
 * DG-101 — poarta pentru fundația registrului de acte.
 *
 * Ce apără concret (cele două moduri reale în care modulul ar muri pe producție):
 *  1. Migrarea 0151 nu creează tot ce declară schema → orice rută de acte dă 500. (Testul 1-2)
 *  2. Codul ajunge pe Vercel ÎNAINTEA migrării (evidența drizzle e desincronizată pe prod) →
 *     fără healul din `sync-schema`, prima cerere răspunde „relation doc_documents does not exist".
 *     Testul 3 pornește de la o bază care are TOT în afară de 0151 și verifică healul. (Testul 3)
 *  3. Numerotarea actelor s-ar putea repeta → registru invalid la audit. (Testul 4-5)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { DOCGEN_ENSURE_STATEMENTS } from "../db/ensure/docgen";

const drizzleDir = path.resolve(import.meta.dirname ?? __dirname, "../../drizzle");

type JournalEntry = { idx: number; tag: string };

function journalEntries(): JournalEntry[] {
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: JournalEntry[] };
  return journal.entries.slice().sort((a, b) => a.idx - b.idx);
}

async function applyMigrations(client: PGlite, entries: JournalEntry[]) {
  for (const entry of entries) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await client.exec(stmt);
    }
  }
}

async function seedTenant(client: PGlite): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO tenants (name, slug) VALUES ('Docgen Test', 'docgen-test-${Date.now()}') RETURNING id`
  );
  return res.rows[0].id;
}

describe("DG-101 — registrul de acte există după migrare", () => {
  let client: PGlite;
  let tenantId: string;

  beforeAll(async () => {
    client = new PGlite();
    await applyMigrations(client, journalEntries());
    tenantId = await seedTenant(client);
  }, 120_000);

  it("migrarea modulului e în jurnal și creează toate tabelele", async () => {
    // Nu „ultima": modulul va primi și alte migrări (0152 a adus istoricul de versiuni). Ce
    // contează e că e ÎN jurnal, deci se aplică pe orice bază nouă.
    expect(journalEntries().map((e) => e.tag)).toContain("0151_docgen");

    for (const table of [
      "doc_documents",
      "doc_document_lines",
      "doc_document_links",
      "doc_number_sequences",
      "doc_audit",
      "doc_template_versions",
    ]) {
      const res = await client.query<{ t: string | null }>(
        `select to_regclass('public."${table}"') as t`
      );
      expect(res.rows[0].t, `lipsește tabela ${table}`).toBeTruthy();
    }
  });

  it("biblioteca de șabloane primește coloanele de acte (fără tabel paralel)", async () => {
    const res = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'docmerge_templates'`
    );
    const cols = res.rows.map((r) => r.column_name);
    for (const c of ["kind", "category", "is_system", "fields_json", "version", "archived_at"]) {
      expect(cols, `docmerge_templates.${c} lipsește`).toContain(c);
    }
  });

  it("un act cu poziții și legături se salvează și se citește", async () => {
    const doc = await client.query<{ id: string }>(
      `INSERT INTO doc_documents (tenant_id, title, kind, total_cents)
       VALUES ('${tenantId}', 'Act de primire-predare nr. 1', 'act_primire_predare', 2450000)
       RETURNING id`
    );
    const docId = doc.rows[0].id;

    await client.exec(
      `INSERT INTO doc_document_lines (tenant_id, document_id, description, unit, quantity, unit_price_cents, line_total_cents)
       VALUES ('${tenantId}', '${docId}', 'Laptop Dell', 'buc', 2, 1225000, 2450000)`
    );
    const derived = await client.query<{ id: string }>(
      `INSERT INTO doc_documents (tenant_id, title, kind) VALUES ('${tenantId}', 'Contract', 'contract_servicii') RETURNING id`
    );
    await client.exec(
      `INSERT INTO doc_document_links (tenant_id, from_document_id, to_kind, to_document_id, relation)
       VALUES ('${tenantId}', '${derived.rows[0].id}', 'document', '${docId}', 'derived_from')`
    );

    const lines = await client.query<{ line_total_cents: number }>(
      `select line_total_cents from doc_document_lines where document_id = '${docId}'`
    );
    expect(lines.rows).toHaveLength(1);
    expect(Number(lines.rows[0].line_total_cents)).toBe(2450000);

    const links = await client.query(
      `select 1 from doc_document_links where to_document_id = '${docId}'`
    );
    expect(links.rows).toHaveLength(1);
  });

  it("două acte nu pot purta același număr în același an", async () => {
    await client.exec(
      `INSERT INTO doc_documents (tenant_id, title, kind, doc_number, doc_year)
       VALUES ('${tenantId}', 'Act A', 'act_primire_predare', 'ACT-2026-0007', 2026)`
    );
    await expect(
      client.exec(
        `INSERT INTO doc_documents (tenant_id, title, kind, doc_number, doc_year)
         VALUES ('${tenantId}', 'Act B', 'act_primire_predare', 'ACT-2026-0007', 2026)`
      )
    ).rejects.toThrow();
  });

  it("ciornele (fără număr) pot coexista oricâte", async () => {
    for (let i = 0; i < 3; i++) {
      await client.exec(
        `INSERT INTO doc_documents (tenant_id, title, kind) VALUES ('${tenantId}', 'Ciornă ${i}', 'act_primire_predare')`
      );
    }
    const res = await client.query<{ n: number }>(
      `select count(*)::int as n from doc_documents where doc_number is null and tenant_id = '${tenantId}'`
    );
    expect(Number(res.rows[0].n)).toBeGreaterThanOrEqual(3);
  });
});

describe("DG-101 — healul salvează modulul când codul ajunge înaintea migrării", () => {
  it("pe o bază fără 0151, ENSURE_STATEMENTS creează tabelele și inserția merge", async () => {
    const client = new PGlite();
    // Exact situația de pe producție: tot istoricul de migrări, mai puțin cea a modulului.
    await applyMigrations(
      client,
      journalEntries().filter((e) => e.tag !== "0151_docgen")
    );

    const before = await client.query<{ t: string | null }>(
      `select to_regclass('public."doc_documents"') as t`
    );
    expect(before.rows[0].t, "tabela nu trebuie să existe încă — altfel testul nu dovedește nimic").toBeNull();

    for (const stmt of DOCGEN_ENSURE_STATEMENTS) {
      await client.exec(stmt);
    }

    const tenantId = await seedTenant(client);
    await client.exec(
      `INSERT INTO doc_documents (tenant_id, title, kind) VALUES ('${tenantId}', 'Act după heal', 'act_primire_predare')`
    );
    const res = await client.query<{ n: number }>(`select count(*)::int as n from doc_documents`);
    expect(Number(res.rows[0].n)).toBe(1);

    // Rulat a doua oară nu trebuie să pice (deploy-urile îl execută la fiecare pornire).
    for (const stmt of DOCGEN_ENSURE_STATEMENTS) {
      await client.exec(stmt);
    }
  }, 120_000);
});
