/**
 * Export PDF pentru rapoartele CRM (cerința 58 din caietul de sarcini: „Export rapoarte în Excel
 * și PDF").
 *
 * Aceeași tehnică — și același motiv — ca `src/lib/parReportPdf.ts`: jsPDF + html2canvas,
 * client-side. PDF-ul făcut pe server ar trece prin Playwright, care pe serverless n-are
 * întotdeauna un Chromium; un buton de export care uneori întoarce HTML e mai rău decât niciun
 * buton. Aici randăm exact cifrele de pe ecran, deci fișierul nu poate să difere de raportul pe
 * care omul tocmai l-a citit.
 *
 * Documentul spune ÎNTOTDEAUNA în antet perioada și agentul care au produs cifrele. Un raport
 * fără scopul lui scris pe el e o cifră scoasă din context — cineva o compară cu alt total și
 * crede că sistemul greșește.
 */
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const INK = "#111111";
const MUTED = "#555555";
const BORDER = "#cccccc";
const HEAD_BG = "#f3f4f6";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

export function money(cents: number): string {
  return ((cents ?? 0) / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface ReportPdfTable {
  title: string;
  head: string[];
  rows: (string | number)[][];
  /** Coloanele aliniate la dreapta (cifre). Implicit: toate în afară de prima. */
  numericFrom?: number;
}

export interface CrmReportPdfInput {
  orgName: string;
  /** Perioada în cuvinte („1–30 septembrie 2026" sau „toate perioadele"). */
  periodLabel: string;
  /** Agentul, sau „toată echipa". */
  ownerLabel: string;
  kpis: { label: string; value: string }[];
  cycleLabel: string;
  tables: ReportPdfTable[];
  generatedAt?: Date;
}

function tableHtml(t: ReportPdfTable): string {
  const numericFrom = t.numericFrom ?? 1;
  if (t.rows.length === 0) {
    return `<h2 style="font-size:13px;margin:16px 0 6px;color:${INK}">${esc(t.title)}</h2>
      <p style="margin:0 0 12px;color:${MUTED};font-size:11px">Nicio înregistrare în perioada aleasă.</p>`;
  }
  const th = t.head
    .map(
      (h, i) =>
        `<th style="text-align:${i >= numericFrom ? "right" : "left"};padding:5px 7px;border:1px solid ${BORDER};background:${HEAD_BG};font-size:11px">${esc(h)}</th>`
    )
    .join("");
  const tr = t.rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (c, i) =>
              `<td style="text-align:${i >= numericFrom ? "right" : "left"};padding:5px 7px;border:1px solid ${BORDER};font-size:11px">${esc(String(c))}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  return `<h2 style="font-size:13px;margin:16px 0 6px;color:${INK}">${esc(t.title)}</h2>
    <table style="width:100%;border-collapse:collapse;margin:0 0 12px">
      <thead><tr>${th}</tr></thead><tbody>${tr}</tbody>
    </table>`;
}

export function buildReportHtml(input: CrmReportPdfInput): string {
  const generated = (input.generatedAt ?? new Date()).toLocaleString("ro-MD", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const kpiCells = input.kpis
    .map(
      (k) =>
        `<div style="border:1px solid ${BORDER};border-radius:6px;padding:8px 10px;min-width:150px">
           <div style="font-size:10px;color:${MUTED}">${esc(k.label)}</div>
           <div style="font-size:16px;font-weight:700;color:${INK}">${esc(k.value)}</div>
         </div>`
    )
    .join("");

  return `<div style="width:760px;padding:28px;font-family:Arial,Helvetica,sans-serif;color:${INK};background:#fff">
    <h1 style="font-size:18px;margin:0 0 2px">Raport CRM — ${esc(input.orgName)}</h1>
    <p style="margin:0 0 2px;font-size:11px;color:${MUTED}">Perioada: ${esc(input.periodLabel)} · ${esc(input.ownerLabel)}</p>
    <p style="margin:0 0 14px;font-size:10px;color:${MUTED}">Generat la ${esc(generated)}</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px">${kpiCells}</div>
    <p style="margin:6px 0 0;font-size:11px;color:${MUTED}">Durata medie a ciclului de vânzare: <b style="color:${INK}">${esc(input.cycleLabel)}</b></p>
    ${input.tables.map(tableHtml).join("")}
  </div>`;
}

/** Randează HTML-ul de mai sus într-un PDF A4 și îl descarcă. */
export async function downloadCrmReportPdf(input: CrmReportPdfInput, fileName: string): Promise<void> {
  const holder = document.createElement("div");
  // În afara ecranului, dar NU `display:none`: html2canvas nu poate măsura un element ascuns.
  holder.style.cssText = "position:fixed;left:-10000px;top:0;";
  holder.innerHTML = buildReportHtml(input);
  document.body.appendChild(holder);

  try {
    const canvas = await html2canvas(holder.firstElementChild as HTMLElement, { scale: 2, backgroundColor: "#ffffff" });
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW - 40;
    const imgH = (canvas.height * imgW) / canvas.width;

    let rendered = 0;
    let page = 0;
    // Raportul e mai lung decât o pagină: se taie în felii de înălțimea paginii, nu se
    // micșorează până devine ilizibil.
    while (rendered < imgH) {
      if (page > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 20, 20 - rendered, imgW, imgH, undefined, "FAST");
      rendered += pageH - 40;
      page++;
    }
    pdf.save(fileName);
  } finally {
    document.body.removeChild(holder);
  }
}
