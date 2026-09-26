/**
 * @vitest-environment node
 *
 * COMMS-301 — poarta de schemă a modulului de comunicare.
 *
 * Producția nu aplică fiabil migrările (evidența drizzle e desincronizată), deci tabelele
 * ajung acolo prin healul din `sync-schema` (`COMMS_ENSURE_STATEMENTS`). Dacă migrarea și healul
 * diverg, o bază nouă (CI, local) și producția ar avea scheme diferite, iar primul webhook ar da
 * 500 pe una dintre ele. Testul apără exact asta:
 *  1. migrarea 0195 e în jurnal și conține EXACT instrucțiunile healului;
 *  2. pe o bază cu toate migrările ÎN AFARĂ de 0195, healul singur creează tot, iar rularea
 *     a doua oară nu strică nimic (idempotent — sync-schema rulează la fiecare deploy);
 *  3. indexul de idempotență chiar respinge un mesaj dublat de furnizor.
 */
import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { COMMS_ENSURE_STATEMENTS } from "../db/ensure/comms";

const drizzleDir = path.resolve(import.meta.dirname ?? __dirname, "../../drizzle");
const TAG = "0195_comms_omnichannel";

type JournalEntry = { idx: number; tag: string };
const entries = (): JournalEntry[] =>
  (JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as { entries: JournalEntry[] }).entries
    .slice()
    .sort((a, b) => a.idx - b.idx);

const statementsOf = (tag: string) =>
  fs
    .readFileSync(path.join(drizzleDir, `${tag}.sql`), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.replace(/^--.*$/gm, "").trim().replace(/;$/, ""))
    .filter(Boolean);

async function apply(client: PGlite, list: JournalEntry[]) {
  for (const e of list) for (const stmt of statementsOf(e.tag)) await client.exec(stmt);
}

describe("COMMS-301 — schema modulului de comunicare", () => {
  it("[blocant] migrarea e în jurnal și e identică cu healul din sync-schema", () => {
    expect(entries().map((e) => e.tag)).toContain(TAG);
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(statementsOf(TAG).map(norm)).toEqual(COMMS_ENSURE_STATEMENTS.map(norm));
  });

  it("[blocant] healul singur creează tot pe o bază fără migrarea 0195, idempotent, iar dublura e respinsă", async () => {
    const client = new PGlite();
    await apply(client, entries().filter((e) => e.tag !== TAG));
    for (let run = 0; run < 2; run++) {
      for (const stmt of COMMS_ENSURE_STATEMENTS) await client.exec(stmt);
    }
    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'comm\\_%' ORDER BY 1`
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      "comm_channels",
      "comm_contacts",
      "comm_conversations",
      "comm_messages",
      "comm_webhook_events",
    ]);
    const enumVals = await client.query<{ v: string }>(
      `SELECT unnest(enum_range(NULL::interaction_type))::text AS v`
    );
    expect(enumVals.rows.map((r) => r.v)).toEqual(expect.arrayContaining(["telegram", "viber"]));

    const t = await client.query<{ id: string }>(`INSERT INTO tenants (name, slug) VALUES ('C', 'comms-schema-${Date.now()}') RETURNING id`);
    const tenantId = t.rows[0].id;
    const ch = await client.query<{ id: string }>(
      `INSERT INTO comm_channels (tenant_id, kind, name, webhook_secret) VALUES ($1, 'telegram', 'T', 'a1') RETURNING id`,
      [tenantId]
    );
    const ct = await client.query<{ id: string }>(
      `INSERT INTO comm_contacts (tenant_id, channel_id, external_user_id) VALUES ($1, $2, '42') RETURNING id`,
      [tenantId, ch.rows[0].id]
    );
    const cv = await client.query<{ id: string }>(
      `INSERT INTO comm_conversations (tenant_id, channel_id, contact_id) VALUES ($1, $2, $3) RETURNING id`,
      [tenantId, ch.rows[0].id, ct.rows[0].id]
    );
    const insertMsg = () =>
      client.query(
        `INSERT INTO comm_messages (tenant_id, conversation_id, channel_id, direction, external_id) VALUES ($1, $2, $3, 'inbound', 'm-1')`,
        [tenantId, cv.rows[0].id, ch.rows[0].id]
      );
    await insertMsg();
    await expect(insertMsg()).rejects.toThrow();
    await client.close();
  }, 180_000);
});
