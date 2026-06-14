/**
 * BUDGET-002: Pagina gestionare bugete FinDesk
 * Ruta: /app/fin/budget
 *
 * Secțiuni:
 *   1. KPI cards — total bugete active, total bugetat, realizat, % execuție medie
 *   2. Tabel bugete — toate bugetele tenant-ului cu progress bar
 *   3. Dialog creare buget nou
 *   4. Detaliu buget — linii cu comparație bugetat vs realizat
 */

import { useState, useEffect, useCallback } from "react";
import {
  PieChart,
  Plus,
  Loader2,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  X,
  ChevronLeft,
  Bell,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  listBudgets,
  createBudget,
  getBudget,
  getBudgetReport,
  checkBudgetAlerts,
  type FinBudget,
  type FinBudgetLine,
  type BudgetReport,
  type CreateBudgetInput,
} from "@/lib/api/finBudget";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency: "MDL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function pctColor(pct: number | null): string {
  if (pct === null) return "bg-muted";
  if (pct >= 100) return "bg-red-500 dark:bg-red-600";
  if (pct >= 80) return "bg-amber-400 dark:bg-amber-500";
  return "bg-green-500 dark:bg-green-600";
}

function statusBadge(status: string): JSX.Element {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Ciornă", cls: "bg-muted text-muted-foreground" },
    active: { label: "Activ", cls: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" },
    closed: { label: "Închis", cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" },
  };
  const m = map[status] ?? map.draft;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", m.cls)}>
      {m.label}
    </span>
  );
}

const CURRENT_YEAR = new Date().getFullYear();

// ─── Dialog creare buget ──────────────────────────────────────────────────────

interface CreateBudgetDialogProps {
  onClose: () => void;
  onCreated: (b: FinBudget) => void;
}

