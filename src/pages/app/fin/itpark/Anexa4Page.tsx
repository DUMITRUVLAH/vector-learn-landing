/**
 * ITPARK-403: Anexa 4 — randare live 12 luni + Total + consistency gate
 * Route: /app/fin/itpark/:id/anexa4
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §4
 *
 * Coloane: Eligible/Total lunar, Cumul Eligible/Total, Pondere cumulativă lunară
 * Fixture Dec: cumEligible = 1.971.197,19 MDL / 88,48%
 * Consistency gate: Anexa 2 rând 7 == Anexa 3 total vânzări == Anexa 4 Total total
 *                   Anexa 2 rând 8 == Anexa 3 eligibil      == Anexa 4 Total eligibil
 * Gate roșu → butonul "Ready" (ITPARK-602) dezactivat cu motivul exact.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Printer,
  AlertCircle,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import { getEngagement, type ItparkEngagement } from "@/lib/api/itparkEngagements";
import { listLines, type RevenueLine } from "@/lib/api/itparkLines";
import { computeAnexa3 } from "@/lib/itpark/calc";
import { computeAnexa4, fmtMDL, MONTH_NAMES_RO, type Anexa4Settings } from "@/lib/itpark/anexa4";
import { checkConsistency, type ConsistencyResult } from "@/lib/itpark/consistency";
import { fmtPct } from "@/lib/itpark/calc";
import { cn } from "@/lib/utils";

// ─── Default Anexa 4 settings (from CORE defaults — override per tenant settings) ──

const DEFAULT_SETTINGS: Anexa4Settings = {
  eligibilityThresholdPct: 70,
  toleranceMonths: 2,
};

// ─── Consistency banner ────────────────────────────────────────────────────────

interface ConsistencyBannerProps {
  result: ConsistencyResult;
}

function ConsistencyBanner({ result }: ConsistencyBannerProps) {
  if (result.ok) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 print:hidden"
      >
        <ShieldCheck className="w-5 h-5 text-success shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium text-success">{result.summary}</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 space-y-3 print:hidden"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold text-destructive">{result.summary}</span>
      </div>
      <ul className="space-y-2 ml-8">
        {result.gaps.map((gap) => (
          <li key={gap.key} className="text-xs text-destructive">
            <span className="font-medium">{gap.label}:</span>{" "}
            <span className="font-mono">
              A={fmtMDL(gap.valueA)} MDL · B={fmtMDL(gap.valueB)} MDL ·{" "}
              <strong>Δ={fmtMDL(gap.absDeltaCents)} MDL</strong>
            </span>
          </li>
        ))}
      </ul>
      <p className="ml-8 text-xs text-muted-foreground">
        Butonul &quot;Gata pentru export&quot; rămâne dezactivat până când divergențele sunt rezolvate.
      </p>
    </div>
  );
}

// ─── Threshold banner ─────────────────────────────────────────────────────────

interface ThresholdBannerProps {
  thresholdPct: number;
  currentPct: number;
  risk: boolean;
  maxConsecutive: number;
  toleranceMonths: number;
}

function ThresholdBanner({
  thresholdPct,
  currentPct,
  risk,
  maxConsecutive,
  toleranceMonths,
}: ThresholdBannerProps) {
  const conform = currentPct >= thresholdPct;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 print:hidden",
        risk
          ? "border-destructive/30 bg-destructive/10"
          : conform
          ? "border-success/30 bg-success/10"
          : "border-warning/30 bg-warning/10"
      )}
    >
      {risk ? (
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
      ) : conform ? (
        <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" aria-hidden="true" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
      )}
      <div className="text-sm space-y-0.5">
        <p
          className={cn(
            "font-medium",
            risk
              ? "text-destructive"
              : conform
              ? "text-success"
              : "text-amber-600 dark:text-amber-400"
          )}
        >
          {risk
            ? `Risc de pierdere statut IT Park — ${maxConsecutive} luni consecutive sub pragul de ${thresholdPct}%`
            : conform
            ? `Conform — ponderea cumulativă YTD (${fmtPct(currentPct)}) depășește pragul de ${thresholdPct}%`
            : `Atenție — ponderea cumulativă YTD (${fmtPct(currentPct)}) este sub pragul de ${thresholdPct}%`}
        </p>
        {risk && (
          <p className="text-xs text-muted-foreground">
            Toleranță configurată: {toleranceMonths} luni consecutive; s-au detectat {maxConsecutive} luni.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Anexa4Page() {
  const { path, navigate } = useRouter();

  // Extract engagementId from URL: /app/fin/itpark/:id/anexa4
  const engagementId = path.match(/^\/app\/fin\/itpark\/([^/]+)\/anexa4$/)?.[1] ?? "";

  const [eng, setEng] = useState<ItparkEngagement | null>(null);
  const [lines, setLines] = useState<RevenueLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!engagementId) return;
    try {
      setLoading(true);
      setError(null);
      const [engData, linesData] = await Promise.all([
        getEngagement(engagementId),
        listLines(engagementId),
      ]);
      setEng(engData);
      setLines(linesData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Compute engines — deterministic ───────────────────────────────────────

  const anexa3Lines = lines.map((l) => ({
    caemCode: l.caemCode,
    amountCents: l.amountCents,
    isEligible: l.isEligible,
    month: l.month ?? null,
  }));

  const engineAnexa3 = computeAnexa3(
    anexa3Lines,
    eng?.totalSalesCents ? { totalSalesOverride: eng.totalSalesCents } : undefined
  );

  const anexa4Lines = lines.map((l) => ({
    amountCents: l.amountCents,
    isEligible: l.isEligible,
    month: l.month ?? null,
  }));

  const engineAnexa4 = computeAnexa4(anexa4Lines, DEFAULT_SETTINGS);

  const consistency = eng
    ? checkConsistency(eng.totalSalesCents, engineAnexa3, engineAnexa4)
    : null;

  // December row for threshold banner (last month with cumulative data)
  const decRow = engineAnexa4.months[11];

  // ─── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell pageTitle="Anexa 4">
        <div
          className="flex items-center justify-center min-h-64"
          aria-label="Se încarcă Anexa 4"
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
        </div>
      </AppShell>
    );
  }

  if (error || !eng) {
    return (
      <AppShell pageTitle="Anexa 4 — Eroare">
        <div
          role="alert"
          className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-lg mx-4 mt-4"
        >
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-sm">{error ?? "Dosarul nu a fost găsit"}</span>
        </div>
      </AppShell>
    );
  }

  const { months, total, unallocated, thresholdEval } = engineAnexa4;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell pageTitle={`Anexa 4 — ${eng.residentName} ${eng.reportingYear}`}>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/app/fin/itpark/${eng.id}`)}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
            aria-label="Înapoi la dosar"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-foreground leading-tight">
              Anexa 4 — Raport lunar eligibilitate
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {eng.residentName} · {eng.reportingYear}
            </p>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          aria-label="Printează Anexa 4"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Printează</span>
        </button>
      </div>

      {/* ─── Print header ───────────────────────────────────────── */}
      <div className="hidden print:block px-4 mb-4 mt-2">
        <h2 className="text-xl font-bold text-center">ANEXA 4</h2>
        <p className="text-sm text-center text-gray-600">
          Raport lunar eligibilitate — {eng.residentName} — {eng.reportingYear}
        </p>
      </div>

      {/* ─── Banners ────────────────────────────────────────────── */}
      <div className="px-4 pt-4 space-y-3">
        {/* Consistency gate */}
        {consistency && <ConsistencyBanner result={consistency} />}

        {/* Threshold status */}
        {lines.length > 0 && (
          <ThresholdBanner
            thresholdPct={DEFAULT_SETTINGS.eligibilityThresholdPct}
            currentPct={decRow.cumTotalCents > 0 ? decRow.monthlySharePct : 0}
            risk={thresholdEval.risk}
            maxConsecutive={thresholdEval.maxConsecutiveBelowThreshold}
            toleranceMonths={DEFAULT_SETTINGS.toleranceMonths}
          />
        )}
      </div>

      {/* ─── Main table ─────────────────────────────────────────── */}
      <div className="px-4 pb-4 mt-4 print:px-0 overflow-x-auto">
        <table
          className="w-full text-sm border-collapse"
          aria-label={`Anexa 4 — raport lunar eligibilitate ${eng.reportingYear}`}
        >
          <thead className="sticky top-[57px] print:relative">
            <tr className="bg-muted/80 backdrop-blur border-b-2 border-border print:bg-gray-100 print:border-gray-300">
              {/* Col 1: Luna */}
              <th
                scope="col"
                className="px-3 py-2 text-xs font-semibold text-muted-foreground text-left border-r border-border print:border-gray-300 w-28"
              >
                Luna
              </th>
              {/* Col 2–3: Lunar */}
              <th
                scope="col"
                colSpan={2}
                className="px-3 py-2 text-xs font-semibold text-muted-foreground text-center border-r border-border print:border-gray-300"
              >
                Venituri lunare (MDL)
              </th>
              {/* Col 4–5: Cumulative */}
              <th
                scope="col"
                colSpan={2}
                className="px-3 py-2 text-xs font-semibold text-muted-foreground text-center border-r border-border print:border-gray-300"
              >
                Cumulative YTD (MDL)
              </th>
              {/* Col 6: Pondere cumulativă */}
              <th
                scope="col"
                className="px-3 py-2 text-xs font-semibold text-muted-foreground text-center"
              >
                Pondere cum. (%)
              </th>
            </tr>
            {/* Sub-header */}
            <tr className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground print:bg-gray-50 print:border-gray-200">
              <th scope="col" className="px-3 py-1.5 text-left border-r border-border print:border-gray-300" />
              <th scope="col" className="px-3 py-1.5 text-right border-r border-border print:border-gray-300 min-w-32">
                Eligibil
              </th>
              <th scope="col" className="px-3 py-1.5 text-right border-r border-border print:border-gray-300 min-w-32">
                Total
              </th>
              <th scope="col" className="px-3 py-1.5 text-right border-r border-border print:border-gray-300 min-w-36">
                Eligibil cum.
              </th>
              <th scope="col" className="px-3 py-1.5 text-right border-r border-border print:border-gray-300 min-w-36">
                Total cum.
              </th>
              <th scope="col" className="px-3 py-1.5 text-center min-w-24" />
            </tr>
          </thead>

          <tbody>
            {months.map((row) => {
              const hasData = row.totalCents > 0 || row.cumTotalCents > 0;
              return (
                <tr
                  key={row.month}
                  className={cn(
                    "border-b border-border last:border-0 print:border-gray-200",
                    !hasData && "opacity-60",
                    row.cumTotalCents > 0 && !row.conform
                      ? "bg-destructive/5 hover:bg-destructive/10"
                      : row.cumTotalCents > 0 && row.conform
                      ? "hover:bg-muted/30"
                      : "hover:bg-muted/20"
                  )}
                >
                  {/* Luna */}
                  <td className="px-3 py-2.5 text-sm font-medium text-foreground border-r border-border print:border-gray-200">
                    {MONTH_NAMES_RO[row.month]}
                  </td>

                  {/* Eligible lunar */}
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground border-r border-border print:border-gray-200">
                    {row.eligibleCents > 0 ? (
                      <span className="text-success font-medium">{fmtMDL(row.eligibleCents)}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>

                  {/* Total lunar */}
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground border-r border-border print:border-gray-200">
                    {row.totalCents > 0 ? (
                      fmtMDL(row.totalCents)
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>

                  {/* Cumulative eligible */}
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground border-r border-border print:border-gray-200">
                    {row.cumEligibleCents > 0 ? (
                      <span className="text-success">{fmtMDL(row.cumEligibleCents)}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>

                  {/* Cumulative total */}
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground border-r border-border print:border-gray-200">
                    {row.cumTotalCents > 0 ? (
                      fmtMDL(row.cumTotalCents)
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>

                  {/* Pondere cumulativă */}
                  <td className="px-3 py-2.5 text-center">
                    {row.cumTotalCents > 0 ? (
                      <div className="flex items-center justify-center gap-1.5">
                        {row.conform ? (
                          <CheckCircle2
                            className="w-3.5 h-3.5 text-success shrink-0"
                            aria-label="Conform"
                          />
                        ) : (
                          <XCircle
                            className="w-3.5 h-3.5 text-destructive shrink-0"
                            aria-label="Sub prag"
                          />
                        )}
                        <span
                          className={cn(
                            "tabular-nums text-sm font-semibold",
                            row.conform ? "text-success" : "text-destructive"
                          )}
                        >
                          {fmtPct(row.monthlySharePct)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* ─── Footer: Total row ───────────────────────────────── */}
          <tfoot>
            <tr className="bg-primary/5 border-t-2 border-primary/30 font-semibold print:bg-gray-100 print:border-gray-400">
              <td className="px-3 py-2.5 text-sm font-bold text-foreground border-r border-border print:border-gray-300">
                Total anual
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums border-r border-border print:border-gray-300">
                <span className="text-success font-bold">{fmtMDL(total.eligibleCents)}</span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums font-bold text-foreground border-r border-border print:border-gray-300">
                {fmtMDL(total.totalCents)}
              </td>
              <td className="px-3 py-2.5 border-r border-border print:border-gray-300" />
              <td className="px-3 py-2.5 border-r border-border print:border-gray-300" />
              <td className="px-3 py-2.5 text-center">
                <span
                  className={cn(
                    "tabular-nums text-sm font-bold",
                    total.annualSharePct >= DEFAULT_SETTINGS.eligibilityThresholdPct
                      ? "text-success"
                      : "text-destructive"
                  )}
                >
                  {fmtPct(total.annualSharePct)}
                </span>
              </td>
            </tr>

            {/* Unallocated info row (only if present) */}
            {unallocated.lineCount > 0 && (
              <tr className="bg-amber-50 dark:bg-amber-950/20 border-t border-amber-200 dark:border-amber-800">
                <td
                  colSpan={6}
                  className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" aria-hidden="true" />
                  {unallocated.lineCount} linie{unallocated.lineCount !== 1 ? "i" : ""} fără lună
                  atribuită (incluse în Total anual, nu în lunile individuale):
                  eligibil {fmtMDL(unallocated.eligibleCents)} MDL · total{" "}
                  {fmtMDL(unallocated.totalCents)} MDL
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {/* ─── Summary cards ──────────────────────────────────────── */}
      {lines.length > 0 && (
        <div className="px-4 pb-8 print:hidden">
          <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Linii venit</span>
              <span className="text-lg font-bold text-foreground tabular-nums">{lines.length}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Eligibil total</span>
              <span className="text-lg font-bold text-success tabular-nums">
                {fmtMDL(total.eligibleCents)} MDL
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Total vânzări (anual)</span>
              <span className="text-lg font-bold text-foreground tabular-nums">
                {fmtMDL(total.totalCents)} MDL
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Pondere anuală</span>
              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  total.annualSharePct >= DEFAULT_SETTINGS.eligibilityThresholdPct
                    ? "text-success"
                    : "text-destructive"
                )}
              >
                {fmtPct(total.annualSharePct)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Empty state ────────────────────────────────────────── */}
      {lines.length === 0 && (
        <div className="px-4 pb-8 flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" aria-hidden="true" />
          <h3 className="text-base font-medium text-foreground">Nicio linie de venit</h3>
          <p className="text-sm text-muted-foreground max-w-xs mt-1">
            Adăugați linii de venit din tab-ul Anexa 3 pentru a genera raportul lunar.
          </p>
          <a
            href={`#/app/fin/itpark/${eng.id}/anexa3`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
          >
            Mergi la Anexa 3
          </a>
        </div>
      )}

      {/* ─── Print styles ────────────────────────────────────────── */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:relative { position: relative !important; }
          .print\\:px-0 { padding-left: 0 !important; padding-right: 0 !important; }
          .print\\:bg-gray-100 { background-color: #f3f4f6 !important; }
          .print\\:bg-gray-50 { background-color: #f9fafb !important; }
          .print\\:border-gray-300 { border-color: #d1d5db !important; }
          .print\\:border-gray-200 { border-color: #e5e7eb !important; }
          .print\\:border-gray-400 { border-color: #9ca3af !important; }
        }
      `}</style>
    </AppShell>
  );
}
