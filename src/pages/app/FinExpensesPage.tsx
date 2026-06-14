/**
 * SPEND-003: FinDesk — Pagina Cheltuieli /app/fin/expenses
 *
 * KPI cards + tabel filtrat paginat + grafic top furnizori + dialog creare/editare.
 * vatDeductible este OBLIGATORIU la creare (FIN-CORE regula #1).
 */
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus,
  Download,
  Loader2,
  AlertTriangle,
  Check,
  X,
  Receipt,
  TrendingDown,
  Clock,
  PercentSquare,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listExpenses,
  createExpense,
  updateExpense,
  approveExpense,
  deleteExpense,
  getExpenseSummary,
  type FinExpense,
  type ExpenseCategory,
  type ExpenseStatus,
  type CreateExpenseInput,
} from "@/lib/api/finExpenses";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: "Chirie",
  utilities: "Utilități",
  salaries: "Salarii",
  marketing: "Marketing",
  supplies: "Materiale",
  software: "Software/Licențe",
  maintenance: "Întreținere",
  other: "Altele",
};

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  draft: "În așteptare",
  approved: "Aprobat",
  rejected: "Respins",
  paid: "Plătit",
};

const STATUS_COLORS: Record<ExpenseStatus, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  paid: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
};

const CATEGORIES: { value: ExpenseCategory | ""; label: string }[] = [
  { value: "", label: "Toate categoriile" },
  { value: "rent", label: "Chirie" },
  { value: "utilities", label: "Utilități" },
  { value: "salaries", label: "Salarii" },
  { value: "marketing", label: "Marketing" },
  { value: "supplies", label: "Materiale" },
  { value: "software", label: "Software/Licențe" },
  { value: "maintenance", label: "Întreținere" },
  { value: "other", label: "Altele" },
];

const STATUSES: { value: ExpenseStatus | ""; label: string }[] = [
  { value: "", label: "Toate statusurile" },
  { value: "draft", label: "În așteptare" },
  { value: "approved", label: "Aprobat" },
  { value: "rejected", label: "Respins" },
  { value: "paid", label: "Plătit" },
];

const PAGE_SIZE = 20;

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(cents: number, currency = "MDL"): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  colorClass?: string;
  loading?: boolean;
}

function KpiCard({ label, value, icon: Icon, colorClass = "text-primary", loading }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
      <div className={cn("p-2 rounded-md bg-muted", colorClass)}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        {loading ? (
          <div className="h-5 w-20 bg-muted rounded animate-pulse mt-1" />
        ) : (
          <p className="text-lg font-semibold truncate">{value}</p>
        )}
      </div>
    </div>
  );
}

// ─── Expense Form Dialog ──────────────────────────────────────────────────────

interface ExpenseFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: FinExpense | null;
}

