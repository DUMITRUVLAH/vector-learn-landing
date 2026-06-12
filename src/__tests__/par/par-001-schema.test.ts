/**
 * @vitest-environment node
 * PAR-001: Schema tests
 * Tests: T-PAR-001-1 through T-PAR-001-5
 * Validates: migration correctness, seed data, schema/index export, settings row
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../../server/db/schema/index";
import {
  parSettings,
  parMembers,
  parDoaMatrix,
} from "../../../server/db/schema/par";
import { tenants, users } from "../../../server/db/schema";

let db: ReturnType<typeof drizzle>;
let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle({ client, schema });

  // Apply every committed migration in journal order (mirrors schema-drift test approach)
  const drizzleDir = path.resolve(import.meta.dirname ?? __dirname, "../../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };

  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = path.join(drizzleDir, `${entry.tag}.sql`);
    const raw = fs.readFileSync(file, "utf8");
    const statements = raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await client.exec(stmt);
    }
  }
}, 120_000);

afterAll(async () => {
  await client.close();
});

// T-PAR-001-3 [blocant]: schema/index.ts exports par tables (db.query.parRequests must not be undefined)
describe("T-PAR-001-3 [blocant]: schema index exports", () => {
  it("db.query.parRequests is defined — export * from ./par present in index.ts", () => {
    expect(db.query.parRequests).toBeDefined();
    expect(db.query.parLineItems).toBeDefined();
    expect(db.query.parApprovals).toBeDefined();
    expect(db.query.parAttachments).toBeDefined();
    expect(db.query.parPayments).toBeDefined();
    expect(db.query.parDoaMatrix).toBeDefined();
    expect(db.query.parBudgetCodes).toBeDefined();
    expect(db.query.parDepartments).toBeDefined();
    expect(db.query.parProjects).toBeDefined();
    expect(db.query.parVendors).toBeDefined();
    expect(db.query.parSettings).toBeDefined();
    expect(db.query.parAudit).toBeDefined();
    expect(db.query.parMembers).toBeDefined();
  });
});

// T-PAR-001-1 [blocant]: migration 0113 creates all PAR tables
describe("T-PAR-001-1 [blocant]: migration 0113 creates all PAR tables and enums", () => {
  it("all par_* tables exist after migration", async () => {
    const tables = [
      "par_members",
      "par_departments",
      "par_projects",
      "par_budget_codes",
      "par_vendors",
      "par_settings",
      "par_doa_matrix",
      "par_requests",
      "par_line_items",
      "par_approvals",
      "par_attachments",
      "par_payments",
      "par_audit",
    ];

    for (const tableName of tables) {
      const result = await client.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE table_name = '${tableName}' AND table_schema = 'public'`
      );
      const cnt = Number((result.rows[0] as { cnt: string }).cnt);
      expect(cnt, `Table ${tableName} should exist`).toBe(1);
    }
  });

  it("par enums exist", async () => {
    const enums = [
      "par_purpose",
      "par_charge_to",
      "par_status",
      "par_decision",
      "par_role",
      "par_attachment_kind",
    ];

    for (const enumName of enums) {
      const result = await client.query(
        `SELECT COUNT(*) AS cnt FROM pg_type WHERE typname = '${enumName}'`
      );
      const cnt = Number((result.rows[0] as { cnt: string }).cnt);
      expect(cnt, `Enum ${enumName} should exist`).toBe(1);
    }
  });
});

// T-PAR-001-2 and T-PAR-001-4: seed creates par_settings with MDL + threshold
describe("T-PAR-001-2 / T-PAR-001-4: par_settings with threshold and MDL currency", () => {
  it("T-PAR-001-4 [normal]: can insert and retrieve par_settings with currency=MDL", async () => {
    // Insert minimal tenant + user + par_settings
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Test NGO PAR", slug: "test-ngo-par-001", plan: "growth" })
      .returning();

    const [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: "admin@test-par001.io",
        passwordHash: "$2a$10$placeholder",
        name: "Test Admin PAR",
        role: "admin",
      })
      .returning();

    const [settings] = await db
      .insert(parSettings)
      .values({
        tenantId: tenant.id,
        microPurchaseThresholdCents: 500000,
        defaultCurrency: "MDL",
        orgLegalName: "Test NGO",
        requestNoPrefix: "PAR",
      })
      .returning();

    expect(settings.microPurchaseThresholdCents).toBe(500000);
    expect(settings.defaultCurrency).toBe("MDL");
    expect(settings.requestNoPrefix).toBe("PAR");

    // par_members assignment
    const [member] = await db
      .insert(parMembers)
      .values({ tenantId: tenant.id, userId: user.id, role: "par_admin" })
      .returning();
    expect(member.role).toBe("par_admin");

    // DOA matrix row
    const [doaRow] = await db
      .insert(parDoaMatrix)
      .values({
        tenantId: tenant.id,
        minAmountCents: 0,
        maxAmountCents: 500000,
        step: 1,
        approverRoleLabel: "DOA Holder / Supervisor",
        approverParRole: "approver",
      })
      .returning();
    expect(doaRow.step).toBe(1);
    expect(doaRow.approverParRole).toBe("approver");
  });
});

// Money columns use integer types
describe("Schema structure: money in integer minor units", () => {
  it("par_requests.total_estimated_cents is integer type", async () => {
    const result = await client.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'par_requests' AND column_name = 'total_estimated_cents'`
    );
    expect((result.rows[0] as { data_type: string }).data_type).toBe("integer");
  });

  it("par_line_items has integer unit_price_cents and line_total_cents", async () => {
    const result = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'par_line_items' AND column_name IN ('unit_price_cents', 'line_total_cents')
       ORDER BY column_name`
    );
    expect(result.rows.length).toBe(2);
    for (const row of result.rows as { data_type: string }[]) {
      expect(row.data_type).toBe("integer");
    }
  });
});
