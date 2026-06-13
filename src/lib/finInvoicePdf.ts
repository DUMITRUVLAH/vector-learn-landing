/**
 * BILL-004: FinDesk B2B Invoice PDF Generator
 *
 * Technique mirrors src/lib/parPdf.ts and src/lib/paymentAccountPdf.ts exactly:
 *   buildFinInvoiceHtml(invoice, lines, options): string — pure function, testable without a browser
 *   downloadFinInvoicePdf(invoice, lines, options): Promise<void> — rasterizes with html2canvas+jsPDF
 *
 * Multi-language support: ro (default), ru, en.
 * Romanian/Moldovan fiscal format: VAT per line (FIN-CORE Rule #1), signature + stamp boxes.
 *
 * Why rasterize (not jsPDF text): jsPDF's built-in fonts mangle Romanian diacritics (ș/ț/ă/î).
 * Rendering via the browser's web font keeps glyphs correct.
 * jspdf and html2canvas are already project dependencies — no new libs added.
 */

import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

// ─── PDF-only palette (inline hex — html2canvas-safe, not design-system tokens) ─────────────

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const HEADER_BG = "#1e40af"; // FinDesk brand: deep blue
const HEADER_TEXT = "#ffffff";
const ALT_ROW = "#f8fafc";
const TOTAL_BG = "#eff6ff";

// ─── i18n labels ──────────────────────────────────────────────────────────────

const LABELS = {
  ro: {
    title: "FACTURĂ FISCALĂ",
    invoiceNo: "Nr. factură",
    date: "Data",
    dueDate: "Scadent la",
    noDueDate: "Fără scadență",
    issuedBy: "Emitent",
    issuedTo: "Destinatar (Beneficiar)",
    description: "Descriere",
    qty: "Cant.",
    unitPrice: "Preț unitar",
    vatPct: "TVA %",
    lineTotal: "Total linie",
    subtotal: "Subtotal (fără TVA)",
    vatTotal: "Total TVA",
    grandTotal: "TOTAL DE PLATĂ",
    currency: "Valută",
    sigBlock: "Semnături și ștampile",
    emitent: "Emitent",
    beneficiar: "Beneficiar",
    signature: "Semnătură / Director",
    stamp: "Ștampilă",
    prepared: "Întocmit",
  },
  ru: {
    title: "СЧЁТ-ФАКТУРА",
    invoiceNo: "№ счёта",
    date: "Дата",
    dueDate: "Срок оплаты",
    noDueDate: "Без срока",
    issuedBy: "Поставщик",
    issuedTo: "Получатель",
    description: "Описание",
    qty: "Кол.",
    unitPrice: "Цена за ед.",
    vatPct: "НДС %",
    lineTotal: "Сумма строки",
    subtotal: "Итого (без НДС)",
    vatTotal: "Итого НДС",
    grandTotal: "ИТОГО К ОПЛАТЕ",
    currency: "Валюта",
    sigBlock: "Подписи и печати",
    emitent: "Поставщик",
    beneficiar: "Получатель",
    signature: "Подпись / Директор",
    stamp: "Печать",
    prepared: "Составил",
  },
  en: {
    title: "INVOICE",
    invoiceNo: "Invoice No.",
    date: "Date",
    dueDate: "Due Date",
    noDueDate: "No due date",
    issuedBy: "Issued by",
    issuedTo: "Issued to",
    description: "Description",
    qty: "Qty",
    unitPrice: "Unit Price",
    vatPct: "VAT %",
    lineTotal: "Line Total",
    subtotal: "Subtotal (excl. VAT)",
    vatTotal: "Total VAT",
    grandTotal: "TOTAL DUE",
    currency: "Currency",
    sigBlock: "Signatures & Stamps",
    emitent: "Issuer",
    beneficiar: "Recipient",
    signature: "Signature / Director",
    stamp: "Stamp",
    prepared: "Prepared by",
  },
} as const;

type Lang = keyof typeof LABELS;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinInvoiceForPdf {
  invoiceNumber: string;
  series: string;
  number: number;
  currency: string;
  issuedAt: string | null;
  dueDate: string | null;
  totalCents: number;
  vatTotalCents: number;
  notes: string | null;
  /** Party name (joined from fin_parties), may be null for ad-hoc invoices. */
  partyName?: string | null;
  /** Tenant/issuer name */
  tenantName?: string | null;
}

export interface FinInvoiceLineForPdf {
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatPct: number;
  lineTotalCents: number;
}

