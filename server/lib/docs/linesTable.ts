/**
 * DG-112 — tabelul pozițiilor, ca bloc HTML în corpul actului.
 *
 * De ce nu trece prin `renderWithContext` ca restul câmpurilor: acela ESCAPEAZĂ valorile (corect —
 * un furnizor numit cu marcaje nu trebuie să injecteze cod în act), deci un tabel trimis ca valoare
 * ar apărea pe hârtie ca `&lt;table&gt;`. Blocul se inserează separat, după randare, și e construit
 * aici din date, nu din text primit de la client.
 *
 * Fără el, actul de primire-predare — exact documentul de la care a pornit modulul — ieșea cu
 * fraza „[tabelul pozițiilor se completează din act]" tipărită pe el.
 */
export interface TableLine {
  description: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  /** CRM-D03: cota TVA a poziției (din catalog). 0 / lipsă = fără TVA. */
  vatPercent?: number;
}

/** TVA-ul unei poziții, rotunjit la ban. */
export function lineVatCents(l: Pick<TableLine, "lineTotalCents" | "vatPercent">): number {
  return Math.round((l.lineTotalCents * (l.vatPercent ?? 0)) / 100);
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Marcajul pe care șabloanele îl folosesc pentru locul tabelului. */
export const LINES_TABLE_TOKEN = "{{tabel.pozitii}}";

export function buildLinesTable(lines: TableLine[], currency = "MDL"): string {
  if (lines.length === 0) {
    return "<p><em>Fără poziții.</em></p>";
  }
  const total = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  // CRM-D03: oferta spunea „regimul TVA este cel indicat în tabel", dar tabelul n-avea TVA.
  // Coloana și totalurile cu TVA apar DOAR când o poziție chiar are TVA — actele PAR (fără TVA)
  // rămân exact cum erau, rând cu rând.
  const withVat = lines.some((l) => (l.vatPercent ?? 0) > 0);
  const vat = lines.reduce((s, l) => s + lineVatCents(l), 0);
  const cols = withVat ? 7 : 6;

  const rows = lines
    .map(
      (l, i) => `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${esc(l.description)}</td>
      <td style="text-align:center">${esc(l.unit)}</td>
      <td style="text-align:right">${l.quantity}</td>
      <td style="text-align:right">${money(l.unitPriceCents)}</td>${
        withVat ? `\n      <td style="text-align:right">${l.vatPercent ?? 0}%</td>` : ""
      }
      <td style="text-align:right">${money(l.lineTotalCents)}</td>
    </tr>`
    )
    .join("");

  const footRow = (label: string, cents: number) => `<tr>
      <td colspan="${cols - 1}" style="text-align:right"><strong>${label}</strong></td>
      <td style="text-align:right"><strong>${money(cents)}</strong></td>
    </tr>`;
  const foot = withVat
    ? footRow("Total fără TVA", total) + footRow("TVA", vat) + footRow("Total cu TVA", total + vat)
    : footRow("Total", total);

  return `<table>
    <thead><tr>
      <th style="width:6%">Nr.</th><th>Denumirea bunurilor / serviciilor</th>
      <th style="width:8%">UM</th><th style="width:10%">Cant.</th>
      <th style="width:14%">Preț unitar</th>${withVat ? '<th style="width:8%">TVA</th>' : ""}<th style="width:16%">Sumă, ${esc(currency)}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>${foot}</tfoot>
  </table>`;
}

/** Înlocuiește marcajul cu tabelul, după randarea normală a câmpurilor. */
export function insertLinesTable(html: string, lines: TableLine[], currency = "MDL"): string {
  if (!html.includes(LINES_TABLE_TOKEN)) return html;
  return html.split(LINES_TABLE_TOKEN).join(buildLinesTable(lines, currency));
}
