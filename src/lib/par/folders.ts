/**
 * VM1-10b: Foldere PAR — pure navigation + aggregation model (Google-Drive style).
 *
 * The page is a *navigator*, not an accordion: one folder level at a time, the current location
 * lives in the URL so Back/refresh/share work:
 *
 *   /business/par/folders                        → proiecte
 *   /business/par/folders?p=<projectId|none>     → subfoldere ale proiectului (evenimente + statusuri)
 *   /business/par/folders?p=…&e=<eventId>        → statusurile evenimentului
 *   /business/par/folders?p=…[&e=…]&b=<bucket>   → cererile (PAR) din folderul de status
 *   /business/par/folders?…&id=<parId>           → documentele acelei cereri
 *
 * Everything here is pure (rows in → view model out) so the flow is unit-testable without a DOM.
 * The old version inlined this logic in the .tsx AND duplicated it in the test file, so the test
 * validated a copy that could drift from what shipped (CLAUDE.md §3.5.1quater).
 */
import type { ParEvent, ParListRow, ParProject } from "@/lib/api/par";

// ─── Buckets ──────────────────────────────────────────────────────────────────

export type BucketKey = "draft" | "pending" | "approved" | "paid" | "closed";

export interface BucketDef {
  key: BucketKey;
  label: string;
  statuses: string[];
  /** Core buckets are always shown (even empty) so every folder has the same shape. */
  core: boolean;
}

export const BUCKET_DEFS: BucketDef[] = [
  { key: "draft", label: "Ciorne", statuses: ["draft"], core: false },
  {
    key: "pending",
    label: "De aprobat",
    statuses: ["pending_approval", "changes_requested", "reapproval_required"],
    core: true,
  },
  { key: "approved", label: "Aprobate", statuses: ["approved", "in_finance"], core: true },
  { key: "paid", label: "Plătite", statuses: ["paid"], core: true },
  { key: "closed", label: "Respinse / anulate", statuses: ["rejected", "cancelled"], core: false },
];

export function bucketDef(key: BucketKey): BucketDef {
  return BUCKET_DEFS.find((b) => b.key === key) ?? BUCKET_DEFS[1];
}

/** Which bucket a status belongs to (unknown statuses fall into "closed" so nothing disappears). */
export function bucketOf(status: string): BucketKey {
  return (BUCKET_DEFS.find((b) => b.statuses.includes(status))?.key ?? "closed") as BucketKey;
}

// ─── Location (URL ⇄ state) ───────────────────────────────────────────────────

/** `projectId: undefined` = root; `null` = the "Fără proiect" folder. */
export interface FolderLocation {
  projectId?: string | null;
  eventId?: string | null;
  bucket?: BucketKey | null;
  parId?: string | null;
}

export const NO_PROJECT = "none";
export const FOLDERS_PATH = "/business/par/folders";

/** Parse the hash path (`/business/par/folders?p=…&b=…`) into a location. */
export function parseFolderLocation(path: string): FolderLocation {
  const qIdx = path.indexOf("?");
  if (qIdx === -1) return {};
  const q = new URLSearchParams(path.slice(qIdx + 1));
  const p = q.get("p");
  const bucket = q.get("b");
  return {
    projectId: p === null ? undefined : p === NO_PROJECT ? null : p,
    eventId: q.get("e"),
    bucket: BUCKET_DEFS.some((b) => b.key === bucket) ? (bucket as BucketKey) : null,
    parId: q.get("id"),
  };
}

/** Build the hash href for a location (omitting empty levels). */
export function buildFolderHref(loc: FolderLocation): string {
  const q = new URLSearchParams();
  if (loc.projectId !== undefined) q.set("p", loc.projectId === null ? NO_PROJECT : loc.projectId);
  if (loc.eventId) q.set("e", loc.eventId);
  if (loc.bucket) q.set("b", loc.bucket);
  if (loc.parId) q.set("id", loc.parId);
  const qs = q.toString();
  return qs ? `${FOLDERS_PATH}?${qs}` : FOLDERS_PATH;
}

