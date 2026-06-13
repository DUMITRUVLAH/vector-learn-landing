/**
 * ITPARK-101/201/401/402/403/601: Detaliu dosar de verificare MITP
 * Route: /app/fin/itpark/:id
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §1
 *
 * Header: date dosar (rezident, IDNO, an, status)
 * Taburi: Anexa 2 | Anexa 3 (revenue lines) | Anexa 4 (lunar + consistency) | Scrisori | Declarație
 * ITPARK-403: Anexa 4 tab navigates to /app/fin/itpark/:id/anexa4 (full page with consistency gate)
 * ITPARK-601: Export PDF button — whole-packet PDF + status=exported + audit
 */
import { useState, useEffect, lazy, Suspense } from "react";
import { Download, Loader2, FileText } from "lucide-react";
import { getEngagement, markEngagementExported, type ItparkEngagement } from "../../../../lib/api/itparkEngagements";
import { listLines, type RevenueLine } from "../../../../lib/api/itparkLines";

// ITPARK-201: Tabel linii venit (lazy pentru a nu bloca randarea paginii)
const RevenueLinesTable = lazy(() => import("./RevenueLinesTable"));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useRouteId(): string {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  // hash = "#/app/fin/itpark/<id>"
  const match = hash.match(/\/app\/fin\/itpark\/([^/]+)$/);
  return match ? match[1] : "";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ro-MD", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const STATUS_LABELS: Record<ItparkEngagement["status"], string> = {
  draft: "Ciornă",
  in_progress: "În lucru",
  ready: "Gata",
  exported: "Exportat",
};

const STATUS_CLASSES: Record<ItparkEngagement["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  exported: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

type TabId = "anexa2" | "anexa3" | "anexa4" | "scrisori" | "declaratie";

const TABS: { id: TabId; label: string }[] = [
  { id: "anexa2", label: "Anexa 2" },
  { id: "anexa3", label: "Anexa 3" },
  { id: "anexa4", label: "Anexa 4" },
  { id: "scrisori", label: "Scrisori" },
  { id: "declaratie", label: "Declarație" },
];

// ─── Tab link panel (for tabs that have dedicated pages) ──────────────────────

interface TabLinkPanelProps {
  label: string;
  description: string;
  href: string;
}

function TabLinkPanel({ label, description, href }: TabLinkPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
      <h3 className="text-base font-medium text-foreground">{label}</h3>
      <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      <a
        href={href}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Deschide pagina completă
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </a>
    </div>
  );
}

// ─── Export button (ITPARK-601) ────────────────────────────────────────────────

interface ExportPacketButtonProps {
  engagementId: string;
  engagement: ItparkEngagement;
  lines: RevenueLine[];
  onExported: (updated: ItparkEngagement) => void;
}

