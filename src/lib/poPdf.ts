/**
 * VF-503: Purchase Order PDF — a simple A4 document generated client-side, reusing the same
 * html2canvas + jsPDF rasterization as the PAR form (correct diacritics, lazy-loaded chunks).
 * `esc` / `money` are reused from parPdf so formatting stays consistent.
 */
import { esc, money } from "./parPdf";
import type { ParDetail, ParLineItem } from "./api/par";

export interface PoForPdf {
  poNumber: string;
  vendorName: string | null;
  vendorIdnp: string | null;
  vendorIban: string | null;
  totalCents: number;
  currency: string;
  issuedAt: string;
}

const PINK = "#e85d7c";
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  return `${day}-${mon}-${String(d.getFullYear()).slice(2)}`;
}

/** Build the PO document as an HTML string (pure — testable without a browser). */
export function buildPoHtml(po: PoForPdf, par: ParDetail, orgName: string): string {
  const items: ParLineItem[] = par.line_items ?? [];
  const rows = items
    .map(
      (it, i) => `
      <tr>
        <td style="border:1px solid ${LINE};padding:6px 8px;text-align:center;color:${MUTED};font-size:11px;">${i + 1}</td>
        <td style="border:1px solid ${LINE};padding:6px 8px;color:${INK};font-size:11px;">${esc(it.description)}</td>
        <td style="border:1px solid ${LINE};padding:6px 8px;text-align:right;color:${INK};font-size:11px;">${esc(String(it.quantity))}</td>
        <td style="border:1px solid ${LINE};padding:6px 8px;text-align:right;color:${INK};font-size:11px;white-space:nowrap;">${money(it.unitPriceCents, po.currency)}</td>
        <td style="border:1px solid ${LINE};padding:6px 8px;text-align:right;color:${INK};font-weight:700;font-size:11px;white-space:nowrap;">${money(it.lineTotalCents, po.currency)}</td>
      </tr>`
    )
    .join("");

  return `
<div style="width:794px;box-sizing:border-box;background:#ffffff;font-family:Onest,Inter,Arial,sans-serif;color:${INK};">
  <div style="background:${PINK};padding:14px 24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:18px;font-weight:800;color:#fff;">Comandă de achiziție (Purchase Order)</div>
    <div style="font-size:11px;color:rgba(255,255,255,.9);">${esc(po.poNumber)}</div>
  </div>
  <div style="padding:20px 24px;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px;">
      <tbody>
        <tr>
          <td style="padding:4px 0;color:${MUTED};width:130px;">Organizație</td>
          <td style="padding:4px 0;color:${INK};font-weight:600;">${esc(orgName)}</td>
        </tr>
        <tr><td style="padding:4px 0;color:${MUTED};">Data emiterii</td><td style="padding:4px 0;color:${INK};">${fmtDate(po.issuedAt)}</td></tr>
        <tr><td style="padding:4px 0;color:${MUTED};">Cerere (PAR)</td><td style="padding:4px 0;color:${INK};">${esc(par.requestNo)}</td></tr>
      </tbody>
    </table>

    <div style="border:1px solid ${LINE};border-radius:6px;padding:12px 14px;margin-bottom:16px;">
      <div style="font-size:10px;color:${MUTED};font-weight:700;text-transform:uppercase;margin-bottom:6px;">Furnizor</div>
      <div style="font-size:13px;color:${INK};font-weight:600;">${esc(po.vendorName)}</div>
      ${po.vendorIdnp ? `<div style="font-size:11px;color:${MUTED};font-family:monospace;">IDNP: ${esc(po.vendorIdnp)}</div>` : ""}
      ${po.vendorIban ? `<div style="font-size:11px;color:${MUTED};font-family:monospace;">IBAN: ${esc(po.vendorIban)}</div>` : ""}
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr style="background:${PINK};color:#fff;">
          <th style="border:1px solid ${PINK};padding:6px 8px;width:5%;">#</th>
          <th style="border:1px solid ${PINK};padding:6px 8px;text-align:left;">Descriere</th>
          <th style="border:1px solid ${PINK};padding:6px 8px;text-align:right;width:10%;">Cant.</th>
          <th style="border:1px solid ${PINK};padding:6px 8px;text-align:right;width:20%;">Preț unitar</th>
          <th style="border:1px solid ${PINK};padding:6px 8px;text-align:right;width:22%;">Total</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="5" style="border:1px solid ${LINE};padding:10px;text-align:center;color:${MUTED};">Fără linii</td></tr>`}</tbody>
      <tfoot>
        <tr style="background:#fafafa;">
          <td colspan="4" style="border:1px solid ${LINE};padding:8px 12px;font-weight:700;text-align:right;">TOTAL</td>
          <td style="border:1px solid ${LINE};padding:8px 12px;text-align:right;font-size:14px;font-weight:800;color:${PINK};white-space:nowrap;">${money(po.totalCents, po.currency)}</td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top:32px;display:flex;justify-content:space-between;">
      <div style="font-size:11px;color:${MUTED};">Semnătură autorizată: __________________</div>
      <div style="font-size:11px;color:${MUTED};">Data: ${fmtDate(po.issuedAt)}</div>
    </div>
  </div>
</div>`;
}

/** Generate + download the PO PDF (A4). jspdf/html2canvas are lazy-imported (own chunks). */
export async function downloadPoPdf(po: PoForPdf, par: ParDetail, orgName: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const html2canvas = (await import("html2canvas")).default;

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.background = "#ffffff";
  host.innerHTML = buildPoHtml(po, par, orgName);
  document.body.appendChild(host);
  const node = host.firstElementChild as HTMLElement;
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const imgW = 210;
    const imgH = (canvas.height * imgW) / canvas.width;
    const jpeg = canvas.toDataURL("image/jpeg", 0.92);
    if (imgH <= 297) {
      pdf.addImage(jpeg, "JPEG", 0, 0, imgW, imgH);
    } else {
      let remaining = imgH, offset = 0;
      while (remaining > 0) {
        pdf.addImage(jpeg, "JPEG", 0, -offset, imgW, imgH);
        remaining -= 297; offset += 297;
        if (remaining > 0) pdf.addPage();
      }
    }
    pdf.save(`PO_${po.poNumber.replace(/[^\w-]+/g, "_")}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
