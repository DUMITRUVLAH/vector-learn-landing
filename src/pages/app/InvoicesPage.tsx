import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Plus,
  FileText,
  CheckCircle2,
  X,
  Download,
  Receipt,
  CalendarDays,
  PlayCircle,
  FileCode,
  Table2,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listInvoices,
  createInvoice,
  downloadInvoicePdf,
  updateInvoiceStatus,
  listSubscriptions,
  updateSubscription,
  runBilling,
  downloadEfacturaXml,
  downloadSagaCsv,
  type Invoice,
  type InvoiceStatus,
  type InvoiceCurrency,
  type Subscription,
  type SubscriptionStatus,
} from "@/lib/api/invoices";
import { listStudents, type Student } from "@/lib/api/students";
import { listPayments, type Payment } from "@/lib/api/payments";
import { getTenantSettings, updateTenantSettings, type TenantSettings } from "@/lib/api/tenantSettings";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SubscriptionTable } from "@/components/invoices/SubscriptionTable";
import { AddSubscriptionModal } from "@/components/invoices/AddSubscriptionModal";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const STATUS_META: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft: { label: "Ciornă", cls: "bg-muted text-muted-foreground" },
  issued: { label: "Emisă", cls: "bg-primary/15 text-primary" },
  paid: { label: "Plătită", cls: "bg-success/15 text-success" },
  cancelled: { label: "Anulată", cls: "bg-destructive/15 text-destructive" },
};

function formatCurrency(cents: number, currency: InvoiceCurrency = "RON"): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type Tab = "invoices" | "subscriptions" | "settings";

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────

