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
  parAttachments,
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
import { getActiveDelegators, getDelegatedAuthority } from "../lib/par/delegations";
import { stepMatchesViewer, pickDecidableStep } from "../lib/par/decisionAuthority";
import { slotRoleLabel } from "../lib/par/doa";
import { blocksOnApprovalLimit, minApprovalLimitCents } from "../lib/par/approvalLimit";
import { approvalProgressAfterDecision } from "../lib/par/approvalProgress";
import { countMismatchesByPar } from "../lib/par/documentWarnings";
import { loadOpenApprovalSteps, filterStepsForUser } from "../lib/par/pendingForUser";
import { accessiblePayerIds, accessibleProjectIds, accessibleScopes, mayAccessPayer, mayAccessProject } from "../lib/par/projectScope";
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
  tenantRole: string,
  parId: string,
  body: { comment?: string | null; signatureName?: string | null }
): Promise<ApproveResult> {
  const roles = await getUserPARRoles(userId, tenantId);
  // VF-302: principals who delegated their approval authority to this user (active now).
  const delegators = await getActiveDelegators(userId, tenantId);
  // PARQA-007: coarse gate — block only users with NO par role and no delegation. The real per-step
  // authorization (explicit assignment / role+project-scope / delegation / DOA required-role) is done
  // by stepMatches below, which now also enforces a step's required par_role. (A pinned non-approver
  // is always a par_members row, so they still have a role and pass here — VF-002 preserved.)
  if (roles.length === 0 && delegators.size === 0) {
    return { ok: false, status: 403, error: "forbidden: approver role required" };
  }

  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return { ok: false, status: 404, error: "not_found" };
  const inScope = par.projectId
    ? await mayAccessProject(userId, tenantId, par.projectId, tenantRole)
    : await mayAccessPayer(userId, tenantId, par.payerId, tenantRole);
  if (!inScope) return { ok: false, status: 404, error: "not_found" };

  // PARQA-003: segregation of duties — a user can NEVER approve their own PAR, even if they also
  // hold approver/par_admin (incl. the implicit par_admin from tenant admin/manager). The DOA
  // self-approval skip at submit only de-assigns a *pinned* step; a role-based step would otherwise
  // still match a requestor who is also an approver. This is the hard SoD gate.
  if (par.requestedByUserId === userId) {
    return { ok: false, status: 403, error: "forbidden: cannot approve your own PAR (self-approval)" };
  }

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

  // The "is this step mine?" rule set lives in decisionAuthority.ts — the SAME function backs the
  // inbox, reject, request-changes and the `my_decision` block on GET /api/par/:id, so what the
  // detail page shows can never disagree with what this endpoint accepts.
  const delegated = await getDelegatedAuthority(delegators, tenantId, par.projectId);
  const viewerCtx = {
    userId, parRoles: roles, delegators, allowedOnProject,
    delegatedRoles: delegated.roles, delegatedAllowedOnProject: delegated.allowedOnProject,
  };
  // pickDecidableStep, not `find`: on a parallel level several pending rows match, and the signer
  // must land on their OWN pinned row instead of whichever row Postgres returned first.
  const lockedStepForUser = pickDecidableStep(approvalSteps, viewerCtx, { locked: true });
  const activeStep = pickDecidableStep(approvalSteps, viewerCtx, { locked: false });

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
  const progress = approvalProgressAfterDecision(approvalSteps, activeStep.id);
  const isFinalApproval = progress.state === "complete";
  const isParAdmin = roles.includes("par_admin");
  // VF-302: dacă semnează pe pasul altcuiva (un delegator), semnătura/titlul se adnotează.
  // Calculat înainte de plafon: autoritatea delegată aduce cu ea și LIMITA delegatorului.
  const viaDelegation =
    activeStep.approverUserId != null && activeStep.approverUserId !== userId && delegators.has(activeStep.approverUserId);

  if (isFinalApproval && !isParAdmin) {
    // SECURITY (audit 2026-08-29): plafonul efectiv = minimul dintre limita celui care semnează
    // ȘI limitele celor prin care exercită autoritatea. Vezi lib/par/approvalLimit.ts.
    const actsOnOwnAuthority = roles.includes("approver");
    const relevantUserIds = [
      userId,
      ...(viaDelegation && activeStep.approverUserId ? [activeStep.approverUserId] : []),
      // Pas pe rol, semnat de cineva care NU are rol de aprobator propriu: autoritatea vine
      // exclusiv prin delegare, deci se aplică limitele tuturor delegatorilor activi.
      ...(!actsOnOwnAuthority && !viaDelegation ? [...delegators] : []),
    ];
    const limitRows = await db
      .select({ userId: parMembers.userId, limit: parMembers.approvalLimitCents })
      .from(parMembers)
      .where(and(eq(parMembers.tenantId, tenantId), inArray(parMembers.userId, relevantUserIds)));
    const limitCents = minApprovalLimitCents(limitRows, relevantUserIds);
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

  // signature_name is a HUMAN field: it lands in the signature block on the detail page and on the
  // printed PAR PDF. When the client omits it (bulk approve, keyboard shortcut), fall back to the
  // decider's display name — never their raw UUID. Same for the delegation annotation.
  const nameOf = async (id: string): Promise<string> => {
    const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, id));
    return u?.name ?? u?.email ?? id;
  };
  const deciderName = await nameOf(userId);
  const delegatorName = viaDelegation ? await nameOf(activeStep.approverUserId!) : null;
  const signatureTitle = delegatorName ? `delegat de ${delegatorName}` : undefined;

  await db
    .update(parApprovals)
    .set({
      decision: "approved",
      decidedAt: new Date(),
      comment: body.comment ?? null,
      signatureName: body.signatureName ?? deciderName,
      ...(signatureTitle ? { signatureTitle } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(parApprovals.id, activeStep.id), eq(parApprovals.tenantId, tenantId)));

  await writeAudit({
    tenantId, parId, actorUserId: userId, event: "approved",
    detail: `Step ${activeStep.step} (${activeStep.approverRoleLabel}) approved${delegatorName ? ` — prin delegare de la ${delegatorName}` : ""}`,
  });

  // A parallel level advances only after every approver on that level has decided.
  if (progress.state === "awaiting_parallel") {
    const [refreshed] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    return {
      ok: true,
      status: refreshed.status,
      body: {
        ...refreshed,
        chain_status: "awaiting_parallel_approvals",
        current_step: activeStep.step,
        approvals_remaining: progress.remainingIds.length,
      },
    };
  }

  const nextStepNumber = progress.state === "advance" ? progress.nextStep : null;
  const nextSteps = progress.state === "advance"
    ? approvalSteps.filter((step) => progress.unlockIds.includes(step.id))
    : [];

  if (nextSteps.length > 0) {
    await db
      .update(parApprovals)
      .set({ locked: false, updatedAt: new Date() })
      .where(and(
        eq(parApprovals.parId, parId),
        eq(parApprovals.tenantId, tenantId),
        eq(parApprovals.step, nextStepNumber!),
        eq(parApprovals.decision, "pending")
      ));
    await writeAudit({
      tenantId,
      parId,
      actorUserId: userId,
      event: "step_unlocked",
      detail: `Step ${nextStepNumber} unlocked for ${nextSteps.length} approver(s)`,
    });
    await Promise.all(nextSteps.map((nextStep) => notifyStepAdvanced(
      { tenantId, parId, requestNo: par.requestNo },
      nextStep.approverUserId ?? null,
      nextStep.approverRoleLabel ?? `Step ${nextStep.step}`
    )));
    const [refreshed] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    return {
      ok: true, status: refreshed.status,
      body: {
        ...refreshed,
        chain_status: "advanced",
        next_step: nextStepNumber,
        next_step_label: nextSteps.length === 1 ? nextSteps[0].approverRoleLabel : "Aprobare paralelă",
        next_approvers: nextSteps.length,
      },
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

// ─── Shared row hydration (inbox + decision history) ─────────────────────────
// Numele, lanțul de semnături și atașamentele unei liste de cereri. Trăia inline în handlerul de
// inbox; istoricul deciziilor are nevoie de exact aceleași coloane, iar o a doua copie ar fi
// început imediat să difere de prima.

type ParRow = typeof parRequests.$inferSelect;

async function hydrateParRows(tenantId: string, pars: ParRow[]) {
  if (pars.length === 0) return [];
  const parIds = [...new Set(pars.map((p) => p.id))];

  const [settings] = await db
    .select({ threshold: parSettings.microPurchaseThresholdCents })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));
  const threshold = settings?.threshold ?? 1000000;

  // Resolve display names so approver cards show people/projects, not UUIDs.
  const projectIds = [...new Set(pars.map((p) => p.projectId).filter((v): v is string => !!v))];
  const requestorIds = [...new Set(pars.map((p) => p.requestedByUserId).filter((v): v is string => !!v))];
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
  const attachmentRows = await db.select({
    id: parAttachments.id,
    parId: parAttachments.parId,
    fileName: parAttachments.fileName,
    kind: parAttachments.kind,
  }).from(parAttachments).where(and(
    eq(parAttachments.tenantId, tenantId),
    inArray(parAttachments.parId, parIds),
  ));

  // Cât de lung e lanțul acestei cereri. Fără asta, un aprobator care semnează pasul 1 dintr-un
  // lanț de 2 vede aceeași cerere reapărând în inbox și crede că aprobarea "nu a mers" / că cererea
  // "nu se duce în coada de finanțe" — exact reclamația din ATIC, unde matricea DOA are un pas 2
  // "Oricine · PAR Admin" pe care tot el trebuie să-l semneze.
  const chainRows = await db
    .select({
      id: parApprovals.id,
      parId: parApprovals.parId,
      step: parApprovals.step,
      decision: parApprovals.decision,
      approverUserId: parApprovals.approverUserId,
      approverRoleLabel: parApprovals.approverRoleLabel,
      signatureName: parApprovals.signatureName,
      decidedAt: parApprovals.decidedAt,
    })
    .from(parApprovals)
    .where(and(eq(parApprovals.tenantId, tenantId), inArray(parApprovals.parId, parIds)));

  // Numele semnatarilor: cine a semnat deja și cine e pinuit pe un pas care încă așteaptă.
  const chainUserIds = [...new Set(chainRows.map((s) => s.approverUserId).filter((v): v is string => !!v))];
  const chainUserRows = chainUserIds.length
    ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users)
        .where(and(eq(users.tenantId, tenantId), inArray(users.id, chainUserIds)))
    : [];
  const chainUserById = new Map(chainUserRows.map((r) => [r.id, r]));
  const chainUserName = (id: string | null) => {
    if (!id) return null;
    const u = chainUserById.get(id);
    return u?.name || u?.email || null;
  };

  // Etichetele-nume rămase din regulile DOA vechi (vezi slotRoleLabel + migrarea 0156): un slot pe
  // care scria „Ana Chirita" se anunța cu numele ei și după ce ajungea în inboxul altcuiva. Numele
  // cu care comparăm sunt cele deja aduse pentru cererile astea — solicitanții și titularii de pas.
  const knownNames = [
    ...userRows.map((r) => r.name),
    ...chainUserRows.map((r) => r.name),
  ].filter((n): n is string => !!n);
  const labelOf = (label: string | null) =>
    slotRoleLabel(
      label,
      knownNames.find((n) => n.trim().toLocaleLowerCase("ro") === (label ?? "").trim().toLocaleLowerCase("ro")) ?? null
    );

  // PERF (audit 2026-08-29): `chainOf` filtra și sorta TOATE rândurile de lanț pentru FIECARE
  // cerere din inbox — O(cereri × pași), plus un `find` liniar prin utilizatori la fiecare nume.
  // Cu 200 de cereri în inbox erau zeci de mii de comparații degeaba. Gruparea se face o dată.
  const chainByPar = new Map<string, typeof chainRows>();
  for (const row of chainRows) {
    if (row.step <= 0) continue;
    const list = chainByPar.get(row.parId);
    if (list) list.push(row);
    else chainByPar.set(row.parId, [row]);
  }
  for (const list of chainByPar.values()) list.sort((a, b) => a.step - b.step);

  const chainOf = (parId: string) => {
    const steps = chainByPar.get(parId) ?? [];
    return {
      steps_total: steps.length,
      steps_approved: steps.filter((s) => s.decision === "approved").length,
      // Cine a semnat deja — numele contează mai mult decât numărul: aprobatorul vrea să știe
      // dacă cererea a trecut pe la directorul de program înainte să pună el semnătura.
      approvals_done: steps
        .filter((s) => s.decision === "approved")
        .map((s) => ({
          step: s.step,
          name: chainUserName(s.approverUserId) ?? s.signatureName ?? null,
          roleLabel: labelOf(s.approverRoleLabel),
          decidedAt: s.decidedAt,
        })),
      // Câți mai trebuie și cine — inclusiv pasul curent al celui care se uită acum.
      approvals_pending: steps
        .filter((s) => s.decision === "pending")
        .map((s) => ({
          // Identitatea RÂNDULUI, nu a pasului: pe un nivel paralel două persoane diferite stau pe
          // același `step`, iar interfața marca „tu" după numărul pasului — deci „mai trebuie 2:
          // tu → tu", pentru doi oameni diferiți.
          id: s.id,
          step: s.step,
          name: chainUserName(s.approverUserId),
          roleLabel: labelOf(s.approverRoleLabel),
        })),
    };
  };

  return pars.map((p) => ({
    ...p,
    above_micro_threshold: p.totalEstimatedCents > threshold,
    ...chainOf(p.id),
    projectName: projName(p.projectId),
    requestedByName: reqName(p.requestedByUserId),
    attachments: attachmentRows
      .filter((attachment) => attachment.parId === p.id)
      .map(({ parId: _parId, ...attachment }) => attachment),
  }));
}

