/**
 * Export PDF pentru „Rapoarte & statistici" PAR.
 *
 * De ce client-side (jsPDF + html2canvas, exact tehnica din `src/lib/parPdf.ts`): PDF-ul
 * serverului trece prin Playwright, care pe serverless nu are întotdeauna un Chromium — iar un
 * buton de export care uneori întoarce HTML e mai rău decât niciun buton. Aici randăm exact
 * cifrele care sunt pe ecran, deci fișierul nu poate să difere de raportul pe care omul îl vede.
 *
 * Documentul spune ÎNTOTDEAUNA în antet ce filtre au produs cifrele. Un raport de finanțe fără
 * scopul lui scris pe el e o cifră scoasă din context — cineva o compară cu alt total și crede
 * că sistemul greșește.
 */
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { ParSpendByItem, ParAgingItem, ParCycleTimeItem, ParCurrencyBreakdownItem } from "./api/par";

const INK = "#111111";
const MUTED = "#555555";
const BORDER = "#cccccc";
const HEAD_BG = "#f3f4f6";

export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

/** „7 000,00" — aceleași reguli ca formatMDL din pagină, dar fără simbol în tabel. */
export function money(cents: number): string {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface ReportPdfSection {
  title: string;
  /** Antetul coloanei de etichetă (ex. „Proiect"). */
  labelHead: string;
  items: ParSpendByItem[];
}

export interface ReportPdfInput {
  orgName: string;
  /** Perioada, în cuvinte („1 ian. 2026 – 31 mar. 2026" sau „toate perioadele"). */
  periodLabel: string;
  /** Filtrele active, deja traduse în text („Proiect: LED", „Status: Plătită"). */
  filterLabels: string[];
  /** Ce sumă s-a raportat: estimat sau plătit efectiv. */
  basisLabel: string;
  totalCents: number;
  totalCount: number;
  cycleTime: ParCycleTimeItem | null;
  currencyBreakdown: ParCurrencyBreakdownItem[];
  sections: ReportPdfSection[];
  aging: ParAgingItem[];
  agingStatusLabel: (status: string) => string;
  generatedAt?: Date;
}

function table(head: string[], rows: string[][], aligns: ("left" | "right")[]): string {
  if (!rows.length) return `<p style="margin:4px 0 12px;color:${MUTED};font-size:11px">Nicio înregistrare.</p>`;
  const th = head
    .map((h, i) => `<th style="text-align:${aligns[i]};padding:5px 7px;border:1px solid ${BORDER};background:${HEAD_BG};font-size:10px;text-transform:uppercase;letter-spacing:.03em">${esc(h)}</th>`)
    .join("");
  const tr = rows
    .map((r) => `<tr>${r.map((cell, i) => `<td style="text-align:${aligns[i]};padding:5px 7px;border:1px solid ${BORDER};font-size:11px">${esc(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin:4px 0 14px">
    <thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

/** Pur — se poate testa fără browser (aceeași disciplină ca buildParHtml). */
export function buildReportHtml(input: ReportPdfInput): string {
  const when = (input.generatedAt ?? new Date()).toLocaleString("ro-MD", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const filters = input.filterLabels.length
    ? input.filterLabels.map((f) => `<span style="display:inline-block;border:1px solid ${BORDER};border-radius:10px;padding:1px 8px;margin:0 4px 4px 0;font-size:10px">${esc(f)}</span>`).join("")
    : `<span style="font-size:10px;color:${MUTED}">fără filtre suplimentare</span>`;

  const sections = input.sections
    .map((sec) => {
      const rows = sec.items
        .slice()
        .sort((a, b) => b.totalCents - a.totalCents)
        .map((it) => [
          it.label ?? "—",
          String(it.count ?? 0),
          money(it.totalCents ?? 0),
          money(it.paidCents ?? 0),
        ]);
      return `<h3 style="margin:14px 0 4px;font-size:12px">${esc(sec.title)}</h3>${table(
        [sec.labelHead, "Nr.", "Estimat (MDL)", "Plătit (MDL)"],
        rows,
        ["left", "right", "right", "right"],
      )}`;
    })
    .join("");

  const agingRows = input.aging.map((a) => [
    input.agingStatusLabel(a.status),
    String(a.count ?? 0),
    money(a.totalCents ?? 0),
    a.avgAgingDays == null ? "—" : `${a.avgAgingDays.toFixed(1)} zile`,
  ]);

  const currencyRows = input.currencyBreakdown.map((c) => [
    c.currency,
    String(c.count ?? 0),
    money(c.nativeTotalCents ?? 0),
    money(c.mdlTotalCents ?? 0),
  ]);

  return `<div style="width:794px;padding:28px 32px;background:#fff;color:${INK};font-family:Inter,Arial,sans-serif">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${INK};padding-bottom:8px">
      <div>
        <div style="font-size:18px;font-weight:700">Raport PAR — cereri de plată</div>
        <div style="font-size:12px;margin-top:2px">${esc(input.orgName)}</div>
      </div>
      <div style="text-align:right;font-size:10px;color:${MUTED}">
        <div>Generat: ${esc(when)}</div>
        <div>Sume raportate: ${esc(input.basisLabel)}</div>
      </div>
    </div>

    <div style="margin:10px 0 4px;font-size:11px"><strong>Perioada:</strong> ${esc(input.periodLabel)}</div>
    <div style="margin-bottom:10px">${filters}</div>

    <div style="display:flex;gap:10px;margin:10px 0 4px">
      <div style="flex:1;border:1px solid ${BORDER};border-radius:6px;padding:8px 10px">
        <div style="font-size:10px;color:${MUTED};text-transform:uppercase">Total ${esc(input.basisLabel)}</div>
        <div style="font-size:16px;font-weight:700">${money(input.totalCents)} MDL</div>
        <div style="font-size:10px;color:${MUTED}">${input.totalCount} cereri</div>
      </div>
      <div style="flex:1;border:1px solid ${BORDER};border-radius:6px;padding:8px 10px">
        <div style="font-size:10px;color:${MUTED};text-transform:uppercase">Trimitere → aprobare</div>
        <div style="font-size:16px;font-weight:700">${input.cycleTime?.avgSubmitToApprovedDays == null ? "—" : `${input.cycleTime.avgSubmitToApprovedDays.toFixed(1)} zile`}</div>
      </div>
      <div style="flex:1;border:1px solid ${BORDER};border-radius:6px;padding:8px 10px">
        <div style="font-size:10px;color:${MUTED};text-transform:uppercase">Trimitere → plată</div>
        <div style="font-size:16px;font-weight:700">${input.cycleTime?.avgSubmitToPaidDays == null ? "—" : `${input.cycleTime.avgSubmitToPaidDays.toFixed(1)} zile`}</div>
      </div>
    </div>

    ${currencyRows.length ? `<h3 style="margin:14px 0 4px;font-size:12px">Pe monedă</h3>${table(["Monedă", "Nr.", "Total în monedă", "Echivalent MDL"], currencyRows, ["left", "right", "right", "right"])}` : ""}

    ${sections}

    <h3 style="margin:14px 0 4px;font-size:12px">Vechimea cererilor</h3>
    ${table(["Status", "Nr.", "Total (MDL)", "Vârstă medie"], agingRows, ["left", "right", "right", "right"])}

    <div style="margin-top:16px;border-top:1px solid ${BORDER};padding-top:6px;font-size:9px;color:${MUTED}">
      Cifrele reflectă filtrele din antet. Sumele sunt agregate în MDL; cursul e cel înghețat la
      trimiterea fiecărei cereri.
    </div>
  </div>`;
}

/** Randează HTML-ul de mai sus într-un PDF A4 și îl descarcă. */
export async function downloadReportPdf(input: ReportPdfInput, fileName = "Raport_PAR.pdf"): Promise<void> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.background = "#ffffff";
  host.innerHTML = buildReportHtml(input);
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
