/**
 * DC-102 — corpul actului, citit ca structură, nu ca șir de HTML.
 *
 * PDF-ul actului se făcea fotografiind pagina (html2canvas): ieșea o imagine JPEG, tăiată la
 * fiecare 297 mm în mijlocul rândului, fără text de căutat sau copiat. Ca să scriem un PDF adevărat
 * (text vectorial, tabel care se rupe între pagini, antet și subsol) avem nevoie întâi de STRUCTURA
 * documentului: titluri, paragrafe, liste, tabele.
 *
 * Nu e un parser HTML general și nu are voie să devină unul: acceptă exact subsetul pe care
 * `sanitizeHtml.ts` îl lasă să treacă (aceleași etichete, aceleași atribute). Orice altceva se
 * ignoră, dar TEXTUL dinăuntru se păstrează — un act din care dispar cuvinte e mai rău decât unul
 * cu o formatare pierdută.
 */

export type Align = "left" | "center" | "right" | "justify";

export interface InlineRun {
  text: string;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: string;
}

export interface ParagraphBlock {
  type: "paragraph" | "heading";
  /** 1–4 pentru titluri; absent la paragrafe. */
  level?: number;
  align?: Align;
  runs: InlineRun[];
}

export interface ListBlock {
  type: "list";
  ordered: boolean;
  items: DocBlock[][];
}

export interface TableCell {
  blocks: DocBlock[];
  header?: boolean;
  colSpan?: number;
  rowSpan?: number;
  align?: Align;
}

export interface TableBlock {
  type: "table";
  rows: TableCell[][];
  /** Numărul de rânduri de antet — se repetă pe fiecare pagină. */
  headerRows: number;
}

export interface RuleBlock {
  type: "rule";
}

export interface PageBreakBlock {
  type: "pageBreak";
}

export type DocBlock = ParagraphBlock | ListBlock | TableBlock | RuleBlock | PageBreakBlock;

// ─── 1. HTML → arbore ────────────────────────────────────────────────────────

interface ElementNode {
  kind: "element";
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
}
interface TextNode {
  kind: "text";
  text: string;
}
type Node = ElementNode | TextNode;

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link"]);
/** Conținutul lor nu e text de document. */
const DROP_TAGS = new Set(["script", "style", "head", "title", "noscript", "template"]);

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  bdquo: "„", ldquo: "“", rdquo: "”", sbquo: "‚", lsquo: "‘", rsquo: "’",
  deg: "°", euro: "€", middot: "·", bull: "•", times: "×", copy: "©",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    attrs[m[1].toLowerCase()] = decodeEntities(value);
  }
  return attrs;
}

/** HTML (subsetul actului) → arbore. Etichetele neînchise nu rup documentul: se închid la final. */
export function parseHtmlTree(html: string): ElementNode {
  const root: ElementNode = { kind: "element", tag: "root", attrs: {}, children: [] };
  const stack: ElementNode[] = [root];
  const tokenRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!?\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  let dropDepth = 0;

  while ((m = tokenRe.exec(html))) {
    const [whole, tagName, rawAttrs, text] = m;
    if (text !== undefined) {
      if (dropDepth === 0) stack[stack.length - 1].children.push({ kind: "text", text });
      continue;
    }
    if (!tagName) continue; // comentariu, doctype, CDATA
    const tag = tagName.toLowerCase();
    const closing = whole.startsWith("</");
    const selfClosing = /\/\s*>$/.test(whole) || VOID_TAGS.has(tag);

    if (DROP_TAGS.has(tag)) {
      if (closing) dropDepth = Math.max(0, dropDepth - 1);
      else if (!selfClosing) dropDepth += 1;
      continue;
    }
    if (dropDepth > 0) continue;

    if (closing) {
      // Închide până la eticheta cerută; dacă nu e deschisă, se ignoră (HTML din realitate).
      const idx = [...stack].reverse().findIndex((n) => n.tag === tag);
      if (idx >= 0 && stack.length - 1 - idx > 0) stack.length = stack.length - 1 - idx;
      continue;
    }

    const node: ElementNode = { kind: "element", tag, attrs: parseAttrs(rawAttrs ?? ""), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

// ─── 2. Arbore → blocuri ─────────────────────────────────────────────────────

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: string;
}

const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "hr", "blockquote", "body", "root",
]);

function alignOf(node: ElementNode): Align | undefined {
  const explicit = node.attrs["data-align"];
  const style = node.attrs["style"] ?? "";
  const fromStyle = /text-align\s*:\s*(left|right|center|justify)/i.exec(style)?.[1];
  const value = (explicit || fromStyle || "").toLowerCase();
  return value === "left" || value === "right" || value === "center" || value === "justify"
    ? (value as Align)
    : undefined;
}

/** Spațiile din HTML sunt colapsate, ca în browser — altfel indentarea sursei ajunge în PDF. */
function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, " ");
}

function collectRuns(nodes: Node[], style: InlineStyle, out: InlineRun[]): void {
  for (const node of nodes) {
    if (node.kind === "text") {
      const text = normalizeSpace(decodeEntities(node.text));
      if (text) out.push({ text, ...style });
      continue;
    }
    if (node.tag === "br") {
      out.push({ text: "\n", ...style });
      continue;
    }
    const next: InlineStyle = { ...style };
    if (node.tag === "strong" || node.tag === "b") next.bold = true;
    if (node.tag === "em" || node.tag === "i") next.italics = true;
    if (node.tag === "u") next.underline = true;
    if (node.tag === "s" || node.tag === "strike" || node.tag === "del") next.strike = true;
    if (node.tag === "a" && node.attrs.href) next.link = node.attrs.href;
    collectRuns(node.children, next, out);
  }
}

