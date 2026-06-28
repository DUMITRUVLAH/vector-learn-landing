/**
 * ITPARK-402: Anexa 3 — randare live tabel linii + subsol per-CAEM
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §3
 *
 * Structura:
 *   - Tabel cu 5 coloane (nr., client, documente, serviciu/CAEM, sumă)
 *   - Subsol: per-CAEM total+share, total eligibil, total vânzări (din engine)
 *   - max 96 linii fără probleme de performanță (virtualizare CSS, nu JS)
 *   - fmtMDL() din src/lib/itpark/anexa4.ts (format românesc 1.971.197,19)
 *
 * Fixture footer:
 *   62.02  → 98.000,00 MDL / 4,40%
 *   85.59  → 1.873.197,19 MDL / 84,08%
 *   Total eligibil → 1.971.197,19 MDL / 88,48%
 *   Total vânzări  → 2.227.917,19 MDL
 */

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Printer,
  AlertCircle,
  ChevronLeft,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import { getEngagement, type ItparkEngagement } from "@/lib/api/itparkEngagements";
import { listLines, type RevenueLine } from "@/lib/api/itparkLines";
import { computeAnexa3, type CaemBreakdown } from "@/lib/itpark/calc";
import { fmtMDL } from "@/lib/itpark/anexa4";
import { fmtPct } from "@/lib/itpark/calc";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_RO = [
  "", "Ian", "Feb", "Mar", "Apr", "Mai", "Iun",
  "Iul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─── Main page ────────────────────────────────────────────────────────────────

export function Anexa3Page() {
  const { path, navigate } = useRouter();

  // Extract engagementId from URL: /app/fin/itpark/:id/anexa3
  const engagementId = path.match(/^\/app\/fin\/itpark\/([^/]+)\/anexa3$/)?.[1] ?? "";

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

  // Compute Anexa 3 engine results — deterministic from revenue lines
  const engineResult = computeAnexa3(
    lines.map((l) => ({
      caemCode: l.caemCode,
      amountCents: l.amountCents,
      isEligible: l.isEligible,
      month: l.month ?? null,
    })),
    eng?.totalSalesCents
      ? { totalSalesOverride: eng.totalSalesCents }
      : undefined
  );

  // ─── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <BusinessShell pageTitle="Anexa 3">
        <div
          className="flex items-center justify-center min-h-64"
          aria-label="Se încarcă Anexa 3"
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
        </div>
      </BusinessShell>
    );
  }

  if (error || !eng) {
    return (
      <BusinessShell pageTitle="Anexa 3 — Eroare">
        <div
          role="alert"
          className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-lg mx-4 mt-4"
        >
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-sm">{error ?? "Dosarul nu a fost găsit"}</span>
        </div>
      </BusinessShell>
    );
  }

  const { byCode, totalEligibleCents, totalSalesCents, eligiblePct, lineCount } = engineResult;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <BusinessShell pageTitle={`Anexa 3 — ${eng.residentName} ${eng.reportingYear}`}>
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
              Anexa 3 — Lista veniturilor din vânzări
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {eng.residentName} · {eng.reportingYear} · {lineCount} linii
            </p>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          aria-label="Printează Anexa 3"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Printează</span>
        </button>
      </div>

      {/* ─── Print header ───────────────────────────────────────── */}
      <div className="hidden print:block px-4 mb-4 mt-2">
        <h2 className="text-xl font-bold text-center">ANEXA 3</h2>
        <p className="text-sm text-center text-gray-600">
          Lista veniturilor din vânzări — {eng.residentName} — {eng.reportingYear}
        </p>
      </div>

      {/* ─── Main table ─────────────────────────────────────────── */}
      <div className="px-4 pb-4 print:px-0 overflow-x-auto">
        <table
          className="w-full text-sm border-collapse"
          aria-label={`Anexa 3 — ${lineCount} linii de venit`}
        >
          <thead className="sticky top-[57px] print:relative">
            <tr className="bg-muted/80 backdrop-blur border-b border-border print:bg-gray-100 print:border-gray-300">
              <th className="px-2 py-2 text-xs font-semibold text-muted-foreground text-right w-10 border-r border-border print:border-gray-300">
                Nr.
              </th>
              <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-left border-r border-border print:border-gray-300 min-w-36">
                Client
              </th>
              <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-left border-r border-border print:border-gray-300 min-w-40">
                Referințe documente
              </th>
              <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-left border-r border-border print:border-gray-300 min-w-32">
                Serviciu / Cod CAEM
              </th>
              <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-right min-w-28">
                Sumă (MDL)
              </th>
            </tr>
          </thead>

          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground text-sm"
                >
                  Nicio linie de venit adăugată încă.
                  <br />
                  <a
                    href={`#/app/fin/itpark/${eng.id}`}
                    className="text-primary underline underline-offset-2 mt-1 inline-block"
                  >
                    Adăugați linii din dosar
                  </a>
                </td>
              </tr>
            ) : (
              lines.map((line, idx) => (
                <tr
                  key={line.id}
                  className={cn(
                    "border-b border-border last:border-0 print:border-gray-200",
                    line.isEligible
                      ? "bg-success/5 hover:bg-success/10"
                      : "hover:bg-muted/40"
                  )}
                >
                  {/* Col 1: Nr. */}
                  <td className="px-2 py-2 text-right text-muted-foreground text-xs tabular-nums border-r border-border print:border-gray-200">
                    {idx + 1}
                  </td>
                  {/* Col 2: Client */}
                  <td className="px-3 py-2 text-foreground border-r border-border print:border-gray-200">
                    <span className="font-medium">{line.clientName}</span>
                    {line.month != null && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({MONTHS_RO[line.month] || `L${line.month}`})
                      </span>
                    )}
                  </td>
                  {/* Col 3: Document refs */}
                  <td className="px-3 py-2 text-muted-foreground text-xs border-r border-border print:border-gray-200 max-w-48 truncate">
                    {line.documentRefs || "—"}
                  </td>
                  {/* Col 4: Serviciu + CAEM */}
                  <td className="px-3 py-2 border-r border-border print:border-gray-200">
                    <div className="flex items-start gap-1.5">
                      {line.isEligible ? (
                        <CheckCircle2
                          className="w-3.5 h-3.5 text-success shrink-0 mt-0.5"
                          aria-label="Eligibil"
                        />
                      ) : (
                        <XCircle
                          className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5"
                          aria-label="Neeligibil"
                        />
                      )}
                      <div>
                        <div className="text-xs font-mono font-semibold text-foreground">
                          {line.caemCode}
                        </div>
                        {line.serviceDescription && (
                          <div className="text-xs text-muted-foreground mt-0.5 max-w-36 truncate">
                            {line.serviceDescription}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  {/* Col 5: Sumă */}
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                    {fmtMDL(line.amountCents)}
                  </td>
                </tr>
              ))
            )}
          </tbody>

          {/* ─── Footer: per-CAEM breakdown + totals ────────────── */}
          {lines.length > 0 && (
            <tfoot>
              {/* Separator */}
              <tr className="bg-muted/30">
                <td
                  colSpan={5}
                  className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  Sumar pe coduri CAEM
                </td>
              </tr>

              {/* Per-CAEM rows */}
              {byCode.map((entry: CaemBreakdown) => (
                <tr
                  key={entry.code}
                  className={cn(
                    "border-b border-border print:border-gray-200",
                    entry.eligible
                      ? "bg-success/10 dark:bg-success/5"
                      : "bg-muted/20"
                  )}
                >
                  <td className="px-2 py-2 border-r border-border print:border-gray-200" />
                  <td
                    colSpan={3}
                    className="px-3 py-2 border-r border-border print:border-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      {entry.eligible ? (
                        <CheckCircle2
                          className="w-3.5 h-3.5 text-success shrink-0"
                          aria-label="Eligibil"
                        />
                      ) : (
                        <XCircle
                          className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                          aria-label="Neeligibil"
                        />
                      )}
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {entry.code}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        — {entry.sharePct}% din total vânzări
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                    {fmtMDL(entry.totalCents)}
                  </td>
                </tr>
              ))}

              {/* Total eligibil */}
              <tr className="bg-success/10 dark:bg-success/5 border-t-2 border-success/30">
                <td className="px-2 py-2 border-r border-border print:border-gray-200" />
                <td
                  colSpan={3}
                  className="px-3 py-2 border-r border-border print:border-gray-200"
                >
                  <span className="font-semibold text-success text-sm">
                    Total venituri eligibile IT Park
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({fmtPct(eligiblePct)} din total vânzări)
                  </span>
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums font-bold text-success text-sm"
                  aria-label={`Total eligibil: ${fmtMDL(totalEligibleCents)} MDL`}
                >
                  {fmtMDL(totalEligibleCents)}
                </td>
              </tr>

              {/* Total vânzări */}
              <tr className="bg-primary/5 dark:bg-primary/5 border-t border-primary/20">
                <td className="px-2 py-2 border-r border-border print:border-gray-200" />
                <td
                  colSpan={3}
                  className="px-3 py-2 border-r border-border print:border-gray-200"
                >
                  <span className="font-semibold text-foreground text-sm">
                    Total venituri din vânzări
                  </span>
                  {eng.totalSalesCents != null && eng.totalSalesCents > totalEligibleCents && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (incl. venituri suplimentare în afara Anexei 3)
                    </span>
                  )}
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums font-bold text-foreground text-sm"
                  aria-label={`Total vânzări: ${fmtMDL(totalSalesCents)} MDL`}
                >
                  {fmtMDL(totalSalesCents)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ─── Summary card ───────────────────────────────────────── */}
      {lines.length > 0 && (
        <div className="px-4 pb-8 print:hidden">
          <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Linii total</span>
              <span className="text-lg font-bold text-foreground tabular-nums">{lineCount}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Coduri CAEM</span>
              <span className="text-lg font-bold text-foreground tabular-nums">{byCode.length}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Eligibil</span>
              <span className="text-lg font-bold text-success tabular-nums">
                {fmtMDL(totalEligibleCents)} MDL
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Pondere eligibilă</span>
              <span
                className={cn(
                  "text-lg font-bold tabular-nums",
                  eligiblePct >= 70 ? "text-success" : "text-destructive"
                )}
              >
                {fmtPct(eligiblePct)}
              </span>
            </div>
          </div>
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
          .print\\:border-gray-300 { border-color: #d1d5db !important; }
          .print\\:border-gray-200 { border-color: #e5e7eb !important; }
        }
      `}</style>
    </BusinessShell>
  );
}
