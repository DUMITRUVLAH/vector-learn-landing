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
import { Plus, Phone, Mail, Loader2, AlertCircle, Users, Settings, Search, GitBranch, KanbanSquare, LayoutList } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Button, Dialog, EmptyState, Input, Label, Select, Switch } from "@/components/ds";
import { cn } from "@/lib/utils";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import {
  getCrmPipeline,
  createCrmLead,
  moveCrmLeadStage,
  type CrmLead,
  type CrmLeadStage,
  type CrmLeadSource,
  type CrmStage,
  type CrmPipeline,
  type CrmSavedViewFilters,
} from "@/lib/api/crm";
import { CRM_DEFAULT_STAGES, CRM_SOURCE_LABEL, crmStageLabel, crmSourceLabel, stageColorClasses } from "@/components/crm/constants";
import { formatCents, leadValueToCents, leadTitle } from "@/components/crm/format";
import { LostReasonDialog } from "@/components/crm/LostReasonDialog";
import { LeadDetailSheet } from "@/components/crm/LeadDetailSheet";
import { StageEditorDialog } from "@/components/crm/StageEditorDialog";
import { PipelineManagerDialog } from "@/components/crm/PipelineManagerDialog";
import { LeadListView } from "@/components/crm/LeadListView";
import { SavedViewsMenu } from "@/components/crm/SavedViewsMenu";
import { RemindersBell } from "@/components/crm/RemindersBell";
import { useTeamMembers } from "@/hooks/useTeamMembers";

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

  const loadPipeline = useCallback(async (opts?: { silent?: boolean; pipelineId?: string | null }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    setError(null);
    try {
      // `pipelineId` explicit bate state-ul: la comutarea din selector, `activePipelineId` încă
      // n-a apucat să se propage prin render (stale closure) — exact capcana de la drag & drop.
      const requested = opts && "pipelineId" in opts ? opts.pipelineId : activePipelineRef.current;
      const res = await getCrmPipeline(requested);
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

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline]);

  const { members: teamMembers } = useTeamMembers();
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
  };

  /** Aplicarea unei vizualizări salvate: filtrele, vederea ȘI pâlnia — altfel „B2B restante"
   *  ar aplica filtrele peste tabla greșită. */
  function applySavedView(filters: CrmSavedViewFilters) {
    setSearch(filters.search ?? "");
    setSourceFilter(filters.source ?? "all");
    setOnlyMine(filters.onlyMine ?? false);
    if (filters.view) switchView(filters.view);
    if (filters.pipelineId && filters.pipelineId !== activePipelineId) switchPipeline(filters.pipelineId);
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

  function matchesFilters(lead: CrmLead): boolean {
    if (onlyMine && currentUserId && lead.assignedTo !== currentUserId) return false;
    if (sourceFilter !== "all" && lead.source !== sourceFilter) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const haystack = [lead.fullName, lead.dealName, lead.phone, lead.email, lead.company]
        .filter((v): v is string => Boolean(v))
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }
  const hasActiveFilters = search.trim() !== "" || sourceFilter !== "all" || onlyMine;

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

  const totalLeads = allLeads.length;
  const wonKeys = new Set(stages.filter((s) => s.isWon).map((s) => s.key));
  const wonCount = allLeads.filter((l) => wonKeys.has(l.stage)).length;
  const conversionRate = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;

  return (
    <BusinessShell
      pageTitle="Pipeline"
      pageDescription={`${totalLeads} lead${totalLeads === 1 ? "" : "uri"} · conversie ${conversionRate}%`}
      actions={
        <>
          {/* Selectorul apare doar când chiar EXISTĂ mai multe pâlnii: un workspace cu una
              singură n-are ce alege, iar un select cu o opțiune e doar zgomot. */}
          {pipelines.length > 1 && (
            <>
              <Label htmlFor="crm-pipeline-select" className="sr-only">
                Pâlnie
              </Label>
              <Select
                id="crm-pipeline-select"
                value={activePipelineId ?? ""}
                onChange={(e) => switchPipeline(e.target.value)}
                className="w-[180px]"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </>
          )}
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
          <Button variant="outline" onClick={() => setShowPipelineManager(true)}>
            <GitBranch className="h-4 w-4" aria-hidden="true" />
            Pâlnii
          </Button>
          <Button variant="outline" onClick={() => setShowStageEditor(true)}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            Etape
          </Button>
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
      ) : totalLeads === 0 && !hasActiveFilters && viewMode === "kanban" ? (
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
          {/* Bara de filtre — client-side, peste datele deja încărcate din /pipeline. */}
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
            <div className="sm:ml-auto">
              <SavedViewsMenu currentFilters={currentFilters} onApply={applySavedView} onToast={setToast} />
            </div>
          </div>

          {viewMode === "list" ? (
            <LeadListView
              pipelineId={activePipelineId}
              stages={stages}
              search={search}
              source={sourceFilter}
              assignedTo={onlyMine ? currentUserId : null}
              memberNames={memberNames}
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
              const columnLeads = (grouped[stage.key] ?? []).filter(matchesFilters);
              // Contorul/suma serverului acoperă TOATE lead-urile tenantului; `grouped` e plafonat
              // la 50/coloană (vezi `crmLeads.ts`). Fără filtre arătăm contorul real al serverului;
              // cu filtre active, arătăm ce s-a găsit în cardurile deja încărcate (nu mai cerem
              // server-ul din nou — regula explicită de mai sus, „fără cereri noi").
              const columnCount = hasActiveFilters ? columnLeads.length : counts[stage.key] ?? 0;
              const columnValueSum = hasActiveFilters
                ? columnLeads.reduce((sum, l) => sum + (l.valueCents ?? 0), 0)
                : valueSums[stage.key] ?? 0;
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
                    "flex flex-col gap-2 rounded-2xl bg-muted/40 p-3 transition-colors",
                    isHover && "bg-primary/10 ring-2 ring-primary/40 ring-inset"
                  )}
                  aria-label={`Coloana ${stage.label}`}
                >
                  <StageHeader stage={stage} count={columnCount} valueSum={columnValueSum} />
                  <div className="flex min-h-[96px] flex-col gap-2">
                    {columnLeads.length === 0 ? (
                      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
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
              const columnLeads = (grouped[stage.key] ?? []).filter(matchesFilters);
              const columnCount = hasActiveFilters ? columnLeads.length : counts[stage.key] ?? 0;
              const columnValueSum = hasActiveFilters
                ? columnLeads.reduce((sum, l) => sum + (l.valueCents ?? 0), 0)
                : valueSums[stage.key] ?? 0;
              return (
                <div key={stage.key} className="flex flex-col gap-2 rounded-2xl bg-muted/40 p-3">
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

// ─── Antetul pastelat de coloană ────────────────────────────────────────────────

function StageHeader({ stage, count, valueSum }: { stage: CrmStage; count: number; valueSum: number }) {
  const { bg, fg } = stageColorClasses(stage.color);
  return (
    <div className={cn("rounded-lg p-3", bg)}>
      <div className="flex items-baseline justify-between">
        <p className={cn("text-xs font-bold", fg)}>{stage.label}</p>
        <span className={cn("text-sm font-bold tabular-nums", fg)}>{count}</span>
      </div>
      {valueSum > 0 && (
        <p className={cn("mt-0.5 text-[11px] font-semibold tabular-nums opacity-80", fg)}>{formatCents(valueSum)}</p>
      )}
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
  const title = leadTitle(lead);
  const subtitle = lead.company || lead.interestCourse;
  return (
    <div
      draggable
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", lead.id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-move rounded-lg border border-border bg-card p-2.5 shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        isDragging && "opacity-50"
      )}
    >
      {/* Buton real (nu doar onClick pe div-ul draggable) — tastatură + cititor de ecran, și nu
          intră în conflict cu select-ul de stadiu de mai jos, care rămâne un element FRATE, nu
          copil al butonului (un `<select>` în interiorul unui `<button>` ar fi HTML invalid). */}
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Deschide lead ${title}`}
      >
        <p className="truncate text-xs font-semibold text-foreground">{title}</p>
        {subtitle && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p>}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">{crmSourceLabel(lead.source)}</span>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {lead.phone && <Phone className="h-3 w-3" aria-label="Are telefon" />}
            {lead.email && <Mail className="h-3 w-3" aria-label="Are email" />}
          </div>
        </div>
        {lead.valueCents > 0 && (
          <p className="mt-1 text-[11px] font-bold tabular-nums text-foreground">{formatCents(lead.valueCents)}</p>
        )}
      </button>
      <div className="mt-2">
        <Label htmlFor={`crm-stage-${lead.id}`} className="sr-only">
          Mutare stadiu pentru {title}
        </Label>
        <Select
          id={`crm-stage-${lead.id}`}
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
