/**
 * ITPARK-002: Client API pentru nomenclatorul CAEM
 * ITPARK-203: suggestCaemApi(q) — sugestie CAEM via server (+ local fallback)
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §4 + §6
 * Codurile vin din API — NICIODATĂ hardcodate în .tsx
 */
// Re-export helper-ul local pentru utilizare client-side fără network request
export { suggestCaem, type CaemSuggestion } from "../itpark/caemSuggest";

export interface CaemCode {
  id: string;
  code: string;
  label: string;
  eligible: boolean;
  effectiveFrom: string;
  country: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaemCodesResponse {
  caemCodes: CaemCode[];
}

/** Returnează lista de coduri CAEM active (opțional filtrate după eligibilitate) */
export async function fetchCaemCodes(params?: {
  eligible?: boolean;
  q?: string;
}): Promise<CaemCode[]> {
  const url = new URL("/api/itpark/caem-codes", window.location.origin);
  if (params?.eligible !== undefined) {
    url.searchParams.set("eligible", String(params.eligible));
  }
  if (params?.q) {
    url.searchParams.set("q", params.q);
  }

  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error(`CAEM codes fetch failed: ${res.status}`);
  const data = (await res.json()) as CaemCodesResponse;
  return data.caemCodes;
}

/** Returnează detalii pentru un cod CAEM specific */
export async function fetchCaemCode(code: string): Promise<CaemCode | null> {
  const res = await fetch(`/api/itpark/caem-codes/${encodeURIComponent(code)}`, {
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`CAEM code fetch failed: ${res.status}`);
  const data = (await res.json()) as { caemCode: CaemCode };
  return data.caemCode;
}

/**
 * isEligibleCaem(code, caemCodes) — helper client-side
 * Determinist: returnează true dacă codul e în lista de coduri eligibile.
 * Folosit pentru validare UI fără request suplimentar.
 */
export function isEligibleCaemLocal(code: string, caemCodes: CaemCode[]): boolean {
  const found = caemCodes.find((c) => c.code === code);
  return found?.eligible ?? false;
}

/**
 * suggestCaemApi(q) — sugestie CAEM via server endpoint (ITPARK-203)
 * Returnează sugestia sau null. Sugestie ONLY — nu suprascrie cod manual.
 */
export async function suggestCaemApi(q: string): Promise<import("../itpark/caemSuggest").CaemSuggestion | null> {
  if (!q.trim()) return null;
  const url = `/api/itpark/caem-codes/suggest?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  const data = await res.json() as { suggestion: import("../itpark/caemSuggest").CaemSuggestion | null };
  return data.suggestion;
}
