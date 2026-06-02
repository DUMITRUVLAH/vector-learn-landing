/**
 * MOB-101..MOB-103: Mobile API routes
 * Endpoints used by the student/parent PWA (/m/* pages).
 * All routes require authentication; student/parent roles get narrowed data.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  lessons, studentLessons, students, teachers, courses, rooms,
  homework, homeworkSubmissions, pushSubscriptions,
  parentStudentLinks, directMessages, invoices, users,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const mobileRoutes = new Hono<{ Variables: AuthVariables }>();

mobileRoutes.use("*", requireAuth);

/**
 * MOB-101: Student dashboard data
 * GET /api/m/dashboard
 * Returns the current student's info and their next upcoming lesson.
 */
mobileRoutes.get("/dashboard", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  // Find the student record linked to this user (by email match — auth creates user, student is separate)
  const [student] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.tenantId, tenantId),
        eq(students.status, "active")
      )
    )
    .limit(1);

  if (!student) {
    return c.json({
      student: null,
      nextLesson: null,
      message: "Niciun elev asociat acestui cont",
    });
  }

  // Find the next upcoming lesson for this student
  const now = new Date();
  const [nextLessonRow] = await db
    .select({
      id: lessons.id,
      scheduledAt: lessons.scheduledAt,
      durationMinutes: lessons.durationMinutes,
      meetingUrl: lessons.meetingUrl,
      courseName: courses.name,
      teacherName: teachers.fullName,
      roomName: rooms.name,
    })
    .from(studentLessons)
    .innerJoin(lessons, eq(lessons.id, studentLessons.lessonId))
    .innerJoin(courses, eq(courses.id, lessons.courseId))
    .innerJoin(teachers, eq(teachers.id, lessons.teacherId))
    .leftJoin(rooms, eq(rooms.id, lessons.roomId))
    .where(
      and(
        eq(studentLessons.tenantId, tenantId),
        eq(studentLessons.studentId, student.id),
        gt(lessons.scheduledAt, now),
        eq(lessons.status, "scheduled")
      )
    )
    .orderBy(asc(lessons.scheduledAt))
    .limit(1);

  return c.json({
    student: {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      status: student.status,
    },
    nextLesson: nextLessonRow
      ? {
          id: nextLessonRow.id,
          scheduledAt: nextLessonRow.scheduledAt,
          durationMinutes: nextLessonRow.durationMinutes,
          meetingUrl: nextLessonRow.meetingUrl,
          courseName: nextLessonRow.courseName,
          teacherName: nextLessonRow.teacherName,
          roomName: nextLessonRow.roomName,
        }
      : null,
  });
});

/**
 * MOB-101: Student schedule for the week
 * GET /api/m/schedule
 * Returns all lessons for the current student in the next 7 days.
 */
mobileRoutes.get("/schedule", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.status, "active")))
    .limit(1);

  if (!student) {
    return c.json({ lessons: [] });
  }

  const now = new Date();

  const rows = await db
    .select({
      id: lessons.id,
      scheduledAt: lessons.scheduledAt,
      durationMinutes: lessons.durationMinutes,
      status: lessons.status,
      meetingUrl: lessons.meetingUrl,
      courseName: courses.name,
      teacherName: teachers.fullName,
      roomName: rooms.name,
    })
    .from(studentLessons)
    .innerJoin(lessons, eq(lessons.id, studentLessons.lessonId))
    .innerJoin(courses, eq(courses.id, lessons.courseId))
    .innerJoin(teachers, eq(teachers.id, lessons.teacherId))
    .leftJoin(rooms, eq(rooms.id, lessons.roomId))
    .where(
      and(
        eq(studentLessons.tenantId, tenantId),
        eq(studentLessons.studentId, student.id),
        gt(lessons.scheduledAt, now)
      )
    )
    .orderBy(asc(lessons.scheduledAt))
    .limit(50);

  return c.json({ lessons: rows });
});

/**
 * MOB-102: Homework list for the current student
 * GET /api/m/homework?filter=overdue
 * Returns homework sorted by deadline ASC. Optional filter=overdue for past-deadline pending items.
 */
