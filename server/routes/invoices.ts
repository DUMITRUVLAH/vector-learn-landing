import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, sql, lte, isNotNull, notInArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db/client";
import { invoices, students, subscriptions } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getBranchScope } from "../middleware/branchScope";
import { generateUBL21 } from "../lib/efactura";
import {
  EfacturaMdClient,
  EfacturaMdError,
  EFACTURA_MD_STATUS,
  generateSfsInvoiceXml,
  deriveSfsIdentifier,
} from "../lib/efacturaMoldova";

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
  // BRANCH-703: filter invoices by student's branch when user has branch scope
  const scope = getBranchScope(c);
  if (scope) {
    conditions.push(eq(students.branchId, scope));
  }
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
      efacturaMdSeria: invoices.efacturaMdSeria,
      efacturaMdNumber: invoices.efacturaMdNumber,
      efacturaMdStatus: invoices.efacturaMdStatus,
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

// ──────────────────────────────────────────────────────────────────────────────
// FIN-604: e-Factura + SAGA CSV export routes
// ──────────────────────────────────────────────────────────────────────────────

// GET /api/invoices/export/saga-csv?month=YYYY-MM
// Returns CSV compatible with SAGA accounting software, tenant-scoped.
invoiceRoutes.get("/export/saga-csv", async (c) => {
  const tenantId = c.get("user").tenantId;
  const month = c.req.query("month"); // YYYY-MM

  const conditions = [eq(invoices.tenantId, tenantId)];
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
      number: invoices.number,
      issueDate: invoices.issueDate,
      invoiceNumber: invoices.invoiceNumber,
      amountCents: invoices.amountCents,
      currency: invoices.currency,
      status: invoices.status,
      notes: invoices.notes,
      studentName: students.fullName,
    })
    .from(invoices)
    .innerJoin(students, eq(invoices.studentId, students.id))
    .where(and(...conditions))
    .orderBy(invoices.number);

  // SAGA CSV headers (Romanian accounting format)
  const header = "Nr,Data,Client,CUI/CNP,Descriere,Valoare fara TVA,TVA 19%,Total,Status";

  const lines = rows.map((inv) => {
    const total = inv.amountCents / 100;
    const vatRate = 0.19;
    const vatBase = +(total / (1 + vatRate)).toFixed(2);
    const vat = +(total - vatBase).toFixed(2);
    const dateStr = new Date(inv.issueDate).toLocaleDateString("ro-RO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const cols = [
      inv.number,
      dateStr,
      `"${(inv.studentName ?? "").replace(/"/g, '""')}"`,
      "", // CUI/CNP — not in current schema (future)
      `"${(inv.notes ?? "Servicii educationale").replace(/"/g, '""')}"`,
      vatBase.toFixed(2),
      vat.toFixed(2),
      total.toFixed(2),
      inv.status,
    ];
    return cols.join(",");
  });

  const csv = [header, ...lines].join("\r\n");
  const filename = month ? `saga-${month}.csv` : `saga-export.csv`;

  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  return c.text(csv);
});

// ──────────────────────────────────────────────────────────────────────────────
// EFMD: SIA e-Factura Moldova (SFS) — transmitere semiautomatizată
// Fără credențiale (EFACTURA_MD_USERNAME/PASSWORD) clientul rulează în mock
// mode cu răspunsuri simulate, ca fluxul să fie testabil cu date de test.
// ──────────────────────────────────────────────────────────────────────────────

/** Statusuri SFS terminale — nu mai au nevoie de sync. */
const EFMD_TERMINAL_STATUSES = [2, 3, 5, 6];

const submitEfacturaMdSchema = z.object({
  /** IDNO-ul cumpărătorului (13 cifre). Default: IDNO de test SFS. */
  buyerIdno: z
    .string()
    .regex(/^\d{13}$/, "IDNO trebuie să aibă 13 cifre")
    .default("1002600003354"),
  /** Cota TVA aplicată (Moldova standard 20%). */
  vatRate: z.number().int().min(0).max(20).default(20),
});