// ─── GET /api/par/inbox?scope=decided ────────────────────────────────────────
/**
 * Istoricul deciziilor mele — „ce am aprobat eu până acum".
 *
 * Inboxul arată doar ce așteaptă semnătura ta, deci o cerere dispare din el în secunda în care ai
 * decis-o; un aprobator care voia să vadă ce a semnat săptămâna trecută nu avea unde să se uite
 * (cererea owner-ului, 2026-09-10).
 *
 * De ce din `par_audit` și nu din `par_approvals`: pasul NU își rescrie `approver_user_id` când e
 * decis — un pas atribuit pe rol rămâne cu NULL, iar unul semnat prin delegare rămâne pe numele
 * delegantului. Singura evidență a cui a apăsat butonul este actorul din jurnalul de audit.
 */
const MY_DECISION_EVENTS = ["approved", "rejected", "changes_requested", "overage_reapproved"] as const;

/**
 * A doua sursă: semnătura pe care o dai fără să apeși nimic.
 *
 * La depunere, rândul 14 (SOLICITANT) se scrie deja `approved`, pe numele celui care a trimis
 * cererea — iar dacă el era și pe lanțul de aprobare, pasul lui se ELIMINĂ (segregarea sarcinilor,
 * vezi `chainWithoutSelfApproval`). Din afară asta arată exact ca o aprobare automată. Numai că nu
 * trece prin ruta de `/approve`, deci nu lasă niciun eveniment în `par_audit` — și cererile proprii
 * lipseau din „Deciziile mele", deși aveau semnătura omului pe ele (cererea owner-ului, 2026-09-10).
 *
 * Rămâne o etichetă separată, nu „Aprobat": e o semnătură de depunere, nu o decizie luată pe cererea
 * altcuiva. Pasul 0 e singurul care se poate citi direct din `par_approvals` fără ambiguitate — el
 * e mereu fixat pe utilizatorul care a depus, niciodată pe rol și niciodată prin delegare.
 */
