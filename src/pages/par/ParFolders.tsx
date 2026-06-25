/**
 * VM1-10: PAR Folders — Proiect → status hierarchy
 *
 * Shows PAR requests organized as:
 *   Projects (incl. "Fără proiect")
 *     └─ De aprobat (pending_approval) — count + MDL total
 *     └─ Aprobate   (approved + in_finance)
 *     └─ Plătite    (paid)
 *
 * If VM1-04 events are present, optionally shows Proiect → Eveniment → status.
 * Click on a folder navigates to ParDashboard with pre-applied filters.
 *
 * Pure UI + aggregation over existing statuses — no new table, no new status.
 * Reuses totalMdlCents (VM1-03) for MDL totals.
 *
 * CORE: backlog/par/PAR-CORE.md
 * Design: Vector 365 tokens, light+dark, WCAG AA.
 */
import { useState, useEffect } from "react";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Loader2,
  AlertCircle,
  ClipboardList,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import {
  listPar,
  listProjects,
  listEvents,
  formatMDL,
  type ParRequest,
  type ParProject,
  type ParEvent,
} from "@/lib/api/par";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type FolderStatus = "pending_approval" | "approved_in_finance" | "paid";

interface FolderBucket {
  status: FolderStatus;
  label: string;
  statuses: string[];
  count: number;
  totalMdlCents: number;
}

interface ProjectFolder {
  projectId: string | null;
  projectName: string;
  totalCount: number;
  totalMdlCents: number;
  buckets: FolderBucket[];
  events: EventFolder[];
}

interface EventFolder {
  eventId: string;
  eventName: string;
  count: number;
  totalMdlCents: number;
  buckets: FolderBucket[];
}

// ─── Status groupings ─────────────────────────────────────────────────────────

const FOLDER_DEFS: { status: FolderStatus; label: string; statuses: string[] }[] = [
  {
    status: "pending_approval",
    label: "De aprobat",
    statuses: ["pending_approval", "changes_requested", "reapproval_required"],
  },
  {
    status: "approved_in_finance",
    label: "Aprobate",
    statuses: ["approved", "in_finance"],
  },
  {
    status: "paid",
    label: "Plătite",
    statuses: ["paid"],
  },
];

// ─── Aggregation helpers ──────────────────────────────────────────────────────

type ParRow = ParRequest & { eventId?: string | null; totalMdlCents?: number | null };

function buildBuckets(rows: ParRow[]): FolderBucket[] {
  return FOLDER_DEFS.map((def) => {
    const matching = rows.filter((r) => def.statuses.includes(r.status));
    return {
      ...def,
      count: matching.length,
      totalMdlCents: matching.reduce((s, r) => s + (r.totalMdlCents ?? r.totalEstimatedCents), 0),
    };
  }).filter((b) => b.count > 0);
}

