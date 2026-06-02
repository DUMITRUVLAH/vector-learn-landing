/**
 * AI-A04 — AI Settings page
 * /app/settings/ai
 *
 * Shows monthly AI usage, cost cap, and per-feature toggle switches.
 */
import { useState, useEffect, useCallback } from "react";
import { Brain, Save, AlertTriangle, DollarSign, Activity, ToggleLeft, ToggleRight } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";

interface FeatureFlag {
  feature: string;
  enabled: boolean;
}

interface AiSettings {
  monthlyBudgetUsdCents: number | null;
  currentMonthCostUsdCents: number;
  callCount: number;
  totalTokens: number;
  featureFlags: FeatureFlag[];
}

const FEATURE_LABELS: Record<string, string> = {
  lesson_summary: "Rezumat lecție",
  churn_prediction: "Predicție abandon",
  lead_qualification: "Calificare lead",
  reply_suggestion: "Sugestie răspuns",
};

function centsToEur(cents: number | null): string {
  if (cents === null || cents === undefined) return "Nelimitat";
  return `${(cents / 100).toFixed(2)} €`;
}

function usagePct(current: number, budget: number | null): number | null {
  if (!budget || budget <= 0) return null;
  return Math.min(100, Math.round((current / budget) * 100));
}

export function AiSettingsPage() {
  const { data } = useSession();
  const { navigate } = useRouter();

  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Local editable state
  const [budgetInput, setBudgetInput] = useState<string>("");
  const [flags, setFlags] = useState<FeatureFlag[]>([]);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/ai", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AiSettings;
      setSettings(data);
      setBudgetInput(
        data.monthlyBudgetUsdCents !== null
          ? String(Math.round(data.monthlyBudgetUsdCents / 100)) // cents → euros for display
          : ""
      );
      setFlags(data.featureFlags);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare necunoscută");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!data) {
      navigate("/app/login");
      return;
    }
    fetchSettings();
  }, [data, navigate, fetchSettings]);

  const handleToggle = (feature: string) => {
    setFlags((prev) =>
      prev.map((f) => (f.feature === feature ? { ...f, enabled: !f.enabled } : f))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // Budget: user types euros, we store cents
      const budgetCents =
        budgetInput.trim() === "" ? null : Math.round(parseFloat(budgetInput) * 100);

      const res = await fetch("/api/settings/ai", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyBudgetUsdCents: isNaN(budgetCents as number) ? null : budgetCents,
          featureFlags: flags,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  };

  const pct = settings ? usagePct(settings.currentMonthCostUsdCents, settings.monthlyBudgetUsdCents) : null;
  const budgetWarning =
    settings?.monthlyBudgetUsdCents !== null && pct !== null && pct >= 90;

  return (
    <AppShell pageTitle="Setări AI" pageDescription="Controlează bugetul și funcțiile AI ale organizației.">
      {loading && (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          Se încarcă...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 text-destructive px-4 py-3 mb-4 text-sm" role="alert">
          {error}
        </div>
      )}

      {!loading && settings && (
        <div className="space-y-6 max-w-2xl">

          {/* Budget warning banner */}
          {budgetWarning && (
            <div
              className="flex items-center gap-2 rounded-lg border border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-4 py-3 text-sm"
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {pct! >= 100
                  ? "Bugetul lunar AI a fost depășit. Toate apelurile AI returnează răspuns predefinit."
                  : `Ai folosit ${pct}% din bugetul lunar AI.`}
              </span>
            </div>
          )}

          {/* Budget card */}
          <section
            className="rounded-xl border border-border bg-card p-6 shadow-sm"
            aria-labelledby="budget-heading"
          >
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 id="budget-heading" className="text-base font-semibold">
                Buget lunar AI
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label
                    htmlFor="budget-input"
                    className="block text-sm font-medium text-muted-foreground mb-1"
                  >
                    Limită lunară (euro) — lasă gol pentru nelimitat
                  </label>
                  <input
                    id="budget-input"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="ex. 10"
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Progress bar */}
              {pct !== null && (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>
                      Cheltuit: {centsToEur(settings.currentMonthCostUsdCents)}
                    </span>
                    <span>Buget: {centsToEur(settings.monthlyBudgetUsdCents)}</span>
                  </div>
                  <div
                    className="h-2 rounded-full bg-muted overflow-hidden"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Utilizare AI: ${pct}%`}
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct >= 100
                          ? "bg-destructive"
                          : pct >= 90
                          ? "bg-amber-500"
                          : "bg-primary"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Usage card */}
          <section
            className="rounded-xl border border-border bg-card p-6 shadow-sm"
            aria-labelledby="usage-heading"
          >
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 id="usage-heading" className="text-base font-semibold">
                Utilizare luna curentă
              </h2>
            </div>

            <dl className="grid grid-cols-3 gap-4 text-center">
              <div>
                <dt className="text-xs text-muted-foreground mb-1">Apeluri AI</dt>
                <dd className="text-2xl font-bold tabular-nums">{settings.callCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground mb-1">Tokeni totali</dt>
                <dd className="text-2xl font-bold tabular-nums">
                  {settings.totalTokens.toLocaleString("ro-RO")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground mb-1">Cost estimat</dt>
                <dd className="text-2xl font-bold tabular-nums">
                  {centsToEur(settings.currentMonthCostUsdCents)}
                </dd>
              </div>
            </dl>
          </section>

          {/* Feature flags card */}
          <section
            className="rounded-xl border border-border bg-card p-6 shadow-sm"
            aria-labelledby="flags-heading"
          >
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 id="flags-heading" className="text-base font-semibold">
                Funcții AI
              </h2>
            </div>

            <ul className="divide-y divide-border" role="list">
              {flags.map((f) => (
                <li
                  key={f.feature}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {FEATURE_LABELS[f.feature] ?? f.feature}
                    </p>
                    <p className="text-xs text-muted-foreground">{f.feature}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle(f.feature)}
                    className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-pressed={f.enabled}
                    aria-label={`${FEATURE_LABELS[f.feature] ?? f.feature}: ${f.enabled ? "activat" : "dezactivat"}`}
                  >
                    {f.enabled ? (
                      <ToggleRight className="h-8 w-8 text-primary" aria-hidden="true" />
                    ) : (
                      <ToggleLeft className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring transition-colors min-h-[44px]"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? "Se salvează..." : "Salvează setările"}
            </button>

            {saved && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
                Setările au fost salvate.
              </span>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
