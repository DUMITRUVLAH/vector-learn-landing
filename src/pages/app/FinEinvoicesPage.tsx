/**
 * EINV-003: UI e-Factura Moldova — panou integrare SFS
 *
 * Ruta: /app/fin/einvoices
 *
 * Secțiuni:
 * 1. Lista facturilor electronice trimise la SFS (fin_einvoices)
 *    - badge status, data trimitere, serial SFS
 *    - butoane Sincronizează / Anulează per rând
 * 2. Panou configurare SFS
 *    - IDNO, cont bancar, environment, credențiale
 *
 * Design: Vector 365 tokens, dark mode parity, WCAG AA.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Settings2,
  RefreshCw,
  XCircle,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  Ban,
  Eye,
  EyeOff,
  Save,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import {
  getSfsSettings,
  upsertSfsSettings,
  listEinvoices,
  syncEinvoice,
  cancelEinvoice,
  type SfsSettings,
  type FinEinvoice,
  type EinvoiceStatus,
  type SfsEnvironment,
  type UpsertSfsSettingsInput,
} from "@/lib/api/finEinvoices";

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_META: Record<
  EinvoiceStatus,
  { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    label: "Așteptare",
    cls: "bg-muted text-muted-foreground",
    icon: Clock,
  },
  sent: {
    label: "Trimisă",
    cls: "bg-primary/15 text-primary",
    icon: Send,
  },
  accepted: {
    label: "Acceptată",
    cls: "bg-success/15 text-success",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Respinsă",
    cls: "bg-destructive/15 text-destructive",
    icon: AlertCircle,
  },
  cancelled: {
    label: "Anulată",
    cls: "bg-muted text-muted-foreground",
    icon: Ban,
  },
};

function StatusBadge({ status }: { status: EinvoiceStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        meta.cls
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

// ─── Environment labels ───────────────────────────────────────────────────────

const ENV_LABELS: Record<SfsEnvironment, string> = {
  mock: "Mock (testare locală, fără apeluri reale)",
  test: "Test (sandbox SFS: api-test.fisc.md)",
  prod: "Producție (real: api.fisc.md)",
};

// ─── Date format ──────────────────────────────────────────────────────────────

function formatDt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  kind: "success" | "error";
  message: string;
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "list" | "settings";

export function FinEinvoicesPage() {
  const { status: sessionStatus } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("list");

  // List state
  const [items, setItems] = useState<FinEinvoice[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Settings state
  const [settings, setSettings] = useState<SfsSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [formIdno, setFormIdno] = useState("");
  const [formBank, setFormBank] = useState("");
  const [formEnv, setFormEnv] = useState<SfsEnvironment>("mock");
  const [formUser, setFormUser] = useState("");
  const [formPass, setFormPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load list
  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await listEinvoices();
      setItems(res.items);
    } catch {
      showToast({ kind: "error", message: "Nu am putut încărca lista facturilor SFS." });
    } finally {
      setListLoading(false);
    }
  }, [showToast]);

  // Load settings
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await getSfsSettings();
      if (res.data) {
        setSettings(res.data);
        setFormIdno(res.data.idno);
        setFormBank(res.data.bankAccount);
        setFormEnv(res.data.environment);
      }
    } catch {
      showToast({ kind: "error", message: "Nu am putut încărca setările SFS." });
    } finally {
      setSettingsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    loadList();
    loadSettings();
  }, [sessionStatus, loadList, loadSettings]);

  // Sync action
  const handleSync = async (invoiceId: string) => {
    setActionLoading((prev) => ({ ...prev, [`sync-${invoiceId}`]: true }));
    try {
      const res = await syncEinvoice(invoiceId);
      setItems((prev) =>
        prev.map((r) =>
          r.finInvoiceId === invoiceId
            ? { ...r, sfsStatus: res.data.sfsStatus, lastSyncAt: res.data.lastSyncAt }
            : r
        )
      );
      showToast({ kind: "success", message: "Status sincronizat cu SFS." });
    } catch {
      showToast({ kind: "error", message: "Sincronizarea a eșuat." });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`sync-${invoiceId}`]: false }));
    }
  };

  // Cancel action
  const handleCancel = async (invoiceId: string) => {
    if (!confirm("Ești sigur că vrei să anulezi această factură la SFS?")) return;
    setActionLoading((prev) => ({ ...prev, [`cancel-${invoiceId}`]: true }));
    try {
      const res = await cancelEinvoice(invoiceId);
      setItems((prev) =>
        prev.map((r) =>
          r.finInvoiceId === invoiceId ? { ...r, sfsStatus: res.data.sfsStatus } : r
        )
      );
      showToast({ kind: "success", message: "Factura a fost anulată la SFS." });
    } catch {
      showToast({ kind: "error", message: "Anularea a eșuat." });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`cancel-${invoiceId}`]: false }));
    }
  };

  // Save settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const input: UpsertSfsSettingsInput = {
        idno: formIdno.trim(),
        bankAccount: formBank.trim(),
        environment: formEnv,
      };
      if (formUser.trim()) input.username = formUser.trim();
      if (formPass.trim()) input.password = formPass.trim();

      const res = await upsertSfsSettings(input);
      setSettings(res.data);
      setFormUser("");
      setFormPass("");
      showToast({ kind: "success", message: "Setările SFS au fost salvate." });
    } catch {
      showToast({ kind: "error", message: "Salvarea setărilor a eșuat." });
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell pageTitle="e-Factura Moldova (SFS)">
      {/* Toast */}
      {toast && (
        <div
          role="alert"
          aria-live="polite"
          className={cn(
            "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg",
            toast.kind === "success"
              ? "bg-success text-success-foreground"
              : "bg-destructive text-destructive-foreground"
          )}
        >
          {toast.kind === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">e-Factura Moldova</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestionează facturile B2B trimise la SIA e-Factura (SFS) și configurează conexiunea.
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="-mb-px flex gap-6" role="tablist">
            {(["list", "settings"] as Tab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "border-b-2 pb-3 pt-1 text-sm font-medium transition-colors",
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "list" ? "Facturi electronice" : "Configurare SFS"}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab: List */}
        {activeTab === "list" && (
          <section aria-label="Lista facturi electronice">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Toate facturile trimise la SFS pentru acest cont.
              </p>
              <button
                type="button"
                aria-label="Reîncarcă lista"
                onClick={loadList}
                disabled={listLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", listLoading && "animate-spin")} />
                Reîncarcă
              </button>
            </div>

            {listLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-12 text-center">
                <Send className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  Nicio factură trimisă la SFS încă.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Facturare B2B → submite o factură → va apărea aici.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                        ID factură
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Status SFS
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Serial SFS
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Trimisă la
                      </th>
                      <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Sync
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">
                        Acțiuni
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((row) => {
                      const canCancel =
                        row.sfsStatus === "sent" || row.sfsStatus === "accepted";
                      const syncKey = `sync-${row.finInvoiceId}`;
                      const cancelKey = `cancel-${row.finInvoiceId}`;
                      return (
                        <tr key={row.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-mono text-xs text-foreground">
                            {row.finInvoiceId.slice(0, 8)}…
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={row.sfsStatus} />
                            {row.sfsErrorMessage && (
                              <p className="mt-0.5 text-xs text-destructive">
                                {row.sfsErrorMessage.slice(0, 60)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {row.sfsSerialNumber ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatDt(row.submittedAt)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatDt(row.lastSyncAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                aria-label={`Sincronizează factura ${row.finInvoiceId.slice(0, 8)}`}
                                onClick={() => handleSync(row.finInvoiceId)}
                                disabled={!!actionLoading[syncKey]}
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
                              >
                                <RefreshCw
                                  className={cn(
                                    "h-3 w-3",
                                    actionLoading[syncKey] && "animate-spin"
                                  )}
                                />
                                Sincronizează
                              </button>
                              <button
                                type="button"
                                aria-label={`Anulează factura ${row.finInvoiceId.slice(0, 8)}`}
                                onClick={() => handleCancel(row.finInvoiceId)}
                                disabled={!canCancel || !!actionLoading[cancelKey]}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                                  canCancel
                                    ? "text-destructive hover:bg-destructive/10"
                                    : "cursor-not-allowed text-muted-foreground opacity-40"
                                )}
                              >
                                <XCircle
                                  className={cn(
                                    "h-3 w-3",
                                    actionLoading[cancelKey] && "animate-spin"
                                  )}
                                />
                                Anulează
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Tab: Settings */}
        {activeTab === "settings" && (
          <section aria-label="Configurare conexiune SFS">
            {settingsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form
                onSubmit={handleSaveSettings}
                className="space-y-5 rounded-lg border border-border bg-card p-6"
              >
                <div className="flex items-center gap-2 border-b border-border pb-4">
                  <Settings2 className="h-5 w-5 text-muted-foreground" />
                  <h2 className="font-semibold">Conexiune SIA e-Factura (SFS)</h2>
                </div>

                {/* Credentials status */}
                {settings && (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                      settings.hasCredentials
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning"
                    )}
                  >
                    {settings.hasCredentials ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        Credențiale configurate. Lasă câmpurile parolă goale pentru a le păstra.
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        Credențiale lipsă. Completează username și parolă pentru a activa SFS real.
                      </>
                    )}
                  </div>
                )}

                {/* IDNO */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="sfs-idno"
                    className="block text-sm font-medium"
                  >
                    IDNO companie furnizor
                    <span className="ml-1 text-destructive" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="sfs-idno"
                    type="text"
                    inputMode="numeric"
                    maxLength={13}
                    required
                    value={formIdno}
                    onChange={(e) => setFormIdno(e.target.value.replace(/\D/g, ""))}
                    placeholder="1234567890123"
                    aria-describedby="sfs-idno-hint"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p id="sfs-idno-hint" className="text-xs text-muted-foreground">
                    13 cifre numerice — codul fiscal al academiei.
                  </p>
                </div>

                {/* Cont bancar */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="sfs-bank"
                    className="block text-sm font-medium"
                  >
                    Cont bancar (IBAN sau local)
                    <span className="ml-1 text-destructive" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="sfs-bank"
                    type="text"
                    maxLength={34}
                    required
                    value={formBank}
                    onChange={(e) => setFormBank(e.target.value)}
                    placeholder="MD24AG000000000000000000"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Environment */}
                <div className="space-y-1.5">
                  <label htmlFor="sfs-env" className="block text-sm font-medium">
                    Mediu SFS
                  </label>
                  <select
                    id="sfs-env"
                    value={formEnv}
                    onChange={(e) => setFormEnv(e.target.value as SfsEnvironment)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {(Object.entries(ENV_LABELS) as [SfsEnvironment, string][]).map(
                      ([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {/* Credentials */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="sfs-username" className="block text-sm font-medium">
                      Username API SFS
                    </label>
                    <input
                      id="sfs-username"
                      type="text"
                      autoComplete="username"
                      value={formUser}
                      onChange={(e) => setFormUser(e.target.value)}
                      placeholder={settings?.hasCredentials ? "••••••••" : "Introdu username"}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="sfs-password" className="block text-sm font-medium">
                      Parolă API SFS
                    </label>
                    <div className="relative">
                      <input
                        id="sfs-password"
                        type={showPass ? "text" : "password"}
                        autoComplete="current-password"
                        value={formPass}
                        onChange={(e) => setFormPass(e.target.value)}
                        placeholder={settings?.hasCredentials ? "••••••••" : "Introdu parola"}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        type="button"
                        aria-label={showPass ? "Ascunde parola" : "Arată parola"}
                        onClick={() => setShowPass((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Last tested */}
                {settings?.lastTestedAt && (
                  <p className="text-xs text-muted-foreground">
                    Ultimul test de conectivitate: {formatDt(settings.lastTestedAt)}
                  </p>
                )}

                {/* Submit */}
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Salvează
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
