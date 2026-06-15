/**
 * FinDesk — "Cont de plată" document template (FRESH DESIGN).
 *
 * This is a SEPARATE, alternative invoice document from src/lib/finInvoicePdf.ts.
 * Purpose: generate a print-ready "Cont de plată" PDF for a fin_invoices row,
 * styled DIFFERENTLY from the existing blue fiscal invoice — an emerald/slate
 * layout with an explicit "De la / Către" header and a bank-details block,
 * mirroring the structure of a real Moldovan payment-account document.
 *
 * Pure function (no DOM, no browser): returns a full HTML string that the
 * server rasterizes to PDF with Playwright (see server/routes/finInvoiceDoc.ts),
 * and that the web preview iframe renders directly.
 *
 * Design tokens here are inline hex BY DESIGN — this is a print document, not an
 * app screen, so it must not depend on Tailwind / the Vector 365 token runtime.
 */

// ─── Palette — emerald/slate, deliberately distinct from the blue invoice ───────

const INK = "#0f172a"; // slate-900
const MUTED = "#64748b"; // slate-500
const FAINT = "#94a3b8"; // slate-400
const LINE = "#e2e8f0"; // slate-200
const PANEL = "#f8fafc"; // slate-50
const ACCENT = "#047857"; // emerald-700
const ACCENT_SOFT = "#ecfdf5"; // emerald-50
const ACCENT_INK = "#064e3b"; // emerald-900

// ─── i18n ───────────────────────────────────────────────────────────────────

const LABELS = {
  ro: {
    docTitle: "Cont de plată",
    issued: "Data emiterii",
    due: "Data scadentă",
    from: "De la",
    to: "Către",
    description: "Descriere",
    qty: "Cant.",
    unit: "Unitate",
    price: "Preț",
    amount: "Sumă",
    bankDetails: "Detalii bancare",
    bank: "Banca",
    currency: "Valută",
    iban: "IBAN",
    swift: "SWIFT",
    fiscalCode: "Cod fiscal",
    company: "Denumire",
    subtotal: "Subtotal",
    vat: "TVA",
    total: "Total",
    toPay: "Spre plată",
    notes: "Note",
    piece: "buc",
  },
  ru: {
    docTitle: "Счёт на оплату",
    issued: "Дата выставления",
    due: "Срок оплаты",
    from: "От",
    to: "Кому",
    description: "Описание",
    qty: "Кол.",
    unit: "Ед.",
    price: "Цена",
    amount: "Сумма",
    bankDetails: "Банковские реквизиты",
    bank: "Банк",
    currency: "Валюта",
    iban: "IBAN",
    swift: "SWIFT",
    fiscalCode: "Фискальный код",
    company: "Название",
    subtotal: "Подытог",
    vat: "НДС",
    total: "Итого",
    toPay: "К оплате",
    notes: "Примечания",
    piece: "шт",
  },
  en: {
    docTitle: "Payment Invoice",
    issued: "Issue date",
    due: "Due date",
    from: "From",
    to: "To",
    description: "Description",
    qty: "Qty",
    unit: "Unit",
    price: "Price",
    amount: "Amount",
    bankDetails: "Bank details",
    bank: "Bank",
    currency: "Currency",
    iban: "IBAN",
    swift: "SWIFT",
    fiscalCode: "Fiscal code",
    company: "Company name",
    subtotal: "Subtotal",
    vat: "VAT",
    total: "Total",
    toPay: "To pay",
    notes: "Notes",
    piece: "pcs",
  },
} as const;

export type InvoiceDocLang = keyof typeof LABELS;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceDocParty {
  name: string;
  /** Fiscal code / IDNO — shown under the name. */
  idno?: string | null;
  address?: string | null;
}

export interface InvoiceDocBank {
  bankName?: string | null;
  currency?: string | null;
  iban?: string | null;
  swift?: string | null;
  fiscalCode?: string | null;
  companyName?: string | null;
}

export interface InvoiceDocData {
  /** Human number, e.g. "FIN-2026-0278" or just "278". */
  invoiceNumber: string;
  currency: string;
  issuedAt: string | Date | null;
  dueDate: string | Date | null;
  totalCents: number;
  vatTotalCents: number;
  notes?: string | null;
  from: InvoiceDocParty;
  to: InvoiceDocParty;
  bank: InvoiceDocBank;
}

