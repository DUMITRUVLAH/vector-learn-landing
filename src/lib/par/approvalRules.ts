/**
 * PAR approval-rule model — the bridge between the simplified admin builder (pick people + a mode)
 * and the flat DOA rows the approval engine consumes.
 *
 * Engine contract (server/lib/par/approvalProgress.ts): approvers on the SAME `step` form a parallel
 * level (the request advances only after ALL of them decide); different `step`s run sequentially
 * (step N unlocks after step N-1 completes). This module encodes exactly that:
 *   - "sequential" → one row per approver, steps 1..N.
 *   - "parallel"   → every approver on step 1.
 */
import type { ParDoaRow } from "@/lib/api/par";

export type RuleMode = "sequential" | "parallel";

/** One approver in a rule: a specific person, or anyone with a PAR role. */
export interface ApproverPick {
  userId: string | null;
  parRole: "requestor" | "approver" | "finance" | "par_admin" | null;
  label: string;
}

/** A whole approval rule as edited in the builder: scope + mode + ordered approvers. */
export interface RuleDraft {
  payerId: string | null;
  projectId: string | null;
  departmentId: string | null;
  chargeTo: "operations" | "program" | "other" | null;
  minAmountCents: number;
  maxAmountCents: number | null;
  mode: RuleMode;
  approvers: ApproverPick[];
}

export type DoaRowPayload = Omit<ParDoaRow, "id" | "tenantId" | "createdAt" | "updatedAt">;

export interface GroupedRule {
  key: string;
  rows: ParDoaRow[];
  draft: RuleDraft;
}

/** Scope identity of a rule — DOA rows sharing this belong to the same rule. */
export function ruleScopeKey(
  r: Pick<ParDoaRow, "payerId" | "projectId" | "departmentId" | "chargeTo" | "minAmountCents" | "maxAmountCents">
): string {
  return [r.payerId ?? "", r.projectId ?? "", r.departmentId ?? "", r.chargeTo ?? "", r.minAmountCents, r.maxAmountCents ?? ""].join("|");
}

/**
 * Turn a builder draft into DOA rows — the whole point of the simplified editor: the admin picks
 * people + mode and we generate the step/parallel rows the approval engine expects.
 */
export function buildDoaRows(draft: RuleDraft): DoaRowPayload[] {
  return draft.approvers.map((a, i) => ({
    chargeTo: draft.chargeTo,
    departmentId: draft.departmentId,
    payerId: draft.payerId,
    projectId: draft.projectId,
    minAmountCents: draft.minAmountCents,
    maxAmountCents: draft.maxAmountCents,
    step: draft.mode === "sequential" ? i + 1 : 1,
    approvalMode: draft.mode === "parallel" ? "parallel" : "sequential",
    approverUserId: a.userId,
    approverParRole: a.parRole,
    approverRoleLabel: a.label || "Aprobator",
    active: true,
  }));
}

/** Group flat DOA rows back into rules (by scope) and infer the mode — for display & editing. */
export function groupDoaRows(rows: ParDoaRow[]): GroupedRule[] {
  const map = new Map<string, ParDoaRow[]>();
  for (const r of rows) {
    const k = ruleScopeKey(r);
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }
  const groups: GroupedRule[] = [];
  for (const [key, grp] of map) {
    const sorted = [...grp].sort((a, b) => a.step - b.step);
    const distinctSteps = new Set(sorted.map((r) => r.step));
    // Multiple approvers all on the same step = parallel; otherwise treat as a sequential chain.
    const mode: RuleMode = sorted.length > 1 && distinctSteps.size === 1 ? "parallel" : "sequential";
    const first = sorted[0];
    groups.push({
      key,
      rows: sorted,
      draft: {
        payerId: first.payerId,
        projectId: first.projectId,
        departmentId: first.departmentId,
        chargeTo: first.chargeTo,
        minAmountCents: first.minAmountCents,
        maxAmountCents: first.maxAmountCents,
        mode,
        approvers: sorted.map((r) => ({ userId: r.approverUserId, parRole: r.approverParRole, label: r.approverRoleLabel })),
      },
    });
  }
  return groups;
}

export function emptyRuleDraft(): RuleDraft {
  return { payerId: null, projectId: null, departmentId: null, chargeTo: null, minAmountCents: 0, maxAmountCents: null, mode: "sequential", approvers: [] };
}