const SUBMIT_SIGNATURE = "submit_signature";

async function decidedByMe(userId: string, tenantId: string, tenantRole: string, limitRaw?: string) {
  const parsed = Number(limitRaw);
  const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 200;

  const decisions = await db
    .select({ parId: parAudit.parId, event: parAudit.event, createdAt: parAudit.createdAt })
    .from(parAudit)
    .where(and(
      eq(parAudit.tenantId, tenantId),
      eq(parAudit.actorUserId, userId),
      inArray(parAudit.event, [...MY_DECISION_EVENTS]),
    ))
    .orderBy(desc(parAudit.createdAt));

  // Ultima decizie per cerere: o cerere întoarsă la solicitant și re-aprobată apare o dată, cu
  // decizia curentă, nu de trei ori. Rândurile vin deja de la nou la vechi.
  const latest = new Map<string, { event: string; at: Date | null }>();
  for (const d of decisions) {
    if (!latest.has(d.parId)) latest.set(d.parId, { event: d.event, at: d.createdAt });
  }

  // Semnăturile de la depunere intră doar acolo unde nu am luat între timp o decizie explicită —
  // o decizie apăsată de om spune mai mult decât semnătura automată de pe aceeași cerere.
  const submitSignatures = await db
    .select({ parId: parApprovals.parId, decidedAt: parApprovals.decidedAt })
    .from(parApprovals)
    .where(and(
      eq(parApprovals.tenantId, tenantId),
      eq(parApprovals.approverUserId, userId),
      eq(parApprovals.step, 0),
      eq(parApprovals.decision, "approved"),
    ));
  for (const s of submitSignatures) {
    if (!latest.has(s.parId)) latest.set(s.parId, { event: SUBMIT_SIGNATURE, at: s.decidedAt });
  }

  if (latest.size === 0) return { inbox: [], total: 0 };

  // Sortarea trebuie făcută ÎNAINTE de limită: cu două surse, ordinea de inserare în hartă nu mai e
  // cronologică, iar un `slice` pe ea ar tăia exact semnăturile de ieri și le-ar păstra pe cele de
  // acum trei luni.
  const parIds = [...latest.entries()]
    .sort((a, b) => (b[1].at?.getTime() ?? 0) - (a[1].at?.getTime() ?? 0))
    .slice(0, limit)
    .map(([id]) => id);
  const pars = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.tenantId, tenantId), inArray(parRequests.id, parIds)));

  // Aceeași limită de vizibilitate ca inboxul: dacă între timp ai fost scos de pe proiect, cererea
  // nu mai apare. Istoricul nu e o portiță de acces la ce nu mai ai voie să vezi.
  const { projects: accessibleProjects, payers: accessiblePayers } = await accessibleScopes(userId, tenantId, tenantRole);
  const visible = pars.filter((p) =>
    p.projectId
      ? accessibleProjects === null || accessibleProjects.includes(p.projectId)
      : !!p.payerId && (accessiblePayers === null || accessiblePayers.includes(p.payerId))
  );

  const inbox = (await hydrateParRows(tenantId, visible))
    .map((row) => {
      const mine = latest.get(row.id)!;
      return {
        ...row,
        // Pasul e istorie acum — ce contează e ce am decis și când.
        my_step: null,
        my_step_label: null,
        my_decision: mine.event,
        my_decided_at: mine.at,
      };
    })
    .sort((a, b) => (b.my_decided_at?.getTime() ?? 0) - (a.my_decided_at?.getTime() ?? 0));

  return { inbox, total: inbox.length };
}

