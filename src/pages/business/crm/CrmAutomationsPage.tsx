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
 * Al treilea (CRM-A02): pagina nu începe goală. Scenariile pe care le pornește orice
 * echipă de vânzări stau deja pe ecran, fiecare cu comutatorul lui — omul le aprinde,
 * nu le inventează. Regulile scrise de mână stau dedesubt, separat.
 *
 * Jurnalul de rulări e pe același ecran, nu ascuns: „de ce s-a mișcat singur
 * lead-ul meu" e prima întrebare după pornirea automatizărilor.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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
  blankAction,
  TRIGGER_LABELS,
  CONDITION_FIELDS,
  ACTION_LABELS,
  NOTIFY_TARGET_LABELS,
  STRATEGY_LABELS,
  type CrmAutomation,
  type CrmAutomationInput,
  type CrmAutomationRun,
  type AutomationAction,
  type AutomationCondition,
  type NotifyTarget,
  type TriggerKind,
} from "@/lib/api/crmAutomations";
import { listCrmAssignmentMembers, type CrmAssignmentMember } from "@/lib/api/crmAssignment";
import { AUTOMATION_SCENARIOS, type AutomationScenario } from "@/lib/crm/automationScenarios";
import { AssignmentTab } from "@/components/crm/AssignmentTab";
import { AutomationConditionRow } from "@/components/crm/AutomationConditionRow";
import { ScenarioCard } from "@/components/crm/ScenarioCard";

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

/** Ce editează dialogul: o regulă existentă sau una nouă, eventual pornită dintr-un scenariu. */
type Editing = { rule: CrmAutomation } | { draft: CrmAutomationInput } | null;

