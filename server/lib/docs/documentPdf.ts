/**
 * DG-112 — actul, ca PDF.
 *
 * Documentul care ajunge la contraparte trebuie să arate ca un act al organizației: antet cu
 * denumirea, subsol cu numărul actului și „pagina X din Y", tabelul de poziții care se rupe frumos
 * între pagini. O pagină web tipărită se vede de la distanță și strică impresia exact în momentul
 * în care ceri o semnătură.
 *
 * DC-102: randarea NU mai trece prin chromium. Pe Vercel el nu există, deci calea veche întorcea
 * mereu null, iar browserul „fotografia" pagina cu html2canvas — o imagine JPEG tăiată la fiecare
 * 297 mm, fără text de căutat. Acum PDF-ul se scrie direct, ca text vectorial (`pdfDocument.ts`),
 * pe server: același fișier ajunge în descărcare, în e-mail, în ZIP și în atașamentul cererii.
 *
 * HTML-ul tipăribil rămâne — previzualizarea și exportul pentru Word îl folosesc.
 */
import { logoDataUrl } from "../par/orgLogo";
import { MODERN_PALETTE, renderDocumentPdfBuffer, type DocStyle } from "./pdfDocument";
import { blankUnresolved } from "./blanks";

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
  /** CRM-D03: „modern" pentru actele către clienții CRM; implicit „classic". */
  style?: DocStyle;
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
    /* Aceeași familie ca PDF-ul: Tinos e metric-compatibil cu Times New Roman, deci rândurile se
       rup în același loc în ambele fișiere. Word are Times pe orice mașină; Tinos e rezerva. */
    font-family: "Times New Roman", Tinos, "Liberation Serif", Georgia, serif;
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
  /* Antetul organizației: aceeași bandă subțire ca în PDF, deasupra titlului. */
  .doc-head { display: flex; align-items: center; gap: 8pt; border-bottom: .5pt solid #bbb;
              padding-bottom: 5pt; margin-bottom: 10pt; }
  .doc-head img { height: 34px; width: auto; }
  .doc-head span { font-size: 9pt; color: #555; }
`;

/**
 * CRM-D03 — stilul modern, în HTML (previzualizare + fișierul Word). Aceleași culori ca PDF-ul
 * (`MODERN_PALETTE`), ca cele trei fișiere să arate ca același act.
 */
const P = MODERN_PALETTE;
const MODERN_STYLES = `
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Onest, Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.5;
         color: ${P.ink}; margin: 0; }
  h1 { font-size: 20pt; color: ${P.accent}; margin: 0 0 6pt; padding-bottom: 6pt;
       border-bottom: 2.5pt solid ${P.accent}; }
  h2 { font-size: 12.5pt; color: ${P.accent}; margin: 14pt 0 6pt; padding-bottom: 3pt;
       border-bottom: .6pt solid ${P.grid}; }
  h3 { font-size: 11pt; color: ${P.headFill}; margin: 10pt 0 4pt; }
  p { margin: 0 0 6pt; text-align: justify; }
  ul, ol { margin: 0 0 7pt 18pt; }
  hr { border: none; border-top: 1px solid ${P.grid}; margin: 12pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  td, th { border-bottom: .5pt solid ${P.grid}; padding: 5pt 6pt; vertical-align: top; text-align: left; }
  thead th { background: ${P.headFill}; color: ${P.headText}; }
  tbody tr:nth-child(even) td { background: ${P.zebra}; }
  table[data-role="meta"] td { padding: 5pt 8pt; }
  table[data-role="meta"] td:first-child { width: 32%; background: ${P.metaFill}; color: ${P.headFill}; font-weight: 700; }
  table[data-role="meta"] tr:nth-child(even) td:not(:first-child) { background: none; }
  table[data-role="signatures"] { margin-top: 18pt; page-break-inside: avoid; }
  table[data-role="signatures"] td { border: none; background: none !important; width: 50%; padding: 4pt 12pt 4pt 0; }
  .doc-meta { font-size: 8.5pt; color: ${P.muted}; text-align: right; margin-bottom: 8pt; }
  .doc-head { display: flex; align-items: center; gap: 8pt; padding-bottom: 5pt; margin-bottom: 12pt; }
  .doc-head img { height: 34px; width: auto; }
  .doc-head span { font-size: 9pt; color: ${P.accent}; font-weight: 700; }
`;

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
  const body = printableBody(doc);
  return `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><title>${escapeHtml(doc.docNumber ?? doc.title)}</title>
<style>${doc.style === "modern" ? MODERN_STYLES : STYLES}</style></head>
<body>${orgHead(org)}${seal}${body}</body></html>`;
}

/**
 * Antetul organizației în varianta HTML. Aici logoul intră ca URL, nu ca data-URL: fișierul ăsta
 * se descarcă și ca .doc, iar Word descarcă imaginile după link — data-URL-urile le ignoră. De
 * aceea logoul stă într-un bucket PUBLIC (vezi `lib/par/orgLogo.ts`).
 */
function orgHead(org: PrintableOrg): string {
  const logo = org.logoUrl ? `<img src="${escapeHtml(org.logoUrl)}" alt="">` : "";
  const name = org.name ? `<span>${escapeHtml(org.name)}</span>` : "";
  return logo || name ? `<div class="doc-head">${logo}${name}</div>` : "";
}

export interface RenderedDocument {
  /** PDF-ul actului. Nu mai poate fi null: nu depinde de niciun binar din mediu. */
  pdf: Buffer;
  /** HTML-ul tipăribil — aceeași sursă, folosită la previzualizare și la exportul pentru Word. */
  html: string;
}

/**
 * Corpul care ajunge în fișier: șablonul completat sau, dacă actul n-are corp, documentul minim.
 * `blankUnresolved` e aplicat AICI, într-un singur loc — altfel un act ar arăta cu acolade sau fără,
 * după butonul apăsat (PDF, Word, previzualizare).
 */
function printableBody(doc: PrintableDocument): string {
  return blankUnresolved(doc.bodyHtml.trim() ? doc.bodyHtml : fallbackBody(doc));
}

/** Doar PDF-ul, pentru căile care nu au nevoie și de HTML (ZIP, e-mail, atașament la cerere). */
export async function renderPrintablePdf(doc: PrintableDocument, org: PrintableOrg): Promise<Buffer> {
  return renderDocumentPdfBuffer(printableBody(doc), {
    docNumber: doc.docNumber,
    title: doc.title,
    docDate: doc.docDate,
    bodyHash: doc.bodyHash,
    orgName: org.name,
    orgLogo: await logoDataUrl(org.logoUrl),
    style: doc.style,
  });
}

export async function renderDocumentPdf(
  doc: PrintableDocument,
  org: PrintableOrg
): Promise<RenderedDocument> {
  return { pdf: await renderPrintablePdf(doc, org), html: buildPrintableHtml(doc, org) };
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
