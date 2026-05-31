/**
 * CRM-126 — Cadences list page (/app/cadences)
 * Shows all cadences for the tenant + inline create form.
 */
import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, ChevronDown, ChevronUp, ListChecks, ToggleLeft, ToggleRight } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listCadences,
  createCadence,
  updateCadence,
  deleteCadence,
  type Cadence,
  type CadenceStep,
} from "@/lib/api/cadences";
import { listTemplates } from "@/lib/api/templates";
import type { MessageTemplate } from "@/lib/api/templates";
import { cn } from "@/lib/utils";

const STAGE_OPTIONS = [
  { value: "new", label: "Lead nou" },
  { value: "contacted", label: "Contactat" },
  { value: "trial", label: "Trial/Demo" },
];

// ─── Step builder row ─────────────────────────────────────────────────────────

interface StepRowProps {
  step: CadenceStep;
  index: number;
  templates: MessageTemplate[];
  onChange: (step: CadenceStep) => void;
  onRemove: () => void;
}

function StepRow({ step, index, templates, onChange, onRemove }: StepRowProps) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-md border border-border bg-muted/30">
      <span className="text-xs font-bold text-muted-foreground mt-2.5 w-4 shrink-0">
        {index + 1}
      </span>

      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* delay_days */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`step-delay-${index}`}>
            Zi
          </label>
          <input
            id={`step-delay-${index}`}
            type="number"
            min={0}
            max={365}
            value={step.delay_days}
            onChange={(e) => onChange({ ...step, delay_days: Number(e.target.value) })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* action type */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={`step-action-${index}`}>
            Acțiune
          </label>
          <select
            id={`step-action-${index}`}
            value={step.action}
            onChange={(e) =>
              onChange({ ...step, action: e.target.value as CadenceStep["action"], template_id: undefined, task_title: undefined })
            }
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="send_template">Trimite template</option>
            <option value="create_task">Creează task</option>
          </select>
        </div>

        {/* action detail */}
        <div className="space-y-1">
          {step.action === "send_template" ? (
            <>
              <label className="text-xs text-muted-foreground" htmlFor={`step-template-${index}`}>
                Template
              </label>
              <select
                id={`step-template-${index}`}
                value={step.template_id ?? ""}
                onChange={(e) => onChange({ ...step, template_id: e.target.value || undefined })}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— alege template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.channel})
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="text-xs text-muted-foreground" htmlFor={`step-task-${index}`}>
                Titlu task
              </label>
              <input
                id={`step-task-${index}`}
                type="text"
                placeholder="ex: Sună leadul"
                value={step.task_title ?? ""}
                onChange={(e) => onChange({ ...step, task_title: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Șterge pasul ${index + 1}`}
        className="mt-2 text-muted-foreground hover:text-destructive transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CadencesPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [cadences, setCadences] = useState<Cadence[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formStage, setFormStage] = useState("new");
  const [formSteps, setFormSteps] = useState<CadenceStep[]>([
    { delay_days: 1, action: "create_task", task_title: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Expanded rows
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      const [cads, tmplsResult] = await Promise.all([listCadences(), listTemplates()]);
      setCadences(cads);
      setTemplates(tmplsResult.items);
    } catch {
      setError("Nu s-au putut încărca cadențele.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
      return;
    }
    if (sessionStatus === "authenticated") {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) { setFormError("Numele este obligatoriu."); return; }
    if (formSteps.length === 0) { setFormError("Adaugă cel puțin un pas."); return; }

    setSubmitting(true);
    setFormError(null);
    try {
      await createCadence({ name: formName.trim(), triggerStage: formStage, steps: formSteps });
      setFormName("");
      setFormStage("new");
      setFormSteps([{ delay_days: 1, action: "create_task", task_title: "" }]);
      setShowForm(false);
      await load();
    } catch {
      setFormError("Eroare la salvare. Încearcă din nou.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEnabled = async (cad: Cadence) => {
    try {
      await updateCadence(cad.id, { enabled: !cad.enabled });
      await load();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Dezactivezi cadența?")) return;
    try {
      await deleteCadence(id);
      await load();
    } catch {
      // ignore
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <AppShell
      pageTitle="Follow-up Cadences"
      pageDescription="Serii automate de follow-up pentru leaduri"
      actions={
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Cadență nouă
        </button>
      }
    >
      {/* Create form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-lg border border-border bg-card p-5 mb-6 space-y-4"
          aria-label="Formular cadenţă nouă"
        >
          <h2 className="text-base font-semibold">Cadenţă nouă</h2>

          {formError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="cad-name">
                Nume cadenţă *
              </label>
              <input
                id="cad-name"
                type="text"
                required
                placeholder="ex: Follow-up lead nou"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="cad-stage">
                Stadiu de pornire *
              </label>
              <select
                id="cad-stage"
                value={formStage}
                onChange={(e) => setFormStage(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {STAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Steps builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Pași ({formSteps.length})</span>
              <button
                type="button"
                onClick={() =>
                  setFormSteps((prev) => [...prev, { delay_days: 3, action: "create_task", task_title: "" }])
                }
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Plus className="h-3 w-3" />
                Adaugă pas
              </button>
            </div>

            {formSteps.map((step, i) => (
              <StepRow
                key={i}
                step={step}
                index={i}
                templates={templates}
                onChange={(s) => setFormSteps((prev) => prev.map((p, j) => (j === i ? s : p)))}
                onRemove={() => setFormSteps((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvează
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Anulează
            </button>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4" role="alert">
          {error}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && cadences.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center" role="status" aria-live="polite">
          <ListChecks className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
          <h3 className="text-lg font-semibold mb-1">Nicio cadenţă</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Crează prima serie de follow-up automatizat.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Crează prima cadenţă
          </button>
        </div>
      )}

      {/* Cadences table */}
      {!loading && cadences.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-semibold">Nume</th>
                <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Stadiu pornire</th>
                <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Pași</th>
                <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Enrollments active</th>
                <th className="text-right px-4 py-3 font-semibold">Activ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cadences.map((cad) => {
                const expanded = expandedIds.has(cad.id);
                const stageLabel = STAGE_OPTIONS.find((o) => o.value === cad.triggerStage)?.label ?? cad.triggerStage;
                return (
                  <>
                    <tr key={cad.id} className={cn("hover:bg-muted/30 transition-colors", !cad.enabled && "opacity-50")}>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleExpand(cad.id)}
                          className="flex items-center gap-2 text-left font-medium hover:text-primary transition-colors"
                          aria-expanded={expanded}
                          aria-controls={`cad-steps-${cad.id}`}
                        >
                          {expanded ? (
                            <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                          )}
                          {cad.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {stageLabel}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {cad.steps.length}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {cad.activeEnrollments ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleToggleEnabled(cad)}
                          aria-label={cad.enabled ? "Dezactivează cadența" : "Activează cadența"}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          {cad.enabled ? (
                            <ToggleRight className="h-5 w-5 text-primary" />
                          ) : (
                            <ToggleLeft className="h-5 w-5" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleDelete(cad.id)}
                          aria-label={`Şterge cadența ${cad.name}`}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>

                    {/* Expanded steps */}
                    {expanded && (
                      <tr key={`${cad.id}-steps`} id={`cad-steps-${cad.id}`}>
                        <td colSpan={6} className="px-4 py-3 bg-muted/20">
                          <div className="space-y-2">
                            {cad.steps.map((step, i) => (
                              <div key={i} className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="font-bold w-5">{i + 1}.</span>
                                <span>Zi {step.delay_days}:</span>
                                <span className="font-medium text-foreground">
                                  {step.action === "send_template"
                                    ? `Trimite template`
                                    : `Task: ${step.task_title ?? "—"}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
