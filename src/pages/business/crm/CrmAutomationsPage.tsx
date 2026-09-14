/**
 * CRM — automatizări: reguli care mișcă singure lead-urile.
 *
 * Ecranul e construit în jurul unei idei: o regulă trebuie să se CITEASCĂ, nu
 * să se descifreze. În listă, fiecare regulă apare ca o frază în română („Când
 * apare un lead nou și Valoare cel puțin 100000 → pune eticheta «mare»"), nu ca
 * un bloc de condiții. Cine se întoarce peste trei luni trebuie să înțeleagă din
 * prima ce a scris.
 *
 * Al doilea principiu: comutatorul de pornit/oprit e la îndemână, ștergerea nu.
 * O regulă care face rău trebuie oprită în două secunde; una ștearsă din greșeală
 * nu se mai întoarce.
 *
 * Jurnalul de rulări e pe același ecran, nu ascuns: „de ce s-a mișcat singur
 * lead-ul meu" e prima întrebare după pornirea automatizărilor.
 */
import { useCallback, useEffect, useState } from "react";
import { Zap, Loader2, Plus, Trash2, AlertTriangle, History } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  Label,
  Select,
  Switch,
  Tabs,
  Textarea,
} from "@/components/ds";
import { getCrmStages, type CrmStage } from "@/lib/api/crm";
import {
  listCrmAutomations,
  createCrmAutomation,
  updateCrmAutomation,
  deleteCrmAutomation,
  listCrmAutomationRuns,
  describeAutomation,
  TRIGGER_LABELS,
  CONDITION_FIELDS,
  CONDITION_OP_LABELS,
  OPS_WITHOUT_VALUE,
  ACTION_LABELS,
  STRATEGY_LABELS,
  type CrmAutomation,
  type CrmAutomationInput,
  type CrmAutomationRun,
  type AutomationAction,
  type AutomationCondition,
  type ConditionOp,
  type TriggerKind,
} from "@/lib/api/crmAutomations";
import { AssignmentTab } from "@/components/crm/AssignmentTab";

function errText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Mesajele de validare vin de la server ca `problems: string[]`. */
function problemsFrom(err: unknown): string[] {
  const data = (err as { data?: { problems?: unknown } })?.data;
  return Array.isArray(data?.problems) ? (data.problems as string[]) : [];
}

