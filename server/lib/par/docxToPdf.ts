/**
 * DOCX → PDF, pentru dosarul PAR.
 *
 * De ce: dosarul lipea doar PDF-urile și imaginile; pentru un .docx („ACT DE PRIMIRE PREDARE
 * …docx" — forma în care sosesc aproape toate actele de recepție) scria o pagină-notă „descărcați-l
 * separat din cerere". Un dosar care trimite contabila sau auditorul să caute actul în altă parte
 * nu e dosar complet: actul trebuie să fie ÎN PDF.
 *
 * De ce conversie proprie și nu LibreOffice (`soffice --convert-to pdf`): prod-ul rulează
 * serverless pe Vercel, unde nu există binare de sute de MB. Deci citim WordprocessingML direct
 * (jszip, deja dependință) și scriem cu pdfmake + Tinos — EXACT calea fișei aprobărilor și a
 * formularului PAR, deci documentul convertit are diacriticele românești întregi („recepție",
 * nu „receptie") și arată ca restul dosarului.
 *
 * Ce păstrează: paragrafe, bold/italic, mărimi, titluri, aliniere, indentare, liste, întreruperi
 * de linie, tabele (lățimi din `w:gridCol`, celule întinse cu `w:gridSpan`) și imaginile inline
 * PNG/JPEG (ștampile, semnături scanate).
 * Ce NU păstrează: fontul original (totul devine Tinos), culorile, anteturile/subsolurile paginii,
 * casetele de text. E o redare fidelă a CONȚINUTULUI, nu o copie tipografică — prima linie a
 * paginii o spune explicit, ca nimeni să nu confunde conversia cu originalul semnat.
 */
import { DOC_FONT_FAMILY } from "../docs/pdfFonts";
import { renderDosarPagesPdf } from "./dosarPdf";

// ─── Modelul intermediar (parsarea WordprocessingML) ─────────────────────────

export type DocxAlign = "left" | "center" | "right" | "both";

export interface DocxRun {
  text: string;
  bold: boolean;
  italic: boolean;
  size: number;
}

export interface DocxImageRef {
  /** r:embed din `<a:blip>` — cheia din word/_rels/document.xml.rels */
  relId: string;
  widthPt: number;
  heightPt: number;
}

export interface DocxParagraph {
  kind: "p";
  runs: DocxRun[];
  align: DocxAlign;
  /** Indentare stânga, în puncte. */
  indent: number;
  bullet: boolean;
  /** Spațiu suplimentar înainte de paragraf, în puncte (titlurile respiră). */
  spaceBefore: number;
  /** Spațiu după paragraf, în puncte (`w:spacing w:after`). */
  spaceAfter: number;
  images: DocxImageRef[];
}

export interface DocxCell {
  text: string;
  bold: boolean;
  /** `w:gridSpan` — câte coloane ocupă celula. */
  span: number;
}

export interface DocxTable {
  kind: "table";
  rows: DocxCell[][];
  /** Lățimi relative din `<w:gridCol w:w>` (twips). Gol = coloane egale. */
  colWidths: number[];
}

export type DocxBlock = DocxParagraph | DocxTable;

export interface DocxContent {
  blocks: DocxBlock[];
  /** relId → bytes, doar PNG/JPEG (singurele pe care pdf-lib le poate încorpora). */
  images: Map<string, Uint8Array>;
}

const DEFAULT_SIZE = 11;
/** 914400 EMU = 1 inch = 72 pt. */
const EMU_PER_PT = 12700;
/** Word măsoară indentările în twips: 1440 twips = 1 inch = 72 pt. */
const TWIPS_PER_PT = 20;

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function attrOf(tag: string, name: string): string | undefined {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m?.[1];
}

/**
 * Citește elementul XML care începe la `start`, cu tot cu copiii lui (nested-safe).
 * Regex-urile simple nu ajung: `<w:tbl>` conține `<w:p>`, iar un `<w:tc>` poate conține alt tabel.
 */
