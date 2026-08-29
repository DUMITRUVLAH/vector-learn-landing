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
  const rows = lines
    .map(
      (l, i) => `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${esc(l.description)}</td>
      <td style="text-align:center">${esc(l.unit)}</td>
      <td style="text-align:right">${l.quantity}</td>
      <td style="text-align:right">${money(l.unitPriceCents)}</td>
      <td style="text-align:right">${money(l.lineTotalCents)}</td>
    </tr>`
    )
    .join("");
  const total = lines.reduce((s, l) => s + l.lineTotalCents, 0);

  return `<table>
    <thead><tr>
      <th style="width:6%">Nr.</th><th>Denumirea bunurilor / serviciilor</th>
      <th style="width:8%">UM</th><th style="width:10%">Cant.</th>
      <th style="width:14%">Preț unitar</th><th style="width:16%">Sumă, ${esc(currency)}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="5" style="text-align:right"><strong>Total</strong></td>
      <td style="text-align:right"><strong>${money(total)}</strong></td>
    </tr></tfoot>
  </table>`;
}

/** Înlocuiește marcajul cu tabelul, după randarea normală a câmpurilor. */
export function insertLinesTable(html: string, lines: TableLine[], currency = "MDL"): string {
  if (!html.includes(LINES_TABLE_TOKEN)) return html;
  return html.split(LINES_TABLE_TOKEN).join(buildLinesTable(lines, currency));
}
