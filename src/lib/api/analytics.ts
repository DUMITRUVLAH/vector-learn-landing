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

// ─── CRM-125: Weighted Forecast ───────────────────────────────────────────────

export interface ForecastStage {
  stageId: string;
  stage: string;
  label: string;
  color: string;
  probabilityPct: number;
  count: number;
  grossCents: number;
  weightedCents: number;
}

export interface ForecastData {
  stages: ForecastStage[];
  totalGrossCents: number;
  totalWeightedCents: number;
}

export function getForecast(): Promise<ForecastData> {
  return api<ForecastData>("/api/analytics/crm/forecast");
}

export function updateStageProbability(id: string, probabilityPct: number): Promise<unknown> {
  return api(`/api/pipeline-stages/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ probabilityPct }),
  });
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

// ─── BRANCH-704: Per-branch KPI analytics ────────────────────────────────────

export interface BranchKpi {
  branchId: string;
  branchName: string;
  /** Sum of paid payments in current month (cents) */
  mrr: number;
  activeStudents: number;
  lessonsThisMonth: number;
}

export interface BranchKpiResponse {
  branches: BranchKpi[];
}

export function getBranchKpis(period?: "month" | "quarter"): Promise<BranchKpiResponse> {
  const qs = period ? `?period=${period}` : "";
  return api<BranchKpiResponse>(`/api/analytics/branches${qs}`);
}

// ─── BRANCH-KPI: Global KPI dashboard ────────────────────────────────────────

export type KpiPeriod = "7d" | "30d" | "90d" | "12m";

export interface KpiData {
  mrrCents: number;
  prevMrrCents: number;
  activeStudents: number;
  prevActiveStudents: number;
  newStudents: number;
  churnRatePct: number;
  arpuCents: number;
}

export function getKpi(period: KpiPeriod): Promise<KpiData> {
  return api<KpiData>(`/api/analytics/kpi?period=${period}`);
}

// ─── Revenue charts ───────────────────────────────────────────────────────────

export interface RevenueMonth {
  month: string;
  totalCents: number;
  count: number;
}

export interface RevenueCourse {
  courseId: string;
  courseName: string;
  totalCents: number;
}

export interface RevenueOverTimeResponse {
  months: RevenueMonth[];
  byCourse: RevenueCourse[];
}

export function getRevenueOverTime(months?: number): Promise<RevenueOverTimeResponse> {
  const qs = months ? `?months=${months}` : "";
  return api<RevenueOverTimeResponse>(`/api/analytics/revenue-over-time${qs}`);
}
