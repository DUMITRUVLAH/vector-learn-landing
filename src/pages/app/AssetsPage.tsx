/**
 * ASSET-003 (FIN): FinDesk — Registru Active Fixe
 *
 * Pagina /app/fin/assets:
 * - Tabel active fixe cu filtrare după status
 * - Dialog creare activ nou
 * - Dialog calcul amortizare lunară + confirmare per activ
 * - Dialog casare activ
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  AlertTriangle,
  Calculator,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listAssets,
  createAsset,
  depreciateAssets,
  confirmDepreciation,
  scrapAsset,
  type FinAsset,
  type AssetStatus,
  type DepreciateResult,
  type CreateAssetData,
} from "@/lib/api/finAssets";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "MDL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(date: string): string {
  try {
    return new Intl.DateTimeFormat("ro-RO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(date));
  } catch {
    return date;
  }
}

// ─── Status labels + badges ───────────────────────────────────────────────────

const STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Activ",
  fully_depreciated: "Amortizat complet",
  sold: "Vândut",
  scrapped: "Casat",
};

const STATUS_BADGE: Record<AssetStatus, string> = {
  active: "bg-success/10 text-success",
  fully_depreciated: "bg-muted text-muted-foreground",
  sold: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  scrapped: "bg-destructive/10 text-destructive",
};

const FILTER_OPTIONS: { label: string; value: AssetStatus | "all" }[] = [
  { label: "Toate", value: "all" },
  { label: "Activ", value: "active" },
  { label: "Amortizat complet", value: "fully_depreciated" },
  { label: "Vândut", value: "sold" },
  { label: "Casat", value: "scrapped" },
];

// ─── Dialog: Activ nou ────────────────────────────────────────────────────────

interface NewAssetDialogProps {
  onClose: () => void;
  onCreated: (asset: FinAsset) => void;
}

function NewAssetDialog({ onClose, onCreated }: NewAssetDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    category: "",
    acquisitionDate: "",
    acquisitionCostMDL: "",
    residualValueMDL: "0",
    usefulLifeMonths: "36",
    depreciationMethod: "linear" as "linear" | "declining_balance",
    notes: "",
  });

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.acquisitionDate || !form.acquisitionCostMDL) {
      setError("Completați câmpurile obligatorii: Denumire, Data achiziției, Valoare.");
      return;
    }
    const costCents = Math.round(parseFloat(form.acquisitionCostMDL) * 100);
    const residualCents = Math.round(parseFloat(form.residualValueMDL || "0") * 100);
    if (isNaN(costCents) || costCents < 0) {
      setError("Valoarea de intrare trebuie să fie un număr pozitiv.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data: CreateAssetData = {
        name: form.name,
        category: form.category || null,
        acquisitionDate: form.acquisitionDate,
        acquisitionCostCents: costCents,
        residualValueCents: residualCents,
        usefulLifeMonths: parseInt(form.usefulLifeMonths, 10),
        depreciationMethod: form.depreciationMethod,
        notes: form.notes || null,
      };
      const { asset } = await createAsset(data);
      onCreated(asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la salvare.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-background shadow-xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Activ fix nou</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Închide dialog"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="new-asset-name">
                Denumire <span className="text-destructive">*</span>
              </label>
              <input
                id="new-asset-name"
                name="name"
                type="text"
                required
                value={form.name}
                onChange={handleChange}
                placeholder="ex: Laptop Dell Latitude"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="new-asset-category">
                Categorie
              </label>
              <input
                id="new-asset-category"
                name="category"
                type="text"
                value={form.category}
                onChange={handleChange}
                placeholder="ex: IT, Mobilier, Transport"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="new-asset-date">
                Data achiziției <span className="text-destructive">*</span>
              </label>
              <input
                id="new-asset-date"
                name="acquisitionDate"
                type="date"
                required
                value={form.acquisitionDate}
                onChange={handleChange}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="new-asset-cost">
                Valoare intrare (MDL) <span className="text-destructive">*</span>
              </label>
              <input
                id="new-asset-cost"
                name="acquisitionCostMDL"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.acquisitionCostMDL}
                onChange={handleChange}
                placeholder="ex: 12000"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="new-asset-residual">
                Valoare reziduală (MDL)
              </label>
              <input
                id="new-asset-residual"
                name="residualValueMDL"
                type="number"
                min="0"
                step="0.01"
                value={form.residualValueMDL}
                onChange={handleChange}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="new-asset-life">
                Durată utilă (luni)
              </label>
              <input
                id="new-asset-life"
                name="usefulLifeMonths"
                type="number"
                min="1"
                max="600"
                value={form.usefulLifeMonths}
                onChange={handleChange}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="new-asset-method">
                Metodă amortizare
              </label>
              <select
                id="new-asset-method"
                name="depreciationMethod"
                value={form.depreciationMethod}
                onChange={handleChange}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="linear">Liniar</option>
                <option value="declining_balance">Degresiv</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="new-asset-notes">
                Note
              </label>
              <textarea
                id="new-asset-notes"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={2}
                placeholder="Observații suplimentare..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors min-h-[44px]"
            >
              Anulare
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvează activ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Dialog: Calcul amortizare ────────────────────────────────────────────────

interface DepreciateDialogProps {
  onClose: () => void;
  onDone: () => void;
}

function DepreciateDialog({ onClose, onDone }: DepreciateDialogProps) {
  const [periodMonth, setPeriodMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [calculating, setCalculating] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [results, setResults] = useState<DepreciateResult[] | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function handleCalculate() {
    setCalculating(true);
    setError(null);
    setResults(null);
    setConfirmed(new Set());
    try {
      const res = await depreciateAssets(periodMonth);
      setResults(res.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la calcul.");
    } finally {
      setCalculating(false);
    }
  }

  async function handleConfirm(assetId: string) {
    setConfirming(assetId);
    setError(null);
    try {
      await confirmDepreciation(assetId, periodMonth);
      setConfirmed((prev) => new Set(prev).add(assetId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la confirmare.");
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-background shadow-xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Calcul amortizare lunară</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Închide dialog"
          >
            ✕
          </button>
        </div>
        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-foreground mb-1" htmlFor="depreciate-period">
                Luna de amortizat (YYYY-MM)
              </label>
              <input
                id="depreciate-period"
                type="month"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              onClick={handleCalculate}
              disabled={calculating || !periodMonth}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              {calculating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              Calculează
            </button>
          </div>

          {results !== null && (
            <>
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Niciun activ activ de amortizat.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Activ</th>
                        <th className="px-4 py-3 text-right font-medium">Amortizare</th>
                        <th className="px-4 py-3 text-right font-medium">Valoare netă</th>
                        <th className="px-4 py-3 text-center font-medium">Confirmat</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {results.map((entry) => {
                        const isDone = confirmed.has(entry.assetId);
                        return (
                          <tr key={entry.assetId} className={cn("transition-colors", isDone && "bg-success/5")}>
                            <td className="px-4 py-3 text-foreground font-medium">
                              {entry.assetName}
                              {entry.isFullyDepreciated && (
                                <span className="ml-2 text-xs text-muted-foreground">(amortizat complet)</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-foreground">
                              {formatMDL(entry.depreciationCents)}
                            </td>
                            <td className="px-4 py-3 text-right text-foreground">
                              {formatMDL(entry.bookValueCents)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isDone && (
                                <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {!isDone && (
                                <button
                                  onClick={() => handleConfirm(entry.assetId)}
                                  disabled={confirming === entry.assetId}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors min-h-[36px]"
                                >
                                  {confirming === entry.assetId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : null}
                                  Confirmă
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={onDone}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors min-h-[44px]"
            >
              Închide
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dialog: Confirmare casare ────────────────────────────────────────────────

interface ScrapDialogProps {
  asset: FinAsset;
  onClose: () => void;
  onScrapped: () => void;
}

function ScrapDialog({ asset, onClose, onScrapped }: ScrapDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await scrapAsset(asset.id);
      onScrapped();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la casare.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-background shadow-xl border border-border">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-destructive/10 p-2">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Casare activ</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Ești sigur că vrei să casezi activul{" "}
            <strong className="text-foreground">{asset.name}</strong>?
            Această acțiune marchează activul ca „Casat" și nu poate fi anulată automat.
          </p>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors min-h-[44px]"
            >
              Anulare
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Casează activul
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AssetsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [assets, setAssets] = useState<FinAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AssetStatus | "all">("all");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Dialogs
  const [showNew, setShowNew] = useState(false);
  const [showDepreciate, setShowDepreciate] = useState(false);
  const [scrapTarget, setScrapTarget] = useState<FinAsset | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
    }
  }, [sessionStatus, navigate]);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filter !== "all" ? { status: filter as AssetStatus } : undefined;
      const { assets: data } = await listAssets(params);
      setAssets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      loadAssets();
    }
  }, [sessionStatus, loadAssets]);

  // ─── Computed stats ───────────────────────────────────────────────────────

  const totalCost = assets.reduce((s, a) => s + a.acquisitionCostCents, 0);
  const totalNetValue = assets.reduce(
    (s, a) => s + (a.currentBookValueCents ?? a.acquisitionCostCents),
    0
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (sessionStatus === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppShell
      pageTitle="Active Fixe"
      pageDescription="Registrul activelor fixe — amortizare și casare"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDepreciate(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors min-h-[44px]"
          >
            <Calculator className="h-4 w-4" />
            Calcul amortizare
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            Activ nou
          </button>
        </div>
      }
    >
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Active totale</p>
          <p className="text-2xl font-bold text-foreground">{assets.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Valoare intrare</p>
          <p className="text-lg font-bold text-foreground truncate">{formatMDL(totalCost)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Valoare netă</p>
          <p className="text-lg font-bold text-foreground truncate">{formatMDL(totalNetValue)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Active în uz</p>
          <p className="text-2xl font-bold text-success">
            {assets.filter((a) => a.status === "active").length}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Filtru status active">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            role="tab"
            aria-selected={filter === opt.value}
            onClick={() => setFilter(opt.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors min-h-[36px]",
              filter === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center gap-2 text-sm text-destructive py-8">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-base font-medium text-foreground">Niciun activ înregistrat</p>
          <p className="text-sm text-muted-foreground mt-1">
            Adaugă primul activ fix al centrului tău educativ.
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            Adaugă activ fix
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm" aria-label="Registru active fixe">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium w-8"></th>
                <th className="px-4 py-3 text-left font-medium">Denumire</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Categorie</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Dată achiziție</th>
                <th className="px-4 py-3 text-right font-medium">Valoare intrare</th>
                <th className="px-4 py-3 text-right font-medium">Valoare netă</th>
                <th className="px-4 py-3 text-center font-medium hidden md:table-cell">Ultima amortizare</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.map((asset) => (
                <React.Fragment key={asset.id}>
                  <tr
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          setExpandedId((prev) => (prev === asset.id ? null : asset.id))
                        }
                        className="text-muted-foreground hover:text-foreground min-h-[36px] min-w-[36px] flex items-center justify-center"
                        aria-label={expandedId === asset.id ? "Restrânge" : "Extinde"}
                      >
                        {expandedId === asset.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{asset.name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {asset.category ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {formatDate(asset.acquisitionDate)}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground tabular-nums">
                      {formatMDL(asset.acquisitionCostCents)}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground tabular-nums font-medium">
                      {formatMDL(asset.currentBookValueCents ?? asset.acquisitionCostCents)}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground hidden md:table-cell">
                      {asset.lastDepreciationPeriod ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          STATUS_BADGE[asset.status]
                        )}
                      >
                        {STATUS_LABELS[asset.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {asset.status === "active" && (
                        <button
                          onClick={() => setScrapTarget(asset)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-destructive hover:border-destructive transition-colors min-h-[36px]"
                          aria-label={`Casare ${asset.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Casare
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === asset.id && (
                    <tr className="bg-muted/10">
                      <td colSpan={9} className="px-8 py-4">
                        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3 md:grid-cols-4">
                          <div>
                            <dt className="text-muted-foreground">Metodă amortizare</dt>
                            <dd className="text-foreground font-medium">
                              {asset.depreciationMethod === "linear" ? "Liniar" : "Degresiv"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Durată utilă</dt>
                            <dd className="text-foreground font-medium">
                              {asset.usefulLifeMonths} luni
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Valoare reziduală</dt>
                            <dd className="text-foreground font-medium">
                              {formatMDL(asset.residualValueCents)}
                            </dd>
                          </div>
                          {asset.notes && (
                            <div className="col-span-2 md:col-span-4">
                              <dt className="text-muted-foreground">Note</dt>
                              <dd className="text-foreground">{asset.notes}</dd>
                            </div>
                          )}
                        </dl>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      {showNew && (
        <NewAssetDialog
          onClose={() => setShowNew(false)}
          onCreated={(asset) => {
            setAssets((prev) => [asset, ...prev]);
            setShowNew(false);
          }}
        />
      )}
      {showDepreciate && (
        <DepreciateDialog
          onClose={() => {
            setShowDepreciate(false);
            loadAssets();
          }}
          onDone={() => {
            setShowDepreciate(false);
            loadAssets();
          }}
        />
      )}
      {scrapTarget && (
        <ScrapDialog
          asset={scrapTarget}
          onClose={() => setScrapTarget(null)}
          onScrapped={() => {
            setScrapTarget(null);
            loadAssets();
          }}
        />
      )}
    </AppShell>
  );
}
