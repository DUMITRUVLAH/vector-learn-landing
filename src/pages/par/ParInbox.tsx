/**
 * PAR-108 — /business/par/inbox
 *
 * Approver inbox: lista de PAR-uri unde userul curent e aprobatorul pasului activ.
 * Acțiuni: Aprobă / Respinge / Solicită modificări (modal cu comentariu + semnătură).
 *
 * CORE: backlog/par/PAR-CORE.md §1, §6
 * Design system: Vector 365 tokens only, light + dark, WCAG AA
 */
import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, MessageSquare, Loader2, Inbox, AlertCircle, RefreshCcw, X, FileText } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ParStatusChip } from "@/components/par/ParStatusChip";
import { useRouter } from "@/router/HashRouter";
import {
  getParInbox,
  listPayers,
  listEvents,
  approvePar,
  bulkApprovePar,
  rejectPar,
  requestParChanges,
  formatMDL,
  type ParInboxItem,
} from "@/lib/api/par";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// ─── Decision modal ───────────────────────────────────────────────────────────

type DecisionType = "approve" | "reject" | "request_changes";

interface DecisionModalProps {
  par: ParInboxItem;
  type: DecisionType;
  onClose: () => void;
  onSuccess: () => void;
  /** Pre-filled signature (current user's name) — one less field to type. */
  defaultSignatureName?: string;
}

const PURPOSE_LABEL: Record<string, string> = {
  execute_payment: "Execută plata",
  obtain_quotations: "Obține oferte",
  provide_estimate: "Estimare de cost",
};

type InboxSortKey = "requestNo" | "payeeName" | "projectName" | "requestedByName" | "totalEstimatedCents" | "submittedAt";

/** Filter (by project) + sort the inbox rows for the Excel-style table. */
function sortFilterInbox(
  items: ParInboxItem[],
  projectFilter: string,
  sort: { key: InboxSortKey; dir: "asc" | "desc" },
): ParInboxItem[] {
  const filtered = projectFilter ? items.filter((i) => (i.projectName ?? "") === projectFilter) : items;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...filtered].sort((a, b) => {
    if (sort.key === "totalEstimatedCents") return (a.totalEstimatedCents - b.totalEstimatedCents) * dir;
    if (sort.key === "submittedAt") {
      const ta = a.submittedAt ? Date.parse(a.submittedAt) : 0;
      const tb = b.submittedAt ? Date.parse(b.submittedAt) : 0;
      return (ta - tb) * dir;
    }
    const va = String((a[sort.key as keyof ParInboxItem] as string | null) ?? "");
    const vb = String((b[sort.key as keyof ParInboxItem] as string | null) ?? "");
    return va.localeCompare(vb, "ro") * dir;
  });
}

const DECISION_CONFIG: Record<
  DecisionType,
  {
    title: string;
    label: string;
    commentRequired: boolean;
    commentLabel: string;
    showSignature: boolean;
    buttonClass: string;
    icon: React.ReactNode;
  }
> = {
  approve: {
    title: "Aprobă cererea",
    label: "Aprobă",
    commentRequired: false,
    commentLabel: "Comentariu opțional",
    showSignature: true,
    buttonClass: "bg-green-600 hover:bg-green-700 text-white",
    icon: <CheckCircle className="h-4 w-4" aria-hidden="true" />,
  },
  reject: {
    title: "Respinge cererea",
    label: "Respinge",
    commentRequired: true,
    commentLabel: "Motiv (obligatoriu)",
    showSignature: true,
    buttonClass: "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
    icon: <XCircle className="h-4 w-4" aria-hidden="true" />,
  },
  request_changes: {
    title: "Solicită modificări",
    label: "Trimite înapoi",
    commentRequired: true,
    commentLabel: "Ce trebuie modificat (obligatoriu)",
    showSignature: false,
    buttonClass: "bg-orange-500 hover:bg-orange-600 text-white",
    icon: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
  },
};

