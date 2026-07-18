/**
 * PAR-112: Finance queue (section 16) + PAR-113: Payment execution + 10% overage rule
 *
 * Routes:
 *   GET  /api/par/finance                         → finance queue (approved execute_payment + in_finance + reapproval_required)
 *   POST /api/par/:id/finance                     → write section 16; PAR → in_finance
 *   POST /api/par/:id/pay                         → record actual payment; 10% rule; PAR → paid or reapproval_required
 *
 * Note: POST /api/par/:id/reapprove lives in parApprovals.ts (it's an approval action).
 *
 * CORE: backlog/par/PAR-CORE.md §0.16, §3 (10% rule), §4 (state machine), §9
 * Mounted in server/app.ts: app.route("/api/par", parPaymentsRoutes)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  parRequests,
  parPayments,
  parAudit,
  parSettings,
  parApprovals,
  parVendors,
  parProjects,
  parBudgetCodes,
  parAttachments,
} from "../db/schema/par";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { notifyPaid } from "../services/par/notify";
import { applyTenRule } from "../lib/par/payment";
import { evaluateMatch } from "../lib/par/threeWayMatch";
import { findVendorByIban, shouldAutoSaveVendor } from "../lib/par/vendorAutoSave";
import { accessiblePayerIds, accessibleProjectIds, mayAccessPayer, mayAccessProject } from "../lib/par/projectScope";

export const parPaymentsRoutes = new Hono<{ Variables: AuthVariables }>();
parPaymentsRoutes.use("*", requireAuth);
parPaymentsRoutes.use("/:id/:action/*", parUuidGuard("id"));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAudit(params: {
  tenantId: string;
  parId: string;
  actorUserId: string;
  event: string;
  detail?: string;
}) {
  await db.insert(parAudit).values({
    tenantId: params.tenantId,
    parId: params.parId,
    actorUserId: params.actorUserId,
    event: params.event,
    detail: params.detail ?? null,
  });
}

/**
 * VM1-05 — auto-save the payee into the reusable vendor registry once a PAR is paid.
 * Violeta: "odată ce va fi plată pentru un anumit prestator, dacă a fost adăugat IBAN
 * și alte chestii, să se autosalveze".
 *
 * Only runs for an inline payee (no vendorId yet) that has an IBAN — the IBAN is the
 * thing worth remembering for next time. Dedup by IBAN within the tenant (no duplicates);
 * if a vendor already exists, link it and backfill any missing details. Best-effort:
 * never throws — the payment has already been recorded by the time this runs.
 * The dedup/normalization logic lives in ../lib/par/vendorAutoSave (unit-tested).
 */
