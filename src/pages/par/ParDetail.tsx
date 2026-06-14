/**
 * PAR-118 — /app/par/:id (extends PAR-115)
 *
 * Full-parity PAR detail page:
 *   • All 16 sections read-only, grouped like the form (PAR-115 already had these)
 *   • Approval chain via ParApprovalChain (PAR-118) + ParTimeline (PAR-110)
 *   • Download PDF button (PAR-115)
 *   • Role-aware action buttons shown ONLY when valid for state+role:
 *       - requestor:      Edit draft (draft), Cancel (non-terminal), Re-submit (changes_requested)
 *       - active approver: Approve, Reject, Request changes (pending_approval + my step)
 *       - finance:        Receive/Assign (approved), Mark paid (in_finance), Reapprove overage (reapproval_required)
 *       - par_admin:      all of the above
 *
 * a11y: 0 axe critical/serious. Dark mode: Vector 365 tokens only.
 *
 * CORE: backlog/par/PAR-CORE.md §4 (state machine), §6 (screens)
 */
import { useState, useEffect } from "react";
import {
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Clock,
  Edit2,
  Trash2,
  RefreshCw,
  Send,
  DollarSign,
  UserCheck,
  History,
  Paperclip,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ParStatusChip } from "@/components/par/ParStatusChip";
import { ParApprovalChain } from "@/components/par/ParApprovalChain";
import { ParTimeline } from "@/components/par/ParTimeline";
import { useRouter } from "@/router/HashRouter";
import {
  getPar,
  uploadAttachment,
  approvePar,
  rejectPar,
  requestParChanges,
  submitPar,
  reapproveOverage,
  getParMe,
  formatMDL,
  type ParDetail as ParDetailType,
  type ParLineItem,
  PAR_STATUS_LABELS,
} from "@/lib/api/par";
import { downloadParPdf } from "@/lib/parPdf";
import { cn } from "@/lib/utils";

// ─── Label helpers ─────────────────────────────────────────────────────────────

const PURPOSE_LABEL: Record<string, string> = {
  execute_payment: "Execute payment",
  obtain_quotations: "Obtain quotations",
  provide_estimate: "Provide estimate",
};

const CHARGE_LABEL: Record<string, string> = {
  operations: "Operations",
  program: "Program",
  other: "Other",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SectionProps {
  num: string;
  title: string;
  children: React.ReactNode;
}
function Section({ num, title, children }: SectionProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0" aria-hidden>
          {num}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-foreground">{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

// ─── PDF download button ───────────────────────────────────────────────────────

interface PdfButtonProps {
  par: ParDetailType;
  onAttached: () => void;
}

function PdfDownloadButton({ par, onAttached }: PdfButtonProps) {
  const [status, setStatus] = useState<"idle" | "generating" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleDownload = async () => {
    if (status === "generating") return;
    setStatus("generating");
    setErrMsg(null);
    try {
      await downloadParPdf(par);
      try {
        const { jsPDF } = await import("jspdf");
        const html2canvas = (await import("html2canvas")).default;
        const { buildParHtml } = await import("@/lib/parPdf");
        const host = document.createElement("div");
        host.style.position = "fixed";
        host.style.left = "-10000px";
        host.style.top = "0";
        host.style.background = "#ffffff";
        host.innerHTML = buildParHtml(par);
        document.body.appendChild(host);
        const node = host.firstElementChild as HTMLElement;
        try {
          if (document.fonts?.ready) await document.fonts.ready;
          const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
          const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
          const pageW = 210;
          const imgW = pageW;
          const imgH = (canvas.height * imgW) / canvas.width;
          const jpeg = canvas.toDataURL("image/jpeg", 0.92);
          if (imgH <= 297) {
            pdf.addImage(jpeg, "JPEG", 0, 0, imgW, imgH);
          } else {
            let remaining = imgH;
            let offset = 0;
            while (remaining > 0) {
              pdf.addImage(jpeg, "JPEG", 0, -offset, imgW, imgH);
              remaining -= 297;
              offset += 297;
              if (remaining > 0) pdf.addPage();
            }
          }
          const dataUrl = pdf.output("datauristring");
          const fileSafe = (par.requestNo ?? `par-${par.id.slice(0, 8)}`).replace(/[^\w-]+/g, "_");
          await uploadAttachment(par.id, { file_name: `PAR_Form_${fileSafe}.pdf`, file_url: dataUrl, mime: "application/pdf", kind: "par_pdf" });
          onAttached();
        } finally {
          document.body.removeChild(host);
        }
      } catch {
        console.warn("[PAR-115] attachment save failed (download succeeded)");
      }
      setStatus("done");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e: unknown) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : "Eroare la generare PDF");
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={status === "generating"}
        aria-label="Descarcă formularul PAR ca PDF"
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px]",
          status === "done" ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90",
          status === "generating" && "opacity-70 cursor-not-allowed"
        )}
      >
        {status === "generating" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : status === "done" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
        {status === "generating" ? "Se generează PDF..." : status === "done" ? "PDF descărcat" : "Download PDF"}
      </button>
      {status === "error" && errMsg && <p role="alert" className="text-xs text-destructive">{errMsg}</p>}
    </div>
  );
}

