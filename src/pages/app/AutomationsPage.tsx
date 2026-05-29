/**
 * CRM-110 — Automations page /app/settings/crm/automations
 * Visual node-like UI for trigger→conditions→actions automations
 */
import { useEffect, useState, useCallback } from "react";
import {
  Loader2, Plus, Trash2, Play, Pause, FlaskConical,
  ChevronDown, X, Check, AlertTriangle, Zap, Clock,
  ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listAutomations, createAutomation, updateAutomation, deleteAutomation,
  testAutomation, listAutomationRuns,
  type Automation, type AutomationCondition, type AutomationAction,
  type AutomationTrigger, type TestResult, type AutomationRun,
} from "@/lib/api/automations";
import { listTemplates, type MessageTemplate } from "@/lib/api/templates";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  "lead.created": "Lead nou creat",
  "lead.stage_changed": "Lead schimbă stadiu",
  "time.no_contact": "Fără contact (zile)",
};

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  "lead.created": <Plus className="h-4 w-4" aria-hidden="true" />,
  "lead.stage_changed": <ArrowRight className="h-4 w-4" aria-hidden="true" />,
  "time.no_contact": <Clock className="h-4 w-4" aria-hidden="true" />,
};

const ACTION_LABELS: Record<string, string> = {
  send_template: "Trimite template",
  create_task: "Creează task",
  assign: "Asignează lead",
  move_stage: "Mută în stadiu",
};

const CONDITION_OP_LABELS: Record<string, string> = {
  eq: "= (egal)",
  neq: "≠ (diferit)",
  contains: "conține",
  gte: "≥ (mai mare sau egal)",
  lte: "≤ (mai mic sau egal)",
  exists: "există",
  not_exists: "nu există",
};

const LEAD_FIELDS = [
  { value: "source", label: "Sursă" },
  { value: "stage", label: "Stadiu" },
  { value: "interest_course", label: "Curs de interes" },
  { value: "assigned_to", label: "Responsabil" },
  { value: "utm_campaign", label: "Campanie UTM" },
  { value: "utm_source", label: "Sursă UTM" },
];

const STAGE_OPTIONS = ["new", "contacted", "trial", "paid", "lost"];

// ─── AutomationEditor component ───────────────────────────────────────────────

