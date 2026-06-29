/**
 * @vitest-environment node
 * PERF-05 — statement auto-match writes are batched (CASE-based bulk UPDATE), not N+1.
 *
 * Verifies the exact SQL pattern the /match route uses (one bulk UPDATE for matched rows via
 * per-row CASE expressions, one for missing) produces the CORRECT per-row values against a real
 * PGlite DB. This locks the correctness of the batching refactor — a CASE typo would set every
 * row to the same invoiceId, which this test would catch.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { pgTable, uuid, varchar, integer } from "drizzle-orm/pg-core";
import { and, eq, inArray, sql } from "drizzle-orm";

const lines = pgTable("cap_lines", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  matchStatus: varchar("match_status", { length: 20 }),
  matchedCaptureId: uuid("matched_capture_id"),
  matchScoreBp: integer("match_score_bp"),
});

let pg: PGlite;
let db: ReturnType<typeof drizzle>;
const TENANT = "11111111-1111-1111-1111-111111111111";
const L1 = "aaaaaaaa-0000-0000-0000-000000000001";
const L2 = "aaaaaaaa-0000-0000-0000-000000000002";
const L3 = "aaaaaaaa-0000-0000-0000-000000000003";
const INV1 = "bbbbbbbb-0000-0000-0000-000000000001";
const INV2 = "bbbbbbbb-0000-0000-0000-000000000002";

beforeAll(async () => {
  pg = new PGlite();
  db = drizzle(pg);
  await pg.exec(`
    CREATE TABLE cap_lines (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
      match_status varchar(20), matched_capture_id uuid, match_score_bp integer
    );
  `);
});

beforeEach(async () => {
  await pg.exec(`DELETE FROM cap_lines;`);
  await pg.exec(`
    INSERT INTO cap_lines (id, tenant_id) VALUES
      ('${L1}','${TENANT}'), ('${L2}','${TENANT}'), ('${L3}','${TENANT}');
  `);
});

afterAll(async () => {
  await pg?.close();
});

describe("PERF-05: batched match update", () => {
  it("[blocant] one CASE-based UPDATE sets each matched row its own invoice + score; missing batched", async () => {
    const matchedHits = [
      { id: L1, invoiceId: INV1, scoreBp: 9000 },
      { id: L2, invoiceId: INV2, scoreBp: 7500 },
    ];
    const missingIds = [L3];

    // Missing batch
    await db
      .update(lines)
      .set({ matchStatus: "missing", matchedCaptureId: null, matchScoreBp: 0 })
      .where(and(eq(lines.tenantId, TENANT), inArray(lines.id, missingIds)));

    // Matched batch (CASE per row) — same construction as the route
    const idList = matchedHits.map((h) => h.id);
    const invoiceCase = sql.join(
      [sql`CASE`, ...matchedHits.map((h) => sql`WHEN ${lines.id} = ${h.id} THEN ${h.invoiceId}::uuid`), sql`END`],
      sql` `,
    );
    const scoreCase = sql.join(
      [sql`CASE`, ...matchedHits.map((h) => sql`WHEN ${lines.id} = ${h.id} THEN ${h.scoreBp}::int`), sql`END`],
      sql` `,
    );
    await db
      .update(lines)
      .set({ matchStatus: "matched", matchedCaptureId: invoiceCase, matchScoreBp: scoreCase })
      .where(and(eq(lines.tenantId, TENANT), inArray(lines.id, idList)));

    const rows = (await pg.query(`SELECT id, match_status, matched_capture_id, match_score_bp FROM cap_lines ORDER BY id`)) as {
      rows: { id: string; match_status: string; matched_capture_id: string | null; match_score_bp: number }[];
    };
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]));

    // L1 → INV1 / 9000, L2 → INV2 / 7500 (NOT cross-assigned), L3 → missing
    expect(byId[L1].match_status).toBe("matched");
    expect(byId[L1].matched_capture_id).toBe(INV1);
    expect(byId[L1].match_score_bp).toBe(9000);
    expect(byId[L2].matched_capture_id).toBe(INV2);
    expect(byId[L2].match_score_bp).toBe(7500);
    expect(byId[L3].match_status).toBe("missing");
    expect(byId[L3].matched_capture_id).toBeNull();
  });
});