export function InvoicesPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("invoices");

  const [items, setItems] = useState<Invoice[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddSub, setShowAddSub] = useState(false);
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | "">("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [runningBilling, setRunningBilling] = useState(false);
  const [tenantSettings, setTenantSettings] = useState<TenantSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [invoicePrefixDraft, setInvoicePrefixDraft] = useState("");

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inv, sub, stu, pay] = await Promise.all([
        listInvoices({
          status: filterStatus || undefined,
          month: filterMonth || undefined,
        }),
        listSubscriptions(),
        // Server caps limit at 100 (see students route Zod schema). Requesting 200
        // returned a 400 ZodError → page wrongly showed "Niciun elev activ".
        listStudents({ status: "active", limit: 100 }),
        listPayments(),
      ]);
      setItems(inv.items);
      setSubs(sub.items);
      setStudents(stu.items);
      setPayments(pay.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterMonth]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Load tenant settings when settings tab is active
  useEffect(() => {
    if (activeTab !== "settings" || tenantSettings) return;
    setSettingsLoading(true);
    getTenantSettings()
      .then((s) => {
        setTenantSettings(s);
        setInvoicePrefixDraft(s.invoicePrefix);
      })
      .catch(() => setToast({ kind: "error", message: "Nu pot încărca setările" }))
      .finally(() => setSettingsLoading(false));
  }, [activeTab, tenantSettings]);

  const handleMarkPaid = async (id: string) => {
    try {
      await updateInvoiceStatus(id, "paid");
      setToast({ kind: "success", message: "Factură marcată ca plătită" });
      void fetchAll();
    } catch {
      setToast({ kind: "error", message: "Nu pot actualiza statusul" });
    }
  };

  const handleDownloadPdf = (id: string, _invoiceNumber: string) => {
    // Triggers direct HTML file download — browser can print to PDF via Ctrl+P
    downloadInvoicePdf(id);
  };

  const handleSubStatusChange = async (id: string, status: SubscriptionStatus) => {
    try {
      await updateSubscription(id, { status });
      setToast({ kind: "success", message: "Abonament actualizat" });
      void fetchAll();
    } catch {
      setToast({ kind: "error", message: "Nu pot actualiza abonamentul" });
    }
  };

  const handleRunBilling = async () => {
    setRunningBilling(true);
    try {
      const result = await runBilling();
      setToast({
        kind: "success",
        message: `Facturare rulată: ${result.processed} abonament(e) procesate, ${result.invoicesCreated.length} facturi create`,
      });
      void fetchAll();
    } catch {
      setToast({ kind: "error", message: "Eroare la rularea facturării" });
    } finally {
      setRunningBilling(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const prefix = invoicePrefixDraft.trim();
    if (!prefix) return;
    setSettingsSaving(true);
    try {
      const updated = await updateTenantSettings({ invoicePrefix: prefix });
      setTenantSettings(updated);
      setInvoicePrefixDraft(updated.invoicePrefix);
      setToast({ kind: "success", message: "Setări salvate" });
    } catch {
      setToast({ kind: "error", message: "Nu pot salva setările" });
    } finally {
      setSettingsSaving(false);
    }
  };

  // Summary totals
  const totalIssued = items
    .filter((i) => i.status === "issued")
    .reduce((s, i) => s + i.amountCents, 0);
  const totalPaid = items
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.amountCents, 0);
  const totalDraft = items.filter((i) => i.status === "draft").length;
  const activeSubs = subs.filter((s) => s.status === "active").length;

  return (
    <AppShell
      pageTitle="Facturi"
      pageDescription={`${items.length} facturi · ${activeSubs} abonamente active`}
      actions={
        activeTab === "invoices" ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Crează factură
          </button>
        ) : (
          <div className="inline-flex gap-2">
            <button
              type="button"
              onClick={handleRunBilling}
              disabled={runningBilling}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-sm font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              {runningBilling ? "Se rulează…" : "Rulează facturare"}
            </button>
            <button
              type="button"
              onClick={() => setShowAddSub(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adaugă abonament
            </button>
          </div>
        )
      }
    >
      {/* Summary cards */}
      <div className="grid sm:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label="Emise (neîncasate)"
          value={formatCurrency(totalIssued)}
          icon={FileText}
          cls="pastel-lavender"
        />
        <SummaryCard
          label="Plătite"
          value={formatCurrency(totalPaid)}
          icon={CheckCircle2}
          cls="pastel-mint"
        />
        <SummaryCard
          label="Ciorne"
          value={String(totalDraft)}
          icon={Receipt}
          cls="pastel-peach"
        />
        <SummaryCard
          label="Abonamente active"
          value={String(activeSubs)}
          icon={CalendarDays}
          cls="pastel-sky"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        <TabButton active={activeTab === "invoices"} onClick={() => setActiveTab("invoices")}>
          Facturi
        </TabButton>
        <TabButton active={activeTab === "subscriptions"} onClick={() => setActiveTab("subscriptions")}>
          Abonamente
        </TabButton>
        <TabButton active={activeTab === "settings"} onClick={() => setActiveTab("settings")}>
          Setări facturare
        </TabButton>
      </div>

      {activeTab === "invoices" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div>
              <label htmlFor="filter-status" className="sr-only">
                Filtrează după status
              </label>
              <select
                id="filter-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as InvoiceStatus | "")}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              >
                <option value="">Toate statusurile</option>
                <option value="draft">Ciornă</option>
                <option value="issued">Emisă</option>
                <option value="paid">Plătită</option>
                <option value="cancelled">Anulată</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-month" className="sr-only">
                Filtrează după lună
              </label>
              <input
                id="filter-month"
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                aria-label="Filtrează după lună"
              />
            </div>
            {(filterStatus || filterMonth) && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus("");
                  setFilterMonth("");
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Resetează
              </button>
            )}
            {/* Export SAGA CSV button — aligned right in filter bar */}
            <button
              type="button"
              onClick={() => downloadSagaCsv(filterMonth || undefined)}
              aria-label="Export SAGA CSV"
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
              Export SAGA CSV
            </button>
          </div>

          {/* Invoice Table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
                Se încarcă facturile…
              </div>
            ) : error ? (
              <div className="py-16 text-center text-sm text-destructive">{error}</div>
            ) : items.length === 0 ? (
              <div className="py-16 text-center">
                <FileText
                  className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3"
                  aria-hidden="true"
                />
                <p className="text-sm text-muted-foreground mb-4">Nicio factură găsită.</p>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Crează prima factură
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th
                        scope="col"
                        className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
                      >
                        Nr. Factură
                      </th>
                      <th
                        scope="col"
                        className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
                      >
                        Client
                      </th>
                      <th
                        scope="col"
                        className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
                      >
                        Sumă
                      </th>
                      <th
                        scope="col"
                        className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5 hidden md:table-cell"
                      >
                        Data emisă
                      </th>
                      <th
                        scope="col"
                        className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-4 py-2.5"
                      >
                        Acțiuni
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((inv) => {
                      const meta = STATUS_META[inv.status];
                      return (
                        <tr key={inv.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                            {inv.invoiceNumber}
                          </td>
                          <td className="px-4 py-3 font-medium">{inv.studentName}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {formatCurrency(inv.amountCents, inv.currency)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">
                            {formatDate(inv.issueDate)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                                meta.cls
                              )}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex gap-1.5 items-center">
                              <button
                                type="button"
                                onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)}
                                aria-label={`Descarcă PDF factură ${inv.invoiceNumber}`}
                                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-semibold hover:bg-muted/80"
                              >
                                <Download className="h-3 w-3" aria-hidden="true" />
                                PDF
                              </button>
                              {(inv.status === "issued" || inv.status === "paid") && (
                                <button
                                  type="button"
                                  onClick={() => downloadEfacturaXml(inv.id)}
                                  aria-label={`Descarcă e-Factura XML ${inv.invoiceNumber}`}
                                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-1 text-[11px] font-semibold hover:bg-primary/20"
                                >
                                  <FileCode className="h-3 w-3" aria-hidden="true" />
                                  e-Fact
                                </button>
                              )}
                              {(inv.status === "draft" || inv.status === "issued") && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkPaid(inv.id)}
                                  aria-label={`Marchează factură ${inv.invoiceNumber} ca plătită`}
                                  className="inline-flex items-center gap-1 rounded-md bg-success/10 text-success px-2 py-1 text-[11px] font-semibold hover:bg-success/20"
                                >
                                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                  Plătit
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "subscriptions" && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
              Se încarcă abonamentele…
            </div>
          ) : (
            <SubscriptionTable items={subs} onStatusChange={handleSubStatusChange} />
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="rounded-2xl border border-border bg-card p-6 max-w-lg">
          <h2 className="text-base font-semibold mb-1">Setări facturare</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Configurați seria facturilor emise de centrul dumneavoastră.
          </p>
          {settingsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Se încarcă…
            </div>
          ) : (
            <form onSubmit={(e) => { void handleSaveSettings(e); }} className="space-y-4">
              <div>
                <label htmlFor="invoice-prefix" className="block text-sm font-medium mb-1">
                  Prefix serie factură
                </label>
                <input
                  id="invoice-prefix"
                  type="text"
                  value={invoicePrefixDraft}
                  onChange={(e) => setInvoicePrefixDraft(e.target.value.toUpperCase())}
                  maxLength={20}
                  placeholder="VECT"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Facturile vor fi numerotate: <span className="font-mono font-semibold">{invoicePrefixDraft || "VECT"}-{new Date().getFullYear()}-0001</span>
                </p>
              </div>
              <button
                type="submit"
                disabled={settingsSaving || !invoicePrefixDraft.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {settingsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                Salvează
              </button>
            </form>
          )}
        </div>
      )}

      {/* Create invoice modal */}
      {showCreate && (
        <CreateInvoiceModal
          students={students}
          payments={payments}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            setToast({ kind: "success", message: "Factură creată cu succes" });
            void fetchAll();
          }}
          onError={(m) => setToast({ kind: "error", message: m })}
        />
      )}

      {/* Add subscription modal */}
      {showAddSub && (
        <AddSubscriptionModal
          students={students}
          onClose={() => setShowAddSub(false)}
          onSaved={() => {
            setShowAddSub(false);
            setToast({ kind: "success", message: "Abonament creat cu succes" });
            void fetchAll();
          }}
          onError={(m) => setToast({ kind: "error", message: m })}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}
    </AppShell>
  );
}

