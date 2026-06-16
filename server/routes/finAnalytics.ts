/**
 * FinDesk Insights — /api/analytics/fin/*
 *
 * Backs the FinInsightsPage (#/business/fin/ledger). These endpoints were referenced by
 * src/lib/api/finInsight.ts but never had a server route (the page shipped with mocked
 * tests), so the page showed raw "http_404" text. This serves the widgets from real
 * FinDesk data (invoices, expenses) plus the existing finSavedViews / finNarratives tables.
 *
 * Mounted at /api/analytics/fin (see server/app.ts).
 *
 * Routes:
 *   GET    /api/analytics/fin/metrics            — revenue / receivable / profit per month
 *   GET    /api/analytics/fin/aging              — receivable aging buckets (0-30 … 90+)
 *   GET    /api/analytics/fin/cashflow-forecast  — naive 30-day cumulative projection
 *   GET    /api/analytics/fin/saved-views        — list saved views
 *   POST   /api/analytics/fin/saved-views        — create a saved view
 *   GET    /api/analytics/fin/narratives         — list monthly narratives
 *
 * Tenant safety: every query filters by user.tenantId.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { finInvoices } from "../db/schema/finInvoices";
import { finExpenses } from "../db/schema/finExpenses";
import { finSavedViews, finNarratives } from "../db/schema/finInsight";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finAnalyticsRoutes = new Hono<{ Variables: AuthVariables }>();
finAnalyticsRoutes.use("*", requireAuth);

/**
 * GET /metrics — revenue (paid invoices), receivable (issued/overdue), profit
 * (revenue − expenses), grouped by YYYY-MM. Last 6 months by default.
 */
finAnalyticsRoutes.get("/metrics", async (c) => {
  const user = c.get("user");
  const period = c.req.query("period") ?? "last_6m";
  const monthsBack = period === "last_3m" ? 3 : period === "ytd" ? 12 : 6;

  // Revenue + receivable per month from invoices
  const invoiceRows = await db
    .select({
      month: sql<string>`to_char(${finInvoices.createdAt}, 'YYYY-MM')`,
      paid: sql<number>`coalesce(sum(case when ${finInvoices.status} = 'paid' then ${finInvoices.totalCents} else 0 end), 0)::int`,
      receivable: sql<number>`coalesce(sum(case when ${finInvoices.status} in ('issued','overdue') then ${finInvoices.totalCents} else 0 end), 0)::int`,
    })
    .from(finInvoices)
    .where(eq(finInvoices.tenantId, user.tenantId))
    .groupBy(sql`to_char(${finInvoices.createdAt}, 'YYYY-MM')`);

  // Expenses per month
  const expenseRows = await db
    .select({
      month: sql<string>`to_char(${finExpenses.expenseDate}, 'YYYY-MM')`,
      spent: sql<number>`coalesce(sum(${finExpenses.amountCents}), 0)::int`,
    })
    .from(finExpenses)
    .where(and(eq(finExpenses.tenantId, user.tenantId), ne(finExpenses.status, "rejected")))
    .groupBy(sql`to_char(${finExpenses.expenseDate}, 'YYYY-MM')`);

  const expByMonth = new Map(expenseRows.map((r) => [r.month, Number(r.spent)]));

  // Build a continuous month list (most recent monthsBack months)
  const now = new Date();
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const invByMonth = new Map(invoiceRows.map((r) => [r.month, r]));

  const metrics = months.map((m) => {
    const inv = invByMonth.get(m);
    const revenue = Number(inv?.paid ?? 0);
    const receivable = Number(inv?.receivable ?? 0);
    const spent = expByMonth.get(m) ?? 0;
    return { period: m, revenue, receivable, profit: revenue - spent };
  });

  return c.json({ metrics, period, groupBy: "month" });
});

/**
 * GET /aging — receivable aging buckets from unpaid (issued/overdue) invoices,
 * bucketed by how overdue the due_date is.
 */
