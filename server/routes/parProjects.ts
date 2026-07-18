/**
 * PAR-003: Projects / Programs CRUD
 * GET/POST/PATCH/DELETE /api/par/projects
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { parProjects, parPayers } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { getProjectApproverMap, setProjectApprovers } from "../lib/par/projectApprovers";
import { accessibleProjectIds, mayAccessPayer, mayAccessProject } from "../lib/par/projectScope";
import { enabledPayerIds, hasPayerModuleEntitlement } from "../middleware/requireModuleEntitlement";

export const parProjectsRoutes = new Hono<{ Variables: AuthVariables }>();
parProjectsRoutes.use("*", requireAuth);
parProjectsRoutes.use("/:id", parUuidGuard("id"));
parProjectsRoutes.use("/:id/:action/*", parUuidGuard("id"));

const projectSchema = z.object({
  name: z.string().min(1).max(200),
  donor: z.string().max(200).optional().nullable(),
  payer_id: z.string().uuid().optional().nullable(),
  active: z.boolean().optional(),
});

parProjectsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const payerId = c.req.query("payer_id");
  const entitledPayers = await enabledPayerIds(tenantId, "par");
  if (!entitledPayers.length) return c.json({ projects: [] });
  const scope = await accessibleProjectIds(user.id, tenantId, user.role);
  const conditions = [eq(parProjects.tenantId, tenantId), eq(parProjects.active, true), inArray(parProjects.payerId, entitledPayers)];
  if (payerId) conditions.push(eq(parProjects.payerId, payerId));
  if (scope !== null) {
    if (!scope.length) return c.json({ projects: [] });
    conditions.push(inArray(parProjects.id, scope));
  }
  const rows = await db
    .select()
    .from(parProjects)
    .where(and(...conditions))
    .orderBy(asc(parProjects.name));
  // Attach the designated approver user-ids per project ([] = unrestricted → any approver).
  const approverMap = await getProjectApproverMap(tenantId);
  const projects = rows.map((p) => ({ ...p, approverUserIds: [...(approverMap.get(p.id) ?? [])] }));
  return c.json({ projects });
});

const approversSchema = z.object({ userIds: z.array(z.string().uuid()).max(50) });

/** PUT /api/par/projects/:id/approvers — replace a project's designated approver list (par_admin). */
parProjectsRoutes.put(
  "/:id/approvers",
  requirePARRole("par_admin"),
  zValidator("json", approversSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const id = c.req.param("id");
    const [proj] = await db
      .select({ id: parProjects.id, payerId: parProjects.payerId })
      .from(parProjects)
      .where(and(eq(parProjects.id, id), eq(parProjects.tenantId, tenantId)));
    if (!proj) return c.json({ error: "not_found" }, 404);
    if (!(await mayAccessProject(user.id, tenantId, id, user.role)) || !(await mayAccessPayer(user.id, tenantId, proj.payerId, user.role))) {
      return c.json({ error: "not_found" }, 404);
    }
    await setProjectApprovers(tenantId, id, c.req.valid("json").userIds);
    const approverMap = await getProjectApproverMap(tenantId);
    return c.json({ ok: true, approverUserIds: [...(approverMap.get(id) ?? [])] });
  }
);

parProjectsRoutes.post(
  "/",
  requirePARRole("par_admin"),
  zValidator("json", projectSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const body = c.req.valid("json");
    const payerId = body.payer_id ?? (await enabledPayerIds(tenantId, "par"))[0] ?? null;
    if (!payerId) return c.json({ error: "payer_required" }, 400);
    if (!(await mayAccessPayer(user.id, tenantId, payerId, user.role))) return c.json({ error: "forbidden_payer" }, 403);
    if (payerId) {
      const [payer] = await db.select({ id: parPayers.id }).from(parPayers).where(and(eq(parPayers.id, payerId), eq(parPayers.tenantId, tenantId), eq(parPayers.active, true)));
      if (!payer) return c.json({ error: "payer_not_found" }, 404);
      if (!(await hasPayerModuleEntitlement(user.id, tenantId, payerId, "par"))) return c.json({ error: "module_disabled", module: "par" }, 403);
    }
    const [row] = await db
      .insert(parProjects)
      .values({ tenantId, name: body.name, donor: body.donor ?? null, payerId })
      .returning();
    return c.json(row, 201);
  }
);

parProjectsRoutes.patch(
  "/:id",
  requirePARRole("par_admin"),
  zValidator("json", projectSchema.partial()),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [existing] = await db.select({ payerId: parProjects.payerId }).from(parProjects).where(and(
      eq(parProjects.id, id), eq(parProjects.tenantId, tenantId),
    ));
    if (!existing) return c.json({ error: "not_found" }, 404);
    const payerId = body.payer_id !== undefined ? body.payer_id : existing.payerId;
    if (!payerId) return c.json({ error: "payer_required" }, 400);
    if (!(await mayAccessProject(user.id, tenantId, id, user.role)) || !(await mayAccessPayer(user.id, tenantId, payerId, user.role))) {
      return c.json({ error: "forbidden_payer" }, 403);
    }
    if (body.payer_id !== undefined) {
      const [payer] = await db.select({ id: parPayers.id }).from(parPayers).where(and(eq(parPayers.id, payerId), eq(parPayers.tenantId, tenantId), eq(parPayers.active, true)));
      if (!payer) return c.json({ error: "payer_not_found" }, 404);
      if (!(await hasPayerModuleEntitlement(user.id, tenantId, payerId, "par"))) return c.json({ error: "module_disabled", module: "par" }, 403);
    }
    const update = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.donor !== undefined ? { donor: body.donor } : {}),
      ...(body.payer_id !== undefined ? { payerId: body.payer_id } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      updatedAt: new Date(),
    };
    const [row] = await db
      .update(parProjects)
      .set(update)
      .where(and(eq(parProjects.id, id), eq(parProjects.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

parProjectsRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const id = c.req.param("id");
  const [existing] = await db.select({ payerId: parProjects.payerId }).from(parProjects).where(and(
    eq(parProjects.id, id), eq(parProjects.tenantId, tenantId),
  ));
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (!(await mayAccessProject(user.id, tenantId, id, user.role)) || !(await mayAccessPayer(user.id, tenantId, existing.payerId, user.role))) {
    return c.json({ error: "not_found" }, 404);
  }
  const [row] = await db
    .update(parProjects)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(parProjects.id, id), eq(parProjects.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
