/**
 * PAY-008: AccountingPage — export contabilitate SAGA/1C + configurare conturi.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Download,
  BarChart3,
  Settings,
  FileDown,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  downloadAccountingExport,
  getAccountingSummary,
  type AccountingFormat,
  type AccountingSummary,
} from "@/lib/api/accounting";
import { AccountingMappingsForm } from "@/components/settings/AccountingMappingsForm";
import { cn } from "@/lib/utils";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

type Tab = "export" | "settings";

export function AccountingPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("export");

  // Export form state
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [format, setFormat] = useState<AccountingFormat>("saga");
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const fetchSummary = useCallback(async () => {
    if (!month) return;
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const data = await getAccountingSummary(month);
      setSummary(data);
    } catch {
      setSummaryError("Nu pot încărca sumarul pentru luna selectată.");
      setSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }, [month]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const handleDownload = () => {
    setDownloading(true);
    downloadAccountingExport(month, format);
    setTimeout(() => setDownloading(false), 1500);
  };

  return (
    <AppShell
      pageTitle="Export Contabilitate"
      pageDescription="Generează CSV SAGA/1C pentru import direct în software-ul de contabilitate"
    >
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <TabButton active={activeTab === "export"} onClick={() => setActiveTab("export")}>
          <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
          Export CSV
        </TabButton>
        <TabButton active={activeTab === "settings"} onClick={() => setActiveTab("settings")}>
          <Settings className="h-3.5 w-3.5" aria-hidden="true" />
          Conturi contabile
        </TabButton>
      </div>

      {activeTab === "export" && (
        <div className="space-y-6 max-w-2xl">
          {/* Export options */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold">Configurare export</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Month picker */}
              <div>
                <label htmlFor="accounting-month" className="block text-xs font-semibold mb-1.5">
                  Luna
                </label>
                <input
                  id="accounting-month"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {/* Format picker */}
              <div>
                <label htmlFor="accounting-format" className="block text-xs font-semibold mb-1.5">
                  Format
                </label>
                <select
                  id="accounting-format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as AccountingFormat)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="saga">SAGA (CSV, UTF-8 BOM, Excel RO)</option>
                  <option value="1c">1C / Mentor Contabil (tab-separated)</option>
                </select>
              </div>
            </div>

            {/* Format description */}
            <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 text-[11px] text-muted-foreground">
              {format === "saga" ? (
                <span>
                  Format SAGA: coloane <code className="font-mono">data, tip, articol_contabil, descriere, suma, moneda, nr_document, partener, tva</code>. PL = plată, NC = refund, DP = salariu.
                </span>
              ) : (
                <span>
                  Format 1C / Mentor: tab-separated, coloane <code className="font-mono">Дата, Документ, Контрагент, Сумма, Валюта, Примечание</code>. Fără BOM.
                </span>
              )}
            </div>
          </div>

          {/* Summary preview */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Preview lună {month}
            </h2>

            {loadingSummary ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Se încarcă sumarul…
              </div>
            ) : summaryError ? (
              <p className="text-sm text-destructive">{summaryError}</p>
            ) : summary ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <SummaryCard label="Încasări" value={formatCurrency(summary.income)} cls="pastel-mint" />
                <SummaryCard label="Rambursări" value={formatCurrency(summary.refunds)} cls="pastel-peach" negative />
                <SummaryCard label="Salarii plătite" value={formatCurrency(summary.payouts)} cls="pastel-lavender" negative />
                <SummaryCard label="Net" value={formatCurrency(summary.net)} cls="pastel-sky" />
                <div className="sm:col-span-2 rounded-xl border border-border bg-muted/20 px-4 py-3 text-center text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{summary.transactions_count}</span> tranzacții vor fi incluse în export
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Selectează o lună pentru preview.</p>
            )}
          </div>

          {/* Download button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!month || downloading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              {downloading ? "Se descarcă…" : `Descarcă ${format.toUpperCase()} CSV`}
            </button>
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="max-w-2xl">
          <AccountingMappingsForm />
        </div>
      )}
    </AppShell>
  );
}

// ──────────────────────────────────────────────
// Tab button
// ──────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────
// Summary card
// ──────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  cls,
  negative,
}: {
  label: string;
  value: string;
  cls: string;
  negative?: boolean;
}) {
  return (
    <article className={cn("rounded-xl border border-border p-4", cls)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60 mb-1">
        {label}
      </p>
      <p className={cn("text-xl font-bold tabular-nums", negative && "text-destructive")}>
        {negative && value !== "0 RON" ? `-${value}` : value}
      </p>
    </article>
  );
}
