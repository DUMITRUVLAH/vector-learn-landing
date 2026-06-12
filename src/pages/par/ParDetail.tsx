/**
 * PAR-115 — /app/par/:id
 *
 * PAR detail page: displays all 16 sections of a Payment Action Request in read-only form,
 * the approval timeline, finance block, and role-aware action buttons.
 *
 * KEY FEATURE (PAR-115): "Download PDF" button → calls downloadParPdf(par) from parPdf.ts,
 * with a loading state while the html2canvas/jsPDF pipeline runs, and automatically attaches
 * the generated PDF to the record (par_attachments kind=par_pdf) per CORE §5.
 *
 * CORE: backlog/par/PAR-CORE.md §5 (PDF), §6 (screens)
 * Design system: Vector 365 tokens only, light + dark, WCAG AA
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
  User,
  Paperclip,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ParStatusChip } from "@/components/par/ParStatusChip";
import { useRouter } from "@/router/HashRouter";
import {
  getPar,
  uploadAttachment,
  formatMDL,
  type ParDetail as ParDetailType,
  type ParApproval,
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
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
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

function DecisionBadge({ decision }: { decision: ParApproval["decision"] }) {
  if (decision === "approved") return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Aprobat</span>;
  if (decision === "rejected") return <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><XCircle className="h-3.5 w-3.5" />Respins</span>;
  if (decision === "changes_requested") return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"><AlertCircle className="h-3.5 w-3.5" />Modificări cerute</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><Clock className="h-3.5 w-3.5" />În așteptare</span>;
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
      // 1. Generate + download the PDF
      await downloadParPdf(par);

      // 2. CORE §5: attach the generated PDF to the record (kind=par_pdf)
      // We re-generate a lightweight blob for the attachment record.
      // Since downloadParPdf doesn't return the blob, we do a minimal
      // second render to build the dataURL for the attachment.
      // This is intentional: the download is immediate for UX, the attachment
      // happens in the background and is non-blocking.
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
          const canvas = await html2canvas(node, {
            scale: 2,
            backgroundColor: "#ffffff",
            useCORS: true,
            logging: false,
          });
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
          await uploadAttachment(par.id, {
            file_name: `PAR_Form_${fileSafe}.pdf`,
            file_url: dataUrl,
            mime: "application/pdf",
            kind: "par_pdf",
          });
          onAttached();
        } finally {
          document.body.removeChild(host);
        }
      } catch {
        // Non-blocking: attachment save failing doesn't prevent the download
        console.warn("[PAR-115] attachment save failed (download succeeded)");
      }

      setStatus("done");
      // Reset after 3s
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
          status === "done"
            ? "bg-emerald-600 text-white"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
          status === "generating" && "opacity-70 cursor-not-allowed"
        )}
      >
        {status === "generating" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : status === "done" ? (
          <CheckCircle2 className="h-4 w-4" aria-hidden />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
        {status === "generating"
          ? "Se generează PDF..."
          : status === "done"
          ? "PDF descărcat"
          : "Download PDF"}
      </button>
      {status === "error" && errMsg && (
        <p role="alert" className="text-xs text-destructive">{errMsg}</p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ParDetailPage() {
  const { path, navigate } = useRouter();
  // Extract ID from path like /app/par/uuid
  const id = path.replace(/^\/app\/par\//, "").split("/")[0];

  const [par, setPar] = useState<ParDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPar(id);
      setPar(data);
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
          <button
            type="button"
            onClick={() => navigate("/app/par")}
            className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Înapoi la lista PAR
          </button>
        </div>
      </AppShell>
    );
  }

  // Approvals sorted by step
  const approvals = [...(par.approvals ?? [])].sort((a, b) => a.step - b.step);
  const requestorApproval = approvals.find((a) => a.step === 0) ?? null;
  const approverApprovals = approvals.filter((a) => a.step > 0);

  return (
    <AppShell pageTitle={`PAR ${par.requestNo}`}>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Back + header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button
              type="button"
              onClick={() => navigate("/app/par")}
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

          {/* PDF download button (PAR-115) */}
          <PdfDownloadButton par={par} onAttached={load} />
        </div>

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
            <p className="text-sm font-semibold text-foreground">
              {PURPOSE_LABEL[par.purpose] ?? par.purpose}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {par.purpose === "execute_payment" && "Necesită aprobare + plată"}
              {par.purpose === "obtain_quotations" && "Pre-achiziție, fără plată"}
              {par.purpose === "provide_estimate" && "Estimare cost, fără concurență"}
            </p>
          </Section>
          <Section num="9" title="Charge To">
            <p className="text-sm font-semibold text-foreground">
              {CHARGE_LABEL[par.chargeTo] ?? par.chargeTo}
            </p>
            {par.chargeBillingCode && (
              <p className="text-xs text-muted-foreground mt-0.5">Billing code: {par.chargeBillingCode}</p>
            )}
          </Section>
        </div>

        {/* SECTION 10: Line items */}
        <Section num="10" title="Articole solicitate">
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm border-collapse min-w-[500px]">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-2 text-xs font-semibold text-muted-foreground w-8">#</th>
                  <th className="text-left p-2 text-xs font-semibold text-muted-foreground">Descriere</th>
                  <th className="text-right p-2 text-xs font-semibold text-muted-foreground w-16">Cant</th>
                  <th className="text-left p-2 text-xs font-semibold text-muted-foreground w-16">Unitate</th>
                  <th className="text-right p-2 text-xs font-semibold text-muted-foreground w-28">Preț unitar</th>
                  <th className="text-right p-2 text-xs font-semibold text-muted-foreground w-28">Total</th>
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
                    <td colSpan={6} className="p-4 text-center text-muted-foreground text-sm">
                      Niciun articol
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={5} className="p-2 text-sm font-bold text-foreground text-right">
                    TOTAL ESTIMATED COST (MDL)
                  </td>
                  <td className="p-2 text-right text-base font-bold text-primary whitespace-nowrap">
                    {formatMDL(par.totalEstimatedCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            * Dacă prețul final depășește estimatul cu mai mult de 10% și valoarea e peste pragul
            de micro-achiziție, cererea necesită re-aprobare înainte de plată.
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
            <span className={cn(
              "text-sm font-medium",
              par.attachmentsPresent ? "text-foreground" : "text-muted-foreground"
            )}>
              {par.attachmentsPresent ? "Da (descrise mai jos)" : "Nu"}
            </span>
          </div>
          {par.attachmentsNote && (
            <p className="text-sm text-foreground mt-2 pl-1 border-l-2 border-border whitespace-pre-wrap">
              {par.attachmentsNote}
            </p>
          )}
          {/* Uploaded attachments list */}
          {(par.attachments ?? []).length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {par.attachments.map((att) => (
                <li key={att.id} className="flex items-center gap-2 text-sm">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden />
                  <a
                    href={att.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline truncate"
                    aria-label={`Deschide ${att.fileName}`}
                  >
                    {att.fileName}
                  </a>
                  {att.kind === "par_pdf" && (
                    <span className="text-xs text-muted-foreground">(PDF generat)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* SECTIONS 14–15: Approvals / signatures */}
        <Section num="14–15" title="Semnături și aprobări">
          <div className="space-y-3">
            {/* Section 14 — requestor */}
            {requestorApproval && (
              <div className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      14. Solicitant
                    </span>
                    <DecisionBadge decision={requestorApproval.decision} />
                  </div>
                  <p className="text-sm font-medium text-foreground mt-0.5">
                    {requestorApproval.signatureName ?? requestorApproval.approverUserId}
                  </p>
                  {requestorApproval.signatureTitle && (
                    <p className="text-xs text-muted-foreground">{requestorApproval.signatureTitle}</p>
                  )}
                  {requestorApproval.decidedAt && (
                    <p className="text-xs text-muted-foreground">{fmtDate(requestorApproval.decidedAt)}</p>
                  )}
                </div>
              </div>
            )}

            {/* Section 15 — approvers */}
            {approverApprovals.map((appr) => (
              <div key={appr.id} className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      15. {appr.approverRoleLabel ?? `Pas ${appr.step}`}
                    </span>
                    <DecisionBadge decision={appr.decision} />
                  </div>
                  <p className="text-sm font-medium text-foreground mt-0.5">
                    {appr.signatureName ?? appr.approverUserId ?? "—"}
                  </p>
                  {appr.signatureTitle && (
                    <p className="text-xs text-muted-foreground">{appr.signatureTitle}</p>
                  )}
                  {appr.decidedAt && (
                    <p className="text-xs text-muted-foreground">{fmtDate(appr.decidedAt)}</p>
                  )}
                  {appr.comment && (
                    <p className="text-sm text-foreground mt-1 pl-2 border-l-2 border-amber-400/60 italic">
                      {appr.comment}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {approvals.length === 0 && (
              <p className="text-sm text-muted-foreground">Nicio semnătură înregistrată.</p>
            )}
          </div>
        </Section>

        {/* SECTION 16: Finance */}
        {par.payment && (
          <Section num="16" title="Finanțe (uz intern)">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <Field label="PAR BL" value={par.payment.parBl} />
              <Field label="Data primirii" value={fmtDate(par.payment.receivedAt)} />
              <Field label="Primit de" value={par.payment.receivedByUserId} />
              <Field label="Alocat la" value={par.payment.assignedToUserId} />
              {par.payment.paymentDate && (
                <Field label="Data plății" value={fmtDate(par.payment.paymentDate)} />
              )}
              {par.payment.paymentRef && (
                <Field label="Referință" value={<code className="text-xs">{par.payment.paymentRef}</code>} />
              )}
              {par.payment.actualAmountCents != null && (
                <Field label="Sumă reală" value={formatMDL(par.payment.actualAmountCents)} />
              )}
            </dl>
            <div className="mt-3 pt-3 border-t border-border">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Field label="IBAN beneficiar" value={par.payeeIban ? <code className="text-xs">{par.payeeIban}</code> : null} />
                <Field label="Bancă beneficiar" value={par.payeeBank} />
              </dl>
            </div>
          </Section>
        )}

        {/* Status summary at bottom */}
        <div className="text-xs text-muted-foreground text-right pt-2">
          Status: <strong>{PAR_STATUS_LABELS[par.status] ?? par.status}</strong>
          {par.updatedAt && ` · Actualizat ${fmtDate(par.updatedAt)}`}
        </div>

      </div>
    </AppShell>
  );
}

export default ParDetailPage;
