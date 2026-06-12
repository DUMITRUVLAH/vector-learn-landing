/**
 * PAR-108: Approver inbox + approve/reject/request-changes actions.
 * PAR-109: Sequential lock enforcement + body-immutability guard + hash re-verify.
 *
 * Routes:
 *   GET  /api/par/inbox                          → PAR-108: PARs awaiting the current user's decision
 *   POST /api/par/:id/approve                    → PAR-108: approve the active step
 *   POST /api/par/:id/reject                     → PAR-108: reject (terminal)
 *   POST /api/par/:id/request-changes            → PAR-108: send back for requestor edit
 *
 * CORE: backlog/par/PAR-CORE.md §1, §4, §9
 * Mounted in server/app.ts: app.route("/api/par", parApprovalsRoutes)
 *   (must be registered BEFORE the generic /api/par router — or alongside it —
 *    because Hono matches longest-prefix; "inbox" is more specific than ":id")
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  parRequests,
  parApprovals,
  parAudit,
  parMembers,
  parSettings,
} from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { buildBodyForHash } from "../lib/par/submit";
import { verifyParBodyHash } from "../lib/par/integrity";
import {
  notifyStepAdvanced,
  notifyFullyApprovedToFinance,
  notifyRejected,
  notifyChangesRequested,
} from "../services/par/notify";

export const parApprovalsRoutes = new Hono<{ Variables: AuthVariables }>();
parApprovalsRoutes.use("*", requireAuth);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const approveSchema = z.object({
  comment: z.string().max(5000).optional().nullable(),
  signatureName: z.string().max(300).optional().nullable(),
});

const rejectSchema = z.object({
  comment: z.string().min(1, "Comment is required for rejection").max(5000),
  signatureName: z.string().max(300).optional().nullable(),
});

const requestChangesSchema = z.object({
  comment: z.string().min(1, "Comment is required for request-changes").max(5000),
});

// ─── Helper: write par_audit ──────────────────────────────────────────────────

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

// ─── GET /api/par/inbox ───────────────────────────────────────────────────────
// Returns PARs where the current user is the approver of the currently active (unlocked, pending) step.

parApprovalsRoutes.get("/inbox", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const roles = await getUserPARRoles(user.id, tenantId);
  const isApprover = roles.includes("approver") || roles.includes("par_admin");

  // Non-approvers get an empty inbox rather than a 403 — role-aware UI hides the tab anyway
  if (!isApprover) {
    return c.json({ inbox: [], total: 0 });
  }

  // Find all pending (unlocked) approval steps for this user:
  //   - approverUserId = user.id (specific assignment)  OR
  //   - approverUserId IS NULL and the user has the 'approver' or 'par_admin' par_role
  //     (role-based routing)

  // Fetch all active (unlocked, pending) approval steps tenant-scoped
  const pendingSteps = await db
    .select({
      step: parApprovals.step,
      parId: parApprovals.parId,
      approverUserId: parApprovals.approverUserId,
      approverRoleLabel: parApprovals.approverRoleLabel,
      id: parApprovals.id,
    })
    .from(parApprovals)
    .where(
      and(
        eq(parApprovals.tenantId, tenantId),
        eq(parApprovals.decision, "pending"),
        eq(parApprovals.locked, false)
      )
    );

  // Filter to steps the current user can decide
  const mySteps = pendingSteps.filter((s) => {
    if (s.approverUserId === user.id) return true;
    // Role-based: no specific user assigned → any approver/par_admin can decide
    if (s.approverUserId === null && isApprover) return true;
    return false;
  });

  if (mySteps.length === 0) {
    return c.json({ inbox: [], total: 0 });
  }

  const parIds = [...new Set(mySteps.map((s) => s.parId))];

  // Fetch the corresponding PAR headers
  const pars = await db
    .select()
    .from(parRequests)
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        eq(parRequests.status, "pending_approval")
      )
    )
    .orderBy(desc(parRequests.submittedAt));

  // Join with relevant steps
  const [settings] = await db
    .select({ threshold: parSettings.microPurchaseThresholdCents })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));
  const threshold = settings?.threshold ?? 1000000;

  const inbox = pars
    .filter((p) => parIds.includes(p.id))
    .map((p) => {
      const myStep = mySteps.find((s) => s.parId === p.id);
      return {
        ...p,
        above_micro_threshold: p.totalEstimatedCents > threshold,
        my_step: myStep?.step ?? null,
        my_step_label: myStep?.approverRoleLabel ?? null,
      };
    });

  return c.json({ inbox, total: inbox.length });
});

// ─── POST /api/par/:id/approve ───────────────────────────────────────────────

parApprovalsRoutes.post(
  "/:id/approve",
  zValidator("json", approveSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const body = c.req.valid("json");

    const roles = await getUserPARRoles(user.id, tenantId);
    const canApprove = roles.includes("approver") || roles.includes("par_admin");
    if (!canApprove) return c.json({ error: "forbidden: approver role required" }, 403);

    // Fetch PAR
    const [par] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    if (!par) return c.json({ error: "not_found" }, 404);

    if (par.status !== "pending_approval") {
      return c.json({ error: `conflict: PAR status is '${par.status}', cannot approve` }, 409);
    }

    // Find the active (unlocked, pending) step for this user
    const approvalSteps = await db
      .select()
      .from(parApprovals)
      .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
      .orderBy(asc(parApprovals.step));

    // PAR-109: T-PAR-109-1 — check for out-of-order attempt (locked step) → 409
    const lockedStepForUser = approvalSteps.find(
      (s) =>
        s.step > 0 &&
        s.decision === "pending" &&
        s.locked === true &&
        (s.approverUserId === user.id || (s.approverUserId === null && canApprove))
    );

    const activeStep = approvalSteps.find(
      (s) =>
        s.step > 0 &&
        s.decision === "pending" &&
        s.locked === false &&
        (s.approverUserId === user.id || (s.approverUserId === null && canApprove))
    );

    if (!activeStep) {
      if (lockedStepForUser) {
        // User would be the approver but the step is locked (prior step not yet approved)
        return c.json(
          {
            error: "conflict: approval step is locked — a prior step must be approved first",
            locked_step: lockedStepForUser.step,
          },
          409
        );
      }
      return c.json(
        { error: "forbidden: no active step assigned to you, or PAR is not awaiting your decision" },
        403
      );
    }

    // PAR-109: verify body hash integrity before recording approval
    const bodyForHash = await buildBodyForHash(parId, tenantId);
    if (bodyForHash && par.bodyHash) {
      const integrityCheck = verifyParBodyHash(bodyForHash, par.bodyHash);
      if (!integrityCheck.valid) {
        await writeAudit({
          tenantId,
          parId,
          actorUserId: user.id,
          event: "integrity_mismatch",
          detail: integrityCheck.detail,
        });
        return c.json(
          {
            error: "integrity_violation: PAR body hash mismatch — body was modified after submit",
            detail: integrityCheck.detail,
          },
          409
        );
      }
    }

    // Mark this step approved
    await db
      .update(parApprovals)
      .set({
        decision: "approved",
        decidedAt: new Date(),
        comment: body.comment ?? null,
        signatureName: body.signatureName ?? user.id, // fallback to userId if no name typed
        updatedAt: new Date(),
      })
      .where(
        and(eq(parApprovals.id, activeStep.id), eq(parApprovals.tenantId, tenantId))
      );

    await writeAudit({
      tenantId,
      parId,
      actorUserId: user.id,
      event: "approved",
      detail: `Step ${activeStep.step} (${activeStep.approverRoleLabel}) approved`,
    });

    // Find next step (step > activeStep.step, still locked)
    const nextStep = approvalSteps.find(
      (s) => s.step > activeStep.step && s.decision === "pending" && s.locked === true
    );

    if (nextStep) {
      // Unlock the next step
      await db
        .update(parApprovals)
        .set({ locked: false, updatedAt: new Date() })
        .where(
          and(eq(parApprovals.id, nextStep.id), eq(parApprovals.tenantId, tenantId))
        );

      await writeAudit({
        tenantId,
        parId,
        actorUserId: user.id,
        event: "step_unlocked",
        detail: `Step ${nextStep.step} (${nextStep.approverRoleLabel}) unlocked for approval`,
      });

      // PAR-111: notify the next approver (best-effort)
      await notifyStepAdvanced(
        { tenantId, parId, requestNo: par.requestNo },
        nextStep.approverUserId ?? null,
        nextStep.approverRoleLabel ?? `Step ${nextStep.step}`
      );

      const [refreshed] = await db
        .select()
        .from(parRequests)
        .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

      return c.json({
        ...refreshed,
        chain_status: "advanced",
        next_step: nextStep.step,
        next_step_label: nextStep.approverRoleLabel,
      });
    }

    // No next step → final approval
    const newStatus = par.purpose === "execute_payment" ? "in_finance" : "approved";
    const [finalPar] = await db
      .update(parRequests)
      .set({
        status: newStatus,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
      .returning();

    await writeAudit({
      tenantId,
      parId,
      actorUserId: user.id,
      event: newStatus === "in_finance" ? "fully_approved_to_finance" : "fully_approved",
      detail: `All approval steps complete. PAR → ${newStatus}`,
    });

    // PAR-111: notify finance users when fully approved to finance (best-effort)
    if (newStatus === "in_finance") {
      await notifyFullyApprovedToFinance({ tenantId, parId, requestNo: par.requestNo });
    }

    return c.json({ ...finalPar, chain_status: "complete" });
  }
);

// ─── POST /api/par/:id/reject ─────────────────────────────────────────────────

parApprovalsRoutes.post(
  "/:id/reject",
  zValidator("json", rejectSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const body = c.req.valid("json");

    const roles = await getUserPARRoles(user.id, tenantId);
    const canApprove = roles.includes("approver") || roles.includes("par_admin");
    if (!canApprove) return c.json({ error: "forbidden: approver role required" }, 403);

    const [par] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    if (!par) return c.json({ error: "not_found" }, 404);

    if (par.status !== "pending_approval") {
      return c.json({ error: `conflict: PAR status is '${par.status}'` }, 409);
    }

    // Must be the approver of the active step
    const approvalSteps = await db
      .select()
      .from(parApprovals)
      .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
      .orderBy(asc(parApprovals.step));

    const lockedStepForUserReject = approvalSteps.find(
      (s) =>
        s.step > 0 &&
        s.decision === "pending" &&
        s.locked === true &&
        (s.approverUserId === user.id || (s.approverUserId === null && canApprove))
    );

    const activeStep = approvalSteps.find(
      (s) =>
        s.step > 0 &&
        s.decision === "pending" &&
        s.locked === false &&
        (s.approverUserId === user.id || (s.approverUserId === null && canApprove))
    );

    if (!activeStep) {
      if (lockedStepForUserReject) {
        return c.json(
          { error: "conflict: approval step is locked — prior step not yet approved", locked_step: lockedStepForUserReject.step },
          409
        );
      }
      return c.json({ error: "forbidden: no active step assigned to you" }, 403);
    }

    // Mark this step rejected
    await db
      .update(parApprovals)
      .set({
        decision: "rejected",
        decidedAt: new Date(),
        comment: body.comment,
        signatureName: body.signatureName ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(parApprovals.id, activeStep.id), eq(parApprovals.tenantId, tenantId))
      );

    // PAR → rejected (terminal)
    const [rejectedPar] = await db
      .update(parRequests)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
      .returning();

    await writeAudit({
      tenantId,
      parId,
      actorUserId: user.id,
      event: "rejected",
      detail: `Step ${activeStep.step} rejected. Comment: ${body.comment.slice(0, 200)}`,
    });

    // PAR-111: notify requestor (best-effort)
    await notifyRejected(
      { tenantId, parId, requestNo: par.requestNo },
      par.requestedByUserId,
      body.comment
    );

    return c.json({ ...rejectedPar, chain_status: "rejected" });
  }
);

// ─── POST /api/par/:id/request-changes ───────────────────────────────────────

parApprovalsRoutes.post(
  "/:id/request-changes",
  zValidator("json", requestChangesSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const parId = c.req.param("id");
    const body = c.req.valid("json");

    const roles = await getUserPARRoles(user.id, tenantId);
    const canApprove = roles.includes("approver") || roles.includes("par_admin");
    if (!canApprove) return c.json({ error: "forbidden: approver role required" }, 403);

    const [par] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    if (!par) return c.json({ error: "not_found" }, 404);

    if (par.status !== "pending_approval") {
      return c.json({ error: `conflict: PAR status is '${par.status}'` }, 409);
    }

    const approvalSteps = await db
      .select()
      .from(parApprovals)
      .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
      .orderBy(asc(parApprovals.step));

    const activeStep = approvalSteps.find(
      (s) =>
        s.step > 0 &&
        s.decision === "pending" &&
        s.locked === false &&
        (s.approverUserId === user.id || (s.approverUserId === null && canApprove))
    );

    if (!activeStep) {
      return c.json({ error: "forbidden: no active step assigned to you" }, 403);
    }

    // Mark this step changes_requested
    await db
      .update(parApprovals)
      .set({
        decision: "changes_requested",
        decidedAt: new Date(),
        comment: body.comment,
        updatedAt: new Date(),
      })
      .where(
        and(eq(parApprovals.id, activeStep.id), eq(parApprovals.tenantId, tenantId))
      );

    // PAR → changes_requested (requestor can edit again)
    const [changedPar] = await db
      .update(parRequests)
      .set({ status: "changes_requested", updatedAt: new Date() })
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
      .returning();

    await writeAudit({
      tenantId,
      parId,
      actorUserId: user.id,
      event: "changes_requested",
      detail: `Step ${activeStep.step} requested changes. Comment: ${body.comment.slice(0, 200)}`,
    });

    // PAR-111: notify requestor (best-effort)
    await notifyChangesRequested(
      { tenantId, parId, requestNo: par.requestNo },
      par.requestedByUserId,
      body.comment
    );

    return c.json({ ...changedPar, chain_status: "changes_requested" });
  }
);
