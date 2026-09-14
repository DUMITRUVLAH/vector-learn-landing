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
  /**
   * Etapele configurate ale pipeline-ului, ordonate — sursa de adevăr pentru coloanele
   * board-ului (nu mai `CRM_DEFAULT_STAGES`). Opțional strict defensiv: dacă backend-ul e în
   * urma codului (endpoint nou), câmpul poate lipsi — apelantul cade atunci pe
   * `CRM_DEFAULT_STAGES` din `components/crm/constants.ts`.
   */
  stages?: CrmStage[];
}

export function getCrmPipeline(): Promise<CrmPipelineResponse> {
  return api<CrmPipelineResponse>("/api/crm/leads/pipeline");
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

export function getCrmStages(): Promise<ListCrmStagesResponse> {
  return api<ListCrmStagesResponse>("/api/crm/stages");
}

export interface CreateCrmStageBody {
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
  /** Câmpurile de mai jos sunt `optional().nullable()` pe server: `undefined` = neschimbat la
   *  PATCH, `null` = golit explicit, string = setat. Un string gol NU trebuie trimis pentru
   *  `email` — validarea `.email()` de pe server îl respinge (vezi `emptyToNull` din `format.ts`). */
  dealName?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  interestCourse?: string | null;
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

export function listCrmUpcomingTasks(): Promise<ListCrmUpcomingTasksResponse> {
  return api<ListCrmUpcomingTasksResponse>("/api/crm/tasks?scope=upcoming");
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
