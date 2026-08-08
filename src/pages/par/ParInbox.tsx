/**
 * PAR-108 — /business/par/inbox
 *
 * Approver inbox: lista de PAR-uri unde userul curent e aprobatorul pasului activ.
 * Acțiuni: Aprobă / Respinge / Solicită modificări (modal cu comentariu + semnătură).
 *
 * CORE: backlog/par/PAR-CORE.md §1, §6
 * Design system: Vector 365 tokens only, light + dark, WCAG AA
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle, XCircle, MessageSquare, Loader2, Inbox, AlertCircle, RefreshCcw, X, FileText } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ds";
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
import { requestParBadgeRefresh } from "@/lib/par/badgeBus";
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

/**
 * The default purpose. It is what nearly every request is, so a whole column
 * repeating "Execută plata" on every row bought nothing but width. The other two
 * purposes DO change how you read the request, so those still get a chip on the row.
 */
const DEFAULT_PURPOSE = "execute_payment";

/**
 * Shorten an upload's file name for the table without losing what identifies it.
 *
 * Real uploads are named like "GSF39_IANet_Hubs - Summary for hub partners v3.pdf" —
 * the extension and the first few tokens are what someone scans for, the middle is
 * noise. Truncating from the end alone would hide the extension, so we cut the middle
 * and keep both edges. The full name stays in `title=`.
 */
function shortFileName(name: string, max = 20): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : "";
  const stem = ext ? name.slice(0, dot) : name;
  if (stem.length <= max) return name;
  return `${stem.slice(0, max - 4)}…${stem.slice(-3)}${ext}`;
}

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
    buttonClass: "bg-success text-success-foreground hover:bg-success/90",
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
    buttonClass: "bg-warning text-warning-foreground hover:bg-warning/90",
    icon: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
  },
};

