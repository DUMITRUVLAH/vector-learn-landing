/**
 * SCHOOL-003 — API catalog de prezență
 *
 * GET    /api/school/attendance?classId=&date=         — sesiune + records (crează sesiunea dacă nu există)
 * POST   /api/school/attendance                        — crează/returnează sesiunea
 * PUT    /api/school/attendance/:sessionId/records     — upsert bulk records
 * GET    /api/school/attendance/student/:id?from=&to=  — istoricul elevului
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lte, asc } from "drizzle-orm";
import { db } from "../db/client";
import {
  attendanceSessions,
  attendanceRecords,
  schoolClasses,
  classEnrollments,
  students,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const attendanceRoutes = new Hono<{ Variables: AuthVariables }>();

attendanceRoutes.use("*", requireAuth);

// ─── Validators ──────────────────────────────────────────────────────────────

const sessionSchema = z.object({
  classId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  teacherId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const recordSchema = z.object({
  studentId: z.string().uuid(),
  status: z.enum(["present", "absent", "late", "excused"]),
  reason: z.string().max(300).nullable().optional(),
});

const bulkRecordsSchema = z.object({
  records: z.array(recordSchema).min(1),
});

// ─── GET /api/school/attendance ───────────────────────────────────────────────

attendanceRoutes.get("/", async (c) => {
  const user = c.get("user");
  const classId = c.req.query("classId");
  const date = c.req.query("date");

  if (!classId || !date) {
    return c.json({ error: "classId and date are required" }, 400);
  }

  // Verifică clasa
  const [cls] = await db
    .select()
    .from(schoolClasses)
    .where(and(eq(schoolClasses.id, classId), eq(schoolClasses.tenantId, user.tenantId)));

  if (!cls) return c.json({ error: "class_not_found" }, 404);

  // Găsim sau creăm sesiunea
  let session: typeof attendanceSessions.$inferSelect | undefined;

  const existingRows = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.classId, classId),
        eq(attendanceSessions.date, date),
        eq(attendanceSessions.tenantId, user.tenantId)
      )
    );
  const existing = Array.isArray(existingRows)
    ? existingRows[0]
    : (existingRows as unknown as { rows: typeof existingRows }).rows?.[0];

  if (existing) {
    session = existing;
  } else {
    // Auto-creare sesiune la GET (convenient pentru UI)
    const [created] = await db
      .insert(attendanceSessions)
      .values({ tenantId: user.tenantId, classId, date })
      .returning();
    session = created;
  }

  // Recordurile existente
  const recordsRows = await db
    .select()
    .from(attendanceRecords)
    .where(eq(attendanceRecords.sessionId, session.id))
    .orderBy(asc(attendanceRecords.studentId));

  const records = Array.isArray(recordsRows)
    ? recordsRows
    : (recordsRows as unknown as { rows: typeof recordsRows }).rows ?? recordsRows;

  // Elevii înscriși în clasă (status active)
  const enrolledRows = await db
    .select({
      studentId: classEnrollments.studentId,
      studentName: students.fullName,
    })
    .from(classEnrollments)
    .leftJoin(students, eq(classEnrollments.studentId, students.id))
    .where(
      and(
        eq(classEnrollments.classId, classId),
        eq(classEnrollments.status, "active")
      )
    )
    .orderBy(asc(students.fullName));

  const enrolled = Array.isArray(enrolledRows)
    ? enrolledRows
    : (enrolledRows as unknown as { rows: typeof enrolledRows }).rows ?? enrolledRows;

  return c.json({ session, records, enrolled });
});

// ─── POST /api/school/attendance ──────────────────────────────────────────────

attendanceRoutes.post("/", zValidator("json", sessionSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Verifică clasa
  const [cls] = await db
    .select()
    .from(schoolClasses)
    .where(and(eq(schoolClasses.id, body.classId), eq(schoolClasses.tenantId, user.tenantId)));

  if (!cls) return c.json({ error: "class_not_found" }, 404);

  // Idempotent: dacă sesiunea există deja o returnăm
  const existingRows = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.classId, body.classId),
        eq(attendanceSessions.date, body.date),
        eq(attendanceSessions.tenantId, user.tenantId)
      )
    );
  const existing = Array.isArray(existingRows)
    ? existingRows[0]
    : (existingRows as unknown as { rows: typeof existingRows }).rows?.[0];

  if (existing) {
    return c.json({ session: existing });
  }

  const [created] = await db
    .insert(attendanceSessions)
    .values({
      tenantId: user.tenantId,
      classId: body.classId,
      date: body.date,
      teacherId: body.teacherId ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  return c.json({ session: created }, 201);
});

// ─── PUT /api/school/attendance/:sessionId/records ────────────────────────────

attendanceRoutes.put(
  "/:sessionId/records",
  zValidator("json", bulkRecordsSchema),
  async (c) => {
    const user = c.get("user");
    const sessionId = c.req.param("sessionId");
    const { records: incoming } = c.req.valid("json");

    // Verifică sesiunea
    const [session] = await db
      .select()
      .from(attendanceSessions)
      .where(
        and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.tenantId, user.tenantId))
      );

    if (!session) return c.json({ error: "session_not_found" }, 404);

    // Upsert bulk: delete + insert (cel mai simplu + atomic în PGlite și Postgres)
    const studentIds = incoming.map((r) => r.studentId);

    // Ștergem recordurile pentru elevii din bulk (nu atingem pe ceilalți)
    if (studentIds.length > 0) {
      const existingRecords = await db
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.sessionId, sessionId));
      const existingArr = Array.isArray(existingRecords)
        ? existingRecords
        : (existingRecords as unknown as { rows: typeof existingRecords }).rows ?? existingRecords;

      const toDelete = existingArr
        .filter((r) => studentIds.includes(r.studentId))
        .map((r) => r.id);

      for (const id of toDelete) {
        await db.delete(attendanceRecords).where(eq(attendanceRecords.id, id));
      }
    }

    // Insert noile recorduri
    const inserted = [];
    for (const rec of incoming) {
      const [r] = await db
        .insert(attendanceRecords)
        .values({
          tenantId: user.tenantId,
          sessionId,
          studentId: rec.studentId,
          status: rec.status,
          reason: rec.reason ?? null,
        })
        .returning();
      inserted.push(r);
    }

    return c.json({ records: inserted });
  }
);

// ─── GET /api/school/attendance/student/:studentId ────────────────────────────

attendanceRoutes.get("/student/:studentId", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");
  const from = c.req.query("from");
  const to = c.req.query("to");

  // Verifică elevul
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));

  if (!student) return c.json({ error: "student_not_found" }, 404);

  // Condiții pe sesiuni
  const sessionConditions: Parameters<typeof and>[] = [
    eq(attendanceSessions.tenantId, user.tenantId),
  ];
  if (from) sessionConditions.push(gte(attendanceSessions.date, from));
  if (to) sessionConditions.push(lte(attendanceSessions.date, to));

  // Join: records → sessions pentru a filtra pe perioadă
  const rows = await db
    .select({
      recordId: attendanceRecords.id,
      sessionId: attendanceRecords.sessionId,
      status: attendanceRecords.status,
      reason: attendanceRecords.reason,
      date: attendanceSessions.date,
      classId: attendanceSessions.classId,
      updatedAt: attendanceRecords.updatedAt,
    })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .where(
      and(
        eq(attendanceRecords.studentId, studentId),
        eq(attendanceRecords.tenantId, user.tenantId),
        ...sessionConditions.map((c) => c as ReturnType<typeof and>)
      )
    )
    .orderBy(asc(attendanceSessions.date));

  const history = Array.isArray(rows)
    ? rows
    : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  const absences = history.filter((r) => r.status === "absent" || r.status === "late");
  const rate =
    history.length > 0
      ? Math.round(
          (history.filter((r) => r.status === "present" || r.status === "late").length /
            history.length) *
            100
        )
      : null;

  return c.json({ studentId, history, absenceCount: absences.length, attendanceRate: rate });
});
