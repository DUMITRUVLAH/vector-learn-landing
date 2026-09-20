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
import { crmSegmentQuery, type CrmSegmentFilters } from "@/lib/crm/segmentFilters";

// ─── Leaduri ──────────────────────────────────────────────────────────────────

/**
 * Cheia etapei curente a leadului (CRM-CORE §4 — orice → orice e permis prin drag).
 *
 * NU mai e un union fix de 5 valori: migrarea 0162 face `leads.stage` un `varchar` liber,
 * pentru că etapele sunt configurabile per workspace din `StageEditorDialog` (secțiunea
 * „Etape pipeline" mai jos). Etapele implicite (`new|contacted|trial|paid|lost`) rămân doar ca
 * fallback de afișare în `constants.ts` — orice cheie întoarsă de server e validă aici.
 */
export type CrmLeadStage = string;

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
  /** Cursul / interesul leadului, cu cuvintele clientului (ex. „Engleză B2"). */
  interestCourse: string | null;
  /** Produsul din catalog (`crm_products`) — pe el se sprijină raportul „pe produs". */
  productId?: string | null;
  /** Câte bucăți se vând. La câștig, atâtea se scad din stocul produsului. */
  productQty?: number | null;
  /** Probabilitatea acestei oportunități; `null` = se moștenește de la etapă. */
  probabilityPct?: number | null;
  source: CrmLeadSource;
  stage: CrmLeadStage;
  /** Pâlnia leadului; `null` = pâlnia implicită a workspace-ului (leaduri de dinainte de 0166). */
  pipelineId?: string | null;
  /** Bani în cenți — schema nu are un câmp de monedă per lead (single-currency, tenant-wide). */
  valueCents: number;
  assignedTo: string | null;
  /** Obligatoriu doar când `stage === "lost"` — serverul respinge altfel (400 `lost_reason_required`). */
  lostReason: string | null;
  /** Taskul deschis cel mai apropiat de scadență, atașat de `/pipeline` la fiecare card.
   *  Lipsește pe celelalte rute (lista îl ia din altă parte) — de-aia e opțional. */
  nextTask?: { title: string; dueAt: string | null } | null;
  /** Câte apeluri s-au dat pe lead (CC-6). Rezultatele terminale nu-l cresc. */
  callAttempts?: number | null;
  lastCallAt?: string | null;
  /** Ultimul rezultat de apel, din vocabularul din `src/lib/crm/callOutcomes.ts`. */
  lastCallOutcome?: string | null;
  /** Când și-a dat consimțământul (formular web). */
  consentAt?: string | null;
  /** Când l-a retras. Nenul = leadul NU mai poate fi contactat comercial. */
  consentRevokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmPipelineResponse {
  grouped: Record<string, CrmLead[]>;
  counts: Record<string, number>;
  valueSums: Record<string, number>;
  totalValueCents: number;
  /**
   * Etapele configurate ale pipeline-ului, ordonate — sursa de adevăr pentru coloanele
   * board-ului (nu mai `CRM_DEFAULT_STAGES`). Opțional strict defensiv: dacă backend-ul e în
   * urma codului (endpoint nou), câmpul poate lipsi — apelantul cade atunci pe
   * `CRM_DEFAULT_STAGES` din `components/crm/constants.ts`.
   */
  stages?: CrmStage[];
  /** Toate pâlniile workspace-ului — tabla arată UNA, dar selectorul are nevoie de listă. */
  pipelines?: CrmPipeline[];
  /** Pâlnia efectiv afișată (cea cerută sau implicita). */
  pipelineId?: string | null;
  /** `true` când numărătorile descriu un SEGMENT filtrat, nu pâlnia întreagă. */
  segmented?: boolean;
}

// ─── Segmentare (cerința 4: industrie, regiune, mărime, consum, produs) ───────

// Tipul și funcțiile pure stau în `src/lib/crm/segmentFilters.ts` — aici rămâne doar cererea
// către server (vezi comentariul de acolo pentru motiv).
export type { CrmSegmentFilters } from "@/lib/crm/segmentFilters";

export interface CrmSegmentOptions {
  industries: string[];
  regions: string[];
  sizes: string[];
  products: { id: string; name: string }[];
  /** Intervalul real de consum din baza workspace-ului; `null` când nicio firmă n-are cifra. */
  consumption: { min: number; max: number } | null;
  /** Etichetele folosite efectiv (inclusiv cele venite din import). */
  tags?: string[];
  /** Câmpurile personalizate, fiecare cu valorile care există deja în bază. */
  customFields?: { key: string; label: string; values: string[] }[];
  schemaLag?: boolean;
}

/** Valorile care CHIAR există în baza workspace-ului — un filtru nu oferă opțiuni moarte. */
export function getCrmSegmentOptions(): Promise<CrmSegmentOptions> {
  return api<CrmSegmentOptions>("/api/crm/leads/segments");
}

/**
 * Filtrele tablei. Sunt ACELEAȘI cu ale listei, și se aplică în același loc — pe server.
 *
 * Până acum kanbanul cernea în browser cele 50 de carduri încărcate pe coloană: pe o bază de
 * 3.200 de leaduri, o căutare după un client care EXISTĂ întorcea „niciun rezultat", iar
 * numărătorile de pe coloane arătau altceva decât lista, cu aceleași filtre pe ecran.
 */
export interface CrmBoardFilters extends CrmSegmentFilters {
  search?: string;
  source?: string;
  assignedTo?: string;
}

