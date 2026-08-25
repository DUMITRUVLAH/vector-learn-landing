/**
 * VM1-10b: Foldere PAR — navigare ca într-un drive.
 *
 * Un singur nivel pe ecran, exact ca în Google Drive:
 *
 *   Proiecte → (Evenimente) → Statusuri → Cereri (PAR) → Documentele cererii
 *
 * Nivelul curent trăiește în URL (`?p=…&e=…&b=…&id=…`, vezi `@/lib/par/folders`), deci Back-ul
 * browserului, refresh-ul și link-ul trimis unui coleg funcționează. Nivelul final NU mai aruncă
 * utilizatorul în lista globală de cereri (bug-ul raportat: "mă duce și văd toate cererile") —
 * arată documentele acelei cereri: atașamentele dosarului plus ce a adăugat finanțele (ordin de
 * plată / confirmarea plății).
 *
 * Statisticile (număr cereri, total MDL, de aprobat / aprobate / plătite) rămân — dar recalculate
 * pentru folderul în care ești, nu doar pentru rădăcină.
 *
 * CORE: backlog/par/PAR-CORE.md · Design: Vector 365 tokens, light+dark, WCAG AA.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Landmark,
  Paperclip,
  ReceiptText,
  Search,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { ParStatusChip } from "@/components/par/ParStatusChip";
import { useRouter } from "@/router/HashRouter";
import {
  downloadDosar,
  formatMDL,
  getPar,
  listEvents,
  listPar,
  listProjects,
  type ParAttachment,
  type ParDetail,
  type ParEvent,
  type ParListRow,
  type ParProject,
} from "@/lib/api/par";
import {
  attachmentKindLabel,
  buildBreadcrumb,
  buildEventFolders,
  buildFolderHref,
  buildProjectFolders,
  buildBuckets,
  bucketDef,
  isFinanceDoc,
  levelOf,
  parentLocation,
  parseFolderLocation,
  scopeRows,
  sumMdlCents,
  type BucketFolder,
  type BucketKey,
  type FolderLocation,
} from "@/lib/par/folders";
import { openParAttachment } from "@/lib/parFiles";
import { cn } from "@/lib/utils";
import { Alert, Badge, Button, Card, EmptyState, Input, KpiTile, PastelIcon, Skeleton } from "@/components/ds";
import type { ChipTone } from "@/components/ds";

// ─── Row primitives ───────────────────────────────────────────────────────────

interface FolderRowProps {
  icon: React.ReactNode;
  name: string;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  href: string;
  ariaLabel: string;
}

/** A folder line. Rendered as a real anchor so middle-click / "open in new tab" work. */
function FolderRow({ icon, name, subtitle, badges, meta, href, ariaLabel }: FolderRowProps) {
  return (
    <a
      href={`#${href}`}
      aria-label={ariaLabel}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{name}</span>
        {subtitle ? <span className="block truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
      {badges ? <span className="hidden items-center gap-1.5 md:flex">{badges}</span> : null}
      {meta ? <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">{meta}</span> : null}
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
    </a>
  );
}

/** Folder-icon tint per status bucket (ChipTone — no hex in .tsx). */
const BUCKET_TONE: Record<BucketKey, ChipTone> = {
  draft: "sky",
  pending: "amber",
  approved: "blue",
  paid: "emerald",
  closed: "rose",
};

function BucketBadges({ buckets }: { buckets: BucketFolder[] }) {
  return (
    <>
      {buckets
        .filter((b) => bucketDef(b.key).core)
        .map((b) => (
          <Badge
            key={b.key}
            variant={b.key === "pending" ? "warning" : b.key === "approved" ? "info" : "success"}
            className="tabular-nums"
          >
            {b.label}: {b.count}
          </Badge>
        ))}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ParFolders() {
  const { path, navigate } = useRouter();
  const loc = useMemo(() => parseFolderLocation(path), [path]);
  const level = levelOf(loc);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParListRow[]>([]);
  const [projects, setProjects] = useState<ParProject[]>([]);
  const [events, setEvents] = useState<ParEvent[]>([]);
  const [query, setQuery] = useState("");

  // Detail of the opened PAR (documents level).
  const [par, setPar] = useState<ParDetail | null>(null);
  const [parLoading, setParLoading] = useState(false);
  const [parError, setParError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [reqRes, projRes, evtRes] = await Promise.all([
          // include_docs: doc count + ordin de plată / confirmare, în același răspuns (fără N cereri).
          listPar({ include_docs: true }),
          listProjects(),
          listEvents(),
        ]);
        if (!alive) return;
        setRows(reqRes.requests ?? []);
        setProjects((projRes.items ?? []).filter((p) => p.active));
        setEvents((evtRes.events ?? []).filter((e) => e.active));
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Eroare la încărcare");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Documents level: load the dossier of the opened PAR.
  useEffect(() => {
    if (!loc.parId) {
      setPar(null);
      setParError(null);
      return;
    }
    let alive = true;
    setParLoading(true);
    getPar(loc.parId)
      .then((detail) => {
        if (!alive) return;
        setPar(detail);
        setParError(null);
      })
      .catch((e) => {
        if (alive) setParError(e instanceof Error ? e.message : "Cererea nu a putut fi deschisă");
      })
      .finally(() => {
        if (alive) setParLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loc.parId]);

  // Clear the filter box when changing folder — a leftover query on a new level looks like "empty folder".
  useEffect(() => setQuery(""), [loc.projectId, loc.eventId, loc.bucket, loc.parId]);

  const go = useCallback((next: FolderLocation) => navigate(buildFolderHref(next)), [navigate]);

  const knownProjectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const scoped = useMemo(() => scopeRows(rows, loc, knownProjectIds), [rows, loc, knownProjectIds]);
  const buckets = useMemo(() => buildBuckets(scoped), [scoped]);
  const projectName = useMemo(
    () => (loc.projectId ? (projects.find((p) => p.id === loc.projectId)?.name ?? "Proiect") : null),
    [projects, loc.projectId],
  );
  const eventName = useMemo(
    () => (loc.eventId ? (events.find((e) => e.id === loc.eventId)?.name ?? "Eveniment") : null),
    [events, loc.eventId],
  );

  const crumbs = buildBreadcrumb(loc, {
    projectName,
    eventName,
    parLabel: par?.requestNo ?? (loc.parId ? "Cerere" : null),
  });
  const parent = parentLocation(loc);

  // ─── Loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <BusinessShell pageTitle="Foldere PAR" pageDescription="Navighezi pe foldere, ca într-un drive">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[132px] rounded-2xl" />
            ))}
          </div>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </BusinessShell>
    );
  }

  if (error) {
    return (
      <BusinessShell pageTitle="Foldere PAR">
        <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" />}>
          {error}
        </Alert>
      </BusinessShell>
    );
  }

  // ─── Listings ──────────────────────────────────────────────────────────────

  const q = query.trim().toLocaleLowerCase("ro");
  const matches = (...fields: (string | null | undefined)[]) =>
    !q || fields.some((f) => (f ?? "").toLocaleLowerCase("ro").includes(q));

  const projectFolders = buildProjectFolders(rows, projects, events).filter((f) =>
    matches(f.projectName, f.donor),
  );
  const eventFolders = buildEventFolders(scoped, events).filter((f) => matches(f.eventName));
  const parRows = scoped.filter((r) => matches(r.requestNo, r.payeeName, r.endUse));

  const headerCounts = {
    count: level === "root" ? rows.length : scoped.length,
    totalMdl: level === "root" ? sumMdlCents(rows) : sumMdlCents(scoped),
  };

  return (
    <BusinessShell pageTitle="Foldere PAR" pageDescription="Navighezi pe foldere, ca într-un drive">
      <div className="space-y-4">
        {/* Breadcrumb + back. At the root the single crumb would just repeat the page title. */}
        <div className={cn("flex flex-wrap items-center gap-2", level === "root" && "hidden")}>
          {parent && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => go(parent)}
              aria-label="Înapoi la folderul precedent"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Înapoi
            </Button>
          )}
          <nav aria-label="Cale foldere" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
            {crumbs.map((crumb, i) => (
              <span key={crumb.href + i} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />}
                {crumb.current ? (
                  <span className="truncate font-medium text-foreground" aria-current="page">
                    {crumb.label}
                  </span>
                ) : (
                  <a href={`#${crumb.href}`} className="truncate text-muted-foreground hover:text-foreground hover:underline">
                    {crumb.label}
                  </a>
                )}
              </span>
            ))}
          </nav>
        </div>

        {level === "par" ? (
          <ParDocuments
            par={par}
            loading={parLoading}
            error={parError}
            downloading={downloading}
            onDownloadDosar={async () => {
              if (!par) return;
              setDownloading(true);
              try {
                await downloadDosar(par.id, par.requestNo);
              } catch (e) {
                setParError(e instanceof Error ? e.message : "Dosarul nu a putut fi descărcat");
              } finally {
                setDownloading(false);
              }
            }}
            onOpenRequest={() => navigate(`/business/par/${par?.id ?? ""}`)}
          />
        ) : (
          <>
            {/* Stats for the CURRENT folder */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <KpiTile
                label={level === "root" ? "Total cereri" : "Cereri în folder"}
                value={headerCounts.count}
                tone="indigo"
                icon={<ClipboardList className="h-5 w-5" />}
              />
              <KpiTile
                label="Total MDL"
                value={formatMDL(headerCounts.totalMdl)}
                tone="emerald"
                icon={<Landmark className="h-5 w-5" />}
              />
              {level === "root" ? (
                <KpiTile
                  label="Proiecte"
                  value={projectFolders.filter((f) => f.projectId !== null).length}
                  tone="violet"
                  icon={<FolderOpen className="h-5 w-5" />}
                />
              ) : level === "bucket" ? (
                // Inside a status folder, "de aprobat" would always read 0 (or everything) — the
                // useful number here is how many documents the folder holds.
                <KpiTile
                  label="Documente"
                  value={scoped.reduce((sum, r) => sum + (r.docs?.count ?? 0), 0)}
                  tone="sky"
                  icon={<Paperclip className="h-5 w-5" />}
                />
              ) : (
                <KpiTile
                  label="De aprobat"
                  value={buckets.find((b) => b.key === "pending")?.count ?? 0}
                  tone="amber"
                  icon={<ClipboardList className="h-5 w-5" />}
                />
              )}
            </div>

            {/* Filter inside the current folder */}
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={level === "bucket" ? "Caută cerere, beneficiar…" : "Caută folder…"}
              aria-label="Caută în folderul curent"
              icon={<Search className="h-4 w-4" />}
            />

            {level === "root" && <RootListing folders={projectFolders} />}
            {(level === "project" || level === "event") && (
              <FolderListing
                loc={loc}
                buckets={buckets.filter((b) => matches(b.label))}
                events={level === "project" ? eventFolders : []}
                empty={scoped.length === 0}
              />
            )}
            {level === "bucket" && <ParListing loc={loc} rows={parRows} />}
          </>
        )}
      </div>
    </BusinessShell>
  );
}

