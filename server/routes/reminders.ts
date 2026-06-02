/**
 * PAY-005: Reminder endpoints.
 *
 * POST /api/admin/run-reminders         — manual trigger (for testing + cron)
 * GET  /api/invoices/:id/reminders      — list reminders sent for an invoice
 * GET  /api/payments/overdue-summary    — count + amount of overdue invoices by day bucket
 */
import { Hono } from "hono";
import { eq, and, lt } from "drizzle-orm";
import { db } from "../db/client";
import { invoiceReminders, invoices } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { runReminders } from "../lib/reminderCron";

export const reminderRoutes = new Hono<{ Variables: AuthVariables }>();

reminderRoutes.use("*", requireAuth);

/** POST /api/admin/run-reminders — trigger reminder cron manually */
reminderRoutes.post("/admin/run-reminders", async (c) => {
  try {
    const result = await runReminders();
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : "cron_error" },
      500
    );
  }
});

/** GET /api/invoices/:id/reminders — list reminder history for an invoice */
reminderRoutes.get("/invoices/:id/reminders", async (c) => {
  const tenantId = c.get("user").tenantId;
  const invoiceId = c.req.param("id");

  // Verify invoice belongs to tenant
  const [inv] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
    .limit(1);

  if (!inv) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select()
    .from(invoiceReminders)
    .where(eq(invoiceReminders.invoiceId, invoiceId))
    .orderBy(invoiceReminders.reminderDay);

  return c.json({ items: rows });
});

/** GET /api/payments/overdue-summary — aggregate overdue invoices by day bucket */
reminderRoutes.get("/payments/overdue-summary", async (c) => {
  const tenantId = c.get("user").tenantId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = [3, 7, 14] as const;
  const byDaysBucket: Record<number, number> = {};
  let totalCount = 0;
  let totalAmount = 0;

  for (const days of buckets) {
    const threshold = new Date(today);
    threshold.setDate(threshold.getDate() - days);

    const rows = await db
      .select({ id: invoices.id, amountCents: invoices.amountCents })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.status, "issued"),
          lt(invoices.dueDate, threshold)
        )
      );

    byDaysBucket[days] = rows.length;
    if (days === 3) {
      // 3-day bucket is the base (all overdue ≥ 3 days)
      totalCount = rows.length;
      totalAmount = rows.reduce((sum, r) => sum + r.amountCents, 0);
    }
  }

  return c.json({ count: totalCount, totalAmount, byDaysBucket });
});
