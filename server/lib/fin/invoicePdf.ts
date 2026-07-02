/**
 * AUTOBILL: server-side invoice PDF (jsPDF — pure JS, bundles on Vercel, no Playwright/browser).
 *
 * A deliberately simple, text-based A4 layout: header, supplier + buyer blocks, a line table,
 * and totals. Enough for a client-facing courtesy copy emailed alongside the SFS e-Factura
 * (the legal document lives in SFS). jsPDF is verified to run in the Node serverless runtime.
 */
import { jsPDF } from "jspdf";

export interface InvoicePdfLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatPct: number;
  lineTotalCents: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  issuedAt: Date;
  dueDate: string | null;
  currency: string;
  supplierName: string;
  supplierIdno?: string | null;
  buyerName: string;
  buyerIdno?: string | null;
  lines: InvoicePdfLine[];
  totalCents: number;
  vatTotalCents: number;
  notes?: string | null;
}

function money(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export function generateInvoicePdf(data: InvoicePdfData): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 20;
  let y = 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`Factură ${data.invoiceNumber}`, left, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 8;
  doc.text(`Data emiterii: ${data.issuedAt.toISOString().slice(0, 10)}`, left, y);
  if (data.dueDate) doc.text(`Scadență: ${data.dueDate}`, left + 90, y);

  // Supplier + buyer blocks
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.text("Furnizor", left, y);
  doc.text("Client", left + 95, y);
  doc.setFont("helvetica", "normal");
  y += 6;
  doc.text(data.supplierName.slice(0, 45), left, y);
  doc.text(data.buyerName.slice(0, 45), left + 95, y);
  y += 5;
  if (data.supplierIdno) doc.text(`IDNO: ${data.supplierIdno}`, left, y);
  if (data.buyerIdno) doc.text(`IDNO: ${data.buyerIdno}`, left + 95, y);

  // Line table header
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.text("Descriere", left, y);
  doc.text("Cant.", left + 95, y);
  doc.text("Preț", left + 115, y);
  doc.text("TVA", left + 140, y);
  doc.text("Total", left + 160, y);
  doc.setLineWidth(0.2);
  doc.line(left, y + 2, left + 175, y + 2);
  doc.setFont("helvetica", "normal");
  y += 8;

  for (const l of data.lines) {
    if (y > 260) {
      doc.addPage();
      y = 22;
    }
    doc.text(l.description.slice(0, 50), left, y);
    doc.text(String(l.quantity), left + 95, y);
    doc.text(money(l.unitPriceCents, data.currency).replace(` ${data.currency}`, ""), left + 115, y);
    doc.text(`${l.vatPct}%`, left + 140, y);
    doc.text(money(l.lineTotalCents, data.currency).replace(` ${data.currency}`, ""), left + 160, y);
    y += 7;
  }

  // Totals
  y += 4;
  doc.line(left + 120, y, left + 175, y);
  y += 7;
  const netCents = data.totalCents - data.vatTotalCents;
  doc.text("Fără TVA:", left + 120, y);
  doc.text(money(netCents, data.currency), left + 160, y, { align: "left" });
  y += 6;
  doc.text("TVA:", left + 120, y);
  doc.text(money(data.vatTotalCents, data.currency), left + 160, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Total de plată:", left + 120, y);
  doc.text(money(data.totalCents, data.currency), left + 160, y);

  if (data.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(data.notes.slice(0, 120), left, Math.min(y + 14, 285));
  }

  return Buffer.from(doc.output("arraybuffer"));
}
