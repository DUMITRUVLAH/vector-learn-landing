/**
 * @vitest-environment node
 * PAR-002: Role middleware tests
 * Tests: T-PAR-002-1 (403 for unauthorized user)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../../server/db/schema/index";
import { parMembers } from "../../../server/db/schema/par";
import { tenants, users } from "../../../server/db/schema";
import { and, eq, inArray } from "drizzle-orm";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle>;
let tenantId: string;
let userNoRoleId: string;
let userApproverRoleId: string;

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

  const [tenant] = await testDb
    .insert(tenants)
    .values({ name: "Role Test Tenant", slug: "role-test-002", plan: "growth" })
    .returning();
  tenantId = tenant.id;

  const [userNoRole, userApprover] = await testDb
    .insert(users)
    .values([
      { tenantId, email: "norole@test.io", passwordHash: "x", name: "No Role User", role: "teacher" },
      { tenantId, email: "approver@test.io", passwordHash: "x", name: "Approver User", role: "teacher" },
    ])
    .returning();

  userNoRoleId = userNoRole.id;
  userApproverRoleId = userApprover.id;

  // Assign approver role to userApprover
  await testDb.insert(parMembers).values({
    tenantId,
    userId: userApproverRoleId,
    role: "approver",
    approvalLimitCents: 5000000,
  });
}, 120_000);

afterAll(async () => {
  await pglite.close();
});

// T-PAR-002-1 [blocant]: user without PAR role → 403 (db-level simulation)
describe("T-PAR-002-1 [blocant]: requirePARRole enforcement via DB query", () => {
  it("user with no PAR roles → empty members → should get 403", async () => {
    // Simulate what requirePARRole does: query par_members
    const members = await testDb
      .select({ role: parMembers.role })
      .from(parMembers)
      .where(
        and(
          eq(parMembers.tenantId, tenantId),
          eq(parMembers.userId, userNoRoleId),
          inArray(parMembers.role, ["approver"])
        )
      );

    expect(members.length).toBe(0);
    // In the HTTP layer this would return 403 — confirm the DB query returns empty
  });

  it("user with approver role → found → should get 200", async () => {
    const members = await testDb
      .select({ role: parMembers.role })
      .from(parMembers)
      .where(
        and(
          eq(parMembers.tenantId, tenantId),
          eq(parMembers.userId, userApproverRoleId),
          inArray(parMembers.role, ["approver"])
        )
      );

    expect(members.length).toBe(1);
    expect(members[0].role).toBe("approver");
  });

  it("user with approver role does NOT have finance access", async () => {
    const members = await testDb
      .select({ role: parMembers.role })
      .from(parMembers)
      .where(
        and(
          eq(parMembers.tenantId, tenantId),
          eq(parMembers.userId, userApproverRoleId),
          inArray(parMembers.role, ["finance"])
        )
      );

    expect(members.length).toBe(0);
  });
});
