/**
 * GAP-015: Homework/assignments per lesson + student submissions
 *
 * Routes:
 *   GET    /api/lessons/:lessonId/homework           — list homework for a lesson
 *   POST   /api/lessons/:lessonId/homework           — create homework for a lesson
 *   DELETE /api/lessons/:lessonId/homework/:id       — delete homework (if no submissions)
 *   POST   /api/homework/:id/submit                  — upsert submission for student
 *   GET    /api/students/:studentId/homework         — list homework for a student with status
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  lessons,
  students,
  lessonHomework,
  homeworkSubmissions,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

// ----- lesson homework routes (/api/lessons) -----
export const lessonHomeworkRoutes = new Hono<{ Variables: AuthVariables }>();
lessonHomeworkRoutes.use("*", requireAuth);

const createHomeworkSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

/** GET /api/lessons/:lessonId/homework */
lessonHomeworkRoutes.get("/:lessonId/homework", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { lessonId } = c.req.param();

  // Verify lesson belongs to tenant
  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), eq(lessons.tenantId, tenantId)),
  });
  if (!lesson) return c.json({ error: "Lesson not found" }, 404);

  const rows = await db
    .select({
      id: lessonHomework.id,
      lessonId: lessonHomework.lessonId,
      title: lessonHomework.title,
      description: lessonHomework.description,
      dueDate: lessonHomework.dueDate,
      createdAt: lessonHomework.createdAt,
      submissionCount: sql<number>`(
        SELECT count(*)::int FROM homework_submissions hs
        WHERE hs.homework_id = ${lessonHomework.id}
      )`,
    })
    .from(lessonHomework)
    .where(and(eq(lessonHomework.lessonId, lessonId), eq(lessonHomework.tenantId, tenantId)));

  return c.json(rows);
});

/** POST /api/lessons/:lessonId/homework */
lessonHomeworkRoutes.post(
  "/:lessonId/homework",
  zValidator("json", createHomeworkSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
    const { lessonId } = c.req.param();
    const body = c.req.valid("json");

    const lesson = await db.query.lessons.findFirst({
      where: and(eq(lessons.id, lessonId), eq(lessons.tenantId, tenantId)),
    });
    if (!lesson) return c.json({ error: "Lesson not found" }, 404);

    const [created] = await db
      .insert(lessonHomework)
      .values({
        tenantId,
        lessonId,
        title: body.title,
        description: body.description ?? null,
        dueDate: body.dueDate ?? null,
        createdBy: userId ?? null,
      })
      .returning();

    return c.json(created, 201);
  }
);

/** DELETE /api/lessons/:lessonId/homework/:id */
lessonHomeworkRoutes.delete("/:lessonId/homework/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { lessonId, id } = c.req.param();

  const hw = await db.query.lessonHomework.findFirst({
    where: and(
      eq(lessonHomework.id, id),
      eq(lessonHomework.lessonId, lessonId),
      eq(lessonHomework.tenantId, tenantId)
    ),
  });
  if (!hw) return c.json({ error: "Homework not found" }, 404);

  // Refuse delete if there are submissions
  const [subCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(homeworkSubmissions)
    .where(eq(homeworkSubmissions.homeworkId, id));

  if ((subCount?.c ?? 0) > 0) {
    return c.json({ error: "Cannot delete homework with existing submissions" }, 409);
  }

  await db
    .delete(lessonHomework)
    .where(and(eq(lessonHomework.id, id), eq(lessonHomework.tenantId, tenantId)));

  return c.json({ deleted: true });
});

// ----- standalone homework routes (/api/homework) -----
export const homeworkRoutes = new Hono<{ Variables: AuthVariables }>();
homeworkRoutes.use("*", requireAuth);

const submitSchema = z.object({
  studentId: z.string().uuid(),
  notes: z.string().max(2000).optional().nullable(),
});

/** POST /api/homework/:id/submit — upsert submission */
homeworkRoutes.post("/:id/submit", zValidator("json", submitSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id } = c.req.param();
  const body = c.req.valid("json");

  // Validate homework belongs to tenant
  const hw = await db.query.lessonHomework.findFirst({
    where: and(eq(lessonHomework.id, id), eq(lessonHomework.tenantId, tenantId)),
  });
  if (!hw) return c.json({ error: "Homework not found" }, 404);

  // Validate student belongs to tenant
  const student = await db.query.students.findFirst({
    where: and(eq(students.id, body.studentId), eq(students.tenantId, tenantId)),
  });
  if (!student) return c.json({ error: "Student not found" }, 404);

  // Upsert: insert or update on conflict
  const [result] = await db
    .insert(homeworkSubmissions)
    .values({
      tenantId,
      homeworkId: id,
      studentId: body.studentId,
      notes: body.notes ?? null,
      submittedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [homeworkSubmissions.homeworkId, homeworkSubmissions.studentId],
      set: {
        notes: body.notes ?? null,
        submittedAt: new Date(),
      },
    })
    .returning();

  return c.json(result, 201);
});

// ----- student homework route (/api/students) -----
export const studentHomeworkRoutes = new Hono<{ Variables: AuthVariables }>();
studentHomeworkRoutes.use("*", requireAuth);

/** GET /api/students/:studentId/homework — list homework with status per student */
studentHomeworkRoutes.get("/:studentId/homework", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { studentId } = c.req.param();

  // Verify student belongs to tenant
  const student = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.tenantId, tenantId)),
  });
  if (!student) return c.json({ error: "Student not found" }, 404);

  // Get all homework for lessons this student is enrolled in,
  // with submission status for this student
  const rows = await db
    .select({
      id: lessonHomework.id,
      lessonId: lessonHomework.lessonId,
      title: lessonHomework.title,
      description: lessonHomework.description,
      dueDate: lessonHomework.dueDate,
      createdAt: lessonHomework.createdAt,
      submittedAt: homeworkSubmissions.submittedAt,
      submissionNotes: homeworkSubmissions.notes,
    })
    .from(lessonHomework)
    .leftJoin(
      homeworkSubmissions,
      and(
        eq(homeworkSubmissions.homeworkId, lessonHomework.id),
        eq(homeworkSubmissions.studentId, studentId)
      )
    )
    .where(eq(lessonHomework.tenantId, tenantId));

  const enriched = rows.map((r) => ({
    ...r,
    status: r.submittedAt ? "submitted" : "pending",
  }));

  return c.json(enriched);
});
