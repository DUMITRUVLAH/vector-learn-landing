/**
 * CRM Faza 9 — Cadențe și reactivare.
 *
 * Portare din crm-vector (`LeadsCadences.tsx` + `LeadsReengagement.tsx`), pe un singur ecran:
 * amândouă răspund la aceeași întrebare — „ce se întâmplă singur cu leadurile mele, în timp".
 *
 * O cadență e o listă de pași cu zile: „ziua 0 — sună", „ziua 3 — trimite oferta". Reactivarea
 * e o regulă pe TIMP: „un client pierdut de 6 luni primește un task".
 *
 * Reactivarea are întâi PREVIEW și abia apoi „Rulează acum": atinge clienți pierduți, iar un
 * buton care aplică direct, fără să arate pe cine, e un mod bun de a trimite 300 de taskuri din
 * greșeală.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, Play, Plus, Trash2, Zap, RefreshCw, Clock } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Badge, Button, EmptyState, Input, Label, Select, Switch } from "@/components/ds";
import { cn } from "@/lib/utils";
import {
  listCrmCadences,
  createCrmCadence,
  updateCrmCadence,
  deleteCrmCadence,
  runCrmCadencesNow,
  listCrmReengagementRules,
  createCrmReengagementRule,
  updateCrmReengagementRule,
  deleteCrmReengagementRule,
  previewCrmReengagement,
  runCrmReengagement,
  getCrmStages,
  type CrmCadence,
  type CrmCadenceStep,
  type CrmCadenceStepAction,
  type CrmReengagementAction,
  type CrmReengagementRule,
  type CrmReengagementPreviewItem,
  type CrmStage,
} from "@/lib/api/crm";

type ToastState = { kind: "success" | "error"; message: string } | null;

const ACTION_LABEL: Record<CrmReengagementAction, string> = {
  create_task: "Creează task",
  enroll_cadence: "Înscrie în cadență",
  add_tag: "Pune etichetă",
};

export function CrmCadencesPage() {
  const [cadences, setCadences] = useState<CrmCadence[]>([]);
  const [rules, setRules] = useState<CrmReengagementRule[]>([]);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [preview, setPreview] = useState<CrmReengagementPreviewItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cadRes, ruleRes, stageRes] = await Promise.all([
        listCrmCadences(),
        listCrmReengagementRules(),
        getCrmStages().catch(() => ({ items: [] as CrmStage[] })),
      ]);
      setCadences(cadRes.items);
      setRules(ruleRes.items);
      setStages(stageRes.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut încărca cadențele.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <BusinessShell
      pageTitle="Cadențe și reactivare"
      pageDescription="Ce se întâmplă singur cu leadurile, în timp — pas cu pas, sau după luni de tăcere."
    >
      {loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
        </div>
      ) : error ? (
        <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
          <div className="flex flex-col gap-2">
            <p>{error}</p>
            <Button variant="outline" size="sm" className="w-fit" onClick={() => void load()}>
              Reîncearcă
            </Button>
          </div>
        </Alert>
      ) : (
        <div className="flex flex-col gap-8">
          <CadencesSection
            cadences={cadences}
            stages={stages}
            busy={busy}
            setBusy={setBusy}
            onChanged={load}
            onToast={setToast}
          />
          <ReengagementSection
            rules={rules}
            cadences={cadences}
            stages={stages}
            preview={preview}
            setPreview={setPreview}
            busy={busy}
            setBusy={setBusy}
            onChanged={load}
            onToast={setToast}
          />
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg",
            toast.kind === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}
    </BusinessShell>
  );
}

// ─── Cadențe ───────────────────────────────────────────────────────────────────

function CadencesSection({
  cadences,
  stages,
  busy,
  setBusy,
  onChanged,
  onToast,
}: {
  cadences: CrmCadence[];
  stages: CrmStage[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  onChanged: () => Promise<void>;
  onToast: (t: ToastState) => void;
}) {
  const [name, setName] = useState("");
  const [triggerStage, setTriggerStage] = useState("");
  const [steps, setSteps] = useState<CrmCadenceStep[]>([{ dayOffset: 0, action: "task", title: "" }]);
  const [creating, setCreating] = useState(false);

  async function create() {
    const clean = name.trim();
    const cleanSteps = steps.filter((s) => s.title.trim().length > 0);
    if (!clean) return;
    setCreating(true);
    try {
      await createCrmCadence({
        name: clean,
        triggerStage: triggerStage || null,
        steps: cleanSteps.map((s) => ({ ...s, title: s.title.trim() })),
      });
      setName("");
      setTriggerStage("");
      setSteps([{ dayOffset: 0, action: "task", title: "" }]);
      onToast({ kind: "success", message: "Cadență creată." });
      await onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut crea cadența." });
    } finally {
      setCreating(false);
    }
  }

  async function toggle(cadence: CrmCadence, enabled: boolean) {
    try {
      await updateCrmCadence(cadence.id, { enabled });
      await onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut schimba starea." });
    }
  }

  async function remove(cadence: CrmCadence) {
    if (!confirm(`Ștergi cadența „${cadence.name}”? Înscrierile ei dispar odată cu ea.`)) return;
    try {
      await deleteCrmCadence(cadence.id);
      onToast({ kind: "success", message: "Cadență ștearsă." });
      await onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut șterge cadența." });
    }
  }

  async function runNow() {
    setBusy(true);
    try {
      const res = await runCrmCadencesNow();
      onToast({
        kind: "success",
        message:
          res.advanced === 0
            ? "Niciun pas scadent acum."
            : `${res.advanced} ${res.advanced === 1 ? "pas aprins" : "pași aprinși"}.`,
      });
      await onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Rularea a eșuat." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">Cadențe</h2>
          <p className="text-sm text-muted-foreground">
            Pașii se aprind singuri, zilnic. „Rulează acum” e doar pentru verificare — cronul face asta oricum.
          </p>
        </div>
        <Button variant="outline" onClick={() => void runNow()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          Rulează acum
        </Button>
      </div>

      {cadences.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-6 w-6" />}
          title="Nicio cadență încă"
          description="O cadență e o listă de pași cu zile: ziua 0 sună, ziua 3 trimite oferta, ziua 7 reamintește."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {cadences.map((cadence) => (
            <li key={cadence.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{cadence.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {cadence.steps.length} {cadence.steps.length === 1 ? "pas" : "pași"}
                    {cadence.triggerStage
                      ? ` · pornește la etapa „${stages.find((s) => s.key === cadence.triggerStage)?.label ?? cadence.triggerStage}”`
                      : " · doar înscriere manuală"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={cadence.enabled}
                    onChange={(next) => void toggle(cadence, next)}
                    aria-label={`Pornit/oprit pentru ${cadence.name}`}
                  />
                  <Button variant="ghost" size="icon" aria-label={`Șterge cadența ${cadence.name}`} onClick={() => void remove(cadence)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {cadence.steps.length > 0 && (
                <ol className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                  {cadence.steps.map((step, i) => (
                    <li key={`${cadence.id}-${i}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      <span className="font-medium text-foreground">Ziua {step.dayOffset}</span>
                      <Badge variant="secondary">{step.action === "task" ? "task" : "notă"}</Badge>
                      <span className="truncate">{step.title}</span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-cadence-name" required>
              Cadență nouă
            </Label>
            <Input
              id="crm-cadence-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Urmărire ofertă"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-cadence-trigger">Pornește la etapa</Label>
            <Select id="crm-cadence-trigger" value={triggerStage} onChange={(e) => setTriggerStage(e.target.value)}>
              <option value="">— doar manual —</option>
              {stages.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">Pași</p>
          {steps.map((step, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="flex w-20 flex-col gap-1">
                <Label htmlFor={`crm-step-day-${i}`}>Ziua</Label>
                <Input
                  id={`crm-step-day-${i}`}
                  type="number"
                  min={0}
                  value={String(step.dayOffset)}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((s, j) => (j === i ? { ...s, dayOffset: Math.max(0, Number(e.target.value) || 0) } : s))
                    )
                  }
                />
              </div>
              <div className="flex w-32 flex-col gap-1">
                <Label htmlFor={`crm-step-action-${i}`}>Acțiune</Label>
                <Select
                  id={`crm-step-action-${i}`}
                  value={step.action}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((s, j) => (j === i ? { ...s, action: e.target.value as CrmCadenceStepAction } : s))
                    )
                  }
                >
                  <option value="task">Task</option>
                  <option value="note">Notă</option>
                </Select>
              </div>
              <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                <Label htmlFor={`crm-step-title-${i}`}>Text</Label>
                <Input
                  id={`crm-step-title-${i}`}
                  value={step.title}
                  onChange={(e) => setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)))}
                  placeholder="ex: Sună clientul"
                />
              </div>
              {steps.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Șterge pasul ${i + 1}`}
                  onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setSteps((prev) => [...prev, { dayOffset: prev.length * 3, action: "task", title: "" }])}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Încă un pas
          </Button>
        </div>

        <Button className="w-fit" onClick={() => void create()} disabled={!name.trim() || creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          Creează cadența
        </Button>
      </div>
    </section>
  );
}

// ─── Reactivare ────────────────────────────────────────────────────────────────

function ReengagementSection({
  rules,
  cadences,
  stages,
  preview,
  setPreview,
  busy,
  setBusy,
  onChanged,
  onToast,
}: {
  rules: CrmReengagementRule[];
  cadences: CrmCadence[];
  stages: CrmStage[];
  preview: CrmReengagementPreviewItem[] | null;
  setPreview: (p: CrmReengagementPreviewItem[] | null) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onChanged: () => Promise<void>;
  onToast: (t: ToastState) => void;
}) {
  const [name, setName] = useState("");
  const [months, setMonths] = useState("6");
  const [action, setAction] = useState<CrmReengagementAction>("create_task");
  const [cadenceId, setCadenceId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const lostStages = stages.filter((s) => s.isLost);

  async function create() {
    const clean = name.trim();
    if (!clean) return;
    setCreating(true);
    try {
      await createCrmReengagementRule({
        name: clean,
        afterMonths: Math.max(1, Number(months) || 6),
        action,
        cadenceId: action === "enroll_cadence" ? cadenceId || null : null,
        taskTitle: taskTitle.trim() || null,
      });
      setName("");
      setTaskTitle("");
      onToast({ kind: "success", message: "Regulă de reactivare creată." });
      setPreview(null);
      await onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut crea regula." });
    } finally {
      setCreating(false);
    }
  }

  async function toggle(rule: CrmReengagementRule, enabled: boolean) {
    try {
      await updateCrmReengagementRule(rule.id, { enabled });
      await onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut schimba starea." });
    }
  }

  async function remove(rule: CrmReengagementRule) {
    if (!confirm(`Ștergi regula „${rule.name}”?`)) return;
    try {
      await deleteCrmReengagementRule(rule.id);
      setPreview(null);
      await onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut șterge regula." });
    }
  }

  async function loadPreview() {
    setBusy(true);
    try {
      const res = await previewCrmReengagement();
      setPreview(res.items);
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut calcula previzualizarea." });
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    try {
      const res = await runCrmReengagement();
      onToast({
        kind: "success",
        message: res.applied === 0 ? "Niciun lead de trezit acum." : `${res.applied} leaduri reactivate.`,
      });
      setPreview(null);
      await onChanged();
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Rularea a eșuat." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">Reactivare</h2>
          <p className="text-sm text-muted-foreground">
            Un client pierdut de N luni primește singur o acțiune. Vezi întâi pe cine atinge, apoi rulează.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void loadPreview()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Vezi pe cine atinge
          </Button>
          {/* „Rulează acum" apare DOAR după previzualizare: reactivarea scrie pe clienți reali. */}
          {preview && preview.length > 0 && (
            <Button onClick={() => void run()} disabled={busy}>
              <Play className="h-4 w-4" aria-hidden="true" />
              Rulează pentru {preview.length}
            </Button>
          )}
        </div>
      </div>

      {preview && (
        <div className="rounded-xl border border-border p-3">
          {preview.length === 0 ? (
            <p className="text-sm text-muted-foreground">Niciun lead nu e scadent acum.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {preview.map((item) => (
                <li key={`${item.ruleId}-${item.leadId}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{item.leadName}</span>
                  <Badge variant="secondary">{ACTION_LABEL[item.action]}</Badge>
                  <span className="text-xs text-muted-foreground">
                    regula „{item.ruleName}”
                    {item.lostAt && ` · pierdut la ${new Date(item.lostAt).toLocaleDateString("ro-MD")}`}
                    {item.lostReason && ` · ${item.lostReason}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rules.length === 0 ? (
        <EmptyState
          icon={<RefreshCw className="h-6 w-6" />}
          title="Nicio regulă de reactivare"
          description="Regula spune: după câte luni de la pierdere, ce se întâmplă cu leadul."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{rule.name}</p>
                <p className="text-xs text-muted-foreground">
                  după {rule.afterMonths} {rule.afterMonths === 1 ? "lună" : "luni"} · {ACTION_LABEL[rule.action]}
                  {rule.taskTitle && ` · „${rule.taskTitle}”`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={rule.enabled}
                  onChange={(next) => void toggle(rule, next)}
                  aria-label={`Pornit/oprit pentru ${rule.name}`}
                />
                <Button variant="ghost" size="icon" aria-label={`Șterge regula ${rule.name}`} onClick={() => void remove(rule)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-reeng-name" required>
              Regulă nouă
            </Label>
            <Input
              id="crm-reeng-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Trezește la 6 luni"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-reeng-months">După câte luni</Label>
            <Input
              id="crm-reeng-months"
              type="number"
              min={1}
              max={60}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-reeng-action">Acțiune</Label>
            <Select
              id="crm-reeng-action"
              value={action}
              onChange={(e) => setAction(e.target.value as CrmReengagementAction)}
            >
              {(Object.keys(ACTION_LABEL) as CrmReengagementAction[]).map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </Select>
          </div>
          {action === "enroll_cadence" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="crm-reeng-cadence">Cadența</Label>
              <Select id="crm-reeng-cadence" value={cadenceId} onChange={(e) => setCadenceId(e.target.value)}>
                <option value="">— alege —</option>
                {cadences.map((cadence) => (
                  <option key={cadence.id} value={cadence.id}>
                    {cadence.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <Label htmlFor="crm-reeng-title">{action === "add_tag" ? "Eticheta" : "Titlul taskului"}</Label>
              <Input
                id="crm-reeng-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder={action === "add_tag" ? "ex: Reactivare" : "ex: Sună clientul pierdut"}
              />
            </div>
          )}
        </div>
        {lostStages.length === 0 && (
          <Alert variant="warning">
            Nicio etapă marcată „pierdut” în pâlnie. Reactivarea nu are ce trezi până când o etapă nu e marcată
            astfel (din „Etape”, pe tabla de leaduri).
          </Alert>
        )}
        <Button className="w-fit" onClick={() => void create()} disabled={!name.trim() || creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          Creează regula
        </Button>
      </div>
    </section>
  );
}
