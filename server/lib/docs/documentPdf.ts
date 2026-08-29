/**
 * DG-112 — actul, ca PDF.
 *
 * Documentul care ajunge la contraparte trebuie să arate ca un act al organizației: antet cu
 * denumirea, subsol cu numărul actului și „pagina X din Y", tabelul de poziții care se rupe frumos
 * între pagini. O pagină web tipărită se vede de la distanță și strică impresia exact în momentul
 * în care ceri o semnătură.
 *
 * Randarea folosește Playwright prin `htmlToPdfBuffer` (DOCMERGE-003) — aceeași cale ca facturile,
 * cu fallback curat când chromium lipsește (serverless): apelantul primește null și servește HTML.
 */
import { htmlToPdfBuffer } from "../docmerge/htmlToPdf";

export interface PrintableLine {
  description: string;
  unit: string;
  quantity: number;
  lineTotalCents: number;
}

export interface PrintableDocument {
  docNumber: string | null;
  title: string;
  kind: string;
  docDate: Date;
  bodyHtml: string;
  bodyHash: string | null;
  status: string;
  counterpartyName?: string | null;
  /** Rechizitele înghețate pe act (idno, iban, banca…) — apar în documentul fără șablon. */
  counterpartySnapshot?: Record<string, string> | null;
  currency?: string;
  totalCents?: number;
  /** Folosite doar când actul nu are șablon — vezi `fallbackBody`. */
  lines?: PrintableLine[];
}

export interface PrintableOrg {
  name: string | null;
  logoUrl: string | null;
}

/** Stilurile actului: A4, diacritice, tabel cu antet repetat pe pagini, bloc de semnături unit. */
const STYLES = `
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "DejaVu Serif", "Times New Roman", Georgia, serif;
    font-size: 11.5pt; line-height: 1.45; color: #111; margin: 0;
  }
  h1 { font-size: 15pt; text-align: center; margin: 0 0 10pt; text-transform: uppercase; letter-spacing: .3pt; }
  h2 { font-size: 12.5pt; margin: 14pt 0 6pt; }
  h3 { font-size: 11.5pt; margin: 12pt 0 5pt; }
  p { margin: 0 0 7pt; text-align: justify; }
  ul, ol { margin: 0 0 7pt 18pt; }
  hr { border: none; border-top: 1px solid #999; margin: 12pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0; page-break-inside: auto; }
  thead { display: table-header-group; }   /* antetul se repetă pe fiecare pagină */
  tr { page-break-inside: avoid; }
  td, th { border: 1px solid #999; padding: 4pt 6pt; vertical-align: top; text-align: left; }
  /* Blocul de semnături nu are voie să rămână orfan pe ultima pagină. */
  table:last-of-type { page-break-inside: avoid; }
  .doc-meta { font-size: 8.5pt; color: #666; text-align: right; margin-bottom: 8pt; }
`;

/** Antetul/subsolul Playwright cer HTML propriu, cu clasele lui speciale de numerotare. */
function headerTemplate(org: PrintableOrg): string {
  const logo = org.logoUrl
    ? `<img src="${org.logoUrl}" style="height:9mm;max-width:45mm;object-fit:contain" />`
    : "";
  return `<div style="width:100%;padding:0 16mm;font-family:Helvetica,Arial,sans-serif;font-size:8pt;color:#555;display:flex;align-items:center;justify-content:space-between">
    <span>${escapeHtml(org.name ?? "")}</span>${logo}
  </div>`;
}

