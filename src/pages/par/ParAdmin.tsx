/**
 * PAR-116 — /business/par/admin
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
  ShieldCheck,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Search,
  Building2,
  Mail,
  Copy,
  FileClock,
  ChevronLeft,
  Upload,
  Download,
  Calendar,
  BarChart2,
  Wand2,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ParImportMappingDialog } from "@/components/par/ParImportMappingDialog";
import { cn } from "@/lib/utils";
import { Alert, Badge, Button, Card, Checkbox, Input, Label, Select, Switch, Tabs, Textarea } from "@/components/ds";
import { validateIban } from "@/lib/par/iban";
import {
  type RuleDraft, type ApproverPick, type GroupedRule,
  ruleScopeKey, buildDoaRows, groupDoaRows, emptyRuleDraft,
} from "@/lib/par/approvalRules";
import {
  getParSettings,
  updateParSettings,
  listParDoaMatrix,
  createParDoaRow,
  deleteParDoaRow,
  listParMembers,
  listParMemberCandidates,
  type ParMemberCandidate,
  assignParMember,
  revokeParMember,
  getParMe,
  getParMemberProfile,
  updateParMemberProfile,
  setParMemberProjects,
  setParMemberPayers,
  listParInvites,
  createParInvite,
  revokeParInvite,
  type ParInvite,
  getParAudit,
  type ParAuditEntry,
  listParEmailLog,
  type ParEmailLogEntry,
  listParDelegations,
  createParDelegation,
  cancelParDelegation,
  type ParDelegation,
  listDepartments,
  listPayers,
  createPayer,
  updatePayer,
  deletePayer,
  listProjects,
  listBudgetCodes,
  getBudgetCodesUsage,
  type BudgetCodeUsage,
  listVendors,
  listEvents,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  createProject,
  setProjectApprovers,
  updateProject,
  deleteProject,
  createBudgetCode,
  updateBudgetCode,
  deleteBudgetCode,
  createVendor,
  normalizeVendorRequisites,
  updateVendor,
  deleteVendor,
  createEvent,
  updateEvent,
  deleteEvent,
  getParReportByEvent,
  searchRegistryCompanies,
  formatMDL,
  importParConfigExcel,
  previewParConfigExcel,
  downloadParConfigTemplate,
  type ParConfigImportResult,
  type ParConfigImportMapping,
  type ParConfigImportPreview,
  type ParDoaRow,
  type ParMember,
  type ParSettings,
  type ParDepartment,
  type ParProject,
  type ParPayer,
  type ParPayerDetailsInput,
  type ParBudgetCode,
  type ParVendor,
  type ParEvent,
  type RegistryCompany,
} from "@/lib/api/par";
import { ApiError } from "@/lib/api";
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
  { id: "doa", label: "Aprobare", icon: <Shield className="h-4 w-4" aria-hidden /> },
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

/** PARQA-025: what each role can actually do — shown in the add-role form and the legend. */
const ROLE_DESCRIPTIONS: Record<string, string> = {
  requestor: "Creează și trimite cereri de plată; își vede doar propriile cereri.",
  approver: "Aprobă / respinge cererile rutate către el prin matricea DOA.",
  finance: "Procesează plățile aprobate: coada finanțe, marchează plătit, atașează dovada.",
  par_admin: "Configurează tot: roluri, matrice DOA, date de referință, setări.",
};

// ─── Sub-tab: DOA Matrix Editor ───────────────────────────────────────────────

interface DoaEditorProps {
  departments: ParDepartment[];
}

