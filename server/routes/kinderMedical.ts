/**
 * KINDER-004 — Medical: allergies, immunization records, medication log
 *
 * GET  /api/kinder/medical/:studentId                          — full medical profile
 * POST /api/kinder/medical/:studentId/allergies                — add allergy
 * DELETE /api/kinder/medical/:studentId/allergies/:allergyId   — remove allergy
 * POST /api/kinder/medical/:studentId/immunizations            — add immunization record
 * PUT  /api/kinder/medical/:studentId/immunizations/:immId     — update immunization record
 * POST /api/kinder/medical/:studentId/medications              — log medication administration
 * GET  /api/kinder/immunization-status                         — at-risk report (tenant-wide)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, lte, or, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  students,
  childAllergies,
  immunizationRecords,
  medicationLog,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const kinderMedicalRoutes = new Hono<{ Variables: AuthVariables }>();

kinderMedicalRoutes.use("*", requireAuth);

/** UTC today as YYYY-MM-DD */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Date 30 days from today as YYYY-MM-DD */
function thirtyDaysFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

// ─── GET /api/kinder/medical/:studentId ──────────────────────────────────────
kinderMedicalRoutes.get("/medical/:studentId", async (c) => {
  const user = c.get("user");
  const { studentId } = c.req.param();
  const today = todayDate();

  // Validate student belongs to tenant
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));

  if (!student) {
    return c.json({ error: "Student not found" }, 404);
  }

  const [allergies, immunizations, todayMedications] = await Promise.all([
    db
      .select()
      .from(childAllergies)
      .where(
        and(
          eq(childAllergies.studentId, studentId),
          eq(childAllergies.tenantId, user.tenantId)
        )
      ),
    db
      .select()
      .from(immunizationRecords)
      .where(
        and(
          eq(immunizationRecords.studentId, studentId),
          eq(immunizationRecords.tenantId, user.tenantId)
        )
      ),
    db
      .select()
      .from(medicationLog)
      .where(
        and(
          eq(medicationLog.studentId, studentId),
          eq(medicationLog.tenantId, user.tenantId),
          eq(medicationLog.logDate, today)
        )
      ),
  ]);

  return c.json({ allergies, immunizations, todayMedications });
});

// ─── POST /api/kinder/medical/:studentId/allergies ────────────────────────────
const allergySchema = z.object({
  allergen: z.string().min(1).max(200),
  reactionType: z.enum(["mild", "moderate", "severe"]).default("mild"),
  notes: z.string().max(2000).optional(),
});

kinderMedicalRoutes.post(
  "/medical/:studentId/allergies",
  zValidator("json", allergySchema),
  async (c) => {
    const user = c.get("user");
    const { studentId } = c.req.param();
    const body = c.req.valid("json");

    // Verify student belongs to tenant
    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));

    if (!student) {
      return c.json({ error: "Student not found" }, 404);
    }

    const [allergy] = await db
      .insert(childAllergies)
      .values({
        tenantId: user.tenantId,
        studentId,
        allergen: body.allergen,
        reactionType: body.reactionType,
        notes: body.notes ?? null,
      })
      .returning();

    return c.json(allergy, 201);
  }
);

// ─── DELETE /api/kinder/medical/:studentId/allergies/:allergyId ──────────────
kinderMedicalRoutes.delete(
  "/medical/:studentId/allergies/:allergyId",
  async (c) => {
    const user = c.get("user");
    const { studentId, allergyId } = c.req.param();

    const [deleted] = await db
      .delete(childAllergies)
      .where(
        and(
          eq(childAllergies.id, allergyId),
          eq(childAllergies.studentId, studentId),
          eq(childAllergies.tenantId, user.tenantId)
        )
      )
      .returning({ id: childAllergies.id });

    if (!deleted) {
      return c.json({ error: "Allergy record not found" }, 404);
    }

    return c.json({ deleted: true });
  }
);

// ─── POST /api/kinder/medical/:studentId/immunizations ───────────────────────
const immunizationSchema = z.object({
  vaccineName: z.string().min(1).max(200),
  administeredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  provider: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

kinderMedicalRoutes.post(
  "/medical/:studentId/immunizations",
  zValidator("json", immunizationSchema),
  async (c) => {
    const user = c.get("user");
    const { studentId } = c.req.param();
    const body = c.req.valid("json");

    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));

    if (!student) {
      return c.json({ error: "Student not found" }, 404);
    }

    const [record] = await db
      .insert(immunizationRecords)
      .values({
        tenantId: user.tenantId,
        studentId,
        vaccineName: body.vaccineName,
        administeredDate: body.administeredDate ?? null,
        nextDueDate: body.nextDueDate ?? null,
        provider: body.provider ?? null,
        notes: body.notes ?? null,
      })
      .returning();

    return c.json(record, 201);
  }
);

