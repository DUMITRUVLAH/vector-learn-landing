/**
 * DC-102 — PDF-ul actului, scris ca text, nu fotografiat.
 *
 * Ce era înainte: pe producție nu există chromium, deci PDF-ul se făcea în browser cu html2canvas
 * — o imagine JPEG a paginii, tăiată la fiecare 297 mm prin mijlocul rândurilor, fără text
 * selectabil, fără antet, fără paginație. Owner-ul a descris rezultatul exact: „parcă e un fișier
 * HTML; Word-ul e ok".
 *
 * Ce e acum: corpul se citește ca structură (`richText.ts`) și se scrie într-un PDF adevărat cu
 * pdfmake — text vectorial, tabele care își repetă antetul la schimbarea paginii, „pagina X din Y"
 * în subsol, aceleași margini și aceeași familie de font ca fișierul Word (Tinos ≡ Times New Roman).
 * Rulează pe server, deci același fișier ajunge și în e-mail, și în ZIP, și în atașamentul cererii
 * de plată — nu doar la cel care a apăsat butonul în browser.
 */
import type { DocBlock, InlineRun, TableCell } from "./richText";
import { parseDocumentHtml } from "./richText";
import { DOC_FONT_FAMILY, pdfFonts } from "./pdfFonts";

/** 1 mm în puncte tipografice. A4 = 210 × 297 mm. */
const MM = 72 / 25.4;

/** Marginile foii — aceleași cu ale previzualizării (`src/lib/docs/printable.ts`). */
export const PAGE_MARGIN_MM = { top: 18, right: 16, bottom: 20, left: 16 } as const;
/** Antetul și subsolul sunt desenate ÎN marginea paginii; de aceea marginea de sus/jos crește. */
const HEADER_BAND_MM = 8;
const FOOTER_BAND_MM = 8;

const A4_WIDTH_PT = 210 * MM;
const CONTENT_WIDTH_PT = A4_WIDTH_PT - (PAGE_MARGIN_MM.left + PAGE_MARGIN_MM.right) * MM;

export interface PdfDocumentMeta {
  docNumber: string | null;
  title: string;
  docDate: Date;
  bodyHash: string | null;
  orgName: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfNode = Record<string, any>;

function runToNode(run: InlineRun): PdfNode {
  const node: PdfNode = { text: run.text };
  if (run.bold) node.bold = true;
  if (run.italics) node.italics = true;
  if (run.underline) node.decoration = "underline";
  if (run.strike) node.decoration = node.decoration ? [node.decoration, "lineThrough"] : "lineThrough";
  if (run.link) {
    node.link = run.link;
    node.color = "#1a4fa0";
  }
  return node;
}

/** Stilurile titlurilor, în oglindă cu CSS-ul din `documentPdf.ts` (fișierul Word). */
const HEADING_STYLE: Record<number, { fontSize: number; marginTop: number; marginBottom: number }> = {
  1: { fontSize: 15, marginTop: 0, marginBottom: 10 },
  2: { fontSize: 12.5, marginTop: 14, marginBottom: 6 },
  3: { fontSize: 11.5, marginTop: 12, marginBottom: 5 },
  4: { fontSize: 11.5, marginTop: 10, marginBottom: 4 },
};

function blockToNode(block: DocBlock): PdfNode | PdfNode[] {
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(block.level ?? 1, 1), 4);
      const style = HEADING_STYLE[level];
      // Titlul principal e scris cu majuscule și în fișierul Word (`text-transform: uppercase`);
      // fără asta, cele două fișiere ar arăta diferit din prima linie.
      const runs = block.runs.map((r) => (level === 1 ? { ...r, text: r.text.toLocaleUpperCase("ro-RO") } : r));
      return {
        text: runs.map(runToNode),
        bold: true,
        fontSize: style.fontSize,
        alignment: block.align ?? (level === 1 ? "center" : "left"),
        margin: [0, style.marginTop, 0, style.marginBottom],
      };
    }
    case "paragraph":
      return {
        text: block.runs.map(runToNode),
        alignment: block.align ?? "justify",
        margin: [0, 0, 0, 7],
      };
    case "list": {
      const items = block.items.map((blocks) => ({ stack: blocks.flatMap(blockToNode) }));
      return block.ordered
        ? { ol: items, margin: [0, 0, 0, 7] }
        : { ul: items, margin: [0, 0, 0, 7] };
    }
    case "table":
      return tableToNode(block.rows, block.headerRows);
    case "rule":
      return {
        margin: [0, 6, 0, 10],
        canvas: [
          { type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH_PT, y2: 0, lineWidth: 0.5, lineColor: "#999999" },
        ],
      };
    case "pageBreak":
      return { text: "", pageBreak: "before" };
  }
}