// ─── GET /api/par/inbox ───────────────────────────────────────────────────────
// Returns PARs where the current user is the approver of the currently active (unlocked, pending) step.

parApprovalsRoutes.get("/inbox", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  // ?scope=decided → istoricul propriilor decizii, nu cererile care așteaptă (vezi decidedByMe).
  if (c.req.query("scope") === "decided") {
    return c.json(await decidedByMe(user.id, tenantId, user.role, c.req.query("limit")));
  }

  const roles = await getUserPARRoles(user.id, tenantId);
  const isApprover = roles.includes("approver") || roles.includes("par_admin");

  // VF-302: principals who delegated their authority to this user (active now).
  const delegators = await getActiveDelegators(user.id, tenantId);
  // Roles inherited through an active delegation — the inbox must show what approve/reject accept.
  const { roles: inboxDelegatedRoles } = await getDelegatedAuthority(delegators, tenantId, null);

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

  // VM5-11: „ce pași sunt ai mei" trăiește în `lib/par/pendingForUser`, ca inboxul și digestul de
  // email să răspundă IDENTIC. Un email care spune „ai 5 cereri" lângă un inbox care arată 3
  // distruge încrederea în amândouă. Regula de fond rămâne `stepMatchesViewer`, aceeași pe care o
  // aplică approve/reject.
  const [{ steps: pendingSteps, scopeByPar }, projectApproverMap] = await Promise.all([
    loadOpenApprovalSteps(tenantId),
    getProjectApproverMap(tenantId),
  ]);
  const mySteps = await filterStepsForUser({
    userId: user.id,
    tenantId,
    tenantRole: user.role,
    steps: pendingSteps,
    scopeByPar,
    projectApproverMap,
  });

  if (mySteps.length === 0) {
    return c.json({ inbox: [], total: 0 });
  }

  const parIds = [...new Set(mySteps.map((s) => s.parId))];

  // PERF (audit 2026-08-29): se aduceau TOATE cererile `pending_approval` ale tenantului și abia
  // apoi se păstrau cele din `parIds`, cu `Array.includes` (căutare liniară) — muncă pătratică pe
  // un set care oricum era deja cunoscut. Filtrul intră în SQL.
  const pars = await db
    .select()
    .from(parRequests)
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        eq(parRequests.status, "pending_approval"),
        inArray(parRequests.id, parIds)
      )
    )
    .orderBy(desc(parRequests.isUrgent), desc(parRequests.submittedAt));

  // VM5-05: câte nepotriviri document↔cerere are fiecare rând. O singură interogare pentru tot
  // inboxul — semnul de pe rând e ce împiedică o cerere cu documente greșite să intre tăcut într-o
  // aprobare în masă.
  const attachmentRows = await db
    .select({ parId: parAttachments.parId, analysis: parAttachments.analysis })
    .from(parAttachments)
    .where(and(eq(parAttachments.tenantId, tenantId), inArray(parAttachments.parId, parIds)));
  const mismatchesByPar = countMismatchesByPar(attachmentRows);

  const inbox = (await hydrateParRows(tenantId, pars)).map((row) => {
    const myStep = mySteps.find((s) => s.parId === row.id);
    return {
      ...row,
      document_warnings: mismatchesByPar.get(row.id) ?? 0,
      my_step: myStep?.step ?? null,
      /** Rândul exact pe care cade semnătura mea — vezi `approvals_pending[].id`. */
      my_step_id: myStep?.id ?? null,
      // Aceeași etichetă curățată ca în lanțul de mai sus — nu cea brută din rând.
      my_step_label:
        row.approvals_pending?.find((s) => s.id === myStep?.id)?.roleLabel ??
        myStep?.approverRoleLabel ??
        null,
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

    const result = await approveParStep(user.id, tenantId, user.role, parId, body);
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

  // PERF (audit 2026-08-29): aprobarea în masă rula strict secvențial — până la 25 × ~15
  // dus-întorsuri = 20-60 s, adică peste plafonul funcției serverless: exact acțiunea „scap de
  // toate deodată" era cea care nu se termina niciodată. Cererile sunt independente între ele,
  // deci se procesează în valuri mici. Concurență mică intenționat: poolul are `max: 3`
  // conexiuni, iar un val prea larg le-ar epuiza și ar bloca restul aplicației.
  const CONCURRENCY = 4;
  const ids = [...new Set(par_ids)];
  const results: Array<{ id: string; ok: boolean; status?: string; error?: string }> = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (parId) => {
        const r = await approveParStep(user.id, tenantId, user.role, parId, { comment, signatureName });
        return r.ok
          ? { id: parId, ok: true, status: r.status }
          : { id: parId, ok: false, error: r.error };
      })
    );
    results.push(...settled);
  }

  const approved = results.filter((r) => r.ok).length;
  return c.json({ results, approved, failed: results.length - approved });
});

