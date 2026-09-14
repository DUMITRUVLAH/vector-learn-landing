/**
 * @vitest-environment node
 * VIZUALIZĂRI SALVATE — INTEGRATION (ruta reală, PGlite, toate migrările).
 *
 * Portare din crm-vector (`src/lib/crm/savedViews.ts`), unde orice vizualizare era globală
 * (`is_public: true`) fiindcă baza avea un singur utilizator. Aici un workspace are echipă, deci
 * regula se schimbă: personală implicit, partajată doar explicit. Testele închid exact asta —
 * plus izolarea între workspace-uri.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { crmSavedViews } from "../db/schema/crmSavedViews";

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
let vectorTenant: string;
let aticTenant: string;
let ana: string;
let boris: string;
let adminVector: string;
let borisAtic: string;

interface ViewRow {
  id: string;
  name: string;
  isShared: boolean;
}

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

async function listViews(): Promise<ViewRow[]> {
  const res = await app.request("/api/crm/saved-views");
  return ((await res.json()) as { items: ViewRow[] }).items;
}

async function createView(name: string, isShared: boolean) {
  const res = await app.request("/api/crm/saved-views", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, isShared, filters: { search: "restant", onlyMine: true, view: "list" } }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmSavedViewsRoutes } = await import("../routes/crmSavedViews");
  app = new Hono();
  app.route("/api/crm/saved-views", crmSavedViewsRoutes);

  const [vector] = await testDb.insert(tenants).values({ name: "Vector", slug: "vector-views" }).returning();
  const [atic] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-views" }).returning();
  vectorTenant = vector.id;
  aticTenant = atic.id;

  const mkUser = async (tenantId: string, email: string, role: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name: email, role })
      .returning();
    return u.id;
  };
  ana = await mkUser(vectorTenant, "ana@vector.md", "teacher");
  boris = await mkUser(vectorTenant, "boris@vector.md", "teacher");
  adminVector = await mkUser(vectorTenant, "admin@vector.md", "admin");
  borisAtic = await mkUser(aticTenant, "boris@atic.md", "admin");

  session = { id: ana, tenantId: vectorTenant, role: "teacher", email: "ana@vector.md" };
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Vizibilitatea unei vizualizări", () => {
  it("[blocant] o vizualizare personală NU se vede de colegul din același workspace", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "teacher", email: "ana@vector.md" };
    const created = await createView("Ale mele restante", false);
    expect(created.status).toBe(201);
    expect(created.body.isShared).toBe(false); // personală implicit

    session = { id: boris, tenantId: vectorTenant, role: "teacher", email: "boris@vector.md" };
    const borisViews = await listViews();
    expect(borisViews.map((v) => v.name)).not.toContain("Ale mele restante");
  });

  it("[blocant] una partajată se vede de toată echipa, dar NU din alt workspace", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "teacher", email: "ana@vector.md" };
    await createView("B2B al echipei", true);

    session = { id: boris, tenantId: vectorTenant, role: "teacher", email: "boris@vector.md" };
    expect((await listViews()).map((v) => v.name)).toContain("B2B al echipei");

    session = { id: borisAtic, tenantId: aticTenant, role: "admin", email: "boris@atic.md" };
    expect(await listViews()).toHaveLength(0);
  });
});

describe("Cine poate schimba o vizualizare", () => {
  it("[blocant] partajată nu înseamnă a tuturor: colegul n-o poate șterge sau redenumi", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "teacher", email: "ana@vector.md" };
    const created = await createView("A Anei, partajată", true);
    const id = created.body.id as string;

    session = { id: boris, tenantId: vectorTenant, role: "teacher", email: "boris@vector.md" };
    const patch = await app.request(`/api/crm/saved-views/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "A lui Boris acum" }),
    });
    expect(patch.status).toBe(403);

    const del = await app.request(`/api/crm/saved-views/${id}`, { method: "DELETE" });
    expect(del.status).toBe(403);

    const [after] = await testDb.select().from(crmSavedViews).where(eq(crmSavedViews.id, id));
    expect(after.name).toBe("A Anei, partajată");
  });

  it("[normal] adminul workspace-ului poate face curat în vizualizările partajate", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "teacher", email: "ana@vector.md" };
    const created = await createView("De șters de admin", true);
    const id = created.body.id as string;

    session = { id: adminVector, tenantId: vectorTenant, role: "admin", email: "admin@vector.md" };
    const del = await app.request(`/api/crm/saved-views/${id}`, { method: "DELETE" });
    expect(del.status).toBe(200);

    const rows = await testDb.select().from(crmSavedViews).where(eq(crmSavedViews.id, id));
    expect(rows).toHaveLength(0);
  });

  it("[blocant] o vizualizare din alt workspace → 404, nu 403", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "teacher", email: "ana@vector.md" };
    const created = await createView("A Vectorului", true);
    const id = created.body.id as string;

    session = { id: borisAtic, tenantId: aticTenant, role: "admin", email: "boris@atic.md" };
    const res = await app.request(`/api/crm/saved-views/${id}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("Ce se salvează", () => {
  it("[normal] filtrele se întorc exact cum au fost salvate — altfel vizualizarea minte", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "teacher", email: "ana@vector.md" };
    const created = await createView("Cu filtre", false);
    expect(created.body.filters).toEqual({ search: "restant", onlyMine: true, view: "list" });
  });
});
