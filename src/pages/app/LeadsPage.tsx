import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, Plus, X, Phone, Mail, ArrowRight, CheckCircle2, UserPlus, MessageCircle, Upload, AlertTriangle, Search, Settings, GripVertical, Trash2, Clock, LayoutList, KanbanSquare, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Tag, UserCog, ArrowRightLeft } from "lucide-react";
import { MobileLeadList } from "@/components/crm/MobileLeadList";
import { QuickAddSheet } from "@/components/crm/QuickAddSheet";
import { AppShell } from "@/components/app/AppShell";
import { SavedViewsDropdown } from "@/components/crm/SavedViewsDropdown";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  fetchPipeline,
  fetchLeadsList,
  moveLeadStage,
  createLead,
  convertLead,
  listInteractions,
  addInteraction,
  checkDuplicate,
  bulkAction,
  type Lead,
  type LeadStage,
  type LeadInteraction,
  type DedupResult,
  type ListSortCol,
} from "@/lib/api/leads";
import {
  fetchPipelineStages,
  createPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
  type PipelineStage,
} from "@/lib/api/pipeline";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { getForecast } from "@/lib/api/analytics";
import { cn } from "@/lib/utils";
import { EmptyLeads } from "@/components/crm/EmptyLeads";
import { OnboardingChecklist } from "@/components/crm/OnboardingChecklist";
// CRM-137: AssigneePicker + display name hook
import { AssigneePicker, useAssigneeName } from "@/components/crm/AssigneePicker";
import { useTeamMembers } from "@/hooks/useTeamMembers";
// CRM-138: StageMenu for keyboard-accessible stage switching on KanbanCard
import { StageMenu } from "@/components/crm/StageMenu";
// CRM-139: debounced search
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const SOURCE_LABEL: Record<string, string> = {
  webform: "Site web",
  manual: "Manual",
  facebook_ad: "Facebook",
  google_ads: "Google",
  referral: "Recomandare",
  phone_in: "Telefon",
  instagram: "Instagram",
  import: "Import",
  other: "Altul",
};

