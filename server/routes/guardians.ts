/**
 * GUARDIAN-001 — API tutori autorizați per elev
 *
 * Routes (montate la /api/students/:studentId/guardians):
 *   GET    /api/students/:studentId/guardians
 *   POST   /api/students/:studentId/guardians
 *   PATCH  /api/students/:studentId/guardians/:guardianId
 *   DELETE /api/students/:studentId/guardians/:guardianId
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, count } from "drizzle-orm";
import { db } from "../db/client";
import {
  studentGuardians,
  students,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const guardianRoutes = new Hono<{ Variables: AuthVariables }>();

guardianRoutes.use("*", requireAuth);

// ─── Validators ───────────────────────────────────────────────────────────────

const guardianSchema = z.object({
  fullName: z.string().min(1).max(200),
  relationship: z.string().max(50).nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
  email: z.string().email().nullable().optional(),
  isPrimary: z.boolean().default(false),
  hasCustody: z.boolean().default(true),
  canPickup: z.boolean().default(true),
  receivesCommunications: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
});

/** Maxim tutori per elev */
const MAX_GUARDIANS = 10;

// ─── Helper: verifică că studentul aparține tenantului ────────────────────────

async function getStudentOrNull(studentId: string, tenantId: string) {
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)));
  return student ?? null;
}

// ─── GET /api/students/:studentId/guardians ───────────────────────────────────

guardianRoutes.get("/:studentId/guardians", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");

  const student = await getStudentOrNull(studentId, user.tenantId);
  if (!student) return c.json({ error: "student_not_found" }, 404);

  const rows = await db
    .select()
    .from(studentGuardians)
    .where(
      and(
        eq(studentGuardians.studentId, studentId),
        eq(studentGuardians.tenantId, user.tenantId)
      )
    )
    .orderBy(asc(studentGuardians.createdAt));

  const guardians = Array.isArray(rows)
    ? rows
    : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  return c.json({ guardians });
});

// ─── POST /api/students/:studentId/guardians ──────────────────────────────────

guardianRoutes.post("/:studentId/guardians", zValidator("json", guardianSchema), async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");
  const body = c.req.valid("json");

  const student = await getStudentOrNull(studentId, user.tenantId);
  if (!student) return c.json({ error: "student_not_found" }, 404);

  // Verifică limita de 10 tutori per elev
  const countRows = await db
    .select({ total: count() })
    .from(studentGuardians)
    .where(
      and(
        eq(studentGuardians.studentId, studentId),
        eq(studentGuardians.tenantId, user.tenantId)
      )
    );

  const currentCount =
    Array.isArray(countRows) ? countRows[0]?.total ?? 0 : countRows[0]?.total ?? 0;

  if (Number(currentCount) >= MAX_GUARDIANS) {
    return c.json({ error: "guardian_limit_reached" }, 409);
  }

  // Dacă isPrimary → scoatem primarul existent
  if (body.isPrimary) {
    await db
      .update(studentGuardians)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(
        and(
          eq(studentGuardians.studentId, studentId),
          eq(studentGuardians.tenantId, user.tenantId),
          eq(studentGuardians.isPrimary, true)
        )
      );
  }

  const [created] = await db
    .insert(studentGuardians)
    .values({
      tenantId: user.tenantId,
      studentId,
      fullName: body.fullName,
      relationship: body.relationship ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      isPrimary: body.isPrimary,
      hasCustody: body.hasCustody,
      canPickup: body.canPickup,
      receivesCommunications: body.receivesCommunications,
      notes: body.notes ?? null,
    })
    .returning();

  return c.json({ guardian: created }, 201);
});

// ─── PATCH /api/students/:studentId/guardians/:guardianId ────────────────────

guardianRoutes.patch(
  "/:studentId/guardians/:guardianId",
  zValidator("json", guardianSchema.partial()),
  async (c) => {
    const user = c.get("user");
    const studentId = c.req.param("studentId");
    const guardianId = c.req.param("guardianId");
    const body = c.req.valid("json");

    const student = await getStudentOrNull(studentId, user.tenantId);
    if (!student) return c.json({ error: "student_not_found" }, 404);

    const [existing] = await db
      .select()
      .from(studentGuardians)
      .where(
        and(
          eq(studentGuardians.id, guardianId),
          eq(studentGuardians.studentId, studentId),
          eq(studentGuardians.tenantId, user.tenantId)
        )
      );

    if (!existing) return c.json({ error: "not_found" }, 404);

    // Dacă se setează isPrimary → scoatem primarul existent (altul decât cel curent)
    if (body.isPrimary) {
      await db
        .update(studentGuardians)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(studentGuardians.studentId, studentId),
            eq(studentGuardians.tenantId, user.tenantId),
            eq(studentGuardians.isPrimary, true)
          )
        );
    }

    const [updated] = await db
      .update(studentGuardians)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(studentGuardians.id, guardianId))
      .returning();

    return c.json({ guardian: updated });
  }
);

// ─── DELETE /api/students/:studentId/guardians/:guardianId ───────────────────

guardianRoutes.delete("/:studentId/guardians/:guardianId", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");
  const guardianId = c.req.param("guardianId");

  const student = await getStudentOrNull(studentId, user.tenantId);
  if (!student) return c.json({ error: "student_not_found" }, 404);

  const [existing] = await db
    .select()
    .from(studentGuardians)
    .where(
      and(
        eq(studentGuardians.id, guardianId),
        eq(studentGuardians.studentId, studentId),
        eq(studentGuardians.tenantId, user.tenantId)
      )
    );

  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(studentGuardians).where(eq(studentGuardians.id, guardianId));
  return c.body(null, 204);
});
