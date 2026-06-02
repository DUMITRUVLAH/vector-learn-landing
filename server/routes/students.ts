import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  students,
  payments,
  lessons,
  studentLessons,
  leads,
  users,
  teachers,
  courses,
  studentNotes,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

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
  const tenantId = c.get("user").tenantId;

  const conditions = [eq(students.tenantId, tenantId)];
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

// STU-201: GET /:id/payments — payment history for a student
studentRoutes.get("/:id/payments", async (c) => {
  const studentId = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  // Verify student belongs to this tenant
  const student = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!student) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      currency: payments.currency,
      status: payments.status,
      dueDate: payments.dueDate,
      paidAt: payments.paidAt,
      description: payments.description,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.studentId, studentId)))
    .orderBy(desc(payments.createdAt));

  const totalPaidCents = rows
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + r.amountCents, 0);

  return c.json({ items: rows, totalPaidCents });
});

// STU-201: GET /:id/lessons — lesson attendance history for a student
studentRoutes.get("/:id/lessons", async (c) => {
  const studentId = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  // Verify student belongs to this tenant
  const student = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!student) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select({
      id: lessons.id,
      scheduledAt: lessons.scheduledAt,
      durationMinutes: lessons.durationMinutes,
      status: lessons.status,
      attendanceStatus: studentLessons.attendanceStatus,
      courseName: courses.name,
      teacherUserId: teachers.userId,
    })
    .from(studentLessons)
    .innerJoin(lessons, eq(studentLessons.lessonId, lessons.id))
    .innerJoin(courses, eq(lessons.courseId, courses.id))
    .innerJoin(teachers, eq(lessons.teacherId, teachers.id))
    .where(and(eq(studentLessons.tenantId, tenantId), eq(studentLessons.studentId, studentId)))
    .orderBy(desc(lessons.scheduledAt))
    .limit(60);

  // Get teacher names using a subquery join approach (avoids IN with dynamic UUIDs)
  const teacherUserIdSet = new Set(rows.map((r) => r.teacherUserId));
  const teacherUsers: { id: string; name: string }[] = [];
  for (const uid of teacherUserIdSet) {
    const u = await db.query.users.findFirst({
      where: and(eq(users.id, uid), eq(users.tenantId, tenantId)),
      columns: { id: true, name: true },
    });
    if (u) teacherUsers.push(u);
  }

  const teacherMap = new Map(teacherUsers.map((u) => [u.id, u.name]));

  const items = rows.map((r) => ({
    id: r.id,
    scheduledAt: r.scheduledAt,
    durationMinutes: r.durationMinutes,
    lessonStatus: r.status,
    attendanceStatus: r.attendanceStatus,
    courseName: r.courseName,
    teacherName: teacherMap.get(r.teacherUserId) ?? "—",
  }));

  return c.json({ items });
});

// STU-201: GET /:id/origin-lead — find the lead that was converted to this student
studentRoutes.get("/:id/origin-lead", async (c) => {
  const studentId = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  // Verify student belongs to this tenant
  const student = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!student) return c.json({ error: "not_found" }, 404);

  const lead = await db.query.leads.findFirst({
    where: and(
      eq(leads.tenantId, tenantId),
      eq(leads.convertedToStudentId, studentId)
    ),
    columns: { id: true, fullName: true, phone: true, email: true },
  });

  return c.json({ lead: lead ?? null });
});

// ─── STU-202: Student notes CRUD ─────────────────────────────────────────────

const createNoteSchema = z.object({
  body: z.string().min(1).max(5000),
  noteType: z.enum(["general", "pedagogical", "parent_comm"]).default("general"),
});

// POST /:id/notes — create a note
studentRoutes.post("/:id/notes", zValidator("json", createNoteSchema), async (c) => {
  const studentId = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const { body, noteType } = c.req.valid("json");
  const authUser = c.get("user");

  const student = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!student) return c.json({ error: "not_found" }, 404);

  const [note] = await db
    .insert(studentNotes)
    .values({
      tenantId,
      studentId,
      authorId: authUser.id,
      authorName: authUser.name ?? authUser.email ?? "Anonim",
      body,
      noteType,
    })
    .returning();

  return c.json(note, 201);
});

// GET /:id/notes — list notes for a student
studentRoutes.get("/:id/notes", async (c) => {
  const studentId = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const student = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.tenantId, tenantId)),
    columns: { id: true },
  });
  if (!student) return c.json({ error: "not_found" }, 404);

  const notes = await db
    .select()
    .from(studentNotes)
    .where(and(eq(studentNotes.tenantId, tenantId), eq(studentNotes.studentId, studentId)))
    .orderBy(desc(studentNotes.createdAt))
    .limit(50);

  return c.json({ items: notes });
});

// DELETE /:id/notes/:noteId — delete a note (own note or admin/manager)
studentRoutes.delete("/:id/notes/:noteId", async (c) => {
  const studentId = c.req.param("id");
  const noteId = c.req.param("noteId");
  const tenantId = c.get("user").tenantId;
  const authUser = c.get("user");

  const note = await db.query.studentNotes.findFirst({
    where: and(
      eq(studentNotes.id, noteId),
      eq(studentNotes.tenantId, tenantId),
      eq(studentNotes.studentId, studentId)
    ),
  });
  if (!note) return c.json({ error: "not_found" }, 404);

  // Only the author or admin/manager can delete
  const canDelete =
    note.authorId === authUser.id ||
    authUser.role === "admin" ||
    authUser.role === "manager";

  if (!canDelete) return c.json({ error: "forbidden" }, 403);

  await db.delete(studentNotes).where(eq(studentNotes.id, noteId));
  return c.json({ ok: true });
});