/** `pipelineId` absent = pâlnia implicită a workspace-ului. Un id străin → 404 (nu tabla proprie). */
export function getCrmPipeline(
  pipelineId?: string | null,
  filters?: CrmBoardFilters
): Promise<CrmPipelineResponse> {
  const qs = new URLSearchParams(crmSegmentQuery(filters));
  if (filters?.search?.trim()) qs.set("search", filters.search.trim());
  if (filters?.source && filters.source !== "all") qs.set("source", filters.source);
  if (filters?.assignedTo) qs.set("assignedTo", filters.assignedTo);
  if (pipelineId) qs.set("pipelineId", pipelineId);
  const suffix = qs.toString();
  return api<CrmPipelineResponse>(`/api/crm/leads/pipeline${suffix ? `?${suffix}` : ""}`);
}

// ─── Pâlnii (multiple per workspace) ──────────────────────────────────────────

export interface CrmPipeline {
  id: string;
  name: string;
  orderIndex: number;
  /** Pâlnia în care aterizează leadurile fără pâlnie explicită — nu se poate șterge. */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListCrmPipelinesResponse {
  items: CrmPipeline[];
  /** `true` când baza e în urma codului: UI-ul rămâne pe o singură pâlnie, fără să crape. */
  schemaLag?: boolean;
}

export function listCrmPipelines(): Promise<ListCrmPipelinesResponse> {
  return api<ListCrmPipelinesResponse>("/api/crm/pipelines");
}

/** Pâlnia nouă se naște cu cele 5 etape implicite ale ei — altfel Kanbanul ei ar fi fără coloane. */
/** Șablonul de etape (`src/lib/crm/pipelineTemplates.ts`) e o constantă pură — NU se exportă din
 *  modulul ăsta: orice export nou de aici trebuie declarat în mock-ul fiecărei suite de CRM. */
export function createCrmPipeline(name: string, template?: string): Promise<CrmPipeline> {
  return api<CrmPipeline>("/api/crm/pipelines", {
    method: "POST",
    body: JSON.stringify(template && template !== "default" ? { name, template } : { name }),
  });
}

export function renameCrmPipeline(id: string, name: string): Promise<CrmPipeline> {
  return api<CrmPipeline>(`/api/crm/pipelines/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
}

/** 400 `pipeline_is_default` sau 409 `{ error: "pipeline_not_empty", leads: n }`. */
export function deleteCrmPipeline(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/pipelines/${id}`, { method: "DELETE" });
}

// ─── Etape pipeline (configurabile per workspace) ──────────────────────────────

/** Token pastel din design-system.md — singurele culori oferite de `StageEditorDialog`. */
export type CrmStageColor = "sky" | "lavender" | "peach" | "mint" | "rose";

export interface CrmStage {
  id: string;
  /** Cheia stabilă scrisă în `leads.stage` — imuabilă după creare (400 `stage_key_immutable`). */
  key: string;
  label: string;
  color: CrmStageColor;
  orderIndex: number;
  /** O mutare către o etapă `isWon` contează ca „lead câștigat" (rata de conversie a board-ului). */
  isWon: boolean;
  /** O mutare către o etapă `isLost` cere `lostReason` — verificată pe FLAG, nu pe cheia „lost". */
  isLost: boolean;
  /** Etapă seed (una din cele 5 implicite) — nu se poate șterge (400 `stage_is_default`). */
  isDefault: boolean;
  probabilityPct: number;
}

export interface ListCrmStagesResponse {
  items: CrmStage[];
}

/** Etapele UNEI pâlnii. `pipelineId` absent = pâlnia implicită. */
export function getCrmStages(pipelineId?: string | null): Promise<ListCrmStagesResponse> {
  return api<ListCrmStagesResponse>(
    `/api/crm/stages${pipelineId ? `?pipelineId=${encodeURIComponent(pipelineId)}` : ""}`
  );
}

export interface CreateCrmStageBody {
  /** Pâlnia în care intră etapa; absentă = implicita. */
  pipelineId?: string;
  label: string;
  color?: CrmStageColor;
  probabilityPct?: number;
  isWon?: boolean;
  isLost?: boolean;
}

/** Poate răspunde 409 `stage_key_taken` dacă eticheta produce o cheie deja folosită. */
export function createCrmStage(body: CreateCrmStageBody): Promise<CrmStage> {
  return api<CrmStage>("/api/crm/stages", { method: "POST", body: JSON.stringify(body) });
}

export type UpdateCrmStageBody = Partial<CreateCrmStageBody>;

/** `key` nu se trimite niciodată aici — e imuabilă (server respinge cu 400 `stage_key_immutable`
 *  dacă ar veni schimbată). */
export function updateCrmStage(id: string, body: UpdateCrmStageBody): Promise<CrmStage> {
  return api<CrmStage>(`/api/crm/stages/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

/** `ids` = ordinea completă, nouă, a etapelor. Întoarce lista rescrisă (sursă de adevăr pentru
 *  `orderIndex`), ca UI-ul optimist să se poată realinia la ce a scris efectiv serverul. */
export function reorderCrmStages(ids: string[]): Promise<ListCrmStagesResponse> {
  return api<ListCrmStagesResponse>("/api/crm/stages/reorder", { method: "POST", body: JSON.stringify({ ids }) });
}

/** Poate răspunde 409 `{ error: "stage_not_empty", leads: n }` sau 400 `stage_is_default`. */
export function deleteCrmStage(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/stages/${id}`, { method: "DELETE" });
}

export interface CrmLeadListParams extends CrmSegmentFilters {
  /** Filtrează lista pe o pâlnie (pentru implicită intră și leadurile fără `pipelineId`). */
  pipelineId?: string;
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

// ─── Export CSV al bazei filtrate ─────────────────────────────────────────────

export interface CrmLeadsExport {
  blob: Blob;
  /** Câte rânduri are fișierul — nu câte leaduri are baza. */
  count: number;
  /** `true` când s-a atins plafonul serverului (10.000) și fișierul e o parte, nu tot. */
  truncated: boolean;
}

/**
 * Descarcă leadurile care trec de FILTRELE DATE, nu pagina afișată.
 *
 * Nu trece prin `api()`: acolo răspunsul se citește ca JSON, iar aici vrem octeții fișierului
 * plus antetele (`x-export-count`, `x-export-truncated`) — fără ele, interfața n-ar putea spune
 * omului că a primit doar o parte din bază.
 */
export async function downloadCrmLeadsCsv(params: CrmLeadListParams = {}): Promise<CrmLeadsExport> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
  }
  const suffix = qs.toString();
  const res = await fetch(`/api/crm/leads/export.csv${suffix ? `?${suffix}` : ""}`, { credentials: "include" });
  if (!res.ok) {
    // 403 = dreptul `leads.export` lipsește; mesajul trebuie să spună asta, nu „HTTP 403".
    if (res.status === 403) throw new Error("Nu ai dreptul de a exporta leaduri.");
    throw new Error(`Exportul a eșuat (HTTP ${res.status}).`);
  }
  return {
    blob: await res.blob(),
    count: Number(res.headers.get("x-export-count") ?? 0),
    truncated: res.headers.get("x-export-truncated") === "true",
  };
}

