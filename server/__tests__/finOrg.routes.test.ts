/**
 * @vitest-environment node
 * Regression for the 2026-08-10..25 live bug: finOrgRoutes defines its endpoints as "/org",
 * "/series", "/series/:id" internally (see server/routes/finOrg.ts), so it must be mounted at
 * /api/fin — mounting at /api/fin/org (the bug that shipped) doubles the segment, so every real
 * request to GET/PATCH /api/fin/org actually needed /api/fin/org/org and 404'd instead. It went
 * undetected for 15 days (2 tenants, 5 recorded events in error_groups "route_not_found") because
 * no test exercised the router mounted the way app.ts actually mounts it — this one does.
 *
 * Mirrors app.ts's real `app.route("/api/fin", finOrgRoutes)` call; if that line regresses back
 * to `/api/fin/org`, THIS test still mounts correctly and won't catch it — but it locks in that
 * /api/fin/org is the right prefix for this router's internal paths.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { finMembers } from "../db/schema/finCore";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "manager", email: "contabil@vector.md" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { finOrgRoutes } = await import("../routes/finOrg");
  app = new Hono();
  // Same prefix app.ts uses — see the comment there.
  app.route("/api/fin", finOrgRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC Test", slug: "atic-org" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "contabil@vector.md", passwordHash: "x", name: "Ana Contabil", role: "manager" })
    .returning();
  userId = u.id;
  await testDb.insert(finMembers).values({ tenantId, userId, role: "accountant" });
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

describe("GET/PATCH /api/fin/org — real mount, not a hand-rolled prefix", () => {
  it("[blocant] GET /api/fin/org resolves to the org-profile route, not a 404", async () => {
    const res = await app.request("/api/fin/org");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: unknown };
    expect(body).toHaveProperty("profile");
  });

  it("[blocant] PATCH /api/fin/org saves the profile at the exact path the frontend calls", async () => {
    const res = await app.request("/api/fin/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legalName: "NEWS MAKER SRL", country: "MD" }),
    });
    // 201: no profile row existed yet, so the PATCH handler upserts (creates) it.
    expect(res.status).toBe(201);

    const after = await app.request("/api/fin/org");
    const body = (await after.json()) as { profile: { legalName: string } | null };
    expect(body.profile?.legalName).toBe("NEWS MAKER SRL");
  });

  it("the doubled-segment path from the old (buggy) mount is NOT where the route lives", async () => {
    const res = await app.request("/api/fin/org/org");
    expect(res.status).toBe(404);
  });
});
