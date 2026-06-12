/**
 * PAR-109: Body-integrity helper — deterministic SHA-256 hash of the PAR body.
 *
 * The hash is computed over a canonical JSON representation of:
 *   - header fields (sections 1–9, 11, 12) that are locked after submit
 *   - line items (section 10, sorted by position)
 *
 * This hash is stored on `par_requests.body_hash` at submit time (PAR-107) and
 * re-computed on display / PDF to detect tampering (PAR-109 §AC).
 *
 * Implementation notes:
 * - We use Node's built-in `crypto.createHash('sha256')` — no new dependency.
 * - All numbers stored in minor units (cents) — no floating-point representation.
 * - Fields that can change outside the approval body (status, timestamps, attachments)
 *   are excluded. Attachments are referenced by metadata only.
 * - The canonical string is stable across node versions because we JSON.stringify
 *   a plain object with keys in a fixed, explicit order.
 */
import { createHash } from "crypto";

export interface ParBodyForHash {
  /** PAR-header section 1–9, 11–12 fields */
  requestNo: string;
  dateOfRequest: string; // ISO string
  requestorTitle: string | null;
  departmentId: string | null;
  dateNeeded: string | null; // ISO string or null
  projectId: string | null;
  budgetCodeId: string | null;
  budgetCodeNote: string | null;
  purpose: string;
  chargeTo: string;
  chargeBillingCode: string | null;
  endUse: string | null;
  vendorId: string | null;
  payeeName: string | null;
  payeeIdnp: string | null;
  payeeIban: string | null;
  payeeBank: string | null;
  currency: string;
  totalEstimatedCents: number;
  /** Line items sorted by position ascending */
  lineItems: Array<{
    position: number;
    description: string;
    quantity: number;
    unit: string | null;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
}

/**
 * Produce a deterministic canonical JSON string for hashing.
 * Keys are written in a fixed explicit order so the output is stable
 * regardless of insertion order.
 */
function canonicalize(body: ParBodyForHash): string {
  const canonical = {
    requestNo: body.requestNo,
    dateOfRequest: body.dateOfRequest,
    requestorTitle: body.requestorTitle,
    departmentId: body.departmentId,
    dateNeeded: body.dateNeeded,
    projectId: body.projectId,
    budgetCodeId: body.budgetCodeId,
    budgetCodeNote: body.budgetCodeNote,
    purpose: body.purpose,
    chargeTo: body.chargeTo,
    chargeBillingCode: body.chargeBillingCode,
    endUse: body.endUse,
    vendorId: body.vendorId,
    payeeName: body.payeeName,
    payeeIdnp: body.payeeIdnp,
    payeeIban: body.payeeIban,
    payeeBank: body.payeeBank,
    currency: body.currency,
    totalEstimatedCents: body.totalEstimatedCents,
    lineItems: [...body.lineItems].sort((a, b) => a.position - b.position).map((li) => ({
      position: li.position,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      unitPriceCents: li.unitPriceCents,
      lineTotalCents: li.lineTotalCents,
    })),
  };
  return JSON.stringify(canonical);
}

/**
 * Compute the SHA-256 hex digest of the PAR body.
 * Returns a 64-character hex string.
 */
export function computeParBodyHash(body: ParBodyForHash): string {
  const canonical = canonicalize(body);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Verify that a given hash matches the re-computed hash of the body.
 * Returns true if they match (body untampered), false + detail if not.
 */
export function verifyParBodyHash(
  body: ParBodyForHash,
  expectedHash: string
): { valid: boolean; detail?: string } {
  const computed = computeParBodyHash(body);
  if (computed === expectedHash) {
    return { valid: true };
  }
  return {
    valid: false,
    detail: `Hash mismatch: stored=${expectedHash.slice(0, 8)}…  computed=${computed.slice(0, 8)}…`,
  };
}
