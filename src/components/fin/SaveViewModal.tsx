/**
 * INSIGHT-004 (FIN) — Modal for creating a saved view (fin_saved_views).
 * Accessible dialog with form: name + metric + period select.
 */

import { useState } from "react";
import { X } from "lucide-react";
import type { CreateSavedViewData, FinMetric, FinPeriod } from "@/lib/api/finInsight";

interface SaveViewModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreateSavedViewData) => Promise<void>;
}

const METRIC_OPTIONS: { value: FinMetric; label: string }[] = [
  { value: "revenue", label: "Venituri" },
  { value: "expenses", label: "Cheltuieli" },
  { value: "profit", label: "Profit" },
  { value: "vat", label: "TVA" },
  { value: "cashflow", label: "Cashflow" },
];

const PERIOD_OPTIONS: { value: FinPeriod; label: string }[] = [
  { value: "this_month", label: "Luna curentă" },
  { value: "last_month", label: "Luna trecută" },
  { value: "last_3m", label: "Ultimele 3 luni" },
  { value: "last_6m", label: "Ultimele 6 luni" },
  { value: "ytd", label: "De la 1 ian. (YTD)" },
];

export function SaveViewModal({ open, onClose, onSave }: SaveViewModalProps) {
  const [name, setName] = useState("");
  const [metric, setMetric] = useState<FinMetric>("revenue");
  const [period, setPeriod] = useState<FinPeriod>("this_month");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Numele vederii este obligatoriu.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), metric, period });
      onClose();
      setName("");
      setMetric("revenue");
      setPeriod("this_month");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la salvare.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-view-title"
    >
      <div className="relative w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Închide dialog"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <h2
          id="save-view-title"
          className="text-lg font-semibold text-foreground mb-4"
        >
          Salvează vedere curentă
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="view-name"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Nume vedere
            </label>
            <input
              id="view-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. Cheltuieli IT Q4"
              maxLength={200}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="view-metric"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Metrică
            </label>
            <select
              id="view-metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as FinMetric)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {METRIC_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="view-period"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Perioadă
            </label>
            <select
              id="view-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as FinPeriod)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-colors"
            >
              {saving ? "Se salvează..." : "Salvează"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
