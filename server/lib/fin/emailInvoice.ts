/**
 * AUTOBILL: email one invoice (PDF attached) to the client. Pure data → Resend; no HTTP context.
 * Loads the invoice + lines + supplier (SFS settings) + buyer (party), renders the PDF via
 * jsPDF, and sends through the shared EmailProvider. Returns a structured result so the cron can
 * skip-with-reason (no email on file) and keep going.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { finInvoices, finInvoiceLines } from "../../db/schema/finInvoices";
import { finParties } from "../../db/schema/finParties";
import { finSfsSettings } from "../../db/schema/finEinvoices";
import { EmailProvider } from "../../services/messaging/providers";
import { generateInvoicePdf } from "./invoicePdf";

export type EmailInvoiceReason = "invoice_not_found" | "buyer_email_missing" | "send_failed";

export interface EmailInvoiceResult {
  ok: boolean;
  reason?: EmailInvoiceReason;
  detail?: string;
  to?: string;
}

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

/** Injectable so tests don't hit Resend. Defaults to the real provider. */
export async function emailInvoiceToClient(
  tenantId: string,
  invoiceId: string,
  opts: { supplierName?: string; email?: EmailProvider } = {},
): Promise<EmailInvoiceResult> {
  const [invoice] = await db
    .select()
    .from(finInvoices)
    .where(and(eq(finInvoices.id, invoiceId), eq(finInvoices.tenantId, tenantId)))
    .limit(1);
  if (!invoice) return { ok: false, reason: "invoice_not_found" };

  let buyerName = "Client";
  let buyerIdno: string | null = null;
  let buyerEmail: string | null = null;
  if (invoice.partyId) {
    const [party] = await db
      .select()
      .from(finParties)
      .where(and(eq(finParties.id, invoice.partyId), eq(finParties.tenantId, tenantId)))
      .limit(1);
    buyerName = party?.name ?? buyerName;
    buyerIdno = party?.idno ?? null;
    buyerEmail = party?.email ?? null;
  }
  if (!buyerEmail) return { ok: false, reason: "buyer_email_missing" };

  const [sfs] = await db
    .select()
    .from(finSfsSettings)
    .where(eq(finSfsSettings.tenantId, tenantId))
    .limit(1);
  const supplierName = opts.supplierName ?? "Furnizor";

  const lineRows = await db.select().from(finInvoiceLines).where(eq(finInvoiceLines.invoiceId, invoiceId));

  const pdf = generateInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt ?? new Date(),
    dueDate: invoice.dueDate ?? null,
    currency: invoice.currency,
    supplierName,
    supplierIdno: sfs?.idno ?? null,
    buyerName,
    buyerIdno,
    lines: lineRows.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      vatPct: l.vatPct,
      lineTotalCents: l.lineTotalCents,
    })),
    totalCents: invoice.totalCents,
    vatTotalCents: invoice.vatTotalCents,
    notes: invoice.notes ?? null,
  });

  const provider = opts.email ?? new EmailProvider();
  const body =
    `Bună ziua,\n\n` +
    `Atașat găsiți factura ${invoice.invoiceNumber} în valoare de ` +
    `${money(invoice.totalCents, invoice.currency)}` +
    `${invoice.dueDate ? `, scadentă la ${invoice.dueDate}` : ""}.\n\n` +
    `Vă mulțumim,\n${supplierName}`;

  const res = await provider.send({
    to: buyerEmail,
    subject: `Factura ${invoice.invoiceNumber} — ${supplierName}`,
    body,
    attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf }],
  });

  if (res.status !== "sent") {
    return { ok: false, reason: "send_failed", detail: res.errorMessage, to: buyerEmail };
  }
  return { ok: true, to: buyerEmail };
}
