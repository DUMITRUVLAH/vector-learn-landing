/**
 * ITPARK-601: Whole-packet PDF export for Moldova IT Park Audit Toolkit
 *
 * Reuses parPdf.ts html2canvas RASTERIZATION technique (not jsPDF text):
 *   buildItparkPacketHtml(engagement, lines, monthly, letters, declaration): string
 *   downloadItparkPacketPdf(engagement, lines, ...): Promise<void>
 *   downloadItparkPiecePdf(kind, html): Promise<void>
 *
 * Why rasterize: jsPDF built-in fonts mangle Romanian diacritics (ș/ț/ă/â/î).
 * html2canvas + jsPDF raster keeps glyphs correct.
 *
 * Money format: fmtMDL() from src/lib/itpark/anexa4.ts (Romanian locale, "1.971.197,19").
 * NOT parPdf.money() — that one adds "L" symbol and has different signature.
 *
 * Diacritics: ă â î ș ț — correct in all strings (not ş/ţ cedilla variants).
 *
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §5
 */
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { ItparkEngagement } from "@/lib/api/itparkEngagements";
import type { RevenueLine } from "@/lib/api/itparkLines";
import { computeAnexa3, fmtPct as _fmtPct } from "./calc";
import { computeAnexa4, fmtMDL, MONTH_NAMES_RO } from "./anexa4";
import { generateLetterBodies } from "./letterTemplates";

// Re-export fmtMDL for tests
export { fmtMDL };

// ─── PDF palette (inline hex, html2canvas-safe, NOT design-system tokens) ─────

const BLUE_HDR = "#1a56db";    // IT Park / Moldova blue header band
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const LIGHT_BG = "#f8fafc";
const GREEN_OK = "#16a34a";
const RED_ERR = "#dc2626";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ro-MD", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(iso);
  }
}

