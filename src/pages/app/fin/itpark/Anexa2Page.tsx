/**
 * ITPARK-401: Anexa 2 — randare live din engagement + motor computeAnexa3
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §3
 *
 * Structura Anexa 2 (rânduri 1–10):
 *   Rând 1:  Rezident (residentName, IDNO, nr. contract MITP)              ← engagement (read-only)
 *   Rând 2:  Adresă juridică                                               ← engagement (read-only)
 *   Rând 3:  Perioada de raportare (periodStart..periodEnd)                ← engagement (read-only)
 *   Rând 4:  Subdiviziuni                                                  ← engagement (read-only)
 *   Rând 5:  Plătitor TVA                                                  ← engagement (read-only)
 *   Rând 6:  Costuri subcontractori (MDL + %)                              ← EDITABIL
 *   Rând 7:  Total venituri din vânzări (= engine.totalSalesCents)         ← ENGINE, nu manual
 *   Rând 8:  Total venituri eligibile (= engine.totalEligibleCents)        ← ENGINE, nu manual
 *   Rând 9:  Venituri ajustate (MDL)                                       ← EDITABIL
 *   Rând 10: Procedura de informare angajați                               ← EDITABIL
 *
 * Fixture: row7=2.227.917,19 MDL, row8=1.971.197,19 MDL
 * Format: fmtMDL() din src/lib/itpark/anexa4.ts — românesc 1.971.197,19
 */

import { useState, useEffect, useCallback } from "react";
import { Loader2, Printer, AlertCircle, ChevronLeft } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import { getEngagement, updateEngagement, type ItparkEngagement } from "@/lib/api/itparkEngagements";
import { listLines, type RevenueLine } from "@/lib/api/itparkLines";
import { computeAnexa3 } from "@/lib/itpark/calc";
import { fmtMDL } from "@/lib/itpark/anexa4";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ro-MD");
  } catch {
    return iso;
  }
}

function fmtPeriod(start: string, end: string): string {
  return `${fmtDate(start)} — ${fmtDate(end)}`;
}

// ─── Row component ────────────────────────────────────────────────────────────

interface RowProps {
  no: number;
  label: string;
  value: React.ReactNode;
  source?: "engine" | "editable" | "data";
  className?: string;
}

function Anexa2Row({ no, label, value, source = "data", className }: RowProps) {
  const sourceColors: Record<string, string> = {
    engine:
      "bg-success/10 text-success border-success/20 dark:bg-success/5",
    editable:
      "bg-primary/5 text-primary border-primary/20 dark:bg-primary/5",
    data: "",
  };

  return (
    <tr
      className={cn(
        "border-b border-border last:border-0 print:border-gray-300",
        className
      )}
    >
      <td className="px-3 py-2.5 text-sm font-medium text-muted-foreground w-12 text-center border-r border-border print:border-gray-300">
        {no}
      </td>
      <td className="px-3 py-2.5 text-sm text-foreground border-r border-border print:border-gray-300">
        {label}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-sm font-medium min-w-48",
          source === "engine" && "text-success font-semibold",
          source === "editable" && "text-primary"
        )}
      >
        <span className={cn("rounded px-1.5 py-0.5", sourceColors[source])}>
          {value}
        </span>
        {source === "engine" && (
          <span className="ml-2 text-xs text-muted-foreground font-normal">(calcul)</span>
        )}
        {source === "editable" && (
          <span className="ml-2 text-xs text-muted-foreground font-normal">(editabil)</span>
        )}
      </td>
    </tr>
  );
}

// ─── Editable field ───────────────────────────────────────────────────────────

interface EditableFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number";
  placeholder?: string;
}

