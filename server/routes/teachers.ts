import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { teachers, users, lessons } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getBranchScope } from "../middleware/branchScope";
import { writeAuditLog } from "../lib/auditLogger";

export const teacherRoutes = new Hono<{ Variables: AuthVariables }>();

teacherRoutes.use("*", requireAuth);

const updateTeacherSchema = z.object({
  hourlyRateCents: z.number().int().min(0).optional(),
  commissionPct: z.number().int().min(0).max(100).optional(),
});

teacherRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  // BRANCH-703: server-side branch scope enforcement
  const scope = getBranchScope(c);
  const where = scope
    ? and(eq(teachers.tenantId, tenantId), eq(teachers.branchId, scope))
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
    .where(where)
    .orderBy(desc(teachers.createdAt));
  return c.json({ items: rows });
});

// ─── SCHED-602: GET /api/teachers/available?lessonId=<id> ────────────────────
// Returns teachers with no scheduling conflict in the given lesson's slot.

const availableQuerySchema = z.object({ lessonId: z.string().uuid() });

teacherRoutes.get("/available", zValidator("query", availableQuerySchema), async (c) => {
  const { lessonId } = c.req.valid("query");
  const tenantId = c.get("user").tenantId;

  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), eq(lessons.tenantId, tenantId)),
  });
  if (!lesson) return c.json({ error: "lesson_not_found" }, 404);

  const start = lesson.scheduledAt;
  const end = new Date(start.getTime() + lesson.durationMinutes * 60_000);

  // Find teachers who have a conflicting lesson in the same slot (excluding this lesson)
  const busyTeacherIds = await db
    .selectDistinct({ teacherId: lessons.teacherId })
    .from(lessons)
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        ne(lessons.id, lessonId),
        ne(lessons.status, "cancelled"),
        sql`${lessons.scheduledAt} < ${end.toISOString()}`,
        sql`(${lessons.scheduledAt} + (${lessons.durationMinutes} * interval '1 minute')) > ${start.toISOString()}`
      )
    );

  const busyIds = new Set(busyTeacherIds.map((r) => r.teacherId));

  // Rebuild tenant+branch filter for available-teachers query
  const scopeForAvailable = getBranchScope(c);
  const whereAvailable = scopeForAvailable
    ? and(eq(teachers.tenantId, tenantId), eq(teachers.branchId, scopeForAvailable))
    : eq(teachers.tenantId, tenantId);

  const allTeachers = await db
    .select({
      id: teachers.id,
      userId: teachers.userId,
      hourlyRateCents: teachers.hourlyRateCents,
      commissionPct: teachers.commissionPct,
      name: users.name,
      email: users.email,
    })
    .from(teachers)
    .innerJoin(users, eq(teachers.userId, users.id))
    .where(whereAvailable)
    .orderBy(desc(teachers.createdAt));
  return c.json({ items: allTeachers });
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