function DoaMatrixEditor({ departments }: DoaEditorProps) {
  const [rows, setRows] = useState<ParDoaRow[]>([]);
  const [payers, setPayers] = useState<ParPayer[]>([]);
  const [projects, setProjects] = useState<ParProject[]>([]);
  const [members, setMembers] = useState<ParMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Which rule is open in the builder: a scope key for an existing rule, "__new__" to add, or null.
  const [editingKey, setEditingKey] = useState<string | null>(null);

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
  useEffect(() => {
    Promise.all([
      Promise.resolve().then(() => listPayers()).catch(() => ({ items: [] })),
      listProjects(),
      listParMembers(),
    ]).then(([pa, pr, me]) => {
      setPayers(pa.items);
      setProjects(pr.items);
      setMembers(me.members);
    }).catch(() => { /* amount-only rules remain editable */ });
  }, []);

  const groups = groupDoaRows(rows);

  const saveRule = async (draft: RuleDraft, replaceKey: string | null) => {
    if (draft.approvers.length === 0) { setError("Adaugă cel puțin un aprobator."); return; }
    setSaving(true);
    setError(null);
    try {
      // Editing an existing rule replaces its rows wholesale: delete the old scope rows, create fresh.
      if (replaceKey && replaceKey !== "__new__") {
        const old = rows.filter((r) => ruleScopeKey(r) === replaceKey);
        await Promise.all(old.map((r) => deleteParDoaRow(r.id)));
      }
      for (const payload of buildDoaRows(draft)) {
        await createParDoaRow(payload);
      }
      await load();
      setEditingKey(null);
    } catch {
      setError("Eroare la salvare");
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (key: string) => {
    if (!confirm("Ștergi această regulă de aprobare?")) return;
    setError(null);
    try {
      const old = rows.filter((r) => ruleScopeKey(r) === key);
      await Promise.all(old.map((r) => deleteParDoaRow(r.id)));
      await load();
    } catch {
      setError("Eroare la ștergere");
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
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-2xl">
          O regulă spune <span className="font-medium text-foreground">cine aprobă</span> o cerere și{" "}
          <span className="font-medium text-foreground">în ce ordine</span>. Alegi organizația și proiectul,
          apoi persoanele care aprobă. Regulile se aplică automat când cererea e trimisă.
        </p>
        <button
          type="button"
          onClick={() => { setEditingKey("__new__"); setError(null); }}
          disabled={editingKey === "__new__"}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 min-h-[44px] flex-shrink-0"
          aria-label="Adaugă regulă de aprobare"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Adaugă regulă
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {editingKey === "__new__" && (
        <ApprovalRuleBuilder
          initial={emptyRuleDraft()}
          isNew
          saving={saving}
          departments={departments}
          payers={payers}
          projects={projects}
          members={members}
          onSave={(draft) => saveRule(draft, "__new__")}
          onCancel={() => { setEditingKey(null); setError(null); }}
        />
      )}

      {groups.length === 0 && editingKey !== "__new__" && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nicio regulă de aprobare. Apasă „Adaugă regulă" ca să spui cine aprobă cererile.
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          editingKey === g.key ? (
            <ApprovalRuleBuilder
              key={g.key}
              initial={g.draft}
              saving={saving}
              departments={departments}
              payers={payers}
              projects={projects}
              members={members}
              onSave={(draft) => saveRule(draft, g.key)}
              onCancel={() => { setEditingKey(null); setError(null); }}
            />
          ) : (
            <RuleCard
              key={g.key}
              group={g}
              departments={departments}
              payers={payers}
              projects={projects}
              members={members}
              onEdit={() => { setEditingKey(g.key); setError(null); }}
              onDelete={() => removeRule(g.key)}
            />
          )
        ))}
      </div>
    </div>
  );
}

/** Human label for an approver pick — the person's name, or the role for a role-based approver. */
function approverDisplayName(pick: { userId: string | null; parRole: string | null; label: string }, members: ParMember[]): string {
  if (pick.userId) {
    const m = members.find((x) => x.userId === pick.userId);
    return m?.userName ?? m?.userEmail ?? pick.label ?? "Aprobator";
  }
  if (pick.parRole) {
    const role = ROLE_OPTIONS.find((o) => o.value === pick.parRole)?.label ?? pick.parRole;
    return `Oricine cu rolul ${role}`;
  }
  return pick.label || "Aprobator";
}

interface ApprovalRuleBuilderProps {
  initial: RuleDraft;
  isNew?: boolean;
  saving: boolean;
  departments: ParDepartment[];
  payers: ParPayer[];
  projects: ParProject[];
  members: ParMember[];
  onSave: (draft: RuleDraft) => void;
  onCancel: () => void;
}

/**
 * Simplified approval-rule builder: pick the scope (org + project), the people who approve, and how
 * they approve (one-after-another vs any-order). Generates the underlying DOA rows on save.
 */
function ApprovalRuleBuilder({ initial, isNew, saving, departments, payers, projects, members, onSave, onCancel }: ApprovalRuleBuilderProps) {
  const [draft, setDraft] = useState<RuleDraft>(initial);
  const [showAdvanced, setShowAdvanced] = useState(
    initial.minAmountCents > 0 || initial.maxAmountCents != null || !!initial.departmentId || !!initial.chargeTo
  );
  const [addPick, setAddPick] = useState("");

  const set = <K extends keyof RuleDraft>(key: K, val: RuleDraft[K]) => setDraft((d) => ({ ...d, [key]: val }));

  const field = "w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]";
  const labelCls = "text-xs font-medium text-muted-foreground block mb-1";
  const legendCls = "text-xs font-semibold uppercase tracking-wide text-foreground mb-2";

  const chosenUserIds = new Set(draft.approvers.filter((a) => a.userId).map((a) => a.userId));
  const multiple = draft.approvers.length > 1;

  const addApprover = (value: string) => {
    if (value.startsWith("user:")) {
      const userId = value.slice(5);
      if (chosenUserIds.has(userId)) { setAddPick(""); return; }
      const m = members.find((x) => x.userId === userId);
      set("approvers", [...draft.approvers, { userId, parRole: null, label: m?.userName ?? m?.userEmail ?? "Aprobator" }]);
    } else if (value.startsWith("role:")) {
      const role = value.slice(5) as ApproverPick["parRole"];
      const roleLabel = ROLE_OPTIONS.find((o) => o.value === role)?.label ?? String(role);
      set("approvers", [...draft.approvers, { userId: null, parRole: role, label: `Oricine · ${roleLabel}` }]);
    }
    setAddPick("");
  };

  const removeApprover = (idx: number) => set("approvers", draft.approvers.filter((_, i) => i !== idx));
  const moveApprover = (idx: number, dir: -1 | 1) => {
    const next = [...draft.approvers];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    set("approvers", next);
  };

  return (
    <div className="space-y-5 p-4 rounded-lg border border-primary/30 bg-primary/5">
      {/* 1. Scope — org + project */}
      <fieldset className="border-0 p-0 m-0">
        <legend className={legendCls}>1. Pentru ce cereri</legend>
        <p className="text-xs text-muted-foreground mb-2">
          Alege organizația și proiectul. Lasă „Orice" ca regula să se aplice tuturor cererilor.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Plătitor / Organizație</label>
            <Select value={draft.payerId ?? ""} onChange={(e) => setDraft((d) => ({ ...d, payerId: e.target.value || null, projectId: null }))} className={field} aria-label="Plătitor regulă de aprobare">
              <option value="">Orice plătitor</option>
              {payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <label className={labelCls}>Proiect / Program</label>
            <Select value={draft.projectId ?? ""} onChange={(e) => set("projectId", e.target.value || null)} className={field} aria-label="Proiect regulă de aprobare">
              <option value="">Orice proiect</option>
              {projects.filter((p) => !draft.payerId || p.payerId === draft.payerId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        </div>
      </fieldset>

      {/* 2. Approvers — pick the people (or roles) who approve */}
      <fieldset className="border-0 p-0 m-0">
        <legend className={legendCls}>2. Cine aprobă</legend>
        {draft.approvers.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-2">Adaugă persoanele care trebuie să aprobe cererea.</p>
        ) : (
          <ul className="space-y-2 mb-2">
            {draft.approvers.map((a, i) => (
              <li key={`${a.userId ?? a.parRole}-${i}`} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                {multiple && draft.mode === "sequential" && (
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>{i + 1}</span>
                )}
                <span className="flex-1 text-sm text-foreground truncate">{approverDisplayName(a, members)}</span>
                {multiple && draft.mode === "sequential" && (
                  <>
                    <button type="button" onClick={() => moveApprover(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground" aria-label={`Mută mai sus ${approverDisplayName(a, members)}`}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                    <button type="button" onClick={() => moveApprover(i, 1)} disabled={i === draft.approvers.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground" aria-label={`Mută mai jos ${approverDisplayName(a, members)}`}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                  </>
                )}
                <button type="button" onClick={() => removeApprover(i)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label={`Elimină ${approverDisplayName(a, members)}`}><Trash2 className="h-4 w-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
        <Select value={addPick} onChange={(e) => addApprover(e.target.value)} className={cn(field, "sm:max-w-md")} aria-label="Adaugă aprobator">
          <option value="">+ Adaugă aprobator…</option>
          {members.length > 0 && (
            <optgroup label="Persoane">
              {members.filter((m) => !chosenUserIds.has(m.userId)).map((m) => (
                <option key={`${m.userId}-${m.role}`} value={`user:${m.userId}`}>{m.userName ?? m.userEmail ?? m.userId} · {m.role}</option>
              ))}
            </optgroup>
          )}
          <optgroup label="Oricine cu rolul">
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={`role:${o.value}`}>{o.label}</option>)}
          </optgroup>
        </Select>
      </fieldset>

      {/* 3. Mode — only matters with 2+ approvers */}
      {multiple && (
        <fieldset className="border-0 p-0 m-0">
          <legend className={legendCls}>3. Cum aprobă</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" onClick={() => set("mode", "sequential")} aria-pressed={draft.mode === "sequential"}
              className={cn("text-left rounded-lg border p-3 transition-colors min-h-[44px]", draft.mode === "sequential" ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted")}>
              <span className="block text-sm font-medium text-foreground">Pe rând (unul după altul)</span>
              <span className="block text-xs text-muted-foreground">Întâi 1, apoi 2… Cererea trece la următorul doar după ce cel dinainte aprobă.</span>
            </button>
            <button type="button" onClick={() => set("mode", "parallel")} aria-pressed={draft.mode === "parallel"}
              className={cn("text-left rounded-lg border p-3 transition-colors min-h-[44px]", draft.mode === "parallel" ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted")}>
              <span className="block text-sm font-medium text-foreground">În orice ordine</span>
              <span className="block text-xs text-muted-foreground">Cererea le apare tuturor deodată; toți trebuie să aprobe (ordinea nu contează).</span>
            </button>
          </div>
        </fieldset>
      )}

      {/* Advanced: amount band + department + charge-to (kept, but out of the way) */}
      <div>
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground min-h-[36px]" aria-expanded={showAdvanced}>
          <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} aria-hidden />
          Condiții avansate (sumă, departament) — opțional
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
            <div>
              <label className={labelCls}>Sumă de la (MDL)</label>
              <Input type="number" min={0} step={100} value={(draft.minAmountCents ?? 0) / 100} onChange={(e) => set("minAmountCents", Math.round(parseFloat(e.target.value || "0") * 100))} className={field} aria-label="Sumă minimă MDL" />
            </div>
            <div>
              <label className={labelCls}>Până la (MDL, gol = ∞)</label>
              <Input type="number" min={0} step={100} value={draft.maxAmountCents != null ? draft.maxAmountCents / 100 : ""} onChange={(e) => set("maxAmountCents", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)} className={field} placeholder="Fără limită" aria-label="Sumă maximă MDL" />
            </div>
            <div>
              <label className={labelCls}>Departament</label>
              <Select value={draft.departmentId ?? ""} onChange={(e) => set("departmentId", e.target.value || null)} className={field} aria-label="Departament">
                <option value="">Orice</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
            <div>
              <label className={labelCls}>Charge To</label>
              <Select value={draft.chargeTo ?? ""} onChange={(e) => set("chargeTo", (e.target.value || null) as RuleDraft["chargeTo"])} className={field} aria-label="Charge To">
                {CHARGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={() => onSave(draft)} disabled={saving || draft.approvers.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
          aria-label="Salvează regula de aprobare">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          {isNew ? "Salvează regula" : "Salvează modificările"}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted min-h-[44px]" aria-label="Anulează">
          <X className="h-4 w-4" aria-hidden />
          Anulează
        </button>
      </div>
    </div>
  );
}

interface RuleCardProps {
  group: GroupedRule;
  departments: ParDepartment[];
  payers: ParPayer[];
  projects: ParProject[];
  members: ParMember[];
  onEdit: () => void;
  onDelete: () => void;
}

/** Read-only summary of one approval rule: scope + how the chosen people approve. */
function RuleCard({ group, departments, payers, projects, members, onEdit, onDelete }: RuleCardProps) {
  const d = group.draft;
  const payerName = d.payerId ? payers.find((p) => p.id === d.payerId)?.name ?? d.payerId : "Orice plătitor";
  const projectName = d.projectId ? projects.find((p) => p.id === d.projectId)?.name ?? d.projectId : "Orice proiect";
  const deptName = d.departmentId ? departments.find((x) => x.id === d.departmentId)?.name ?? d.departmentId : null;
  const names = d.approvers.map((a) => approverDisplayName(a, members));
  const single = d.approvers.length === 1;
  const hasAmount = d.minAmountCents > 0 || d.maxAmountCents != null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="font-medium text-foreground">{payerName}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground">{projectName}</span>
            {deptName && <span className="text-xs text-muted-foreground">· {deptName}</span>}
            {d.chargeTo && <span className="text-xs text-muted-foreground">· {d.chargeTo}</span>}
          </div>
          {hasAmount && (
            <div className="text-xs text-muted-foreground">
              Sumă: {centsToMDL(d.minAmountCents)}{d.maxAmountCents != null ? ` – ${centsToMDL(d.maxAmountCents)}` : "+"} MDL
            </div>
          )}
          <div className="text-sm text-foreground">
            {single ? (
              <span><span className="text-muted-foreground">Aprobă:</span> {names[0]}</span>
            ) : d.mode === "sequential" ? (
              <span>
                <span className="text-muted-foreground">Pe rând:</span>{" "}
                {names.map((n, i) => <span key={i}>{i > 0 && <span className="text-muted-foreground"> → </span>}{i + 1}. {n}</span>)}
              </span>
            ) : (
              <span><span className="text-muted-foreground">Toți aprobă (orice ordine):</span> {names.join(", ")}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={onEdit} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Editează regula">
            <Edit2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button type="button" onClick={onDelete} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Șterge regula">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-tab: Settings ────────────────────────────────────────────────────────

/** The four currencies the module actually supports (same list as the onboarding wizard). */
const CURRENCY_OPTIONS = [
  { value: "MDL", label: "MDL — Leu moldovenesc" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "USD", label: "USD — Dolar american" },
  { value: "RON", label: "RON — Leu românesc" },
];

const isHttpUrl = (v: string) => /^https?:\/\/\S+$/i.test(v);

interface ParSettingsFormProps {
  /** Duce la lista de organizații plătitoare — acolo se completează datele fiecărei entități. */
  onManagePayers: () => void;
}

function ParSettingsForm({ onManagePayers }: ParSettingsFormProps) {
  const { navigate } = useRouter();
  const [settings, setSettings] = useState<Partial<ParSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoBroken, setLogoBroken] = useState(false);

  useEffect(() => {
    getParSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    // The server's zod gate rejects non-URLs with a raw 400 — say it in Romanian, before the trip.
    for (const [val, label] of [
      [settings.orgLogoUrl, "Logo URL"],
      [settings.pdfHelpUrl, "URL Instrucțiuni"],
    ] as const) {
      if (val && !isHttpUrl(val)) {
        setError(`${label} trebuie să fie un link complet (http:// sau https://).`);
        return;
      }
    }
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

  const section = (title: string, hint: string, children: React.ReactNode) => (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );

  return (
    <div className="max-w-lg space-y-5">
      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {section("Organizație", "Valorile implicite ale workspace-ului, folosite când cererea nu are o organizație plătitoare aleasă.", (
        <>
          {/* Identitatea reală (IDNO, adresă, cont, semnatar) stă pe FIECARE organizație plătitoare:
              un workspace poate avea mai multe entități care achită, iar setările sunt unice. */}
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              Ai mai multe organizații care plătesc? Datele fiecăreia — IDNO, cod TVA, adresă,
              cont bancar, semnatar — se completează separat, pe organizație.
            </p>
            <button
              type="button"
              onClick={onManagePayers}
              className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Building2 className="h-4 w-4" aria-hidden />
              Organizații plătitoare
            </button>
          </div>

          <div>
            <label htmlFor="par-legal-name" className="text-sm font-medium text-foreground block mb-1">
              Denumire legală organizație
            </label>
            <Input
              id="par-legal-name"
              type="text"
              value={settings.orgLegalName ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, orgLegalName: e.target.value || null }))}
              aria-label="Denumire legală organizație"
            />
          </div>

          <div>
            <label htmlFor="par-logo-url" className="text-sm font-medium text-foreground block mb-1">
              Logo URL (opțional)
            </label>
            <div className="flex items-center gap-3">
              <Input
                id="par-logo-url"
                type="url"
                value={settings.orgLogoUrl ?? ""}
                onChange={(e) => { setSettings((s) => ({ ...s, orgLogoUrl: e.target.value || null })); setLogoBroken(false); }}
                placeholder="https://…/logo.png"
                aria-label="Logo URL"
                className="flex-1"
              />
              {settings.orgLogoUrl && isHttpUrl(settings.orgLogoUrl) && !logoBroken && (
                <img
                  src={settings.orgLogoUrl}
                  alt="Previzualizare logo"
                  className="h-10 w-10 flex-shrink-0 rounded-md border border-border object-contain bg-background"
                  onError={() => setLogoBroken(true)}
                />
              )}
            </div>
            {logoBroken && (
              <p className="mt-1 text-xs text-warning">Imaginea nu s-a putut încărca de la acest link.</p>
            )}
          </div>

          <div>
            <label htmlFor="par-help-url" className="text-sm font-medium text-foreground block mb-1">
              URL Instrucțiuni (help link PDF)
            </label>
            <Input
              id="par-help-url"
              type="url"
              value={settings.pdfHelpUrl ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, pdfHelpUrl: e.target.value || null }))}
              placeholder="https://…/instrucțiuni.pdf"
              aria-label="URL Instrucțiuni PDF"
            />
          </div>
        </>
      ))}

      {section("Cereri de plată", "Cum se numerotează și se rutează cererile noi.", (
        <>
          <div>
            <label htmlFor="par-prefix" className="text-sm font-medium text-foreground block mb-1">
              Prefix număr cerere
            </label>
            <Input
              id="par-prefix"
              type="text"
              value={settings.requestNoPrefix ?? "PAR"}
              onChange={(e) => setSettings((s) => ({ ...s, requestNoPrefix: e.target.value || "PAR" }))}
              aria-label="Prefix număr cerere (ex. PAR)"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Exemplu: {(settings.requestNoPrefix ?? "PAR").toUpperCase() || "PAR"} → {(settings.requestNoPrefix ?? "PAR").toUpperCase() || "PAR"}-2026-0001
            </p>
          </div>

          <div>
            <label htmlFor="par-currency" className="text-sm font-medium text-foreground block mb-1">
              Monedă implicită
            </label>
            <Select
              id="par-currency"
              value={settings.defaultCurrency ?? "MDL"}
              onChange={(e) => setSettings((s) => ({ ...s, defaultCurrency: e.target.value }))}
              aria-label="Monedă implicită"
            >
              {CURRENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="par-threshold" className="text-sm font-medium text-foreground block mb-1">
              Prag micro-achiziție (MDL)
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Cererile sub acest prag necesită o singură aprobare. Modificarea afectează cererile noi.
            </p>
            <Input
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
              aria-label="Prag micro-achiziție MDL"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Actual: {formatMDL(settings.microPurchaseThresholdCents ?? 1000000)}
            </p>
          </div>
        </>
      ))}

      {section("Control financiar", "Verificări suplimentare înainte de plată.", (
        /* VF-505: enforce 3-way match toggle */
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enforceThreeWayMatch ?? false}
            onChange={(e) => setSettings((s) => ({ ...s, enforceThreeWayMatch: e.target.checked }))}
            className="mt-0.5"
            aria-label="Impune 3-way match la plată"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">Impune 3-way match la plată</span>
            <span className="block text-xs text-muted-foreground">Blochează plata până când există PO, recepție completă și suma e în limita comenzii (±10%).</span>
          </span>
        </label>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={handleSave} disabled={saving} size="lg"
          className={cn(saved && "bg-success text-success-foreground hover:bg-success/90")}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : saved ? <Check className="h-4 w-4" aria-hidden /> : null}
          {saving ? "Se salvează..." : saved ? "Salvat!" : "Salvează setări"}
        </Button>
        {/* The wizard is idempotent (skips what exists), so re-running it is always safe. */}
        <Button variant="ghost" onClick={() => navigate("/business/par/onboarding")}
          className="text-muted-foreground">
          Reia configurarea inițială
        </Button>
      </div>
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
  return { label: "Activă", cls: "text-success" };
}

function DelegationSection({ members }: { members: ParMember[] }) {
  const [delegations, setDelegations] = useState<ParDelegation[]>([]);
  const [toUserId, setToUserId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only approvers/admins can be delegates.
  // Any member of the org can receive a delegation — the delegation is what grants
  // approval authority for the window. Restricting the list to existing approvers
  // made delegation impossible in a one-approver org, which is when it is needed.
  const delegateCandidates = Array.from(
    new Map(members.map((m) => [m.userId, m])).values(),
  );

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
          <Select id="deleg-to" value={toUserId} onChange={(e) => setToUserId(e.target.value)} aria-label="Delegat">
            <option value="">Alege coleg…</option>
            {delegateCandidates.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userName ?? m.userId}
                {m.role === "approver" || m.role === "par_admin" ? "" : " (primește drept de aprobare)"}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="deleg-from" className="text-xs font-medium text-muted-foreground block mb-1">De la</label>
          <Input id="deleg-from" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div>
          <label htmlFor="deleg-until" className="text-xs font-medium text-muted-foreground block mb-1">Până la</label>
          <Input id="deleg-until" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
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
  const [payerFilter, setPayerFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [parEventFilter, setParEventFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [payers, setPayers] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; payerId: string | null }>>([]);
  const [events, setEvents] = useState<Array<{ id: string; name: string; projectId: string | null }>>([]);
  const [members, setMembers] = useState<Array<{ userId: string; userName?: string | null }>>([]);

  useEffect(() => {
    Promise.all([listPayers(), listProjects(), listEvents(), listParMembers()]).then(([pa, pr, ev, me]) => {
      setPayers(pa.items); setProjects(pr.items); setEvents(ev.events); setMembers(me.members);
    }).catch(() => { /* filter labels are optional */ });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getParAudit({
        event: eventFilter || undefined,
        payer_id: payerFilter || undefined,
        project_id: projectFilter || undefined,
        event_id: parEventFilter || undefined,
        actor_user_id: actorFilter || undefined,
        status: statusFilter || undefined,
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
  }, [eventFilter, payerFilter, projectFilter, parEventFilter, actorFilter, statusFilter, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);
  // Reset to page 1 when filters change.
  useEffect(() => { setPage(1); }, [eventFilter, payerFilter, projectFilter, parEventFilter, actorFilter, statusFilter, dateFrom, dateTo]);

  const exportParams = new URLSearchParams();
  if (eventFilter) exportParams.set("event", eventFilter);
  if (payerFilter) exportParams.set("payer_id", payerFilter);
  if (projectFilter) exportParams.set("project_id", projectFilter);
  if (parEventFilter) exportParams.set("event_id", parEventFilter);
  if (actorFilter) exportParams.set("actor_user_id", actorFilter);
  if (statusFilter) exportParams.set("status", statusFilter);
  if (dateFrom) exportParams.set("date_from", dateFrom);
  if (dateTo) exportParams.set("date_to", dateTo);
  const exportQuery = exportParams.toString() ? `?${exportParams}` : "";

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
          <Select id="audit-event" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}
           >
            {AUDIT_EVENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <Select value={payerFilter} onChange={(e) => { setPayerFilter(e.target.value); setProjectFilter(""); }} aria-label="Filtru plătitor"><option value="">Toți plătitorii</option>{payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Filtru proiect"><option value="">Toate proiectele</option>{projects.filter((p) => !payerFilter || p.payerId === payerFilter).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select value={parEventFilter} onChange={(e) => setParEventFilter(e.target.value)} aria-label="Filtru eveniment PAR"><option value="">Toate evenimentele PAR</option>{events.filter((ev) => !projectFilter || ev.projectId === projectFilter).map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}</Select>
        <Select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} aria-label="Filtru persoană"><option value="">Toate persoanele</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.userName ?? m.userId}</option>)}</Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtru statut PAR"><option value="">Toate statusurile</option>{["draft","pending_approval","changes_requested","rejected","approved","in_finance","reapproval_required","paid","cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        <div>
          <label htmlFor="audit-from" className="text-xs font-medium text-muted-foreground block mb-1">De la</label>
          <Input id="audit-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            />
        </div>
        <div>
          <label htmlFor="audit-to" className="text-xs font-medium text-muted-foreground block mb-1">Până la</label>
          <Input id="audit-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            />
        </div>
        <button type="button" onClick={exportCsv} disabled={entries.length === 0}
          className="inline-flex items-center gap-1.5 h-10 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 min-h-[40px]">
          Export CSV
        </button>
        <a href={`/api/par/audit/export.xlsx${exportQuery}`} download="par-audit.xlsx" className="inline-flex items-center h-10 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Export Excel</a>
        <a href={`/api/par/audit/export.pdf${exportQuery}`} download="par-audit.pdf" className="inline-flex items-center h-10 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Export PDF</a>
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

      <EmailLogSection />
    </div>
  );
}

// VM1-07: outbound email log — a failed approval email must be visible, not a silent console.warn.
function EmailLogSection() {
  const [emails, setEmails] = useState<ParEmailLogEntry[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listParEmailLog(onlyFailed)
      .then((r) => { if (alive) { setEmails(r.emails); setFailedCount(r.failedCount); } })
      .catch(() => { if (alive) setEmails([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [onlyFailed]);

  return (
    <div className="pt-4 border-t border-border space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-foreground">Emailuri PAR trimise</h3>
        {failedCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
            {failedCount} eșuate
          </span>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)}
             />
          Doar eșuate
        </label>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Se încarcă…
        </div>
      ) : emails.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
          {onlyFailed ? "Niciun email eșuat." : "Niciun email PAR trimis încă."}
        </p>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm" aria-label="Jurnal emailuri PAR">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Data</th>
                <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Către</th>
                <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground hidden md:table-cell">Subiect</th>
                <th className="text-left p-2.5 text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="p-2.5 text-muted-foreground text-xs whitespace-nowrap">{auditTimeFmt(m.createdAt)}</td>
                  <td className="p-2.5 text-foreground text-xs">{m.toAddress}</td>
                  <td className="p-2.5 text-muted-foreground text-xs hidden md:table-cell max-w-sm truncate">{m.subject ?? "—"}</td>
                  <td className="p-2.5">
                    {m.status === "failed" ? (
                      <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium" title={m.errorMessage ?? undefined}>
                        Eșuat
                      </span>
                    ) : m.status === "sent" ? (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                        Trimis
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                        În coadă
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── VF-004: Invite by email (inside Members tab) ─────────────────────────────

const INVITE_ROLE_LABELS: Record<string, string> = {
  requestor: "Solicitant", approver: "Aprobator", finance: "Finanțe", par_admin: "Administrator",
};

function InviteSection({ payers }: { payers: ParPayer[] }) {
  const [invites, setInvites] = useState<ParInvite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"requestor" | "approver" | "finance" | "par_admin">("requestor");
  const [payerIds, setPayerIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [lastEmailed, setLastEmailed] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try { const { invites: i } = await listParInvites(); setInvites(i); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => { if (payers.length === 1) setPayerIds([payers[0].id]); }, [payers]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true); setLastUrl(null); setLastEmailed(null);
    try {
      const r = await createParInvite({ email: email.trim(), par_role: role, payer_ids: payerIds });
      setLastUrl(r.inviteUrl);
      setLastEmailed(r.emailed);
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

      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email@exemplu.md" aria-label="Email invitat"
          className="flex-1" />
        <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}
          aria-label="Rol invitat" className="sm:w-44">
          <option value="requestor">Solicitant</option>
          <option value="approver">Aprobator</option>
          <option value="finance">Finanțe</option>
          <option value="par_admin">Administrator</option>
        </Select>
        <button type="submit" disabled={busy || payerIds.length === 0}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 min-h-[44px]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Invită
        </button>
        </div>
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">Organizații accesibile *</legend>
          <div className="flex flex-wrap gap-2">
            {payers.map((payer) => <label key={payer.id} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input type="checkbox" checked={payerIds.includes(payer.id)} onChange={() => setPayerIds((current) => current.includes(payer.id) ? current.filter((id) => id !== payer.id) : [...current, payer.id])} />
              {payer.name}
            </label>)}
          </div>
        </fieldset>
      </form>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-2.5 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />{error}
        </div>
      )}

      {lastUrl && (
        <div className="space-y-1.5">
          {lastEmailed === false && (
            <div role="status" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/[0.08] p-2.5 text-xs text-warning">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-px" aria-hidden />
              <span>Emailul <strong>nu s-a trimis</strong> (serviciul de email nu e configurat). Copiază linkul de mai jos și trimite-l manual persoanei invitate — trebuie să-l deschidă și să apese «Continuă cu Google».</span>
            </div>
          )}
          {lastEmailed === true && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-primary" aria-hidden /> Email de invitație trimis. Link de rezervă:</p>
          )}
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-primary/5 border border-primary/20 text-sm">
            <span className="text-muted-foreground flex-shrink-0">Link:</span>
            <code className="flex-1 truncate text-xs text-foreground">{lastUrl}</code>
            <button type="button" onClick={() => copy(lastUrl)} aria-label="Copiază linkul"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted transition-colors flex-shrink-0">
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? "Copiat" : "Copiază"}
            </button>
          </div>
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
                <span className="block text-xs text-muted-foreground">{(inv.payerIds ?? []).map((id) => payers.find((payer) => payer.id === id)?.name ?? id).join(", ") || "Toate organizațiile (invitație veche)"}</span>
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

// VM1-01: group par_members by userId for display — one row per person, multiple role badges.
interface GroupedMember {
  userId: string;
  userName?: string;
  userEmail?: string;
  roles: Array<{ id: string; role: ParMember["role"]; approvalLimitCents: number | null; implicit?: boolean; implicitFromTenantRole?: string }>;
}

function groupMembers(members: ParMember[]): GroupedMember[] {
  const map = new Map<string, GroupedMember>();
  for (const m of members) {
    const existing = map.get(m.userId);
    const roleEntry = { id: m.id, role: m.role, approvalLimitCents: m.approvalLimitCents, implicit: m.implicit, implicitFromTenantRole: m.implicitFromTenantRole };
    if (existing) {
      existing.roles.push(roleEntry);
    } else {
      map.set(m.userId, {
        userId: m.userId,
        userName: m.userName,
        userEmail: m.userEmail,
        roles: [roleEntry],
      });
    }
  }
  return Array.from(map.values());
}

const ROLE_BADGE_COLORS: Record<ParMember["role"], string> = {
  requestor: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  approver: "bg-warning/15 text-warning",
  finance: "bg-success/15 text-success",
  par_admin: "bg-primary/10 text-primary",
};

const ROLE_LABELS: Record<ParMember["role"], string> = {
  requestor: "Requestor",
  approver: "Approver",
  finance: "Finance",
  par_admin: "Admin",
};

/**
 * Self-service role panel. The admin is an implicit par_admin but, to appear in approval chains, they
 * need an explicit `approver` (or finance/requestor) row. This is the one-click "give MYSELF
 * role X" shortcut (the general form covers colleagues via the by-name picker).
 * (Owner: "vreau să dau rol de aprobator și mie, dar nu pot".)
 */
const SELF_ASSIGNABLE: Array<{ value: "approver" | "finance" | "requestor"; label: string }> = [
  { value: "approver", label: "Aprobator" },
  { value: "finance", label: "Finanțe" },
  { value: "requestor", label: "Solicitant" },
];

function MyRolesPanel({ onChanged }: { onChanged: () => void }) {
  const [me, setMe] = useState<{ userId: string; roles: string[] } | null>(null);
  const [role, setRole] = useState<"approver" | "finance" | "requestor">("approver");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = async () => {
    try {
      const m = await getParMe();
      setMe({ userId: m.userId, roles: m.roles ?? [] });
    } catch {
      /* ignore — panel just hides */
    }
  };
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me?.userId) return null;
  const has = (r: string) => me.roles.includes(r);

  const addToSelf = async () => {
    setBusy(true);
    setErr(null);
    try {
      await assignParMember({ userId: me.userId, role });
      await reload();
      onChanged();
    } catch {
      setErr("Nu am putut adăuga rolul.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">Rolurile mele</h3>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {me.roles.length === 0 ? (
          <span className="text-sm text-muted-foreground">Niciun rol PAR încă.</span>
        ) : (
          me.roles.map((r) => (
            <span key={r} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {INVITE_ROLE_LABELS[r] ?? r}
            </span>
          ))
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor="self-role" className="sr-only">Rol de adăugat mie</label>
        <Select
          id="self-role"
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
         
        >
          {SELF_ASSIGNABLE.map((o) => (
            <option key={o.value} value={o.value} disabled={has(o.value)}>
              {o.label}{has(o.value) ? " (ai deja)" : ""}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={addToSelf}
          disabled={busy || has(role)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Adaugă-mi acest rol
        </button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

function MemberAccessEditor({
  userId,
  displayName,
  projects,
  payers,
  departments,
  onClose,
}: {
  userId: string;
  displayName: string;
  projects: ParProject[];
  payers: ParPayer[];
  departments: ParDepartment[];
  onClose: () => void;
}) {
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [payerIds, setPayerIds] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getParMemberProfile(userId).then(({ profile, projectIds: assigned, payerIds: assignedPayers = [] }) => {
      setProjectIds(assigned);
      setPayerIds(assignedPayers);
      setDepartmentId(profile?.departmentId ?? "");
      setJobTitle(profile?.jobTitle ?? "");
      setStaffCode(profile?.staffCode ?? "");
    }).catch(() => setMessage("Nu am putut încărca profilul."))
      .finally(() => setLoading(false));
  }, [userId]);

  const toggleProject = (id: string) => setProjectIds((current) =>
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
  );
  const togglePayer = (id: string) => setPayerIds((current) =>
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
  );
  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await Promise.all([
        updateParMemberProfile(userId, {
          department_id: departmentId || null,
          job_title: jobTitle.trim() || null,
          staff_code: staffCode.trim() || null,
        }),
        setParMemberProjects(userId, projectIds),
        setParMemberPayers(userId, payerIds),
      ]);
      setMessage("Profilul și accesul la organizații/proiecte au fost salvate.");
    } catch {
      setMessage("Nu am putut salva profilul și accesul.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Profil și acces — {displayName}</h3>
          <p className="text-xs text-muted-foreground">O organizație bifată oferă acces la toate proiectele ei, inclusiv cele create ulterior. Proiectele bifate separat oferă acces punctual.</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground" aria-label="Închide editorul"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Se încarcă" /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs font-medium text-muted-foreground">Departament
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="mt-1"><option value="">Fără implicit</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">Funcție
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-1" placeholder="ex. Coordonator proiect" />
            </label>
            <label className="text-xs font-medium text-muted-foreground">Cod personal
              <Input value={staffCode} onChange={(e) => setStaffCode(e.target.value)} className="mt-1" placeholder="ex. FIN-024" />
            </label>
          </div>
          <fieldset>
            <legend className="text-xs font-medium text-muted-foreground mb-2">Plătitori / organizații accesibile</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {payers.map((payer) => (
                <label key={payer.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <input type="checkbox" checked={payerIds.includes(payer.id)} onChange={() => togglePayer(payer.id)} className="h-4 w-4" />
                  <span>{payer.name}</span>
                </label>
              ))}
              {payers.length === 0 && <span className="text-sm text-muted-foreground">Nu există organizații active.</span>}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-xs font-medium text-muted-foreground mb-2">Proiecte suplimentare accesibile</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto">
              {projects.map((project) => (
                <label key={project.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <input type="checkbox" checked={projectIds.includes(project.id)} onChange={() => toggleProject(project.id)} className="h-4 w-4" />
                  <span>{project.name}<span className="ml-1 text-xs text-muted-foreground">· {payers.find((payer) => payer.id === project.payerId)?.name ?? "Fără plătitor"}</span></span>
                </label>
              ))}
              {projects.length === 0 && <span className="text-sm text-muted-foreground">Nu există proiecte active.</span>}
            </div>
          </fieldset>
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Salvează profil și acces
            </button>
            {message && <span className="text-sm text-muted-foreground" role="status">{message}</span>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * PARQA-025: pick a colleague by NAME or EMAIL instead of pasting their UUID.
 * Plain combobox on ds primitives — an Input that filters, a listbox of buttons.
 */
function CandidatePicker({
  candidates, memberRoles, value, onPick,
}: {
  candidates: ParMemberCandidate[];
  /** userId → role labels already held (shown as a hint in the list). */
  memberRoles: Map<string, string[]>;
  value: ParMemberCandidate | null;
  onPick: (c: ParMemberCandidate | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = candidates
    .filter((c) => `${c.name ?? ""} ${c.email}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);

  if (value) {
    return (
      <div className="flex min-h-[40px] items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-1.5">
        <span className="min-w-0 text-sm">
          <span className="block truncate font-medium text-foreground">{value.name ?? value.email}</span>
          {value.name && <span className="block truncate text-xs text-muted-foreground">{value.email}</span>}
        </span>
        <button
          type="button"
          onClick={() => onPick(null)}
          aria-label="Schimbă utilizatorul ales"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id="member-user-picker"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="member-user-picker-list"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Caută după nume sau email…"
          className="pl-8"
          aria-label="Caută utilizator după nume sau email"
        />
      </div>
      {open && (
        <ul
          id="member-user-picker-list"
          role="listbox"
          aria-label="Utilizatori găsiți"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md divide-y divide-border"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">Niciun utilizator găsit.</li>
          )}
          {filtered.map((c) => {
            const held = memberRoles.get(c.id) ?? [];
            return (
              <li key={c.id} role="option" aria-selected="false">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onPick(c); setQ(""); setOpen(false); }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{c.name ?? c.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                  </span>
                  {held.length > 0 && (
                    <span className="flex-shrink-0 text-xs text-muted-foreground">{held.join(", ")}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ParMembersTab() {
  const [members, setMembers] = useState<ParMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<{
    role: string;
    approvalLimitCents: string;
    payerIds: string[];
  }>({ role: "requestor", approvalLimitCents: "", payerIds: [] });
  const [pickedUser, setPickedUser] = useState<ParMemberCandidate | null>(null);
  const [candidates, setCandidates] = useState<ParMemberCandidate[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [accessUserId, setAccessUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ParProject[]>([]);
  const [departments, setDepartments] = useState<ParDepartment[]>([]);
  const [payers, setPayers] = useState<ParPayer[]>([]);

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
  useEffect(() => {
    Promise.all([listProjects(), listDepartments(), listPayers()]).then(([p, d, payerRows]) => {
      setProjects(p.items);
      setDepartments(d.items ?? []);
      setPayers(payerRows.items ?? []);
    }).catch(() => { /* editor will show empty reference lists */ });
    listParMemberCandidates()
      .then(({ candidates: c }) => setCandidates(c))
      .catch(() => { /* picker shows an empty list; roles can still be granted via invite */ });
  }, []);
  useEffect(() => {
    if (payers.length === 1) setAddForm((form) => ({ ...form, payerIds: form.payerIds.length ? form.payerIds : [payers[0].id] }));
  }, [payers]);

  const handleAdd = async () => {
    if (!pickedUser) {
      setError("Alege un utilizator din listă (caută după nume sau email).");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await assignParMember({
        userId: pickedUser.id,
        role: addForm.role as "requestor" | "approver" | "finance" | "par_admin",
        approvalLimitCents: addForm.approvalLimitCents
          ? mdlToCents(addForm.approvalLimitCents)
          : null,
      });
      await setParMemberPayers(pickedUser.id, addForm.payerIds);
      setPickedUser(null);
      setAddForm({ role: "requestor", approvalLimitCents: "", payerIds: payers.length === 1 ? [payers[0].id] : [] });
      setShowAddForm(false);
      await load();
    } catch {
      setError("Eroare la adăugare");
    } finally {
      setAdding(false);
    }
  };

  const handleRevoke = async (id: string, roleName: string, userName: string) => {
    if (!confirm(`Revoce rolul „${roleName}" pentru ${userName}?`)) return;
    try {
      await revokeParMember(id);
      await load();
    } catch (e) {
      // The server refuses to orphan the module: surface ITS reason, not a generic one.
      setError(e instanceof ApiError && e.code === "last_par_admin"
        ? "Nu poți elimina ultimul administrator PAR. Acordă rolul altcuiva mai întâi."
        : "Eroare la revocare");
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

  // VM1-01: group by userId so one person with multiple roles shows as one row
  const grouped = groupMembers(members);
  // PARQA-025: quick search over the member table (name/email), client-side.
  const visibleGrouped = memberSearch.trim()
    ? grouped.filter((g) =>
        `${g.userName ?? ""} ${g.userEmail ?? ""}`.toLowerCase().includes(memberSearch.trim().toLowerCase()))
    : grouped;

  return (
    <div className="space-y-6">
      {/* Self-service: add a PAR role (e.g. Aprobator) to myself without needing my own UUID */}
      <MyRolesPanel onChanged={load} />

      {/* VF-004: invite by email */}
      <InviteSection payers={payers} />

      {/* VF-302: approver delegation */}
      <DelegationSection members={members} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Utilizatori cu roluri PAR ({grouped.length} persoan{grouped.length === 1 ? "ă" : "e"}, {members.length} rol{members.length === 1 ? "" : "uri"}).
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Caută membru…"
              aria-label="Caută membru după nume sau email"
              className="w-48 pl-8"
            />
          </div>
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
      </div>

      {/* PARQA-025: what each role means — visible where roles are handed out. */}
      <details className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Ce poate fiecare rol?
        </summary>
        <dl className="mt-2 space-y-1.5">
          {ROLE_OPTIONS.map((o) => (
            <div key={o.value} className="flex gap-2 text-sm">
              <dt className={cn("inline-flex h-fit items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0", ROLE_BADGE_COLORS[o.value as ParMember["role"]])}>
                {ROLE_LABELS[o.value as ParMember["role"]]}
              </dt>
              <dd className="text-muted-foreground">{ROLE_DESCRIPTIONS[o.value]}</dd>
            </div>
          ))}
        </dl>
      </details>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {showAddForm && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5">
          <div>
            <label htmlFor="member-user-picker" className="text-xs font-medium text-muted-foreground block mb-1">
              Utilizator
            </label>
            <CandidatePicker
              candidates={candidates}
              memberRoles={new Map(grouped.map((g) => [g.userId, g.roles.map((r) => ROLE_LABELS[r.role])]))}
              value={pickedUser}
              onPick={setPickedUser}
            />
          </div>
          <div>
            <label htmlFor="member-role" className="text-xs font-medium text-muted-foreground block mb-1">
              Rol
            </label>
            <Select
              id="member-role"
              value={addForm.role}
              onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
              aria-label="Rol PAR"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {ROLE_DESCRIPTIONS[addForm.role]}
            </p>
          </div>
          <div>
            <label htmlFor="member-limit" className="text-xs font-medium text-muted-foreground block mb-1">
              Limită aprobare (MDL, opțional)
            </label>
            <Input
              id="member-limit"
              type="number"
              min={0}
              value={addForm.approvalLimitCents}
              onChange={(e) => setAddForm((f) => ({ ...f, approvalLimitCents: e.target.value }))}
              className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]"
              aria-label="Limită aprobare MDL"
            />
          </div>
          <fieldset className="sm:col-span-3">
            <legend className="mb-2 text-xs font-medium text-muted-foreground">Plătitori / organizații accesibile *</legend>
            <div className="flex flex-wrap gap-2">
              {payers.map((payer) => <label key={payer.id} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
                <input type="checkbox" checked={addForm.payerIds.includes(payer.id)} onChange={() => setAddForm((form) => ({ ...form, payerIds: form.payerIds.includes(payer.id) ? form.payerIds.filter((id) => id !== payer.id) : [...form.payerIds, payer.id] }))} />
                {payer.name}
              </label>)}
            </div>
          </fieldset>
          <div className="col-span-1 sm:col-span-3 flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || addForm.payerIds.length === 0}
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

      {accessUserId && (() => {
        const person = grouped.find((entry) => entry.userId === accessUserId);
        return person ? <MemberAccessEditor userId={person.userId} displayName={person.userName ?? person.userId} projects={projects} payers={payers} departments={departments} onClose={() => setAccessUserId(null)} /> : null;
      })()}

      {/* VM1-01: grouped by person — one row per person, multiple role badges */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm" aria-label="Membri PAR">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Utilizator</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Roluri</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Limită aprobare</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Acces</th>
            </tr>
          </thead>
          <tbody>
            {visibleGrouped.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                  {memberSearch.trim() ? `Niciun membru nu se potrivește cu „${memberSearch.trim()}".` : "Niciun rol atribuit."}
                </td>
              </tr>
            )}
            {visibleGrouped.map((g) => {
              // approvalLimitCents: show the approver's limit if present, else any non-null
              const approverRole = g.roles.find((r) => r.role === "approver");
              const limitEntry = approverRole ?? g.roles.find((r) => r.approvalLimitCents != null);
              const displayLimit = limitEntry?.approvalLimitCents ?? null;
              const displayName = g.userName ?? g.userId;

              return (
                <tr key={g.userId} className="border-t border-border">
                  <td className="p-3">
                    <div>
                      <p className="font-medium text-foreground">{displayName}</p>
                      {g.userEmail && (
                        <p className="text-xs text-muted-foreground">{g.userEmail}</p>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1" role="list" aria-label={`Roluri pentru ${displayName}`}>
                      {g.roles.map((r) => (
                        <div key={r.id} className="flex items-center gap-0.5" role="listitem">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            ROLE_BADGE_COLORS[r.role]
                          )}>
                            {ROLE_LABELS[r.role]}
                          </span>
                          {r.implicit ? (
                            /* Authority comes from the tenant role — there is no par_members
                               row to revoke, so offering an X here would silently do nothing. */
                            <span
                              className="ml-1 rounded-full bg-warning/15 px-2 py-0.5 text-2xs font-medium text-warning"
                              title={`Drepturile vin din rolul de organizație „${r.implicitFromTenantRole}". Se retrag schimbând acel rol, nu de aici.`}
                            >
                              implicit · {r.implicitFromTenantRole}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRevoke(r.id, ROLE_LABELS[r.role], displayName)}
                              className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                              aria-label={`Revoce rolul ${ROLE_LABELS[r.role]} pentru ${displayName}`}
                            >
                              <X className="h-3 w-3" aria-hidden />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-right text-foreground">
                    {displayLimit != null
                      ? formatMDL(displayLimit)
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3 text-right">
                    <button type="button" onClick={() => setAccessUserId(g.userId)} className="rounded-md border border-input px-2.5 py-1.5 text-xs hover:bg-muted">
                      Profil și acces
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sub-tab: Reference Data ──────────────────────────────────────────────────

type RefSection = "payers" | "budgetCodes" | "departments" | "projects" | "events" | "vendors";

interface ParReferenceDataProps {
  /** Secțiunea deschisă la intrare (ex. „Organizații plătitoare", venind din Setări). */
  initialSection?: RefSection;
}

function ParReferenceData({ initialSection }: ParReferenceDataProps) {
  const [section, setSection] = useState<RefSection>(initialSection ?? "budgetCodes");
  const [departments, setDepartments] = useState<ParDepartment[]>([]);
  const [payers, setPayers] = useState<ParPayer[]>([]);
  const [projects, setProjects] = useState<ParProject[]>([]);
  const [events, setEvents] = useState<ParEvent[]>([]); // VM1-04
  const [budgetCodes, setBudgetCodes] = useState<ParBudgetCode[]>([]);
  const [vendors, setVendors] = useState<ParVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // VM1-02: Excel import state
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ParConfigImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  // VM1-02b: the file waits in the mapping dialog until the admin says what each column is.
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ParConfigImportPreview | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [payerRows, depts, projs, evts, codes, vends] = await Promise.all([
        listPayers(),
        listDepartments(),
        listProjects(),
        listEvents(), // VM1-04
        listBudgetCodes(),
        listVendors(),
      ]);
      setPayers(payerRows.items ?? []);
      setDepartments(depts.items ?? []);
      setProjects(projs.items ?? []);
      setEvents(evts.events ?? []); // VM1-04
      setBudgetCodes(codes.items ?? []);
      setVendors(vends.items ?? []);
    } catch {
      setError("Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  // Separarea rechizitelor vechi trăiește AICI, nu în VendorSection: `load()` ridică `loading`,
  // iar secțiunea e înlocuită cu spinnerul — o stare locală în VendorSection s-ar pierde la
  // remontare și utilizatorul n-ar apuca să vadă niciodată câte rânduri au fost reparate.
  const [normalizing, setNormalizing] = useState(false);
  const [normalizeResult, setNormalizeResult] = useState<string | null>(null);

  const handleNormalizeVendors = async () => {
    setNormalizing(true);
    setNormalizeResult(null);
    try {
      const res = await normalizeVendorRequisites();
      setNormalizeResult(
        res.updated > 0
          ? `${res.updated} din ${res.scanned} beneficiari au fost separați.`
          : "Nimic de separat — codurile sunt deja în coloanele lor."
      );
      await load();
    } catch (e) {
      setNormalizeResult(e instanceof Error ? e.message : "Separarea nu a reușit.");
    } finally {
      setNormalizing(false);
    }
  };

  // VM1-02: file selection → read the sheets/columns (no writes) → mapping dialog
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected
    e.target.value = "";
    setImportError(null);
    setImportResult(null);
    setImportPreview(null);
    setImportFile(file);
    try {
      setImportPreview(await previewParConfigExcel(file));
    } catch (err) {
      setImportFile(null);
      setImportError(err instanceof Error ? err.message : "Fișierul nu a putut fi citit.");
    }
  };

  // VM1-02b: the admin confirmed what every column means → import with that exact mapping
  const runImport = async (mapping: ParConfigImportMapping) => {
    if (!importFile) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const result = await importParConfigExcel(importFile, mapping);
      setImportResult(result);
      setImportFile(null);
      setImportPreview(null);
      // Reload reference data after successful import
      await load();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Eroare la import.");
    } finally {
      setImportLoading(false);
    }
  };

  const cancelImport = () => {
    setImportFile(null);
    setImportPreview(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>Se încarcă...</span>
      </div>
    );
  }

  const sectionLabels: Record<RefSection, string> = {
    payers: "Organizații plătitoare",
    budgetCodes: "Coduri bugetare",
    departments: "Departamente",
    projects: "Proiecte/Programe",
    events: "Evenimente", // VM1-04
    vendors: "Beneficiari / Furnizori",
  };

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* VM1-02: Import Excel section */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border">
        <span className="text-sm text-muted-foreground">Import în masă:</span>
        <button
          type="button"
          onClick={() => importFileRef.current?.click()}
          disabled={importLoading}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-[36px] disabled:opacity-50"
          aria-label="Import din Excel"
        >
          {importLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          {importLoading ? "Se importă..." : "Import din Excel"}
        </button>
        <button
          type="button"
          onClick={downloadParConfigTemplate}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-border hover:bg-muted transition-colors min-h-[36px]"
          aria-label="Descarcă template Excel"
        >
          <Download className="h-4 w-4" aria-hidden />
          Template
        </button>
        {/* Hidden file input */}
        <input
          ref={importFileRef}
          type="file"
          accept=".xlsx"
          className="sr-only"
          aria-label="Alege fișier Excel"
          onChange={handleImportFile}
        />
      </div>

      {/* VM1-02b: choose the import type + column mapping before anything is written */}
      <ParImportMappingDialog
        open={importFile !== null}
        preview={importPreview}
        fileName={importFile?.name ?? ""}
        loading={importLoading}
        onCancel={cancelImport}
        onConfirm={runImport}
      />
      <details className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">Cum se face importul Excel</summary>
        <div className="mt-2 space-y-1 text-muted-foreground">
          <p>1. Poți folosi template-ul sau <strong className="font-medium text-foreground">orice fișier al tău</strong> — denumirile foilor și ale coloanelor nu contează.</p>
          <p>2. După ce alegi fișierul se deschide o fereastră în care <strong className="font-medium text-foreground">tu decizi</strong>: pentru fiecare foaie, ce fel de date conține (coduri bugetare, proiecte, departamente, plătitori) și ce reprezintă fiecare coloană. Coloanele lăsate pe „nu importa" sunt ignorate. Sugestiile sunt pre-completate, dar le poți schimba.</p>
          <p>3. Dacă în coloana pusă pe <span className="font-mono">Cod</span> ai tot textul (ex. <span className="font-mono">1.1 Project Coordinator</span>), codul și denumirea sunt separate automat. Proiectul indicat pe rând este creat dacă nu există.</p>
          <p>4. Sumele acceptă atât formatul MD/EU (<span className="font-mono">12 500,50</span>), cât și formatul internațional (<span className="font-mono">12500.50</span>).</p>
          <p>Importul nu oprește tot fișierul la prima eroare: rândurile valide sunt procesate, iar erorile rămân vizibile pentru corectare.</p>
        </div>
      </details>

      {/* Import error */}
      {importError && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{importError}</span>
        </div>
      )}

      {/* Import result summary */}
      {importResult && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2 text-sm">
          <p className="font-medium text-foreground">Rezultat import:</p>
          {/* Which sheet was read as what — so a file that imports 0 rows is explainable */}
          {(importResult.warnings ?? []).map((w, i) => (
            <p key={`w-${i}`} className="text-muted-foreground text-xs">{w}</p>
          ))}
          {(["payers", "projects", "departments", "budgetCodes", "vendors"] as const).map((key) => {
            const cat = importResult[key];
            if (!cat) return null;
            const label =
              key === "payers" ? "Plătitori"
              : key === "projects" ? "Proiecte"
              : key === "departments" ? "Departamente"
              : key === "budgetCodes" ? "Coduri buget"
              : "Beneficiari / Furnizori";
            return (
              <div key={key} className="space-y-1">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{label}:</span>{" "}
                  {cat.created} create, {cat.updated} actualizate
                  {cat.errors.length > 0 && (
                    <span className="text-destructive ml-2">({cat.errors.length} erori)</span>
                  )}
                </p>
                {cat.errors.map((e, i) => (
                  <p key={i} className="ml-4 text-destructive text-xs">
                    Rând {e.row}, coloana „{e.column}": {e.message}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Section tabs */}
      <Tabs
        className="flex-wrap"
        aria-label="Secțiuni date referință"
        value={section}
        onChange={(v) => setSection(v as RefSection)}
        tabs={(Object.keys(sectionLabels) as RefSection[]).map((s) => ({ value: s, label: sectionLabels[s] }))}
      />

      {section === "payers" && <PayerOrgsSection payers={payers} onChanged={load} />}

      {section === "budgetCodes" && (
        <BudgetCodesTable
          items={budgetCodes}
          payers={payers}
          projects={projects}
          onAdd={(payload) =>
            createBudgetCode({
              code: payload.code ?? "",
              name: payload.name ?? "",
              payer_id: String(payload.payer_id || "") || null,
              project_id: String(payload.project_id || "") || null,
              allocatedCents: payload.allocatedCents ?? 0,
            } as { code: string; name: string; allocatedCents?: number }).then(load)
          }
          onEdit={(id, payload) =>
            updateBudgetCode(id, {
              code: payload.code,
              name: payload.name,
              payer_id: String(payload.payer_id || "") || null,
              project_id: String(payload.project_id || "") || null,
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
        <div className="space-y-6">
          <SimpleRefTable
            title="Proiecte / Programe"
            items={projects}
            columns={[
              { label: "Denumire", key: "name" as const },
              { label: "Donor", key: "donor" as const },
              { label: "Plătitor", key: "payerId" as const, format: (value) => payers.find((p) => p.id === value)?.name ?? "—" },
            ]}
            onAdd={(payload) => createProject({ name: payload.name, donor: payload.donor || null, payer_id: payload.payerId || null }).then(load)}
            onEdit={(id, payload) => updateProject(id, { name: payload.name, donor: payload.donor || null, payer_id: payload.payerId || null }).then(load)}
            onDelete={(id) => deleteProject(id).then(load)}
            addFields={[
              { id: "name", label: "Denumire", placeholder: "ex. Digital Safeguard", required: true },
              { id: "donor", label: "Donor (opțional)", placeholder: "ex. USAID" },
              { id: "payerId", label: "Plătitor / Organizație", required: true, options: payers.map((p) => ({ value: p.id, label: p.name })) },
            ]}
          />
          <ProjectApproversSection projects={projects} onReload={load} />
        </div>
      )}

      {/* Feature 2: Events — rich table with dates, creator, spend */}
      {section === "events" && (
        <EventsTable
          events={events}
          projects={projects}
          onReload={load}
        />
      )}

      {section === "vendors" && (
        <VendorSection
          vendors={vendors}
          onReload={load}
          normalizing={normalizing}
          normalizeResult={normalizeResult}
          onNormalize={handleNormalizeVendors}
        />
      )}
    </div>
  );
}

// ─── Project-scoped approvers (VF-approval-scoping) ─────────────────────────
// Per project, the par_admin picks which approvers may decide its PARs. No selection = any approver.

function ProjectApproversSection({
  projects,
  onReload,
}: {
  projects: import("@/lib/api/par").ParProject[];
  onReload: () => Promise<void>;
}) {
  // Eligible approvers = unique users holding the approver/par_admin role.
  const [approvers, setApprovers] = useState<Array<{ userId: string; name: string }>>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listParMembers()
      .then(({ members }) => {
        const seen = new Set<string>();
        const list: Array<{ userId: string; name: string }> = [];
        for (const m of members) {
          if (m.role !== "approver" && m.role !== "par_admin") continue;
          if (seen.has(m.userId)) continue;
          seen.add(m.userId);
          list.push({ userId: m.userId, name: m.userName || m.userEmail || m.userId.slice(0, 8) });
        }
        setApprovers(list);
      })
      .catch(() => setErr("Nu am putut încărca aprobatorii."));
  }, []);

  const toggle = async (project: import("@/lib/api/par").ParProject, userId: string) => {
    const current = new Set(project.approverUserIds ?? []);
    if (current.has(userId)) current.delete(userId);
    else current.add(userId);
    setSavingId(project.id);
    setErr(null);
    try {
      await setProjectApprovers(project.id, [...current]);
      await onReload();
    } catch {
      setErr("Nu am putut salva aprobatorii proiectului.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          Aprobatori pe proiect
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Alege cine poate aproba cererile fiecărui proiect. Fără nicio bifă = orice aprobator poate decide.
        </p>
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      {approvers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Niciun aprobator încă. Adaugă rolul „Aprobator" unui membru (tab Membri) ca să apară aici.
        </p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Niciun proiect încă.</p>
      ) : (
        <ul className="divide-y divide-border">
          {projects.map((p) => {
            const selected = new Set(p.approverUserIds ?? []);
            return (
              <li key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="sm:w-48 shrink-0">
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.size === 0 ? "Toți aprobatorii" : `${selected.size} aprobator(i)`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {approvers.map((a) => {
                    const on = selected.has(a.userId);
                    return (
                      <button
                        key={a.userId}
                        type="button"
                        onClick={() => toggle(p, a.userId)}
                        disabled={savingId === p.id}
                        aria-pressed={on}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors min-h-[32px] disabled:opacity-50",
                          on
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-input hover:border-primary/50"
                        )}
                      >
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Feature 2: Events table (rich: dates, creator, spend) ──────────────────

interface EventsTableProps {
  events: ParEvent[];
  projects: import("@/lib/api/par").ParProject[];
  onReload: () => Promise<void>;
}

function EventsTable({ events, projects, onReload }: EventsTableProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; project_id: string; starts_at: string; ends_at: string }>({
    name: "", project_id: "", starts_at: "", ends_at: "",
  });
  const [saving, setSaving] = useState(false);
  const [spendByEvent, setSpendByEvent] = useState<Record<string, number>>({});

  useEffect(() => {
    getParReportByEvent()
      .then((r) => {
        const map: Record<string, number> = {};
        for (const item of r.items) if (item.id) map[item.id] = item.totalCents;
        setSpendByEvent(map);
      })
      .catch(() => {/* non-blocking */});
  }, [events]);

  const reset = () => {
    setForm({ name: "", project_id: "", starts_at: "", ends_at: "" });
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (ev: ParEvent) => {
    setEditingId(ev.id);
    setForm({
      name: ev.name,
      project_id: ev.projectId ?? "",
      starts_at: ev.startsAt ? ev.startsAt.slice(0, 10) : "",
      ends_at: ev.endsAt ? ev.endsAt.slice(0, 10) : "",
    });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        project_id: form.project_id || null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      };
      if (editingId) {
        await updateEvent(editingId, payload);
      } else {
        await createEvent(payload);
      }
      await onReload();
      reset();
    } catch { /* error shown by browser */ }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    await deleteEvent(id).catch(() => {/* */});
    await onReload();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Evenimente</h3>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors min-h-[36px]"
            aria-label="Adaugă eveniment nou"
          >
            <Plus className="h-4 w-4" aria-hidden /> Adaugă
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">{editingId ? "Editează eveniment" : "Eveniment nou"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="ev-name" className="block text-xs font-medium text-muted-foreground mb-1">Denumire *</label>
              <Input
                id="ev-name"
                type="text"
                required
                placeholder="ex. Conferința Anuală 2026"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
               
              />
            </div>
            <div>
              <label htmlFor="ev-project" className="block text-xs font-medium text-muted-foreground mb-1">Proiect (opțional)</label>
              <Select
                id="ev-project"
                value={form.project_id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
               
                aria-label="Proiect"
              >
                <option value="">— Neasociat —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor="ev-starts" className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <Calendar className="h-3 w-3" aria-hidden /> Data început
              </label>
              <Input
                id="ev-starts"
                type="date"
                value={form.starts_at}
                onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
               
              />
            </div>
            <div>
              <label htmlFor="ev-ends" className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <Calendar className="h-3 w-3" aria-hidden /> Data sfârșit
              </label>
              <Input
                id="ev-ends"
                type="date"
                value={form.ends_at}
                min={form.starts_at || undefined}
                onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
               
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[36px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              {editingId ? "Salvează" : "Adaugă"}
            </button>
            <button type="button" onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted transition-colors min-h-[36px]">
              <X className="h-4 w-4" aria-hidden /> Anulează
            </button>
          </div>
        </form>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Niciun eveniment. Adaugă primul eveniment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border text-xs">
                <th className="pb-2 pr-3 font-medium">Denumire</th>
                <th className="pb-2 pr-3 font-medium">Proiect</th>
                <th className="pb-2 pr-3 font-medium">Interval</th>
                <th className="pb-2 pr-3 font-medium">Adăugat de</th>
                <th className="pb-2 pr-3 font-medium text-right flex items-center gap-1 justify-end">
                  <BarChart2 className="h-3 w-3" aria-hidden /> Cheltuieli
                </th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const spend = spendByEvent[ev.id];
                return (
                  <tr key={ev.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{ev.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground text-xs">
                      {ev.projectName ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                      {ev.startsAt ? ev.startsAt.slice(0, 10) : "—"}
                      {ev.endsAt ? ` → ${ev.endsAt.slice(0, 10)}` : ""}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {ev.createdByName ?? "—"}
                      {ev.createdAt && (
                        <span className="block text-[10px]">{new Date(ev.createdAt).toLocaleDateString("ro-MD")}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-xs font-medium text-foreground">
                      {spend != null ? formatMDL(spend) : "—"}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <button type="button" aria-label={`Editează ${ev.name}`}
                          onClick={() => startEdit(ev)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
                          <Edit2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button type="button" aria-label={`Șterge ${ev.name}`}
                          onClick={() => remove(ev.id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
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
  const barColor = pct > 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-success";
  const textColor = pct > 100 ? "text-destructive" : pct >= 80 ? "text-warning" : "text-muted-foreground";
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
  payers: ParPayer[];
  projects: ParProject[];
  onAdd: (payload: Record<string, string | number | undefined>) => Promise<void>;
  onEdit: (id: string, payload: Record<string, string | number | undefined>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function BudgetCodesTable({ items, payers, projects, onAdd, onEdit, onDelete }: BudgetCodesTableProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ code: string; name: string; allocatedMDL: string; payerId: string; projectId: string }>({
    code: "", name: "", allocatedMDL: "", payerId: payers.length === 1 ? payers[0].id : "", projectId: "",
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
    setForm({ code: "", name: "", allocatedMDL: "", payerId: payers.length === 1 ? payers[0].id : "", projectId: "" });
    setShowForm(true);
    setEditingId(null);
  };

  const startEdit = (item: BudgetCodeItem) => {
    setForm({
      code: item.code,
      name: item.name,
      allocatedMDL: item.allocatedCents ? String((item.allocatedCents / 100).toFixed(0)) : "",
      payerId: item.payerId ?? "",
      projectId: item.projectId ?? "",
    });
    setEditingId(item.id);
    setShowForm(false);
  };

  const cancel = () => { setShowForm(false); setEditingId(null); setForm({ code: "", name: "", allocatedMDL: "", payerId: payers.length === 1 ? payers[0].id : "", projectId: "" }); };

  const handleSave = async () => {
    setSaving(true);
    const allocatedCents = form.allocatedMDL
      ? Math.round(parseFloat(form.allocatedMDL.replace(/\s/g, "").replace(",", ".")) * 100) || 0
      : 0;
    try {
      if (editingId) {
        await onEdit(editingId, { code: form.code, name: form.name, allocatedCents, payer_id: form.payerId, project_id: form.projectId || undefined });
      } else {
        await onAdd({ code: form.code, name: form.name, allocatedCents, payer_id: form.payerId, project_id: form.projectId || undefined });
      }
      cancel();
    } finally {
      setSaving(false);
    }
  };

  const renderForm = (inline?: boolean) => (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5", inline && "mt-2")}>
      <div>
        <label htmlFor="bc-code" className="text-xs font-medium text-muted-foreground block mb-1">Cod</label>
        <Input id="bc-code" type="text" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          placeholder="ex. OPS-001" className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]" aria-label="Cod bugetar" />
      </div>
      <div>
        <label htmlFor="bc-name" className="text-xs font-medium text-muted-foreground block mb-1">Denumire</label>
        <Input id="bc-name" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="ex. Cheltuieli operaționale" className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]" aria-label="Denumire cod bugetar" />
      </div>
      <div>
        <label htmlFor="bc-alloc" className="text-xs font-medium text-muted-foreground block mb-1">Alocare (MDL, 0 = fără plafon)</label>
        <Input id="bc-alloc" type="number" min={0} step={100} value={form.allocatedMDL}
          onChange={(e) => setForm((f) => ({ ...f, allocatedMDL: e.target.value }))}
          placeholder="ex. 50000" className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]" aria-label="Alocare MDL" />
      </div>
      <div>
        <label htmlFor="bc-payer" className="text-xs font-medium text-muted-foreground block mb-1">Plătitor / Organizație</label>
        <Select id="bc-payer" value={form.payerId} required onChange={(e) => setForm((f) => ({ ...f, payerId: e.target.value, projectId: "" }))}
          className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]">
          <option value="">— Selectează —</option>
          {payers.map((payer) => <option key={payer.id} value={payer.id}>{payer.name}</option>)}
        </Select>
      </div>
      <div>
        <label htmlFor="bc-project" className="text-xs font-medium text-muted-foreground block mb-1">Proiect (opțional)</label>
        <Select id="bc-project" value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
          className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]">
          <option value="">Toate proiectele plătitorului</option>
          {projects.filter((project) => !form.payerId || project.payerId === form.payerId).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </Select>
      </div>
      <div className="col-span-1 sm:col-span-2 lg:col-span-5 flex gap-2">
        <button type="button" onClick={handleSave} disabled={saving || !form.code.trim() || !form.name.trim() || !form.payerId}
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
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Scope</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground">Alocare (MDL)</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground sr-only">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">Niciun cod bugetar.</td></tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                {editingId === item.id ? (
                  <td colSpan={5} className="p-0">{renderForm(true)}</td>
                ) : (
                  <>
                    <td className="p-3 text-foreground font-mono text-xs">{item.code}</td>
                    <td className="p-3 text-foreground">{item.name}</td>
                    <td className="p-3 text-foreground text-xs">
                      <span className="block">{payers.find((payer) => payer.id === item.payerId)?.name ?? "—"}</span>
                      <span className="text-muted-foreground">{item.projectId ? projects.find((project) => project.id === item.projectId)?.name ?? "Proiect necunoscut" : "Toate proiectele"}</span>
                    </td>
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
  /** Separarea rechizitelor vechi e ținută de părinte — vezi comentariul de la handleNormalizeVendors. */
  normalizing: boolean;
  normalizeResult: string | null;
  onNormalize: () => void;
}

function VendorSection({ vendors, onReload, normalizing, normalizeResult, onNormalize }: VendorSectionProps) {
  const [registryQuery, setRegistryQuery] = useState("");
  const [registryResults, setRegistryResults] = useState<RegistryCompany[]>([]);
  const [registrySearching, setRegistrySearching] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const registryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill vendor form from registry pick
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyVendorForm = () => ({ name: "", idnp: "", vat_code: "", iban: "", bank: "", bic_swift: "", legal_address: "", administrator_name: "", contact_name: "", contact_phone: "", contact_email: "" });
  const [form, setForm] = useState<Record<string, string>>(emptyVendorForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setForm((f) => ({ ...f, name: co.name, idnp: co.idno ?? "", legal_address: co.address ?? "" }));
    setRegistryQuery("");
    setRegistryResults([]);
    setShowForm(true);
  };

  const startAdd = () => { setForm(emptyVendorForm()); setShowForm(true); setEditingId(null); setSaveError(null); };
  const startEdit = (v: ParVendor) => { setForm({ ...emptyVendorForm(), name: v.name, idnp: v.idnp ?? "", vat_code: v.vatCode ?? "", iban: v.iban ?? "", bank: v.bank ?? "", bic_swift: v.bicSwift ?? "", legal_address: v.legalAddress ?? "", administrator_name: v.administratorName ?? "", contact_name: v.contactName ?? "", contact_phone: v.contactPhone ?? "", contact_email: v.contactEmail ?? "" }); setEditingId(v.id); setShowForm(false); };
  const cancel = () => { setShowForm(false); setEditingId(null); setForm(emptyVendorForm()); };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = { name: form.name, idnp: form.idnp || null, vat_code: form.vat_code || null, iban: form.iban || null, bank: form.bank || null, bic_swift: form.bic_swift || null, legal_address: form.legal_address || null, administrator_name: form.administrator_name || null, contact_name: form.contact_name || null, contact_phone: form.contact_phone || null, contact_email: form.contact_email || null };
      if (editingId) {
        await updateVendor(editingId, payload);
      } else {
        await createVendor(payload);
      }
      await onReload();
      cancel();
    } catch (e) {
      // Serverul validează IBAN-ul/codul fiscal și poate răspunde 400. Fără acest catch,
      // eroarea se pierdea și butonul „Salvează" părea că nu face nimic.
      setSaveError(e instanceof Error ? e.message : "Beneficiarul nu a putut fi salvat.");
    } finally {
      setSaving(false);
    }
  };

  const renderVendorForm = (inline?: boolean) => (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5", inline && "mt-2")}>
      {([
        { id: "name", label: "Nume", placeholder: "Daria Roitman" },
        // IDNO/IDNP e formatul MOLDOVENESC (13 cifre); registrul ține și beneficiari străini,
        // al căror cod fiscal are alt format — de aceea eticheta nu mai promite „13 cifre".
        { id: "idnp", label: "IDNO / IDNP sau cod fiscal străin", placeholder: "2008001007903" },
        // Codul de TVA e un număr DISTINCT de codul fiscal, chiar dacă documentele le tipăresc
        // lipite („c.f./ nr.TVA …"). Contabila filtrează după el, deci are câmpul lui.
        { id: "vat_code", label: "Cod TVA", placeholder: "0301234" },
        { id: "iban", label: "IBAN (orice țară)", placeholder: "MD48ML000002259A19498121" },
        { id: "bank", label: "Bancă (doar denumirea)", placeholder: 'BC "Moldindconbank" S.A.' },
        { id: "bic_swift", label: "Cod bancar (BIC / SWIFT)", placeholder: "MOLDMD2X322" },
        { id: "administrator_name", label: "Administrator / reprezentant", placeholder: "Prenume Nume" },
        { id: "legal_address", label: "Adresă juridică", placeholder: "Localitate, stradă, număr" },
        { id: "contact_name", label: "Persoană de contact", placeholder: "Prenume Nume" },
        { id: "contact_phone", label: "Telefon", placeholder: "+373…" },
        { id: "contact_email", label: "Email", placeholder: "office@companie.md" },
      ] as { id: string; label: string; placeholder: string }[]).map((field) => (
        <div key={field.id}>
          <label htmlFor={`vnd-${field.id}`} className="text-xs font-medium text-muted-foreground block mb-1">{field.label}</label>
          <Input id={`vnd-${field.id}`} type="text" value={form[field.id] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [field.id]: e.target.value }))}
            placeholder={field.placeholder} className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]" aria-label={field.label} />
        </div>
      ))}
      {saveError && (
        <p className="col-span-1 sm:col-span-2 text-xs text-destructive" role="alert">{saveError}</p>
      )}
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
          <Input type="text" value={registryQuery} onChange={(e) => onQueryChange(e.target.value)}
           
            placeholder="ex. ATIC sau 1002600020555"
            aria-label="Caută companie în registrul contafirm.md" />
          {registrySearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
        </div>
        {registryError && <p className="text-xs text-destructive">{registryError}</p>}

        {/* Beneficiarii salvați înainte de separare au banca + codul bancar + codul fiscal + TVA
            îngrămădite în „Bancă". Separarea la scriere curăță doar ce se salvează de-acum;
            istoricul trece o dată prin același separator, de aici. Se poate rula de oricâte ori. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <button type="button" onClick={onNormalize} disabled={normalizing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-60 min-h-[44px]">
            {normalizing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
            Separă codurile din coloana „Bancă"
          </button>
          <span className="text-xs text-muted-foreground">
            {normalizeResult ?? "Mută codul bancar, codul fiscal și TVA-ul din denumirea băncii în coloanele lor."}
          </span>
        </div>
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

      {/* Rechizitele au fiecare coloana ei: contabila filtrează/copiază un cod, nu un paragraf.
          Tabelul e lat, deci derulează pe orizontală în interiorul lui — pagina nu se lățește. */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm" aria-label="Furnizori">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Nume</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Cod fiscal / IDNO</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Cod TVA</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">IBAN</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Cod bancar</th>
              <th className="text-left p-3 text-xs font-semibold text-muted-foreground">Bancă</th>
              <th className="text-right p-3 text-xs font-semibold text-muted-foreground sr-only">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">Niciun furnizor.</td></tr>
            )}
            {vendors.map((v) => (
              <tr key={v.id} className="border-t border-border">
                {editingId === v.id ? (
                  <td colSpan={7} className="p-0">{renderVendorForm(true)}</td>
                ) : (
                  <>
                    <td className="p-3 text-foreground">{v.name}</td>
                    <td className="p-3 text-foreground font-mono text-xs whitespace-nowrap">{v.idnp || <span className="font-sans text-muted-foreground">—</span>}</td>
                    <td className="p-3 text-foreground font-mono text-xs whitespace-nowrap">{v.vatCode || <span className="font-sans text-muted-foreground">—</span>}</td>
                    <td className="p-3 text-foreground font-mono text-xs whitespace-nowrap">{v.iban || <span className="font-sans text-muted-foreground">—</span>}</td>
                    <td className="p-3 text-foreground font-mono text-xs whitespace-nowrap">{v.bicSwift || <span className="font-sans text-muted-foreground">—</span>}</td>
                    <td className="p-3 text-foreground">{v.bank || <span className="text-muted-foreground">—</span>}</td>
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

// ─── Organizații plătitoare ───────────────────────────────────────────────────
// Un workspace poate avea MAI MULTE entități juridice care plătesc (ATIC, un proiect cu
// entitate proprie, un SRL afiliat). De aceea identitatea completă — rechizite, contact,
// semnatar, logo — stă pe fiecare plătitor, nu în setările tenantului (care sunt unice).
// Datele ajung pe fișa aprobărilor din PDF și exclud propria organizație din candidații
// de beneficiar la completarea AI.

interface PayerFieldDef {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  wide?: boolean;
}

const PAYER_FIELD_GROUPS: Array<{ title: string; hint?: string; fields: PayerFieldDef[] }> = [
  {
    title: "Identitate",
    hint: "Denumirea juridică și IDNO apar pe fișa aprobărilor și feresc organizația de a fi propusă drept beneficiar.",
    fields: [
      { id: "name", label: "Denumire scurtă", placeholder: "ex. ATIC", required: true },
      { id: "legalName", label: "Denumire juridică", placeholder: "Denumirea completă din acte" },
      { id: "idno", label: "IDNO / cod fiscal", placeholder: "ex. 1012600000000" },
      { id: "vatCode", label: "Cod TVA", placeholder: "ex. 0301234" },
      { id: "address", label: "Adresa juridică", placeholder: "str. …, mun. Chișinău, MD-2001", wide: true },
    ],
  },
  {
    title: "Contul din care se plătește",
    fields: [
      { id: "bankName", label: "Banca", placeholder: "ex. BC „MAIB” S.A." },
      { id: "iban", label: "IBAN", placeholder: "MD24AG000225100013104168" },
      { id: "bankCode", label: "Cod bancar (BIC/SWIFT)", placeholder: "ex. AGRNMD2X885" },
    ],
  },
  {
    title: "Contact",
    fields: [
      { id: "contactEmail", label: "Email", placeholder: "contabilitate@organizatie.md" },
      { id: "contactPhone", label: "Telefon", placeholder: "+373 22 000 000" },
    ],
  },
  {
    title: "Semnatar",
    hint: "Cine semnează pentru această organizație.",
    fields: [
      { id: "directorName", label: "Nume", placeholder: "ex. Ana Popescu" },
      { id: "directorRole", label: "Funcție", placeholder: "ex. Director executiv" },
    ],
  },
  {
    title: "Antet și note",
    fields: [
      { id: "logoUrl", label: "Logo URL", placeholder: "https://…/logo.png", wide: true },
      { id: "notes", label: "Note interne", placeholder: "Detalii utile echipei (nu apar pe PDF)", multiline: true, wide: true },
    ],
  },
];

/** camelCase din formular → cheile snake_case ale API-ului. */
const PAYER_API_KEYS: Record<string, keyof ParPayerDetailsInput> = {
  legalName: "legal_name",
  idno: "idno",
  vatCode: "vat_code",
  address: "address",
  bankName: "bank_name",
  iban: "iban",
  bankCode: "bank_code",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  directorName: "director_name",
  directorRole: "director_role",
  logoUrl: "logo_url",
  notes: "notes",
};

const PAYER_FIELDS: PayerFieldDef[] = PAYER_FIELD_GROUPS.flatMap((g) => g.fields);

function emptyPayerForm(): Record<string, string> {
  return Object.fromEntries(PAYER_FIELDS.map((f) => [f.id, ""]));
}

function payerFormFrom(payer: ParPayer): Record<string, string> {
  const values = payer as unknown as Record<string, unknown>;
  return Object.fromEntries(PAYER_FIELDS.map((f) => [f.id, String(values[f.id] ?? "")]));
}

/** Trimite TOATE câmpurile de identitate: golirea unui câmp trebuie să se și salveze. */
function payerDetailsPayload(form: Record<string, string>): ParPayerDetailsInput {
  const payload: Record<string, string | null> = {};
  for (const [formKey, apiKey] of Object.entries(PAYER_API_KEYS)) {
    const value = (form[formKey] ?? "").trim();
    payload[apiKey] = formKey === "iban" && value ? value.replace(/\s+/g, "").toUpperCase() : value || null;
  }
  return payload as ParPayerDetailsInput;
}

/** Perechile completate, pentru rezumatul din card (fără cele deja afișate în antetul lui). */
const PAYER_SUMMARY_SKIP = new Set(["name", "legalName", "logoUrl", "notes"]);

function payerSummaryRows(payer: ParPayer): Array<[string, string]> {
  const values = payer as unknown as Record<string, unknown>;
  return PAYER_FIELDS.filter((f) => !PAYER_SUMMARY_SKIP.has(f.id))
    .map((f) => [f.label, String(values[f.id] ?? "")] as [string, string])
    .filter(([, value]) => value.trim().length > 0);
}

interface PayerOrgsSectionProps {
  payers: ParPayer[];
  onChanged: () => Promise<void> | void;
}

function PayerOrgsSection({ payers, onChanged }: PayerOrgsSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null); // id existent sau "new"
  const [form, setForm] = useState<Record<string, string>>(emptyPayerForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (id: string, value: string) => setForm((f) => ({ ...f, [id]: value }));

  const startAdd = () => {
    setForm(emptyPayerForm());
    setEditingId("new");
    setError(null);
  };

  const startEdit = (payer: ParPayer) => {
    setForm(payerFormFrom(payer));
    setEditingId(payer.id);
    setError(null);
  };

  const cancel = () => {
    setEditingId(null);
    setForm(emptyPayerForm());
    setError(null);
  };

  const save = async () => {
    const name = (form.name ?? "").trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const details = payerDetailsPayload(form);
      if (editingId === "new") {
        await createPayer({ name, ...details });
      } else if (editingId) {
        await updatePayer(editingId, { name, ...details });
      }
      await onChanged();
      cancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nu s-a putut salva organizația.");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (payer: ParPayer) => {
    if (!confirm(`Dezactivezi organizația „${payer.name}"? Cererile existente rămân neatinse.`)) return;
    setError(null);
    try {
      await deletePayer(payer.id);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nu s-a putut dezactiva organizația.");
    }
  };

  // IBAN-ul greșit nu blochează salvarea (unele conturi vechi nu trec mod-97), doar avertizează.
  const ibanCheck = validateIban(form.iban ?? "");
  const ibanWarning = (form.iban ?? "").trim() && !ibanCheck.ok ? ibanCheck.message : null;

  const renderForm = () => (
    <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      {PAYER_FIELD_GROUPS.map((group) => (
        <fieldset key={group.title} className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </legend>
          {group.hint && <p className="text-xs text-muted-foreground">{group.hint}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.fields.map((field) => (
              <div key={field.id} className={cn(field.wide && "sm:col-span-2")}>
                <Label htmlFor={`payer-${field.id}`} className="mb-1 block text-xs font-medium text-muted-foreground">
                  {field.label}{field.required && " *"}
                </Label>
                {field.multiline ? (
                  <Textarea
                    id={`payer-${field.id}`}
                    rows={2}
                    value={form[field.id] ?? ""}
                    onChange={(e) => setField(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full"
                  />
                ) : (
                  <Input
                    id={`payer-${field.id}`}
                    type="text"
                    value={form[field.id] ?? ""}
                    onChange={(e) => setField(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full"
                  />
                )}
                {field.id === "iban" && ibanWarning && (
                  <p className="mt-1 text-xs text-destructive">{ibanWarning}</p>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !(form.name ?? "").trim()}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          Salvează
        </button>
        <button
          type="button"
          onClick={cancel}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden />
          Anulează
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Organizații plătitoare</h3>
          <p className="text-xs text-muted-foreground">
            Datele fiecărei entități care achită. Poți avea oricâte în același workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={startAdd}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          aria-label="Adaugă organizație plătitoare"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Adaugă
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {editingId === "new" && renderForm()}

      {payers.length === 0 && editingId !== "new" && (
        <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          Nicio organizație plătitoare.
        </p>
      )}

      <div className="space-y-3">
        {payers.map((payer) => {
          const rows = payerSummaryRows(payer);
          return (
            <div key={payer.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate text-sm font-semibold text-foreground">{payer.name}</span>
                    {payer.active === false && <Badge variant="secondary">Inactivă</Badge>}
                  </div>
                  {payer.legalName && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{payer.legalName}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => (editingId === payer.id ? cancel() : startEdit(payer))}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Editează datele organizației ${payer.name}`}
                  >
                    <Edit2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => deactivate(payer)}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Dezactivează organizația ${payer.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>

              {editingId === payer.id ? (
                <div className="mt-3">{renderForm()}</div>
              ) : rows.length > 0 ? (
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex gap-2 text-xs">
                      <dt className="min-w-[120px] flex-shrink-0 text-muted-foreground">{label}</dt>
                      <dd className="break-words font-medium text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Doar denumirea e completată. Adaugă IDNO, adresa și rechizitele bancare — apar pe fișa aprobărilor.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SimpleRefTableProps<T extends { id: string; active?: boolean }> {
  title: string;
  items: T[];
  columns: { label: string; key: keyof T; format?: (value: string, item: T) => string }[];
  onAdd: (payload: Record<string, string>) => Promise<void>;
  onEdit: (id: string, payload: Record<string, string>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  addFields: { id: string; label: string; placeholder?: string; required?: boolean; options?: { value: string; label: string }[] }[];
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
      f[field.id] = item
        ? String((item as Record<string, unknown>)[field.id] ?? "")
        : field.options?.length === 1 ? field.options[0].value : "";
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
          {field.options ? (
            <Select id={`ref-${field.id}`} value={form[field.id] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [field.id]: e.target.value }))}
              className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]" aria-label={field.label}>
              <option value="">— Selectează —</option>
              {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          ) : (
            <Input id={`ref-${field.id}`} type="text" value={form[field.id] ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, [field.id]: e.target.value }))} placeholder={field.placeholder}
              className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5 min-h-[40px]" aria-label={field.label} />
          )}
        </div>
      ))}
      <div className="col-span-1 sm:col-span-2 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || addFields.some((field) => field.required && !form[field.id]?.trim())}
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
                      : col.format
                        ? col.format(String((item as Record<string, unknown>)[col.key as string] ?? ""), item)
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
  // Secțiunea de date-referință deschisă la comutarea din altă filă (ex. Setări → plătitori).
  const [refSection, setRefSection] = useState<RefSection>("budgetCodes");
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
            onClick={() => navigate("/business/par")}
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
    <AppShell
      pageTitle="Administrare PAR"
      pageDescription="Configurați regulile de aprobare, setările organizației, membrii și datele de referință."
    >
      <div>

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
                "inline-flex min-h-[44px] items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors -mb-px border-b-2",
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
          {tab === "settings" && (
            <ParSettingsForm onManagePayers={() => { setRefSection("payers"); setTab("reference"); }} />
          )}
          {tab === "members" && <ParMembersTab />}
          {tab === "reference" && <ParReferenceData key={refSection} initialSection={refSection} />}
          {tab === "audit" && <AuditTab />}
        </div>
      </div>
    </AppShell>
  );
}

export default ParAdmin;