function readElement(
  xml: string,
  start: number,
  name: string
): { openTag: string; inner: string; end: number } | null {
  const openEnd = xml.indexOf(">", start);
  if (openEnd === -1) return null;
  const openTag = xml.slice(start, openEnd + 1);
  if (openTag.endsWith("/>")) return { openTag, inner: "", end: openEnd + 1 };

  const openRe = new RegExp(`<${name}(?=[\\s>/])`, "g");
  const closeTag = `</${name}>`;
  let depth = 1;
  let i = openEnd + 1;
  while (depth > 0) {
    const nextClose = xml.indexOf(closeTag, i);
    if (nextClose === -1) return { openTag, inner: xml.slice(openEnd + 1), end: xml.length };
    openRe.lastIndex = i;
    const m = openRe.exec(xml);
    if (m && m.index < nextClose) {
      // Copil cu același nume; dacă e self-closing nu deschide nimic.
      const childOpenEnd = xml.indexOf(">", m.index);
      if (childOpenEnd !== -1 && !xml.slice(m.index, childOpenEnd + 1).endsWith("/>")) depth++;
      i = childOpenEnd === -1 ? m.index + name.length + 1 : childOpenEnd + 1;
      continue;
    }
    depth--;
    i = nextClose + closeTag.length;
    if (depth === 0) return { openTag, inner: xml.slice(openEnd + 1, nextClose), end: i };
  }
  return null;
}

/** Prima apariție a elementului `name` în `xml` (fără să coboare în alte ramuri). */
function firstElement(xml: string, name: string): { openTag: string; inner: string } | null {
  const m = new RegExp(`<${name}(?=[\\s>/])`).exec(xml);
  if (!m) return null;
  const el = readElement(xml, m.index, name);
  return el ? { openTag: el.openTag, inner: el.inner } : null;
}

/** `<w:b/>`, `<w:b w:val="1"/>` = pornit; `w:val="0"/"false"/"none"` = oprit. */
function toggleOn(xml: string | null, name: string): boolean {
  if (!xml) return false;
  const m = new RegExp(`<${name}(?=[\\s/>])([^>]*)>`).exec(xml);
  if (!m) return false;
  const val = attrOf(m[1], "w:val");
  return !(val === "0" || val === "false" || val === "off" || val === "none");
}

function parseRun(inner: string, baseSize: number, baseBold: boolean): { run: DocxRun; images: DocxImageRef[] } {
  const rPr = firstElement(inner, "w:rPr")?.inner ?? null;
  const szRaw = rPr ? attrOf(firstElement(rPr, "w:sz")?.openTag ?? "", "w:val") : undefined;
  const size = szRaw ? Math.max(6, Math.min(48, Number(szRaw) / 2)) : baseSize;
  const run: DocxRun = {
    text: "",
    bold: baseBold || toggleOn(rPr, "w:b"),
    italic: toggleOn(rPr, "w:i"),
    size,
  };
  const images: DocxImageRef[] = [];

  // Conținutul rulării, în ordinea din document: text, tab, break, desen.
  const re = /<w:(t|tab|br|cr|drawing|object)(?=[\s>/])/g;
  let i = 0;
  for (;;) {
    re.lastIndex = i;
    const m = re.exec(inner);
    if (!m) break;
    const tag = `w:${m[1]}`;
    const el = readElement(inner, m.index, tag);
    if (!el) break;
    i = el.end;
    if (m[1] === "t") run.text += decodeEntities(el.inner);
    else if (m[1] === "tab") run.text += "    ";
    else if (m[1] === "br" || m[1] === "cr") run.text += "\n";
    else {
      const blip = firstElement(el.inner, "a:blip")?.openTag ?? "";
      const relId = attrOf(blip, "r:embed") ?? attrOf(blip, "r:link");
      if (relId) {
        const extent = firstElement(el.inner, "wp:extent")?.openTag ?? "";
        const cx = Number(attrOf(extent, "cx") ?? 0);
        const cy = Number(attrOf(extent, "cy") ?? 0);
        images.push({
          relId,
          widthPt: cx > 0 ? cx / EMU_PER_PT : 0,
          heightPt: cy > 0 ? cy / EMU_PER_PT : 0,
        });
      }
    }
  }
  return { run, images };
}

/**
 * Word taie frecvent un cuvânt în mai multe rulări (rsid, corector, un caracter cu altă formatare),
 * fără spațiu între ele; pdfmake tratează fiecare rulare ca fragment inline separat și poate rupe
 * rândul între ele, adică fix în mijlocul cuvântului.
 *
 * Deci lipim rulările ori de câte ori între ele NU e spațiu — unitatea de rând e cuvântul, nu
 * rularea. Când formatările diferă, câștigă cea a fragmentului cu care începe cuvântul: se pierde
 * un bold pe o virgulă lipită de cuvânt, dar niciun cuvânt nu se rupe în două.
 */
