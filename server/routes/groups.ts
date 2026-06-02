/**
 * COURSE-102: Groups API routes
 * Groups are recurring classes: course × teacher × room × schedule.
 * Supports full CRUD + enrollment count (spotsRemaining).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ne, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { groups, courses, groupEnrollments, students, payments } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const scheduleTemplateSchema = z.object({
  days: z.array(z.string()).min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const createGroupSchema = z.object({
  courseId: z.string().uuid(),
  teacherId: z.string().uuid().optional().nullable(),
  roomId: z.string().uuid().optional().nullable(),
  name: z.string().min(2).max(200),
  scheduleTemplate: scheduleTemplateSchema.optional().nullable(),
  maxStudents: z.number().int().min(1).max(500).default(20),
});

const patchGroupSchema = z.object({
  teacherId: z.string().uuid().optional().nullable(),
  roomId: z.string().uuid().optional().nullable(),
  name: z.string().min(2).max(200).optional(),
  scheduleTemplate: scheduleTemplateSchema.optional().nullable(),
  maxStudents: z.number().int().min(1).max(500).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const groupRoutes = new Hono<{ Variables: AuthVariables }>();

groupRoutes.use("*", requireAuth);

// GET /api/groups — list groups for tenant with enrolled count
groupRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const courseId = c.req.query("courseId");
  const includeArchived = c.req.query("includeArchived") === "true";

  const conditions = [eq(groups.tenantId, tenantId)];
  if (!includeArchived) conditions.push(ne(groups.status, "archived"));
  if (courseId) conditions.push(eq(groups.courseId, courseId));

  const rows = await db
    .select()
    .from(groups)
    .where(and(...conditions))
    .orderBy(desc(groups.createdAt));

  // Count active enrollments per group (COURSE-103)
  let enrolledByGroup: Record<string, number> = {};
  if (rows.length > 0) {
    const counts = await db
      .select({
        groupId: groupEnrollments.groupId,
        count: sql<number>`count(*)::int`,
      })
      .from(groupEnrollments)
      .where(
        and(eq(groupEnrollments.tenantId, tenantId), eq(groupEnrollments.status, "active"))
      )
      .groupBy(groupEnrollments.groupId);
    const countRows = Array.isArray(counts) ? counts : (counts as { rows: typeof counts }).rows ?? [];
    for (const row of Array.isArray(countRows) ? countRows : []) {
      if (row && typeof row === "object" && "groupId" in row) {
        enrolledByGroup[row.groupId as string] = row.count as number;
      }
    }
  }

  const items = rows.map((g) => ({
    ...g,
    enrolledCount: enrolledByGroup[g.id] ?? 0,
    spotsRemaining: Math.max(0, g.maxStudents - (enrolledByGroup[g.id] ?? 0)),
  }));

  return c.json({ items });
});

// GET /api/groups/:id — single group with enrolled count
groupRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const [item] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.tenantId, tenantId)));
  if (!item) return c.json({ error: "not_found" }, 404);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupEnrollments)
    .where(
      and(
        eq(groupEnrollments.groupId, id),
        eq(groupEnrollments.tenantId, tenantId),
        eq(groupEnrollments.status, "active")
      )
    );
  const enrolledCount = countRow?.count ?? 0;
  return c.json({ ...item, enrolledCount, spotsRemaining: Math.max(0, item.maxStudents - enrolledCount) });
});

// GET /api/groups/:groupId/enrollments — list enrolled students
groupRoutes.get("/:groupId/enrollments", async (c) => {
  const groupId = c.req.param("groupId");
  const tenantId = c.get("user").tenantId;

  // Verify group belongs to tenant
  const [group] = await db.select({ id: groups.id }).from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.tenantId, tenantId)));
  if (!group) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select({
      enrollment: groupEnrollments,
      student: students,
    })
    .from(groupEnrollments)
    .innerJoin(students, eq(groupEnrollments.studentId, students.id))
    .where(
      and(
        eq(groupEnrollments.groupId, groupId),
        eq(groupEnrollments.tenantId, tenantId),
        eq(groupEnrollments.status, "active")
      )
    )
    .orderBy(students.fullName);

  return c.json({ items: rows });
});

// POST /api/groups/:groupId/enroll — enroll a student (COURSE-103)
groupRoutes.post("/:groupId/enroll", async (c) => {
  const groupId = c.req.param("groupId");
  const tenantId = c.get("user").tenantId;

  let body: { studentId: string; createPayment?: boolean };
  try {
    body = await c.req.json<{ studentId: string; createPayment?: boolean }>();
  } catch {
    return c.json({ error: "invalid_body" }, 400);
  }
  if (!body.studentId) return c.json({ error: "studentId_required" }, 400);

  // Verify group belongs to tenant
  const [group] = await db.select().from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.tenantId, tenantId)));
  if (!group) return c.json({ error: "group_not_found" }, 404);

  // Verify student belongs to tenant
  const [student] = await db.select().from(students)
    .where(and(eq(students.id, body.studentId), eq(students.tenantId, tenantId)));
  if (!student) return c.json({ error: "student_not_found" }, 404);

  // Check capacity
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupEnrollments)
    .where(
      and(
        eq(groupEnrollments.groupId, groupId),
        eq(groupEnrollments.tenantId, tenantId),
        eq(groupEnrollments.status, "active")
      )
    );
  const enrolledCount = countRow?.count ?? 0;
  if (enrolledCount >= group.maxStudents) {
    return c.json({ error: "group_full" }, 409);
  }

  // Check for duplicate (existing active enrollment)
  const [existing] = await db.select({ id: groupEnrollments.id })
    .from(groupEnrollments)
    .where(
      and(
        eq(groupEnrollments.groupId, groupId),
        eq(groupEnrollments.studentId, body.studentId)
      )
    );
  if (existing) return c.json({ error: "already_enrolled" }, 409);

  // Insert enrollment
  const [enrollment] = await db
    .insert(groupEnrollments)
    .values({
      groupId,
      studentId: body.studentId,
      tenantId,
      status: "active",
    })
    .returning();

  // Optionally create payment draft
  let payment = null;
  if (body.createPayment) {
    const [courseRow] = await db.select({ defaultPriceCents: courses.defaultPriceCents })
      .from(courses).where(eq(courses.id, group.courseId));
    if (courseRow) {
      const [created] = await db.insert(payments).values({
        tenantId,
        studentId: body.studentId,
        amountCents: courseRow.defaultPriceCents,
        status: "pending",
        description: `Înrolare în ${group.name}`,
      }).returning();
      payment = created;
    }
  }

  return c.json({ enrollment, payment }, 201);
});

// DELETE /api/groups/:groupId/enroll/:studentId — unenroll student
groupRoutes.delete("/:groupId/enroll/:studentId", async (c) => {
  const groupId = c.req.param("groupId");
  const studentId = c.req.param("studentId");
  const tenantId = c.get("user").tenantId;

  const [updated] = await db
    .update(groupEnrollments)
    .set({ status: "removed", updatedAt: new Date() })
    .where(
      and(
        eq(groupEnrollments.groupId, groupId),
        eq(groupEnrollments.studentId, studentId),
        eq(groupEnrollments.tenantId, tenantId),
        eq(groupEnrollments.status, "active")
      )
    )
    .returning({ id: groupEnrollments.id });
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

// POST /api/groups — create group
groupRoutes.post("/", zValidator("json", createGroupSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get("user").tenantId;

  // Validate courseId belongs to this tenant
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, body.courseId), eq(courses.tenantId, tenantId)));
  if (!course) return c.json({ error: "course_not_found" }, 404);

  const [created] = await db
    .insert(groups)
    .values({
      ...body,
      tenantId,
      status: "active",
    })
    .returning();
  return c.json({ ...created, enrolledCount: 0, spotsRemaining: created.maxStudents }, 201);
});

// PATCH /api/groups/:id — partial update
groupRoutes.patch("/:id", zValidator("json", patchGroupSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const updates: Partial<typeof groups.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.teacherId !== undefined) updates.teacherId = body.teacherId;
  if (body.roomId !== undefined) updates.roomId = body.roomId;
  if (body.scheduleTemplate !== undefined) updates.scheduleTemplate = body.scheduleTemplate;
  if (body.maxStudents !== undefined) updates.maxStudents = body.maxStudents;
  if (body.status !== undefined) updates.status = body.status;
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(groups)
    .set(updates)
    .where(and(eq(groups.id, id), eq(groups.tenantId, tenantId)))
    .returning();
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

// DELETE /api/groups/:id — soft-archive
groupRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const [archived] = await db
    .update(groups)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(groups.id, id), eq(groups.tenantId, tenantId)))
    .returning({ id: groups.id });
  if (!archived) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
