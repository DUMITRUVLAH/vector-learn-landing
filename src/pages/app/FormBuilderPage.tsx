/**
 * FORMS-002 — /app/forms/:id/edit
 *
 * Builder vizual cu:
 *   - Stânga: lista câmpurilor reordonabile (↑/↓)
 *   - Centru: preview live
 *   - Dreapta: panou configurare câmp selectat / setări formular
 */
import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Copy,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Settings,
  GitBranch,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getForm,
  updateForm,
  addField,
  updateField,
  deleteField,
  reorderFields,
  publishForm,
  listLogicRules,
  addLogicRule,
  deleteLogicRule,
  type Form,
  type FormField,
  type FormFieldType,
  type LeadMapping,
  type FormLogicRule,
  type FormLogicCondition,
  type LogicAction,
} from "@/lib/api/forms";
import { cn } from "@/lib/utils";

// ─── Constante ────────────────────────────────────────────────────────────────

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "short_text", label: "Text scurt" },
  { value: "long_text", label: "Text lung" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefon" },
  { value: "number", label: "Număr" },
  { value: "single_choice", label: "Alegere unică" },
  { value: "multiple_choice", label: "Alegere multiplă" },
  { value: "dropdown", label: "Listă derulantă" },
  { value: "rating", label: "Evaluare (stele)" },
  { value: "yes_no", label: "Da / Nu" },
  { value: "date", label: "Dată" },
  { value: "consent", label: "Consimțământ GDPR" },
  { value: "hidden", label: "Câmp ascuns" },
];

const LEAD_MAPPINGS: { value: LeadMapping; label: string }[] = [
  { value: "none", label: "Fără mapare" },
  { value: "fullName", label: "Nume complet" },
  { value: "phone", label: "Telefon" },
  { value: "email", label: "Email" },
  { value: "interestCourse", label: "Curs dorit" },
  { value: "tag", label: "Tag (etichetă)" },
];

const HAS_OPTIONS: FormFieldType[] = ["single_choice", "multiple_choice", "dropdown"];

// ─── Preview câmp ─────────────────────────────────────────────────────────────

