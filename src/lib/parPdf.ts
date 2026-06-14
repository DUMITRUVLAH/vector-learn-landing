/**
 * PAR-114: client-side PDF generator for a "Payment Action Request (PAR) Form".
 *
 * Reproduces the standard 16-section paper form used by donor-funded NGOs (e.g. ATIC/Digital
 * Safeguard, Republic of Moldova) as an A4 PDF.
 *
 * Technique mirrors `src/lib/paymentAccountPdf.ts` exactly:
 *   buildParHtml(par): string   — pure string function, testable without a browser
 *   downloadParPdf(par): Promise<void> — attaches the HTML node, rasterizes via html2canvas, jsPDF
 *
 * Why rasterize (not jsPDF text): jsPDF's built-in fonts mangle Romanian diacritics (ș/ț/ă/î).
 * Rendering via the browser's web font and snapshotting keeps glyphs correct without a TTF.
 * Both jspdf and html2canvas are already project dependencies — no new lib added.
 *
 * MDL money format: `L 7 000` (same as paymentAccountPdf.money()).
 *
 * CORE: backlog/par/PAR-CORE.md §0 (all 16 sections), §5 (PDF spec).
 */
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { ParDetail, ParApproval, ParLineItem } from "./api/par";

// ─── Palette (PDF-only — inline hex, html2canvas-safe, not design-system tokens) ──────────────

const PINK_TITLE = "#e85d7c";      // pink title band (PAR form header)
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const LIGHT_BG = "#fafafa";
const BOX_BG = "#f8f9fa";

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────────

/** HTML-escape a string — anti-injection, same contract as paymentAccountPdf.esc() */
export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );
}

/**
 * Format minor-unit cents as "L 7 000" — locale-independent thousands grouping,
 * decimal only when non-zero. Same algorithm as paymentAccountPdf.money().
 */
export function money(cents: number, currency = "MDL"): string {
  const neg = cents < 0;
  const v = Math.abs(Math.round(cents));
  const whole = Math.floor(v / 100);
  const frac = v % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const dec = frac ? "," + String(frac).padStart(2, "0") : "";
  const sym = currency === "MDL" ? "L" : currency;
  return `${neg ? "-" : ""}${sym} ${grouped}${dec}`;
}

/** Format a date string / ISO timestamp as dd-Mon-YY (e.g. "10-Jun-26"). */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  const yr = String(d.getFullYear()).slice(2);
  return `${day}-${mon}-${yr}`;
}

/** Render a labeled header cell (used in sections 1–7 grid). */
function cell(label: string, value: string, width = "auto"): string {
  return `
    <td style="border:1px solid ${LINE};padding:6px 8px;vertical-align:top;width:${width};">
      <div style="font-size:9px;color:${MUTED};font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">${esc(label)}</div>
      <div style="font-size:12px;color:${INK};margin-top:2px;min-height:16px;">${value || "&nbsp;"}</div>
    </td>`;
}

/** Render a checkbox option. Marked with X if selected. */
function checkbox(label: string, selected: boolean): string {
  return `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
      <div style="width:16px;height:16px;border:1.5px solid ${selected ? INK : "#94a3b8"};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:${INK};background:${selected ? "#f1f5f9" : "#fff"};">
        ${selected ? "X" : "&nbsp;"}
      </div>
      <span style="font-size:12px;color:${selected ? INK : MUTED};font-weight:${selected ? "700" : "400"};">${esc(label)}</span>
    </div>`;
}