/** The level currently displayed — drives which listing the page renders. */
export type FolderLevel = "root" | "project" | "event" | "bucket" | "par";

export function levelOf(loc: FolderLocation): FolderLevel {
  if (loc.parId) return "par";
  if (loc.bucket) return "bucket";
  if (loc.eventId) return "event";
  if (loc.projectId !== undefined) return "project";
  return "root";
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function rowTotalMdlCents(row: Pick<ParListRow, "totalMdlCents" | "totalEstimatedCents">): number {
  return row.totalMdlCents ?? row.totalEstimatedCents;
}

export function sumMdlCents(rows: ParListRow[]): number {
  return rows.reduce((sum, r) => sum + rowTotalMdlCents(r), 0);
}

/**
 * Rows inside a location, ignoring the `parId` level (that one selects a single row).
 *
 * `knownProjectIds` must be the ids listed at the root: a request pointing at a project that was
 * deleted/deactivated is counted under "Fără proiect" there, so entering that folder has to show it
 * too — otherwise the folder's own header contradicts its contents.
 */
export function scopeRows(
  rows: ParListRow[],
  loc: FolderLocation,
  knownProjectIds?: Set<string>,
): ParListRow[] {
  let out = rows;
  if (loc.projectId === null && knownProjectIds) {
    out = out.filter((r) => !r.projectId || !knownProjectIds.has(r.projectId));
  } else if (loc.projectId !== undefined) {
    out = out.filter((r) => (r.projectId ?? null) === loc.projectId);
  }
  if (loc.eventId) out = out.filter((r) => (r.eventId ?? null) === loc.eventId);
  if (loc.bucket) {
    const def = bucketDef(loc.bucket);
    out = out.filter((r) => def.statuses.includes(r.status));
  }
  return out;
}

export interface BucketFolder {
  key: BucketKey;
  label: string;
  statuses: string[];
  count: number;
  totalMdlCents: number;
}

/**
 * Status sub-folders for a set of rows. Core buckets (De aprobat / Aprobate / Plătite) always
 * appear so the structure is predictable; Ciorne / Respinse only when they hold something — but
 * every row lands in exactly one bucket, so the bucket counts always add up to the folder total.
 */
export function buildBuckets(rows: ParListRow[]): BucketFolder[] {
  return BUCKET_DEFS.map((def) => {
    const matching = rows.filter((r) => def.statuses.includes(r.status));
    return {
      key: def.key,
      label: def.label,
      statuses: def.statuses,
      count: matching.length,
      totalMdlCents: sumMdlCents(matching),
    };
  }).filter((b) => b.count > 0 || bucketDef(b.key).core);
}

export interface ProjectFolder {
  projectId: string | null;
  projectName: string;
  donor: string | null;
  count: number;
  totalMdlCents: number;
  eventCount: number;
  buckets: BucketFolder[];
}

/**
 * Root listing: one folder per active project + "Fără proiect". Projects with no requests are
 * still listed (an empty folder is a real folder) — except "Fără proiect", which only shows up
 * when something actually sits outside a project.
 */
export function buildProjectFolders(
  rows: ParListRow[],
  projects: ParProject[],
  events: ParEvent[] = [],
): ProjectFolder[] {
  const byProject = new Map<string | null, ParListRow[]>();
  for (const row of rows) {
    const key = row.projectId ?? null;
    const list = byProject.get(key) ?? [];
    list.push(row);
    byProject.set(key, list);
  }

  const folders: ProjectFolder[] = projects.map((p) => {
    const projectRows = byProject.get(p.id) ?? [];
    return {
      projectId: p.id,
      projectName: p.name,
      donor: p.donor ?? null,
      count: projectRows.length,
      totalMdlCents: sumMdlCents(projectRows),
      eventCount: events.filter((e) => e.projectId === p.id).length,
      buckets: buildBuckets(projectRows),
    };
  });

  // Requests whose project was deleted/hidden must not vanish from the tree — they join "Fără proiect".
  const known = new Set(projects.map((p) => p.id));
  const orphanRows = rows.filter((r) => !r.projectId || !known.has(r.projectId));
  if (orphanRows.length > 0) {
    folders.push({
      projectId: null,
      projectName: "Fără proiect",
      donor: null,
      count: orphanRows.length,
      totalMdlCents: sumMdlCents(orphanRows),
      eventCount: 0,
      buckets: buildBuckets(orphanRows),
    });
  }

  return folders.sort((a, b) => {
    if (a.projectId === null) return 1;
    if (b.projectId === null) return -1;
    return a.projectName.localeCompare(b.projectName, "ro");
  });
}

export interface EventFolder {
  eventId: string;
  eventName: string;
  count: number;
  totalMdlCents: number;
  buckets: BucketFolder[];
}

/** Event sub-folders inside a project (VM1-04). Only events that carry requests are listed. */
export function buildEventFolders(rows: ParListRow[], events: ParEvent[]): EventFolder[] {
  const byEvent = new Map<string, ParListRow[]>();
  for (const row of rows) {
    if (!row.eventId) continue;
    const list = byEvent.get(row.eventId) ?? [];
    list.push(row);
    byEvent.set(row.eventId, list);
  }
  const nameOf = new Map(events.map((e) => [e.id, e.name]));
  return [...byEvent.entries()]
    .map(([eventId, eventRows]) => ({
      eventId,
      eventName: nameOf.get(eventId) ?? "Eveniment",
      count: eventRows.length,
      totalMdlCents: sumMdlCents(eventRows),
      buckets: buildBuckets(eventRows),
    }))
    .sort((a, b) => a.eventName.localeCompare(b.eventName, "ro"));
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

export interface Crumb {
  label: string;
  href: string;
  /** The last crumb is the current folder — rendered as text, not a link. */
  current: boolean;
}

export function buildBreadcrumb(
  loc: FolderLocation,
  names: { projectName?: string | null; eventName?: string | null; parLabel?: string | null },
): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Foldere PAR", href: FOLDERS_PATH, current: false }];
  if (loc.projectId !== undefined) {
    crumbs.push({
      label: loc.projectId === null ? "Fără proiect" : (names.projectName ?? "Proiect"),
      href: buildFolderHref({ projectId: loc.projectId }),
      current: false,
    });
  }
  if (loc.eventId) {
    crumbs.push({
      label: names.eventName ?? "Eveniment",
      href: buildFolderHref({ projectId: loc.projectId, eventId: loc.eventId }),
      current: false,
    });
  }
  if (loc.bucket) {
    crumbs.push({
      label: bucketDef(loc.bucket).label,
      href: buildFolderHref({ projectId: loc.projectId, eventId: loc.eventId, bucket: loc.bucket }),
      current: false,
    });
  }
  if (loc.parId) {
    crumbs.push({ label: names.parLabel ?? "Cerere", href: buildFolderHref(loc), current: false });
  }
  crumbs[crumbs.length - 1].current = true;
  return crumbs;
}

/** One level up — what the Back button and the "‹ Înapoi" row navigate to. */
export function parentLocation(loc: FolderLocation): FolderLocation | null {
  if (loc.parId) return { projectId: loc.projectId, eventId: loc.eventId, bucket: loc.bucket };
  if (loc.bucket) return { projectId: loc.projectId, eventId: loc.eventId };
  if (loc.eventId) return { projectId: loc.projectId };
  if (loc.projectId !== undefined) return {};
  return null;
}

// ─── Documents inside a PAR folder ────────────────────────────────────────────

export const ATTACHMENT_KIND_LABELS: Record<string, string> = {
  invoice: "Factură",
  contract: "Contract",
  quotation: "Ofertă",
  act_of_receipt: "Act de predare-primire",
  par_pdf: "Formular PAR (PDF)",
  payment_order: "Ordin de plată",
  other: "Alt document",
};

/** Documents added by finance after approval vs. documents that justify the request. */
export const FINANCE_KINDS = new Set(["payment_order"]);

export function isFinanceDoc(kind: string): boolean {
  return FINANCE_KINDS.has(kind);
}