const LOST_REASON_PRESETS = [
  "Preț prea mare",
  "Concurență",
  "Nu mai e de interes",
  "S-a înscris în altă parte",
  "Lipsă timp",
  "Nu răspunde",
  "Altul",
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export function LeadsPage() {
  const { status: sessionStatus, data: sessionData } = useSession();
  const { navigate } = useRouter();

  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [grouped, setGrouped] = useState<Record<string, Lead[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  /** CRM-113: Σ value_cents per stage */
  const [valueSums, setValueSums] = useState<Record<string, number>>({});
  const [totalValueCents, setTotalValueCents] = useState(0);
  /** CRM-125: weighted forecast total */
  const [totalWeightedCents, setTotalWeightedCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);

  // Filters
  const [filterSource, setFilterSource] = useState("all");
  const [filterAssigned, setFilterAssigned] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  /** CRM-116: task signal filters */
  const [filterNoTask, setFilterNoTask] = useState(false);
  const [filterOverdue, setFilterOverdue] = useState(false);

  // CRM-139: debounced filter values for auto-trigger in list view
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const debouncedSource = useDebouncedValue(filterSource, 300);
  const debouncedAssigned = useDebouncedValue(filterAssigned, 300);
  const debouncedNoTask = useDebouncedValue(filterNoTask, 300);
  const debouncedOverdue = useDebouncedValue(filterOverdue, 300);

  // CRM-117: view toggle — persisted in localStorage
  const [viewMode, setViewMode] = useState<"kanban" | "list">(() => {
    try { return (localStorage.getItem("crm_view_mode") as "kanban" | "list") ?? "kanban"; } catch { return "kanban"; }
  });

  const handleViewMode = (mode: "kanban" | "list") => {
    setViewMode(mode);
    try { localStorage.setItem("crm_view_mode", mode); } catch { /* ignore */ }
  };

  // CRM-117: list view state
  const [listItems, setListItems] = useState<(Lead & { nextTask?: { dueAt: string | null; title: string } | null })[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listTotalPages, setListTotalPages] = useState(0);
  const [listPage, setListPage] = useState(1);
  const [listPageSize] = useState(50);
  const [listSort, setListSort] = useState<ListSortCol>("createdAt");
  const [listDir, setListDir] = useState<"asc" | "desc">("desc");
  const [listLoading, setListLoading] = useState(false);

  const fetchList = useCallback(async (opts?: { page?: number; sort?: ListSortCol; dir?: "asc" | "desc" }) => {
    setListLoading(true);
    try {
      const res = await fetchLeadsList({
        page: opts?.page ?? listPage,
        pageSize: listPageSize,
        sort: opts?.sort ?? listSort,
        dir: opts?.dir ?? listDir,
        search: searchQuery || undefined,
        source: filterSource !== "all" ? filterSource : undefined,
        assignedTo: filterAssigned !== "all" ? filterAssigned : undefined,
      });
      setListItems(res.items);
      setListTotal(res.total);
      setListTotalPages(res.totalPages);
      setListPage(res.page);
    } catch { /* keep stale */ }
    finally { setListLoading(false); }
  }, [listPage, listPageSize, listSort, listDir, searchQuery, filterSource, filterAssigned]);

  useEffect(() => {
    if (viewMode === "list") {
      void fetchList({ page: 1 });
    }
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // CRM-139: auto-trigger list re-fetch on debounced filter changes
  useEffect(() => {
    if (viewMode === "list") {
      void fetchList({ page: 1 });
    }
    // We intentionally only fire when debounced values change (not on every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, debouncedSource, debouncedAssigned, debouncedNoTask, debouncedOverdue]);

  // CRM-118: Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkStage, setShowBulkStage] = useState(false);
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);

  const handleBulkAction = async (action: "stage" | "assign" | "tag" | "delete", payload?: Record<string, unknown>) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const result = await bulkAction({ ids: Array.from(selectedIds), action, payload });
      setSelectedIds(new Set());
      setShowBulkStage(false);
      setShowBulkTag(false);
      setShowBulkAssign(false);
      setToast({ kind: "success", message: `${result.processed} lead-uri actualizate${result.failed > 0 ? ` (${result.failed} sărite)` : ""}` });
      void fetchList({ page: 1 });
    } catch (err) {
      setToast({ kind: "error", message: err instanceof ApiError ? `Eroare: ${err.code}` : "Acțiune bulk eșuată" });
    } finally {
      setBulkLoading(false);
    }
  };

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showStagesEditor, setShowStagesEditor] = useState(false);
  const [lostReasonFor, setLostReasonFor] = useState<{ leadId: string; targetStage: string } | null>(null);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  /** CRM-122: Quick-add mobile bottom sheet */
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchStages = useCallback(async () => {
    try {
      const res = await fetchPipelineStages();
      setStages(res.stages);
      return res.stages;
    } catch {
      return null;
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pipelineRes, stagesRes, forecastRes] = await Promise.all([
        fetchPipeline(),
        fetchPipelineStages(),
        getForecast().catch(() => null),
      ]);
      setGrouped(pipelineRes.grouped as Record<string, Lead[]>);
      setCounts(pipelineRes.counts as Record<string, number>);
      setValueSums((pipelineRes.valueSums as Record<string, number>) ?? {});
      setTotalValueCents((pipelineRes.totalValueCents as number) ?? 0);
      setStages(stagesRes.stages);
      if (forecastRes) setTotalWeightedCents(forecastRes.totalWeightedCents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Client-side filtering
  const getFilteredLeads = (stageKey: string): Lead[] => {
    const all = grouped[stageKey] ?? [];
    return all.filter((lead) => {
      if (filterSource !== "all" && lead.source !== filterSource) return false;
      if (filterAssigned !== "all" && lead.assignedTo !== filterAssigned) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const phoneQ = q.replace(/\D/g, "");
        const nameMatch = lead.fullName.toLowerCase().includes(q);
        const phoneMatch = phoneQ.length > 0 && (lead.phone ?? "").replace(/\D/g, "").includes(phoneQ);
        // CRM-119: also search company, dealName, interestCourse
        const companyMatch = (lead.company ?? "").toLowerCase().includes(q);
        const dealMatch = (lead.dealName ?? "").toLowerCase().includes(q);
        const courseMatch = (lead.interestCourse ?? "").toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !companyMatch && !dealMatch && !courseMatch) return false;
      }
      // CRM-116: task signal filters
      if (filterNoTask && lead.nextTask !== null && lead.nextTask !== undefined) return false;
      if (filterOverdue) {
        const isOverdue = lead.nextTask?.dueAt != null && new Date(lead.nextTask.dueAt) < new Date();
        if (!isOverdue) return false;
      }
      return true;
    });
  };

  /** CRM-113: Format euro-cents to "€X.XXX" ro-RO locale */
  const formatEur = (cents: number) =>
    cents === 0
      ? null
      : new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

  const handleDrop = async (toStageKey: string) => {
    if (!draggedId) return;
    const allLeads = Object.values(grouped).flat();
    const lead = allLeads.find((l) => l.id === draggedId);
    setDraggedId(null);
    setHoverStage(null);
    if (!lead || lead.stage === toStageKey) return;

    const targetStage = stages.find((s) => s.key === toStageKey);

    if (targetStage?.isLost) {
      // Show lost reason modal before moving
      setLostReasonFor({ leadId: lead.id, targetStage: toStageKey });
      return;
    }

    try {
      await moveLeadStage(lead.id, toStageKey as LeadStage);
      setToast({ kind: "success", message: `Lead mutat la "${targetStage?.label ?? toStageKey}"` });
      void fetchAll();
    } catch {
      setToast({ kind: "error", message: "Nu pot muta lead-ul" });
    }
  };

  const handleLostReasonConfirm = async (lostReason: string) => {
    if (!lostReasonFor) return;
    const { leadId, targetStage } = lostReasonFor;
    setLostReasonFor(null);
    try {
      await moveLeadStage(leadId, targetStage as LeadStage, lostReason);
      setToast({ kind: "success", message: "Lead marcat ca pierdut" });
      void fetchAll();
    } catch {
      setToast({ kind: "error", message: "Nu pot muta lead-ul" });
    }
  };

  const totalLeads = Object.values(counts).reduce((s, c) => s + c, 0);
  const paidCount = counts["paid"] ?? 0;
  const conversionRate = totalLeads > 0 ? Math.round((paidCount / totalLeads) * 100) : 0;

  return (
    <AppShell
      pageTitle="CRM — Leads"
      pageDescription={[`${totalLeads} lead-uri`, `conversie: ${conversionRate}%`, totalValueCents > 0 ? formatEur(totalValueCents) : null, totalWeightedCents > 0 ? `Forecast: ${formatEur(totalWeightedCents)}` : null].filter(Boolean).join(" · ")}
      actions={
        <div className="flex gap-2 items-center">
          {/* CRM-117: Kanban / List toggle */}
          <div className="inline-flex rounded-md border border-border bg-card overflow-hidden" role="group" aria-label="Alegere vedere">
            <button
              type="button"
              onClick={() => handleViewMode("kanban")}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-2 text-sm font-semibold transition-colors",
                viewMode === "kanban"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground"
              )}
              aria-pressed={viewMode === "kanban"}
              aria-label="Vedere Kanban"
            >
              <KanbanSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewMode("list")}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-2 text-sm font-semibold transition-colors border-l border-border",
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground"
              )}
              aria-pressed={viewMode === "list"}
              aria-label="Vedere Listă"
            >
              <LayoutList className="h-4 w-4" />
              <span className="hidden sm:inline">Listă</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowStagesEditor(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
            aria-label="Configurează stadii pipeline"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Stadii</span>
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
            aria-label="Import CSV"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Adaugă lead
          </button>
        </div>
      }
    >
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm flex-1 min-w-[160px]">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <input
            type="search"
            placeholder="Caută nume, telefon..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
            aria-label="Caută lead după nume sau telefon"
          />
        </div>

        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          aria-label="Filtrează după sursă"
        >
          <option value="all">Toate sursele</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        {/* CRM-137: real team members for filter */}
        <AssigneeFilterSelect
          value={filterAssigned}
          onChange={setFilterAssigned}
        />

        {/* CRM-116: task signal filters */}
        <label className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground cursor-pointer hover:bg-muted select-none">
          <input type="checkbox" checked={filterNoTask} onChange={(e) => { setFilterNoTask(e.target.checked); if (e.target.checked) setFilterOverdue(false); }} className="h-3.5 w-3.5" aria-label="Filtrează leaduri fără task" />
          Fără task
        </label>
        <label className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground cursor-pointer hover:bg-muted select-none">
          <input type="checkbox" checked={filterOverdue} onChange={(e) => { setFilterOverdue(e.target.checked); if (e.target.checked) setFilterNoTask(false); }} className="h-3.5 w-3.5" aria-label="Filtrează leaduri cu task restant" />
          Restanțe
        </label>

        {/* CRM-139: list view auto-applies via debounce; spinner shows re-fetch in progress */}
        {viewMode === "list" && listLoading && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite" aria-label="Se filtrează...">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            <span className="sr-only">Se filtrează...</span>
          </span>
        )}
        {(filterSource !== "all" || filterAssigned !== "all" || searchQuery || filterNoTask || filterOverdue) && (
          <button
            type="button"
            onClick={() => { setFilterSource("all"); setFilterAssigned("all"); setSearchQuery(""); setFilterNoTask(false); setFilterOverdue(false); }}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
            Resetează
          </button>
        )}

        {/* CRM-119: Saved views */}
        <div className="ml-auto">
          <SavedViewsDropdown
            activeFilters={{ source: filterSource !== "all" ? filterSource : undefined, assignedTo: filterAssigned !== "all" ? filterAssigned : undefined, searchQuery: searchQuery || undefined, filterNoTask: filterNoTask || undefined, filterOverdue: filterOverdue || undefined }}
            hasActiveFilters={filterSource !== "all" || filterAssigned !== "all" || !!searchQuery || filterNoTask || filterOverdue}
            onApplyView={(filters) => {
              setFilterSource(filters.source ?? "all");
              setFilterAssigned(filters.assignedTo ?? "all");
              setSearchQuery(filters.searchQuery ?? "");
              setFilterNoTask(filters.filterNoTask ?? false);
              setFilterOverdue(filters.filterOverdue ?? false);
            }}
            onError={(m) => setToast({ kind: "error", message: m })}
          />
        </div>
      </div>

      {viewMode === "list" ? (
        <>
          <LeadListView
            items={listItems}
            total={listTotal}
            page={listPage}
            pageSize={listPageSize}
            totalPages={listTotalPages}
            sort={listSort}
            dir={listDir}
            loading={listLoading}
            stages={stages}
            selectedIds={selectedIds}
            onSelectChange={(id, checked) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (checked) next.add(id); else next.delete(id);
                return next;
              });
            }}
            onSelectAll={(checked) => {
              if (checked) {
                setSelectedIds(new Set(listItems.map((l) => l.id)));
              } else {
                setSelectedIds(new Set());
              }
            }}
            onSort={(col, dir) => {
              setListSort(col);
              setListDir(dir);
              setSelectedIds(new Set());
              void fetchList({ sort: col, dir, page: 1 });
            }}
            onPage={(p) => { setListPage(p); setSelectedIds(new Set()); void fetchList({ page: p }); }}
            onRowClick={(id) => navigate(`/app/leads/${id}`)}
            onStageChange={async (id, stage) => {
              try {
                await moveLeadStage(id, stage);
                void fetchList({ page: listPage });
              } catch { /* ignore */ }
            }}
          />
          {/* CRM-118: Bulk action toolbar */}
          {selectedIds.size > 0 && (
            <BulkActionToolbar
              count={selectedIds.size}
              stages={stages}
              loading={bulkLoading}
              showStagePanel={showBulkStage}
              showTagPanel={showBulkTag}
              showAssignPanel={showBulkAssign}
              onToggleStage={() => { setShowBulkStage((v) => !v); setShowBulkTag(false); setShowBulkAssign(false); }}
              onToggleTag={() => { setShowBulkTag((v) => !v); setShowBulkStage(false); setShowBulkAssign(false); }}
              onToggleAssign={() => { setShowBulkAssign((v) => !v); setShowBulkStage(false); setShowBulkTag(false); }}
              onStageConfirm={(stage, lostReason) => void handleBulkAction("stage", { stage, lostReason })}
              onTagConfirm={(tag) => void handleBulkAction("tag", { tag })}
              onAssignConfirm={(assignedTo) => void handleBulkAction("assign", { assignedTo })}
              onDelete={() => {
                if (confirm(`Ștergi ireversibil ${selectedIds.size} lead-uri (GDPR)? Această acțiune nu poate fi anulată.`)) {
                  if (confirm(`Confirmare finală: ștergi ${selectedIds.size} lead-uri?`)) {
                    void handleBulkAction("delete");
                  }
                }
              }}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          )}
        </>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Se încarcă pipeline-ul…
        </div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-destructive">{error}</div>
      ) : !loading && totalLeads === 0 && filterSource === "all" && filterAssigned === "all" && !searchQuery && !filterNoTask && !filterOverdue ? (
        /* CRM-128: Full-page empty state when no leads at all */
        <EmptyLeads onAddLead={() => setShowCreate(true)} />
      ) : (
        <>
          {/* CRM-121: Mobile list — hidden on lg+, shown on mobile */}
          <div className="lg:hidden">
            <MobileLeadList
              leads={Object.values(grouped).flat().filter((lead) => {
                if (filterSource !== "all" && lead.source !== filterSource) return false;
                if (filterAssigned !== "all" && lead.assignedTo !== filterAssigned) return false;
                if (searchQuery.trim()) {
                  const q = searchQuery.toLowerCase().trim();
                  const phoneQ = q.replace(/\D/g, "");
                  const nameMatch = lead.fullName.toLowerCase().includes(q);
                  const phoneMatch = phoneQ.length > 0 && (lead.phone ?? "").replace(/\D/g, "").includes(phoneQ);
                  if (!nameMatch && !phoneMatch) return false;
                }
                if (filterNoTask && lead.nextTask !== null && lead.nextTask !== undefined) return false;
                if (filterOverdue) {
                  const isOverdue = lead.nextTask?.dueAt != null && new Date(lead.nextTask.dueAt) < new Date();
                  if (!isOverdue) return false;
                }
                return true;
              })}
              stages={stages}
              onTap={(id) => navigate(`/app/leads/${id}`)}
              onRefresh={() => void fetchAll()}
              onError={(m) => setToast({ kind: "error", message: m })}
            />

            {/* CRM-122: FAB — quick-add button on mobile */}
            <button
              type="button"
              onClick={() => setShowQuickAdd(true)}
              className="lg:hidden fixed bottom-6 right-6 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Adaugă lead rapid"
            >
              <Plus className="h-7 w-7" />
            </button>
          </div>

          {/* Kanban — hidden on mobile (< lg), shown on desktop */}
          <div
            className="hidden lg:grid gap-3 min-h-[500px] overflow-x-auto"
            style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(200px, 1fr))` }}
          >
          {stages.map((stage) => {
            const leadsHere = getFilteredLeads(stage.key);
            const isHover = hoverStage === stage.key && draggedId !== null;
            return (
              <div
                key={stage.key}
                onDragOver={(e) => { e.preventDefault(); setHoverStage(stage.key); }}
                onDragLeave={() => setHoverStage(null)}
                onDrop={(e) => { e.preventDefault(); void handleDrop(stage.key); }}
                className={cn(
                  "rounded-2xl bg-muted/40 p-3 flex flex-col gap-2 transition-colors",
                  isHover && "bg-primary/10 ring-2 ring-primary/40 ring-inset"
                )}
                aria-label={`Coloana ${stage.label}`}
              >
                <div className={cn("rounded-lg p-3", stage.color)}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-bold text-foreground">{stage.label}</p>
                    <span className="text-sm font-display font-bold tabular-nums">{leadsHere.length}</span>
                  </div>
                  {/* CRM-113: show Σ value for this stage when > 0 */}
                  {(valueSums[stage.key] ?? 0) > 0 && (
                    <p className="text-[10px] text-foreground/70 font-semibold mt-0.5 tabular-nums">
                      {formatEur(valueSums[stage.key])}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {leadsHere.length === 0 ? (
                    <div className="flex items-center justify-center h-24 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground">
                      Trage aici
                    </div>
                  ) : (
                    leadsHere.map((lead) => (
                      <KanbanCard
                        key={lead.id}
                        lead={lead}
                        isDragging={draggedId === lead.id}
                        onDragStart={() => setDraggedId(lead.id)}
                        onDragEnd={() => { setDraggedId(null); setHoverStage(null); }}
                        onClick={() => navigate(`/app/leads/${lead.id}`)}
                        stages={stages}
                        onStageMove={async (stageKey) => {
                          try {
                            await moveLeadStage(lead.id, stageKey as LeadStage);
                            const target = stages.find((s) => s.key === stageKey);
                            setToast({ kind: "success", message: `Lead mutat la "${target?.label ?? stageKey}"` });
                            void fetchAll();
                          } catch { setToast({ kind: "error", message: "Nu pot muta lead-ul" }); }
                        }}
                        onStageLost={(stageKey) => setLostReasonFor({ leadId: lead.id, targetStage: stageKey })}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateLeadModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); setToast({ kind: "success", message: "Lead adăugat în pipeline" }); void fetchAll(); }}
          onError={(m) => setToast({ kind: "error", message: m })}
          onOpenDuplicate={(id) => { setShowCreate(false); navigate(`/app/leads/${id}`); }}
        />
      )}

      {showImport && (
        <CsvImportModal
          onClose={() => setShowImport(false)}
          onImported={(summary) => {
            setShowImport(false);
            setToast({ kind: "success", message: `Import: ${summary.created} create, ${summary.duplicates} duplicate, ${summary.errors} erori` });
            void fetchAll();
          }}
          onError={(m) => setToast({ kind: "error", message: m })}
        />
      )}

      {showStagesEditor && (
        <StagesEditorModal
          stages={stages}
          onClose={() => setShowStagesEditor(false)}
          onChanged={() => { void fetchAll(); void fetchStages(); }}
          onError={(m) => setToast({ kind: "error", message: m })}
        />
      )}

      {lostReasonFor && (
        <LostReasonModal
          onConfirm={handleLostReasonConfirm}
          onCancel={() => setLostReasonFor(null)}
        />
      )}

      {openLead && (
        <LeadDetailModal
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onChanged={() => void fetchAll()}
          onConverted={(studentId) => { setOpenLead(null); setToast({ kind: "success", message: "Lead convertit în student!" }); void fetchAll(); void studentId; }}
          onError={(m) => setToast({ kind: "error", message: m })}
        />
      )}

      {/* CRM-122: Quick-add bottom sheet for mobile */}
      {showQuickAdd && (
        <QuickAddSheet
          onClose={() => setShowQuickAdd(false)}
          onSaved={() => {
            setShowQuickAdd(false);
            setToast({ kind: "success", message: "Lead adăugat în pipeline" });
            void fetchAll();
          }}
          onError={(m) => {
            setShowQuickAdd(false);
            setToast({ kind: "error", message: m });
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border shadow-lg px-4 py-3 text-sm font-medium animate-fade-in",
            toast.kind === "success"
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.message}
        </div>
      )}

      {/* CRM-128: Onboarding checklist (only for new tenants with < 5 leads) */}
      {sessionData?.tenant.id && (
        <OnboardingChecklist
          tenantId={sessionData.tenant.id}
          totalLeads={totalLeads}
        />
      )}
    </AppShell>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

interface KanbanCardProps {
  lead: Lead;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  // CRM-138: stage navigation
  stages: PipelineStage[];
  onStageMove: (stageKey: string) => void;
  onStageLost: (stageKey: string) => void;
}

function KanbanCard({ lead, isDragging, onDragStart, onDragEnd, onClick, stages, onStageMove, onStageLost }: KanbanCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => { onDragStart(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", lead.id); }}
      onDragEnd={onDragEnd}
      className={cn(
        "relative rounded-lg border border-border bg-card p-2.5 cursor-move shadow-sm transition-all",
        "hover:shadow-md hover:-translate-y-0.5",
        isDragging && "opacity-50"
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        )}
        aria-label={`Deschide lead ${lead.dealName ?? lead.fullName}`}
      >
      {/* CRM-114: Use dealName as title if set */}
      <p className="text-xs font-semibold truncate">{lead.dealName ?? lead.fullName}</p>
      {/* CRM-114: Company under name */}
      {lead.company && (
        <p className="text-[10px] text-muted-foreground truncate mt-0.5 italic">{lead.company}</p>
      )}
      {lead.interestCourse && !lead.company && (
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{lead.interestCourse}</p>
      )}
      {/* CRM-113: value / debt */}
      {((lead.valueCents ?? 0) > 0 || (lead.debtCents ?? 0) > 0) && (
        <div className="flex items-center gap-2 mt-1">
          {(lead.valueCents ?? 0) > 0 && (
            <span className="text-[10px] font-bold text-foreground tabular-nums">
              {new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format((lead.valueCents ?? 0) / 100)}
            </span>
          )}
          {(lead.debtCents ?? 0) > 0 && (
            <span className="text-[10px] font-semibold text-destructive tabular-nums">
              Datorie {new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format((lead.debtCents ?? 0) / 100)}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="text-[10px] text-muted-foreground">{SOURCE_LABEL[lead.source] ?? lead.source}</span>
        <div className="flex gap-1.5 text-muted-foreground/60">
          {lead.phone && <Phone className="h-2.5 w-2.5" aria-label="Are telefon" />}
          {lead.email && <Mail className="h-2.5 w-2.5" aria-label="Are email" />}
        </div>
      </div>
      {/* CRM-137: show assignee name instead of UUID fragment */}
      {lead.assignedTo && <KanbanCardAssigneeName assignedTo={lead.assignedTo} />}
      {/* CRM-116: Task signal badges */}
      {lead.nextTask ? (
        (() => {
          const isOverdue = lead.nextTask.dueAt != null && new Date(lead.nextTask.dueAt) < new Date();
          const daysOverdue = isOverdue
            ? Math.floor((Date.now() - new Date(lead.nextTask.dueAt!).getTime()) / 86400000)
            : 0;
          return (
            <div className={cn(
              "mt-1.5 text-[9px] font-semibold inline-flex items-center gap-1",
              isOverdue ? "text-destructive" : "text-amber-600 dark:text-amber-400"
            )} aria-label={isOverdue ? `Task restant ${daysOverdue} zile` : "Următor task"}>
              <Clock className="h-2.5 w-2.5" aria-hidden="true" />
              {isOverdue
                ? `${daysOverdue}d`
                : lead.nextTask.dueAt
                  ? new Date(lead.nextTask.dueAt).toLocaleDateString("ro-RO", { day: "2-digit", month: "short" })
                  : lead.nextTask.title.slice(0, 20)}
            </div>
          );
        })()
      ) : (
        <div className="mt-1.5 text-[9px] font-semibold inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded px-1.5 py-0.5" aria-label="Lead fără task deschis">
          Fără task
        </div>
      )}
      {lead.convertedToStudentId && (
        <div className="mt-1.5 text-[9px] font-bold text-success inline-flex items-center gap-1">
          <CheckCircle2 className="h-2.5 w-2.5" />
          Convertit
        </div>
      )}
      {/* CRM-124: SLA badge — show only for active non-converted leads */}
      {!lead.convertedToStudentId && lead.slaBadge && lead.slaBadge !== "green" && (
        <div className={cn(
          "mt-1 text-[9px] font-bold inline-flex items-center rounded px-1.5 py-0.5",
          lead.slaBadge === "red"
            ? "bg-destructive/10 text-destructive"
            : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
        )} aria-label={`SLA ${lead.slaBadge === "red" ? "depășit" : "atenție"}`}>
          SLA {lead.slaBadge === "red" ? "!!!" : "!"}
        </div>
      )}
      </button>
      {/* CRM-138: Stage menu — keyboard-accessible alternative to drag */}
      <div className="absolute top-1.5 right-1.5">
        <StageMenu
          currentStageKey={lead.stage}
          stages={stages}
          onMove={onStageMove}
          onMoveLost={onStageLost}
        />
      </div>
    </div>
  );
}

// ─── CRM-137: KanbanCardAssigneeName — resolves UUID to name on KanbanCard ──

function KanbanCardAssigneeName({ assignedTo }: { assignedTo: string }) {
  const name = useAssigneeName(assignedTo);
  return (
    <p className="text-[9px] text-muted-foreground truncate mt-0.5" aria-label={`Responsabil: ${name}`}>
      {name}
    </p>
  );
}

// ─── CRM-137: AssigneeFilterSelect — filter bar dropdown with real members ───

interface AssigneeFilterSelectProps {
  value: string;
  onChange: (v: string) => void;
}

function AssigneeFilterSelect({ value, onChange }: AssigneeFilterSelectProps) {
  const { members } = useTeamMembers();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
      aria-label="Filtrează după responsabil"
    >
      <option value="all">Toți responsabilii</option>
      <option value="">Neasignat</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>{m.fullName}</option>
      ))}
    </select>
  );
}

// ─── Lead List View (CRM-117) ─────────────────────────────────────────────────

interface LeadListViewProps {
  items: (Lead & { nextTask?: { dueAt: string | null; title: string } | null })[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sort: ListSortCol;
  dir: "asc" | "desc";
  loading: boolean;
  stages: import("@/lib/api/pipeline").PipelineStage[];
  /** CRM-118: bulk selection */
  selectedIds?: Set<string>;
  onSelectChange?: (id: string, checked: boolean) => void;
  onSelectAll?: (checked: boolean) => void;
  onSort: (col: ListSortCol, dir: "asc" | "desc") => void;
  onPage: (p: number) => void;
  onRowClick: (id: string) => void;
  onStageChange: (id: string, stage: string) => Promise<void>;
}

const STAGE_LABEL: Record<string, string> = {
  new: "Lead nou", contacted: "Contactat", trial: "Trial", paid: "Client", lost: "Pierdut",
};

function LeadListView({ items, total, page, pageSize, totalPages, sort, dir, loading, stages, selectedIds = new Set(), onSelectChange, onSelectAll, onSort, onPage, onRowClick, onStageChange }: LeadListViewProps) {
  const [stageEditing, setStageEditing] = useState<string | null>(null);

  const handleSort = (col: ListSortCol) => {
    if (sort === col) {
      onSort(col, dir === "asc" ? "desc" : "asc");
    } else {
      onSort(col, "asc");
    }
  };

  const SortIcon = ({ col }: { col: ListSortCol }) => {
    if (sort !== col) return <ChevronUp className="h-3 w-3 opacity-30" aria-hidden="true" />;
    return dir === "asc"
      ? <ChevronUp className="h-3 w-3 text-primary" aria-hidden="true" />
      : <ChevronDown className="h-3 w-3 text-primary" aria-hidden="true" />;
  };

  const ThSort = ({ col, children }: { col: ListSortCol; children: React.ReactNode }) => (
    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
        onClick={() => handleSort(col)}
        aria-label={`Sortează după ${String(col)}`}
      >
        {children}
        <SortIcon col={col} />
      </button>
    </th>
  );

  const formatEur = (cents: number) =>
    cents === 0
      ? null
      : new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Se încarcă lista…
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
        <LayoutList className="h-8 w-8 opacity-30" aria-hidden="true" />
        <p className="text-sm">Niciun lead găsit. Modifică filtrele sau adaugă un lead nou.</p>
      </div>
    );
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3">
      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm" aria-label={`Lista leaduri — ${total} total`}>
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              {/* CRM-118: Select-all checkbox */}
              {onSelectChange && (
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && items.every((l) => selectedIds.has(l.id))}
                    onChange={(e) => onSelectAll?.(e.target.checked)}
                    aria-label="Selectează toate lead-urile de pe pagină"
                    className="h-4 w-4 rounded accent-primary"
                  />
                </th>
              )}
              <ThSort col="fullName">Nume / Companie</ThSort>
              <ThSort col="stage">Stadiu</ThSort>
              <ThSort col="source">Sursă</ThSort>
              <ThSort col="valueCents">Valoare</ThSort>
              <ThSort col="debtCents">Datorie</ThSort>
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Următor task</th>
              <ThSort col="createdAt">Creat</ThSort>
            </tr>
          </thead>
          <tbody>
            {items.map((lead) => {
              const isOverdue = lead.nextTask?.dueAt != null && new Date(lead.nextTask.dueAt) < new Date();
              const daysOverdue = isOverdue
                ? Math.floor((Date.now() - new Date(lead.nextTask!.dueAt!).getTime()) / 86400000)
                : 0;
              const isSelected = selectedIds.has(lead.id);

              return (
                <tr
                  key={lead.id}
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors group",
                    isSelected && "bg-primary/5"
                  )}
                  onClick={() => onRowClick(lead.id)}
                >
                  {/* CRM-118: Row checkbox */}
                  {onSelectChange && (
                    <td className="px-3 py-2.5 w-8" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onSelectChange(lead.id, e.target.checked)}
                        aria-label={`Selectează ${lead.fullName}`}
                        className="h-4 w-4 rounded accent-primary"
                      />
                    </td>
                  )}
                  {/* Name / company */}
                  <td className="px-3 py-2.5 max-w-[200px]">
                    <p className="font-semibold truncate">{lead.dealName ?? lead.fullName}</p>
                    {lead.company && <p className="text-[11px] text-muted-foreground truncate italic">{lead.company}</p>}
                    <div className="flex items-center gap-2 mt-0.5">
                      {lead.phone && <Phone className="h-2.5 w-2.5 text-muted-foreground/60" aria-label="Are telefon" />}
                      {lead.email && <Mail className="h-2.5 w-2.5 text-muted-foreground/60" aria-label="Are email" />}
                    </div>
                  </td>

                  {/* Stage — inline editable dropdown */}
                  <td
                    className="px-3 py-2.5"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Stadiu: ${STAGE_LABEL[lead.stage] ?? lead.stage}`}
                  >
                    {stageEditing === lead.id ? (
                      <select
                        autoFocus
                        value={lead.stage}
                        onChange={async (e) => {
                          setStageEditing(null);
                          await onStageChange(lead.id, e.target.value);
                        }}
                        onBlur={() => setStageEditing(null)}
                        className="text-xs rounded border border-input bg-background px-1.5 py-1"
                        aria-label="Schimbă stadiu"
                      >
                        {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        {/* Fallback for default stages if no custom stages */}
                        {stages.length === 0 && (
                          <>
                            <option value="new">Lead nou</option>
                            <option value="contacted">Contactat</option>
                            <option value="trial">Trial</option>
                            <option value="paid">Client</option>
                            <option value="lost">Pierdut</option>
                          </>
                        )}
                      </select>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStageEditing(lead.id)}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border border-border/60 hover:border-primary/50 transition-colors"
                        aria-label={`Stadiu ${STAGE_LABEL[lead.stage] ?? lead.stage} — click pentru a edita`}
                      >
                        {STAGE_LABEL[lead.stage] ?? lead.stage}
                      </button>
                    )}
                  </td>

                  {/* Source */}
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {SOURCE_LABEL[lead.source] ?? lead.source}
                  </td>

                  {/* Value */}
                  <td className="px-3 py-2.5 text-xs font-semibold tabular-nums whitespace-nowrap">
                    {formatEur(lead.valueCents ?? 0) ?? <span className="text-muted-foreground">—</span>}
                  </td>

                  {/* Debt */}
                  <td className="px-3 py-2.5 text-xs tabular-nums whitespace-nowrap">
                    {(lead.debtCents ?? 0) > 0
                      ? <span className="text-destructive font-semibold">{formatEur(lead.debtCents)}</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>

                  {/* Next task */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {lead.nextTask ? (
                      <span className={cn(
                        "inline-flex items-center gap-1 font-semibold",
                        isOverdue ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                      )}>
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {isOverdue
                          ? `${daysOverdue}d restant`
                          : lead.nextTask.dueAt
                            ? new Date(lead.nextTask.dueAt).toLocaleDateString("ro-RO", { day: "2-digit", month: "short" })
                            : lead.nextTask.title.slice(0, 20)}
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded px-1.5 py-0.5 font-semibold">
                        Fără task
                      </span>
                    )}
                  </td>

                  {/* Created */}
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(lead.createdAt).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "2-digit" })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{start}–{end} din {total} leaduri</span>
        <div className="flex items-center gap-1" role="navigation" aria-label="Paginare">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center justify-center rounded-md border border-border p-1.5 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Pagina anterioară"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="px-2 font-semibold text-foreground">{page} / {totalPages}</span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
            className="inline-flex items-center justify-center rounded-md border border-border p-1.5 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Pagina următoare"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CRM-118: Bulk Action Toolbar ─────────────────────────────────────────────

