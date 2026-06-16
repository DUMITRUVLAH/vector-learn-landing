/**
 * SCHOOL-007 — API portal părinte (read-only)
 *
 * Toate rutele cer rol `parent`. Un utilizator cu alt rol primește 403.
 *
 * Routes:
 *   GET /api/parent/children
 *   GET /api/parent/children/:studentId/grades?termId=
 *   GET /api/parent/children/:studentId/attendance?termId=
 *   GET /api/parent/children/:studentId/tuition
 *   GET /api/parent/news
 *
 *   POST /api/school/news    (rol admin/manager — creare știre)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, lte, isNotNull, desc, asc } from "drizzle-orm";
import { db } from "../db/client";
import {
  students,
  families,
  gradeEntries,
  schoolSubjects,
  attendanceSessions,
  attendanceRecords,
  studentTuition,
  tuitionPlans,
  tuitionInstallments,
  schoolNewsPosts,
  users,
  classEnrollments,
  schoolClasses,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

/** Router strict pentru role=parent: toate rutele returnează 403 dacă nu e parent */
export const parentPortalRoutes = new Hono<{ Variables: AuthVariables }>(); // mount-exempt: CRM school module, not used in FinDesk

parentPortalRoutes.use("*", requireAuth);
parentPortalRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (user.role !== "parent") {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
});

/** Router pentru admin/manager — creare știri */
export const schoolNewsAdminRoutes = new Hono<{ Variables: AuthVariables }>(); // mount-exempt: CRM school module, not used in FinDesk
schoolNewsAdminRoutes.use("*", requireAuth);

// ─── Helper: găsește toți elevii familiei părintelui logat ────────────────────

async function getParentStudents(userEmail: string, tenantId: string) {
  // Un parent e asociat cu familia prin payerEmail === user.email
  // Schema: families.payerEmail → students.familyId
  const familyRows = await db
    .select()
    .from(families)
    .where(and(eq(families.payerEmail, userEmail), eq(families.tenantId, tenantId)));

  const fams = Array.isArray(familyRows)
    ? familyRows
    : (familyRows as unknown as { rows: typeof familyRows }).rows ?? familyRows;

  if (fams.length === 0) return [];

  const familyIds = fams.map((f) => f.id);

  // Selectăm toți elevii din aceste familii
  const allStudents: (typeof students.$inferSelect)[] = [];
  for (const familyId of familyIds) {
    const rows = await db
      .select()
      .from(students)
      .where(and(eq(students.familyId, familyId), eq(students.tenantId, tenantId)));

    const s = Array.isArray(rows)
      ? rows
      : (rows as unknown as { rows: typeof rows }).rows ?? rows;

    allStudents.push(...s);
  }

  return allStudents;
}

// ─── GET /api/parent/children ─────────────────────────────────────────────────

parentPortalRoutes.get("/children", async (c) => {
  const user = c.get("user");

  const parentStudents = await getParentStudents(user.email, user.tenantId);

  // Îmbogățim cu clasa curentă (prima înscriere activă)
  const enriched = await Promise.all(
    parentStudents.map(async (student) => {
      const enrollRows = await db
        .select({
          classId: classEnrollments.classId,
          className: schoolClasses.name,
        })
        .from(classEnrollments)
        .leftJoin(schoolClasses, eq(classEnrollments.classId, schoolClasses.id))
        .where(
          and(
            eq(classEnrollments.studentId, student.id),
            eq(classEnrollments.status, "active")
          )
        )
        .limit(1);

      const enrolls = Array.isArray(enrollRows)
        ? enrollRows
        : (enrollRows as unknown as { rows: typeof enrollRows }).rows ?? enrollRows;

      return {
        id: student.id,
        fullName: student.fullName,
        classId: enrolls[0]?.classId ?? null,
        className: enrolls[0]?.className ?? null,
      };
    })
  );

  return c.json({ children: enriched });
});

// ─── Helper: verifică că studentul aparține familiei părintelui ───────────────

async function parentOwnsStudent(
  userEmail: string,
  tenantId: string,
  studentId: string
): Promise<boolean> {
  const parentStudents = await getParentStudents(userEmail, tenantId);
  return parentStudents.some((s) => s.id === studentId);
}

// ─── GET /api/parent/children/:studentId/grades ───────────────────────────────

parentPortalRoutes.get("/children/:studentId/grades", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");
  const termId = c.req.query("termId");

  const owns = await parentOwnsStudent(user.email, user.tenantId, studentId);
  if (!owns) return c.json({ error: "forbidden" }, 403);

  const conditions = [
    eq(gradeEntries.studentId, studentId),
    eq(gradeEntries.tenantId, user.tenantId),
  ];
  if (termId) conditions.push(eq(gradeEntries.termId, termId));

  const rows = await db
    .select({
      id: gradeEntries.id,
      subjectId: gradeEntries.subjectId,
      subjectName: schoolSubjects.name,
      value: gradeEntries.value,
      weight: gradeEntries.weight,
      type: gradeEntries.type,
      title: gradeEntries.title,
      gradedAt: gradeEntries.gradedAt,
      notes: gradeEntries.notes,
      termId: gradeEntries.termId,
    })
    .from(gradeEntries)
    .leftJoin(schoolSubjects, eq(gradeEntries.subjectId, schoolSubjects.id))
    .where(and(...conditions))
    .orderBy(asc(gradeEntries.gradedAt));

  const grades = Array.isArray(rows)
    ? rows
    : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  return c.json({ grades });
});

