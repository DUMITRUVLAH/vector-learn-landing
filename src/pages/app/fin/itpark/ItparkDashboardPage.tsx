/**
 * ITPARK-702: MITP Compliance Dashboard
 * Route: /app/fin/itpark/dashboard
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §5
 *
 * Afișează per rezident: pondere eligibilă YTD, status prag (conform/warning/risc),
 * status dosar, zile până la 30 apr. Summary cards globale.
 */
import { useState, useEffect, useMemo } from "react";
import {
  getDashboard,
  type DashboardItem,
  type DashboardSummary,
  type ThresholdStatus,
  type EngagementStatus,
} from "../../../../lib/api/itparkDashboard";

// ─── Badge helpers ────────────────────────────────────────────────────────────

const THRESHOLD_LABELS: Record<ThresholdStatus, string> = {
  conform: "Conform",
  warning: "Avertizare",
  risc: "Risc",
};

const THRESHOLD_CLASSES: Record<ThresholdStatus, string> = {
  conform: "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300",
  warning: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-300",
  risc: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300",
};

const STATUS_LABELS: Record<EngagementStatus, string> = {
  draft: "Ciornă",
  in_progress: "În lucru",
  ready: "Gata",
  exported: "Exportat",
};

const STATUS_CLASSES: Record<EngagementStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300",
  ready: "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300",
  exported: "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300",
};