async function autoLinkVendorOnPayment(par: typeof parRequests.$inferSelect, actorUserId: string) {
  try {
    if (!shouldAutoSaveVendor(par)) return;
    const iban = par.payeeIban!.trim();
    const tenantId = par.tenantId;

    // Dedup against existing vendors in this tenant (small list → compare in JS,
    // robust to IBAN formatting differences).
    const existing = await db
      .select()
      .from(parVendors)
      .where(eq(parVendors.tenantId, tenantId));
    const match = findVendorByIban(existing, iban);

    let vendorId: string;
    if (match) {
      vendorId = match.id;
      // Backfill details the registry was missing, without overwriting existing values.
      const patch: Partial<typeof parVendors.$inferInsert> = {};
      if (!match.idnp && par.payeeIdnp) patch.idnp = par.payeeIdnp;
      if (!match.bank && par.payeeBank) patch.bank = par.payeeBank;
      if (Object.keys(patch).length > 0) {
        await db.update(parVendors).set({ ...patch, updatedAt: new Date() }).where(eq(parVendors.id, vendorId));
      }
    } else {
      const [created] = await db
        .insert(parVendors)
        .values({
          tenantId,
          name: par.payeeName?.trim() || "(beneficiar fără nume)",
          idnp: par.payeeIdnp ?? null,
          iban,
          bank: par.payeeBank ?? null,
          active: true,
        })
        .returning({ id: parVendors.id });
      vendorId = created.id;
    }

    // Link the PAR to the registry vendor so it shows the saved payee next time.
    await db
      .update(parRequests)
      .set({ vendorId, updatedAt: new Date() })
      .where(and(eq(parRequests.id, par.id), eq(parRequests.tenantId, tenantId)));

    await writeAudit({
      tenantId,
      parId: par.id,
      actorUserId,
      event: "vendor_autosaved",
      detail: match
        ? `Plătitor legat de registrul de prestatori (existent): ${vendorId}`
        : `Plătitor salvat automat în registrul de prestatori: ${vendorId}`,
    });
  } catch {
    // best-effort — never block a recorded payment on the registry bookkeeping
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const section16Schema = z.object({
  par_bl: z.string().max(200).optional().nullable(),
  received_by_user_id: z.string().uuid().optional().nullable(),
  assigned_to_user_id: z.string().uuid().optional().nullable(),
});

const paySchema = z.object({
  actual_amount_cents: z.number().int().positive("actual_amount_cents must be a positive integer"),
  payment_date: z.string().datetime({ offset: true }).or(z.string().date()),
  // Referința plății este opțională (owner: nu o face obligatorie).
  payment_ref: z.string().max(500).optional().nullable(),
  proof_url: z.string().url().max(2000).optional().nullable(),
});

// ─── GET /api/par/finance ─────────────────────────────────────────────────────
// Finance queue: approved execute_payment PARs + in_finance + reapproval_required.
// obtain_quotations / provide_estimate are intentionally EXCLUDED (they close at 'approved').

parPaymentsRoutes.get("/finance", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const roles = await getUserPARRoles(user.id, tenantId);
  const canView = roles.includes("finance") || roles.includes("par_admin");
  if (!canView) return c.json({ error: "forbidden: finance or par_admin role required" }, 403);

  const [settings] = await db
    .select({
      threshold: parSettings.microPurchaseThresholdCents,
      currency: parSettings.defaultCurrency,
      enforceMatch: parSettings.enforceThreeWayMatch,
    })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));
  const threshold = settings?.threshold ?? 1000000;
  // PARQA-014: surface whether the 3-way match control is active. When OFF (the default),
  // finance is paying without PO/receipt/amount verification — the UI shows a clear warning
  // so nobody assumes a control that isn't running. Default false = no behavior change.
  const threeWayMatchEnforced = settings?.enforceMatch ?? false;

  // Only execute_payment PARs in the relevant statuses
  const rawQueue = await db
    .select()
    .from(parRequests)
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        eq(parRequests.purpose, "execute_payment"),
        inArray(parRequests.status, ["approved", "in_finance", "reapproval_required"])
      )
    );
  const [projectScope, payerScope] = await Promise.all([
    accessibleProjectIds(user.id, tenantId, user.role), accessiblePayerIds(user.id, tenantId, user.role),
  ]);
  const queue = rawQueue.filter((par) => par.projectId
    ? projectScope === null || projectScope.includes(par.projectId)
    : !!par.payerId && (payerScope === null || payerScope.includes(par.payerId)));

  // Attach existing par_payments section-16 data
  const parIds = queue.map((p) => p.id);
  const paymentsMap: Record<string, typeof parPayments.$inferSelect> = {};
  if (parIds.length > 0) {
    const pmts = await db
      .select()
      .from(parPayments)
      .where(and(eq(parPayments.tenantId, tenantId), inArray(parPayments.parId, parIds)));
    for (const p of pmts) paymentsMap[p.parId] = p;
  }

  // Resolve display names (finance needs: who requested, which project, who approved).
  // VM3-01: decidedAt is included so the queue can show WHEN each approver signed (audit ask).
  const approvalRows = parIds.length
    ? await db
        .select({ parId: parApprovals.parId, step: parApprovals.step, decision: parApprovals.decision, approverUserId: parApprovals.approverUserId, decidedAt: parApprovals.decidedAt })
        .from(parApprovals)
        .where(and(eq(parApprovals.tenantId, tenantId), inArray(parApprovals.parId, parIds)))
    : [];
  const projectIds = [...new Set(queue.map((p) => p.projectId).filter((v): v is string => !!v))];
  const userIds = [
    ...new Set([
      ...queue.map((p) => p.requestedByUserId).filter((v): v is string => !!v),
      ...approvalRows.filter((a) => a.step >= 1 && a.decision === "approved" && a.approverUserId).map((a) => a.approverUserId as string),
    ]),
  ];
  const projRows = projectIds.length
    ? await db.select({ id: parProjects.id, name: parProjects.name }).from(parProjects)
        .where(and(eq(parProjects.tenantId, tenantId), inArray(parProjects.id, projectIds)))
    : [];
  const userRows = userIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds)))
    : [];
  const projName = (id: string | null) => (id && projRows.find((r) => r.id === id)?.name) || null;
  const userName = (id: string | null) => (id && userRows.find((r) => r.id === id)?.name) || null;
  const approversFor = (parId: string) =>
    [...new Set(
      approvalRows
        .filter((a) => a.parId === parId && a.step >= 1 && a.decision === "approved" && a.approverUserId)
        .map((a) => userName(a.approverUserId))
        .filter((n): n is string => !!n),
    )];
  // VM3-01: approvers WITH decision dates — Violeta (finance/audit) needs "cine a aprobat și la ce dată"
  // visible in the queue, not buried in the audit log.
  const approverDecisionsFor = (parId: string) =>
    approvalRows
      .filter((a) => a.parId === parId && a.step >= 1 && a.decision === "approved" && a.approverUserId)
      .sort((a, b) => a.step - b.step)
      .map((a) => ({ name: userName(a.approverUserId), step: a.step, decidedAt: a.decidedAt }))
      .filter((d): d is { name: string; step: number; decidedAt: Date | null } => !!d.name);

  // VM3-01: budget code labels (Violeta: "și budget line să se vadă")
  const budgetCodeIds = [...new Set(queue.map((p) => p.budgetCodeId).filter((v): v is string => !!v))];
  const budgetRows = budgetCodeIds.length
    ? await db.select({ id: parBudgetCodes.id, code: parBudgetCodes.code, name: parBudgetCodes.name })
        .from(parBudgetCodes)
        .where(and(eq(parBudgetCodes.tenantId, tenantId), inArray(parBudgetCodes.id, budgetCodeIds)))
    : [];
  const budgetLabel = (id: string | null) => {
    if (!id) return null;
    const b = budgetRows.find((r) => r.id === id);
    return b ? `${b.code} — ${b.name}` : null;
  };

  // VM3-01: attachment METADATA only (id/fileName/kind) — the file bodies are data-URLs and would
  // bloat the list response; the UI fetches content on demand via GET /api/par/:id/attachments.
  const attachmentRows = parIds.length
    ? await db.select({ id: parAttachments.id, parId: parAttachments.parId, fileName: parAttachments.fileName, kind: parAttachments.kind })
        .from(parAttachments)
        .where(and(eq(parAttachments.tenantId, tenantId), inArray(parAttachments.parId, parIds)))
    : [];
  const attachmentsFor = (parId: string) =>
    attachmentRows
      .filter((a) => a.parId === parId)
      .map(({ id, fileName, kind }) => ({ id, fileName, kind }));

  const items = queue.map((p) => ({
    ...p,
    above_micro_threshold: p.totalEstimatedCents > threshold,
    payment: paymentsMap[p.id] ?? null,
    requestedByName: userName(p.requestedByUserId),
    projectName: projName(p.projectId),
    approverNames: approversFor(p.id),
    approverDecisions: approverDecisionsFor(p.id),
    budgetCodeLabel: budgetLabel(p.budgetCodeId),
    attachmentsMeta: attachmentsFor(p.id),
  }));

  return c.json({ items, total: items.length, threeWayMatchEnforced });
});

