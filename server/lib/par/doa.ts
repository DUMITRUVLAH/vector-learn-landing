/**
 * PAR-002: DOA (Delegation of Authority) resolution
 * CORE: backlog/par/PAR-CORE.md §3
 *
 * Pure function — no side effects, fully testable.
 * Used by PAR-107 (routing engine) at submit time.
 */
import { db } from "../../db/client";
import { parDoaMatrix, parRequests, parApprovals } from "../../db/schema/par";
import { and, eq, or, isNull, lte, gte } from "drizzle-orm";

export interface ApprovalStep {
  step: number;
  approverRoleLabel: string;
  approverUserId: string | null;
  /** PAR role that can fulfill this step if no specific user is assigned */
  approverParRole: string | null;
}

export interface ResolveApprovalChainParams {
  tenantId: string;
  totalCents: number;
  chargeTo?: "operations" | "program" | "other" | null;
  departmentId?: string | null;
}

/**
 * Resolves the ordered approval chain for a PAR request based on its amount,
 * charge-to category, and department, using the active DOA matrix rows for the tenant.
 *
 * Rules (CORE §3):
 * - Filter matrix rows where totalCents is in [minAmountCents, maxAmountCents].
 * - maxAmountCents = null means "unlimited" (no upper bound).
 * - Rows matching charge_to=null apply to any charge_to.
 * - Rows matching department_id=null apply to any department.
 * - Among matching rows, group by step (step 1, 2, 3…).
 *   Within a step, the most-specific row wins (specific charge_to > null, specific dept > null).
 * - Return steps in ascending order.
 */
export async function resolveApprovalChain(
  params: ResolveApprovalChainParams
): Promise<ApprovalStep[]> {
  const { tenantId, totalCents, chargeTo, departmentId } = params;

  // Fetch all active matrix rows for this tenant
  const rows = await db
    .select()
    .from(parDoaMatrix)
    .where(
      and(
        eq(parDoaMatrix.tenantId, tenantId),
        eq(parDoaMatrix.active, true),
        // min ≤ totalCents
        lte(parDoaMatrix.minAmountCents, totalCents)
      )
    );

  // Filter by max bound and charge_to / department matching
  const matching = rows.filter((row) => {
    // max bound: null means unlimited; otherwise totalCents must be ≤ maxAmountCents
    const withinMax = row.maxAmountCents === null || totalCents <= row.maxAmountCents;
    if (!withinMax) return false;

    // charge_to: null matrix row applies to any charge_to
    const chargeMatch =
      row.chargeTo === null || row.chargeTo === undefined || row.chargeTo === chargeTo;
    if (!chargeMatch) return false;

    // department: null matrix row applies to any department
    const deptMatch =
      row.departmentId === null || row.departmentId === undefined || row.departmentId === departmentId;
    if (!deptMatch) return false;

    return true;
  });

  if (matching.length === 0) {
    // No DOA rule matches → DON'T leave the PAR with zero approval steps (that made it status
    // "pending_approval" with nobody assigned → stuck forever, invisible in every inbox). Fall back
    // to ONE role-based approval step: approverUserId=null means "any approver/par_admin can decide",
    // so the request is always approvable. Admins should still seed a real DOA matrix; this is the net.
    return [
      {
        step: 1,
        approverRoleLabel: "Aprobator",
        approverUserId: null,
        approverParRole: "approver",
      },
    ];
  }

  // Group by step; within each step pick the most-specific row
  // (specific charge_to > null; specific deptId > null)
  const byStep = new Map<number, typeof matching[number]>();

  for (const row of matching) {
    const existing = byStep.get(row.step);
    if (!existing) {
      byStep.set(row.step, row);
      continue;
    }
    // Prefer more-specific rows (non-null charge_to or department)
    const rowSpecificity =
      (row.chargeTo !== null ? 1 : 0) + (row.departmentId !== null ? 1 : 0);
    const existingSpecificity =
      (existing.chargeTo !== null ? 1 : 0) + (existing.departmentId !== null ? 1 : 0);
    if (rowSpecificity > existingSpecificity) {
      byStep.set(row.step, row);
    }
  }

  // Convert to ordered ApprovalStep array
  const steps: ApprovalStep[] = Array.from(byStep.entries())
    .sort(([a], [b]) => a - b)
    .map(([, row]) => ({
      step: row.step,
      approverRoleLabel: row.approverRoleLabel,
      approverUserId: row.approverUserId ?? null,
      approverParRole: row.approverParRole ?? null,
    }));

  return steps;
}

/**
 * Self-heal for PARs that got stuck "pending_approval" with ZERO approval steps (submitted before the
 * empty-chain fallback existed → status set but no step inserted → invisible in every inbox, never
 * approvable). For each such PAR in the tenant, insert one role-based fallback approval step so an
 * approver/par_admin can finally decide it. Idempotent: only touches PARs that have NO step ≥ 1 yet.
 * Returns how many PARs it healed. Called lazily when an approver opens the inbox.
 */
export async function backfillStuckApprovalChains(tenantId: string): Promise<number> {
  const candidates = await db
    .select({ id: parRequests.id })
    .from(parRequests)
    .where(and(eq(parRequests.tenantId, tenantId), eq(parRequests.status, "pending_approval")));
  if (candidates.length === 0) return 0;

  let healed = 0;
  for (const par of candidates) {
    const steps = await db
      .select({ step: parApprovals.step })
      .from(parApprovals)
      .where(and(eq(parApprovals.parId, par.id), eq(parApprovals.tenantId, tenantId)));
    // A real chain has at least one step ≥ 1 (step 0 is just the requestor's submit signature).
    if (steps.some((s) => s.step >= 1)) continue;
    await db.insert(parApprovals).values({
      tenantId,
      parId: par.id,
      step: 1,
      approverUserId: null,
      approverRoleLabel: "Aprobator",
      decision: "pending",
      locked: false,
    });
    healed++;
  }
  return healed;
}
