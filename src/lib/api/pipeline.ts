import { api } from "../api";

export interface PipelineStage {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  color: string;
  orderIndex: number;
  isWon: boolean;
  isLost: boolean;
  isDefault: boolean;
  /** CRM-130: max leads allowed in this stage; null = no limit */
  wipLimit?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineStagesResponse {
  stages: PipelineStage[];
}

export function fetchPipelineStages(): Promise<PipelineStagesResponse> {
  return api<PipelineStagesResponse>("/api/pipeline-stages");
}

export function createPipelineStage(input: {
  key: string;
  label: string;
  color?: string;
  orderIndex?: number;
  isWon?: boolean;
  isLost?: boolean;
}): Promise<PipelineStage> {
  return api<PipelineStage>("/api/pipeline-stages", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePipelineStage(
  id: string,
  patch: Partial<Pick<PipelineStage, "label" | "color" | "orderIndex" | "isWon" | "isLost" | "wipLimit">>
): Promise<PipelineStage> {
  return api<PipelineStage>(`/api/pipeline-stages/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function reorderPipelineStages(order: string[]): Promise<PipelineStagesResponse> {
  return api<PipelineStagesResponse>("/api/pipeline-stages/reorder", {
    method: "POST",
    body: JSON.stringify({ order }),
  });
}

export function deletePipelineStage(id: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/api/pipeline-stages/${id}`, {
    method: "DELETE",
  });
}
