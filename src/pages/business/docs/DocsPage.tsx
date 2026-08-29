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
import {
  FileText,
  Plus,
  Loader2,
  AlertCircle,
  X,
  CheckCircle2,
  Ban,
  Search,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  listDocuments,
  getDocument,
  createDocument,
  finalizeDocument,
  cancelDocument,
  DOC_KIND_LABELS,
  DOC_STATUS_LABELS,
  type DocListItem,
  type DocDetail,
  type DocFilters,
} from "@/lib/api/docs";
import { listTemplates, type DocmergeTemplate } from "@/lib/api/docmerge";
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
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DocFilters>(() => readFiltersFromUrl());

  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<DocmergeTemplate[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState("act_primire_predare");
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newCounterparty, setNewCounterparty] = useState("");
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<DocDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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

  const openCreate = useCallback(async () => {
    setCreating(true);
    try {
      setTemplates(await listTemplates());
    } catch {
      setTemplates([]);
    }
  }, []);

  const submitCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const doc = await createDocument({
        templateId: newTemplateId || null,
        kind: newKind,
        title: newTitle.trim(),
        counterparty: newCounterparty.trim()
          ? { kind: "vendor", name: newCounterparty.trim() }
          : undefined,
      });
      setCreating(false);
      setNewTitle("");
      setNewCounterparty("");
      setNewTemplateId("");
      await load();
      setSelected(await getDocument(doc.id));
    } catch {
      setError("Actul nu a putut fi creat. Verifică datele și reîncearcă.");
    } finally {
      setSaving(false);
    }
  }, [newTitle, newKind, newTemplateId, newCounterparty, load]);

  const openDoc = useCallback(async (id: string) => {
    setDetailError(null);
    try {
      setSelected(await getDocument(id));
    } catch {
      setDetailError("Nu am putut deschide actul.");
    }
  }, []);

  const doFinalize = useCallback(async () => {
    if (!selected) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      await finalizeDocument(selected.id);
      setSelected(await getDocument(selected.id));
      await load();
    } catch (e) {
      const body = (e as { body?: { missing?: string[]; message?: string } }).body;
      setDetailError(
        body?.missing?.length
          ? `Nu pot finaliza — lipsește: ${body.missing.join(", ")}.`
          : body?.message ?? "Actul nu a putut fi finalizat."
      );
    } finally {
      setDetailBusy(false);
    }
  }, [selected, load]);

  const doCancel = useCallback(async () => {
    if (!selected) return;
    const reason = window.prompt("Din ce motiv se anulează actul?");
    if (!reason || reason.trim().length < 3) return;
    setDetailBusy(true);
    setDetailError(null);
    try {
      await cancelDocument(selected.id, reason.trim());
      setSelected(await getDocument(selected.id));
      await load();
    } catch {
      setDetailError("Actul nu a putut fi anulat.");
    } finally {
      setDetailBusy(false);
    }
  }, [selected, load]);

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
          onClick={() => void openCreate()}
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
              onClick={() => void openCreate()}
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
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => void openDoc(d.id)}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog: act nou */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Act nou"
            className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-foreground">Act nou</h2>
              <button
                type="button"
                onClick={() => setCreating(false)}
                aria-label="Închide"
                className="touch-target rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="new-kind" className="block text-sm font-medium text-foreground">
                  Tipul actului
                </label>
                <select
                  id="new-kind"
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value)}
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {Object.entries(DOC_KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="new-template" className="block text-sm font-medium text-foreground">
                  Șablon
                </label>
                <select
                  id="new-template"
                  value={newTemplateId}
                  onChange={(e) => setNewTemplateId(e.target.value)}
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Fără șablon (corp gol)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="new-title" className="block text-sm font-medium text-foreground">
                  Titlul actului
                </label>
                <input
                  id="new-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Act de primire-predare — echipament IT"
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label htmlFor="new-party" className="block text-sm font-medium text-foreground">
                  Contraparte
                </label>
                <input
                  id="new-party"
                  value={newCounterparty}
                  onChange={(e) => setNewCounterparty(e.target.value)}
                  placeholder="Denumirea furnizorului"
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="touch-target rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
              >
                Renunță
              </button>
              <button
                type="button"
                disabled={saving || !newTitle.trim()}
                onClick={() => void submitCreate()}
                className="touch-target inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Creează ciorna
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fișa actului */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Actul ${selected.title}`}
            className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs text-muted-foreground">
                  {selected.docNumber ?? "ciornă — fără număr"}
                </p>
                <h2 className="text-xl font-semibold text-foreground">{selected.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {DOC_KIND_LABELS[selected.kind] ?? selected.kind} ·{" "}
                  {selected.counterpartyName ?? "fără contraparte"} ·{" "}
                  {formatMoney(selected.totalCents, selected.currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Închide actul"
                className="touch-target rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {detailError && (
              <div
                role="alert"
                className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {detailError}
              </div>
            )}

            {selected.status === "cancelled" && selected.cancelReason && (
              <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                Anulat: {selected.cancelReason}
              </p>
            )}

            <div className="mt-6 flex gap-2">
              {selected.status === "draft" && (
                <button
                  type="button"
                  disabled={detailBusy}
                  onClick={() => void doFinalize()}
                  className="touch-target inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Finalizează
                </button>
              )}
              {selected.status !== "cancelled" && (
                <button
                  type="button"
                  disabled={detailBusy}
                  onClick={() => void doCancel()}
                  className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <Ban className="h-4 w-4" aria-hidden="true" />
                  Anulează
                </button>
              )}
            </div>

            {selected.status === "final" && (
              <p className="mt-3 text-xs text-muted-foreground">
                Actul e finalizat și sigilat — nu se mai poate modifica. Pentru o corectură,
                anulează-l cu motiv și emite unul nou.
              </p>
            )}

            {selected.lines.length > 0 && (
              <section className="mt-6">
                <h3 className="text-sm font-medium text-foreground">Poziții</h3>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Denumire</th>
                        <th className="px-3 py-2 font-medium">UM</th>
                        <th className="px-3 py-2 font-medium text-right">Cant.</th>
                        <th className="px-3 py-2 font-medium text-right">Preț</th>
                        <th className="px-3 py-2 font-medium text-right">Sumă</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines.map((l) => (
                        <tr key={l.id} className="border-t border-border">
                          <td className="px-3 py-2 text-foreground">{l.description}</td>
                          <td className="px-3 py-2 text-muted-foreground">{l.unit}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(l.unitPriceCents, selected.currency)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(l.lineTotalCents, selected.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {selected.audit.length > 0 && (
              <section className="mt-6">
                <h3 className="text-sm font-medium text-foreground">Jurnal</h3>
                <ul className="mt-2 space-y-2">
                  {selected.audit.map((a) => (
                    <li key={a.id} className="text-sm text-muted-foreground">
                      {AUDIT_LABELS[a.action] ?? a.action} ·{" "}
                      {new Date(a.createdAt).toLocaleString("ro-MD")}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </BusinessShell>
  );
}
