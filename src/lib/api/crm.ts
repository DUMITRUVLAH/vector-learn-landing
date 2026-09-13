/**
 * CRM (Faza 1) — client API typat peste `/api/crm/*` (leaduri + produse).
 *
 * Urmează convenția din `src/lib/api/docmerge.ts`: funcții plate peste `api()`,
 * fără cache propriu — GET-urile trec deja prin dedupe/micro-cache-ul din `api()`.
 *
 * Numele câmpurilor de mai jos oglindesc EXACT schema reală din
 * `server/db/schema/leads.ts` / `server/db/schema/crmProducts.ts` (backend-ul
 * există deja în acest worktree, nu doar ca spec) — nu inventa alte nume.
 */
import { api } from "@/lib/api";

// ─── Leaduri ──────────────────────────────────────────────────────────────────

/** Stadiile fixe ale pipeline-ului de leaduri (CRM-CORE §4) — orice → orice e permis. */
export type CrmLeadStage = "new" | "contacted" | "trial" | "paid" | "lost";

/** Sursele de lead acceptate de server (`server/db/schema/leads.ts` — `leadSourceEnum`). */
export type CrmLeadSource =
  | "webform"
  | "manual"
  | "facebook_ad"
  | "google_ads"
  | "referral"
  | "phone_in"
  | "instagram"
  | "import"
  | "other";

export interface CrmLead {
  id: string;
  fullName: string;
  /** Nume de oportunitate opțional — dacă e setat, înlocuiește `fullName` ca titlu pe cartonaș. */
  dealName: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  /** Cursul / interesul leadului (ex. „Engleză B2"). */
  interestCourse: string | null;
  source: CrmLeadSource;
  stage: CrmLeadStage;
  /** Bani în cenți — schema nu are un câmp de monedă per lead (single-currency, tenant-wide). */
  valueCents: number;
  assignedTo: string | null;
  /** Obligatoriu doar când `stage === "lost"` — serverul respinge altfel (400 `lost_reason_required`). */
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmPipelineResponse {
  grouped: Record<string, CrmLead[]>;
  counts: Record<string, number>;
  valueSums: Record<string, number>;
  totalValueCents: number;
}

export function getCrmPipeline(): Promise<CrmPipelineResponse> {
  return api<CrmPipelineResponse>("/api/crm/leads/pipeline");
}

export interface CrmLeadListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  stage?: CrmLeadStage;
  source?: string;
  assignedTo?: string;
  sort?: string;
  dir?: "asc" | "desc";
}

export interface CrmLeadListResponse {
  items: CrmLead[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function listCrmLeads(params: CrmLeadListParams = {}): Promise<CrmLeadListResponse> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return api<CrmLeadListResponse>(`/api/crm/leads${suffix ? `?${suffix}` : ""}`);
}

export function getCrmLead(id: string): Promise<CrmLead> {
  return api<CrmLead>(`/api/crm/leads/${id}`);
}

export interface CreateCrmLeadBody {
  fullName: string;
  dealName?: string;
  phone?: string;
  email?: string;
  company?: string;
  interestCourse?: string;
  source?: CrmLeadSource;
  valueCents?: number;
}

export function createCrmLead(body: CreateCrmLeadBody): Promise<CrmLead> {
  return api<CrmLead>("/api/crm/leads", { method: "POST", body: JSON.stringify(body) });
}

export type UpdateCrmLeadBody = Partial<CreateCrmLeadBody>;

export function updateCrmLead(id: string, body: UpdateCrmLeadBody): Promise<CrmLead> {
  return api<CrmLead>(`/api/crm/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export interface MoveCrmLeadStageBody {
  stage: CrmLeadStage;
  /** Cerut de server când `stage === "lost"` — vezi 400 `lost_reason_required`. */
  lostReason?: string;
}

export function moveCrmLeadStage(id: string, body: MoveCrmLeadStageBody): Promise<CrmLead> {
  return api<CrmLead>(`/api/crm/leads/${id}/stage`, { method: "PATCH", body: JSON.stringify(body) });
}

export type CrmInteractionType =
  | "note"
  | "call"
  | "email"
  | "whatsapp"
  | "sms"
  | "meeting"
  | "stage_change"
  | "system";

export type CrmInteractionDirection = "inbound" | "outbound" | "internal";

export interface CrmLeadInteraction {
  id: string;
  leadId: string;
  type: CrmInteractionType;
  direction: CrmInteractionDirection;
  body: string | null;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  occurredAt: string;
}

export interface ListCrmLeadInteractionsResponse {
  items: CrmLeadInteraction[];
}

export function listCrmLeadInteractions(leadId: string): Promise<ListCrmLeadInteractionsResponse> {
  return api<ListCrmLeadInteractionsResponse>(`/api/crm/leads/${leadId}/interactions`);
}

export interface CreateCrmLeadInteractionBody {
  type: CrmInteractionType;
  body?: string;
  direction?: CrmInteractionDirection;
  metadata?: Record<string, unknown>;
}

export function createCrmLeadInteraction(
  leadId: string,
  body: CreateCrmLeadInteractionBody
): Promise<CrmLeadInteraction> {
  return api<CrmLeadInteraction>(`/api/crm/leads/${leadId}/interactions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Produse ──────────────────────────────────────────────────────────────────

export interface CrmProduct {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  description: string | null;
  unit: string;
  listPriceCents: number;
  currency: string;
  /** Coloană `numeric` în Postgres — drizzle o expune ca șir (ex. "20"), nu ca number. */
  vatPercent: number | string;
  isActive: boolean;
  orderIndex: number;
}

export interface ListCrmProductsResponse {
  items: CrmProduct[];
}

export function listCrmProducts(includeInactive = false): Promise<ListCrmProductsResponse> {
  return api<ListCrmProductsResponse>(
    `/api/crm/products${includeInactive ? "?includeInactive=1" : ""}`
  );
}

export interface CreateCrmProductBody {
  sku?: string;
  name: string;
  category?: string;
  description?: string;
  unit?: string;
  listPriceCents?: number;
  currency?: string;
  vatPercent?: number;
}

export function createCrmProduct(body: CreateCrmProductBody): Promise<CrmProduct> {
  return api<CrmProduct>("/api/crm/products", { method: "POST", body: JSON.stringify(body) });
}

export type UpdateCrmProductBody = Partial<CreateCrmProductBody>;

export function updateCrmProduct(id: string, body: UpdateCrmProductBody): Promise<CrmProduct> {
  return api<CrmProduct>(`/api/crm/products/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function archiveCrmProduct(id: string): Promise<CrmProduct> {
  return api<CrmProduct>(`/api/crm/products/${id}/archive`, { method: "POST" });
}

/** Poate răspunde 409 `sku_taken` dacă SKU-ul e deja folosit de alt produs activ. */
export function restoreCrmProduct(id: string): Promise<CrmProduct> {
  return api<CrmProduct>(`/api/crm/products/${id}/restore`, { method: "POST" });
}
