import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, gte, ne, count as drizzleCount } from "drizzle-orm";
import { db } from "../db/client";
import { courses, leads, lessons, studentLessons, teachers } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const createCourseSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional().nullable(),
  level: z.string().max(32).optional().nullable(),
  cefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional().nullable(),
  defaultPriceCents: z.number().int().min(0).default(0),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  /** GAP-005: Maximum students per course (null = unlimited) */
  maxStudents: z.number().int().min(1).max(500).optional().nullable(),
});

// COURSE-201: patch schema (all fields optional)
const updateCourseSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  level: z.string().max(32).optional().nullable(),
  defaultPriceCents: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
});

const listQuerySchema = z.object({
  showArchived: z.coerce.boolean().default(false),
});

export const courseRoutes = new Hono<{ Variables: AuthVariables }>();

courseRoutes.use("*", requireAuth);

courseRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { showArchived } = c.req.valid("query");

  const conditions = [eq(courses.tenantId, tenantId)];
  if (!showArchived) {
    // COURSE-201: default — exclude archived courses
    conditions.push(ne(courses.status, "archived"));
  }

  const items = await db
    .select()
    .from(courses)
    .where(and(...conditions))
    .orderBy(desc(courses.createdAt));
  return c.json({ items });
});

// GET /api/courses/:id — single course
courseRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const [item] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.tenantId, tenantId)));
  if (!item) return c.json({ error: "not_found" }, 404);
  return c.json(item);
});

// POST /api/courses — create course
courseRoutes.post("/", zValidator("json", createCourseSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get("user").tenantId;
  const [created] = await db
    .insert(courses)
    .values({ ...body, tenantId, status: "active" })
    .returning();
  return c.json(created, 201);
});

/** PATCH /api/courses/:id — update course including maxStudents */
const patchCourseSchema = createCourseSchema.partial();

courseRoutes.patch("/:id", zValidator("json", patchCourseSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const existing = await db.query.courses.findFirst({
    where: and(eq(courses.id, id), eq(courses.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(courses)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(courses.id, id), eq(courses.tenantId, tenantId)))
    .returning();

  return c.json(updated);
});

courseRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const [archived] = await db
    .update(courses)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(courses.id, id), eq(courses.tenantId, tenantId)))
    .returning({ id: courses.id });
  if (!archived) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
