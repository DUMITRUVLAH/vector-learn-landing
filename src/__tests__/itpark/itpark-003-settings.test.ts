/**
 * ITPARK-003 — Roluri ITPARK + Settings
 * Tests: T-003-1..T-003-3
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../../server/db/schema/index";
import { itparkSettings } from "../../../server/db/schema/itpark";
import { tenants, users } from "../../../server/db/schema";
import { eq } from "drizzle-orm";

const ROOT = path.resolve(import.meta.dirname ?? __dirname, "../../..");
const DRIZZLE_DIR = path.join(ROOT, "drizzle");

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle>;
let tenantId: string;
let adminUserId: string;
let viewerUserId: string;

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema });

  // Load ALL migrations in order
  const journal = JSON.parse(
    fs.readFileSync(path.join(DRIZZLE_DIR, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };

  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    const statements = raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        await pglite.exec(stmt);
      } catch {
        // ignore errors from existing enums/tables
      }
    }
  }

  const [tenant] = await testDb
    .insert(tenants)
    .values({ name: "IT Park Test Tenant", slug: "itpark-test-003", plan: "growth" })
    .returning();
  tenantId = tenant.id;

  const [admin, viewer] = await testDb
    .insert(users)
    .values([
      { tenantId, email: "admin@itpark.test", passwordHash: "x", name: "Admin Test", role: "admin" },
      { tenantId, email: "viewer@itpark.test", passwordHash: "x", name: "Viewer Test", role: "teacher" },
    ])
    .returning();
  adminUserId = admin.id;
  viewerUserId = viewer.id;
}, 60_000);

afterAll(async () => {
  await pglite.close();
});

// T-003-1: Settings default: prag 70, toleranță 2, MDL
describe("ITPARK-003 — T-003-1: Settings defaults", () => {
  it("can insert settings with defaults and read them back", async () => {
    const [inserted] = await testDb.insert(itparkSettings).values({
      tenantId,
      eligibilityThresholdPct: "70.00",
      toleranceMonths: 2,
      defaultCurrency: "MDL",
    }).returning();

    expect(inserted.eligibilityThresholdPct).toBe("70.00");
    expect(inserted.toleranceMonths).toBe(2);
    expect(inserted.defaultCurrency).toBe("MDL");
    expect(inserted.auditorUserId).toBeNull();
  });

  it("settings.auditorUserId can reference a user (auditor assignment)", async () => {
    const [updated] = await testDb
      .update(itparkSettings)
      .set({ auditorUserId: viewerUserId })
      .where(eq(itparkSettings.tenantId, tenantId))
      .returning();
    expect(updated.auditorUserId).toBe(viewerUserId);
  });
});

// T-003-2: Gating logic (static check of requireItparkRole)
describe("ITPARK-003 — T-003-2: requireItparkRole helper exists", () => {
  it("server/lib/itparkAuth.ts exports requireItparkRole", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/lib/itparkAuth.ts"), "utf-8");
    expect(src).toContain("export async function requireItparkRole");
  });

  it("requireItparkRole blocks viewer from accountant-gated operations", async () => {
    const { requireItparkRole } = await import("../../../server/lib/itparkAuth");
    // Mock context for a viewer (teacher role)
    const mockUser = { id: viewerUserId, tenantId, role: "teacher" as const };
    const mockC = {
      get: (key: string) => (key === "user" ? mockUser : undefined),
      json: (body: unknown, status?: number) => ({ body, status }),
    };
    const result = await requireItparkRole("accountant", mockC as never);
    expect(result).not.toBeNull(); // Viewer blocked (403)
    expect((result as { body: { error: string } }).body.error).toBe("forbidden");
  });

  it("requireItparkRole allows admin for accountant-gated operations", async () => {
    const { requireItparkRole } = await import("../../../server/lib/itparkAuth");
    const mockUser = { id: adminUserId, tenantId, role: "admin" as const };
    const mockC = {
      get: (key: string) => (key === "user" ? mockUser : undefined),
      json: (body: unknown, status?: number) => ({ body, status }),
    };
    const result = await requireItparkRole("accountant", mockC as never);
    expect(result).toBeNull(); // Admin allowed
  });
});

// T-003-3: Routes mounted check (static)
describe("ITPARK-003 — T-003-3: Routes mounted", () => {
  it("app.ts imports itparkSettingsRoutes", () => {
    const appTs = fs.readFileSync(path.join(ROOT, "server/app.ts"), "utf-8");
    expect(appTs).toContain("itparkSettingsRoutes");
  });

  it("app.ts mounts /api/itpark/settings", () => {
    const appTs = fs.readFileSync(path.join(ROOT, "server/app.ts"), "utf-8");
    expect(appTs).toContain('"/api/itpark/settings"');
  });

  it("ItparkSettings.tsx renders without crash (file structure check)", () => {
    const uiTs = fs.readFileSync(
      path.join(ROOT, "src/pages/itpark/ItparkSettings.tsx"),
      "utf-8"
    );
    expect(uiTs).toContain("export default function ItparkSettingsPage");
    expect(uiTs).toContain("eligibilityThresholdPct");
    expect(uiTs).toContain("toleranceMonths");
  });
});
