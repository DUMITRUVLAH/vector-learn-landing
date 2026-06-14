import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { payments, students, invoices, courses, promoCodes } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const createPaymentSchema = z.object({
  studentId: z.string().uuid(),
  amountCents: z.number().int().min(0),
  currency: z.enum(["EUR", "RON", "USD"]).default("RON"),
  status: z.enum(["pending", "paid", "overdue", "refunded", "cancelled"]).default("pending"),
  dueDate: z.string().datetime().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  // COURSE-203: optional promo code
  promoCode: z.string().max(20).optional().nullable(),
});

const updatePaymentSchema = createPaymentSchema.partial();

export const paymentRoutes = new Hono<{ Variables: AuthVariables }>();

paymentRoutes.use("*", requireAuth);

paymentRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select({
      id: payments.id,
      studentId: payments.studentId,
      amountCents: payments.amountCents,
      currency: payments.currency,
      status: payments.status,
      dueDate: payments.dueDate,
      paidAt: payments.paidAt,
      description: payments.description,
      /** INTEG-102 */
      courseId: payments.courseId,
      createdAt: payments.createdAt,
      studentName: students.fullName,
      courseName: courses.name,
    })
    .from(payments)
    .innerJoin(students, eq(payments.studentId, students.id))
    .leftJoin(courses, eq(payments.courseId, courses.id))
    .where(eq(payments.tenantId, tenantId))
    .orderBy(desc(payments.createdAt));
  return c.json({ items: rows });
});

paymentRoutes.get("/stats", async (c) => {
  const tenantId = c.get("user").tenantId;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [{ paid }] = await db
    .select({ paid: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "paid"),
        sql`${payments.paidAt} >= ${monthStart.toISOString()}`
      )
    );

  const [{ pending }] = await db
    .select({ pending: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.status, "pending")));

  const [{ overdue }] = await db
    .select({ overdue: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.status, "overdue")));

  return c.json({
    monthPaidCents: paid,
    pendingCents: pending,
    overdueCents: overdue,
  });
});

paymentRoutes.post("/", zValidator("json", createPaymentSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get("user").tenantId;

  // COURSE-203: apply promo code if provided
  let finalAmountCents = body.amountCents;
  let promoCodeId: string | null = null;
  let originalAmountCents: number | null = null;

  if (body.promoCode) {
    const code = body.promoCode.toUpperCase();
    const pc = await db.query.promoCodes.findFirst({
      where: and(eq(promoCodes.tenantId, tenantId), eq(promoCodes.code, code)),
    });

    if (pc) {
      const now = new Date();
      const expired = pc.expiresAt && pc.expiresAt < now;
      const exhausted = pc.maxUses != null && pc.usedCount >= pc.maxUses;
      const disabled = pc.status === "disabled";

      if (!expired && !exhausted && !disabled) {
        originalAmountCents = body.amountCents;
        promoCodeId = pc.id;

        if (pc.discountType === "percent") {
          const discount = Math.round(body.amountCents * (pc.discountValue / 100));
          finalAmountCents = Math.max(0, body.amountCents - discount);
        } else {
          // fixed discount in cents
          finalAmountCents = Math.max(0, body.amountCents - pc.discountValue);
        }

        // Increment used_count
        await db
          .update(promoCodes)
          .set({ usedCount: pc.usedCount + 1, updatedAt: new Date() })
          .where(eq(promoCodes.id, pc.id));
      }
    }
  }

  const [created] = await db
    .insert(payments)
    .values({
      tenantId,
      studentId: body.studentId,
      amountCents: finalAmountCents,
      currency: body.currency,
      status: body.status,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      paidAt: body.status === "paid" ? new Date() : null,
      description: body.description ?? null,
      promoCodeId,
      originalAmountCents,
    })
    .returning();
  return c.json(created, 201);
});

paymentRoutes.patch("/:id", zValidator("json", updatePaymentSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.amountCents !== undefined) patch.amountCents = body.amountCents;
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.dueDate !== undefined) patch.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.description !== undefined) patch.description = body.description ?? null;
  if (body.status !== undefined) {
    patch.status = body.status;
    if (body.status === "paid") patch.paidAt = new Date();
    if (body.status === "pending" || body.status === "cancelled") patch.paidAt = null;
  }

  const [updated] = await db
    .update(payments)
    .set(patch)
    .where(and(eq(payments.id, id), eq(payments.tenantId, tenantId)))
    .returning();
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

// FIN-602: Link an existing payment to an invoice
paymentRoutes.patch(
  "/:id/link-invoice",
  zValidator("json", z.object({ invoiceId: z.string().uuid() })),
  async (c) => {
    const id = c.req.param("id");
    const tenantId = c.get("user").tenantId;
    const { invoiceId } = c.req.valid("json");

    // Verify the payment belongs to this tenant
    const [payment] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.tenantId, tenantId)));
    if (!payment) return c.json({ error: "payment_not_found" }, 404);

    // Verify the invoice belongs to this tenant
    const [invoice] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));
    if (!invoice) return c.json({ error: "invoice_not_found" }, 404);

    const [updated] = await db
      .update(invoices)
      .set({ paymentId: id, updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .returning();

    return c.json(updated);
  }
);
