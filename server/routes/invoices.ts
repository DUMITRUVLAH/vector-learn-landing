import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { invoices, students } from "../db/schema";
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

  // Disallow transitioning from cancelled to anything
  const [existing] = await db
    .select({ status: invoices.status })
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
  return c.json(updated);
});
