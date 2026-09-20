/**
 * CRM — normele de activitate: „câte apeluri pe săptămână".
 *
 * Un singur ecran, cu două coloane de gândire: norma GENERALĂ a workspace-ului (valabilă pentru
 * oricine n-are una proprie) și norma unui anumit agent. Nu există „normă pe echipă" ca sumă —
 * ar fi o a treia cifră care se bate cu primele două.
 *
 * Câmpul gol sau 0 înseamnă „fără normă", iar asta ȘTERGE rândul: o normă de zero salvată ar
 * face ca raportul să arate veșnic „0%", adică o acuzație pentru un indicator pe care nimeni
 * nu-l urmărește.
 *
 * Valoarea vânzărilor se scrie în unități întregi (lei/MDL), nu în cenți — conversia se face
 * aici, o dată, fiindcă indicatorul măsurat e în cenți.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, Button, Dialog, Input, Label, Select } from "@/components/ds";
import {
  listCrmKpiTargets,
  setCrmKpiTarget,
  KPI_TARGET_METRICS,
  KPI_TARGET_LABELS,
  type CrmKpiTarget,
  type KpiTargetMetric,
  type KpiTargetPeriod,
} from "@/lib/api/crmKpiTargets";

export interface KpiTargetsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Echipa, pentru selectorul „norma cui". */
  owners: { id: string; name: string }[];
  /** Chemat după orice salvare, ca raportul din spate să se reîncarce cu noile norme. */
  onSaved: () => void;
}

const MONEY_METRIC: KpiTargetMetric = "salesValueCents";

export function KpiTargetsDialog({ open, onClose, owners, onSaved }: KpiTargetsDialogProps) {
  const [scope, setScope] = useState<string>("all");
  const [period, setPeriod] = useState<KpiTargetPeriod>("week");
  const [targets, setTargets] = useState<CrmKpiTarget[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    listCrmKpiTargets()
      .then((res) => setTargets(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : "Nu am putut citi normele."))
      .finally(() => setLoading(false));
  }, [open]);

  // Ce se vede în câmpuri: normele salvate pentru domeniul și perioada alese.
  useEffect(() => {
    const userId = scope === "all" ? null : scope;
    const next: Record<string, string> = {};
    for (const metric of KPI_TARGET_METRICS) {
      const row = targets.find((t) => t.userId === userId && t.period === period && t.metric === metric);
      if (!row) continue;
      next[metric] = metric === MONEY_METRIC ? String(Math.round(row.target / 100)) : String(row.target);
    }
    setDraft(next);
  }, [targets, scope, period]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const userId = scope === "all" ? null : scope;
      for (const metric of KPI_TARGET_METRICS) {
        const raw = (draft[metric] ?? "").trim();
        const parsed = raw === "" ? 0 : Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed) || parsed < 0) continue;
        const target = metric === MONEY_METRIC ? parsed * 100 : parsed;

        const existing = targets.find((t) => t.userId === userId && t.period === period && t.metric === metric);
        const existingValue = existing?.target ?? 0;
        // Nu trimitem ce n-a fost atins: un PUT pe fiecare indicator la fiecare salvare ar umple
        // jurnalul CRM cu rânduri care nu schimbă nimic.
        if (target === existingValue) continue;
        await setCrmKpiTarget({ userId, period, metric, target });
      }
      const fresh = await listCrmKpiTargets();
      setTargets(fresh.items);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Normele nu s-au putut salva.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Norme de activitate"
      description="Ținta pe perioadă. Câmpul gol înseamnă „fără normă” — indicatorul rămâne o cifră simplă, nu 0%."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Închide
          </Button>
          <Button onClick={() => void save()} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează normele
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="kpi-scope">Norma cui</Label>
            <Select id="kpi-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">Toată echipa (implicit)</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="kpi-period">Pe</Label>
            <Select
              id="kpi-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as KpiTargetPeriod)}
            >
              <option value="week">Săptămână</option>
              <option value="month">Lună</option>
            </Select>
          </div>
        </div>

        {scope !== "all" && (
          <p className="text-xs text-muted-foreground">
            Norma personală o înlocuiește pe cea a echipei pentru omul ăsta.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {KPI_TARGET_METRICS.map((metric) => (
            <div key={metric}>
              <Label htmlFor={`kpi-${metric}`}>
                {KPI_TARGET_LABELS[metric]}
                {metric === MONEY_METRIC && <span className="ml-1 text-muted-foreground">(în lei)</span>}
              </Label>
              <Input
                id={`kpi-${metric}`}
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="fără normă"
                value={draft[metric] ?? ""}
                onChange={(e) => setDraft((prev) => ({ ...prev, [metric]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