/** Render a signature box (sections 14–15). */
function sigBox(title: string, approval: ParApproval | null): string {
  const name = approval?.signatureName ?? (approval?.approverUserId ? "—" : "");
  const role = approval?.signatureTitle ?? approval?.approverRoleLabel ?? "";
  const date = fmtDate(approval?.decidedAt);
  const approved = approval?.decision === "approved";
  return `
    <td style="border:1px solid ${LINE};padding:10px 12px;vertical-align:top;width:33%;">
      <div style="font-size:9px;color:${MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${esc(title)}</div>
      ${approved ? `<div style="font-size:10px;font-weight:800;color:${PINK_TITLE};margin-bottom:4px;">APPROVE</div>` : ""}
      <div style="border-bottom:1px solid ${LINE};padding-bottom:4px;margin-bottom:4px;">
        <div style="font-size:9px;color:${MUTED};">Signature / Name:</div>
        <div style="font-size:11px;font-weight:600;color:${INK};min-height:14px;">${esc(name)}</div>
      </div>
      <div style="border-bottom:1px solid ${LINE};padding-bottom:4px;margin-bottom:4px;">
        <div style="font-size:9px;color:${MUTED};">Title:</div>
        <div style="font-size:11px;color:${INK};min-height:14px;">${esc(role)}</div>
      </div>
      <div>
        <div style="font-size:9px;color:${MUTED};">Date:</div>
        <div style="font-size:11px;color:${INK};min-height:14px;">${approved ? esc(date) : "&nbsp;"}</div>
      </div>
    </td>`;
}

// ─── Main HTML builder ─────────────────────────────────────────────────────────────────────────

/**
 * Build the full PAR form as an HTML string (no browser APIs needed — pure string ops).
 * The caller injects this into a hidden DOM node and rasterizes with html2canvas.
 *
 * The function is intentionally testable without a browser: all assertions are on the returned
 * string (titles, section labels, money format, X marks, signature names, etc.).
 */
