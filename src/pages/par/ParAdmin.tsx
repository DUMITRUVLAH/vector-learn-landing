/**
 * PAR-116 — /app/par/admin
 *
 * Administration panel for par_admin only. Four tabs:
 *   1. DOA Matrix — add/edit/delete rows (amount bands → approval steps)
 *   2. Settings — micro-purchase threshold, currency, legal name, logo, help URL, prefix
 *   3. Members — assign/revoke PAR roles + approval limit
 *   4. Reference data — budget codes, departments, projects, vendors CRUD
 *
 * Non-par_admin → 403 shown; no route access (App.tsx gate + client guard).
 * Threshold change affects NEW request routing (validated in server/routes routing engine).
 *
 * CORE: backlog/par/PAR-CORE.md §1 (roles), §3 (DOA), §6 (admin screen)
 * Design: Vector 365, light+dark, WCAG AA.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Settings,
  Users,
  BookOpen,
  Shield,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  ChevronRight,
  Search,
  Building2,
  Mail,
  Copy,
  FileClock,
  ChevronLeft,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import {
  getParSettings,
  updateParSettings,
  listParDoaMatrix,
  createParDoaRow,
  updateParDoaRow,
  deleteParDoaRow,
  listParMembers,
  assignParMember,
  revokeParMember,
  listParInvites,
  createParInvite,
  revokeParInvite,
  type ParInvite,
  getParAudit,
  type ParAuditEntry,
  listParDelegations,
  createParDelegation,
  cancelParDelegation,
  type ParDelegation,
  listDepartments,
  listProjects,
  listBudgetCodes,
  getBudgetCodesUsage,
  type BudgetCodeUsage,
  listVendors,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  createProject,
  updateProject,
  deleteProject,
  createBudgetCode,
  updateBudgetCode,
  deleteBudgetCode,
  createVendor,
  updateVendor,
  deleteVendor,
  searchRegistryCompanies,
  formatMDL,
  type ParDoaRow,
  type ParMember,
  type ParSettings,
  type ParDepartment,
  type ParProject,
  type ParBudgetCode,
  type ParVendor,
  type RegistryCompany,
} from "@/lib/api/par";
import { useRouter } from "@/router/HashRouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function centsToMDL(cents: number): string {
  return (cents / 100).toLocaleString("ro-MD", { minimumFractionDigits: 0 });
}

function mdlToCents(str: string): number {
  const n = parseFloat(str.replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

interface TabProps {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabProps[] = [
  { id: "doa", label: "Matrice DOA", icon: <Shield className="h-4 w-4" aria-hidden /> },
  { id: "settings", label: "Setări", icon: <Settings className="h-4 w-4" aria-hidden /> },
  { id: "members", label: "Membri", icon: <Users className="h-4 w-4" aria-hidden /> },
  { id: "reference", label: "Date referință", icon: <BookOpen className="h-4 w-4" aria-hidden /> },
  { id: "audit", label: "Audit", icon: <FileClock className="h-4 w-4" aria-hidden /> },
];

// VF-301: Romanian labels for audit events.
const AUDIT_EVENT_LABELS: Record<string, string> = {
  created: "Creat",
  created_from_template: "Creat din șablon",
  duplicated_from: "Duplicat",
  edited: "Modificat",
  submitted: "Trimis spre aprobare",
  approved: "Aprobat (pas)",
  step_unlocked: "Pas deblocat",
  rejected: "Respins",
  changes_requested: "Modificări cerute",
  in_finance: "La finanțe",
  fully_approved_to_finance: "Aprobat → finanțe",
  fully_approved: "Aprobat complet",
  paid: "Plătit",
  cancelled: "Anulat",
  reapproval_required: "Re-aprobare necesară",
  overage_reapproved: "Depășire re-aprobată",
  integrity_mismatch: "Integritate: nepotrivire",
  integrity_mismatch_display: "Integritate: nepotrivire (afișare)",
};

const CHARGE_OPTIONS = [
  { value: "", label: "Orice" },
  { value: "operations", label: "Operations" },
  { value: "program", label: "Program" },
  { value: "other", label: "Other" },
];

const ROLE_OPTIONS = [
  { value: "requestor", label: "Requestor" },
  { value: "approver", label: "Approver" },
  { value: "finance", label: "Finance" },
  { value: "par_admin", label: "PAR Admin" },
];

// ─── Sub-tab: DOA Matrix Editor ───────────────────────────────────────────────

interface DoaEditorProps {
  departments: ParDepartment[];
}

function DoaMatrixEditor({ departments }: DoaEditorProps) {
  const [rows, setRows] = useState<ParDoaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emptyForm = (): Partial<ParDoaRow> => ({
    chargeTo: null,
    departmentId: null,
    minAmountCents: 0,
    maxAmountCents: null,
    step: 1,
    approverRoleLabel: "",
    approverUserId: null,
    approverParRole: null,
    active: true,
  });

  const [form, setForm] = useState<Partial<ParDoaRow>>(emptyForm());

  const load = async () => {
    setLoading(true);
    try {
      const { rows: r } = await listParDoaMatrix();
      setRows(r);
    } catch {
      setError("Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const startEdit = (row: ParDoaRow) => {
    setEditingId(row.id);
    setForm({ ...row });
    setAdding(false);
  };

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setForm(emptyForm());
  };

  const cancel = () => {
    setEditingId(null);
    setAdding(false);
    setForm(emptyForm());
    setError(null);
  };

  const save = async () => {
    try {
      setError(null);
      if (adding) {
        await createParDoaRow({
          chargeTo: (form.chargeTo as "operations" | "program" | "other") ?? null,
          departmentId: form.departmentId ?? null,
          minAmountCents: form.minAmountCents ?? 0,
          maxAmountCents: form.maxAmountCents ?? null,
          step: form.step ?? 1,
          approverRoleLabel: form.approverRoleLabel ?? "Approver",
          approverUserId: form.approverUserId ?? null,
          approverParRole: (form.approverParRole as "requestor" | "approver" | "finance" | "par_admin") ?? null,
          active: true,
        });
      } else if (editingId) {
        await updateParDoaRow(editingId, {
          chargeTo: (form.chargeTo as "operations" | "program" | "other") ?? null,
          departmentId: form.departmentId ?? null,
          minAmountCents: form.minAmountCents ?? 0,
          maxAmountCents: form.maxAmountCents ?? null,
          step: form.step ?? 1,
          approverRoleLabel: form.approverRoleLabel ?? "Approver",
          approverUserId: form.approverUserId ?? null,
          approverParRole: (form.approverParRole as "requestor" | "approver" | "finance" | "par_admin") ?? null,
          active: form.active ?? true,
        });
      }
      await load();
      cancel();
    } catch {
      setError("Eroare la salvare");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Dezactivezi rândul DOA?")) return;
    try {
      await deleteParDoaRow(id);
      await load();
    } catch {
      setError("Eroare la ștergere");
    }
  };

  const isEditing = (id: string) => editingId === id;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>Se încarcă...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Matricea definește cine aprobă la ce sumă. Rândurile sunt evaluate la submit pe baza totalului estimat.
        </p>
        <button
          type="button"
          onClick={startAdd}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px]"
          aria-label="Adaugă rând DOA"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Adaugă rând
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* Add row form */}
      {adding && (
        <DoaRowForm
          form={form}
          onChange={setForm}
          departments={departments}
          onSave={save}
          onCancel={cancel}
        />
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm" role="grid" aria-label="Matrice DOA">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Charge To</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Departament</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Min (MDL)</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Max (MDL)</th>
              <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Pas</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Rol aprobator</th>
              <th className="text-center p-3 text-xs font-semibold text-muted-foreground">Activ</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground sr-only">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !adding && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">
                  Niciun rând definit. Adaugă primul rând DOA.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className={cn("border-t border-border", isEditing(row.id) && "bg-muted/30")}>
                {isEditing(row.id) ? (
                  <td colSpan={8} className="p-3">
                    <DoaRowForm
                      form={form}
                      onChange={setForm}
                      departments={departments}
                      onSave={save}
                      onCancel={cancel}
                    />
                  </td>
                ) : (
                  <>
                    <td className="p-3 text-foreground">{row.chargeTo ?? <span className="text-muted-foreground">Orice</span>}</td>
                    <td className="p-3 text-foreground">
                      {row.departmentId
                        ? departments.find((d) => d.id === row.departmentId)?.name ?? row.departmentId
                        : <span className="text-muted-foreground">Orice</span>
                      }
                    </td>
                    <td className="p-3 text-right text-foreground">{centsToMDL(row.minAmountCents)}</td>
                    <td className="p-3 text-right text-foreground">
                      {row.maxAmountCents != null ? centsToMDL(row.maxAmountCents) : <span className="text-muted-foreground">∞</span>}
                    </td>
                    <td className="p-3 text-center text-foreground">{row.step}</td>
                    <td className="p-3 text-foreground">{row.approverRoleLabel}</td>
                    <td className="p-3 text-center">
                      <span className={cn(
                        "inline-block w-2 h-2 rounded-full",
                        row.active ? "bg-emerald-500" : "bg-muted-foreground"
                      )} aria-label={row.active ? "Activ" : "Inactiv"} />
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                          aria-label={`Editează rândul ${row.approverRoleLabel}`}
                        >
                          <Edit2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(row.id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
                          aria-label={`Dezactivează rândul ${row.approverRoleLabel}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface DoaRowFormProps {
  form: Partial<ParDoaRow>;
  onChange: (f: Partial<ParDoaRow>) => void;
  departments: ParDepartment[];
  onSave: () => void;
  onCancel: () => void;
}

function DoaRowForm({ form, onChange, departments, onSave, onCancel }: DoaRowFormProps) {
  const set = (key: keyof ParDoaRow, val: unknown) =>
    onChange({ ...form, [key]: val });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Charge To</label>
        <select
          value={form.chargeTo ?? ""}
          onChange={(e) => set("chargeTo", e.target.value || null)}
          className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
          aria-label="Charge To"
        >
          {CHARGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Departament (opțional)</label>
        <select
          value={form.departmentId ?? ""}
          onChange={(e) => set("departmentId", e.target.value || null)}
          className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
          aria-label="Departament"
        >
          <option value="">Orice</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Pas (1, 2, …)</label>
        <input
          type="number"
          min={1}
          value={form.step ?? 1}
          onChange={(e) => set("step", parseInt(e.target.value) || 1)}
          className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
          aria-label="Pas aprobator"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Min sumă (MDL)</label>
        <input
          type="number"
          min={0}
          step={100}
          value={(form.minAmountCents ?? 0) / 100}
          onChange={(e) => set("minAmountCents", Math.round(parseFloat(e.target.value || "0") * 100))}
          className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
          aria-label="Sumă minimă MDL"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Max sumă (MDL, gol = ∞)</label>
        <input
          type="number"
          min={0}
          step={100}
          value={form.maxAmountCents != null ? form.maxAmountCents / 100 : ""}
          onChange={(e) => set("maxAmountCents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
          className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
          placeholder="Fără limită"
          aria-label="Sumă maximă MDL"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Etichetă rol aprobator</label>
        <input
          type="text"
          value={form.approverRoleLabel ?? ""}
          onChange={(e) => set("approverRoleLabel", e.target.value)}
          placeholder="ex. DOA Holder, Executive Director"
          className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
          aria-label="Etichetă rol aprobator"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Rol PAR (opțional)</label>
        <select
          value={form.approverParRole ?? ""}
          onChange={(e) => set("approverParRole", e.target.value || null)}
          className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
          aria-label="Rol PAR"
        >
          <option value="">Oricare</option>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="col-span-2 sm:col-span-1 flex items-end gap-2">
        <button
          type="button"
          onClick={onSave}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px]"
          aria-label="Salvează rând DOA"
        >
          <Check className="h-4 w-4" aria-hidden />
          Salvează
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted min-h-[44px]"
          aria-label="Anulează"
        >
          <X className="h-4 w-4" aria-hidden />
          Anulează
        </button>
      </div>
    </div>
  );
}

// ─── Sub-tab: Settings ────────────────────────────────────────────────────────

function ParSettingsForm() {
  const [settings, setSettings] = useState<Partial<ParSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getParSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateParSettings({
        microPurchaseThresholdCents: settings.microPurchaseThresholdCents,
        defaultCurrency: settings.defaultCurrency ?? "MDL",
        orgLegalName: settings.orgLegalName ?? null,
        orgLogoUrl: settings.orgLogoUrl ?? null,
        pdfHelpUrl: settings.pdfHelpUrl ?? null,
        requestNoPrefix: settings.requestNoPrefix ?? "PAR",
        enforceThreeWayMatch: settings.enforceThreeWayMatch ?? false,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Eroare la salvare");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>Se încarcă...</span>
      </div>
    );
  }

  const thresholdMDL = (settings.microPurchaseThresholdCents ?? 1000000) / 100;

  return (
    <div className="max-w-lg space-y-5">
      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="par-threshold" className="text-sm font-medium text-foreground block mb-1">
          Prag micro-achiziție (MDL)
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          Cererile sub acest prag necesită o singură aprobare. Modificarea afectează cererile noi.
        </p>
        <input
          id="par-threshold"
          type="number"
          min={0}
          step={100}
          value={thresholdMDL}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              microPurchaseThresholdCents: Math.round(parseFloat(e.target.value || "0") * 100),
            }))
          }
          className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 min-h-[44px]"
          aria-label="Prag micro-achiziție MDL"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Actual: {formatMDL(settings.microPurchaseThresholdCents ?? 1000000)}
        </p>
      </div>

      <div>
        <label htmlFor="par-currency" className="text-sm font-medium text-foreground block mb-1">
          Monedă implicită
        </label>
        <input
          id="par-currency"
          type="text"
          maxLength={3}
          value={settings.defaultCurrency ?? "MDL"}
          onChange={(e) => setSettings((s) => ({ ...s, defaultCurrency: e.target.value.toUpperCase() }))}
          className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 min-h-[44px]"
          aria-label="Monedă implicită (cod ISO 4217)"
        />
      </div>

      <div>
        <label htmlFor="par-legal-name" className="text-sm font-medium text-foreground block mb-1">
          Denumire legală organizație
        </label>
        <input
          id="par-legal-name"
          type="text"
          value={settings.orgLegalName ?? ""}
          onChange={(e) => setSettings((s) => ({ ...s, orgLegalName: e.target.value || null }))}
          className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 min-h-[44px]"
          aria-label="Denumire legală organizație"
        />
      </div>

      <div>
        <label htmlFor="par-logo-url" className="text-sm font-medium text-foreground block mb-1">
          Logo URL (opțional)
        </label>
        <input
          id="par-logo-url"
          type="url"
          value={settings.orgLogoUrl ?? ""}
          onChange={(e) => setSettings((s) => ({ ...s, orgLogoUrl: e.target.value || null }))}
          className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 min-h-[44px]"
          aria-label="Logo URL"
        />
      </div>

      <div>
        <label htmlFor="par-help-url" className="text-sm font-medium text-foreground block mb-1">
          URL Instrucțiuni (help link PDF)
        </label>
        <input
          id="par-help-url"
          type="url"
          value={settings.pdfHelpUrl ?? ""}
          onChange={(e) => setSettings((s) => ({ ...s, pdfHelpUrl: e.target.value || null }))}
          className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 min-h-[44px]"
          aria-label="URL Instrucțiuni PDF"
        />
      </div>

      <div>
        <label htmlFor="par-prefix" className="text-sm font-medium text-foreground block mb-1">
          Prefix număr cerere
        </label>
        <input
          id="par-prefix"
          type="text"
          value={settings.requestNoPrefix ?? "PAR"}
          onChange={(e) => setSettings((s) => ({ ...s, requestNoPrefix: e.target.value || "PAR" }))}
          className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 min-h-[44px]"
          aria-label="Prefix număr cerere (ex. PAR)"
        />
        <p className="text-xs text-muted-foreground mt-1">Exemplu: PAR → PAR-2026-0001</p>
      </div>

      {/* VF-505: enforce 3-way match toggle */}
      <div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enforceThreeWayMatch ?? false}
            onChange={(e) => setSettings((s) => ({ ...s, enforceThreeWayMatch: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
            aria-label="Impune 3-way match la plată"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">Impune 3-way match la plată</span>
            <span className="block text-xs text-muted-foreground">Blochează plata până când există PO, recepție completă și suma e în limita comenzii (±10%).</span>
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] transition-colors",
          saved
            ? "bg-emerald-600 text-white"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
          saving && "opacity-70 cursor-not-allowed"
        )}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : saved ? <Check className="h-4 w-4" aria-hidden /> : null}
        {saving ? "Se salvează..." : saved ? "Salvat!" : "Salvează setări"}
      </button>
    </div>
  );
}

// ─── VF-302: Delegation management (inside Members tab) ───────────────────────

function delegationStatus(d: ParDelegation): { label: string; cls: string } {
  const now = Date.now();
  const start = new Date(d.startsAt).getTime();
  const end = new Date(d.endsAt).getTime();
  if (!d.active) return { label: "Anulată", cls: "text-muted-foreground" };
  if (now < start) return { label: "Programată", cls: "text-blue-600 dark:text-blue-400" };
  if (now > end) return { label: "Expirată", cls: "text-muted-foreground" };
  return { label: "Activă", cls: "text-green-700 dark:text-green-400" };
}

function DelegationSection({ members }: { members: ParMember[] }) {
  const [delegations, setDelegations] = useState<ParDelegation[]>([]);
  const [toUserId, setToUserId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only approvers/admins can be delegates.
  const approverMembers = members.filter((m) => m.role === "approver" || m.role === "par_admin");

  const load = async () => {
    try { const { delegations: d } = await listParDelegations(); setDelegations(d); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toUserId || !startsAt || !endsAt) return;
    setBusy(true); setError(null);
    try {
      await createParDelegation({ to_user_id: toUserId, starts_at: startsAt, ends_at: endsAt });
      setToUserId(""); setStartsAt(""); setEndsAt("");
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message.includes("self_delegation")
        ? "Nu te poți delega pe tine."
        : "Nu am putut crea delegarea.");
    } finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    if (!confirm("Anulezi această delegare?")) return;
    try { await cancelParDelegation(id); await load(); } catch { /* ignore */ }
  };

  const nameOf = (id: string) => members.find((m) => m.userId === id)?.userName ?? id.slice(0, 8);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Delegare aprobare</h3>
        <p className="text-sm text-muted-foreground">Deleagă-ți autoritatea de aprobare către un coleg pe o perioadă (concediu, absență).</p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        <div className="sm:col-span-2">
          <label htmlFor="deleg-to" className="text-xs font-medium text-muted-foreground block mb-1">Către</label>
          <select id="deleg-to" value={toUserId} onChange={(e) => setToUserId(e.target.value)} className="vf-input" aria-label="Delegat">
            <option value="">Alege aprobator…</option>
            {approverMembers.map((m) => <option key={m.userId} value={m.userId}>{m.userName ?? m.userId}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="deleg-from" className="text-xs font-medium text-muted-foreground block mb-1">De la</label>
          <input id="deleg-from" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="vf-input" />
        </div>
        <div>
          <label htmlFor="deleg-until" className="text-xs font-medium text-muted-foreground block mb-1">Până la</label>
          <input id="deleg-until" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="vf-input" />
        </div>
        <div className="sm:col-span-4">
          <button type="submit" disabled={busy || !toUserId || !startsAt || !endsAt}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 min-h-[44px]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}Deleagă
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-2.5 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />{error}
        </div>
      )}

      {delegations.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Delegări</p>
          {delegations.map((d) => {
            const st = delegationStatus(d);
            return (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span className="truncate">
                  <span className="text-foreground">{d.fromName ?? nameOf(d.fromUserId)}</span>
                  <span className="text-muted-foreground"> → {d.toName ?? nameOf(d.toUserId)}</span>
                  <span className="text-muted-foreground text-xs"> · {new Date(d.startsAt).toLocaleDateString("ro-MD")}–{new Date(d.endsAt).toLocaleDateString("ro-MD")}</span>
                  <span className={cn("text-xs ml-1.5", st.cls)}>· {st.label}</span>
                </span>
                {d.active && (
                  <button type="button" onClick={() => cancel(d.id)} aria-label="Anulează delegarea"
                    className="text-muted-foreground hover:text-destructive flex-shrink-0">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── VF-301: Audit log viewer ─────────────────────────────────────────────────

const AUDIT_EVENT_OPTIONS = [
  { value: "", label: "Toate evenimentele" },
  ...Object.entries(AUDIT_EVENT_LABELS).map(([value, label]) => ({ value, label })),
];

function auditTimeFmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ro-MD", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AuditTab() {
  const [entries, setEntries] = useState<ParAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [eventFilter, setEventFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getParAudit({
        event: eventFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
      });
      setEntries(r.entries);
      setTotalPages(r.totalPages);
      setTotal(r.total);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [eventFilter, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);
  // Reset to page 1 when filters change.
  useEffect(() => { setPage(1); }, [eventFilter, dateFrom, dateTo]);

  const exportCsv = () => {
    const header = "data,eveniment,actor,cerere,detaliu\n";
    const rows = entries.map((e) => [
      auditTimeFmt(e.createdAt),
      AUDIT_EVENT_LABELS[e.event] ?? e.event,
      e.actorName ?? "",
      e.requestNo ?? "",
      e.detail ?? "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "par-audit.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="audit-event" className="text-xs font-medium text-muted-foreground block mb-1">Eveniment</label>
          <select id="audit-event" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm min-h-[40px]">
            {AUDIT_EVENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="audit-from" className="text-xs font-medium text-muted-foreground block mb-1">De la</label>
          <input id="audit-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm min-h-[40px]" />
        </div>
        <div>
          <label htmlFor="audit-to" className="text-xs font-medium text-muted-foreground block mb-1">Până la</label>
          <input id="audit-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm min-h-[40px]" />
        </div>
        <button type="button" onClick={exportCsv} disabled={entries.length === 0}
          className="inline-flex items-center gap-1.5 h-10 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 min-h-[40px]">
          Export CSV
        </button>
        <span className="text-xs text-muted-foreground ml-auto">{total} {total === 1 ? "intrare" : "intrări"}</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Se încarcă…
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">Nicio intrare de audit.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm" aria-label="Jurnal de audit">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Data</th>
                <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Eveniment</th>
                <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Actor</th>
                <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Cerere</th>
                <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">Detaliu</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="p-2.5 text-muted-foreground text-xs whitespace-nowrap">{auditTimeFmt(e.createdAt)}</td>
                  <td className="p-2.5 text-foreground">{AUDIT_EVENT_LABELS[e.event] ?? e.event}</td>
                  <td className="p-2.5 text-foreground">{e.actorName ?? "—"}</td>
                  <td className="p-2.5 font-mono text-xs text-primary">{e.requestNo ?? "—"}</td>
                  <td className="p-2.5 text-muted-foreground text-xs hidden md:table-cell max-w-md truncate">{e.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-40 min-h-[40px]" aria-label="Pagina anterioară">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Înapoi
          </button>
          <span className="text-sm text-muted-foreground">Pagina {page} / {totalPages}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-40 min-h-[40px]" aria-label="Pagina următoare">
            Înainte <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── VF-004: Invite by email (inside Members tab) ─────────────────────────────

const INVITE_ROLE_LABELS: Record<string, string> = {
  requestor: "Solicitant", approver: "Aprobator", finance: "Finanțe", par_admin: "Administrator",
};

function InviteSection() {
  const [invites, setInvites] = useState<ParInvite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"requestor" | "approver" | "finance" | "par_admin">("requestor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try { const { invites: i } = await listParInvites(); setInvites(i); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true); setLastUrl(null);
    try {
      const r = await createParInvite({ email: email.trim(), par_role: role });
      setLastUrl(r.inviteUrl);
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message.includes("already_member")
        ? "Acest email există deja în organizație."
        : "Nu am putut crea invitația.");
    } finally { setBusy(false); }
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoci această invitație?")) return;
    try { await revokeParInvite(id); await load(); } catch { /* ignore */ }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">Invită utilizatori</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Trimite o invitație pe email. Dacă serviciul de email nu e configurat, copiază linkul și trimite-l manual.
      </p>

      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email@exemplu.md" aria-label="Email invitat"
          className="vf-input flex-1" />
        <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}
          aria-label="Rol invitat" className="vf-input sm:w-44">
          <option value="requestor">Solicitant</option>
          <option value="approver">Aprobator</option>
          <option value="finance">Finanțe</option>
          <option value="par_admin">Administrator</option>
        </select>
        <button type="submit" disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 min-h-[44px]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Invită
        </button>
      </form>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-2.5 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />{error}
        </div>
      )}

      {lastUrl && (
        <div className="flex items-center gap-2 p-2.5 rounded-md bg-primary/5 border border-primary/20 text-sm">
          <span className="text-muted-foreground flex-shrink-0">Link:</span>
          <code className="flex-1 truncate text-xs text-foreground">{lastUrl}</code>
          <button type="button" onClick={() => copy(lastUrl)} aria-label="Copiază linkul"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted transition-colors flex-shrink-0">
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? "Copiat" : "Copiază"}
          </button>
        </div>
      )}

      {invites.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Invitații în așteptare</p>
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <span className="truncate">
                <span className="text-foreground">{inv.email}</span>
                <span className="text-muted-foreground"> · {INVITE_ROLE_LABELS[inv.parRole] ?? inv.parRole}</span>
              </span>
              <button type="button" onClick={() => revoke(inv.id)} aria-label={`Revocă invitația pentru ${inv.email}`}
                className="inline-flex items-center text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-tab: Members ─────────────────────────────────────────────────────────

function ParMembersTab() {
  const [members, setMembers] = useState<ParMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<{
    userId: string;
    role: string;
    approvalLimitCents: string;
  }>({ userId: "", role: "requestor", approvalLimitCents: "" });
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { members: m } = await listParMembers();
      setMembers(m);
    } catch {
      setError("Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const handleAdd = async () => {
    if (!addForm.userId.trim()) {
      setError("User ID lipsă");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await assignParMember({
        userId: addForm.userId.trim(),
        role: addForm.role as "requestor" | "approver" | "finance" | "par_admin",
        approvalLimitCents: addForm.approvalLimitCents
          ? mdlToCents(addForm.approvalLimitCents)
          : null,
      });
      setAddForm({ userId: "", role: "requestor", approvalLimitCents: "" });
      setShowAddForm(false);
      await load();
    } catch {
      setError("Eroare la adăugare");
    } finally {
      setAdding(false);
    }
  };

  const handleRevoke = async (id: string, userName: string) => {
    if (!confirm(`Revoce rolul pentru ${userName}?`)) return;
    try {
      await revokeParMember(id);
      await load();
    } catch {
      setError("Eroare la revocare");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>Se încarcă...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* VF-004: invite by email */}
      <InviteSection />

      {/* VF-302: approver delegation */}
      <DelegationSection members={members} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Utilizatori cu roluri PAR în această organizație.</p>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px]"
          aria-label="Adaugă rol PAR"
          aria-expanded={showAddForm}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Adaugă rol
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {showAddForm && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5">
          <div>
            <label htmlFor="member-user-id" className="text-xs font-medium text-muted-foreground block mb-1">
              User ID (UUID)
            </label>
            <input
              id="member-user-id"
              type="text"
              value={addForm.userId}
              onChange={(e) => setAddForm((f) => ({ ...f, userId: e.target.value }))}
              placeholder="uuid-ul utilizatorului"
              className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
              aria-label="User ID"
            />
          </div>
          <div>
            <label htmlFor="member-role" className="text-xs font-medium text-muted-foreground block mb-1">
              Rol
            </label>
            <select
              id="member-role"
              value={addForm.role}
              onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
              aria-label="Rol PAR"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="member-limit" className="text-xs font-medium text-muted-foreground block mb-1">
              Limită aprobare (MDL, opțional)
            </label>
            <input
              id="member-limit"
              type="number"
              min={0}
              value={addForm.approvalLimitCents}
              onChange={(e) => setAddForm((f) => ({ ...f, approvalLimitCents: e.target.value }))}
              className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
              aria-label="Limită aprobare MDL"
            />
          </div>
          <div className="col-span-1 sm:col-span-3 flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px]"
              aria-label="Salvează rol"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              Salvează
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setError(null); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted min-h-[44px]"
              aria-label="Anulează"
            >
              <X className="h-4 w-4" aria-hidden />
              Anulează
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm" aria-label="Membri PAR">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Utilizator</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Rol</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Limită aprobare</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground sr-only">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                  Niciun rol atribuit.
                </td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="p-3">
                  <div>
                    <p className="font-medium text-foreground">{m.userName ?? m.userId}</p>
                    {m.userEmail && (
                      <p className="text-xs text-muted-foreground">{m.userEmail}</p>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                    {m.role}
                  </span>
                </td>
                <td className="p-3 text-right text-foreground">
                  {m.approvalLimitCents != null ? formatMDL(m.approvalLimitCents) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="p-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleRevoke(m.id, m.userName ?? m.userId)}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center ml-auto"
                    aria-label={`Revoce rol ${m.role} pentru ${m.userName ?? m.userId}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sub-tab: Reference Data ──────────────────────────────────────────────────

type RefSection = "budgetCodes" | "departments" | "projects" | "vendors";

function ParReferenceData() {
  const [section, setSection] = useState<RefSection>("budgetCodes");
  const [departments, setDepartments] = useState<ParDepartment[]>([]);
  const [projects, setProjects] = useState<ParProject[]>([]);
  const [budgetCodes, setBudgetCodes] = useState<ParBudgetCode[]>([]);
  const [vendors, setVendors] = useState<ParVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [depts, projs, codes, vends] = await Promise.all([
        listDepartments(),
        listProjects(),
        listBudgetCodes(),
        listVendors(),
      ]);
      setDepartments(depts.items ?? []);
      setProjects(projs.items ?? []);
      setBudgetCodes(codes.items ?? []);
      setVendors(vends.items ?? []);
    } catch {
      setError("Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>Se încarcă...</span>
      </div>
    );
  }

  const sectionLabels: Record<RefSection, string> = {
    budgetCodes: "Coduri bugetare",
    departments: "Departamente",
    projects: "Proiecte/Programe",
    vendors: "Furnizori/Plătitori",
  };

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Secțiuni date referință">
        {(Object.keys(sectionLabels) as RefSection[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={section === s}
            type="button"
            onClick={() => setSection(s)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px]",
              section === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {sectionLabels[s]}
          </button>
        ))}
      </div>

      {section === "budgetCodes" && (
        <BudgetCodesTable
          items={budgetCodes}
          onAdd={(payload) =>
            createBudgetCode({
              code: payload.code ?? "",
              name: payload.name ?? "",
              allocatedCents: payload.allocatedCents ?? 0,
            } as { code: string; name: string; allocatedCents?: number }).then(load)
          }
          onEdit={(id, payload) =>
            updateBudgetCode(id, {
              code: payload.code,
              name: payload.name,
              allocatedCents: payload.allocatedCents,
            } as Partial<{ code: string; name: string; allocatedCents: number }>).then(load)
          }
          onDelete={(id) => deleteBudgetCode(id).then(load)}
        />
      )}

      {section === "departments" && (
        <SimpleRefTable
          title="Departamente"
          items={departments}
          columns={[{ label: "Denumire", key: "name" as const }]}
          onAdd={(payload) => createDepartment(payload as { name: string }).then(load)}
          onEdit={(id, payload) => updateDepartment(id, payload as Partial<{ name: string }>).then(load)}
          onDelete={(id) => deleteDepartment(id).then(load)}
          addFields={[{ id: "name", label: "Denumire", placeholder: "ex. Procurări" }]}
        />
      )}

      {section === "projects" && (
        <SimpleRefTable
          title="Proiecte / Programe"
          items={projects}
          columns={[
            { label: "Denumire", key: "name" as const },
            { label: "Donor", key: "donor" as const },
          ]}
          onAdd={(payload) => createProject(payload as { name: string; donor?: string }).then(load)}
          onEdit={(id, payload) => updateProject(id, payload as Partial<{ name: string; donor?: string }>).then(load)}
          onDelete={(id) => deleteProject(id).then(load)}
          addFields={[
            { id: "name", label: "Denumire", placeholder: "ex. Digital Safeguard" },
            { id: "donor", label: "Donor (opțional)", placeholder: "ex. USAID" },
          ]}
        />
      )}

      {section === "vendors" && (
        <VendorSection vendors={vendors} onReload={load} />
      )}
    </div>
  );
}

// ─── Budget codes table (Feature 2: allocatedCents) ──────────────────────────

interface BudgetCodeItem extends ParBudgetCode {
  allocatedCents?: number;
}

// VF-202: per-code budget progress bar (verde <80%, galben 80–100%, roșu >100%).
function BudgetProgress({ usage }: { usage?: BudgetCodeUsage }) {
  if (!usage || usage.allocatedCents <= 0 || usage.usedPct == null) return null;
  const pct = usage.usedPct;
  const barColor = pct > 100 ? "bg-destructive" : pct >= 80 ? "bg-yellow-500" : "bg-green-500";
  const textColor = pct > 100 ? "text-destructive" : pct >= 80 ? "text-yellow-700 dark:text-yellow-400" : "text-muted-foreground";
  return (
    <div className="mt-1.5 w-full max-w-[180px] ml-auto">
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className={cn("text-[11px] mt-0.5 tabular-nums", textColor)}>
        {formatMDL(usage.usedCents)} / {formatMDL(usage.allocatedCents)} · {pct}%
        {pct > 100 && " — depășit"}
      </div>
    </div>
  );
}

interface BudgetCodesTableProps {
  items: BudgetCodeItem[];
  onAdd: (payload: Record<string, string | number | undefined>) => Promise<void>;
  onEdit: (id: string, payload: Record<string, string | number | undefined>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function BudgetCodesTable({ items, onAdd, onEdit, onDelete }: BudgetCodesTableProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ code: string; name: string; allocatedMDL: string }>({
    code: "", name: "", allocatedMDL: "",
  });
  const [saving, setSaving] = useState(false);
  // VF-202: usage per code (progress bars). Reloads when the list changes.
  const [usage, setUsage] = useState<Record<string, BudgetCodeUsage>>({});
  useEffect(() => {
    getBudgetCodesUsage()
      .then((r) => setUsage(Object.fromEntries(r.usage.map((u) => [u.id, u]))))
      .catch(() => setUsage({}));
  }, [items]);

  const startAdd = () => {
    setForm({ code: "", name: "", allocatedMDL: "" });
    setShowForm(true);
    setEditingId(null);
  };

  const startEdit = (item: BudgetCodeItem) => {
    setForm({
      code: item.code,
      name: item.name,
      allocatedMDL: item.allocatedCents ? String((item.allocatedCents / 100).toFixed(0)) : "",
    });
    setEditingId(item.id);
    setShowForm(false);
  };

  const cancel = () => { setShowForm(false); setEditingId(null); setForm({ code: "", name: "", allocatedMDL: "" }); };

  const handleSave = async () => {
    setSaving(true);
    const allocatedCents = form.allocatedMDL
      ? Math.round(parseFloat(form.allocatedMDL.replace(/\s/g, "").replace(",", ".")) * 100) || 0
      : 0;
    try {
      if (editingId) {
        await onEdit(editingId, { code: form.code, name: form.name, allocatedCents });
      } else {
        await onAdd({ code: form.code, name: form.name, allocatedCents });
      }
      cancel();
    } finally {
      setSaving(false);
    }
  };

  const renderForm = (inline?: boolean) => (
    <div className={cn("grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5", inline && "mt-2")}>
      <div>
        <label htmlFor="bc-code" className="text-xs font-medium text-muted-foreground block mb-1">Cod</label>
        <input id="bc-code" type="text" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          placeholder="ex. OPS-001" className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]" aria-label="Cod bugetar" />
      </div>
      <div>
        <label htmlFor="bc-name" className="text-xs font-medium text-muted-foreground block mb-1">Denumire</label>
        <input id="bc-name" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="ex. Cheltuieli operaționale" className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]" aria-label="Denumire cod bugetar" />
      </div>
      <div>
        <label htmlFor="bc-alloc" className="text-xs font-medium text-muted-foreground block mb-1">Alocare (MDL, 0 = fără plafon)</label>
        <input id="bc-alloc" type="number" min={0} step={100} value={form.allocatedMDL}
          onChange={(e) => setForm((f) => ({ ...f, allocatedMDL: e.target.value }))}
          placeholder="ex. 50000" className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]" aria-label="Alocare MDL" />
      </div>
      <div className="col-span-1 sm:col-span-3 flex gap-2">
        <button type="button" onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}Salvează
        </button>
        <button type="button" onClick={cancel}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted min-h-[44px]">
          <X className="h-4 w-4" aria-hidden />Anulează
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Coduri bugetare</h3>
        <button type="button" onClick={startAdd}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px]"
          aria-label="Adaugă cod bugetar">
          <Plus className="h-4 w-4" aria-hidden />Adaugă
        </button>
      </div>
      {showForm && renderForm()}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm" aria-label="Coduri bugetare">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Cod</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Denumire</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Alocare (MDL)</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground sr-only">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">Niciun cod bugetar.</td></tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                {editingId === item.id ? (
                  <td colSpan={4} className="p-0">{renderForm(true)}</td>
                ) : (
                  <>
                    <td className="p-3 text-foreground font-mono text-xs">{item.code}</td>
                    <td className="p-3 text-foreground">{item.name}</td>
                    <td className="p-3 text-right text-foreground align-top">
                      {item.allocatedCents ? formatMDL(item.allocatedCents) : <span className="text-muted-foreground">Fără plafon</span>}
                      <BudgetProgress usage={usage[item.id]} />
                    </td>
                    <td className="p-3 text-right align-top">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => startEdit(item)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                          aria-label={`Editează ${item.code}`}>
                          <Edit2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button type="button" onClick={() => { if (confirm(`Dezactivezi "${item.code}"?`)) onDelete(item.id); }}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
                          aria-label={`Dezactivează ${item.code}`}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Vendor section with registry search (Feature 1) ─────────────────────────

interface VendorSectionProps {
  vendors: ParVendor[];
  onReload: () => void;
}

function VendorSection({ vendors, onReload }: VendorSectionProps) {
  const [registryQuery, setRegistryQuery] = useState("");
  const [registryResults, setRegistryResults] = useState<RegistryCompany[]>([]);
  const [registrySearching, setRegistrySearching] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const registryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill vendor form from registry pick
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ name: "", idnp: "", iban: "", bank: "" });
  const [saving, setSaving] = useState(false);

  const doSearch = useCallback((q: string) => {
    if (q.trim().length < 2) { setRegistryResults([]); return; }
    setRegistrySearching(true);
    setRegistryError(null);
    searchRegistryCompanies(q.trim(), 8)
      .then(setRegistryResults)
      .catch(() => setRegistryError("Eroare la căutare"))
      .finally(() => setRegistrySearching(false));
  }, []);

  const onQueryChange = (q: string) => {
    setRegistryQuery(q);
    if (registryDebounce.current) clearTimeout(registryDebounce.current);
    registryDebounce.current = setTimeout(() => doSearch(q), 400);
  };

  const onRegistryPick = (co: RegistryCompany) => {
    setForm((f) => ({ ...f, name: co.name, idnp: co.idno ?? "" }));
    setRegistryQuery("");
    setRegistryResults([]);
    setShowForm(true);
  };

  const startAdd = () => { setForm({ name: "", idnp: "", iban: "", bank: "" }); setShowForm(true); setEditingId(null); };
  const startEdit = (v: ParVendor) => { setForm({ name: v.name, idnp: v.idnp ?? "", iban: v.iban ?? "", bank: v.bank ?? "" }); setEditingId(v.id); setShowForm(false); };
  const cancel = () => { setShowForm(false); setEditingId(null); setForm({ name: "", idnp: "", iban: "", bank: "" }); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await updateVendor(editingId, { name: form.name, idnp: form.idnp || null, iban: form.iban || null, bank: form.bank || null });
      } else {
        await createVendor({ name: form.name, idnp: form.idnp || null, iban: form.iban || null, bank: form.bank || null });
      }
      await onReload();
      cancel();
    } finally {
      setSaving(false);
    }
  };

  const renderVendorForm = (inline?: boolean) => (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5", inline && "mt-2")}>
      {([
        { id: "name", label: "Nume", placeholder: "Daria Roitman" },
        { id: "idnp", label: "IDNP (13 cifre)", placeholder: "2008001007903" },
        { id: "iban", label: "IBAN", placeholder: "MD48ML000002259A19498121" },
        { id: "bank", label: "Bancă", placeholder: 'BC "Moldindconbank" S.A.' },
      ] as { id: string; label: string; placeholder: string }[]).map((field) => (
        <div key={field.id}>
          <label htmlFor={`vnd-${field.id}`} className="text-xs font-medium text-muted-foreground block mb-1">{field.label}</label>
          <input id={`vnd-${field.id}`} type="text" value={form[field.id] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [field.id]: e.target.value }))}
            placeholder={field.placeholder} className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]" aria-label={field.label} />
        </div>
      ))}
      <div className="col-span-1 sm:col-span-2 flex gap-2">
        <button type="button" onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}Salvează
        </button>
        <button type="button" onClick={cancel}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted min-h-[44px]">
          <X className="h-4 w-4" aria-hidden />Anulează
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Furnizori / Plătitori</h3>
        <button type="button" onClick={startAdd}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px]"
          aria-label="Adaugă furnizor">
          <Plus className="h-4 w-4" aria-hidden />Adaugă
        </button>
      </div>

      {/* Registry search */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Caută în registrul contafirm.md (autofill)</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
          <input type="text" value={registryQuery} onChange={(e) => onQueryChange(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="ex. ATIC sau 1002600020555"
            aria-label="Caută companie în registrul contafirm.md" />
          {registrySearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
        </div>
        {registryError && <p className="text-xs text-destructive">{registryError}</p>}
        {registryResults.length > 0 && (
          <ul className="rounded-lg border border-border bg-popover shadow divide-y divide-border max-h-48 overflow-y-auto" role="listbox" aria-label="Rezultate căutare">
            {registryResults.map((co) => (
              <li key={co.id}>
                <button type="button" role="option" aria-selected={false} onClick={() => onRegistryPick(co)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-start gap-2 min-h-[44px]">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden />
                  <span>
                    <span className="font-medium text-foreground block">{co.name}</span>
                    <span className="text-xs text-muted-foreground">{co.idno && `IDNO: ${co.idno}`}{co.city && ` · ${co.city}`}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showForm && renderVendorForm()}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm" aria-label="Furnizori">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Nume</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">IBAN</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Bancă</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground sr-only">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">Niciun furnizor.</td></tr>
            )}
            {vendors.map((v) => (
              <tr key={v.id} className="border-t border-border">
                {editingId === v.id ? (
                  <td colSpan={4} className="p-0">{renderVendorForm(true)}</td>
                ) : (
                  <>
                    <td className="p-3 text-foreground">{v.name}</td>
                    <td className="p-3 text-foreground font-mono text-xs">{v.iban ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-3 text-foreground">{v.bank ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => startEdit(v)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                          aria-label={`Editează ${v.name}`}>
                          <Edit2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button type="button" onClick={() => { if (confirm(`Dezactivezi "${v.name}"?`)) deleteVendor(v.id).then(onReload); }}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
                          aria-label={`Dezactivează ${v.name}`}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface SimpleRefTableProps<T extends { id: string; active?: boolean }> {
  title: string;
  items: T[];
  columns: { label: string; key: keyof T }[];
  onAdd: (payload: Record<string, string>) => Promise<void>;
  onEdit: (id: string, payload: Record<string, string>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  addFields: { id: string; label: string; placeholder?: string }[];
}

function SimpleRefTable<T extends { id: string; active?: boolean; name?: string }>({
  title,
  items,
  columns,
  onAdd,
  onEdit,
  onDelete,
  addFields,
}: SimpleRefTableProps<T>) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const initForm = (item?: T) => {
    const f: Record<string, string> = {};
    addFields.forEach((field) => {
      f[field.id] = (item ? String((item as Record<string, unknown>)[field.id] ?? "") : "");
    });
    setForm(f);
  };

  const startAdd = () => {
    initForm();
    setShowForm(true);
    setEditingId(null);
  };

  const startEdit = (item: T) => {
    initForm(item);
    setEditingId(item.id);
    setShowForm(false);
  };

  const cancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await onEdit(editingId, form);
      } else {
        await onAdd(form);
      }
      cancel();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Dezactivezi "${label}"?`)) return;
    await onDelete(id);
  };

  const renderForm = (inline?: boolean) => (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5", inline && "mt-2")}>
      {addFields.map((field) => (
        <div key={field.id}>
          <label htmlFor={`ref-${field.id}`} className="text-xs font-medium text-muted-foreground block mb-1">
            {field.label}
          </label>
          <input
            id={`ref-${field.id}`}
            type="text"
            value={form[field.id] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, [field.id]: e.target.value }))}
            placeholder={field.placeholder}
            className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
            aria-label={field.label}
          />
        </div>
      ))}
      <div className="col-span-1 sm:col-span-2 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px]"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          Salvează
        </button>
        <button
          type="button"
          onClick={cancel}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted min-h-[44px]"
        >
          <X className="h-4 w-4" aria-hidden />
          Anulează
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <button
          type="button"
          onClick={startAdd}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px]"
          aria-label={`Adaugă ${title}`}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Adaugă
        </button>
      </div>

      {showForm && renderForm()}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm" aria-label={title}>
          <thead className="bg-muted/50">
            <tr>
              {columns.map((col) => (
                <th key={col.label} className="text-left p-3 text-xs font-semibold text-muted-foreground">
                  {col.label}
                </th>
              ))}
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground sr-only">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="p-6 text-center text-sm text-muted-foreground">
                  Niciun element.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                {columns.map((col) => (
                  <td key={col.label} className="p-3 text-foreground">
                    {editingId === item.id && col === columns[0]
                      ? null
                      : String((item as Record<string, unknown>)[col.key as string] ?? "—")}
                  </td>
                ))}
                {editingId === item.id ? (
                  <td colSpan={columns.length} className="p-0">
                    {renderForm(true)}
                  </td>
                ) : (
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label={`Editează ${item.name ?? item.id}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id, item.name ?? item.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label={`Dezactivează ${item.name ?? item.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ParAdminProps {
  /** If true, user is confirmed par_admin. Otherwise show 403. */
  isAdmin: boolean;
}

export function ParAdmin({ isAdmin }: ParAdminProps) {
  const { navigate } = useRouter();
  const [tab, setTab] = useState("doa");
  const [departments, setDepartments] = useState<ParDepartment[]>([]);

  useEffect(() => {
    if (isAdmin) {
      listDepartments().then((r) => setDepartments(r.items ?? []));
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <AppShell pageTitle="Administrare PAR">
        <div className="max-w-xl mx-auto px-4 py-12">
          <div role="alert" className="flex items-start gap-3 p-6 rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden />
            <div>
              <h2 className="text-base font-semibold mb-1">Acces restricționat</h2>
              <p className="text-sm opacity-90">Această pagină este disponibilă doar administratorilor PAR.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/app/par")}
            className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="h-4 w-4 rotate-180" aria-hidden />
            Înapoi la PAR
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="Administrare PAR">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="h-5 w-5 text-primary" aria-hidden />
            <h1 className="text-xl font-bold text-foreground">Administrare PAR</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Configurați matricea DOA, setările organizației, membrii și datele de referință.
          </p>
        </div>

        {/* Tab list */}
        <div
          role="tablist"
          aria-label="Secțiuni administrare PAR"
          className="flex flex-wrap gap-1 mb-6 border-b border-border"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors -mb-px border-b-2",
                tab === t.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Panels */}
        <div
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          {tab === "doa" && <DoaMatrixEditor departments={departments} />}
          {tab === "settings" && <ParSettingsForm />}
          {tab === "members" && <ParMembersTab />}
          {tab === "reference" && <ParReferenceData />}
          {tab === "audit" && <AuditTab />}
        </div>
      </div>
    </AppShell>
  );
}

export default ParAdmin;