function fmtPeriod(start: string, end: string): string {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

function pageHeader(title: string, engagementName: string, year: number): string {
  return `
  <div style="background:${BLUE_HDR};padding:10px 20px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:14px;font-weight:800;color:#ffffff;">${esc(title)}</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.85);">${esc(engagementName)} · ${year}</div>
  </div>`;
}

function divider(title: string): string {
  return `<div style="background:${LIGHT_BG};border-top:2px solid ${BLUE_HDR};border-bottom:1px solid ${LINE};padding:6px 20px;margin-top:16px;">
    <span style="font-size:11px;font-weight:800;color:${BLUE_HDR};text-transform:uppercase;letter-spacing:0.06em;">${esc(title)}</span>
  </div>`;
}

// ─── Anexa 2 HTML section ─────────────────────────────────────────────────────

function buildAnexa2Section(eng: ItparkEngagement, totalSalesCents: number, totalEligibleCents: number): string {
  const rows: [number, string, string][] = [
    [1, "Denumirea rezidentului (IDNO)", `${esc(eng.residentName)} (${esc(eng.idno)})`],
    [2, "Adresă juridică", esc(eng.legalAddress ?? "—")],
    [3, "Perioada de raportare", esc(fmtPeriod(eng.periodStart, eng.periodEnd))],
    [4, "Subdiviziuni", esc(eng.subdivisionAddresses ?? "Fără subdiviziuni")],
    [5, "Plătitor TVA", eng.vatPayer ? "Da" : "Nu"],
    [6, "Costul subcontractorilor (MDL)", esc(fmtMDL(eng.subcontractorCostsCents ?? 0))],
    [7, "Total venituri din vânzări (MDL)", `<strong style="color:${INK};">${esc(fmtMDL(totalSalesCents))}</strong>`],
    [8, "Total venituri eligibile (MDL)", `<strong style="color:${GREEN_OK};">${esc(fmtMDL(totalEligibleCents))}</strong>`],
    [9, "Venituri ajustate (MDL)", esc(fmtMDL(eng.adjustedRevenueCents ?? 0))],
    [10, "Procedura de informare angajați", esc(eng.employeeInfoProcedure ?? "—")],
    [11, "Firma de audit", esc(eng.auditFirmName ?? "—")],
  ];

  const tableRows = rows.map(([no, label, value]) => `
    <tr style="border-bottom:1px solid ${LINE};">
      <td style="padding:5px 8px;font-size:10px;color:${MUTED};text-align:center;border-right:1px solid ${LINE};width:30px;">${no}</td>
      <td style="padding:5px 8px;font-size:11px;color:${INK};border-right:1px solid ${LINE};">${label}</td>
      <td style="padding:5px 8px;font-size:11px;color:${INK};">${value}</td>
    </tr>`).join("");

  return `
  <div style="padding:12px 20px;">
    <table style="width:100%;border-collapse:collapse;border:1px solid ${LINE};">
      <thead>
        <tr style="background:${LIGHT_BG};">
          <th style="padding:5px 8px;font-size:9px;color:${MUTED};text-align:center;border:1px solid ${LINE};width:30px;">Rând</th>
          <th style="padding:5px 8px;font-size:9px;color:${MUTED};text-align:left;border:1px solid ${LINE};">Indicator</th>
          <th style="padding:5px 8px;font-size:9px;color:${MUTED};text-align:left;border:1px solid ${LINE};">Valoare</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
}

// ─── Anexa 3 HTML section ─────────────────────────────────────────────────────

function buildAnexa3Section(lines: RevenueLine[], totalSalesCents: number, totalEligibleCents: number, eligiblePct: number): string {
  const lineRows = lines.map((l, idx) => `
    <tr style="border-bottom:1px solid ${LINE};">
      <td style="padding:4px 6px;font-size:9px;text-align:center;border-right:1px solid ${LINE};color:${MUTED};">${idx + 1}</td>
      <td style="padding:4px 6px;font-size:9px;border-right:1px solid ${LINE};color:${INK};">${esc(l.clientName)}</td>
      <td style="padding:4px 6px;font-size:9px;border-right:1px solid ${LINE};color:${INK};font-family:monospace;">${esc(l.caemCode)}</td>
      <td style="padding:4px 6px;font-size:9px;border-right:1px solid ${LINE};color:${INK};">${esc(l.serviceDescription)}</td>
      <td style="padding:4px 6px;font-size:9px;text-align:right;border-right:1px solid ${LINE};color:${INK};">${esc(fmtMDL(l.amountCents))}</td>
      <td style="padding:4px 6px;font-size:9px;text-align:center;color:${l.isEligible ? GREEN_OK : RED_ERR};">${l.isEligible ? "Da" : "Nu"}</td>
    </tr>`).join("");

  return `
  <div style="padding:12px 20px;">
    <table style="width:100%;border-collapse:collapse;border:1px solid ${LINE};">
      <thead>
        <tr style="background:${BLUE_HDR};">
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:center;border:1px solid rgba(255,255,255,0.2);width:25px;">#</th>
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:left;border:1px solid rgba(255,255,255,0.2);">Client</th>
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:left;border:1px solid rgba(255,255,255,0.2);">CAEM</th>
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:left;border:1px solid rgba(255,255,255,0.2);">Serviciu</th>
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:right;border:1px solid rgba(255,255,255,0.2);">Sumă (MDL)</th>
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:center;border:1px solid rgba(255,255,255,0.2);">Eligibil</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows || `<tr><td colspan="6" style="padding:10px;text-align:center;color:${MUTED};font-size:10px;">Fără linii de venit</td></tr>`}
      </tbody>
      <tfoot>
        <tr style="background:${LIGHT_BG};border-top:2px solid ${BLUE_HDR};">
          <td colspan="4" style="padding:6px 8px;font-size:10px;font-weight:700;text-align:right;color:${INK};">TOTAL VÂNZĂRI:</td>
          <td style="padding:6px 8px;font-size:10px;font-weight:700;text-align:right;color:${INK};">${esc(fmtMDL(totalSalesCents))}</td>
          <td></td>
        </tr>
        <tr style="background:${LIGHT_BG};">
          <td colspan="4" style="padding:6px 8px;font-size:10px;font-weight:700;text-align:right;color:${GREEN_OK};">TOTAL ELIGIBIL (${esc(_fmtPct(eligiblePct))}):</td>
          <td style="padding:6px 8px;font-size:10px;font-weight:700;text-align:right;color:${GREEN_OK};">${esc(fmtMDL(totalEligibleCents))}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>`;
}

// ─── Anexa 4 HTML section ─────────────────────────────────────────────────────

function buildAnexa4Section(lines: RevenueLine[]): string {
  const result = computeAnexa4(
    lines.map((l) => ({ amountCents: l.amountCents, isEligible: l.isEligible, month: l.month ?? null })),
    { eligibilityThresholdPct: 70, toleranceMonths: 2 }
  );

  const monthRows = result.months.map((row) => `
    <tr style="border-bottom:1px solid ${LINE};${row.conform ? "" : `background:#fff1f2;`}">
      <td style="padding:4px 6px;font-size:9px;text-align:center;border-right:1px solid ${LINE};color:${INK};">${MONTH_NAMES_RO[row.month]}</td>
      <td style="padding:4px 6px;font-size:9px;text-align:right;border-right:1px solid ${LINE};color:${GREEN_OK};">${esc(fmtMDL(row.eligibleCents))}</td>
      <td style="padding:4px 6px;font-size:9px;text-align:right;border-right:1px solid ${LINE};color:${INK};">${esc(fmtMDL(row.totalCents))}</td>
      <td style="padding:4px 6px;font-size:9px;text-align:right;border-right:1px solid ${LINE};color:${GREEN_OK};">${esc(fmtMDL(row.cumEligibleCents))}</td>
      <td style="padding:4px 6px;font-size:9px;text-align:right;border-right:1px solid ${LINE};color:${INK};">${esc(fmtMDL(row.cumTotalCents))}</td>
      <td style="padding:4px 6px;font-size:9px;text-align:center;color:${row.conform ? GREEN_OK : RED_ERR};font-weight:700;">${esc(_fmtPct(row.monthlySharePct))}</td>
      <td style="padding:4px 6px;font-size:9px;text-align:center;color:${row.conform ? GREEN_OK : RED_ERR};">${row.conform ? "Conform" : "Sub prag"}</td>
    </tr>`).join("");

  return `
  <div style="padding:12px 20px;">
    <table style="width:100%;border-collapse:collapse;border:1px solid ${LINE};">
      <thead>
        <tr style="background:${BLUE_HDR};">
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:center;border:1px solid rgba(255,255,255,0.2);">Lună</th>
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:right;border:1px solid rgba(255,255,255,0.2);">Eligibil (MDL)</th>
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:right;border:1px solid rgba(255,255,255,0.2);">Total (MDL)</th>
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:right;border:1px solid rgba(255,255,255,0.2);">Cum. eligibil</th>
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:right;border:1px solid rgba(255,255,255,0.2);">Cum. total</th>
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:center;border:1px solid rgba(255,255,255,0.2);">Pondere YTD</th>
          <th style="padding:5px 6px;font-size:9px;color:#fff;text-align:center;border:1px solid rgba(255,255,255,0.2);">Statut</th>
        </tr>
      </thead>
      <tbody>${monthRows}</tbody>
      <tfoot>
        <tr style="background:${LIGHT_BG};border-top:2px solid ${BLUE_HDR};">
          <td style="padding:5px 6px;font-size:10px;font-weight:700;color:${INK};border-right:1px solid ${LINE};">TOTAL</td>
          <td style="padding:5px 6px;font-size:10px;font-weight:700;text-align:right;color:${GREEN_OK};border-right:1px solid ${LINE};">${esc(fmtMDL(result.total.eligibleCents))}</td>
          <td style="padding:5px 6px;font-size:10px;font-weight:700;text-align:right;color:${INK};border-right:1px solid ${LINE};">${esc(fmtMDL(result.total.totalCents))}</td>
          <td colspan="2" style="padding:5px 6px;border-right:1px solid ${LINE};"></td>
          <td colspan="2" style="padding:5px 6px;font-size:10px;font-weight:700;text-align:center;color:${GREEN_OK};">${esc(_fmtPct(result.total.annualSharePct))}</td>
        </tr>
      </tfoot>
    </table>
  </div>`;
}

// ─── Letter section ───────────────────────────────────────────────────────────

function buildLetterSection(letter: { title: string; body: string; date: string; signatory: string; signatoryPosition: string }): string {
  // Preserve newlines in body
  const bodyHtml = esc(letter.body).replace(/\n/g, "<br>");
  return `
  <div style="padding:16px 20px;page-break-inside:avoid;">
    <h2 style="font-size:12px;font-weight:800;color:${BLUE_HDR};margin-bottom:8px;">${esc(letter.title)}</h2>
    <p style="font-size:9px;color:${MUTED};margin-bottom:10px;">Data: ${esc(letter.date)}</p>
    <div style="font-size:10px;color:${INK};line-height:1.6;border:1px solid ${LINE};padding:10px;border-radius:4px;">
      ${bodyHtml}
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end;">
      <div style="text-align:center;min-width:200px;">
        <div style="border-top:1px solid ${INK};padding-top:4px;font-size:9px;color:${INK};">
          <strong>${esc(letter.signatory)}</strong><br>
          <span style="color:${MUTED};">${esc(letter.signatoryPosition)}</span>
        </div>
      </div>
    </div>
  </div>`;
}

// ─── Declaration section ──────────────────────────────────────────────────────

function buildDeclarationSection(eng: ItparkEngagement): string {
  const period = fmtPeriod(eng.periodStart, eng.periodEnd);
  const addr = eng.legalAddress ?? "adresă juridică nespecificată";
  const body = `Subsemnatul/subsemnata, ${eng.residentName}, în calitate de Administrator al ${eng.residentName} (cod fiscal ${eng.idno}), cu sediul juridic la: ${addr},

declarăm pe proprie răspundere că, în perioada ${period}:

1. Societatea nu s-a aflat în stare de insolvabilitate sau faliment;
2. Societatea nu a inițiat procedura de lichidare voluntară sau forțată;
3. Societatea nu a fost supusă restructurării judiciare;
4. Societatea nu a suspendat activitatea de bază eligibilă IT Park;
5. Nu au fost inițiate proceduri legale cu impact semnificativ.

Prezenta declarație este dată conform art. 312 Codul Penal al RM și art. 18 alin. (1) din Legea nr. 77/2016 cu privire la parcurile de tehnologii ale informației.

Declarația este anexată la dosarul de verificare MITP pentru ${eng.reportingYear}.`;

  const bodyHtml = esc(body).replace(/\n/g, "<br>");
  return `
  <div style="padding:16px 20px;">
    <h2 style="font-size:12px;font-weight:800;color:${BLUE_HDR};margin-bottom:8px;">Declarație pe proprie răspundere</h2>
    <div style="font-size:10px;color:${INK};line-height:1.6;border:1px solid ${LINE};padding:10px;border-radius:4px;">
      ${bodyHtml}
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end;">
      <div style="text-align:center;min-width:200px;">
        <div style="border-top:1px solid ${INK};padding-top:4px;font-size:9px;color:${INK};">
          <strong>${esc(eng.residentName)}</strong><br>
          <span style="color:${MUTED};">Administrator</span>
        </div>
      </div>
    </div>
  </div>`;
}

// ─── Individual piece HTML builders ──────────────────────────────────────────

export type ItparkPiece =
  | "anexa2"
  | "anexa3"
  | "anexa4"
  | "letter_no_adjustments"
  | "letter_address"
  | "letter_no_subdivisions"
  | "letter_activity"
  | "letter_solvency"
  | "decl_self_responsibility";

/** Build HTML for a single piece (for individual export) */
export function buildItparkPieceHtml(
  piece: ItparkPiece,
  eng: ItparkEngagement,
  lines: RevenueLine[]
): string {
  const a3 = computeAnexa3(lines.map((l) => ({ caemCode: l.caemCode, amountCents: l.amountCents, isEligible: l.isEligible, month: l.month ?? undefined })));

  const wrapper = (content: string) => `
<div style="width:794px;box-sizing:border-box;background:#ffffff;font-family:Onest,Inter,Arial,sans-serif;color:${INK};padding:0;">
  ${pageHeader(getPieceTitle(piece), eng.residentName, eng.reportingYear)}
  ${content}
</div>`;

  if (piece === "anexa2") {
    return wrapper(buildAnexa2Section(eng, a3.totalSalesCents, a3.totalEligibleCents));
  }
  if (piece === "anexa3") {
    return wrapper(buildAnexa3Section(lines, a3.totalSalesCents, a3.totalEligibleCents, a3.eligiblePct));
  }
  if (piece === "anexa4") {
    return wrapper(buildAnexa4Section(lines));
  }
  if (piece === "decl_self_responsibility") {
    return wrapper(buildDeclarationSection(eng));
  }

  // Letters
  const letters = generateLetterBodies(eng);
  const letter = letters[piece];
  if (letter) {
    return wrapper(buildLetterSection(letter));
  }

  return wrapper(`<div style="padding:20px;color:${MUTED};">Piesă necunoscută: ${esc(piece)}</div>`);
}

function getPieceTitle(piece: ItparkPiece): string {
  const titles: Record<ItparkPiece, string> = {
    anexa2: "Anexa 2 — Informații generale",
    anexa3: "Anexa 3 — Venituri din vânzări",
    anexa4: "Anexa 4 — Raport lunar eligibilitate",
    letter_no_adjustments: "Scrisoare — Absența ajustărilor",
    letter_address: "Scrisoare — Adresa juridică",
    letter_no_subdivisions: "Scrisoare — Absența subdiviziunilor",
    letter_activity: "Scrisoare — Obiectul de activitate",
    letter_solvency: "Scrisoare — Solvabilitate",
    decl_self_responsibility: "Declarație pe proprie răspundere",
  };
  return titles[piece] ?? piece;
}

// ─── Whole-packet HTML builder ────────────────────────────────────────────────

/**
 * Build the entire audit packet as one HTML document (all 9 pieces).
 * Rendered once, sliced into A4 pages by jsPDF.
 *
 * Pieces order: Anexa 2 → Anexa 3 → Anexa 4 → 5 letters → Declaration
 */
export function buildItparkPacketHtml(
  eng: ItparkEngagement,
  lines: RevenueLine[]
): string {
  const a3 = computeAnexa3(
    lines.map((l) => ({ caemCode: l.caemCode, amountCents: l.amountCents, isEligible: l.isEligible, month: l.month ?? undefined }))
  );
  const letters = generateLetterBodies(eng);

  const LETTER_ORDER: Array<"letter_no_adjustments" | "letter_address" | "letter_no_subdivisions" | "letter_activity" | "letter_solvency"> = [
    "letter_no_adjustments",
    "letter_address",
    "letter_no_subdivisions",
    "letter_activity",
    "letter_solvency",
  ];

  const letterSections = LETTER_ORDER.map((k) =>
    letters[k]
      ? `${divider(letters[k].title)}${buildLetterSection(letters[k])}`
      : ""
  ).join("");

  return `
<div style="width:794px;box-sizing:border-box;background:#ffffff;font-family:Onest,Inter,Arial,sans-serif;color:${INK};padding:0;">

  <!-- Cover -->
  <div style="background:${BLUE_HDR};padding:24px;text-align:center;">
    <div style="font-size:20px;font-weight:900;color:#ffffff;margin-bottom:6px;">Dosar de Verificare MITP</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.9);">${esc(eng.residentName)} · IDNO ${esc(eng.idno)} · ${eng.reportingYear}</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.7);margin-top:4px;">Perioadă: ${esc(fmtPeriod(eng.periodStart, eng.periodEnd))}</div>
  </div>

  <!-- Anexa 2 -->
  ${divider("Anexa 2 — Informații generale")}
  ${buildAnexa2Section(eng, a3.totalSalesCents, a3.totalEligibleCents)}

  <!-- Anexa 3 -->
  ${divider("Anexa 3 — Venituri din vânzări (${lines.length} linii)")}
  ${buildAnexa3Section(lines, a3.totalSalesCents, a3.totalEligibleCents, a3.eligiblePct)}

  <!-- Anexa 4 -->
  ${divider("Anexa 4 — Raport lunar eligibilitate")}
  ${buildAnexa4Section(lines)}

  <!-- 5 Letters -->
  ${letterSections}

  <!-- Declaration -->
  ${divider("Declarație pe proprie răspundere")}
  ${buildDeclarationSection(eng)}

</div>`;
}

// ─── Download helpers ─────────────────────────────────────────────────────────

async function rasterizeAndSave(html: string, fileName: string): Promise<void> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.background = "#ffffff";
  host.innerHTML = html;
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

    pdf.save(fileName);
  } finally {
    document.body.removeChild(host);
  }
}

/**
 * Download the whole audit packet as a single PDF.
 */
export async function downloadItparkPacketPdf(
  eng: ItparkEngagement,
  lines: RevenueLine[]
): Promise<void> {
  const html = buildItparkPacketHtml(eng, lines);
  const fileSafe = `${eng.residentName}_${eng.reportingYear}_MITP`.replace(/[^\w-]+/g, "_");
  await rasterizeAndSave(html, `${fileSafe}.pdf`);
}

/**
 * Download a single piece as PDF.
 */
export async function downloadItparkPiecePdf(
  piece: ItparkPiece,
  eng: ItparkEngagement,
  lines: RevenueLine[]
): Promise<void> {
  const html = buildItparkPieceHtml(piece, eng, lines);
  const fileSafe = `${eng.residentName}_${eng.reportingYear}_${piece}`.replace(/[^\w-]+/g, "_");
  await rasterizeAndSave(html, `${fileSafe}.pdf`);
}