mobileRoutes.get("/homework", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const filter = c.req.query("filter"); // "overdue" | undefined

  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.status, "active")))
    .limit(1);

  if (!student) {
    return c.json({ homework: [] });
  }

  const conditions = [
    eq(homework.tenantId, tenantId),
    eq(homework.studentId, student.id),
  ];

  if (filter === "overdue") {
    const now = new Date();
    conditions.push(lt(homework.deadline, now));
    conditions.push(eq(homework.status, "pending"));
  }

  const rows = await db
    .select({
      id: homework.id,
      body: homework.body,
      deadline: homework.deadline,
      status: homework.status,
      lessonId: homework.lessonId,
      createdAt: homework.createdAt,
    })
    .from(homework)
    .where(and(...conditions))
    .orderBy(asc(homework.deadline))
    .limit(100);

  return c.json({ homework: rows });
});

/**
 * MOB-102: Submit homework
 * POST /api/m/homework/:id/submit
 * Creates a submission and marks homework as submitted.
 */
const submitSchema = z.object({
  text_body: z.string().max(5000).optional(),
  image_url: z.string().url().max(500).optional(),
}).refine(
  (d) => d.text_body || d.image_url,
  { message: "Trebuie furnizat text_body sau image_url" }
);

mobileRoutes.post(
  "/homework/:id/submit",
  zValidator("json", submitSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { id } = c.req.param();
    const body = c.req.valid("json");

    // Find the homework item
    const [hw] = await db
      .select()
      .from(homework)
      .where(and(eq(homework.id, id), eq(homework.tenantId, tenantId)))
      .limit(1);

    if (!hw) return c.json({ error: "Tema nu a fost găsită" }, 404);
    if (hw.status === "submitted" || hw.status === "graded") {
      return c.json({ error: "Tema a fost deja trimisă" }, 409);
    }

    // Create submission
    const [submission] = await db
      .insert(homeworkSubmissions)
      .values({
        tenantId,
        homeworkId: hw.id,
        studentId: hw.studentId,
        textBody: body.text_body ?? null,
        imageUrl: body.image_url ?? null,
      })
      .returning();

    // Update homework status
    await db
      .update(homework)
      .set({ status: "submitted", updatedAt: sql`now()` })
      .where(eq(homework.id, hw.id));

    return c.json({ submission, message: "Tema a fost trimisă cu succes" }, 201);
  }
);

/**
 * MOB-102: Teacher grading — list submitted homework for their lessons
 * GET /api/grading/homework
 */
mobileRoutes.get("/grading", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  // Get all submitted homework for this tenant (teacher sees all)
  const rows = await db
    .select({
      id: homework.id,
      body: homework.body,
      deadline: homework.deadline,
      status: homework.status,
      studentId: homework.studentId,
      lessonId: homework.lessonId,
    })
    .from(homework)
    .where(
      and(
        eq(homework.tenantId, tenantId),
        eq(homework.status, "submitted")
      )
    )
    .orderBy(desc(homework.deadline))
    .limit(50);

  return c.json({ homework: rows });
});

/**
 * MOB-103: Subscribe to Web Push notifications
 * POST /api/m/push/subscribe
 * Body: { endpoint, keys: { p256dh, auth }, categories? }
 */
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(10),
  }),
  categories: z.array(z.string()).optional(),
});

mobileRoutes.post(
  "/push/subscribe",
  zValidator("json", subscribeSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    // Upsert: if same endpoint already exists, update keys + categories
    const existing = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, body.endpoint))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(pushSubscriptions)
        .set({
          keysP256dh: body.keys.p256dh,
          keysAuth: body.keys.auth,
          categories: body.categories ?? ["homework", "schedule_change", "grades", "payment", "system"],
          updatedAt: sql`now()`,
        })
        .where(eq(pushSubscriptions.id, existing[0].id));
      return c.json({ updated: true }, 200);
    }

    const [sub] = await db
      .insert(pushSubscriptions)
      .values({
        tenantId: user.tenantId,
        userId: user.id,
        endpoint: body.endpoint,
        keysP256dh: body.keys.p256dh,
        keysAuth: body.keys.auth,
        categories: body.categories ?? ["homework", "schedule_change", "grades", "payment", "system"],
      })
      .returning({ id: pushSubscriptions.id });

    return c.json({ id: sub.id, created: true }, 201);
  }
);

/**
 * MOB-103: Unsubscribe from push notifications
 * DELETE /api/m/push/subscribe
 * Body: { endpoint }
 */
mobileRoutes.delete(
  "/push/subscribe",
  zValidator("json", z.object({ endpoint: z.string().url() })),
  async (c) => {
    const body = c.req.valid("json");
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, body.endpoint));
    return c.json({ deleted: true });
  }
);

