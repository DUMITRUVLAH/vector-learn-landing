/**
 * COURSE-202: Group capacity + waitlist routes.
 *
 * Routes:
 *   GET    /api/groups                    — list groups for tenant (optional ?courseId filter)
 *   POST   /api/groups                    — create group
 *   GET    /api/groups/:id/capacity       — { enrolled, max, waitlisted }
 *   POST   /api/groups/:id/enroll         — enroll or waitlist a student
 *   DELETE /api/groups/:id/enroll/:studentId — unenroll; auto-promote from waitlist
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, count, asc } from "drizzle-orm";
import { db } from "../db/client";
import { groups, groupEnrollments, groupWaitlist } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const groupRoutes = new Hono<{ Variables: AuthVariables }>();

groupRoutes.use("*", requireAuth);

const createGroupSchema = z.object({
  courseId: z.string().uuid(),
  name: z.string().min(1).max(200),
  teacherId: z.string().uuid().nullable().optional(),
  maxStudents: z.number().int().min(1).max(500).default(20),
});

const listQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
});

// GET /api/groups — list groups for tenant
groupRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { courseId } = c.req.valid("query");

  const conditions = [
    eq(groups.tenantId, tenantId),
    eq(groups.status, "active"),
  ];
  if (courseId) conditions.push(eq(groups.courseId, courseId));

  const items = await db
    .select()
    .from(groups)
    .where(and(...conditions))
    .orderBy(groups.name);

  // For each group, fetch capacity counts
  const result = await Promise.all(
    items.map(async (g) => {
      const [{ enrolled }] = await db
        .select({ enrolled: count() })
        .from(groupEnrollments)
        .where(eq(groupEnrollments.groupId, g.id));
      const [{ waitlisted }] = await db
        .select({ waitlisted: count() })
        .from(groupWaitlist)
        .where(eq(groupWaitlist.groupId, g.id));
      return {
        ...g,
        enrolled: Number(enrolled),
        waitlisted: Number(waitlisted),
      };
    })
  );

  return c.json({ items: result });
});

// POST /api/groups — create group
groupRoutes.post("/", zValidator("json", createGroupSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const [created] = await db
    .insert(groups)
    .values({
      tenantId,
      courseId: body.courseId,
      name: body.name,
      teacherId: body.teacherId ?? null,
      maxStudents: body.maxStudents,
    })
    .returning();

  return c.json({ ...created, enrolled: 0, waitlisted: 0 }, 201);
});

// GET /api/groups/:id/capacity — capacity shape
groupRoutes.get("/:id/capacity", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");

  const group = await db.query.groups.findFirst({
    where: and(eq(groups.id, id), eq(groups.tenantId, tenantId)),
    columns: { id: true, maxStudents: true },
  });
  if (!group) return c.json({ error: "not_found" }, 404);

  const [{ enrolled }] = await db
    .select({ enrolled: count() })
    .from(groupEnrollments)
    .where(eq(groupEnrollments.groupId, id));

  const [{ waitlisted }] = await db
    .select({ waitlisted: count() })
    .from(groupWaitlist)
    .where(eq(groupWaitlist.groupId, id));

  return c.json({
    enrolled: Number(enrolled),
    max: group.maxStudents,
    waitlisted: Number(waitlisted),
  });
});

// POST /api/groups/:id/enroll — enroll or waitlist a student
groupRoutes.post(
  "/:id/enroll",
  zValidator("json", z.object({ studentId: z.string().uuid() })),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const { studentId } = c.req.valid("json");

    // Verify group belongs to tenant
    const group = await db.query.groups.findFirst({
      where: and(eq(groups.id, id), eq(groups.tenantId, tenantId)),
      columns: { id: true, maxStudents: true },
    });
    if (!group) return c.json({ error: "not_found" }, 404);

    // Already enrolled?
    const existing = await db.query.groupEnrollments.findFirst({
      where: and(
        eq(groupEnrollments.groupId, id),
        eq(groupEnrollments.studentId, studentId)
      ),
      columns: { id: true },
    });
    if (existing) return c.json({ status: "enrolled" }, 200);

    // Already on waitlist?
    const onWaitlist = await db.query.groupWaitlist.findFirst({
      where: and(
        eq(groupWaitlist.groupId, id),
        eq(groupWaitlist.studentId, studentId)
      ),
      columns: { id: true },
    });
    if (onWaitlist) return c.json({ status: "waitlisted" }, 202);

    // Check capacity
    const [{ enrolled }] = await db
      .select({ enrolled: count() })
      .from(groupEnrollments)
      .where(eq(groupEnrollments.groupId, id));

    if (Number(enrolled) >= group.maxStudents) {
      // Full — add to waitlist
      await db.insert(groupWaitlist).values({ tenantId, groupId: id, studentId });
      return c.json({ status: "waitlisted" }, 202);
    }

    // Space available — enroll
    await db
      .insert(groupEnrollments)
      .values({ tenantId, groupId: id, studentId });
    return c.json({ status: "enrolled" }, 201);
  }
);

// DELETE /api/groups/:id/enroll/:studentId — unenroll; auto-promote first from waitlist
groupRoutes.delete("/:id/enroll/:studentId", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const studentId = c.req.param("studentId");

  // Verify group
  const group = await db.query.groups.findFirst({
    where: and(eq(groups.id, id), eq(groups.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!group) return c.json({ error: "not_found" }, 404);

  // Remove from enrollments
  await db
    .delete(groupEnrollments)
    .where(
      and(
        eq(groupEnrollments.groupId, id),
        eq(groupEnrollments.studentId, studentId)
      )
    );

  // Also remove from waitlist if somehow there
  await db
    .delete(groupWaitlist)
    .where(
      and(
        eq(groupWaitlist.groupId, id),
        eq(groupWaitlist.studentId, studentId)
      )
    );

  // Auto-promote first on waitlist (FIFO by created_at)
  let promoted: string | null = null;
  const [first] = await db
    .select()
    .from(groupWaitlist)
    .where(eq(groupWaitlist.groupId, id))
    .orderBy(asc(groupWaitlist.createdAt))
    .limit(1);

  if (first) {
    // Promote: delete from waitlist, insert into enrollments
    await db
      .delete(groupWaitlist)
      .where(eq(groupWaitlist.id, first.id));
    await db.insert(groupEnrollments).values({
      tenantId,
      groupId: id,
      studentId: first.studentId,
    });
    promoted = first.studentId;
  }

  return c.json({ ok: true, promoted });
});