function FieldPreview({ field }: { field: FormField }) {
  if (field.hidden) {
    return (
      <div className="border border-dashed border-border rounded-lg p-3 text-xs text-muted-foreground italic">
        [Câmp ascuns: {field.label}]
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </label>
      {(field.type === "short_text" || field.type === "email" || field.type === "phone" || field.type === "number") && (
        <input
          type={field.type === "short_text" ? "text" : field.type}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm opacity-60 cursor-default"
          placeholder={field.placeholder ?? ""}
          readOnly
          tabIndex={-1}
        />
      )}
      {field.type === "long_text" && (
        <textarea
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm opacity-60 cursor-default resize-none"
          placeholder={field.placeholder ?? ""}
          rows={3}
          readOnly
          tabIndex={-1}
        />
      )}
      {(field.type === "single_choice" || field.type === "multiple_choice") && (
        <div className="space-y-1">
          {(field.options ?? ["Opțiunea 1", "Opțiunea 2"]).map((opt, i) => (
            <label key={i} className="flex items-center gap-2 text-sm opacity-60 cursor-default">
              <input
                type={field.type === "single_choice" ? "radio" : "checkbox"}
                readOnly
                tabIndex={-1}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
      {field.type === "dropdown" && (
        <select
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm opacity-60 cursor-default"
          disabled
          tabIndex={-1}
        >
          <option value="">{field.placeholder ?? "Selectează..."}</option>
          {(field.options ?? []).map((opt, i) => <option key={i}>{opt}</option>)}
        </select>
      )}
      {field.type === "rating" && (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className="text-2xl text-muted-foreground opacity-60">★</span>
          ))}
        </div>
      )}
      {field.type === "yes_no" && (
        <div className="flex gap-2">
          <button type="button" className="px-4 py-2 rounded-lg border border-border text-sm opacity-60" tabIndex={-1}>Da</button>
          <button type="button" className="px-4 py-2 rounded-lg border border-border text-sm opacity-60" tabIndex={-1}>Nu</button>
        </div>
      )}
      {field.type === "date" && (
        <input
          type="date"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm opacity-60 cursor-default"
          readOnly
          tabIndex={-1}
        />
      )}
      {field.type === "consent" && (
        <label className="flex items-start gap-2 text-sm opacity-60 cursor-default">
          <input type="checkbox" className="mt-0.5" readOnly tabIndex={-1} />
          <span>{field.label}</span>
        </label>
      )}
    </div>
  );
}

// ─── Panou configurare câmp ───────────────────────────────────────────────────

interface FieldConfigPanelProps {
  field: FormField;
  onSave: (patch: Partial<FormField>) => Promise<void>;
  onDelete: () => void;
  saving: boolean;
}

function FieldConfigPanel({ field, onSave, onDelete, saving }: FieldConfigPanelProps) {
  const [label, setLabel] = useState(field.label);
  const [type, setType] = useState<FormFieldType>(field.type);
  const [placeholder, setPlaceholder] = useState(field.placeholder ?? "");
  const [required, setRequired] = useState(field.required);
  const [optionsText, setOptionsText] = useState((field.options ?? []).join("\n"));
  const [leadMapping, setLeadMapping] = useState<LeadMapping>(field.leadMapping ?? "none");
  const [hidden, setHidden] = useState(field.hidden);
  const [hiddenSourceParam, setHiddenSourceParam] = useState(field.hiddenSourceParam ?? "");

  // Sync when a different field is selected
  useEffect(() => {
    setLabel(field.label);
    setType(field.type);
    setPlaceholder(field.placeholder ?? "");
    setRequired(field.required);
    setOptionsText((field.options ?? []).join("\n"));
    setLeadMapping(field.leadMapping ?? "none");
    setHidden(field.hidden);
    setHiddenSourceParam(field.hiddenSourceParam ?? "");
  }, [field.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const showOptions = HAS_OPTIONS.includes(type);

  async function handleSave() {
    const options = showOptions
      ? optionsText
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
    await onSave({
      label,
      type,
      placeholder: placeholder || null,
      required,
      options,
      leadMapping,
      hidden,
      hiddenSourceParam: hidden ? (hiddenSourceParam || null) : null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Configurare câmp</h3>
        <button
          onClick={onDelete}
          aria-label="Șterge câmpul"
          className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Label */}
      <div>
        <label className="block text-xs font-medium mb-1" htmlFor="cfg-label">Label</label>
        <input
          id="cfg-label"
          type="text"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={500}
        />
      </div>

      {/* Tip */}
      <div>
        <label className="block text-xs font-medium mb-1" htmlFor="cfg-type">Tip câmp</label>
        <select
          id="cfg-type"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={type}
          onChange={(e) => setType(e.target.value as FormFieldType)}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Required */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="rounded"
        />
        <span>Câmp obligatoriu</span>
      </label>

      {/* Placeholder */}
      {!hidden && (
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="cfg-placeholder">Placeholder (opțional)</label>
          <input
            id="cfg-placeholder"
            type="text"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={placeholder}
            onChange={(e) => setPlaceholder(e.target.value)}
            maxLength={500}
          />
        </div>
      )}

      {/* Options */}
      {showOptions && (
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="cfg-options">
            Opțiuni (câte una pe linie sau separate prin virgulă)
          </label>
          <textarea
            id="cfg-options"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            rows={4}
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder={"Opțiunea 1\nOpțiunea 2\nOpțiunea 3"}
          />
        </div>
      )}

      {/* Lead mapping */}
      <div>
        <label className="block text-xs font-medium mb-1" htmlFor="cfg-lead-mapping">Mapare câmp → lead</label>
        <select
          id="cfg-lead-mapping"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={leadMapping}
          onChange={(e) => setLeadMapping(e.target.value as LeadMapping)}
        >
          {LEAD_MAPPINGS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Hidden */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={hidden}
          onChange={(e) => setHidden(e.target.checked)}
          className="rounded"
        />
        <span>Câmp ascuns (populat din URL)</span>
      </label>

      {/* Hidden source param */}
      {hidden && (
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="cfg-src-param">
            Parametru URL (ex: utm_source)
          </label>
          <input
            id="cfg-src-param"
            type="text"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={hiddenSourceParam}
            onChange={(e) => setHiddenSourceParam(e.target.value)}
            maxLength={100}
            placeholder="utm_source"
          />
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !label.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvează câmp"}
      </button>
    </div>
  );
}

// ─── Panou setări formular ────────────────────────────────────────────────────

interface FormSettingsPanelProps {
  form: Form;
  onSave: (patch: { thankYouMessage?: string | null; redirectUrl?: string | null }) => Promise<void>;
  saving: boolean;
}

function FormSettingsPanel({ form, onSave, saving }: FormSettingsPanelProps) {
  const [thankYouMessage, setThankYouMessage] = useState(form.thankYouMessage ?? "");
  const [redirectUrl, setRedirectUrl] = useState(form.redirectUrl ?? "");

  useEffect(() => {
    setThankYouMessage(form.thankYouMessage ?? "");
    setRedirectUrl(form.redirectUrl ?? "");
  }, [form.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">Setări submisie</h3>

      <div>
        <label className="block text-xs font-medium mb-1" htmlFor="settings-ty-msg">
          Mesaj de mulțumire
        </label>
        <textarea
          id="settings-ty-msg"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          rows={3}
          value={thankYouMessage}
          onChange={(e) => setThankYouMessage(e.target.value)}
          maxLength={500}
          placeholder="Mulțumim! Am primit răspunsul tău."
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" htmlFor="settings-redirect">
          Redirect după submit (URL, opțional)
        </label>
        <input
          id="settings-redirect"
          type="url"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={redirectUrl}
          onChange={(e) => setRedirectUrl(e.target.value)}
          maxLength={1000}
          placeholder="https://example.com/merci"
        />
      </div>

      <button
        onClick={() => onSave({
          thankYouMessage: thankYouMessage.trim() || null,
          redirectUrl: redirectUrl.trim() || null,
        })}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvează setări"}
      </button>
    </div>
  );
}

// ─── LogicModal ───────────────────────────────────────────────────────────────

const LOGIC_OPERATORS: { value: string; label: string }[] = [
  { value: "eq", label: "Egal cu" },
  { value: "neq", label: "Diferit de" },
  { value: "contains", label: "Conține" },
  { value: "gt", label: "Mai mare decât" },
  { value: "lt", label: "Mai mic decât" },
  { value: "is_empty", label: "Este gol" },
  { value: "is_not_empty", label: "Nu este gol" },
];

const NO_VALUE_OPERATORS = ["is_empty", "is_not_empty"];

interface LogicModalProps {
  field: FormField;
  allFields: FormField[];
  rules: FormLogicRule[];
  onClose: () => void;
  onAddRule: (fromFieldId: string, condition: FormLogicCondition, action: LogicAction, targetFieldId: string | null) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
}

function LogicModal({ field, allFields, rules, onClose, onAddRule, onDeleteRule }: LogicModalProps) {
  const [operator, setOperator] = useState<string>("eq");
  const [condValue, setCondValue] = useState("");
  const [action, setAction] = useState<LogicAction>("jump_to_field");
  const [targetFieldId, setTargetFieldId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const fieldRules = rules.filter((r) => r.fromFieldId === field.id);
  const otherFields = allFields.filter((f) => f.id !== field.id);
  const showValueInput = !NO_VALUE_OPERATORS.includes(operator);

  async function handleAdd() {
    if (action === "jump_to_field" && !targetFieldId) return;
    setSaving(true);
    try {
      const condition: FormLogicCondition = {
        operator: operator as FormLogicCondition["operator"],
        ...(showValueInput && condValue ? { value: condValue } : {}),
      };
      await onAddRule(field.id, condition, action, action === "jump_to_field" ? targetFieldId : null);
      setOperator("eq");
      setCondValue("");
      setTargetFieldId("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-md p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            Logică condițională: <span className="text-primary">{field.label}</span>
          </h3>
          <button onClick={onClose} aria-label="Închide" className="p-1 rounded hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Existing rules */}
        {fieldRules.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reguli existente</p>
            {fieldRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-muted/50 text-xs">
                <span>
                  Dacă <strong>{rule.condition.operator}</strong>
                  {rule.condition.value !== undefined ? ` "${rule.condition.value}"` : ""} →{" "}
                  {rule.action === "jump_to_end"
                    ? "termină formularul"
                    : `sari la: ${allFields.find((f) => f.id === rule.targetFieldId)?.label ?? "câmp necunoscut"}`}
                </span>
                <button
                  onClick={() => onDeleteRule(rule.id)}
                  aria-label="Șterge regula"
                  className="shrink-0 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add rule form */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Adaugă regulă</p>

          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="logic-operator">Condiție</label>
            <select
              id="logic-operator"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            >
              {LOGIC_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>

          {showValueInput && (
            <div>
              <label className="block text-xs font-medium mb-1" htmlFor="logic-value">Valoare</label>
              <input
                id="logic-value"
                type="text"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={condValue}
                onChange={(e) => setCondValue(e.target.value)}
                placeholder="ex: Da, 5, test@email.com"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="logic-action">Acțiune</label>
            <select
              id="logic-action"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={action}
              onChange={(e) => setAction(e.target.value as LogicAction)}
            >
              <option value="jump_to_field">Sari la câmpul...</option>
              <option value="jump_to_end">Termină formularul</option>
            </select>
          </div>

          {action === "jump_to_field" && (
            <div>
              <label className="block text-xs font-medium mb-1" htmlFor="logic-target">Câmp destinație</label>
              <select
                id="logic-target"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={targetFieldId}
                onChange={(e) => setTargetFieldId(e.target.value)}
              >
                <option value="">Selectează câmpul...</option>
                {otherFields.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleAdd}
            disabled={saving || (action === "jump_to_field" && !targetFieldId)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adaugă regulă
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componenta principală ────────────────────────────────────────────────────

interface FormBuilderPageProps {
  formId: string;
}

export function FormBuilderPage({ formId }: FormBuilderPageProps) {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [form, setForm] = useState<Form | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [savingField, setSavingField] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState<"fields" | "preview" | "config">("fields");
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  // FORMS-004: logic rules state
  const [logicRules, setLogicRules] = useState<FormLogicRule[]>([]);
  const [logicModalFieldId, setLogicModalFieldId] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const loadForm = useCallback(async () => {
    setLoading(true);
    try {
      const [{ form: f, fields: flds }, { rules }] = await Promise.all([
        getForm(formId),
        listLogicRules(formId).catch(() => ({ rules: [] as FormLogicRule[] })),
      ]);
      setForm(f);
      setFields(flds.sort((a, b) => a.position - b.position));
      setLogicRules(rules);
    } catch {
      setToast({ kind: "error", message: "Nu s-a putut încărca formularul." });
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    if (sessionStatus === "authenticated") loadForm();
  }, [sessionStatus, loadForm]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;

  // ── Adaugă câmp ──

  async function handleAddField(type: FormFieldType) {
    if (!form) return;
    setShowAddMenu(false);
    try {
      const { field } = await addField(form.id, {
        type,
        label: FIELD_TYPES.find((t) => t.value === type)?.label ?? "Câmp nou",
        position: fields.length,
        required: false,
      });
      setFields((prev) => [...prev, field].sort((a, b) => a.position - b.position));
      setSelectedFieldId(field.id);
      setActiveTab("config");
    } catch {
      setToast({ kind: "error", message: "Nu s-a putut adăuga câmpul." });
    }
  }

  // ── Reordonare ──

  async function handleMoveField(fieldId: string, direction: "up" | "down") {
    const idx = fields.findIndex((f) => f.id === fieldId);
    if (idx < 0) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === fields.length - 1) return;

    const newFields = [...fields];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [newFields[idx], newFields[swapIdx]] = [newFields[swapIdx], newFields[idx]];
    const reordered = newFields.map((f, i) => ({ ...f, position: i }));
    setFields(reordered);

    try {
      await reorderFields(formId, reordered.map((f) => f.id));
    } catch {
      // Revert on error
      setFields(fields);
      setToast({ kind: "error", message: "Nu s-a putut reordona câmpul." });
    }
  }

  // ── Salvează câmp ──

  async function handleSaveField(patch: Partial<FormField>) {
    if (!selectedField || !form) return;
    setSavingField(true);
    try {
      const { field: updated } = await updateField(form.id, selectedField.id, patch);
      setFields((prev) => prev.map((f) => f.id === updated.id ? updated : f));
      setToast({ kind: "success", message: "Câmpul a fost salvat." });
    } catch {
      setToast({ kind: "error", message: "Nu s-a putut salva câmpul." });
    } finally {
      setSavingField(false);
    }
  }

  // ── Șterge câmp ──

  async function handleDeleteField() {
    if (!selectedField || !form) return;
    try {
      await deleteField(form.id, selectedField.id);
      setFields((prev) => prev.filter((f) => f.id !== selectedField.id));
      setSelectedFieldId(null);
      setToast({ kind: "success", message: "Câmpul a fost șters." });
    } catch {
      setToast({ kind: "error", message: "Nu s-a putut șterge câmpul." });
    }
  }

  // ── Publish ──

  async function handlePublish() {
    if (!form || fields.length === 0) return;
    setPublishing(true);
    try {
      const { form: updated } = await publishForm(form.id);
      setForm(updated);
      setToast({ kind: "success", message: "Formularul a fost publicat!" });
    } catch {
      setToast({ kind: "error", message: "Nu s-a putut publica formularul." });
    } finally {
      setPublishing(false);
    }
  }

  // ── Share link ──

  function handleShareLink() {
    if (!form) return;
    const url = `${window.location.origin}/#/f/${form.slug}`;
    navigator.clipboard.writeText(url).then(
      () => setToast({ kind: "success", message: "Link copiat în clipboard!" }),
      () => setToast({ kind: "error", message: "Nu s-a putut copia link-ul." })
    );
  }

  // ── Salvează setări formular ──

  async function handleSaveFormSettings(patch: { thankYouMessage?: string | null; redirectUrl?: string | null }) {
    if (!form) return;
    setSavingForm(true);
    try {
      const { form: updated } = await updateForm(form.id, patch);
      setForm(updated);
      setToast({ kind: "success", message: "Setările au fost salvate." });
    } catch {
      setToast({ kind: "error", message: "Nu s-a putut salva setările." });
    } finally {
      setSavingForm(false);
    }
  }

  // ── Editare titlu inline ──

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  function startEditTitle() {
    if (!form) return;
    setTitleDraft(form.title);
    setEditingTitle(true);
  }

  async function commitTitle() {
    if (!form || !titleDraft.trim()) {
      setEditingTitle(false);
      return;
    }
    setEditingTitle(false);
    try {
      const { form: updated } = await updateForm(form.id, { title: titleDraft.trim() });
      setForm(updated);
    } catch {
      setToast({ kind: "error", message: "Nu s-a putut salva titlul." });
    }
  }

  // ── FORMS-004: Logic handlers ──

  async function handleAddLogicRule(
    fromFieldId: string,
    condition: FormLogicCondition,
    action: LogicAction,
    targetFieldId: string | null
  ) {
    if (!form) return;
    try {
      const { rule } = await addLogicRule(form.id, { fromFieldId, condition, action, targetFieldId });
      setLogicRules((prev) => [...prev, rule]);
      setToast({ kind: "success", message: "Regulă adăugată." });
    } catch {
      setToast({ kind: "error", message: "Nu s-a putut adăuga regula." });
    }
  }

  async function handleDeleteLogicRule(ruleId: string) {
    if (!form) return;
    try {
      await deleteLogicRule(form.id, ruleId);
      setLogicRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      setToast({ kind: "error", message: "Nu s-a putut șterge regula." });
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (!form && !loading) {
    return (
      <AppShell pageTitle="Builder formular">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Formularul nu a fost găsit.</p>
          <button onClick={() => navigate("/app/forms")} className="mt-4 text-sm text-primary hover:underline">
            ← Înapoi la formulare
          </button>
        </div>
      </AppShell>
    );
  }

  const statusLabel: Record<string, string> = {
    draft: "Draft",
    published: "Publicat",
    closed: "Închis",
  };
  const statusCls: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    closed: "bg-destructive/10 text-destructive",
  };

  const panelContent = showSettings ? (
    form ? (
      <FormSettingsPanel form={form} onSave={handleSaveFormSettings} saving={savingForm} />
    ) : null
  ) : selectedField ? (
    <FieldConfigPanel
      key={selectedField.id}
      field={selectedField}
      onSave={handleSaveField}
      onDelete={handleDeleteField}
      saving={savingField}
    />
  ) : (
    <div className="text-center py-8 text-sm text-muted-foreground">
      <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p>Selectează un câmp pentru a-l configura.</p>
      <button
        onClick={() => setShowSettings(true)}
        className="mt-3 text-xs text-primary hover:underline"
      >
        Sau editează setările formularului
      </button>
    </div>
  );

  return (
    <AppShell
      pageTitle={form?.title ?? "Builder formular"}
      actions={
        form ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
              statusCls[form.status] ?? "bg-muted text-muted-foreground"
            )}>
              {statusLabel[form.status] ?? form.status}
            </span>
            <button
              onClick={handleShareLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors min-h-[36px]"
            >
              <Copy className="w-3.5 h-3.5" />
              Link share
            </button>
            <a
              href={`/#/f/${form.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors min-h-[36px]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Previzualizare
            </a>
            <button
              onClick={handlePublish}
              disabled={publishing || fields.length === 0 || form.status === "published"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[36px]"
              title={fields.length === 0 ? "Adaugă cel puțin un câmp înainte de a publica" : undefined}
            >
              {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Publică"}
            </button>
          </div>
        ) : undefined
      }
    >
      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium",
          toast.kind === "success"
            ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
            : "bg-destructive/10 text-destructive border border-destructive/20"
        )}>
          {toast.kind === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.message}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col h-full">
          {/* Back + title */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
            <button
              onClick={() => navigate("/app/forms")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Formulare</span>
            </button>
            <span className="text-muted-foreground">/</span>
            {editingTitle ? (
              <input
                autoFocus
                type="text"
                className="text-sm font-semibold bg-transparent border-b border-primary focus:outline-none px-1 min-w-0 flex-1 max-w-xs"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                maxLength={200}
              />
            ) : (
              <button
                onClick={startEditTitle}
                className="text-sm font-semibold hover:text-primary transition-colors text-left truncate max-w-xs"
                title="Click pentru a edita titlul"
              >
                {form?.title}
              </button>
            )}
            {form && (
              <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
                /f/{form.slug}
              </span>
            )}
          </div>

          {/* Mobile tabs */}
          <div className="flex sm:hidden border-b border-border">
            {(["fields", "preview", "config"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 py-2.5 text-xs font-medium transition-colors",
                  activeTab === tab
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "fields" ? "Câmpuri" : tab === "preview" ? "Preview" : "Config"}
              </button>
            ))}
          </div>

          {/* Main layout: 3-col desktop, tabs mobile */}
          <div className="flex flex-1 overflow-hidden">
            {/* ── Stânga: lista câmpuri ── */}
            <div className={cn(
              "w-full sm:w-64 sm:flex-none border-r border-border flex flex-col",
              activeTab !== "fields" && "hidden sm:flex"
            )}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Câmpuri ({fields.length})
                </span>
                <div className="relative">
                  <button
                    onClick={() => setShowAddMenu((s) => !s)}
                    aria-label="Adaugă câmp"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors min-h-[32px]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adaugă
                  </button>
                  {showAddMenu && (
                    <div className="absolute right-0 top-full mt-1 z-40 bg-popover border border-border rounded-xl shadow-xl w-52 py-1 overflow-y-auto max-h-72">
                      {FIELD_TYPES.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => handleAddField(t.value)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {fields.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-sm text-muted-foreground">
                  <p>Niciun câmp adăugat.</p>
                  <p className="text-xs mt-1">Apasă "Adaugă" pentru a începe.</p>
                </div>
              ) : (
                <ul className="flex-1 overflow-y-auto divide-y divide-border">
                  {fields.map((field, idx) => (
                    <li key={field.id}>
                      {/* Note: using div+role instead of button to avoid invalid button-in-button nesting */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedFieldId(field.id);
                          setShowSettings(false);
                          setActiveTab("config");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setSelectedFieldId(field.id);
                            setShowSettings(false);
                            setActiveTab("config");
                          }
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer",
                          selectedFieldId === field.id && "bg-primary/5 border-l-2 border-primary"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{field.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {FIELD_TYPES.find((t) => t.value === field.type)?.label ?? field.type}
                            {field.required && " · obligatoriu"}
                            {field.hidden && " · ascuns"}
                          </p>
                        </div>
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMoveField(field.id, "up"); }}
                            disabled={idx === 0}
                            aria-label="Mută câmpul sus"
                            className="p-0.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMoveField(field.id, "down"); }}
                            disabled={idx === fields.length - 1}
                            aria-label="Mută câmpul jos"
                            className="p-0.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          {/* FORMS-004: Logic button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setLogicModalFieldId(field.id); }}
                            aria-label="Configurează logică condițională"
                            className={cn(
                              "p-0.5 rounded transition-colors",
                              logicRules.some((r) => r.fromFieldId === field.id)
                                ? "text-primary hover:bg-primary/10"
                                : "hover:bg-muted text-muted-foreground"
                            )}
                          >
                            <GitBranch className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="p-3 border-t border-border">
                <button
                  onClick={() => { setShowSettings(true); setSelectedFieldId(null); setActiveTab("config"); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs hover:bg-muted transition-colors min-h-[36px]"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Setări formular
                </button>
              </div>
            </div>

            {/* ── Centru: preview ── */}
            <div className={cn(
              "flex-1 overflow-y-auto p-6 bg-muted/20",
              activeTab !== "preview" && "hidden sm:block"
            )}>
              <div className="max-w-lg mx-auto">
                <div className="bg-card border border-border rounded-xl p-6 space-y-6">
                  {form && (
                    <div>
                      <h2 className="text-xl font-bold">{form.title}</h2>
                      {form.description && (
                        <p className="text-sm text-muted-foreground mt-1">{form.description}</p>
                      )}
                    </div>
                  )}
                  {fields.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <p>Adaugă câmpuri pentru a vedea preview-ul.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {fields.map((field) => (
                        <div
                          key={field.id}
                          onClick={() => {
                            setSelectedFieldId(field.id);
                            setShowSettings(false);
                            setActiveTab("config");
                          }}
                          className={cn(
                            "cursor-pointer p-3 rounded-lg border transition-colors",
                            selectedFieldId === field.id
                              ? "border-primary bg-primary/5"
                              : "border-transparent hover:border-border"
                          )}
                        >
                          <FieldPreview field={field} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Dreapta: panou config ── */}
            <div className={cn(
              "w-full sm:w-72 sm:flex-none border-l border-border overflow-y-auto p-4",
              activeTab !== "config" && "hidden sm:block"
            )}>
              {panelContent}
            </div>
          </div>
        </div>
      )}

      {/* FORMS-004: Logic modal */}
      {logicModalFieldId && (() => {
        const logicField = fields.find((f) => f.id === logicModalFieldId);
        if (!logicField) return null;
        return (
          <LogicModal
            field={logicField}
            allFields={fields}
            rules={logicRules}
            onClose={() => setLogicModalFieldId(null)}
            onAddRule={handleAddLogicRule}
            onDeleteRule={handleDeleteLogicRule}
          />
        );
      })()}
    </AppShell>
  );
}