// ─── POST /api/par/:id/finance ────────────────────────────────────────────────
// Write section 16 (par_bl, received_by, assigned_to); move PAR to in_finance.
// Finance role only. Works on 'approved' (execute_payment) PARs → creates par_payments row.
// Also accepted on 'in_finance' for updates (re-assign, update par_bl).

parPaymentsRoutes.post(
  "/:id/finance",
  zValidator("json", section16Schema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const body = c.req.valid("json");

    const roles = await getUserPARRoles(user.id, tenantId);
    const canFinance = roles.includes("finance") || roles.includes("par_admin");
    if (!canFinance) return c.json({ error: "forbidden: finance role required" }, 403);

    const [par] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    if (!par) return c.json({ error: "not_found" }, 404);

    if (par.projectId ? !(await mayAccessProject(user.id, tenantId, par.projectId, user.role)) : !(await mayAccessPayer(user.id, tenantId, par.payerId, user.role))) {
      return c.json({ error: "not_found" }, 404);
    }

    if (par.purpose !== "execute_payment") {
      return c.json(
        { error: "conflict: only execute_payment PARs can enter finance queue" },
        409
      );
    }

    if (!["approved", "in_finance"].includes(par.status)) {
      return c.json(
        { error: `conflict: PAR status is '${par.status}', expected approved or in_finance` },
        409
      );
    }

    const now = new Date();

    // Upsert par_payments section-16 fields
    const existing = await db
      .select()
      .from(parPayments)
      .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));

    if (existing.length === 0) {
      await db.insert(parPayments).values({
        tenantId,
        parId,
        parBl: body.par_bl ?? null,
        receivedAt: now,
        receivedByUserId: body.received_by_user_id ?? user.id,
        assignedToUserId: body.assigned_to_user_id ?? null,
      });
    } else {
      await db
        .update(parPayments)
        .set({
          parBl: body.par_bl ?? existing[0].parBl,
          receivedByUserId: body.received_by_user_id ?? existing[0].receivedByUserId,
          assignedToUserId: body.assigned_to_user_id ?? existing[0].assignedToUserId,
          updatedAt: now,
        })
        .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));
    }

    // Transition to in_finance (idempotent)
    if (par.status === "approved") {
      await db
        .update(parRequests)
        .set({ status: "in_finance", updatedAt: now })
        .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

      await writeAudit({
        tenantId,
        parId,
        actorUserId: user.id,
        event: "in_finance",
        detail: `Received by user ${body.received_by_user_id ?? user.id}; assigned to ${body.assigned_to_user_id ?? "unassigned"}`,
      });
    }

    // Fetch updated
    const [updated] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

    const [payment] = await db
      .select()
      .from(parPayments)
      .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));

    return c.json({ par: updated, payment });
  }
);