export interface FinInvoicePdfOptions {
  /** Display language. Default: "ro" */
  lang?: Lang;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** HTML-escape — anti-injection. Same contract as parPdf.esc(). */
export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );
}

/**
 * Format minor-unit cents as "L 7 000" (MDL) or "€ 70,00" (EUR).
 * Locale-independent thousands grouping. Same algorithm as parPdf.money().
 */
export function money(cents: number, currency = "MDL"): string {
  const neg = cents < 0;
  const v = Math.abs(Math.round(cents));
  const whole = Math.floor(v / 100);
  const frac = v % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const dec = frac ? "," + String(frac).padStart(2, "0") : "";
  const sym = currency === "MDL" ? "L" : currency;
  return `${neg ? "-" : ""}${sym} ${grouped}${dec}`;
}

/** Format a date string as DD.MM.YYYY */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  const yr = d.getFullYear();
  return `${day}.${mon}.${yr}`;
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

/**
 * Build the full B2B invoice as an HTML string.
 * Pure function — no DOM, no browser APIs — testable in Vitest/Node.
 *
 * @param invoice  Invoice header data
 * @param lines    Line items
 * @param options  { lang: "ro" | "ru" | "en" }
 */
export function buildFinInvoiceHtml(
  invoice: FinInvoiceForPdf,
  lines: FinInvoiceLineForPdf[],
  options: FinInvoicePdfOptions = {}
): string {
  const lang: Lang = options.lang ?? "ro";
  const L = LABELS[lang];
  const cur = invoice.currency || "MDL";

  // Subtotal = totalCents - vatTotalCents
  const subtotalCents = invoice.totalCents - invoice.vatTotalCents;

  // Line rows
  const lineRows = lines
    .map(
      (l, i) => `
      <tr style="background:${i % 2 === 1 ? ALT_ROW : "#fff"};">
        <td style="padding:6px 8px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};">${esc(l.description)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};text-align:center;">${l.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};text-align:right;">${money(l.unitPriceCents, cur)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};text-align:center;">${l.vatPct}%</td>
        <td style="padding:6px 8px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};text-align:right;font-weight:600;">${money(l.lineTotalCents, cur)}</td>
      </tr>`
    )
    .join("");

  const issuerName = invoice.tenantName ?? "";
  const recipientName = invoice.partyName ?? "—";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: ${INK}; }
    table { border-collapse: collapse; width: 100%; }
  </style>
