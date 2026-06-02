/**
 * PAY-007: Refund routes.
 *
 * POST /api/invoices/:id/refund   — process a partial or full refund
 * GET  /api/refunds               — list all refunds for tenant (with month/status filters)
 * GET  /api/invoices/:id/refunds  — list refunds for a specific invoice
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { invoices, refunds, stripeSettings } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { buildStripeClient, decryptKey, createStripeRefund } from "../lib/stripe";
import { writeAuditLog } from "../lib/auditLogger";

export const refundRoutes = new Hono<{ Variables: AuthVariables }>();

refundRoutes.use("*", requireAuth);

// ─── POST /api/invoices/:id/refund ───────────────────────────────────────────

const refundSchema = z.object({
  amount_cents: z.number().int().positive({ message: "Amount must be positive" }),
  reason: z.string().min(1, { message: "Reason is required" }).max(1000),
});

refundRoutes.post("/invoices/:id/refund", zValidator("json", refundSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const invoiceId = c.req.param("id");
  const { amount_cents: amountCents, reason } = c.req.valid("json");

  // Load invoice
  const [invoice] = await db
    .select({
      id: invoices.id,
      tenantId: invoices.tenantId,
      amountCents: invoices.amountCents,
      currency: invoices.currency,
      status: invoices.status,
      refundedAmountCents: invoices.refundedAmountCents,
      stripePaymentIntentId: invoices.stripePaymentIntentId,
    })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));

  if (!invoice) {
    return c.json({ error: "not_found" }, 404);
  }

  // Guard: invoice must be paid (or partially_refunded) to allow refund
  if (invoice.status !== "paid" && invoice.status !== "partially_refunded") {
    return c.json({ error: "invoice_not_paid" }, 400);
  }

  // Guard: refund must not exceed the remaining paid amount
  const alreadyRefunded = invoice.refundedAmountCents ?? 0;
  const maxRefundable = invoice.amountCents - alreadyRefunded;

  if (amountCents > maxRefundable) {
    return c.json({ error: "refund_exceeds_paid", max_refundable_cents: maxRefundable }, 400);
  }

  // Determine method
  const isStripe = !!invoice.stripePaymentIntentId;
  let stripeRefundId: string | null = null;
  let refundStatus: "completed" | "failed" | "pending" = "completed";

  if (isStripe) {
    // Try Stripe refund
    const settingsRows = await db
      .select()
      .from(stripeSettings)
      .where(and(eq(stripeSettings.tenantId, tenantId), eq(stripeSettings.enabled, true)))
      .limit(1);
    const settings = settingsRows[0];

    if (settings?.secretKeyEncrypted) {
      try {
        const stripe = buildStripeClient(decryptKey(settings.secretKeyEncrypted));
        const result = await createStripeRefund(stripe, {
          paymentIntentId: invoice.stripePaymentIntentId!,
          amountCents,
          reason,
        });
        stripeRefundId = result.refundId;
        refundStatus = "completed";
      } catch (err) {
        // Stripe refund failed — record as failed but don't block (manual follow-up)
        refundStatus = "failed";
      }
    }
  }

  // Calculate new refunded amount and status
  const newRefundedAmount = alreadyRefunded + amountCents;
  const newStatus =
    newRefundedAmount >= invoice.amountCents ? "refunded" : "partially_refunded";

  // Insert refund record
  const [createdRefund] = await db
    .insert(refunds)
    .values({
      tenantId,
      invoiceId,
      amountCents,
      currency: invoice.currency,
      reason,
      method: isStripe ? "stripe" : "manual",
      stripeRefundId,
      processedBy: userId ?? null,
      status: refundStatus,
    })
    .returning();

  // Update invoice: new refunded amount + new status
  await db
    .update(invoices)
    .set({
      refundedAmountCents: newRefundedAmount,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));

  // Audit log
  await writeAuditLog({
    tenantId,
    actorId: userId ?? null,
    actionType: "refund_processed",
    targetType: "invoice",
    targetId: invoiceId,
    newValue: {
      invoice_id: invoiceId,
      amount: amountCents,
      reason,
      method: isStripe ? "stripe" : "manual",
      stripe_refund_id: stripeRefundId,
      new_status: newStatus,
    },
  });

  return c.json(
    {
      refund: createdRefund,
      invoice_status: newStatus,
      refunded_amount_cents: newRefundedAmount,
    },
    201
  );
});

// ─── GET /api/refunds — list all refunds for tenant ──────────────────────────

refundRoutes.get("/refunds", async (c) => {
  const tenantId = c.get("user").tenantId;
  const month = c.req.query("month"); // YYYY-MM
  const status = c.req.query("status") as
    | "pending"
    | "completed"
    | "failed"
    | undefined;

  const conditions = [eq(refunds.tenantId, tenantId)];

  if (status && ["pending", "completed", "failed"].includes(status)) {
    conditions.push(eq(refunds.status, status));
  }

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yr, mo] = month.split("-").map(Number);
    const start = new Date(yr, (mo as number) - 1, 1);
    const end = new Date(yr, mo as number, 1);
    conditions.push(
      sql`${refunds.processedAt} >= ${start.toISOString()} AND ${refunds.processedAt} < ${end.toISOString()}`
    );
  }

  const rows = await db
    .select()
    .from(refunds)
    .where(and(...conditions))
    .orderBy(desc(refunds.processedAt));

  return c.json({ items: rows });
});

// ─── GET /api/invoices/:id/refunds — list refunds for one invoice ─────────────

refundRoutes.get("/invoices/:id/refunds", async (c) => {
  const tenantId = c.get("user").tenantId;
  const invoiceId = c.req.param("id");

  // Verify invoice belongs to tenant
  const [inv] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));

  if (!inv) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select()
    .from(refunds)
    .where(and(eq(refunds.invoiceId, invoiceId), eq(refunds.tenantId, tenantId)))
    .orderBy(desc(refunds.processedAt));

  return c.json({ items: rows });
});
