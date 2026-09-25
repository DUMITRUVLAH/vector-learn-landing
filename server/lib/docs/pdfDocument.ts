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
import { DOC_FONT_FAMILY, MODERN_FONT_FAMILY, hasModernFont, pdfFonts } from "./pdfFonts";

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
  /**
   * Logoul organizației ca data-URL (`lib/par/orgLogo.ts`). pdfmake nu descarcă imagini după URL —
   * vrea octeții. `null` = antetul rămâne exact cum era, doar cu denumirea.
   */
  orgLogo?: string | null;
  /**
   * CRM-D03: „classic" = actul juridic de până acum (Tinos/Times, linii gri, titlu centrat, cu
   * majuscule) — PAR și registrul rămân exact așa. „modern" = oferta și contractul către un client
   * din CRM: Onest, titlu albastru cu linie groasă, secțiuni colorate, tabel cu antet închis și
   * rânduri alternate, fișă-rezumat și semnături în două coloane (după modelul contractelor
   * Vector Academy pe care ownerul le-a dat ca exemplu).
   */
  style?: DocStyle;
}

export type DocStyle = "classic" | "modern";

/** Culorile stilului modern — aceleași ca în HTML-ul de previzualizare (`documentPdf.ts`). */
export const MODERN_PALETTE = {
  ink: "#1F1F1F",
  muted: "#5F6368",
  accent: "#0B57D0",
  headFill: "#1F3A68",
  headText: "#FFFFFF",
  zebra: "#F4F7FC",
  grid: "#D6DCE5",
  metaFill: "#EEF3FB",
} as const;

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

function blockToNode(block: DocBlock, style: DocStyle = "classic"): PdfNode | PdfNode[] {
  const modern = style === "modern";
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(block.level ?? 1, 1), 4);
      if (modern) return modernHeading(block.runs, level, block.align);
      const hs = HEADING_STYLE[level];
      // Titlul principal e scris cu majuscule și în fișierul Word (`text-transform: uppercase`);
      // fără asta, cele două fișiere ar arăta diferit din prima linie.
      const runs = block.runs.map((r) => (level === 1 ? { ...r, text: r.text.toLocaleUpperCase("ro-RO") } : r));
      return {
        text: runs.map(runToNode),
        bold: true,
        fontSize: hs.fontSize,
        alignment: block.align ?? (level === 1 ? "center" : "left"),
        margin: [0, hs.marginTop, 0, hs.marginBottom],
      };
    }
    case "paragraph":
      return {
        text: block.runs.map(runToNode),
        alignment: block.align ?? "justify",
        margin: [0, 0, 0, modern ? 6 : 7],
      };
    case "list": {
      const items = block.items.map((blocks) => ({ stack: blocks.flatMap((b) => blockToNode(b, style)) }));
      return block.ordered
        ? { ol: items, margin: [0, 0, 0, 7] }
        : { ul: items, margin: [0, 0, 0, 7] };
    }
    case "table":
      return modern ? modernTable(block) : tableToNode(block.rows, block.headerRows, style);
    case "rule":
      return {
        margin: [0, 6, 0, 10],
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: CONTENT_WIDTH_PT,
            y2: 0,
            lineWidth: 0.5,
            lineColor: modern ? MODERN_PALETTE.grid : "#999999",
          },
        ],
      };
    case "pageBreak":
      return { text: "", pageBreak: "before" };
  }
}

/** Linie orizontală pe toată lățimea conținutului. */
function hr(lineWidth: number, color: string, margin: number[]): PdfNode {
  return { margin, canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH_PT, y2: 0, lineWidth, lineColor: color }] };
}

/**
 * Titlurile stilului modern: titlul actului mare, albastru, aliniat la stânga, cu o linie groasă
 * dedesubt; secțiunile („1. Ce include oferta") albastre, cu o linie fină — ca în contractele model.
 */
