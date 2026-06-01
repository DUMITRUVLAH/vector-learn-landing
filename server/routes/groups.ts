/**
 * COURSE-102: Groups API routes
 * Groups are recurring classes: course × teacher × room × schedule.
 * Supports full CRUD + enrollment count (spotsRemaining).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ne, desc } from "drizzle-orm";
import { db } from "../db/client";
import { groups, courses } from "../db/schema";
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

// GET /api/groups — list groups for tenant
// Note: spotsRemaining is always maxStudents here; enrolledCount added in COURSE-103
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

  const items = rows.map((g) => ({
    ...g,
    enrolledCount: 0,
    spotsRemaining: g.maxStudents,
  }));

  return c.json({ items });
});

// GET /api/groups/:id — single group
groupRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const [item] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, id), eq(groups.tenantId, tenantId)));
  if (!item) return c.json({ error: "not_found" }, 404);
  return c.json({ ...item, enrolledCount: 0, spotsRemaining: item.maxStudents });
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
