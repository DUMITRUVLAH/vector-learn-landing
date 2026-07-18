/**
 * PAR-108: Approver inbox + approve/reject/request-changes actions.
 * PAR-109: Sequential lock enforcement + body-immutability guard + hash re-verify.
 * PAR-113: Overage re-approval (POST /api/par/:id/reapprove — placed here per spec, same guard + audit trail)
 *
 * Routes:
 *   GET  /api/par/inbox                          → PAR-108: PARs awaiting the current user's decision
 *   POST /api/par/:id/approve                    → PAR-108: approve the active step
 *   POST /api/par/:id/reject                     → PAR-108: reject (terminal)
 *   POST /api/par/:id/request-changes            → PAR-108: send back for requestor edit
 *   POST /api/par/:id/reapprove                  → PAR-113: re-approve 10%-overage; PAR → in_finance
 *
 * CORE: backlog/par/PAR-CORE.md §1, §3 (10% rule), §4, §9
 * Mounted in server/app.ts: app.route("/api/par", parApprovalsRoutes)
 *   (must be registered BEFORE the generic /api/par router — or alongside it —
 *    because Hono matches longest-prefix; "inbox" is more specific than ":id")
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, desc, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  parRequests,
  parApprovals,
  parAudit,
  parMembers,
  parSettings,
  parProjects,
} from "../db/schema/par";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { buildBodyForHash } from "../lib/par/submit";
import { backfillStuckApprovalChains } from "../lib/par/doa";
import {
  getProjectApproverMap,
  getDesignatedApprovers,
  projectAllowsApprover,
} from "../lib/par/projectApprovers";
import { verifyParBodyHash } from "../lib/par/integrity";
import { getActiveDelegators } from "../lib/par/delegations";
import { blocksOnApprovalLimit } from "../lib/par/approvalLimit";
import {
  notifyStepAdvanced,
  notifyFullyApprovedToFinance,
  notifyApprovedToRequestor,
  notifyRejected,
  notifyChangesRequested,
} from "../services/par/notify";
import { parPayments } from "../db/schema/par";

export const parApprovalsRoutes = new Hono<{ Variables: AuthVariables }>();
parApprovalsRoutes.use("*", requireAuth);
parApprovalsRoutes.use("/:id/:action/*", parUuidGuard("id"));

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

// ─── Helper: can this user act on this PAR's approval? ─────────────────────────
// VF-002: a user who is EXPLICITLY assigned to a pending step (approverUserId == user.id)
// can decide it even without the generic `approver` par_role — the explicit assignment in the
// DOA matrix IS their authority (e.g. a finance/program director assigned to step 2). The
// generic role still covers role-based (unassigned) steps. Without this, PARs whose DOA matrix
// pins a step to a non-`approver` user are blocked forever.
async function canActOnApproval(
  userId: string,
  tenantId: string,
  parId: string,
  canApprove: boolean
): Promise<boolean> {
  if (canApprove) return true;
  const assigned = await db
    .select({ id: parApprovals.id })
    .from(parApprovals)
    .where(
      and(
        eq(parApprovals.parId, parId),
        eq(parApprovals.tenantId, tenantId),
        eq(parApprovals.approverUserId, userId),
        eq(parApprovals.decision, "pending")
      )
    );
  return assigned.length > 0;
}

/** VF-302: true if a pending step on this PAR is assigned to someone who delegated to `userId`. */
async function hasDelegatedPendingStep(
  userId: string,
  tenantId: string,
  parId: string,
  delegators: Set<string>
): Promise<boolean> {
  if (delegators.size === 0) return false;
  const pending = await db
    .select({ approverUserId: parApprovals.approverUserId })
    .from(parApprovals)
    .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId), eq(parApprovals.decision, "pending")));
  return pending.some((s) => s.approverUserId != null && delegators.has(s.approverUserId));
}

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

// ─── Core approve logic (shared by /:id/approve and /bulk-approve) ─────────────
// VF-102: extracted from the route handler so bulk-approve runs the EXACT same logic per id.
// Returns a structured result instead of an HTTP response, so callers shape their own output.
type ApproveResult =
  | { ok: true; body: Record<string, unknown>; status: string }
  | { ok: false; status: number; error: string; extra?: Record<string, unknown> };

