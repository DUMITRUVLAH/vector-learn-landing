/**
 * REGISTRY-003: FinDesk fiscal registry admin page
 * Route: /app/fin/registry
 *
 * Two tabs:
 * 1. "Cote fiscale"   — fin_tax_rates table with add-rate modal
 * 2. "Plan de conturi" — fin_chart_of_accounts grouped by accountType
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaxRate {
  id: string;
  tenantId: string | null;
  country: string;
  kind: "vat" | "income_tax" | "social_contribution" | "dividend_tax" | "other";
  name: string;
  ratePct: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isDefault: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChartOfAccountEntry {
  id: string;
  tenantId: string | null;
  country: string;
  accountCode: string;
  accountName: string;
  accountType:
    | "asset"
    | "liability"
    | "equity"
    | "revenue"
    | "expense"
    | "cost_of_goods"
    | "tax";
  parentCode: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type TabId = "tax-rates" | "chart-of-accounts";
type TaxKind = TaxRate["kind"];
type AccountType = ChartOfAccountEntry["accountType"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TAX_KIND_LABELS: Record<TaxKind, string> = {
  vat: "TVA",
  income_tax: "Impozit pe venit",
  social_contribution: "Contribuție socială",
  dividend_tax: "Impozit pe dividende",
  other: "Altul",
};

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Activ",
  liability: "Pasiv",
  equity: "Capital propriu",
  revenue: "Venituri",
  expense: "Cheltuieli",
  cost_of_goods: "Costul bunurilor",
  tax: "Taxe",
};

const ACCOUNT_TYPE_ORDER: AccountType[] = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
  "cost_of_goods",
  "tax",
];

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isNonNegativeDecimal(s: string): boolean {
  return /^\d+(\.\d{1,4})?$/.test(s) && parseFloat(s) >= 0;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchTaxRates(country?: string, kind?: string): Promise<TaxRate[]> {
  const params = new URLSearchParams();
  if (country) params.set("country", country);
  if (kind) params.set("kind", kind);
  const res = await fetch(`/api/fin/registry/tax-rates?${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data: TaxRate[] };
  return json.data;
}

async function createTaxRate(body: {
  country: string;
  kind: TaxKind;
  name: string;
  ratePct: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isDefault: boolean;
  notes?: string;
}): Promise<TaxRate> {
  const res = await fetch("/api/fin/registry/tax-rates", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data: TaxRate };
  return json.data;
}

async function fetchChartOfAccounts(country?: string): Promise<ChartOfAccountEntry[]> {
  const params = new URLSearchParams();
  if (country) params.set("country", country);
  const res = await fetch(`/api/fin/registry/chart-of-accounts?${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data: ChartOfAccountEntry[] };
  return json.data;
}

// ─── Form state for "Add Rate" ─────────────────────────────────────────────

interface AddRateForm {
  country: string;
  kind: TaxKind | "";
  name: string;
  ratePct: string;
  effectiveFrom: string;
  effectiveTo: string;
  isDefault: boolean;
  notes: string;
}

interface AddRateErrors {
  country?: string;
  kind?: string;
  name?: string;
  ratePct?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

function validateAddRate(form: AddRateForm): AddRateErrors {
  const errs: AddRateErrors = {};
  if (!form.country || form.country.length !== 2)
    errs.country = "Codul țării trebuie să aibă exact 2 caractere (ex: MD, RO)";
  if (!form.kind) errs.kind = "Selectați tipul cotei";
  if (!form.name.trim()) errs.name = "Denumirea este obligatorie";
  if (!isNonNegativeDecimal(form.ratePct))
    errs.ratePct = "Procentul trebuie să fie un număr pozitiv (ex: 20 sau 20.0000)";
  if (!isValidDate(form.effectiveFrom))
    errs.effectiveFrom = "Format obligatoriu: YYYY-MM-DD";
  if (form.effectiveTo && !isValidDate(form.effectiveTo))
    errs.effectiveTo = "Format obligatoriu: YYYY-MM-DD";
  return errs;
}

const EMPTY_FORM: AddRateForm = {
  country: "MD",
  kind: "",
  name: "",
  ratePct: "",
  effectiveFrom: "",
  effectiveTo: "",
  isDefault: false,
  notes: "",
};

// ─── Add Rate Modal ───────────────────────────────────────────────────────────

interface AddRateModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function AddRateModal({ onClose, onSuccess }: AddRateModalProps) {
  const [form, setForm] = useState<AddRateForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<AddRateErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = (field: keyof AddRateForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const val =
        e.target.type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : e.target.value;
      setForm((prev) => ({ ...prev, [field]: val }));
    };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateAddRate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    setServerError(null);
    try {
      await createTaxRate({
        country: form.country.toUpperCase(),
        kind: form.kind as TaxKind,
        name: form.name.trim(),
        ratePct: form.ratePct,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || undefined,
        isDefault: form.isDefault,
        notes: form.notes || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "A apărut o eroare");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Adaugă cotă fiscală"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Adaugă cotă fiscală</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-muted transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Închide dialogul"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4">
          {/* Country */}
          <div className="space-y-1">
            <label htmlFor="rate-country" className="block text-sm font-medium">
              Țară <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="rate-country"
              type="text"
              maxLength={2}
              placeholder="MD"
              value={form.country}
              onChange={set("country")}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                errors.country ? "border-destructive" : "border-input"
              )}
              aria-describedby={errors.country ? "country-err" : undefined}
              aria-invalid={!!errors.country}
            />
            {errors.country && (
              <p id="country-err" className="text-xs text-destructive" role="alert">
                {errors.country}
              </p>
            )}
          </div>

          {/* Kind */}
          <div className="space-y-1">
            <label htmlFor="rate-kind" className="block text-sm font-medium">
              Tip cotă <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <select
              id="rate-kind"
              value={form.kind}
              onChange={set("kind")}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                errors.kind ? "border-destructive" : "border-input"
              )}
              aria-describedby={errors.kind ? "kind-err" : undefined}
              aria-invalid={!!errors.kind}
              aria-label="Tip cotă fiscală"
            >
              <option value="">Selectați tipul...</option>
              {(Object.entries(TAX_KIND_LABELS) as [TaxKind, string][]).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            {errors.kind && (
              <p id="kind-err" className="text-xs text-destructive" role="alert">
                {errors.kind}
              </p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="rate-name" className="block text-sm font-medium">
              Denumire <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="rate-name"
              type="text"
              placeholder="TVA standard 20%"
              value={form.name}
              onChange={set("name")}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                errors.name ? "border-destructive" : "border-input"
              )}
              aria-describedby={errors.name ? "name-err" : undefined}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p id="name-err" className="text-xs text-destructive" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          {/* Rate % */}
          <div className="space-y-1">
            <label htmlFor="rate-pct" className="block text-sm font-medium">
              Procent (%) <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="rate-pct"
              type="text"
              inputMode="decimal"
              placeholder="20.0000"
              value={form.ratePct}
              onChange={set("ratePct")}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono",
                errors.ratePct ? "border-destructive" : "border-input"
              )}
              aria-describedby={errors.ratePct ? "pct-err" : undefined}
              aria-invalid={!!errors.ratePct}
            />
            {errors.ratePct && (
              <p id="pct-err" className="text-xs text-destructive" role="alert">
                {errors.ratePct}
              </p>
            )}
          </div>

          {/* Effective from */}
          <div className="space-y-1">
            <label htmlFor="rate-from" className="block text-sm font-medium">
              De la (data efectivă) <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <input
              id="rate-from"
              type="date"
              value={form.effectiveFrom}
              onChange={set("effectiveFrom")}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                errors.effectiveFrom ? "border-destructive" : "border-input"
              )}
              aria-describedby={errors.effectiveFrom ? "from-err" : undefined}
              aria-invalid={!!errors.effectiveFrom}
            />
            {errors.effectiveFrom && (
              <p id="from-err" className="text-xs text-destructive" role="alert">
                {errors.effectiveFrom}
              </p>
            )}
          </div>

          {/* Effective to */}
          <div className="space-y-1">
            <label htmlFor="rate-to" className="block text-sm font-medium">
              Până la <span className="text-muted-foreground text-xs">(opțional)</span>
            </label>
            <input
              id="rate-to"
              type="date"
              value={form.effectiveTo}
              onChange={set("effectiveTo")}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                errors.effectiveTo ? "border-destructive" : "border-input"
              )}
              aria-describedby={errors.effectiveTo ? "to-err" : undefined}
              aria-invalid={!!errors.effectiveTo}
            />
            {errors.effectiveTo && (
              <p id="to-err" className="text-xs text-destructive" role="alert">
                {errors.effectiveTo}
              </p>
            )}
          </div>

          {/* Is default */}
          <div className="flex items-center gap-2">
            <input
              id="rate-default"
              type="checkbox"
              checked={form.isDefault}
              onChange={set("isDefault")}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <label htmlFor="rate-default" className="text-sm">
              Cotă implicită pentru țara/tipul selectat
            </label>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label htmlFor="rate-notes" className="block text-sm font-medium">
              Note <span className="text-muted-foreground text-xs">(opțional)</span>
            </label>
            <input
              id="rate-notes"
              type="text"
              placeholder="Baza legală, sursa oficială..."
              value={form.notes}
              onChange={set("notes")}
              className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors min-h-[44px]"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[44px]"
            >
              {submitting ? "Se salvează..." : "Adaugă cotă"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tax Rates Tab ────────────────────────────────────────────────────────────

function TaxRatesTab() {
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCountry, setFilterCountry] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTaxRates(
        filterCountry || undefined,
        filterKind || undefined
      );
      setRates(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [filterCountry, filterKind]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      {/* Filters + Add button */}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="filter-country" className="sr-only">
          Filtrare după țară
        </label>
        <select
          id="filter-country"
          value={filterCountry}
          onChange={(e) => setFilterCountry(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
          aria-label="Filtrare țară"
        >
          <option value="">Toate țările</option>
          <option value="MD">Moldova (MD)</option>
          <option value="RO">România (RO)</option>
        </select>

        <label htmlFor="filter-kind" className="sr-only">
          Filtrare după tip cotă
        </label>
        <select
          id="filter-kind"
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
          aria-label="Filtrare tip cotă"
        >
          <option value="">Toate tipurile</option>
          {(Object.entries(TAX_KIND_LABELS) as [TaxKind, string][]).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowAddModal(true)}
          className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity min-h-[44px]"
          aria-label="Adaugă cotă fiscală nouă"
        >
          + Adaugă cotă
        </button>
      </div>

      {/* Table */}
      {loading && (
        <p className="text-sm text-muted-foreground py-4">Se încarcă...</p>
      )}
      {error && (
        <p className="text-sm text-destructive py-4" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Țară</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tip cotă</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Denumire</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Procent (%)</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">De la</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Până la</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Implicit</th>
              </tr>
            </thead>
            <tbody>
              {rates.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    Nicio cotă găsită pentru filtrele selectate.
                  </td>
                </tr>
              ) : (
                rates.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
                        {r.country}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {TAX_KIND_LABELS[r.kind]}
                    </td>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.ratePct}%</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.effectiveFrom}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.effectiveTo ?? <em className="not-italic text-muted-foreground">activ</em>}
                    </td>
                    <td className="px-4 py-3">
                      {r.isDefault ? (
                        <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                          Da
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddRateModal
          onClose={() => setShowAddModal(false)}
          onSuccess={load}
        />
      )}
    </div>
  );
}

// ─── Chart of Accounts Tab ────────────────────────────────────────────────────

function ChartOfAccountsTab() {
  const [accounts, setAccounts] = useState<ChartOfAccountEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCountry, setFilterCountry] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchChartOfAccounts(filterCountry || undefined);
      setAccounts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [filterCountry]);

  useEffect(() => {
    void load();
  }, [load]);

  // Group by accountType
  const grouped = accounts.reduce<Partial<Record<AccountType, ChartOfAccountEntry[]>>>(
    (acc, entry) => {
      const grp = acc[entry.accountType] ?? [];
      grp.push(entry);
      acc[entry.accountType] = grp;
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-4">
      {/* Country filter */}
      <div className="flex items-center gap-3">
        <label htmlFor="coa-filter-country" className="sr-only">
          Filtrare plan conturi după țară
        </label>
        <select
          id="coa-filter-country"
          value={filterCountry}
          onChange={(e) => setFilterCountry(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
          aria-label="Filtrare plan conturi după țară"
        >
          <option value="">Toate țările</option>
          <option value="MD">Moldova (MD)</option>
          <option value="RO">România (RO)</option>
        </select>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground py-4">Se încarcă...</p>
      )}
      {error && (
        <p className="text-sm text-destructive py-4" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && accounts.length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          Niciun cont găsit pentru țara selectată.
        </p>
      )}
      {!loading && !error && (
        <div className="space-y-6">
          {ACCOUNT_TYPE_ORDER.map((type) => {
            const entries = grouped[type];
            if (!entries || entries.length === 0) return null;
            return (
              <section key={type} aria-labelledby={`section-${type}`}>
                <h3
                  id={`section-${type}`}
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2"
                >
                  {ACCOUNT_TYPE_LABELS[type]}
                </h3>
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground w-24">Cod</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Denumire cont</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground w-24">Țară</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cont parent</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground w-20">Activ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((a) => (
                        <tr
                          key={a.id}
                          className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono font-medium text-foreground">
                            {a.accountCode}
                          </td>
                          <td className="px-4 py-3">{a.accountName}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
                              {a.country}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                            {a.parentCode ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {a.isActive ? (
                              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                                Da
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">Nu</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function FinRegistryPage() {
  const [activeTab, setActiveTab] = useState<TabId>("tax-rates");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Nomenclatoare fiscale</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestionați cotele fiscale și planul de conturi utilizat în FinDesk.
          </p>
        </header>

        {/* Tabs */}
        <div>
          <div role="tablist" className="flex gap-1 border-b border-border mb-6" aria-label="Secțiuni nomenclatoare">
            {(
              [
                { id: "tax-rates", label: "Cote fiscale" },
                { id: "chart-of-accounts", label: "Plan de conturi" },
              ] as { id: TabId; label: string }[]
            ).map(({ id, label }) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`panel-${id}`}
                id={`tab-${id}`}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors min-h-[44px]",
                  activeTab === id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            id="panel-tax-rates"
            role="tabpanel"
            aria-labelledby="tab-tax-rates"
            hidden={activeTab !== "tax-rates"}
          >
            {activeTab === "tax-rates" && <TaxRatesTab />}
          </div>

          <div
            id="panel-chart-of-accounts"
            role="tabpanel"
            aria-labelledby="tab-chart-of-accounts"
            hidden={activeTab !== "chart-of-accounts"}
          >
            {activeTab === "chart-of-accounts" && <ChartOfAccountsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FinRegistryPage;
