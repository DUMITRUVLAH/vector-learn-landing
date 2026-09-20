/**
 * CRM — „Tabloul pâlniei": pâlnia desenată, cu banii pe stânga și căderea pe dreapta.
 *
 * Ecranul răspunde la întrebarea pe care un manager de vânzări o pune în fiecare luni: *unde se
 * opresc afacerile și câți bani stau blocați acolo?* Tabelul de conversie din „Rapoarte" avea
 * cifrele, dar nu și forma — iar o pâlnie fără formă nu se citește dintr-o privire.
 *
 * Trei lucruri pe care le face în plus față de raportul general:
 *  - **bani pe etapă**, nu doar număr de leaduri (raportul vechi număra doar capete);
 *  - **rata de cădere** lângă etapă, nu dedusă din două coloane;
 *  - **filtrare pe segment**, inclusiv pe coloanele importate din Excel — până acum rapoartele
 *    acceptau doar perioada și agentul, deci „cum arată pâlnia în industria alimentară" nu avea
 *    unde fi întrebat.
 *
 * Sub pâlnia echipei stă aceeași pâlnie descompusă pe agent: acolo se vede cine pierde unde,
 * ceea ce e altceva decât cine vinde cât.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Badge, Card, EmptyState, Label, Select } from "@/components/ds";
import { SegmentFilterBar } from "@/components/crm/SegmentFilterBar";
import { FunnelChart, money } from "@/components/crm/FunnelChart";
import { crmSegmentParams, type CrmSegmentFilters } from "@/lib/crm/segmentFilters";
import { listCrmPipelines, type CrmPipeline } from "@/lib/api/crm";
import { getCrmFunnel, type CrmFunnelResponse } from "@/lib/api/crmFunnel";
import { useRouter } from "@/router/HashRouter";

/** Pâlnia cerută în adresă (`?pipelineId=…`), când vii cu un buton de pe tablă. */
function pipelineFromPath(path: string): string | null {
  const i = path.indexOf("?");
  if (i < 0) return null;
  return new URLSearchParams(path.slice(i + 1)).get("pipelineId");
}

/** Perioadele uzuale. „Tot timpul" e implicit: o bază importată ieri n-are istoric de o lună,
 *  iar o pâlnie goală la prima deschidere ar părea o defecțiune. */
const PERIODS = [
  { key: "all", label: "Tot timpul" },
  { key: "30", label: "Ultimele 30 de zile" },
  { key: "90", label: "Ultimele 90 de zile" },
  { key: "365", label: "Ultimul an" },
] as const;

function rangeFor(period: string): { from?: string; to?: string } {
  if (period === "all") return {};
  const days = Number(period);
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString() };
}

export function CrmFunnelPage() {
  const { path } = useRouter();
  const requestedPipeline = pipelineFromPath(path);
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [pipelineId, setPipelineId] = useState(requestedPipeline ?? "");
  const [period, setPeriod] = useState<string>("all");
  const [owner, setOwner] = useState<string>("all");
  const [segments, setSegments] = useState<CrmSegmentFilters>({});

  const [data, setData] = useState<CrmFunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCrmPipelines()
      .then((res) => {
        setPipelines(res.items);
        // Pâlnia din adresă bate implicita: ai apăsat „Analiza pâlniei" DE PE tabla ei, deci
        // despre ea vrei să vezi cifrele — nu despre cea implicită a workspace-ului.
        if (requestedPipeline && res.items.some((p) => p.id === requestedPipeline)) return;
        const def = res.items.find((p) => p.isDefault) ?? res.items[0];
        if (def) setPipelineId(def.id);
      })
      .catch(() => setPipelines([]));
  }, [requestedPipeline]);

  // Aceeași regulă ca la repartizare: efectul atârnă de VALORI serializate, nu de identitatea
  // unei funcții — altfel o re-randare oarecare ar reîncărca ecranul fără motiv.
  const queryKey = useMemo(
    () =>
      JSON.stringify({
        ...(pipelineId ? { pipelineId } : {}),
        ...rangeFor(period),
        ...(owner !== "all" ? { owner } : {}),
        ...crmSegmentParams(segments),
      }),
    [pipelineId, period, owner, segments]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getCrmFunnel(JSON.parse(queryKey) as Record<string, string>));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut încărca pâlnia.");
    } finally {
      setLoading(false);
    }
  }, [queryKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const open = (data?.stages ?? []).filter((s) => !s.isLost && !s.isWon);
    return {
      value: open.reduce((sum, s) => sum + s.currentValueCents, 0),
      weighted: open.reduce((sum, s) => sum + s.weightedValueCents, 0),
      won: (data?.stages ?? []).filter((s) => s.isWon).reduce((sum, s) => sum + s.currentValueCents, 0),
    };
  }, [data]);

  return (
    <BusinessShell
      pageTitle="Tabloul pâlniei"
      pageDescription="Unde se opresc afacerile și câți bani stau blocați pe fiecare etapă."
    >
      <div className="space-y-6">
        {error && <Alert variant="destructive">{error}</Alert>}

        <Card className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="funnel-pipeline">Pâlnia</Label>
              <Select id="funnel-pipeline" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="funnel-period">Perioada</Label>
              <Select id="funnel-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
                {PERIODS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="funnel-owner">Agentul</Label>
              <Select id="funnel-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="all">Toată echipa</option>
                {(data?.owners ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <SegmentFilterBar value={segments} onChange={setSegments} />
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Valoare în pâlnie (etape deschise)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{money(totals.value)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Ponderat cu probabilitatea</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{money(totals.weighted)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Oportunități în segment</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{data?.totalLeads ?? 0}</p>
          </Card>
        </div>

        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Pâlnia echipei</h2>
            <p className="text-xs text-muted-foreground">
              Panta fiecărei benzi ESTE rata de cădere — cu cât se îngustează mai tare, cu atât se pierd
              mai multe acolo.
            </p>
          </div>

          {loading && !data ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Se încarcă…
            </p>
          ) : (data?.stages.length ?? 0) === 0 ? (
            <EmptyState title="Nimic de arătat" description="Pâlnia n-are etape sau segmentul e gol." />
          ) : (
            <FunnelChart stages={data!.stages} label="Pâlnia echipei" />
          )}
        </Card>

        {(data?.byOwner.length ?? 0) > 1 && (
          <Card className="space-y-4 p-4">
            <h2 className="text-lg font-semibold">Pe agent</h2>
            <p className="text-sm text-muted-foreground">
              Aceeași pâlnie, descompusă: aici se vede cine pierde <em>unde</em>, nu doar cine vinde cât.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {data!.byOwner.map((o) => (
                <div key={o.userId} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{o.name}</h3>
                    <Badge variant="secondary">
                      {money(o.stages.filter((s) => !s.isLost && !s.isWon).reduce((sum, s) => sum + s.currentValueCents, 0))}
                    </Badge>
                  </div>
                  <FunnelChart stages={o.stages} label={`Pâlnia lui ${o.name}`} compact />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </BusinessShell>
  );
}
