/**
 * CRM — „Repartizare": lotul de contacte împărțit între agenți.
 *
 * Ecranul răspunde la o singură întrebare de manager: *din lista pe care tocmai am importat-o,
 * cine ce primește?* Până acum răspunsul cerea bifarea a câte 100 de cartonașe pe rând, în tabla
 * kanban — pe o listă de 3.000 de firme, adică niciodată.
 *
 * Ordinea de pe ecran urmează ordinea în care gândește omul:
 *   1. **din ce** — pâlnia și segmentul (inclusiv coloanele importate din Excel);
 *   2. **cât e** — numărul de contacte disponibile, la vedere, înainte de orice decizie;
 *   3. **cui, câte** — un câmp per agent;
 *   4. **ce se va întâmpla** — previzualizarea, cu ce NU se poate da;
 *   5. abia apoi butonul.
 *
 * Regula pe care se sprijină tot ecranul e aceeași ca la import: numărul de pe buton vine de la
 * server, din ACEEAȘI funcție care face și repartizarea. Nu se calculează nimic în browser —
 * altfel butonul ar putea promite 200 și serverul ar scrie 137.
 *
 * „Restul rămân reci" nu e o etapă inventată: e starea „fără responsabil". Rezerva se vede sus,
 * ca stoc, fiindcă din ea trăiește echipa.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Send, Users, AlertTriangle, CheckCircle2, Snowflake } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Badge, Button, Card, Checkbox, Input, Label, Select } from "@/components/ds";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { SegmentFilterBar } from "@/components/crm/SegmentFilterBar";
import { crmSegmentParams, type CrmSegmentFilters } from "@/lib/crm/segmentFilters";
import { listCrmPipelines, getCrmStages, type CrmPipeline, type CrmStage } from "@/lib/api/crm";
import {
  previewCrmDistribution,
  runCrmDistribution,
  type DistributionPlanResponse,
  type DistributionRequest,
} from "@/lib/api/crmDistribution";

/** Rolurile care nu sună clienți — nu au ce căuta în lista de repartizare. */
const NON_SALES_ROLES = new Set(["student", "parent"]);