function RulesTab() {
  const [items, setItems] = useState<CrmAutomation[]>([]);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [members, setMembers] = useState<CrmAssignmentMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

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
    // Oamenii contează doar pentru alegerile din editor; fără ei, pagina merge mai departe.
    listCrmAssignmentMembers()
      .then((m) => setMembers(m.items))
      .catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stageLabel = useCallback(
    (key: string) => stages.find((s) => s.key === key)?.label ?? key,
    [stages]
  );

  const byTemplate = useMemo(() => {
    const map = new Map<string, CrmAutomation>();
    for (const a of items) if (a.templateKey) map.set(a.templateKey, a);
    return map;
  }, [items]);
  const ownRules = items.filter((a) => !a.templateKey || !AUTOMATION_SCENARIOS.some((s) => s.key === a.templateKey));

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

  async function toggleScenario(scenario: AutomationScenario, next: boolean) {
    const installed = byTemplate.get(scenario.key);
    if (installed) {
      if (installed.enabled !== next) await toggle(installed);
      return;
    }
    if (!next) return;
    const input = scenario.build(stages);
    if (!input) return;
    setBusyKey(scenario.key);
    setError(null);
    try {
      const created = await createCrmAutomation({ ...input, enabled: true, templateKey: scenario.key });
      setItems((prev) => [...prev, created]);
    } catch (err) {
      const list = problemsFrom(err);
      setError(list.length > 0 ? list.join(" ") : errText(err, "Nu am putut porni scenariul."));
    } finally {
      setBusyKey(null);
    }
  }

  function customize(scenario: AutomationScenario) {
    const installed = byTemplate.get(scenario.key);
    if (installed) return setEditing({ rule: installed });
    const input = scenario.build(stages);
    if (input) setEditing({ draft: { ...input, templateKey: scenario.key } });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă regulile" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && <Alert variant="destructive">{error}</Alert>}

      {/* ── Scenariile gata făcute ─────────────────────────────────────── */}
      <section className="space-y-3" aria-labelledby="scenarii-titlu">
        <div>
          <h2 id="scenarii-titlu" className="text-lg font-semibold">
            Scenarii gata făcute
          </h2>
          <p className="text-sm text-muted-foreground">
            Pornește ce ți se potrivește. „Personalizează” schimbă textul, zilele sau condițiile.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {AUTOMATION_SCENARIOS.map((scenario) => {
            const installed = byTemplate.get(scenario.key);
            const unavailable = !installed && !scenario.build(stages) ? scenario.missing ?? "Nu se potrivește pâlniei." : null;
            return (
              <li key={scenario.key}>
                <ScenarioCard
                  title={scenario.title}
                  why={installed ? describeAutomation(installed, stageLabel) : scenario.why}
                  on={!!installed?.enabled}
                  busy={busyKey === scenario.key}
                  unavailable={unavailable}
                  onToggle={(next) => void toggleScenario(scenario, next)}
                  onCustomize={() => customize(scenario)}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Regulile scrise de mână ────────────────────────────────────── */}
      <section className="space-y-3" aria-labelledby="reguli-titlu">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="reguli-titlu" className="text-lg font-semibold">
              Regulile tale
            </h2>
            <p className="text-sm text-muted-foreground">
              Rulează în ordinea din listă, la fiecare lead nou, schimbare de etapă sau lead uitat.
            </p>
          </div>
          <Button onClick={() => setEditing({ draft: EMPTY })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Regulă nouă
          </Button>
        </div>

        {ownRules.length === 0 ? (
          <EmptyState
            compact
            icon={<Zap className="h-6 w-6" />}
            title="Nicio regulă proprie încă"
            description="Scenariile de mai sus acoperă începutul. Scrie una proprie când ai un caz al tău — de pildă un task „Trimite oferta” când lead-ul intră în „Calificat”."
          />
        ) : (
          <ul className="space-y-3">
            {ownRules.map((auto) => (
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
                    <Button variant="outline" size="sm" onClick={() => setEditing({ rule: auto })}>
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
      </section>

      {editing && (
        <RuleDialog
          rule={"rule" in editing ? editing.rule : null}
          draft={"draft" in editing ? editing.draft : null}
          stages={stages}
          members={members}
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

interface RuleDialogProps {
  rule: CrmAutomation | null;
  draft: CrmAutomationInput | null;
  stages: CrmStage[];
  members: CrmAssignmentMember[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function RuleDialog({ rule, draft, stages, members, onClose, onSaved }: RuleDialogProps) {
  const [form, setForm] = useState<CrmAutomationInput>(
    rule
      ? { name: rule.name, enabled: rule.enabled, trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions }
      : draft ?? EMPTY
  );
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const firstStage = stages[0]?.key ?? "new";
  const stageChoices = useMemo(() => stages.map((s) => ({ value: s.key, label: s.label })), [stages]);

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

  const kind = form.trigger.kind;

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

        {/* Fraza de control: omul vede ce a scris, înainte să salveze. */}
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
          {describeAutomation(form, (k) => stages.find((s) => s.key === k)?.label ?? k)}
        </p>

        {/* ── Când ───────────────────────────────────────────────────────── */}
        <div className="space-y-2 rounded-md border border-border p-3">
          <Label htmlFor="reg-cand">Când</Label>
          <Select
            id="reg-cand"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as TriggerKind;
              setForm((f) => ({
                ...f,
                trigger: next === "lead.idle" ? { kind: next, toStage: null, idleDays: 3 } : { kind: next, toStage: null },
              }));
            }}
          >
            {(Object.keys(TRIGGER_LABELS) as TriggerKind[]).map((k) => (
              <option key={k} value={k}>
                {TRIGGER_LABELS[k]}
              </option>
            ))}
          </Select>
          {kind === "lead.idle" && (
            <div className="w-40 space-y-1">
              <Label htmlFor="reg-zile">După câte zile</Label>
              <Input
                id="reg-zile"
                type="number"
                min={1}
                max={365}
                value={form.trigger.idleDays ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    trigger: { ...f.trigger, idleDays: e.target.value === "" ? null : Number(e.target.value) },
                  }))
                }
              />
            </div>
          )}
          {(kind === "lead.stage_changed" || kind === "lead.idle") && (
            <div className="space-y-1">
              <Label htmlFor="reg-etapa">{kind === "lead.idle" ? "Doar în etapa" : "Etapa"}</Label>
              <Select
                id="reg-etapa"
                value={form.trigger.toStage ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, trigger: { ...f.trigger, toStage: e.target.value || null } }))
                }
              >
                <option value="">{kind === "lead.idle" ? "Orice etapă deschisă" : "Orice etapă"}</option>
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {kind === "lead.idle" && (
            <p className="text-xs text-muted-foreground">
              Se verifică o dată pe zi, dimineața. Un apel, o notiță sau o schimbare pe lead resetează numărătoarea;
              regula pornește o singură dată pe perioadă de liniște.
            </p>
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
                setForm((f) => ({ ...f, conditions: [...f.conditions, { field: "source", op: "in", value: "" }] }))
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
            <AutomationConditionRow
              key={i}
              condition={c}
              index={i}
              idPrefix="cond"
              fields={CONDITION_FIELDS}
              stages={stageChoices}
              onChange={(next) => setCondition(i, next)}
              onRemove={() => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))}
            />
          ))}
        </div>

        {/* ── Atunci ─────────────────────────────────────────────────────── */}
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <Label>Atunci</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setForm((f) => ({ ...f, actions: [...f.actions, blankAction("notify", firstStage)] }))}
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
                  onChange={(e) => setAction(i, blankAction(e.target.value as AutomationAction["type"], firstStage))}
                >
                  {(Object.keys(ACTION_LABELS) as AutomationAction["type"][]).map((t) => (
                    <option key={t} value={t}>
                      {ACTION_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>

              <ActionFields action={a} index={i} stages={stages} members={members} onChange={(next) => setAction(i, next)} />

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

interface ActionFieldsProps {
  action: AutomationAction;
  index: number;
  stages: CrmStage[];
  members: CrmAssignmentMember[];
  onChange: (next: AutomationAction) => void;
}

/** Câmpurile specifice fiecărui tip de acțiune. */
function ActionFields({ action: a, index: i, stages, members, onChange }: ActionFieldsProps) {
  const people = members.map((m) => (
    <option key={m.userId} value={m.userId}>
      {m.name}
    </option>
  ));

  switch (a.type) {
    case "create_task":
      return (
        <>
          <div className="min-w-[10rem] flex-1 space-y-1">
            <Label htmlFor={`act-titlu-${i}`}>Titlul taskului</Label>
            <Input
              id={`act-titlu-${i}`}
              value={a.title}
              onChange={(e) => onChange({ ...a, title: e.target.value })}
              placeholder="De sunat clientul"
            />
          </div>
          <div className="w-24 space-y-1">
            <Label htmlFor={`act-zile-${i}`}>În (zile)</Label>
            <Input
              id={`act-zile-${i}`}
              type="number"
              min={0}
              value={a.dueInDays ?? ""}
              onChange={(e) => onChange({ ...a, dueInDays: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>
          <div className="min-w-[10rem] space-y-1">
            <Label htmlFor={`act-cine-${i}`}>Pentru</Label>
            <Select
              id={`act-cine-${i}`}
              value={a.assignTo ?? ""}
              onChange={(e) => onChange({ ...a, assignTo: e.target.value || null })}
            >
              <option value="">Responsabilul lead-ului</option>
              {people}
            </Select>
          </div>
        </>
      );

    case "move_stage":
      return (
        <div className="min-w-[10rem] flex-1 space-y-1">
          <Label htmlFor={`act-etapa-${i}`}>Etapa</Label>
          <Select id={`act-etapa-${i}`} value={a.stageKey} onChange={(e) => onChange({ ...a, stageKey: e.target.value })}>
            {stages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      );

    case "add_tag":
    case "remove_tag":
      return (
        <div className="min-w-[10rem] flex-1 space-y-1">
          <Label htmlFor={`act-eticheta-${i}`}>Eticheta</Label>
          <Input id={`act-eticheta-${i}`} value={a.tag} onChange={(e) => onChange({ ...a, tag: e.target.value })} />
        </div>
      );

    case "add_note":
      return (
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor={`act-nota-${i}`}>Notița</Label>
          <Textarea id={`act-nota-${i}`} rows={2} value={a.body} onChange={(e) => onChange({ ...a, body: e.target.value })} />
        </div>
      );

    case "notify":
      return (
        <>
          <div className="min-w-[10rem] space-y-1">
            <Label htmlFor={`act-catre-${i}`}>Pe cine</Label>
            <Select
              id={`act-catre-${i}`}
              value={a.to === "user" ? a.userId ?? "" : a.to}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "assignee" || v === "admins") onChange({ ...a, to: v as NotifyTarget, userId: null });
                else onChange({ ...a, to: "user", userId: v || null });
              }}
            >
              <option value="assignee">{NOTIFY_TARGET_LABELS.assignee}</option>
              <option value="admins">{NOTIFY_TARGET_LABELS.admins}</option>
              {people}
            </Select>
          </div>
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label htmlFor={`act-mesaj-${i}`}>Mesajul</Label>
            <Input
              id={`act-mesaj-${i}`}
              value={a.message}
              placeholder="stă neatins de 3 zile"
              onChange={(e) => onChange({ ...a, message: e.target.value })}
            />
          </div>
        </>
      );

    case "assign":
      return (
        <div className="min-w-[10rem] flex-1 space-y-1">
          <Label htmlFor={`act-strategie-${i}`}>Cui</Label>
          <Select
            id={`act-strategie-${i}`}
            value={a.userId ? `user:${a.userId}` : a.strategy ?? "round_robin"}
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith("user:")) onChange({ type: "assign", userId: v.slice(5), strategy: null });
              else onChange({ type: "assign", strategy: v as "round_robin", userId: null });
            }}
          >
            {Object.keys(STRATEGY_LABELS).map((s) => (
              <option key={s} value={s}>
                {STRATEGY_LABELS[s]}
              </option>
            ))}
            {members.map((m) => (
              <option key={m.userId} value={`user:${m.userId}`}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
      );
  }
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
