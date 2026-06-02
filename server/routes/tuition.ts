/**
 * SCHOOL-004 — API taxe școlare (tuition billing)
 *
 * Routes:
 *   GET    /api/school/tuition/plans?yearId=
 *   POST   /api/school/tuition/plans
 *   PATCH  /api/school/tuition/plans/:id
 *   DELETE /api/school/tuition/plans/:id
 *
 *   GET    /api/school/tuition/plans/:id/installments
 *   POST   /api/school/tuition/plans/:id/installments
 *   DELETE /api/school/tuition/plans/:id/installments/:iid
 *
 *   GET    /api/school/tuition/students?planId=
 *   POST   /api/school/tuition/students
 *   PATCH  /api/school/tuition/students/:id
 *   DELETE /api/school/tuition/students/:id
 *   POST   /api/school/tuition/students/:id/generate-invoices
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  tuitionPlans,
  tuitionInstallments,
  studentTuition,
  invoices,
  academicYears,
  students,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { effectiveAmount } from "../lib/tuition";

export const tuitionRoutes = new Hono<{ Variables: AuthVariables }>();

tuitionRoutes.use("*", requireAuth);

// ─── Validators ───────────────────────────────────────────────────────────────

const planSchema = z.object({
  academicYearId: z.string().uuid(),
  name: z.string().min(1).max(200),
  amountCents: z.number().int().min(0),
  currency: z.string().length(3).default("RON"),
  billingCycle: z.enum(["annual", "per_term", "monthly"]).default("annual"),
  siblingDiscountPercent: z.number().min(0).max(100).default(0),
});

const installmentSchema = z.object({
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  amountCents: z.number().int().min(0),
  orderIndex: z.number().int().min(1),
});

const studentTuitionSchema = z.object({
  studentId: z.string().uuid(),
  planId: z.string().uuid(),
  classId: z.string().uuid().nullable().optional(),
  siblingRank: z.number().int().min(1).max(10).default(1),
  scholarshipAmountCents: z.number().int().min(0).default(0),
  scholarshipPercent: z.number().min(0).max(100).default(0),
  notes: z.string().nullable().optional(),
});

// ─── Plans ────────────────────────────────────────────────────────────────────

tuitionRoutes.get("/plans", async (c) => {
  const user = c.get("user");
  const yearId = c.req.query("yearId");

  const conditions = [eq(tuitionPlans.tenantId, user.tenantId)];
  if (yearId) conditions.push(eq(tuitionPlans.academicYearId, yearId));

  const rows = await db
    .select()
    .from(tuitionPlans)
    .where(and(...conditions))
    .orderBy(asc(tuitionPlans.name))
    .limit(100);

  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return c.json({ plans: list });
});

tuitionRoutes.post("/plans", zValidator("json", planSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Verifică că academicYearId aparține tenantului
  const [year] = await db
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.id, body.academicYearId), eq(academicYears.tenantId, user.tenantId)));

  if (!year) return c.json({ error: "academic_year_not_found" }, 404);

  const [created] = await db
    .insert(tuitionPlans)
    .values({
      tenantId: user.tenantId,
      academicYearId: body.academicYearId,
      name: body.name,
      amountCents: body.amountCents,
      currency: body.currency,
      billingCycle: body.billingCycle,
      siblingDiscountPercent: String(body.siblingDiscountPercent),
    })
    .returning();

  return c.json({ plan: created }, 201);
});

tuitionRoutes.patch("/plans/:id", zValidator("json", planSchema.partial()), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(tuitionPlans)
    .where(and(eq(tuitionPlans.id, id), eq(tuitionPlans.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.amountCents !== undefined) updateData.amountCents = body.amountCents;
  if (body.currency !== undefined) updateData.currency = body.currency;
  if (body.billingCycle !== undefined) updateData.billingCycle = body.billingCycle;
  if (body.siblingDiscountPercent !== undefined)
    updateData.siblingDiscountPercent = String(body.siblingDiscountPercent);

  const [updated] = await db
    .update(tuitionPlans)
    .set(updateData)
    .where(eq(tuitionPlans.id, id))
    .returning();

  return c.json({ plan: updated });
});

tuitionRoutes.delete("/plans/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(tuitionPlans)
    .where(and(eq(tuitionPlans.id, id), eq(tuitionPlans.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(tuitionPlans).where(eq(tuitionPlans.id, id));
  return c.json({ ok: true });
});

// ─── Installments ─────────────────────────────────────────────────────────────

tuitionRoutes.get("/plans/:id/installments", async (c) => {
  const user = c.get("user");
  const planId = c.req.param("id");

  // Tenant safety
  const [plan] = await db
    .select()
    .from(tuitionPlans)
    .where(and(eq(tuitionPlans.id, planId), eq(tuitionPlans.tenantId, user.tenantId)));

  if (!plan) return c.json({ error: "plan_not_found" }, 404);

  const rows = await db
    .select()
    .from(tuitionInstallments)
    .where(eq(tuitionInstallments.planId, planId))
    .orderBy(asc(tuitionInstallments.orderIndex));

  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return c.json({ installments: list });
});

tuitionRoutes.post(
  "/plans/:id/installments",
  zValidator("json", installmentSchema),
  async (c) => {
    const user = c.get("user");
    const planId = c.req.param("id");
    const body = c.req.valid("json");

    const [plan] = await db
      .select()
      .from(tuitionPlans)
      .where(and(eq(tuitionPlans.id, planId), eq(tuitionPlans.tenantId, user.tenantId)));

    if (!plan) return c.json({ error: "plan_not_found" }, 404);

    const [created] = await db
      .insert(tuitionInstallments)
      .values({
        tenantId: user.tenantId,
        planId,
        dueDate: body.dueDate,
        amountCents: body.amountCents,
        orderIndex: body.orderIndex,
      })
      .returning();

    return c.json({ installment: created }, 201);
  }
);

tuitionRoutes.delete("/plans/:id/installments/:iid", async (c) => {
  const user = c.get("user");
  const planId = c.req.param("id");
  const iid = c.req.param("iid");

  const [plan] = await db
    .select()
    .from(tuitionPlans)
    .where(and(eq(tuitionPlans.id, planId), eq(tuitionPlans.tenantId, user.tenantId)));

  if (!plan) return c.json({ error: "plan_not_found" }, 404);

  await db
    .delete(tuitionInstallments)
    .where(and(eq(tuitionInstallments.id, iid), eq(tuitionInstallments.planId, planId)));

  return c.json({ ok: true });
});

// ─── Student Tuition ──────────────────────────────────────────────────────────

tuitionRoutes.get("/students", async (c) => {
  const user = c.get("user");
  const planId = c.req.query("planId");

  const conditions = [eq(studentTuition.tenantId, user.tenantId)];
  if (planId) conditions.push(eq(studentTuition.planId, planId));

  const rows = await db
    .select()
    .from(studentTuition)
    .where(and(...conditions))
    .limit(100);

  const list = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return c.json({ studentTuitions: list });
});

tuitionRoutes.post("/students", zValidator("json", studentTuitionSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Verifică student aparține tenantului
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, body.studentId), eq(students.tenantId, user.tenantId)));

  if (!student) return c.json({ error: "student_not_found" }, 404);

  // Verifică plan aparține tenantului
  const [plan] = await db
    .select()
    .from(tuitionPlans)
    .where(and(eq(tuitionPlans.id, body.planId), eq(tuitionPlans.tenantId, user.tenantId)));

  if (!plan) return c.json({ error: "plan_not_found" }, 404);

  const [created] = await db
    .insert(studentTuition)
    .values({
      tenantId: user.tenantId,
      studentId: body.studentId,
      planId: body.planId,
      classId: body.classId ?? null,
      siblingRank: body.siblingRank,
      scholarshipAmountCents: body.scholarshipAmountCents,
      scholarshipPercent: String(body.scholarshipPercent),
      notes: body.notes ?? null,
    })
    .returning();

  return c.json({ studentTuition: created }, 201);
});

tuitionRoutes.patch(
  "/students/:id",
  zValidator("json", studentTuitionSchema.partial()),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(studentTuition)
      .where(and(eq(studentTuition.id, id), eq(studentTuition.tenantId, user.tenantId)));

    if (!existing) return c.json({ error: "not_found" }, 404);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.siblingRank !== undefined) updateData.siblingRank = body.siblingRank;
    if (body.scholarshipAmountCents !== undefined)
      updateData.scholarshipAmountCents = body.scholarshipAmountCents;
    if (body.scholarshipPercent !== undefined)
      updateData.scholarshipPercent = String(body.scholarshipPercent);
    if (body.notes !== undefined) updateData.notes = body.notes;

    const [updated] = await db
      .update(studentTuition)
      .set(updateData)
      .where(eq(studentTuition.id, id))
      .returning();

    return c.json({ studentTuition: updated });
  }
);

tuitionRoutes.delete("/students/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(studentTuition)
    .where(and(eq(studentTuition.id, id), eq(studentTuition.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(studentTuition).where(eq(studentTuition.id, id));
  return c.json({ ok: true });
});

// ─── Generate Invoices ────────────────────────────────────────────────────────

tuitionRoutes.post("/students/:id/generate-invoices", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  // Load student_tuition with plan
  const [st] = await db
    .select()
    .from(studentTuition)
    .where(and(eq(studentTuition.id, id), eq(studentTuition.tenantId, user.tenantId)));

  if (!st) return c.json({ error: "not_found" }, 404);

  const [plan] = await db
    .select()
    .from(tuitionPlans)
    .where(eq(tuitionPlans.id, st.planId));

  if (!plan) return c.json({ error: "plan_not_found" }, 404);

  // Load installments
  const installmentsRaw = await db
    .select()
    .from(tuitionInstallments)
    .where(eq(tuitionInstallments.planId, plan.id))
    .orderBy(asc(tuitionInstallments.orderIndex));

  const installmentList = Array.isArray(installmentsRaw)
    ? installmentsRaw
    : (installmentsRaw as unknown as { rows: typeof installmentsRaw }).rows ?? installmentsRaw;

  if (installmentList.length === 0) {
    return c.json({ error: "no_installments", message: "Planul nu are rate definite." }, 400);
  }

  // Calculate effective amount per installment
  const netAmount = effectiveAmount({
    amountCents: plan.amountCents,
    siblingRank: st.siblingRank,
    siblingDiscountPercent: parseFloat(plan.siblingDiscountPercent ?? "0"),
    scholarshipAmountCents: st.scholarshipAmountCents,
    scholarshipPercent: parseFloat(st.scholarshipPercent ?? "0"),
  });

  // Distribute net amount proportionally across installments
  const totalPlanCents = installmentList.reduce((s, i) => s + i.amountCents, 0);
  const createdInvoices: { id: string; invoiceNumber: string }[] = [];

  for (const inst of installmentList) {
    // Proportional net amount for this installment
    const instNetCents =
      totalPlanCents > 0
        ? Math.round((inst.amountCents / totalPlanCents) * netAmount)
        : 0;

    // Idempotency: check if invoice already exists for this installment + student
    const notes = `Taxă școlară — rată ${inst.orderIndex}/${installmentList.length} — ${plan.name}`;
    const existing = await db
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, user.tenantId),
          eq(invoices.studentId, st.studentId),
          eq(invoices.notes, notes)
        )
      )
      .limit(1);

    const existingList = Array.isArray(existing)
      ? existing
      : (existing as unknown as { rows: typeof existing }).rows ?? existing;

    if (existingList.length > 0) {
      createdInvoices.push({
        id: existingList[0].id,
        invoiceNumber: existingList[0].invoiceNumber,
      });
      continue;
    }

    // Generate invoice number
    const [maxRow] = await db
      .select({ maxNum: sql<number>`coalesce(max(${invoices.number}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.tenantId, user.tenantId), eq(invoices.series, "TAXA")));

    const nextNumber = ((maxRow as { maxNum: number } | undefined)?.maxNum ?? 0) + 1;
    const year = new Date().getFullYear();
    const invoiceNumber = `TAXA-${year}-${String(nextNumber).padStart(4, "0")}`;

    const [inv] = await db
      .insert(invoices)
      .values({
        tenantId: user.tenantId,
        studentId: st.studentId,
        series: "TAXA",
        number: nextNumber,
        invoiceNumber,
        amountCents: instNetCents,
        currency: plan.currency,
        status: "draft",
        dueDate: new Date(`${inst.dueDate}T12:00:00Z`),
        notes,
      })
      .returning();

    createdInvoices.push({ id: inv.id, invoiceNumber: inv.invoiceNumber });
  }

  return c.json({ invoices: createdInvoices, count: createdInvoices.length });
});
