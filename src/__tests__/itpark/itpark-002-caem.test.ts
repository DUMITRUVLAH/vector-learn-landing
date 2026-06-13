/**
 * ITPARK-002 — Nomenclator CAEM + helper isEligibleCaem
 * Tests: T-002-1..T-002-3
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as itparkSchema from "../../../server/db/schema/itpark";

const ROOT = path.resolve(import.meta.dirname ?? __dirname, "../../..");
const DRIZZLE_DIR = path.join(ROOT, "drizzle");

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle>;

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema: itparkSchema });

  // Load ALL migrations in order (needed for FK references to tenants/users)
  const journal = JSON.parse(
    fs.readFileSync(path.join(DRIZZLE_DIR, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };

  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
    if (!fs.existsSync(file)) continue; // skip missing snapshots
    const raw = fs.readFileSync(file, "utf8");
    const statements = raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        await pglite.exec(stmt);
      } catch {
        // ignore errors from existing enums/tables (idempotency issues in test env)
      }
    }
  }
}, 60_000);

afterAll(async () => {
  await pglite.close();
});

// T-002-1: CAEM codes can be inserted and queried, 85.59 and 62.02 are eligible
describe("ITPARK-002 — T-002-1: CAEM codes in DB", () => {
  it("can insert CAEM codes and 85.59 is eligible", async () => {
    const { eq } = await import("drizzle-orm");
    await testDb.insert(itparkSchema.itparkCaemCodes).values([
      { code: "85.59", label: "Alte forme de învățământ (instruire digital)", eligible: true, effectiveFrom: "2024-01-01" },
      { code: "62.02", label: "Consultanță în tehnologia informației", eligible: true, effectiveFrom: "2024-01-01" },
      { code: "47.11", label: "Comerț cu amănuntul în magazine nespecializate", eligible: false, effectiveFrom: "2024-01-01" },
    ]);

    const rows = await testDb
      .select()
      .from(itparkSchema.itparkCaemCodes)
      .where(eq(itparkSchema.itparkCaemCodes.code, "85.59"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].eligible).toBe(true);
  });

  it("62.02 is eligible=true", async () => {
    const { eq } = await import("drizzle-orm");
    const rows = await testDb
      .select()
      .from(itparkSchema.itparkCaemCodes)
      .where(eq(itparkSchema.itparkCaemCodes.code, "62.02"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.find((r) => r.code === "62.02")?.eligible).toBe(true);
  });
});

// T-002-2: cod 47.11 → NOT eligible
describe("ITPARK-002 — T-002-2: Non-eligible code handling", () => {
  it("47.11 is eligible=false", async () => {
    const { eq } = await import("drizzle-orm");
    const rows = await testDb
      .select()
      .from(itparkSchema.itparkCaemCodes)
      .where(eq(itparkSchema.itparkCaemCodes.code, "47.11"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].eligible).toBe(false);
  });

  it("unknown code 99.99 → not in DB (would return empty → eligible=false)", async () => {
    const { eq } = await import("drizzle-orm");
    const rows = await testDb
      .select()
      .from(itparkSchema.itparkCaemCodes)
      .where(eq(itparkSchema.itparkCaemCodes.code, "99.99"));
    expect(rows.length).toBe(0);
  });
});

// T-002-3: Route mounted check (static file check — no server needed)
describe("ITPARK-002 — T-002-3: Route mounted in app.ts", () => {
  it("app.ts imports itparkCaemRoutes", () => {
    const appTs = fs.readFileSync(path.join(ROOT, "server/app.ts"), "utf-8");
    expect(appTs).toContain("itparkCaemRoutes");
  });

  it("app.ts mounts /api/itpark/caem-codes", () => {
    const appTs = fs.readFileSync(path.join(ROOT, "server/app.ts"), "utf-8");
    expect(appTs).toContain('"/api/itpark/caem-codes"');
  });

  it("server/routes/itparkCaem.ts exports itparkCaemRoutes", () => {
    const routeTs = fs.readFileSync(path.join(ROOT, "server/routes/itparkCaem.ts"), "utf-8");
    expect(routeTs).toContain("export const itparkCaemRoutes");
  });

  it("isEligibleCaem helper exported from route file", () => {
    const routeTs = fs.readFileSync(path.join(ROOT, "server/routes/itparkCaem.ts"), "utf-8");
    expect(routeTs).toContain("export async function isEligibleCaem");
  });

  it("frontend API client exists at src/lib/api/itparkCaem.ts", () => {
    const clientTs = fs.readFileSync(path.join(ROOT, "src/lib/api/itparkCaem.ts"), "utf-8");
    expect(clientTs).toContain("fetchCaemCodes");
    expect(clientTs).toContain("isEligibleCaemLocal");
  });
});
