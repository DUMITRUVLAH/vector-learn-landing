/**
 * SCHOOL-005 — API dosar de admitere (admissions workflow)
 *
 * Routes:
 *   GET    /api/school/admissions?yearId=&status=
 *   POST   /api/school/admissions
 *   PATCH  /api/school/admissions/:id
 *   DELETE /api/school/admissions/:id
 *
 *   GET    /api/school/admissions/:id/documents
 *   POST   /api/school/admissions/:id/documents
 *   PATCH  /api/school/admissions/:id/documents/:did
 *   DELETE /api/school/admissions/:id/documents/:did
 *
 *   POST   /api/school/admissions/:id/enroll
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  admissionApplications,
  admissionDocuments,
  academicYears,
  schoolClasses,
  classEnrollments,
  students,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { isEligibleToEnroll } from "../lib/admissions";

export const admissionsRoutes = new Hono<{ Variables: AuthVariables }>();

admissionsRoutes.use("*", requireAuth);

// ─── Validators ───────────────────────────────────────────────────────────────

const applicationSchema = z.object({
  academicYearId: z.string().uuid(),
  applicantName: z.string().min(1).max(200),
  applicantEmail: z.string().email().max(200).nullable().optional(),
  applicantPhone: z.string().max(50).nullable().optional(),
  guardianName: z.string().max(200).nullable().optional(),
  guardianPhone: z.string().max(50).nullable().optional(),
  gradeLevel: z.string().min(1).max(10),
  leadId: z.string().uuid().nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum(["draft", "submitted", "review", "accepted", "waitlisted", "rejected", "enrolled"]).optional(),
  decisionNotes: z.string().nullable().optional(),
  applicantName: z.string().min(1).max(200).optional(),
  applicantEmail: z.string().email().max(200).nullable().optional(),
  applicantPhone: z.string().max(50).nullable().optional(),
  guardianName: z.string().max(200).nullable().optional(),
  guardianPhone: z.string().max(50).nullable().optional(),
  gradeLevel: z.string().min(1).max(10).optional(),
});

const documentSchema = z.object({
  name: z.string().min(1).max(200),
  status: z.enum(["required", "received", "verified"]).default("required").optional(),
  notes: z.string().max(500).nullable().optional(),
});

const enrollSchema = z.object({
  classId: z.string().uuid().nullable().optional(),
  studentId: z.string().uuid().nullable().optional(),
});

// ─── Applications ─────────────────────────────────────────────────────────────

admissionsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const yearId = c.req.query("yearId");
  const status = c.req.query("status");

  const conditions = [eq(admissionApplications.tenantId, user.tenantId)];
  if (yearId) conditions.push(eq(admissionApplications.academicYearId, yearId));
  if (status) {
    conditions.push(
      eq(
        admissionApplications.status,
        status as "draft" | "submitted" | "review" | "accepted" | "waitlisted" | "rejected" | "enrolled"
      )
    );
  }

  const rows = await db
    .select()
    .from(admissionApplications)
    .where(and(...conditions))
    .orderBy(desc(admissionApplications.createdAt))
    .limit(100);

  const list = Array.isArray(rows)
    ? rows
    : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return c.json({ applications: list });
});

admissionsRoutes.post("/", zValidator("json", applicationSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Verify year belongs to tenant
  const [year] = await db
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.id, body.academicYearId), eq(academicYears.tenantId, user.tenantId)));

  if (!year) return c.json({ error: "academic_year_not_found" }, 404);

  const [created] = await db
    .insert(admissionApplications)
    .values({
      tenantId: user.tenantId,
      academicYearId: body.academicYearId,
      applicantName: body.applicantName,
      applicantEmail: body.applicantEmail ?? null,
      applicantPhone: body.applicantPhone ?? null,
      guardianName: body.guardianName ?? null,
      guardianPhone: body.guardianPhone ?? null,
      gradeLevel: body.gradeLevel,
      leadId: body.leadId ?? null,
    })
    .returning();

  return c.json({ application: created }, 201);
});

admissionsRoutes.patch("/:id", zValidator("json", statusSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(admissionApplications)
    .where(and(eq(admissionApplications.id, id), eq(admissionApplications.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status !== undefined) updateData.status = body.status;
  if (body.decisionNotes !== undefined) updateData.decisionNotes = body.decisionNotes;
  if (body.applicantName !== undefined) updateData.applicantName = body.applicantName;
  if (body.applicantEmail !== undefined) updateData.applicantEmail = body.applicantEmail;
  if (body.applicantPhone !== undefined) updateData.applicantPhone = body.applicantPhone;
  if (body.guardianName !== undefined) updateData.guardianName = body.guardianName;
  if (body.guardianPhone !== undefined) updateData.guardianPhone = body.guardianPhone;
  if (body.gradeLevel !== undefined) updateData.gradeLevel = body.gradeLevel;

  const [updated] = await db
    .update(admissionApplications)
    .set(updateData)
    .where(eq(admissionApplications.id, id))
    .returning();

  return c.json({ application: updated });
});

admissionsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(admissionApplications)
    .where(and(eq(admissionApplications.id, id), eq(admissionApplications.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(admissionApplications).where(eq(admissionApplications.id, id));
  return c.json({ ok: true });
});

// ─── Documents ────────────────────────────────────────────────────────────────

admissionsRoutes.get("/:id/documents", async (c) => {
  const user = c.get("user");
  const applicationId = c.req.param("id");

  const [app] = await db
    .select()
    .from(admissionApplications)
    .where(and(eq(admissionApplications.id, applicationId), eq(admissionApplications.tenantId, user.tenantId)));

  if (!app) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select()
    .from(admissionDocuments)
    .where(eq(admissionDocuments.applicationId, applicationId))
    .orderBy(asc(admissionDocuments.createdAt));

  const list = Array.isArray(rows)
    ? rows
    : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return c.json({ documents: list });
});

admissionsRoutes.post("/:id/documents", zValidator("json", documentSchema), async (c) => {
  const user = c.get("user");
  const applicationId = c.req.param("id");
  const body = c.req.valid("json");

  const [app] = await db
    .select()
    .from(admissionApplications)
    .where(and(eq(admissionApplications.id, applicationId), eq(admissionApplications.tenantId, user.tenantId)));

  if (!app) return c.json({ error: "not_found" }, 404);

  const [created] = await db
    .insert(admissionDocuments)
    .values({
      tenantId: user.tenantId,
      applicationId,
      name: body.name,
      status: body.status ?? "required",
      notes: body.notes ?? null,
    })
    .returning();

  return c.json({ document: created }, 201);
});

admissionsRoutes.patch("/:id/documents/:did", zValidator("json", documentSchema.partial()), async (c) => {
  const user = c.get("user");
  const applicationId = c.req.param("id");
  const did = c.req.param("did");
  const body = c.req.valid("json");

  // Tenant safety via application
  const [app] = await db
    .select()
    .from(admissionApplications)
    .where(and(eq(admissionApplications.id, applicationId), eq(admissionApplications.tenantId, user.tenantId)));

  if (!app) return c.json({ error: "not_found" }, 404);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.status !== undefined) {
    updateData.status = body.status;
    if (body.status === "received" || body.status === "verified") {
      updateData.uploadedAt = new Date();
    }
  }
  if (body.notes !== undefined) updateData.notes = body.notes;

  const [updated] = await db
    .update(admissionDocuments)
    .set(updateData)
    .where(and(eq(admissionDocuments.id, did), eq(admissionDocuments.applicationId, applicationId)))
    .returning();

  if (!updated) return c.json({ error: "document_not_found" }, 404);
  return c.json({ document: updated });
});

admissionsRoutes.delete("/:id/documents/:did", async (c) => {
  const user = c.get("user");
  const applicationId = c.req.param("id");
  const did = c.req.param("did");

  const [app] = await db
    .select()
    .from(admissionApplications)
    .where(and(eq(admissionApplications.id, applicationId), eq(admissionApplications.tenantId, user.tenantId)));

  if (!app) return c.json({ error: "not_found" }, 404);

  await db
    .delete(admissionDocuments)
    .where(and(eq(admissionDocuments.id, did), eq(admissionDocuments.applicationId, applicationId)));

  return c.json({ ok: true });
});

// ─── Enroll ───────────────────────────────────────────────────────────────────

admissionsRoutes.post("/:id/enroll", zValidator("json", enrollSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [app] = await db
    .select()
    .from(admissionApplications)
    .where(and(eq(admissionApplications.id, id), eq(admissionApplications.tenantId, user.tenantId)));

  if (!app) return c.json({ error: "not_found" }, 404);

  // Load documents
  const docsRaw = await db
    .select()
    .from(admissionDocuments)
    .where(eq(admissionDocuments.applicationId, id));

  const docs = Array.isArray(docsRaw)
    ? docsRaw
    : (docsRaw as unknown as { rows: typeof docsRaw }).rows ?? docsRaw;

  // Eligibility check
  if (!isEligibleToEnroll(app, docs)) {
    return c.json(
      {
        error: "not_eligible",
        message:
          "Aplicația nu este eligibilă pentru înscriere. Verificați statusul și documentele.",
      },
      400
    );
  }

  let studentId = body.studentId ?? null;

  // Create student if not provided
  if (!studentId) {
    const [newStudent] = await db
      .insert(students)
      .values({
        tenantId: user.tenantId,
        fullName: app.applicantName,
        email: app.applicantEmail ?? null,
        phone: app.applicantPhone ?? null,
        parentPhone: app.guardianPhone ?? null,
        status: "active",
      })
      .returning();
    studentId = newStudent.id;
  }

  // Create enrollment if classId provided
  let enrollmentId: string | null = null;
  if (body.classId) {
    // Verify class belongs to tenant
    const [cls] = await db
      .select()
      .from(schoolClasses)
      .where(and(eq(schoolClasses.id, body.classId), eq(schoolClasses.tenantId, user.tenantId)));

    if (!cls) return c.json({ error: "class_not_found" }, 404);

    const [enrollment] = await db
      .insert(classEnrollments)
      .values({
        tenantId: user.tenantId,
        classId: body.classId,
        studentId,
        status: "active",
      })
      .onConflictDoNothing()
      .returning();

    if (enrollment) enrollmentId = enrollment.id;
  }

  // Update application status to enrolled
  await db
    .update(admissionApplications)
    .set({ status: "enrolled", updatedAt: new Date() })
    .where(eq(admissionApplications.id, id));

  return c.json({ studentId, enrollmentId });
});
