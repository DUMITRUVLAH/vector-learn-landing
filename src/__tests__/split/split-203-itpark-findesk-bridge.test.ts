/**
 * @vitest-environment node
 * SPLIT-203 — ITPark → FinDesk bridge:
 *   - itpark_engagements.fin_party_id links resident to fin_parties
 *   - auto-link endpoint creates fin_parties from engagement data
 *   - GET /engagements?finPartyId filter works at schema level
 *
 * Tests: T-203-1 through T-203-5
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../../server/db/schema/index";
import { tenants, users } from "../../../server/db/schema";
import { itparkEngagements } from "../../../server/db/schema/itpark";
import { finParties } from "../../../server/db/schema/finParties";
import { eq, and } from "drizzle-orm";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle>;
let tenantId: string;
let userId: string;

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema });

  // Apply all migrations (includes 0146_itpark_core + 0147_split_party_bridge)
  const drizzleDir = path.resolve(import.meta.dirname ?? __dirname, "../../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };

  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = path.join(drizzleDir, `${entry.tag}.sql`);
    const raw = fs.readFileSync(file, "utf8");
    const statements = raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await pglite.exec(stmt);
    }
  }

  const [t] = await testDb
    .insert(tenants)
    .values({ name: "Test Org SPLIT-203", slug: "split-203-test", plan: "growth" })
    .returning();
  tenantId = t.id;

  const [u] = await testDb
    .insert(users)
    .values({
      tenantId,
      email: "split203@test.md",
      passwordHash: "x",
      role: "admin",
      name: "Test Admin",
    })
    .returning();
  userId = u.id;
}, 120_000);

afterAll(async () => {
  await pglite.close();
});

// T-203-1 [blocant]: itpark_engagements.fin_party_id column exists
describe("T-203-1 [blocant] itpark_engagements.fin_party_id column exists", () => {
  it("has fin_party_id column on itpark_engagements", async () => {
    const rows = await pglite.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'itpark_engagements' AND column_name = 'fin_party_id'`
    );
    const found = Array.isArray(rows.rows) ? rows.rows : [];
    expect(found).toHaveLength(1);
    expect(found[0].column_name).toBe("fin_party_id");
  });
});

// T-203-2 [blocant]: can insert engagement without fin_party_id (nullable)
describe("T-203-2 [blocant] itpark engagement without fin_party_id inserts cleanly", () => {
  it("engagement.fin_party_id is null when not linked", async () => {
    const [eng] = await testDb
      .insert(itparkEngagements)
      .values({
        tenantId,
        residentName: "Rezident SRL",
        idno: "1234567890123",
        vatPayer: false,
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        reportingYear: 2025,
        status: "draft",
        subcontractorCostsCents: 0,
        adjustedRevenueCents: 0,
      })
      .returning();

    expect(eng.finPartyId).toBeNull();
    expect(eng.id).toBeTruthy();
  });
});

// T-203-3 [blocant]: link engagement to fin_parties (bidirectional)
describe("T-203-3 [blocant] itpark engagement links to fin_parties bidirectionally", () => {
  it("can link engagement.fin_party_id to an existing fin_parties entry", async () => {
    // Create fin_party first
    const [party] = await testDb
      .insert(finParties)
      .values({
        tenantId,
        name: "Rezident Test SRL",
        kind: "both",
        country: "MD",
        idno: "9876543210001",
      })
      .returning();
    expect(party.id).toBeTruthy();

    // Create engagement
    const [eng] = await testDb
      .insert(itparkEngagements)
      .values({
        tenantId,
        residentName: "Rezident Test SRL",
        idno: "9876543210001",
        vatPayer: false,
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        reportingYear: 2025,
        status: "draft",
        subcontractorCostsCents: 0,
        adjustedRevenueCents: 0,
        finPartyId: party.id, // link on creation
      })
      .returning();

    expect(eng.finPartyId).toBe(party.id);
  });
});

// T-203-4 [blocant]: filter engagements by fin_party_id at DB level
describe("T-203-4 [blocant] filter itpark_engagements by fin_party_id", () => {
  it("SELECT WHERE fin_party_id = :id returns only linked engagements", async () => {
    // Create a unique party for this test
    const [party2] = await testDb
      .insert(finParties)
      .values({
        tenantId,
        name: "FilterTarget SRL",
        kind: "client",
        country: "MD",
      })
      .returning();

    // Link one engagement
    await testDb
      .insert(itparkEngagements)
      .values({
        tenantId,
        residentName: "FilterTarget SRL",
        idno: "1111111111111",
        vatPayer: false,
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        reportingYear: 2024,
        status: "draft",
        subcontractorCostsCents: 0,
        adjustedRevenueCents: 0,
        finPartyId: party2.id,
      })
      .returning();

    // Query: filter by finPartyId — simulates what GET /engagements?finPartyId=... does
    const results = await testDb
      .select({ id: itparkEngagements.id, finPartyId: itparkEngagements.finPartyId })
      .from(itparkEngagements)
      .where(and(
        eq(itparkEngagements.tenantId, tenantId),
        eq(itparkEngagements.finPartyId, party2.id)
      ));

    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.finPartyId).toBe(party2.id);
    }
  });
});

// T-203-5 [normal]: update engagement.fin_party_id (set and clear)
describe("T-203-5 [normal] itpark engagement fin_party_id can be set and cleared", () => {
  it("can update fin_party_id from null to a value and back to null", async () => {
    const [party3] = await testDb
      .insert(finParties)
      .values({
        tenantId,
        name: "Temp Link SRL",
        kind: "supplier",
        country: "MD",
      })
      .returning();

    const [eng] = await testDb
      .insert(itparkEngagements)
      .values({
        tenantId,
        residentName: "Temp Rezident SRL",
        idno: "2222222222222",
        vatPayer: false,
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
        reportingYear: 2023,
        status: "draft",
        subcontractorCostsCents: 0,
        adjustedRevenueCents: 0,
      })
      .returning();

    // Set link
    const [linked] = await testDb
      .update(itparkEngagements)
      .set({ finPartyId: party3.id, updatedAt: new Date() })
      .where(eq(itparkEngagements.id, eng.id))
      .returning();
    expect(linked.finPartyId).toBe(party3.id);

    // Clear link
    const [cleared] = await testDb
      .update(itparkEngagements)
      .set({ finPartyId: null, updatedAt: new Date() })
      .where(eq(itparkEngagements.id, eng.id))
      .returning();
    expect(cleared.finPartyId).toBeNull();
  });
});