/** Pornește descărcarea în browser. Separat de cererea de mai sus, ca s-o poată testa cineva. */
export function saveBlobAs(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Acțiuni în masă ──────────────────────────────────────────────────────────

export type CrmBulkAction = "assign" | "auto-assign" | "stage" | "tag";

export interface CrmBulkBody {
  leadIds: string[];
  action: CrmBulkAction;
  assignedTo?: string | null;
  stage?: string;
  lostReason?: string | null;
  tag?: string;
}

export type CrmBulkSkipReason =
  | "not_found"
  | "unknown_stage"
  | "lost_reason_required"
  | "already_tagged"
  | "already_assigned"
  | "no_rule_matched";

export interface CrmBulkResponse {
  updated: number;
  /** Ce NU s-a putut face, cu motivul — interfața are obligația să-l arate, nu să-l înghită. */
  skipped: { leadId: string; reason: CrmBulkSkipReason }[];
}

/** Maximul acceptat de server într-o singură cerere (cât o pagină de listă). */
export const CRM_BULK_LIMIT = 100;

export function bulkCrmLeads(body: CrmBulkBody): Promise<CrmBulkResponse> {
  return api<CrmBulkResponse>("/api/crm/leads/bulk", { method: "POST", body: JSON.stringify(body) });
}

export function getCrmLead(id: string): Promise<CrmLead> {
  return api<CrmLead>(`/api/crm/leads/${id}`);
}

export interface CrmLeadDetailResponse {
  lead: CrmLead;
  /** Cel mai recent PRIMUL (server: `orderBy(desc(occurredAt))`). */
  interactions: CrmLeadInteraction[];
  /** Configurația etapei curente a leadului — `null` dacă etapa a fost ștearsă între timp. */
  stage: CrmStage | null;
}

/** Fișa leadului într-un singur round-trip: lead + istoric + etapa curentă. Folosit de
 *  `LeadDetailSheet` — evită 1 GET pentru lead + 1 GET pentru interacțiuni + 1 GET pentru etape. */
export function getCrmLeadDetail(id: string): Promise<CrmLeadDetailResponse> {
  return api<CrmLeadDetailResponse>(`/api/crm/leads/${id}/detail`);
}

export interface CreateCrmLeadBody {
  fullName: string;
  /** Pâlnia în care se naște leadul; absentă = implicita workspace-ului. */
  pipelineId?: string | null;
  /** Câmpurile de mai jos sunt `optional().nullable()` pe server: `undefined` = neschimbat la
   *  PATCH, `null` = golit explicit, string = setat. Un string gol NU trebuie trimis pentru
   *  `email` — validarea `.email()` de pe server îl respinge (vezi `emptyToNull` din `format.ts`). */
  dealName?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  interestCourse?: string | null;
  productId?: string | null;
  productQty?: number;
  probabilityPct?: number | null;
  source?: CrmLeadSource;
  valueCents?: number;
  /** `user_id` responsabil (uuid) — `null` = neasignat. */
  assignedTo?: string | null;
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

/** Ce a pățit stocul produsului la această mutare — vezi server/lib/crm/productStock.ts. */
export type CrmLeadStockOutcome =
  | { status: "noop" }
  | { status: "decremented"; productName: string; qty: number; remaining: number }
  | { status: "restored"; productName: string; qty: number; remaining: number }
  | { status: "insufficient"; productName: string; requested: number; available: number };

export function moveCrmLeadStage(
  id: string,
  body: MoveCrmLeadStageBody
): Promise<CrmLead & { stock?: CrmLeadStockOutcome }> {
  return api<CrmLead & { stock?: CrmLeadStockOutcome }>(`/api/crm/leads/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export interface MoveCrmLeadPipelineBody {
  pipelineId: string;
  /** Etapa dorită în pâlnia țintă; absentă sau inexistentă acolo → prima etapă a pâlniei. */
  stage?: string;
}

/**
 * Mutarea între pâlnii e o rută separată, nu un `PATCH /:id { pipelineId }`: cheile de etapă nu
 * sunt comune între pâlnii, deci serverul reașază etapa și scrie o urmă în istoric.
 */
export function moveCrmLeadPipeline(id: string, body: MoveCrmLeadPipelineBody): Promise<CrmLead> {
  return api<CrmLead>(`/api/crm/leads/${id}/pipeline`, { method: "PATCH", body: JSON.stringify(body) });
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
  /** Stocul NU e o coloană a produsului: vine din articolul de inventar legat (FinDesk).
   *  `tracksStock: false` → produs fără stoc (serviciu, abonament) și restul câmpurilor sunt null. */
  tracksStock?: boolean;
  qtyOnHand?: number | null;
  minQtyAlert?: number | null;
  avgCostCents?: number | null;
  /** Cantitatea a ajuns la sau sub pragul de alertă. */
  lowStock?: boolean;
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

// ─── Stocul produselor ────────────────────────────────────────────────────────
//
// Stocul stă în inventarul FinDesk; rutele de mai jos sunt ferestrele CRM-ului către el.

export interface EnableProductStockBody {
  /** Cantitatea din depozit acum. */
  initialQty?: number;
  /** Costul unitar de achiziție, în bani. */
  unitCostCents?: number;
  /** Sub cât se dă alerta. 0 = fără alertă. */
  minQtyAlert?: number;
}

export function enableCrmProductStock(
  id: string,
  body: EnableProductStockBody = {}
): Promise<{ product: CrmProduct; item: { id: string; qtyOnHand: number } }> {
  return api(`/api/crm/products/${id}/stock/enable`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** `delta` cu semn: +10 la recepție, -3 la inventar în minus. 422 `insufficient_stock` sub zero. */
export function adjustCrmProductStock(
  id: string,
  body: { delta: number; unitCostCents?: number; notes?: string }
): Promise<{ qtyOnHand: number; avgCostCents: number }> {
  return api(`/api/crm/products/${id}/stock/adjust`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function disableCrmProductStock(id: string): Promise<CrmProduct> {
  return api<CrmProduct>(`/api/crm/products/${id}/stock/disable`, { method: "POST" });
}

// ─── Taskuri pe lead ────────────────────────────────────────────────────────────

/** open = de făcut · done = încheiat (are `completedAt`) · snoozed = amânat (scadență împinsă). */
export type CrmTaskStatus = "open" | "done" | "snoozed";

export interface CrmLeadTask {
  id: string;
  tenantId: string;
  leadId: string;
  title: string;
  dueAt: string | null;
  status: CrmTaskStatus;
  assignedTo: string | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Task „upcoming" (clopoțel remindere) — cu numele lead-ului alăturat de server. */
export interface CrmUpcomingTask extends CrmLeadTask {
  leadFullName: string;
  leadDealName: string | null;
}

export interface ListCrmLeadTasksResponse {
  items: CrmLeadTask[];
}

export function listCrmLeadTasks(leadId: string): Promise<ListCrmLeadTasksResponse> {
  return api<ListCrmLeadTasksResponse>(`/api/crm/tasks?leadId=${leadId}`);
}

export interface ListCrmUpcomingTasksResponse {
  items: CrmUpcomingTask[];
}

/** `ownerId` = doar taskurile acelui om plus cele nealocate; absent = ale întregii echipe. */
export function listCrmUpcomingTasks(ownerId?: string | null): Promise<ListCrmUpcomingTasksResponse> {
  return api<ListCrmUpcomingTasksResponse>(
    `/api/crm/tasks?scope=upcoming${ownerId ? `&owner=${encodeURIComponent(ownerId)}` : ""}`
  );
}

export interface CreateCrmLeadTaskBody {
  leadId: string;
  title: string;
  dueAt?: string | null;
  assignedTo?: string | null;
}

export function createCrmLeadTask(body: CreateCrmLeadTaskBody): Promise<CrmLeadTask> {
  return api<CrmLeadTask>("/api/crm/tasks", { method: "POST", body: JSON.stringify(body) });
}

export type UpdateCrmLeadTaskBody = Partial<Pick<CreateCrmLeadTaskBody, "title" | "dueAt" | "assignedTo">>;

export function updateCrmLeadTask(id: string, body: UpdateCrmLeadTaskBody): Promise<CrmLeadTask> {
  return api<CrmLeadTask>(`/api/crm/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function completeCrmLeadTask(id: string): Promise<CrmLeadTask> {
  return api<CrmLeadTask>(`/api/crm/tasks/${id}/complete`, { method: "POST" });
}

export function reopenCrmLeadTask(id: string): Promise<CrmLeadTask> {
  return api<CrmLeadTask>(`/api/crm/tasks/${id}/reopen`, { method: "POST" });
}

/** Împinge scadența înainte cu `days` zile — NU o șterge (vezi server/routes/crmTasks.ts). */
export function snoozeCrmLeadTask(id: string, days: number): Promise<CrmLeadTask> {
  return api<CrmLeadTask>(`/api/crm/tasks/${id}/snooze`, { method: "POST", body: JSON.stringify({ days }) });
}

export function deleteCrmLeadTask(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/tasks/${id}`, { method: "DELETE" });
}

// ─── „Azi" — cele 4 gălețile de lucru ale zilei ────────────────────────────────

/** Coloanele de lead necesare pentru un rând din „Azi" — nu fișa completă. */
export interface CrmTodayLead {
  id: string;
  fullName: string;
  dealName: string | null;
  phone: string | null;
  company: string | null;
  stage: string;
  assignedTo: string | null;
  valueCents: number;
  createdAt: string;
}

export interface CrmTodayResponse {
  /** Taskuri deschise, restante — cele mai restante primele. */
  overdueTasks: Array<{ lead: CrmTodayLead; task: CrmLeadTask }>;
  /** Lead-uri noi, fără nicio interacțiune. */
  uncontacted: CrmTodayLead[];
  /** Lead-uri active, fără niciun task deschis. */
  noNextStep: CrmTodayLead[];
  /** Lead-uri active, neatinse de peste 3 zile. */
  neglected: CrmTodayLead[];
}

/** `ownerId` = un singur agent (fiecare vede DOAR lead-urile lui); absent = toată echipa. */
export function getCrmToday(ownerId?: string): Promise<CrmTodayResponse> {
  return api<CrmTodayResponse>(`/api/crm/tasks/today${ownerId ? `?owner=${ownerId}` : ""}`);
}

// ─── Motive de pierdere (configurabile per tenant) ─────────────────────────────

export interface CrmLostReason {
  id: string;
  tenantId: string;
  label: string;
  orderIndex: number;
  createdAt: string;
}

export interface ListCrmLostReasonsResponse {
  items: CrmLostReason[];
}

/** Prima citire seamănă automat 6 motive implicite în română, dacă tenantul n-are încă niciunul. */
export function listCrmLostReasons(): Promise<ListCrmLostReasonsResponse> {
  return api<ListCrmLostReasonsResponse>("/api/crm/lost-reasons");
}

export function createCrmLostReason(label: string): Promise<CrmLostReason> {
  return api<CrmLostReason>("/api/crm/lost-reasons", { method: "POST", body: JSON.stringify({ label }) });
}

export function updateCrmLostReason(id: string, label: string): Promise<CrmLostReason> {
  return api<CrmLostReason>(`/api/crm/lost-reasons/${id}`, { method: "PATCH", body: JSON.stringify({ label }) });
}

export function deleteCrmLostReason(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/lost-reasons/${id}`, { method: "DELETE" });
}

/** `ids` = ordinea completă, nouă. Întoarce lista rescrisă, ca UI-ul optimist să se realinieze. */
export function reorderCrmLostReasons(ids: string[]): Promise<ListCrmLostReasonsResponse> {
  return api<ListCrmLostReasonsResponse>("/api/crm/lost-reasons/reorder", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

// ─── Etichete pe lead (tags) ────────────────────────────────────────────────────

export interface CrmLeadTag {
  id: string;
  tenantId: string;
  leadId: string;
  tag: string;
  createdAt: string;
}

export interface ListCrmLeadTagsResponse {
  items: CrmLeadTag[];
}

export function listCrmLeadTags(leadId: string): Promise<ListCrmLeadTagsResponse> {
  return api<ListCrmLeadTagsResponse>(`/api/crm/tags?leadId=${leadId}`);
}

export interface ListCrmTagSuggestionsResponse {
  items: string[];
}

/** Etichetele distincte ale tenantului (tot ce s-a folosit deja pe orice lead) — pentru autocomplete. */
export function listCrmTagSuggestions(): Promise<ListCrmTagSuggestionsResponse> {
  return api<ListCrmTagSuggestionsResponse>("/api/crm/tags/suggestions");
}

/** Idempotent: dacă eticheta există deja pe lead, serverul întoarce rândul existent (200) — nu-l
 *  dublează. */
export function addCrmLeadTag(leadId: string, tag: string): Promise<CrmLeadTag> {
  return api<CrmLeadTag>("/api/crm/tags", { method: "POST", body: JSON.stringify({ leadId, tag }) });
}

export function removeCrmLeadTag(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/tags/${id}`, { method: "DELETE" });
}

// ─── Vizualizări salvate (filtre cu nume) ──────────────────────────────────────

/** Filtrele salvate — aceleași chei ca bara de filtre din pipeline. */
export interface CrmSavedViewFilters extends CrmSegmentFilters {
  search?: string;
  source?: string;
  stage?: string;
  assignedTo?: string | null;
  onlyMine?: boolean;
  pipelineId?: string | null;
  view?: "kanban" | "list";
  sort?: string;
  dir?: "asc" | "desc";
}

export interface CrmSavedView {
  id: string;
  name: string;
  filters: CrmSavedViewFilters;
  createdByUserId: string | null;
  /** `false` = doar autorul o vede; `true` = toată echipa workspace-ului. */
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListCrmSavedViewsResponse {
  items: CrmSavedView[];
  schemaLag?: boolean;
}

/** Ale mele + cele partajate de echipă. */
export function listCrmSavedViews(): Promise<ListCrmSavedViewsResponse> {
  return api<ListCrmSavedViewsResponse>("/api/crm/saved-views");
}

export interface CreateCrmSavedViewBody {
  name: string;
  filters: CrmSavedViewFilters;
  /** Implicit `false`: vizualizarea e personală până când autorul o partajează explicit. */
  isShared?: boolean;
}

export function createCrmSavedView(body: CreateCrmSavedViewBody): Promise<CrmSavedView> {
  return api<CrmSavedView>("/api/crm/saved-views", { method: "POST", body: JSON.stringify(body) });
}

export type UpdateCrmSavedViewBody = Partial<CreateCrmSavedViewBody>;

/** 403 `forbidden` dacă nu ești autorul (și nici admin de workspace). */
export function updateCrmSavedView(id: string, body: UpdateCrmSavedViewBody): Promise<CrmSavedView> {
  return api<CrmSavedView>(`/api/crm/saved-views/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteCrmSavedView(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/saved-views/${id}`, { method: "DELETE" });
}

// ─── Persoane de contact pe lead ───────────────────────────────────────────────

export interface CrmLeadContact {
  id: string;
  leadId: string;
  fullName: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  /** 1 = principalul leadului. Cel mult unul — serverul îi scoate pe ceilalți la marcare. */
  isPrimary: number;
  createdAt: string;
  updatedAt: string;
}

export function listCrmLeadContacts(leadId: string): Promise<{ items: CrmLeadContact[] }> {
  return api<{ items: CrmLeadContact[] }>(`/api/crm/contacts?leadId=${leadId}`);
}

export interface CreateCrmLeadContactBody {
  leadId: string;
  fullName: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
}

export function createCrmLeadContact(body: CreateCrmLeadContactBody): Promise<CrmLeadContact> {
  return api<CrmLeadContact>("/api/crm/contacts", { method: "POST", body: JSON.stringify(body) });
}

export type UpdateCrmLeadContactBody = Partial<Omit<CreateCrmLeadContactBody, "leadId">>;

export function updateCrmLeadContact(id: string, body: UpdateCrmLeadContactBody): Promise<CrmLeadContact> {
  return api<CrmLeadContact>(`/api/crm/contacts/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteCrmLeadContact(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/contacts/${id}`, { method: "DELETE" });
}

// ─── Câmpuri personalizate ─────────────────────────────────────────────────────

export type CrmCustomFieldType = "text" | "select" | "number";

export interface CrmCustomField {
  id: string;
  /** Identificator stabil, derivat din etichetă. Imuabil — rapoartele se sprijină pe el. */
  key: string;
  label: string;
  type: CrmCustomFieldType;
  options: string[] | null;
  orderIndex: number;
}

export interface CrmLeadFieldValue {
  id: string;
  leadId: string;
  fieldId: string;
  value: string | null;
}

export function listCrmCustomFields(): Promise<{ items: CrmCustomField[] }> {
  return api<{ items: CrmCustomField[] }>("/api/crm/custom-fields");
}

export interface CreateCrmCustomFieldBody {
  label: string;
  type?: CrmCustomFieldType;
  options?: string[];
}

/** 409 `field_key_taken` dacă eticheta produce o cheie deja folosită. */
export function createCrmCustomField(body: CreateCrmCustomFieldBody): Promise<CrmCustomField> {
  return api<CrmCustomField>("/api/crm/custom-fields", { method: "POST", body: JSON.stringify(body) });
}

export function updateCrmCustomField(
  id: string,
  body: { label?: string; options?: string[]; orderIndex?: number }
): Promise<CrmCustomField> {
  return api<CrmCustomField>(`/api/crm/custom-fields/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

/** Șterge definiția ȘI valorile ei de pe toate leadurile. */
export function deleteCrmCustomField(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/custom-fields/${id}`, { method: "DELETE" });
}

export function listCrmLeadFieldValues(leadId: string): Promise<{ items: CrmLeadFieldValue[] }> {
  return api<{ items: CrmLeadFieldValue[] }>(`/api/crm/custom-fields/values?leadId=${leadId}`);
}

/** Valoare goală = ștergere (serverul nu ține rânduri goale). */
export function setCrmLeadFieldValue(
  leadId: string,
  fieldId: string,
  value: string | null
): Promise<CrmLeadFieldValue | { ok: true; value: null }> {
  return api<CrmLeadFieldValue | { ok: true; value: null }>("/api/crm/custom-fields/values", {
    method: "PUT",
    body: JSON.stringify({ leadId, fieldId, value }),
  });
}

// ─── Fișiere pe lead ───────────────────────────────────────────────────────────

export interface CrmLeadFile {
  id: string;
  leadId: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  uploadedBy: string | null;
  createdAt: string;
  /** Singura cale prin care se deschide fișierul — calea din Storage nu pleacă niciodată la client. */
  previewUrl: string;
}

export function listCrmLeadFiles(leadId: string): Promise<{ items: CrmLeadFile[] }> {
  return api<{ items: CrmLeadFile[] }>(`/api/crm/lead-files?leadId=${leadId}`);
}

/**
 * Încarcă un fișier pe lead fără să-l treacă prin funcția serverless (unde corpul e plafonat la
 * ~4,5 MB). Trei cereri, dar doar una duce date: serverul semnează, browserul urcă binarul direct
 * în Storage, serverul confirmă după ce se uită la octeții reali.
 */
export async function uploadCrmLeadFile(
  leadId: string,
  file: File,
  opts: { onStep?: (step: "upload" | "finalize") => void } = {}
): Promise<CrmLeadFile> {
  const { path, signedUrl } = await api<{ path: string; signedUrl: string }>("/api/crm/lead-files/sign", {
    method: "POST",
    body: JSON.stringify({ leadId, fileName: file.name, mime: file.type, sizeBytes: file.size }),
  });

  opts.onStep?.("upload");
  // `credentials` lipsește înadins: URL-ul e deja semnat, iar trimiterea cookie-urilor noastre
  // către alt origin nu le-ar face decât să fie expuse.
  let put: Response;
  try {
    put = await fetch(signedUrl, {
      method: "PUT",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
  } catch {
    throw new Error("Fișierul nu a ajuns la server (conexiune întreruptă). Reîncearcă.");
  }
  if (!put.ok) throw new Error("Încărcarea fișierului nu a reușit. Verifică conexiunea și reîncearcă.");

  opts.onStep?.("finalize");
  return api<CrmLeadFile>("/api/crm/lead-files/finalize", {
    method: "POST",
    body: JSON.stringify({ leadId, path, fileName: file.name, mime: file.type }),
  });
}

export function deleteCrmLeadFile(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/lead-files/${id}`, { method: "DELETE" });
}

// ─── Istoricul persoanei (alte leaduri ale aceluiași om) ───────────────────────

export interface CrmPersonHistoryResponse {
  /** Leadurile înrudite (același telefon/email normalizat), fără cel curent. */
  leads: CrmLead[];
  /** Comentariile lor, grupate pe lead, cele mai noi primele. */
  notesByLead: Record<string, CrmLeadInteraction[]>;
}

export function getCrmPersonHistory(leadId: string): Promise<CrmPersonHistoryResponse> {
  return api<CrmPersonHistoryResponse>(`/api/crm/leads/${leadId}/person-history`);
}

// ─── Cadențe (secvențe de urmărire) ────────────────────────────────────────────

export type CrmCadenceStepAction = "task" | "note";

export interface CrmCadenceStep {
  /** Zile după înscriere (primul pas) sau după pasul precedent. */
  dayOffset: number;
  action: CrmCadenceStepAction;
  title: string;
}

export interface CrmCadence {
  id: string;
  name: string;
  /** Etapa care înscrie automat leadul; `null` = doar înscriere manuală. */
  triggerStage: string | null;
  enabled: boolean;
  steps: CrmCadenceStep[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmCadenceEnrollment {
  id: string;
  leadId: string;
  cadenceId: string;
  status: "active" | "done" | "cancelled";
  currentStep: number;
  nextFireAt: string | null;
  enrolledAt: string;
  cadenceName?: string;
}

export function listCrmCadences(): Promise<{ items: CrmCadence[] }> {
  return api<{ items: CrmCadence[] }>("/api/crm/cadences");
}

export interface CreateCrmCadenceBody {
  name: string;
  triggerStage?: string | null;
  enabled?: boolean;
  steps?: CrmCadenceStep[];
}

export function createCrmCadence(body: CreateCrmCadenceBody): Promise<CrmCadence> {
  return api<CrmCadence>("/api/crm/cadences", { method: "POST", body: JSON.stringify(body) });
}

export function updateCrmCadence(id: string, body: Partial<CreateCrmCadenceBody>): Promise<CrmCadence> {
  return api<CrmCadence>(`/api/crm/cadences/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteCrmCadence(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/cadences/${id}`, { method: "DELETE" });
}

export function listCrmLeadEnrollments(leadId: string): Promise<{ items: CrmCadenceEnrollment[] }> {
  return api<{ items: CrmCadenceEnrollment[] }>(`/api/crm/cadences/enrollments?leadId=${leadId}`);
}

export function enrollCrmLeadInCadence(leadId: string, cadenceId: string): Promise<CrmCadenceEnrollment> {
  return api<CrmCadenceEnrollment>("/api/crm/cadences/enroll", {
    method: "POST",
    body: JSON.stringify({ leadId, cadenceId }),
  });
}

export function cancelCrmEnrollment(id: string): Promise<CrmCadenceEnrollment> {
  return api<CrmCadenceEnrollment>(`/api/crm/cadences/enrollments/${id}/cancel`, { method: "POST" });
}

/** Aprinde acum pașii scadenți ai workspace-ului curent (în rest o face cronul zilnic). */
export function runCrmCadencesNow(): Promise<{ ok: true; due: number; advanced: number; errors: number }> {
  return api<{ ok: true; due: number; advanced: number; errors: number }>("/api/crm/cadences/run", { method: "POST" });
}

// ─── Reactivarea clienților pierduți ───────────────────────────────────────────

export type CrmReengagementAction = "create_task" | "enroll_cadence" | "add_tag";

export interface CrmReengagementRule {
  id: string;
  name: string;
  enabled: boolean;
  afterMonths: number;
  /** `[]` = orice motiv de pierdere. */
  lostReasons: string[];
  /** `[]` = orice etapă marcată „pierdut". */
  stageKeys: string[];
  action: CrmReengagementAction;
  cadenceId: string | null;
  /** Titlul taskului (create_task) sau eticheta (add_tag). */
  taskTitle: string | null;
  orderIndex: number;
}

export interface CrmReengagementPreviewItem {
  ruleId: string;
  ruleName: string;
  action: CrmReengagementAction;
  leadId: string;
  leadName: string;
  lostAt: string | null;
  lostReason: string | null;
}

export function listCrmReengagementRules(): Promise<{ items: CrmReengagementRule[] }> {
  return api<{ items: CrmReengagementRule[] }>("/api/crm/cadences/reengagement/rules");
}

export interface CreateCrmReengagementRuleBody {
  name: string;
  enabled?: boolean;
  afterMonths: number;
  lostReasons?: string[];
  stageKeys?: string[];
  action: CrmReengagementAction;
  cadenceId?: string | null;
  taskTitle?: string | null;
}

export function createCrmReengagementRule(body: CreateCrmReengagementRuleBody): Promise<CrmReengagementRule> {
  return api<CrmReengagementRule>("/api/crm/cadences/reengagement/rules", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCrmReengagementRule(
  id: string,
  body: Partial<CreateCrmReengagementRuleBody>
): Promise<CrmReengagementRule> {
  return api<CrmReengagementRule>(`/api/crm/cadences/reengagement/rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteCrmReengagementRule(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/cadences/reengagement/rules/${id}`, { method: "DELETE" });
}

/** Ce s-ar trezi acum, FĂRĂ efecte — asta se vede înainte de „Rulează acum". */
export function previewCrmReengagement(): Promise<{ items: CrmReengagementPreviewItem[] }> {
  return api<{ items: CrmReengagementPreviewItem[] }>("/api/crm/cadences/reengagement/preview");
}

export function runCrmReengagement(): Promise<{ ok: true; due: number; applied: number; failed: number }> {
  return api<{ ok: true; due: number; applied: number; failed: number }>("/api/crm/cadences/reengagement/run", {
    method: "POST",
  });
}

// ─── Roluri și jurnal ──────────────────────────────────────────────────────────

export type CrmPermission =
  | "leads.view_all"
  | "leads.view_own"
  | "leads.edit"
  | "leads.delete"
  | "leads.export"
  | "reports.view_team"
  | "reports.view_own"
  | "documents.create"
  | "products.manage"
  | "pipelines.manage"
  | "automations.manage"
  | "assignment.manage"
  | "cadences.manage"
  | "audit.view";

export interface CrmPermissionsResponse {
  role: string;
  /** Drepturile EFECTIVE: rolul, plus ce i s-a acordat, minus ce i s-a retras. */
  permissions: CrmPermission[];
  /** Doar cele din rol — ca ecranul de administrare să arate de unde vine fiecare drept. */
  fromRole?: CrmPermission[];
}

export interface CrmTeamMemberPermissions {
  id: string;
  name: string | null;
  email: string;
  role: string;
  /** Excepțiile scrise pe om: `granted: false` = retras, deși rolul îl are. */
  overrides: { permission: string; granted: boolean }[];
  effective: CrmPermission[];
}

export interface CrmTeamPermissionsResponse {
  /** Ce poate fiecare rol — temelia peste care stau excepțiile. */
  roleMatrix: Record<string, CrmPermission[]>;
  members: CrmTeamMemberPermissions[];
}

/** Cere `audit.view`. */
export function getCrmTeamPermissions(): Promise<CrmTeamPermissionsResponse> {
  return api<CrmTeamPermissionsResponse>("/api/crm/permissions/team");
}

/** `granted: null` șterge excepția — omul revine la ce-i dă rolul. Doar administratorii. */
export function setCrmUserPermission(body: {
  userId: string;
  permission: string;
  granted: boolean | null;
}): Promise<{ ok: true }> {
  return api<{ ok: true }>("/api/crm/permissions/team", { method: "PUT", body: JSON.stringify(body) });
}

/**
 * Ce poate face utilizatorul curent. Interfața ascunde ce n-are rost să arate — dar ascunderea NU
 * e apărarea: fiecare rută administrativă are propria poartă pe server.
 */
export function getCrmPermissions(): Promise<CrmPermissionsResponse> {
  return api<CrmPermissionsResponse>("/api/crm/permissions");
}

export interface CrmAuditEntry {
  id: string;
  /** „crm.lead.stage_changed", „crm.pipeline.deleted", … */
  actionType: string;
  targetType: string;
  targetId: string | null;
  oldValue: unknown;
  newValue: unknown;
  occurredAt: string;
  actorId: string | null;
  /** Numele omului — un uuid în dreptul unei modificări nu spune nimic. */
  actorName: string | null;
}

export interface ListCrmAuditParams {
  targetId?: string;
  targetType?: string;
  limit?: number;
}

/** Cere dreptul `audit.view` — altfel serverul răspunde 403. */
export function listCrmAudit(params: ListCrmAuditParams = {}): Promise<{ items: CrmAuditEntry[] }> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return api<{ items: CrmAuditEntry[] }>(`/api/crm/audit${suffix ? `?${suffix}` : ""}`);
}

// ─── Formulare de captare (lead-uri de pe site) ────────────────────────────────

export interface CrmCaptureSource {
  id: string;
  name: string;
  /** Tokenul pus în pagina publică. Public prin natura lui — nu citește nimic. */
  token: string;
  defaultSource: string;
  pipelineId: string | null;
  /** Domeniile de pe care se acceptă cereri; `[]` = fără restricție. */
  allowedOrigins: string[];
  active: boolean;
  leadsCaptured: number;
  lastCaptureAt: string | null;
  createdAt: string;
}

export function listCrmCaptureSources(): Promise<{ items: CrmCaptureSource[] }> {
  return api<{ items: CrmCaptureSource[] }>("/api/crm/capture-sources");
}

export interface CreateCrmCaptureSourceBody {
  name: string;
  defaultSource?: string;
  pipelineId?: string | null;
  allowedOrigins?: string[];
}

export function createCrmCaptureSource(body: CreateCrmCaptureSourceBody): Promise<CrmCaptureSource> {
  return api<CrmCaptureSource>("/api/crm/capture-sources", { method: "POST", body: JSON.stringify(body) });
}

export function updateCrmCaptureSource(
  id: string,
  body: Partial<CreateCrmCaptureSourceBody> & { active?: boolean }
): Promise<CrmCaptureSource> {
  return api<CrmCaptureSource>(`/api/crm/capture-sources/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteCrmCaptureSource(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/capture-sources/${id}`, { method: "DELETE" });
}

// ─── Drepturile persoanei (GDPR) pe fișa leadului ──────────────────────────────

/** Deschide exportul JSON într-o filă nouă — serverul îl trimite ca fișier. */
export function crmGdprExportUrl(leadId: string): string {
  return `/api/crm/gdpr/export/${leadId}`;
}

/** Șterge datele personale, păstrând faptele comerciale. Ireversibil. Cere `leads.delete`. */
export function anonymizeCrmLead(leadId: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/gdpr/anonymize/${leadId}`, { method: "POST" });
}

/** „Nu mă mai contactați" — nu șterge nimic, doar marchează. */
export function revokeCrmLeadConsent(leadId: string): Promise<{ ok: true; consentRevokedAt: string }> {
  return api<{ ok: true; consentRevokedAt: string }>(`/api/crm/gdpr/revoke/${leadId}`, { method: "POST" });
}