export function buildParHtml(par: ParDetail): string {
  const req = par;
  const items: ParLineItem[] = par.line_items ?? [];
  const approvals: ParApproval[] = par.approvals ?? [];

  // Requestor approval = step 0 (the submit signature, section 14)
  const sig14 = approvals.find((a) => a.step === 0) ?? null;
  // Non-requestor approvals (sections 15+), sorted by step
  const approverSigs = approvals.filter((a) => a.step > 0).sort((a, b) => a.step - b.step);

  // Section 8 — Purpose
  const purposeLabels: Record<string, string> = {
    execute_payment: "Execute payment",
    obtain_quotations: "Obtain quotations (in preparation for procurement)",
    provide_estimate: "Provide estimate (cost only, no competition)",
  };

  // Section 9 — Charge To
  const chargeLabels: Record<string, string> = {
    operations: "Operations",
    program: "Program",
    other: "Other",
  };

  // Section 10 — Line items
  const itemRows = items
    .map((it, idx) => `
      <tr>
        <td style="border:1px solid ${LINE};padding:6px 8px;text-align:center;color:${MUTED};font-size:11px;">${idx + 1}</td>
        <td style="border:1px solid ${LINE};padding:6px 8px;color:${INK};font-size:11px;">${esc(it.description)}</td>
        <td style="border:1px solid ${LINE};padding:6px 8px;text-align:right;color:${INK};font-size:11px;">${esc(String(it.quantity))}</td>
        <td style="border:1px solid ${LINE};padding:6px 8px;color:${MUTED};font-size:11px;">${esc(it.unit ?? "")}</td>
        <td style="border:1px solid ${LINE};padding:6px 8px;text-align:right;color:${INK};font-size:11px;white-space:nowrap;">${money(it.unitPriceCents, req.currency)}</td>
        <td style="border:1px solid ${LINE};padding:6px 8px;text-align:right;color:${INK};font-weight:700;font-size:11px;white-space:nowrap;">${money(it.lineTotalCents, req.currency)}</td>
      </tr>`)
    .join("");

  // Total row
  const total = req.totalEstimatedCents ?? items.reduce((s, i) => s + i.lineTotalCents, 0);

  // Sections 14–15 signature layout: requestor + up to 2 approvers
  const approver1 = approverSigs[0] ?? null;
  const approver2 = approverSigs[1] ?? null;

  // Section 16 — payment data
  const pmt = par.payment;

  return `
<div style="width:794px;box-sizing:border-box;background:#ffffff;font-family:Onest,Inter,Arial,sans-serif;color:${INK};padding:0;">

  <!-- TITLE BAND -->
  <div style="background:${PINK_TITLE};padding:12px 24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:17px;font-weight:800;color:#ffffff;letter-spacing:0.01em;">Payment Action Request (PAR) Form</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.85);">PAR No: ${esc(req.requestNo)}</div>
  </div>

  <!-- Help link line -->
  <div style="background:#fff5f7;border-bottom:1px solid #f9c0ce;padding:5px 24px;">
    <span style="font-size:10px;color:${MUTED};">Instructions for completing this form may be found </span>
    <span style="font-size:10px;color:${PINK_TITLE};font-weight:600;">here</span>
    <span style="font-size:10px;color:${MUTED};"> (in the PAR Admin settings).</span>
  </div>

  <div style="padding:16px 24px 24px 24px;">

    <!-- SECTIONS 1–7: HEADER GRID -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:12px;">
      <tbody>
        <tr>
          ${cell("1. Date of Request", fmtDate(req.dateOfRequest), "16%")}
          ${cell("2. Requested By", esc(req.requestedByName ?? req.requestedByUserId), "21%")}
          ${cell("3. Title / Code", esc(req.requestorTitle), "21%")}
          ${cell("4. Department", esc(req.departmentName ?? req.departmentId), "21%")}
          ${cell("5. Date Needed", fmtDate(req.dateNeeded), "21%")}
        </tr>
        <tr>
          ${cell("6. Requested For / Deliver To", esc(req.projectName ?? req.projectId), "40%")}
          ${cell("7. Budget Code", [esc(req.budgetCodeLabel ?? req.budgetCodeId), esc(req.budgetCodeNote)].filter(Boolean).join(" — ") || "&nbsp;", "60%")}
        </tr>
      </tbody>
    </table>

    <!-- SECTIONS 8–9: CLASSIFICATION -->
    <div style="display:flex;gap:12px;margin-bottom:12px;">

      <!-- Section 8: Purpose -->
      <div style="flex:1;border:1px solid ${LINE};padding:10px 12px;border-radius:4px;background:${BOX_BG};">
        <div style="font-size:9px;color:${MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">8. Purpose of PAR</div>
        ${checkbox("Execute payment", req.purpose === "execute_payment")}
        ${checkbox("Obtain quotations (in preparation for procurement)", req.purpose === "obtain_quotations")}
        ${checkbox("Provide estimate (cost only, no competition)", req.purpose === "provide_estimate")}
      </div>

      <!-- Section 9: Charge To -->
      <div style="flex:1;border:1px solid ${LINE};padding:10px 12px;border-radius:4px;background:${BOX_BG};">
        <div style="font-size:9px;color:${MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">9. Charge To</div>
        ${checkbox("Operations", req.chargeTo === "operations")}
        ${checkbox("Program", req.chargeTo === "program")}
        ${checkbox("Other", req.chargeTo === "other")}
        ${req.chargeBillingCode ? `<div style="margin-top:4px;font-size:11px;color:${INK};">Billing code: <strong>${esc(req.chargeBillingCode)}</strong></div>` : ""}
      </div>

    </div>

    <!-- SECTION 10: LINE ITEMS TABLE -->
    <div style="margin-bottom:12px;">
      <div style="font-size:9px;color:${MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">10. Items / Services Requested</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:${PINK_TITLE};color:#ffffff;">
            <th style="border:1px solid ${PINK_TITLE};padding:6px 8px;text-align:center;font-weight:700;width:5%;">Item&nbsp;#</th>
            <th style="border:1px solid ${PINK_TITLE};padding:6px 8px;text-align:left;font-weight:700;width:38%;">Description / Specifications</th>
            <th style="border:1px solid ${PINK_TITLE};padding:6px 8px;text-align:right;font-weight:700;width:9%;">Qty</th>
            <th style="border:1px solid ${PINK_TITLE};padding:6px 8px;text-align:left;font-weight:700;width:9%;">Units</th>
            <th style="border:1px solid ${PINK_TITLE};padding:6px 8px;text-align:right;font-weight:700;width:17%;">Est. Unit Price (MDL)</th>
            <th style="border:1px solid ${PINK_TITLE};padding:6px 8px;text-align:right;font-weight:700;width:22%;">Est. Total Price (MDL)</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || `<tr><td colspan="6" style="border:1px solid ${LINE};padding:10px;text-align:center;color:${MUTED};font-size:11px;">No items</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background:${LIGHT_BG};">
            <td colspan="5" style="border:1px solid ${LINE};padding:8px 12px;font-size:12px;font-weight:700;color:${INK};text-align:right;">TOTAL ESTIMATED COST: ${esc(req.currency || "MDL")}</td>
            <td style="border:1px solid ${LINE};padding:8px 12px;text-align:right;font-size:14px;font-weight:800;color:${PINK_TITLE};white-space:nowrap;">${money(total, req.currency || "MDL")}</td>
          </tr>
        </tfoot>
      </table>
      <div style="font-size:9px;color:${MUTED};margin-top:4px;line-height:1.4;">
        * For transactions above micro-purchase threshold, if final price for purchase exceeds total estimated cost by more than 10%, purchase shall not proceed without approval from approver below.
      </div>
    </div>

    <!-- SECTION 11: END USE -->
    <div style="margin-bottom:12px;border:1px solid ${LINE};padding:10px 12px;border-radius:4px;">
      <div style="font-size:9px;color:${MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">11. Purpose and Description of End Use</div>
      <div style="font-size:11px;color:${INK};min-height:40px;line-height:1.5;">${esc(req.endUse) || '<span style="color:#94a3b8;">—</span>'}</div>
    </div>

    <!-- SECTION 12: PAYEE BLOCK -->
    <div style="margin-bottom:12px;">
      <div style="font-size:9px;color:${MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">12. Special Instructions / Payee (Vendor)</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:${LIGHT_BG};">
            <th style="border:1px solid ${LINE};padding:6px 10px;text-align:left;font-weight:700;color:${MUTED};width:28%;">Name, Surname</th>
            <th style="border:1px solid ${LINE};padding:6px 10px;text-align:left;font-weight:700;color:${MUTED};width:22%;">IDNP</th>
            <th style="border:1px solid ${LINE};padding:6px 10px;text-align:left;font-weight:700;color:${MUTED};width:30%;">IBAN</th>
            <th style="border:1px solid ${LINE};padding:6px 10px;text-align:left;font-weight:700;color:${MUTED};width:20%;">Bank</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid ${LINE};padding:6px 10px;color:${INK};font-weight:600;">${esc(req.payeeName)}</td>
            <td style="border:1px solid ${LINE};padding:6px 10px;color:${INK};font-family:monospace;">${esc(req.payeeIdnp)}</td>
            <td style="border:1px solid ${LINE};padding:6px 10px;color:${INK};font-family:monospace;font-size:10px;">${esc(req.payeeIban)}</td>
            <td style="border:1px solid ${LINE};padding:6px 10px;color:${INK};">${esc(req.payeeBank)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- SECTION 13: ATTACHMENTS -->
    <div style="margin-bottom:12px;border:1px solid ${LINE};padding:10px 12px;border-radius:4px;">
      <div style="font-size:9px;color:${MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">13. Attachments</div>
      <div style="display:flex;gap:24px;align-items:flex-start;">
        ${checkbox("Yes (describe):", req.attachmentsPresent === true)}
        ${checkbox("No attachments", req.attachmentsPresent === false)}
      </div>
      ${req.attachmentsNote ? `<div style="font-size:11px;color:${INK};margin-top:6px;padding-left:22px;">${esc(req.attachmentsNote)}</div>` : ""}
    </div>

    <!-- SECTIONS 14–15: SIGNATURES -->
    <div style="margin-bottom:12px;">
      <div style="font-size:9px;color:${MUTED};font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">14–15. Signatures</div>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          <tr>
            ${sigBox("14. Requestor Signature", sig14)}
            ${sigBox("15. Approver (DOA Holder / Supervisor)" + (approver1?.approverRoleLabel ? ` — ${approver1.approverRoleLabel}` : ""), approver1)}
            ${approver2
              ? sigBox("15. Additional Approver" + (approver2.approverRoleLabel ? ` — ${approver2.approverRoleLabel}` : ""), approver2)
              : `<td style="border:1px solid ${LINE};padding:10px 12px;vertical-align:top;width:33%;">
                  <div style="font-size:9px;color:${MUTED};font-weight:700;text-transform:uppercase;margin-bottom:8px;">15. Additional Approver</div>
                  <div style="font-size:10px;color:#94a3b8;">N/A</div>
                </td>`
            }
          </tr>
        </tbody>
      </table>
    </div>

    <!-- SECTION 16: PAYMENT INTERNAL USE -->
    <div style="border:1.5px solid ${PINK_TITLE};border-radius:4px;overflow:hidden;">
      <div style="background:${PINK_TITLE};padding:6px 12px;">
        <div style="font-size:9px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:0.06em;">16. Payment — Internal Use Only</div>
      </div>
      <div style="padding:10px 12px;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;">
          <thead>
            <tr style="background:${LIGHT_BG};">
              <th style="border:1px solid ${LINE};padding:6px 10px;text-align:left;font-weight:700;color:${MUTED};width:20%;">PAR BL</th>
              <th style="border:1px solid ${LINE};padding:6px 10px;text-align:left;font-weight:700;color:${MUTED};width:20%;">Date Received</th>
              <th style="border:1px solid ${LINE};padding:6px 10px;text-align:left;font-weight:700;color:${MUTED};width:30%;">Received By</th>
              <th style="border:1px solid ${LINE};padding:6px 10px;text-align:left;font-weight:700;color:${MUTED};width:30%;">Assigned To</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border:1px solid ${LINE};padding:6px 10px;color:${INK};">${esc(pmt?.parBl)}</td>
              <td style="border:1px solid ${LINE};padding:6px 10px;color:${INK};">${fmtDate(pmt?.receivedAt)}</td>
              <td style="border:1px solid ${LINE};padding:6px 10px;color:${INK};">${esc(req.receivedByName ?? pmt?.receivedByUserId)}</td>
              <td style="border:1px solid ${LINE};padding:6px 10px;color:${INK};">${esc(req.assignedToName ?? pmt?.assignedToUserId)}</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size:10px;color:${MUTED};">
          IBAN: <strong style="color:${INK};font-family:monospace;">${esc(req.payeeIban) || "—"}</strong>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          Bank: <strong style="color:${INK};">${esc(req.payeeBank) || "—"}</strong>
          ${pmt?.paymentDate ? `&nbsp;&nbsp;|&nbsp;&nbsp;Payment date: <strong style="color:${INK};">${fmtDate(pmt.paymentDate)}</strong>` : ""}
          ${pmt?.paymentRef ? `&nbsp;&nbsp;|&nbsp;&nbsp;Ref: <strong style="color:${INK};">${esc(pmt.paymentRef)}</strong>` : ""}
          ${pmt?.actualAmountCents != null ? `&nbsp;&nbsp;|&nbsp;&nbsp;Actual amount: <strong style="color:${INK};">${money(pmt.actualAmountCents, req.currency)}</strong>` : ""}
        </div>
      </div>
    </div>

  </div><!-- /padding -->
</div>`;
}

// ─── Download ──────────────────────────────────────────────────────────────────────────────────

/**
 * Generate and download the PAR form as an A4 PDF.
 * Does NOT require any arguments beyond the fully-loaded ParDetail object.
 */
export async function downloadParPdf(par: ParDetail): Promise<void> {
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
      // Multi-page: slice the tall canvas into A4-height bands
      let remaining = imgH;
      let offset = 0;
      while (remaining > 0) {
        pdf.addImage(jpeg, "JPEG", 0, -offset, imgW, imgH);
        remaining -= 297;
        offset += 297;
        if (remaining > 0) pdf.addPage();
      }
    }

    const fileSafe = (par.requestNo ?? `par-${par.id.slice(0, 8)}`).replace(/[^\w-]+/g, "_");
    pdf.save(`PAR_Form_${fileSafe}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
