/**
 * CRM — clientul tipat pentru repartizarea pe loturi.
 *
 * Cererea spune FILTRUL și NUMĂRUL, nu lista de id-uri: un manager care dă 200 de contacte unui
 * agent n-are cum să bifeze 200 de cartonașe. Serverul alege rândurile (cele mai vechi întâi) și
 * răspunde cu exact cât a primit fiecare — inclusiv cu cât NU s-a putut da.
 */
import { api } from "@/lib/api";

export interface DistributionAllocationInput {
  userId: string;
  count: number;
}

export interface DistributionAllocationResult {
  userId: string;
  name: string;
  requested: number;
  given: number;
}

export interface DistributionPlanResponse {
  /** Câte contacte se potrivesc filtrului și sunt disponibile de dat. */
  available: number;
  requested: number;
  allocations: DistributionAllocationResult[];
  /** Câte rămân în rezervă (nerepartizate) după lot. */
  remaining: number;
  /** Cerut − dat: câte n-au avut de unde veni. */
  shortfall: number;
  ok?: true;
}

export interface DistributionRequest {
  pipelineId?: string | null;
  stage?: string | null;
  onlyUnassigned?: boolean;
  /** Filtrele de segment, cu aceleași chei ca în lista de leaduri (`industry`, `tag`, `cf_<cheie>`…). */
  filters?: Record<string, string>;
  allocations: DistributionAllocationInput[];
}

export function previewCrmDistribution(body: DistributionRequest): Promise<DistributionPlanResponse> {
  return api<DistributionPlanResponse>("/api/crm/distribution/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function runCrmDistribution(body: DistributionRequest): Promise<DistributionPlanResponse> {
  return api<DistributionPlanResponse>("/api/crm/distribution/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Câte contacte stau nerepartizate — stocul din care trăiește echipa. */
export function getCrmLeadPool(params: Record<string, string> = {}): Promise<{ pool: number }> {
  const qs = new URLSearchParams(params).toString();
  return api<{ pool: number }>(`/api/crm/distribution/pool${qs ? `?${qs}` : ""}`);
}
