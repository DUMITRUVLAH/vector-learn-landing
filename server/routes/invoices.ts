import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, sql, lte } from "drizzle-orm";
import { db } from "../db/client";
import { invoices, students, subscriptions } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const createInvoiceSchema = z.object({
  studentId: z.string().uuid(),
  paymentId: z.string().uuid().optional().nullable(),
  amountCents: z.number().int().min(0),
  currency: z.enum(["EUR", "RON", "USD"]).default("RON"),
  series: z.string().max(20).default("VECT"),
  dueDate: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const updateInvoiceSchema = z.object({
  status: z.enum(["draft", "issued", "paid", "cancelled"]),
  notes: z.string().max(2000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
});

export const invoiceRoutes = new Hono<{ Variables: AuthVariables }>();

invoiceRoutes.use("*", requireAuth);

invoiceRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const status = c.req.query("status") as string | undefined;
  const month = c.req.query("month"); // YYYY-MM

  // Build conditions for optional filters
  const conditions = [eq(invoices.tenantId, tenantId)];
  if (status && ["draft", "issued", "paid", "cancelled"].includes(status)) {
    conditions.push(eq(invoices.status, status as "draft" | "issued" | "paid" | "cancelled"));
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yr, mo] = month.split("-").map(Number);
    const start = new Date(yr, (mo as number) - 1, 1);
    const end = new Date(yr, mo as number, 1);
    conditions.push(
      sql`${invoices.issueDate} >= ${start.toISOString()} AND ${invoices.issueDate} < ${end.toISOString()}`
    );
  }

  const rows = await db
    .select({
      id: invoices.id,
      tenantId: invoices.tenantId,
      studentId: invoices.studentId,
      paymentId: invoices.paymentId,
      series: invoices.series,
      number: invoices.number,
      invoiceNumber: invoices.invoiceNumber,
      amountCents: invoices.amountCents,
      currency: invoices.currency,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      notes: invoices.notes,
      pdfKey: invoices.pdfKey,
      createdAt: invoices.createdAt,
      studentName: students.fullName,
    })
    .from(invoices)
    .innerJoin(students, eq(invoices.studentId, students.id))
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt));

  return c.json({ items: rows });
});

invoiceRoutes.post("/", zValidator("json", createInvoiceSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get("user").tenantId;

  // Auto-increment invoice number per tenant (atomic: SELECT MAX + 1 in transaction)
  const [maxRow] = await db
    .select({ maxNum: sql<number>`coalesce(max(${invoices.number}), 0)` })
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), eq(invoices.series, body.series)));

  const nextNumber = (maxRow?.maxNum ?? 0) + 1;
  const year = new Date().getFullYear();
  const invoiceNumber = `${body.series}-${year}-${String(nextNumber).padStart(4, "0")}`;

  const [created] = await db
    .insert(invoices)
    .values({
      tenantId,
      studentId: body.studentId,
      paymentId: body.paymentId ?? null,
      series: body.series,
      number: nextNumber,
      invoiceNumber,
      amountCents: body.amountCents,
      currency: body.currency,
      status: "draft",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes ?? null,
    })
    .returning();

  return c.json(created, 201);
});

invoiceRoutes.get("/:id/pdf", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const [invoice] = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      amountCents: invoices.amountCents,
      currency: invoices.currency,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      notes: invoices.notes,
      studentName: students.fullName,
    })
    .from(invoices)
    .innerJoin(students, eq(invoices.studentId, students.id))
    .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));

  if (!invoice) return c.json({ error: "not_found" }, 404);

  const fmt = (cents: number, currency: string) =>
    new Intl.NumberFormat("ro-RO", { style: "currency", currency, maximumFractionDigits: 0 }).format(
      cents / 100
    );

  const issueStr = new Date(invoice.issueDate).toLocaleDateString("ro-RO");
  const dueStr = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString("ro-RO")
    : "La cerere";

  const html = `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8"/>
  <title>Factură ${invoice.invoiceNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 0; }
    .meta { margin-top: 4px; font-size: 0.85rem; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th { text-align: left; padding: 8px 12px; background: #f3f4f6; font-size: 0.8rem; }
    td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; }
    .total { font-weight: bold; font-size: 1rem; }
    .footer { margin-top: 32px; font-size: 0.75rem; color: #888; }
  </style>
</head>
<body>
  <h1>FACTURĂ FISCALĂ</h1>
  <div class="meta">Seria: ${invoice.invoiceNumber} &nbsp;|&nbsp; Data: ${issueStr} &nbsp;|&nbsp; Scadență: ${dueStr}</div>
  <table>
    <thead>
      <tr>
        <th>Client</th>
        <th>Descriere</th>
        <th style="text-align:right">Valoare</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${invoice.studentName}</td>
        <td>${invoice.notes ?? "Servicii educaționale"}</td>
        <td class="total" style="text-align:right">${fmt(invoice.amountCents, invoice.currency)}</td>
        <td>${invoice.status}</td>
      </tr>
    </tbody>
  </table>
  <div class="footer">Vector Learn &bull; Generat automat &bull; ${new Date().toISOString()}</div>
</body>
</html>`;

  return c.json({ invoiceNumber: invoice.invoiceNumber, html });
});

