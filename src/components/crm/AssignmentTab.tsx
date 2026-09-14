/**
 * CRM — distribuirea lead-urilor pe agenți.
 *
 * Trăiește ca filă în pagina de automatizări, fiindcă e același gând: „ce se
 * întâmplă singur cu un lead nou".
 *
 * Două lucruri pe care ecranul le face deliberat:
 *
 * 1. Arată încărcarea de AZI a fiecărui agent lângă norma lui. Distribuirea
 *    automată se reglează uitându-te la ce iese din ea, nu la ce ai configurat.
 * 2. Scoaterea din tragere e un comutator, nu o ștergere. Omul pleacă în
 *    concediu și se întoarce; contul lui n-are nicio treabă cu asta.
 */
import { useCallback, useEffect, useState } from "react";
import { Users, Loader2, Plus, Trash2 } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ds";
import {
  listCrmAssignmentRules,
  createCrmAssignmentRule,
  updateCrmAssignmentRule,
  deleteCrmAssignmentRule,
  listCrmAssignmentMembers,
  updateCrmAssignmentMember,
  STRATEGY_LABELS,
  STRATEGY_HELP,
  type AssignmentStrategy,
  type CrmAssignmentMember,
  type CrmAssignmentRule,
  type CrmAssignmentRuleInput,
} from "@/lib/api/crmAssignment";
import {
  CONDITION_FIELDS,
  CONDITION_OP_LABELS,
  OPS_WITHOUT_VALUE,
  type AutomationCondition,
  type ConditionOp,
} from "@/lib/api/crmAutomations";

