/**
 * CORE-003: FinDesk org profile + invoice series — typed client API
 */

export interface FinOrgProfile {
  id: string;
  tenantId: string;
  legalName: string;
  idno: string | null;
  country: "MD" | "RO";
  vatRegime: "payer" | "non_payer";
  vatNumber: string | null;
  baseCurrency: string;
  address: string | null;
  logoUrl: string | null;
  fiscalYearStart: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinInvoiceSerie {
  id: string;
  tenantId: string;
  prefix: string;
  nextNumber: number;
  padWidth: number;
  docType: "invoice" | "proforma" | "receipt";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NextNumberResult {
  number: number;
  formatted: string;
}

export async function getFinOrg(): Promise<{ profile: FinOrgProfile | null }> {
  const res = await fetch("/api/fin/org", { credentials: "include" });
  if (!res.ok) throw new Error(`getFinOrg: ${res.status}`);
  return res.json() as Promise<{ profile: FinOrgProfile | null }>;
}

export async function patchFinOrg(
  data: Partial<Pick<FinOrgProfile,
    "legalName" | "idno" | "country" | "vatRegime" | "vatNumber" |
    "baseCurrency" | "address" | "logoUrl" | "fiscalYearStart"
  >>
): Promise<{ profile: FinOrgProfile }> {
  const res = await fetch("/api/fin/org", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(`patchFinOrg: ${res.status}`), { data: err });
  }
  return res.json() as Promise<{ profile: FinOrgProfile }>;
}

export async function listFinSeries(): Promise<{ series: FinInvoiceSerie[] }> {
  const res = await fetch("/api/fin/series", { credentials: "include" });
  if (!res.ok) throw new Error(`listFinSeries: ${res.status}`);
  return res.json() as Promise<{ series: FinInvoiceSerie[] }>;
}

export async function createFinSerie(data: {
  prefix: string;
  padWidth?: number;
  docType?: "invoice" | "proforma" | "receipt";
  isDefault?: boolean;
}): Promise<{ serie: FinInvoiceSerie }> {
  const res = await fetch("/api/fin/series", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`createFinSerie: ${res.status}`);
  return res.json() as Promise<{ serie: FinInvoiceSerie }>;
}

export async function patchFinSerie(
  id: string,
  data: Partial<Pick<FinInvoiceSerie, "prefix" | "padWidth" | "docType" | "isDefault">>
): Promise<{ serie: FinInvoiceSerie }> {
  const res = await fetch(`/api/fin/series/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`patchFinSerie: ${res.status}`);
  return res.json() as Promise<{ serie: FinInvoiceSerie }>;
}

export async function deleteFinSerie(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/fin/series/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`deleteFinSerie: ${res.status}`);
  return res.json() as Promise<{ ok: boolean }>;
}

export async function nextFinSerieNumber(id: string): Promise<NextNumberResult> {
  const res = await fetch(`/api/fin/series/${id}/next`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`nextFinSerieNumber: ${res.status}`);
  return res.json() as Promise<NextNumberResult>;
}
