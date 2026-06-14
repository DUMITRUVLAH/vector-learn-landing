/**
 * PAY-003 (FIN): Pagina /app/fin/payroll/employees
 *
 * Management angajați: CRUD complet.
 * - Tabel angajați cu: Nume, Funcție, Tip contract, Salariu brut, Valută, Status
 * - Adăugare angajat (form inline)
 * - Editare inline (click pe rând)
 * - Dezactivare (PATCH status=inactive)
 *
 * Design: design-system tokens, light+dark, WCAG AA, fără hex hardcodate.
 */

import { useState, useEffect, useCallback, Fragment } from "react";
import { AppShell } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import {
  Users,
  Plus,
  RefreshCw,
  AlertCircle,
  Pencil,
  CheckCircle,
  XCircle,
  ChevronLeft,
  Save,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  fullName: string;
  jobTitle: string | null;
  contractType: "employee" | "contractor";
  baseSalaryCents: number;
  currency: string;
  status: "active" | "inactive";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EmployeeFormData {
  fullName: string;
  jobTitle: string;
  contractType: "employee" | "contractor";
  baseSalaryCents: string; // string pentru input
  currency: "MDL" | "RON" | "EUR" | "USD";
  notes: string;
}

const EMPTY_FORM: EmployeeFormData = {
  fullName: "",
  jobTitle: "",
  contractType: "employee",
  baseSalaryCents: "",
  currency: "MDL",
  notes: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number, currency: string): string {
  return (
    new Intl.NumberFormat("ro-RO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100) +
    " " +
    currency
  );
}

const CONTRACT_TYPE_LABELS: Record<"employee" | "contractor", string> = {
  employee: "Angajat (CIM)",
  contractor: "Prestator (PFA/SRL)",
};

// ─── Employee form component ──────────────────────────────────────────────────

interface EmployeeFormProps {
  initial?: EmployeeFormData;
  onSave: (data: EmployeeFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  title: string;
}

function EmployeeForm({
  initial = EMPTY_FORM,
  onSave,
  onCancel,
  saving,
  title,
}: EmployeeFormProps) {
  const [form, setForm] = useState<EmployeeFormData>(initial);

  function set<K extends keyof EmployeeFormData>(k: K, v: EmployeeFormData[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    if (!form.fullName.trim()) return;
    await onSave(form);
  }

  return (
    <div
      role="dialog"
      aria-labelledby="emp-form-title"
      className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4"
    >
      <h2 id="emp-form-title" className="text-sm font-semibold text-foreground">
        {title}
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Nume complet */}
        <div className="sm:col-span-2">
          <label
            htmlFor="emp-fullName"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Nume complet *
          </label>
          <input
            id="emp-fullName"
            type="text"
            value={form.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            placeholder="Ex: Ion Popescu"
            className={cn(
              "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/50"
            )}
          />
        </div>

        {/* Funcție */}
        <div>
          <label
            htmlFor="emp-jobTitle"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Funcție / post
          </label>
          <input
            id="emp-jobTitle"
            type="text"
            value={form.jobTitle}
            onChange={(e) => set("jobTitle", e.target.value)}
            placeholder="Ex: Profesor de engleză"
            className={cn(
              "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/50"
            )}
          />
        </div>

        {/* Tip contract */}
        <div>
          <label
            htmlFor="emp-contractType"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Tip contract
          </label>
          <select
            id="emp-contractType"
            value={form.contractType}
            onChange={(e) =>
              set("contractType", e.target.value as "employee" | "contractor")
            }
            className={cn(
              "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/50"
            )}
          >
            <option value="employee">Angajat (CIM)</option>
            <option value="contractor">Prestator (PFA/SRL)</option>
          </select>
        </div>

        {/* Salariu brut */}
        <div>
          <label
            htmlFor="emp-salary"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Salariu brut lunar (cenți)
          </label>
          <input
            id="emp-salary"
            type="number"
            min="0"
            step="100"
            value={form.baseSalaryCents}
            onChange={(e) => set("baseSalaryCents", e.target.value)}
            placeholder="Ex: 1000000 = 10.000,00"
            className={cn(
              "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/50"
            )}
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            {form.baseSalaryCents
              ? `= ${formatCents(Number(form.baseSalaryCents), form.currency)}`
              : "Introduceți suma în cenți (ex: 10.000 MDL = 1.000.000)"}
          </p>
        </div>

        {/* Valută */}
        <div>
          <label
            htmlFor="emp-currency"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Valută
          </label>
          <select
            id="emp-currency"
            value={form.currency}
            onChange={(e) =>
              set("currency", e.target.value as "MDL" | "RON" | "EUR" | "USD")
            }
            className={cn(
              "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/50"
            )}
          >
            <option value="MDL">MDL</option>
            <option value="RON">RON</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>

        {/* Note */}
        <div className="sm:col-span-2">
          <label
            htmlFor="emp-notes"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Note (opțional)
          </label>
          <textarea
            id="emp-notes"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="Ex: Nr. contract 2025/001"
            className={cn(
              "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground resize-none",
              "focus:outline-none focus:ring-2 focus:ring-primary/50"
            )}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !form.fullName.trim()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
            "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          {saving ? "Se salvează…" : "Salvează"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
            "border border-border bg-background text-foreground hover:bg-muted transition-colors"
          )}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Anulează
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PayrollEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false); // active vs all

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = showAll ? "inactive" : "active";
      // Fetch both active + inactive (we'll merge)
      const [activeRes, inactiveRes] = await Promise.all([
        fetch("/api/fin/payroll/employees?status=active", { credentials: "include" }),
        fetch("/api/fin/payroll/employees?status=inactive", { credentials: "include" }),
      ]);
      const activeJson = (await activeRes.json()) as { employees: Employee[] };
      const inactiveJson = (await inactiveRes.json()) as { employees: Employee[] };
      const all = [...activeJson.employees, ...inactiveJson.employees].sort((a, b) =>
        a.fullName.localeCompare(b.fullName, "ro")
      );
      setEmployees(showAll ? all : all.filter((e) => e.status === "active"));
      void status; // suppress unused
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare.");
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(data: EmployeeFormData) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/fin/payroll/employees", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: data.fullName.trim(),
          jobTitle: data.jobTitle.trim() || null,
          contractType: data.contractType,
          baseSalaryCents: parseInt(data.baseSalaryCents, 10) || 0,
          currency: data.currency,
          notes: data.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setShowAdd(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la adăugare.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(id: string, data: EmployeeFormData) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/fin/payroll/employees/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: data.fullName.trim(),
          jobTitle: data.jobTitle.trim() || null,
          contractType: data.contractType,
          baseSalaryCents: parseInt(data.baseSalaryCents, 10) || 0,
          currency: data.currency,
          notes: data.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setEditingId(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la editare.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/fin/payroll/employees/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "inactive" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la dezactivare.");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/fin/payroll/employees/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la activare.");
    } finally {
      setSaving(false);
    }
  }

  function getEditFormData(emp: Employee): EmployeeFormData {
    return {
      fullName: emp.fullName,
      jobTitle: emp.jobTitle ?? "",
      contractType: emp.contractType,
      baseSalaryCents: String(emp.baseSalaryCents),
      currency: emp.currency as "MDL" | "RON" | "EUR" | "USD",
      notes: emp.notes ?? "",
    };
  }

  return (
    <AppShell pageTitle="Angajați — Salarizare">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="#/app/fin/payroll"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Înapoi la Salarizare"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Salarizare
            </a>
            <span className="text-muted-foreground/40">/</span>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Angajați</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Personal inclus în calculul de salarizare
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Reîncarcă"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm",
                "bg-background text-foreground hover:bg-muted transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <RefreshCw
                className={cn("h-4 w-4", loading && "animate-spin")}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(true);
                setEditingId(null);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
                "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              )}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adaugă angajat
            </button>
          </div>
        </div>

        {/* Toggle active / all */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Afișează:</span>
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              !showAll
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background text-foreground hover:bg-muted"
            )}
          >
            Activi
          </button>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              showAll
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background text-foreground hover:bg-muted"
            )}
          >
            Toți
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <EmployeeForm
            title="Angajat nou"
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
            saving={saving}
          />
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
            <button
              type="button"
              className="ml-auto text-xs underline"
              onClick={() => setError(null)}
            >
              Închide
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && employees.length === 0 && (
          <div className="space-y-3" aria-label="Se încarcă…">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-lg bg-muted animate-pulse"
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && employees.length === 0 && (
          <div className="text-center py-12">
            <Users
              className="h-10 w-10 mx-auto text-muted-foreground mb-3"
              aria-hidden="true"
            />
            <p className="text-muted-foreground text-sm">
              Niciun angajat înregistrat. Adăugați primul angajat.
            </p>
          </div>
        )}

        {/* Employees table */}
        {employees.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left border-b border-border">
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Nume
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell"
                  >
                    Funcție
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell"
                  >
                    Contract
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right"
                  >
                    Brut lunar
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    <span className="sr-only">Acțiuni</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((emp) => (
                  <Fragment key={emp.id}>
                  <tr
                    className={cn(
                      "bg-card hover:bg-muted/20 transition-colors",
                      emp.status === "inactive" && "opacity-60"
                    )}
                  >
                      <td className="px-4 py-3 font-medium text-foreground">
                        {emp.fullName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {emp.jobTitle ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {CONTRACT_TYPE_LABELS[emp.contractType]}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {formatCents(emp.baseSalaryCents, emp.currency)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {emp.status === "active" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                            <CheckCircle className="h-3 w-3" aria-hidden="true" />
                            Activ
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            <XCircle className="h-3 w-3" aria-hidden="true" />
                            Inactiv
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingId(editingId === emp.id ? null : emp.id)
                            }
                            aria-label={`Editează ${emp.fullName}`}
                            className={cn(
                              "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
                              "border border-border bg-background text-foreground hover:bg-muted transition-colors"
                            )}
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                            Edit
                          </button>
                          {emp.status === "active" ? (
                            <button
                              type="button"
                              onClick={() => void handleDeactivate(emp.id)}
                              disabled={saving}
                              aria-label={`Dezactivează ${emp.fullName}`}
                              className={cn(
                                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
                                "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors",
                                "disabled:opacity-50"
                              )}
                            >
                              <XCircle className="h-3 w-3" aria-hidden="true" />
                              Dezactivează
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleActivate(emp.id)}
                              disabled={saving}
                              aria-label={`Activează ${emp.fullName}`}
                              className={cn(
                                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
                                "border border-success/30 bg-success/10 text-success hover:bg-success/20 transition-colors",
                                "disabled:opacity-50"
                              )}
                            >
                              <CheckCircle className="h-3 w-3" aria-hidden="true" />
                              Activează
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editingId === emp.id && (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 bg-muted/30">
                          <EmployeeForm
                            title={`Editare: ${emp.fullName}`}
                            initial={getEditFormData(emp)}
                            onSave={(data) => handleEdit(emp.id, data)}
                            onCancel={() => setEditingId(null)}
                            saving={saving}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {employees.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            {employees.filter((e) => e.status === "active").length} activi ·{" "}
            {employees.filter((e) => e.status === "inactive").length} inactivi
          </p>
        )}
      </div>
    </AppShell>
  );
}
