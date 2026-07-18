/**
 * PAR-114: client-side PDF generator for a "Payment Action Request (PAR) Form".
 *
 * Reproduces the standard 16-section paper form used by donor-funded NGOs (e.g. ATIC/Digital
 * Safeguard, Republic of Moldova) as an A4 PDF — pixel-faithful to the official Excel form:
 * a black-and-white document with thin borders, superscript section numbers, underline fields,
 * and a single pale-rose centered title band. NOT a "web card" design.
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
// The official form is a black-and-white office document. The ONLY colour is a pale rose title
// band and a red "MDL" accent in the money column headers (matching the source Excel).

const TITLE_BG = "#fbe9ec";        // very pale rose — title band background (not a pink fill)
const RED = "#c0392b";             // red "MDL" accent in price column headers (source Excel)
const LINK = "#1155cc";            // blue underlined "here" instruction link
const INK = "#000000";             // document ink — pure black, like a printed form
const FIELD = "#1a1a1a";           // filled-in field values
const BORDER = "#000000";          // thin black table/box borders
const RULE = "#000000";            // underline rule for fill-in fields
const FAINT = "#555555";           // helper sub-notes

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────────

/** HTML-escape a string — anti-injection, same contract as paymentAccountPdf.esc() */
export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );
}

/**
 * Format minor-unit cents as MDL with comma decimals and space thousands, e.g. "7 000,00".
 * Returns a bare number string (no symbol) — the form puts "MDL" in its own column/label.
 * Always shows two decimals to match the official Excel ("7,000.00" → "7 000,00").
 */
