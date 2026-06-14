/**
 * ITPARK-101: Lista dosarelor de verificare MITP
 * Route: /app/fin/itpark
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §1
 */
import { useState, useEffect } from "react";
import { listEngagements, deleteEngagement, type ItparkEngagement } from "../../../../lib/api/itparkEngagements";

// ─── Status badge ─────────────────────────────────────────────────────────────

type EngagementStatus = ItparkEngagement["status"];

const STATUS_LABELS: Record<EngagementStatus, string> = {
  draft: "Ciornă",
  in_progress: "În lucru",
  ready: "Gata",
  exported: "Exportat",
};

const STATUS_CLASSES: Record<EngagementStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  exported: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

function StatusBadge({ status }: { status: EngagementStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function ItparkList() {
  const [engagements, setEngagements] = useState<ItparkEngagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await listEngagements();
      setEngagements(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Ștergi dosarul „${name}"? Acțiunea nu poate fi anulată.`)) return;
    try {
      setDeletingId(id);
      await deleteEngagement(id);
      setEngagements((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Eroare la ștergere");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64" aria-busy="true" aria-label="Se încarcă dosarele">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive" role="alert">
        <p className="font-medium">Eroare la încărcare</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={load}
          className="mt-2 text-sm underline hover:no-underline"
        >
          Reîncearcă
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dosare MITP</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dosare de verificare anuală (proceduri convenite ISRS 4400)
          </p>
        </div>
        <a
          href="#/app/fin/itpark/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary min-h-[44px]"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Dosar nou
        </a>
      </div>

      {/* Empty state */}
      {engagements.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed border-border bg-muted/30 py-16 text-center"
          data-testid="itpark-empty-state"
        >
          <svg
            aria-hidden="true"
            className="mx-auto h-12 w-12 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Niciun dosar creat</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
            Creează primul dosar de verificare MITP pentru un rezident și un an.
          </p>
          <a
            href="#/app/fin/itpark/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 min-h-[44px]"
          >
            Creează primul dosar
          </a>
        </div>
      ) : (
        /* Table */
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm" aria-label="Lista dosarelor MITP">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Rezident</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">IDNO</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">An</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Perioadă</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {engagements.map((eng) => (
                <tr
                  key={eng.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    <a
                      href={`#/app/fin/itpark/${eng.id}`}
                      className="hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary rounded"
                    >
                      {eng.residentName}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {eng.idno}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {eng.reportingYear}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fmtDate(eng.periodStart)} – {fmtDate(eng.periodEnd)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={eng.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`#/app/fin/itpark/${eng.id}`}
                        className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-background hover:bg-muted transition-colors min-h-[36px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                        aria-label={`Deschide dosarul ${eng.residentName}`}
                      >
                        Deschide
                      </a>
                      <button
                        onClick={() => handleDelete(eng.id, eng.residentName)}
                        disabled={deletingId === eng.id}
                        className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-destructive border border-destructive/30 bg-background hover:bg-destructive/10 transition-colors min-h-[36px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-destructive disabled:opacity-50"
                        aria-label={`Șterge dosarul ${eng.residentName}`}
                      >
                        {deletingId === eng.id ? "..." : "Șterge"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
