/**
 * ITPARK-702: Client API helper for MITP compliance dashboard.
 * Endpoint: GET /api/itpark/dashboard?year=YYYY
 */

export type ThresholdStatus = "conform" | "warning" | "risc";
export type EngagementStatus = "draft" | "in_progress" | "ready" | "exported";

export interface DashboardItem {
  engagementId: string;
  residentName: string;
  idno: string;
  eligiblePct: number;
  thresholdStatus: ThresholdStatus;
  status: EngagementStatus;
  daysUntilDeadline: number;
  reportingYear: number;
}

export interface DashboardSummary {
  total: number;
  belowThreshold: number;
  ready: number;
  exported: number;
}

export interface DashboardResponse {
  items: DashboardItem[];
  summary: DashboardSummary;
  year: number;
}

export async function getDashboard(year?: number): Promise<DashboardResponse> {
  const url = year
    ? `/api/itpark/dashboard?year=${year}`
    : "/api/itpark/dashboard";
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`getDashboard: ${res.status}`);
  return res.json() as Promise<DashboardResponse>;
}
