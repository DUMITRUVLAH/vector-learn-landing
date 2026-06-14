/**
 * INSIGHT-002 (FIN): Client-side API helpers for FinDesk Insights.
 *
 * Routes (all behind /api/analytics/fin):
 *   GET  /metrics          — venituri/receivable/profit per perioadă
 *   GET  /aging            — aging receivable 0-30/31-60/61-90/90+z
 *   GET  /cashflow-forecast — forecast 60z, 3 scenarii DETERMINISTE
 *   GET  /saved-views      — lista vederi salvate
 *   POST /saved-views      — creare vedere salvată
 *   GET  /narratives       — lista narativele anului
 *   PUT  /narratives/:month — upsert narativă
 */

import { api } from "../api";

// ─── Local types (mirrors server/db/schema/finInsight.ts) ─────────────────────
// Note: cannot import from server directly in frontend — types are duplicated here.

export type FinMetric = "revenue" | "expenses" | "profit" | "vat" | "cashflow";
export type FinPeriod = "this_month" | "last_month" | "last_3m" | "last_6m" | "ytd" | "custom";
export type FinGroupBy = "day" | "week" | "month" | "category";

export interface FinSavedViewFilters {
  accountType?: string;
  category?: string;
}

export interface FinSavedView {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  metric: FinMetric;
  period: FinPeriod;
  groupBy: FinGroupBy;
  filters: FinSavedViewFilters;
  isDefault: boolean;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinNarrative {
  id: string;
  tenantId: string;
  authorId: string | null;
  month: string;
  title: string;
  body: string;
  generatedBy: "manual" | "ai";
  sentiment: "positive" | "neutral" | "negative";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── API-specific types ───────────────────────────────────────────────────────

export interface FinMetricPoint {
  period: string; // YYYY-MM or YYYY-MM-DD
  revenue: number; // cenți
  receivable: number;
  profit: number;
}

export interface FinMetricsResponse {
  metrics: FinMetricPoint[];
  period: string;
  groupBy: string;
}

export interface FinAgingResponse {
  aging: {
    "0_30": number;
    "31_60": number;
    "61_90": number;
    "90_plus": number;
    total: number;
  };
}

export interface ForecastDay {
  date: string; // YYYY-MM-DD
  cumulativeCents: number;
}

export interface CashflowForecastResponse {
  scenarios: {
    good: ForecastDay[];
    base: ForecastDay[];
    pessimistic: ForecastDay[];
  };
  weeklyAvgCents: number;
  generatedAt: string;
}

export interface CreateSavedViewData {
  name: string;
  metric: FinMetric;
  period?: FinPeriod;
  groupBy?: FinGroupBy;
  filters?: FinSavedViewFilters;
  isDefault?: boolean;
  isPublic?: boolean;
}

export interface UpsertNarrativeData {
  title: string;
  body: string;
  generatedBy?: "manual" | "ai";
  sentiment?: "positive" | "neutral" | "negative";
  publishedAt?: string | null;
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Metrici financiare: venituri, receivable, profit per perioadă.
 */
export function getFinMetrics(params?: {
  period?: FinPeriod;
  groupBy?: "month" | "day";
}): Promise<FinMetricsResponse> {
  const qs = new URLSearchParams();
  if (params?.period) qs.set("period", params.period);
  if (params?.groupBy) qs.set("groupBy", params.groupBy);
  const q = qs.toString() ? `?${qs.toString()}` : "";
  return api<FinMetricsResponse>(`/api/analytics/fin/metrics${q}`);
}

/**
 * Aging receivable per intervale 0-30/31-60/61-90/90+z.
 */
export function getFinAging(): Promise<FinAgingResponse> {
  return api<FinAgingResponse>("/api/analytics/fin/aging");
}

/**
 * Cashflow forecast 60 de zile, 3 scenarii DETERMINISTE (Bun/Bază/Slab).
 */
export function getCashflowForecast(): Promise<CashflowForecastResponse> {
  return api<CashflowForecastResponse>("/api/analytics/fin/cashflow-forecast");
}

/**
 * Lista vederi salvate (ale utilizatorului + publice din tenant).
 */
export function listSavedViews(): Promise<{ views: FinSavedView[] }> {
  return api<{ views: FinSavedView[] }>("/api/analytics/fin/saved-views");
}

/**
 * Creare vedere salvată.
 */
export function createSavedView(
  data: CreateSavedViewData
): Promise<{ view: FinSavedView }> {
  return api<{ view: FinSavedView }>("/api/analytics/fin/saved-views", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Lista narativele pentru un an (YYYY).
 */
export function listNarratives(
  year?: number
): Promise<{ narratives: FinNarrative[] }> {
  const qs = year ? `?year=${year}` : "";
  return api<{ narratives: FinNarrative[] }>(`/api/analytics/fin/narratives${qs}`);
}

/**
 * Upsert narativă pentru luna (YYYY-MM).
 * Crează dacă nu există; suprascrie dacă există.
 */
export function upsertNarrative(
  month: string,
  data: UpsertNarrativeData
): Promise<{ narrative: FinNarrative }> {
  return api<{ narrative: FinNarrative }>(
    `/api/analytics/fin/narratives/${month}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
}

// ─── INSIGHT-003: AI narativă CFO ────────────────────────────────────────────

export interface AiNarrativeMetrics {
  revenue: number; // cenți
  receivable: number;
  profit: number;
  agingTotal: number;
}

export interface AiNarrativeResponse {
  narrative: FinNarrative;
  auditId: string;
  isStub: boolean;
  metrics: AiNarrativeMetrics;
}

/**
 * Generează o narativă AI a lunii specificate (sau luna curentă).
 * AI narează cifrele REALE din DB — nu inventează date (FIN-CORE regula #4).
 * Returnează narativa draft (publishedAt = null) + datele metrice folosite.
 *
 * Aruncă eroare 409 dacă există o narativă manuală pentru luna respectivă.
 */
export function generateAiNarrative(
  month?: string
): Promise<AiNarrativeResponse> {
  return api<AiNarrativeResponse>("/api/analytics/fin/ai-narrative", {
    method: "POST",
    body: JSON.stringify(month ? { month } : {}),
  });
}
