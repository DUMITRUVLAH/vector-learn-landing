/**
 * Who may decide an approval step — the SINGLE source of truth.
 *
 * The rule set ("is this pending step mine to decide?") used to be re-written inline in four
 * places: the inbox query, approve, reject and request-changes. The PAR *detail* page had a
 * FIFTH, much narrower copy on the client (`approverUserId === me`), so an approver whose step
 * was ROLE-BASED (`approverUserId = null`, the default chain) saw the PAR in "Inbox aprobare"
 * with Approve/Reject, but opened the same PAR from "Cereri de plată" and got no buttons at all.
 *
 * Everything now goes through the pure functions here, and `GET /api/par/:id` returns the result
 * as `my_decision` so the UI never has to guess.
 *
 * The rules (unchanged, just centralised):
 *   - explicitly assigned step (`approverUserId === me`) → mine, bypasses project scoping
 *   - role-based step (`approverUserId === null`) → mine if I'm allowed on the PAR's project AND
 *     I hold the role the step requires (`approverParRole`; null/"approver" = generic approver)
 *   - a step assigned to someone who delegated to me (VF-302) → mine
 *   - a ROLE-BASED step my delegator could have decided (their role, their project) → mine
 *   - par_admin decides anything
 */

export type DecidableStep = {
  id: string;
  step: number;
  decision: string;
  locked: boolean;
  approverUserId: string | null;
  approverParRole: string | null;
  approverRoleLabel?: string | null;
};

export type ViewerContext = {
  userId: string;
  /** PAR roles held in this tenant (incl. the implicit par_admin of tenant admins/managers). */
  parRoles: string[];
  /** VF-302: users who delegated their approval authority to `userId`, active now. */
  delegators: Set<string>;
  /** PAR roles inherited from those delegators (empty when there is no active delegation). */
  delegatedRoles?: string[];
  /** Whether a delegator is allowed on this PAR's project (role-based steps are project-scoped). */
  delegatedAllowedOnProject?: boolean;
  /** Project-scoping verdict for ROLE-BASED steps (`projectAllowsApprover`). */
  allowedOnProject: boolean;
};

/** Pure: is this ONE step decidable by the viewer (ignoring lock/status)? */
export function stepMatchesViewer(step: DecidableStep, ctx: ViewerContext): boolean {
  const isAdmin = ctx.parRoles.includes("par_admin");
  const isApprover = ctx.parRoles.includes("approver") || isAdmin;

  // PARQA-007: a role-based step may require a SPECIFIC par_role (e.g. "finance").
  const canDecideRoleStep = (required: string | null) => {
    if (isAdmin) return true;
    if (!required || required === "approver") return isApprover;
    return ctx.parRoles.includes(required);
  };

  if (step.approverUserId === ctx.userId) return true;
  if (step.approverUserId === null && ctx.allowedOnProject && canDecideRoleStep(step.approverParRole)) return true;
  if (step.approverUserId != null && ctx.delegators.has(step.approverUserId)) return true;
  // A delegation hands over the delegator's authority, which on the default chain is a ROLE, not a
  // pinned step — otherwise "sign for me while I'm away" never applied to anything.
  const delegated = ctx.delegatedRoles ?? [];
  if (
    step.approverUserId === null &&
    delegated.length > 0 &&
    (ctx.delegatedAllowedOnProject ?? false) &&
    (delegated.includes("par_admin") ||
      (!step.approverParRole || step.approverParRole === "approver"
        ? delegated.includes("approver")
        : delegated.includes(step.approverParRole)))
  ) {
    return true;
  }
  return false;
}

/** Why the viewer cannot decide right now (drives the on-screen explanation). */
export type NoDecisionReason =
  | "not_pending_approval"
  | "self_approval"
  | "no_par_role"
  | "locked"
  | "not_your_step";

export type ViewerDecision = {
  /** True ⇒ Approve / Reject / Request-changes are live for this viewer on this PAR. */
  can_approve: boolean;
  /** The step number the viewer would decide (null when they can't). */
  active_step: number | null;
  active_step_label: string | null;
  /** Set when a step IS the viewer's but a prior step must be approved first. */
  locked_step: number | null;
  reason: NoDecisionReason | null;
};

/**
 * Pure: the viewer's authority over a whole PAR. Mirrors `approveParStep`'s guards in order, so a
 * `can_approve: true` here means the POST will not 403 (the only remaining server-side rejections
 * are the body-hash integrity check and the DOA ceiling, which are amount/tamper conditions).
 */
export function resolveViewerDecision(params: {
  status: string;
  requestedByUserId: string | null;
  steps: DecidableStep[];
  ctx: ViewerContext;
}): ViewerDecision {
  const { status, requestedByUserId, steps, ctx } = params;
  const none = (reason: NoDecisionReason, lockedStep: number | null = null): ViewerDecision => ({
    can_approve: false,
    active_step: null,
    active_step_label: null,
    locked_step: lockedStep,
    reason,
  });

  if (status !== "pending_approval") return none("not_pending_approval");
  // PARQA-003: segregation of duties — never approve your own PAR, whatever roles you hold.
  if (requestedByUserId && requestedByUserId === ctx.userId) return none("self_approval");
  if (ctx.parRoles.length === 0 && ctx.delegators.size === 0) return none("no_par_role");

  const mine = steps.filter((s) => s.step > 0 && s.decision === "pending" && stepMatchesViewer(s, ctx));
  const active = mine.find((s) => !s.locked);
  if (active) {
    return {
      can_approve: true,
      active_step: active.step,
      active_step_label: active.approverRoleLabel ?? null,
      locked_step: null,
      reason: null,
    };
  }
  const locked = mine.find((s) => s.locked);
  if (locked) return none("locked", locked.step);
  return none("not_your_step");
}