interface AutomationEditorProps {
  initial?: Partial<Automation>;
  templates: MessageTemplate[];
  onSave: (data: Omit<Automation, "id" | "tenantId" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
  saving?: boolean;
}

function AutomationEditor({ initial, templates, onSave, onCancel, saving }: AutomationEditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [trigger, setTrigger] = useState<AutomationTrigger>(
    initial?.trigger ?? { event: "lead.created" }
  );
  const [conditions, setConditions] = useState<AutomationCondition[]>(
    initial?.conditions ?? []
  );
  const [actions, setActions] = useState<AutomationAction[]>(
    initial?.actions?.length ? initial.actions : [{ type: "send_template", params: { channel: "email", templateId: "" } }]
  );

  const addCondition = () => {
    setConditions((prev) => [...prev, { field: "source", op: "eq", value: "" }]);
  };

  const removeCondition = (idx: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, patch: Partial<AutomationCondition>) => {
    setConditions((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const addAction = () => {
    setActions((prev) => [...prev, { type: "send_template", params: { channel: "email", templateId: "" } }]);
  };

  const removeAction = (idx: number) => {
    setActions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateAction = (idx: number, patch: Partial<AutomationAction>) => {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };

  const updateActionParams = (idx: number, params: Record<string, unknown>) => {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, params } : a)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || actions.length === 0) return;
    onSave({ name: name.trim(), enabled, trigger, conditions, actions });
  };

  const emailTemplates = templates.filter((t) => t.channel === "email");
  const waTemplates = templates.filter((t) => t.channel === "whatsapp");
  const smsTemplates = templates.filter((t) => t.channel === "sms");

  const getChannelTemplates = (channel: string) => {
    if (channel === "email") return emailTemplates;
    if (channel === "whatsapp") return waTemplates;
    return smsTemplates;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name + enabled */}
      <div className="flex gap-3 items-start">
        <div className="flex-1">
          <label htmlFor="auto-name" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Nume automatizare <span className="text-destructive">*</span>
          </label>
          <input
            id="auto-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Welcome SMS la lead nou Facebook"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            aria-label="Nume automatizare"
          />
        </div>
        <div className="pt-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded"
              aria-label="Activă"
            />
            <span className="text-sm font-semibold">Activă</span>
          </label>
        </div>
      </div>

      {/* Trigger */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-bold">Trigger (când se activează)</h3>
        </div>

        <div>
          <label htmlFor="trigger-event" className="block text-xs font-semibold text-muted-foreground mb-1">
            Eveniment
          </label>
          <div className="relative">
            <select
              id="trigger-event"
              value={trigger.event}
              onChange={(e) => setTrigger({ event: e.target.value as AutomationTrigger["event"] })}
              className="w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm"
              aria-label="Eveniment trigger"
            >
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>

        {trigger.event === "time.no_contact" && (
          <div>
            <label htmlFor="no-contact-days" className="block text-xs font-semibold text-muted-foreground mb-1">
              Zile fără contact
            </label>
            <input
              id="no-contact-days"
              type="number"
              min={1}
              max={90}
              value={(trigger.params?.days as number) ?? 3}
              onChange={(e) => setTrigger({ ...trigger, params: { days: parseInt(e.target.value, 10) } })}
              className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Număr de zile fără contact"
            />
          </div>
        )}

        {trigger.event === "lead.stage_changed" && (
          <div>
            <label htmlFor="stage-to" className="block text-xs font-semibold text-muted-foreground mb-1">
              Spre stadiul (opțional — lasă gol pentru orice stadiu)
            </label>
            <div className="relative">
              <select
                id="stage-to"
                value={(trigger.params?.toStage as string) ?? ""}
                onChange={(e) => setTrigger({ ...trigger, params: { toStage: e.target.value || undefined } })}
                className="w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm"
                aria-label="Stadiu destinație"
              >
                <option value="">— Orice stadiu —</option>
                {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
        )}
      </section>

      {/* Conditions */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
              <Check className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-bold">Condiții (opțional)</h3>
          </div>
          <button
            type="button"
            onClick={addCondition}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
          >
            <Plus className="h-3 w-3" aria-hidden="true" /> Adaugă condiție
          </button>
        </div>

        {conditions.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Fără condiții = se aplică tuturor leadurilor</p>
        )}

        {conditions.map((cond, idx) => (
          <div key={idx} className="flex gap-2 items-center flex-wrap" role="group" aria-label={`Condiție ${idx + 1}`}>
            {/* Field */}
            <div className="relative">
              <select
                value={cond.field}
                onChange={(e) => updateCondition(idx, { field: e.target.value })}
                className="appearance-none rounded-md border border-input bg-background px-2 py-1.5 pr-7 text-xs"
                aria-label="Câmp condiție"
              >
                {LEAD_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            </div>

            {/* Op */}
            <div className="relative">
              <select
                value={cond.op}
                onChange={(e) => updateCondition(idx, { op: e.target.value as AutomationCondition["op"] })}
                className="appearance-none rounded-md border border-input bg-background px-2 py-1.5 pr-7 text-xs"
                aria-label="Operator condiție"
              >
                {Object.entries(CONDITION_OP_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            </div>

            {/* Value (hidden for exists/not_exists) */}
            {!["exists", "not_exists"].includes(cond.op) && (
              <input
                type="text"
                value={cond.value != null ? String(cond.value) : ""}
                onChange={(e) => updateCondition(idx, { value: e.target.value })}
                placeholder="valoare…"
                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs w-32"
                aria-label="Valoare condiție"
              />
            )}

            <button
              type="button"
              onClick={() => removeCondition(idx)}
              className="rounded-md p-1 text-muted-foreground hover:text-destructive"
              aria-label={`Șterge condiția ${idx + 1}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </section>

      {/* Actions */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
              <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-bold">Acțiuni <span className="text-destructive text-xs">*</span></h3>
          </div>
          <button
            type="button"
            onClick={addAction}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
          >
            <Plus className="h-3 w-3" aria-hidden="true" /> Adaugă acțiune
          </button>
        </div>

        {actions.map((action, idx) => (
          <div key={idx} className="rounded-lg border border-border p-3 space-y-2 bg-muted/20" role="group" aria-label={`Acțiune ${idx + 1}`}>
            <div className="flex items-center gap-2">
              {/* Action type */}
              <div className="relative flex-1">
                <select
                  value={action.type}
                  onChange={(e) => {
                    const type = e.target.value as AutomationAction["type"];
                    let params: Record<string, unknown> = {};
                    if (type === "send_template") params = { channel: "email", templateId: "" };
                    if (type === "create_task") params = { title: "", dueDays: 1 };
                    if (type === "assign") params = { userId: "" };
                    if (type === "move_stage") params = { stage: "contacted" };
                    updateAction(idx, { type, params });
                  }}
                  className="w-full appearance-none rounded-md border border-input bg-background px-2 py-1.5 pr-7 text-xs"
                  aria-label="Tip acțiune"
                >
                  {Object.entries(ACTION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              </div>
              <button
                type="button"
                onClick={() => removeAction(idx)}
                disabled={actions.length === 1}
                className="rounded-md p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                aria-label={`Șterge acțiunea ${idx + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Action-specific params */}
            {action.type === "send_template" && (
              <div className="flex gap-2 flex-wrap">
                {/* Channel */}
                <div className="relative">
                  <select
                    value={String(action.params.channel ?? "email")}
                    onChange={(e) => updateActionParams(idx, { ...action.params, channel: e.target.value, templateId: "" })}
                    className="appearance-none rounded-md border border-input bg-background px-2 py-1 pr-6 text-xs"
                    aria-label="Canal mesaj"
                  >
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                </div>
                {/* Template */}
                <div className="relative flex-1 min-w-[160px]">
                  <select
                    value={String(action.params.templateId ?? "")}
                    onChange={(e) => updateActionParams(idx, { ...action.params, templateId: e.target.value })}
                    className="w-full appearance-none rounded-md border border-input bg-background px-2 py-1 pr-6 text-xs"
                    aria-label="Template de trimis"
                  >
                    <option value="">— Selectează template —</option>
                    {getChannelTemplates(String(action.params.channel ?? "email")).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                </div>
              </div>
            )}

            {action.type === "create_task" && (
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  value={String(action.params.title ?? "")}
                  onChange={(e) => updateActionParams(idx, { ...action.params, title: e.target.value })}
                  placeholder="Titlu task…"
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  aria-label="Titlu task nou"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={Number(action.params.dueDays ?? 1)}
                    onChange={(e) => updateActionParams(idx, { ...action.params, dueDays: parseInt(e.target.value, 10) })}
                    className="w-12 rounded-md border border-input bg-background px-2 py-1 text-xs text-center"
                    aria-label="Scadență task (zile)"
                  />
                  <span className="text-xs text-muted-foreground">zile</span>
                </div>
              </div>
            )}

            {action.type === "move_stage" && (
              <div className="relative">
                <select
                  value={String(action.params.stage ?? "contacted")}
                  onChange={(e) => updateActionParams(idx, { stage: e.target.value })}
                  className="appearance-none rounded-md border border-input bg-background px-2 py-1 pr-6 text-xs"
                  aria-label="Stadiu destinație acțiune"
                >
                  {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              </div>
            )}

            {action.type === "assign" && (
              <input
                type="text"
                value={String(action.params.userId ?? "")}
                onChange={(e) => updateActionParams(idx, { userId: e.target.value })}
                placeholder="UUID vânzător…"
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
                aria-label="UUID vânzător"
              />
            )}
          </div>
        ))}
      </section>

      {/* Footer buttons */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
        >
          Anulează
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim() || actions.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Salvează automatizare
        </button>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AutomationsPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [automationsList, setAutomationsList] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const [showEditor, setShowEditor] = useState(false);
  const [editingAuto, setEditingAuto] = useState<Automation | null>(null);
  const [saving, setSaving] = useState(false);

  // Test mode
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; result: TestResult } | null>(null);

  // Runs view
  const [viewRunsId, setViewRunsId] = useState<string | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

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
    try {
      const [autosRes, tmplRes] = await Promise.all([
        listAutomations(),
        listTemplates(),
      ]);
      setAutomationsList(autosRes.items);
      setTemplates(tmplRes.items);
    } catch {
      setError("Nu pot încărca automatizările");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const handleSave = async (data: Omit<Automation, "id" | "tenantId" | "createdAt" | "updatedAt">) => {
    setSaving(true);
    try {
      if (editingAuto) {
        const updated = await updateAutomation(editingAuto.id, data);
        setAutomationsList((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setToast({ kind: "success", message: "Automatizare actualizată" });
      } else {
        const created = await createAutomation(data);
        setAutomationsList((prev) => [created, ...prev]);
        setToast({ kind: "success", message: "Automatizare creată" });
      }
      setShowEditor(false);
      setEditingAuto(null);
    } catch {
      setToast({ kind: "error", message: "Nu pot salva automatizarea" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Ștergi automatizarea?")) return;
    try {
      await deleteAutomation(id);
      setAutomationsList((prev) => prev.filter((a) => a.id !== id));
      setToast({ kind: "success", message: "Automatizare ștearsă" });
    } catch {
      setToast({ kind: "error", message: "Nu pot șterge" });
    }
  };

  const handleToggle = async (auto: Automation) => {
    try {
      const updated = await updateAutomation(auto.id, { enabled: !auto.enabled });
      setAutomationsList((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch {
      setToast({ kind: "error", message: "Nu pot actualiza statusul" });
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await testAutomation(id);
      setTestResult({ id, result });
      setToast({ kind: "success", message: "Test rulat cu succes (dry-run)" });
    } catch {
      setToast({ kind: "error", message: "Eroare la testare" });
    } finally {
      setTestingId(null);
    }
  };

  const handleViewRuns = async (id: string) => {
    setViewRunsId(id);
    setLoadingRuns(true);
    try {
      const res = await listAutomationRuns(id);
      setRuns(res.items);
    } catch {
      setRuns([]);
    } finally {
      setLoadingRuns(false);
    }
  };

  if (loading) {
    return (
      <AppShell pageTitle="Automatizări" pageDescription="">
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Se încarcă…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      pageTitle="Automatizări CRM"
      pageDescription="Trigger → condiții → acțiuni automate pe leaduri"
      actions={
        <button
          type="button"
          onClick={() => { setEditingAuto(null); setShowEditor(true); }}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Automatizare nouă
        </button>
      }
    >
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Editor panel */}
      {showEditor && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-base font-bold mb-4">
            {editingAuto ? "Editează automatizare" : "Automatizare nouă"}
          </h2>
          <AutomationEditor
            initial={editingAuto ?? undefined}
            templates={templates}
            onSave={(data) => void handleSave(data)}
            onCancel={() => { setShowEditor(false); setEditingAuto(null); }}
            saving={saving}
          />
        </div>
      )}

      {/* Automations list */}
      {automationsList.length === 0 && !showEditor ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Zap className="h-8 w-8 mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold">Nicio automatizare creată încă</p>
          <p className="text-xs text-muted-foreground mt-1">
            Adaugă una pentru a răspunde leadurilor automat.
          </p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Lista automatizărilor">
          {automationsList.map((auto) => {
            const trigger = auto.trigger as { event: string };
            const isTestingThis = testingId === auto.id;
            const thisTestResult = testResult?.id === auto.id ? testResult.result : null;

            return (
              <li key={auto.id} className={cn("rounded-xl border bg-card p-4", auto.enabled ? "border-border" : "border-border opacity-60")}>
                <div className="flex items-start gap-3">
                  {/* Trigger icon */}
                  <div className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    auto.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {TRIGGER_ICONS[trigger.event] ?? <Zap className="h-4 w-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold truncate">{auto.name}</p>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        auto.enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      )}>
                        {auto.enabled ? "Activă" : "Inactivă"}
                      </span>
                    </div>

                    {/* Trigger + conditions + actions summary */}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-semibold">{TRIGGER_LABELS[trigger.event] ?? trigger.event}</span>
                      {(auto.conditions as AutomationCondition[]).length > 0 && (
                        <> · {(auto.conditions as AutomationCondition[]).length} condiție(i)</>
                      )}
                      {" → "}
                      {(auto.actions as { type: string }[]).map((a) => ACTION_LABELS[a.type] ?? a.type).join(", ")}
                    </p>

                    {/* Test result */}
                    {thisTestResult && (
                      <div className={cn(
                        "mt-2 rounded-lg border p-2.5 text-xs",
                        thisTestResult.status === "ok" ? "border-success/30 bg-success/10 text-success" :
                        thisTestResult.status === "skipped" ? "border-border bg-muted/30 text-muted-foreground" :
                        "border-destructive/30 bg-destructive/10 text-destructive"
                      )}>
                        <p className="font-semibold mb-1">[DRY-RUN] Status: {thisTestResult.status}</p>
                        {thisTestResult.actionResults.map((r, i) => (
                          <p key={i} className="font-mono">{r.type}: {r.detail}</p>
                        ))}
                        {thisTestResult.status === "skipped" && (
                          <p>Condițiile nu au fost satisfăcute pe lead-ul fictiv.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleTest(auto.id)}
                      disabled={isTestingThis}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                      aria-label={`Testează automatizarea ${auto.name}`}
                      title="Test mode (dry-run)"
                    >
                      {isTestingThis ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span className="hidden sm:inline">Test</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleViewRuns(auto.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold hover:bg-muted"
                      aria-label={`Audit log ${auto.name}`}
                      title="Audit log execuții"
                    >
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Log</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggle(auto)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold hover:bg-muted"
                      aria-label={auto.enabled ? `Dezactivează ${auto.name}` : `Activează ${auto.name}`}
                    >
                      {auto.enabled ? (
                        <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingAuto(auto); setShowEditor(true); window.scrollTo({ top: 0 }); }}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold hover:bg-muted"
                      aria-label={`Editează ${auto.name}`}
                    >
                      <span className="text-[11px]">Editează</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(auto.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 px-2 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                      aria-label={`Șterge ${auto.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Runs panel */}
      {viewRunsId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Audit log execuții">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setViewRunsId(null)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl max-h-[80vh] flex flex-col">
            <div className="border-b border-border px-5 py-3.5 flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-base font-bold">Audit log execuții</h2>
              <button type="button" onClick={() => setViewRunsId(null)} aria-label="Închide" className="rounded-md hover:bg-muted p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingRuns ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Se încarcă…
                </div>
              ) : runs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nicio execuție înregistrată.</p>
              ) : (
                <ul className="space-y-2" aria-label="Execuții automatizare">
                  {runs.map((run) => (
                    <li key={run.id} className={cn(
                      "rounded-lg border p-3 text-xs",
                      run.status === "ok" ? "border-success/30 bg-success/5" :
                      run.status === "skipped" ? "border-border bg-muted/20" :
                      "border-destructive/30 bg-destructive/5"
                    )}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          "font-bold",
                          run.status === "ok" ? "text-success" :
                          run.status === "skipped" ? "text-muted-foreground" :
                          "text-destructive"
                        )}>
                          {run.status.toUpperCase()}{run.dryRun ? " [DRY-RUN]" : ""}
                        </span>
                        <time className="text-muted-foreground" dateTime={run.ranAt}>
                          {new Date(run.ranAt).toLocaleString("ro-RO")}
                        </time>
                      </div>
                      {run.detail && (
                        <p className="text-muted-foreground whitespace-pre-wrap font-mono text-[10px]">{run.detail}</p>
                      )}
                      {run.leadId && (
                        <p className="text-muted-foreground mt-0.5">Lead: <span className="font-mono">{run.leadId.slice(0, 8)}…</span></p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
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