function footerTemplate(doc: PrintableDocument): string {
  const label = doc.docNumber ? `${escapeHtml(doc.docNumber)} · ` : "";
  return `<div style="width:100%;padding:0 16mm;font-family:Helvetica,Arial,sans-serif;font-size:8pt;color:#555;display:flex;justify-content:space-between">
    <span>${label}${doc.docDate.toLocaleDateString("ro-MD")}</span>
    <span>pagina <span class="pageNumber"></span> din <span class="totalPages"></span></span>
  </div>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Un act fără șablon (import, derivare, ciornă pornită de la zero) tot trebuie să se poată tipări:
 * altfel „Descarcă PDF" produce o foaie albă, ceea ce arată ca o defecțiune. Compunem atunci un
 * document minim, dar complet: titlu, părți, poziții, total.
 */
function fallbackBody(doc: PrintableDocument): string {
  const currency = doc.currency ?? "MDL";
  const rows = (doc.lines ?? [])
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.description)}</td><td>${escapeHtml(l.unit)}</td><td style="text-align:right">${l.quantity}</td><td style="text-align:right">${(l.lineTotalCents / 100).toFixed(2)}</td></tr>`
    )
    .join("");
  const table = rows
    ? `<table><thead><tr><th>Denumire</th><th>UM</th><th>Cant.</th><th>Sumă</th></tr></thead><tbody>${rows}</tbody></table>`
    : "";
  const total =
    doc.totalCents != null
      ? `<p><strong>Total: ${(doc.totalCents / 100).toFixed(2)} ${escapeHtml(currency)}</strong></p>`
      : "";
  // Un act fără șablon rămâne totuși un DOCUMENT: fără rechizitele părții, e doar o listă de
  // obiecte. De aceea le tipărim din snapshotul înghețat pe act.
  const snap = doc.counterpartySnapshot ?? {};
  const requisites = [
    snap.idno ? `cod fiscal ${escapeHtml(snap.idno)}` : null,
    snap.iban ? `IBAN ${escapeHtml(snap.iban)}` : null,
    snap.banca ? escapeHtml(snap.banca) : null,
    snap.adresa ? escapeHtml(snap.adresa) : null,
  ]
    .filter(Boolean)
    .join(", ");
  const party = doc.counterpartyName
    ? `<p>Contraparte: <strong>${escapeHtml(doc.counterpartyName)}</strong>${requisites ? `, ${requisites}` : ""}</p>`
    : "";
  return `<h1>${escapeHtml(doc.title)}</h1>${party}${table}${total}`;
}

/**
 * Pagina completă, gata de tipărit. E și fallback-ul servit când chromium lipsește — de aceea
 * conține tot ce trebuie ca un „Print" din browser să dea același rezultat.
 */
export function buildPrintableHtml(doc: PrintableDocument, org: PrintableOrg): string {
  const seal = doc.bodyHash
    ? `<div class="doc-meta">Amprentă document: ${escapeHtml(doc.bodyHash.slice(0, 16))}…</div>`
    : "";
  const body = doc.bodyHtml.trim() ? doc.bodyHtml : fallbackBody(doc);
  return `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><title>${escapeHtml(doc.docNumber ?? doc.title)}</title>
<style>${STYLES}</style></head>
<body>${seal}${body}</body></html>`;
}

export interface RenderedDocument {
  /** PDF-ul, sau null când Playwright/chromium nu e disponibil. */
  pdf: Uint8Array | null;
  /** HTML-ul tipăribil — servit ca fallback, tot el a stat la baza PDF-ului. */
  html: string;
}

export async function renderDocumentPdf(
  doc: PrintableDocument,
  org: PrintableOrg
): Promise<RenderedDocument> {
  const html = buildPrintableHtml(doc, org);
  const pdf = await htmlToPdfBuffer(html, {
    headerTemplate: headerTemplate(org),
    footerTemplate: footerTemplate(doc),
    displayHeaderFooter: true,
    margin: { top: "24mm", right: "16mm", bottom: "22mm", left: "16mm" },
  });
  return { pdf, html };
}

/** Nume de fișier lizibil pentru descărcare: „ACT-2026-0007_Tehnica-Noua.pdf". */
export function pdfFileName(doc: PrintableDocument, counterparty: string | null): string {
  const base = doc.docNumber ?? doc.title;
  const party = counterparty ? `_${counterparty}` : "";
  return `${base}${party}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120)
    .concat(".pdf");
}
