/**
 * VM3-02: "Fișa aprobărilor" — the first page of the combined dosar PDF.
 *
 * Violeta (finance/audit): "Eu când o să descarc par-urile aprobate, eu trebuie să arăt:
 * uite, par-ul ăsta cu adevărat a fost aprobat la data asta, cine l-a aprobat. Să fie
 * vizibil, nu ca să ne uităm în setări."
 *
 * Pure text assembly (no pdf-lib) so it's unit-testable: the route draws exactly these
 * lines. All output is passed through winAnsiSafe() — the standard Helvetica font would
 * otherwise THROW on ă/ș/ț (see pdfText.ts).
 */
import { winAnsiSafe } from "./pdfText";

export interface ApprovalSheetApproval {
  step: number;
  approverRoleLabel: string | null;
  name: string | null; // resolved display name (signatureName ?? users.name)
  decision: string;
  decidedAt: Date | string | null;
  comment: string | null;
}

export interface ApprovalSheetData {
  requestNo: string | null;
  dateOfRequest: Date | string | null;
  status: string;
  requestedByName: string | null;
  payeeName: string | null;
  payeeIdnp: string | null;
  payeeIban: string | null;
  payeeBank: string | null;
  currency: string;
  totalEstimatedCents: number;
  totalMdlCents: number | null;
  projectName: string | null;
  eventName: string | null;
  budgetCodeLabel: string | null;
  endUse: string | null;
  approvedAt: Date | string | null;
  paidAt: Date | string | null;
  approvals: ApprovalSheetApproval[];
}

export interface SheetLine {
  text: string;
  bold?: boolean;
  size?: number; // default 10
  gapBefore?: number; // extra vertical gap in points before this line
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Ciornă",
  pending_approval: "În aprobare",
  changes_requested: "Modificări cerute",
  rejected: "Respins",
  approved: "Aprobat",
  in_finance: "La finanțe",
  reapproval_required: "Re-aprobare necesară",
  paid: "Plătit",
  cancelled: "Anulat",
};

const DECISION_LABELS: Record<string, string> = {
  approved: "APROBAT",
  rejected: "RESPINS",
  changes_requested: "MODIFICĂRI CERUTE",
  pending: "în așteptare",
};

function fmtDate(v: Date | string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Chisinau",
  });
}

function fmtDateTime(v: Date | string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  const date = fmtDate(d);
  const time = d.toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Chisinau",
  });
  return `${date} ${time}`;
}

function fmtAmount(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency || "MDL"}`;
}

/** Builds the full ordered list of lines for the approval sheet page. */
export function buildApprovalSheetLines(d: ApprovalSheetData, generatedAt: Date): SheetLine[] {
  const lines: SheetLine[] = [];
  const push = (text: string, opts: Omit<SheetLine, "text"> = {}) =>
    lines.push({ text: winAnsiSafe(text), ...opts });

  push(`FIȘA APROBĂRILOR — ${d.requestNo ?? "fără număr"}`, { bold: true, size: 16 });
  push(`Generată la ${fmtDateTime(generatedAt)} din sistemul PAR (statusul din momentul descărcării)`, {
    size: 8,
  });

  push("Cererea", { bold: true, size: 12, gapBefore: 14 });
  push(`Nr. cerere: ${d.requestNo ?? "—"} · Data cererii: ${fmtDate(d.dateOfRequest)}`);
  push(`Solicitant: ${d.requestedByName ?? "—"}`);
  const status = STATUS_LABELS[d.status] ?? d.status;
  const statusBits = [`Status: ${status}`];
  if (d.approvedAt) statusBits.push(`Aprobat la: ${fmtDateTime(d.approvedAt)}`);
  if (d.paidAt) statusBits.push(`Plătit la: ${fmtDateTime(d.paidAt)}`);
  push(statusBits.join(" · "), { bold: true });

  push("Plata", { bold: true, size: 12, gapBefore: 14 });
  push(`Beneficiar: ${d.payeeName ?? "—"}${d.payeeIdnp ? ` (IDNO/IDNP: ${d.payeeIdnp})` : ""}`);
  push(`IBAN: ${d.payeeIban ?? "—"}${d.payeeBank ? ` · Banca: ${d.payeeBank}` : ""}`);
  const amountBits = [`Suma estimată: ${fmtAmount(d.totalEstimatedCents, d.currency)}`];
  if (d.currency !== "MDL" && d.totalMdlCents != null) {
    amountBits.push(`echivalent ${fmtAmount(d.totalMdlCents, "MDL")}`);
  }
  push(amountBits.join(" · "));
  const ctx = [
    d.projectName ? `Proiect: ${d.projectName}` : null,
    d.eventName ? `Eveniment: ${d.eventName}` : null,
    d.budgetCodeLabel ? `Budget line: ${d.budgetCodeLabel}` : null,
  ].filter((v): v is string => !!v);
  if (ctx.length > 0) push(ctx.join(" · "));
  if (d.endUse) {
    const trimmed = d.endUse.length > 300 ? `${d.endUse.slice(0, 300)}…` : d.endUse;
    push(`Destinația plății: ${trimmed}`);
  }

  push("Lanțul de aprobare", { bold: true, size: 12, gapBefore: 14 });
  const sorted = [...d.approvals].sort((a, b) => a.step - b.step);
  if (sorted.length === 0) {
    push("Nicio semnătură înregistrată (cererea nu a fost trimisă spre aprobare).");
  }
  for (const a of sorted) {
    const who = a.name ?? "—";
    const role = a.approverRoleLabel ?? (a.step === 0 ? "Solicitant" : `Pas ${a.step}`);
    const decision = DECISION_LABELS[a.decision] ?? a.decision;
    const when = a.decidedAt ? ` la ${fmtDateTime(a.decidedAt)}` : "";
    if (a.step === 0) {
      push(`Pas 0 — ${role}: ${who} — trimis spre aprobare${when}`);
    } else {
      push(`Pas ${a.step} — ${role}: ${who} — ${decision}${when}`, {
        bold: a.decision === "approved",
      });
    }
    if (a.comment) push(`    Comentariu: ${a.comment}`, { size: 9 });
  }

  push(
    "Document generat automat pentru audit: confirmă cine a aprobat cererea și la ce dată.",
    { size: 8, gapBefore: 16 }
  );

  return lines;
}