function modernHeading(runs: InlineRun[], level: number, align?: ParagraphAlign): PdfNode[] {
  const text = runs.map(runToNode);
  if (level === 1) {
    return [
      { text, bold: true, fontSize: 20, color: MODERN_PALETTE.accent, alignment: align ?? "left", margin: [0, 0, 0, 4] },
      hr(2.5, MODERN_PALETTE.accent, [0, 2, 0, 10]),
    ];
  }
  if (level === 2) {
    return [
      { text, bold: true, fontSize: 12.5, color: MODERN_PALETTE.accent, alignment: align ?? "left", margin: [0, 12, 0, 2] },
      hr(0.6, MODERN_PALETTE.grid, [0, 1, 0, 6]),
    ];
  }
  return [{ text, bold: true, fontSize: 11, color: MODERN_PALETTE.headFill, alignment: align ?? "left", margin: [0, 8, 0, 4] }];
}

type ParagraphAlign = NonNullable<Extract<DocBlock, { type: "paragraph" | "heading" }>["align"]>;

/** Textul unei celule, pentru a estima ce coloană are nevoie de spațiu. */
function cellText(cell: TableCell): string {
  const walk = (b: DocBlock): string =>
    b.type === "paragraph" || b.type === "heading"
      ? b.runs.map((r) => r.text).join("")
      : b.type === "list"
        ? b.items.flat().map(walk).join(" ")
        : b.type === "table"
          ? b.rows.flat().map(cellText).join(" ")
          : "";
  return cell.blocks.map(walk).join(" ");
}

/**
 * Lățimile coloanelor: coloana cu cel mai mult text ia spațiul rămas, restul se strâng după
 * conținut. Înainte, „*" mergea mereu pe PRIMA coloană — în tabelul pozițiilor asta era „Nr.",
 * deci numărul de ordine lua jumătate din pagină, iar denumirea serviciului se înghesuia.
 */
function columnWidths(rows: TableCell[][], columnCount: number): (string | number)[] {
  if (columnCount <= 1) return ["*"];
  const lengths = new Array(columnCount).fill(0) as number[];
  for (const row of rows) {
    let col = 0;
    for (const cell of row) {
      if ((cell.colSpan ?? 1) === 1 && col < columnCount) lengths[col] = Math.max(lengths[col], cellText(cell).length);
      col += cell.colSpan ?? 1;
    }
  }
  const widest = lengths.indexOf(Math.max(...lengths));
  return lengths.map((_, i) => (i === widest ? "*" : "auto"));
}

function cellToNode(cell: TableCell, headerRow: boolean, style: DocStyle = "classic"): PdfNode {
  const node: PdfNode = {
    // Stilul modern aliniază celulele la stânga: textul „justify" moștenit de la corp întindea
    // cuvintele pe toată lățimea coloanei („Asociația   pentru   Tehnologie…").
    stack: cell.blocks.flatMap((b) =>
      blockToNode(style === "modern" && b.type === "paragraph" && !b.align ? { ...b, align: cell.align ?? "left" } : b, style)
    ),
    alignment: cell.align ?? (style === "modern" ? "left" : undefined),
  };
  if (cell.colSpan) node.colSpan = cell.colSpan;
  if (cell.rowSpan) node.rowSpan = cell.rowSpan;
  if (headerRow || cell.header) node.bold = true;
  return node;
}

function tableBody(rows: TableCell[][], headerRows: number, style: DocStyle, decorate?: (node: PdfNode, row: number, col: number) => void) {
  const columnCount = Math.max(...rows.map((r) => r.reduce((n, c) => n + (c.colSpan ?? 1), 0)));
  const body = rows.map((row, rowIndex) => {
    const cells: PdfNode[] = [];
    let col = 0;
    for (const cell of row) {
      const node = cellToNode(cell, rowIndex < headerRows, style);
      decorate?.(node, rowIndex, col);
      cells.push(node);
      // pdfmake cere celule-fantomă după una întinsă pe mai multe coloane.
      for (let i = 1; i < (cell.colSpan ?? 1); i += 1) cells.push({});
      col += cell.colSpan ?? 1;
    }
    while (cells.length < columnCount) cells.push({});
    return cells;
  });
  return { body, columnCount };
}

