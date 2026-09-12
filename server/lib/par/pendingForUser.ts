/**
 * „Ce pași de aprobare sunt ai mei" — o singură dată, pentru toți cei care întreabă.
 *
 * Întrebarea asta apare în două locuri care TREBUIE să dea același răspuns: inboxul (ce văd pe
 * ecran) și digestul de email (VM5-11: „emailurile să vină în batch-uri de aprobare"). Un email
 * care spune „ai 5 cereri de aprobat" și un inbox care arată 3 e mai rău decât niciun email — omul
 * încetează să aibă încredere în amândouă.
 *
 * Regula propriu-zisă rămâne unde a fost dintotdeauna: `stepMatchesViewer` din `decisionAuthority`,
 * aceeași pe care o aplică `approve`/`reject`. Aici e doar culegerea datelor de care are nevoie.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { parApprovals, parRequests } from "../../db/schema/par";
import { getUserPARRoles } from "../../middleware/requirePARRole";
import { getActiveDelegators, getDelegatedAuthority } from "./delegations";
import { stepMatchesViewer } from "./decisionAuthority";
import { getProjectApproverMap, projectAllowsApprover } from "./projectApprovers";
import { accessibleScopes } from "./projectScope";

export interface PendingStep {
  id: string;
  step: number;
  parId: string;
  approverUserId: string | null;
  approverRoleLabel: string | null;
  approverParRole: string | null;
}

export interface ParScope {
  projectId: string | null;
  payerId: string | null;
  requestedByUserId: string | null;
}

/** Toți pașii deschiși ai organizației + aria cererilor lor. Se citește o dată, se filtrează de N ori. */
export async function loadOpenApprovalSteps(
  tenantId: string
): Promise<{ steps: PendingStep[]; scopeByPar: Map<string, ParScope> }> {
  const steps = await db
    .select({
      id: parApprovals.id,
      step: parApprovals.step,
      parId: parApprovals.parId,
      approverUserId: parApprovals.approverUserId,
      approverRoleLabel: parApprovals.approverRoleLabel,
      approverParRole: parApprovals.approverParRole,
    })
    .from(parApprovals)
    .where(
      and(
        eq(parApprovals.tenantId, tenantId),
        eq(parApprovals.decision, "pending"),
        eq(parApprovals.locked, false)
      )
    );

  const parIds = [...new Set(steps.map((s) => s.parId))];
  const scopeByPar = new Map<string, ParScope>();
  if (parIds.length) {
    const rows = await db
      .select({
        id: parRequests.id,
        projectId: parRequests.projectId,
        payerId: parRequests.payerId,
        requestedByUserId: parRequests.requestedByUserId,
        status: parRequests.status,
      })
      .from(parRequests)
      .where(and(eq(parRequests.tenantId, tenantId), inArray(parRequests.id, parIds)));
    for (const r of rows) {
      // Un pas rămas deschis pe o cerere care nu mai așteaptă (retrasă, respinsă) nu e al nimănui.
      if (r.status !== "pending_approval") continue;
      scopeByPar.set(r.id, {
        projectId: r.projectId ?? null,
        payerId: r.payerId ?? null,
        requestedByUserId: r.requestedByUserId ?? null,
      });
    }
  }

  return { steps, scopeByPar };
}

/**
 * Din pașii deschiși, cei pe care îi poate decide utilizatorul dat.
 *
 * Aceleași trei filtre ca inboxul, în aceeași ordine:
 *   1. aria (proiect sau plătitor) — altfel un aprobator invitat pe un proiect ar vedea tot;
 *   2. segregarea atribuțiilor — propria cerere nu stă niciodată în inboxul tău;
 *   3. `stepMatchesViewer` — atribuire explicită, rol + scope, sau delegare activă.
 */
export async function filterStepsForUser(params: {
  userId: string;
  tenantId: string;
  tenantRole: string;
  steps: readonly PendingStep[];
  scopeByPar: Map<string, ParScope>;
  projectApproverMap: Map<string, Set<string>>;
}): Promise<PendingStep[]> {
  const { userId, tenantId, tenantRole, steps, scopeByPar, projectApproverMap } = params;

  const roles = await getUserPARRoles(userId, tenantId);
  const delegators = await getActiveDelegators(userId, tenantId);
  const isApprover = roles.includes("approver") || roles.includes("par_admin");
  if (!isApprover && delegators.size === 0) return [];

  const { roles: delegatedRoles } = await getDelegatedAuthority(delegators, tenantId, null);
  const { projects: accessibleProjects, payers: accessiblePayers } = await accessibleScopes(
    userId,
    tenantId,
    tenantRole
  );

  return steps.filter((s) => {
    const scope = scopeByPar.get(s.parId);
    if (!scope) return false;
    const allowedByMembership = scope.projectId
      ? accessibleProjects === null || accessibleProjects.includes(scope.projectId)
      : !!scope.payerId && (accessiblePayers === null || accessiblePayers.includes(scope.payerId));
    if (!allowedByMembership) return false;
    if (scope.requestedByUserId && scope.requestedByUserId === userId) return false;
    return stepMatchesViewer(
      { ...s, decision: "pending", locked: false },
      {
        userId,
        parRoles: roles,
        delegators,
        delegatedRoles,
        delegatedAllowedOnProject: delegatedRoles.length > 0,
        allowedOnProject: projectAllowsApprover(
          scope.projectId,
          userId,
          projectApproverMap.get(scope.projectId ?? "")
        ),
      }
    );
  });
}

/** Comoditate pentru un singur utilizator: citește pașii și îi filtrează. */
export async function pendingStepsForUser(
  userId: string,
  tenantId: string,
  tenantRole: string
): Promise<PendingStep[]> {
  const [{ steps, scopeByPar }, projectApproverMap] = await Promise.all([
    loadOpenApprovalSteps(tenantId),
    getProjectApproverMap(tenantId),
  ]);
  return filterStepsForUser({ userId, tenantId, tenantRole, steps, scopeByPar, projectApproverMap });
}
