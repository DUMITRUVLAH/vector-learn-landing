/**
 * ITPARK-501/502: Client API for itpark_packet_documents
 * Wraps /api/itpark/docs endpoints
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §5
 */

export type PacketKind =
  | "anexa2"
  | "anexa3"
  | "anexa4"
  | "letter_solvency"
  | "letter_address"
  | "letter_no_subdivisions"
  | "letter_activity"
  | "letter_no_adjustments"
  | "decl_self_responsibility";

export type DocStatus = "draft" | "ready" | "exported";

export interface PacketDocument {
  id: string;
  tenantId: string;
  engagementId: string;
  kind: PacketKind;
  status: DocStatus;
  dataJson: unknown;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const BASE = "/api/itpark/docs";

/**
 * List all packet documents for an engagement
 */
export async function listDocs(engagementId: string): Promise<PacketDocument[]> {
  const res = await fetch(`${BASE}/${engagementId}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = await res.json() as { docs: PacketDocument[] };
  return data.docs;
}

/**
 * Get a specific packet document by kind
 */
export async function getDoc(engagementId: string, kind: PacketKind): Promise<{
  doc: PacketDocument | null;
  engagement: { residentName: string; idno: string; legalAddress: string | null; periodStart: string; periodEnd: string; reportingYear: number; mitpContractNo: string | null };
}> {
  const res = await fetch(`${BASE}/${engagementId}/${kind}`, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Upsert (create or update) a packet document
 */
export async function upsertDoc(
  engagementId: string,
  kind: PacketKind,
  payload: { dataJson?: unknown; status?: DocStatus }
): Promise<PacketDocument> {
  const res = await fetch(`${BASE}/${engagementId}/${kind}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = await res.json() as { doc: PacketDocument };
  return data.doc;
}
