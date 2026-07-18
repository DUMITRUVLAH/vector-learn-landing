/**
 * PAR-002: DOA matrix CRUD routes
 * GET/POST/PATCH/DELETE /api/par/doa — par_admin only
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { parDoaMatrix, parMembers, parProjects } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { accessiblePayerIds, accessibleProjectIds, mayAccessPayer, mayAccessProject } from "../lib/par/projectScope";

export const parDoaRoutes = new Hono<{ Variables: AuthVariables }>();

parDoaRoutes.use("*", requireAuth);
parDoaRoutes.use("/:id", parUuidGuard("id"));

// VF-002: a DOA row may pin a step to a specific user. That user must be a PAR member of this
// tenant — the explicit assignment then grants them authority to decide that step (see the
// /approve handler). Pinning to a non-member would create a step nobody can clear. Returns an
// error string when invalid, or null when OK.
async function validateApproverAssignment(
  tenantId: string,
  approverUserId: string | null | undefined
): Promise<string | null> {
  if (!approverUserId) return null;
  const member = await db
    .select({ id: parMembers.id })
    .from(parMembers)
    .where(and(eq(parMembers.tenantId, tenantId), eq(parMembers.userId, approverUserId)))
    .limit(1);
  if (member.length === 0) {
    return "approver_not_a_member: the assigned user has no PAR role in this organization";
  }
  return null;
}

async function validatePayerProjectPair(
  tenantId: string,
  payerId: string | null | undefined,
  projectId: string | null | undefined,
): Promise<boolean> {
  if (!projectId) return true;
  const [project] = await db.select({ payerId: parProjects.payerId }).from(parProjects).where(and(
    eq(parProjects.id, projectId),
    eq(parProjects.tenantId, tenantId),
  ));
  if (!project) return false;
  return !payerId || project.payerId === payerId;
}

const doaRowSchema = z.object({
  chargeTo: z.enum(["operations", "program", "other"]).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  payerId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  approvalMode: z.enum(["sequential", "parallel"]).optional(),
  minAmountCents: z.number().int().min(0),
  maxAmountCents: z.number().int().positive().nullable().optional(),
  step: z.number().int().min(1),
  approverRoleLabel: z.string().min(1).max(200),
  approverUserId: z.string().uuid().nullable().optional(),
  approverParRole: z.enum(["requestor", "approver", "finance", "par_admin"]).nullable().optional(),
  active: z.boolean().optional(),
});

/** GET /api/par/doa — list all active DOA matrix rows */
parDoaRoutes.get("/", requirePARRole("par_admin", "approver", "finance"), async (c) => {
  const user = c.get("user"); const tenantId = user.tenantId;
  const [payerScope, projectScope] = await Promise.all([
    accessiblePayerIds(user.id, tenantId, user.role), accessibleProjectIds(user.id, tenantId, user.role),
  ]);
  const conditions = [eq(parDoaMatrix.tenantId, tenantId)];
  if (payerScope !== null) conditions.push(payerScope.length
    ? or(isNull(parDoaMatrix.payerId), inArray(parDoaMatrix.payerId, payerScope))!
    : isNull(parDoaMatrix.payerId));
  if (projectScope !== null) conditions.push(projectScope.length
    ? or(isNull(parDoaMatrix.projectId), inArray(parDoaMatrix.projectId, projectScope))!
    : isNull(parDoaMatrix.projectId));

  const rows = await db
    .select()
    .from(parDoaMatrix)
    .where(and(...conditions))
    .orderBy(asc(parDoaMatrix.minAmountCents), asc(parDoaMatrix.step));

  return c.json({ rows });
});

