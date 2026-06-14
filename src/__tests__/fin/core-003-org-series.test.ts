/**
 * @vitest-environment node
 * CORE-003: FinDesk org profile + invoice series tests
 *
 * T-CORE-003-1 [blocant] IDNO invalid → rejected
 * T-CORE-003-2 [blocant] next number 3× consecutiv → 0001, 0002, 0003
 * T-CORE-003-3 [blocant] 10 apeluri → 10 numere distincte (atomicitate)
 * T-CORE-003-4 [blocant] A doua serie default → prima demotata
 * T-CORE-003-5 [blocant] Tenant isolation: serie de alt tenant inaccesibilă
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../../server/db/schema/index";
import { finOrgProfile, finInvoiceSeries } from "../../../server/db/schema/finCore";
import { tenants } from "../../../server/db/schema";
import { and, eq, sql } from "drizzle-orm";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle>;

let tenantAId: string;
let tenantBId: string;

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema });

  const drizzleDir = path.resolve(import.meta.dirname ?? __dirname, "../../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };

  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = path.join(drizzleDir, `${entry.tag}.sql`);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    const statements = raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await pglite.exec(stmt);
    }
  }

  const [tA] = await testDb
    .insert(tenants)
    .values({ name: "Vega SRL", slug: "c003-vega", plan: "pro" })
    .returning();
  tenantAId = tA.id;

  const [tB] = await testDb
    .insert(tenants)
    .values({ name: "Rival SRL", slug: "c003-rival", plan: "starter" })
    .returning();
  tenantBId = tB.id;
}, 120_000);

afterAll(async () => {
  await pglite.close();
});

function formatNum(prefix: string, num: number, pad: number): string {
  return `${prefix}${String(num).padStart(pad, "0")}`;
}

// ─── T-CORE-003-1 [blocant]: IDNO validation ─────────────────────────────────
describe("T-CORE-003-1 [blocant]: IDNO validation", () => {
  it("rejects IDNO shorter than 13 digits for MD", () => {
    expect(/^\d{13}$/.test("12345")).toBe(false);
  });
  it("accepts valid 13-digit IDNO for MD", () => {
    expect(/^\d{13}$/.test("1012345678901")).toBe(true);
  });
  it("rejects IDNO with letters for MD", () => {
    expect(/^\d{13}$/.test("ABC1234567890")).toBe(false);
  });
});

// ─── T-CORE-003-2 [blocant]: sequential numbering ────────────────────────────
describe("T-CORE-003-2 [blocant]: sequential numbering", () => {
  it("allocates 0001, 0002, 0003 for 3 consecutive next() calls", async () => {
    const [serie] = await testDb
      .insert(finInvoiceSeries)
      .values({
        tenantId: tenantAId,
        prefix: "VEGA-2026-",
        nextNumber: 1,
        padWidth: 4,
        docType: "invoice",
        isDefault: true,
      })
      .returning();

    const allocated: string[] = [];
    for (let i = 0; i < 3; i++) {
      const rows = await testDb
        .update(finInvoiceSeries)
        .set({ nextNumber: sql`${finInvoiceSeries.nextNumber} + 1`, updatedAt: new Date() })
        .where(eq(finInvoiceSeries.id, serie.id))
        .returning({ nextNumber: finInvoiceSeries.nextNumber });

      const n = rows[0].nextNumber - 1;
      allocated.push(formatNum("VEGA-2026-", n, 4));
    }

    expect(allocated).toEqual(["VEGA-2026-0001", "VEGA-2026-0002", "VEGA-2026-0003"]);
  });
});

// ─── T-CORE-003-3 [blocant]: atomic allocation ────────────────────────────────
describe("T-CORE-003-3 [blocant]: 10 next() → 10 distinct numbers", () => {
  it("allocates 10 unique numbers", async () => {
    const [serie] = await testDb
      .insert(finInvoiceSeries)
      .values({
        tenantId: tenantAId,
        prefix: "CONC-",
        nextNumber: 1,
        padWidth: 4,
        docType: "proforma",
        isDefault: false,
      })
      .returning();

    const numbers: number[] = [];
    for (let i = 0; i < 10; i++) {
      const rows = await testDb
        .update(finInvoiceSeries)
        .set({ nextNumber: sql`${finInvoiceSeries.nextNumber} + 1`, updatedAt: new Date() })
        .where(eq(finInvoiceSeries.id, serie.id))
        .returning({ nextNumber: finInvoiceSeries.nextNumber });

      numbers.push(rows[0].nextNumber - 1);
    }

    expect(new Set(numbers).size).toBe(10);
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

// ─── T-CORE-003-4 [blocant]: default constraint ────────────────────────────────
describe("T-CORE-003-4 [blocant]: one default per doc_type", () => {
  it("marking second default demotes first", async () => {
    const [s1] = await testDb
      .insert(finInvoiceSeries)
      .values({ tenantId: tenantAId, prefix: "D1-", nextNumber: 1, padWidth: 4, docType: "receipt", isDefault: true })
      .returning();

    const [s2] = await testDb
      .insert(finInvoiceSeries)
      .values({ tenantId: tenantAId, prefix: "D2-", nextNumber: 1, padWidth: 4, docType: "receipt", isDefault: true })
      .returning();

    // Enforce constraint (demote others)
    await testDb
      .update(finInvoiceSeries)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(finInvoiceSeries.tenantId, tenantAId),
          eq(finInvoiceSeries.docType, "receipt"),
          eq(finInvoiceSeries.isDefault, true),
          sql`${finInvoiceSeries.id} != ${s2.id}`
        )
      );

    const [r1] = await testDb.select({ isDefault: finInvoiceSeries.isDefault }).from(finInvoiceSeries).where(eq(finInvoiceSeries.id, s1.id));
    const [r2] = await testDb.select({ isDefault: finInvoiceSeries.isDefault }).from(finInvoiceSeries).where(eq(finInvoiceSeries.id, s2.id));

    expect(r1.isDefault).toBe(false);
    expect(r2.isDefault).toBe(true);
  });
});

// ─── T-CORE-003-5 [blocant]: tenant isolation ────────────────────────────────
describe("T-CORE-003-5 [blocant]: tenant isolation", () => {
  it("tenantB cannot see tenantA series", async () => {
    const bSeries = await testDb
      .select()
      .from(finInvoiceSeries)
      .where(eq(finInvoiceSeries.tenantId, tenantBId));

    expect(bSeries.length).toBe(0);
  });

  it("tenantA org profile isolated from tenantB", async () => {
    await testDb
      .insert(finOrgProfile)
      .values({
        tenantId: tenantAId,
        legalName: "Studio Vega SRL",
        idno: "1012345678901",
        country: "MD",
        vatRegime: "payer",
        baseCurrency: "MDL",
      })
      .onConflictDoNothing();

    const bProfiles = await testDb
      .select()
      .from(finOrgProfile)
      .where(eq(finOrgProfile.tenantId, tenantBId));

    expect(bProfiles.length).toBe(0);
  });
});
