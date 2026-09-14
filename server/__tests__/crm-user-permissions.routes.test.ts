/**
 * @vitest-environment node
 * DREPTURI PE OM, PESTE ROL — INTEGRATION (cerința 60: „drepturi diferențiate, configurabile per
 * rol/utilizator").
 *
 * Matricea pe roluri rămâne cod — ea garantează că un rol nou nu primește din greșeală drepturi.
 * Excepțiile sunt date: „Maria e agent, dar ea administrează produsele", fără să faci toți
 * agenții administratori.
 *
 * Testul cel mai important e ultimul: poarta e pe SERVER. O excepție care s-ar vedea doar în
 * interfață ar fi o iluzie de control.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { crmUserPermissions } from "../db/schema/crmUserPermissions";
import { effectivePermissions } from "../lib/crm/permissions";

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
let tenantId: string;
let altTenant: string;
let admin: string;
let maria: string;
let altUser: string;

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

const asAdmin = () => (session = { id: admin, tenantId, role: "admin", email: "admin@eco.md" });
const asMaria = () => (session = { id: maria, tenantId, role: "teacher", email: "maria@eco.md" });

async function setPermission(body: Record<string, unknown>) {
  const res = await app.request("/api/crm/permissions/team", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmPermissionsRoutes } = await import("../routes/crmPermissions");
  const { crmProductsRoutes } = await import("../routes/crmProducts");
  app = new Hono();
  app.route("/api/crm/permissions", crmPermissionsRoutes);
  app.route("/api/crm/products", crmProductsRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-perm" }).returning();
  const [t2] = await testDb.insert(tenants).values({ name: "Altul", slug: "alt-perm" }).returning();
  tenantId = t.id;
  altTenant = t2.id;

  const mk = async (tid: string, email: string, role: "admin" | "teacher") => {
    const [u] = await testDb.insert(users).values({ tenantId: tid, email, passwordHash: "x", name: email, role }).returning();
    return u.id;
  };
  admin = await mk(tenantId, "admin@eco.md", "admin");
  maria = await mk(tenantId, "maria@eco.md", "teacher");
  altUser = await mk(altTenant, "strain@alt.md", "teacher");

  asAdmin();
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(async () => {
  await testDb.delete(crmUserPermissions);
  asAdmin();
});

describe("Socoteala drepturilor (pură)", () => {
  it("[normal] acordarea adaugă, retragerea scoate, iar retragerea bate acordarea", () => {
    // Agentul nu administrează produse…
    expect(effectivePermissions("teacher", [])).not.toContain("products.manage");
    // …decât dacă i s-a dat explicit.
    expect(effectivePermissions("teacher", [{ permission: "products.manage", granted: true }])).toContain(
      "products.manage"
    );
    // Adminului i se poate LUA un drept, fără să-i schimbi rolul.
    expect(effectivePermissions("admin", [{ permission: "leads.delete", granted: false }])).not.toContain(
      "leads.delete"
    );
    // Interpretarea sigură când există ambele: cea restrictivă.
    expect(
      effectivePermissions("teacher", [
        { permission: "products.manage", granted: true },
        { permission: "products.manage", granted: false },
      ])
    ).not.toContain("products.manage");
  });
});

describe("Poarta e pe SERVER, nu în interfață", () => {
  it("[blocant] un drept acordat unui agent îl lasă să facă acțiunea care înainte îi era refuzată", async () => {
    asMaria();
    const refuzat = await app.request("/api/crm/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Curs test" }),
    });
    expect(refuzat.status).toBe(403);

    asAdmin();
    expect((await setPermission({ userId: maria, permission: "products.manage", granted: true })).status).toBe(200);

    asMaria();
    const acum = await app.request("/api/crm/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Curs test" }),
    });
    expect(acum.status).toBe(201);
  });

  it("[blocant] un drept RETRAS îl oprește imediat, chiar dacă rolul îl are", async () => {
    asAdmin();
    await setPermission({ userId: admin, permission: "products.manage", granted: false });

    const res = await app.request("/api/crm/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nu trebuie să meargă" }),
    });
    expect(res.status).toBe(403);
  });

  it("[blocant] ștergerea excepției readuce dreptul din rol", async () => {
    asAdmin();
    await setPermission({ userId: admin, permission: "products.manage", granted: false });
    await setPermission({ userId: admin, permission: "products.manage", granted: null });

    const res = await app.request("/api/crm/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Merge din nou" }),
    });
    expect(res.status).toBe(201);
  });
});

describe("Cine poate da drepturi", () => {
  it("[blocant] un agent NU-și poate acorda singur drepturi", async () => {
    asMaria();
    const res = await setPermission({ userId: maria, permission: "products.manage", granted: true });

    expect(res.status).toBe(403);
    expect(await testDb.select().from(crmUserPermissions)).toHaveLength(0);
  });

  it("[blocant] nu se pot da drepturi unui om din alt workspace", async () => {
    asAdmin();
    const res = await setPermission({ userId: altUser, permission: "products.manage", granted: true });

    expect(res.status).toBe(404);
    expect(await testDb.select().from(crmUserPermissions)).toHaveLength(0);
  });

  it("[normal] /permissions spune ce poate omul ACUM, cu excepții cu tot", async () => {
    asAdmin();
    await setPermission({ userId: maria, permission: "audit.view", granted: true });

    asMaria();
    const body = (await (await app.request("/api/crm/permissions")).json()) as {
      permissions: string[];
      fromRole: string[];
    };

    expect(body.permissions).toContain("audit.view");
    // Și se vede că NU vine din rol — ecranul de administrare trebuie să poată arăta diferența.
    expect(body.fromRole).not.toContain("audit.view");
  });

  it("[normal] echipa se vede cu drepturile efective ale fiecăruia", async () => {
    asAdmin();
    await setPermission({ userId: maria, permission: "products.manage", granted: true });

    const body = (await (await app.request("/api/crm/permissions/team")).json()) as {
      members: Array<{ id: string; effective: string[]; overrides: unknown[] }>;
    };

    const m = body.members.find((x) => x.id === maria);
    expect(m?.effective).toContain("products.manage");
    expect(m?.overrides).toHaveLength(1);
    // Oamenii altui workspace nu apar.
    expect(body.members.some((x) => x.id === altUser)).toBe(false);
  });
});
