/**
 * PAY-003 (FIN): Pagina /app/fin/payroll/runs/:id
 *
 * Detaliu rulaj de salarizare:
 * - Tabel linii per angajat: Brut, CAS ang., CASS ang., Impozit, Net, Cost angajator
 * - Buton „Marcare Plătit" (POST /api/fin/payroll/runs/:id/mark-paid) pentru runs confirmed
 * - Export CSV client-side
 *
 * Design: design-system tokens, light+dark, WCAG AA, fără hex hardcodate.
 */

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  RefreshCw,
  AlertCircle,
  Download,
  CheckCircle,
  Clock,
  Banknote,
  Users,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayrollDeductions {
  cas_employee_cents: number;
  cass_employee_cents: number;
  income_tax_cents: number;
}

interface PayrollItemWithEmployee {
  id: string;
  tenantId: string;
  runId: string;
  employeeId: string;
  grossCents: number;
  deductionsJsonb: PayrollDeductions;
  netCents: number;
  employerCostCents: number;
  createdAt: string;
  employee: {
    id: string;
    fullName: string;
    jobTitle: string | null;
    contractType: string;
    currency: string;
  } | null;
}

interface PayrollRunDetail {
  id: string;
  tenantId: string;
  periodMonth: string;
  status: "draft" | "confirmed" | "paid";
  confirmedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

const STATUS_CONFIG: Record<
  "draft" | "confirmed" | "paid",
  { label: string; className: string; Icon: React.ElementType }
> = {
  draft: {
    label: "Ciornă",
    className: "bg-muted text-muted-foreground border-border",
    Icon: Clock,
  },
  confirmed: {
    label: "Confirmat",
    className: "bg-success/10 text-success border-success/20",
    Icon: CheckCircle,
  },
  paid: {
    label: "Plătit",
    className: "bg-primary/10 text-primary border-primary/20",
    Icon: Banknote,
  },
};

function StatusBadge({ status }: { status: "draft" | "confirmed" | "paid" }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
        cfg.className
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

/** Extrage ID-ul din URL-ul hash: #/app/fin/payroll/runs/:id */
function extractRunIdFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  const match = /\/app\/fin\/payroll\/runs\/([^/]+)/.exec(hash);
  return match ? match[1] : null;
}

/** Export CSV client-side */
function exportRunCsv(
  run: PayrollRunDetail,
  items: PayrollItemWithEmployee[]
) {
  const header = [
    "Angajat",
    "Funcție",
    "Brut (MDL)",
    "CAS angajat (MDL)",
    "CASS angajat (MDL)",
    "Impozit venit (MDL)",
    "Net de plată (MDL)",
    "Cost angajator (MDL)",
  ];

  const rows = items.map((item) => [
    item.employee?.fullName ?? "—",
    item.employee?.jobTitle ?? "—",
    formatCents(item.grossCents),
    formatCents(item.deductionsJsonb.cas_employee_cents),
    formatCents(item.deductionsJsonb.cass_employee_cents),
    formatCents(item.deductionsJsonb.income_tax_cents),
    formatCents(item.netCents),
    formatCents(item.employerCostCents),
  ]);

  // Totals row
  const total = items.reduce(
    (acc, i) => ({
      gross: acc.gross + i.grossCents,
      cas: acc.cas + i.deductionsJsonb.cas_employee_cents,
      cass: acc.cass + i.deductionsJsonb.cass_employee_cents,
      tax: acc.tax + i.deductionsJsonb.income_tax_cents,
      net: acc.net + i.netCents,
      cost: acc.cost + i.employerCostCents,
    }),
    { gross: 0, cas: 0, cass: 0, tax: 0, net: 0, cost: 0 }
  );
  rows.push([
    "TOTAL",
    "",
    formatCents(total.gross),
    formatCents(total.cas),
    formatCents(total.cass),
    formatCents(total.tax),
    formatCents(total.net),
    formatCents(total.cost),
  ]);

  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `payroll-${run.periodMonth}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PayrollRunDetailPage() {
  const runId = extractRunIdFromHash();

  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [items, setItems] = useState<PayrollItemWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fin/payroll/runs/${runId}/items`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        run: PayrollRunDetail;
        items: PayrollItemWithEmployee[];
      };
      setRun(json.run);
      setItems(json.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare.");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markPaid() {
    if (!runId || !run) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fin/payroll/runs/${runId}/mark-paid`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la marcare plătit.");
    } finally {
      setActionLoading(false);
    }
  }

  // Totals
  const totals = items.reduce(
    (acc, i) => ({
      gross: acc.gross + i.grossCents,
      cas: acc.cas + i.deductionsJsonb.cas_employee_cents,
      cass: acc.cass + i.deductionsJsonb.cass_employee_cents,
      tax: acc.tax + i.deductionsJsonb.income_tax_cents,
      net: acc.net + i.netCents,
      cost: acc.cost + i.employerCostCents,
    }),
    { gross: 0, cas: 0, cass: 0, tax: 0, net: 0, cost: 0 }
  );

  if (!runId) {
    return (
      <AppShell pageTitle="Rulaj — Salarizare">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <p className="text-muted-foreground">ID rulaj lipsă din URL.</p>
          <a
            href="#/app/fin/payroll"
            className="mt-4 inline-block text-sm text-primary hover:underline"
          >
            Înapoi la Salarizare
          </a>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle={`Rulaj ${run?.periodMonth ?? "…"} — Salarizare`}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <a
              href="#/app/fin/payroll"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Înapoi la Salarizare"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Salarizare
            </a>
            <span className="text-muted-foreground/40">/</span>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Rulaj {run?.periodMonth ?? "…"}
              </h1>
              {run && (
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={run.status} />
                  {run.confirmedAt && (
                    <span className="text-xs text-muted-foreground">
                      Confirmat:{" "}
                      {new Date(run.confirmedAt).toLocaleDateString("ro-RO")}
                    </span>
                  )}
                  {run.paidAt && (
                    <span className="text-xs text-muted-foreground">
                      Plătit:{" "}
                      {new Date(run.paidAt).toLocaleDateString("ro-RO")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Reîncarcă"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm",
                "bg-background text-foreground hover:bg-muted transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <RefreshCw
                className={cn("h-4 w-4", loading && "animate-spin")}
                aria-hidden="true"
              />
            </button>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => run && exportRunCsv(run, items)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium",
                  "bg-background text-foreground hover:bg-muted transition-colors"
                )}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export CSV
              </button>
            )}
            {run?.status === "confirmed" && (
              <button
                type="button"
                onClick={() => void markPaid()}
                disabled={actionLoading}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
                  "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <Banknote className="h-4 w-4" aria-hidden="true" />
                {actionLoading ? "Se procesează…" : "Marcare Plătit"}
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
            <button
              type="button"
              className="ml-auto text-xs underline"
              onClick={() => setError(null)}
            >
              Închide
            </button>
          </div>
        )}

        {/* Summary cards */}
        {run && items.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Total brut</p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {formatCents(totals.gross)} MDL
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Total net</p>
              <p className="text-lg font-bold text-success tabular-nums">
                {formatCents(totals.net)} MDL
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Cost angajator</p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {formatCents(totals.cost)} MDL
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">Angajați</p>
              <p className="text-lg font-bold text-foreground tabular-nums flex items-center gap-1.5">
                <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {items.length}
              </p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && items.length === 0 && (
          <div className="space-y-3" aria-label="Se încarcă…">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-lg bg-muted animate-pulse"
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && run && items.length === 0 && (
          <div className="text-center py-12">
            <Users
              className="h-10 w-10 mx-auto text-muted-foreground mb-3"
              aria-hidden="true"
            />
            <p className="text-muted-foreground text-sm">
              Nicio linie calculată. Rulați calculul din pagina de Salarizare.
            </p>
            <a
              href="#/app/fin/payroll"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              Înapoi la Salarizare
            </a>
          </div>
        )}

        {/* Items table */}
        {items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left border-b border-border">
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Angajat
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right"
                  >
                    Brut
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right"
                  >
                    CAS ang.
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right"
                  >
                    CASS ang.
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right"
                  >
                    Impozit
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right"
                  >
                    Net
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right"
                  >
                    Cost ang.
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="bg-card hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {item.employee?.fullName ?? "—"}
                      </div>
                      {item.employee?.jobTitle && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {item.employee.jobTitle}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {formatCents(item.grossCents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-destructive">
                      −{formatCents(item.deductionsJsonb.cas_employee_cents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-destructive">
                      −{formatCents(item.deductionsJsonb.cass_employee_cents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-destructive">
                      −{formatCents(item.deductionsJsonb.income_tax_cents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-success">
                      {formatCents(item.netCents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatCents(item.employerCostCents)}
                    </td>
                  </tr>
                ))}

                {/* Totals row */}
                <tr className="bg-muted/50 font-semibold border-t-2 border-border">
                  <td className="px-4 py-3 text-foreground text-xs uppercase tracking-wide">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCents(totals.gross)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-destructive">
                    −{formatCents(totals.cas)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-destructive">
                    −{formatCents(totals.cass)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-destructive">
                    −{formatCents(totals.tax)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-success">
                    {formatCents(totals.net)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {formatCents(totals.cost)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Notes */}
        {run?.notes && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Note</p>
            <p className="text-sm text-foreground">{run.notes}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
