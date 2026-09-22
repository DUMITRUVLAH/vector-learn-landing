/**
 * PONTAJ-001 — formularul tipărit.
 *
 * Documentul iese pe formatul jurisdicției, nu pe un format al nostru: în Moldova e anexa la
 * Convenția colectivă (nivel național) nr. 17 din 28 februarie 2020, cu simbolurile și legenda
 * impuse acolo; în România nu există formular tipizat, deci se tipărește o foaie de prezență cu
 * temeiul obligației de evidență (art. 119 din Legea nr. 53/2003) și fără niciun antet inventat.
 * Antetul, semnăturile și legenda vin din `jurisdiction.ts` de pe server — aici doar se așază.
 *
 * Tipărirea se face într-o fereastră proprie, nu prin `@media print` peste aplicație: pagina are
 * sidebar, taburi și butoane, iar formularul trebuie să fie exact atât cât se semnează. A4
 * landscape, fiindcă 31 de zile plus coloanele de total nu încap pe portret.
 *
 * Funcția primește o LISTĂ de rânduri, deși self-service-ul trimite unul singur: tabelul oficial
 * e colectiv, iar ziua în care apare vizualizarea de echipă nu trebuie să însemne rescrierea
 * formularului.
 */
import type { PontajDay, PontajJurisdiction } from "@/lib/api/pontaj";
import { cellText, monthName } from "@/lib/api/pontaj";

export interface PrintRow {
  name: string;
  jobTitle: string | null;
  days: PontajDay[];
  counts: Record<string, number>;
  workedMinutes: number;
}

export interface PrintInput {
  month: string;
  jurisdiction: PontajJurisdiction;
  unitName: string | null;
  subdivisionName: string | null;
  rows: PrintRow[];
}

/** Culorile celulelor, aceleași ca în grila de pe ecran — documentul se recunoaște dintr-o privire. */
const SYMBOL_BG: Record<string, string> = {
  P: "#ffffff", R: "#f1f1f1", Sn: "#fef3c7", C: "#d1fae5", Cn: "#f5f3ff",
  Cm: "#fff7ed", Cc: "#fce7f3", D: "#e0f2fe", A: "#fee2e2", Ls: "#ccfbf1", Cs: "#ede9fe",
};
const SYMBOL_FG: Record<string, string> = {
  P: "#000000", R: "#888888", Sn: "#92400e", C: "#065f46", Cn: "#7c3aed",
  Cm: "#ea580c", Cc: "#be185d", D: "#0369a1", A: "#b91c1c", Ls: "#0f766e", Cs: "#6d28d9",
};