function mergeRuns(runs: DocxRun[]): DocxRun[] {
  const out: DocxRun[] = [];
  for (const run of runs) {
    const prev = out[out.length - 1];
    if (!prev || !prev.text || !run.text) {
      out.push({ ...run });
      continue;
    }
    const sameFormat =
      prev.bold === run.bold && prev.italic === run.italic && prev.size === run.size;
    const glued = !/\s$/.test(prev.text) && !/^\s/.test(run.text);
    if (sameFormat || glued) {
      prev.text += run.text;
      continue;
    }
    out.push({ ...run });
  }
  return out;
}

function parseParagraph(inner: string): DocxParagraph {
  // Proprietățile paragrafului se decupează din corp, ca să nu fie citite ca text.
  let props = "";
  let body = inner;
  const pPrAt = /<w:pPr(?=[\s>/])/.exec(inner);
  if (pPrAt) {
    const el = readElement(inner, pPrAt.index, "w:pPr");
    if (el) {
      props = el.inner;
      body = inner.slice(0, pPrAt.index) + inner.slice(el.end);
    }
  }
  const style = attrOf(firstElement(props, "w:pStyle")?.openTag ?? "", "w:val") ?? "";
  const headingLevel = /^(heading|titlu|title)/i.test(style)
    ? Number(/(\d+)/.exec(style)?.[1] ?? 1)
    : 0;

  const jc = attrOf(firstElement(props, "w:jc")?.openTag ?? "", "w:val") ?? "left";
  const align: DocxAlign =
    jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : jc === "both" ? "both" : "left";

  const indTag = firstElement(props, "w:ind")?.openTag ?? "";
  const indTwips = Number(attrOf(indTag, "w:left") ?? attrOf(indTag, "w:start") ?? 0);
  const indent = Number.isFinite(indTwips) ? Math.max(0, Math.min(180, indTwips / TWIPS_PER_PT)) : 0;

  // `w:spacing` e în twips; plafonat, ca un document cu spațieri uriașe să nu umple dosarul.
  const spacingTag = firstElement(props, "w:spacing")?.openTag ?? "";
  const spacingPt = (name: string) => {
    const raw = Number(attrOf(spacingTag, name) ?? 0);
    return Number.isFinite(raw) ? Math.max(0, Math.min(14, raw / TWIPS_PER_PT)) : 0;
  };

  const bullet = !!firstElement(props, "w:numPr");
  const baseBold = headingLevel > 0 || toggleOn(firstElement(props, "w:rPr")?.inner ?? null, "w:b");
  const baseSize = headingLevel > 0 ? Math.max(12, 18 - headingLevel * 2) : DEFAULT_SIZE;

  // Rulările se citesc din tot corpul paragrafului, inclusiv din `<w:hyperlink>`.
  const runs: DocxRun[] = [];
  const images: DocxImageRef[] = [];
  const re = /<w:r(?=[\s>/])/g;
  let i = 0;
  for (;;) {
    re.lastIndex = i;
    const m = re.exec(body);
    if (!m) break;
    const el = readElement(body, m.index, "w:r");
    if (!el) break;
    i = el.end;
    const parsed = parseRun(el.inner, baseSize, baseBold);
    if (parsed.run.text) runs.push(parsed.run);
    images.push(...parsed.images);
  }

  return {
    kind: "p",
    runs: mergeRuns(runs),
    align,
    indent,
    bullet,
    spaceBefore: Math.max(headingLevel > 0 ? 10 : 0, spacingPt("w:before")),
    spaceAfter: spacingPt("w:after"),
    images,
  };
}

function paragraphText(p: DocxParagraph): string {
  return p.runs.map((r) => r.text).join("").replace(/\s+/g, " ").trim();
}