/** Lățimile coloanelor: prima ia spațiul rămas, restul se strâng după conținut. */
function columnWidths(columnCount: number): (string | number)[] {
  if (columnCount <= 1) return ["*"];
  return ["*", ...Array.from({ length: columnCount - 1 }, () => "auto")];
}

function cellToNode(cell: TableCell, headerRow: boolean): PdfNode {
  const node: PdfNode = {
    stack: cell.blocks.flatMap(blockToNode),
    alignment: cell.align,
  };
  if (cell.colSpan) node.colSpan = cell.colSpan;
  if (cell.rowSpan) node.rowSpan = cell.rowSpan;
  if (headerRow || cell.header) node.bold = true;
  return node;
}

function tableToNode(rows: TableCell[][], headerRows: number): PdfNode {
  const columnCount = Math.max(...rows.map((r) => r.reduce((n, c) => n + (c.colSpan ?? 1), 0)));
  const body = rows.map((row, rowIndex) => {
    const cells: PdfNode[] = [];
    for (const cell of row) {
      cells.push(cellToNode(cell, rowIndex < headerRows));
      // pdfmake cere celule-fantomă după una întinsă pe mai multe coloane.
      for (let i = 1; i < (cell.colSpan ?? 1); i += 1) cells.push({});
    }
    while (cells.length < columnCount) cells.push({});
    return cells;
  });

  return {
    margin: [0, 4, 0, 8],
    table: {
      headerRows,
      // `keepWithHeaderRows` ține antetul lipit de primul rând când tabelul trece pe pagina nouă.
      keepWithHeaderRows: headerRows > 0 ? 1 : 0,
      dontBreakRows: true,
      widths: columnWidths(columnCount),
      body,
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#999999",
      vLineColor: () => "#999999",
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  };
}

function headerNode(meta: PdfDocumentMeta): PdfNode {
  return {
    margin: [PAGE_MARGIN_MM.left * MM, PAGE_MARGIN_MM.top * MM * 0.45, PAGE_MARGIN_MM.right * MM, 0],
    columns: [
      { text: meta.orgName ?? "", fontSize: 8, color: "#555555" },
      {
        text: meta.bodyHash ? `Amprentă: ${meta.bodyHash.slice(0, 16)}…` : "",
        fontSize: 8,
        color: "#888888",
        alignment: "right",
      },
    ],
  };
}

function footerNode(meta: PdfDocumentMeta, page: number, total: number): PdfNode {
  const label = [meta.docNumber, meta.docDate.toLocaleDateString("ro-MD")].filter(Boolean).join(" · ");
  return {
    margin: [PAGE_MARGIN_MM.left * MM, 4, PAGE_MARGIN_MM.right * MM, 0],
    columns: [
      { text: label, fontSize: 8, color: "#555555" },
      { text: `pagina ${page} din ${total}`, fontSize: 8, color: "#555555", alignment: "right" },
    ],
  };
}

/** Definiția completă a documentului — exportată ca să poată fi verificată fără a scrie un PDF. */
export function buildDocDefinition(bodyHtml: string, meta: PdfDocumentMeta): PdfNode {
  const blocks = parseDocumentHtml(bodyHtml);
  const content = blocks.flatMap(blockToNode);
  return {
    pageSize: "A4",
    pageMargins: [
      PAGE_MARGIN_MM.left * MM,
      (PAGE_MARGIN_MM.top + HEADER_BAND_MM) * MM,
      PAGE_MARGIN_MM.right * MM,
      (PAGE_MARGIN_MM.bottom + FOOTER_BAND_MM) * MM,
    ],
    info: {
      title: meta.docNumber ?? meta.title,
      creator: meta.orgName ?? "FinFlow",
    },
    defaultStyle: {
      font: DOC_FONT_FAMILY,
      fontSize: 11.5,
      lineHeight: 1.3,
      alignment: "justify",
    },
    header: () => headerNode(meta),
    footer: (page: number, total: number) => footerNode(meta, page, total),
    content: content.length > 0 ? content : [{ text: meta.title, bold: true, alignment: "center" }],
  };
}

/**
 * Scrie PDF-ul. Aruncă dacă fonturile lipsesc — un act cu diacritice rupte nu e o degradare
 * acceptabilă, e un act pe care nu-l poți trimite nimănui.
 */
export async function renderDocumentPdfBuffer(
  bodyHtml: string,
  meta: PdfDocumentMeta
): Promise<Buffer> {
  // Import târziu: pdfmake trage după el pdfkit + fontkit, care n-au ce căuta pe calea unei cereri
  // care nu produce PDF-uri (vezi lecția exceljs — un import de nivel înalt a picat tot API-ul).
  const { default: PdfPrinter } = await import("pdfmake/src/printer.js");
  const printer = new PdfPrinter(pdfFonts());
  const pdfDoc = printer.createPdfKitDocument(buildDocDefinition(bodyHtml, meta));

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
}
