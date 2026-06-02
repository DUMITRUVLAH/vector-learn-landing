/**
 * PAY-006: Payment plans — N installments with auto-generated invoices.
 *
 * POST /api/payment-plans       — create plan + generate N invoices
 * GET  /api/payment-plans       — list active plans per tenant
 * GET  /api/payment-plans/:id   — plan details + invoice list
 * DELETE /api/payment-plans/:id — cancel plan (marks remaining invoices cancelled)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { paymentPlans, invoices, students } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const createPlanSchema = z.object({
  studentId: z.string().uuid(),
  totalAmountCents: z.number().int().min(100),
  currency: z.enum(["RON", "EUR", "USD"]).default("RON"),
  installments: z.number().int().min(2).max(24),
  intervalDays: z.number().int().min(7).max(365).default(30),
  firstDueDate: z.string().datetime(),
  description: z.string().max(500).optional().nullable(),
});

export const paymentPlanRoutes = new Hono<{ Variables: AuthVariables }>();

paymentPlanRoutes.use("*", requireAuth);

/** POST /api/payment-plans — create plan + installment invoices */
paymentPlanRoutes.post("/", zValidator("json", createPlanSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const { studentId, totalAmountCents, currency, installments, intervalDays, firstDueDate, description } =
    c.req.valid("json");

  // Verify student belongs to tenant
  const [stu] = await db
    .select({ id: students.id, fullName: students.fullName })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
    .limit(1);

  if (!stu) return c.json({ error: "student_not_found" }, 404);

  // Calculate installment amounts (distribute rounding to last installment)
  const baseAmount = Math.floor(totalAmountCents / installments);
  const remainder = totalAmountCents - baseAmount * installments;
  const amounts = Array.from({ length: installments }, (_, i) =>
    i === installments - 1 ? baseAmount + remainder : baseAmount
  );

  // Get next invoice number for tenant
  const [{ maxNum }] = await db
    .select({ maxNum: sql<number>`coalesce(max(${invoices.number}), 0)` })
    .from(invoices)
    .where(eq(invoices.tenantId, tenantId));
  let nextNum = (maxNum ?? 0) + 1;

  // Create plan
  const [plan] = await db
    .insert(paymentPlans)
    .values({
      tenantId,
      studentId,
      totalAmountCents,
      currency,
      installmentsCount: installments,
      intervalDays,
      description: description ?? null,
      status: "active",
      createdBy: userId,
    })
    .returning();

  // Create invoices for each installment
  const firstDate = new Date(firstDueDate);
  const createdInvoices = [];

  for (let i = 0; i < installments; i++) {
    const dueDate = new Date(firstDate);
    dueDate.setDate(dueDate.getDate() + i * intervalDays);

    const invoiceNumber = `VECT-${new Date().getFullYear()}-${String(nextNum).padStart(4, "0")}`;
    const [inv] = await db
      .insert(invoices)
      .values({
        tenantId,
        studentId,
        series: "VECT",
        number: nextNum++,
        invoiceNumber,
        amountCents: amounts[i]!,
        currency,
        status: "issued",
        dueDate,
        notes: `Plan de plată ${plan.id} — Rata ${i + 1}/${installments}`,
      })
      .returning();
    createdInvoices.push(inv);
  }

  return c.json({ plan, invoices: createdInvoices }, 201);
});

/** GET /api/payment-plans — list active plans for tenant */
paymentPlanRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;

  const rows = await db
    .select({
      id: paymentPlans.id,
      studentId: paymentPlans.studentId,
      studentName: students.fullName,
      totalAmountCents: paymentPlans.totalAmountCents,
      currency: paymentPlans.currency,
      installmentsCount: paymentPlans.installmentsCount,
      intervalDays: paymentPlans.intervalDays,
      status: paymentPlans.status,
      description: paymentPlans.description,
      createdAt: paymentPlans.createdAt,
    })
    .from(paymentPlans)
    .innerJoin(students, eq(paymentPlans.studentId, students.id))
    .where(eq(paymentPlans.tenantId, tenantId))
    .orderBy(desc(paymentPlans.createdAt));

  // Compute progress for each plan
  const withProgress = await Promise.all(
    rows.map(async (plan) => {
      const planInvoices = await db
        .select({ id: invoices.id, status: invoices.status, amountCents: invoices.amountCents })
        .from(invoices)
        .where(and(eq(invoices.tenantId, tenantId), sql`${invoices.notes} LIKE ${'%' + plan.id + '%'}`));

      const paid = planInvoices.filter((inv) => inv.status === "paid");
      const paidAmount = paid.reduce((sum, inv) => sum + inv.amountCents, 0);
      const remainingAmount = plan.totalAmountCents - paidAmount;

      return {
        ...plan,
        progress: {
          paid: paid.length,
          total: planInvoices.length,
          paidAmount,
          remainingAmount,
        },
      };
    })
  );

  return c.json({ items: withProgress });
});

/** GET /api/payment-plans/:id — plan details + invoices */
paymentPlanRoutes.get("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const planId = c.req.param("id");

  const [plan] = await db
    .select()
    .from(paymentPlans)
    .where(and(eq(paymentPlans.id, planId), eq(paymentPlans.tenantId, tenantId)))
    .limit(1);

  if (!plan) return c.json({ error: "not_found" }, 404);

  const planInvoices = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), sql`${invoices.notes} LIKE ${'%' + planId + '%'}`))
    .orderBy(invoices.dueDate);

  return c.json({ plan, invoices: planInvoices });
});

/** DELETE /api/payment-plans/:id — cancel plan */
paymentPlanRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const planId = c.req.param("id");

  const [plan] = await db
    .select()
    .from(paymentPlans)
    .where(and(eq(paymentPlans.id, planId), eq(paymentPlans.tenantId, tenantId)))
    .limit(1);

  if (!plan) return c.json({ error: "not_found" }, 404);

  // Cancel remaining (issued) invoices
  await db
    .update(invoices)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.status, "issued"),
        sql`${invoices.notes} LIKE ${'%' + planId + '%'}`
      )
    );

  // Mark plan cancelled
  await db
    .update(paymentPlans)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(paymentPlans.id, planId));

  return c.json({ ok: true, planId });
});
