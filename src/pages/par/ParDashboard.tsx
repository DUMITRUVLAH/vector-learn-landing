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
import { useState, useEffect, type ReactNode } from "react";
import { Plus, Search, Filter, Loader2, FileText, AlertCircle, Inbox, Landmark, ArrowRight, SlidersHorizontal, X, Clock } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  KpiTile,
  Label,
  Progress,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  PastelIcon,
} from "@/components/ds";
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
    <AppShell
      pageTitle={t("dashboard.title")}
      pageDescription={t("dashboard.subtitle")}
      actions={
        <Button onClick={() => navigate("/business/par/new")} aria-label="Cerere PAR nouă">
          <Plus className="h-4 w-4" aria-hidden />
          Cerere nouă
        </Button>
      }
    >
      <div className="space-y-6">

        {/* "Te așteaptă" — one-click deep links to where decisions are needed */}
        {(inboxCount > 0 || (isFinance && awaitingPayment.length > 0)) && (
          <div className="space-y-2">
            {inboxCount > 0 && (
              <ActionRow
                tone="amber"
                icon={<Inbox className="h-4 w-4" />}
                onClick={() => navigate("/business/par/inbox")}
                cta="Deschide inbox"
              >
                <strong>{inboxCount}</strong> {inboxCount === 1 ? "cerere așteaptă" : "cereri așteaptă"} decizia ta
              </ActionRow>
            )}
            {isFinance && awaitingPayment.length > 0 && (
              <ActionRow
                tone="emerald"
                icon={<Landmark className="h-4 w-4" />}
                onClick={() => navigate("/business/par/finance")}
                cta="Deschide finanțe"
              >
                <strong>{awaitingPayment.length}</strong> {awaitingPayment.length === 1 ? "cerere e" : "cereri sunt"} la finanțe, în așteptarea plății
              </ActionRow>
            )}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiTile label={t("dashboard.total")} value={requests.length} tone="indigo" icon={<FileText className="h-5 w-5" />} />
          <KpiTile label={t("dashboard.active")} value={formatMDL(totalActive)} tone="amber" icon={<Clock className="h-5 w-5" />} />
          <KpiTile label={t("dashboard.paid")} value={formatMDL(totalPaid)} tone="emerald" icon={<Landmark className="h-5 w-5" />} />
        </div>

        {/* VF-202: budget alerts (finance/par_admin only) */}
        {isFinance && budgetAlerts.length > 0 && (
          <Card tone="dashboard" className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <PastelIcon tone="rose" size={32}>
                <Landmark className="h-4 w-4" />
              </PastelIcon>
              <h2 className="text-sm font-semibold text-foreground">Bugete aproape de limită</h2>
            </div>
            <div className="space-y-3">
              {budgetAlerts.map((c) => {
                const pct = c.usedPct ?? 0;
                return (
                  <div key={c.id}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{c.code}</span>
                      <span className={pct > 100 ? "font-medium text-destructive" : "text-muted-foreground"}>
                        {formatMDL(c.usedCents)} / {formatMDL(c.allocatedCents)} · {pct}%{pct > 100 ? " — depășit" : ""}
                      </span>
                    </div>
                    <Progress
                      value={pct}
                      height={6}
                      tone={pct > 100 ? "destructive" : "warning"}
                      aria-label={`Buget ${c.code}: ${pct}% utilizat`}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="min-w-[200px] flex-1">
            <Input
              type="search"
              placeholder="Caută după număr..."
              icon={<Search className="h-4 w-4" />}
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              aria-label="Caută cereri PAR după număr"
            />
          </div>

          {/* Status filter */}
          <div className="flex w-auto items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Select
              className="w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ParStatus | "")}
              aria-label="Filtrează după status"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>

          {/* Purpose filter */}
          <Select
            className="w-auto"
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value as ParPurpose | "")}
            aria-label="Filtrează după scop"
          >
            {PURPOSE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>

          {/* VM1-04: Event filter (shows only when events exist) */}
          {events.length > 0 && (
            <Select
              className="w-auto"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              aria-label="Filtrează după eveniment"
            >
              <option value="">Toate evenimentele</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </Select>
          )}

          {/* VF-105: more filters toggle */}
          <Button
            variant="outline"
            onClick={() => setShowMoreFilters((v) => !v)}
            aria-expanded={showMoreFilters}
            className={cn(
              (showMoreFilters || dateFrom || dateTo || minTotal || maxTotal) &&
                "border-primary bg-primary/5 text-primary",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Mai multe filtre
          </Button>

          {projectFilter && (
            <Button
              variant="ghost"
              onClick={() => setProjectFilter("")}
              className="bg-primary/10 text-primary hover:bg-primary/20"
              aria-label="Elimină filtrul de proiect"
            >
              Proiect: {projectsMap[projectFilter] ?? "selectat"}
              <X className="h-4 w-4" aria-hidden />
            </Button>
          )}

          {hasActiveFilters && (
            <Button variant="ghost" onClick={resetFilters} className="text-muted-foreground">
              <X className="h-4 w-4" aria-hidden />
              Resetează
            </Button>
          )}
        </div>

        {/* VF-105: advanced filters popover */}
        {/* The four fields here used to carry a `vf-input` class that exists in no
            stylesheet — they rendered as raw browser inputs. Now real DS fields. */}
        {showMoreFilters && (
          <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="date-from">De la data</Label>
              <Input id="date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date-to">Până la data</Label>
              <Input id="date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min-total">Sumă minimă (MDL)</Label>
              <Input id="min-total" type="number" min={0} value={minTotal} onChange={(e) => setMinTotal(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-total">Sumă maximă (MDL)</Label>
              <Input id="max-total" type="number" min={0} value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} placeholder="∞" />
            </div>
          </Card>
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
          <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" />}>
            {error}
          </Alert>
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
            <Tabs
              aria-label="Cererile mele"
              value={statusFilter === "draft" || statusFilter === "changes_requested" ? statusFilter : "all"}
              onChange={(v) => setStatusFilter(v === "all" ? "" : (v as ParStatus))}
              tabs={[
                { value: "all", label: "Toate cererile" },
                { value: "draft", label: "Ciorne" },
                { value: "changes_requested", label: "Întoarse pentru modificări" },
              ]}
            />
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
          <Badge variant={highlight ? "default" : "secondary"}>{count}</Badge>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-4 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <Table aria-label={title}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nr. cerere</TableHead>
              <TableHead scope="col" className="hidden sm:table-cell">Proiect</TableHead>
              <TableHead scope="col" className="text-right">Total (MDL)</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col" className="hidden md:table-cell">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => (
              <TableRow
                key={r.id}
                interactive
                onClick={() => onRowClick(r.id)}
                onKeyDown={(e) => e.key === "Enter" && onRowClick(r.id)}
                tabIndex={0}
                aria-label={`PAR ${r.requestNo}, ${PAR_STATUS_LABELS[r.status]}, ${formatMDL(r.totalEstimatedCents)}`}
              >
                <TableCell className="font-medium text-foreground">{r.requestNo}</TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {(() => {
                    const pid = (r as ParRequest & { projectId: string | null }).projectId;
                    return pid ? (
                      <span className="rounded-sm bg-muted px-2 py-0.5 text-xs" title={projectsMap[pid] ?? ""}>
                        {projectsMap[pid] ?? "Proiect"}
                      </span>
                    ) : (
                      "—"
                    );
                  })()}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  <span className={r.above_micro_threshold ? "text-warning" : "text-foreground"}>
                    {formatMDL(r.totalEstimatedCents)}
                  </span>
                </TableCell>
                <TableCell>
                  <ParStatusChip status={r.status} />
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                  {new Date(r.createdAt).toLocaleDateString("ro-MD", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

// ─── Action row ───────────────────────────────────────────────────────────────

/** A "this needs you" row: pastel icon chip, sentence, arrow CTA on the right. */
function ActionRow({
  tone,
  icon,
  cta,
  onClick,
  children,
}: {
  tone: "amber" | "emerald";
  icon: ReactNode;
  cta: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
    >
      <span className="flex items-center gap-3">
        <PastelIcon tone={tone} size={32}>
          {icon}
        </PastelIcon>
        <span className="text-sm font-medium text-foreground">{children}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
        {cta} <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </button>
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
