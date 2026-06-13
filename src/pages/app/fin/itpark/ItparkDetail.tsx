/**
 * ITPARK-101/201: Detaliu dosar de verificare MITP
 * Route: /app/fin/itpark/:id
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §1
 *
 * Header: date dosar (rezident, IDNO, an, status)
 * Taburi: Anexa 2 (placeholder) | Anexa 3 (revenue lines — ITPARK-201) | Anexa 4 (placeholder) | Scrisori (placeholder)
 */
import { useState, useEffect, lazy, Suspense } from "react";
import { getEngagement, type ItparkEngagement } from "../../../../lib/api/itparkEngagements";

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

type TabId = "anexa2" | "anexa3" | "anexa4" | "scrisori";

const TABS: { id: TabId; label: string }[] = [
  { id: "anexa2", label: "Anexa 2" },
  { id: "anexa3", label: "Anexa 3" },
  { id: "anexa4", label: "Anexa 4" },
  { id: "scrisori", label: "Scrisori" },
];

// ─── Placeholder tab content ───────────────────────────────────────────────────

function TabPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <svg
        aria-hidden="true"
        className="h-10 w-10 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
        />
      </svg>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("anexa2");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getEngagement(id)
      .then(setEngagement)
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
          <a
            href={`#/app/fin/itpark/${id}/edit`}
            className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="Editează dosarul"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Editează
          </a>
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
              tab.id === "anexa3" ? (
                <Suspense fallback={
                  <div className="flex items-center justify-center py-12" aria-busy="true">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status" aria-label="Se încarcă liniile" />
                  </div>
                }>
                  <RevenueLinesTable engagementId={id} />
                </Suspense>
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
