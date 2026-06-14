/**
 * MULTICURRENCY-002: FX revaluation API client
 */
import { api } from "../api";

export interface RevaluationPair {
  currency_from: string;
  currency_to: string;
  fx_gain_loss_cents: number;
  entries: number;
}

export interface RevaluationResult {
  period_month: string;
  entries_created: number;
  total_fx_gain_loss_mdl_cents: number;
  pairs: RevaluationPair[];
}

export interface RevaluationSummary {
  period_month: string;
  total_fx_gain_loss_mdl_cents: number;
  entries_count: number;
  posted_at: string;
}

export async function triggerRevaluation(
  periodMonth: string
): Promise<RevaluationResult> {
  return api<RevaluationResult>("/fin/revaluation", {
    method: "POST",
    body: JSON.stringify({ period_month: periodMonth }),
  });
}

export async function listRevaluations(
  limit = 10
): Promise<RevaluationSummary[]> {
  return api<RevaluationSummary[]>(`/fin/revaluation?limit=${limit}`);
}
