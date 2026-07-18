/**
 * PAR-107: Submit engine — replaces the PAR-105 stub.
 *
 * On submit:
 *  1. Validates completeness (≥1 line, total>0, end_use + payee if execute_payment)
 *  2. Calls resolveApprovalChain (PAR-002) → creates par_approvals rows
 *  3. Blocks self-approval (skips to next eligible approver if requestor would be on step)
 *  4. Computes + stores deterministic body hash (PAR-109 integrity)
 *  5. Transitions PAR → pending_approval, sets submitted_at
 *  6. Writes par_audit row + emits notification event (stub — PAR-111 consumes it)
 *
 * Returns the updated par_requests row.
 *
 * CORE: backlog/par/PAR-CORE.md §3, §4, §9
 */
import { and, eq, asc } from "drizzle-orm";
import { db } from "../../db/client";
import {
  parRequests,
  parLineItems,
  parApprovals,
  parAudit,
  parSettings,
  ParRequest,
  ParLineItem,
} from "../../db/schema/par";
import { resolveApprovalChain } from "./doa";
import { toMdlCents } from "../fx";
import { computeParBodyHash, type ParBodyForHash } from "./integrity";
import { notifySubmitted } from "../../services/par/notify";

// ─── Validation ───────────────────────────────────────────────────────────────

export interface SubmitValidationError {
  field: string;
  message: string;
}

/**
 * Validates that a PAR is complete enough to submit.
 * Returns an array of errors; empty means valid.
 */
export function validateParForSubmit(
  par: ParRequest,
  lineItems: ParLineItem[]
): SubmitValidationError[] {
  const errors: SubmitValidationError[] = [];

  if (lineItems.length === 0) {
    errors.push({ field: "line_items", message: "At least one line item is required" });
  }

  if (par.totalEstimatedCents <= 0) {
    errors.push({ field: "total", message: "Total estimated cost must be greater than 0" });
  }

  if (par.purpose === "execute_payment") {
    if (!par.endUse?.trim()) {
      errors.push({ field: "end_use", message: "End use description is required for execute_payment" });
    }
    // Payee required for execute_payment
    const hasVendor = !!par.vendorId;
    const hasInlinePayee = !!par.payeeName?.trim() && !!par.payeeIban?.trim();
    if (!hasVendor && !hasInlinePayee) {
      errors.push({
        field: "payee",
        message: "Payee (vendor or inline name + IBAN) is required for execute_payment",
      });
    }
  }

  return errors;
}

// ─── Main submit function ─────────────────────────────────────────────────────

export interface SubmitResult {
  ok: true;
  par: ParRequest;
  approvalSteps: number;
}

export interface SubmitError {
  ok: false;
  code: "already_submitted" | "validation_errors" | "no_approval_chain";
  errors?: SubmitValidationError[];
  message?: string;
}

/**
 * Execute the full submit flow for a PAR.
 * Caller is responsible for verifying the PAR exists and belongs to the user's tenant.
 */
