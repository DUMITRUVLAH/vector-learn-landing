/**
 * ITPARK-003: Client API pentru setări ITPARK
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §7
 */

export interface ItparkSettings {
  id: string | null;
  tenantId: string;
  eligibilityThresholdPct: string;
  toleranceMonths: number;
  defaultCurrency: string;
  defaultAuditFirm: string | null;
  auditorUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpdateItparkSettingsInput {
  eligibilityThresholdPct?: number;
  toleranceMonths?: number;
  defaultCurrency?: string;
  defaultAuditFirm?: string | null;
  auditorUserId?: string | null;
}

export async function fetchItparkSettings(): Promise<ItparkSettings> {
  const res = await fetch("/api/itpark/settings", { credentials: "include" });
  if (!res.ok) throw new Error(`Settings fetch failed: ${res.status}`);
  const data = (await res.json()) as { settings: ItparkSettings };
  return data.settings;
}

export async function updateItparkSettings(
  input: UpdateItparkSettingsInput
): Promise<ItparkSettings> {
  const res = await fetch("/api/itpark/settings", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Settings update failed: ${res.status}`);
  const data = (await res.json()) as { settings: ItparkSettings };
  return data.settings;
}
