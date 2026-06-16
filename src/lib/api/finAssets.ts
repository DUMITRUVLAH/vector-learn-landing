/**
 * ASSET-003 (FIN): Client-side API helpers for Active Fixe (Fixed Assets).
 *
 * Routes (all behind /api/fin/assets):
 *   GET    /                           — lista active
 *   POST   /                           — creare activ nou
 *   GET    /:id                        — detaliu activ
 *   POST   /depreciate                 — calcul batch amortizare
 *   POST   /:id/confirm-depreciation   — confirmare amortizare + postare cheltuiala
 *   PATCH  /:id                        — actualizare status (casare)
 *   GET    /:id/depreciation-entries   — istoricul amortizărilor
 */

import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssetStatus =
  | "active"
  | "fully_depreciated"
  | "sold"
  | "scrapped";

export type DepreciationMethod = "linear" | "declining_balance";

export interface FinAsset {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  category: string | null;
  acquisitionDate: string; // YYYY-MM-DD
  acquisitionCostCents: number;
  residualValueCents: number;
  usefulLifeMonths: number;
  depreciationMethod: DepreciationMethod;
  status: AssetStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Calculated server-side from last depreciation entry */
  currentBookValueCents?: number;
  lastDepreciationPeriod?: string | null;
}

export interface CreateAssetData {
  name: string;
  description?: string | null;
  category?: string | null;
  acquisitionDate: string; // YYYY-MM-DD
  acquisitionCostCents: number;
  residualValueCents?: number;
  usefulLifeMonths: number;
  depreciationMethod?: DepreciationMethod;
  notes?: string | null;
}

export interface DepreciationEntry {
  id: string;
  tenantId: string;
  assetId: string;
  periodMonth: string; // YYYY-MM
  depreciationCents: number;
  bookValueCents: number;
  expenseId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface DepreciateResult {
  assetId: string;
  assetName: string;
  depreciationCents: number;
  bookValueCents: number;
  isFullyDepreciated: boolean;
  entryId: string;
}

export interface DepreciateResponse {
  periodMonth: string;
  entries: DepreciateResult[];
}

export interface ConfirmDepreciationResponse {
  entry: DepreciationEntry;
  expenseId: string | null;
  expensesWarning?: string[];
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Lista active fixe per tenant, cu filtrare opțională după status.
 */
export function listAssets(
  params?: { status?: AssetStatus }
): Promise<{ assets: FinAsset[] }> {
  const qs = params?.status ? `?status=${params.status}` : "";
  return api<{ assets: FinAsset[] }>(`/api/fin/assets${qs}`);
}

/**
 * Creare activ fix nou.
 */
export function createAsset(
  data: CreateAssetData
): Promise<{ asset: FinAsset }> {
  return api<{ asset: FinAsset }>("/api/fin/assets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Detaliu activ fix cu ultimele 12 intrări de amortizare.
 */
export function getAsset(
  id: string
): Promise<{ asset: FinAsset & { depreciationEntries: DepreciationEntry[] } }> {
  return api(`/api/fin/assets/${id}`);
}

/**
 * Calculează amortizarea pentru luna `periodMonth` (YYYY-MM).
 * Idempotent — re-run suprascrie.
 */
export function depreciateAssets(
  periodMonth: string,
  assetIds?: string[]
): Promise<DepreciateResponse> {
  return api<DepreciateResponse>("/api/fin/assets/depreciate", {
    method: "POST",
    body: JSON.stringify({ periodMonth, assetIds }),
  });
}

/**
 * Confirmă amortizarea unui activ pentru luna dată.
 * Postează cheltuiala în fin_expenses (dacă disponibil).
 */
export function confirmDepreciation(
  assetId: string,
  periodMonth: string
): Promise<ConfirmDepreciationResponse> {
  return api<ConfirmDepreciationResponse>(
    `/api/fin/assets/${assetId}/confirm-depreciation`,
    {
      method: "POST",
      body: JSON.stringify({ periodMonth }),
    }
  );
}

/**
 * Casare activ: actualizează statusul la `scrapped`.
 */
export function scrapAsset(assetId: string): Promise<{ asset: FinAsset }> {
  return api<{ asset: FinAsset }>(`/api/fin/assets/${assetId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "scrapped" }),
  });
}

/**
 * Istoricul amortizărilor per activ.
 */
export function listDepreciationEntries(
  assetId: string
): Promise<{ asset: Pick<FinAsset, "id" | "name">; entries: DepreciationEntry[] }> {
  return api(`/api/fin/assets/${assetId}/depreciation-entries`);
}