function parseTable(inner: string): DocxTable {
  const colWidths: number[] = [];
  const grid = firstElement(inner, "w:tblGrid")?.inner ?? "";
  const colRe = /<w:gridCol(?=[\s>/])([^>]*)>/g;
  for (;;) {
    const m = colRe.exec(grid);
    if (!m) break;
    colWidths.push(Number(attrOf(m[1], "w:w") ?? 0));
  }

  const rows: DocxCell[][] = [];
  const rowRe = /<w:tr(?=[\s>/])/g;
  let i = 0;
  for (;;) {
    rowRe.lastIndex = i;
    const m = rowRe.exec(inner);
    if (!m) break;
    const rowEl = readElement(inner, m.index, "w:tr");
    if (!rowEl) break;
    i = rowEl.end;

    const cells: DocxCell[] = [];
    const cellRe = /<w:tc(?=[\s>/])/g;
    let j = 0;
    for (;;) {
      cellRe.lastIndex = j;
      const cm = cellRe.exec(rowEl.inner);
      if (!cm) break;
      const cellEl = readElement(rowEl.inner, cm.index, "w:tc");
      if (!cellEl) break;
      j = cellEl.end;
      const tcPr = firstElement(cellEl.inner, "w:tcPr")?.inner ?? "";
      const span = Number(attrOf(firstElement(tcPr, "w:gridSpan")?.openTag ?? "", "w:val") ?? 1) || 1;
      const paras = parseBlocks(cellEl.inner).filter((b): b is DocxParagraph => b.kind === "p");
      cells.push({
        text: paras.map(paragraphText).filter(Boolean).join("\n"),
        bold: paras.some((p) => p.runs.length > 0 && p.runs.every((r) => r.bold)),
        span,
      });
    }
    if (cells.length) rows.push(cells);
  }
  return { kind: "table", rows, colWidths };
}

/** Paragrafele și tabelele de la primul nivel al unui corp (body sau celulă). */
function parseBlocks(xml: string): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  const re = /<w:(p|tbl)(?=[\s>/])/g;
  let i = 0;
  for (;;) {
    re.lastIndex = i;
    const m = re.exec(xml);
    if (!m) break;
    const name = `w:${m[1]}`;
    const el = readElement(xml, m.index, name);
    if (!el) break;
    i = el.end;
    blocks.push(m[1] === "p" ? parseParagraph(el.inner) : parseTable(el.inner));
  }
  return blocks;
}

/**
 * Despachetează un .docx și întoarce conținutul lui structurat.
 * Aruncă dacă arhiva nu e un document Word (fără `word/document.xml`) — apelantul
 * revine atunci la pagina-notă, ca până acum.
 */
