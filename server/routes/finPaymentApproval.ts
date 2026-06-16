/**
 * APPROVAL-001/002: FIN payment approval — link payments to PAR workflow
 * Mounted in server/app.ts
 *
 * Routes:
 *   GET  /api/payments/pending-approval → payments needing PAR approval
 *   POST /api/payments/:id/link-par     → link an approved PAR to a payment
 *
 * Validator injected into the payments PATCH route (imported from here):
 *   checkApprovalRequired(payment, newStatus)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray, gte, isNull, desc } from "drizzle-orm";
import { db } from "../db/client";
import { payments } from "../db/schema/payments";
import { students } from "../db/schema/students";
import { parRequests, parSettings } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finPaymentApprovalRoutes = new Hono<{ Variables: AuthVariables }>();
finPaymentApprovalRoutes.use("*", requireAuth);

/** Default approval threshold: 5,000 MDL = 500,000 cents */
const DEFAULT_THRESHOLD_CENTS = 500_000;

// ─── GET /api/payments/pending-approval ──────────────────────────────────────
// APPROVAL-002: Returns payments that need PAR approval
// (status pending/overdue, amount_cents >= threshold, no linked approved PAR)

finPaymentApprovalRoutes.get("/pending-approval", async (c) => {
  const tenantId = c.get("tenantId") as string;

  // Resolve threshold
  let thresholdCents = DEFAULT_THRESHOLD_CENTS;
  try {
    const [settings] = await db
      .select({ microPurchaseThresholdCents: parSettings.microPurchaseThresholdCents })
      .from(parSettings)
      .where(eq(parSettings.tenantId, tenantId));
    if (settings?.microPurchaseThresholdCents) {
      thresholdCents = settings.microPurchaseThresholdCents;
    }
  } catch {
    // no par_settings → use default
  }

  // Fetch payments at/above threshold with pending/overdue status
  const rows = await db
    .select({
      id: payments.id,
      studentId: payments.studentId,
      studentName: students.fullName,
      amountCents: payments.amountCents,
      currency: payments.currency,
      status: payments.status,
      dueDate: payments.dueDate,
      description: payments.description,
      parRequestId: payments.parRequestId,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(students, eq(payments.studentId, students.id))
    .where(
      and(
        eq(payments.tenantId, tenantId),
        inArray(payments.status, ["pending", "overdue"]),
        gte(payments.amountCents, thresholdCents)
      )
    )
    .orderBy(desc(payments.amountCents));

  // Filter out those that already have an approved PAR linked
  const linkedParIds = rows
    .filter((r) => r.parRequestId != null)
    .map((r) => r.parRequestId as string);

  let approvedParIds = new Set<string>();
  if (linkedParIds.length > 0) {
    const approvedPars = await db
      .select({ id: parRequests.id })
      .from(parRequests)
      .where(
        and(
          eq(parRequests.tenantId, tenantId),
          eq(parRequests.status, "approved"),
          inArray(parRequests.id, linkedParIds)
        )
      );
    approvedParIds = new Set(approvedPars.map((p) => p.id));
  }

  const items = rows
    .filter((r) => !r.parRequestId || !approvedParIds.has(r.parRequestId))
    .map((r) => ({
      id: r.id,
      studentId: r.studentId,
      studentName: r.studentName,
      amountCents: r.amountCents,
      currency: r.currency,
      status: r.status,
      dueDate: r.dueDate,
      description: r.description,
      parRequestId: r.parRequestId,
      createdAt: r.createdAt,
    }));

  return c.json({ items, threshold_mdl: thresholdCents / 100 });
});

// ─── POST /api/payments/:id/link-par ─────────────────────────────────────────

const linkParSchema = z.object({
  par_request_id: z.string().uuid(),
});

finPaymentApprovalRoutes.post(
  "/:id/link-par",
  zValidator("json", linkParSchema),
  async (c) => {
    const paymentId = c.req.param("id");
    const tenantId = c.get("tenantId") as string;
    const { par_request_id } = c.req.valid("json");

    // 1. Check payment exists and belongs to this tenant
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)));

    if (!payment) {
      return c.json({ error: "payment_not_found" }, 404);
    }

    // 2. Check PAR exists, belongs to same tenant, and is APPROVED
    const [parRequest] = await db
      .select({
        id: parRequests.id,
        status: parRequests.status,
        tenantId: parRequests.tenantId,
      })
      .from(parRequests)
      .where(
        and(
          eq(parRequests.id, par_request_id),
          eq(parRequests.tenantId, tenantId)
        )
      );

    if (!parRequest) {
      return c.json({ error: "par_not_found" }, 404);
    }

    if (parRequest.status !== "approved") {
      return c.json(
        {
          error: "par_not_approved",
          current_status: parRequest.status,
          message: "PAR must have status 'approved' before it can authorize a payment.",
        },
        422
      );
    }

    // 3. Link the PAR to the payment
    const [updated] = await db
      .update(payments)
      .set({ parRequestId: par_request_id, updatedAt: new Date() })
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
      .returning();

    return c.json({
      id: updated.id,
      par_request_id: updated.parRequestId,
      amount_cents: updated.amountCents,
      status: updated.status,
    });
  }
);

// ─── Helper: approval check (called by payments PATCH route) ─────────────────

/**
 * Returns an error payload if a payment moving to "paid" requires PAR approval
 * but doesn't have one.
 *
 * @returns `null` if approval is not required or is already satisfied.
 * @returns `{ error, threshold_mdl }` object if approval is needed.
 */
export async function checkApprovalRequired(
  tenantId: string,
  paymentId: string,
  newStatus: string
): Promise<{ error: string; threshold_mdl: number } | null> {
  if (newStatus !== "paid") return null;

  // Get the payment with its current par_request_id
  const [payment] = await db
    .select({
      amountCents: payments.amountCents,
      parRequestId: payments.parRequestId,
    })
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)));

  if (!payment) return null;

  // Get tenant's approval threshold (from par_settings.microPurchaseThresholdCents if available)
  let thresholdCents = DEFAULT_THRESHOLD_CENTS;
  try {
    const [settings] = await db
      .select({ microPurchaseThresholdCents: parSettings.microPurchaseThresholdCents })
      .from(parSettings)
      .where(eq(parSettings.tenantId, tenantId));
    if (settings?.microPurchaseThresholdCents) {
      // Use micro-purchase threshold as the approval gate
      thresholdCents = settings.microPurchaseThresholdCents;
    }
  } catch {
    // parSettings not found → use default 5,000 MDL threshold
  }

  if (payment.amountCents < thresholdCents) return null;

  // Amount is above threshold — check if there's an approved PAR
  if (!payment.parRequestId) {
    return {
      error: "approval_required",
      threshold_mdl: thresholdCents / 100,
    };
  }

  // Verify the linked PAR is still approved
  const [par] = await db
    .select({ status: parRequests.status })
    .from(parRequests)
    .where(
      and(
        eq(parRequests.id, payment.parRequestId),
        eq(parRequests.tenantId, tenantId)
      )
    );

  if (!par || par.status !== "approved") {
    return {
      error: "approval_required",
      threshold_mdl: thresholdCents / 100,
    };
  }

  return null;
}
