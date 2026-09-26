/**
 * ITPARK-101/201: Detaliu dosar de verificare MITP
 * Route: /app/fin/itpark/:id
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §1
 *
 * Header: date dosar (rezident, IDNO, an, status)
 * Taburi: Anexa 2 (placeholder) | Anexa 3 (revenue lines — ITPARK-201) | Anexa 4 (placeholder) | Scrisori (placeholder)
 */
import { useState, useEffect, lazy, Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import { itparkIdFromPath, itparkListPath, itparkSubPath, type ItparkSubPage } from "@/lib/itpark/paths";
import { getEngagement, autoLinkEngagementParty, type ItparkEngagement } from "../../../../lib/api/itparkEngagements";

// ITPARK-201: Tabel linii venit (lazy pentru a nu bloca randarea paginii)
const RevenueLinesTable = lazy(() => import("./RevenueLinesTable"));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * NAV-08: id-ul se citește fără prefix. Cu vechiul `/\/app\/fin\/itpark\/…$/`, pe ruta
 * `/business/fin/itpark/<id>` ieșea gol și fișa rămânea pe spinner pentru totdeauna.
 */
function useRouteId(): string {
  const { path } = useRouter();
  return itparkIdFromPath(path);
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

// ─── Filele care au pagină proprie ────────────────────────────────────────────

/**
 * NAV-08: Anexa 2, Anexa 4 și Scrisorile au pagini complete, dar fila arăta „va fi disponibilă în
 * Faza C" — fiindcă paginile nu erau rutate. Acum fila spune ce e acolo și duce la pagină.
 */
const TAB_PAGES: Record<Exclude<TabId, "anexa3">, { sub: ItparkSubPage; description: string; cta: string }> = {
  anexa2: { sub: "anexa2", description: "Informația despre rezident și activitățile eligibile.", cta: "Deschide Anexa 2" },
  anexa4: { sub: "anexa4", description: "Calculul ponderii veniturilor eligibile și concluzia verificării.", cta: "Deschide Anexa 4" },
  scrisori: { sub: "scrisori", description: "Scrisoarea de angajament și scrisoarea de reprezentare, gata de semnat.", cta: "Deschide scrisorile" },
};

function TabPageLink({ tab, engagementId }: { tab: Exclude<TabId, "anexa3">; engagementId: string }) {
  const page = TAB_PAGES[tab];
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">{page.description}</p>
      <a
        href={`#${itparkSubPath(engagementId, page.sub)}`}
        className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground no-underline hover:bg-primary/90 hover:no-underline"
      >
        {page.cta}
      </a>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

// ─── FinDesk section (SPLIT-201) ────────────────────────────────────────────

interface FinDeskSectionProps {
  engagement: ItparkEngagement;
  onLinked: (finPartyId: string | null) => void;
}

function FinDeskSection({ engagement, onLinked }: FinDeskSectionProps) {
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function handleCreateLink() {
    setLinking(true);
    setLinkError(null);
    try {
      // SPLIT-203: auto-creates fin_parties from engagement data (residentName + IDNO)
      const result = await autoLinkEngagementParty(engagement.id);
      onLinked(result.fin_party_id);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Eroare la asociere");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-6">
      <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">FinDesk</h2>
      {engagement.finPartyId ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0" aria-hidden="true">
              <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Partener FinDesk</p>
              <a
                href={`#/business/fin/parties/${engagement.finPartyId}`}
                className="text-sm font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded truncate block"
              >
                {engagement.residentName}
              </a>
            </div>
            <a
              href={`#/business/fin/invoices?partyId=${engagement.finPartyId}`}
              className="shrink-0 text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
              aria-label="Vezi facturile FinDesk ale acestui rezident"
            >
              Facturi FinDesk →
            </a>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground flex-1">
            Rezidentul nu este legat la un partener FinDesk. Asociere pentru a vedea facturile și cheltuielile.
          </p>
          <button
            type="button"
            onClick={handleCreateLink}
            disabled={linking}
            aria-busy={linking}
            className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {linking ? (
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" role="status" aria-label="Se procesează" />
            ) : null}
            Asociere partener FinDesk
          </button>
        </div>
      )}
      {linkError && (
        <p className="mt-2 text-sm text-destructive" role="alert">{linkError}</p>
      )}
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
    // Fără id nu avem ce încărca — altfel spinnerul rămânea pe ecran pentru totdeauna.
    if (!id) {
      setLoading(false);
      setError("Dosarul nu există sau linkul e greșit.");
      return;
    }
    setLoading(true);
    setError(null);
    getEngagement(id)
      .then(setEngagement)
      .catch((e) => setError(e instanceof Error ? e.message : "Eroare"))
      .finally(() => setLoading(false));
  }, [id]);

  function handlePartyLinked(finPartyId: string | null) {
    if (engagement) {
      setEngagement({ ...engagement, finPartyId });
    }
  }

  if (loading) {
    return (
      <AppShell pageTitle="Dosar IT Park">
        <div className="flex items-center justify-center min-h-64" aria-busy="true" aria-label="Se încarcă dosarul">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status" />
        </div>
      </AppShell>
    );
  }

  if (error || !engagement) {
    return (
      <AppShell pageTitle="Dosar IT Park">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive" role="alert">
          <p className="font-medium">Eroare la încărcare</p>
          <p className="text-sm mt-1">{error ?? "Dosarul nu a fost găsit."}</p>
          <a href={`#${itparkListPath()}`} className="mt-2 inline-block text-sm underline">
            Înapoi la dosare
          </a>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      pageTitle={engagement.residentName}
      pageDescription={`Dosar de verificare MITP · ${engagement.reportingYear}`}
      actions={
        // Autodeclarația și lista de pregătire aveau pagini complete, dar niciun link spre ele.
        <div className="flex flex-wrap gap-2">
          <a
            href={`#${itparkSubPath(id, "declaratie")}`}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:no-underline"
          >
            Autodeclarație
          </a>
          <a
            href={`#${itparkSubPath(id, "ready")}`}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground no-underline hover:bg-primary/90 hover:no-underline"
          >
            Verifică pregătirea
          </a>
        </div>
      }
    >
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Navigare" className="flex items-center gap-2 text-sm text-muted-foreground">
        <a
          href="#/business/fin/itpark"
          className="hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary rounded"
        >
          Rezidenți IT Park
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
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[engagement.status]}`}
              >
                {STATUS_LABELS[engagement.status]}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-mono">IDNO: {engagement.idno}</p>
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

      {/* SPLIT-201: FinDesk integration section */}
      <FinDeskSection engagement={engagement} onLinked={handlePartyLinked} />

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
                <TabPageLink tab={tab.id} engagementId={id} />
              )
            )}
          </div>
        ))}
      </div>
    </div>
    </AppShell>
  );
}