interface BulkActionToolbarProps {
  count: number;
  stages: import("@/lib/api/pipeline").PipelineStage[];
  loading: boolean;
  showStagePanel: boolean;
  showTagPanel: boolean;
  showAssignPanel: boolean;
  onToggleStage: () => void;
  onToggleTag: () => void;
  onToggleAssign: () => void;
  onStageConfirm: (stage: string, lostReason?: string | null) => void;
  onTagConfirm: (tag: string) => void;
  onAssignConfirm: (assignedTo: string | null) => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

function BulkActionToolbar({
  count, stages, loading, showStagePanel, showTagPanel, showAssignPanel,
  onToggleStage, onToggleTag, onToggleAssign,
  onStageConfirm, onTagConfirm, onAssignConfirm,
  onDelete, onClearSelection,
}: BulkActionToolbarProps) {
  const [stageValue, setStageValue] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [tagValue, setTagValue] = useState("");
  const [assignValue, setAssignValue] = useState("");

  const DEFAULT_STAGES = [
    { key: "new", label: "Lead nou", isLost: false },
    { key: "contacted", label: "Contactat", isLost: false },
    { key: "trial", label: "Trial", isLost: false },
    { key: "paid", label: "Client", isLost: false },
    { key: "lost", label: "Pierdut", isLost: true },
  ];
  const allStages = stages.length > 0 ? stages : DEFAULT_STAGES;
  const selectedStageIsLost = (allStages as Array<{ key: string; label: string; isLost?: boolean }>).find((s) => s.key === stageValue)?.isLost ?? stageValue === "lost";

  return (
    <div
      role="toolbar"
      aria-label={`Acțiuni pentru ${count} lead-uri selectate`}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl"
    >
      <div className="rounded-2xl border border-border bg-card/95 backdrop-blur shadow-xl p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-primary mr-1">{count} selectate</span>

          <button
            type="button"
            onClick={onToggleStage}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors",
              showStagePanel ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
            )}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Schimbă stadiu
          </button>