// ─── PUT /api/kinder/medical/:studentId/immunizations/:immId ─────────────────
kinderMedicalRoutes.put(
  "/medical/:studentId/immunizations/:immId",
  zValidator("json", immunizationSchema.partial()),
  async (c) => {
    const user = c.get("user");
    const { studentId, immId } = c.req.param();
    const body = c.req.valid("json");

    const updateValues: Partial<typeof immunizationRecords.$inferInsert> = {};
    if (body.vaccineName !== undefined) updateValues.vaccineName = body.vaccineName;
    if (body.administeredDate !== undefined) updateValues.administeredDate = body.administeredDate;
    if (body.nextDueDate !== undefined) updateValues.nextDueDate = body.nextDueDate;
    if (body.provider !== undefined) updateValues.provider = body.provider;
    if (body.notes !== undefined) updateValues.notes = body.notes;

    if (Object.keys(updateValues).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    const [updated] = await db
      .update(immunizationRecords)
      .set(updateValues)
      .where(
        and(
          eq(immunizationRecords.id, immId),
          eq(immunizationRecords.studentId, studentId),
          eq(immunizationRecords.tenantId, user.tenantId)
        )
      )
      .returning();

    if (!updated) {
      return c.json({ error: "Immunization record not found" }, 404);
    }

    return c.json(updated);
  }
);

// ─── POST /api/kinder/medical/:studentId/medications ─────────────────────────
const medicationSchema = z.object({
  medicationName: z.string().min(1).max(200),
  dosage: z.string().min(1).max(100),
  administeredAt: z.string().datetime({ offset: true }).optional(),
  parentConsent: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
});

kinderMedicalRoutes.post(
  "/medical/:studentId/medications",
  zValidator("json", medicationSchema),
  async (c) => {
    const user = c.get("user");
    const { studentId } = c.req.param();
    const body = c.req.valid("json");

    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));

    if (!student) {
      return c.json({ error: "Student not found" }, 404);
    }

    const administeredAt = body.administeredAt
      ? new Date(body.administeredAt)
      : new Date();

    const [entry] = await db
      .insert(medicationLog)
      .values({
        tenantId: user.tenantId,
        studentId,
        logDate: todayDate(),
        medicationName: body.medicationName,
        dosage: body.dosage,
        administeredAt,
        administeredByUserId: user.id,
        parentConsent: body.parentConsent,
        notes: body.notes ?? null,
      })
      .returning();

    return c.json(entry, 201);
  }
);

// ─── GET /api/kinder/immunization-status ─────────────────────────────────────
// Returns students with immunizations that are due or expiring within 30 days.
kinderMedicalRoutes.get("/immunization-status", async (c) => {
  const user = c.get("user");
  const today = todayDate();
  const in30Days = thirtyDaysFromNow();

  // Students at risk: have immunization records with next_due_date <= in30Days OR no records at all
  const atRiskRecords = await db
    .select({
      studentId: immunizationRecords.studentId,
      vaccineName: immunizationRecords.vaccineName,
      nextDueDate: immunizationRecords.nextDueDate,
      administeredDate: immunizationRecords.administeredDate,
    })
    .from(immunizationRecords)
    .where(
      and(
        eq(immunizationRecords.tenantId, user.tenantId),
        or(
          isNull(immunizationRecords.nextDueDate),
          lte(immunizationRecords.nextDueDate, in30Days)
        )
      )
    );

  // Get student names for the at-risk records
  const studentIds = [...new Set(atRiskRecords.map((r) => r.studentId))];

  if (studentIds.length === 0) {
    return c.json({ atRisk: [], today, threshold: in30Days });
  }

  const studentRows = await db
    .select({ id: students.id, fullName: students.fullName })
    .from(students)
    .where(eq(students.tenantId, user.tenantId));

  const studentMap = new Map(studentRows.map((s) => [s.id, s.fullName]));

  // Group by student
  const grouped = new Map<
    string,
    { studentId: string; fullName: string; vaccines: typeof atRiskRecords }
  >();

  for (const rec of atRiskRecords) {
    if (!studentIds.includes(rec.studentId)) continue;
    const existing = grouped.get(rec.studentId);
    if (existing) {
      existing.vaccines.push(rec);
    } else {
      grouped.set(rec.studentId, {
        studentId: rec.studentId,
        fullName: studentMap.get(rec.studentId) ?? rec.studentId,
        vaccines: [rec],
      });
    }
  }

  const atRisk = [...grouped.values()].map((s) => ({
    ...s,
    status:
      s.vaccines.some((v) => v.nextDueDate && v.nextDueDate < today)
        ? "overdue"
        : s.vaccines.some((v) => v.nextDueDate && v.nextDueDate <= in30Days)
        ? "due_soon"
        : "no_record",
  }));

  return c.json({ atRisk, today, threshold: in30Days });
});
