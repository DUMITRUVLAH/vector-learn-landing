import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { parPayerMembers, parPayers, parPayerModules, parProjects } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { accessibleProjectIds, mayAccessPayer } from "../lib/par/projectScope";

export const parPayersRoutes = new Hono<{ Variables: AuthVariables }>();
parPayersRoutes.use("*", requireAuth);
parPayersRoutes.use("/:id", parUuidGuard("id"));

const payerSchema = z.object({
  name: z.string().min(1).max(300),
  legal_name: z.string().max(300).optional().nullable(),
  idno: z.string().max(32).optional().nullable(),
  active: z.boolean().optional(),
});

parPayersRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const includeInactive = c.req.query("include_inactive") === "1";
  const conditions = [eq(parPayers.tenantId, tenantId)];
  if (!includeInactive) conditions.push(eq(parPayers.active, true));
  const projectScope = await accessibleProjectIds(user.id, tenantId, user.role);
  if (projectScope !== null) {
    const [directPayers, scopePayers] = await Promise.all([
      db.select({ payerId: parPayerMembers.payerId }).from(parPayerMembers).where(and(
        eq(parPayerMembers.tenantId, tenantId), eq(parPayerMembers.userId, user.id),
      )),
      projectScope.length
        ? db.select({ payerId: parProjects.payerId }).from(parProjects).where(and(
            eq(parProjects.tenantId, tenantId), inArray(parProjects.id, projectScope),
          ))
        : Promise.resolve([]),
    ]);
    const payerIds = [...new Set([...directPayers, ...scopePayers].map((row) => row.payerId).filter((id): id is string => !!id))];
    if (!payerIds.length) return c.json({ payers: [] });
    conditions.push(inArray(parPayers.id, payerIds));
  }
  const payers = await db.select({
    id: parPayers.id,
    tenantId: parPayers.tenantId,
    name: parPayers.name,
    legalName: parPayers.legalName,
    idno: parPayers.idno,
    active: parPayers.active,
    createdAt: parPayers.createdAt,
    updatedAt: parPayers.updatedAt,
  }).from(parPayers).innerJoin(parPayerModules, and(
    eq(parPayerModules.payerId, parPayers.id),
    eq(parPayerModules.tenantId, tenantId),
    eq(parPayerModules.moduleKey, "par"),
    eq(parPayerModules.enabled, true),
  )).where(and(...conditions)).orderBy(asc(parPayers.name));
  return c.json({ payers });
});

parPayersRoutes.post("/", requirePARRole("par_admin"), zValidator("json", payerSchema), async (c) => {
  const user = c.get("user"); const tenantId = user.tenantId;
  if (user.role !== "admin" && user.role !== "manager") return c.json({ error: "workspace_admin_required" }, 403);
  const body = c.req.valid("json");
  const [payer] = await db.insert(parPayers).values({
    tenantId, name: body.name, legalName: body.legal_name ?? null, idno: body.idno ?? null, active: body.active ?? true,
  }).returning();
  await db.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true, updatedByUserId: c.get("user").id });
  return c.json(payer, 201);
});

parPayersRoutes.patch("/:id", requirePARRole("par_admin"), zValidator("json", payerSchema.partial()), async (c) => {
  const user = c.get("user"); const tenantId = user.tenantId;
  if (!(await mayAccessPayer(user.id, tenantId, c.req.param("id"), user.role))) return c.json({ error: "not_found" }, 404);
  const body = c.req.valid("json");
  const [payer] = await db.update(parPayers).set({
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.legal_name !== undefined ? { legalName: body.legal_name } : {}),
    ...(body.idno !== undefined ? { idno: body.idno } : {}),
    ...(body.active !== undefined ? { active: body.active } : {}), updatedAt: new Date(),
  }).where(and(eq(parPayers.id, c.req.param("id")), eq(parPayers.tenantId, tenantId))).returning();
  if (!payer) return c.json({ error: "not_found" }, 404);
  return c.json(payer);
});
