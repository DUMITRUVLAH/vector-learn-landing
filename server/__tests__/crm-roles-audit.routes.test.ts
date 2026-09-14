/**
 * @vitest-environment node
 * ROLURI + JURNAL PE CRM — INTEGRATION (rutele reale, PGlite, toate migrările).
 *
 * Portare din crm-vector (`roles.ts`, `audit.ts`), adaptată: acolo se adăugau roluri NOI în baza
 * de date; aici matricea se așază peste rolurile existente pe `users.role`, folosite deja de tot
 * restul aplicației. Jurnalul nu e unul nou: intrările merg în `audit_log`, cu prefixul `crm.`.
 *
 * Ce trebuie să fie adevărat:
 *  - un om fără drept administrativ e oprit PE SERVER, nu doar în interfață;
 *  - cine lucrează azi în CRM nu pierde nimic din ce făcea (fără regresie tăcută);
 *  - schimbările importante lasă urmă, cu numele omului;
 *  - jurnalul se citește doar cu `audit.view`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { auditLog } from "../db/schema/auditLog";
import { leads } from "../db/schema/leads";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { can, listPermissions } from "../lib/crm/permissions";

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
let adminUser: string;
let agentUser: string;
let leadId: string;

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

const asAdmin = () => (session = { id: adminUser, tenantId, role: "admin", email: "admin@vector.md" });
const asAgent = () => (session = { id: agentUser, tenantId, role: "teacher", email: "agent@vector.md" });

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmProductsRoutes } = await import("../routes/crmProducts");
  const { crmStagesRoutes } = await import("../routes/crmStages");
  const { crmLeadsRoutes } = await import("../routes/crmLeads");
  const { crmAuditRoutes } = await import("../routes/crmAudit");
  const { crmPermissionsRoutes } = await import("../routes/crmPermissions");
  app = new Hono();
  app.route("/api/crm/products", crmProductsRoutes);
  app.route("/api/crm/stages", crmStagesRoutes);
  app.route("/api/crm/leads", crmLeadsRoutes);
  app.route("/api/crm/audit", crmAuditRoutes);
  app.route("/api/crm/permissions", crmPermissionsRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "Vector", slug: "vector-roles" }).returning();
  tenantId = tenant.id;

  const mkUser = async (email: string, role: "admin" | "teacher") => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name: email === "admin@vector.md" ? "Ana Admin" : "Boris Agent", role })
      .returning();
    return u.id;
  };
  adminUser = await mkUser("admin@vector.md", "admin");
  agentUser = await mkUser("agent@vector.md", "teacher");

  await testDb.insert(crmPipelineStages).values([
    { tenantId, key: "new", label: "Nou", orderIndex: 0, isDefault: true },
    { tenantId, key: "paid", label: "Client", orderIndex: 1, isWon: true, isDefault: true },
  ]);

  const [lead] = await testDb
    .insert(leads)
    .values({ tenantId, fullName: "Acme SRL", stage: "new", source: "manual" })
    .returning();
  leadId = lead.id;

  asAdmin();
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Matricea de permisiuni (pură)", () => {
  it("[normal] agentul lucrează cu leadurile, dar nu administrează", () => {
    expect(can("teacher", "leads.view_all")).toBe(true); // fără regresie: vedea tabla, o vede
    expect(can("teacher", "leads.edit")).toBe(true);
    expect(can("teacher", "products.manage")).toBe(false);
    expect(can("teacher", "audit.view")).toBe(false);
    expect(can("admin", "audit.view")).toBe(true);
    // Rolurile fără treabă în CRM nu primesc nimic.
    expect(listPermissions("student")).toEqual([]);
    expect(listPermissions("rol-inexistent")).toEqual([]);
  });
});

describe("Poarta e pe SERVER, nu în interfață", () => {
  it("[blocant] un agent nu poate crea produse — 403 cu dreptul care lipsește", async () => {
    asAgent();
    const res = await app.request("/api/crm/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Curs nou" }),
    });

    expect(res.status).toBe(403);
    expect((await res.json()).permission).toBe("products.manage");
  });

  it("[blocant] un agent nu poate șterge o etapă de pâlnie", async () => {
    asAgent();
    const [stage] = await testDb
      .select()
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.key, "paid"));

    const res = await app.request(`/api/crm/stages/${stage.id}`, { method: "DELETE" });
    expect(res.status).toBe(403);

    const still = await testDb.select().from(crmPipelineStages).where(eq(crmPipelineStages.id, stage.id));
    expect(still).toHaveLength(1);
  });

  it("[blocant] agentul își face treaba normal: mută leadul prin pâlnie", async () => {
    asAgent();
    const res = await app.request(`/api/crm/leads/${leadId}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "paid" }),
    });

    expect(res.status).toBe(200);
  });

  it("[normal] adminul poate ce agentul nu poate", async () => {
    asAdmin();
    const res = await app.request("/api/crm/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Curs nou" }),
    });
    expect(res.status).toBe(201);
  });
});

describe("Jurnalul CRM", () => {
  it("[blocant] mutarea leadului a lăsat urmă, cu numele omului și etapele", async () => {
    asAdmin();
    const res = await app.request("/api/crm/audit");
    const items = ((await res.json()) as {
      items: Array<{ actionType: string; actorName: string | null; oldValue: unknown; newValue: unknown; targetId: string }>;
    }).items;

    const move = items.find((i) => i.actionType === "crm.lead.stage_changed");
    expect(move).toBeDefined();
    expect(move!.targetId).toBe(leadId);
    expect(move!.actorName).toBe("Boris Agent"); // cine a făcut-o, nu un uuid
    expect(move!.oldValue).toEqual({ stage: "new" });
    expect(move!.newValue).toMatchObject({ stage: "paid" });
  });

  it("[blocant] jurnalul se citește doar cu dreptul `audit.view`", async () => {
    asAgent();
    const res = await app.request("/api/crm/audit");
    expect(res.status).toBe(403);
  });

  it("[normal] `targetId` filtrează istoricul unui singur obiect", async () => {
    asAdmin();
    const res = await app.request(`/api/crm/audit?targetId=${leadId}`);
    const items = ((await res.json()) as { items: Array<{ targetId: string }> }).items;

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.targetId === leadId)).toBe(true);
  });

  it("[normal] jurnalul CRM nu amestecă intrările altor module", async () => {
    asAdmin();
    // Intrare din alt modul, în aceeași tabelă — nu trebuie să apară în jurnalul CRM.
    await testDb.insert(auditLog).values({
      tenantId,
      actorId: adminUser,
      actionType: "hr.salary_changed",
      targetType: "teacher",
      targetId: adminUser,
    });

    const res = await app.request("/api/crm/audit");
    const items = ((await res.json()) as { items: Array<{ actionType: string }> }).items;
    expect(items.every((i) => i.actionType.startsWith("crm."))).toBe(true);
  });

  it("[normal] /permissions spune interfeței ce să arate", async () => {
    asAgent();
    const res = await app.request("/api/crm/permissions");
    const body = (await res.json()) as { role: string; permissions: string[] };

    expect(body.role).toBe("teacher");
    expect(body.permissions).toContain("leads.edit");
    expect(body.permissions).not.toContain("products.manage");
  });
});