// ─── Core reject logic (shared by /:id/reject and /bulk-reject) ───────────────
// VM5-13: extras din handler exact ca `approveParStep`, ca respingerea în masă să ruleze ACEEAȘI
// logică per cerere. Fără extragere, „respinge toate" ar fi însemnat o a doua copie a regulilor de
// autoritate — iar copiile astea au driftat deja o dată (PARQA-010).
async function rejectParStep(
  userId: string,
  tenantId: string,
  tenantRole: string,
  parId: string,
  body: { comment: string; signatureName?: string | null }
): Promise<ApproveResult> {
  const roles = await getUserPARRoles(userId, tenantId);
  const canApprove = roles.includes("approver") || roles.includes("par_admin");
  // PARQA-010: reject must honor the SAME authority as approve — explicit assignment OR an active
  // delegation (before, a delegatee who could approve a step couldn't reject it).
  const delegators = await getActiveDelegators(userId, tenantId);
  if (!(await canActOnApproval(userId, tenantId, parId, canApprove)) && !(await hasDelegatedPendingStep(userId, tenantId, parId, delegators))) {
    return { ok: false, status: 403, error: "forbidden: approver role required" };
  }

  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
  if (!par) return { ok: false, status: 404, error: "not_found" };
  if (par.projectId ? !(await mayAccessProject(userId, tenantId, par.projectId, tenantRole)) : !(await mayAccessPayer(userId, tenantId, par.payerId, tenantRole))) {
    return { ok: false, status: 404, error: "not_found" };
  }

  if (par.status !== "pending_approval") {
    return { ok: false, status: 409, error: `conflict: PAR status is '${par.status}'` };
  }

  // Must be the approver of the active step
  const approvalSteps = await db
    .select()
    .from(parApprovals)
    .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
    .orderBy(asc(parApprovals.step));

  // PARQA-010: project-scoping applies to reject too — an approver not designated for this PAR's
  // project can no longer reject it (before, scoping was only enforced on approve/inbox).
  const designated = par.projectId ? await getDesignatedApprovers(tenantId, par.projectId) : new Set<string>();
  const allowedOnProject = projectAllowsApprover(par.projectId, userId, designated);
  // Same rule set as approve (decisionAuthority.ts) — incl. a step's required par_role, which the
  // hand-rolled copy here used to ignore (a "finance"-gated step was rejectable by any approver).
  const delegated = await getDelegatedAuthority(delegators, tenantId, par.projectId);
  const viewerCtx = {
    userId, parRoles: roles, delegators, allowedOnProject,
    delegatedRoles: delegated.roles, delegatedAllowedOnProject: delegated.allowedOnProject,
  };

  const lockedStepForUserReject = pickDecidableStep(approvalSteps, viewerCtx, { locked: true });
  const activeStep = pickDecidableStep(approvalSteps, viewerCtx, { locked: false });

  if (!activeStep) {
    if (lockedStepForUserReject) {
      return {
        ok: false,
        status: 409,
        error: "conflict: approval step is locked — prior step not yet approved",
        extra: { locked_step: lockedStepForUserReject.step },
      };
    }
    return { ok: false, status: 403, error: "forbidden: no active step assigned to you" };
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
    actorUserId: userId,
    event: "rejected",
    detail: `Step ${activeStep.step} rejected. Comment: ${body.comment.slice(0, 200)}`,
  });

  // PAR-111: notify requestor (best-effort)
  await notifyRejected(
    { tenantId, parId, requestNo: par.requestNo },
    par.requestedByUserId,
    body.comment,
    userId // VM5-01: solicitantul trebuie să vadă CINE a decis, nu doar că s-a decis
  );

  return { ok: true, status: "rejected", body: { ...rejectedPar, chain_status: "rejected" } };
}