// ──────────────────────────────────────────────
// Summary card
// ──────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  cls,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  cls: string;
}) {
  return (
    <article className={cn("rounded-2xl border border-border p-5", cls)}>
      <Icon className="h-5 w-5 text-foreground/70 mb-2" aria-hidden="true" />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">
        {label}
      </p>
      <p className="text-2xl font-display font-bold tabular-nums mt-1">{value}</p>
    </article>
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
        "px-4 py-2 text-sm font-semibold border-b-2 transition-colors",
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
// Create invoice modal
// ──────────────────────────────────────────────

interface CreateInvoiceModalProps {
  students: Student[];
  payments: Payment[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}

function CreateInvoiceModal({
  students,
  payments,
  onClose,
  onSaved,
  onError,
}: CreateInvoiceModalProps) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [paymentId, setPaymentId] = useState<string>("");
  const [amount, setAmount] = useState(280);
  const [currency, setCurrency] = useState<InvoiceCurrency>("RON");
  const [series, setSeries] = useState("VECT");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const studentPayments = payments.filter((p) => p.studentId === studentId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    setSubmitting(true);
    try {
      await createInvoice({
        studentId,
        paymentId: paymentId || null,
        amountCents: Math.round(amount * 100),
        currency,
        series,
        notes: notes || null,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) onError(`Eroare ${err.status}: ${err.code}`);
      else onError("Nu pot crea factura");
    } finally {
      setSubmitting(false);
    }
  };

  if (students.length === 0) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Niciun elev disponibil"
      >
        <div
          className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
        <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
          <h2 className="text-base font-bold mb-3">Niciun elev activ</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Adaugă mai întâi un elev cu status „Activ" în secțiunea Elevi.
          </p>
          <button
            onClick={onClose}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Crează factură nouă"
    >
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-base font-bold">Factură nouă</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="rounded-md hover:bg-muted p-1"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          {/* Student */}
          <div>
            <label htmlFor="inv-student" className="block text-sm font-semibold mb-1.5">
              Elev
            </label>
            <select
              id="inv-student"
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                setPaymentId("");
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Link to payment (optional) */}
          {studentPayments.length > 0 && (
            <div>
              <label htmlFor="inv-payment" className="block text-sm font-semibold mb-1.5">
                Leagă de o plată (opțional)
              </label>
              <select
                id="inv-payment"
                value={paymentId}
                onChange={(e) => setPaymentId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— fără legătură —</option>
                {studentPayments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.description ?? "Plată"} ·{" "}
                    {new Intl.NumberFormat("ro-RO", {
                      style: "currency",
                      currency: p.currency,
                    }).format(p.amountCents / 100)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Amount + currency */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label htmlFor="inv-amount" className="block text-sm font-semibold mb-1.5">
                Sumă
              </label>
              <input
                id="inv-amount"
                type="number"
                min={0}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="inv-currency" className="block text-sm font-semibold mb-1.5">
                Monedă
              </label>
              <select
                id="inv-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as InvoiceCurrency)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="RON">RON</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {/* Series */}
          <div>
            <label htmlFor="inv-series" className="block text-sm font-semibold mb-1.5">
              Serie
            </label>
            <input
              id="inv-series"
              type="text"
              maxLength={20}
              value={series}
              onChange={(e) => setSeries(e.target.value.toUpperCase())}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              placeholder="VECT"
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="inv-notes" className="block text-sm font-semibold mb-1.5">
              Note (opțional)
            </label>
            <input
              id="inv-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: Abonament lunar engleza"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={submitting || !studentId}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Se creează…" : "Crează factură"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