function DecisionModal({ par, type, onClose, onSuccess, defaultSignatureName }: DecisionModalProps) {
  const config = DECISION_CONFIG[type];
  const [comment, setComment] = useState("");
  const [signatureName, setSignatureName] = useState(defaultSignatureName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (config.commentRequired && !comment.trim()) {
      setError("Comentariul este obligatoriu.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (type === "approve") {
        await approvePar(par.id, {
          comment: comment || null,
          signatureName: signatureName || null,
        });
      } else if (type === "reject") {
        await rejectPar(par.id, {
          comment: comment.trim(),
          signatureName: signatureName || null,
        });
      } else {
        await requestParChanges(par.id, { comment: comment.trim() });
      }
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Eroare necunoscută";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background border border-border rounded-lg w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 id="modal-title" className="font-semibold text-foreground">
            {config.title}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded p-1 touch-target"
            aria-label="Închide"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* PAR summary */}
        <div className="p-4 bg-muted/40 border-b border-border text-sm">
          <div className="font-medium text-foreground">{par.requestNo}</div>
          <div className="text-muted-foreground mt-1">
            {formatMDL(par.totalEstimatedCents)} · {par.my_step_label ?? "Aprobare"}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Comment */}
          <div>
            <label
              htmlFor="decision-comment"
              className="block text-sm font-medium text-foreground mb-1"
            >
              {config.commentLabel}
              {config.commentRequired && (
                <span className="text-destructive ml-1" aria-hidden="true">*</span>
              )}
            </label>
            <textarea
              id="decision-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              required={config.commentRequired}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                         placeholder:text-muted-foreground focus:outline-none focus:ring-2
                         focus:ring-ring resize-none"
              placeholder={
                type === "approve"
                  ? "Adaugă un comentariu opțional…"
                  : "Descrie ce trebuie modificat sau de ce respingi…"
              }
            />
          </div>

          {/* Signature name (approve + reject) */}
          {config.showSignature && (
            <div>
              <label
                htmlFor="signature-name"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Numele dvs. (apare pe formular)
              </label>
              <input
                id="signature-name"
                type="text"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                           placeholder:text-muted-foreground focus:outline-none focus:ring-2
                           focus:ring-ring"
                placeholder="Prenume Nume"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded-md border border-input bg-background
                         hover:bg-muted text-foreground touch-target"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={submitting || (config.commentRequired && !comment.trim())}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm rounded-md font-medium touch-target",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                config.buttonClass
              )}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                config.icon
              )}
              {config.label}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ─── VF-102: Bulk approve modal ───────────────────────────────────────────────

interface BulkApproveModalProps {
  ids: string[];
  defaultSignatureName?: string;
  onClose: () => void;
  onDone: (results: Record<string, { ok: boolean; error?: string }>) => void;
}