// ─── POST /api/par/:id/reject ─────────────────────────────────────────────────

parApprovalsRoutes.post(
  "/:id/reject",
  zValidator("json", rejectSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const result = await rejectParStep(user.id, user.tenantId, user.role, c.req.param("id"), body);
    if (!result.ok) return c.json({ error: result.error, ...result.extra }, result.status as 400);
    return c.json(result.body);
  }
);

// ─── POST /api/par/bulk-reject ────────────────────────────────────────────────
// VM5-13 (ședința de prezentare): „trebuie buton aprobă toate sau respinse toate". Simetricul lui
// bulk-approve, cu o singură diferență de fond: MOTIVUL E OBLIGATORIU. Nicio respingere din sistem
// nu e anonimă — solicitantul primește motivul, iar el rămâne în jurnal.
const bulkRejectSchema = z.object({
  par_ids: z.array(z.string().uuid()).min(1).max(25),
  comment: z.string().min(1, "Comment is required for rejection").max(5000),
  signatureName: z.string().max(300).optional().nullable(),
});

parApprovalsRoutes.post("/bulk-reject", zValidator("json", bulkRejectSchema), async (c) => {
  const user = c.get("user");
  const { par_ids, comment, signatureName } = c.req.valid("json");

  // Secvențial, ca la bulk-approve: fiecare cerere e o tranzacție proprie, iar un eșec (nu e pasul
  // meu, altă stare, în afara ariei) nu atinge restul lotului.
  const results = [];
  for (const parId of [...new Set(par_ids)]) {
    const r = await rejectParStep(user.id, user.tenantId, user.role, parId, { comment, signatureName });
    results.push(r.ok ? { id: parId, ok: true, status: r.status } : { id: parId, ok: false, error: r.error });
  }

  const rejected = results.filter((r) => r.ok).length;
  return c.json({ results, rejected, failed: results.length - rejected });
});

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
    // PARQA-010: request-changes now honors explicit assignment + active delegation (before it
    // required the generic approver role and ignored both assignment and delegation).
    const delegators = await getActiveDelegators(user.id, tenantId);
    if (!(await canActOnApproval(user.id, tenantId, parId, canApprove)) && !(await hasDelegatedPendingStep(user.id, tenantId, parId, delegators))) {
      return c.json({ error: "forbidden: approver role required" }, 403);
    }

    const [par] = await db
      .select()
      .from(parRequests)
      .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));
    if (!par) return c.json({ error: "not_found" }, 404);
    if (par.projectId ? !(await mayAccessProject(user.id, tenantId, par.projectId, user.role)) : !(await mayAccessPayer(user.id, tenantId, par.payerId, user.role))) {
      return c.json({ error: "not_found" }, 404);
    }

    if (par.status !== "pending_approval") {
      return c.json({ error: `conflict: PAR status is '${par.status}'` }, 409);
    }

    const approvalSteps = await db
      .select()
      .from(parApprovals)
      .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
      .orderBy(asc(parApprovals.step));

    // PARQA-010: same project-scoping + delegation matching as approve/reject (decisionAuthority.ts).
    const designated = par.projectId ? await getDesignatedApprovers(tenantId, par.projectId) : new Set<string>();
    const allowedOnProject = projectAllowsApprover(par.projectId, user.id, designated);
    const delegated = await getDelegatedAuthority(delegators, tenantId, par.projectId);
    const viewerCtx = {
      userId: user.id, parRoles: roles, delegators, allowedOnProject,
      delegatedRoles: delegated.roles, delegatedAllowedOnProject: delegated.allowedOnProject,
    };

    const activeStep = pickDecidableStep(approvalSteps, viewerCtx, { locked: false });

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
      body.comment,
      user.id // VM5-01
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

  // SECURITY (audit 2026-08-29): re-aprobarea depășirii era singura decizie de aprobare fără
  // gardă de segregare a sarcinilor. `approveParStep` refuză dur auto-aprobarea (mai sus în
  // fișier), dar aici lipsea — deci un solicitant care are și rol de aprobator își putea aproba
  // singur depășirea propriei cereri și trimite plata mai departe. Controlul „plata efectivă a
  // depășit estimatul cu peste 10%" se auto-anula astfel.
  if (par.requestedByUserId === user.id) {
    return c.json({ error: "forbidden: cannot re-approve your own PAR (self-approval)" }, 403);
  }
  if (par.projectId ? !(await mayAccessProject(user.id, tenantId, par.projectId, user.role)) : !(await mayAccessPayer(user.id, tenantId, par.payerId, user.role))) {
    return c.json({ error: "not_found" }, 404);
  }

  if (par.status !== "reapproval_required") {
    return c.json(
      { error: `conflict: PAR status is '${par.status}', expected reapproval_required` },
      409
    );
  }

  // A doua parte a aceleiași reguli: depășirea se acoperă de cineva care CHIAR a semnat această
  // cerere (sau de autoritatea de escaladare, par_admin) — nu de orice aprobator din arie care
  // n-a văzut-o niciodată. Sursa adevărului pentru „cine a semnat" e jurnalul de audit:
  // `par_approvals.approver_user_id` e cine era ASIGNAT, nu cine a decis (pașii pe rol îl au null).
  const isParAdmin = roles.includes("par_admin");
  if (!isParAdmin) {
    const signed = await db
      .select({ id: parAudit.id })
      .from(parAudit)
      .where(and(
        eq(parAudit.tenantId, tenantId),
        eq(parAudit.parId, parId),
        eq(parAudit.event, "approved"),
        eq(parAudit.actorUserId, user.id),
      ))
      .limit(1);
    if (signed.length === 0) {
      return c.json(
        { error: "forbidden: only an approver who signed this PAR (or a par_admin) may re-approve the overage" },
        403
      );
    }

    // Și plafonul DOA se aplică sumei EFECTIV plătite, nu celei estimate — altfel depășirea ar fi
    // exact portița prin care se semnează peste limită.
    const [pmt] = await db
      .select({ actual: parPayments.actualAmountCents })
      .from(parPayments)
      .where(and(eq(parPayments.parId, parId), eq(parPayments.tenantId, tenantId)));
    const actualCents = pmt?.actual ?? null;
    if (actualCents != null) {
      const limitRows = await db
        .select({ userId: parMembers.userId, limit: parMembers.approvalLimitCents })
        .from(parMembers)
        .where(and(eq(parMembers.tenantId, tenantId), eq(parMembers.userId, user.id)));
      const limitCents = minApprovalLimitCents(limitRows, [user.id]);
      if (blocksOnApprovalLimit({ isFinalApproval: true, isParAdmin: false, approverLimitCents: limitCents, amountMdlCents: actualCents })) {
        await writeAudit({
          tenantId, parId, actorUserId: user.id, event: "approval_limit_exceeded",
          detail: `Overage re-approval blocked: paid ${actualCents} cents exceeds approver limit ${limitCents} cents.`,
        });
        return c.json({ error: "over_approval_limit", limit_cents: limitCents, amount_cents: actualCents }, 403);
      }
    }
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
