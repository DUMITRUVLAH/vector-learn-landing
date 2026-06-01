/**
 * SCHOOL-001 — API pentru modulul de școală privată K-12
 *
 * Routes:
 *   GET    /api/school/years
 *   POST   /api/school/years
 *   PATCH  /api/school/years/:id
 *   DELETE /api/school/years/:id
 *
 *   GET    /api/school/terms?yearId=
 *   POST   /api/school/terms
 *   PATCH  /api/school/terms/:id
 *   DELETE /api/school/terms/:id
 *
 *   GET    /api/school/classes?yearId=
 *   POST   /api/school/classes
 *   PATCH  /api/school/classes/:id
 *   DELETE /api/school/classes/:id
 *
 *   POST   /api/school/classes/:id/enroll        { studentId }
 *   DELETE /api/school/classes/:id/enroll/:studentId
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import {
  academicYears,
  academicTerms,
  schoolClasses,
  classEnrollments,
  teachers,
  students,
  users,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const schoolRoutes = new Hono<{ Variables: AuthVariables }>();

// Toate rutele necesită autentificare
schoolRoutes.use("*", requireAuth);

// ─── Validators ──────────────────────────────────────────────────────────────

const yearSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  isCurrent: z.boolean().default(false),
});

const termSchema = z.object({
  academicYearId: z.string().uuid(),
  name: z.string().min(1).max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  orderIndex: z.number().int().min(1).default(1),
});

const classSchema = z.object({
  academicYearId: z.string().uuid(),
  name: z.string().min(1).max(100),
  gradeLevel: z.string().min(1).max(10),
  section: z.string().max(10).nullable().optional(),
  homeroomTeacherId: z.string().uuid().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
});

const enrollSchema = z.object({
  studentId: z.string().uuid(),
});

// ─── Academic Years ───────────────────────────────────────────────────────────

schoolRoutes.get("/years", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(academicYears)
    .where(eq(academicYears.tenantId, user.tenantId))
    .orderBy(asc(academicYears.startDate));

  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return c.json({ years: list });
});

schoolRoutes.post("/years", zValidator("json", yearSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Dacă isCurrent=true → scoatem celelalte din curent (un singur an curent per tenant)
  if (body.isCurrent) {
    await db
      .update(academicYears)
      .set({ isCurrent: false, updatedAt: new Date() })
      .where(
        and(eq(academicYears.tenantId, user.tenantId), eq(academicYears.isCurrent, true))
      );
  }

  const [created] = await db
    .insert(academicYears)
    .values({
      tenantId: user.tenantId,
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate,
      isCurrent: body.isCurrent,
    })
    .returning();

  return c.json({ year: created }, 201);
});

schoolRoutes.patch("/years/:id", zValidator("json", yearSchema.partial()), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Verifică că aparține tenantului
  const [existing] = await db
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.id, id), eq(academicYears.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  if (body.isCurrent) {
    await db
      .update(academicYears)
      .set({ isCurrent: false, updatedAt: new Date() })
      .where(
        and(eq(academicYears.tenantId, user.tenantId), eq(academicYears.isCurrent, true))
      );
  }

  const [updated] = await db
    .update(academicYears)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(academicYears.id, id))
    .returning();

  return c.json({ year: updated });
});

schoolRoutes.delete("/years/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.id, id), eq(academicYears.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(academicYears).where(eq(academicYears.id, id));
  return c.json({ ok: true });
});

// ─── Academic Terms ───────────────────────────────────────────────────────────

schoolRoutes.get("/terms", async (c) => {
  const user = c.get("user");
  const yearId = c.req.query("yearId");

  const conditions = [eq(academicTerms.tenantId, user.tenantId)];
  if (yearId) conditions.push(eq(academicTerms.academicYearId, yearId));

  const rows = await db
    .select()
    .from(academicTerms)
    .where(and(...conditions))
    .orderBy(asc(academicTerms.orderIndex));

  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return c.json({ terms: list });
});

schoolRoutes.post("/terms", zValidator("json", termSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Verifică că yearId aparține tenantului
  const [year] = await db
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.id, body.academicYearId), eq(academicYears.tenantId, user.tenantId)));

  if (!year) return c.json({ error: "year_not_found" }, 404);

  const [created] = await db
    .insert(academicTerms)
    .values({
      tenantId: user.tenantId,
      academicYearId: body.academicYearId,
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate,
      orderIndex: body.orderIndex,
    })
    .returning();

  return c.json({ term: created }, 201);
});

schoolRoutes.patch("/terms/:id", zValidator("json", termSchema.partial()), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(academicTerms)
    .where(and(eq(academicTerms.id, id), eq(academicTerms.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(academicTerms)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(academicTerms.id, id))
    .returning();

  return c.json({ term: updated });
});

schoolRoutes.delete("/terms/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(academicTerms)
    .where(and(eq(academicTerms.id, id), eq(academicTerms.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(academicTerms).where(eq(academicTerms.id, id));
  return c.json({ ok: true });
});

// ─── School Classes ───────────────────────────────────────────────────────────

schoolRoutes.get("/classes", async (c) => {
  const user = c.get("user");
  const yearId = c.req.query("yearId");

  const conditions = [eq(schoolClasses.tenantId, user.tenantId)];
  if (yearId) conditions.push(eq(schoolClasses.academicYearId, yearId));

  const rows = await db
    .select({
      id: schoolClasses.id,
      tenantId: schoolClasses.tenantId,
      academicYearId: schoolClasses.academicYearId,
      name: schoolClasses.name,
      gradeLevel: schoolClasses.gradeLevel,
      section: schoolClasses.section,
      homeroomTeacherId: schoolClasses.homeroomTeacherId,
      capacity: schoolClasses.capacity,
      createdAt: schoolClasses.createdAt,
      updatedAt: schoolClasses.updatedAt,
      homeroomTeacherName: users.name,
    })
    .from(schoolClasses)
    .leftJoin(teachers, eq(schoolClasses.homeroomTeacherId, teachers.id))
    .leftJoin(users, eq(teachers.userId, users.id))
    .where(and(...conditions))
    .orderBy(asc(schoolClasses.gradeLevel), asc(schoolClasses.section));

  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  // Adaugă enrollmentCount pentru fiecare clasă
  const enriched = await Promise.all(
    list.map(async (cls) => {
      const enrollmentsRows = await db
        .select({ status: classEnrollments.status })
        .from(classEnrollments)
        .where(
          and(
            eq(classEnrollments.classId, cls.id),
            eq(classEnrollments.status, "active")
          )
        );
      const enrolls = Array.isArray(enrollmentsRows)
        ? enrollmentsRows
        : (enrollmentsRows as unknown as { rows: typeof enrollmentsRows }).rows ?? enrollmentsRows;

      return {
        ...cls,
        enrollmentCount: enrolls.length,
      };
    })
  );

  return c.json({ classes: enriched });
});

schoolRoutes.post("/classes", zValidator("json", classSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Verifică că yearId aparține tenantului
  const [year] = await db
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.id, body.academicYearId), eq(academicYears.tenantId, user.tenantId)));

  if (!year) return c.json({ error: "year_not_found" }, 404);

  // Verifică dirigintele dacă e specificat
  if (body.homeroomTeacherId) {
    const [teacher] = await db
      .select()
      .from(teachers)
      .where(and(eq(teachers.id, body.homeroomTeacherId), eq(teachers.tenantId, user.tenantId)));
    if (!teacher) return c.json({ error: "teacher_not_found" }, 404);
  }

  const [created] = await db
    .insert(schoolClasses)
    .values({
      tenantId: user.tenantId,
      academicYearId: body.academicYearId,
      name: body.name,
      gradeLevel: body.gradeLevel,
      section: body.section ?? null,
      homeroomTeacherId: body.homeroomTeacherId ?? null,
      capacity: body.capacity ?? null,
    })
    .returning();

  return c.json({ class: created }, 201);
});

schoolRoutes.patch("/classes/:id", zValidator("json", classSchema.partial()), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(schoolClasses)
    .where(and(eq(schoolClasses.id, id), eq(schoolClasses.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(schoolClasses)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(schoolClasses.id, id))
    .returning();

  return c.json({ class: updated });
});

schoolRoutes.delete("/classes/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(schoolClasses)
    .where(and(eq(schoolClasses.id, id), eq(schoolClasses.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(schoolClasses).where(eq(schoolClasses.id, id));
  return c.json({ ok: true });
});

// ─── Enrollment ───────────────────────────────────────────────────────────────

schoolRoutes.post("/classes/:id/enroll", zValidator("json", enrollSchema), async (c) => {
  const user = c.get("user");
  const classId = c.req.param("id");
  const { studentId } = c.req.valid("json");

  // Verifică clasa
  const [cls] = await db
    .select()
    .from(schoolClasses)
    .where(and(eq(schoolClasses.id, classId), eq(schoolClasses.tenantId, user.tenantId)));

  if (!cls) return c.json({ error: "not_found" }, 404);

  // Verifică studentul
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));

  if (!student) return c.json({ error: "student_not_found" }, 404);

  // Verifică duplicat
  const [existing] = await db
    .select()
    .from(classEnrollments)
    .where(
      and(eq(classEnrollments.classId, classId), eq(classEnrollments.studentId, studentId))
    );

  if (existing) return c.json({ error: "already_enrolled" }, 409);

  // Verifică capacitatea
  if (cls.capacity != null) {
    const enrollmentsRows = await db
      .select({ status: classEnrollments.status })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.classId, classId),
          eq(classEnrollments.status, "active")
        )
      );
    const enrolls = Array.isArray(enrollmentsRows)
      ? enrollmentsRows
      : (enrollmentsRows as unknown as { rows: typeof enrollmentsRows }).rows ?? enrollmentsRows;

    if (enrolls.length >= cls.capacity) {
      return c.json({ error: "class_full" }, 409);
    }
  }

  const [enrollment] = await db
    .insert(classEnrollments)
    .values({
      tenantId: user.tenantId,
      classId,
      studentId,
      enrolledAt: new Date(),
      status: "active",
    })
    .returning();

  return c.json({ enrollment }, 201);
});

schoolRoutes.delete("/classes/:id/enroll/:studentId", async (c) => {
  const user = c.get("user");
  const classId = c.req.param("id");
  const studentId = c.req.param("studentId");

  const [cls] = await db
    .select()
    .from(schoolClasses)
    .where(and(eq(schoolClasses.id, classId), eq(schoolClasses.tenantId, user.tenantId)));

  if (!cls) return c.json({ error: "not_found" }, 404);

  const [enrollment] = await db
    .select()
    .from(classEnrollments)
    .where(
      and(eq(classEnrollments.classId, classId), eq(classEnrollments.studentId, studentId))
    );

  if (!enrollment) return c.json({ error: "enrollment_not_found" }, 404);

  await db
    .update(classEnrollments)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(eq(classEnrollments.id, enrollment.id));

  return c.json({ ok: true });
});