</head>
<body style="padding:24px;max-width:794px;margin:auto;">

  <!-- Header -->
  <table style="margin-bottom:16px;">
    <tr>
      <td style="width:60%;vertical-align:top;">
        <div style="font-size:22px;font-weight:800;color:${HEADER_BG};letter-spacing:-0.03em;">
          ${esc(L.title)}
        </div>
        <div style="font-size:14px;color:${MUTED};margin-top:4px;">
          ${esc(L.invoiceNo)}: <strong style="color:${INK};">${esc(invoice.invoiceNumber)}</strong>
        </div>
      </td>
      <td style="width:40%;vertical-align:top;text-align:right;">
        <div style="font-size:11px;color:${MUTED};">${esc(L.date)}: <strong>${fmtDate(invoice.issuedAt)}</strong></div>
        <div style="font-size:11px;color:${MUTED};margin-top:3px;">${esc(L.dueDate)}: <strong>${invoice.dueDate ? fmtDate(invoice.dueDate) : esc(L.noDueDate)}</strong></div>
        <div style="font-size:11px;color:${MUTED};margin-top:3px;">${esc(L.currency)}: <strong>${esc(cur)}</strong></div>
      </td>
    </tr>
  </table>

  <!-- Parties -->
  <table style="margin-bottom:16px;border:1px solid ${LINE};border-radius:4px;">
    <tr>
      <td style="padding:10px 14px;border-right:1px solid ${LINE};width:50%;vertical-align:top;">
        <div style="font-size:9px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${esc(L.issuedBy)}</div>
        <div style="font-size:13px;font-weight:700;color:${INK};">${esc(issuerName) || "&nbsp;"}</div>
      </td>
      <td style="padding:10px 14px;width:50%;vertical-align:top;">
        <div style="font-size:9px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${esc(L.issuedTo)}</div>
        <div style="font-size:13px;font-weight:700;color:${INK};">${esc(recipientName)}</div>
      </td>
    </tr>
  </table>

  <!-- Line items table -->
  <table style="margin-bottom:16px;border:1px solid ${LINE};">
    <thead>
      <tr style="background:${HEADER_BG};">
        <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:${HEADER_TEXT};letter-spacing:0.03em;">${esc(L.description)}</th>
        <th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:700;color:${HEADER_TEXT};width:60px;">${esc(L.qty)}</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;color:${HEADER_TEXT};width:110px;">${esc(L.unitPrice)}</th>
        <th style="padding:8px 10px;text-align:center;font-size:11px;font-weight:700;color:${HEADER_TEXT};width:70px;">${esc(L.vatPct)}</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;color:${HEADER_TEXT};width:110px;">${esc(L.lineTotal)}</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
    </tbody>
  </table>

  <!-- Totals -->
  <table style="margin-bottom:20px;width:320px;margin-left:auto;border:1px solid ${LINE};">
    <tr>
      <td style="padding:6px 12px;font-size:12px;color:${MUTED};border-bottom:1px solid ${LINE};">${esc(L.subtotal)}</td>
      <td style="padding:6px 12px;font-size:12px;color:${INK};text-align:right;border-bottom:1px solid ${LINE};">${money(subtotalCents, cur)}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px;font-size:12px;color:${MUTED};border-bottom:1px solid ${LINE};">${esc(L.vatTotal)}</td>
      <td style="padding:6px 12px;font-size:12px;color:${INK};text-align:right;border-bottom:1px solid ${LINE};">${money(invoice.vatTotalCents, cur)}</td>
    </tr>
    <tr style="background:${TOTAL_BG};">
      <td style="padding:10px 12px;font-size:14px;font-weight:800;color:${HEADER_BG};">${esc(L.grandTotal)}</td>
      <td style="padding:10px 12px;font-size:14px;font-weight:800;color:${HEADER_BG};text-align:right;">${money(invoice.totalCents, cur)}</td>
    </tr>
  </table>

  ${invoice.notes ? `
  <!-- Notes -->
  <div style="background:#f8fafc;border:1px solid ${LINE};border-radius:4px;padding:10px 14px;margin-bottom:20px;font-size:12px;color:${MUTED};">
    ${esc(invoice.notes)}
  </div>` : ""}

  <!-- Signature block -->
  <div style="font-size:9px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${esc(L.sigBlock)}</div>
  <table style="border:1px solid ${LINE};">
    <tr>
      <td style="width:50%;padding:12px 16px;border-right:1px solid ${LINE};vertical-align:top;">
        <div style="font-size:9px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${esc(L.emitent)}</div>
        <div style="font-size:11px;color:${INK};font-weight:600;margin-bottom:4px;">${esc(issuerName)}</div>
        <div style="border-bottom:1px solid ${LINE};margin:12px 0 4px;"></div>
        <div style="font-size:10px;color:${MUTED};">${esc(L.signature)}</div>
        <div style="height:40px;"></div>
        <div style="border-bottom:1px solid ${LINE};margin:4px 0;"></div>
        <div style="font-size:10px;color:${MUTED};">${esc(L.stamp)}</div>
        <div style="height:40px;"></div>
      </td>
      <td style="width:50%;padding:12px 16px;vertical-align:top;">
        <div style="font-size:9px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${esc(L.beneficiar)}</div>
        <div style="font-size:11px;color:${INK};font-weight:600;margin-bottom:4px;">${esc(recipientName)}</div>
        <div style="border-bottom:1px solid ${LINE};margin:12px 0 4px;"></div>
        <div style="font-size:10px;color:${MUTED};">${esc(L.signature)}</div>
        <div style="height:40px;"></div>
        <div style="border-bottom:1px solid ${LINE};margin:4px 0;"></div>
        <div style="font-size:10px;color:${MUTED};">${esc(L.stamp)}</div>
        <div style="height:40px;"></div>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ─── PDF download (browser-only) ───────────────────────────────────────────────

/**
 * Renders the invoice HTML with html2canvas, then saves as PDF via jsPDF.
 * Must only be called in a browser context (uses DOM + Canvas).
 *
 * @param invoice  Invoice header
 * @param lines    Line items
 * @param options  { lang }
 */
export async function downloadFinInvoicePdf(
  invoice: FinInvoiceForPdf,
  lines: FinInvoiceLineForPdf[],
  options: FinInvoicePdfOptions = {}
): Promise<void> {
  const html = buildFinInvoiceHtml(invoice, lines, options);

  // Mount a hidden container
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:794px;background:#fff;z-index:-1;";
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    const imgWidth = pageWidth;
    const imgHeight = imgWidth / ratio;

    // If taller than one page, scale to fit
    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    } else {
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, pageHeight);
    }

    const filename = `${invoice.invoiceNumber}.pdf`;
    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}