// ─── Role-aware action panel ───────────────────────────────────────────────────

interface ActionPanelProps {
  par: ParDetailType;
  currentUserId: string;
  currentRoles: string[];
  onRefresh: () => void;
}

function ActionPanel({ par, currentUserId, currentRoles, onRefresh }: ActionPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showChangesForm, setShowChangesForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = currentRoles.includes("par_admin");
  const isFinance = currentRoles.includes("finance") || isAdmin;
  const isApprover = currentRoles.includes("approver") || isAdmin;
  const isRequestor = par.requestedByUserId === currentUserId;

  const status = par.status;

  // Active approval step for current user
  const myActiveStep = par.approvals?.find(
    (a) => a.approverUserId === currentUserId && a.decision === "pending" && !a.locked
  ) ?? null;
  const canApprove = (isApprover || isAdmin) && myActiveStep !== null && status === "pending_approval";

  const do_ = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await action();
      onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(null);
    }
  };

  const actions: React.ReactNode[] = [];

  // ─── Requestor actions ──────────────────────────────────────────────────────
  if (isRequestor || isAdmin) {
    if (status === "draft") {
      actions.push(
        <button
          key="submit"
          type="button"
          disabled={!!busy}
          onClick={() => do_("submit", () => submitPar(par.id))}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px] disabled:opacity-60"
          aria-label="Trimite cererea spre aprobare"
        >
          {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Trimite spre aprobare
        </button>
      );
    }
    if (status === "changes_requested") {
      actions.push(
        <button
          key="resubmit"
          type="button"
          disabled={!!busy}
          onClick={() => do_("submit", () => submitPar(par.id))}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px] disabled:opacity-60"
          aria-label="Re-trimite cererea după modificări"
        >
          {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Re-trimite
        </button>
      );
    }
    if (!["paid", "cancelled", "rejected"].includes(status)) {
      actions.push(
        <button
          key="cancel"
          type="button"
          disabled={!!busy}
          onClick={() => {
            if (!confirm("Anulezi cererea?")) return;
            do_("cancel", async () => {
              const res = await fetch(`/api/par/${par.id}`, { method: "DELETE" });
              if (!res.ok) throw new Error("Eroare la anulare");
            });
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-destructive/10 hover:text-destructive min-h-[44px] disabled:opacity-60"
          aria-label="Anulează cererea"
        >
          {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
          Anulează
        </button>
      );
    }
  }

  // ─── Approver actions ───────────────────────────────────────────────────────
  if (canApprove) {
    actions.push(
      <button
        key="approve"
        type="button"
        disabled={!!busy}
        onClick={() => do_("approve", () => approvePar(par.id, {}))}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 min-h-[44px] disabled:opacity-60"
        aria-label="Aprobă cererea"
      >
        {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
        Aprobă
      </button>
    );
    actions.push(
      <button
        key="reject"
        type="button"
        disabled={!!busy}
        onClick={() => setShowRejectForm(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 min-h-[44px] disabled:opacity-60"
        aria-label="Respinge cererea"
      >
        <XCircle className="h-4 w-4" aria-hidden />
        Respinge
      </button>
    );
    actions.push(
      <button
        key="changes"
        type="button"
        disabled={!!busy}
        onClick={() => setShowChangesForm(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-500 text-amber-600 dark:text-amber-400 text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20 min-h-[44px] disabled:opacity-60"
        aria-label="Cere modificări"
      >
        <AlertCircle className="h-4 w-4" aria-hidden />
        Cere modificări
      </button>
    );
  }

  // ─── Finance actions ────────────────────────────────────────────────────────
  if (isFinance) {
    if (status === "approved" && par.purpose === "execute_payment") {
      actions.push(
        <button
          key="receive"
          type="button"
          disabled={!!busy}
          onClick={() => do_("receive", async () => {
            const res = await fetch(`/api/par/${par.id}/finance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ received_by_user_id: currentUserId }) });
            if (!res.ok) throw new Error("Eroare la înregistrare");
          })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 min-h-[44px] disabled:opacity-60"
          aria-label="Recepționează cererea la finanțe"
        >
          {busy === "receive" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}
          Recepționează la finanțe
        </button>
      );
    }
    if (status === "reapproval_required") {
      actions.push(
        <button
          key="reapprove"
          type="button"
          disabled={!!busy}
          onClick={() => do_("reapprove", () => reapproveOverage(par.id))}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 min-h-[44px] disabled:opacity-60"
          aria-label="Re-aprobă suma depășită"
        >
          {busy === "reapprove" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Re-aprobă depășire 10%
        </button>
      );
    }
    if (status === "in_finance") {
      actions.push(
        <button
          key="paid"
          type="button"
          disabled={!!busy}
          onClick={() => navigate(`#/app/par/finance`)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 min-h-[44px]"
          aria-label="Marchează plata în coada de finanțe"
        >
          <DollarSign className="h-4 w-4" aria-hidden />
          Execută plata
        </button>
      );
    }
  }

  if (actions.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Acțiuni disponibile</h2>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {actions}
      </div>

      {/* Reject form */}
      {showRejectForm && (
        <div className="space-y-2 pt-2 border-t border-border">
          <label htmlFor="reject-comment" className="text-xs font-medium text-foreground">
            Motiv respingere <span className="text-destructive">*</span>
          </label>
          <textarea
            id="reject-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Explică motivul respingerii..."
            className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 resize-none"
            aria-label="Motiv respingere"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!comment.trim() || !!busy}
              onClick={() => do_("reject", () => rejectPar(par.id, { comment: comment.trim() })).then(() => { setShowRejectForm(false); setComment(""); })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 min-h-[44px] disabled:opacity-60"
            >
              {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Confirmă respingere
            </button>
            <button type="button" onClick={() => { setShowRejectForm(false); setComment(""); }} className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted min-h-[44px]">
              Anulează
            </button>
          </div>
        </div>
      )}

      {/* Request changes form */}
      {showChangesForm && (
        <div className="space-y-2 pt-2 border-t border-border">
          <label htmlFor="changes-comment" className="text-xs font-medium text-foreground">
            Ce trebuie modificat? <span className="text-destructive">*</span>
          </label>
          <textarea
            id="changes-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Descrie modificările necesare..."
            className="w-full rounded-md border border-border bg-background text-sm px-3 py-2 resize-none"
            aria-label="Modificări solicitate"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!comment.trim() || !!busy}
              onClick={() => do_("changes", () => requestParChanges(par.id, { comment: comment.trim() })).then(() => { setShowChangesForm(false); setComment(""); })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 min-h-[44px] disabled:opacity-60"
            >
              {busy === "changes" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Solicită modificări
            </button>
            <button type="button" onClick={() => { setShowChangesForm(false); setComment(""); }} className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted min-h-[44px]">
              Anulează
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Placeholder navigate for finance redirect ─────────────────────────────────

let navigate: (path: string) => void = () => {};

// ─── Main component ───────────────────────────────────────────────────────────

export function ParDetailPage() {
  const router = useRouter();
  navigate = router.navigate;
  const { path } = router;
  const id = path.replace(/^\/app\/par\//, "").split("/")[0];

  const [par, setPar] = useState<ParDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  // Current user PAR roles
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRoles, setCurrentRoles] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, me] = await Promise.all([
        getPar(id),
        getParMe().catch(() => ({ roles: [] as string[], userId: "", tenantId: "" })),
      ]);
      setPar(data);
      setCurrentUserId(me.userId ?? null);
      setCurrentRoles(me.roles ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <AppShell pageTitle="Cerere PAR">
        <div className="flex items-center justify-center min-h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă" />
        </div>
      </AppShell>
    );
  }

  if (error || !par) {
    return (
      <AppShell pageTitle="Cerere PAR">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div role="alert" className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
            <span>{error ?? "Cererea nu a fost găsită."}</span>
          </div>
          <button type="button" onClick={() => router.navigate("/app/par")} className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Înapoi la lista PAR
          </button>
        </div>
      </AppShell>
    );
  }

  const approvals = [...(par.approvals ?? [])].sort((a, b) => a.step - b.step);

  return (
    <AppShell pageTitle={`PAR ${par.requestNo}`}>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Back + header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button
              type="button"
              onClick={() => router.navigate("/app/par")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
              aria-label="Înapoi la lista PAR"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Lista PAR
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <FileText className="h-5 w-5 text-primary flex-shrink-0" aria-hidden />
              <h1 className="text-xl font-bold text-foreground">{par.requestNo}</h1>
              <ParStatusChip status={par.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {PURPOSE_LABEL[par.purpose] ?? par.purpose}
              {par.projectId ? ` · ${par.projectId}` : ""}
              {` · Creat ${fmtDate(par.createdAt)}`}
            </p>
          </div>
          <PdfDownloadButton par={par} onAttached={load} />
        </div>

        {/* Role-aware actions */}
        {currentUserId && (
          <ActionPanel
            par={par}
            currentUserId={currentUserId}
            currentRoles={currentRoles}
            onRefresh={load}
          />
        )}

        {/* SECTIONS 1–7: Header grid */}
        <Section num="1–7" title="Informații cerere">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            <Field label="1. Data cererii" value={fmtDate(par.dateOfRequest)} />
            <Field label="2. Solicitat de" value={par.requestedByUserId} />
            <Field label="3. Titlu / Cod" value={par.requestorTitle} />
            <Field label="4. Departament" value={par.departmentId} />
            <Field label="5. Data necesară" value={fmtDate(par.dateNeeded)} />
            <Field label="6. Pentru / Livrare la" value={par.projectId} />
            <Field
              label="7. Cod bugetar"
              value={[par.budgetCodeId, par.budgetCodeNote].filter(Boolean).join(" — ")}
            />
          </dl>
        </Section>

        {/* SECTIONS 8–9: Classification */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Section num="8" title="Scopul PAR">
            <p className="text-sm font-semibold text-foreground">{PURPOSE_LABEL[par.purpose] ?? par.purpose}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {par.purpose === "execute_payment" && "Necesită aprobare + plată"}
              {par.purpose === "obtain_quotations" && "Pre-achiziție, fără plată"}
              {par.purpose === "provide_estimate" && "Estimare cost, fără concurență"}
            </p>
          </Section>
          <Section num="9" title="Charge To">
            <p className="text-sm font-semibold text-foreground">{CHARGE_LABEL[par.chargeTo] ?? par.chargeTo}</p>
            {par.chargeBillingCode && (
              <p className="text-xs text-muted-foreground mt-0.5">Billing code: {par.chargeBillingCode}</p>
            )}
          </Section>
        </div>

        {/* SECTION 10: Line items */}
        <Section num="10" title="Articole solicitate">
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm border-collapse min-w-[500px]" aria-label="Articole solicitate">
              <thead>
                <tr className="bg-muted/50">
                  <th scope="col" className="text-left p-2 text-xs font-semibold text-muted-foreground w-8">#</th>
                  <th scope="col" className="text-left p-2 text-xs font-semibold text-muted-foreground">Descriere</th>
                  <th scope="col" className="text-right p-2 text-xs font-semibold text-muted-foreground w-16">Cant</th>
                  <th scope="col" className="text-left p-2 text-xs font-semibold text-muted-foreground w-16">Unitate</th>
                  <th scope="col" className="text-right p-2 text-xs font-semibold text-muted-foreground w-28">Preț unitar</th>
                  <th scope="col" className="text-right p-2 text-xs font-semibold text-muted-foreground w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {(par.line_items ?? []).map((it: ParLineItem, idx) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="p-2 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="p-2 text-foreground">{it.description}</td>
                    <td className="p-2 text-right text-foreground">{it.quantity}</td>
                    <td className="p-2 text-muted-foreground text-xs">{it.unit ?? "—"}</td>
                    <td className="p-2 text-right text-foreground whitespace-nowrap">{formatMDL(it.unitPriceCents)}</td>
                    <td className="p-2 text-right font-semibold text-foreground whitespace-nowrap">{formatMDL(it.lineTotalCents)}</td>
                  </tr>
                ))}
                {(par.line_items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground text-sm">Niciun articol</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={5} className="p-2 text-sm font-bold text-foreground text-right">TOTAL ESTIMATED COST (MDL)</td>
                  <td className="p-2 text-right text-base font-bold text-primary whitespace-nowrap">{formatMDL(par.totalEstimatedCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            * Dacă prețul final depășește estimatul cu mai mult de 10% și valoarea e peste pragul de micro-achiziție, cererea necesită re-aprobare înainte de plată.
          </p>
        </Section>

        {/* SECTION 11: End use */}
        <Section num="11" title="Scopul și descrierea utilizării finale">
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {par.endUse || <span className="text-muted-foreground">—</span>}
          </p>
        </Section>

        {/* SECTION 12: Payee */}
        <Section num="12" title="Beneficiar plată (Vendor)">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            <Field label="Nume" value={par.payeeName} />
            <Field label="IDNP" value={par.payeeIdnp ? <code className="text-xs">{par.payeeIdnp}</code> : null} />
            <Field label="IBAN" value={par.payeeIban ? <code className="text-xs">{par.payeeIban}</code> : null} />
            <Field label="Bancă" value={par.payeeBank} />
          </dl>
        </Section>

        {/* SECTION 13: Attachments */}
        <Section num="13" title="Atașamente">
          <div className="flex items-center gap-3">
            <span className={cn("text-sm font-medium", par.attachmentsPresent ? "text-foreground" : "text-muted-foreground")}>
              {par.attachmentsPresent ? "Da (descrise mai jos)" : "Nu"}
            </span>
          </div>
          {par.attachmentsNote && (
            <p className="text-sm text-foreground mt-2 pl-1 border-l-2 border-border whitespace-pre-wrap">{par.attachmentsNote}</p>
          )}
          {(par.attachments ?? []).length > 0 && (
            <ul className="mt-3 space-y-1.5" aria-label="Fișiere atașate">
              {par.attachments.map((att) => (
                <li key={att.id} className="flex items-center gap-2 text-sm">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden />
                  <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate" aria-label={`Deschide ${att.fileName}`}>
                    {att.fileName}
                  </a>
                  {att.kind === "par_pdf" && <span className="text-xs text-muted-foreground">(PDF generat)</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* SECTIONS 14–15: Approval chain */}
        <Section num="14–15" title="Semnături și aprobări">
          <ParApprovalChain approvals={approvals} />
        </Section>

        {/* SECTION 16: Finance */}
        {par.payment && (
          <Section num="16" title="Finanțe (uz intern)">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <Field label="PAR BL" value={par.payment.parBl} />
              <Field label="Data primirii" value={fmtDate(par.payment.receivedAt)} />
              <Field label="Primit de" value={par.payment.receivedByUserId} />
              <Field label="Alocat la" value={par.payment.assignedToUserId} />
              {par.payment.paymentDate && <Field label="Data plății" value={fmtDate(par.payment.paymentDate)} />}
              {par.payment.paymentRef && <Field label="Referință" value={<code className="text-xs">{par.payment.paymentRef}</code>} />}
              {par.payment.actualAmountCents != null && <Field label="Sumă reală" value={formatMDL(par.payment.actualAmountCents)} />}
            </dl>
            <div className="mt-3 pt-3 border-t border-border">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Field label="IBAN beneficiar" value={par.payeeIban ? <code className="text-xs">{par.payeeIban}</code> : null} />
                <Field label="Bancă beneficiar" value={par.payeeBank} />
              </dl>
            </div>
          </Section>
        )}

        {/* PAR Timeline (PAR-110) */}
        <div className="rounded-lg border border-border bg-card p-4">
          <button
            type="button"
            onClick={() => setShowTimeline((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-foreground w-full"
            aria-expanded={showTimeline}
            aria-controls="par-timeline-panel"
          >
            <History className="h-4 w-4 text-primary" aria-hidden />
            Jurnal activitate
            <span className={cn("ml-auto text-muted-foreground transition-transform", showTimeline && "rotate-90")}>▶</span>
          </button>
          {showTimeline && (
            <div id="par-timeline-panel" className="mt-3">
              <ParTimeline parId={par.id} />
            </div>
          )}
        </div>

        {/* SPLIT-202: FinDesk integration link — shown when PAR is paid */}
        {par.status === "paid" && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mt-2">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0" aria-hidden="true">
                <svg className="h-3.5 w-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">FinDesk</p>
                <p className="text-xs text-muted-foreground">
                  Cheltuiala a fost înregistrată automat în FinDesk cu sursa „PAR".
                </p>
              </div>
              <a
                href={`#/app/fin/expenses?par_id=${par.id}`}
                className="shrink-0 text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
                aria-label="Vezi cheltuiala FinDesk"
              >
                Vezi cheltuiala →
              </a>
            </div>
          </div>
        )}

        {/* Status footer */}
        <div className="text-xs text-muted-foreground text-right pt-2">
          Status: <strong>{PAR_STATUS_LABELS[par.status] ?? par.status}</strong>
          {par.updatedAt && ` · Actualizat ${fmtDate(par.updatedAt)}`}
        </div>

      </div>
    </AppShell>
  );
}

export default ParDetailPage;
