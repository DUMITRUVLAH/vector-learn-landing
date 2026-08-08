/**
 * @vitest-environment node
 *
 * PLATFORM-001 — Consola Platformă, teste de INTEGRARE pe rutele Hono reale + PGlite.
 *
 * Regula din CLAUDE.md §3.5.1quater („testează ACȚIUNEA, nu butonul"): fiecare endpoint nou
 * e chemat cel puțin o dată, cu input realist, și i se verifică statusul + forma răspunsului.
 * Un test care doar montează ruta nu dovedește nimic despre ce se întâmplă la click.
 *
 * Acoperă și cele trei comportamente pe care ușor le-am fi stricat în tăcere:
 *   1. logările (reușite ȘI eșuate) chiar ajung în `login_events`
 *   2. un workspace suspendat nu se mai poate autentifica — și nici sesiunea deschisă nu trece
 *   3. gating-ul de module e FAIL-OPEN: fără rând în `tenant_modules`, modulul rămâne vizibil
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { loginEvents, platformAuditLog, tenantModules } from "../db/schema/platform";
import { platformAdmins, parPayers } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let ownerTenantId: string;
let ownerUserId: string;
let clientTenantId: string;
let clientUserId: string;

vi.mock("../db/client", () => ({ get db() { return testDb; }, closeDb: async () => {} }));
vi.mock("../auth/password", () => ({
  hashPassword: vi.fn(async (pw: string) => `$mock$${pw}`),
  verifyPassword: vi.fn(async (pw: string, hash: string) => hash === `$mock$${pw}`),
}));
// Sesiunea e simulată prin cookie: "owner" → superadmin, "client" → utilizator obișnuit.
vi.mock("../auth/session", () => ({
  SESSION_COOKIE: "vl_session",
  createSession: vi.fn().mockResolvedValue({ token: "t", expiresAt: new Date(Date.now() + 86_400_000) }),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  getSessionUser: vi.fn(async (token: string) => {
    const id = token === "owner" ? ownerUserId : token === "client" ? clientUserId : null;
    if (!id) return null;
    const user = await testDb.query.users.findFirst({ where: eq(users.id, id) });
    return user ? { session: { id: "s" }, user } : null;
  }),
}));

import { platformAdminRoutes } from "../routes/platformAdmin";
import { myModulesRoutes } from "../routes/myModules";
import { businessAuthRoutes } from "../routes/businessAuth";
import { Hono } from "hono";

const app = new Hono();
app.route("/api/platform", platformAdminRoutes);
app.route("/api/modules", myModulesRoutes);
app.route("/api/business", businessAuthRoutes);

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

const asOwner = (p: string, init: RequestInit = {}) =>
  app.request(p, { ...init, headers: { "content-type": "application/json", cookie: "vl_session=owner", ...(init.headers ?? {}) } });
const asClient = (p: string, init: RequestInit = {}) =>
  app.request(p, { ...init, headers: { "content-type": "application/json", cookie: "vl_session=client", ...(init.headers ?? {}) } });
const put = (body: unknown) => ({ method: "PUT", body: JSON.stringify(body) });
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema }) as unknown as typeof testDb;
  await applyMigrations(pglite);

  const [ownerTenant] = await testDb
    .insert(tenants)
    .values({ name: "Vector Platform", slug: "vector-platform", plan: "enterprise", appKind: "business" })
    .returning();
  ownerTenantId = ownerTenant.id;
  const [owner] = await testDb
    .insert(users)
    .values({ tenantId: ownerTenantId, email: "owner@vector.md", passwordHash: "$mock$ownerpw", name: "Owner", role: "admin" })
    .returning();
  ownerUserId = owner.id;
  await testDb.insert(platformAdmins).values({ userId: ownerUserId });

  const [clientTenant] = await testDb
    .insert(tenants)
    .values({ name: "Client SRL", slug: "client-srl", plan: "starter", appKind: "business" })
    .returning();
  clientTenantId = clientTenant.id;
  const [client] = await testDb
    .insert(users)
    .values({ tenantId: clientTenantId, email: "client@srl.md", passwordHash: "$mock$clientpw", name: "Client", role: "admin" })
    .returning();
  clientUserId = client.id;
  await testDb.insert(parPayers).values({ tenantId: clientTenantId, name: "Client SRL", legalName: "Client SRL" });
}, 90_000);

afterAll(async () => {
  await pglite.close();
});

describe("acces", () => {
  it("respinge un utilizator obișnuit cu 403 pe toată consola", async () => {
    const res = await asClient("/api/platform/workspaces");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("platform_admin_required");
  });

  it("respinge cererile fără sesiune cu 401", async () => {
    const res = await app.request("/api/platform/overview");
    expect(res.status).toBe(401);
  });
});

describe("catalog + implicitele pentru workspace-uri noi", () => {
  it("GET /catalog întoarce modulele și implicitele", async () => {
    const res = await asOwner("/api/platform/catalog");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { modules: { key: string }[]; defaults: Record<string, boolean> };
    expect(json.modules.map((m) => m.key)).toEqual(["findesk", "par", "itpark", "docmerge"]);
    // Migrarea 0138 pornește totul activat, ca activarea funcționalității să nu ia acces nimănui.
    expect(json.defaults.findesk).toBe(true);
  });

  it("PUT /catalog/defaults schimbă ce primește un client NOU", async () => {
    const res = await asOwner("/api/platform/catalog/defaults", put({ module: "docmerge", enabled: false }));
    expect(res.status).toBe(200);
    const after = (await (await asOwner("/api/platform/catalog")).json()) as { defaults: Record<string, boolean> };
    expect(after.defaults.docmerge).toBe(false);
  });

  it("refuză o cheie de modul necunoscută", async () => {
    const res = await asOwner("/api/platform/catalog/defaults", put({ module: "inventat", enabled: true }));
    expect(res.status).toBe(400);
  });

  it("signup-ul unui workspace nou moștenește implicitele", async () => {
    const res = await app.request("/api/business/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantName: "Nou SRL", name: "Nou Client", email: "nou@srl.md", password: "password123" }),
    });
    expect(res.status).toBe(200);
    const { tenant } = (await res.json()) as { tenant: { id: string } };
    const rows = await testDb.select().from(tenantModules).where(eq(tenantModules.tenantId, tenant.id));
    const map = Object.fromEntries(rows.map((r) => [r.moduleKey, r.enabled]));
    expect(map.docmerge).toBe(false); // implicita schimbată mai sus
    expect(map.findesk).toBe(true);
  });

  it("POST /catalog/apply-defaults completează lipsurile fără să rescrie alegerile", async () => {
    const res = await asOwner("/api/platform/catalog/apply-defaults", post({ overwrite: false }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: true; workspaces: number };
    expect(json.ok).toBe(true);
    expect(json.workspaces).toBeGreaterThan(0);
  });
});

describe("workspace-uri", () => {
  it("GET /workspaces întoarce statistici per client", async () => {
    const res = await asOwner("/api/platform/workspaces");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { workspaces: { id: string; name: string; userCount: number; churnRisk: boolean }[] };
    const client = json.workspaces.find((w) => w.id === clientTenantId);
    expect(client?.name).toBe("Client SRL");
    expect(client?.userCount).toBe(1);
    // Fără nicio logare înregistrată → semnalul de abandon trebuie ridicat, nu ascuns.
    expect(client?.churnRisk).toBe(true);
  });

  it("GET /workspaces?format=csv livrează un fișier, nu JSON", async () => {
    const res = await asOwner("/api/platform/workspaces?format=csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toContain("Client SRL");
  });

  it("GET /workspaces/:id întoarce membrii, logările și notele", async () => {
    const res = await asOwner(`/api/platform/workspaces/${clientTenantId}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { workspace: { id: string }; members: { email: string }[]; recentLogins: unknown[]; notes: unknown[] };
    expect(json.workspace.id).toBe(clientTenantId);
    expect(json.members.map((m) => m.email)).toContain("client@srl.md");
    expect(Array.isArray(json.recentLogins)).toBe(true);
  });

  it("un id inexistent dă 404, nu 500", async () => {
    const res = await asOwner("/api/platform/workspaces/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("PUT /workspaces/:id/modules oprește un modul și scrie o intrare de audit", async () => {
    const res = await asOwner(`/api/platform/workspaces/${clientTenantId}/modules`, put({ module: "itpark", enabled: false }));
    expect(res.status).toBe(200);
    const [row] = await testDb
      .select()
      .from(tenantModules)
      .where(eq(tenantModules.tenantId, clientTenantId));
    expect(row).toBeTruthy();
    const audits = await testDb.select().from(platformAuditLog).where(eq(platformAuditLog.action, "module.toggle"));
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0].targetLabel).toBe("Client SRL");
  });

  it("PUT /workspaces/:id/plan schimbă planul", async () => {
    const res = await asOwner(`/api/platform/workspaces/${clientTenantId}/plan`, put({ plan: "growth" }));
    expect(res.status).toBe(200);
    const t = await testDb.query.tenants.findFirst({ where: eq(tenants.id, clientTenantId) });
    expect(t?.plan).toBe("growth");
  });

  it("POST /workspaces/:id/notes salvează o notă internă", async () => {
    const res = await asOwner(`/api/platform/workspaces/${clientTenantId}/notes`, post({ body: "A promis plata pe 15." }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { note: { body: string; authorEmail: string } };
    expect(json.note.body).toBe("A promis plata pe 15.");
    expect(json.note.authorEmail).toBe("owner@vector.md");
  });
});

describe("ce vede clientul (/api/modules)", () => {
  it("reflectă comutatorul superadminului", async () => {
    const res = await asClient("/api/modules");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { enabled: string[] };
    expect(json.enabled).not.toContain("itpark"); // oprit în testul de mai sus
    expect(json.enabled).toContain("findesk");
  });

  it("FAIL-OPEN: un workspace fără niciun rând de module vede tot", async () => {
    // Regresie pentru lecția din 0137: dacă migrarea nu ajunge pe prod, gating-ul nu are
    // voie să golească aplicația clientului.
    await testDb.delete(tenantModules).where(eq(tenantModules.tenantId, ownerTenantId));
    const res = await asOwner("/api/modules");
    const json = (await res.json()) as { enabled: string[] };
    expect(json.enabled).toEqual(["findesk", "par", "itpark", "docmerge"]);
  });
});

describe("istoric de logări", () => {
  it("înregistrează o logare REUȘITĂ", async () => {
    const res = await app.request("/api/business/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.10" },
      body: JSON.stringify({ email: "client@srl.md", password: "clientpw" }),
    });
    expect(res.status).toBe(200);
    const rows = await testDb.select().from(loginEvents).where(eq(loginEvents.email, "client@srl.md"));
    const ok = rows.find((r) => r.success);
    expect(ok).toBeTruthy();
    expect(ok?.ipAddress).toBe("192.0.2.10");
    expect(ok?.tenantId).toBe(clientTenantId);
  });

  it("înregistrează o logare EȘUATĂ, cu motivul ei", async () => {
    const res = await app.request("/api/business/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "client@srl.md", password: "parola-gresita" }),
    });
    expect(res.status).toBe(401);
    const rows = await testDb.select().from(loginEvents).where(eq(loginEvents.email, "client@srl.md"));
    expect(rows.some((r) => !r.success && r.failureReason === "invalid_credentials")).toBe(true);
  });

  it("înregistrează și încercările pe un email INEXISTENT (semnal de brute-force)", async () => {
    await app.request("/api/business/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nimeni@nicaieri.md", password: "x" }),
    });
    const rows = await testDb.select().from(loginEvents).where(eq(loginEvents.email, "nimeni@nicaieri.md"));
    expect(rows.length).toBe(1);
    expect(rows[0].userId).toBeNull();
  });

  it("GET /logins filtrează, numără și marchează emailurile suspecte", async () => {
    for (let i = 0; i < 5; i++) {
      await app.request("/api/business/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "atacator@rau.md", password: "incercare" }),
      });
    }
    const res = await asOwner("/api/platform/logins?result=failed&days=30");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      events: { success: boolean }[];
      total: number;
      suspicious: { email: string; failures: number }[];
    };
    expect(json.total).toBeGreaterThan(0);
    expect(json.events.every((e) => !e.success)).toBe(true);
    expect(json.suspicious.some((s) => s.email === "atacator@rau.md" && s.failures >= 5)).toBe(true);
  });

  it("GET /logins?q= caută după email", async () => {
    const res = await asOwner("/api/platform/logins?q=atacator");
    const json = (await res.json()) as { events: { email: string }[] };
    expect(json.events.length).toBeGreaterThan(0);
    expect(json.events.every((e) => e.email.includes("atacator"))).toBe(true);
  });

  it("GET /logins?format=csv livrează fișierul", async () => {
    const res = await asOwner("/api/platform/logins?format=csv&days=30");
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toContain("atacator@rau.md");
  });
});

describe("suspendarea unui workspace", () => {
  it("PUT /workspaces/:id/status suspendă și blochează login-ul", async () => {
    const res = await asOwner(
      `/api/platform/workspaces/${clientTenantId}/status`,
      put({ status: "suspended", reason: "Facturi neachitate" }),
    );
    expect(res.status).toBe(200);

    const login = await app.request("/api/business/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "client@srl.md", password: "clientpw" }),
    });
    expect(login.status).toBe(403);
    expect(((await login.json()) as { error: string }).error).toBe("workspace_suspended");
  });

  it("taie și sesiunile DEJA deschise (/auth/me → 403)", async () => {
    const res = await asClient("/api/business/auth/me");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("workspace_suspended");
  });

  it("reactivarea readuce accesul — nimic nu s-a pierdut", async () => {
    await asOwner(`/api/platform/workspaces/${clientTenantId}/status`, put({ status: "active" }));
    const login = await app.request("/api/business/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "client@srl.md", password: "clientpw" }),
    });
    expect(login.status).toBe(200);
    const t = await testDb.query.tenants.findFirst({ where: eq(tenants.id, clientTenantId) });
    expect(t?.suspendedReason).toBeNull();
  });
});

describe("superadmini + audit", () => {
  it("GET /admins listează administratorii platformei", async () => {
    const res = await asOwner("/api/platform/admins");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { admins: { email: string }[]; self: string };
    expect(json.admins.some((a) => a.email === "owner@vector.md")).toBe(true);
    expect(json.self).toBe(ownerUserId);
  });

  it("POST /admins promovează un cont existent", async () => {
    const res = await asOwner("/api/platform/admins", post({ email: "client@srl.md" }));
    expect(res.status).toBe(201);
    const rows = await testDb.select().from(platformAdmins).where(eq(platformAdmins.userId, clientUserId));
    expect(rows.length).toBe(1);
  });

  it("POST /admins dă 404 pentru un email fără cont", async () => {
    const res = await asOwner("/api/platform/admins", post({ email: "fantoma@nicaieri.md" }));
    expect(res.status).toBe(404);
  });

  it("DELETE /admins/:id refuză auto-retragerea (nu închizi ușa pe dinăuntru)", async () => {
    const res = await asOwner(`/api/platform/admins/${ownerUserId}`, { method: "DELETE" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("cannot_remove_self");
  });

  it("DELETE /admins/:id retrage alt superadmin", async () => {
    const res = await asOwner(`/api/platform/admins/${clientUserId}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const rows = await testDb.select().from(platformAdmins).where(eq(platformAdmins.userId, clientUserId));
    expect(rows.length).toBe(0);
  });

  it("GET /audit arată acțiunile mele, cu cea mai recentă prima", async () => {
    const res = await asOwner("/api/platform/audit");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { entries: { action: string; actorEmail: string }[] };
    expect(json.entries.length).toBeGreaterThan(0);
    expect(json.entries[0].actorEmail).toBe("owner@vector.md");
    expect(json.entries.map((e) => e.action)).toContain("workspace.suspend");
  });
});

describe("ansamblu", () => {
  it("GET /overview agregă workspace-uri, logări și adopția modulelor", async () => {
    const res = await asOwner("/api/platform/overview");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      workspaces: { total: number; business: number; active7d: number };
      logins: { last24h: number; failed7d: number };
      adoption: { key: string; enabled: number; total: number }[];
      plans: { plan: string; count: number }[];
    };
    expect(json.workspaces.total).toBeGreaterThanOrEqual(3);
    expect(json.logins.last24h).toBeGreaterThan(0);
    expect(json.logins.failed7d).toBeGreaterThan(0);
    expect(json.adoption).toHaveLength(4);
    // Adopția se calculează fail-open: activ = total − opriți EXPLICIT.
    const itpark = json.adoption.find((a) => a.key === "itpark")!;
    expect(itpark.enabled).toBeLessThan(itpark.total);
    expect(json.plans.some((p) => p.plan === "growth")).toBe(true);
  });
});