function BulkApproveModal({ ids, defaultSignatureName, onClose, onDone }: BulkApproveModalProps) {
  const [comment, setComment] = useState("");
  const [signatureName, setSignatureName] = useState(defaultSignatureName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await bulkApprovePar({
        par_ids: ids,
        comment: comment || null,
        signatureName: signatureName || null,
      });
      const map: Record<string, { ok: boolean; error?: string }> = {};
      for (const r of res.results) map[r.id] = { ok: r.ok, error: r.error };
      onDone(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la aprobarea în lot");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog" aria-modal="true" aria-labelledby="bulk-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background border border-border rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 id="bulk-title" className="font-semibold text-foreground">Aprobă {ids.length} cereri</h2>
          <button type="button" onClick={onClose} aria-label="Închide" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Aceeași semnătură și comentariu se aplică tuturor cererilor selectate. Cele pe care nu le poți decide vor fi marcate individual.
          </p>
          <div>
            <label htmlFor="bulk-sig" className="block text-sm font-semibold mb-1.5">Semnătură / Nume</label>
            <input id="bulk-sig" type="text" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} className="vf-input" />
          </div>
          <div>
            <label htmlFor="bulk-comment" className="block text-sm font-semibold mb-1.5">Comentariu (opțional)</label>
            <textarea id="bulk-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
              className="vf-input resize-none" />
          </div>
          {error && (
            <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">{error}</div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input hover:bg-muted min-h-[44px]">Anulează</button>
            <button type="submit" disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[44px]">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle className="h-4 w-4" aria-hidden />}
              Aprobă toate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ParInbox() {
  const { navigate } = useRouter();
  const { t } = useT();
  const [items, setItems] = useState<ParInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Current user's name — pre-fills the signature field in the decision modal.
  const [myName, setMyName] = useState("");

  // Decision modal state
  const [modalTarget, setModalTarget] = useState<{
    par: ParInboxItem;
    type: DecisionType;
  } | null>(null);

  // VF-102: bulk-approve selection + results
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<Record<string, { ok: boolean; error?: string }>>({});

  // Excel-style table: filter by project + sort by any column.
  const [projectFilter, setProjectFilter] = useState("");
  const [payerFilter, setPayerFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [requestorFilter, setRequestorFilter] = useState("");
  const [beneficiaryFilter, setBeneficiaryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [payerOptions, setPayerOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [eventOptions, setEventOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [sort, setSort] = useState<{ key: InboxSortKey; dir: "asc" | "desc" }>({ key: "submittedAt", dir: "desc" });
  const toggleSort = (key: InboxSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "submittedAt" || key === "totalEstimatedCents" ? "desc" : "asc" }));

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  useEffect(() => {
    api<{ user: { name: string } }>("/api/auth/me")
      .then((r) => setMyName(r.user.name))
      .catch(() => setMyName(""));
  }, []);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getParInbox();
      setItems(data.inbox);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eroare la încărcarea inboxului");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    Promise.all([listPayers(), listEvents()]).then(([p, e]) => {
      setPayerOptions(p.items);
      setEventOptions(e.events);
    }).catch(() => { /* filters remain usable without reference labels */ });
  }, []);

  const handleAction = (par: ParInboxItem, type: DecisionType) => {
    setModalTarget({ par, type });
  };

  const handleSuccess = async () => {
    setModalTarget(null);
    await loadInbox();
  };

  // VF-102: after a bulk run, refresh the list but keep result annotations briefly.
  const handleBulkDone = async (results: Record<string, { ok: boolean; error?: string }>) => {
    setBulkResults(results);
    setBulkOpen(false);
    setSelectedIds(new Set());
    await loadInbox();
  };

  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(items.map((i) => i.id)));

  return (
    <AppShell pageTitle={t("inbox.title")}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{t("inbox.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("inbox.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadInbox}
              disabled={loading}
              className="p-2 rounded-md border border-input hover:bg-muted text-muted-foreground touch-target"
              aria-label="Reîncarcă inbox"
            >
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
            </button>
            <button
              onClick={() => navigate("/business/par")}
              className="px-3 py-2 text-sm rounded-md border border-input hover:bg-muted text-foreground touch-target"
            >
              Toate cererile
            </button>
          </div>
        </div>

        {/* Content */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" aria-hidden="true" />
            <span>Se încarcă…</span>
          </div>
        )}

        {!loading && error && (
          <div
            className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive text-sm"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">Eroare la încărcare</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Inbox className="h-12 w-12 opacity-40" aria-hidden="true" />
            <p className="text-sm">Nicio cerere în așteptare.</p>
            <p className="text-xs">Vei vedea cererile PAR care necesită decizia ta.</p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (() => {
          const projectOptions = [...new Set(items.map((i) => i.projectName).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "ro"));
          const rows = sortFilterInbox(items, projectFilter, sort).filter((item) => {
            const submitted = item.submittedAt ? new Date(item.submittedAt) : null;
            const min = minTotal ? Number(minTotal) * 100 : null;
            const max = maxTotal ? Number(maxTotal) * 100 : null;
            return (!payerFilter || item.payerId === payerFilter)
              && (!eventFilter || item.eventId === eventFilter)
              && (!requestorFilter || (item.requestedByName ?? "").toLocaleLowerCase("ro").includes(requestorFilter.toLocaleLowerCase("ro")))
              && (!beneficiaryFilter || (item.payeeName ?? "").toLocaleLowerCase("ro").includes(beneficiaryFilter.toLocaleLowerCase("ro")))
              && (!dateFrom || !!submitted && submitted >= new Date(dateFrom))
              && (!dateTo || !!submitted && submitted <= new Date(`${dateTo}T23:59:59`))
              && (min == null || item.totalEstimatedCents >= min)
              && (max == null || item.totalEstimatedCents <= max);
          });
          const arrow = (key: InboxSortKey) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
          const Th = ({ k, label, align = "left" }: { k: InboxSortKey; label: string; align?: "left" | "right" }) => (
            <th className={cn("px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap", align === "right" ? "text-right" : "text-left")}>
              <button type="button" onClick={() => toggleSort(k)} className="hover:text-foreground inline-flex items-center" aria-label={`Sortează după ${label}`}>
                {label}<span className="text-primary">{arrow(k)}</span>
              </button>
            </th>
          );
          return (
            <>
              {/* Filter bar */}
              <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    {rows.length} din {items.length} {items.length === 1 ? "cerere" : "cereri"}
                  </p>
                  <select
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    aria-label="Filtrează după proiect"
                    className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm min-h-[36px]"
                  >
                    <option value="">Toate proiectele</option>
                    {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={payerFilter} onChange={(e) => setPayerFilter(e.target.value)} aria-label="Filtrează după plătitor" className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm min-h-[36px]">
                    <option value="">Toți plătitorii</option>{payerOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} aria-label="Filtrează după eveniment" className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm min-h-[36px]">
                    <option value="">Toate evenimentele</option>{eventOptions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <input value={requestorFilter} onChange={(e) => setRequestorFilter(e.target.value)} placeholder="Solicitant…" aria-label="Filtrează după solicitant" className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm min-h-[36px] w-36" />
                  <input value={beneficiaryFilter} onChange={(e) => setBeneficiaryFilter(e.target.value)} placeholder="Beneficiar…" aria-label="Filtrează după beneficiar" className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm min-h-[36px] w-36" />
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Depus de la" className="rounded-md border border-input bg-background px-2 py-1.5 text-sm min-h-[36px]" />
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Depus până la" className="rounded-md border border-input bg-background px-2 py-1.5 text-sm min-h-[36px]" />
                  <input type="number" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} placeholder="Min. MDL" aria-label="Sumă minimă" className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm min-h-[36px] w-28" />
                  <input type="number" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} placeholder="Max. MDL" aria-label="Sumă maximă" className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm min-h-[36px] w-28" />
                </div>
                {selectedIds.size > 0 && (
                  <button type="button" onClick={() => setBulkOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 min-h-[36px]">
                    <CheckCircle className="h-4 w-4" aria-hidden="true" /> Aprobă {selectedIds.size} selectate
                  </button>
                )}
              </div>

              {/* Excel-style table */}
              <div className="overflow-x-auto rounded-lg border border-border pb-20">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="px-3 py-2.5 w-8">
                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Selectează tot" className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))] cursor-pointer" />
                      </th>
                      <Th k="requestNo" label="Nr." />
                      <Th k="payeeName" label="Beneficiar" />
                      <Th k="projectName" label="Proiect" />
                      <Th k="requestedByName" label="Solicitat de" />
                      <th className="px-3 py-2.5 font-medium text-muted-foreground text-left">Scop</th>
                      <th className="px-3 py-2.5 font-medium text-muted-foreground text-left">Servicii / descriere</th>
                      <th className="px-3 py-2.5 font-medium text-muted-foreground text-left">Documente</th>
                      <Th k="totalEstimatedCents" label="Sumă" align="right" />
                      <Th k="submittedAt" label="Depus" />
                      <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item, idx) => (
                      <tr key={item.id} className={cn("border-b border-border last:border-0 hover:bg-muted/30", idx % 2 ? "bg-muted/10" : "bg-background")}>
                        <td className="px-3 py-2 align-middle">
                          <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} aria-label={`Selectează ${item.requestNo}`} className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))] cursor-pointer" />
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <button onClick={() => navigate(`/business/par/${item.id}`)} className="font-mono text-xs text-foreground hover:text-primary hover:underline">{item.requestNo}</button>
                          {bulkResults[item.id] && (
                            <div className={cn("text-[11px] font-medium", bulkResults[item.id].ok ? "text-green-600 dark:text-green-400" : "text-destructive")}>
                              {bulkResults[item.id].ok ? "✓ Aprobată" : `✗ ${bulkResults[item.id].error ?? "Eroare"}`}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle text-foreground font-medium min-w-[200px] max-w-[320px]"><span className="line-clamp-2" title={item.payeeName ?? ""}>{item.payeeName ?? "—"}</span></td>
                        <td className="px-3 py-2 align-middle max-w-[180px] truncate text-foreground" title={item.projectName ?? ""}>{item.projectName ?? "—"}</td>
                        <td className="px-3 py-2 align-middle max-w-[160px] truncate text-foreground" title={item.requestedByName ?? ""}>{item.requestedByName ?? "—"}</td>
                        <td className="px-3 py-2 align-middle text-muted-foreground text-xs whitespace-nowrap">{PURPOSE_LABEL[item.purpose] ?? item.purpose}</td>
                        <td className="px-3 py-2 align-middle text-foreground text-xs min-w-[220px] max-w-[360px]"><span className="line-clamp-2" title={item.endUse ?? ""}>{item.endUse || "—"}</span></td>
                        <td className="px-3 py-2 align-middle min-w-[180px] max-w-[260px]">
                          {item.attachments?.length ? (
                            <div className="flex flex-col items-start gap-1">
                              {item.attachments.map((attachment) => (
                                <button
                                  key={attachment.id}
                                  type="button"
                                  onClick={() => window.open(`/api/par/${item.id}/attachments/${attachment.id}/preview`, "_blank", "noopener,noreferrer")}
                                  className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
                                  title={`Deschide ${attachment.fileName} în browser`}
                                >
                                  <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                  <span className="truncate">{attachment.fileName}</span>
                                </button>
                              ))}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 align-middle text-right font-mono text-foreground whitespace-nowrap">{formatMDL(item.totalEstimatedCents)}</td>
                        <td className="px-3 py-2 align-middle text-muted-foreground text-xs whitespace-nowrap">
                          {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleAction(item, "approve")} title="Aprobă" aria-label={`Aprobă ${item.requestNo}`} className="p-1.5 rounded-md text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><CheckCircle className="h-4 w-4" aria-hidden="true" /></button>
                            <button onClick={() => handleAction(item, "request_changes")} title="Solicită modificări" aria-label={`Solicită modificări la ${item.requestNo}`} className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"><MessageSquare className="h-4 w-4" aria-hidden="true" /></button>
                            <button onClick={() => handleAction(item, "reject")} title="Respinge" aria-label={`Respinge ${item.requestNo}`} className="p-1.5 rounded-md text-destructive hover:bg-destructive/10"><XCircle className="h-4 w-4" aria-hidden="true" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </div>

      {/* VF-102: sticky bulk-approve bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} {selectedIds.size === 1 ? "cerere selectată" : "cereri selectate"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-2 text-sm rounded-md border border-input hover:bg-muted text-foreground min-h-[44px]"
              >
                Anulează
              </button>
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px]"
              >
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                Aprobă {selectedIds.size} selectate
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <BulkApproveModal
          ids={[...selectedIds]}
          defaultSignatureName={myName}
          onClose={() => setBulkOpen(false)}
          onDone={handleBulkDone}
        />
      )}

      {/* Decision modal */}
      {modalTarget && (
        <DecisionModal
          par={modalTarget.par}
          type={modalTarget.type}
          onClose={() => setModalTarget(null)}
          onSuccess={handleSuccess}
          defaultSignatureName={myName}
        />
      )}
    </AppShell>
  );
}