// ─── POST /api/par/:id/pay ────────────────────────────────────────────────────
// Record actual payment. Applies the 10% overage rule (integer math only).
// CORE §3: if actual > total * 1.10 AND total > micro_purchase_threshold → reapproval_required.
// Otherwise → paid.

parPaymentsRoutes.post(
  "/:id/pay",
  zValidator("json", paySchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const body = c.req.valid("json");

    const roles = await getUserPARRoles(user.id, tenantId);
    const canFinance = roles.includes("finance") || roles.includes("par_admin");
    if (!canFinance) return c.json({ error: "forbidden: finance role required" }, 403);

    const [par] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    if (!par) return c.json({ error: "not_found" }, 404);

    if (par.projectId ? !(await mayAccessProject(user.id, tenantId, par.projectId, user.role)) : !(await mayAccessPayer(user.id, tenantId, par.payerId, user.role))) {
      return c.json({ error: "not_found" }, 404);
    }

    // Accept in_finance (normal path) OR reapproval_required after overage_reapproved=true
    if (!["in_finance", "reapproval_required"].includes(par.status)) {
      return c.json(
        { error: `conflict: PAR status is '${par.status}', expected in_finance or reapproval_required` },
        409
      );
    }

    // If reapproval_required, must check overage_reapproved flag first
    if (par.status === "reapproval_required") {
      const [pmtRow] = await db
        .select()
        .from(parPayments)
        .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));

      if (!pmtRow?.overageReapproved) {
        return c.json(
          { error: "conflict: overage must be re-approved before payment can proceed" },
          409
        );
      }
    }

    const [settings] = await db
      .select({
        threshold: parSettings.microPurchaseThresholdCents,
        enforceMatch: parSettings.enforceThreeWayMatch,
      })
      .from(parSettings)
      .where(eq(parSettings.tenantId, tenantId));
    const threshold = settings?.threshold ?? 1000000;

    // VF-505: 3-way match (PO + receipt + amount). If enforced and it fails → block with 409.
    // Otherwise attach a non-blocking warning to the response.
    const match = await evaluateMatch(parId, tenantId, body.actual_amount_cents);
    if (settings?.enforceMatch && !match.ok) {
      return c.json({ error: "three_way_match_failed", issues: match.issues }, 409);
    }
    const matchWarning = !match.ok ? match.issues : null;

    // 10% rule — integer math, no floats (CORE §3, T-PAR-113-1..3)
    const result = applyTenRule({
      actualAmountCents: body.actual_amount_cents,
      totalEstimatedCents: par.totalEstimatedCents,
      microPurchaseThresholdCents: threshold,
      // PARQA-017: the threshold is in MDL — compare against the frozen MDL-equivalent for non-MDL
      // PARs (falls back to the native total for MDL PARs, where they're equal).
      thresholdBasisCents: par.totalMdlCents ?? par.totalEstimatedCents,
    });

    const now = new Date();

    // Upsert par_payments with actual payment details
    const existing = await db
      .select()
      .from(parPayments)
      .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));

    // PAR-113: once the overage was explicitly re-approved (reapprove → overageReapproved=true,
    // PAR back to in_finance), re-running the 10% rule must NOT bounce the payment back to
    // reapproval_required again — otherwise the same overage can never be paid (infinite loop).
    const alreadyReapproved = existing[0]?.overageReapproved === true;

    if (existing.length === 0) {
      await db.insert(parPayments).values({
        tenantId,
        parId,
        actualAmountCents: body.actual_amount_cents,
        paymentDate: new Date(body.payment_date),
        paymentRef: body.payment_ref ?? null,
        proofUrl: body.proof_url ?? null,
        receivedAt: now,
        receivedByUserId: user.id,
      });
    } else {
      await db
        .update(parPayments)
        .set({
          actualAmountCents: body.actual_amount_cents,
          paymentDate: new Date(body.payment_date),
          paymentRef: body.payment_ref ?? null,
          proofUrl: body.proof_url ?? null,
          updatedAt: now,
        })
        .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));
    }

    if (result.needsReapproval && !alreadyReapproved) {
      // → reapproval_required
      await db
        .update(parRequests)
        .set({ status: "reapproval_required", updatedAt: now })
        .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

      await writeAudit({
        tenantId,
        parId,
        actorUserId: user.id,
        event: "reapproval_required",
        detail: `Actual ${body.actual_amount_cents} exceeds estimated ${par.totalEstimatedCents} by >10% (threshold ${threshold}). Re-approval required.`,
      });

      // Notify final approver
      const finalApproval = await db
        .select()
        .from(parApprovals)
        .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
        .orderBy(parApprovals.step);

      const finalStep = finalApproval.filter((a) => a.decision === "approved").sort((a, b) => b.step - a.step)[0];
      const finalApproverUserId = finalStep?.approverUserId ?? null;

      if (finalApproverUserId) {
        try {
          const { inAppNotifications } = await import("../db/schema/inAppNotifications");
          await db.insert(inAppNotifications).values({
            tenantId,
            recipientUserId: finalApproverUserId,
            kind: "par",
            payload: {
              body: `PAR ${par.requestNo} requires re-approval: actual payment exceeds estimate by >10%. Link: /business/par/${parId}`,
              par_id: parId,
            },
          });
        } catch {
          // best-effort
        }
      }

      return c.json({
        status: "reapproval_required",
        message: "Actual amount exceeds estimate by >10%. Re-approval required before payment proceeds.",
        par: { ...par, status: "reapproval_required" },
      });
    } else {
      // → paid
      const paidAt = new Date();
      await db
        .update(parRequests)
        .set({ status: "paid", paidAt, updatedAt: now })
        .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

      await writeAudit({
        tenantId,
        parId,
        actorUserId: user.id,
        event: "paid",
        detail: `Actual amount: ${body.actual_amount_cents} cents. Ref: ${body.payment_ref ?? "-"}`,
      });

      // Notify requestor
      await notifyPaid(
        { tenantId, parId, requestNo: par.requestNo },
        par.requestedByUserId
      );

      // VM1-05: remember this payee (IBAN etc.) in the vendor registry for reuse.
      await autoLinkVendorOnPayment(par, user.id);

      const [updatedPar] = await db
        .select()
        .from(parRequests)
        .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

      return c.json({ status: "paid", par: updatedPar, match_warning: matchWarning });
    }
  }
);

// ─── VF-505: GET /api/par/:id/match — 3-way match state (for the UI). ──────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
parPaymentsRoutes.get("/:id/match", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");
  if (!UUID_RE.test(parId)) return c.json({ error: "not_found" }, 404);

  const [par] = await db
    .select({ requestedByUserId: parRequests.requestedByUserId, projectId: parRequests.projectId, payerId: parRequests.payerId })
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);
  if (par.projectId ? !(await mayAccessProject(user.id, tenantId, par.projectId, user.role)) : !(await mayAccessPayer(user.id, tenantId, par.payerId, user.role))) {
    return c.json({ error: "not_found" }, 404);
  }
  const roles = await getUserPARRoles(user.id, tenantId);
  const canSee = par.requestedByUserId === user.id || roles.some((r) => ["approver", "finance", "par_admin"].includes(r));
  if (!canSee) return c.json({ error: "not_found" }, 404);

  const match = await evaluateMatch(parId, tenantId);
  return c.json(match);
});
