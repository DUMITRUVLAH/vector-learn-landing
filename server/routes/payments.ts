import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { payments, students } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const createPaymentSchema = z.object({
  studentId: z.string().uuid(),
  amountCents: z.number().int().min(0),
  currency: z.enum(["EUR", "RON", "USD"]).default("EUR"),
  status: z.enum(["pending", "paid", "overdue", "refunded", "cancelled"]).default("pending"),
  dueDate: z.string().datetime().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
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
      createdAt: payments.createdAt,
      studentName: students.fullName,
    })
    .from(payments)
    .innerJoin(students, eq(payments.studentId, students.id))
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
  const [created] = await db
    .insert(payments)
    .values({
      tenantId,
      studentId: body.studentId,
      amountCents: body.amountCents,
      currency: body.currency,
      status: body.status,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      paidAt: body.status === "paid" ? new Date() : null,
      description: body.description ?? null,
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
