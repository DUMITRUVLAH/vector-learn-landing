/**
 * CRM (Faza 1) — Pipeline: kanban de leaduri pe etapele CONFIGURATE ale workspace-ului.
 * Spec: `backlog/crm/CRM-CORE.md` §4-6 (state machine + layout + anatomia cardului + fișa lead).
 *
 * Desktop (≥lg): grilă de N coloane (N = etapele tenantului) cu drag & drop HTML5 nativ.
 * Mobil (<lg): aceleași secțiuni, listă simplă — fără drag, mutarea stadiului se face din
 * select-ul de sub fiecare card (e și alternativa de la tastatură pentru desktop).
 *
 * Etapele NU mai sunt un `const` fix de 5: vin din `GET /api/crm/leads/pipeline` (`stages`),
 * sunt personalizabile din „⚙ Etape" (`StageEditorDialog`), iar promptul de motiv-pierdere se
 * declanșează pe flag-ul `isLost` al etapei țintă, nu pe cheia literală „lost".
 *
 * Click pe cartonaș → `LeadDetailSheet` (fișa leadului). Închiderea fișei / editorului de etape
 * reîncarcă board-ul SILENȚIOS (`{ silent: true }`) — niciodată cu spinner-ul de pagină întreagă,
 * vezi `src/__tests__/crm/kanban-optimistic-move.test.ts` pentru motivul exact.
 *
 * DnD: id-ul leadului circulă prin `e.dataTransfer`, niciodată prin state — altfel handler-ul de
 * `drop` citește o valoare învechită (stale closure).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Phone, Mail, Loader2, AlertCircle, Users, Settings, Search, KanbanSquare, LayoutList, Download, Bell } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Button, Dialog, EmptyState, Input, Label, Select, Switch } from "@/components/ds";
import { cn } from "@/lib/utils";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import {
  getCrmPipeline,
  createCrmLead,
  moveCrmLeadStage,
  downloadCrmLeadsCsv,
  saveBlobAs,
  type CrmLead,
  type CrmLeadStage,
  type CrmLeadSource,
  type CrmStage,
  type CrmPipeline,
  type CrmSavedViewFilters,
  type CrmBoardFilters,
} from "@/lib/api/crm";
import { cleanCrmSegments, crmSegmentCount, type CrmSegmentFilters } from "@/lib/crm/segmentFilters";
import { CRM_DEFAULT_STAGES, CRM_SOURCE_LABEL, crmStageLabel, crmSourceLabel, stageColorClasses } from "@/components/crm/constants";
import { formatCents, formatCentsShort, leadValueToCents, leadCardLines } from "@/components/crm/format";
import { LostReasonDialog } from "@/components/crm/LostReasonDialog";
import { LeadDetailSheet } from "@/components/crm/LeadDetailSheet";
import { StageEditorDialog } from "@/components/crm/StageEditorDialog";
import { PipelineManagerDialog } from "@/components/crm/PipelineManagerDialog";
import { LeadListView } from "@/components/crm/LeadListView";
import { SavedViewsMenu } from "@/components/crm/SavedViewsMenu";
import { SegmentFilterBar } from "@/components/crm/SegmentFilterBar";
import { RemindersBell } from "@/components/crm/RemindersBell";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useCrmPermissions } from "@/hooks/useCrmPermissions";

type ToastState = { kind: "success" | "error"; message: string } | null;

/** Cheia preferinței de vizualizare — aceeași denumire ca în CRM-ul de referință. */
const VIEW_MODE_KEY = "crm_leads_view";

// ─── Pagina principală ─────────────────────────────────────────────────────────

