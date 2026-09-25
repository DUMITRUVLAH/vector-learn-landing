/**
 * @vitest-environment node
 *
 * CRM-D03 — cum arată actul care pleacă la un client din CRM.
 *
 * Trei lucruri pe care testele le țin, în ordinea gravității:
 *  1. tabelul pozițiilor se tipărește ca TABEL (era turtit într-un rând de text, în toate șabloanele);
 *  2. oferta are TVA când produsele au, iar actele fără TVA (PAR) rămân rând cu rând la fel;
 *  3. stilul modern se aplică doar când e cerut — actele juridice rămân clasice.
 */
import { describe, it, expect } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { parseDocumentHtml } from "../richText";
import { buildLinesTable, insertLinesTable } from "../linesTable";
import { buildDocDefinition, renderDocumentPdfBuffer, MODERN_PALETTE } from "../pdfDocument";
import { sanitizeTemplateHtml } from "../sanitizeHtml";
import { buildPrintableHtml } from "../documentPdf";
import { SYSTEM_TEMPLATES } from "../systemTemplates";

const LINES = [
  { description: "Training AI in-house — 1 zi", unit: "sesiune", quantity: 1, unitPriceCents: 16_000_00, lineTotalCents: 16_000_00, vatPercent: 20 },
  { description: "Abonament suport AI", unit: "lună", quantity: 3, unitPriceCents: 3_500_00, lineTotalCents: 10_500_00, vatPercent: 20 },
];

const META = { docNumber: "OF-2026-0001", title: "Ofertă", docDate: new Date("2026-09-25"), bodyHash: null, orgName: "Vector Academy SRL" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>;
function findAll(node: unknown, pred: (n: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, pred, out));
  else if (node && typeof node === "object") {
    if (pred(node as Node)) out.push(node as Node);
    Object.values(node as Node).forEach((v) => findAll(v, pred, out));
  }
  return out;
}

describe("tabelul pozițiilor, într-un paragraf", () => {
  it("[blocant] `<p>{{tabel.pozitii}}</p>` se citește ca tabel, nu ca un rând de text", () => {
    const html = insertLinesTable("<p>{{tabel.pozitii}}</p>", LINES);
    const blocks = parseDocumentHtml(html);
    expect(blocks.map((b) => b.type)).toEqual(["table"]);
  });

  it("[blocant] toate șabloanele de sistem cu poziții scot un tabel real", () => {
    const withLines = SYSTEM_TEMPLATES.filter((t) => t.bodyHtml.includes("{{tabel.pozitii}}"));
    expect(withLines.length).toBeGreaterThan(5);
    for (const t of withLines) {
      const blocks = parseDocumentHtml(insertLinesTable(t.bodyHtml, LINES));
      expect(blocks.some((b) => b.type === "table" && b.rows.length >= 3), t.name).toBe(true);
    }
  });
});

describe("TVA în tabelul pozițiilor", () => {
  it("[blocant] cu TVA: coloana cotei și trei totaluri (fără TVA, TVA, cu TVA)", () => {
    const html = buildLinesTable(LINES);
    expect(html).toContain("<th style=\"width:8%\">TVA</th>");
    expect(html).toContain("Total fără TVA");
    expect(html).toMatch(/TVA<\/strong><\/td>\s*<td style="text-align:right"><strong>5\.?300,00/);
    expect(html).toMatch(/Total cu TVA[\s\S]*31\.?800,00/);
  });

  it("[blocant] fără TVA (actele PAR), tabelul rămâne exact cum era", () => {
    const html = buildLinesTable(LINES.map((l) => ({ ...l, vatPercent: 0 })));
    expect(html).not.toContain("TVA");
    expect(html).toContain("<strong>Total</strong>");
  });
});

describe("stilul modern", () => {
  const body = `<h1>Ofertă comercială</h1>
<table data-role="meta"><tbody><tr><td>Client</td><td>Medlife Clinic SRL</td></tr></tbody></table>
<h2>1. Ce include oferta</h2>
<p>${buildLinesTable(LINES)}</p>
<table data-role="signatures"><tbody><tr><td><p>Furnizor</p></td><td><p>Acceptat de client</p></td></tr></tbody></table>`;

  it("[blocant] actul modern: Onest, titlu albastru, fișă-rezumat cu etichete pe fond, antet de tabel închis", () => {
    const def = buildDocDefinition(body, { ...META, style: "modern" });
    expect(def.defaultStyle.font).toBe("Onest");
    expect(findAll(def.content, (n) => n.color === MODERN_PALETTE.accent && n.fontSize === 20)).toHaveLength(1);
    expect(findAll(def.content, (n) => n.fillColor === MODERN_PALETTE.metaFill).length).toBeGreaterThan(0);
    expect(findAll(def.content, (n) => n.fillColor === MODERN_PALETTE.headFill).length).toBeGreaterThan(0);
  });

  it("[blocant] actul clasic (PAR) rămâne pe Tinos, fără culori", () => {
    const def = buildDocDefinition(body, META);
    expect(def.defaultStyle.font).toBe("Tinos");
    expect(findAll(def.content, (n) => typeof n.fillColor === "string")).toHaveLength(0);
  });

  it("[blocant] coloana cu denumirea ia lățimea, nu „Nr.”", () => {
    const def = buildDocDefinition(`<p>${buildLinesTable(LINES)}</p>`, { ...META, style: "modern" });
    const [table] = findAll(def.content, (n) => !!n.table);
    expect(table.table.widths[0]).toBe("auto");
    expect(table.table.widths[1]).toBe("*");
  });

  it("[blocant] PDF-ul modern se scrie cu diacritice (Onest le are)", async () => {
    const pdf = await renderDocumentPdfBuffer(body, { ...META, style: "modern" });
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const { text } = await extractText(doc, { mergePages: true });
    expect(text).toContain("Ofertă comercială");
    expect(text).toContain("Acceptat de client");
    expect(text).toContain("Total cu TVA");
  });

  it("[normal] previzualizarea și Word-ul poartă același stil", () => {
    const doc = { docNumber: "OF-1", title: "Ofertă", kind: "oferta_comerciala", docDate: new Date(), bodyHtml: body, bodyHash: null, status: "final" };
    expect(buildPrintableHtml({ ...doc, style: "modern" }, { name: null, logoUrl: null })).toContain("font-family: Onest");
    expect(buildPrintableHtml(doc, { name: null, logoUrl: null })).toContain("Times New Roman");
  });

  it("[normal] un șablon clonat își păstrează fișa-rezumat și semnăturile", () => {
    const clean = sanitizeTemplateHtml('<table data-role="meta" onclick="x()"><tbody><tr><td>a</td></tr></tbody></table>');
    expect(clean).toContain('data-role="meta"');
    expect(clean).not.toContain("onclick");
  });
});
