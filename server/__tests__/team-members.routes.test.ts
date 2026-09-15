/**
 * @vitest-environment node
 * ECHIPA WORKSPACE-ULUI — INTEGRATION.
 *
 * Bug-ul pe care îl închide: `useTeamMembers` cerea `/api/team/members`, rută care NU era
 * montată. Cererea cădea pe fallback-ul SPA, hook-ul rămânea cu o listă goală, iar fișa
 * leadului, tabla, „Astăzi" și „Comunicare" scriau „—" în loc de numele responsabilului —
 * inclusiv în selectoarele din care omul trebuia să ALEAGĂ un responsabil. Nimic nu se vedea
 * ca eroare: o listă goală arată exact ca o echipă fără oameni.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", session);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;
let tenantA: string;

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

  const { teamRoutes } = await import("../routes/team");
  app = new Hono();
  app.route("/api/team", teamRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-team" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Rival", slug: "rival-team" }).returning();
  tenantA = tA.id;

  const [ana] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@eco.md", passwordHash: "x", name: "Ana Ionescu", role: "admin" })
    .returning();
  await testDb.insert(users).values([
    { tenantId: tenantA, email: "ion@eco.md", passwordHash: "x", name: "Ion Rusu", role: "manager" },
    { tenantId: tenantA, email: "elev@eco.md", passwordHash: "x", name: "Elev Test", role: "student" },
    { tenantId: tenantA, email: "parinte@eco.md", passwordHash: "x", name: "Părinte Test", role: "parent" },
    { tenantId: tB.id, email: "bob@rival.md", passwordHash: "x", name: "Bob Rival", role: "admin" },
  ]);

  session = { id: ana.id, tenantId: tenantA, role: "admin", email: ana.email };
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("GET /api/team/members", () => {
  it("[blocant] întoarce echipa workspace-ului, cu numele — nu o listă goală", async () => {
    const res = await app.request("/api/team/members");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; fullName: string; email: string; role: string }[];

    expect(body.map((m) => m.fullName).sort()).toEqual(["Ana Ionescu", "Ion Rusu"]);
    // Forma o dictează clientul care exista deja: `fullName`, nu `name`.
    expect(body[0]).toHaveProperty("email");
    expect(body[0]).toHaveProperty("role");
  });

  it("[blocant] elevii și părinții nu sunt „echipă” — un lead nu se atribuie unui părinte", async () => {
    const body = (await (await app.request("/api/team/members")).json()) as { fullName: string }[];
    expect(body.some((m) => m.fullName === "Elev Test")).toBe(false);
    expect(body.some((m) => m.fullName === "Părinte Test")).toBe(false);
  });

  it("[blocant] oamenii altui workspace nu apar", async () => {
    const body = (await (await app.request("/api/team/members")).json()) as { fullName: string }[];
    expect(body.some((m) => m.fullName === "Bob Rival")).toBe(false);
  });
});