function ExportPacketButton({ engagementId, engagement, lines, onExported }: ExportPacketButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      // Lazy-load PDF module (html2canvas + jsPDF are heavy)
      const { downloadItparkPacketPdf } = await import("../../../../lib/itpark/itparkPdf");
      await downloadItparkPacketPdf(engagement, lines);
      // Mark as exported server-side (status + audit)
      const updated = await markEngagementExported(engagementId);
      onExported(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la export");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 items-end">
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        aria-busy={exporting}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label="Exportă tot pachetul ca PDF"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {exporting ? "Se generează PDF..." : "Export pachet PDF"}
      </button>
      {error && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}

// ─── Placeholder tab content ───────────────────────────────────────────────────

function TabPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <FileText className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h3 className="mt-3 text-base font-medium text-foreground">{label}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-xs">
        Această secțiune va fi disponibilă după introducerea liniilor de venit (Faza C).
      </p>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ItparkDetail() {
  const id = useRouteId();
  const [engagement, setEngagement] = useState<ItparkEngagement | null>(null);
  const [lines, setLines] = useState<RevenueLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("anexa2");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getEngagement(id),
      listLines(id).catch(() => [] as RevenueLine[]),
    ])
      .then(([eng, revLines]) => {
        setEngagement(eng);
        setLines(revLines);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Eroare"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64" aria-busy="true" aria-label="Se încarcă dosarul">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive" role="alert">
        <p className="font-medium">Eroare la încărcare</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!engagement) return null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Navigare" className="flex items-center gap-2 text-sm text-muted-foreground">
        <a
          href="#/app/fin/itpark"
          className="hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary rounded"
        >
          Dosare MITP
        </a>
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-foreground font-medium truncate">{engagement.residentName}</span>
      </nav>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-foreground truncate">
                {engagement.residentName}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[engagement.status]}`}
              >
                {STATUS_LABELS[engagement.status]}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-mono">IDNO: {engagement.idno}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {/* ITPARK-601: Export whole-packet PDF */}
            <ExportPacketButton
              engagementId={id}
              engagement={engagement}
              lines={lines}
              onExported={setEngagement}
            />
            <a
              href={`#/app/fin/itpark/${id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="Editează dosarul"
            >
              <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editează
            </a>
          </div>
        </div>

        {/* Metadata grid */}
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">An raportare</dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">{engagement.reportingYear}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Perioadă</dt>
            <dd className="mt-1 text-sm text-foreground">
              {fmtDate(engagement.periodStart)} – {fmtDate(engagement.periodEnd)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contract MITP</dt>
            <dd className="mt-1 text-sm text-foreground">
              {engagement.mitpContractNo ?? "—"}
              {engagement.mitpContractDate && (
                <span className="text-muted-foreground ml-1">/ {fmtDate(engagement.mitpContractDate)}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">TVA</dt>
            <dd className="mt-1 text-sm text-foreground">
              {engagement.vatPayer ? "Plătitor TVA" : "Neplătitor TVA"}
            </dd>
          </div>
          {engagement.auditFirmName && (
            <div className="col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Firma de audit</dt>
              <dd className="mt-1 text-sm text-foreground">{engagement.auditFirmName}</dd>
            </div>
          )}
          {engagement.legalAddress && (
            <div className="col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Adresă juridică</dt>
              <dd className="mt-1 text-sm text-foreground">{engagement.legalAddress}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Tab list */}
        <div
          role="tablist"
          aria-label="Secțiunile dosarului"
          className="flex border-b border-border overflow-x-auto"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-5 py-3 text-sm font-medium border-b-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary min-h-[44px] ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        {TABS.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            hidden={activeTab !== tab.id}
            className="p-4"
          >
            {activeTab === tab.id && (
              tab.id === "anexa2" ? (
                <TabLinkPanel
                  label="Anexa 2 — Informații generale"
                  description="Date rezident, perioadă, TVA, costuri subcontractori, total vânzări și eligibil."
                  href={`#/app/fin/itpark/${id}/anexa2`}
                />
              ) : tab.id === "anexa3" ? (
                <Suspense fallback={
                  <div className="flex items-center justify-center py-12" aria-busy="true">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status" aria-label="Se încarcă liniile" />
                  </div>
                }>
                  <RevenueLinesTable engagementId={id} />
                </Suspense>
              ) : tab.id === "anexa4" ? (
                <TabLinkPanel
                  label="Anexa 4 — Raport lunar eligibilitate"
                  description="12 luni + Total: venituri eligibile/total, cumulative YTD, pondere cumulativă. Gate de coerență cu Anexa 2 și 3."
                  href={`#/app/fin/itpark/${id}/anexa4`}
                />
              ) : tab.id === "scrisori" ? (
                <TabLinkPanel
                  label="Scrisori de confirmare"
                  description="5 scrisori pre-completate (ajustări, adresă, subdiviziuni, activitate, solvabilitate). Editare text, status draft/gata, tipărire."
                  href={`#/app/fin/itpark/${id}/scrisori`}
                />
              ) : tab.id === "declaratie" ? (
                <TabLinkPanel
                  label="Declarație pe proprie răspundere"
                  description="Declarație pre-completată cu datele dosarului. Referințe art. 312 Cod Penal + art. 18(1) Legea 77/2016."
                  href={`#/app/fin/itpark/${id}/declaratie`}
                />
              ) : (
                <TabPlaceholder label={tab.label} />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
