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
import { getPreApproverMap, setProjectPreApprovers } from "../lib/par/preApprovers";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { users } from "../db/schema/users";
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
  // Attach the designated approver user-ids per project ([] = unrestricted → any approver) and the
  // pre-approvers ([] = no pre-approval level; the chain starts at the DOA matrix as before).
  const [approverMap, preApproverMap] = await Promise.all([
    getProjectApproverMap(tenantId),
    getPreApproverMap(tenantId),
  ]);
  const projects = rows.map((p) => ({
    ...p,
    approverUserIds: [...(approverMap.get(p.id) ?? [])],
    preApproverUserIds: [...(preApproverMap.get(p.id) ?? [])],
  }));
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

/**
 * PUT /api/par/projects/:id/pre-approvers — cine semnează ÎNAINTEA lanțului DOA (par_admin).
 *
 * Verificarea celor două condiții se face AICI, la configurare, nu la aprobare. Un pre-aprobator
 * fără rol PAR sau fără acces la proiect ar produce o cerere blocată: pasul e al lui, dar ecranul
 * i-ar răspunde 404. Greșeala de configurare se vede mai bine pe ecranul de administrare, în
 * secunda în care se face, decât peste o săptămână, pe o plată care nu mai avansează.
 */
parProjectsRoutes.put(
  "/:id/pre-approvers",
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

    const userIds = [...new Set(c.req.valid("json").userIds)];
    const unusable: Array<{ userId: string; reason: "no_par_role" | "no_project_access" }> = [];
    for (const userId of userIds) {
      const [target] = await db
        .select({ role: users.role })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
      if (!target) { unusable.push({ userId, reason: "no_par_role" }); continue; }
      const roles = await getUserPARRoles(userId, tenantId, target.role);
      if (roles.length === 0) { unusable.push({ userId, reason: "no_par_role" }); continue; }
      if (!(await mayAccessProject(userId, tenantId, id, target.role))) {
        unusable.push({ userId, reason: "no_project_access" });
      }
    }
    if (unusable.length > 0) {
      return c.json({ error: "pre_approver_unusable", unusable }, 400);
    }

    await setProjectPreApprovers(tenantId, id, userIds);
    const preApproverMap = await getPreApproverMap(tenantId);
    return c.json({ ok: true, preApproverUserIds: [...(preApproverMap.get(id) ?? [])] });
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