// ─── Level: root (projects) ───────────────────────────────────────────────────

function RootListing({ folders }: { folders: ReturnType<typeof buildProjectFolders> }) {
  if (folders.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-6 w-6" />}
        title="Niciun folder"
        description="Folderele apar pe măsură ce sunt configurate proiecte sau se creează cereri."
      />
    );
  }
  return (
    <div className="space-y-2">
      {folders.map((folder) => (
        <FolderRow
          key={folder.projectId ?? "__none__"}
          href={buildFolderHref({ projectId: folder.projectId })}
          icon={
            <PastelIcon tone="violet" size={32}>
              <Folder className="h-4 w-4" />
            </PastelIcon>
          }
          name={folder.projectName}
          subtitle={
            [
              folder.donor,
              folder.eventCount > 0 ? `${folder.eventCount} evenimente` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          badges={<BucketBadges buckets={folder.buckets} />}
          meta={`${formatMDL(folder.totalMdlCents)} · ${folder.count} cereri`}
          ariaLabel={`Deschide folderul ${folder.projectName}: ${folder.count} cereri, ${formatMDL(folder.totalMdlCents)}`}
        />
      ))}
    </div>
  );
}

// ─── Level: project / event (status sub-folders) ──────────────────────────────

function FolderListing({
  loc,
  buckets,
  events,
  empty,
}: {
  loc: FolderLocation;
  buckets: BucketFolder[];
  events: ReturnType<typeof buildEventFolders>;
  empty: boolean;
}) {
  if (empty) {
    return (
      <EmptyState
        icon={<Folder className="h-6 w-6" />}
        title="Folder gol"
        description="Nicio cerere pe acest proiect încă. Apare aici imediat ce se creează una."
      />
    );
  }
  return (
    <div className="space-y-4">
      {events.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Evenimente
          </h2>
          {events.map((ev) => (
            <FolderRow
              key={ev.eventId}
              href={buildFolderHref({ projectId: loc.projectId, eventId: ev.eventId })}
              icon={
                <PastelIcon tone="teal" size={32}>
                  <CalendarDays className="h-4 w-4" />
                </PastelIcon>
              }
              name={ev.eventName}
              badges={<BucketBadges buckets={ev.buckets} />}
              meta={`${formatMDL(ev.totalMdlCents)} · ${ev.count} cereri`}
              ariaLabel={`Deschide folderul evenimentului ${ev.eventName}: ${ev.count} cereri`}
            />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {events.length > 0 ? "Toate cererile, pe status" : "Pe status"}
        </h2>
        {buckets.map((bucket) => (
          <FolderRow
            key={bucket.key}
            href={buildFolderHref({ projectId: loc.projectId, eventId: loc.eventId, bucket: bucket.key })}
            icon={
              <PastelIcon tone={BUCKET_TONE[bucket.key]} size={32}>
                <Folder className="h-4 w-4" />
              </PastelIcon>
            }
            name={bucket.label}
            meta={`${formatMDL(bucket.totalMdlCents)} · ${bucket.count} cereri`}
            ariaLabel={`Deschide folderul ${bucket.label}: ${bucket.count} cereri, ${formatMDL(bucket.totalMdlCents)}`}
          />
        ))}
      </section>
    </div>
  );
}

// ─── Level: bucket (the PAR requests) ─────────────────────────────────────────

function ParListing({ loc, rows }: { loc: FolderLocation; rows: ParListRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" />}
        title="Nicio cerere aici"
        description={`Folderul „${bucketDef(loc.bucket ?? "pending").label}" este gol.`}
      />
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const docs = row.docs;
        return (
          <a
            key={row.id}
            href={`#${buildFolderHref({ ...loc, parId: row.id })}`}
            aria-label={`Deschide documentele cererii ${row.requestNo}`}
            className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PastelIcon tone="indigo" size={32}>
              <FileText className="h-4 w-4" />
            </PastelIcon>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground">
                {row.requestNo}
                {row.payeeName ? <span className="font-normal text-muted-foreground"> · {row.payeeName}</span> : null}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {row.endUse || "Fără descriere"}
              </span>
            </span>
            <span className="hidden items-center gap-1.5 lg:flex">
              {docs ? (
                <Badge variant="outline" className="tabular-nums">
                  <Paperclip className="mr-1 h-3 w-3" aria-hidden />
                  {docs.count}
                </Badge>
              ) : null}
              {docs?.has_payment_order && <Badge variant="success">Ordin de plată</Badge>}
              {docs?.has_payment_proof && <Badge variant="success">Confirmare</Badge>}
              {row.status === "paid" && docs && !docs.has_payment_order && !docs.has_payment_proof && (
                <Badge variant="warning">Fără dovadă de plată</Badge>
              )}
            </span>
            <ParStatusChip status={row.status} />
            <span className="hidden text-xs font-medium tabular-nums text-foreground sm:block">
              {formatMDL(row.totalMdlCents ?? row.totalEstimatedCents)}
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
          </a>
        );
      })}
    </div>
  );
}

// ─── Level: par (the documents) ───────────────────────────────────────────────

function DocRow({ att, parId }: { att: ParAttachment; parId: string }) {
  return (
    <button
      type="button"
      onClick={() => void openParAttachment(att.fileUrl, att.fileName, parId, att.id)}
      aria-label={`Deschide documentul ${att.fileName}`}
      className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PastelIcon tone={isFinanceDoc(att.kind) ? "emerald" : "sky"} size={32}>
        {isFinanceDoc(att.kind) ? <ReceiptText className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </PastelIcon>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{att.fileName}</span>
        <span className="block text-xs text-muted-foreground">
          {attachmentKindLabel(att.kind, att.kindOther)}
          {att.createdAt ? ` · ${new Date(att.createdAt).toLocaleDateString("ro-MD")}` : ""}
        </span>
      </span>
      <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function ParDocuments({
  par,
  loading,
  error,
  downloading,
  onDownloadDosar,
  onOpenRequest,
}: {
  par: ParDetail | null;
  loading: boolean;
  error: string | null;
  downloading: boolean;
  onDownloadDosar: () => void;
  onOpenRequest: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 rounded-2xl" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }
  if (error || !par) {
    return (
      <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" />}>
        {error ?? "Cererea nu a putut fi încărcată."}
      </Alert>
    );
  }

  const attachments = par.attachments ?? [];
  const requestDocs = attachments.filter((a) => !isFinanceDoc(a.kind));
  const financeDocs = attachments.filter((a) => isFinanceDoc(a.kind));
  const payment = par.payment;
  const proofUrl = payment?.proofUrl ?? null;
  const hasFinanceEvidence = financeDocs.length > 0 || Boolean(proofUrl);

  return (
    <div className="space-y-4">
      {/* Request summary — the "file card" of this folder */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <PastelIcon tone="indigo" size={40}>
            <FileText className="h-5 w-5" />
          </PastelIcon>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{par.requestNo}</h2>
              <ParStatusChip status={par.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {par.payeeName || "Beneficiar nespecificat"} ·{" "}
              <span className="font-medium text-foreground">
                {formatMDL(par.totalMdlCents ?? par.totalEstimatedCents)}
              </span>
              {par.projectName ? ` · ${par.projectName}` : ""}
              {par.eventName ? ` · ${par.eventName}` : ""}
            </p>
            {par.endUse ? <p className="mt-1 text-sm text-foreground">{par.endUse}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onOpenRequest} aria-label="Deschide cererea completă">
              <ExternalLink className="h-4 w-4" aria-hidden />
              Deschide cererea
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadDosar}
              disabled={downloading}
              aria-label="Descarcă dosarul complet în PDF"
            >
              <Download className="h-4 w-4" aria-hidden />
              {downloading ? "Se pregătește…" : "Dosar PDF"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Documents of the request */}
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Documentele cererii ({requestDocs.length})
        </h2>
        {requestDocs.length === 0 ? (
          // A compact note, not a full-height EmptyState: this is one section of the dossier, and a
          // giant empty block here pushed the finance documents below the fold.
          <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            Niciun document atașat. Facturile, contractele și ofertele cererii apar aici.
          </p>
        ) : (
          requestDocs.map((att) => <DocRow key={att.id} att={att} parId={par.id} />)
        )}
      </section>

      {/* Finance: payment order / confirmation */}
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Plata (finanțe)
        </h2>

        {payment?.paymentDate || payment?.paymentRef || payment?.actualAmountCents != null ? (
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
            {payment?.actualAmountCents != null && (
              <span className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Sumă achitată:</span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatMDL(payment.actualAmountCents)}
                </span>
              </span>
            )}
            {payment?.paymentDate && (
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Data plății:</span>
                <span className="font-medium text-foreground">
                  {new Date(payment.paymentDate).toLocaleDateString("ro-MD")}
                </span>
              </span>
            )}
            {payment?.paymentRef && (
              <span className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Referință:</span>
                <span className="font-medium text-foreground">{payment.paymentRef}</span>
              </span>
            )}
          </Card>
        ) : null}

        {financeDocs.map((att) => (
          <DocRow key={att.id} att={att} parId={par.id} />
        ))}

        {proofUrl && (
          <button
            type="button"
            onClick={() => void openParAttachment(proofUrl, `Confirmare_plata_${par.requestNo}`)}
            aria-label="Deschide confirmarea plății"
            className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PastelIcon tone="emerald" size={32}>
              <ReceiptText className="h-4 w-4" />
            </PastelIcon>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground">Confirmarea plății</span>
              <span className="block text-xs text-muted-foreground">Dovada încărcată de finanțe</span>
            </span>
            <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
          </button>
        )}

        {!hasFinanceEvidence && (
          <Alert
            variant={par.status === "paid" ? "warning" : "default"}
            icon={<AlertCircle className="h-4 w-4" />}
          >
            {par.status === "paid"
              ? "Cererea e marcată plătită, dar finanțele nu au atașat încă ordinul de plată sau confirmarea."
              : "Finanțele nu au încărcat încă ordinul de plată / confirmarea. Apar aici după executarea plății."}
          </Alert>
        )}
      </section>
    </div>
  );
}

export default ParFolders;