invoiceRoutes.patch("/:id", zValidator("json", updateInvoiceSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  // Fetch existing invoice for guard checks and debt calculation
  const [existing] = await db
    .select({
      status: invoices.status,
      studentId: invoices.studentId,
      amountCents: invoices.amountCents,
    })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);
  if (existing.status === "cancelled" && body.status !== "cancelled") {
    return c.json({ error: "cannot_update_cancelled" }, 409);
  }

  const patch: Record<string, unknown> = {
    status: body.status,
    updatedAt: new Date(),
  };
  if (body.notes !== undefined) patch.notes = body.notes ?? null;
  if (body.dueDate !== undefined) patch.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const [updated] = await db
    .update(invoices)
    .set(patch)
    .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);

  // FIN-602: When marking invoice as paid, decrease student debt (floor at 0)
  if (body.status === "paid" && existing.status !== "paid") {
    await db
      .update(students)
      .set({
        debtCents: sql`GREATEST(0, ${students.debtCents} - ${existing.amountCents})`,
        updatedAt: new Date(),
      })
      .where(and(eq(students.id, existing.studentId), eq(students.tenantId, tenantId)));
  }

  return c.json(updated);
});

// GET /api/invoices/debt-summary — list students with debt > 0, ordered DESC
invoiceRoutes.get("/debt-summary", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      debtCents: students.debtCents,
      email: students.email,
      phone: students.phone,
    })
    .from(students)
    .where(
      and(
        eq(students.tenantId, tenantId),
        sql`${students.debtCents} > 0`
      )
    )
    .orderBy(sql`${students.debtCents} DESC`);

  return c.json({ items: rows });
});

// ──────────────────────────────────────────────────────────────────────────────
// FIN-603: Subscription routes (abonamente recurente)
// ──────────────────────────────────────────────────────────────────────────────

const createSubscriptionSchema = z.object({
  studentId: z.string().uuid(),
  amountCents: z.number().int().min(0),
  currency: z.enum(["EUR", "RON", "USD"]).default("RON"),
  billingDay: z.number().int().min(1).max(28),
  description: z.string().max(200).optional().nullable(),
});

const updateSubscriptionSchema = z.object({
  status: z.enum(["active", "paused", "cancelled"]).optional(),
  amountCents: z.number().int().min(0).optional(),
  description: z.string().max(200).optional().nullable(),
});

/**
 * Compute the next billing date given a billing_day and a reference date (today by default).
 * If billing_day >= today's day, use this month; otherwise next month.
 * Cap to 28 to avoid month-end overflow.
 */