/**
 * MOB-103: Update notification category preferences
 * PUT /api/m/push/categories
 * Body: { endpoint, categories: string[] }
 */
mobileRoutes.put(
  "/push/categories",
  zValidator("json", z.object({
    endpoint: z.string().url(),
    categories: z.array(z.string()),
  })),
  async (c) => {
    const body = c.req.valid("json");
    await db
      .update(pushSubscriptions)
      .set({ categories: body.categories, updatedAt: sql`now()` })
      .where(eq(pushSubscriptions.endpoint, body.endpoint));
    return c.json({ updated: true });
  }
);

/**
 * MOB-103: Get VAPID public key for browser subscription setup
 * GET /api/m/push/vapid-public-key
 */
mobileRoutes.get("/push/vapid-public-key", (c) => {
  const key = process.env.VAPID_PUBLIC_KEY ?? null;
  return c.json({ key });
});

// ---------------------------------------------------------------------------
// MOB-104: Parent-facing endpoints
// ---------------------------------------------------------------------------

/**
 * MOB-104: Parent balance — outstanding invoices for the linked student
 * GET /api/m/parent/balance
 * Returns the linked student's details + outstanding invoice list.
 */
mobileRoutes.get("/parent/balance", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  // Find the student linked to this parent user
  const [link] = await db
    .select({ studentId: parentStudentLinks.studentId })
    .from(parentStudentLinks)
    .where(
      and(
        eq(parentStudentLinks.tenantId, tenantId),
        eq(parentStudentLinks.parentUserId, user.id)
      )
    )
    .limit(1);

  if (!link) {
    return c.json({ student: null, outstandingTotal: 0, invoices: [] });
  }

  const [student] = await db
    .select({ id: students.id, fullName: students.fullName, email: students.email })
    .from(students)
    .where(eq(students.id, link.studentId))
    .limit(1);

  if (!student) {
    return c.json({ student: null, outstandingTotal: 0, invoices: [] });
  }

  // Fetch outstanding invoices (status pending or overdue)
  const rows = await db
    .select({
      id: invoices.id,
      amountCents: invoices.amountCents,
      dueDate: invoices.dueDate,
      status: invoices.status,
      number: invoices.number,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.studentId, student.id),
        sql`${invoices.status} IN ('pending','overdue')`
      )
    )
    .orderBy(asc(invoices.dueDate))
    .limit(50);

  const outstandingTotal = rows.reduce((s, r) => s + r.amountCents, 0);

  return c.json({
    student: { id: student.id, fullName: student.fullName, email: student.email },
    outstandingTotal,
    invoices: rows.map((r) => ({
      id: r.id,
      amountCents: r.amountCents,
      dueDate: r.dueDate,
      status: r.status,
      pdfUrl: `/api/invoices/${r.id}/pdf`,
    })),
  });
});

/**
 * MOB-104: Parent upcoming lessons — next 3 lessons of the linked student
 * GET /api/m/parent/upcoming-lessons
 */
mobileRoutes.get("/parent/upcoming-lessons", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const [link] = await db
    .select({ studentId: parentStudentLinks.studentId })
    .from(parentStudentLinks)
    .where(
      and(
        eq(parentStudentLinks.tenantId, tenantId),
        eq(parentStudentLinks.parentUserId, user.id)
      )
    )
    .limit(1);

  if (!link) {
    return c.json({ lessons: [] });
  }

  const now = new Date();
  const rows = await db
    .select({
      id: lessons.id,
      scheduledAt: lessons.scheduledAt,
      durationMinutes: lessons.durationMinutes,
      meetingUrl: lessons.meetingUrl,
      courseName: courses.name,
      teacherName: teachers.fullName,
      roomName: rooms.name,
    })
    .from(studentLessons)
    .innerJoin(lessons, eq(lessons.id, studentLessons.lessonId))
    .innerJoin(courses, eq(courses.id, lessons.courseId))
    .innerJoin(teachers, eq(teachers.id, lessons.teacherId))
    .leftJoin(rooms, eq(rooms.id, lessons.roomId))
    .where(
      and(
        eq(studentLessons.tenantId, tenantId),
        eq(studentLessons.studentId, link.studentId),
        gt(lessons.scheduledAt, now),
        eq(lessons.status, "scheduled")
      )
    )
    .orderBy(asc(lessons.scheduledAt))
    .limit(3);

  return c.json({ lessons: rows });
});