function buildFolders(
  requests: ParRow[],
  projects: ParProject[],
  events: ParEvent[]
): ProjectFolder[] {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const eventMap = new Map(events.map((e) => [e.id, e.name]));

  // Group by projectId (null → "Fără proiect")
  const groups = new Map<string | null, ParRow[]>();
  groups.set(null, []);
  for (const p of projects) groups.set(p.id, []);

  for (const r of requests) {
    const key = r.projectId ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const folders: ProjectFolder[] = [];

  for (const [projectId, rows] of groups.entries()) {
    if (rows.length === 0 && projectId !== null) continue; // skip empty known projects

    // Sub-group by eventId
    const eventGroups = new Map<string, ParRow[]>();
    const noEvent: ParRow[] = [];
    for (const r of rows) {
      if (r.eventId) {
        if (!eventGroups.has(r.eventId)) eventGroups.set(r.eventId, []);
        eventGroups.get(r.eventId)!.push(r);
      } else {
        noEvent.push(r);
      }
    }

    const eventFolders: EventFolder[] = [];
    for (const [evId, evRows] of eventGroups.entries()) {
      eventFolders.push({
        eventId: evId,
        eventName: eventMap.get(evId) ?? evId.slice(0, 8),
        count: evRows.length,
        totalMdlCents: evRows.reduce((s, r) => s + (r.totalMdlCents ?? r.totalEstimatedCents), 0),
        buckets: buildBuckets(evRows),
      });
    }

    folders.push({
      projectId,
      projectName:
        projectId === null ? "Fără proiect" : (projectMap.get(projectId) ?? "Proiect necunoscut"),
      totalCount: rows.length,
      totalMdlCents: rows.reduce((s, r) => s + (r.totalMdlCents ?? r.totalEstimatedCents), 0),
      buckets: buildBuckets(rows),
      events: eventFolders,
    });
  }

  // Sort: "Fără proiect" at end, alphabetical otherwise
  return folders.sort((a, b) => {
    if (a.projectId === null) return 1;
    if (b.projectId === null) return -1;
    return a.projectName.localeCompare(b.projectName, "ro");
  });
}

// ─── Components ──────────────────────────────────────────────────────────────

const folderStatusColor: Record<FolderStatus, string> = {
  pending_approval: "text-yellow-600 dark:text-yellow-400",
  approved_in_finance: "text-blue-600 dark:text-blue-400",
  paid: "text-green-600 dark:text-green-400",
};

function BucketRow({ bucket, onNavigate }: { bucket: FolderBucket; onNavigate: () => void }) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors w-full text-left min-h-[44px] group"
      aria-label={`${bucket.label}: ${bucket.count} cereri, ${formatMDL(bucket.totalMdlCents)}`}
    >
      <Folder
        className={cn("h-4 w-4 flex-shrink-0", folderStatusColor[bucket.status])}
        aria-hidden
      />
      <span className="flex-1 text-sm text-foreground">{bucket.label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{bucket.count} cereri</span>
      <span className="text-xs font-medium text-foreground tabular-nums ml-2 hidden sm:inline">
        {formatMDL(bucket.totalMdlCents)}
      </span>
      <ChevronRight
        className="h-3 w-3 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-hidden
      />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ParFolders() {
  const { navigate } = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [openProjects, setOpenProjects] = useState<Set<string | null>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [reqRes, projRes, evtRes] = await Promise.all([
          listPar({}),
          listProjects(),
          listEvents(),
        ]);
        if (!alive) return;
        const reqs = (reqRes.requests ?? []) as ParRow[];
        const projs = projRes.items.filter((p) => p.active);
        const evts = evtRes.events.filter((e) => e.active);
        setFolders(buildFolders(reqs, projs, evts));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Eroare la încărcare");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const toggleProject = (projectId: string | null) => {
    setOpenProjects((prev) => {
      const next = new Set(prev);
      const key = projectId ?? "__null__";
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isOpen = (projectId: string | null) =>
    openProjects.has(projectId ?? "__null__");

  /** Navigate to dashboard pre-filtered by projectId + statuses */
  const goToDashboard = (projectId: string | null, statuses?: string[]) => {
    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    if (statuses && statuses.length === 1) params.set("status", statuses[0]);
    navigate(`/business/par${params.toString() ? `?${params.toString()}` : ""}`);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <BusinessShell pageTitle="Foldere PAR">
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>Se încarcă...</span>
        </div>
      </BusinessShell>
    );
  }

  if (error) {
    return (
      <BusinessShell pageTitle="Foldere PAR">
        <div role="alert" className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      </BusinessShell>
    );
  }

  const totalCount = folders.reduce((s, f) => s + f.totalCount, 0);
  const totalMdl = folders.reduce((s, f) => s + f.totalMdlCents, 0);

  return (
    <BusinessShell pageTitle="Foldere PAR" pageDescription="Vizualizare pe proiecte și statusuri">
      <div className="space-y-4">
        {/* Summary strip */}
        <div className="flex flex-wrap gap-4 p-4 rounded-lg bg-muted/50 text-sm">
          <div>
            <span className="text-muted-foreground">Total cereri: </span>
            <span className="font-semibold text-foreground">{totalCount}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total MDL: </span>
            <span className="font-semibold text-foreground">{formatMDL(totalMdl)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Proiecte: </span>
            <span className="font-semibold text-foreground">
              {folders.filter((f) => f.projectId !== null).length}
            </span>
          </div>
        </div>

        {/* Project folder list */}
        {folders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/40" aria-hidden />
            <p className="text-sm text-muted-foreground">Nu există cereri PAR.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {folders.map((folder) => {
              const opened = isOpen(folder.projectId);
              const folderKey = folder.projectId ?? "__null__";
              return (
                <div
                  key={folderKey}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                >
                  {/* Project header */}
                  <button
                    type="button"
                    onClick={() => toggleProject(folder.projectId)}
                    aria-expanded={opened}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted/50 transition-colors text-left min-h-[52px]"
                  >
                    {opened ? (
                      <FolderOpen className="h-5 w-5 text-primary flex-shrink-0" aria-hidden />
                    ) : (
                      <Folder className="h-5 w-5 text-primary/60 flex-shrink-0" aria-hidden />
                    )}
                    <span className="flex-1 font-medium text-foreground">{folder.projectName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">
                      {formatMDL(folder.totalMdlCents)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums ml-3">
                      {folder.totalCount} cereri
                    </span>
                    {opened ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden />
                    )}
                  </button>

                  {/* Expanded: status buckets */}
                  {opened && (
                    <div className="border-t border-border bg-background">
                      <div className="px-3 py-2 space-y-0.5">
                        {folder.buckets.length === 0 ? (
                          <p className="text-xs text-muted-foreground px-3 py-2">
                            Nicio cerere activă.
                          </p>
                        ) : (
                          folder.buckets.map((bucket) => (
                            <BucketRow
                              key={bucket.status}
                              bucket={bucket}
                              onNavigate={() =>
                                goToDashboard(folder.projectId, bucket.statuses)
                              }
                            />
                          ))
                        )}
                      </div>

                      {/* VM1-04: event sub-folders */}
                      {folder.events.length > 0 && (
                        <div className="border-t border-border px-3 py-2 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                            Pe eveniment
                          </p>
                          {folder.events.map((ev) => (
                            <div key={ev.eventId} className="ml-4">
                              <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                                <Folder className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                                <span className="flex-1 text-foreground font-medium">{ev.eventName}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {ev.count} cereri · {formatMDL(ev.totalMdlCents)}
                                </span>
                              </div>
                              <div className="ml-6 space-y-0.5">
                                {ev.buckets.map((bucket) => (
                                  <BucketRow
                                    key={bucket.status}
                                    bucket={bucket}
                                    onNavigate={() =>
                                      goToDashboard(folder.projectId, bucket.statuses)
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* View all for this project */}
                      <div className="border-t border-border px-4 py-2">
                        <button
                          type="button"
                          onClick={() => goToDashboard(folder.projectId)}
                          className="text-xs text-primary hover:underline"
                        >
                          Toate cererile acestui proiect →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BusinessShell>
  );
}

export default ParFolders;
