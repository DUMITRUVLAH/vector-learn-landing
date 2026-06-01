import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { courses } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const createCourseSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional().nullable(),
  level: z.string().max(32).optional().nullable(),
  defaultPriceCents: z.number().int().min(0).default(0),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  /** GAP-005: Maximum students per course (null = unlimited) */
  maxStudents: z.number().int().min(1).max(500).optional().nullable(),
});

export const courseRoutes = new Hono<{ Variables: AuthVariables }>();

courseRoutes.use("*", requireAuth);

courseRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const items = await db
    .select()
    .from(courses)
    .where(eq(courses.tenantId, tenantId))
    .orderBy(desc(courses.createdAt));
  return c.json({ items });
});

courseRoutes.post("/", zValidator("json", createCourseSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get("user").tenantId;
  const [created] = await db
    .insert(courses)
    .values({ ...body, tenantId })
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
  const result = await db
    .delete(courses)
    .where(and(eq(courses.id, id), eq(courses.tenantId, tenantId)))
    .returning({ id: courses.id });
  if (result.length === 0) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