// ─── GET /api/parent/children/:studentId/attendance ──────────────────────────

parentPortalRoutes.get("/children/:studentId/attendance", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");

  const owns = await parentOwnsStudent(user.email, user.tenantId, studentId);
  if (!owns) return c.json({ error: "forbidden" }, 403);

  const rows = await db
    .select({
      id: attendanceRecords.id,
      date: attendanceSessions.date,
      status: attendanceRecords.status,
      reason: attendanceRecords.reason,
    })
    .from(attendanceRecords)
    .leftJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .where(
      and(
        eq(attendanceRecords.studentId, studentId),
        eq(attendanceRecords.tenantId, user.tenantId)
      )
    )
    .orderBy(desc(attendanceSessions.date));

  const attendance = Array.isArray(rows)
    ? rows
    : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  return c.json({ attendance });
});

// ─── GET /api/parent/children/:studentId/tuition ─────────────────────────────

parentPortalRoutes.get("/children/:studentId/tuition", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");

  const owns = await parentOwnsStudent(user.email, user.tenantId, studentId);
  if (!owns) return c.json({ error: "forbidden" }, 403);

  // Obținem planul de taxe activ al elevului
  const tuitionRows = await db
    .select({
      id: studentTuition.id,
      planId: studentTuition.planId,
      planName: tuitionPlans.name,
      amountCents: tuitionPlans.amountCents,
      currency: tuitionPlans.currency,
      billingCycle: tuitionPlans.billingCycle,
      siblingRank: studentTuition.siblingRank,
      scholarshipAmountCents: studentTuition.scholarshipAmountCents,
      scholarshipPercent: studentTuition.scholarshipPercent,
    })
    .from(studentTuition)
    .leftJoin(tuitionPlans, eq(studentTuition.planId, tuitionPlans.id))
    .where(
      and(eq(studentTuition.studentId, studentId), eq(studentTuition.tenantId, user.tenantId))
    )
    .limit(1);

  const tuitionList = Array.isArray(tuitionRows)
    ? tuitionRows
    : (tuitionRows as unknown as { rows: typeof tuitionRows }).rows ?? tuitionRows;

  const plan = tuitionList[0] ?? null;

  // Ratele planului
  let installments: (typeof tuitionInstallments.$inferSelect)[] = [];
  if (plan) {
    const instRows = await db
      .select()
      .from(tuitionInstallments)
      .where(eq(tuitionInstallments.planId, plan.planId))
      .orderBy(asc(tuitionInstallments.orderIndex));

    installments = Array.isArray(instRows)
      ? instRows
      : (instRows as unknown as { rows: typeof instRows }).rows ?? instRows;
  }

  return c.json({ plan, installments });
});

// ─── GET /api/parent/news ─────────────────────────────────────────────────────

parentPortalRoutes.get("/news", async (c) => {
  const user = c.get("user");
  const now = new Date();

  const rows = await db
    .select({
      id: schoolNewsPosts.id,
      title: schoolNewsPosts.title,
      body: schoolNewsPosts.body,
      publishedAt: schoolNewsPosts.publishedAt,
      authorName: users.name,
    })
    .from(schoolNewsPosts)
    .leftJoin(users, eq(schoolNewsPosts.authorId, users.id))
    .where(
      and(
        eq(schoolNewsPosts.tenantId, user.tenantId),
        isNotNull(schoolNewsPosts.publishedAt),
        lte(schoolNewsPosts.publishedAt, now)
      )
    )
    .orderBy(desc(schoolNewsPosts.publishedAt))
    .limit(20);

  const news = Array.isArray(rows)
    ? rows
    : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  return c.json({ news });
});

// ─── POST /api/school/news (admin/manager) ────────────────────────────────────

const newsSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  publishedAt: z.string().datetime().nullable().optional(),
});

// POST /api/school/news (admin/manager): montat pe schoolNewsAdminRoutes
schoolNewsAdminRoutes.post("/", zValidator("json", newsSchema), async (c) => {
  const user = c.get("user");

  if (!["admin", "manager"].includes(user.role)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = c.req.valid("json");

  const [created] = await db
    .insert(schoolNewsPosts)
    .values({
      tenantId: user.tenantId,
      title: body.title,
      body: body.body,
      publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
      authorId: user.id,
    })
    .returning();

  return c.json({ newsPost: created }, 201);
});