function EditableField({ label, value, onChange, type = "text", placeholder }: EditableFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        className="border border-input rounded-md px-2.5 py-1.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Anexa2Page() {
  const { path, navigate } = useRouter();

  // Extract engagementId from URL: /app/fin/itpark/:id/anexa2
  const engagementId = path.match(/^\/app\/fin\/itpark\/([^/]+)\/anexa2$/)?.[1] ?? "";

  const [eng, setEng] = useState<ItparkEngagement | null>(null);
  const [lines, setLines] = useState<RevenueLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Editable fields (rândul 6, 9, 10)
  const [subcontractorCents, setSubcontractorCents] = useState("");
  const [subcontractorPct, setSubcontractorPct] = useState("");
  const [adjustedRevenueCents, setAdjustedRevenueCents] = useState("");
  const [employeeInfoProcedure, setEmployeeInfoProcedure] = useState("");

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
      setSubcontractorCents(String(engData.subcontractorCostsCents ?? 0));
      setSubcontractorPct(engData.subcontractorCostsPct ?? "");
      setAdjustedRevenueCents(String(engData.adjustedRevenueCents ?? 0));
      setEmployeeInfoProcedure(engData.employeeInfoProcedure ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    load();
  }, [load]);

  // Compute Anexa 3 engine results (rows 7 & 8) — DETERMINISTIC, never manual
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

  const handleSave = async () => {
    if (!eng) return;
    try {
      setSaving(true);
      setSaveError(null);
      const updated = await updateEngagement(eng.id, {
        ...eng,
        subcontractorCostsCents: parseInt(subcontractorCents, 10) || 0,
        subcontractorCostsPct: subcontractorPct || null,
        adjustedRevenueCents: parseInt(adjustedRevenueCents, 10) || 0,
        employeeInfoProcedure: employeeInfoProcedure || null,
      });
      setEng(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => window.print();

  // ─── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <BusinessShell pageTitle="Anexa 2">
        <div className="flex items-center justify-center min-h-64" aria-label="Se încarcă Anexa 2">
          <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
        </div>
      </BusinessShell>
    );
  }

  if (error || !eng) {
    return (
      <BusinessShell pageTitle="Anexa 2 — Eroare">
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

  const r7Cents = engineResult.totalSalesCents;
  const r8Cents = engineResult.totalEligibleCents;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <BusinessShell pageTitle={`Anexa 2 — ${eng.residentName} ${eng.reportingYear}`}>
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
              Anexa 2 — Informații generale
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {eng.residentName} · {eng.reportingYear}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saveError && (
            <span className="text-xs text-destructive" role="alert">
              {saveError}
            </span>
          )}
          {saved && (
            <span className="text-xs text-success" role="status">
              Salvat
            </span>
          )}
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            aria-label="Printează Anexa 2"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Printează</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            aria-label="Salvează câmpurile editabile"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Salvează
          </button>
        </div>
      </div>

      {/* ─── Editable fields panel (rows 6, 9, 10) ──────────────── */}
      <div className="px-4 py-4 print:hidden">
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <p className="text-sm font-medium text-foreground">Câmpuri editabile</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <EditableField
              label="Rând 6 — Costuri subcontractori (cents MDL)"
              value={subcontractorCents}
              onChange={setSubcontractorCents}
              type="number"
              placeholder="ex. 5000000"
            />
            <EditableField
              label="Rând 6 — Ponderea costurilor (%)"
              value={subcontractorPct}
              onChange={setSubcontractorPct}
              type="text"
              placeholder="ex. 2.50"
            />
            <EditableField
              label="Rând 9 — Venituri ajustate (cents MDL)"
              value={adjustedRevenueCents}
              onChange={setAdjustedRevenueCents}
              type="number"
              placeholder="ex. 0"
            />
            <EditableField
              label="Rând 10 — Procedura de informare angajați"
              value={employeeInfoProcedure}
              onChange={setEmployeeInfoProcedure}
              placeholder="ex. Aviz intern nr. ..."
            />
          </div>
        </div>
      </div>

      {/* ─── Anexa 2 table ───────────────────────────────────────── */}
      <div className="px-4 pb-8 print:px-0 print:pb-4">
        {/* Print header */}
        <div className="hidden print:block mb-6">
          <h2 className="text-xl font-bold text-center">ANEXA 2</h2>
          <p className="text-sm text-center text-gray-600">
            Informații privind activitatea rezidentului în perioada de audit
          </p>
        </div>

        <div className="rounded-lg border border-border overflow-hidden bg-card print:border-gray-300 print:rounded-none">
          <table className="w-full text-sm" aria-label="Anexa 2 — Informații generale dosar">
            <thead>
              <tr className="bg-muted/50 border-b border-border print:bg-gray-50 print:border-gray-300">
                <th className="px-3 py-2 text-xs font-semibold text-muted-foreground w-12 text-center border-r border-border print:border-gray-300">
                  Nr.
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-left border-r border-border print:border-gray-300">
                  Indicator
                </th>
                <th className="px-3 py-2 text-xs font-semibold text-muted-foreground text-left">
                  Valoare
                </th>
              </tr>
            </thead>
            <tbody>
              <Anexa2Row
                no={1}
                label="Rezident IT Park (denumire, IDNO, contract MITP)"
                value={
                  <span>
                    {eng.residentName}
                    <span className="text-muted-foreground font-normal ml-2">
                      IDNO: {eng.idno}
                    </span>
                    {eng.mitpContractNo && (
                      <span className="text-muted-foreground font-normal ml-2">
                        · Contract nr. {eng.mitpContractNo}
                        {eng.mitpContractDate ? ` din ${fmtDate(eng.mitpContractDate)}` : ""}
                      </span>
                    )}
                  </span>
                }
              />

              <Anexa2Row
                no={2}
                label="Adresă juridică"
                value={eng.legalAddress ?? <span className="text-muted-foreground italic">necompletată</span>}
              />

              <Anexa2Row
                no={3}
                label="Perioada de raportare"
                value={fmtPeriod(eng.periodStart, eng.periodEnd)}
              />

              <Anexa2Row
                no={4}
                label="Adresele subdiviziunilor (dacă există)"
                value={
                  eng.subdivisionAddresses
                    ? eng.subdivisionAddresses
                    : <span className="text-muted-foreground italic">fără subdiviziuni</span>
                }
              />

              <Anexa2Row
                no={5}
                label="Plătitor de TVA"
                value={eng.vatPayer ? "DA" : "NU"}
              />

              <Anexa2Row
                no={6}
                label="Costul serviciilor subcontractate din străinătate (MDL / %)"
                source="editable"
                value={
                  <span>
                    {fmtMDL(parseInt(subcontractorCents, 10) || 0)} MDL
                    {subcontractorPct
                      ? <span className="ml-2 text-muted-foreground">({subcontractorPct}%)</span>
                      : null}
                  </span>
                }
              />

              {/* Row 7 — totalSalesCents from ENGINE */}
              <Anexa2Row
                no={7}
                label="Total venituri din vânzări (MDL)"
                source="engine"
                value={
                  <span>
                    {fmtMDL(r7Cents)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">MDL</span>
                  </span>
                }
              />

              {/* Row 8 — totalEligibleCents from ENGINE */}
              <Anexa2Row
                no={8}
                label="Total venituri eligibile IT Park (MDL)"
                source="engine"
                value={
                  <span>
                    {fmtMDL(r8Cents)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">MDL</span>
                    <span className="ml-2 text-xs font-normal">
                      ({engineResult.eligiblePct}%)
                    </span>
                  </span>
                }
              />

              <Anexa2Row
                no={9}
                label="Venituri ajustate (MDL)"
                source="editable"
                value={
                  <span>
                    {fmtMDL(parseInt(adjustedRevenueCents, 10) || 0)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">MDL</span>
                  </span>
                }
              />

              <Anexa2Row
                no={10}
                label="Procedura de informare a angajaților"
                source="editable"
                value={
                  employeeInfoProcedure || (
                    <span className="text-muted-foreground italic">necompletată</span>
                  )
                }
              />
            </tbody>
          </table>
        </div>

        {/* Engine note */}
        <p className="mt-3 text-xs text-muted-foreground print:hidden">
          Rândurile 7 și 8 sunt calculate automat din{" "}
          <strong>{lines.length}</strong> linii de venit (Anexa 3). Ele nu se editează manual.
        </p>
      </div>

      {/* ─── Print styles ────────────────────────────────────────── */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:px-0 { padding-left: 0 !important; padding-right: 0 !important; }
          .print\\:pb-4 { padding-bottom: 1rem !important; }
          .print\\:rounded-none { border-radius: 0 !important; }
          .print\\:bg-gray-50 { background-color: #f9fafb !important; }
          .print\\:border-gray-300 { border-color: #d1d5db !important; }
        }
      `}</style>
    </BusinessShell>
  );
}
