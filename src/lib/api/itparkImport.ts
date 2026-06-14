/**
 * ITPARK-202: Client API pentru import linii Anexa 3
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §2 — import din clipboard, CSV, din invoices
 */

export interface ImportResult {
  imported: number;
  errors: { row: number; message: string }[];
  warning?: string;
}

const BASE = "/api/itpark/import";

/** Import din clipboard (text tab-separated, semicolon sau CSV) */
export async function importFromPaste(
  engagementId: string,
  text: string
): Promise<ImportResult> {
  const res = await fetch(`${BASE}/paste`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ engagementId, text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`importFromPaste: ${res.status} ${JSON.stringify(err)}`);
  }
  return res.json();
}

/** Import din fișier CSV (conținutul fișierului ca string) */
export async function importFromCsv(
  engagementId: string,
  csv: string
): Promise<ImportResult> {
  const res = await fetch(`${BASE}/csv`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ engagementId, csv }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`importFromCsv: ${res.status} ${JSON.stringify(err)}`);
  }
  return res.json();
}

/**
 * Import din facturile existente (invoices.ts).
 * LIMITARE: liniile importate vor avea caemCode="" → contabilul completează CAEM manual.
 */
export async function importFromInvoices(
  engagementId: string
): Promise<ImportResult> {
  const res = await fetch(`${BASE}/invoices`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ engagementId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`importFromInvoices: ${res.status} ${JSON.stringify(err)}`);
  }
  return res.json();
}