function ThresholdBadge({ status }: { status: ThresholdStatus }) {
  return (
    <span
      role="status"
      aria-label={`Prag: ${THRESHOLD_LABELS[status]}`}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${THRESHOLD_CLASSES[status]}`}
    >
      {THRESHOLD_LABELS[status]}
    </span>
  );
}

function StatusBadge({ status }: { status: EngagementStatus }) {
  return (
    <span
      role="status"
      aria-label={`Status dosar: ${STATUS_LABELS[status]}`}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: number;
  variant?: "default" | "warning" | "success" | "purple";
}

const CARD_VARIANTS: Record<NonNullable<SummaryCardProps["variant"]>, string> = {
  default: "border-border",
  warning: "border-red-300 dark:border-red-800",
  success: "border-green-300 dark:border-green-800",
  purple: "border-purple-300 dark:border-purple-800",
};

const CARD_VALUE_CLASSES: Record<NonNullable<SummaryCardProps["variant"]>, string> = {
  default: "text-foreground",
  warning: "text-red-700 dark:text-red-400",
  success: "text-green-700 dark:text-green-400",
  purple: "text-purple-700 dark:text-purple-400",
};

function SummaryCard({ label, value, variant = "default" }: SummaryCardProps) {
  return (
    <div
      className={`rounded-xl border-2 ${CARD_VARIANTS[variant]} bg-card p-5 shadow-sm flex flex-col gap-1`}
      aria-label={`${label}: ${value}`}
    >
      <span className="text-sm text-muted-foreground font-medium">{label}</span>
      <span className={`text-3xl font-bold ${CARD_VALUE_CLASSES[variant]}`}>{value}</span>
    </div>
  );
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

type SortKey = "eligiblePct" | "daysUntilDeadline";
type SortDir = "asc" | "desc";

// ─── Component ───────────────────────────────────────────────────────────────

export default function ItparkDashboardPage() {
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>({
    total: 0,
    belowThreshold: 0,
    ready: 0,
    exported: 0,
  });
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [thresholdFilter, setThresholdFilter] = useState<"all" | ThresholdStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EngagementStatus>("all");

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>("eligiblePct");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    load(year);
  }, [year]);

  async function load(y: number) {
    try {
      setLoading(true);
      setError(null);
      const data = await getDashboard(y);
      setItems(data.items);
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (thresholdFilter !== "all" && item.thresholdStatus !== thresholdFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      return true;
    });
  }, [items, thresholdFilter, statusFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const deadlineYear = year;

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) {
      return (
        <svg aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
        </svg>
      );
    }
    return sortDir === "asc" ? (
      <svg aria-hidden="true" className="h-3.5 w-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4" />
      </svg>
    ) : (
      <svg aria-hidden="true" className="h-3.5 w-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 15l-4 4-4-4" />
      </svg>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard conformitate MITP</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pondere eligibilă YTD per rezident — prag de conformitate 70% (termen 30 apr {deadlineYear})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="year-select" className="text-sm text-muted-foreground font-medium">
            An:
          </label>
          <select
            id="year-select"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <a
            href="#/app/fin/itpark"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Lista dosarelor
          </a>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive" role="alert">
          <p className="font-medium">Eroare la încărcare</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={() => load(year)}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Reîncearcă
          </button>
        </div>
      )}

      {/* Summary cards */}
      {!loading && !error && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="dashboard-summary-cards">
          <SummaryCard label="Total dosare" value={summary.total} />
          <SummaryCard label="Sub prag (< 70%)" value={summary.belowThreshold} variant="warning" />
          <SummaryCard label="Gata de depus" value={summary.ready} variant="success" />
          <SummaryCard label="Exportate" value={summary.exported} variant="purple" />
        </div>
      )}

      {/* Filters */}
      {!loading && !error && items.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          {/* Threshold filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="threshold-filter" className="text-sm text-muted-foreground font-medium">
              Status prag:
            </label>
            <select
              id="threshold-filter"
              value={thresholdFilter}
              onChange={(e) => setThresholdFilter(e.target.value as "all" | ThresholdStatus)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Toate</option>
              <option value="conform">Conform</option>
              <option value="warning">Avertizare</option>
              <option value="risc">Risc</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="text-sm text-muted-foreground font-medium">
              Status dosar:
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | EngagementStatus)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Toate</option>
              <option value="draft">Ciornă</option>
              <option value="in_progress">În lucru</option>
              <option value="ready">Gata</option>
              <option value="exported">Exportat</option>
            </select>
          </div>

          {sorted.length !== items.length && (
            <span className="text-xs text-muted-foreground">
              {sorted.length} din {items.length} dosare
            </span>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex items-center justify-center min-h-64" aria-busy="true" aria-label="Se încarcă dashboard-ul">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div
          className="rounded-xl border-2 border-dashed border-border bg-muted/30 py-16 text-center"
          data-testid="dashboard-empty-state"
        >
          <svg
            aria-hidden="true"
            className="mx-auto h-12 w-12 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Niciun dosar pentru {year}</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
            Creează dosare de verificare MITP pentru a vedea datele de conformitate.
          </p>
          <a
            href="#/app/fin/itpark/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 min-h-[44px]"
          >
            Creează dosar nou
          </a>
        </div>
      )}

      {/* No results after filter */}
      {!loading && !error && items.length > 0 && sorted.length === 0 && (
        <div className="rounded-xl border border-border bg-muted/20 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Niciun dosar nu corespunde filtrelor selectate.
          </p>
          <button
            onClick={() => { setThresholdFilter("all"); setStatusFilter("all"); }}
            className="mt-3 text-sm text-primary underline hover:no-underline"
          >
            Resetează filtrele
          </button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && sorted.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm" aria-label="Dashboard conformitate MITP">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                  Rezident
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                  IDNO
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => toggleSort("eligiblePct")}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary rounded"
                    aria-label="Sortează după pondere eligibilă"
                  >
                    Pondere eligibilă (%)
                    <SortIcon col="eligiblePct" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                  Status prag
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                  Status dosar
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => toggleSort("daysUntilDeadline")}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary rounded"
                    aria-label="Sortează după zile până la termen"
                  >
                    Zile până la 30 apr
                    <SortIcon col="daysUntilDeadline" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground text-right">
                  Acțiune
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((item) => (
                <tr key={item.engagementId} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <a
                      href={`#/app/fin/itpark/${item.engagementId}`}
                      className="hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary rounded"
                    >
                      {item.residentName}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {item.idno}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-semibold text-sm ${
                        item.eligiblePct >= 70
                          ? "text-green-700 dark:text-green-400"
                          : item.eligiblePct >= 60
                          ? "text-orange-700 dark:text-orange-400"
                          : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      {item.eligiblePct.toFixed(2)}%
                    </span>
                    {/* Progress bar */}
                    <div className="mt-1 h-1.5 w-24 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                      <div
                        className={`h-full rounded-full ${
                          item.eligiblePct >= 70
                            ? "bg-green-500"
                            : item.eligiblePct >= 60
                            ? "bg-orange-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(item.eligiblePct, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ThresholdBadge status={item.thresholdStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    {item.daysUntilDeadline > 0 ? (
                      <span
                        className={`text-sm font-medium ${
                          item.daysUntilDeadline <= 14
                            ? "text-red-700 dark:text-red-400"
                            : item.daysUntilDeadline <= 30
                            ? "text-orange-700 dark:text-orange-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {item.daysUntilDeadline} zile
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Termen expirat</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`#/app/fin/itpark/${item.engagementId}`}
                      className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-background hover:bg-muted transition-colors min-h-[36px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                      aria-label={`Deschide dosarul ${item.residentName}`}
                    >
                      Deschide
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
