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
  cefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional().nullable(),
  defaultPriceCents: z.number().int().min(0).default(0),
  durationMinutes: z.number().int().min(15).max(480).default(60),
});

// COURSE-101: PATCH — partial update schema (all fields optional)
const patchCourseSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  level: z.string().max(32).optional().nullable(),
  cefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional().nullable(),
  defaultPriceCents: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const courseRoutes = new Hono<{ Variables: AuthVariables }>();

courseRoutes.use("*", requireAuth);

// GET /api/courses — list courses for tenant; excludes archived by default
courseRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const includeArchived = c.req.query("includeArchived") === "true";

  const conditions = [eq(courses.tenantId, tenantId)];
  if (!includeArchived) {
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

// PATCH /api/courses/:id — partial update (COURSE-101)
courseRoutes.patch("/:id", zValidator("json", patchCourseSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  // Build update object — only include defined keys
  const updates: Partial<typeof courses.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.level !== undefined) updates.level = body.level;
  if (body.cefrLevel !== undefined) updates.cefrLevel = body.cefrLevel;
  if (body.defaultPriceCents !== undefined) updates.defaultPriceCents = body.defaultPriceCents;
  if (body.durationMinutes !== undefined) updates.durationMinutes = body.durationMinutes;
  if (body.status !== undefined) updates.status = body.status;
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(courses)
    .set(updates)
    .where(and(eq(courses.id, id), eq(courses.tenantId, tenantId)))
    .returning();
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

// DELETE /api/courses/:id — soft-archive (COURSE-101: status = 'archived' instead of hard delete)
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