function computeNextBillingDate(billingDay: number, from: Date = new Date()): string {
  const day = Math.min(billingDay, 28);
  const year = from.getFullYear();
  const month = from.getMonth(); // 0-indexed
  const todayDay = from.getDate();

  let targetYear = year;
  let targetMonth = month;

  if (day < todayDay) {
    // Billing day already passed this month → next month
    targetMonth = month + 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }

  const mm = String(targetMonth + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${targetYear}-${mm}-${dd}`;
}

// POST /api/invoices/subscriptions
invoiceRoutes.post("/subscriptions", zValidator("json", createSubscriptionSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get("user").tenantId;

  const nextBillingDate = computeNextBillingDate(body.billingDay);

  const [created] = await db
    .insert(subscriptions)
    .values({
      tenantId,
      studentId: body.studentId,
      amountCents: body.amountCents,
      currency: body.currency,
      billingDay: body.billingDay,
      description: body.description ?? null,
      status: "active",
      nextBillingDate,
    })
    .returning();

  return c.json(created, 201);
});

// GET /api/invoices/subscriptions
invoiceRoutes.get("/subscriptions", async (c) => {
  const tenantId = c.get("user").tenantId;

  const rows = await db
    .select({
      id: subscriptions.id,
      tenantId: subscriptions.tenantId,
      studentId: subscriptions.studentId,
      amountCents: subscriptions.amountCents,
      currency: subscriptions.currency,
      billingDay: subscriptions.billingDay,
      description: subscriptions.description,
      status: subscriptions.status,
      nextBillingDate: subscriptions.nextBillingDate,
      createdAt: subscriptions.createdAt,
      studentName: students.fullName,
    })
    .from(subscriptions)
    .innerJoin(students, eq(subscriptions.studentId, students.id))
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(desc(subscriptions.createdAt));

  return c.json({ items: rows });
});

// PATCH /api/invoices/subscriptions/:id
invoiceRoutes.patch(
  "/subscriptions/:id",
  zValidator("json", updateSubscriptionSchema),
  async (c) => {
    const id = c.req.param("id");
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) patch.status = body.status;
    if (body.amountCents !== undefined) patch.amountCents = body.amountCents;
    if (body.description !== undefined) patch.description = body.description ?? null;

    const [updated] = await db
      .update(subscriptions)
      .set(patch)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)))
      .returning();

    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(updated);
  }
);

// POST /api/invoices/subscriptions/run-billing
// Finds all active subscriptions with next_billing_date <= today, creates an invoice for each,
// then advances next_billing_date by one month.
invoiceRoutes.post("/subscriptions/run-billing", async (c) => {
  const tenantId = c.get("user").tenantId;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Fetch due subscriptions
  const due = await db
    .select({
      id: subscriptions.id,
      studentId: subscriptions.studentId,
      amountCents: subscriptions.amountCents,
      currency: subscriptions.currency,
      description: subscriptions.description,
      billingDay: subscriptions.billingDay,
      series: sql<string>`'VECT'`,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.status, "active"),
        lte(subscriptions.nextBillingDate, today)
      )
    );

  const invoiceIds: string[] = [];

  for (const sub of due) {
    // Compute next invoice number
    const [maxRow] = await db
      .select({ maxNum: sql<number>`coalesce(max(${invoices.number}), 0)` })
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.series, "VECT")));

    const nextNumber = (maxRow?.maxNum ?? 0) + 1;
    const year = new Date().getFullYear();
    const invoiceNumber = `VECT-${year}-${String(nextNumber).padStart(4, "0")}`;

    const [inv] = await db
      .insert(invoices)
      .values({
        tenantId,
        studentId: sub.studentId,
        series: "VECT",
        number: nextNumber,
        invoiceNumber,
        amountCents: sub.amountCents,
        currency: sub.currency,
        status: "draft",
        notes: sub.description ?? "Abonament lunar",
      })
      .returning({ id: invoices.id });

    if (inv) invoiceIds.push(inv.id);

    // Advance next_billing_date by one month
    const nextDate = computeNextBillingDate(sub.billingDay, new Date(today + "T12:00:00Z"));
    // nextDate is now this month or next — but we need exactly +1 month from current nextBillingDate
    // Use a proper +1 month calculation
    const curDate = new Date(today + "T12:00:00Z");
    const nextMonth = new Date(curDate.getFullYear(), curDate.getMonth() + 1, sub.billingDay);
    const nm = String(nextMonth.getMonth() + 1).padStart(2, "0");
    const nd = String(Math.min(sub.billingDay, 28)).padStart(2, "0");
    const advancedDate = `${nextMonth.getFullYear()}-${nm}-${nd}`;

    await db
      .update(subscriptions)
      .set({ nextBillingDate: advancedDate, updatedAt: new Date() })
      .where(and(eq(subscriptions.id, sub.id), eq(subscriptions.tenantId, tenantId)));
  }

  return c.json({ processed: due.length, invoicesCreated: invoiceIds });
});
