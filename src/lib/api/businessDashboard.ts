/**
 * SPLIT-204: Business Dashboard — fetch helpers for unified KPI.
 *
 * Aggregates KPI from three modules:
 *   - FinDesk: expenses summary (totalExpensesCents) + invoices total
 *   - PAR: pending requests count + total value
 *   - ITPark: active engagements count
 *
 * Each section fails gracefully — a network error in one card does not
 * block the others from rendering.
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinDeskKPI {
  totalExpensesCents: number;
  totalInvoicesCents: number;
  /** Net = invoices - expenses (positive = surplus) */
  netCents: number;
}

export interface PARkpi {
  pendingCount: number;
  pendingValueCents: number;
}

export interface ITParkKPI {
  activeCount: number;
  inProgressCount: number;
}

export interface BusinessDashboardKPI {
  findesk: FinDeskKPI | null;
  par: PARkpi | null;
  itpark: ITParkKPI | null;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchFinDeskKPI(): Promise<FinDeskKPI> {
  // Expenses summary — GET /api/fin/expenses/summary
  const expSummary = await api<{
    byCategory: { category: string; totalCents: number }[];
    grandTotalCents: number;
  }>("/api/fin/expenses/summary");

  const totalExpensesCents = expSummary.grandTotalCents ?? 0;

  // Invoices — GET /api/fin/invoices?status=sent (approximate revenue from sent invoices)
  // We query all non-cancelled invoices to get a revenue total.
  let totalInvoicesCents = 0;
  try {
    const invRes = await api<{
      invoices: { totalAmountCents?: number; netAmountCents?: number }[];
    }>("/api/fin/invoices?limit=500");
    totalInvoicesCents = (invRes.invoices ?? []).reduce(
      (sum, inv) => sum + (inv.totalAmountCents ?? inv.netAmountCents ?? 0),
      0
    );
  } catch {
    // Non-critical — expenses are more reliable
    totalInvoicesCents = 0;
  }

  return {
    totalExpensesCents,
    totalInvoicesCents,
    netCents: totalInvoicesCents - totalExpensesCents,
  };
}

async function fetchPARKPI(): Promise<PARkpi> {
  // PAR list with status=pending_approval
  const res = await api<{
    requests: { totalEstimatedCents: number; status: string }[];
    total: number;
  }>("/api/par?status=pending_approval");

  const pendingCount = res.total ?? 0;
  const pendingValueCents = (res.requests ?? []).reduce(
    (sum, r) => sum + (r.totalEstimatedCents ?? 0),
    0
  );
  return { pendingCount, pendingValueCents };
}

async function fetchITParkKPI(): Promise<ITParkKPI> {
  const res = await api<{
    engagements: { status: string }[];
  }>("/api/itpark/engagements");

  const engagements = res.engagements ?? [];
  const activeCount = engagements.filter(
    (e) => e.status === "ready" || e.status === "exported"
  ).length;
  const inProgressCount = engagements.filter(
    (e) => e.status === "in_progress"
  ).length;

  return { activeCount, inProgressCount };
}

// ─── Main aggregate ───────────────────────────────────────────────────────────

/**
 * Fetches all three KPI sections in parallel. Each section is wrapped in a
 * try/catch so a single failure does not cascade.
 */
export async function fetchBusinessDashboardKPI(): Promise<BusinessDashboardKPI> {
  const [findesk, par, itpark] = await Promise.allSettled([
    fetchFinDeskKPI(),
    fetchPARKPI(),
    fetchITParkKPI(),
  ]);

  return {
    findesk: findesk.status === "fulfilled" ? findesk.value : null,
    par: par.status === "fulfilled" ? par.value : null,
    itpark: itpark.status === "fulfilled" ? itpark.value : null,
  };
}
