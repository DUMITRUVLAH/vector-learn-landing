/**
 * CLIENTPORTAL-001/002/003: API client for the financial client portal.
 * Public endpoints use ?token= (no auth cookie required).
 * Admin endpoints require the session cookie (set by requireAuth).
 */

const BASE = "/api/fin/client-portal";

export interface ClientPortalIdentity {
  contactName: string | null;
  companyName: string | null;
  tenantName: string;
  tokenId: string;
}

export interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  status: "draft" | "issued" | "paid" | "cancelled";
  issueDate: string | null;
  dueDate: string | null;
  stripeSessionId: string | null;
}

export interface PortalInvoicesResponse {
  invoices: PortalInvoice[];
  totalOwedCents: number;
  contactName: string | null;
  companyName: string | null;
  tenantName: string;
}

export interface PortalDocument {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

// ─── Public endpoints (token-based) ──────────────────────────────────────────

export async function getPortalIdentity(token: string): Promise<ClientPortalIdentity> {
  const res = await fetch(`${BASE}/me?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Token invalid sau expirat");
  }
  return res.json() as Promise<ClientPortalIdentity>;
}

export async function getPortalInvoices(token: string): Promise<PortalInvoicesResponse> {
  const res = await fetch(`${BASE}/invoices?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Token invalid sau expirat");
  }
  return res.json() as Promise<PortalInvoicesResponse>;
}

export async function getPortalDocuments(token: string): Promise<{ documents: PortalDocument[] }> {
  const res = await fetch(`${BASE}/documents?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Token invalid sau expirat");
  }
  return res.json() as Promise<{ documents: PortalDocument[] }>;
}

export async function uploadPortalDocument(
  token: string,
  file: File
): Promise<PortalDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE}/documents?token=${encodeURIComponent(token)}`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? "Eroare la încărcarea documentului"
    );
  }
  return res.json() as Promise<PortalDocument>;
}

// ─── Admin endpoints (requires session cookie) ──────────────────────────────

export interface GenerateTokenPayload {
  contactId?: string;
  companyId?: string;
  expiresInDays?: number;
}

export interface GenerateTokenResponse {
  token: string;
  expiresAt: string;
  portalUrl: string;
}

export async function generatePortalToken(
  payload: GenerateTokenPayload
): Promise<GenerateTokenResponse> {
  const res = await fetch(`${BASE}/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Eroare la generarea token-ului");
  }
  return res.json() as Promise<GenerateTokenResponse>;
}

export async function listPortalTokens(): Promise<{
  tokens: Array<{
    id: string;
    token: string;
    contactId: string | null;
    companyId: string | null;
    expiresAt: string;
    isActive: boolean;
    createdAt: string;
  }>;
}> {
  const res = await fetch(`${BASE}/tokens`, { credentials: "include" });
  if (!res.ok) throw new Error("Eroare la listarea token-urilor");
  return res.json() as Promise<{ tokens: Array<{
    id: string; token: string; contactId: string | null; companyId: string | null;
    expiresAt: string; isActive: boolean; createdAt: string;
  }> }>;
}

export async function revokePortalToken(id: string): Promise<void> {
  const res = await fetch(`${BASE}/tokens/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Eroare la revocarea token-ului");
}

export async function getAdminPortalDocuments(params: {
  contactId?: string;
  companyId?: string;
}): Promise<{ documents: PortalDocument[] }> {
  const qs = new URLSearchParams();
  if (params.contactId) qs.set("contactId", params.contactId);
  if (params.companyId) qs.set("companyId", params.companyId);
  const res = await fetch(`${BASE}/admin/documents?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("Eroare la listarea documentelor");
  return res.json() as Promise<{ documents: PortalDocument[] }>;
}
