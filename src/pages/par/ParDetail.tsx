/**
 * PAR-118 — /business/par/:id (extends PAR-115)
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
import { useState, useEffect, useMemo } from "react";
import {
  FileText,
  Download,
  Copy,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Clock,
  Edit2,
  Trash2,
  RefreshCw,
  Undo2,
  Send,
  DollarSign,
  UserCheck,
  History,
  Paperclip,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ParBackdatedBadge } from "@/components/par/ParBackdatedBadge";
import { ParStatusChip } from "@/components/par/ParStatusChip";
import { ParApprovalChain } from "@/components/par/ParApprovalChain";
import { ParTimeline } from "@/components/par/ParTimeline";
import { ParComments } from "@/components/par/ParComments";
import { ReceiptSection } from "@/components/par/ReceiptSection";
import { ThreeWayMatchPanel } from "@/components/par/ThreeWayMatchPanel";
import { ParEfacturaCard } from "@/components/par/ParEfacturaCard";
import { useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import {
  getPar,
  uploadAttachment,
  approvePar,
  rejectPar,
  requestParChanges,
  submitPar,
  reapproveOverage,
  duplicatePar,
  reopenPar,
  withdrawPar,
  getPurchaseOrder,
  issuePurchaseOrder,
  getParMe,
  formatMDL,
  downloadDosar,
  type ParDetail as ParDetailType,
  type ParRequest,
  type ParLineItem,
  type ParAttachmentAnalysis,
  PAR_STATUS_LABELS,
} from "@/lib/api/par";
import { openParAttachment } from "@/lib/parFiles";
import { validateIban } from "@/lib/par/iban";
import { patentStatus, formatPatentDate } from "@/lib/par/patent";
import { attachmentKindLabel } from "@/lib/par/attachmentKinds";
import { parAccessMessage, type ParAccessMessage } from "@/lib/par/accessMessage";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Label helpers ─────────────────────────────────────────────────────────────

// Formularul PAR tipărit (src/lib/parPdf.ts) rămâne în engleză — e formularul oficial.
// În aplicație etichetele sunt în română, la fel ca în formularul de creare: același câmp nu
// are voie să se numească „Executare plată" când îl completezi și „Execute payment" când îl citești.
const PURPOSE_LABEL: Record<string, string> = {
  execute_payment: "Executare plată",
  obtain_quotations: "Obținere oferte",
  provide_estimate: "Estimare cost",
};

const CHARGE_LABEL: Record<string, string> = {
  operations: "Operațional",
  program: "Program",
  other: "Altele",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
}

function parseAttachmentAnalysis(raw: string | null | undefined): ParAttachmentAnalysis | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ParAttachmentAnalysis;
    return value && (value.status === "match" || value.status === "warning") && Array.isArray(value.checks) ? value : null;
  } catch {
    return null;
  }
}

// VF-203: format minor units in the PAR's currency (MDL keeps the "L" symbol).
function fmtCurrency(cents: number, currency: string): string {
  if (currency === "MDL") return formatMDL(cents);
  const v = (cents / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v} ${currency}`;
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

// ─── VF-103: Duplicate button ──────────────────────────────────────────────────

function DuplicateButton({ parId, onNavigate }: { parId: string; onNavigate: (path: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const handle = async () => {
    setBusy(true);
    setErr(false);
    try {
      const { par } = await duplicatePar(parId);
      // Copia se deschide direct în formular: după „repetă" urmează completarea, nu cititul.
      onNavigate(`/business/par/${par.id}/edit`);
    } catch {
      setErr(true);
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted transition-colors min-h-[44px] disabled:opacity-60"
      aria-label="Repetă această cerere într-o ciornă nouă"
      title={err ? "Eroare la duplicare" : "Repetă cererea"}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      Repetă cererea
    </button>
  );
}

// ─── VF-503: Purchase Order button (issue + download) ───────────────────────────

function PoButton({ par, orgName }: { par: ParDetailType; orgName: string }) {
  const [po, setPo] = useState<import("@/lib/api/par").ParPurchaseOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getPurchaseOrder(par.id).then(setPo).catch(() => setPo(null));
  }, [par.id]);

  const issue = async () => {
    setBusy(true); setErr(null);
    try { const created = await issuePurchaseOrder(par.id); setPo(created); }
    catch { setErr("Nu am putut emite comanda."); }
    finally { setBusy(false); }
  };

  const download = async () => {
    if (!po) return;
    setBusy(true);
    try {
      const { downloadPoPdf } = await import("@/lib/poPdf");
      await downloadPoPdf(po, par, orgName);
    } catch { setErr("Eroare la generarea PDF."); }
    finally { setBusy(false); }
  };

  // Only meaningful once the PAR is approved and has a payee.
  const eligible = ["approved", "in_finance", "paid"].includes(par.status) && (!!par.payeeName || !!par.vendorId);
  if (!eligible && !po) return null;

  return po ? (
    <button type="button" onClick={download} disabled={busy}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted transition-colors min-h-[44px] disabled:opacity-60"
      aria-label={`Descarcă comanda ${po.poNumber}`} title={err ?? po.poNumber}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
      Descarcă PO
    </button>
  ) : (
    <button type="button" onClick={issue} disabled={busy}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted transition-colors min-h-[44px] disabled:opacity-60"
      aria-label="Emite comandă de achiziție" title={err ?? "Emite comandă (PO)"}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
      Emite PO
    </button>
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
      // PERF: html2canvas (~174 KB gzip) + jsPDF only load when someone actually clicks
      // "Download PDF" — not on every /business/par/:id visit.
      const { buildParPdfDoc, parPdfFileName } = await import("@/lib/parPdf");
      // ONE rasterization, reused for both destinations: the local download AND the PAR
      // attachment upload used to each run their own independent html2canvas snapshot of the
      // same form on a single click.
      const pdf = await buildParPdfDoc(par);
      const fileName = parPdfFileName(par);
      pdf.save(fileName);
      try {
        const dataUrl = pdf.output("datauristring");
        await uploadAttachment(par.id, { file_name: fileName, file_url: dataUrl, mime: "application/pdf", kind: "par_pdf" });
        onAttached();
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
          status === "done" ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90",
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

// ─── VM1-12: Dosar complet PDF button ────────────────────────────────────────

function DosarButton({ par }: { par: ParDetailType }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleDownload = async () => {
    if (status === "loading") return;
    setStatus("loading");
    setErrMsg(null);
    try {
      await downloadDosar(par.id, par.requestNo);
      setStatus("idle");
    } catch (e: unknown) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : "Eroare la generarea dosarului");
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={status === "loading"}
        aria-label="Descarcă dosarul complet ca PDF (formular + atașamente)"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted transition-colors min-h-[44px] disabled:opacity-60"
      >
        {status === "loading"
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          : <Paperclip className="h-4 w-4" aria-hidden />}
        {status === "loading" ? "Se generează dosarul..." : "Descarcă dosarul complet (PDF)"}
      </button>
      {status === "error" && errMsg && (
        <p role="alert" className="text-xs text-destructive">{errMsg}</p>
      )}
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
  // VF-202: advisory over-budget notice after submit (non-blocking).
  const [budgetWarning, setBudgetWarning] = useState<string | null>(null);

  const doSubmit = async () => {
    setBusy("submit");
    setError(null);
    setBudgetWarning(null);
    try {
      const res = await submitPar(par.id);
      if (res.over_budget?.over) {
        setBudgetWarning(
          `Atenție: bugetul a fost depășit cu ${formatMDL(res.over_budget.overByCents)} (folosit ${formatMDL(res.over_budget.usedCents)} din ${formatMDL(res.over_budget.allocatedCents)}). Cererea a fost trimisă oricum.`
        );
      }
      onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(null);
    }
  };

  const isAdmin = currentRoles.includes("par_admin");
  const isFinance = currentRoles.includes("finance") || isAdmin;
  const isRequestor = par.requestedByUserId === currentUserId;

  const status = par.status;

  // Who may decide is the SERVER's answer (`my_decision`, computed with the same rules
  // /approve enforces) — not a client guess. The old local check only matched steps assigned to me
  // by name, so a role-based step (the default chain: approver_user_id = null) showed zero actions
  // here while the very same PAR sat in "Inbox aprobare" with Approve/Reject.
  // Fallback keeps an older server build usable: personal assignment only, as before.
  const myDecision = par.my_decision ?? null;
  const canApprove = myDecision
    ? myDecision.can_approve
    : (currentRoles.includes("approver") || isAdmin) &&
      status === "pending_approval" &&
      par.requestedByUserId !== currentUserId &&
      par.approvals?.some((a) => a.approverUserId === currentUserId && a.decision === "pending" && !a.locked);

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
    // PARQA-001: edit an editable PAR (draft or changes_requested) — reopens it in the form so the
    // requestor can actually change fields/line-items (esp. after "Cere modificări"), then re-submit.
    if (status === "draft" || status === "changes_requested") {
      actions.push(
        <button
          key="edit"
          type="button"
          disabled={!!busy}
          onClick={() => navigate(`/business/par/${par.id}/edit`)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted min-h-[44px] disabled:opacity-60"
          aria-label="Editează cererea"
        >
          <Edit2 className="h-4 w-4" aria-hidden />
          Editează
        </button>
      );
    }
    if (status === "draft") {
      actions.push(
        <button
          key="submit"
          type="button"
          disabled={!!busy}
          onClick={doSubmit}
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
          onClick={doSubmit}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px] disabled:opacity-60"
          aria-label="Re-trimite cererea după modificări"
        >
          {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Re-trimite
        </button>
      );
    }
    // Owner 2026-08-28: „vreau să pot edita PAR-urile care încă nu au fost aprobate dacă am greșit".
    // Cererea trimisă e sigilată (body_hash), deci nu se editează pe loc: o retragem în ciornă
    // (același număr, aceleași date) și deschidem direct formularul. Dacă lanțul avea deja aprobări
    // pe pașii anteriori, ele se anulează — de aceea confirmarea le numără explicit.
    if (status === "pending_approval") {
      // step 0 = semnătura autorului la trimitere, nu o aprobare de pierdut (vezi /withdraw).
      const givenApprovals = (par.approvals ?? []).filter(
        (a) => a.step > 0 && a.decision === "approved"
      ).length;
      actions.push(
        <button
          key="withdraw"
          type="button"
          disabled={!!busy}
          onClick={() => {
            const warn = givenApprovals
              ? `Retragi cererea din aprobare ca s-o corectezi?\n\n${givenApprovals} aprobare(i) deja dată(e) se anulează — după re-trimitere lanțul o ia de la capăt.`
              : "Retragi cererea din aprobare ca s-o corectezi? Revine în ciornă și o poți re-trimite după ce o repari.";
            if (!confirm(warn)) return;
            do_("withdraw", async () => {
              await withdrawPar(par.id);
              navigate(`/business/par/${par.id}/edit`);
            });
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted min-h-[44px] disabled:opacity-60"
          aria-label="Retrage cererea din aprobare pentru corectură"
        >
          {busy === "withdraw" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="h-4 w-4" aria-hidden />}
          Retrage și editează
        </button>
      );
    }
    // PARQA-011: a rejected PAR is terminal for approvers — but the author can reopen it into an
    // editable draft (data preserved) to fix what was flagged and resubmit.
    if (status === "rejected") {
      actions.push(
        <button
          key="reopen"
          type="button"
          disabled={!!busy}
          onClick={() => do_("reopen", () => reopenPar(par.id))}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 min-h-[44px] disabled:opacity-60"
          aria-label="Reia cererea respinsă ca ciornă editabilă"
        >
          {busy === "reopen" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Reia cererea
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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/40 bg-background text-destructive text-sm font-medium hover:bg-destructive/10 hover:border-destructive min-h-[44px] disabled:opacity-60"
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
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-success-foreground hover:bg-success/90 disabled:opacity-60"
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
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-warning px-4 py-2 text-sm font-medium text-warning hover:bg-warning/10 disabled:opacity-60"
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
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-warning px-4 py-2 text-sm font-medium text-warning-foreground hover:bg-warning/90 disabled:opacity-60"
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
          onClick={() => navigate(`#/business/par/finance`)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-success-foreground hover:bg-success/90"
          aria-label="Marchează plata în coada de finanțe"
        >
          <DollarSign className="h-4 w-4" aria-hidden />
          Execută plata
        </button>
      );
    }
  }

  // A PAR "în aprobare" with no buttons used to be a dead end — the approver could not tell whether
  // the app was broken or the request simply wasn't theirs yet. Say which it is, in words.
  const pendingNotice =
    status === "pending_approval" && !canApprove && myDecision
      ? {
          locked: myDecision.locked_step
            ? `Rândul tău e pasul ${myDecision.locked_step} — cererea așteaptă întâi aprobarea pasului anterior.`
            : "Cererea așteaptă întâi aprobarea pasului anterior.",
          self_approval: "Nu îți poți aproba propria cerere (separarea atribuțiilor).",
          not_your_step: "Această cerere e la un alt aprobator — nu e pasul tău.",
          no_par_role: "Nu ai rol de aprobare în acest spațiu de lucru.",
          not_pending_approval: null,
        }[myDecision.reason ?? "not_pending_approval"]
      : null;

  if (actions.length === 0 && !pendingNotice) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Acțiuni disponibile</h2>

      {pendingNotice && (
        <p role="status" className="flex items-start gap-2 rounded border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span>{pendingNotice}</span>
        </p>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {budgetWarning && (
        <div role="status" className="flex items-start gap-2 rounded border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden />
          <span>{budgetWarning}</span>
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
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-warning px-3 py-2 text-sm font-medium text-warning-foreground hover:bg-warning/90 disabled:opacity-60"
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

// VM3-01: openParAttachment moved to src/lib/parFiles.ts (shared with ParFinanceQueue).

// ─── Main component ───────────────────────────────────────────────────────────

export function ParDetailPage() {
  const router = useRouter();
  navigate = router.navigate;
  const { path } = router;
  const { data: session } = useSession();
  const orgName = session?.tenant.name ?? "Organizație";
  // Route-agnostic: the PAR detail lives at /business/par/:id (legacy /app/par/:id is redirected to it
  // by App.tsx). Match the segment AFTER "/par/" so either prefix works — a hardcoded "/app/par/" strip
  // left id="" on the real /business/par/ path → every just-created PAR 404'd.
  const id = path.match(/\/par\/([^/]+)/)?.[1] ?? "";
  const backTarget = typeof sessionStorage !== "undefined"
    ? sessionStorage.getItem("par:returnTo") ?? "/business/par"
    : "/business/par";

  const [par, setPar] = useState<ParDetailType | null>(null);
  /**
   * Verificarea IBAN-ului se face la AFIȘARE, nu se stochează: cererea poate fi trimisă cu
   * rechizite care nu trec validarea (atenționăm, nu blocăm), deci semnalul trebuie recalculat
   * din aceeași bibliotecă oriunde e arătat IBAN-ul.
   */
  const payeeIbanInfo = useMemo(
    () => (par?.payeeIban ? validateIban(par.payeeIban) : null),
    [par?.payeeIban]
  );
  const payeeIbanWarning = payeeIbanInfo && !payeeIbanInfo.ok ? payeeIbanInfo.message : null;
  /**
   * Patenta beneficiarului, verificată la DESCHIDEREA cererii, nu la completarea ei: între
   * trimitere și plată pot trece săptămâni, iar patenta se prelungește lunar. Aprobatorul și
   * finanțele trebuie să vadă starea de AZI, nu pe cea de la depunere.
   */
  const payeePatent = useMemo(
    () => patentStatus({
      isPatentHolder: par?.payeeIsPatentHolder,
      patentSeries: par?.payeePatentSeries,
      patentValidUntil: par?.payeePatentValidUntil,
    }),
    [par?.payeeIsPatentHolder, par?.payeePatentSeries, par?.payeePatentValidUntil]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // De ce a picat încărcarea, în cuvinte (serverul trimite `reason` + contul curent).
  const [accessError, setAccessError] = useState<ParAccessMessage | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  // Current user PAR roles
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRoles, setCurrentRoles] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    setAccessError(null);
    try {
      const [data, me] = await Promise.all([
        getPar(id),
        getParMe().catch(() => ({ roles: [] as string[], userId: "", tenantId: "" })),
      ]);
      setPar(data);
      setCurrentUserId(me.userId ?? null);
      setCurrentRoles(me.roles ?? []);
    } catch (e: unknown) {
      // 404 pe cerere = „nu ai acces / nu e aici", iar codul sec (`not_found`) nu spune nimic:
      // arătăm motivul trimis de server, nu identificatorul erorii.
      if (e instanceof ApiError && e.status === 404) {
        setAccessError(parAccessMessage(e.body));
      }
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
          <div role="alert" className="flex items-start gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden />
            {accessError ? (
              <div className="space-y-1">
                <p className="font-medium">{accessError.title}</p>
                <p className="text-destructive/90">{accessError.detail}</p>
                {accessError.suggestsRelogin && (
                  <a href="#/business/login" className="inline-block underline underline-offset-2 font-medium">
                    Intră cu alt cont
                  </a>
                )}
              </div>
            ) : (
              <span>{error ?? "Cererea nu a fost găsită."}</span>
            )}
          </div>
          <button type="button" onClick={() => router.navigate(backTarget)} className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Înapoi la lista PAR
          </button>
        </div>
      </AppShell>
    );
  }

  const approvals = [...(par.approvals ?? [])].sort((a, b) => a.step - b.step);
  const requestorIdentity = par.requestorCode && par.requestorTitle?.includes(par.requestorCode)
    ? par.requestorTitle
    : [par.requestorTitle, par.requestorCode].filter(Boolean).join(" · ");

  return (
    // pageTitle="" → the shell skips its own header: this page's header carries a
    // back link, the status chip and four actions, which a plain title cannot.
    <AppShell pageTitle="">
      <div className="mx-auto max-w-4xl space-y-4">

        {/* Back + header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button
              type="button"
              onClick={() => router.navigate(backTarget)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
              aria-label="Înapoi la lista PAR"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              {backTarget.includes("/folders") ? "Foldere PAR" : "Lista PAR"}
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <FileText className="h-5 w-5 text-primary flex-shrink-0" aria-hidden />
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{par.requestNo}</h1>
              <ParStatusChip status={par.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {PURPOSE_LABEL[par.purpose] ?? par.purpose}
              {par.projectName ? ` · ${par.projectName}` : ""}
              {` · Creat ${fmtDate(par.createdAt)}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <DuplicateButton parId={par.id} onNavigate={router.navigate} />
            <PoButton par={par} orgName={orgName} />
            <PdfDownloadButton par={par} onAttached={load} />
            <DosarButton par={par} />
          </div>
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
            {/* Data cererii, cu semnul „retroactiv" lângă ea când e cazul: cine aprobă trebuie
                să vadă că cererea e datată înaintea zilei în care a fost depusă. */}
            <div>
              <Field label="1. Data cererii" value={fmtDate(par.dateOfRequest)} />
              <ParBackdatedBadge dateOfRequest={par.dateOfRequest} submittedAt={par.submittedAt} className="mt-1" />
            </div>
            <Field label="2. Solicitat de" value={par.requestedByName ?? "—"} />
            <Field label="3. Funcție / Cod" value={requestorIdentity || "—"} />
            <Field label="4. Departament" value={par.departmentName ?? "—"} />
            <Field label="5. Data necesară" value={fmtDate(par.dateNeeded)} />
            <Field label="Plătitor / Organizație" value={par.payerName ?? "—"} />
            <Field label="6. Pentru / Livrare la" value={par.projectName ?? "—"} />
            {/* VM1-04: show event if set */}
            {(par as ParDetailType & { eventName?: string | null }).eventName && (
              <Field label="6b. Eveniment" value={(par as ParDetailType & { eventName?: string | null }).eventName} />
            )}
            <Field
              label="7. Cod bugetar"
              value={[par.budgetCodeLabel, par.budgetCodeNote].filter(Boolean).join(" — ") || "—"}
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
          <Section num="9" title="Tip cheltuială">
            <p className="text-sm font-semibold text-foreground">{CHARGE_LABEL[par.chargeTo] ?? par.chargeTo}</p>
            {par.chargeBillingCode && (
              <p className="text-xs text-muted-foreground mt-0.5">Cod de facturare: {par.chargeBillingCode}</p>
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
                  <td colSpan={5} className="p-2 text-sm font-bold text-foreground text-right">
                    TOTAL ESTIMAT{par.currency !== "MDL" ? ` (${par.currency})` : " (MDL)"}
                  </td>
                  <td className="p-2 text-right text-base font-bold text-primary whitespace-nowrap">
                    {fmtCurrency(par.totalEstimatedCents, par.currency)}
                  </td>
                </tr>
                {par.currency !== "MDL" && par.totalMdlCents != null && (
                  <tr className="bg-muted/10">
                    <td colSpan={5} className="px-2 pb-2 text-xs text-muted-foreground text-right">
                      Echivalent MDL{par.exchangeRate ? ` (curs ${Number(par.exchangeRate).toFixed(4)})` : ""}
                    </td>
                    <td className="px-2 pb-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {formatMDL(par.totalMdlCents)}
                    </td>
                  </tr>
                )}
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

        {/* SECTION 12: Payee
            Formularul lasă cererea să plece chiar dacă rechizitele nu trec verificarea (formatele
            internaționale sunt prea variate ca să blocăm — decizie owner 2026-08-21). Semnalul nu
            se pierde însă: apare AICI, unde îl văd aprobatorii și finanțele, adică exact oamenii
            care pot opri o plată greșită. */}
        <Section num="12" title="Beneficiar plată (Vendor)">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            <Field label="Nume" value={par.payeeName} />
            <Field
              label={payeeIbanInfo?.isForeign ? "Cod fiscal / VAT" : "IDNP"}
              value={par.payeeIdnp ? <code className="text-xs">{par.payeeIdnp}</code> : null}
            />
            <Field
              label="IBAN"
              value={par.payeeIban ? (
                <span className="flex flex-col gap-0.5">
                  <code className="text-xs">{par.payeeIban}</code>
                  {payeeIbanInfo?.isForeign && (
                    <span className="text-xs text-muted-foreground">
                      internațional — {payeeIbanInfo.countryName} (SWIFT/SEPA)
                    </span>
                  )}
                </span>
              ) : null}
            />
            <Field label="Bancă" value={par.payeeBank} />
            {payeePatent.status !== "none" && (
              <Field
                label="Patentă de întreprinzător"
                value={
                  <span className="flex flex-col gap-0.5">
                    <span>{par.payeePatentSeries || "serie necunoscută"}</span>
                    <span className="text-xs text-muted-foreground">
                      {par.payeePatentValidUntil
                        ? `valabilă până la ${formatPatentDate(par.payeePatentValidUntil)}`
                        : "fără termen completat"}
                    </span>
                  </span>
                }
              />
            )}
          </dl>
          {/* Patenta expirată e o problemă a PLĂTITORULUI, nu a beneficiarului — de aceea
              avertismentul stă aici, la aprobatori și la finanțe, nu doar în formular. */}
          {payeePatent.message && payeePatent.status !== "valid" && (
            <p
              className={cn(
                "mt-3 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-xs text-foreground",
                payeePatent.status === "expired"
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-warning/40 bg-warning/10"
              )}
              role={payeePatent.status === "expired" ? "alert" : "status"}
            >
              <AlertTriangle
                className={cn(
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  payeePatent.status === "expired" ? "text-destructive" : "text-warning"
                )}
                aria-hidden
              />
              <span>{payeePatent.message}</span>
            </p>
          )}
          {payeeIbanWarning && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground" role="status">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              <span>Verifică IBAN-ul înainte de plată: {payeeIbanWarning}</span>
            </p>
          )}
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
              {par.attachments.map((att) => {
                const analysis = parseAttachmentAnalysis(att.analysis);
                return (
                  <li key={att.id} className="rounded-md border border-border p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden />
                      <button type="button" onClick={() => openParAttachment(att.fileUrl, att.fileName, par.id, att.id)} className="max-w-full truncate text-left text-primary hover:underline" aria-label={`Deschide ${att.fileName} în browser`}>
                        {att.fileName}
                      </button>
                      <span className="text-xs text-muted-foreground">
                        ({att.kind === "par_pdf" ? "PDF generat" : attachmentKindLabel(att.kind, att.kindOther)})
                      </span>
                      {analysis && (
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", analysis.status === "match" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                          {analysis.status === "match" ? "Concordant" : `${analysis.warnings} diferențe`}
                        </span>
                      )}
                    </div>
                    {analysis && (
                      <details className="mt-2 pl-5 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Vezi verificarea AI</summary>
                        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                          {analysis.checks.map((check) => (
                            <li key={check.field} className={cn("rounded px-2 py-1", check.matches === false ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground")}>
                              <span className="font-medium">{check.field}:</span> document {String(check.found ?? "nedetectat")} · PAR {String(check.expected ?? "nesetat")}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {/* VM1-12: Upload ordin de plată — visible for finance/admin once PAR is paid */}
          {currentRoles && (currentRoles.includes("finance") || currentRoles.includes("par_admin")) && par.status === "paid" && (
            <div className="mt-3 pt-3 border-t border-border">
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Încarc ordin de plată (post-plată)</label>
              <input
                type="file"
                accept=".pdf"
                aria-label="Selectează ordinul de plată (PDF)"
                className="text-xs text-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-border file:bg-muted file:text-xs file:cursor-pointer"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    const dataUrl = ev.target?.result as string;
                    try {
                      await uploadAttachment(par.id, { file_name: file.name, file_url: dataUrl, mime: file.type, kind: "payment_order" });
                      load();
                    } catch {
                      // ignore — user can retry
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </div>
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

        {/* VF-504/505: goods receipt + 3-way match (finance/admin, PAR in_finance) */}
        {par.status === "in_finance" &&
          (currentRoles.includes("finance") || currentRoles.includes("par_admin")) && (
            <>
              <ThreeWayMatchPanel parId={par.id} />
              {par.line_items && par.line_items.length > 0 && (
                <ReceiptSection parId={par.id} lineItems={par.line_items} />
              )}
            </>
          )}

        {/* PAR-EFP: a emis prestatorul e-Factura pentru plata asta? */}
        {par.status === "paid" && <ParEfacturaCard parId={par.id} onNavigate={router.navigate} />}

        {/* VF-104: comments */}
        <ParComments parId={par.id} />

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
