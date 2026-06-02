import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { normalizePhone, normalizeEmail } from "../lib/normalize";
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
import { getBranchScope } from "../middleware/branchScope";

const studentBaseSchema = z.object({
  fullName: z.string().min(2).max(200),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  parentPhone: z.string().max(32).optional().nullable(),
  parentEmail: z.string().email().max(255).optional().nullable().or(z.literal("")),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")),
  status: z.enum(["active", "trial", "paused", "archived"]).optional(),
  notes: z.string().max(1000).optional().nullable(),
  /** GAP-001: Preferred schedule */
  preferredDays: z.array(z.number().int().min(1).max(7)).optional().nullable(),
  preferredTimeStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  preferredTimeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
});

const createStudentSchema = studentBaseSchema;
const updateStudentSchema = studentBaseSchema.partial();

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["active", "trial", "paused", "archived", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  /** BRANCH-702: optional filter by branch UUID */
  branch_id: z.string().uuid().optional(),
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
  const { search, status, limit, offset, branch_id } = c.req.valid("query");
  const currentUser = c.get("user");
  const tenantId = currentUser.tenantId;

  // BRANCH-703: restrict to user's branch if branchScope is set
  const conditions = [eq(students.tenantId, tenantId)];
  // BRANCH-702: branch_manager sees only their branch's students
  if (currentUser.branchScope) {
    conditions.push(eq(students.branchId, currentUser.branchScope));
  }
  if (status !== "all") {
    conditions.push(eq(students.status, status));
  }
  // BRANCH-703: server-side branch scope enforcement (takes priority over client filter)
  const scope = getBranchScope(c);
  if (scope) {
    conditions.push(eq(students.branchId, scope));
  } else if (branch_id) {
    // BRANCH-702: optional client-side branch filter (only when user has full access)
    conditions.push(eq(students.branchId, branch_id));
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

// ─── STU-205: Duplicate detection ────────────────────────────────────────────

const checkDuplicateQuerySchema = z.object({
  phone: z.string().optional(),
  fullName: z.string().optional(),
});

/** STU-205: GET /api/students/check-duplicate — live duplicate check */
studentRoutes.get("/check-duplicate", zValidator("query", checkDuplicateQuerySchema), async (c) => {
  const { phone, fullName } = c.req.valid("query");
  const tenantId = c.get("user").tenantId;

  if (!phone && !fullName) {
    return c.json({ matches: [] });
  }

  const results: Array<{ id: string; fullName: string; phone: string | null; email: string | null; status: string }> = [];

  if (phone && phone.trim().length > 0) {
    // Normalize: strip non-digits, take last 9
    const phoneNorm = normalizePhone(phone.trim());
    if (phoneNorm) {
      const last9 = phoneNorm.replace(/\D/g, "").slice(-9);
      const rows = await db
        .select({ id: students.id, fullName: students.fullName, phone: students.phone, email: students.email, status: students.status })
        .from(students)
        .where(and(
          eq(students.tenantId, tenantId),
          sql`regexp_replace(${students.phone}, '[^0-9]', '', 'g') LIKE ${"%" + last9}`
        ))
        .limit(5);
      results.push(...rows);
    }
  } else if (fullName && fullName.trim().length >= 3) {
    // Fuzzy ILIKE search
    const q = `%${fullName.trim()}%`;
    const rows = await db
      .select({ id: students.id, fullName: students.fullName, phone: students.phone, email: students.email, status: students.status })
      .from(students)
      .where(and(eq(students.tenantId, tenantId), ilike(students.fullName, q)))
      .limit(5);
    results.push(...rows);
  }

  return c.json({ matches: results });
});

// ─── STU-204: CSV export ──────────────────────────────────────────────────────

const exportQuerySchema = z.object({
  status: z.enum(["active", "trial", "paused", "archived", "all"]).default("all"),
  search: z.string().optional(),
});

/** STU-204: GET /api/students/export — streaming CSV download */
studentRoutes.get("/export", zValidator("query", exportQuerySchema), async (c) => {
  const { status, search } = c.req.valid("query");
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

  const rows = await db
    .select({
      fullName: students.fullName,
      email: students.email,
      phone: students.phone,
      parentPhone: students.parentPhone,
      parentEmail: students.parentEmail,
      status: students.status,
      createdAt: students.createdAt,
    })
    .from(students)
    .where(and(...conditions))
    .orderBy(desc(students.createdAt))
    .limit(5000);

  const TRUNCATE_LIMIT = 5000;
  const truncated = rows.length >= TRUNCATE_LIMIT;

  // Build CSV manually — no new dependencies
  const header = ["Nume complet", "Email", "Telefon", "Email Parinte", "Telefon Parinte", "Status", "Data inscrierii"];
  const csvLines: string[] = [header.join(",")];
  for (const r of rows) {
    const line = [
      csvEscape(r.fullName),
      csvEscape(r.email ?? ""),
      csvEscape(r.phone ?? ""),
      csvEscape(r.parentEmail ?? ""),
      csvEscape(r.parentPhone ?? ""),
      csvEscape(r.status),
      csvEscape(r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : ""),
    ].join(",");
    csvLines.push(line);
  }

  const csvBody = csvLines.join("\r\n");
  const dateStr = new Date().toISOString().slice(0, 10);

  const headers: Record<string, string> = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="elevi-${dateStr}.csv"`,
  };
  if (truncated) {
    headers["X-Truncated"] = "true";
  }

  return new Response("﻿" + csvBody, { status: 200, headers });
});

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// ─── STU-203: CSV/Excel import ────────────────────────────────────────────────

const importRowSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  parentName: z.string().max(200).optional().nullable(),
  parentPhone: z.string().max(32).optional().nullable(),
  parentEmail: z.string().max(255).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const previewSchema = z.object({
  rows: z.array(importRowSchema).max(200),
});

const commitSchema = z.object({
  rows: z.array(importRowSchema).max(200),
});

/** STU-203: POST /api/students/import/preview — dry-run with dedup */
studentRoutes.post("/import/preview", zValidator("json", previewSchema), async (c) => {
  const { rows } = c.req.valid("json");
  const tenantId = c.get("user").tenantId;

  const preview: Array<{
    row: number;
    fullName: string;
    phone: string | null;
    status: "new" | "duplicate" | "error";
    error: string | null;
  }> = [];

  let newCount = 0;
  let dupCount = 0;
  let errCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.fullName?.trim()) {
      preview.push({ row: i + 1, fullName: "", phone: null, status: "error", error: "Lipsește numele" });
      errCount++;
      continue;
    }

    const phoneNorm = normalizePhone(row.phone ?? null);
    const emailNorm = normalizeEmail(row.email ?? null);

    // Dedup by normalized phone or email using SQL normalization
    // We store phone as-is, so we normalize both the input and the DB value for comparison
    let isDuplicate = false;
    if (phoneNorm || emailNorm) {
      // For phone: use SQL regex to strip non-digits and compare last 9 digits
      const phoneMatch = phoneNorm
        ? await db.query.students.findFirst({
            where: and(
              eq(students.tenantId, tenantId),
              sql`regexp_replace(${students.phone}, '[^0-9]', '', 'g') LIKE ${`%${phoneNorm.replace(/\D/g, "").slice(-9)}`}`
            ),
            columns: { id: true },
          })
        : null;

      if (phoneMatch) {
        isDuplicate = true;
      } else if (emailNorm) {
        const emailMatch = await db.query.students.findFirst({
          where: and(
            eq(students.tenantId, tenantId),
            sql`lower(trim(${students.email})) = ${emailNorm}`
          ),
          columns: { id: true },
        });
        if (emailMatch) isDuplicate = true;
      }
    }

    if (isDuplicate) {
      preview.push({ row: i + 1, fullName: row.fullName, phone: row.phone ?? null, status: "duplicate", error: null });
      dupCount++;
    } else {
      preview.push({ row: i + 1, fullName: row.fullName, phone: row.phone ?? null, status: "new", error: null });
      newCount++;
    }
  }

  return c.json({
    preview,
    summary: { total: rows.length, new: newCount, duplicates: dupCount, errors: errCount },
  });
});

/** STU-203: POST /api/students/import/commit — bulk insert new students */
studentRoutes.post("/import/commit", zValidator("json", commitSchema), async (c) => {
  const { rows } = c.req.valid("json");
  const tenantId = c.get("user").tenantId;

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.fullName?.trim()) { skipped++; continue; }

    const phoneNorm = normalizePhone(row.phone ?? null);
    const emailNorm = normalizeEmail(row.email ?? null);

    // Re-check dedup at commit time (phone normalization via SQL)
    if (phoneNorm) {
      const existing = await db.query.students.findFirst({
        where: and(
          eq(students.tenantId, tenantId),
          sql`regexp_replace(${students.phone}, '[^0-9]', '', 'g') LIKE ${`%${phoneNorm.replace(/\D/g, "").slice(-9)}`}`
        ),
        columns: { id: true },
      });
      if (existing) { skipped++; continue; }
    }

    await db.insert(students).values({
      tenantId,
      fullName: row.fullName.trim(),
      phone: row.phone ?? null,
      email: row.email ?? null,
      parentPhone: row.parentPhone ?? null,
      parentEmail: row.parentEmail ?? null,
      notes: row.notes ?? null,
      status: "active",
    }).onConflictDoNothing();
    imported++;
  }

  return c.json({ imported, skipped });
});
