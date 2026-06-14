/**
 * @vitest-environment node
 * SPLIT-201 — PARTY bridge: par_vendors ↔ fin_parties + itpark_engagements ↔ fin_parties
 *
 * Tests: T-201-1, T-201-2, T-201-3, T-201-4, T-201-5
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../../server/db/schema/index";
import { tenants, users } from "../../../server/db/schema";
import { parVendors } from "../../../server/db/schema/par";
import { itparkEngagements } from "../../../server/db/schema/itpark";
import { finParties } from "../../../server/db/schema/finParties";
import { eq, and } from "drizzle-orm";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle>;
let tenantId: string;
let finPartyId: string;
let userId: string;

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema });

  // Apply all migrations (including 0146_itpark_core + 0147_split_party_bridge)
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

  // Seed: tenant, user, fin_party
  const [t] = await testDb
    .insert(tenants)
    .values({ name: "Test Org SPLIT-201", slug: "split-201-test", plan: "growth" })
    .returning();
  tenantId = t.id;

  const [u] = await testDb
    .insert(users)
    .values({
      tenantId,
      email: "split201@test.md",
      passwordHash: "x",
      role: "admin",
      name: "Test User",
    })
    .returning();
  userId = u.id;

  const [fp] = await testDb
    .insert(finParties)
    .values({
      tenantId,
      name: "Acme SRL",
      kind: "supplier",
      country: "MD",
    })
    .returning();
  finPartyId = fp.id;
}, 120_000);

afterAll(async () => {
  await pglite.close();
});

// T-201-1 [blocant]: par_vendors has fin_party_id column
describe("T-201-1 [blocant] par_vendors.fin_party_id column exists", () => {
  it("has fin_party_id column on par_vendors", async () => {
    const rows = await pglite.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'par_vendors' AND column_name = 'fin_party_id'`
    );
    const found = Array.isArray(rows.rows) ? rows.rows : [];
    expect(found).toHaveLength(1);
    expect(found[0].column_name).toBe("fin_party_id");
  });
});

// T-201-2 [blocant]: itpark_engagements has fin_party_id column
describe("T-201-2 [blocant] itpark_engagements.fin_party_id column exists", () => {
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

// T-201-3 [blocant]: db:reset + seed compatibility (no FK errors on inserts)
describe("T-201-3 [blocant] inserts work without fin_party_id set", () => {
  it("inserts a par_vendor without fin_party_id (nullable)", async () => {
    const [vendor] = await testDb
      .insert(parVendors)
      .values({
        tenantId,
        name: "Test Vendor SRL",
        idnp: null,
        iban: null,
        bank: null,
        notes: null,
      })
      .returning();

    expect(vendor.id).toBeTruthy();
    expect(vendor.finPartyId).toBeNull();
  });

  it("inserts an itpark_engagement without fin_party_id (nullable)", async () => {
    const [eng] = await testDb
      .insert(itparkEngagements)
      .values({
        tenantId,
        residentName: "DigitalPro SRL",
        idno: "1234567890123",
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        reportingYear: 2025,
      })
      .returning();

    expect(eng.id).toBeTruthy();
    expect(eng.finPartyId).toBeNull();
  });
});

// T-201-4 [blocant]: can set fin_party_id on par_vendor
describe("T-201-4 [blocant] par_vendor fin_party_id can be set", () => {
  it("sets fin_party_id on a vendor and retrieves it", async () => {
    const [vendor] = await testDb
      .insert(parVendors)
      .values({
        tenantId,
        name: "Linked Vendor SRL",
      })
      .returning();

    const [updated] = await testDb
      .update(parVendors)
      .set({ finPartyId: finPartyId })
      .where(and(eq(parVendors.id, vendor.id), eq(parVendors.tenantId, tenantId)))
      .returning();

    expect(updated.finPartyId).toBe(finPartyId);
  });
});

// T-201-5 [normal]: can clear fin_party_id (set to null)
describe("T-201-5 [normal] par_vendor fin_party_id can be cleared", () => {
  it("clears fin_party_id by setting to null", async () => {
    const [vendor] = await testDb
      .insert(parVendors)
      .values({
        tenantId,
        name: "Unlinkable Vendor",
        finPartyId: finPartyId,
      })
      .returning();

    expect(vendor.finPartyId).toBe(finPartyId);

    const [cleared] = await testDb
      .update(parVendors)
      .set({ finPartyId: null })
      .where(eq(parVendors.id, vendor.id))
      .returning();

    expect(cleared.finPartyId).toBeNull();
  });
});
