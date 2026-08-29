/**
 * DG-103 — „Acte": locul unic unde se face și se găsește un act.
 *
 * Întrebarea de zi cu zi („ce acte avem pe proiectul X cu furnizorul Y?") primea răspuns doar
 * căutând prin foldere și email. Aici: o listă filtrabilă, cu starea vizibilă, și fișa actului cu
 * poziții, rechizite înghețate și jurnal. Filtrele stau în URL, deci linkul se poate trimite.
 *
 * Ce NU face încă (și de ce): PDF-ul (DG-112), editorul de șabloane (DG-104) și formularul complet
 * de completare (DG-109) au item-ele lor. Aici e registrul + acțiunile care schimbă starea.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Plus, Loader2, AlertCircle, Search, Download } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import {
  listDocuments,
  DOC_KIND_LABELS,
  DOC_STATUS_LABELS,
  type DocListItem,
  type DocFilters,
} from "@/lib/api/docs";
import { cn } from "@/lib/utils";

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toLocaleString("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ro-MD");
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  final: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-destructive/10 text-destructive line-through",
};

/** Jurnalul în limbaj omenesc — utilizatorul nu citește „finalized". */
const AUDIT_LABELS: Record<string, string> = {
  created: "a creat actul",
  updated: "a modificat actul",
  finalized: "a finalizat actul",
  cancelled: "a anulat actul",
};

function readFiltersFromUrl(): DocFilters {
  const hash = window.location.hash.replace(/^#/, "");
  const qIndex = hash.indexOf("?");
  const params = new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : "");
  return {
    status: params.get("status") ?? "",
    kind: params.get("kind") ?? "",
    q: params.get("q") ?? "",
  };
}

export function DocsPage() {
  const { navigate } = useRouter();
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DocFilters>(() => readFiltersFromUrl());


  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDocs(await listDocuments(filters));
    } catch {
      setError("Nu am putut încărca lista de acte. Reîncearcă.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtrele trăiesc în URL: linkul trimis colegului deschide exact aceeași listă.
  useEffect(() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, String(v));
    const qs = params.toString();
    const base = window.location.hash.replace(/^#/, "").split("?")[0];
    window.history.replaceState(null, "", `#${base}${qs ? `?${qs}` : ""}`);
  }, [filters]);



  const totalShown = useMemo(
    () => docs.reduce((s, d) => (d.status === "cancelled" ? s : s + d.totalCents), 0),
    [docs]
  );

  return (
    // Antetul paginii aparține shell-ului (un singur chrome în Business Suite) — de aceea
    // titlul, descrierea și acțiunea principală se dau ca props, nu se desenează aici.
    <BusinessShell
      pageTitle="Acte"
      pageDescription="Acte de primire-predare, contracte și procese-verbale — completate din registrul de furnizori, gata de transformat în cereri de plată."
      actions={
        <button
          type="button"
          onClick={() => navigate("/business/docs/nou")}
          className="touch-target inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Act nou
        </button>
      }
    >
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="docs-search">
            Caută după titlu
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="docs-search"
              value={filters.q ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Caută după titlu…"
              className="touch-target rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground"
            />
          </div>
          <label className="sr-only" htmlFor="docs-kind">
            Tipul actului
          </label>
          <select
            id="docs-kind"
            value={filters.kind ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}
            className="touch-target rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">Toate tipurile</option>
            {Object.entries(DOC_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="docs-status">
            Starea actului
          </label>
          <select
            id="docs-status"
            value={filters.status ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="touch-target rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">Toate stările</option>
            <option value="draft">Ciorne</option>
            <option value="final">Finalizate</option>
            <option value="cancelled">Anulate</option>
          </select>
          {docs.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {docs.length} acte · {formatMoney(totalShown, docs[0]?.currency ?? "MDL")}
            </span>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se încarcă actele…
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">Niciun act încă</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pornește de la un șablon — datele furnizorului și ale proiectului se completează din
              registru.
            </p>
            <button
              type="button"
              onClick={() => navigate("/business/docs/nou")}
              className="touch-target mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Creează primul act
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Număr</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Tip</th>
                  <th className="px-4 py-3 font-medium">Titlu</th>
                  <th className="px-4 py-3 font-medium">Contraparte</th>
                  <th className="px-4 py-3 font-medium text-right">Sumă</th>
                  <th className="px-4 py-3 font-medium">Stare</th>
                  <th className="px-4 py-3 font-medium sr-only">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => navigate(`/business/docs/${d.id}`)}
                    className="cursor-pointer border-t border-border hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {d.docNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(d.docDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {DOC_KIND_LABELS[d.kind] ?? d.kind}
                    </td>
                    <td className="px-4 py-3 text-foreground">{d.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.counterpartyName ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {formatMoney(d.totalCents, d.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-1 text-xs font-medium",
                          STATUS_STYLES[d.status]
                        )}
                      >
                        {DOC_STATUS_LABELS[d.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Descărcarea merge direct la API (cookie de sesiune), fără să deschidă actul. */}
                      <a
                        href={`/api/docs/documents/${d.id}/pdf`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Descarcă PDF pentru ${d.docNumber ?? d.title}`}
                        title="Descarcă PDF"
                        className="touch-target inline-flex rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </BusinessShell>
  );
}