/** Curăță spațiile de la capete și unește bucățile identice ca stil. */
function tidyRuns(runs: InlineRun[]): InlineRun[] {
  const merged: InlineRun[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    const sameStyle =
      last &&
      last.bold === run.bold &&
      last.italics === run.italics &&
      last.underline === run.underline &&
      last.strike === run.strike &&
      last.link === run.link;
    if (sameStyle) last.text += run.text;
    else merged.push({ ...run });
  }
  if (merged.length > 0) {
    merged[0].text = merged[0].text.replace(/^\s+/, "");
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, "");
  }
  return merged.filter((r) => r.text !== "");
}

function hasBlockChild(node: ElementNode): boolean {
  return node.children.some((c) => c.kind === "element" && BLOCK_TAGS.has(c.tag));
}

function blocksFrom(node: ElementNode): DocBlock[] {
  const out: DocBlock[] = [];
  /** Textul liber dintre blocuri (ex. `<div>text<p>…</p></div>`) nu are voie să se piardă. */
  let pending: Node[] = [];

  const flushPending = () => {
    if (pending.length === 0) return;
    const runs = tidyRuns(collectInto(pending));
    if (runs.length > 0) out.push({ type: "paragraph", align: alignOf(node), runs });
    pending = [];
  };

  for (const child of node.children) {
    if (child.kind === "text" || !BLOCK_TAGS.has(child.tag)) {
      pending.push(child);
      continue;
    }
    flushPending();
    out.push(...blockFromElement(child));
  }
  flushPending();
  return out;
}

function collectInto(nodes: Node[]): InlineRun[] {
  const runs: InlineRun[] = [];
  collectRuns(nodes, {}, runs);
  return runs;
}

function paragraphFrom(node: ElementNode, type: "paragraph" | "heading", level?: number): DocBlock[] {
  const runs = tidyRuns(collectInto(node.children));
  if (runs.length === 0) return [];
  return [{ type, level, align: alignOf(node), runs }];
}

function cellFrom(node: ElementNode): TableCell {
  const blocks = hasBlockChild(node) ? blocksFrom(node) : paragraphFrom(node, "paragraph");
  return {
    blocks: blocks.length > 0 ? blocks : [{ type: "paragraph", runs: [{ text: "" }] }],
    header: node.tag === "th",
    colSpan: Number(node.attrs.colspan) > 1 ? Number(node.attrs.colspan) : undefined,
    rowSpan: Number(node.attrs.rowspan) > 1 ? Number(node.attrs.rowspan) : undefined,
    align: alignOf(node),
  };
}

function tableFrom(node: ElementNode): DocBlock[] {
  const rows: TableCell[][] = [];
  let headerRows = 0;

  const walk = (n: ElementNode, inHead: boolean) => {
    for (const child of n.children) {
      if (child.kind !== "element") continue;
      if (child.tag === "thead") walk(child, true);
      else if (child.tag === "tbody" || child.tag === "tfoot") walk(child, false);
      else if (child.tag === "tr") {
        const cells = child.children
          .filter((c): c is ElementNode => c.kind === "element" && (c.tag === "td" || c.tag === "th"))
          .map(cellFrom);
        if (cells.length === 0) continue;
        rows.push(cells);
        if (inHead || cells.every((c) => c.header)) headerRows = Math.max(headerRows, rows.length);
      }
    }
  };
  walk(node, false);
  if (rows.length === 0) return [];
  // Antetul se repetă pe pagini doar dacă e chiar primul rând — altfel pdfmake ar repeta greșit.
  return [{ type: "table", rows, headerRows: headerRows === 1 ? 1 : 0 }];
}

function listFrom(node: ElementNode, ordered: boolean): DocBlock[] {
  const items: DocBlock[][] = [];
  for (const child of node.children) {
    if (child.kind !== "element" || child.tag !== "li") continue;
    const blocks = hasBlockChild(child) ? blocksFrom(child) : paragraphFrom(child, "paragraph");
    items.push(blocks.length > 0 ? blocks : [{ type: "paragraph", runs: [{ text: "" }] }]);
  }
  return items.length > 0 ? [{ type: "list", ordered, items }] : [];
}

function blockFromElement(node: ElementNode): DocBlock[] {
  switch (node.tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return paragraphFrom(node, "heading", Number(node.tag.slice(1)));
    case "p":
    case "blockquote":
      return paragraphFrom(node, "paragraph");
    case "hr":
      return [{ type: "rule" }];
    case "ul":
      return listFrom(node, false);
    case "ol":
      return listFrom(node, true);
    case "table":
      return tableFrom(node);
    case "div": {
      // Întreruperea de pagină din editor (`data-page-break`) e un bloc, nu un stil.
      if (node.attrs["data-page-break"] !== undefined) return [{ type: "pageBreak" }];
      return hasBlockChild(node) ? blocksFrom(node) : paragraphFrom(node, "paragraph");
    }
    case "li":
    case "tr":
    case "td":
    case "th":
    case "thead":
    case "tbody":
    case "tfoot":
      // Ajunse aici fără părintele lor (HTML rupt) — le tratăm ca text simplu.
      return hasBlockChild(node) ? blocksFrom(node) : paragraphFrom(node, "paragraph");
    default:
      return blocksFrom(node);
  }
}

/**
 * Corpul actului, ca listă de blocuri. Punctul de intrare al modulului.
 */
export function parseDocumentHtml(html: string): DocBlock[] {
  const tree = parseHtmlTree(html);
  const body = findBody(tree) ?? tree;
  return blocksFrom(body);
}

function findBody(node: ElementNode): ElementNode | null {
  for (const child of node.children) {
    if (child.kind !== "element") continue;
    if (child.tag === "body") return child;
    const found = findBody(child);
    if (found) return found;
  }
  return null;
}
