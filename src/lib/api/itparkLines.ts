/**
 * ITPARK-201: Client API pentru revenue lines (linii Anexa 3)
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §2 — itpark_revenue_lines
 */

export interface RevenueLine {
  id: string;
  tenantId: string;
  engagementId: string;
  rowNo: number;
  clientName: string;
  documentRefs: string | null;
  serviceDescription: string;
  caemCode: string;
  amountCents: number;
  isEligible: boolean;
  month: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RevenueLineWrite {
  engagementId: string;
  rowNo?: number;
  clientName: string;
  documentRefs?: string | null;
  serviceDescription?: string;
  caemCode: string;
  amountCents: number;
  isEligible?: boolean;
  month?: number | null;
}

const BASE = "/api/itpark/lines";

export async function listLines(engagementId: string): Promise<RevenueLine[]> {
  const res = await fetch(`${BASE}?engagementId=${encodeURIComponent(engagementId)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`listLines: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.lines) ? data.lines : [];
}

export async function createLine(body: RevenueLineWrite): Promise<RevenueLine> {
  const res = await fetch(BASE, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`createLine: ${res.status} ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return data.line;
}

export async function updateLine(id: string, body: RevenueLineWrite): Promise<RevenueLine> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`updateLine: ${res.status} ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  return data.line;
}

export async function deleteLine(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`deleteLine: ${res.status}`);
}

/** Formatare sumă din cents la MDL cu 2 zecimale (ex. 1500000 → "15.000,00") */
export function fmtMDL(cents: number): string {
  return (cents / 100).toLocaleString("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Parsare MDL string la cents (ex. "15 000,50" → 1500050) */
export function parseMDLtoCents(value: string): number {
  // Îndepărtează separatori de mii și înlocuiește virgula cu punct
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}
