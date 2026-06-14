/**
 * ITPARK-101: Client API for engagement (dosar de verificare) CRUD.
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §2
 */

export type EngagementStatus = "draft" | "in_progress" | "ready" | "exported";

export interface ItparkEngagement {
  id: string;
  tenantId: string;
  residentName: string;
  idno: string;
  mitpContractNo: string | null;
  mitpContractDate: string | null;
  legalAddress: string | null;
  subdivisionAddresses: string | null;
  vatPayer: boolean;
  periodStart: string;
  periodEnd: string;
  reportingYear: number;
  auditFirmName: string | null;
  status: EngagementStatus;
  subcontractorCostsCents: number;
  subcontractorCostsPct: string | null;
  totalSalesCents: number | null;
  adjustedRevenueCents: number;
  employeeInfoProcedure: string | null;
  /** SPLIT-201: linked fin_parties id for shared PARTY identity. Null when not yet associated. */
  finPartyId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EngagementWrite {
  residentName: string;
  idno: string;
  mitpContractNo?: string | null;
  mitpContractDate?: string | null;
  legalAddress?: string | null;
  subdivisionAddresses?: string | null;
  vatPayer: boolean;
  periodStart: string;
  periodEnd: string;
  reportingYear: number;
  auditFirmName?: string | null;
  status?: EngagementStatus;
  subcontractorCostsCents?: number;
  subcontractorCostsPct?: string | null;
  totalSalesCents?: number | null;
  adjustedRevenueCents?: number;
  employeeInfoProcedure?: string | null;
}

const BASE = "/api/itpark/engagements";

export async function listEngagements(): Promise<ItparkEngagement[]> {
  const res = await fetch(BASE, { credentials: "include" });
  if (!res.ok) throw new Error(`listEngagements: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.engagements) ? data.engagements : [];
}

export async function getEngagement(id: string): Promise<ItparkEngagement> {
  const res = await fetch(`${BASE}/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`getEngagement: ${res.status}`);
  const data = await res.json();
  return data.engagement;
}

export async function createEngagement(body: EngagementWrite): Promise<ItparkEngagement> {
  const res = await fetch(BASE, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`createEngagement: ${res.status} ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return data.engagement;
}

export async function updateEngagement(
  id: string,
  body: EngagementWrite
): Promise<ItparkEngagement> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`updateEngagement: ${res.status} ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return data.engagement;
}

export async function deleteEngagement(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`deleteEngagement: ${res.status}`);
}

// ─── SPLIT-201: link/unlink engagement to fin_parties (PARTY bridge) ─────────

export interface PartyLinkResult {
  id: string;
  fin_party_id: string | null;
  created?: boolean;
}

/** PATCH /api/itpark/engagements/:id/party — set or clear fin_party_id link */
export async function linkEngagementParty(
  id: string,
  finPartyId: string | null
): Promise<PartyLinkResult> {
  const res = await fetch(`${BASE}/${id}/party`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fin_party_id: finPartyId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`linkEngagementParty: ${res.status} ${JSON.stringify(err)}`);
  }
  return res.json();
}

// ─── ITPARK-602: mark ready ───────────────────────────────────────────────────

export async function markEngagementReady(id: string): Promise<ItparkEngagement> {
  const res = await fetch(`${BASE}/${id}/ready`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`markEngagementReady: ${res.status} ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return data.engagement;
}

// ─── ITPARK-601: mark exported ────────────────────────────────────────────────

export async function markEngagementExported(id: string): Promise<ItparkEngagement> {
  const res = await fetch(`${BASE}/${id}/export`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`markEngagementExported: ${res.status} ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return data.engagement;
}
