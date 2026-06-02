import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { students } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { withBranchFilter } from "../middleware/branchScope";

const studentBaseSchema = z.object({
  fullName: z.string().min(2).max(200),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  parentPhone: z.string().max(32).optional().nullable(),
  parentEmail: z.string().email().max(255).optional().nullable().or(z.literal("")),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")),
  status: z.enum(["active", "trial", "paused", "archived"]).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

const createStudentSchema = studentBaseSchema;
const updateStudentSchema = studentBaseSchema.partial();

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["active", "trial", "paused", "archived", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function normalizeOptional<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === "") out[k] = null;
    else if (v === undefined) continue;
    else out[k] = v;
  }
  return out as T;
}

export const studentRoutes = new Hono<{ Variables: AuthVariables }>();

studentRoutes.use("*", requireAuth);

studentRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { search, status, limit, offset } = c.req.valid("query");
  const user = c.get("user");
  const tenantId = user.tenantId;

  // BRANCH-703: restrict to user's branch if branchScope is set
  const conditions = [eq(students.tenantId, tenantId)];
  withBranchFilter(user, conditions, students.branchId);
  if (status !== "all") {
    conditions.push(eq(students.status, status));
  }
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    const searchCondition = or(
      ilike(students.fullName, q),
      ilike(students.email, q),
      ilike(students.phone, q),
      ilike(students.parentEmail, q),
      ilike(students.parentPhone, q)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const where = and(...conditions);

  const rows = await db
    .select()
    .from(students)
    .where(where)
    .orderBy(desc(students.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(students)
    .where(where);

  return c.json({ items: rows, total, limit, offset });
});

studentRoutes.post("/", zValidator("json", createStudentSchema), async (c) => {
  const body = normalizeOptional(c.req.valid("json"));
  const tenantId = c.get("user").tenantId;
  const [created] = await db
    .insert(students)
    .values({ ...body, tenantId })
    .returning();
  return c.json(created, 201);
});

studentRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const student = await db.query.students.findFirst({
    where: and(eq(students.id, id), eq(students.tenantId, tenantId)),
  });
  if (!student) return c.json({ error: "not_found" }, 404);
  return c.json(student);
});

studentRoutes.patch("/:id", zValidator("json", updateStudentSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = normalizeOptional(c.req.valid("json"));
  const [updated] = await db
    .update(students)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(students.id, id), eq(students.tenantId, tenantId)))
    .returning();
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

studentRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const [archived] = await db
    .update(students)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(students.id, id), eq(students.tenantId, tenantId)))
    .returning({ id: students.id });
  if (!archived) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true, id: archived.id });
});