function DecisionModal({ par, type, onClose, onSuccess, defaultSignatureName }: DecisionModalProps) {
  // Escape closes it, like the DS `Dialog` and every other overlay in the app.
  // Without this the only way out was the small × in the corner — and a modal
  // that ignores Escape also swallows the keyboard flow on the list behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <Dialog
      open
      onClose={onClose}
      title={`Aprobă ${ids.length} cereri`}
      description="Aceeași semnătură și comentariu se aplică tuturor cererilor selectate. Cele pe care nu le poți decide vor fi marcate individual."
      size="md"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-sig">Semnătură / Nume</Label>
          {/* Was `className="vf-input"` — a class that exists in no stylesheet, so this
              field rendered as a raw browser input inside a styled modal. */}
          <Input id="bulk-sig" type="text" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-comment">Comentariu (opțional)</Label>
          <Textarea id="bulk-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} className="resize-none" />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Anulează</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle className="h-4 w-4" aria-hidden />}
            Aprobă toate
          </Button>
        </div>
      </form>
    </Dialog>
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

  /**
   * Keyboard flow for the approver.
   *
   * This is the one screen someone works through in series — twenty requests,
   * same three decisions each time. Reaching for the mouse to hit a 28px icon
   * on every row is where the minutes go. j/k moves, a/m/r decides, Enter opens
   * the full request, x selects for a bulk run.
   *
   * `visibleRowsRef` is filled during render because the filtered+sorted list is
   * computed inside the JSX; the handler needs whatever is on screen right now.
   */
  const visibleRowsRef = useRef<ParInboxItem[]>([]);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal a keystroke that belongs to a field or an open dialog.
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const rows = visibleRowsRef.current;
      if (rows.length === 0) return;
      const at = Math.min(cursor, rows.length - 1);
      const item = rows[at];

      switch (e.key) {
        case "j": case "ArrowDown":
          e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)); break;
        case "k": case "ArrowUp":
          e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); break;
        case "a": e.preventDefault(); handleAction(item, "approve"); break;
        case "m": e.preventDefault(); handleAction(item, "request_changes"); break;
        case "r": e.preventDefault(); handleAction(item, "reject"); break;
        case "x": e.preventDefault(); toggleSelect(item.id); break;
        case "Enter": e.preventDefault(); navigate(`/business/par/${item.id}`); break;
        default: break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, navigate, toggleSelect]);

  // Keep the highlighted row in view when moving with the keyboard.
  useEffect(() => {
    document.querySelector<HTMLElement>('[data-cursor="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const handleSuccess = async () => {
    setModalTarget(null);
    await loadInbox();
    // The sidebar pill polls on a 60s timer of its own — without this it keeps
    // claiming "4" while the list already shows 3.
    requestParBadgeRefresh();
  };

  // VF-102: after a bulk run, refresh the list but keep result annotations briefly.
  const handleBulkDone = async (results: Record<string, { ok: boolean; error?: string }>) => {
    setBulkResults(results);
    setBulkOpen(false);
    setSelectedIds(new Set());
    await loadInbox();
    requestParBadgeRefresh();
  };

  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(items.map((i) => i.id)));

  return (
    <AppShell
      pageTitle={t("inbox.title")}
      pageDescription={t("inbox.subtitle")}
      actions={
        <>
          <Button variant="outline" size="icon" onClick={loadInbox} disabled={loading} aria-label="Reîncarcă inbox">
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" />
          </Button>
          <Button variant="outline" onClick={() => navigate("/business/par")}>
            Toate cererile
          </Button>
        </>
      }
    >
      <div className="space-y-6">

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
          // Hand the on-screen list to the keyboard handler (see visibleRowsRef).
          visibleRowsRef.current = rows;
          const arrow = (key: InboxSortKey) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
          const Th = ({ k, label, align = "left", className }: { k: InboxSortKey; label: string; align?: "left" | "right"; className?: string }) => (
            <th className={cn("px-2 py-2.5 font-medium text-muted-foreground whitespace-nowrap", align === "right" ? "text-right" : "text-left", className)}>
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
                  <Select
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    aria-label="Filtrează după proiect"
                    className="w-auto"
                  >
                    <option value="">Toate proiectele</option>
                    {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                  <Select className="w-auto" value={payerFilter} onChange={(e) => setPayerFilter(e.target.value)} aria-label="Filtrează după plătitor">
                    <option value="">Toți plătitorii</option>{payerOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  <Select className="w-auto" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} aria-label="Filtrează după eveniment">
                    <option value="">Toate evenimentele</option>{eventOptions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </Select>
                  <Input className="w-36" value={requestorFilter} onChange={(e) => setRequestorFilter(e.target.value)} placeholder="Solicitant…" aria-label="Filtrează după solicitant" />
                  <Input className="w-36" value={beneficiaryFilter} onChange={(e) => setBeneficiaryFilter(e.target.value)} placeholder="Beneficiar…" aria-label="Filtrează după beneficiar" />
                  <Input className="w-auto" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Depus de la" />
                  <Input className="w-auto" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Depus până la" />
                  <Input className="w-28" type="number" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} placeholder="Min. MDL" aria-label="Sumă minimă" />
                  <Input className="w-28" type="number" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} placeholder="Max. MDL" aria-label="Sumă maximă" />
                </div>
                {selectedIds.size > 0 && (
                  <Button size="sm" onClick={() => setBulkOpen(true)}>
                    <CheckCircle className="h-4 w-4" aria-hidden="true" /> Aprobă {selectedIds.size} selectate
                  </Button>
                )}
              </div>

              {/* A shortcut nobody knows about saves nobody any time — say it out loud. */}
              <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium">Tastatură:</span>
                {[["j / k", "navighează"], ["a", "aprobă"], ["m", "cere modificări"], ["r", "respinge"], ["x", "selectează"], ["Enter", "deschide"]].map(([key, what]) => (
                  <span key={key} className="inline-flex items-center gap-1">
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs text-foreground">{key}</kbd>
                    {what}
                  </span>
                ))}
              </p>

              {/* Excel-style table */}
              <div className="overflow-x-auto rounded-lg border border-border pb-20">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="w-8 px-2 py-2.5">
                        <Checkbox checked={allSelected} onChange={toggleSelectAll} aria-label="Selectează tot" />
                      </th>
                      {/* The three decision buttons lead the row. They used to sit last,
                          past the horizontal scroll edge — so the only thing this screen
                          exists to do was the one thing you could not see. Everything to
                          the right of them is evidence for that decision, in the order an
                          approver reads it: WHO, HOW MUCH, WHAT FOR. */}
                      <th className="w-[104px] whitespace-nowrap px-2 py-2.5 text-left font-medium text-muted-foreground">Acțiuni</th>
                      <Th k="requestNo" label="Nr." />
                      <Th k="payeeName" label="Beneficiar" />
                      <Th k="totalEstimatedCents" label="Sumă" align="right" />
                      <th className="whitespace-nowrap px-2 py-2.5 text-left font-medium text-muted-foreground">Servicii / descriere</th>
                      <Th k="projectName" label="Proiect" />
                      <Th k="requestedByName" label="Solicitat de" />
                      <th className="whitespace-nowrap px-2 py-2.5 text-left font-medium text-muted-foreground">Documente</th>
                      <Th k="submittedAt" label="Depus" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item, idx) => (
                      <tr
                        key={item.id}
                        data-cursor={idx === Math.min(cursor, rows.length - 1) ? "true" : undefined}
                        className={cn(
                          "border-b border-border last:border-0 hover:bg-muted/30",
                          idx % 2 ? "bg-muted/10" : "bg-background",
                          idx === Math.min(cursor, rows.length - 1) && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                        )}
                      >
                        <td className="px-2 py-3 align-middle">
                          <Checkbox checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} aria-label={`Selectează ${item.requestNo}`} />
                        </td>
                        <td className="px-2 py-3 align-middle">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => handleAction(item, "approve")} title="Aprobă" aria-label={`Aprobă ${item.requestNo}`} className="rounded-md p-1.5 text-success hover:bg-success/10"><CheckCircle className="h-4 w-4" aria-hidden="true" /></button>
                            <button onClick={() => handleAction(item, "request_changes")} title="Solicită modificări" aria-label={`Solicită modificări la ${item.requestNo}`} className="rounded-md p-1.5 text-warning hover:bg-warning/10"><MessageSquare className="h-4 w-4" aria-hidden="true" /></button>
                            <button onClick={() => handleAction(item, "reject")} title="Respinge" aria-label={`Respinge ${item.requestNo}`} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"><XCircle className="h-4 w-4" aria-hidden="true" /></button>
                          </div>
                        </td>
                        <td className="px-2 py-3 align-middle">
                          <button onClick={() => navigate(`/business/par/${item.id}`)} className="whitespace-nowrap font-mono text-xs text-foreground hover:text-primary hover:underline">{item.requestNo}</button>
                          {/* The Scop column is gone — it said "Execută plata" on every row.
                              The two purposes that are NOT the default still change how you
                              read the request, so they stay, as a chip on the row instead. */}
                          {item.purpose !== DEFAULT_PURPOSE && (
                            <div className="mt-0.5 inline-block rounded bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                              {PURPOSE_LABEL[item.purpose] ?? item.purpose}
                            </div>
                          )}
                          {bulkResults[item.id] && (
                            <div className={cn("text-[11px] font-medium", bulkResults[item.id].ok ? "text-success" : "text-destructive")}>
                              {bulkResults[item.id].ok ? "✓ Aprobată" : `✗ ${bulkResults[item.id].error ?? "Eroare"}`}
                            </div>
                          )}
                        </td>
                        <td className="min-w-[130px] max-w-[190px] px-2 py-3 align-middle font-medium text-foreground"><span className="line-clamp-3" title={item.payeeName ?? ""}>{item.payeeName ?? "—"}</span></td>
                        <td className="whitespace-nowrap px-2 py-3 text-right align-middle font-mono font-semibold text-foreground">{formatMDL(item.totalEstimatedCents)}</td>
                        <td className="min-w-[150px] max-w-[220px] px-2 py-3 align-middle text-xs text-foreground"><span className="line-clamp-3" title={item.endUse ?? ""}>{item.endUse || "—"}</span></td>
                        <td className="max-w-[110px] px-2 py-3 align-middle text-foreground"><span className="line-clamp-2" title={item.projectName ?? ""}>{item.projectName ?? "—"}</span></td>
                        <td className="max-w-[110px] px-2 py-3 align-middle text-foreground"><span className="line-clamp-2" title={item.requestedByName ?? ""}>{item.requestedByName ?? "—"}</span></td>
                        <td className="max-w-[150px] px-2 py-3 align-middle">
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
                                  <span className="truncate">{shortFileName(attachment.fileName)}</span>
                                </button>
                              ))}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 align-middle text-xs text-muted-foreground">
                          {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
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
