import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { teachers, users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { writeAuditLog } from "../lib/auditLogger";
import { withBranchFilter } from "../middleware/branchScope";

export const teacherRoutes = new Hono<{ Variables: AuthVariables }>();

teacherRoutes.use("*", requireAuth);

const updateTeacherSchema = z.object({
  hourlyRateCents: z.number().int().min(0).optional(),
  commissionPct: z.number().int().min(0).max(100).optional(),
});

teacherRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  // BRANCH-702: branch_manager sees only their branch's teachers
  const whereClause = user.branchScope
    ? and(eq(teachers.tenantId, tenantId), eq(teachers.branchId, user.branchScope))
    : eq(teachers.tenantId, tenantId);

  const rows = await db
    .select({
      id: teachers.id,
      userId: teachers.userId,
      hourlyRateCents: teachers.hourlyRateCents,
      commissionPct: teachers.commissionPct,
      branchId: teachers.branchId,
      name: users.name,
      email: users.email,
    })
    .from(teachers)
    .innerJoin(users, eq(teachers.userId, users.id))
    .where(whereClause)
    .orderBy(desc(teachers.createdAt));
  return c.json({ items: rows });
});

// ─── HR-404: PATCH /api/teachers/:id — update rate/commission with audit ──────

teacherRoutes.patch(
  "/:id",
  zValidator("json", updateTeacherSchema),
  async (c) => {
    const id = c.req.param("id");
    const tenantId = c.get("user").tenantId;
    const actorId = c.get("user").id;
    const body = c.req.valid("json");

    const existing = await db.query.teachers.findFirst({
      where: and(eq(teachers.id, id), eq(teachers.tenantId, tenantId)),
    });
    if (!existing) return c.json({ error: "not_found" }, 404);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.hourlyRateCents !== undefined) patch.hourlyRateCents = body.hourlyRateCents;
    if (body.commissionPct !== undefined) patch.commissionPct = body.commissionPct;

    const [updated] = await db
      .update(teachers)
      .set(patch)
      .where(and(eq(teachers.id, id), eq(teachers.tenantId, tenantId)))
      .returning();

    // Audit log
    await writeAuditLog({
      tenantId,
      actorId,
      actionType: "teacher.rate_changed",
      targetType: "teacher",
      targetId: id,
      oldValue: { hourlyRateCents: existing.hourlyRateCents, commissionPct: existing.commissionPct },
      newValue: { hourlyRateCents: updated.hourlyRateCents, commissionPct: updated.commissionPct },
    });

    return c.json(updated);
  }
);
