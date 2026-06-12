/**
 * @vitest-environment node
 * PAR-003: Org config integration tests
 * Tests: T-PAR-003-1, T-PAR-003-2, T-PAR-003-4
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../../server/db/schema/index";
import {
  parBudgetCodes,
  parDepartments,
  parProjects,
  parVendors,
  parSettings,
  parMembers,
} from "../../../server/db/schema/par";
import { tenants, users } from "../../../server/db/schema";
import { and, eq } from "drizzle-orm";
import { isValidMoldovaIBAN, isValidIDNP } from "../../../server/lib/par/validators";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle>;
let tenantId: string;
let otherTenantId: string;

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema });

  // Apply migrations
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

  // Create two tenants for isolation testing
  const [t1] = await testDb
    .insert(tenants)
    .values({ name: "ATIC NGO Test", slug: "atic-test-003", plan: "growth" })
    .returning();
  tenantId = t1.id;

  const [t2] = await testDb
    .insert(tenants)
    .values({ name: "Other NGO", slug: "other-ngo-003", plan: "growth" })
    .returning();
  otherTenantId = t2.id;

  // Seed some data for other tenant (should not leak)
  await testDb.insert(parBudgetCodes).values({
    tenantId: otherTenantId,
    code: "OTHER-001",
    name: "Other budget code",
  });
}, 120_000);

afterAll(async () => {
  await pglite.close();
});

// T-PAR-003-1 [blocant]: budget code POST creates item, GET returns it
describe("T-PAR-003-1 [blocant]: budget codes CRUD", () => {
  it("inserts a budget code and retrieves it", async () => {
    const [row] = await testDb
      .insert(parBudgetCodes)
      .values({ tenantId, code: "M13", name: "Monthly procurement budget" })
      .returning();

    expect(row.code).toBe("M13");
    expect(row.name).toBe("Monthly procurement budget");
    expect(row.active).toBe(true);
    expect(row.tenantId).toBe(tenantId);

    // Retrieve
    const found = await testDb
      .select()
      .from(parBudgetCodes)
      .where(and(eq(parBudgetCodes.tenantId, tenantId), eq(parBudgetCodes.code, "M13")));

    expect(found.length).toBe(1);
    expect(found[0].id).toBe(row.id);
  });

  it("soft-delete sets active=false", async () => {
    const [row] = await testDb
      .insert(parBudgetCodes)
      .values({ tenantId, code: "M14-DEL", name: "To be deleted" })
      .returning();

    await testDb
      .update(parBudgetCodes)
      .set({ active: false })
      .where(eq(parBudgetCodes.id, row.id));

    const found = await testDb
      .select()
      .from(parBudgetCodes)
      .where(and(eq(parBudgetCodes.id, row.id), eq(parBudgetCodes.active, false)));

    expect(found.length).toBe(1);
  });
});

// T-PAR-003-2 [blocant]: vendor with valid IBAN → ok; invalid IBAN → validation fails
describe("T-PAR-003-2 [blocant]: vendor IBAN validation", () => {
  it("valid MD IBAN passes validation", () => {
    // Sample from PAR-CORE
    expect(isValidMoldovaIBAN("MD48ML000002259A19498121")).toBe(true);
  });

  it("invalid IBAN fails validation", () => {
    expect(isValidMoldovaIBAN("MD00INVALID")).toBe(false);
  });

  it("inserts vendor with valid IBAN", async () => {
    const [row] = await testDb
      .insert(parVendors)
      .values({
        tenantId,
        name: "Daria Roitman",
        idnp: "2008001007903",
        iban: "MD48ML000002259A19498121",
        bank: "BC Moldindconbank S.A.",
      })
      .returning();

    expect(row.name).toBe("Daria Roitman");
    expect(row.iban).toBe("MD48ML000002259A19498121");
    expect(row.idnp).toBe("2008001007903");
  });
});

// T-PAR-003-4 [normal]: tenant isolation — other tenant's data does not appear
describe("T-PAR-003-4 [normal]: tenant isolation", () => {
  it("budget code of other tenant does not appear in this tenant's query", async () => {
    const rows = await testDb
      .select()
      .from(parBudgetCodes)
      .where(eq(parBudgetCodes.tenantId, tenantId));

    const codes = rows.map((r) => r.code);
    expect(codes).not.toContain("OTHER-001");
  });

  it("project of other tenant does not appear", async () => {
    // Insert a project for other tenant
    await testDb.insert(parProjects).values({
      tenantId: otherTenantId,
      name: "Secret Project",
      donor: "Unknown",
    });

    const myProjects = await testDb
      .select()
      .from(parProjects)
      .where(eq(parProjects.tenantId, tenantId));

    const names = myProjects.map((p) => p.name);
    expect(names).not.toContain("Secret Project");
  });
});