/** POST /api/par/doa — create a DOA row */
parDoaRoutes.post(
  "/",
  requirePARRole("par_admin"),
  zValidator("json", doaRowSchema),
  async (c) => {
    const user = c.get("user"); const tenantId = user.tenantId;
    const body = c.req.valid("json");
    if (user.role !== "admin" && user.role !== "manager" && !body.payerId) return c.json({ error: "payer_scope_required" }, 400);
    if (body.payerId && !(await mayAccessPayer(user.id, tenantId, body.payerId, user.role))) return c.json({ error: "forbidden_payer" }, 403);
    if (body.projectId && !(await mayAccessProject(user.id, tenantId, body.projectId, user.role))) return c.json({ error: "forbidden_project" }, 403);
    if (!(await validatePayerProjectPair(tenantId, body.payerId, body.projectId))) return c.json({ error: "project_payer_mismatch" }, 400);

    const assignErr = await validateApproverAssignment(tenantId, body.approverUserId);
    if (assignErr) return c.json({ error: assignErr }, 400);

    const [row] = await db
      .insert(parDoaMatrix)
      .values({
        tenantId,
        chargeTo: body.chargeTo ?? null,
        departmentId: body.departmentId ?? null,
        payerId: body.payerId ?? null,
        projectId: body.projectId ?? null,
        approvalMode: body.approvalMode ?? "sequential",
        minAmountCents: body.minAmountCents,
        maxAmountCents: body.maxAmountCents ?? null,
        step: body.step,
        approverRoleLabel: body.approverRoleLabel,
        approverUserId: body.approverUserId ?? null,
        approverParRole: body.approverParRole ?? null,
        active: body.active ?? true,
      })
      .returning();

    return c.json(row, 201);
  }
);

/** PATCH /api/par/doa/:id — update a DOA row */
parDoaRoutes.patch(
  "/:id",
  requirePARRole("par_admin"),
  zValidator("json", doaRowSchema.partial()),
  async (c) => {
    const user = c.get("user"); const tenantId = user.tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [existing] = await db.select().from(parDoaMatrix).where(and(eq(parDoaMatrix.id, id), eq(parDoaMatrix.tenantId, tenantId)));
    if (!existing) return c.json({ error: "not_found" }, 404);
    const payerId = body.payerId !== undefined ? body.payerId : existing.payerId;
    const projectId = body.projectId !== undefined ? body.projectId : existing.projectId;
    if (user.role !== "admin" && user.role !== "manager" && !payerId) return c.json({ error: "not_found" }, 404);
    if (payerId && !(await mayAccessPayer(user.id, tenantId, payerId, user.role))) return c.json({ error: "not_found" }, 404);
    if (projectId && !(await mayAccessProject(user.id, tenantId, projectId, user.role))) return c.json({ error: "not_found" }, 404);
    if (!(await validatePayerProjectPair(tenantId, payerId, projectId))) return c.json({ error: "project_payer_mismatch" }, 400);

    if (body.approverUserId !== undefined) {
      const assignErr = await validateApproverAssignment(tenantId, body.approverUserId);
      if (assignErr) return c.json({ error: assignErr }, 400);
    }

    const [row] = await db
      .update(parDoaMatrix)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(parDoaMatrix.id, id), eq(parDoaMatrix.tenantId, tenantId)))
      .returning();

    return c.json(row);
  }
);

/** DELETE /api/par/doa/:id — deactivate (soft delete) */
parDoaRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const user = c.get("user"); const tenantId = user.tenantId;
  const id = c.req.param("id");
  const [existing] = await db.select({ payerId: parDoaMatrix.payerId, projectId: parDoaMatrix.projectId }).from(parDoaMatrix).where(and(eq(parDoaMatrix.id, id), eq(parDoaMatrix.tenantId, tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (user.role !== "admin" && user.role !== "manager" && !existing.payerId) return c.json({ error: "not_found" }, 404);
  if (existing.payerId && !(await mayAccessPayer(user.id, tenantId, existing.payerId, user.role))) return c.json({ error: "not_found" }, 404);
  if (existing.projectId && !(await mayAccessProject(user.id, tenantId, existing.projectId, user.role))) return c.json({ error: "not_found" }, 404);

  const [row] = await db
    .update(parDoaMatrix)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(parDoaMatrix.id, id), eq(parDoaMatrix.tenantId, tenantId)))
    .returning();

  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
