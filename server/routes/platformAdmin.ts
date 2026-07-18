import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { parPayerModules, parPayers } from "../db/schema/par";
import { tenants } from "../db/schema/tenants";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePlatformAdmin } from "../middleware/requirePlatformAdmin";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const platformAdminRoutes = new Hono<{ Variables: AuthVariables }>();
platformAdminRoutes.use("*", requireAuth);
platformAdminRoutes.use("*", requirePlatformAdmin);
platformAdminRoutes.use("/organizations/:payerId/*", parUuidGuard("payerId"));

platformAdminRoutes.get("/organizations", async (c) => {
  const rows = await db.select({
    id: parPayers.id, name: parPayers.name, legalName: parPayers.legalName, idno: parPayers.idno,
    tenantId: parPayers.tenantId, workspaceName: tenants.name, moduleKey: parPayerModules.moduleKey,
    moduleEnabled: parPayerModules.enabled,
  }).from(parPayers).leftJoin(tenants, eq(tenants.id, parPayers.tenantId))
    .leftJoin(parPayerModules, eq(parPayerModules.payerId, parPayers.id)).orderBy(asc(tenants.name), asc(parPayers.name));
  const organizations = new Map<string, { id: string; name: string; legalName: string | null; idno: string | null; tenantId: string; workspaceName: string | null; modules: Record<string, boolean> }>();
  rows.forEach((r) => {
    const item = organizations.get(r.id) ?? { id: r.id, name: r.name, legalName: r.legalName, idno: r.idno, tenantId: r.tenantId, workspaceName: r.workspaceName, modules: {} };
    if (r.moduleKey) item.modules[r.moduleKey] = r.moduleEnabled ?? false;
    organizations.set(r.id, item);
  });
  return c.json({ organizations: [...organizations.values()] });
});

const moduleSchema = z.object({ module: z.enum(["par", "findesk"]), enabled: z.boolean() });
platformAdminRoutes.put("/organizations/:payerId/modules", zValidator("json", moduleSchema), async (c) => {
  const payerId = c.req.param("payerId"); const actor = c.get("user"); const body = c.req.valid("json");
  const [payer] = await db.select().from(parPayers).where(eq(parPayers.id, payerId));
  if (!payer) return c.json({ error: "not_found" }, 404);
  const [existing] = await db.select({ id: parPayerModules.id }).from(parPayerModules).where(and(eq(parPayerModules.payerId, payerId), eq(parPayerModules.moduleKey, body.module)));
  if (existing) await db.update(parPayerModules).set({ enabled: body.enabled, updatedByUserId: actor.id, updatedAt: new Date() }).where(eq(parPayerModules.id, existing.id));
  else await db.insert(parPayerModules).values({ tenantId: payer.tenantId, payerId, moduleKey: body.module, enabled: body.enabled, updatedByUserId: actor.id });
  return c.json({ ok: true, payerId, module: body.module, enabled: body.enabled });
});
