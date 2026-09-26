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

/** Prima zi a lunii de acum 11 luni — aceeași fereastră de 12 luni ca `/metrics?period=ytd`. */
function windowStartIso(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function fetchFinDeskKPI(): Promise<FinDeskKPI> {
  // NAV-06: ambele cifre pe aceeași fereastră de 12 luni. Înainte, facturile se citeau din
  // `/api/fin/invoices?limit=500` ca `invoices[].totalAmountCents` — dar API-ul întoarce
  // `data[].totalCents` (și plafonează la 200), deci „Facturi emise" era mereu 0, iar „Sold net"
  // arăta minus cheltuielile. Acum suma vine agregată de server: încasat + de încasat pe lună,
  // fără ciorne și anulate.
  const [expSummary, metrics] = await Promise.all([
    api<{ grandTotalCents: number }>(`/api/fin/expenses/summary?dateFrom=${windowStartIso()}`),
    api<{ metrics: { revenue: number; receivable: number }[] }>("/api/analytics/fin/metrics?period=ytd"),
  ]);

  const totalExpensesCents = Number(expSummary.grandTotalCents ?? 0);
  const totalInvoicesCents = (metrics.metrics ?? []).reduce(
    (sum, m) => sum + Number(m.revenue ?? 0) + Number(m.receivable ?? 0),
    0,
  );

  return {
    totalExpensesCents,
    totalInvoicesCents,
    netCents: totalInvoicesCents - totalExpensesCents,
  };
}

async function fetchPARKPI(): Promise<PARkpi> {
  // PAR list with status=pending_approval
  const res = await api<{
    requests: { totalEstimatedCents: number; totalMdlCents?: number | null; status: string }[];
    total: number;
  }>("/api/par?status=pending_approval");

  const pendingCount = res.total ?? 0;
  // Cifra se afișează ca „Valoare totală" în lei, deci fiecare cerere intră cu echivalentul ei
  // MDL, fixat la depunere. Adunarea directă a lui `totalEstimatedCents` punea dolari peste lei:
  // o cerere de 1.500 USD contribuia cu 1.500, nu cu ~25.800.
  const pendingValueCents = (res.requests ?? []).reduce(
    (sum, r) => sum + (r.totalMdlCents ?? r.totalEstimatedCents ?? 0),
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
