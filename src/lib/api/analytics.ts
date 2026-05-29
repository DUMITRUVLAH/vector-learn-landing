import { api } from "../api";

export interface FunnelStage {
  stage: string;
  count: number;
}

export interface SourceBreakdown {
  source: string;
  count: number;
}

export interface FunnelData {
  funnel: FunnelStage[];
  total: number;
  paid: number;
  conversionRate: number;
  sourceBreakdown: SourceBreakdown[];
}

export interface LostReasonItem {
  reason: string;
  count: number;
  percent: number;
}

export interface LostReasonsData {
  reasons: LostReasonItem[];
  total: number;
}

export interface CampaignRoas {
  campaign: string;
  totalLeads: number;
  paidStudents: number;
  conversionRate: number;
  spendCents: number;
  costPerStudentCents: number | null;
}

export interface RoasData {
  campaigns: CampaignRoas[];
}

export function getFunnel(): Promise<FunnelData> {
  return api<FunnelData>("/api/analytics/crm/funnel");
}

export function getLostReasons(): Promise<LostReasonsData> {
  return api<LostReasonsData>("/api/analytics/crm/lost-reasons");
}

export function getRoas(): Promise<RoasData> {
  return api<RoasData>("/api/analytics/crm/roas");
}

export function setBudget(input: {
  utmCampaign: string;
  spendCents: number;
  month: string;
}): Promise<{ id: string; spendCents: number }> {
  return api<{ id: string; spendCents: number }>("/api/analytics/crm/budgets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