export async function submitPAR(params: {
  parId: string;
  tenantId: string;
  actorUserId: string;
  /** Snapshot of the requestor's job title at submit time (for step-0 approval row) */
  requestorTitleSnapshot?: string | null;
}): Promise<SubmitResult | SubmitError> {
  const { parId, tenantId, actorUserId, requestorTitleSnapshot } = params;

  // Fetch PAR
  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  if (!par) {
    return { ok: false, code: "validation_errors", message: "PAR not found" };
  }

  // Idempotency: re-submit on already pending → 409 (handled by caller from this error)
  if (par.status === "pending_approval") {
    return { ok: false, code: "already_submitted", message: "PAR is already pending approval" };
  }

  // Fetch line items
  const lineItems = await db
    .select()
    .from(parLineItems)
    .where(and(eq(parLineItems.parId, parId), eq(parLineItems.tenantId, tenantId)))
    .orderBy(asc(parLineItems.position));

  // Validate completeness
  const validationErrors = validateParForSubmit(par, lineItems);
  if (validationErrors.length > 0) {
    return { ok: false, code: "validation_errors", errors: validationErrors };
  }

  // VF-203: convert to MDL for the DOA threshold (the matrix bands are in MDL).
  // For MDL PARs this is a no-op (rate 1, totalMdlCents = totalEstimatedCents).
  let exchangeRate: number | null = null;
  let totalMdlCents = par.totalEstimatedCents;
  if (par.currency && par.currency !== "MDL") {
    try {
      const conv = await toMdlCents(par.totalEstimatedCents, par.currency);
      exchangeRate = conv.rate;
      totalMdlCents = conv.mdlCents;
    } catch {
      // PARQA-018: FX unavailable — do NOT route a EUR/USD amount as if it were MDL. That
      // under-approves ~20× (1 EUR ≈ 20 MDL) and could skip senior approvers, letting a large
      // payment through at a low authority band. Block with a clear, retryable error instead so the
      // PAR is never routed at the wrong DOA band. FX outages are rare and transient.
      return {
        ok: false,
        code: "validation_errors",
        errors: [{
          field: "currency",
          message: "Rata de schimb valutar (BNM) e indisponibilă momentan — reîncearcă trimiterea în câteva minute.",
        }],
      };
    }
  }

  // Resolve approval chain from DOA matrix — uses the MDL-equivalent amount.
  const chain = await resolveApprovalChain({
    tenantId,
    totalCents: totalMdlCents,
    chargeTo: par.chargeTo ?? undefined,
    departmentId: par.departmentId ?? undefined,
  });

  // Self-approval prevention: if the requestor (actorUserId) appears in a step as the specific
  // approver, we skip to the next eligible approver (or leave the step but flag it so the
  // requestor cannot decide it — the flag is: approverUserId stays, but the route will 403 self).
  // For this release: when approverUserId === actorUserId, we null out the specific user so the
  // step falls to role-based routing (any other user with the required par_role can approve it).
  const sanitizedChain = chain.map((step) => ({
    ...step,
    approverUserId:
      step.approverUserId === actorUserId ? null : step.approverUserId,
  }));

  // Compute body hash for immutability (PAR-109)
  const bodyForHash: ParBodyForHash = {
    requestNo: par.requestNo,
    dateOfRequest: par.dateOfRequest.toISOString(),
    requestorTitle: par.requestorTitle ?? null,
    departmentId: par.departmentId ?? null,
    dateNeeded: par.dateNeeded?.toISOString() ?? null,
    projectId: par.projectId ?? null,
    budgetCodeId: par.budgetCodeId ?? null,
    budgetCodeNote: par.budgetCodeNote ?? null,
    purpose: par.purpose,
    chargeTo: par.chargeTo,
    chargeBillingCode: par.chargeBillingCode ?? null,
    endUse: par.endUse ?? null,
    vendorId: par.vendorId ?? null,
    payeeName: par.payeeName ?? null,
    payeeIdnp: par.payeeIdnp ?? null,
    payeeIban: par.payeeIban ?? null,
    payeeBank: par.payeeBank ?? null,
    currency: par.currency,
    totalEstimatedCents: par.totalEstimatedCents,
    lineItems: lineItems.map((li) => ({
      position: li.position,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit ?? null,
      unitPriceCents: li.unitPriceCents,
      lineTotalCents: li.lineTotalCents,
    })),
  };
  const bodyHash = computeParBodyHash(bodyForHash);

  // Invalidate any existing approval rows for re-submit after changes_requested
  await db
    .delete(parApprovals)
    .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)));

  // Insert step-0 row = requestor submit "signature" (sections 14 on the form)
  await db.insert(parApprovals).values({
    tenantId,
    parId,
    step: 0,
    approverUserId: actorUserId,
    approverRoleLabel: "Requestor",
    decision: "approved", // Requestor has "signed" by submitting
    decidedAt: new Date(),
    signatureName: requestorTitleSnapshot ?? null,
    signatureTitle: requestorTitleSnapshot ?? null,
    locked: false,
  });

  // Insert approval chain rows (steps 1..N)
  for (let i = 0; i < sanitizedChain.length; i++) {
    const step = sanitizedChain[i];
    await db.insert(parApprovals).values({
      tenantId,
      parId,
      step: step.step,
      approverUserId: step.approverUserId ?? null,
      // PARQA-007: persist the DOA role so a role-specific step is restricted to that role at approve time.
      approverParRole: step.approverParRole ?? null,
      approverRoleLabel: step.approverRoleLabel,
      decision: "pending",
      locked: i > 0, // step 1 (i=0) is active; steps 2+ (i>0) are locked
    });
  }

  // Update PAR: status → pending_approval, submittedAt, bodyHash, + VF-203 FX snapshot
  const [updatedPar] = await db
    .update(parRequests)
    .set({
      status: "pending_approval",
      submittedAt: new Date(),
      bodyHash,
      exchangeRate: exchangeRate != null ? String(exchangeRate) : null,
      totalMdlCents,
      updatedAt: new Date(),
    })
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)))
    .returning();

  // Audit log
  await db.insert(parAudit).values({
    tenantId,
    parId,
    actorUserId,
    event: "submitted",
    detail: `PAR ${par.requestNo} submitted; ${sanitizedChain.length} approval step(s) generated. Body hash: ${bodyHash.slice(0, 8)}…`,
  });

  // PAR-111: notify first approver (best-effort — never throws)
  const firstStep = sanitizedChain.find((s) => s.step === 1);
  await notifySubmitted(
    { tenantId, parId, requestNo: par.requestNo },
    firstStep?.approverUserId ?? null
  );

  return {
    ok: true,
    par: updatedPar,
    approvalSteps: sanitizedChain.length,
  };
}

// ─── Helper: build ParBodyForHash from a loaded PAR (used by PAR-109 integrity check on display) ──

export async function buildBodyForHash(
  parId: string,
  tenantId: string
): Promise<ParBodyForHash | null> {
  const [par] = await db
    .select()
    .from(parRequests)
    .where(and(eq(parRequests.id, parId), eq(parRequests.tenantId, tenantId)));

  if (!par) return null;

  const lineItems = await db
    .select()
    .from(parLineItems)
    .where(and(eq(parLineItems.parId, parId), eq(parLineItems.tenantId, tenantId)))
    .orderBy(asc(parLineItems.position));

  return {
    requestNo: par.requestNo,
    dateOfRequest: par.dateOfRequest.toISOString(),
    requestorTitle: par.requestorTitle ?? null,
    departmentId: par.departmentId ?? null,
    dateNeeded: par.dateNeeded?.toISOString() ?? null,
    projectId: par.projectId ?? null,
    budgetCodeId: par.budgetCodeId ?? null,
    budgetCodeNote: par.budgetCodeNote ?? null,
    purpose: par.purpose,
    chargeTo: par.chargeTo,
    chargeBillingCode: par.chargeBillingCode ?? null,
    endUse: par.endUse ?? null,
    vendorId: par.vendorId ?? null,
    payeeName: par.payeeName ?? null,
    payeeIdnp: par.payeeIdnp ?? null,
    payeeIban: par.payeeIban ?? null,
    payeeBank: par.payeeBank ?? null,
    currency: par.currency,
    totalEstimatedCents: par.totalEstimatedCents,
    lineItems: lineItems.map((li) => ({
      position: li.position,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit ?? null,
      unitPriceCents: li.unitPriceCents,
      lineTotalCents: li.lineTotalCents,
    })),
  };
}