export function CrmAutomationsPage() {
  const [tab, setTab] = useState("reguli");

  return (
    <BusinessShell
      pageTitle="Automatizări"
      pageDescription="Reguli care mișcă singure lead-urile și le împart pe agenți. Fiecare rulare rămâne în jurnal."
    >
      <div className="space-y-6">
        <Tabs
          aria-label="Secțiunile paginii de automatizări"
          tabs={[
            { value: "reguli", label: "Reguli" },
            { value: "distribuire", label: "Distribuire" },
            { value: "jurnal", label: "Ce s-a întâmplat" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "reguli" && <RulesTab />}
        {tab === "distribuire" && <AssignmentTab />}
        {tab === "jurnal" && <RunsTab />}
      </div>
    </BusinessShell>
  );
}

// ─── Reguli ──────────────────────────────────────────────────────────────────

function RulesTab() {
  const [items, setItems] = useState<CrmAutomation[]>([]);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CrmAutomation | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [autos, st] = await Promise.all([listCrmAutomations(), getCrmStages()]);
      setItems(autos.items);
      setStages(st.items);
    } catch (err) {
      setError(errText(err, "Nu am putut încărca regulile."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stageLabel = useCallback(
    (key: string) => stages.find((s) => s.key === key)?.label ?? key,
    [stages]
  );

  async function toggle(auto: CrmAutomation) {
    // Optimist: comutatorul trebuie să răspundă instantaneu — o regulă care
    // face rău se oprește sub presiune, nu după o rotiță de încărcare.
    setItems((prev) => prev.map((a) => (a.id === auto.id ? { ...a, enabled: !a.enabled } : a)));
    try {
      await updateCrmAutomation(auto.id, { enabled: !auto.enabled });
    } catch (err) {
      setItems((prev) => prev.map((a) => (a.id === auto.id ? { ...a, enabled: auto.enabled } : a)));
      setError(errText(err, "Nu am putut schimba starea regulii."));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">
          Regulile rulează în ordinea din listă, la fiecare lead nou sau schimbare de etapă.
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Regulă nouă
        </Button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă regulile" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-6 w-6" />}
          title="Nicio regulă încă"
          description="O regulă poate, de pildă, să creeze automat un task „de sunat” la fiecare lead nou de pe site."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((auto) => (
            <li key={auto.id}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{auto.name}</span>
                    {!auto.enabled && <Badge variant="secondary">Oprită</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{describeAutomation(auto, stageLabel)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={auto.enabled}
                    onChange={() => void toggle(auto)}
                    aria-label={auto.enabled ? `Oprește regula ${auto.name}` : `Pornește regula ${auto.name}`}
                  />
                  <Button variant="outline" size="sm" onClick={() => setEditing(auto)}>
                    Modifică
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Șterge regula ${auto.name}`}
                    onClick={async () => {
                      await deleteCrmAutomation(auto.id);
                      await load();
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RuleDialog
          rule={editing === "new" ? null : editing}
          stages={stages}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ─── Editorul de regulă ──────────────────────────────────────────────────────

const EMPTY: CrmAutomationInput = {
  name: "",
  enabled: true,
  trigger: { kind: "lead.created" },
  conditions: [],
  actions: [{ type: "create_task", title: "" }],
};

function RuleDialog({
  rule,
  stages,
  onClose,
  onSaved,
}: {
  rule: CrmAutomation | null;
  stages: CrmStage[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<CrmAutomationInput>(
    rule
      ? { name: rule.name, enabled: rule.enabled, trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const firstStage = stages[0]?.key ?? "new";

  async function save() {
    setSaving(true);
    setProblems([]);
    setError(null);
    try {
      if (rule) await updateCrmAutomation(rule.id, form);
      else await createCrmAutomation(form);
      await onSaved();
    } catch (err) {
      const list = problemsFrom(err);
      if (list.length > 0) setProblems(list);
      else setError(errText(err, "Nu am putut salva regula."));
    } finally {
      setSaving(false);
    }
  }

  function setAction(i: number, next: AutomationAction) {
    setForm((f) => ({ ...f, actions: f.actions.map((a, j) => (j === i ? next : a)) }));
  }

  function setCondition(i: number, next: AutomationCondition) {
    setForm((f) => ({ ...f, conditions: f.conditions.map((c, j) => (j === i ? next : c)) }));
  }

  return (
    <Dialog open onClose={onClose} title={rule ? "Modifică regula" : "Regulă nouă"} size="lg">
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        {problems.length > 0 && (
          <Alert variant="destructive">
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {problems.map((p) => (
                  <span key={p} className="block">
                    {p}
                  </span>
                ))}
              </span>
            </span>
          </Alert>
        )}

        <div className="space-y-1">
          <Label htmlFor="reg-nume">Numele regulii</Label>
          <Input
            id="reg-nume"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Sună clienții noi de pe site în 2 zile"
            autoFocus
          />
        </div>

        {/* ── Când ───────────────────────────────────────────────────────── */}
        <div className="space-y-2 rounded-md border border-border p-3">
          <Label htmlFor="reg-cand">Când</Label>
          <Select
            id="reg-cand"
            value={form.trigger.kind}
            onChange={(e) =>
              setForm((f) => ({ ...f, trigger: { kind: e.target.value as TriggerKind, toStage: null } }))
            }
          >
            {(Object.keys(TRIGGER_LABELS) as TriggerKind[]).map((k) => (
              <option key={k} value={k}>
                {TRIGGER_LABELS[k]}
              </option>
            ))}
          </Select>
          {form.trigger.kind === "lead.stage_changed" && (
            <div className="space-y-1">
              <Label htmlFor="reg-etapa">Etapa</Label>
              <Select
                id="reg-etapa"
                value={form.trigger.toStage ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, trigger: { ...f.trigger, toStage: e.target.value || null } }))
                }
              >
                <option value="">Orice etapă</option>
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {/* ── Doar dacă ──────────────────────────────────────────────────── */}
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <Label>Doar dacă (toate trebuie să fie adevărate)</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((f) => ({ ...f, conditions: [...f.conditions, { field: "source", op: "eq", value: "" }] }))
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Condiție
            </Button>
          </div>
          {form.conditions.length === 0 && (
            <p className="text-xs text-muted-foreground">Fără condiții — regula se aplică la toate lead-urile.</p>
          )}
          {form.conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[9rem] flex-1 space-y-1">
                <Label htmlFor={`cond-camp-${i}`}>Câmpul</Label>
                <Select
                  id={`cond-camp-${i}`}
                  value={c.field}
                  onChange={(e) => setCondition(i, { ...c, field: e.target.value })}
                >
                  {CONDITION_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[8rem] space-y-1">
                <Label htmlFor={`cond-op-${i}`}>Compară</Label>
                <Select
                  id={`cond-op-${i}`}
                  value={c.op}
                  onChange={(e) => setCondition(i, { ...c, op: e.target.value as ConditionOp })}
                >
                  {(Object.keys(CONDITION_OP_LABELS) as ConditionOp[]).map((op) => (
                    <option key={op} value={op}>
                      {CONDITION_OP_LABELS[op]}
                    </option>
                  ))}
                </Select>
              </div>
              {!OPS_WITHOUT_VALUE.includes(c.op) && (
                <div className="min-w-[8rem] flex-1 space-y-1">
                  <Label htmlFor={`cond-val-${i}`}>Valoarea</Label>
                  <Input
                    id={`cond-val-${i}`}
                    value={String(c.value ?? "")}
                    onChange={(e) => setCondition(i, { ...c, value: e.target.value })}
                  />
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Șterge condiția ${i + 1}`}
                onClick={() => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        {/* ── Atunci ─────────────────────────────────────────────────────── */}
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <Label>Atunci</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setForm((f) => ({ ...f, actions: [...f.actions, { type: "add_tag", tag: "" }] }))}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Acțiune
            </Button>
          </div>
          {form.actions.map((a, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[10rem] space-y-1">
                <Label htmlFor={`act-tip-${i}`}>Acțiunea</Label>
                <Select
                  id={`act-tip-${i}`}
                  value={a.type}
                  onChange={(e) => {
                    const t = e.target.value as AutomationAction["type"];
                    const blank: Record<AutomationAction["type"], AutomationAction> = {
                      create_task: { type: "create_task", title: "" },
                      move_stage: { type: "move_stage", stageKey: firstStage },
                      add_tag: { type: "add_tag", tag: "" },
                      add_note: { type: "add_note", body: "" },
                      assign: { type: "assign", strategy: "round_robin" },
                    };
                    setAction(i, blank[t]);
                  }}
                >
                  {(Object.keys(ACTION_LABELS) as AutomationAction["type"][]).map((t) => (
                    <option key={t} value={t}>
                      {ACTION_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>

              {a.type === "create_task" && (
                <>
                  <div className="min-w-[10rem] flex-1 space-y-1">
                    <Label htmlFor={`act-titlu-${i}`}>Titlul taskului</Label>
                    <Input
                      id={`act-titlu-${i}`}
                      value={a.title}
                      onChange={(e) => setAction(i, { ...a, title: e.target.value })}
                      placeholder="De sunat clientul"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label htmlFor={`act-zile-${i}`}>În (zile)</Label>
                    <Input
                      id={`act-zile-${i}`}
                      type="number"
                      min={0}
                      value={a.dueInDays ?? ""}
                      onChange={(e) =>
                        setAction(i, { ...a, dueInDays: e.target.value === "" ? undefined : Number(e.target.value) })
                      }
                    />
                  </div>
                </>
              )}

              {a.type === "move_stage" && (
                <div className="min-w-[10rem] flex-1 space-y-1">
                  <Label htmlFor={`act-etapa-${i}`}>Etapa</Label>
                  <Select
                    id={`act-etapa-${i}`}
                    value={a.stageKey}
                    onChange={(e) => setAction(i, { ...a, stageKey: e.target.value })}
                  >
                    {stages.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {a.type === "add_tag" && (
                <div className="min-w-[10rem] flex-1 space-y-1">
                  <Label htmlFor={`act-eticheta-${i}`}>Eticheta</Label>
                  <Input
                    id={`act-eticheta-${i}`}
                    value={a.tag}
                    onChange={(e) => setAction(i, { ...a, tag: e.target.value })}
                  />
                </div>
              )}

              {a.type === "add_note" && (
                <div className="min-w-[12rem] flex-1 space-y-1">
                  <Label htmlFor={`act-nota-${i}`}>Notița</Label>
                  <Textarea
                    id={`act-nota-${i}`}
                    rows={2}
                    value={a.body}
                    onChange={(e) => setAction(i, { ...a, body: e.target.value })}
                  />
                </div>
              )}

              {a.type === "assign" && (
                <div className="min-w-[10rem] flex-1 space-y-1">
                  <Label htmlFor={`act-strategie-${i}`}>Cum</Label>
                  <Select
                    id={`act-strategie-${i}`}
                    value={a.strategy ?? "round_robin"}
                    onChange={(e) =>
                      setAction(i, { type: "assign", strategy: e.target.value as "round_robin", userId: null })
                    }
                  >
                    {Object.keys(STRATEGY_LABELS).map((s) => (
                      <option key={s} value={s}>
                        {STRATEGY_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {form.actions.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Șterge acțiunea ${i + 1}`}
                  onClick={() => setForm((f) => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }))}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Renunță
          </Button>
          <Button onClick={() => void save()} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Jurnalul ────────────────────────────────────────────────────────────────

function RunsTab() {
  const [items, setItems] = useState<CrmAutomationRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCrmAutomationRuns()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă jurnalul" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-6 w-6" />}
        title="Nicio rulare încă"
        description="Aici apare fiecare regulă care a pornit, pe ce lead și ce a făcut."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((run) => (
        <li key={run.id}>
          <Card className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{run.automationName ?? "(regulă ștearsă)"}</p>
              <p className="text-sm text-muted-foreground">
                {run.actions.map((a) => a.detail || a.action).join(" · ") || "fără acțiuni"}
              </p>
              {run.error && <p className="text-sm text-destructive">{run.error}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {run.status === "error" && <Badge variant="destructive">Eroare</Badge>}
              <span className="text-xs text-muted-foreground">
                {new Date(run.createdAt).toLocaleString("ro-MD")}
              </span>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
