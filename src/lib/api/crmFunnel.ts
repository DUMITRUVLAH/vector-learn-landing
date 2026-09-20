/**
 * CRM — clientul tipat pentru tabloul pâlniei.
 *
 * O rută separată de restul rapoartelor (`/api/crm/reports/funnel`): ecranul ăsta se refiltrează
 * des, iar raportul general aduce taskuri, produse și motive de pierdere, pe care pâlnia nu le
 * folosește.
 */
import { api } from "@/lib/api";

export interface CrmFunnelStageRow {
  key: string;
  label: string;
  color: string | null;
  orderIndex: number;
  isWon: boolean;
  isLost: boolean;
  /** Câte oportunități stau ACUM în etapă. */
  currentCount: number;
  /** Suma lor, în cenți. */
  currentValueCents: number;
  /** Aceeași sumă, ponderată cu probabilitatea. */
  weightedValueCents: number;
  /** Câte au ajuns vreodată până aici. */
  reached: number;
  advanced: number;
  dropped: number;
  dropRatePct: number;
  conversionPct: number;
}

export interface CrmFunnelOwner {
  userId: string;
  name: string;
  stages: CrmFunnelStageRow[];
}

export interface CrmFunnelResponse {
  pipelineId: string | null;
  range: { from: string | null; to: string | null };
  owner: string | null;
  totalLeads: number;
  stages: CrmFunnelStageRow[];
  byOwner: CrmFunnelOwner[];
  owners: { id: string; name: string }[];
  schemaLag?: boolean;
}

export function getCrmFunnel(params: Record<string, string> = {}): Promise<CrmFunnelResponse> {
  const qs = new URLSearchParams(params).toString();
  return api<CrmFunnelResponse>(`/api/crm/reports/funnel${qs ? `?${qs}` : ""}`);
}