function tableToNode(rows: TableCell[][], headerRows: number, style: DocStyle = "classic"): PdfNode {
  const { body, columnCount } = tableBody(rows, headerRows, style);
  return {
    margin: [0, 4, 0, 8],
    table: {
      headerRows,
      // `keepWithHeaderRows` ține antetul lipit de primul rând când tabelul trece pe pagina nouă.
      keepWithHeaderRows: headerRows > 0 ? 1 : 0,
      dontBreakRows: true,
      widths: columnWidths(rows, columnCount),
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

/** Tabelele stilului modern, după rol: fișa-rezumat, semnăturile sau un tabel de date. */
function modernTable(block: Extract<DocBlock, { type: "table" }>): PdfNode {
  const P = MODERN_PALETTE;
  if (block.role === "meta") {
    // Eticheta în stânga pe fond albastru pal, valoarea în dreapta — fișa care spune dintr-o privire
    // cine, cui, cât și până când.
    const { body } = tableBody(block.rows, 0, "modern", (node, _row, col) => {
      if (col === 0) {
        node.fillColor = P.metaFill;
        node.bold = true;
        node.color = P.headFill;
      }
    });
    return {
      margin: [0, 2, 0, 12],
      table: { widths: ["32%", "*"], body, dontBreakRows: true },
      layout: {
        hLineWidth: () => 0.6,
        vLineWidth: () => 0,
        hLineColor: () => P.grid,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 5,
        paddingBottom: () => 5,
      },
    };
  }
  if (block.role === "signatures") {
    const { body, columnCount } = tableBody(block.rows, 0, "modern");
    return {
      margin: [0, 18, 0, 0],
      unbreakable: true,
      table: { widths: Array.from({ length: columnCount }, () => "*"), body },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: (i: number) => (i === 0 ? 0 : 12),
        paddingRight: () => 12,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
    };
  }
  // Tabel de date (pozițiile): antet închis cu text alb, rânduri alternate, fără linii verticale.
  const headerRows = block.headerRows;
  const { body, columnCount } = tableBody(block.rows, headerRows, "modern", (node, row) => {
    if (row < headerRows) {
      node.fillColor = P.headFill;
      node.color = P.headText;
    } else if ((row - headerRows) % 2 === 1) {
      node.fillColor = P.zebra;
    }
  });
  return {
    margin: [0, 4, 0, 10],
    table: {
      headerRows,
      keepWithHeaderRows: headerRows > 0 ? 1 : 0,
      dontBreakRows: true,
      widths: columnWidths(block.rows, columnCount),
      body,
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0.8 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => P.grid,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  };
}

/** Înălțimea logoului din antet, în puncte: cât două rânduri de 8pt, ca banda să nu se umfle. */
const HEADER_LOGO_PT = 18;

function headerNode(meta: PdfDocumentMeta): PdfNode {
  const modern = meta.style === "modern";
  // Logoul stă în stânga, lipit de denumire — antetul rămâne o singură bandă subțire, nu un cap
  // de scrisoare care fură din corpul actului.
  const identity: PdfNode = meta.orgLogo
    ? {
        columns: [
          { width: "auto", image: meta.orgLogo, fit: [HEADER_LOGO_PT * 3, HEADER_LOGO_PT], margin: [0, -4, 6, 0] },
          { width: "*", text: meta.orgName ?? "", fontSize: 8, color: modern ? MODERN_PALETTE.accent : "#555555", bold: modern, margin: [0, 1, 0, 0] },
        ],
        columnGap: 0,
      }
    : { text: meta.orgName ?? "", fontSize: 8, color: modern ? MODERN_PALETTE.accent : "#555555", bold: modern };

  return {
    margin: [PAGE_MARGIN_MM.left * MM, PAGE_MARGIN_MM.top * MM * 0.45, PAGE_MARGIN_MM.right * MM, 0],
    columns: [
      identity,
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
  // Fără fișierele Onest (un build vechi), actul modern își păstrează culorile pe Tinos — nu pică.
  const modern = meta.style === "modern";
  const style: DocStyle = modern ? "modern" : "classic";
  const content = blocks.flatMap((b) => blockToNode(b, style));
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
    defaultStyle: modern
      ? {
          font: hasModernFont() ? MODERN_FONT_FAMILY : DOC_FONT_FAMILY,
          fontSize: 10.5,
          lineHeight: 1.35,
          color: MODERN_PALETTE.ink,
          alignment: "justify",
        }
      : {
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
