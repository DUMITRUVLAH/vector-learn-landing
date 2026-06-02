import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, ne } from "drizzle-orm";
import { db } from "../db/client";
import { courses } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const createCourseSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional().nullable(),
  level: z.string().max(32).optional().nullable(),
  defaultPriceCents: z.number().int().min(0).default(0),
  durationMinutes: z.number().int().min(15).max(480).default(60),
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

courseRoutes.post("/", zValidator("json", createCourseSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get("user").tenantId;
  const [created] = await db
    .insert(courses)
    .values({ ...body, tenantId })
    .returning();
  return c.json(created, 201);
});

// COURSE-201: PATCH /:id — edit course fields
courseRoutes.patch("/:id", zValidator("json", updateCourseSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  // Verify ownership first
  const existing = await db.query.courses.findFirst({
    where: and(eq(courses.id, id), eq(courses.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  // Build update object — only include provided fields
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.level !== undefined) updateData.level = body.level;
  if (body.defaultPriceCents !== undefined) updateData.defaultPriceCents = body.defaultPriceCents;
  if (body.durationMinutes !== undefined) updateData.durationMinutes = body.durationMinutes;

  const [updated] = await db
    .update(courses)
    .set(updateData)
    .where(and(eq(courses.id, id), eq(courses.tenantId, tenantId)))
    .returning();

  return c.json(updated);
});

// COURSE-201: DELETE /:id — soft-delete (archive), not hard delete
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
