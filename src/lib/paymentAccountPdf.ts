/**
 * CONT-PLATA: client-side PDF generator for a payment account ("cont de plată").
 *
 * Renders a fixed-styled HTML node that mirrors the standard MD invoice layout
 * (blue header rule, Către/De la parties, line-item table, bank block, "Spre plată"
 * footer band), rasterizes it with html2canvas at high DPI, and places it into an
 * A4 jsPDF for a one-click download.
 *
 * Why rasterize instead of drawing jsPDF text directly: jsPDF's built-in fonts use
 * WinAnsi encoding and mangle Romanian diacritics (ș/ț/ă/î). Rendering through the
 * browser's web font and snapshotting keeps the glyphs correct without shipping an
 * embedded TTF. Both jspdf and html2canvas are already project dependencies.
 */
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { PaymentAccountDetail } from "./api/paymentAccounts";

const BLUE = "#2f6bff";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

/** Format minor units as "L 7 241" — symbol, space-grouped thousands, comma decimals only when non-zero. */
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

function isoDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

export function buildHtml(a: PaymentAccountDetail): string {
  const title = a.documentNumber ?? (a.number != null ? String(a.number) : "(ciornă)");
  const rows = a.items
    .map(
      (it) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid ${LINE};color:${INK};font-weight:600;">${esc(it.description)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid ${LINE};text-align:right;color:${INK};">${esc(String(it.quantity))}</td>
        <td style="padding:10px 8px;border-bottom:1px solid ${LINE};color:${MUTED};">${esc(it.unit)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid ${LINE};text-align:right;color:${INK};white-space:nowrap;">${money(it.unitPriceCents, a.currency)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid ${LINE};text-align:right;color:${INK};font-weight:600;white-space:nowrap;">${money(it.lineTotalCents, a.currency)}</td>
      </tr>`
    )
    .join("");

  const buyerLines = [esc(a.buyerName), esc(a.buyerCity), a.buyerIdno ? esc(a.buyerIdno) : ""]
    .filter(Boolean)
    .map((l, i) => `<div style="${i === 0 ? `font-weight:700;color:${INK};` : `color:${MUTED};`}margin-top:${i === 0 ? 0 : 2}px;">${l}</div>`)
    .join("");

  const sellerLines = [esc(a.sellerName), a.sellerIdno ? esc(a.sellerIdno) : ""]
    .filter(Boolean)
    .map((l, i) => `<div style="${i === 0 ? `font-weight:700;color:${INK};` : `color:${MUTED};`}margin-top:${i === 0 ? 0 : 2}px;text-align:right;">${l}</div>`)
    .join("");

  const bank = [
    a.sellerBankName ? `Bank: ${esc(a.sellerBankName)}` : "",
    `Currency: ${esc(a.currency)}`,
    a.sellerIban ? `IBAN: ${esc(a.sellerIban)}` : "",
    a.sellerBankCode ? `SWIFT: ${esc(a.sellerBankCode)}` : "",
    a.sellerIdno ? `Fiscal code: ${esc(a.sellerIdno)}` : "",
    a.sellerName ? `Company name: ${esc(a.sellerName)}` : "",
  ]
    .filter(Boolean)
    .map((l) => `<div style="color:${MUTED};line-height:1.7;">${l}</div>`)
    .join("");

  return `
  <div style="width:794px;box-sizing:border-box;background:#ffffff;font-family:Onest,Inter,Arial,sans-serif;color:${INK};position:relative;padding:0 0 96px 0;">
    <div style="height:6px;background:${BLUE};width:100%;"></div>
    <div style="padding:40px 48px 0 48px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="font-size:26px;font-weight:800;color:${INK};">Cont de plată: ${esc(title)}</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:22px;height:22px;border-radius:6px;background:${BLUE};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;">V</div>
          <div style="font-weight:700;color:${INK};font-size:15px;">${esc(a.sellerName || "Vector")}</div>
        </div>
      </div>

      <div style="margin-top:18px;font-size:13px;">
        <div><span style="font-weight:700;display:inline-block;width:110px;">Data emiterii</span><span style="color:${MUTED};">${isoDate(a.issueDate)}</span></div>
        <div style="margin-top:3px;"><span style="font-weight:700;display:inline-block;width:110px;">Data scadentă</span><span style="color:${MUTED};">${isoDate(a.dueDate)}</span></div>
      </div>

      <div style="display:flex;justify-content:space-between;margin-top:26px;font-size:13px;">
        <div>
          <div style="font-weight:800;font-size:15px;margin-bottom:6px;">Către</div>
          ${buyerLines}
        </div>
        <div style="text-align:right;">
          <div style="font-weight:800;font-size:15px;margin-bottom:6px;">De la</div>
          ${sellerLines}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:26px;font-size:13px;">
        <thead>
          <tr style="background:${BLUE};color:#ffffff;">
            <th style="padding:9px 8px;text-align:left;font-weight:700;border-radius:6px 0 0 6px;">Descriere</th>
            <th style="padding:9px 8px;text-align:right;font-weight:700;">Cant</th>
            <th style="padding:9px 8px;text-align:left;font-weight:700;">Unitate</th>
            <th style="padding:9px 8px;text-align:right;font-weight:700;">Preț</th>
            <th style="padding:9px 8px;text-align:right;font-weight:700;border-radius:0 6px 6px 0;">Sumă</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px;">
        <div style="max-width:56%;">${bank}</div>
        <div style="min-width:230px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;padding:4px 0;">
            <span style="font-weight:700;">Subtotal</span><span style="font-weight:700;">${money(a.subtotalCents, a.currency)}</span>
          </div>
          ${
            a.vatCents > 0
              ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:${MUTED};"><span>TVA</span><span>${money(a.vatCents, a.currency)}</span></div>`
              : ""
          }
          <div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid ${LINE};margin-top:4px;">
            <span style="font-weight:700;">Total</span><span style="font-weight:700;">${money(a.totalCents, a.currency)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;">
            <span style="color:${MUTED};">Spre plată</span><span style="font-weight:700;">${money(a.totalCents, a.currency)}</span>
          </div>
        </div>
      </div>
    </div>

    <div style="position:absolute;bottom:0;left:0;right:0;background:${BLUE};color:#ffffff;padding:18px 48px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-weight:700;font-size:14px;">Spre plată</div>
      <div style="font-weight:800;font-size:26px;">${money(a.totalCents, a.currency)}</div>
    </div>
  </div>`;
}

/** Generate and download the payment account as an A4 PDF. */
export async function downloadPaymentAccountPdf(account: PaymentAccountDetail): Promise<void> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.background = "#ffffff";
  host.innerHTML = buildHtml(account);
  document.body.appendChild(host);
  const node = host.firstElementChild as HTMLElement;

  try {
    // Wait for the web font so diacritics render with the right glyphs.
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
    const jpeg = canvas.toDataURL("image/jpeg", 0.95);

    if (imgH <= 297) {
      pdf.addImage(jpeg, "JPEG", 0, 0, imgW, imgH);
    } else {
      // Multi-page: slice the tall canvas into A4-height bands.
      let remaining = imgH;
      let offset = 0;
      while (remaining > 0) {
        pdf.addImage(jpeg, "JPEG", 0, -offset, imgW, imgH);
        remaining -= 297;
        offset += 297;
        if (remaining > 0) pdf.addPage();
      }
    }

    const fileSafe = (account.documentNumber ?? `ciorna-${account.id.slice(0, 8)}`).replace(/[^\w-]+/g, "_");
    pdf.save(`Cont_de_plata_${fileSafe}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