function amount(cents: number): string {
  const neg = cents < 0;
  const v = Math.abs(Math.round(cents));
  const whole = Math.floor(v / 100);
  const frac = v % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${grouped},${String(frac).padStart(2, "0")}`;
}

/**
 * Format minor-unit cents as "L 7 000" — locale-independent thousands grouping,
 * decimal only when non-zero. Same algorithm as paymentAccountPdf.money().
 * Kept exported for the test-suite / other callers; the form body uses amount() + an "MDL" label.
 */
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

/** Format a date string / ISO timestamp as dd-Mon-YY (e.g. "10-Jun-26"). */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  const yr = String(d.getFullYear()).slice(2);
  return `${day}-${mon}-${yr}`;
}

/** A superscript section number (¹ ² … 16) rendered like the office form's numbering. */
function num(n: number): string {
  return `<span style="font-size:8px;vertical-align:super;font-weight:700;color:${INK};">${n}</span>`;
}

/**
 * A labeled fill-in field used in the header grid (sections 1–7): bold label on the left,
 * the value sitting on an underline rule (mimics the typed-over-a-line look of the form).
 */
function field(n: number, label: string, value: string): string {
  return `
    <div style="display:flex;align-items:baseline;gap:6px;padding:3px 0;">
      <span style="font-size:10.5px;font-weight:700;color:${INK};white-space:nowrap;">${num(n)} ${esc(label)}:</span>
      <span style="flex:1;border-bottom:1px solid ${RULE};font-size:11px;color:${FIELD};min-height:15px;padding:0 4px 1px;">${value || "&nbsp;"}</span>
    </div>`;
}

/** Render a checkbox option. Marked with X if selected — small bordered square, like the form. */
function checkbox(label: string, selected: boolean): string {
  return `
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;">
      <span style="display:inline-block;width:13px;height:13px;border:1px solid ${INK};text-align:center;line-height:12px;font-size:10px;font-weight:800;color:${INK};flex:none;">${selected ? "X" : "&nbsp;"}</span>
      <span style="font-size:10.5px;color:${INK};font-weight:${selected ? "700" : "400"};line-height:1.3;">${esc(label)}</span>
    </div>`;
}

/**
 * Render one signature column (sections 14–15). Name / Title / Date / Signature stacked, each on
 * an underline rule. An approved decision shows the "APPROVE" / "APPROVED" stamp word.
 */
function sigColumn(title: string, approval: ParApproval | null, opts: { stamp?: boolean } = {}): string {
  const name = approval?.signatureName ?? "";
  const role = approval?.signatureTitle ?? approval?.approverRoleLabel ?? "";
  const date = approval?.decision === "approved" ? fmtDate(approval?.decidedAt) : "";
  const approved = approval?.decision === "approved";
  const sigRule = (lbl: string, val: string) => `
    <div style="margin-bottom:7px;">
      <div style="display:flex;align-items:baseline;gap:6px;">
        <span style="font-size:9.5px;color:${INK};white-space:nowrap;">${lbl}:</span>
        <span style="flex:1;border-bottom:1px solid ${RULE};font-size:11px;color:${FIELD};min-height:14px;padding:0 3px 1px;">${val || "&nbsp;"}</span>
      </div>
    </div>`;
  return `
    <td style="border:1px solid ${BORDER};padding:8px 10px;vertical-align:top;">
      <div style="font-size:10px;font-weight:700;color:${INK};margin-bottom:8px;">${title}</div>
      ${opts.stamp && approved ? `<div style="font-size:11px;font-weight:800;color:${INK};letter-spacing:0.04em;margin-bottom:6px;">APPROVE</div>` : ""}
      ${sigRule("Name", esc(name))}
      ${sigRule("Title", esc(role))}
      ${sigRule("Date", esc(date))}
      ${sigRule("Signature", "&nbsp;")}
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

  // Presentation must never expose database UUIDs. The API resolves these names
  // for a PAR detail; if a legacy/deleted relation cannot be resolved, leave the
  // printed value blank rather than showing an implementation identifier.
  const requestedBy = req.requestedByName || "";
  const department = req.departmentName || "";
  const project = req.projectName || "";
  const requestorIdentity = req.requestorCode && req.requestorTitle?.includes(req.requestorCode)
    ? req.requestorTitle
    : [req.requestorTitle, req.requestorCode].filter(Boolean).join(" · ");
  // VM1-04: donors report per-event — show the event next to the project on the printed form.
  const projectWithEvent = [project, req.eventName].filter(Boolean).join(" · ");
  const budgetCode =
    req.budgetCodeLabel || req.budgetCodeNote ||
    "";

  // Requestor approval = step 0 (the submit signature, section 14)
  const sig14 = approvals.find((a) => a.step === 0) ?? null;
  // Non-requestor approvals (sections 15+), sorted by step
  const approverSigs = approvals.filter((a) => a.step > 0).sort((a, b) => a.step - b.step);
  const approver1 = approverSigs[0] ?? null;
  const approver2 = approverSigs[1] ?? null;

  // Section 10 — Line items
  const itemRows = items
    .map((it, idx) => `
      <tr>
        <td style="border:1px solid ${BORDER};padding:5px 6px;text-align:center;color:${INK};font-size:10.5px;">${idx + 1}</td>
        <td style="border:1px solid ${BORDER};padding:5px 8px;color:${INK};font-size:10.5px;line-height:1.35;">${esc(it.description)}</td>
        <td style="border:1px solid ${BORDER};padding:5px 6px;text-align:center;color:${INK};font-size:10.5px;">${esc(String(it.quantity))}</td>
        <td style="border:1px solid ${BORDER};padding:5px 6px;text-align:center;color:${INK};font-size:10.5px;">${esc(it.unit ?? "")}</td>
        <td style="border:1px solid ${BORDER};padding:5px 8px;text-align:right;color:${INK};font-size:10.5px;white-space:nowrap;">${amount(it.unitPriceCents)}</td>
        <td style="border:1px solid ${BORDER};padding:5px 8px;text-align:right;color:${INK};font-size:10.5px;white-space:nowrap;">${amount(it.lineTotalCents)}</td>
      </tr>`)
    .join("");

  // Total
  const total = req.totalEstimatedCents ?? items.reduce((s, i) => s + i.lineTotalCents, 0);

  // Section 16 — payment data
  const pmt = par.payment;
  const receivedBy = req.receivedByName || "";
  const assignedTo = req.assignedToName || "";

  return `
<div style="width:794px;box-sizing:border-box;background:#ffffff;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:${INK};padding:28px 30px;">

  <!-- TITLE BAND — pale rose, centered, dark text (matches the office form, not a pink fill) -->
  <div style="background:${TITLE_BG};border:1px solid #f1c9d1;padding:8px 0;text-align:center;">
    <div style="font-size:16px;font-weight:800;color:${INK};letter-spacing:0.01em;">Payment Action Request (PAR) Form</div>
  </div>
  <div style="text-align:center;padding:4px 0 10px;">
    <span style="font-size:9.5px;color:${FAINT};">Instructions for completing this form may be found </span><span style="font-size:9.5px;color:${LINK};text-decoration:underline;">here</span><span style="font-size:9.5px;color:${FAINT};">.</span>
  </div>

  <!-- SECTIONS 1–7: HEADER GRID (two columns, fill-in rules, superscript numbers) -->
  <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};margin-bottom:0;">
    <tbody>
      <tr>
        <td style="border:1px solid ${BORDER};padding:5px 10px;vertical-align:top;width:50%;">
          ${field(1, "Date of Request", fmtDate(req.dateOfRequest))}
          ${field(2, "Requested By", esc(requestedBy))}
          ${field(3, "Title of Requestor/Code", esc(requestorIdentity))}
          ${field(4, "Department", esc(department))}
        </td>
        <td style="border:1px solid ${BORDER};padding:5px 10px;vertical-align:top;width:50%;">
          ${field(5, "Date Items/Services Needed", fmtDate(req.dateNeeded))}
          ${field(6, "Requested For/Deliver To", esc(projectWithEvent))}
          <div style="display:flex;align-items:baseline;gap:6px;padding:3px 0;">
            <span style="font-size:10.5px;font-weight:700;color:${INK};white-space:nowrap;">${num(7)} Budget code:</span>
            <span style="flex:1;border-bottom:1px solid ${RULE};font-size:11px;color:${FIELD};min-height:15px;padding:0 4px 1px;">${esc(budgetCode) || "&nbsp;"}</span>
          </div>
          <div style="font-size:8.5px;color:${FAINT};font-style:italic;padding-left:18px;">(accordin to monthly budget planning)</div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- SECTIONS 8–9: CLASSIFICATION (two columns, checkboxes) -->
  <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};border-top:0;margin-bottom:0;">
    <tbody>
      <tr>
        <td style="border:1px solid ${BORDER};padding:8px 10px;vertical-align:top;width:50%;">
          <div style="font-size:10.5px;font-weight:700;color:${INK};margin-bottom:8px;">${num(8)} Purpose of PAR (check one):</div>
          ${checkbox("Execute payment", req.purpose === "execute_payment")}
          ${checkbox("Obtain quotations (in preparation for procurement)", req.purpose === "obtain_quotations")}
          ${checkbox("Provide estimate cost only (do not conduct cost competition)", req.purpose === "provide_estimate")}
        </td>
        <td style="border:1px solid ${BORDER};padding:8px 10px;vertical-align:top;width:50%;">
          <div style="font-size:10.5px;font-weight:700;color:${INK};margin-bottom:8px;">${num(9)} Charge To (check one and enter billing code, if applicable):</div>
          ${checkbox("Operations:", req.chargeTo === "operations")}
          ${checkbox("Program:", req.chargeTo === "program")}
          ${checkbox("Other:", req.chargeTo === "other")}
          ${req.chargeBillingCode ? `<div style="margin-top:4px;font-size:10px;color:${INK};padding-left:21px;">Billing code: <strong>${esc(req.chargeBillingCode)}</strong></div>` : ""}
        </td>
      </tr>
    </tbody>
  </table>

  <!-- SECTION 10: LINE ITEMS TABLE (plain black-bordered, white header, red MDL accent) -->
  <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};border-top:0;margin-bottom:0;">
    <tbody>
      <tr>
        <td colspan="6" style="border:1px solid ${BORDER};padding:5px 10px;font-size:10.5px;font-weight:700;color:${INK};">${num(10)} Items/Services Requested:</td>
      </tr>
      <tr>
        <th style="border:1px solid ${BORDER};padding:6px 6px;text-align:center;font-weight:700;font-size:9.5px;color:${INK};width:6%;">Item&nbsp;#</th>
        <th style="border:1px solid ${BORDER};padding:6px 8px;text-align:center;font-weight:700;font-size:9.5px;color:${INK};width:42%;">Description/Specifications of Items or Service</th>
        <th style="border:1px solid ${BORDER};padding:6px 6px;text-align:center;font-weight:700;font-size:9.5px;color:${INK};width:9%;">Quantity</th>
        <th style="border:1px solid ${BORDER};padding:6px 6px;text-align:center;font-weight:700;font-size:9.5px;color:${INK};width:9%;">Units</th>
        <th style="border:1px solid ${BORDER};padding:6px 6px;text-align:center;font-weight:700;font-size:9.5px;color:${INK};width:17%;">Est. Unit Price<br/><span style="color:${RED};font-weight:800;">MDL</span></th>
        <th style="border:1px solid ${BORDER};padding:6px 6px;text-align:center;font-weight:700;font-size:9.5px;color:${INK};width:17%;">Est. Total Price<br/><span style="color:${RED};font-weight:800;">MDL</span></th>
      </tr>
      ${itemRows || `<tr><td colspan="6" style="border:1px solid ${BORDER};padding:8px;text-align:center;color:${FAINT};font-size:10.5px;">No items</td></tr>`}
      <tr>
        <td colspan="5" style="border:1px solid ${BORDER};padding:6px 10px;font-size:10.5px;font-weight:700;color:${INK};text-align:right;">TOTAL ESTIMATED COST*: &nbsp;MDL</td>
        <td style="border:1px solid ${BORDER};padding:6px 8px;text-align:right;font-size:11px;font-weight:800;color:${INK};white-space:nowrap;">${amount(total)}</td>
      </tr>
    </tbody>
  </table>
  <div style="font-size:8px;color:${FAINT};font-style:italic;line-height:1.35;padding:3px 2px 0;">
    * For transactions above micro-purchase threshold, if final price for purchase exceeds total estimated cost by more than 10%, purchase shall not proceed without approval from approver below.
  </div>

  <!-- SECTION 11: END USE -->
  <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};margin-top:6px;margin-bottom:0;">
    <tbody>
      <tr><td style="border:1px solid ${BORDER};padding:5px 10px;font-size:10.5px;font-weight:700;color:${INK};">${num(11)} Purpose and Description of End Use of Requested Items/Services:</td></tr>
      <tr><td style="border:1px solid ${BORDER};padding:8px 10px;font-size:10.5px;color:${INK};min-height:42px;line-height:1.45;">${esc(req.endUse) || "&nbsp;"}</td></tr>
    </tbody>
  </table>

  <!-- SECTION 12: SPECIAL INSTRUCTIONS / PAYEE (inline labeled lines, not a colored table) -->
  <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};border-top:0;margin-bottom:0;">
    <tbody>
      <tr><td style="border:1px solid ${BORDER};padding:5px 10px;font-size:10.5px;font-weight:700;color:${INK};">${num(12)} Special Instructions or Additional Information:</td></tr>
      <tr><td style="border:1px solid ${BORDER};padding:8px 10px;font-size:10.5px;color:${INK};line-height:1.6;">
        <div><span style="display:inline-block;width:90px;">Name, Surname:</span> <strong>${esc(req.payeeName)}</strong></div>
        <div><span style="display:inline-block;width:90px;">IDNP:</span> <span style="font-family:monospace;">${esc(req.payeeIdnp)}</span></div>
        <div><span style="display:inline-block;width:90px;">IBAN:</span> <span style="font-family:monospace;">${esc(req.payeeIban)}</span></div>
        <div><span style="display:inline-block;width:90px;">Bank:</span> ${esc(req.payeeBank)}</div>
      </td></tr>
    </tbody>
  </table>

  <!-- SECTION 13: ATTACHMENTS -->
  <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};border-top:0;margin-bottom:0;">
    <tbody>
      <tr><td style="border:1px solid ${BORDER};padding:5px 10px;font-size:10.5px;font-weight:700;color:${INK};">${num(13)} Attachments to PAR, such as specifications, scope of work, or other documentation (check one):</td></tr>
      <tr><td style="border:1px solid ${BORDER};padding:8px 10px;">
        ${checkbox("Yes, the following attachments are included (describe):", req.attachmentsPresent === true)}
        ${req.attachmentsNote ? `<div style="font-size:10px;color:${INK};margin:-2px 0 6px 21px;line-height:1.4;">${esc(req.attachmentsNote)}</div>` : ""}
        ${checkbox("No attachments are included.", req.attachmentsPresent === false)}
      </td></tr>
    </tbody>
  </table>

  <!-- SECTIONS 14–15: SIGNATURES (requestor | approver, with Exec Director APPROVE stacked below) -->
  <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};border-top:0;margin-bottom:0;">
    <tbody>
      <tr>
        ${sigColumn(`${num(14)} Requestor Signature:`, sig14)}
        <td style="border:1px solid ${BORDER};padding:0;vertical-align:top;width:50%;">
          <table style="width:100%;border-collapse:collapse;height:100%;">
            <tbody>
              <tr>${sigColumn(`${num(15)} Approver Signature (DOA Holder, Supervisor, or Tech Lead):`, approver1).replace(/^\s*<td style="[^"]*"/, '<td style="padding:8px 10px;vertical-align:top;border-bottom:1px solid ' + BORDER + '"')}</tr>
              ${approver2
                ? `<tr>${sigColumn("&nbsp;", approver2, { stamp: true }).replace(/^\s*<td style="[^"]*"/, '<td style="padding:8px 10px;vertical-align:top"')}</tr>`
                : `<tr><td style="padding:8px 10px;vertical-align:top;"><div style="font-size:9.5px;color:${FAINT};">&nbsp;</div></td></tr>`}
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- SECTION 16: PAYMENT INTERNAL USE ONLY (plain office table — no colour) -->
  <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};border-top:0;margin-bottom:0;">
    <tbody>
      <tr><td colspan="2" style="border:1px solid ${BORDER};padding:5px 10px;font-size:10.5px;font-weight:700;color:${INK};">${num(16)} Payment Internal Use Only:</td></tr>
      <tr>
        <td style="border:1px solid ${BORDER};padding:8px 10px;vertical-align:top;width:50%;">
          <div style="font-size:10px;color:${INK};margin-bottom:8px;"><strong>PAR BL:</strong> <span style="border-bottom:1px solid ${RULE};padding:0 30px 1px 4px;">${esc(pmt?.parBl)}</span><div style="font-size:8px;color:${FAINT};font-style:italic;padding-left:4px;">(Add PAR budget line)</div></div>
          <div style="font-size:10px;color:${INK};"><strong>Date Received:</strong> <span style="border-bottom:1px solid ${RULE};padding:0 30px 1px 4px;">${fmtDate(pmt?.receivedAt)}</span></div>
        </td>
        <td style="border:1px solid ${BORDER};padding:8px 10px;vertical-align:top;width:50%;">
          <div style="font-size:10px;color:${INK};margin-bottom:8px;"><strong>Received By:</strong> <span style="border-bottom:1px solid ${RULE};padding:0 30px 1px 4px;">${esc(receivedBy)}</span></div>
          <div style="font-size:10px;color:${INK};"><strong>Assigned To:</strong> <span style="border-bottom:1px solid ${RULE};padding:0 30px 1px 4px;">${esc(assignedTo)}</span></div>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid ${BORDER};padding:6px 10px;font-size:10px;color:${INK};">
          IBAN: <strong style="font-family:monospace;">${esc(req.payeeIban) || "—"}</strong>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          Bank: <strong>${esc(req.payeeBank) || "—"}</strong>
          ${pmt?.paymentDate ? `&nbsp;&nbsp;|&nbsp;&nbsp;Payment date: <strong>${fmtDate(pmt.paymentDate)}</strong>` : ""}
          ${pmt?.paymentRef ? `&nbsp;&nbsp;|&nbsp;&nbsp;Ref: <strong>${esc(pmt.paymentRef)}</strong>` : ""}
          ${pmt?.actualAmountCents != null ? `&nbsp;&nbsp;|&nbsp;&nbsp;Actual amount: <strong>${amount(pmt.actualAmountCents)} ${esc(req.currency || "MDL")}</strong>` : ""}
        </td>
      </tr>
    </tbody>
  </table>

  <div style="font-size:9px;color:${FAINT};text-align:right;padding-top:6px;">PAR No: ${esc(req.requestNo)}</div>

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