function errText(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function CrmDistributionPage() {
  const { members, loading: loadingMembers } = useTeamMembers();

  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [stage, setStage] = useState<string>("all");
  const [segments, setSegments] = useState<CrmSegmentFilters>({});
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);

  /** Câte contacte îi dăm fiecărui agent (id → text, ca un câmp gol să nu devină 0). */
  const [counts, setCounts] = useState<Record<string, string>>({});

  const [plan, setPlan] = useState<DistributionPlanResponse | null>(null);
  const [done, setDone] = useState<DistributionPlanResponse | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  /** Numărătoarea de fundal a contactelor disponibile. Ține DOAR cifra din capul paginii —
   *  n-are voie să blocheze butoanele: altfel, cine tastează repede apasă „Vezi ce se va
   *  întâmpla" pe un buton dezactivat și crede că ecranul e stricat. */
  const [counting, setCounting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCrmPipelines()
      .then((res) => {
        setPipelines(res.items);
        const def = res.items.find((p) => p.isDefault) ?? res.items[0];
        if (def) setPipelineId(def.id);
      })
      .catch(() => setPipelines([]));
  }, []);

  useEffect(() => {
    if (!pipelineId) return;
    getCrmStages(pipelineId)
      .then((res) => setStages(res.items ?? []))
      .catch(() => setStages([]));
    // Etapa aleasă aparține unei pâlnii; la schimbarea ei, cheia veche n-ar mai exista nicăieri.
    setStage("all");
  }, [pipelineId]);

  const salesMembers = useMemo(
    () => members.filter((m) => !NON_SALES_ROLES.has(m.role)),
    [members]
  );

  const allocations = useMemo(
    () =>
      salesMembers
        .map((m) => ({ userId: m.id, count: Number.parseInt(counts[m.id] ?? "", 10) }))
        .filter((a) => Number.isFinite(a.count) && a.count > 0),
    [salesMembers, counts]
  );

  const totalRequested = allocations.reduce((sum, a) => sum + a.count, 0);

  /**
   * Filtrul curent, serializat. E cheia de care atârnă tot ce se reîncarcă — și e o VALOARE, nu
   * o funcție: dacă efectul ar depinde de un `useCallback`, orice re-randare care schimbă
   * identitatea listei de colegi ar șterge previzualizarea de sub degetul omului, fără ca ceva
   * să se fi schimbat cu adevărat.
   */
  const filterKey = useMemo(
    () =>
      JSON.stringify({
        pipelineId: pipelineId || null,
        stage: stage === "all" ? null : stage,
        onlyUnassigned,
        filters: crmSegmentParams(segments),
      }),
    [pipelineId, stage, onlyUnassigned, segments]
  );

  const probeMemberId = salesMembers[0]?.id ?? null;

  const request = useCallback(
    (): DistributionRequest => ({ ...(JSON.parse(filterKey) as DistributionRequest), allocations }),
    [filterKey, allocations]
  );

  /**
   * Câte contacte sunt disponibile ACUM, cu filtrul curent. Se cere cu o alocare simbolică de 1:
   * `available` e același număr indiferent cât se cere, iar așa nu ne trebuie o a doua rută care
   * ar putea răspunde altceva decât repartizarea.
   */
  const refreshAvailable = useCallback(async () => {
    if (!probeMemberId) return;
    setCounting(true);
    setError(null);
    try {
      const res = await previewCrmDistribution({
        ...(JSON.parse(filterKey) as DistributionRequest),
        allocations: [{ userId: probeMemberId, count: 1 }],
      });
      setAvailable(res.available);
    } catch (err) {
      setError(errText(err, "Nu am putut număra contactele disponibile."));
      setAvailable(null);
    } finally {
      setCounting(false);
    }
  }, [filterKey, probeMemberId]);

  useEffect(() => {
    void refreshAvailable();
    // Orice schimbare de filtru invalidează previzualizarea: un plan vechi peste un segment nou
    // ar fi exact tipul de număr în care omul are încredere pe nedrept.
    setPlan(null);
    setDone(null);
  }, [refreshAvailable]);

  async function doPreview() {
    setLoading(true);
    setError(null);
    setDone(null);
    try {
      setPlan(await previewCrmDistribution(request()));
    } catch (err) {
      setError(errText(err, "Previzualizarea a eșuat."));
    } finally {
      setLoading(false);
    }
  }

  async function doRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await runCrmDistribution(request());
      setDone(res);
      setPlan(null);
      setCounts({});
      await refreshAvailable();
    } catch (err) {
      setError(errText(err, "Repartizarea a eșuat."));
    } finally {
      setRunning(false);
    }
  }

  return (
    <BusinessShell
      pageTitle="Repartizare"
      pageDescription="Împarte contactele între agenți: alegi segmentul, spui câte primește fiecare, restul rămân în rezervă."
    >
      <div className="space-y-6">
        {error && <Alert variant="destructive">{error}</Alert>}

        {/* 1. Din ce se ia */}
        <Card className="space-y-4 p-4">
          <h2 className="text-lg font-semibold">Din ce se ia</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="dist-pipeline">Pâlnia</Label>
              <Select id="dist-pipeline" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="dist-stage">Etapa</Label>
              <Select id="dist-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
                <option value="all">Orice etapă deschisă</option>
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <SegmentFilterBar value={segments} onChange={setSegments} />

          <Checkbox
            checked={onlyUnassigned}
            onChange={setOnlyUnassigned}
            id="dist-only-unassigned"
            label={
              <span className="text-sm">
                Doar contactele fără responsabil
                <span className="ml-1 text-muted-foreground">
                  (debifat, se redistribuie și cele deja atribuite — de exemplu când pleacă un om din echipă)
                </span>
              </span>
            }
          />
        </Card>

        {/* 2. Cât e */}
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <Snowflake className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm text-muted-foreground">Contacte disponibile cu filtrul curent</p>
            <p className="text-2xl font-bold tabular-nums">
              {counting && available === null ? "…" : (available ?? 0).toLocaleString("ro-MD")}
            </p>
          </div>
          {totalRequested > 0 && (
            <Badge variant={available !== null && totalRequested > available ? "destructive" : "secondary"}>
              cerute: {totalRequested.toLocaleString("ro-MD")}
            </Badge>
          )}
        </Card>

        {/* 3. Cui, câte */}
        <Card className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Cui, câte</h2>
          </div>

          {loadingMembers ? (
            <p className="text-sm text-muted-foreground">Se încarcă echipa…</p>
          ) : salesMembers.length === 0 ? (
            <Alert>Workspace-ul n-are încă agenți de vânzări.</Alert>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {salesMembers.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.fullName || m.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <Input
                    className="w-24"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`Câte contacte primește ${m.fullName || m.email}`}
                    value={counts[m.id] ?? ""}
                    onChange={(e) => setCounts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    placeholder="0"
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void doPreview()} disabled={allocations.length === 0 || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Vezi ce se va întâmpla
            </Button>
            {salesMembers.length > 1 && !counting && available !== null && available > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  // Împărțire egală: restul de la împărțire merge la primii agenți, ca suma să
                  // fie exact cea disponibilă, nu „aproximativ".
                  const each = Math.floor(available / salesMembers.length);
                  let rest = available - each * salesMembers.length;
                  const next: Record<string, string> = {};
                  for (const m of salesMembers) {
                    const extra = rest > 0 ? 1 : 0;
                    rest -= extra;
                    next[m.id] = String(each + extra);
                  }
                  setCounts(next);
                }}
              >
                Împarte egal tot
              </Button>
            )}
          </div>
        </Card>

        {/* 4. Ce se va întâmpla */}
        {plan && (
          <Card className="space-y-3 p-4">
            <h2 className="text-lg font-semibold">Ce se va întâmpla</h2>
            <ul className="space-y-1 text-sm">
              {plan.allocations.map((a) => (
                <li key={a.userId} className="flex justify-between gap-3">
                  <span>{a.name}</span>
                  <span className="tabular-nums">
                    {a.given} {a.given !== a.requested && <span className="text-destructive">(din {a.requested})</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Rămân în rezervă: <strong className="tabular-nums">{plan.remaining}</strong>
            </p>
            {plan.shortfall > 0 && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {plan.shortfall} din contactele cerute n-au de unde veni — segmentul are doar {plan.available}.
              </Alert>
            )}
            <Button onClick={() => void doRun()} disabled={running}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              Repartizează {plan.allocations.reduce((s, a) => s + a.given, 0)} contacte
            </Button>
          </Card>
        )}

        {/* 5. Ce s-a întâmplat */}
        {done && (
          <Card className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold">Repartizat</h2>
            </div>
            <ul className="space-y-1 text-sm">
              {done.allocations.map((a) => (
                <li key={a.userId} className="flex justify-between gap-3">
                  <span>{a.name}</span>
                  <span className="tabular-nums">{a.given}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Au rămas în rezervă: <strong className="tabular-nums">{done.remaining}</strong>
            </p>
          </Card>
        )}
      </div>
    </BusinessShell>
  );
}