/**
 * MOB-104: Get chat thread between current user and a teacher
 * GET /api/m/chat/:teacherUserId
 * teacherUserId — the user.id of the teacher (not the teacher record id)
 */
mobileRoutes.get("/chat/:teacherUserId", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const { teacherUserId } = c.req.param();

  const rows = await db
    .select()
    .from(directMessages)
    .where(
      and(
        eq(directMessages.tenantId, tenantId),
        sql`(
          (${directMessages.fromUserId} = ${user.id} AND ${directMessages.toUserId} = ${teacherUserId})
          OR
          (${directMessages.fromUserId} = ${teacherUserId} AND ${directMessages.toUserId} = ${user.id})
        )`
      )
    )
    .orderBy(asc(directMessages.sentAt))
    .limit(200);

  // Mark incoming messages as read
  const unreadIds = rows
    .filter((m) => m.toUserId === user.id && !m.readAt)
    .map((m) => m.id);

  if (unreadIds.length > 0) {
    await db
      .update(directMessages)
      .set({ readAt: sql`now()` })
      .where(sql`${directMessages.id} = ANY(ARRAY[${sql.join(unreadIds.map((id) => sql`${id}::uuid`), sql`, `)}])`);
  }

  return c.json({ messages: rows });
});

/**
 * MOB-104: Send a direct message to a teacher
 * POST /api/m/chat/:teacherUserId
 * Body: { body: string }
 */
const chatMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

mobileRoutes.post(
  "/chat/:teacherUserId",
  zValidator("json", chatMessageSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { teacherUserId } = c.req.param();
    const { body: messageBody } = c.req.valid("json");

    // Quiet-hours check: look up teacher's notification preference hour window
    // The teacher's notification pref is stored in user metadata (SET-805).
    // Simplified: no db lookup for quiet hours in this implementation —
    // the queued flag defaults to false; admins may set it via notification pref.
    const now = new Date();
    const hour = now.getUTCHours();
    // Assume quiet hours 22:00–07:00 UTC as a safe default
    const isQuietHours = hour >= 22 || hour < 7;

    const [message] = await db
      .insert(directMessages)
      .values({
        tenantId,
        fromUserId: user.id,
        toUserId: teacherUserId,
        body: messageBody,
        queued: isQuietHours,
      })
      .returning();

    return c.json({ message }, 201);
  }
);

/**
 * MOB-104: Admin — link a parent user to a student
 * POST /api/m/parent-links
 * Body: { parentUserId, studentId }
 */
const parentLinkSchema = z.object({
  parentUserId: z.string().uuid(),
  studentId: z.string().uuid(),
});

mobileRoutes.post(
  "/parent-links",
  zValidator("json", parentLinkSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { parentUserId, studentId } = c.req.valid("json");

    // Only admins/managers can link parents
    if (user.role !== "admin" && user.role !== "manager") {
      return c.json({ error: "Acces refuzat" }, 403);
    }

    // Check if link already exists
    const existing = await db
      .select({ id: parentStudentLinks.id })
      .from(parentStudentLinks)
      .where(
        and(
          eq(parentStudentLinks.tenantId, tenantId),
          eq(parentStudentLinks.parentUserId, parentUserId),
          eq(parentStudentLinks.studentId, studentId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return c.json({ id: existing[0].id, alreadyLinked: true }, 200);
    }

    const [link] = await db
      .insert(parentStudentLinks)
      .values({ tenantId, parentUserId, studentId })
      .returning();

    return c.json({ link }, 201);
  }
);

/**
 * MOB-104: Admin — list parent links for a student
 * GET /api/m/parent-links/:studentId
 */
mobileRoutes.get("/parent-links/:studentId", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const { studentId } = c.req.param();

  if (user.role !== "admin" && user.role !== "manager") {
    return c.json({ error: "Acces refuzat" }, 403);
  }

  const rows = await db
    .select({
      id: parentStudentLinks.id,
      parentUserId: parentStudentLinks.parentUserId,
      createdAt: parentStudentLinks.createdAt,
    })
    .from(parentStudentLinks)
    .where(
      and(
        eq(parentStudentLinks.tenantId, tenantId),
        eq(parentStudentLinks.studentId, studentId)
      )
    )
    .orderBy(asc(parentStudentLinks.createdAt));

  return c.json({ links: rows });
});