function ExpenseFormDialog({ open, onClose, onSaved, initial }: ExpenseFormDialogProps) {
  const [category, setCategory] = useState<ExpenseCategory>(initial?.category ?? "other");
  const [amountStr, setAmountStr] = useState(initial ? String(initial.amountCents / 100) : "");
  const [vatStr, setVatStr] = useState(initial ? String(initial.vatAmountCents / 100) : "0");
  const [vatDeductible, setVatDeductible] = useState<boolean | null>(
    initial ? initial.vatDeductible : null
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [vendorName, setVendorName] = useState(initial?.vendorName ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [expenseDate, setExpenseDate] = useState(
    initial?.expenseDate ?? new Date().toISOString().slice(0, 10)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setCategory(initial?.category ?? "other");
      setAmountStr(initial ? String(initial.amountCents / 100) : "");
      setVatStr(initial ? String(initial.vatAmountCents / 100) : "0");
      setVatDeductible(initial ? initial.vatDeductible : null);
      setDescription(initial?.description ?? "");
      setVendorName(initial?.vendorName ?? "");
      setReference(initial?.reference ?? "");
      setExpenseDate(initial?.expenseDate ?? new Date().toISOString().slice(0, 10));
      setError(null);
    }
  }, [open, initial]);

  async function handleSave() {
    setError(null);

    // Validate vatDeductible — OBLIGATORIU (FIN-CORE regula #1)
    if (vatDeductible === null) {
      setError("vat_deductible_required: Selectați dacă TVA este deductibil sau nu.");
      return;
    }

    const amountCents = Math.round(parseFloat(amountStr || "0") * 100);
    if (!amountStr || amountCents <= 0) {
      setError("Suma trebuie să fie mai mare decât 0.");
      return;
    }

    const payload: CreateExpenseInput = {
      category,
      amountCents,
      vatDeductible,
      vatAmountCents: Math.round(parseFloat(vatStr || "0") * 100),
      description: description || undefined,
      vendorName: vendorName || undefined,
      reference: reference || undefined,
      expenseDate,
    };

    setSaving(true);
    try {
      if (initial) {
        await updateExpense(initial.id, payload);
      } else {
        await createExpense(payload);
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Eroare necunoscută.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Editează cheltuiala" : "Adaugă cheltuiala"}
    >
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-xl p-6 mx-4 max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">
            {initial ? "Editează cheltuiala" : "Cheltuială nouă"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Închide"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Categorie */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="exp-category">
              Categorie <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <select
              id="exp-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CATEGORIES.filter((c) => c.value !== "").map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Furnizor */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="exp-vendor">
              Furnizor
            </label>
            <input
              id="exp-vendor"
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="ex. Lidl SRL"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Suma + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="exp-amount">
                Suma (MDL) <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <input
                id="exp-amount"
                type="number"
                min="0"
                step="0.01"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="exp-date">
                Data <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <input
                id="exp-date"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* TVA suma */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="exp-vat">
              Suma TVA (MDL)
            </label>
            <input
              id="exp-vat"
              type="number"
              min="0"
              step="0.01"
              value={vatStr}
              onChange={(e) => setVatStr(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* TVA deductibil — OBLIGATORIU (FIN-CORE regula #1) */}
          <fieldset>
            <legend className="block text-sm font-medium mb-2">
              TVA deductibil{" "}
              <span className="text-destructive" aria-hidden="true">*</span>
              <span className="text-xs text-muted-foreground ml-1">(obligatoriu)</span>
            </legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer min-h-[44px] px-3 py-2 rounded-md border border-border hover:bg-muted">
                <input
                  type="radio"
                  name="vatDeductible"
                  value="true"
                  checked={vatDeductible === true}
                  onChange={() => setVatDeductible(true)}
                  className="accent-primary"
                />
                <span className="text-sm">Deductibil</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer min-h-[44px] px-3 py-2 rounded-md border border-border hover:bg-muted">
                <input
                  type="radio"
                  name="vatDeductible"
                  value="false"
                  checked={vatDeductible === false}
                  onChange={() => setVatDeductible(false)}
                  className="accent-primary"
                />
                <span className="text-sm">Nedeductibil</span>
              </label>
            </div>
          </fieldset>

          {/* Referință */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="exp-ref">
              Referință document
            </label>
            <input
              id="exp-ref"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="ex. Factură #INV-2026-001"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Descriere */}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="exp-desc">
              Descriere
            </label>
            <textarea
              id="exp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Note adiționale..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive px-3 py-2 text-sm" role="alert">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted min-h-[44px]"
          >
            Anulează
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 min-h-[44px]"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {initial ? "Salvează" : "Adaugă cheltuiala"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Top Vendors Chart ────────────────────────────────────────────────────────

interface VendorBar {
  name: string;
  totalCents: number;
}

interface TopVendorsChartProps {
  vendors: VendorBar[];
}

function TopVendorsChart({ vendors }: TopVendorsChartProps) {
  if (vendors.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Nu există date de furnizori.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={vendors}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 80 }}
      >
        <XAxis
          type="number"
          tickFormatter={(v: number) => fmt(v)}
          className="text-xs text-muted-foreground"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={76}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
        />
        <Tooltip
          formatter={(value) => [fmt(Number(value)), "Total"]}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            borderColor: "hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Bar
          dataKey="totalCents"
          fill="hsl(var(--primary))"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function FinExpensesPage() {
  const { status: sessionStatus, data: session } = useSession();
  const { navigate } = useRouter();

  // Data state
  const [expenses, setExpenses] = useState<FinExpense[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [summary, setSummary] = useState<{
    grandTotalCents: number;
    vatDeductibleTotal: number;
    draftCount: number;
    approvedCount: number;
  }>({ grandTotalCents: 0, vatDeductibleTotal: 0, draftCount: 0, approvedCount: 0 });
  const [vendors, setVendors] = useState<VendorBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [category, setCategory] = useState<ExpenseCategory | "">("");
  const [status, setStatus] = useState<ExpenseStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [page, setPage] = useState(1);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FinExpense | null>(null);

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const canApprove = session?.user.role === "admin" || session?.user.role === "manager";

  const isDirectorOrAdmin = canApprove;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth redirect
  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  // Fetch expenses
  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof listExpenses>[0] = {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      if (category) params.category = category;
      if (status) params.status = status;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await listExpenses(params);
      const filtered = vendorSearch
        ? res.items.filter((e) =>
            (e.vendorName ?? "").toLowerCase().includes(vendorSearch.toLowerCase())
          )
        : res.items;
      setExpenses(filtered);
      setTotalItems(res.items.length);
    } catch {
      setError("Nu pot încărca cheltuielile. Verificați conexiunea.");
    } finally {
      setLoading(false);
    }
  }, [page, category, status, dateFrom, dateTo, vendorSearch]);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await getExpenseSummary();
      const grandTotalCents = res.grandTotalCents ?? 0;
      const vatDeductibleTotal = res.vatDeductibleTotal ?? 0;
      // Count statuses from expenses already loaded or fetch separately
      const drafts = expenses.filter((e) => e.status === "draft").length;
      const approved = expenses.filter((e) => e.status === "approved").length;
      setSummary({
        grandTotalCents,
        vatDeductibleTotal,
        draftCount: drafts,
        approvedCount: approved,
      });

      // Build top vendors from byCategory (use as fallback; ideally a dedicated endpoint)
      const vendorMap: Record<string, number> = {};
      for (const exp of expenses) {
        if (exp.vendorName) {
          vendorMap[exp.vendorName] = (vendorMap[exp.vendorName] ?? 0) + exp.amountCents;
        }
      }
      const vendorBars: VendorBar[] = Object.entries(vendorMap)
        .map(([name, totalCents]) => ({ name, totalCents }))
        .sort((a, b) => b.totalCents - a.totalCents)
        .slice(0, 5);
      setVendors(vendorBars);
    } catch {
      // Summary is non-blocking
    } finally {
      setSummaryLoading(false);
    }
  }, [expenses]);

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      void fetchExpenses();
    }
  }, [fetchExpenses, sessionStatus]);

  // Update summary when expenses load
  useEffect(() => {
    if (sessionStatus === "authenticated" && expenses.length >= 0) {
      void fetchSummary();
    }
  }, [fetchSummary, sessionStatus, expenses]);

  // Debounce vendor search
  function handleVendorSearch(value: string) {
    setVendorSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
    }, 300);
  }

  function handleFilterChange() {
    setPage(1);
  }

  // Approve
  async function handleApprove(id: string) {
    setActionLoading(id);
    try {
      await approveExpense(id);
      void fetchExpenses();
    } catch {
      // Silently fail — row will stay unchanged
    } finally {
      setActionLoading(null);
    }
  }

  // Reject (soft delete)
  async function handleReject(id: string) {
    setActionLoading(id);
    try {
      await deleteExpense(id);
      void fetchExpenses();
    } catch {
      // Silently fail
    } finally {
      setActionLoading(null);
    }
  }

  // CSV Export
  function handleExport() {
    const header = "Data,Furnizor,Categorie,Suma MDL,TVA MDL,TVA Deductibil,Status,Referinta";
    const rows = expenses.map((e) =>
      [
        e.expenseDate,
        `"${e.vendorName ?? ""}"`,
        CATEGORY_LABELS[e.category],
        (e.amountCents / 100).toFixed(2),
        (e.vatAmountCents / 100).toFixed(2),
        e.vatDeductible ? "Da" : "Nu",
        STATUS_LABELS[e.status],
        `"${e.reference ?? ""}"`,
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const approvalRate =
    summary.approvedCount + summary.draftCount > 0
      ? Math.round(
          (summary.approvedCount / (summary.approvedCount + summary.draftCount)) * 100
        )
      : 0;

  return (
    <AppShell pageTitle="Cheltuieli" pageDescription="Gestionare cheltuieli FinDesk">
      <div className="max-w-7xl mx-auto space-y-6 p-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Cheltuieli</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestionați cheltuielile organizației cu TVA deductibil și flux de aprobare.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-border hover:bg-muted min-h-[44px]"
              aria-label="Exportă cheltuieli CSV"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </button>
            <button
              onClick={() => {
                setEditTarget(null);
                setDialogOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px]"
              aria-label="Adaugă cheltuială nouă"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Cheltuială nouă
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total cheltuieli (luna curentă)"
            value={fmt(summary.grandTotalCents)}
            icon={Receipt}
            loading={summaryLoading}
          />
          <KpiCard
            label="TVA deductibil"
            value={fmt(summary.vatDeductibleTotal)}
            icon={TrendingDown}
            colorClass="text-emerald-600 dark:text-emerald-400"
            loading={summaryLoading}
          />
          <KpiCard
            label="În așteptare (draft)"
            value={String(summary.draftCount)}
            icon={Clock}
            colorClass="text-amber-600 dark:text-amber-400"
            loading={summaryLoading}
          />
          <KpiCard
            label="Rată aprobare"
            value={`${approvalRate}%`}
            icon={PercentSquare}
            colorClass="text-sky-600 dark:text-sky-400"
            loading={summaryLoading}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Main table panel */}
          <div className="xl:col-span-2 space-y-4">
            {/* Filters */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Categorie */}
                <div>
                  <label className="sr-only" htmlFor="filter-category">Categorie</label>
                  <select
                    id="filter-category"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value as ExpenseCategory | "");
                      handleFilterChange();
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="sr-only" htmlFor="filter-status">Status</label>
                  <select
                    id="filter-status"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value as ExpenseStatus | "");
                      handleFilterChange();
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date from */}
                <div>
                  <label className="sr-only" htmlFor="filter-from">De la</label>
                  <input
                    id="filter-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      handleFilterChange();
                    }}
                    placeholder="De la"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Date to */}
                <div>
                  <label className="sr-only" htmlFor="filter-to">Până la</label>
                  <input
                    id="filter-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      handleFilterChange();
                    }}
                    placeholder="Până la"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Vendor search */}
              <div className="mt-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  type="text"
                  value={vendorSearch}
                  onChange={(e) => handleVendorSearch(e.target.value)}
                  placeholder="Caută după furnizor..."
                  className="w-full pl-9 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Caută după furnizor"
                />
              </div>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {error ? (
                <div className="flex items-center gap-2 p-6 text-destructive text-sm" role="alert">
                  <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {error}
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" aria-label="Se încarcă..." />
                </div>
              ) : expenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Receipt className="h-12 w-12 mb-3 opacity-30" aria-hidden="true" />
                  <p className="text-sm font-medium">Nicio cheltuiala înregistrată</p>
                  <p className="text-xs mt-1">Adaugă prima cheltuiala cu butonul de mai sus.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Furnizor</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categorie</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sumă</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">TVA</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acțiuni</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {expenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {exp.expenseDate}
                          </td>
                          <td className="px-4 py-3 max-w-[140px]">
                            <span className="truncate block font-medium">
                              {exp.vendorName ?? "—"}
                            </span>
                            {exp.reference && (
                              <span className="text-xs text-muted-foreground truncate block">
                                {exp.reference}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {CATEGORY_LABELS[exp.category]}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium">
                            {fmt(exp.amountCents, exp.currency)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            {exp.vatDeductible ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                {fmt(exp.vatAmountCents, exp.currency)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex px-2 py-0.5 text-xs rounded-full font-medium",
                                STATUS_COLORS[exp.status]
                              )}
                            >
                              {STATUS_LABELS[exp.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {/* Edit */}
                              <button
                                onClick={() => {
                                  setEditTarget(exp);
                                  setDialogOpen(true);
                                }}
                                className="p-2 rounded-md hover:bg-muted text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                                aria-label={`Editează cheltuiala ${exp.vendorName ?? exp.id}`}
                                disabled={exp.status === "approved" || exp.status === "paid"}
                              >
                                <span className="text-xs">Edit</span>
                              </button>

                              {/* Approve */}
                              {isDirectorOrAdmin && exp.status === "draft" && (
                                <button
                                  onClick={() => handleApprove(exp.id)}
                                  disabled={actionLoading === exp.id}
                                  className="p-2 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                  aria-label={`Aprobă cheltuiala ${exp.vendorName ?? exp.id}`}
                                >
                                  {actionLoading === exp.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                  )}
                                </button>
                              )}

                              {/* Reject */}
                              {exp.status === "draft" && (
                                <button
                                  onClick={() => handleReject(exp.id)}
                                  disabled={actionLoading === exp.id}
                                  className="p-2 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
                                  aria-label={`Respinge cheltuiala ${exp.vendorName ?? exp.id}`}
                                >
                                  {actionLoading === exp.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <X className="h-4 w-4" aria-hidden="true" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
                  <p className="text-xs text-muted-foreground">
                    Pagina {page} din {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="p-2 rounded-md border border-border hover:bg-muted disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label="Pagina anterioară"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="p-2 rounded-md border border-border hover:bg-muted disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label="Pagina următoare"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Top Vendors Chart */}
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold mb-4">Top 5 furnizori</h2>
              <TopVendorsChart vendors={vendors} />
            </div>

            {/* Summary by category */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold mb-3">Categorii cheltuieli</h2>
              {summaryLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-6 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {(["rent", "utilities", "salaries", "marketing", "supplies", "software", "maintenance", "other"] as ExpenseCategory[]).map(
                    (cat) => {
                      const catExpenses = expenses.filter((e) => e.category === cat);
                      const total = catExpenses.reduce((s, e) => s + e.amountCents, 0);
                      if (total === 0) return null;
                      return (
                        <div key={cat} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{CATEGORY_LABELS[cat]}</span>
                          <span className="font-mono font-medium">{fmt(total)}</span>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Form Dialog */}
      <ExpenseFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={fetchExpenses}
        initial={editTarget}
      />
    </AppShell>
  );
}