finAnalyticsRoutes.get("/aging", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select({
      b0_30: sql<number>`coalesce(sum(case when (current_date - ${finInvoices.dueDate}) between 0 and 30 then ${finInvoices.totalCents} else 0 end), 0)::int`,
      b31_60: sql<number>`coalesce(sum(case when (current_date - ${finInvoices.dueDate}) between 31 and 60 then ${finInvoices.totalCents} else 0 end), 0)::int`,
      b61_90: sql<number>`coalesce(sum(case when (current_date - ${finInvoices.dueDate}) between 61 and 90 then ${finInvoices.totalCents} else 0 end), 0)::int`,
      b90: sql<number>`coalesce(sum(case when (current_date - ${finInvoices.dueDate}) > 90 then ${finInvoices.totalCents} else 0 end), 0)::int`,
    })
    .from(finInvoices)
    .where(
      and(
        eq(finInvoices.tenantId, user.tenantId),
        sql`${finInvoices.status} in ('issued','overdue')`,
        sql`${finInvoices.dueDate} is not null`
      )
    );

  const r = rows[0] ?? { b0_30: 0, b31_60: 0, b61_90: 0, b90: 0 };
  const aging = {
    "0_30": Number(r.b0_30),
    "31_60": Number(r.b31_60),
    "61_90": Number(r.b61_90),
    "90_plus": Number(r.b90),
    total: Number(r.b0_30) + Number(r.b31_60) + Number(r.b61_90) + Number(r.b90),
  };
  return c.json({ aging });
});

/**
 * GET /cashflow-forecast — naive 30-day cumulative projection from the trailing
 * weekly average net cashflow (paid invoices − expenses, last 12 weeks).
 */
finAnalyticsRoutes.get("/cashflow-forecast", async (c) => {
  const user = c.get("user");

  const [inflowRow] = await db
    .select({ total: sql<number>`coalesce(sum(${finInvoices.totalCents}), 0)::int` })
    .from(finInvoices)
    .where(
      and(
        eq(finInvoices.tenantId, user.tenantId),
        eq(finInvoices.status, "paid"),
        sql`${finInvoices.createdAt} >= current_date - interval '84 days'`
      )
    );
  const [outflowRow] = await db
    .select({ total: sql<number>`coalesce(sum(${finExpenses.amountCents}), 0)::int` })
    .from(finExpenses)
    .where(
      and(
        eq(finExpenses.tenantId, user.tenantId),
        ne(finExpenses.status, "rejected"),
        sql`${finExpenses.expenseDate} >= current_date - interval '84 days'`
      )
    );

  const netOver12w = Number(inflowRow?.total ?? 0) - Number(outflowRow?.total ?? 0);
  const weeklyAvgCents = Math.round(netOver12w / 12);
  const dailyBase = weeklyAvgCents / 7;

  const today = new Date();
  const mk = (factor: number) => {
    const out = [];
    let cum = 0;
    for (let i = 0; i <= 30; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      cum += dailyBase * factor;
      out.push({ date: d.toISOString().slice(0, 10), cumulativeCents: Math.round(cum) });
    }
    return out;
  };

  return c.json({
    scenarios: { good: mk(1.2), base: mk(1.0), pessimistic: mk(0.7) },
    weeklyAvgCents,
    generatedAt: new Date().toISOString(),
  });
});

/** GET /saved-views — list this tenant's saved views (own + public). */
finAnalyticsRoutes.get("/saved-views", async (c) => {
  const user = c.get("user");
  const views = await db
    .select()
    .from(finSavedViews)
    .where(eq(finSavedViews.tenantId, user.tenantId))
    .orderBy(desc(finSavedViews.updatedAt));
  return c.json({ views });
});

const createSavedViewSchema = z.object({
  name: z.string().min(1).max(200),
  metric: z.enum(["revenue", "expenses", "profit", "vat", "cashflow"]),
  period: z.enum(["this_month", "last_month", "last_3m", "last_6m", "ytd", "custom"]).optional(),
  groupBy: z.enum(["day", "week", "month", "category"]).optional(),
  filters: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

/** POST /saved-views — create a saved view. */
finAnalyticsRoutes.post("/saved-views", zValidator("json", createSavedViewSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const [view] = await db
    .insert(finSavedViews)
    .values({
      tenantId: user.tenantId,
      userId: user.id,
      name: body.name,
      metric: body.metric,
      period: body.period ?? "this_month",
      groupBy: body.groupBy ?? "month",
      filters: (body.filters ?? {}) as Record<string, unknown>,
      isDefault: body.isDefault ?? false,
      isPublic: body.isPublic ?? false,
    })
    .returning();
  return c.json({ view }, 201);
});

/** GET /narratives — list monthly narratives for this tenant. */
finAnalyticsRoutes.get("/narratives", async (c) => {
  const user = c.get("user");
  const narratives = await db
    .select()
    .from(finNarratives)
    .where(eq(finNarratives.tenantId, user.tenantId))
    .orderBy(desc(finNarratives.month));
  return c.json({ narratives });
});
