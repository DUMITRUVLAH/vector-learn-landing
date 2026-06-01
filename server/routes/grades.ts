/**
 * SCHOOL-002 — API gradebook (catalog de note)
 *
 * Routes:
 *   GET    /api/school/subjects
 *   POST   /api/school/subjects
 *   PATCH  /api/school/subjects/:id
 *   DELETE /api/school/subjects/:id
 *
 *   GET    /api/school/grades?classId=&termId=&subjectId=&limit=
 *   POST   /api/school/grades
 *   PATCH  /api/school/grades/:id
 *   DELETE /api/school/grades/:id
 *   GET    /api/school/grades/student/:studentId?termId=
 *   GET    /api/school/grades/report-card/:studentId/:termId
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  schoolSubjects,
  gradeEntries,
  schoolClasses,
  academicTerms,
  students,
  teachers,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { weightedAverage, termSummary, buildReportCardData } from "../lib/gradebook";

export const gradesRoutes = new Hono<{ Variables: AuthVariables }>();

gradesRoutes.use("*", requireAuth);

// ─── Validators ───────────────────────────────────────────────────────────────

const subjectSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(20).nullable().optional(),
  description: z.string().nullable().optional(),
});

const gradeSchema = z.object({
  classId: z.string().uuid(),
  studentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  termId: z.string().uuid(),
  teacherId: z.string().uuid().nullable().optional(),
  value: z.number().min(0).max(100),
  weight: z.number().min(0.1).max(10).default(1),
  type: z.enum(["test", "homework", "oral", "final"]).default("test"),
  title: z.string().max(200).nullable().optional(),
  gradedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  notes: z.string().max(500).nullable().optional(),
});

// ─── Subjects ─────────────────────────────────────────────────────────────────

gradesRoutes.get("/subjects", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(schoolSubjects)
    .where(eq(schoolSubjects.tenantId, user.tenantId))
    .orderBy(asc(schoolSubjects.name));

  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return c.json({ subjects: list });
});

gradesRoutes.post("/subjects", zValidator("json", subjectSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const [created] = await db
    .insert(schoolSubjects)
    .values({
      tenantId: user.tenantId,
      name: body.name,
      code: body.code ?? null,
      description: body.description ?? null,
    })
    .returning();

  return c.json({ subject: created }, 201);
});

gradesRoutes.patch("/subjects/:id", zValidator("json", subjectSchema.partial()), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(schoolSubjects)
    .where(and(eq(schoolSubjects.id, id), eq(schoolSubjects.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(schoolSubjects)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(schoolSubjects.id, id))
    .returning();

  return c.json({ subject: updated });
});

gradesRoutes.delete("/subjects/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(schoolSubjects)
    .where(and(eq(schoolSubjects.id, id), eq(schoolSubjects.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(schoolSubjects).where(eq(schoolSubjects.id, id));
  return c.json({ ok: true });
});

// ─── Grades ───────────────────────────────────────────────────────────────────

// Report card — BEFORE :id-style routes to avoid param collision
gradesRoutes.get("/grades/report-card/:studentId/:termId", async (c) => {
  const user = c.get("user");
  const { studentId, termId } = c.req.param();

  // Validare tenant-safe: elevul aparține tenantului
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));

  if (!student) return c.json({ error: "student_not_found" }, 404);

  const [term] = await db
    .select()
    .from(academicTerms)
    .where(and(eq(academicTerms.id, termId), eq(academicTerms.tenantId, user.tenantId)));

  if (!term) return c.json({ error: "term_not_found" }, 404);

  // Toate notele elevului în termenul dat
  const rawGrades = await db
    .select({
      gradeId: gradeEntries.id,
      classId: gradeEntries.classId,
      subjectId: gradeEntries.subjectId,
      subjectName: schoolSubjects.name,
      teacherId: gradeEntries.teacherId,
      value: gradeEntries.value,
      weight: gradeEntries.weight,
      type: gradeEntries.type,
      title: gradeEntries.title,
      gradedAt: gradeEntries.gradedAt,
    })
    .from(gradeEntries)
    .innerJoin(schoolSubjects, eq(gradeEntries.subjectId, schoolSubjects.id))
    .where(
      and(
        eq(gradeEntries.tenantId, user.tenantId),
        eq(gradeEntries.studentId, studentId),
        eq(gradeEntries.termId, termId)
      )
    )
    .orderBy(asc(schoolSubjects.name), asc(gradeEntries.gradedAt))
    .limit(200);

  const gradesList = Array.isArray(rawGrades) ? rawGrades : (rawGrades as unknown as { rows: typeof rawGrades }).rows ?? rawGrades;

  // Obținem clasa elevului (prima clasă activă găsită pentru termenul dat)
  const classIds = [...new Set(gradesList.map((g) => g.classId))];
  let className = "Necunoscut";
  if (classIds.length > 0) {
    const [cls] = await db
      .select()
      .from(schoolClasses)
      .where(eq(schoolClasses.id, classIds[0]));
    if (cls) className = cls.name;
  }

  // Obținem profesorii unici
  const teacherIds = [...new Set(gradesList.map((g) => g.teacherId).filter(Boolean))] as string[];
  const teacherMap = new Map<string, string>();
  if (teacherIds.length > 0) {
    const teacherRows = await db
      .select({ id: teachers.id, name: teachers.name })
      .from(teachers)
      .where(eq(teachers.tenantId, user.tenantId));
    const tList = Array.isArray(teacherRows) ? teacherRows : (teacherRows as unknown as { rows: typeof teacherRows }).rows ?? teacherRows;
    for (const t of tList) {
      teacherMap.set(t.id, t.name);
    }
  }

  const entries = gradesList.map((g) => ({
    subjectId: g.subjectId,
    subjectName: g.subjectName,
    teacherName: g.teacherId ? (teacherMap.get(g.teacherId) ?? null) : null,
    title: g.title ?? null,
    value: Number(g.value),
    weight: Number(g.weight),
    type: g.type,
    gradedAt: String(g.gradedAt),
  }));

  const reportCard = buildReportCardData({
    studentId: student.id,
    studentName: student.name,
    className,
    termName: term.name,
    entries,
  });

  return c.json({ reportCard });
});

// Student grades (toate notele unui elev, opțional filtrat pe termen)
gradesRoutes.get("/grades/student/:studentId", async (c) => {
  const user = c.get("user");
  const { studentId } = c.req.param();
  const termId = c.req.query("termId");

  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));

  if (!student) return c.json({ error: "student_not_found" }, 404);

  const conditions = [
    eq(gradeEntries.tenantId, user.tenantId),
    eq(gradeEntries.studentId, studentId),
  ];
  if (termId) conditions.push(eq(gradeEntries.termId, termId));

  const rawGrades = await db
    .select({
      id: gradeEntries.id,
      classId: gradeEntries.classId,
      subjectId: gradeEntries.subjectId,
      subjectName: schoolSubjects.name,
      termId: gradeEntries.termId,
      value: gradeEntries.value,
      weight: gradeEntries.weight,
      type: gradeEntries.type,
      title: gradeEntries.title,
      gradedAt: gradeEntries.gradedAt,
    })
    .from(gradeEntries)
    .innerJoin(schoolSubjects, eq(gradeEntries.subjectId, schoolSubjects.id))
    .where(and(...conditions))
    .orderBy(asc(gradeEntries.termId), asc(schoolSubjects.name), asc(gradeEntries.gradedAt))
    .limit(100);

  const list = Array.isArray(rawGrades) ? rawGrades : (rawGrades as unknown as { rows: typeof rawGrades }).rows ?? rawGrades;

  // Calculăm media per materie
  const bySubject = new Map<string, { name: string; inputs: { value: number | null; weight: number }[] }>();
  for (const g of list) {
    if (!bySubject.has(g.subjectId)) {
      bySubject.set(g.subjectId, { name: g.subjectName, inputs: [] });
    }
    bySubject.get(g.subjectId)!.inputs.push({ value: Number(g.value), weight: Number(g.weight) });
  }

  const averagePerSubject = Array.from(bySubject.entries()).map(([subjectId, s]) => ({
    subjectId,
    subjectName: s.name,
    average: weightedAverage(s.inputs),
  }));

  return c.json({ grades: list, averagePerSubject });
});

// List grades
gradesRoutes.get("/grades", async (c) => {
  const user = c.get("user");
  const classId = c.req.query("classId");
  const termId = c.req.query("termId");
  const subjectId = c.req.query("subjectId");
  const limitRaw = parseInt(c.req.query("limit") ?? "50", 10);
  const limit = Math.min(isNaN(limitRaw) ? 50 : limitRaw, 100);

  const conditions = [eq(gradeEntries.tenantId, user.tenantId)];
  if (classId) conditions.push(eq(gradeEntries.classId, classId));
  if (termId) conditions.push(eq(gradeEntries.termId, termId));
  if (subjectId) conditions.push(eq(gradeEntries.subjectId, subjectId));

  const rows = await db
    .select()
    .from(gradeEntries)
    .where(and(...conditions))
    .orderBy(desc(gradeEntries.gradedAt))
    .limit(limit);

  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return c.json({ grades: list });
});

// Create grade
gradesRoutes.post("/grades", zValidator("json", gradeSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Tenant-safe: clasa aparține tenantului
  const [cls] = await db
    .select()
    .from(schoolClasses)
    .where(and(eq(schoolClasses.id, body.classId), eq(schoolClasses.tenantId, user.tenantId)));

  if (!cls) return c.json({ error: "class_not_found" }, 404);

  const [created] = await db
    .insert(gradeEntries)
    .values({
      tenantId: user.tenantId,
      classId: body.classId,
      studentId: body.studentId,
      subjectId: body.subjectId,
      termId: body.termId,
      teacherId: body.teacherId ?? null,
      value: String(body.value),
      weight: String(body.weight),
      type: body.type,
      title: body.title ?? null,
      gradedAt: body.gradedAt,
      notes: body.notes ?? null,
    })
    .returning();

  return c.json({ grade: created }, 201);
});

// Update grade
gradesRoutes.patch("/grades/:id", zValidator("json", gradeSchema.partial()), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(gradeEntries)
    .where(and(eq(gradeEntries.id, id), eq(gradeEntries.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.value !== undefined) updateData.value = String(body.value);
  if (body.weight !== undefined) updateData.weight = String(body.weight);
  if (body.type !== undefined) updateData.type = body.type;
  if (body.title !== undefined) updateData.title = body.title;
  if (body.gradedAt !== undefined) updateData.gradedAt = body.gradedAt;
  if (body.notes !== undefined) updateData.notes = body.notes;

  const [updated] = await db
    .update(gradeEntries)
    .set(updateData)
    .where(eq(gradeEntries.id, id))
    .returning();

  return c.json({ grade: updated });
});

// Delete grade
gradesRoutes.delete("/grades/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(gradeEntries)
    .where(and(eq(gradeEntries.id, id), eq(gradeEntries.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(gradeEntries).where(eq(gradeEntries.id, id));
  return c.json({ ok: true });
});