export interface InvoiceDocLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatPct: number;
  lineTotalCents: number;
  /** Optional unit label, e.g. "buc". Falls back to the localized "piece". */
  unit?: string | null;
}

export interface InvoiceDocOptions {
  lang?: InvoiceDocLang;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** HTML-escape — anti-injection. */
export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );
}

/** Format minor-unit cents as "L 3 219" (MDL) or "€ 70,00". Locale-independent. */
export function money(cents: number, currency = "MDL"): string {
  const neg = cents < 0;
  const v = Math.abs(Math.round(cents));
  const whole = Math.floor(v / 100);
  const frac = v % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const dec = frac ? "," + String(frac).padStart(2, "0") : "";
  const sym = currency === "MDL" ? "L" : currency;
  return `${neg ? "-" : ""}${sym} ${grouped}${dec}`;
}

/** Format a date as YYYY-MM-DD (matches the reference document style). */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return esc(String(value));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function partyBlock(label: string, party: InvoiceDocParty, align: "left" | "right"): string {
  const idno = party.idno
    ? `<div style="font-size:11px;color:${MUTED};margin-top:2px;">${esc(party.idno)}</div>`
    : "";
  const addr = party.address
    ? `<div style="font-size:11px;color:${MUTED};margin-top:2px;">${esc(party.address)}</div>`
    : "";
  return `
    <div style="text-align:${align};">
      <div style="font-size:10px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${esc(label)}</div>
      <div style="font-size:14px;font-weight:700;color:${INK};">${esc(party.name) || "—"}</div>
      ${idno}
      ${addr}
    </div>`;
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

/**
 * Build the full "Cont de plată" document as an HTML string.
 * Pure — testable in Vitest/Node without a browser.
 */
export function buildInvoiceDocHtml(
  data: InvoiceDocData,
  lines: InvoiceDocLine[],
  options: InvoiceDocOptions = {}
): string {
  const lang: InvoiceDocLang = options.lang ?? "ro";
  const L = LABELS[lang];
  const cur = data.currency || "MDL";
  const subtotalCents = data.totalCents - data.vatTotalCents;

  const lineRows = lines
    .map(
      (l, i) => `
      <tr style="background:${i % 2 === 1 ? PANEL : "#fff"};">
        <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};">${esc(l.description)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};text-align:center;">${l.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font-size:12px;color:${MUTED};text-align:center;">${esc(l.unit || L.piece)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};text-align:right;">${money(l.unitPriceCents, cur)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};text-align:right;font-weight:600;">${money(l.lineTotalCents, cur)}</td>
      </tr>`
    )
    .join("");

  const bankRow = (label: string, value: string | null | undefined) =>
    value
      ? `<tr><td style="padding:3px 0;font-size:11px;color:${MUTED};width:96px;">${esc(label)}</td><td style="padding:3px 0;font-size:11px;color:${INK};font-weight:600;">${esc(value)}</td></tr>`
      : "";

  const bankBlock =
    data.bank.iban || data.bank.swift || data.bank.bankName || data.bank.fiscalCode
      ? `
    <table style="border-collapse:collapse;">
      ${bankRow(L.bank, data.bank.bankName)}
      ${bankRow(L.currency, data.bank.currency || cur)}
      ${bankRow(L.iban, data.bank.iban)}
      ${bankRow(L.swift, data.bank.swift)}
      ${bankRow(L.fiscalCode, data.bank.fiscalCode)}
      ${bankRow(L.company, data.bank.companyName)}
    </table>`
      : `<div style="font-size:11px;color:${FAINT};">—</div>`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; }
    body { font-family: Arial, Helvetica, sans-serif; color: ${INK}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table { border-collapse: collapse; width: 100%; }
    @page { margin: 0; }
  </style>
</head>
<body>
  <div style="width:794px;margin:0 auto;padding:48px 56px 0;position:relative;">

    <!-- Title band -->
    <table style="margin-bottom:32px;">
      <tr>
        <td style="vertical-align:top;">
          <div style="font-size:11px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:0.14em;">${esc(L.docTitle)}</div>
          <div style="font-size:30px;font-weight:800;color:${INK};letter-spacing:-0.02em;margin-top:2px;">Nr. ${esc(data.invoiceNumber)}</div>
        </td>
        <td style="vertical-align:top;text-align:right;">
          <table style="width:auto;margin-left:auto;">
            <tr>
              <td style="padding:2px 0 2px 16px;font-size:11px;color:${MUTED};">${esc(L.issued)}</td>
              <td style="padding:2px 0 2px 16px;font-size:12px;color:${INK};font-weight:600;text-align:right;">${fmtDate(data.issuedAt)}</td>
            </tr>
            <tr>
              <td style="padding:2px 0 2px 16px;font-size:11px;color:${MUTED};">${esc(L.due)}</td>
              <td style="padding:2px 0 2px 16px;font-size:12px;color:${INK};font-weight:600;text-align:right;">${fmtDate(data.dueDate)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Parties: From / To -->
    <table style="margin-bottom:28px;">
      <tr>
        <td style="width:50%;vertical-align:top;padding-right:16px;">${partyBlock(L.from, data.from, "left")}</td>
        <td style="width:50%;vertical-align:top;padding-left:16px;border-left:1px solid ${LINE};">${partyBlock(L.to, data.to, "right")}</td>
      </tr>
    </table>

    <!-- Line items -->
    <table style="margin-bottom:24px;">
      <thead>
        <tr style="border-bottom:2px solid ${ACCENT};">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:0.06em;">${esc(L.description)}</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:0.06em;width:56px;">${esc(L.qty)}</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:0.06em;width:72px;">${esc(L.unit)}</th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:0.06em;width:110px;">${esc(L.price)}</th>
          <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:0.06em;width:120px;">${esc(L.amount)}</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>

    <!-- Footer row: bank details (left) + totals (right) -->
    <table style="margin-bottom:32px;">
      <tr>
        <td style="width:55%;vertical-align:top;padding-right:24px;">
          <div style="font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">${esc(L.bankDetails)}</div>
          ${bankBlock}
        </td>
        <td style="width:45%;vertical-align:top;">
          <table>
            <tr>
              <td style="padding:5px 0;font-size:12px;color:${MUTED};">${esc(L.subtotal)}</td>
              <td style="padding:5px 0;font-size:12px;color:${INK};text-align:right;">${money(subtotalCents, cur)}</td>
            </tr>
            <tr style="border-bottom:1px solid ${LINE};">
              <td style="padding:5px 0 9px;font-size:12px;color:${MUTED};">${esc(L.vat)}</td>
              <td style="padding:5px 0 9px;font-size:12px;color:${INK};text-align:right;">${money(data.vatTotalCents, cur)}</td>
            </tr>
            <tr>
              <td style="padding:9px 0;font-size:13px;color:${INK};font-weight:600;">${esc(L.total)}</td>
              <td style="padding:9px 0;font-size:13px;color:${INK};font-weight:700;text-align:right;">${money(data.totalCents, cur)}</td>
            </tr>
          </table>
          <div style="margin-top:8px;background:${ACCENT_SOFT};border:1px solid ${ACCENT};border-radius:8px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;font-weight:700;color:${ACCENT_INK};text-transform:uppercase;letter-spacing:0.06em;">${esc(L.toPay)}</span>
            <span style="font-size:22px;font-weight:800;color:${ACCENT_INK};">${money(data.totalCents, cur)}</span>
          </div>
        </td>
      </tr>
    </table>

    ${
      data.notes
        ? `<div style="border-top:1px solid ${LINE};padding-top:12px;">
        <div style="font-size:10px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${esc(L.notes)}</div>
        <div style="font-size:11px;color:${MUTED};line-height:1.5;">${esc(data.notes)}</div>
      </div>`
        : ""
    }

  </div>

  <!-- Bottom accent band: total to pay (mirrors the reference doc footer) -->
  <div style="position:fixed;bottom:0;left:0;right:0;background:${ACCENT};padding:20px 56px;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:13px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.1em;">${esc(L.toPay)}</span>
    <span style="font-size:30px;font-weight:800;color:#fff;">${money(data.totalCents, cur)}</span>
  </div>
</body>
</html>`;
}