// POST /api/invoices/efactura-md/sync
// Re-verifică la SFS statusul tuturor facturilor transmise ne-terminale.
invoiceRoutes.post("/efactura-md/sync", async (c) => {
  const tenantId = c.get("user").tenantId;
  const client = new EfacturaMdClient();

  const pending = await db
    .select({
      id: invoices.id,
      seria: invoices.efacturaMdSeria,
      number: invoices.efacturaMdNumber,
      status: invoices.efacturaMdStatus,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        isNotNull(invoices.efacturaMdSeria),
        notInArray(invoices.efacturaMdStatus, EFMD_TERMINAL_STATUSES)
      )
    );

  const items: Array<{
    id: string;
    seria: string;
    number: string;
    invoiceStatus: number;
    invoiceStatusLabel: string;
  }> = [];

  for (const inv of pending) {
    if (!inv.seria || !inv.number) continue;
    try {
      const result = await client.checkInvoiceStatus(inv.seria, inv.number, randomUUID());
      if (!result) continue;
      await db
        .update(invoices)
        .set({
          efacturaMdStatus: result.invoiceStatus,
          efacturaMdMessage: result.message,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, inv.id), eq(invoices.tenantId, tenantId)));
      items.push({
        id: inv.id,
        seria: result.seria,
        number: result.number,
        invoiceStatus: result.invoiceStatus,
        invoiceStatusLabel: result.invoiceStatusLabel,
      });
    } catch (err) {
      if (err instanceof EfacturaMdError) {
        await db
          .update(invoices)
          .set({ efacturaMdMessage: err.message, updatedAt: new Date() })
          .where(and(eq(invoices.id, inv.id), eq(invoices.tenantId, tenantId)));
      } else {
        throw err;
      }
    }
  }

  return c.json({ checked: pending.length, synced: items.length, mock: client.isMock, items });
});

// GET /api/invoices/efactura-md/taxpayer/:idno
// Validează IDNO-ul cumpărătorului la SFS înainte de emitere.
invoiceRoutes.get("/efactura-md/taxpayer/:idno", async (c) => {
  const idno = c.req.param("idno");
  if (!/^\d{13}$/.test(idno)) {
    return c.json({ error: "invalid_idno", message: "IDNO trebuie să aibă 13 cifre" }, 400);
  }
  const client = new EfacturaMdClient();
  try {
    const info = await client.getTaxpayerInfo(idno, randomUUID());
    if (!info) return c.json({ error: "not_found" }, 404);
    return c.json({ ...info, mock: client.isMock });
  } catch (err) {
    if (err instanceof EfacturaMdError) {
      return c.json({ error: "sfs_error", message: err.message }, 502);
    }
    throw err;
  }
});

// POST /api/invoices/:id/efactura-md
// Generează XML-ul SFS și transmite factura (nesemnată) prin PostInvoices.
// Semnarea se face apoi manual în web UI-ul SFS (flux semiautomatizat).
invoiceRoutes.post(
  "/:id/efactura-md",
  zValidator("json", submitEfacturaMdSchema),
  async (c) => {
    const id = c.req.param("id");
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

    const [inv] = await db
      .select({
        id: invoices.id,
        number: invoices.number,
        invoiceNumber: invoices.invoiceNumber,
        issueDate: invoices.issueDate,
        amountCents: invoices.amountCents,
        currency: invoices.currency,
        status: invoices.status,
        notes: invoices.notes,
        efacturaMdSeria: invoices.efacturaMdSeria,
        studentName: students.fullName,
      })
      .from(invoices)
      .innerJoin(students, eq(invoices.studentId, students.id))
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));

    if (!inv) return c.json({ error: "not_found" }, 404);
    if (inv.status === "cancelled") return c.json({ error: "invoice_cancelled" }, 409);
    if (inv.efacturaMdSeria) return c.json({ error: "already_submitted" }, 409);

    const client = new EfacturaMdClient();
    const { seria, number } = deriveSfsIdentifier(inv.number);
    const requestId = randomUUID();

    // Suma e considerată cu TVA inclus; baza = total / (1 + cota/100)
    const totalWithVat = inv.amountCents / 100;
    const unitPriceWithoutVat = +(totalWithVat / (1 + body.vatRate / 100)).toFixed(2);

    const xml = generateSfsInvoiceXml({
      supplierIdno: client.supplierIdno,
      supplierBankAccount: client.supplierBankAccount,
      buyerIdno: body.buyerIdno,
      deliveryDate: inv.issueDate,
      internalId: inv.invoiceNumber,
      lines: [
        {
          code: "1",
          name: inv.notes ?? `Servicii educaționale — ${inv.studentName}`,
          unitOfMeasure: "buc",
          quantity: 1,
          unitPriceWithoutVat,
          vatRate: body.vatRate,
        },
      ],
    });

    try {
      const result = await client.postInvoices(xml, requestId);
      if (result.totalInvoicesPosted < 1) {
        return c.json(
          { error: "sfs_rejected", message: result.errorMessage ?? "factura nu a fost acceptată" },
          502
        );
      }

      await db
        .update(invoices)
        .set({
          efacturaMdSeria: seria,
          efacturaMdNumber: number,
          efacturaMdStatus: 0, // Draft la SFS — așteaptă semnare manuală în web UI
          efacturaMdRequestId: requestId,
          efacturaMdSubmittedAt: new Date(),
          efacturaMdMessage: null,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));

      return c.json({
        ok: true,
        seria,
        number,
        requestId,
        mock: client.isMock,
        invoiceStatus: 0,
        invoiceStatusLabel: EFACTURA_MD_STATUS[0],
        message: client.isMock
          ? "Transmis în mod TEST (mock) — configurează EFACTURA_MD_USERNAME/PASSWORD pentru SFS real"
          : "Transmis la SFS — semnează factura în cabinetul e-Factura",
      });
    } catch (err) {
      if (err instanceof EfacturaMdError) {
        return c.json({ error: "sfs_error", message: err.message }, 502);
      }
      throw err;
    }
  }
);

