/**
 * PAR-106 — /business/par
 *
 * Dashboard + lista cererilor PAR:
 *   - Secțiunea „Cererile mele" (toți)
 *   - Secțiunea „Pending my approval" (approver)
 *   - Secțiunea „Awaiting payment" (finance)
 *   - Status chips, filtre, totaluri, buton „Cerere nouă"
 *
 * CORE: backlog/par/PAR-CORE.md §6
 * Design system: Vector 365 tokens only, light + dark, WCAG AA
 */
import { useState, useEffect } from "react";
import { Plus, Search, Filter, Loader2, FileText, AlertCircle, Inbox, Landmark, ArrowRight, SlidersHorizontal, X } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import { ParStatusChip } from "@/components/par/ParStatusChip";
import {
  listPar,
  getParInbox,
  getParMe,
  getParSettings,
  getBudgetCodesUsage,
  listEvents,
  listProjects,
  listDepartments,
  listBudgetCodes,
  formatMDL,
  type ParRequest,
  type ParStatus,
  type ParPurpose,
  type ParEvent,
  type BudgetCodeUsage,
  PAR_STATUS_LABELS,
} from "@/lib/api/par";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ParStatus | ""; label: string }[] = [
  { value: "", label: "Toate statusurile" },
  { value: "draft", label: PAR_STATUS_LABELS.draft },
  { value: "pending_approval", label: PAR_STATUS_LABELS.pending_approval },
  { value: "changes_requested", label: PAR_STATUS_LABELS.changes_requested },
  { value: "approved", label: PAR_STATUS_LABELS.approved },
  { value: "in_finance", label: PAR_STATUS_LABELS.in_finance },
  { value: "paid", label: PAR_STATUS_LABELS.paid },
  { value: "rejected", label: PAR_STATUS_LABELS.rejected },
  { value: "cancelled", label: PAR_STATUS_LABELS.cancelled },
];

const PURPOSE_OPTIONS: { value: ParPurpose | ""; label: string }[] = [
  { value: "", label: "Toate scopurile" },
  { value: "execute_payment", label: "Executare plată" },
  { value: "obtain_quotations", label: "Obținere oferte" },
  { value: "provide_estimate", label: "Estimare costuri" },
];

// ─── VF-105: filter persistence ───────────────────────────────────────────────

const FILTERS_KEY = "vf.dashboard.filters";

interface SavedFilters {
  status?: ParStatus | "";
  purpose?: ParPurpose | "";
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  minTotal?: string;
  maxTotal?: string;
}

function loadSavedFilters(): SavedFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    return raw ? (JSON.parse(raw) as SavedFilters) : {};
  } catch {
    return {};
  }
}