/** Escapare HTML — numele și funcția vin din date introduse de om. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TD = "border:1px solid #000;padding:1px;text-align:center";

export function buildTimesheetHtml(input: PrintInput): string {
  const { jurisdiction: jur, month, rows } = input;
  const form = jur.form;
  const days = rows[0]?.days ?? [];
  const daysInMonth = days.length;

  const dayHeaders = days
    .map(
      (d) =>
        `<th style="${TD};font-size:7px;background:${d.isWeekend || d.isHoliday ? "#f1f1f1" : "#fff"};width:16px">${Number(d.date.slice(8))}</th>`,
    )
    .join("");

  const summaryHeaders = jur.summaryCols
    .map(
      (col) =>
        `<th style="${TD};font-size:6px;background:#fff;width:18px;writing-mode:vertical-rl;transform:rotate(180deg);height:70px">${esc(col.short)}</th>`,
    )
    .join("");

  const bodyRows = rows
    .map((row, idx) => {
      const cells = row.days
        .map((day) => {
          const bg = SYMBOL_BG[day.symbol] ?? "#fff";
          const fg = SYMBOL_FG[day.symbol] ?? "#000";
          // Corecția manuală se vede și pe hârtie: cine verifică tabelul trebuie să poată
          // distinge ziua declarată de om de ziua completată automat din normă.
          const outline = day.source === "manual" ? "outline:1.5px solid #4f46e5;outline-offset:-1px;" : "";
          return `<td style="${TD};font-size:7px;background:${bg};color:${fg};${outline}">${esc(cellText(day, jur.symbols))}</td>`;
        })
        .join("");
      const summaryCells = jur.summaryCols
        .map((col) => `<td style="${TD};font-size:7px">${row.counts[col.key] || 0}</td>`)
        .join("");
      return `<tr><td style="${TD};font-size:7px">${idx + 1}</td><td style="border:1px solid #000;padding:1px 3px;font-size:8px;white-space:nowrap">${esc(row.name)}</td><td style="border:1px solid #000;padding:1px 3px;font-size:7px;white-space:nowrap">${esc(row.jobTitle || "")}</td>${cells}${summaryCells}</tr>`;
    })
    .join("");

  const annexHtml = form.annexLines.length
    ? `<div style="text-align:right;font-size:8px;margin-bottom:4px">${form.annexLines.map(esc).join("<br>")}</div>`
    : "";
  const legalBasisHtml = form.legalBasis
    ? `<div class="subtitle" style="font-size:8px;font-style:italic">${esc(form.legalBasis)}</div>`
    : "";
  // Denumirea unității se tipărește dacă organizația a completat-o; altfel rămâne linia goală
  // din formularul original, de completat cu pixul. Nu inventăm numele firmei.
  const unitLine = (label: string, value: string | null) =>
    `<div class="subtitle">${value ? esc(value) : "______________________________________"}</div><div class="subtitle" style="font-size:8px">(${label})</div>`;
  const unitFieldsHtml = form.showUnitFields
    ? unitLine("denumirea unității", input.unitName) +
      unitLine("denumirea subdiviziunii unității", input.subdivisionName)
    : "";
  const [sigL, sigC, sigR] = form.signatures.map((s) => esc(s).replace(/\n/g, "<br>"));
  const legendHtml = form.legend
    .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
    .join("");

  const label = monthName(month);
  const year = month.slice(0, 4);

  return `<!DOCTYPE html>
<html lang="ro"><head><meta charset="utf-8"><title>Pontaj ${esc(label)} ${year}</title>
<style>
@page{size:A4 landscape;margin:6mm 8mm}
*{box-sizing:border-box}
body{font-family:'Noto Sans',Arial,Helvetica,sans-serif;margin:0;padding:0;font-size:9px;color:#000}
table{border-collapse:collapse;width:100%}
h2{text-align:center;font-size:12px;margin:3px 0}
.subtitle{text-align:center;font-size:9px;margin:1px 0}
.legend-table{margin-top:10px;font-size:8px;width:100%}
.legend-table td{border:1px solid #000;padding:2px 5px;vertical-align:top}
.footer-row{margin-top:14px;display:flex;justify-content:space-between;font-size:8px;gap:10px}
.footer-row>div{flex:1}
</style></head>
<body>
${annexHtml}
<h2>${esc(form.title)}</h2>
${legalBasisHtml}
${unitFieldsHtml}
<div class="subtitle" style="margin-top:3px">pe luna <b>${esc(label)}</b> a anului <b>${year}</b></div>
<br>
<table>
<thead>
<tr>
<th rowspan="2" style="${TD};font-size:7px;width:20px">Nr.</th>
<th rowspan="2" style="border:1px solid #000;padding:1px 3px;font-size:7px;width:130px;text-align:left">Numele, prenumele</th>
<th rowspan="2" style="border:1px solid #000;padding:1px 3px;font-size:7px;width:90px;text-align:left">Funcția</th>
<th colspan="${daysInMonth}" style="${TD};font-size:8px">Zilele lunii</th>
${summaryHeaders}
</tr>
<tr>${dayHeaders}</tr>
</thead>
<tbody>${bodyRows}</tbody>
</table>
<div class="footer-row">
<div>${sigL} __________________<br><span style="font-size:7px">(numele, prenumele, semnătura)</span></div>
<div style="text-align:center">${sigC} __________________<br><span style="font-size:7px">(numele, prenumele, semnătura)</span></div>
<div style="text-align:right">${sigR} __________________<br><span style="font-size:7px">(numele, prenumele, semnătura)</span></div>
</div>
<div style="margin-top:10px;font-size:8px"><b>Note:</b></div>
<table class="legend-table">${legendHtml}</table>
</body></html>`;
}

/**
 * Deschide formularul într-o fereastră nouă și cheamă dialogul de tipărire.
 *
 * Întoarce `false` dacă browserul a blocat fereastra — apelantul arată atunci un mesaj, în loc
 * să pară că butonul nu face nimic.
 */
export function printTimesheet(input: PrintInput): boolean {
  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) return false;
  win.document.write(buildTimesheetHtml(input));
  win.document.close();
  // `onload` prinde și încărcarea fontului; fără el, Safari deschide dialogul peste o pagină
  // încă nerandată și tipărește o foaie goală.
  win.onload = () => win.print();
  return true;
}

/**
 * Aceleași date, ca CSV cu `;` — deschis direct de Excel în setările româno-moldovenești.
 * BOM-ul de la început e ce face diacriticele să se vadă corect în Excel pe Windows.
 */
export function buildTimesheetCsv(input: PrintInput): string {
  const days = input.rows[0]?.days ?? [];
  const header = [
    "Nr.",
    "Numele, prenumele",
    "Funcția",
    ...days.map((d) => String(Number(d.date.slice(8)))),
    ...input.jurisdiction.summaryCols.map((c) => c.short),
    "Total ore",
  ];
  const lines = input.rows.map((row, idx) => [
    String(idx + 1),
    row.name,
    row.jobTitle || "",
    ...row.days.map((d) => cellText(d, input.jurisdiction.symbols)),
    ...input.jurisdiction.summaryCols.map((c) => String(row.counts[c.key] || 0)),
    String(Math.round((row.workedMinutes / 60) * 100) / 100).replace(".", ","),
  ]);
  return (
    "﻿" +
    "sep=;\n" +
    [header, ...lines]
      .map((cols) => cols.map((v) => (v.includes(";") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)).join(";"))
      .join("\n")
  );
}
