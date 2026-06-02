/**
 * CX-703 — Client API helpers for cohort participants
 */
import { api } from "../api";

export type ParticipantPaymentStatus = "full" | "half" | "pending" | "free";
export type ParticipantSource = "crm" | "manual";

export interface CohortParticipant {
  id: string;
  tenantId: string;
  cohortId: string;
  studentId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  whatsappJoined: boolean;
  paymentStatus: ParticipantPaymentStatus | null;
  amountCents: number;
  source: ParticipantSource;
  createdAt: string;
  updatedAt: string;
}

export interface AddParticipantPayload {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  whatsappJoined?: boolean;
  paymentStatus?: ParticipantPaymentStatus | null;
  amountCents?: number;
  studentId?: string | null;
}

export type PatchParticipantPayload = Partial<AddParticipantPayload>;

export async function listParticipants(
  cohortId: string
): Promise<{ participants: CohortParticipant[] }> {
  return api<{ participants: CohortParticipant[] }>(
    `/api/cohorts/${cohortId}/participants`
  );
}

export async function addParticipant(
  cohortId: string,
  payload: AddParticipantPayload
): Promise<{ participant: CohortParticipant }> {
  return api<{ participant: CohortParticipant }>(
    `/api/cohorts/${cohortId}/participants`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export async function patchParticipant(
  cohortId: string,
  id: string,
  payload: PatchParticipantPayload
): Promise<{ participant: CohortParticipant }> {
  return api<{ participant: CohortParticipant }>(
    `/api/cohorts/${cohortId}/participants/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
}

export async function deleteParticipant(
  cohortId: string,
  id: string
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(
    `/api/cohorts/${cohortId}/participants/${id}`,
    { method: "DELETE" }
  );
}

// ─── Break-even API (CX-705) ─────────────────────────────────────────────────

export interface CohortBreakeven {
  totalCostCents: number;
  revenueCents: number;
  projectedProfitCents: number;
  breakEvenDistanceCents: number;
  isProfit: boolean;
}

export async function getCohortBreakeven(
  cohortId: string
): Promise<{ breakeven: CohortBreakeven }> {
  return api<{ breakeven: CohortBreakeven }>(
    `/api/cohorts/${cohortId}/breakeven`
  );
}

/** Compute cohort stats from a participants list */
export interface CohortStats {
  /** full + half count */
  paidCount: number;
  fullCount: number;
  halfCount: number;
  pendingCount: number;
  freeCount: number;
  /** Sum of full + half amountCents */
  incasatCents: number;
  /**
   * Expected = Σ(full.amount) + Σ(half.amount × 2) + Σ(pending.amount)
   * Reproduces copy-roas useCXData expectedAmount logic
   */
  expectedCents: number;
}

export function computeCohortStats(
  participants: CohortParticipant[]
): CohortStats {
  let fullCount = 0;
  let halfCount = 0;
  let pendingCount = 0;
  let freeCount = 0;
  let incasatCents = 0;
  let expectedCents = 0;

  for (const p of participants) {
    switch (p.paymentStatus) {
      case "full":
        fullCount++;
        incasatCents += p.amountCents;
        expectedCents += p.amountCents;
        break;
      case "half":
        halfCount++;
        incasatCents += p.amountCents;
        expectedCents += p.amountCents * 2; // half paid means double is expected total
        break;
      case "pending":
        pendingCount++;
        expectedCents += p.amountCents;
        break;
      case "free":
        freeCount++;
        break;
      default:
        // null/unknown — count as pending
        pendingCount++;
        expectedCents += p.amountCents;
    }
  }

  return {
    paidCount: fullCount + halfCount,
    fullCount,
    halfCount,
    pendingCount,
    freeCount,
    incasatCents,
    expectedCents,
  };
}