function saveFilters(f: SavedFilters): void {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {
    /* ignore quota / unavailable */
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ParDashboard() {
  const { navigate } = useRouter();
  const { t } = useT();

  useEffect(() => {
    const params = new URLSearchParams((window.location.hash.split("?")[1] ?? ""));
    if (params.get("from") !== "folders") sessionStorage.removeItem("par:returnTo");
  }, []);

  const [requests, setRequests] = useState<(ParRequest & { above_micro_threshold: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // VM1-10: when arriving from a Folder click, the project/status come in the URL query
  // (#/business/par?project_id=…&status=…). The URL wins over the saved localStorage filters so the
  // folder actually narrows the list (before, the dashboard ignored the URL → showed everything).
  const urlFilters = (() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return { projectId: "", status: "" as ParStatus | "" };
    const p = new URLSearchParams(hash.slice(qIdx + 1));
    return { projectId: p.get("project_id") ?? "", status: (p.get("status") as ParStatus) ?? "" };
  })();

  // VF-105: filters are restored from localStorage so they survive a reload.
  const saved = loadSavedFilters();
  const [statusFilter, setStatusFilter] = useState<ParStatus | "">(urlFilters.status || saved.status || "");
  const [projectFilter, setProjectFilter] = useState<string>(urlFilters.projectId || "");
  const [projectsMap, setProjectsMap] = useState<Record<string, string>>({});
  const [purposeFilter, setPurposeFilter] = useState<ParPurpose | "">(saved.purpose ?? "");
  const [searchQ, setSearchQ] = useState(saved.q ?? "");
  // VF-105: advanced filters (date range + total range in MDL units as strings)
  const [dateFrom, setDateFrom] = useState(saved.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(saved.dateTo ?? "");
  const [minTotal, setMinTotal] = useState(saved.minTotal ?? "");
  const [maxTotal, setMaxTotal] = useState(saved.maxTotal ?? "");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  // VM1-04: event filter (client-side only — applied after fetch)
  const [events, setEvents] = useState<ParEvent[]>([]);
  const [eventFilter, setEventFilter] = useState("");

  // Persist all filters on change.
  useEffect(() => {
    saveFilters({ status: statusFilter, purpose: purposeFilter, q: searchQ, dateFrom, dateTo, minTotal, maxTotal });
  }, [statusFilter, purposeFilter, searchQ, dateFrom, dateTo, minTotal, maxTotal]);

  const resetFilters = () => {
    setStatusFilter(""); setPurposeFilter(""); setSearchQ("");
    setDateFrom(""); setDateTo(""); setMinTotal(""); setMaxTotal("");
    setEventFilter(""); // VM1-04
    setProjectFilter(""); // VM1-10
  };
  const hasActiveFilters = !!(statusFilter || purposeFilter || searchQ || dateFrom || dateTo || minTotal || maxTotal || eventFilter || projectFilter);

  // "Te așteaptă" — real counts for the action banner (role-aware, loaded once)
  const [inboxCount, setInboxCount] = useState(0);
  const [isFinance, setIsFinance] = useState(false);

  // VF-202: top budget codes near/over their limit (finance/par_admin only).
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetCodeUsage[]>([]);

  useEffect(() => {
    // VM1-04: load events for filter dropdown
    listEvents().then((r) => setEvents(r.events)).catch(() => setEvents([]));
    // VM1-10: project id→name map (for the active-project filter chip from a Folder click)
    listProjects().then((r) => setProjectsMap(Object.fromEntries(r.items.map((p) => [p.id, p.name])))).catch(() => setProjectsMap({}));
    // Non-approvers get an empty inbox (no 403), so this is safe for everyone.
    getParInbox()
      .then((r) => setInboxCount(r.total))
      .catch(() => setInboxCount(0));
    getParMe()
      .then((r) => {
        const elevated = r.roles.includes("finance") || r.roles.includes("par_admin");
        setIsFinance(elevated);
        if (r.roles.includes("par_admin")) {
          // PARQA-013: send the admin to the onboarding wizard ONLY for a genuinely new/empty org
          // (no departments AND no budget codes yet) whose onboarding isn't done — never bounce an
          // already-configured tenant whose onboardingComplete flag was simply never set.
          getParSettings()
            .then(async (s) => {
              if (s.onboardingComplete) return;
              const [depts, codes] = await Promise.all([
                listDepartments().catch(() => ({ items: [] })),
                listBudgetCodes().catch(() => ({ items: [] })),
              ]);
              const empty = (depts.items?.length ?? 0) === 0 && (codes.items?.length ?? 0) === 0;
              if (empty) navigate("/business/par/onboarding");
            })
            .catch(() => { /* non-blocking */ });
        }
        if (elevated) {
          getBudgetCodesUsage()
            .then((u) => {
              const near = u.usage
                .filter((c) => c.usedPct != null && c.usedPct >= 80)
                .sort((a, b) => (b.usedPct ?? 0) - (a.usedPct ?? 0))
                .slice(0, 3);
              setBudgetAlerts(near);
            })
            .catch(() => setBudgetAlerts([]));
        }
      })
      .catch(() => setIsFinance(false));
  }, []);

  // Load data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const minN = parseFloat(minTotal.replace(",", "."));
        const maxN = parseFloat(maxTotal.replace(",", "."));
        const res = await listPar({
          status: statusFilter || undefined,
          purpose: purposeFilter || undefined,
          q: searchQ || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          min_total: Number.isFinite(minN) ? Math.round(minN * 100) : undefined,
          max_total: Number.isFinite(maxN) ? Math.round(maxN * 100) : undefined,
        });
        setRequests(res.requests);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Eroare la încărcare");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [statusFilter, purposeFilter, searchQ, dateFrom, dateTo, minTotal, maxTotal]);

  // Derived sections — apply event + project filters client-side (VM1-04 / VM1-10).
  const filteredByEvent = (eventFilter
    ? requests.filter((r) => (r as ParRequest & { eventId?: string | null }).eventId === eventFilter)
    : requests
  ).filter((r) => !projectFilter || r.projectId === projectFilter);
  const myRequests = filteredByEvent;
  const pendingApproval = filteredByEvent.filter((r) => r.status === "pending_approval");
  const awaitingPayment = filteredByEvent.filter((r) => r.status === "in_finance");

  // Summary totals
  const totalActive = requests
    .filter((r) => !["cancelled", "rejected", "paid"].includes(r.status))
    .reduce((sum, r) => sum + r.totalEstimatedCents, 0);

  const totalPaid = requests
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + r.totalEstimatedCents, 0);

  return (
    <AppShell pageTitle={t("dashboard.title")}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary flex-shrink-0" aria-hidden />
            <div>
              <h1 className="text-xl font-semibold text-foreground">{t("dashboard.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/business/par/new")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
            aria-label="Cerere PAR nouă"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Cerere nouă
          </button>
        </div>

        {/* "Te așteaptă" — one-click deep links to where decisions are needed */}
        {(inboxCount > 0 || (isFinance && awaitingPayment.length > 0)) && (
          <div className="space-y-2">
            {inboxCount > 0 && (
              <button
                type="button"
                onClick={() => navigate("/business/par/inbox")}
                className="w-full flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-left hover:bg-primary/10 transition-colors min-h-[44px]"
              >
                <span className="flex items-center gap-3">
                  <Inbox className="h-5 w-5 text-primary flex-shrink-0" aria-hidden />
                  <span className="text-sm font-medium text-foreground">
                    <strong>{inboxCount}</strong> {inboxCount === 1 ? "cerere așteaptă" : "cereri așteaptă"} decizia ta
                  </span>
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-primary">
                  Deschide inbox <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </button>
            )}
            {isFinance && awaitingPayment.length > 0 && (
              <button
                type="button"
                onClick={() => navigate("/business/par/finance")}
                className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-left hover:bg-muted transition-colors min-h-[44px]"
              >
                <span className="flex items-center gap-3">
                  <Landmark className="h-5 w-5 text-primary flex-shrink-0" aria-hidden />
                  <span className="text-sm font-medium text-foreground">
                    <strong>{awaitingPayment.length}</strong> {awaitingPayment.length === 1 ? "cerere e" : "cereri sunt"} la finanțe, în așteptarea plății
                  </span>
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-primary">
                  Deschide finanțe <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </button>
            )}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SummaryCard label={t("dashboard.total")} value={String(requests.length)} />
          <SummaryCard label={t("dashboard.active")} value={formatMDL(totalActive)} highlight />
          <SummaryCard label={t("dashboard.paid")} value={formatMDL(totalPaid)} />
        </div>

        {/* VF-202: budget alerts (finance/par_admin only) */}
        {isFinance && budgetAlerts.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Landmark className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Bugete aproape de limită</h2>
            </div>
            <div className="space-y-2.5">
              {budgetAlerts.map((c) => {
                const pct = c.usedPct ?? 0;
                const bar = pct > 100 ? "bg-destructive" : "bg-yellow-500";
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-foreground">{c.code}</span>
                      <span className={pct > 100 ? "text-destructive font-medium" : "text-muted-foreground"}>
                        {formatMDL(c.usedCents)} / {formatMDL(c.allocatedCents)} · {pct}%{pct > 100 ? " — depășit" : ""}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Caută după număr..."
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              aria-label="Caută cereri PAR după număr"
            />
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ParStatus | "")}
              aria-label="Filtrează după status"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Purpose filter */}
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value as ParPurpose | "")}
            aria-label="Filtrează după scop"
          >
            {PURPOSE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* VM1-04: Event filter (shows only when events exist) */}
          {events.length > 0 && (
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              aria-label="Filtrează după eveniment"
            >
              <option value="">Toate evenimentele</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          )}

          {/* VF-105: more filters toggle */}
          <button
            type="button"
            onClick={() => setShowMoreFilters((v) => !v)}
            aria-expanded={showMoreFilters}
            className={cn(
              "inline-flex items-center gap-1.5 h-10 rounded-md border px-3 text-sm min-h-[44px] transition-colors",
              showMoreFilters || dateFrom || dateTo || minTotal || maxTotal
                ? "border-primary text-primary bg-primary/5"
                : "border-input text-muted-foreground hover:bg-muted"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Mai multe filtre
          </button>

          {projectFilter && (
            <button
              type="button"
              onClick={() => setProjectFilter("")}
              className="inline-flex items-center gap-1.5 h-10 rounded-md px-3 text-sm bg-primary/10 text-primary hover:bg-primary/20 min-h-[44px]"
              aria-label="Elimină filtrul de proiect"
            >
              Proiect: {projectsMap[projectFilter] ?? "selectat"}
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 h-10 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
            >
              <X className="h-4 w-4" aria-hidden />
              Resetează
            </button>
          )}
        </div>

        {/* VF-105: advanced filters popover */}
        {showMoreFilters && (
          <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="date-from" className="block text-xs font-semibold mb-1.5 text-muted-foreground">De la data</label>
              <input id="date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="vf-input" />
            </div>
            <div>
              <label htmlFor="date-to" className="block text-xs font-semibold mb-1.5 text-muted-foreground">Până la data</label>
              <input id="date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="vf-input" />
            </div>
            <div>
              <label htmlFor="min-total" className="block text-xs font-semibold mb-1.5 text-muted-foreground">Sumă minimă (MDL)</label>
              <input id="min-total" type="number" min={0} value={minTotal} onChange={(e) => setMinTotal(e.target.value)} placeholder="0" className="vf-input" />
            </div>
            <div>
              <label htmlFor="max-total" className="block text-xs font-semibold mb-1.5 text-muted-foreground">Sumă maximă (MDL)</label>
              <input id="max-total" type="number" min={0} value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} placeholder="∞" className="vf-input" />
            </div>
          </div>
        )}

        {/* VF-105: active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {searchQ && <FilterChip label={`Caută: "${searchQ}"`} onRemove={() => setSearchQ("")} />}
            {statusFilter && <FilterChip label={`Status: ${PAR_STATUS_LABELS[statusFilter]}`} onRemove={() => setStatusFilter("")} />}
            {purposeFilter && <FilterChip label={PURPOSE_OPTIONS.find((o) => o.value === purposeFilter)?.label ?? purposeFilter} onRemove={() => setPurposeFilter("")} />}
            {dateFrom && <FilterChip label={`De la ${dateFrom}`} onRemove={() => setDateFrom("")} />}
            {dateTo && <FilterChip label={`Până la ${dateTo}`} onRemove={() => setDateTo("")} />}
            {minTotal && <FilterChip label={`≥ ${minTotal} MDL`} onRemove={() => setMinTotal("")} />}
            {maxTotal && <FilterChip label={`≤ ${maxTotal} MDL`} onRemove={() => setMaxTotal("")} />}
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă..." />
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-6">
            {/* My Requests */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Cererile mele">
              <button type="button" role="tab" aria-selected={statusFilter === ""} onClick={() => setStatusFilter("")}
                className={cn("rounded-full px-3 py-1.5 text-sm font-medium", statusFilter === "" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
                Toate cererile
              </button>
              <button type="button" role="tab" aria-selected={statusFilter === "draft"} onClick={() => setStatusFilter("draft")}
                className={cn("rounded-full px-3 py-1.5 text-sm font-medium", statusFilter === "draft" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
                Ciorne
              </button>
              <button type="button" role="tab" aria-selected={statusFilter === "changes_requested"} onClick={() => setStatusFilter("changes_requested")}
                className={cn("rounded-full px-3 py-1.5 text-sm font-medium", statusFilter === "changes_requested" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
                Întoarse pentru modificări
              </button>
            </div>
            <Section
              title={statusFilter === "draft" ? "Ciornele mele" : statusFilter === "changes_requested" ? "Cereri întoarse pentru modificări" : "Cererile mele"}
              count={myRequests.length}
              requests={myRequests}
              onRowClick={(id) => navigate(`/business/par/${id}`)}
              emptyMessage="Nu ai cereri de plată încă."
              projectsMap={projectsMap}
            />

            {/* Pending my approval (only shown if there are any) */}
            {pendingApproval.length > 0 && (
              <Section
                title="În proces de aprobare"
                count={pendingApproval.length}
                requests={pendingApproval}
                onRowClick={(id) => navigate(`/business/par/${id}`)}
                emptyMessage=""
                projectsMap={projectsMap}
                highlight
              />
            )}

            {/* Awaiting payment (only shown if there are any) */}
            {awaitingPayment.length > 0 && (
              <Section
                title="La finanțe — în așteptarea plății"
                count={awaitingPayment.length}
                requests={awaitingPayment}
                onRowClick={(id) => navigate(`/business/par/${id}`)}
                emptyMessage=""
                projectsMap={projectsMap}
                highlight
              />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── Section component ────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  count: number;
  requests: (ParRequest & { above_micro_threshold: boolean })[];
  onRowClick: (id: string) => void;
  emptyMessage: string;
  highlight?: boolean;
  /** projectId → name, to render the project column as a name (not a UUID/placeholder). */
  projectsMap: Record<string, string>;
}

function Section({ title, count, requests, onRowClick, emptyMessage, highlight, projectsMap }: SectionProps) {
  return (
    <section aria-labelledby={`section-${title}`}>
      <div className="flex items-center gap-2 mb-3">
        <h2
          id={`section-${title}`}
          className="text-sm font-semibold text-foreground"
        >
          {title}
        </h2>
        {count > 0 && (
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
              highlight
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {count}
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm" role="grid" aria-label={title}>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Nr. cerere</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Proiect</th>
                <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Total (MDL)</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => onRowClick(r.id)}
                  onKeyDown={(e) => e.key === "Enter" && onRowClick(r.id)}
                  className="cursor-pointer hover:bg-muted/50 transition-colors focus-within:bg-muted/50"
                  tabIndex={0}
                  aria-label={`PAR ${r.requestNo}, ${PAR_STATUS_LABELS[r.status]}, ${formatMDL(r.totalEstimatedCents)}`}
                  role="row"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {r.requestNo}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {(() => {
                      const pid = (r as ParRequest & { projectId: string | null }).projectId;
                      return pid
                        ? <span className="text-xs bg-muted px-2 py-0.5 rounded" title={projectsMap[pid] ?? ""}>{projectsMap[pid] ?? "Proiect"}</span>
                        : "—";
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    <span className={r.above_micro_threshold ? "text-orange-700 dark:text-orange-300" : "text-foreground"}>
                      {formatMDL(r.totalEstimatedCents)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ParStatusChip status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                    {new Date(r.createdAt).toLocaleDateString("ro-MD", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

// VF-105: removable active-filter chip
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Elimină filtrul ${label}`} className="hover:text-primary/70">
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn(
        "text-lg font-semibold",
        highlight ? "text-primary" : "text-foreground"
      )}>
        {value}
      </p>
    </div>
  );
}
