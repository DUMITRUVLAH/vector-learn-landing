/**
 * GAP-004/GAP-006: Lesson packages API
 * GET  /api/lesson-packages?studentId=&courseId=&status=
 * POST /api/lesson-packages
 * PATCH /api/lesson-packages/:id
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { lessonPackages } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const lessonPackageRoutes = new Hono<{ Variables: AuthVariables }>();
lessonPackageRoutes.use("*", requireAuth);

// ── GET /api/lesson-packages ─────────────────────────────────────────────────
lessonPackageRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { studentId, courseId, status } = c.req.query();

  const conditions = [eq(lessonPackages.tenantId, tenantId)];
  if (studentId) conditions.push(eq(lessonPackages.studentId, studentId));
  if (courseId) conditions.push(eq(lessonPackages.courseId, courseId));
  if (status) conditions.push(eq(lessonPackages.status, status as "active" | "exhausted" | "expired" | "cancelled"));

  const items = await db
    .select()
    .from(lessonPackages)
    .where(and(...conditions))
    .orderBy(asc(lessonPackages.validFrom));

  return c.json({ items });
});

// ── POST /api/lesson-packages ─────────────────────────────────────────────────
const createPackageSchema = z.object({
  studentId: z.string().uuid(),
  courseId: z.string().uuid(),
  unitsTotal: z.number().int().min(1).max(1000),
  autoRenew: z.boolean().optional().default(false),
  recoveryIncludedInPackage: z.boolean().optional().default(true),
  validFrom: z.string().length(10), // ISO date YYYY-MM-DD
  validUntil: z.string().length(10).optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
});

lessonPackageRoutes.post("/", zValidator("json", createPackageSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const [pkg] = await db
    .insert(lessonPackages)
    .values({
      tenantId,
      studentId: body.studentId,
      courseId: body.courseId,
      unitsTotal: body.unitsTotal,
      unitsRemaining: body.unitsTotal,
      autoRenew: body.autoRenew ?? false,
      recoveryIncludedInPackage: body.recoveryIncludedInPackage ?? true,
      validFrom: body.validFrom,
      validUntil: body.validUntil ?? undefined,
      invoiceId: body.invoiceId ?? undefined,
      status: "active",
    })
    .returning();

  return c.json(pkg, 201);
});

// ── PATCH /api/lesson-packages/:id ─────────────────────────────────────────────
const patchPackageSchema = z.object({
  autoRenew: z.boolean().optional(),
  status: z.enum(["active", "exhausted", "expired", "cancelled"]).optional(),
  validUntil: z.string().length(10).optional().nullable(),
}).partial();

lessonPackageRoutes.patch("/:id", zValidator("json", patchPackageSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const existing = await db.query.lessonPackages.findFirst({
    where: and(eq(lessonPackages.id, id), eq(lessonPackages.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(lessonPackages)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(lessonPackages.id, id), eq(lessonPackages.tenantId, tenantId)))
    .returning();

  return c.json(updated);
});
