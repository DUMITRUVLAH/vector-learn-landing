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