function errText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function AssignmentTab() {
  const [rules, setRules] = useState<CrmAssignmentRule[]>([]);
  const [members, setMembers] = useState<CrmAssignmentMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CrmAssignmentRule | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, m] = await Promise.all([listCrmAssignmentRules(), listCrmAssignmentMembers()]);
      setRules(r.items);
      setMembers(m.items);
    } catch (err) {
      setError(errText(err, "Nu am putut încărca distribuirea."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchMember(userId: string, patch: Partial<CrmAssignmentMember>) {
    setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, ...patch } : m)));
    try {
      await updateCrmAssignmentMember(userId, patch);
    } catch (err) {
      setError(errText(err, "Nu am putut salva setările agentului."));
      await load();
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă distribuirea" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="destructive">{error}</Alert>}

      {/* ── Regulile ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Cine primește lead-urile noi</h2>
            <p className="text-sm text-muted-foreground">
              Regulile se încearcă în ordine. Prima care se potrivește decide.
            </p>
          </div>
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Regulă nouă
          </Button>
        </div>

        {rules.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Distribuirea nu e pornită"
            description="Fără nicio regulă, lead-urile noi rămân neatribuite și cineva trebuie să le împartă manual."
          />
        ) : (
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li key={rule.id}>
                <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      <Badge variant="secondary">{STRATEGY_LABELS[rule.strategy]}</Badge>
                      {!rule.enabled && <Badge>Oprită</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {rule.conditions.length === 0
                        ? "Se aplică la toate lead-urile noi."
                        : rule.conditions
                            .map((c) => {
                              const f = CONDITION_FIELDS.find((x) => x.value === c.field)?.label ?? c.field;
                              const op = CONDITION_OP_LABELS[c.op];
                              return OPS_WITHOUT_VALUE.includes(c.op) ? `${f} ${op}` : `${f} ${op} „${c.value ?? ""}”`;
                            })
                            .join(" și ")}
                      {rule.userIds.length > 0 && ` · ${rule.userIds.length} agenți în tragere`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={rule.enabled}
                      onChange={async () => {
                        setRules((prev) =>
                          prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
                        );
                        await updateCrmAssignmentRule(rule.id, { enabled: !rule.enabled });
                      }}
                      aria-label={rule.enabled ? `Oprește regula ${rule.name}` : `Pornește regula ${rule.name}`}
                    />
                    <Button variant="outline" size="sm" onClick={() => setEditing(rule)}>
                      Modifică
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Șterge regula ${rule.name}`}
                      onClick={async () => {
                        await deleteCrmAssignmentRule(rule.id);
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

      {/* ── Agenții ──────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Agenții și norma lor</h2>
          <p className="text-sm text-muted-foreground">
            „Azi” arată câte lead-uri a primit fiecare de la miezul nopții. Normă 0 = fără limită.
          </p>
        </div>

        <div className="overflow-x-auto">
          <Table aria-label="Agenții și norma lor">
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>În tragere</TableHead>
                <TableHead className="text-right">Azi</TableHead>
                <TableHead className="text-right">Normă/zi</TableHead>
                <TableHead className="text-right">Greutate</TableHead>
                <TableHead>Regiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={m.isActive}
                      onChange={() => void patchMember(m.userId, { isActive: !m.isActive })}
                      aria-label={m.isActive ? `Scoate din tragere pe ${m.name}` : `Pune în tragere pe ${m.name}`}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span
                      className={
                        m.dailyCapacity > 0 && m.assignedToday >= m.dailyCapacity ? "font-semibold text-amber-600" : ""
                      }
                    >
                      {m.assignedToday}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="w-20 text-right"
                      type="number"
                      min={0}
                      value={m.dailyCapacity}
                      aria-label={`Norma zilnică pentru ${m.name}`}
                      onChange={(e) => void patchMember(m.userId, { dailyCapacity: Number(e.target.value) || 0 })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="w-16 text-right"
                      type="number"
                      min={0}
                      value={m.weight}
                      aria-label={`Greutatea pentru ${m.name}`}
                      onChange={(e) => void patchMember(m.userId, { weight: Number(e.target.value) || 0 })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={m.regions.join(", ")}
                      aria-label={`Regiunile acoperite de ${m.name}`}
                      placeholder="Nord, Centru"
                      onChange={(e) =>
                        void patchMember(m.userId, {
                          regions: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {editing && (
        <AssignmentRuleDialog
          rule={editing === "new" ? null : editing}
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

function AssignmentRuleDialog({
  rule,
  members,
  onClose,
  onSaved,
}: {
  rule: CrmAssignmentRule | null;
  members: CrmAssignmentMember[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<CrmAssignmentRuleInput>(
    rule
      ? {
          name: rule.name,
          enabled: rule.enabled,
          strategy: rule.strategy,
          conditions: rule.conditions,
          userIds: rule.userIds,
        }
      : { name: "", enabled: true, strategy: "round_robin", conditions: [], userIds: [] }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conditions = form.conditions ?? [];
  const userIds = form.userIds ?? [];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (rule) await updateCrmAssignmentRule(rule.id, form);
      else await createCrmAssignmentRule(form);
      await onSaved();
    } catch (err) {
      setError(errText(err, "Nu am putut salva regula."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={rule ? "Modifică regula" : "Regulă de distribuire"} size="lg">
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="space-y-1">
          <Label htmlFor="dist-nume">Numele regulii</Label>
          <Input
            id="dist-nume"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Lead-urile de pe site, pe rând"
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="dist-strategie">Cum se împarte</Label>
          <Select
            id="dist-strategie"
            value={form.strategy}
            onChange={(e) => setForm((f) => ({ ...f, strategy: e.target.value as AssignmentStrategy }))}
          >
            {(Object.keys(STRATEGY_LABELS) as AssignmentStrategy[]).map((s) => (
              <option key={s} value={s}>
                {STRATEGY_LABELS[s]}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{STRATEGY_HELP[form.strategy]}</p>
        </div>

        {/* Condiții */}
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <Label>Doar pentru lead-urile unde</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  conditions: [...(f.conditions ?? []), { field: "source", op: "eq", value: "" }],
                }))
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Condiție
            </Button>
          </div>
          {conditions.length === 0 && (
            <p className="text-xs text-muted-foreground">Fără condiții — regula prinde toate lead-urile noi.</p>
          )}
          {conditions.map((c: AutomationCondition, i: number) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[9rem] flex-1 space-y-1">
                <Label htmlFor={`dist-camp-${i}`}>Câmpul</Label>
                <Select
                  id={`dist-camp-${i}`}
                  value={c.field}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      conditions: (f.conditions ?? []).map((x, j) => (j === i ? { ...x, field: e.target.value } : x)),
                    }))
                  }
                >
                  {CONDITION_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[8rem] space-y-1">
                <Label htmlFor={`dist-op-${i}`}>Compară</Label>
                <Select
                  id={`dist-op-${i}`}
                  value={c.op}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      conditions: (f.conditions ?? []).map((x, j) =>
                        j === i ? { ...x, op: e.target.value as ConditionOp } : x
                      ),
                    }))
                  }
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
                  <Label htmlFor={`dist-val-${i}`}>Valoarea</Label>
                  <Input
                    id={`dist-val-${i}`}
                    value={String(c.value ?? "")}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        conditions: (f.conditions ?? []).map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x
                        ),
                      }))
                    }
                  />
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Șterge condiția ${i + 1}`}
                onClick={() =>
                  setForm((f) => ({ ...f, conditions: (f.conditions ?? []).filter((_, j) => j !== i) }))
                }
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        {/* Cine intră în tragere */}
        <fieldset className="space-y-2 rounded-md border border-border p-3">
          <legend className="text-sm font-medium">Cine intră în tragere</legend>
          <p className="text-xs text-muted-foreground">
            Nimeni bifat = toți agenții activi ai workspace-ului.
          </p>
          {members.map((m) => (
            <label key={m.userId} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={userIds.includes(m.userId)}
                onChange={(e) =>
                  setForm((f) => {
                    const prev = f.userIds ?? [];
                    return {
                      ...f,
                      userIds: e.target.checked ? [...prev, m.userId] : prev.filter((id) => id !== m.userId),
                    };
                  })
                }
              />
              {m.name}
              {!m.isActive && <span className="text-muted-foreground">(scos din tragere)</span>}
            </label>
          ))}
        </fieldset>

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