          <button
            type="button"
            onClick={onToggleAssign}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors",
              showAssignPanel ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
            )}
          >
            <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
            Reasignează
          </button>

          <button
            type="button"
            onClick={onToggleTag}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors",
              showTagPanel ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
            )}
          >
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            Tag
          </button>

          <button
            type="button"
            onClick={onDelete}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Șterge (GDPR)
          </button>

          <button
            type="button"
            onClick={onClearSelection}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted border border-transparent"
            aria-label="Anulează selecția"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Stage panel */}
        {showStagePanel && (
          <div className="mt-3 pt-3 border-t border-border flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label htmlFor="bulk-stage" className="block text-xs font-semibold mb-1">Stadiu nou</label>
              <select
                id="bulk-stage"
                value={stageValue}
                onChange={(e) => { setStageValue(e.target.value); setLostReason(""); }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">— alege —</option>
                {allStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            {selectedStageIsLost && (
              <div className="flex-1 min-w-[140px]">
                <label htmlFor="bulk-lost-reason" className="block text-xs font-semibold mb-1">Motiv pierdere *</label>
                <input
                  id="bulk-lost-reason"
                  type="text"
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  placeholder="ex: Preț prea mare"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </div>
            )}
            <button
              type="button"
              disabled={!stageValue || loading || (selectedStageIsLost && !lostReason.trim())}
              onClick={() => { onStageConfirm(stageValue, selectedStageIsLost ? lostReason : null); setStageValue(""); setLostReason(""); }}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplică"}
            </button>
          </div>
        )}

        {/* Tag panel */}
        {showTagPanel && (
          <div className="mt-3 pt-3 border-t border-border flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="bulk-tag" className="block text-xs font-semibold mb-1">Tag nou</label>
              <input
                id="bulk-tag"
                type="text"
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                placeholder="ex: urgent, vip"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={!tagValue.trim() || loading}
              onClick={() => { onTagConfirm(tagValue.trim()); setTagValue(""); }}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplică"}
            </button>
          </div>
        )}

        {/* Assign panel — CRM-137: dropdown with names instead of UUID */}
        {showAssignPanel && (
          <div className="mt-3 pt-3 border-t border-border flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="bulk-assign" className="block text-xs font-semibold mb-1">Responsabil (— elimină —)</label>
              <AssigneePicker
                id="bulk-assign"
                value={assignValue || null}
                onChange={(v) => setAssignValue(v ?? "")}
                ariaLabel="Responsabil bulk"
                className="w-full"
              />
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => { onAssignConfirm(assignValue.trim() || null); setAssignValue(""); }}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplică"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lost Reason Modal ────────────────────────────────────────────────────────

function LostReasonModal({ onConfirm, onCancel }: { onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");

  const effectiveReason = reason === "Altul" ? custom.trim() : reason;

  return (
    <Modal title="Motiv pierdere" onClose={onCancel}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Selectează motivul pentru care lead-ul a fost pierdut. Câmp obligatoriu.</p>
        <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Motiv pierdere">
          {LOST_REASON_PRESETS.map((preset) => (
            <label
              key={preset}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer text-sm transition-colors",
                reason === preset
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border hover:bg-muted/40"
              )}
            >
              <input
                type="radio"
                name="lost_reason"
                value={preset}
                checked={reason === preset}
                onChange={() => setReason(preset)}
                className="sr-only"
              />
              {preset}
            </label>
          ))}
        </div>
        {reason === "Altul" && (
          <div>
            <label htmlFor="custom-reason" className="block text-sm font-semibold mb-1">Detalii</label>
            <input
              id="custom-reason"
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Descrie motivul..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              autoFocus
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
            Anulează
          </button>
          <button
            type="button"
            disabled={!effectiveReason}
            onClick={() => onConfirm(effectiveReason)}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            Marchează pierdut
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Stages Editor Modal ──────────────────────────────────────────────────────

const COLOR_OPTIONS = [
  { key: "pastel-sky", label: "Albastru" },
  { key: "pastel-lavender", label: "Lavandă" },
  { key: "pastel-peach", label: "Piersică" },
  { key: "pastel-mint", label: "Verde mentă" },
  { key: "pastel-rose", label: "Roz" },
  { key: "pastel-yellow", label: "Galben" },
  { key: "pastel-teal", label: "Teal" },
];

function StagesEditorModal({
  stages,
  onClose,
  onChanged,
  onError,
}: {
  stages: PipelineStage[];
  onClose: () => void;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newColor, setNewColor] = useState("pastel-sky");
  const [newIsLost, setNewIsLost] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newLabel.trim() || !newKey.trim()) return;
    setAdding(true);
    try {
      await createPipelineStage({
        key: newKey.trim().toLowerCase().replace(/\s+/g, "_"),
        label: newLabel.trim(),
        color: newColor,
        orderIndex: stages.length,
        isLost: newIsLost,
      });
      setNewLabel("");
      setNewKey("");
      setNewIsLost(false);
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? `Eroare: ${err.code}` : "Nu pot adăuga stadiu");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deletePipelineStage(id);
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? `Eroare: ${err.code}` : "Nu pot șterge stadiu");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Modal title="Configurare stadii pipeline" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2 text-left font-semibold w-4"></th>
                <th className="px-3 py-2 text-left font-semibold">Label</th>
                <th className="px-3 py-2 text-left font-semibold">Key</th>
                <th className="px-3 py-2 text-left font-semibold">Culoare</th>
                <th className="px-3 py-2 text-left font-semibold">Pierdut?</th>
                <th className="px-3 py-2 text-left font-semibold w-8"></th>
              </tr>
            </thead>
            <tbody>
              {stages.map((stage) => (
                <tr key={stage.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-muted-foreground cursor-grab">
                    <GripVertical className="h-4 w-4" aria-hidden="true" />
                  </td>
                  <td className="px-3 py-2 font-medium">{stage.label}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{stage.key}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-block w-4 h-4 rounded-full", stage.color)} aria-label={stage.color} />
                  </td>
                  <td className="px-3 py-2">
                    {stage.isLost ? <span className="text-xs text-destructive font-semibold">Da</span> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {!stage.isDefault && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(stage.id)}
                        disabled={deletingId === stage.id}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        aria-label={`Șterge stadiu ${stage.label}`}
                      >
                        {deletingId === stage.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-sm font-semibold mb-3">Adaugă stadiu nou</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ns-label" className="block text-xs font-semibold mb-1">Label *</label>
              <input id="ns-label" type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="ex: Așteaptă răspuns" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label htmlFor="ns-key" className="block text-xs font-semibold mb-1">Key * (slug)</label>
              <input id="ns-key" type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="ex: waiting_response" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono" />
            </div>
            <div>
              <label htmlFor="ns-color" className="block text-xs font-semibold mb-1">Culoare</label>
              <select id="ns-color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                {COLOR_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input id="ns-lost" type="checkbox" checked={newIsLost} onChange={(e) => setNewIsLost(e.target.checked)} className="h-4 w-4" />
              <label htmlFor="ns-lost" className="text-sm">Stadiu „Pierdut" (cere motiv)</label>
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={adding || !newLabel.trim() || !newKey.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adaugă stadiu"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Create Lead Modal ────────────────────────────────────────────────────────

interface CreateLeadModalProps {
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
  onOpenDuplicate: (id: string) => void;
}

function CreateLeadModal({ onClose, onSaved, onError, onOpenDuplicate }: CreateLeadModalProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [interestCourse, setInterestCourse] = useState("");
  const [source, setSource] = useState<"manual" | "facebook_ad" | "google_ads" | "referral" | "phone_in" | "instagram" | "other">("manual");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [valueEur, setValueEur] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dedupResult, setDedupResult] = useState<DedupResult["duplicate"] | null>(null);
  const [forceCreate, setForceCreate] = useState(false);
  const dedupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const STAGES_LOCAL: Array<{ id: string; label: string }> = [
    { id: "new", label: "Lead nou" },
    { id: "contacted", label: "Contactat" },
    { id: "trial", label: "Trial" },
    { id: "paid", label: "Client" },
    { id: "lost", label: "Pierdut" },
  ];

  const checkDedup = useCallback(async (phoneVal: string, emailVal: string) => {
    if (!phoneVal && !emailVal) { setDedupResult(null); return; }
    try {
      const result = await checkDuplicate({ phone: phoneVal || undefined, email: emailVal || undefined });
      setDedupResult(result.duplicate);
    } catch {
      setDedupResult(null);
    }
  }, []);

  const handleBlur = () => {
    if (dedupTimerRef.current) clearTimeout(dedupTimerRef.current);
    dedupTimerRef.current = setTimeout(() => void checkDedup(phone, email), 300);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const valueCents = valueEur.trim() ? Math.round(parseFloat(valueEur.replace(",", ".")) * 100) : 0;
      await createLead({ fullName, phone: phone || null, email: email || null, interestCourse: interestCourse || null, source, assignedTo: assignedTo || null, notes: notes || null, valueCents: isNaN(valueCents) ? 0 : valueCents, company: company || null } as Parameters<typeof createLead>[0]);
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? `Eroare: ${err.code}` : "Nu pot salva lead-ul");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Adaugă lead nou" onClose={onClose}>
      {dedupResult && !forceCreate && (
        <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Există deja: {dedupResult.fullName}</p>
            <p className="text-xs opacity-75 mt-0.5">Stadiu: {STAGES_LOCAL.find((s) => s.id === dedupResult.stage)?.label ?? dedupResult.stage}</p>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => onOpenDuplicate(dedupResult.id)} className="text-xs font-semibold text-primary hover:underline">Deschide</button>
              <span className="text-amber-400">·</span>
              <button type="button" onClick={() => setForceCreate(true)} className="text-xs text-muted-foreground hover:text-foreground">Creează oricum</button>
            </div>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <FormField id="l-name" label="Nume complet" required>
          <input id="l-name" type="text" required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-base" />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField id="l-phone" label="Telefon">
            <input id="l-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={handleBlur} className="input-base" placeholder="+40 7XX XXX XXX" />
          </FormField>
          <FormField id="l-email" label="Email">
            <input id="l-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={handleBlur} className="input-base" />
          </FormField>
        </div>
        <FormField id="l-course" label="Curs de interes">
          <input id="l-course" type="text" value={interestCourse} onChange={(e) => setInterestCourse(e.target.value)} className="input-base" placeholder="ex: Engleză B2" />
        </FormField>
        <FormField id="l-source" label="Sursă">
          <select id="l-source" value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="input-base">
            <option value="manual">Manual</option>
            <option value="facebook_ad">Facebook</option>
            <option value="google_ads">Google</option>
            <option value="instagram">Instagram</option>
            <option value="referral">Recomandare</option>
            <option value="phone_in">Telefon</option>
            <option value="other">Altul</option>
          </select>
        </FormField>
        <FormField id="l-company" label="Companie (opțional)">
          <input id="l-company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="input-base" placeholder="ex: S.R.L. Acme" />
        </FormField>
        {/* CRM-137: AssigneePicker replaces UUID text input */}
        <FormField id="l-assigned" label="Responsabil">
          <AssigneePicker
            id="l-assigned"
            value={assignedTo || null}
            onChange={(v) => setAssignedTo(v ?? "")}
            ariaLabel="Responsabil"
            className="input-base"
          />
        </FormField>
        <FormField id="l-value" label="Valoare deal (€)">
          <input id="l-value" type="number" min="0" step="0.01" value={valueEur} onChange={(e) => setValueEur(e.target.value)} className="input-base" placeholder="ex: 360" />
        </FormField>
        <FormField id="l-notes" label="Note">
          <textarea id="l-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-base resize-none" />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">Anulează</button>
          <button type="submit" disabled={submitting || (dedupResult !== null && !forceCreate)} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? "Se salvează..." : "Adaugă"}
          </button>
        </div>
      </form>
      <style>{`.input-base { width:100%; border-radius:0.5rem; border:1px solid hsl(var(--input)); background-color:hsl(var(--background)); padding:0.5rem 0.75rem; font-size:0.875rem; } .input-base:focus-visible { outline:none; box-shadow:0 0 0 2px hsl(var(--ring)); }`}</style>
    </Modal>
  );
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

interface ImportSummary { created: number; duplicates: number; errors: number }

function CsvImportModal({ onClose, onImported, onError }: { onClose: () => void; onImported: (s: ImportSummary) => void; onError: (m: string) => void }) {
  type Step = "upload" | "map" | "preview";
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([]);
  const [previewSummary, setPreviewSummary] = useState<ImportSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, setCsvText] = useState("");

  const OUR_FIELDS = [
    { key: "fullName", label: "Nume complet *" },
    { key: "phone", label: "Telefon" },
    { key: "email", label: "Email" },
    { key: "interestCourse", label: "Curs de interes" },
    { key: "source", label: "Sursă" },
  ] as const;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvText(text);
      const parsed = text.trim().split("\n").map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
      if (parsed.length < 2) { onError("CSV trebuie să aibă header + date."); return; }
      setHeaders(parsed[0]);
      setRows(parsed.slice(1));
      const auto: Record<string, number> = {};
      parsed[0].forEach((h, i) => {
        const lh = h.toLowerCase();
        if (lh.includes("num") || lh.includes("name")) auto["fullName"] = i;
        else if (lh.includes("tel") || lh.includes("phone")) auto["phone"] = i;
        else if (lh.includes("email")) auto["email"] = i;
        else if (lh.includes("curs") || lh.includes("course")) auto["interestCourse"] = i;
      });
      setMapping(auto);
      setStep("map");
    };
    reader.readAsText(file);
  };

  const buildMapped = () => rows.map((row) => Object.fromEntries(OUR_FIELDS.map(({ key }) => [key, mapping[key] !== undefined ? (row[mapping[key]] ?? "") : ""])));

  const handlePreview = async () => {
    setSubmitting(true);
    try {
      const res = await api<{ summary: ImportSummary }>("/api/leads/import", { method: "POST", body: JSON.stringify({ rows: buildMapped().map((r) => ({ fullName: r.fullName || "", phone: r.phone || null, email: r.email || null, interestCourse: r.interestCourse || null, source: r.source || "import" })), dryRun: true }) });
      setPreviewRows(buildMapped().slice(0, 5));
      setPreviewSummary(res.summary);
      setStep("preview");
    } catch { onError("Nu pot valida CSV-ul."); } finally { setSubmitting(false); }
  };

  const handleCommit = async () => {
    setSubmitting(true);
    try {
      const res = await api<{ summary: ImportSummary }>("/api/leads/import", { method: "POST", body: JSON.stringify({ rows: buildMapped().map((r) => ({ fullName: r.fullName || "", phone: r.phone || null, email: r.email || null, interestCourse: r.interestCourse || null, source: r.source || "import" })), dryRun: false }) });
      onImported(res.summary);
    } catch { onError("Importul a eșuat."); } finally { setSubmitting(false); }
  };

  return (
    <Modal title="Import CSV leaduri" onClose={onClose} wide>
      <div className="space-y-4">
        {step === "upload" && (
          <>
            <p className="text-sm text-muted-foreground">Câmp obligatoriu: Nume complet.</p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" aria-label="CSV file" />
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-8 text-sm font-semibold hover:bg-muted/40">
              <Upload className="h-5 w-5 text-muted-foreground" /> Alege fișier CSV
            </button>
          </>
        )}
        {step === "map" && (
          <>
            <p className="text-sm font-semibold">Mapare coloane ({rows.length} rânduri)</p>
            <div className="space-y-2">
              {OUR_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <label htmlFor={`map-${key}`} className="text-sm w-32 shrink-0">{label}</label>
                  <select id={`map-${key}`} value={mapping[key] ?? ""} onChange={(e) => setMapping((prev) => ({ ...prev, [key]: parseInt(e.target.value) }))} className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                    <option value="">— nu mapa —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setStep("upload")} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Înapoi</button>
              <button type="button" disabled={mapping["fullName"] === undefined || submitting} onClick={() => void handlePreview()} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preview"}
              </button>
            </div>
          </>
        )}
        {step === "preview" && previewSummary && (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-success/10 p-3"><p className="text-2xl font-bold text-success">{previewSummary.created}</p><p className="text-xs text-muted-foreground">Noi</p></div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3"><p className="text-2xl font-bold text-amber-600">{previewSummary.duplicates}</p><p className="text-xs text-muted-foreground">Duplicate</p></div>
              <div className="rounded-lg bg-destructive/10 p-3"><p className="text-2xl font-bold text-destructive">{previewSummary.errors}</p><p className="text-xs text-muted-foreground">Erori</p></div>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="text-[11px] w-full">
                <thead><tr className="border-b border-border bg-muted/40">{OUR_FIELDS.filter(({ key }) => mapping[key] !== undefined).map(({ key, label }) => <th key={key} className="px-2 py-1.5 text-left">{label}</th>)}</tr></thead>
                <tbody>{previewRows.map((row, i) => <tr key={i} className="border-b border-border last:border-0">{OUR_FIELDS.filter(({ key }) => mapping[key] !== undefined).map(({ key }) => <td key={key} className="px-2 py-1.5 truncate max-w-[100px]">{row[key] || "—"}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setStep("map")} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Modifică</button>
              <button type="button" disabled={submitting} onClick={() => void handleCommit()} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Importă ${previewSummary.created}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Lead Detail Modal ────────────────────────────────────────────────────────

function LeadDetailModal({ lead, onClose, onChanged, onConverted, onError }: { lead: Lead; onClose: () => void; onChanged: () => void; onConverted: (studentId: string) => void; onError: (m: string) => void }) {
  const [interactions, setInteractions] = useState<LeadInteraction[]>([]);
  const [loadingInter, setLoadingInter] = useState(true);
  const [noteBody, setNoteBody] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoadingInter(true);
    listInteractions(lead.id).then((r) => alive && setInteractions(r.items)).catch(() => alive && setInteractions([])).finally(() => alive && setLoadingInter(false));
    return () => { alive = false; };
  }, [lead.id]);

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setSubmittingNote(true);
    try { const created = await addInteraction(lead.id, { type: "note", body: noteBody }); setInteractions((prev) => [created, ...prev]); setNoteBody(""); } catch { onError("Nu pot salva nota"); } finally { setSubmittingNote(false); }
  };

  const handleConvert = async () => {
    if (!confirm(`Convertești "${lead.fullName}" în student?`)) return;
    setConverting(true);
    try { const res = await convertLead(lead.id); onConverted(res.student.id); } catch (err) { onError(err instanceof ApiError && err.code === "already_converted" ? "Lead-ul a fost deja convertit" : "Nu pot converti"); } finally { setConverting(false); }
  };

  return (
    <Modal title={lead.fullName} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          {lead.phone && <DetailRow icon={Phone} label="Telefon" value={lead.phone} />}
          {lead.email && <DetailRow icon={Mail} label="Email" value={lead.email} />}
          {lead.interestCourse && <DetailRow icon={null} label="Curs" value={lead.interestCourse} />}
          <DetailRow icon={null} label="Sursă" value={SOURCE_LABEL[lead.source] ?? lead.source} />
        </div>
        {lead.utmSource && <div className="rounded-md bg-muted p-2 text-[11px] text-muted-foreground">UTM: {lead.utmSource} / {lead.utmMedium ?? "—"} / {lead.utmCampaign ?? "—"}</div>}
        {!lead.convertedToStudentId && lead.stage !== "lost" && (
          <button type="button" onClick={handleConvert} disabled={converting} className="inline-flex items-center justify-center gap-1.5 w-full rounded-md bg-success px-4 py-2.5 text-sm font-semibold text-success-foreground hover:bg-success/90 disabled:opacity-50">
            {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Convertește în Student <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {lead.convertedToStudentId && (
          <div className="rounded-md bg-success/10 border border-success/30 p-3 text-sm text-success flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Convertit la {lead.convertedAt ? new Date(lead.convertedAt).toLocaleDateString("ro-RO") : "—"}
          </div>
        )}
        <div className="border-t border-border pt-4">
          <p className="text-sm font-bold mb-3">Interacțiuni</p>
          <form onSubmit={addNote} className="mb-3 flex gap-2">
            <input type="text" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Adaugă o notă..." className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <button type="submit" disabled={submittingNote || !noteBody.trim()} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Adaugă</button>
          </form>
          {loadingInter ? <div className="flex items-center text-muted-foreground text-sm py-4"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Se încarcă...</div>
            : interactions.length === 0 ? <p className="text-xs text-muted-foreground py-4">Niciun istoric încă.</p>
              : <ul className="space-y-2 max-h-64 overflow-y-auto">{interactions.map((i) => <li key={i.id} className="rounded-md border border-border bg-card p-2.5 text-xs"><div className="flex items-center justify-between mb-1"><span className="inline-flex items-center gap-1 font-semibold capitalize"><MessageCircle className="h-3 w-3 text-primary" />{i.type.replace("_", " ")}</span><span className="text-[10px] text-muted-foreground">{new Date(i.occurredAt).toLocaleString("ro-RO")}</span></div><p className="text-foreground/80">{i.body}</p></li>)}</ul>
          }
        </div>
        <ChangedSpy onMount={onChanged} />
      </div>
    </Modal>
  );
}

function ChangedSpy({ onMount }: { onMount: () => void }) {
  useEffect(() => { onMount(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }> | null; label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <p className="font-medium inline-flex items-center gap-1.5">{Icon && <Icon className="h-3 w-3 text-muted-foreground" />}{value}</p>
    </div>
  );
}

function FormField({ id, label, required, children }: { id: string; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5">{label}{required && <span className="text-destructive ml-0.5"> *</span>}</label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative w-full rounded-2xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between sticky top-0 bg-card z-10">
          <h2 className="text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Închide" className="rounded-md hover:bg-muted p-1"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
