/**
 * Approval authority — the rules that decide whether Approve/Reject are live for a viewer.
 *
 * Regression: an approver saw a PAR in "Inbox aprobare" with Approve/Reject, opened the SAME PAR
 * from "Cereri de plată", and got no actions at all. The inbox matched role-based steps
 * (approver_user_id = null, the default chain); the detail page only matched steps that named the
 * user personally. Both now go through resolveViewerDecision/stepMatchesViewer.
 *
 * T-DA-1 [blocant] role-based step is decidable by an approver → the bug that shipped
 * T-DA-2 [blocant] explicit assignment is decidable even without the generic approver role
 * T-DA-3 [blocant] you can never approve your own PAR (SoD), whatever roles you hold
 * T-DA-4 [blocant] a locked step reports `locked` + the step number, not "not your step"
 * T-DA-5 [normal]  a role-based step requiring a specific par_role needs that role
 * T-DA-6 [normal]  delegated steps (VF-302) are decidable; project scoping narrows role-based only
 * T-DA-7 [normal]  non-pending statuses and role-less users produce no actions
 */
import { describe, it, expect } from "vitest";
import {
  resolveViewerDecision,
  stepMatchesViewer,
  type DecidableStep,
  type ViewerContext,
} from "../../../server/lib/par/decisionAuthority";

const ME = "user-me";
const OTHER = "user-other";
const AUTHOR = "user-author";

const step = (over: Partial<DecidableStep> = {}): DecidableStep => ({
  id: `s${over.step ?? 1}`,
  step: 1,
  decision: "pending",
  locked: false,
  approverUserId: null,
  approverParRole: null,
  approverRoleLabel: "Director",
  ...over,
});

const ctx = (over: Partial<ViewerContext> = {}): ViewerContext => ({
  userId: ME,
  parRoles: ["approver"],
  delegators: new Set<string>(),
  allowedOnProject: true,
  ...over,
});

const decide = (steps: DecidableStep[], c: ViewerContext = ctx()) =>
  resolveViewerDecision({ status: "pending_approval", requestedByUserId: AUTHOR, steps, ctx: c });

describe("PAR decision authority", () => {
  it("T-DA-1 [blocant] approver can decide a role-based step (approverUserId = null)", () => {
    const d = decide([step({ approverUserId: null })]);
    expect(d.can_approve).toBe(true);
    expect(d.active_step).toBe(1);
    expect(d.active_step_label).toBe("Director");
    expect(d.reason).toBeNull();
  });

  it("T-DA-2 [blocant] a personally assigned step is decidable without the generic approver role", () => {
    const d = decide([step({ approverUserId: ME })], ctx({ parRoles: ["requestor"] }));
    expect(d.can_approve).toBe(true);
    expect(d.active_step).toBe(1);
  });

  it("T-DA-3 [blocant] the author can never approve their own PAR", () => {
    const d = resolveViewerDecision({
      status: "pending_approval",
      requestedByUserId: ME,
      steps: [step({ approverUserId: ME })],
      ctx: ctx({ parRoles: ["par_admin", "approver"] }),
    });
    expect(d.can_approve).toBe(false);
    expect(d.reason).toBe("self_approval");
  });

  it("T-DA-4 [blocant] a locked step reports `locked` and which step is waiting", () => {
    const d = decide([
      step({ step: 1, approverUserId: OTHER, approverParRole: "approver" }),
      step({ step: 2, approverUserId: ME, locked: true }),
    ]);
    expect(d.can_approve).toBe(false);
    expect(d.reason).toBe("locked");
    expect(d.locked_step).toBe(2);
  });

  it("T-DA-5 [normal] a role-based step requiring `finance` is not decidable by a plain approver", () => {
    const financeStep = [step({ approverParRole: "finance" })];
    expect(decide(financeStep).can_approve).toBe(false);
    expect(decide(financeStep).reason).toBe("not_your_step");
    expect(decide(financeStep, ctx({ parRoles: ["finance"] })).can_approve).toBe(true);
    // par_admin overrides every required role.
    expect(decide(financeStep, ctx({ parRoles: ["par_admin"] })).can_approve).toBe(true);
  });

  it("T-DA-6 [normal] delegation grants a step; project scoping narrows role-based steps only", () => {
    const delegated = decide(
      [step({ approverUserId: OTHER })],
      ctx({ delegators: new Set([OTHER]) }),
    );
    expect(delegated.can_approve).toBe(true);

    // Not a designated approver on this project → role-based step is not mine…
    expect(stepMatchesViewer(step({ approverUserId: null }), ctx({ allowedOnProject: false }))).toBe(false);
    // …but an explicit assignment still is.
    expect(stepMatchesViewer(step({ approverUserId: ME }), ctx({ allowedOnProject: false }))).toBe(true);
  });

  it("T-DA-7 [normal] no actions when the PAR isn't awaiting approval, or the viewer has no role", () => {
    const approvedPar = resolveViewerDecision({
      status: "approved",
      requestedByUserId: AUTHOR,
      steps: [step()],
      ctx: ctx(),
    });
    expect(approvedPar.can_approve).toBe(false);
    expect(approvedPar.reason).toBe("not_pending_approval");

    const noRole = decide([step()], ctx({ parRoles: [] }));
    expect(noRole.can_approve).toBe(false);
    expect(noRole.reason).toBe("no_par_role");

    // Step 0 is bookkeeping (the submit row), never a decision.
    expect(decide([step({ step: 0 })]).can_approve).toBe(false);
  });
});
