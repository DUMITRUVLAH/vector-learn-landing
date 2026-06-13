/**
 * ITPARK-003: Setări ITPARK — prag eligibilitate, toleranță, auditor
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §7
 * Route: /app/fin/itpark/settings
 *
 * Acces: Admin/Manager pot edita; Auditor/Viewer pot vedea (read-only).
 */
import React, { useEffect, useState } from "react";
import { fetchItparkSettings, updateItparkSettings } from "../../lib/api/itparkSettings";
import type { ItparkSettings } from "../../lib/api/itparkSettings";

interface ItparkSettingsState {
  loading: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  settings: ItparkSettings | null;
  // Form fields
  thresholdPct: string;
  toleranceMonths: string;
  currency: string;
  auditFirm: string;
  auditorUserId: string;
}

export default function ItparkSettingsPage(): React.JSX.Element {
  const [state, setState] = useState<ItparkSettingsState>({
    loading: true,
    saving: false,
    error: null,
    success: null,
    settings: null,
    thresholdPct: "70",
    toleranceMonths: "2",
    currency: "MDL",
    auditFirm: "",
    auditorUserId: "",
  });

  useEffect(() => {
    fetchItparkSettings()
      .then((s) => {
        setState((prev) => ({
          ...prev,
          loading: false,
          settings: s,
          thresholdPct: s.eligibilityThresholdPct,
          toleranceMonths: String(s.toleranceMonths),
          currency: s.defaultCurrency,
          auditFirm: s.defaultAuditFirm ?? "",
          auditorUserId: s.auditorUserId ?? "",
        }));
      })
      .catch((err: unknown) => {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Eroare la încărcare",
        }));
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setState((prev) => ({ ...prev, saving: true, error: null, success: null }));

    try {
      const updated = await updateItparkSettings({
        eligibilityThresholdPct: parseFloat(state.thresholdPct),
        toleranceMonths: parseInt(state.toleranceMonths, 10),
        defaultCurrency: state.currency,
        defaultAuditFirm: state.auditFirm || null,
        auditorUserId: state.auditorUserId || null,
      });
      setState((prev) => ({
        ...prev,
        saving: false,
        success: "Setările au fost salvate.",
        settings: updated,
      }));
    } catch (err: unknown) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: err instanceof Error ? err.message : "Eroare la salvare",
      }));
    }
  };

  if (state.loading) {
    return (
      <div className="p-6" role="status" aria-busy="true">
        <p className="text-muted-foreground">Se încarcă setările...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-semibold text-foreground mb-1">Setări IT Park</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Prag de eligibilitate, toleranță luni, firma de audit implicită.
      </p>

      {state.error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20"
        >
          {state.error}
        </div>
      )}

      {state.success && (
        <div
          role="status"
          className="mb-4 p-3 rounded-md bg-green-500/10 text-green-700 dark:text-green-400 text-sm border border-green-500/20"
        >
          {state.success}
        </div>
      )}

      <form onSubmit={(e) => { void handleSave(e); }} className="space-y-5">
        {/* Prag eligibilitate */}
        <div>
          <label
            htmlFor="threshold-pct"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Prag de eligibilitate (%)
          </label>
          <input
            id="threshold-pct"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={state.thresholdPct}
            onChange={(e) => setState((prev) => ({ ...prev, thresholdPct: e.target.value }))}
            className="w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required
            aria-describedby="threshold-hint"
          />
          <p id="threshold-hint" className="mt-1 text-xs text-muted-foreground">
            Valoare implicită: 70%. Conform Deciziei MITP, ponderea veniturilor eligibile
            trebuie să fie ≥ {state.thresholdPct}% cumulativ.
          </p>
        </div>

        {/* Toleranță luni */}
        <div>
          <label
            htmlFor="tolerance-months"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Toleranță luni consecutive sub prag
          </label>
          <input
            id="tolerance-months"
            type="number"
            min={0}
            max={12}
            step={1}
            value={state.toleranceMonths}
            onChange={(e) => setState((prev) => ({ ...prev, toleranceMonths: e.target.value }))}
            className="w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            required
            aria-describedby="tolerance-hint"
          />
          <p id="tolerance-hint" className="mt-1 text-xs text-muted-foreground">
            Implicit: 2 luni. Dacă ponderea cumulativă scade sub prag mai mult de{" "}
            {state.toleranceMonths}{" "}
            {parseInt(state.toleranceMonths, 10) === 1 ? "lună" : "luni"} consecutive →
            risc de pierdere a statutului MITP.
          </p>
        </div>

        {/* Monedă */}
        <div>
          <label
            htmlFor="currency"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Monedă implicită
          </label>
          <select
            id="currency"
            value={state.currency}
            onChange={(e) => setState((prev) => ({ ...prev, currency: e.target.value }))}
            className="w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="MDL">MDL — Leu moldovenesc</option>
            <option value="EUR">EUR — Euro</option>
            <option value="USD">USD — Dolar SUA</option>
          </select>
        </div>

        {/* Firmă de audit */}
        <div>
          <label
            htmlFor="audit-firm"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Firma de audit implicită
          </label>
          <input
            id="audit-firm"
            type="text"
            maxLength={255}
            value={state.auditFirm}
            onChange={(e) => setState((prev) => ({ ...prev, auditFirm: e.target.value }))}
            placeholder="ex. Audit Moldova SRL"
            className="w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Auditor user ID (UUID) */}
        <div>
          <label
            htmlFor="auditor-user-id"
            className="block text-sm font-medium text-foreground mb-1"
          >
            UUID user auditor (opțional)
          </label>
          <input
            id="auditor-user-id"
            type="text"
            value={state.auditorUserId}
            onChange={(e) => setState((prev) => ({ ...prev, auditorUserId: e.target.value }))}
            placeholder="UUID-ul userului desemnat ca auditor"
            className="w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            aria-describedby="auditor-hint"
          />
          <p id="auditor-hint" className="mt-1 text-xs text-muted-foreground">
            Userul desemnat ca auditor are acces read-only + poate marca dosarul „verificat".
            Lăsați gol dacă nu există un auditor desemnat.
          </p>
        </div>

        <button
          type="submit"
          disabled={state.saving}
          className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-busy={state.saving}
        >
          {state.saving ? "Se salvează..." : "Salvează setările"}
        </button>
      </form>
    </div>
  );
}
