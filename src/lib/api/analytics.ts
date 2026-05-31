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

// ─── REP-301: KPI Dashboard ───────────────────────────────────────────────────

export type KpiPeriod = "7d" | "30d" | "90d" | "12m";

export interface KpiData {
  period: KpiPeriod;
  mrrCents: number;
  activeStudents: number;
  newStudents: number;
  churnRatePct: number;
  arpuCents: number;
  prevMrrCents: number;
  prevActiveStudents: number;
}

export function getKpi(period: KpiPeriod = "30d"): Promise<KpiData> {
  return api<KpiData>(`/api/analytics/kpi?period=${period}`);
}

// ─── REP-302: Revenue charts ──────────────────────────────────────────────────

export interface RevenueMonth {
  month: string;
  totalCents: number;
  newStudents: number;
}

export interface RevenueCourse {
  courseName: string;
  studentCount: number;
  totalCents: number;
}

export function getRevenueOverTime(months = 12): Promise<{ months: RevenueMonth[] }> {
  return api<{ months: RevenueMonth[] }>(`/api/analytics/revenue-over-time?months=${months}`);
}

export function getRevenueByCourse(): Promise<{ items: RevenueCourse[] }> {
  return api<{ items: RevenueCourse[] }>("/api/analytics/revenue-by-course");
}

// ─── REP-303: Student LTV ─────────────────────────────────────────────────────

export interface StudentLtv {
  studentId: string;
  fullName: string;
  status: string;
  ltvCents: number;
  paymentCount: number;
  lessonsAttended: number;
  lastLessonAt: string | null;
}

export function getStudentLtv(limit = 50): Promise<{ items: StudentLtv[] }> {
  return api<{ items: StudentLtv[] }>(`/api/analytics/student-ltv?limit=${limit}`);
}