export async function parseDocx(buf: Uint8Array): Promise<DocxContent> {
  const { default: JSZip } = (await import("jszip")) as { default: typeof import("jszip") };
  const zip = await JSZip.loadAsync(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("nu e un .docx (lipsește word/document.xml)");
  const xml = await docFile.async("string");
  const body = firstElement(xml, "w:body")?.inner ?? xml;
  const blocks = parseBlocks(body);

  // Imaginile inline: rels → word/media/*. Doar PNG/JPEG; restul (EMF/WMF/SVG) se ignoră.
  const images = new Map<string, Uint8Array>();
  const relsFile = zip.file("word/_rels/document.xml.rels");
  if (relsFile) {
    const relsXml = await relsFile.async("string");
    const relRe = /<Relationship(?=[\s>/])([^>]*)>/g;
    for (;;) {
      const m = relRe.exec(relsXml);
      if (!m) break;
      const id = attrOf(m[1], "Id");
      const target = attrOf(m[1], "Target");
      if (!id || !target || !/\.(png|jpe?g)$/i.test(target)) continue;
      const path = target.startsWith("/")
        ? target.slice(1)
        : `word/${target.replace(/^\.\//, "")}`;
      const file = zip.file(path);
      if (!file) continue;
      images.set(id, new Uint8Array(await file.async("uint8array")));
    }
  }

  return { blocks, images };
}


// ─── Redarea ca PDF (pdfmake + Tinos, aceeași cale ca fișa aprobărilor) ──────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfNode = Record<string, any>;

const INK = "#1a1a1a";
const MUTED = "#5b6472";
const RULE = "#c9ced8";
/** A4 (595pt) minus marginile definiției de mai jos. */
const CONTENT_W = 495;

function runNodes(runs: DocxRun[]): PdfNode[] {
  return runs.map((r) => ({
    text: r.text,
    bold: r.bold || undefined,
    italics: r.italic || undefined,
    fontSize: r.size,
  }));
}

function paragraphNode(p: DocxParagraph): PdfNode[] {
  const out: PdfNode[] = [];
  const alignment = p.align === "both" ? "justify" : p.align;

  if (p.runs.length > 0) {
    const text = p.bullet ? [{ text: "•   " }, ...runNodes(p.runs)] : runNodes(p.runs);
    out.push({
      text,
      alignment,
      // [stânga, sus, dreapta, jos] — indentarea din Word devine margine stângă.
      margin: [p.indent, p.spaceBefore, 0, Math.max(p.spaceAfter, 2)],
    });
  } else if (p.images.length === 0) {
    // Paragraf gol: în Word e spațiu vizibil, deci rămâne spațiu și aici.
    out.push({ text: " ", fontSize: DEFAULT_SIZE, margin: [0, 0, 0, 2] });
  }
  return out;
}

function imageNode(img: DocxImageRef, bytes: Uint8Array): PdfNode {
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const b64 = Buffer.from(bytes).toString("base64");
  const node: PdfNode = {
    image: `data:image/${isPng ? "png" : "jpeg"};base64,${b64}`,
    margin: [0, 2, 0, 6],
  };
  if (img.widthPt > 0) node.width = Math.min(img.widthPt, CONTENT_W);
  else node.fit = [CONTENT_W, 700];
  return node;
}

function tableNode(t: DocxTable): PdfNode | null {
  if (t.rows.length === 0) return null;
  const cols = Math.max(...t.rows.map((r) => r.reduce((s, c) => s + c.span, 0)), 1);

  // pdfmake cere ca TOATE rândurile să aibă exact `cols` celule: o celulă întinsă pe mai multe
  // coloane (`w:gridSpan`) se scrie ca `colSpan` urmat de celule goale, iar rândurile scurte se
  // completează. Altfel randarea aruncă și dosarul ar pica din cauza unui singur tabel.
  const body = t.rows.map((row) => {
    const cells: PdfNode[] = [];
    for (const cell of row) {
      cells.push({
        text: cell.text,
        bold: cell.bold || undefined,
        fontSize: 9.5,
        ...(cell.span > 1 ? { colSpan: Math.min(cell.span, cols) } : {}),
      });
      for (let k = 1; k < cell.span && cells.length < cols; k++) cells.push({});
    }
    while (cells.length < cols) cells.push({});
    return cells.slice(0, cols);
  });

  const gridSum = t.colWidths.reduce((s, w) => s + w, 0);
  const widths =
    t.colWidths.length === cols && gridSum > 0
      ? t.colWidths.map((w) => (w / gridSum) * CONTENT_W)
      : Array.from({ length: cols }, () => "*");

  return {
    table: { body, widths, dontBreakRows: false },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => RULE,
      vLineColor: () => RULE,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 2, 0, 8],
  };
}

export interface DocxPdfOptions {
  /** Numele fișierului original — apare discret în antetul primei pagini. */
  fileName?: string;
}

/** Definiția pdfmake a documentului convertit. Exportată separat ca să poată fi testată. */
export function buildDocxDefinition(content: DocxContent, opts: DocxPdfOptions = {}): PdfNode {
  const body: PdfNode[] = [
    {
      // Onest din prima linie: e o conversie, nu o fotocopie. Originalul rămâne în cerere.
      text: `Anexă: ${opts.fileName ?? "document.docx"} — convertit automat din DOCX (formatarea poate diferi de original)`,
      fontSize: 8,
      color: MUTED,
      margin: [0, 0, 0, 12],
    },
  ];

  for (const block of content.blocks) {
    if (block.kind === "table") {
      const node = tableNode(block);
      if (node) body.push(node);
      continue;
    }
    body.push(...paragraphNode(block));
    for (const img of block.images) {
      const bytes = content.images.get(img.relId);
      if (bytes) body.push(imageNode(img, bytes));
    }
  }

  return {
    pageSize: "A4",
    pageMargins: [50, 50, 50, 55],
    info: { title: opts.fileName ?? "Anexă DOCX", creator: "FinFlow" },
    defaultStyle: { font: DOC_FONT_FAMILY, fontSize: DEFAULT_SIZE, lineHeight: 1.2, color: INK },
    content: body,
  };
}

/**
 * Un .docx → octeții unui PDF cu același conținut, gata de lipit în dosar.
 * Aruncă dacă fișierul nu e un document Word citibil — apelantul pune atunci pagina-notă.
 */
export async function renderDocxAsPdf(bytes: Uint8Array, opts: DocxPdfOptions = {}): Promise<Buffer> {
  const content = await parseDocx(bytes);
  return renderDosarPagesPdf(buildDocxDefinition(content, opts));
}