async function approveParStep(
  userId: string,
  tenantId: string,
  parId: string,
  body: { comment?: string | null; signatureName?: string | null }
): Promise<ApproveResult> {
  const roles = await getUserPARRoles(userId, tenantId);
  const canApprove = roles.includes("approver") || roles.includes("par_admin");
  // VF-302: principals who delegated their approval authority to this user (active now).
  const delegators = await getActiveDelegators(userId, tenantId);
  // VF-002: allow generic approvers OR users explicitly assigned to a pending step.
  // VF-302: also allow if a delegator (X→userId active) is assigned to a pending step here.
  if (!(await canActOnApproval(userId, tenantId, parId, canApprove)) && !(await hasDelegatedPendingStep(userId, tenantId, parId, delegators))) {
    return { ok: false, status: 403, error: "forbidden: approver role required" };
  }

  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return { ok: false, status: 404, error: "not_found" };

  if (par.status !== "pending_approval") {
    return { ok: false, status: 409, error: `conflict: PAR status is '${par.status}', cannot approve` };
  }

  const approvalSteps = await db
    .select()
    .from(parApprovals)
    .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
    .orderBy(asc(parApprovals.step));

  // Project-scoped approvers: a role-based step is only the user's to decide if they're a designated
  // approver of this PAR's project (unrestricted project → any approver). Explicit assignment bypasses.
  const designated = par.projectId ? await getDesignatedApprovers(tenantId, par.projectId) : new Set<string>();
  const allowedOnProject = projectAllowsApprover(par.projectId, userId, designated);

  // VF-302: a step matches the user if assigned to them, role-routed (unassigned + can approve +
  // allowed on the project), OR assigned to someone who delegated to them.
  const stepMatches = (s: typeof approvalSteps[number]) =>
    s.approverUserId === userId ||
    (s.approverUserId === null && canApprove && allowedOnProject) ||
    (s.approverUserId != null && delegators.has(s.approverUserId));

  const lockedStepForUser = approvalSteps.find(
    (s) => s.step > 0 && s.decision === "pending" && s.locked === true && stepMatches(s)
  );
  const activeStep = approvalSteps.find(
    (s) => s.step > 0 && s.decision === "pending" && s.locked === false && stepMatches(s)
  );

  if (!activeStep) {
    if (lockedStepForUser) {
      return {
        ok: false, status: 409,
        error: "conflict: approval step is locked — a prior step must be approved first",
        extra: { locked_step: lockedStepForUser.step },
      };
    }
    return { ok: false, status: 403, error: "forbidden: no active step assigned to you, or PAR is not awaiting your decision" };
  }

  // PAR-109: integrity check before recording.
  const bodyForHash = await buildBodyForHash(parId, tenantId);
  if (bodyForHash && par.bodyHash) {
    const integrityCheck = verifyParBodyHash(bodyForHash, par.bodyHash);
    if (!integrityCheck.valid) {
      await writeAudit({ tenantId, parId, actorUserId: userId, event: "integrity_mismatch", detail: integrityCheck.detail });
      return {
        ok: false, status: 409,
        error: "integrity_violation: PAR body hash mismatch — body was modified after submit",
        extra: { detail: integrityCheck.detail },
      };
    }
  }

  // PARQA-008: enforce the approver's DOA ceiling (par_members.approval_limit_cents). A role-based
  // approver whose personal limit is below the PAR's MDL-equivalent total may not be the FINAL
  // signature — they cannot single-handedly authorize an amount above their ceiling; it must
  // escalate to a higher-authority step. Intermediate steps are fine (a higher approver follows).
  // par_admin (explicit, or an implicit tenant admin/manager) is the escalation authority and is
  // never limited. Uses totalMdlCents (the DOA/limit currency) with a fallback for MDL PARs.
  const isFinalApproval = !approvalSteps.find(
    (s) => s.step > activeStep.step && s.decision === "pending" && s.locked === true
  );
  const isParAdmin = roles.includes("par_admin");
  if (isFinalApproval && !isParAdmin) {
    const [approverRow] = await db
      .select({ limit: parMembers.approvalLimitCents })
      .from(parMembers)
      .where(
        and(
          eq(parMembers.tenantId, tenantId),
          eq(parMembers.userId, userId),
          eq(parMembers.role, "approver")
        )
      );
    const limitCents = approverRow?.limit ?? null;
    const amountMdlCents = par.totalMdlCents ?? par.totalEstimatedCents;
    if (blocksOnApprovalLimit({ isFinalApproval, isParAdmin, approverLimitCents: limitCents, amountMdlCents })) {
      await writeAudit({
        tenantId, parId, actorUserId: userId, event: "approval_limit_exceeded",
        detail: `Final approval blocked: PAR total ${amountMdlCents} MDL cents exceeds approver limit ${limitCents} cents.`,
      });
      return {
        ok: false, status: 403, error: "over_approval_limit",
        extra: { limit_cents: limitCents, amount_mdl_cents: amountMdlCents },
      };
    }
  }

  // VF-302: if acting on a step assigned to someone else (a delegator), annotate the signature/title.
  const viaDelegation =
    activeStep.approverUserId != null && activeStep.approverUserId !== userId && delegators.has(activeStep.approverUserId);
  const signatureTitle = viaDelegation ? `delegat de ${activeStep.approverUserId}` : undefined;

  await db
    .update(parApprovals)
    .set({
      decision: "approved",
      decidedAt: new Date(),
      comment: body.comment ?? null,
      signatureName: body.signatureName ?? userId,
      ...(signatureTitle ? { signatureTitle } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(parApprovals.id, activeStep.id), eq(parApprovals.tenantId, tenantId)));

  await writeAudit({
    tenantId, parId, actorUserId: userId, event: "approved",
    detail: `Step ${activeStep.step} (${activeStep.approverRoleLabel}) approved${viaDelegation ? ` — prin delegare de la ${activeStep.approverUserId}` : ""}`,
  });

  const nextStep = approvalSteps.find(
    (s) => s.step > activeStep.step && s.decision === "pending" && s.locked === true
  );

  if (nextStep) {
    await db
      .update(parApprovals)
      .set({ locked: false, updatedAt: new Date() })
      .where(and(eq(parApprovals.id, nextStep.id), eq(parApprovals.tenantId, tenantId)));
    await writeAudit({ tenantId, parId, actorUserId: userId, event: "step_unlocked", detail: `Step ${nextStep.step} (${nextStep.approverRoleLabel}) unlocked for approval` });
    await notifyStepAdvanced(
      { tenantId, parId, requestNo: par.requestNo },
      nextStep.approverUserId ?? null,
      nextStep.approverRoleLabel ?? `Step ${nextStep.step}`
    );
    const [refreshed] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    return {
      ok: true, status: refreshed.status,
      body: { ...refreshed, chain_status: "advanced", next_step: nextStep.step, next_step_label: nextStep.approverRoleLabel },
    };
  }

  // Final approval.
  const newStatus = par.purpose === "execute_payment" ? "in_finance" : "approved";
  const [finalPar] = await db
    .update(parRequests)
    .set({ status: newStatus, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
    .returning();
  await writeAudit({
    tenantId, parId, actorUserId: userId,
    event: newStatus === "in_finance" ? "fully_approved_to_finance" : "fully_approved",
    detail: `All approval steps complete. PAR → ${newStatus}`,
  });
  if (newStatus === "in_finance") {
    await notifyFullyApprovedToFinance({ tenantId, parId, requestNo: par.requestNo });
  }
  await notifyApprovedToRequestor({ tenantId, parId, requestNo: par.requestNo }, par.requestedByUserId);

  return { ok: true, status: newStatus, body: { ...finalPar, chain_status: "complete" } };
}

// ─── GET /api/par/inbox ───────────────────────────────────────────────────────
// Returns PARs where the current user is the approver of the currently active (unlocked, pending) step.

parApprovalsRoutes.get("/inbox", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const roles = await getUserPARRoles(user.id, tenantId);
  const isApprover = roles.includes("approver") || roles.includes("par_admin");

  // VF-302: principals who delegated their authority to this user (active now).
  const delegators = await getActiveDelegators(user.id, tenantId);

  // Non-approvers with no incoming delegations get an empty inbox (role-aware UI hides the tab anyway).
  if (!isApprover && delegators.size === 0) {
    return c.json({ inbox: [], total: 0 });
  }

  // Self-heal any PAR stuck "pending_approval" with no approval step (submitted before the empty-chain
  // fallback). Idempotent; only approvers reach here, so the write is authorized.
  if (isApprover) {
    try {
      await backfillStuckApprovalChains(tenantId);
    } catch {
      /* non-blocking — inbox still renders whatever chains exist */
    }
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

  // Project-scoped approvers: for role-based steps, the user must be a designated approver of the
  // PAR's project (projects with no designated approvers stay open to any approver).
  const projectApproverMap = await getProjectApproverMap(tenantId);
  const stepParIds = [...new Set(pendingSteps.map((s) => s.parId))];
  const projectByPar = new Map<string, string | null>();
  if (stepParIds.length > 0) {
    const projRows = await db
      .select({ id: parRequests.id, projectId: parRequests.projectId })
      .from(parRequests)
      .where(and(eq(parRequests.tenantId, tenantId), inArray(parRequests.id, stepParIds)));
    for (const r of projRows) projectByPar.set(r.id, r.projectId ?? null);
  }

  // Filter to steps the current user can decide
  const mySteps = pendingSteps.filter((s) => {
    if (s.approverUserId === user.id) return true; // explicit assignment → bypasses project scoping
    // Role-based: any approver/par_admin can decide, IF allowed on this PAR's project.
    if (s.approverUserId === null && isApprover) {
      return projectAllowsApprover(projectByPar.get(s.parId), user.id, projectApproverMap.get(projectByPar.get(s.parId) ?? ""));
    }
    // VF-302: a step assigned to a delegator (X→me active) is mine to decide.
    if (s.approverUserId != null && delegators.has(s.approverUserId)) return true;
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

  const inboxPars = pars.filter((p) => parIds.includes(p.id));

  // Resolve display names so approver cards show people/projects, not UUIDs.
  const projectIds = [...new Set(inboxPars.map((p) => p.projectId).filter((v): v is string => !!v))];
  const requestorIds = [...new Set(inboxPars.map((p) => p.requestedByUserId).filter((v): v is string => !!v))];
  const projRows = projectIds.length
    ? await db.select({ id: parProjects.id, name: parProjects.name }).from(parProjects)
        .where(and(eq(parProjects.tenantId, tenantId), inArray(parProjects.id, projectIds)))
    : [];
  const userRows = requestorIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, requestorIds)))
    : [];
  const projName = (id: string | null) => (id && projRows.find((r) => r.id === id)?.name) || null;
  const reqName = (id: string | null) => (id && userRows.find((r) => r.id === id)?.name) || null;

  const inbox = inboxPars.map((p) => {
    const myStep = mySteps.find((s) => s.parId === p.id);
    return {
      ...p,
      above_micro_threshold: p.totalEstimatedCents > threshold,
      my_step: myStep?.step ?? null,
      my_step_label: myStep?.approverRoleLabel ?? null,
      projectName: projName(p.projectId),
      requestedByName: reqName(p.requestedByUserId),
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

    const result = await approveParStep(user.id, tenantId, parId, body);
    if (!result.ok) return c.json({ error: result.error, ...result.extra }, result.status as 400);
    return c.json(result.body);
  }
);

// ─── POST /api/par/bulk-approve ───────────────────────────────────────────────
// VF-102: approve up to 25 PARs in one call. Each id runs the SAME approveParStep logic
// independently — one failure (self-approval, locked step, wrong status) doesn't affect the rest.
const bulkApproveSchema = z.object({
  par_ids: z.array(z.string().uuid()).min(1).max(25),
  comment: z.string().max(5000).optional().nullable(),
  signatureName: z.string().max(300).optional().nullable(),
});

parApprovalsRoutes.post("/bulk-approve", zValidator("json", bulkApproveSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const { par_ids, comment, signatureName } = c.req.valid("json");

  const results = [];
  for (const parId of [...new Set(par_ids)]) {
    const r = await approveParStep(user.id, tenantId, parId, { comment, signatureName });
    results.push(
      r.ok
        ? { id: parId, ok: true, status: r.status }
        : { id: parId, ok: false, error: r.error }
    );
  }

  const approved = results.filter((r) => r.ok).length;
  return c.json({ results, approved, failed: results.length - approved });
});

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
    // VF-002: allow generic approvers OR users explicitly assigned to a pending step.
    if (!(await canActOnApproval(user.id, tenantId, parId, canApprove))) {
      return c.json({ error: "forbidden: approver role required" }, 403);
    }

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

// ─── POST /api/par/:id/reapprove ──────────────────────────────────────────────
// PAR-113: Overage re-approval. The final approver signs off on the 10%-overage,
// setting overage_reapproved=true → PAR returns to in_finance so finance can pay.
//
// Guard: same roles as regular approve (approver | par_admin).
// CORE §4 state machine: reapproval_required → in_finance → paid.

parApprovalsRoutes.post("/:id/reapprove", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const parId = c.req.param("id");

  const roles = await getUserPARRoles(user.id, tenantId);
  const canApprove = roles.includes("approver") || roles.includes("par_admin");
  if (!canApprove) return c.json({ error: "forbidden: approver role required" }, 403);

  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return c.json({ error: "not_found" }, 404);

  if (par.status !== "reapproval_required") {
    return c.json(
      { error: `conflict: PAR status is '${par.status}', expected reapproval_required` },
      409
    );
  }

  const now = new Date();

  // Set overage_reapproved = true on par_payments
  await db
    .update(parPayments)
    .set({ overageReapproved: true, updatedAt: now })
    .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));

  // PAR → in_finance (finance can now call /pay again and it will succeed)
  await db
    .update(parRequests)
    .set({ status: "in_finance", updatedAt: now })
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  await writeAudit({
    tenantId,
    parId,
    actorUserId: user.id,
    event: "overage_reapproved",
    detail: `Overage re-approved by user ${user.id}. PAR returned to in_finance.`,
  });

  const [updated] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  return c.json({ status: "in_finance", overage_reapproved: true, par: updated });
});