function CreateBudgetDialog({ onClose, onCreated }: CreateBudgetDialogProps): JSX.Element {
  const [name, setName] = useState("");
  const [fiscalYear, setFiscalYear] = useState(CURRENT_YEAR);
  const [department, setDepartment] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Numele bugetului este obligatoriu."); return; }
    setSaving(true);
    setError(null);
    try {
      const input: CreateBudgetInput = {
        name: name.trim(),
        fiscalYear,
        department: department.trim() || null,
        notes: notes.trim() || null,
        status: "draft",
        lines: [
          { category: "rent", label: "Chirie", budgetedCents: 0, displayOrder: 0 },
          { category: "utilities", label: "Utilități", budgetedCents: 0, displayOrder: 1 },
          { category: "salaries", label: "Salarii", budgetedCents: 0, displayOrder: 2 },
          { category: "marketing", label: "Marketing", budgetedCents: 0, displayOrder: 3 },
          { category: "supplies", label: "Materiale", budgetedCents: 0, displayOrder: 4 },
        ],
      };
      const { budget } = await createBudget(input);
      onCreated(budget);
    } catch {
      setError("Eroare la crearea bugetului. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-budget-title"
    >
      <div className="w-full max-w-md rounded-xl bg-background border border-border shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="create-budget-title" className="text-lg font-semibold text-foreground">
            Buget nou
          </h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Închide dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div role="alert" className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2 bg-destructive/10">
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="budget-name" className="text-sm font-medium text-foreground">
              Denumire buget <span className="text-destructive" aria-hidden>*</span>
            </label>
            <input
              id="budget-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Buget operațional 2026"
              required
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="budget-year" className="text-sm font-medium text-foreground">
                An fiscal
              </label>
              <input
                id="budget-year"
                type="number"
                value={fiscalYear}
                min={2020}
                max={2100}
                onChange={(e) => setFiscalYear(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="budget-dept" className="text-sm font-medium text-foreground">
                Departament
              </label>
              <input
                id="budget-dept"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="ex: Marketing"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="budget-notes" className="text-sm font-medium text-foreground">
              Note
            </label>
            <textarea
              id="budget-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Informații suplimentare despre acest buget…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Bugetul va fi creat cu 5 linii implicite (chirie, utilități, salarii, marketing, materiale) pe care le poți edita ulterior.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-md border border-border text-sm text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 inline-flex items-center gap-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Creează buget
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Detaliu buget ────────────────────────────────────────────────────────────

interface BudgetDetailProps {
  budgetId: string;
  onBack: () => void;
}

function BudgetDetail({ budgetId, onBack }: BudgetDetailProps): JSX.Element {
  const [data, setData] = useState<{ budget: FinBudget; lines: FinBudgetLine[] } | null>(null);
  const [report, setReport] = useState<BudgetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, rep] = await Promise.all([getBudget(budgetId), getBudgetReport(budgetId)]);
      setData(detail);
      setReport(rep);
    } catch {
      // silently fail — show empty
    } finally {
      setLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCheckAlerts() {
    try {
      const result = await checkBudgetAlerts(budgetId);
      if (result.count > 0) {
        setAlertMsg(`${result.count} alertă(e) trimisă(e): ${result.alertsCreated.join(", ")}`);
      } else {
        setAlertMsg("Niciun buget nu a atins pragul de alertă (80%).");
      }
    } catch {
      setAlertMsg("Eroare la verificarea alertelor.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
      </div>
    );
  }

  if (!data || !report) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Bugetul nu a putut fi încărcat.
      </div>
    );
  }

  const { budget } = data;
  const execPct = report.totalBudgetedCents > 0
    ? Math.round((report.totalActualCents / report.totalBudgetedCents) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header detaliu */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Înapoi la lista de bugete"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{budget.name}</h2>
            <p className="text-sm text-muted-foreground">
              An fiscal {budget.fiscalYear}
              {budget.department && ` · ${budget.department}`}
              &nbsp;· {statusBadge(budget.status)}
            </p>
          </div>
        </div>
        <button
          onClick={() => void handleCheckAlerts()}
          className="h-8 inline-flex items-center gap-1.5 px-3 rounded-md border border-border text-xs text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Verifică alerte depășire buget"
        >
          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          Verifică alerte
        </button>
      </div>

      {alertMsg && (
        <div
          role="status"
          className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm text-amber-800 dark:text-amber-300"
        >
          {alertMsg}
        </div>
      )}

      {/* KPI summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total bugetat", value: formatMDL(report.totalBudgetedCents) },
          { label: "Realizat", value: formatMDL(report.totalActualCents) },
          { label: "Rămas", value: formatMDL(report.totalRemainingCents) },
          { label: "Execuție", value: `${execPct}%` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold text-foreground mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabel linii */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Categorie</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Bugetat</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Realizat</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">Rămas</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground w-32">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {report.lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nicio linie de buget definită.
                </td>
              </tr>
            ) : (
              report.lines.map((line) => (
                <tr key={line.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{line.label}</p>
                    <p className="text-xs text-muted-foreground">{line.category}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatMDL(line.budgetedCents)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatMDL(line.actualCents)}
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-right tabular-nums font-medium",
                    line.remainingCents < 0 ? "text-red-700 dark:text-red-400" : "text-foreground"
                  )}>
                    {formatMDL(line.remainingCents)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", pctColor(line.pct))}
                          style={{ width: `${Math.min(100, line.pct ?? 0)}%` }}
                          role="progressbar"
                          aria-valuenow={line.pct ?? 0}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${line.label}: ${line.pct ?? 0}% executat`}
                        />
                      </div>
                      <span className={cn(
                        "text-xs tabular-nums w-10 text-right",
                        (line.pct ?? 0) >= 100
                          ? "text-red-700 dark:text-red-400 font-semibold"
                          : (line.pct ?? 0) >= 80
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground"
                      )}>
                        {line.pct !== null ? `${line.pct}%` : "—"}
                      </span>
                      {(line.pct ?? 0) >= 100 && (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 flex-shrink-0" aria-label="Depășire buget" />
                      )}
                      {(line.pct ?? 0) >= 80 && (line.pct ?? 0) < 100 && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" aria-label="Avertisment buget 80%" />
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Componentă principală ────────────────────────────────────────────────────

export function BudgetPage(): JSX.Element {
  const { status } = useSession();
  const [budgets, setBudgets] = useState<FinBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBudgets();
      setBudgets(data.budgets);
    } catch {
      setError("Nu am putut încărca bugetele. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") {
    return (
      <AppShell pageTitle="Bugete">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  // KPI cards
  const activeBudgets = budgets.filter((b) => b.status === "active");

  return (
    <AppShell pageTitle="Bugete">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <PieChart className="h-6 w-6 text-primary" aria-hidden="true" />
            <div>
              <h1 className="text-xl font-semibold text-foreground">Bugete</h1>
              <p className="text-sm text-muted-foreground">
                Gestionează bugetele anuale și urmărește execuția față de cheltuielile reale.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="h-9 inline-flex items-center gap-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Creează buget nou"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Buget nou
          </button>
        </div>

        {/* Dacă avem un buget selectat → detaliu */}
        {selectedId ? (
          <BudgetDetail budgetId={selectedId} onBack={() => setSelectedId(null)} />
        ) : (
          <>
            {/* KPI cards */}
            {!loading && budgets.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Bugete active</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{activeBudgets.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Total bugete</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{budgets.length}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">An curent</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {budgets.filter((b) => b.fiscalYear === CURRENT_YEAR).length}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-green-600" aria-hidden="true" />
                    Activitate
                  </p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                    {activeBudgets.length > 0 ? "ON" : "—"}
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
              </div>
            )}

            {/* Tabel bugete */}
            {!loading && budgets.length === 0 && (
              <div className="rounded-lg border border-border px-6 py-12 text-center space-y-3">
                <CheckCircle className="h-10 w-10 text-muted-foreground mx-auto" aria-hidden="true" />
                <p className="text-foreground font-medium">Niciun buget definit</p>
                <p className="text-sm text-muted-foreground">
                  Creează primul buget pentru a urmări cheltuielile față de plan.
                </p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Buget nou
                </button>
              </div>
            )}

            {!loading && budgets.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Denumire</th>
                      <th scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">An fiscal</th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Departament</th>
                      <th scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                      <th scope="col" className="px-4 py-3 text-center font-medium text-muted-foreground">Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {budgets.map((b) => (
                      <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSelectedId(b.id)}
                            className="text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          >
                            {b.name}
                          </button>
                          {b.notes && (
                            <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">{b.notes}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-foreground">{b.fiscalYear}</td>
                        <td className="px-4 py-3 text-muted-foreground">{b.department ?? "—"}</td>
                        <td className="px-4 py-3 text-center">{statusBadge(b.status)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedId(b.id)}
                            className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                            aria-label={`Deschide bugetul ${b.name}`}
                          >
                            Deschide
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialog creare buget */}
      {showCreate && (
        <CreateBudgetDialog
          onClose={() => setShowCreate(false)}
          onCreated={(b) => {
            setBudgets((prev) => [b, ...prev]);
            setShowCreate(false);
            setSelectedId(b.id);
          }}
        />
      )}
    </AppShell>
  );
}
