/**
 * PAR-FIN-003: built-in "Act de predare-primire" (handover act) HTML template,
 * rendered from a PAR's data. Used by the PAR → DocMerge act flow.
 *
 * Kept as a self-contained HTML string (semantic, print-friendly) so it can go
 * straight to htmlToPdfBuffer. Values are escaped before substitution.
 */

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;"); // defense-in-depth: cover single-quoted attribute contexts too
}

export interface ActContext {
  orgName: string;
  requestNo: string;
  date: string; // formatted DD.MM.YYYY
  payeeName: string;
  payeeIdnp: string;
  payeeIban: string;
  endUse: string;
  totalFormatted: string; // e.g. "5 040,00 MDL"
  lines: { description: string; qty: number; total: string }[];
}

/** Render the handover act to a complete, print-ready HTML document. */
export function renderActHtml(ctx: ActContext): string {
  const rows = ctx.lines.length
    ? ctx.lines
        .map(
          (l, i) => `<tr>
            <td>${i + 1}</td>
            <td>${esc(l.description)}</td>
            <td class="num">${esc(l.qty)}</td>
            <td class="num">${esc(l.total)}</td>
          </tr>`
        )
        .join("")
    : `<tr><td>1</td><td>${esc(ctx.endUse || "Conform cererii")}</td><td class="num">1</td><td class="num">${esc(ctx.totalFormatted)}</td></tr>`;

  return `<!doctype html>
<html lang="ro"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 40px; font-size: 13px; line-height: 1.5; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
  .sub { text-align: center; color: #555; margin-bottom: 28px; }
  .meta { margin-bottom: 20px; }
  .meta div { margin-bottom: 4px; }
  .meta strong { display: inline-block; min-width: 160px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
  th { background: #f3f4f6; }
  td.num, th.num { text-align: right; }
  .total { text-align: right; font-weight: bold; margin-top: 8px; font-size: 14px; }
  .sign { display: flex; justify-content: space-between; margin-top: 56px; }
  .sign div { width: 45%; }
  .sign .line { border-top: 1px solid #1a1a1a; margin-top: 48px; padding-top: 6px; text-align: center; color: #555; }
</style></head>
<body>
  <h1>ACT DE PREDARE-PRIMIRE</h1>
  <div class="sub">la cererea de plată ${esc(ctx.requestNo)} · ${esc(ctx.date)}</div>

  <div class="meta">
    <div><strong>Predător (organizația):</strong> ${esc(ctx.orgName)}</div>
    <div><strong>Primitor (beneficiar):</strong> ${esc(ctx.payeeName)}</div>
    ${ctx.payeeIdnp ? `<div><strong>IDNP/IDNO:</strong> ${esc(ctx.payeeIdnp)}</div>` : ""}
    ${ctx.payeeIban ? `<div><strong>IBAN:</strong> ${esc(ctx.payeeIban)}</div>` : ""}
    ${ctx.endUse ? `<div><strong>Destinație:</strong> ${esc(ctx.endUse)}</div>` : ""}
  </div>

  <p>Prin prezentul act, părțile confirmă predarea-primirea bunurilor/serviciilor de mai jos:</p>

  <table>
    <thead><tr><th>#</th><th>Descriere</th><th class="num">Cant.</th><th class="num">Valoare</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="total">Total: ${esc(ctx.totalFormatted)}</div>

  <div class="sign">
    <div><div class="line">Predător (semnătură, ștampilă)</div></div>
    <div><div class="line">Primitor (semnătură)</div></div>
  </div>
</body></html>`;
}