// POST /api/invoices/:id/efactura-md/cancel
// Transmite anularea facturii la SFS (PostCanceledInvoices).
invoiceRoutes.post(
  "/:id/efactura-md/cancel",
  zValidator("json", z.object({ comment: z.string().max(500).default("Anulare din Vector Learn") })),
  async (c) => {
    const id = c.req.param("id");
    const tenantId = c.get("user").tenantId;
    const { comment } = c.req.valid("json");

    const [inv] = await db
      .select({
        id: invoices.id,
        seria: invoices.efacturaMdSeria,
        number: invoices.efacturaMdNumber,
      })
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));

    if (!inv) return c.json({ error: "not_found" }, 404);
    if (!inv.seria || !inv.number) return c.json({ error: "not_submitted" }, 409);

    const client = new EfacturaMdClient();
    try {
      const result = await client.cancelInvoice(inv.seria, inv.number, comment, randomUUID());
      if (!result.ok) {
        return c.json(
          { error: "sfs_cancel_failed", message: result.message ?? "anulare refuzată" },
          502
        );
      }
      await db
        .update(invoices)
        .set({
          efacturaMdStatus: 5, // Anulat de Furnizor
          efacturaMdMessage: comment,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));

      return c.json({ ok: true, mock: client.isMock, invoiceStatusLabel: EFACTURA_MD_STATUS[5] });
    } catch (err) {
      if (err instanceof EfacturaMdError) {
        return c.json({ error: "sfs_error", message: err.message }, 502);
      }
      throw err;
    }
  }
);

// GET /api/invoices/:id/efactura
// Generates UBL 2.1 XML for the invoice, sets efactura_status = 'pending'.
// Matches AFTER /export/saga-csv to avoid route shadowing.
invoiceRoutes.get("/:id/efactura", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const [inv] = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      amountCents: invoices.amountCents,
      currency: invoices.currency,
      status: invoices.status,
      notes: invoices.notes,
      studentName: students.fullName,
    })
    .from(invoices)
    .innerJoin(students, eq(invoices.studentId, students.id))
    .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));

  if (!inv) return c.json({ error: "not_found" }, 404);

  // Generate XML
  const xml = generateUBL21({
    invoiceNumber: inv.invoiceNumber,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate ?? undefined,
    amountCents: inv.amountCents,
    currency: inv.currency,
    studentName: inv.studentName,
    notes: inv.notes ?? undefined,
  });

  // Mark as pending e-factura
  await db
    .update(invoices)
    .set({ efacturaStatus: "pending", updatedAt: new Date() })
    .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));

  c.header("Content-Type", "application/xml; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="${inv.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.xml"`
  );
  return c.text(xml);
});