export function CrmPipelinePage() {
  const { data: session } = useBusinessSession();
  const currentUserId = session?.user.id ?? null;

  const [grouped, setGrouped] = useState<Record<string, CrmLead[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [valueSums, setValueSums] = useState<Record<string, number>>({});
  const [stages, setStages] = useState<CrmStage[]>(CRM_DEFAULT_STAGES as CrmStage[]);
  /** Pâlniile workspace-ului + cea afișată. Tabla arată o singură pâlnie — amestecarea lor ar
   *  pune leadurile B2B peste cele de retail, pe coloane care nu le aparțin. */
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  /** Aceeași valoare, dar citibilă din `loadPipeline` fără s-o pună în dependențe: altfel fiecare
   *  răspuns al serverului ar schimba identitatea funcției și ar declanșa încă o încărcare. */
  const activePipelineRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** A apucat tabla să se încarce o dată? Prima cerere are voie la spinner, restul nu. */
  const loadedOnceRef = useRef(false);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);

  const [showAddLead, setShowAddLead] = useState(false);
  const [showStageEditor, setShowStageEditor] = useState(false);
  const [showPipelineManager, setShowPipelineManager] = useState(false);

  /** Kanban sau listă. Alegerea se ține în `localStorage`: e o preferință de lucru a omului, nu
   *  o stare a datelor — cine lucrează pe 3.000 de leaduri nu vrea să comute la fiecare intrare. */
  const [viewMode, setViewMode] = useState<"kanban" | "list">(() => {
    try {
      return localStorage.getItem(VIEW_MODE_KEY) === "list" ? "list" : "kanban";
    } catch {
      // Mod privat / stocare blocată: kanbanul rămâne implicit, ecranul funcționează la fel.
      return "kanban";
    }
  });
  /** Crește la fiecare schimbare de date venită din afara listei (fișă închisă, mutare). */
  const [listRefreshToken, setListRefreshToken] = useState(0);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [lostReasonFor, setLostReasonFor] = useState<{ leadId: string; toStage: string } | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  // ─── Filtre (client-side, peste ce a întors deja /pipeline — fără cereri noi) ───
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [onlyMine, setOnlyMine] = useState(false);

  /** Segmentarea (cerința 4) se aplică PE SERVER, în ambele vederi — spre deosebire de filtrele
   *  de mai sus, care cern cardurile deja aduse. Motivul: firmografia stă pe firma leadului, iar
   *  browserul n-are firmele. `segmentsRef` există pentru același motiv ca `activePipelineRef`:
   *  `loadPipeline` are lista de dependențe goală și ar citi altfel o valoare învechită. */
  const [segments, setSegments] = useState<CrmSegmentFilters>({});
  /** Filtrele CU CARE s-a cerut ultima dată tabla — citite de `loadPipeline`, care are lista de
   *  dependențe goală și ar vedea altfel valori învechite (aceeași capcană ca la pâlnie). */
  const boardFiltersRef = useRef<CrmBoardFilters>({});

  const loadPipeline = useCallback(async (opts?: { silent?: boolean; pipelineId?: string | null; filters?: CrmBoardFilters }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    setError(null);
    try {
      // `pipelineId` explicit bate state-ul: la comutarea din selector, `activePipelineId` încă
      // n-a apucat să se propage prin render (stale closure) — exact capcana de la drag & drop.
      const requested = opts && "pipelineId" in opts ? opts.pipelineId : activePipelineRef.current;
      const res = await getCrmPipeline(requested, opts?.filters ?? boardFiltersRef.current);
      // Lista își cere singură datele de la server; semnalul ăsta o face să se resincronizeze
      // după orice schimbare venită din altă parte (fișa leadului, mutare, lead nou).
      setListRefreshToken((t) => t + 1);
      setGrouped(res.grouped ?? {});
      setCounts(res.counts ?? {});
      setValueSums(res.valueSums ?? {});
      setPipelines(res.pipelines ?? []);
      if (res.pipelineId !== undefined) {
        activePipelineRef.current = res.pipelineId;
        setActivePipelineId(res.pipelineId);
      }
      const nextStages = res.stages && res.stages.length > 0 ? res.stages : (CRM_DEFAULT_STAGES as CrmStage[]);
      setStages([...nextStages].sort((a, b) => a.orderIndex - b.orderIndex));
    } catch (err) {
      // La reîncărcare silențioasă (după o mutare optimistă reușită), nu stricăm ecranul cu o
      // eroare — mutarea a mers deja pe server, board-ul local rămâne corect.
      if (!silent) setError(err instanceof Error ? err.message : "Eroare la încărcarea pipeline-ului.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  /** Căutarea nu pleacă la fiecare tastă: 300 ms de liniște, ca în vederea listă (CRM-139). */
  const debouncedSearch = useDebouncedValue(search, 300);

  /** Filtrele trimise SERVERULUI — aceleași pentru tablă și pentru listă. */
  const boardFilters: CrmBoardFilters = {
    ...segments,
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
    ...(sourceFilter !== "all" ? { source: sourceFilter } : {}),
    ...(onlyMine && currentUserId ? { assignedTo: currentUserId } : {}),
  };
  // Cheie stabilă: obiectul de mai sus e nou la fiecare render, iar ca dependență ar reîncărca
  // tabla la nesfârșit.
  const boardFiltersKey = JSON.stringify(boardFilters);

  useEffect(() => {
    const filters = JSON.parse(boardFiltersKey) as CrmBoardFilters;
    boardFiltersRef.current = filters;
    // Prima încărcare arată spinnerul; filtrările ulterioare o fac în tăcere — un spinner pe
    // toată pagina la fiecare literă tastată face bara de filtre imposibil de folosit.
    void loadPipeline({ silent: loadedOnceRef.current, filters });
    loadedOnceRef.current = true;
  }, [loadPipeline, boardFiltersKey]);

  const { members: teamMembers } = useTeamMembers();
  // Butoanele administrative apar doar pentru cine le poate folosi. Ascunderea e curtoazie:
  // apărarea e pe server (`requireCrmPermission`), nu aici.
  const { can } = useCrmPermissions();
  const canManagePipelines = can("pipelines.manage");
  const memberNames = Object.fromEntries(teamMembers.map((m) => [m.id, m.fullName]));

  /** Comutarea vederii, cu preferința salvată. Stocarea poate arunca (mod privat) — vederea se
   *  schimbă oricum, doar că nu se ține minte. */
  function switchView(next: "kanban" | "list") {
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      /* preferința nu se salvează; ecranul funcționează la fel */
    }
  }

  /** Filtrele afișate acum, în forma în care se salvează într-o vizualizare. */
  const currentFilters: CrmSavedViewFilters = {
    search: search.trim() || undefined,
    source: sourceFilter !== "all" ? sourceFilter : undefined,
    onlyMine: onlyMine || undefined,
    pipelineId: activePipelineId,
    view: viewMode,
    ...segments,
  };

  /** Aplicarea unei vizualizări salvate: filtrele, vederea ȘI pâlnia — altfel „B2B restante"
   *  ar aplica filtrele peste tabla greșită. */
  function applySavedView(filters: CrmSavedViewFilters) {
    setSearch(filters.search ?? "");
    setSourceFilter(filters.source ?? "all");
    setOnlyMine(filters.onlyMine ?? false);
    // Segmentul face parte din vizualizare: „Industria energetică, peste 500 MWh" redeschisă
    // fără segment ar arăta toată baza sub un nume care promite altceva.
    applySegments({
      productId: filters.productId ?? undefined,
      industry: filters.industry ?? undefined,
      region: filters.region ?? undefined,
      companySize: filters.companySize ?? undefined,
      minConsumptionKwh: filters.minConsumptionKwh ?? undefined,
      maxConsumptionKwh: filters.maxConsumptionKwh ?? undefined,
    });
    if (filters.view) switchView(filters.view);
    if (filters.pipelineId && filters.pipelineId !== activePipelineId) switchPipeline(filters.pipelineId);
  }

  /** Schimbarea segmentului: ref-ul întâi, apoi o reîncărcare SILENȚIOASĂ a tablei. Silențioasă
   *  fiindcă filtrarea e o mișcare de lucru, nu o intrare în ecran — un spinner pe toată pagina
   *  la fiecare bifă ar face bara de segmentare greu de folosit. Lista își cere singură pagina. */
  function applySegments(next: CrmSegmentFilters) {
    setSegments(cleanCrmSegments(next));
  }

  /** Exportul cere SERVERULUI leadurile care trec de filtrele de pe ecran — nu pagina afișată.
   *  Kanbanul cerne în browser peste 50 de carduri pe coloană; un export din ce s-a încărcat ar
   *  livra o felie tăcută din segment, care arată exact ca întregul. */
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      const res = await downloadCrmLeadsCsv({
        ...segments,
        ...(activePipelineId ? { pipelineId: activePipelineId } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(sourceFilter !== "all" ? { source: sourceFilter } : {}),
        ...(onlyMine && currentUserId ? { assignedTo: currentUserId } : {}),
      });
      saveBlobAs(res.blob, `leaduri-${new Date().toISOString().slice(0, 10)}.csv`);
      setToast({
        kind: "success",
        message: res.truncated
          ? `${res.count} leaduri exportate — plafonul unui fișier. Restrânge filtrul pentru restul.`
          : `${res.count} ${res.count === 1 ? "lead exportat" : "leaduri exportate"}.`,
      });
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Exportul a eșuat." });
    } finally {
      setExporting(false);
    }
  }

  /** Comutarea pâlniei: ref-ul întâi (îl citește `loadPipeline`), apoi cererea explicită. */
  function switchPipeline(id: string) {
    if (id === activePipelineId) return;
    activePipelineRef.current = id;
    setActivePipelineId(id);
    setSelectedLeadId(null);
    void loadPipeline({ pipelineId: id });
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const allLeads = Object.values(grouped).flat();

  /** Filtrele se aplică PE SERVER (vezi `boardFilters`): cardurile primite sunt deja rezultatul,
   *  iar numărătorile de pe coloane descriu exact ce s-a cerut. Vechea cernere în browser,
   *  peste cele 50 de carduri încărcate pe coloană, făcea o căutare după un client REAL să
   *  întoarcă „niciun rezultat" pe o bază mare — și dădea alte cifre decât vederea listă. */
  const hasActiveFilters =
    search.trim() !== "" || sourceFilter !== "all" || onlyMine || crmSegmentCount(segments) > 0;
  const hasSegments = crmSegmentCount(segments) > 0;

  /**
   * Mută leadul instant în state local (înainte de răspunsul serverului) și recalculează
   * count-urile + Σ valoare pe coloană. Întoarce un `revert()` pentru eșec.
   */
  function moveLeadLocal(leadId: string, toStage: CrmLeadStage) {
    const prevGrouped = grouped;
    const prevCounts = counts;
    const prevValueSums = valueSums;

    let moved: CrmLead | undefined;
    let fromStage: string | undefined;
    const nextGrouped: Record<string, CrmLead[]> = {};
    for (const [key, arr] of Object.entries(grouped)) {
      const idx = arr.findIndex((l) => l.id === leadId);
      if (idx >= 0) {
        moved = { ...arr[idx], stage: toStage };
        fromStage = key;
        nextGrouped[key] = [...arr.slice(0, idx), ...arr.slice(idx + 1)];
      } else {
        nextGrouped[key] = arr;
      }
    }
    if (moved) nextGrouped[toStage] = [moved, ...(nextGrouped[toStage] ?? [])];
    setGrouped(nextGrouped);

    if (moved && fromStage && fromStage !== toStage) {
      const from = fromStage;
      setCounts((c) => ({
        ...c,
        [from]: Math.max(0, (c[from] ?? 0) - 1),
        [toStage]: (c[toStage] ?? 0) + 1,
      }));
      const cents = moved.valueCents ?? 0;
      if (cents > 0) {
        setValueSums((v) => ({
          ...v,
          [from]: Math.max(0, (v[from] ?? 0) - cents),
          [toStage]: (v[toStage] ?? 0) + cents,
        }));
      }
    }

    return () => {
      setGrouped(prevGrouped);
      setCounts(prevCounts);
      setValueSums(prevValueSums);
    };
  }

  async function applyStageChange(leadId: string, toStage: CrmLeadStage, lostReason?: string) {
    const revert = moveLeadLocal(leadId, toStage);
    try {
      await moveCrmLeadStage(leadId, { stage: toStage, lostReason });
      setToast({ kind: "success", message: `Lead mutat la „${crmStageLabel(stages, toStage)}”.` });
      void loadPipeline({ silent: true });
    } catch (err) {
      revert();
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Nu am putut muta leadul.",
      });
    }
  }

  /** → o etapă `isLost` cere mereu motivul (verificat pe FLAG, nu pe cheia „lost" — o etapă
   *  redenumită sau custom marcată „pierdut" trebuie să ceară motivul la fel); restul
   *  tranzițiilor se aplică direct (orice → orice). */
  function requestStageChange(lead: CrmLead, toStage: CrmLeadStage) {
    if (toStage === lead.stage) return;
    const target = stages.find((s) => s.key === toStage);
    if (target?.isLost) {
      setLostReasonFor({ leadId: lead.id, toStage });
      return;
    }
    void applyStageChange(lead.id, toStage);
  }

  function handleColumnDrop(e: React.DragEvent<HTMLDivElement>, stageKey: CrmLeadStage) {
    e.preventDefault();
    setHoverStage(null);
    // Id-ul vine din dataTransfer, NU din `draggedId` — evită capcana stale-closure.
    const leadId = e.dataTransfer.getData("text/plain");
    setDraggedId(null);
    if (!leadId) return;
    const lead = allLeads.find((l) => l.id === leadId);
    if (!lead) return;
    requestStageChange(lead, stageKey);
  }

  // Numerele din antet vin din contoarele SERVERULUI, nu din cardurile încărcate: `grouped` e
  // plafonat la 50/coloană (500 în total), deci un workspace cu 3.200 de leaduri își vedea
  // pipeline-ul descris ca „500 leaduri". Acum antetul descrie exact ce trece de filtre.
  const wonKeys = new Set(stages.filter((s) => s.isWon).map((s) => s.key));
  const totalLeads = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const wonCount = Object.entries(counts).reduce((sum, [key, n]) => (wonKeys.has(key) ? sum + n : sum), 0);
  const conversionRate = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;

  /**
   * Forecastul ponderat: suma valorilor, fiecare înmulțită cu probabilitatea ETAPEI în care stă
   * leadul. Etapele „pierdut" ies din calcul, iar cele „câștigat" intră cu 100%.
   *
   * De ce nu suma brută a pâlniei: aia spune „am 680.000 în discuție", ceea ce nu e o prognoză, ci
   * o listă de dorințe. Ponderarea pe probabilitate e cifra pe care un director o poate pune
   * într-un buget — și e calculată din configurația reală a etapelor, nu dintr-un procent inventat.
   */
  const weightedForecast = stages.reduce((sum, stage) => {
    if (stage.isLost) return sum;
    const value = valueSums[stage.key] ?? 0;
    const probability = stage.isWon ? 100 : stage.probabilityPct ?? 0;
    return sum + (value * probability) / 100;
  }, 0);

  return (
    <BusinessShell
      pageTitle="Pipeline"
      pageDescription={`Forecast ponderat: ${formatCents(Math.round(weightedForecast))} · ${totalLeads} lead${
        totalLeads === 1 ? "" : "uri"
      } · conversie ${conversionRate}%`}
      actions={
        <>
          <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Mod de vizualizare">
            <button
              type="button"
              onClick={() => switchView("kanban")}
              aria-pressed={viewMode === "kanban"}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                viewMode === "kanban" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
              )}
            >
              <KanbanSquare className="h-4 w-4" aria-hidden="true" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => switchView("list")}
              aria-pressed={viewMode === "list"}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                viewMode === "list" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
              )}
            >
              <LayoutList className="h-4 w-4" aria-hidden="true" />
              Listă
            </button>
          </div>
          {/* Clopoțelul stă lângă acțiunile tablei, nu în shell: e despre taskurile CRM, nu
              despre notificările platformei (acelea au clopoțelul lor în bara de sus). */}
          <RemindersBell
            ownerId={currentUserId}
            onOpenLead={setSelectedLeadId}
            onToast={setToast}
            refreshToken={listRefreshToken}
          />
          {/* Butonul „Pâlnii" a plecat: pastilele de deasupra tablei fac același lucru, vizibil.
              „Etape" rămâne — configurarea coloanelor e altă treabă decât alegerea pâlniei. */}
          {canManagePipelines && (
            <Button variant="outline" onClick={() => setShowStageEditor(true)}>
              <Settings className="h-4 w-4" aria-hidden="true" />
              Etape
            </Button>
          )}
          <Button onClick={() => setShowAddLead(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adaugă lead
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă pipeline-ul..." />
        </div>
      ) : error ? (
        <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
          <div className="flex flex-col gap-2">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={() => void loadPipeline()} className="w-fit">
              Reîncearcă
            </Button>
          </div>
        </Alert>
      ) : totalLeads === 0 && !hasActiveFilters && !hasSegments && viewMode === "kanban" ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Niciun lead încă"
          description="Adaugă primul lead pentru a porni pipeline-ul de vânzări."
          action={
            <Button onClick={() => setShowAddLead(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adaugă lead
            </Button>
          }
        />
      ) : (
        <>
          {/* Pâlniile, ca pastile. Erau un `<select>` ascuns printre butoanele din colțul din
              dreapta: nimeni nu-l vedea, deci pâlniile construite rămâneau nefolosite. Aici se
              vede din prima câte linii de business ai și în care ești. */}
          {pipelines.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Pâlnii">
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => switchPipeline(p.id)}
                  aria-pressed={p.id === activePipelineId}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                    p.id === activePipelineId
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  )}
                >
                  {p.name}
                </button>
              ))}
              {canManagePipelines && (
                <button
                  type="button"
                  onClick={() => setShowPipelineManager(true)}
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Pâlnie nouă
                </button>
              )}
            </div>
          )}

          {/* Bara de filtre — se aplică PE SERVER, în ambele vederi. */}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="sm:w-72">
              <Label htmlFor="crm-filter-search" className="sr-only">
                Caută leaduri
              </Label>
              <Input
                id="crm-filter-search"
                icon={<Search className="h-4 w-4" aria-hidden="true" />}
                placeholder="Caută nume, telefon, email, companie..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="sm:w-48">
              <Label htmlFor="crm-filter-source" className="sr-only">
                Filtrează după sursă
              </Label>
              <Select id="crm-filter-source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="all">Toate sursele</option>
                {Object.entries(CRM_SOURCE_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            {currentUserId && (
              <label className="inline-flex h-10 items-center gap-2 text-sm font-medium text-foreground max-sm:h-11">
                <Switch checked={onlyMine} onChange={setOnlyMine} aria-label="Arată doar leadurile mele" />
                Doar ale mele
              </label>
            )}
            <div className="flex items-center gap-2 sm:ml-auto">
              {can("leads.export") && (
                <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                  )}
                  Exportă CSV
                </Button>
              )}
              <SavedViewsMenu currentFilters={currentFilters} onApply={applySavedView} onToast={setToast} />
            </div>
          </div>

          {/* Segmentarea firmografică — spre deosebire de bara de mai sus, întreabă serverul. */}
          <div className="mb-4">
            <SegmentFilterBar value={segments} onChange={applySegments} />
          </div>

          {viewMode === "list" ? (
            <LeadListView
              pipelineId={activePipelineId}
              stages={stages}
              search={search}
              source={sourceFilter}
              assignedTo={onlyMine ? currentUserId : null}
              segments={segments}
              memberNames={memberNames}
              members={teamMembers.map((m) => ({ id: m.id, fullName: m.fullName }))}
              canBulkEdit={can("leads.edit")}
              onToast={setToast}
              onBulkDone={() => void loadPipeline({ silent: true })}
              onOpenLead={setSelectedLeadId}
              refreshToken={listRefreshToken}
            />
          ) : (
           <>
          {/* Desktop ≥lg: grilă de N coloane cu drag & drop */}
          <div
            className="hidden gap-4 lg:grid"
            style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(220px, 1fr))` }}
          >
            {stages.map((stage) => {
              const columnLeads = grouped[stage.key] ?? [];
              // Contorul și suma vin de la server și acoperă TOT ce trece de filtre, nu doar
              // cardurile aduse (`grouped` rămâne plafonat la 50/coloană, pentru afișare).
              const columnCount = counts[stage.key] ?? 0;
              const columnValueSum = valueSums[stage.key] ?? 0;
              const isHover = hoverStage === stage.key && draggedId !== null;
              return (
                <div
                  key={stage.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setHoverStage(stage.key);
                  }}
                  onDragLeave={() => setHoverStage(null)}
                  onDrop={(e) => handleColumnDrop(e, stage.key)}
                  className={cn(
                    // Fără cutie gri: cartonașele albe se citesc pe fundalul paginii, iar coloana
                    // se desenează singură prin aliniere. Cutia apare DOAR când tragi un card —
                    // atunci chiar ai nevoie să vezi unde îl lași.
                    "flex flex-col gap-2 rounded-2xl px-1.5 pb-3 transition-colors",
                    isHover && "bg-primary/[0.07] ring-1 ring-inset ring-primary/30"
                  )}
                  aria-label={`Coloana ${stage.label}`}
                >
                  <StageHeader stage={stage} count={columnCount} valueSum={columnValueSum} />
                  <div className="flex min-h-[96px] flex-col gap-2">
                    {columnLeads.length === 0 ? (
                      <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border/80 text-xs text-muted-foreground">
                        {hasActiveFilters ? "Niciun rezultat" : "Trage aici"}
                      </div>
                    ) : (
                      columnLeads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          isDragging={draggedId === lead.id}
                          onDragStart={() => setDraggedId(lead.id)}
                          onDragEnd={() => {
                            setDraggedId(null);
                            setHoverStage(null);
                          }}
                          onChangeStage={(next) => requestStageChange(lead, next)}
                          onOpen={() => setSelectedLeadId(lead.id)}
                          stages={stages}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobil (<lg): aceleași secțiuni, fără drag — mutarea vine din select. */}
          <div className="flex flex-col gap-4 lg:hidden">
            {stages.map((stage) => {
              const columnLeads = grouped[stage.key] ?? [];
              const columnCount = counts[stage.key] ?? 0;
              const columnValueSum = valueSums[stage.key] ?? 0;
              return (
                <div key={stage.key} className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-muted/25 p-3">
                  <StageHeader stage={stage} count={columnCount} valueSum={columnValueSum} />
                  {columnLeads.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      {hasActiveFilters ? "Niciun rezultat în acest stadiu." : "Niciun lead în acest stadiu."}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {columnLeads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          isDragging={false}
                          onDragStart={() => {}}
                          onDragEnd={() => {}}
                          onChangeStage={(next) => requestStageChange(lead, next)}
                          onOpen={() => setSelectedLeadId(lead.id)}
                          stages={stages}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
           </>
          )}
        </>
      )}

      <AddLeadDialog
        open={showAddLead}
        pipelineId={activePipelineId}
        onClose={() => setShowAddLead(false)}
        onCreated={() => {
          setShowAddLead(false);
          setToast({ kind: "success", message: "Lead adăugat în pipeline." });
          void loadPipeline();
        }}
      />

      <LostReasonDialog
        open={lostReasonFor !== null}
        onCancel={() => setLostReasonFor(null)}
        onConfirm={(reason) => {
          const target = lostReasonFor;
          setLostReasonFor(null);
          if (target) void applyStageChange(target.leadId, target.toStage, reason);
        }}
      />

      <LeadDetailSheet
        leadId={selectedLeadId}
        stages={stages}
        onClose={() => {
          setSelectedLeadId(null);
          // Fișa poate fi închisă după modificări (etapă/detalii) — board-ul se resincronizează
          // silențios, niciodată cu spinner-ul de pagină întreagă.
          void loadPipeline({ silent: true });
        }}
        onChanged={() => void loadPipeline({ silent: true })}
        onToast={setToast}
        onOpenLead={setSelectedLeadId}
      />

      <PipelineManagerDialog
        open={showPipelineManager}
        pipelines={pipelines}
        onClose={() => setShowPipelineManager(false)}
        onChanged={(opts) => {
          // Pâlnia ștearsă nu mai poate fi cea afișată — cădem pe implicită, altfel tabla ar cere
          // serverului un id care nu mai există (404) și ecranul ar rămâne pe eroare.
          if (opts?.removedId && opts.removedId === activePipelineId) {
            activePipelineRef.current = null;
            setActivePipelineId(null);
            void loadPipeline({ pipelineId: null, silent: true });
            return;
          }
          if (opts?.selectId) {
            switchPipeline(opts.selectId);
            return;
          }
          void loadPipeline({ silent: true });
        }}
        onToast={setToast}
      />

      <StageEditorDialog
        open={showStageEditor}
        stages={stages}
        pipelineId={activePipelineId}
        onClose={() => setShowStageEditor(false)}
        onChanged={() => void loadPipeline({ silent: true })}
        onToast={setToast}
      />

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg animate-fade-in",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}
    </BusinessShell>
  );
}

// ─── Antetul de coloană ─────────────────────────────────────────────────────────

/**
 * Culoarea etapei a rămas, blocul pastel plin a plecat.
 *
 * Cinci dreptunghiuri colorate una lângă alta trăgeau ochiul PESTE carduri — adică peste munca
 * propriu-zisă — și făceau tabla să arate a șablon, nu a instrument. Acum culoarea etapei e un
 * punct și o linie subțire sub antet: se recunoaște coloana din colțul ochiului, dar atenția
 * rămâne pe cartonașe. Antetul e lipicios, ca să știi pe ce coloană ești și după ce derulezi.
 */
function StageHeader({ stage, count, valueSum }: { stage: CrmStage; count: number; valueSum: number }) {
  const { bg, fg } = stageColorClasses(stage.color);
  // Lipicios doar pe desktop: pe telefon secțiunile sunt una sub alta, iar un antet agățat de
  // marginea de sus ar pluti peste cardurile altei etape.
  return (
    <div className="pb-2.5 pt-1 lg:sticky lg:top-0 lg:z-10 lg:bg-background/85 lg:backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 shrink-0 rounded-full bg-current", fg)} aria-hidden="true" />
        <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">{stage.label}</p>
        <span className="ml-auto shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
        {valueSum > 0 ? formatCentsShort(valueSum) : "—"}
      </p>
      <div className={cn("mt-2 h-[3px] w-full rounded-full", bg)} aria-hidden="true" />
    </div>
  );
}

// ─── Cardul de lead (desktop draggable + select de stadiu pt. mobil/tastatură) ──

function LeadCard({
  lead,
  isDragging,
  onDragStart,
  onDragEnd,
  onChangeStage,
  onOpen,
  stages,
}: {
  lead: CrmLead;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onChangeStage: (stage: CrmLeadStage) => void;
  onOpen: () => void;
  stages: readonly CrmStage[];
}) {
  const { title, subtitle } = leadCardLines(lead);
  const task = lead.nextTask ?? null;
  const dueAt = task?.dueAt ? new Date(task.dueAt) : null;
  // „Restant" = scadența a trecut. Nu e o nuanță de stil: e singurul semnal de pe tablă care
  // spune unde se pierde o vânzare chiar acum.
  const overdue = dueAt !== null && dueAt.getTime() < Date.now();
  return (
    <div
      draggable
      data-overdue={overdue ? "true" : undefined}
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", lead.id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative cursor-grab rounded-xl border border-border/70 bg-card p-3 active:cursor-grabbing",
        "transition-[border-color,box-shadow] duration-150 hover:border-foreground/20 hover:shadow-[0_6px_20px_-12px_hsl(222_47%_11%/0.45)]",
        isDragging && "opacity-40"
      )}
    >
      {/* Restanța: o dungă subțire ÎN interiorul cardului, nu o bordură de 4px care împinge tot
          textul la dreapta și taie colțurile rotunjite. Se vede la fel de bine din capătul
          celălalt al ecranului, dar nu deformează cartonașul. */}
      {overdue && (
        <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-destructive" aria-hidden="true" />
      )}
      {/* Buton real (nu doar onClick pe div-ul draggable) — tastatură + cititor de ecran, și nu
          intră în conflict cu select-ul de stadiu de mai jos, care rămâne un element FRATE, nu
          copil al butonului (un `<select>` în interiorul unui `<button>` ar fi HTML invalid). */}
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Deschide lead ${title}`}
      >
        {/* Un singur rând tare: CE vinzi, plus cât face. Suma stă pe aceeași linie cu titlul —
            coloana de bani se citește vertical, fără să sari peste trei rânduri de card. */}
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-foreground line-clamp-2">
            {title}
          </p>
          {lead.valueCents > 0 && (
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
              {formatCentsShort(lead.valueCents)}
            </span>
          )}
        </div>
        {/* Firma: gri, nu albastru. Albastrul e culoarea acțiunilor din aplicație; pus pe fiecare
            card, tabla arăta a listă de linkuri și nu mai spunea nimic despre ce e apăsabil. */}
        {subtitle && <p className="mt-1 truncate text-[11.5px] text-muted-foreground">{subtitle}</p>}
        {task && (
          <p
            className={cn(
              "mt-2.5 flex items-center gap-1.5 text-[11px]",
              overdue ? "font-semibold text-destructive" : "text-muted-foreground"
            )}
          >
            <Bell className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{task.title}</span>
            {dueAt && (
              <span className="ml-auto shrink-0 tabular-nums">
                {dueAt.toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit" })}
              </span>
            )}
          </p>
        )}
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/60 pt-2 text-[10.5px] text-muted-foreground">
          <span className="truncate">{crmSourceLabel(lead.source)}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {new Date(lead.createdAt).toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit", year: "2-digit" })}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-muted-foreground/70">
            {lead.phone && <Phone className="h-3 w-3" aria-label="Are telefon" />}
            {lead.email && <Mail className="h-3 w-3" aria-label="Are email" />}
          </span>
        </div>
      </button>
      {/* Mutarea din select rămâne calea de la tastatură și singura de pe telefon (unde nu există
          drag). Pe desktop nu mai ține loc în pagină: stă ABSOLUT peste subsolul cardului și apare
          la hover sau la focus. Înainte era doar transparent — adică fiecare cartonaș purta o
          casetă de formular invizibilă de 40px, iar cardurile arătau pe jumătate goale. */}
      <div
        className={cn(
          "mt-2 lg:absolute lg:inset-x-2 lg:bottom-2 lg:mt-0 lg:rounded-lg lg:bg-card lg:opacity-0 lg:transition-opacity",
          "lg:pointer-events-none lg:group-hover:pointer-events-auto lg:group-hover:opacity-100",
          "lg:group-focus-within:pointer-events-auto lg:group-focus-within:opacity-100"
        )}
      >
        <Label htmlFor={`crm-stage-${lead.id}`} className="sr-only">
          Mutare stadiu pentru {title}
        </Label>
        <Select
          id={`crm-stage-${lead.id}`}
          className="lg:[&>select]:h-8 lg:[&>select]:text-xs"
          value={lead.stage}
          onChange={(e) => onChangeStage(e.target.value)}
        >
          {stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

// ─── Dialog „Adaugă lead" ──────────────────────────────────────────────────────

function AddLeadDialog({
  open,
  pipelineId,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** Leadul se naște în pâlnia AFIȘATĂ, nu în implicită — altfel ar dispărea din tabla curentă. */
  pipelineId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [interest, setInterest] = useState("");
  const [source, setSource] = useState("manual");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Formular curat de fiecare dată când dialogul (re)se deschide.
  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setEmail("");
    setCompany("");
    setInterest("");
    setSource("manual");
    setValue("");
    setFormError(null);
  }, [open]);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      await createCrmLead({
        fullName: name.trim(),
        ...(pipelineId ? { pipelineId } : {}),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        company: company.trim() || undefined,
        interestCourse: interest.trim() || undefined,
        source: source as CrmLeadSource,
        valueCents: value.trim() ? leadValueToCents(value) : undefined,
      });
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Nu am putut salva leadul.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adaugă lead"
      description="Doar numele e obligatoriu — restul se completează pe parcurs."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Renunță
          </Button>
          <Button onClick={() => void submit()} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {formError && <Alert variant="destructive">{formError}</Alert>}
        <div className="flex flex-col gap-1">
          <Label htmlFor="crm-lead-name" required>
            Nume
          </Label>
          <Input id="crm-lead-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-phone">Telefon</Label>
            <Input id="crm-lead-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-email">Email</Label>
            <Input id="crm-lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-company">Companie</Label>
            <Input id="crm-lead-company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-interest">Curs / interes</Label>
            <Input id="crm-lead-interest" value={interest} onChange={(e) => setInterest(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-source">Sursă</Label>
            <Select id="crm-lead-source" value={source} onChange={(e) => setSource(e.target.value)}>
              {Object.entries(CRM_SOURCE_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lead-value">Valoare (MDL)</Label>
            <Input
              id="crm-lead-value"
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="ex: 1500"
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
