/**
 * FISC-003: Pagina /app/fin/tax — lista perioade fiscale + acțiuni declarații
 *
 * Funcționalitate:
 *   - Listare perioade fiscale cu declarațiile asociate
 *   - Per declarație: status badge (draft/ready/filed), buton Download PDF,
 *     buton Download CSV, buton „Marchează depusă"
 *   - Creare perioadă nouă (modal simplu)
 *   - Buton „Calculează" pentru a calcula TVA + impozit venit
 *
 * Design: design-system tokens (bg-background, text-foreground, bg-muted, etc.)
 * Light + dark mode, WCAG AA, fără culori hex hardcodate.
 */

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import {
  FileText,
  Download,
  CheckCircle,
  AlertCircle,
  Clock,
  Plus,
  RefreshCw,
  Calendar,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaxDeclaration {
  id: string;
  declarationType: "tva12_md" | "d394_ro" | "d301_ro" | "income_md";
  status: "draft" | "ready" | "filed";
  filedAt: string | null;
  notes: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface TaxPeriod {
  id: string;
  periodType: "monthly" | "quarterly" | "annual";
  year: number;
  month: number | null;
  quarter: number | null;
  startDate: string;
  endDate: string;
  status: "open" | "locked" | "filed";
  declarations: TaxDeclaration[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = [
  "", "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];

function periodLabel(p: TaxPeriod): string {
  if (p.periodType === "monthly" && p.month) return `${MONTHS[p.month]} ${p.year}`;
  if (p.periodType === "quarterly" && p.quarter) return `T${p.quarter} ${p.year}`;
  return `${p.year}`;
}

const DECLARATION_TYPE_LABELS: Record<string, string> = {
  tva12_md: "TVA12 (MD)",
  d394_ro: "D394 (RO)",
  d301_ro: "D301 (RO)",
  income_md: "Impozit venit (MD)",
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TaxDeclaration["status"] }) {
  if (status === "filed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="w-3 h-3" aria-hidden="true" />
        Depusă
      </span>
    );
  }
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        <Clock className="w-3 h-3" aria-hidden="true" />
        Gata
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
      <AlertCircle className="w-3 h-3" aria-hidden="true" />
      Ciornă
    </span>
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Eroare necunoscută" }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Declaration row ─────────────────────────────────────────────────────────

interface DeclRowProps {
  decl: TaxDeclaration;
  periodId: string;
  onRefresh: () => void;
}

function DeclarationRow({ decl, periodId, onRefresh }: DeclRowProps) {
  const [downloading, setDownloading] = useState<"pdf" | "csv" | null>(null);
  const [filing, setFiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPayload = decl.payload && Object.keys(decl.payload).length > 0;

  async function handleDownload(format: "pdf" | "csv") {
    setDownloading(format);
    setError(null);
    try {
      const res = await fetch(
        `/api/fin/tax/declarations/${decl.id}/export?format=${format}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const ext = format === "pdf" ? "pdf" : "csv";
      downloadBlob(blob, `${decl.declarationType}-${decl.id.slice(0, 8)}.${ext}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  async function handleFile() {
    setFiling(true);
    setError(null);
    try {
      await apiFetch(`/api/fin/tax/declarations/${decl.id}/file`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFiling(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {DECLARATION_TYPE_LABELS[decl.declarationType] ?? decl.declarationType}
          </p>
          {decl.filedAt && (
            <p className="text-xs text-muted-foreground">
              Depusă: {new Date(decl.filedAt).toLocaleDateString("ro-RO")}
            </p>
          )}
        </div>
      </div>

      <StatusBadge status={decl.status} />

      <div className="flex items-center gap-2 shrink-0">
        {/* Download PDF */}
        <button
          onClick={() => handleDownload("pdf")}
          disabled={!hasPayload || downloading === "pdf"}
          title={hasPayload ? "Descarcă PDF" : "Calculează mai întâi"}
          aria-label={`Descarcă PDF pentru ${DECLARATION_TYPE_LABELS[decl.declarationType]}`}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors",
            "border border-border bg-background hover:bg-muted",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          <Download className="w-3 h-3" aria-hidden="true" />
          {downloading === "pdf" ? "..." : "PDF"}
        </button>

        {/* Download CSV */}
        <button
          onClick={() => handleDownload("csv")}
          disabled={!hasPayload || downloading === "csv"}
          title={hasPayload ? "Descarcă CSV" : "Calculează mai întâi"}
          aria-label={`Descarcă CSV pentru ${DECLARATION_TYPE_LABELS[decl.declarationType]}`}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors",
            "border border-border bg-background hover:bg-muted",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          <Download className="w-3 h-3" aria-hidden="true" />
          {downloading === "csv" ? "..." : "CSV"}
        </button>

        {/* Marchează depusă */}
        {decl.status !== "filed" && (
          <button
            onClick={handleFile}
            disabled={filing || !hasPayload}
            title={hasPayload ? "Marchează ca depusă" : "Calculează mai întâi"}
            aria-label={`Marchează ${DECLARATION_TYPE_LABELS[decl.declarationType]} ca depusă`}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            <CheckCircle className="w-3 h-3" aria-hidden="true" />
            {filing ? "..." : "Depusă"}
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive w-full" role="alert">{error}</p>
      )}
    </div>
  );
}

// ─── Period card ──────────────────────────────────────────────────────────────

interface PeriodCardProps {
  period: TaxPeriod;
  onRefresh: () => void;
}

function PeriodCard({ period, onRefresh }: PeriodCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  const DECLARATION_TYPES = ["tva12_md", "d394_ro"] as const;

  async function handleCalculate(declType: string) {
    setCalculating(true);
    setCalcError(null);
    try {
      await apiFetch(`/api/fin/tax/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId: period.id,
          declarationType: declType,
          jurisdiction: declType.endsWith("_md") ? "MD" : "RO",
        }),
      });
      onRefresh();
    } catch (e) {
      setCalcError((e as Error).message);
    } finally {
      setCalculating(false);
    }
  }

  const periodStatusLabel: Record<TaxPeriod["status"], string> = {
    open: "Deschisă",
    locked: "Blocată",
    filed: "Depusă",
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-foreground">{periodLabel(period)}</h3>
            <p className="text-xs text-muted-foreground">
              {period.startDate} — {period.endDate} · {periodStatusLabel[period.status]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {period.declarations.length} declaraț{period.declarations.length === 1 ? "ie" : "ii"}
          </span>
          {expanded
            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          {/* Calculează */}
          <div className="flex flex-wrap gap-2 mb-2">
            {DECLARATION_TYPES.map((dt) => (
              <button
                key={dt}
                onClick={() => handleCalculate(dt)}
                disabled={calculating}
                aria-label={`Calculează ${DECLARATION_TYPE_LABELS[dt]} pentru ${periodLabel(period)}`}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
                  "border border-dashed border-primary/50 text-primary hover:bg-primary/10",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                <RefreshCw className={cn("w-3 h-3", calculating && "animate-spin")} aria-hidden="true" />
                {calculating ? "Calculează..." : `Calculează ${DECLARATION_TYPE_LABELS[dt]}`}
              </button>
            ))}
          </div>

          {calcError && (
            <p className="text-xs text-destructive" role="alert">{calcError}</p>
          )}

          {/* Declarații existente */}
          {period.declarations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Nicio declarație calculată. Apăsați „Calculează" mai sus.
            </p>
          ) : (
            <div className="space-y-2">
              {period.declarations.map((decl) => (
                <DeclarationRow
                  key={decl.id}
                  decl={decl}
                  periodId={period.id}
                  onRefresh={onRefresh}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create period modal ──────────────────────────────────────────────────────

interface CreatePeriodModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreatePeriodModal({ onClose, onCreated }: CreatePeriodModalProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [periodType, setPeriodType] = useState<"monthly" | "quarterly" | "annual">("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function computeDates(): { startDate: string; endDate: string; quarter?: number } {
    if (periodType === "monthly") {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0); // last day of month
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
    }
    if (periodType === "quarterly") {
      const q = Math.ceil(month / 3);
      const startMonth = (q - 1) * 3;
      const start = new Date(year, startMonth, 1);
      const end = new Date(year, startMonth + 3, 0);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        quarter: q,
      };
    }
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    };
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);
    const { startDate, endDate, quarter } = computeDates();
    try {
      await apiFetch("/api/fin/tax/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodType,
          year,
          month: periodType === "monthly" ? month : null,
          quarter: quarter ?? null,
          startDate,
          endDate,
        }),
      });
      onCreated();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-period-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
    >
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 id="create-period-title" className="text-lg font-semibold text-foreground">
          Adaugă perioadă fiscală
        </h2>

        {/* Tip perioadă */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="period-type">
            Tip perioadă
          </label>
          <select
            id="period-type"
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as typeof periodType)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="monthly">Lunar</option>
            <option value="quarterly">Trimestrial</option>
            <option value="annual">Anual</option>
          </select>
        </div>

        {/* An */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="period-year">
            An
          </label>
          <input
            id="period-year"
            type="number"
            min={2020}
            max={2030}
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Lună (doar pentru monthly/quarterly) */}
        {periodType !== "annual" && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="period-month">
              {periodType === "monthly" ? "Lună" : "Lună de start trimestru"}
            </label>
            <select
              id="period-month"
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{MONTHS[i + 1]}</option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted transition-colors"
          >
            Anulează
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Se creează..." : "Creează"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TaxPage() {
  const [periods, setPeriods] = useState<TaxPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ periods: TaxPeriod[] }>("/api/fin/tax/periods");
      setPeriods(data.periods);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell
      pageTitle="FinDesk — Declarații fiscale"
      pageDescription="Perioade fiscale, calcul TVA + impozit venit, export PDF/CSV"
      actions={
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          aria-label="Adaugă perioadă fiscală nouă"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Perioadă nouă
        </button>
      }
    >
      {showCreate && (
        <CreatePeriodModal
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center py-16" role="status" aria-label="Se încarcă...">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {!loading && !error && periods.length === 0 && (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-foreground mb-1">
            Nicio perioadă fiscală
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Creați prima perioadă fiscală pentru a genera declarații TVA.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Adaugă perioadă
          </button>
        </div>
      )}

      {!loading && !error && periods.length > 0 && (
        <div className="space-y-4">
          {periods.map((period) => (
            <PeriodCard key={period.id} period={period} onRefresh={load} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

export default TaxPage;
