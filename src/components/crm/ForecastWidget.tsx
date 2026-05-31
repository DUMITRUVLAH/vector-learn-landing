import { useCallback, useEffect, useState } from "react";
import { Loader2, TrendingUp, Edit3, Check, X } from "lucide-react";
import {
  getForecast,
  updateStageProbability,
  type ForecastData,
  type ForecastStage,
} from "@/lib/api/analytics";
import { cn } from "@/lib/utils";

interface ForecastWidgetProps {
  /** Called when probability is updated (to refresh kanban header if needed) */
  onUpdated?: () => void;
}

/**
 * CRM-125 — Weighted Revenue Forecast widget.
 * Shows a table of pipeline stages with gross value, win probability%, and weighted value.
 * Allows inline editing of probability per stage.
 */
export function ForecastWidget({ onUpdated }: ForecastWidgetProps) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getForecast();
      setData(res);
    } catch {
      setError("Nu pot încărca forecast-ul");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEditStart = (stage: ForecastStage) => {
    setEditingId(stage.stageId);
    setEditValue(String(stage.probabilityPct));
  };

  const handleEditSave = async (stage: ForecastStage) => {
    const pct = parseInt(editValue, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    setSaving(true);
    try {
      await updateStageProbability(stage.stageId, pct);
      setEditingId(null);
      await load();
      onUpdated?.();
    } catch {
      setError("Nu pot salva probabilitatea");
    } finally {
      setSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValue("");
  };

  const formatEur = (cents: number) =>
    cents === 0
      ? "€0"
      : new Intl.NumberFormat("ro-RO", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 0,
        }).format(cents / 100);

  return (
    <section
      className="rounded-xl border border-border bg-card p-5 space-y-4"
      aria-label="Forecast ponderat pipeline"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-base font-bold">Forecast ponderat</h2>
        </div>
        {data && (
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">
              Brut: <span className="font-bold text-foreground">{formatEur(data.totalGrossCents)}</span>
            </span>
            <span className="text-primary font-bold">
              Ponderat: {formatEur(data.totalWeightedCents)}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
          <span className="text-sm">Se încarcă...</span>
        </div>
      ) : error ? (
        <p className="py-4 text-center text-sm text-destructive">{error}</p>
      ) : data && data.stages.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm"
              role="table"
              aria-label="Forecast ponderat per stadiu"
            >
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
                  >
                    Stadiu
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground"
                  >
                    Leaduri
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground"
                  >
                    Valoare brută
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground"
                  >
                    Prob. câștig %
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground"
                  >
                    Valoare ponderată
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.stages.map((stage) => (
                  <tr
                    key={stage.stageId}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                          stage.color
                        )}
                        aria-label={`Stadiu: ${stage.label}`}
                      >
                        {stage.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {stage.count}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatEur(stage.grossCents)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {editingId === stage.stageId ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-14 rounded border border-input bg-background px-1.5 py-0.5 text-xs text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Probabilitate câștig pentru ${stage.label}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleEditSave(stage);
                              if (e.key === "Escape") handleEditCancel();
                            }}
                            autoFocus
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                          <button
                            type="button"
                            onClick={() => void handleEditSave(stage)}
                            disabled={saving}
                            className="rounded p-0.5 text-success hover:bg-success/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Confirmă probabilitatea pentru ${stage.label}`}
                          >
                            {saving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={handleEditCancel}
                            className="rounded p-0.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Anulează editarea probabilității pentru ${stage.label}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleEditStart(stage)}
                          className="group inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Editează probabilitatea pentru ${stage.label}: ${stage.probabilityPct}%`}
                        >
                          <span
                            className={cn(
                              "tabular-nums",
                              stage.probabilityPct >= 60
                                ? "text-success"
                                : stage.probabilityPct >= 25
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                            )}
                          >
                            {stage.probabilityPct}%
                          </span>
                          <Edit3
                            className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity"
                            aria-hidden="true"
                          />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-primary">
                      {stage.weightedCents > 0 ? formatEur(stage.weightedCents) : (
                        <span className="text-muted-foreground font-normal">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/20">
                  <td className="px-3 py-2.5 text-xs font-bold">Total</td>
                  <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums">
                    {data.stages.reduce((s, f) => s + f.count, 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-muted-foreground">
                    {formatEur(data.totalGrossCents)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">—</td>
                  <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-primary">
                    {formatEur(data.totalWeightedCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Probabilitățile de câștig per stadiu sunt configurabile — click pe % pentru a edita.
            Forecast ponderat = Σ(valoare × probabilitate).
          </p>
        </>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Nu există leaduri cu valoare setată.{" "}
          <span className="text-xs">Adaugă valoare deal-ului din cartonașul lead-ului.</span>
        </p>
      )}
    </section>
  );
}
