/**
 * PAY-008: Accounting export routes.
 *
 * GET  /api/accounting/export?month=YYYY-MM&format=saga|1c  — download CSV
 * GET  /api/accounting/summary?month=YYYY-MM               — preview count + totals
 * GET  /api/accounting/mappings                            — list tenant mappings
 * POST /api/accounting/mappings                            — create/upsert mapping
 * PUT  /api/accounting/mappings/:id                        — update mapping
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  payments,
  refunds,
  payrollEntries,
  accountingMappings,
  invoices,
  teachers,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  generateSagaCsv,
  generate1cCsv,
  applyDescriptionTemplate,
  type AccountingRow,
} from "../lib/accountingExport";

export const accountingRoutes = new Hono<{ Variables: AuthVariables }>();
accountingRoutes.use("*", requireAuth);

// ─── Default account codes (fallback if no mapping configured) ───────────────
const DEFAULT_CODES: Record<string, { code: string; template: string }> = {
  payment: { code: "704", template: "Taxă curs — {description}" },
  refund: { code: "704", template: "Rambursare — {description}" },
  payout: { code: "421", template: "Salariu — {partner}" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function monthRange(month: string): { start: Date; end: Date } {
  const [yr, mo] = month.split("-").map(Number);
  return {
    start: new Date(yr, (mo as number) - 1, 1),
    end: new Date(yr, mo as number, 1),
  };
}

function formatDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

// ─── GET /api/accounting/export ──────────────────────────────────────────────

accountingRoutes.get("/accounting/export", async (c) => {
  const tenantId = c.get("user").tenantId;
  const month = c.req.query("month") ?? "";
  const format = (c.req.query("format") ?? "saga") as "saga" | "1c";

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month param required (YYYY-MM)" }, 400);
  }

  const { start, end } = monthRange(month);

  // Load mappings
  const mappingRows = await db
    .select()
    .from(accountingMappings)
    .where(eq(accountingMappings.tenantId, tenantId));

  const mappingFor = (type: "payment" | "refund" | "payout") => {
    const m = mappingRows.find((r) => r.transactionType === type);
    return m ?? { accountCode: DEFAULT_CODES[type].code, descriptionTemplate: DEFAULT_CODES[type].template };
  };

  const rows: AccountingRow[] = [];

  // 1. Payments for this month
  const payRows = await db
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      currency: payments.currency,
      description: payments.description,
      paidAt: payments.paidAt,
      studentId: payments.studentId,
    })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        sql`${payments.paidAt} >= ${start.toISOString()} AND ${payments.paidAt} < ${end.toISOString()}`
      )
    );

  const payMap = mappingFor("payment");
  for (const p of payRows) {
    rows.push({
      date: formatDate(p.paidAt ?? new Date()),
      type: "PL",
      accountCode: payMap.accountCode,
      description: applyDescriptionTemplate(payMap.descriptionTemplate, {
        description: p.description ?? "Plată",
        partner: p.studentId ?? "",
        document: p.id.slice(0, 8),
      }),
      amountCents: p.amountCents,
      currency: p.currency ?? "RON",
      documentNumber: p.id.slice(0, 8).toUpperCase(),
      partner: p.studentId ?? "",
    });
  }

  // 2. Refunds for this month
  const refundRows = await db
    .select({
      id: refunds.id,
      amountCents: refunds.amountCents,
      currency: refunds.currency,
      reason: refunds.reason,
      processedAt: refunds.processedAt,
      invoiceId: refunds.invoiceId,
    })
    .from(refunds)
    .where(
      and(
        eq(refunds.tenantId, tenantId),
        sql`${refunds.processedAt} >= ${start.toISOString()} AND ${refunds.processedAt} < ${end.toISOString()}`
      )
    );

  const refMap = mappingFor("refund");
  for (const r of refundRows) {
    rows.push({
      date: formatDate(r.processedAt),
      type: "NC",
      accountCode: refMap.accountCode,
      description: applyDescriptionTemplate(refMap.descriptionTemplate, {
        description: r.reason,
        document: r.invoiceId?.slice(0, 8) ?? "",
      }),
      amountCents: -(r.amountCents), // negative for NC
      currency: r.currency,
      documentNumber: r.id.slice(0, 8).toUpperCase(),
      partner: r.invoiceId?.slice(0, 8) ?? "",
    });
  }

  // 3. Payroll payouts for this month (status = 'paid')
  const payoutRows = await db
    .select({
      id: payrollEntries.id,
      totalCents: payrollEntries.totalCents,
      month: payrollEntries.month,
      teacherId: payrollEntries.teacherId,
      teacherName: teachers.fullName,
    })
    .from(payrollEntries)
    .innerJoin(teachers, eq(teachers.id, payrollEntries.teacherId))
    .where(
      and(
        eq(payrollEntries.tenantId, tenantId),
        eq(payrollEntries.month, month),
        eq(payrollEntries.status, "paid")
      )
    );

  const payoutMap = mappingFor("payout");
  for (const po of payoutRows) {
    rows.push({
      date: formatDate(new Date(Number(po.month.slice(0, 4)), Number(po.month.slice(5, 7)) - 1, 28)), // end of month approx
      type: "DP",
      accountCode: payoutMap.accountCode,
      description: applyDescriptionTemplate(payoutMap.descriptionTemplate, {
        partner: po.teacherName,
        document: po.id.slice(0, 8),
      }),
      amountCents: -(po.totalCents), // negative (expense)
      currency: "RON",
      documentNumber: po.id.slice(0, 8).toUpperCase(),
      partner: po.teacherName,
    });
  }

  // Sort by date
  rows.sort((a, b) => a.date.localeCompare(b.date));

  if (format === "1c") {
    const csv = generate1cCsv(rows);
    const filename = `accounting-${month}-1c.txt`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // Default: SAGA CSV
  const csv = generateSagaCsv(rows);
  const filename = `accounting-${month}-saga.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

// ─── GET /api/accounting/summary ─────────────────────────────────────────────

accountingRoutes.get("/accounting/summary", async (c) => {
  const tenantId = c.get("user").tenantId;
  const month = c.req.query("month") ?? "";

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month param required (YYYY-MM)" }, 400);
  }

  const { start, end } = monthRange(month);

  // Sum payments
  const payResult = await db
    .select({ total: sql<number>`COALESCE(SUM(amount_cents), 0)`, count: sql<number>`COUNT(*)` })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        sql`${payments.paidAt} >= ${start.toISOString()} AND ${payments.paidAt} < ${end.toISOString()}`
      )
    );

  // Sum refunds
  const refResult = await db
    .select({ total: sql<number>`COALESCE(SUM(amount_cents), 0)`, count: sql<number>`COUNT(*)` })
    .from(refunds)
    .where(
      and(
        eq(refunds.tenantId, tenantId),
        sql`${refunds.processedAt} >= ${start.toISOString()} AND ${refunds.processedAt} < ${end.toISOString()}`
      )
    );

  // Sum payouts
  const payoutResult = await db
    .select({ total: sql<number>`COALESCE(SUM(total_cents), 0)`, count: sql<number>`COUNT(*)` })
    .from(payrollEntries)
    .where(
      and(
        eq(payrollEntries.tenantId, tenantId),
        eq(payrollEntries.month, month),
        eq(payrollEntries.status, "paid")
      )
    );

  const r = Array.isArray(payResult) ? payResult[0] : (payResult as { rows: typeof payResult }[] )[0];
  const refR = Array.isArray(refResult) ? refResult[0] : (refResult as { rows: typeof refResult }[])[0];
  const poR = Array.isArray(payoutResult) ? payoutResult[0] : (payoutResult as { rows: typeof payoutResult }[])[0];

  const income = Number(r?.total ?? 0);
  const refundTotal = Number(refR?.total ?? 0);
  const payouts = Number(poR?.total ?? 0);
  const net = income - refundTotal - payouts;
  const transactionsCount =
    Number(r?.count ?? 0) + Number(refR?.count ?? 0) + Number(poR?.count ?? 0);

  return c.json({ income, refunds: refundTotal, payouts, net, transactions_count: transactionsCount });
});

// ─── GET /api/accounting/mappings ─────────────────────────────────────────────

accountingRoutes.get("/accounting/mappings", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select()
    .from(accountingMappings)
    .where(eq(accountingMappings.tenantId, tenantId));
  return c.json({ items: rows });
});

// ─── POST /api/accounting/mappings ────────────────────────────────────────────

const mappingSchema = z.object({
  transactionType: z.enum(["payment", "refund", "payout"]),
  accountCode: z.string().min(1).max(30),
  descriptionTemplate: z.string().max(500).optional(),
});

accountingRoutes.post(
  "/accounting/mappings",
  zValidator("json", mappingSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { transactionType, accountCode, descriptionTemplate } = c.req.valid("json");

    // Upsert: delete existing for same type, then insert
    await db
      .delete(accountingMappings)
      .where(
        and(
          eq(accountingMappings.tenantId, tenantId),
          eq(accountingMappings.transactionType, transactionType)
        )
      );

    const [created] = await db
      .insert(accountingMappings)
      .values({
        tenantId,
        transactionType,
        accountCode,
        descriptionTemplate: descriptionTemplate ?? "{description}",
      })
      .returning();

    return c.json(created, 201);
  }
);

// ─── PUT /api/accounting/mappings/:id ─────────────────────────────────────────

const mappingUpdateSchema = z.object({
  accountCode: z.string().min(1).max(30).optional(),
  descriptionTemplate: z.string().max(500).optional(),
});

accountingRoutes.put(
  "/accounting/mappings/:id",
  zValidator("json", mappingUpdateSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const patch = c.req.valid("json");

    const [updated] = await db
      .update(accountingMappings)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(accountingMappings.id, id),
          eq(accountingMappings.tenantId, tenantId)
        )
      )
      .returning();

    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(updated);
  }
);
