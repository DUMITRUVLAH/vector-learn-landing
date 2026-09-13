/**
 * @vitest-environment node
 *
 * DOCX → PDF, pentru dosarul PAR.
 *
 * Regresia blocată: dosarul punea pentru orice .docx pagina „Tipul de fișier DOCX nu poate fi
 * inclus într-un PDF — descărcați-l separat din cerere". Actele de primire-predare vin aproape
 * întotdeauna ca .docx, deci dosarul „complet" nu conținea tocmai actul de recepție.
 *
 * Testele verifică ACȚIUNEA (§3.5.1quater): construiesc un .docx real cu jszip, îl trec prin
 * convertor și citesc înapoi textul PDF-ului cu unpdf — adică exact ce se vede în dosar.
 */
import { describe, it, expect } from "vitest";
import { buildDocxDefinition, parseDocx, renderDocxAsPdf } from "../docxToPdf";

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

async function docxFrom(
  bodyXml: string,
  extra?: { rels?: string; media?: Record<string, Uint8Array> },
): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document ${NS}><w:body>${bodyXml}</w:body></w:document>`);
  if (extra?.rels) zip.file("word/_rels/document.xml.rels", extra.rels);
  for (const [path, bytes] of Object.entries(extra?.media ?? {})) zip.file(path, bytes);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

/** Textul real al PDF-ului produs — nu ce credem noi că am scris în definiție. */
async function pdfTextOf(bytes: Uint8Array | Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text.join("\n") : text).replace(/\s+/g, " ");
}

const p = (text: string, opts: { bold?: boolean; center?: boolean } = {}) =>
  `<w:p>${opts.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ""}` +
  `<w:r>${opts.bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

describe("parseDocx — structura documentului", () => {
  it("[blocant] citește paragrafe, bold, aliniere și tabele", async () => {
    const body =
      p("ACT DE PRIMIRE PREDARE", { bold: true, center: true }) +
      p("Prestator: Viorica Bordei, IDNP 2002600012345") +
      '<w:tbl><w:tblGrid><w:gridCol w:w="6000"/><w:gridCol w:w="3000"/></w:tblGrid>' +
      "<w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Serviciu</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Preț</w:t></w:r></w:p></w:tc></w:tr>" +
      "<w:tr><w:tc><w:p><w:r><w:t>Consultanță</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p><w:r><w:t>7000 MDL</w:t></w:r></w:p></w:tc></w:tr></w:tbl>";

    const parsed = await parseDocx(await docxFrom(body));
    expect(parsed.blocks).toHaveLength(3);

    const first = parsed.blocks[0];
    if (first.kind !== "p") throw new Error("primul bloc trebuie să fie paragraf");
    expect(first.align).toBe("center");
    expect(first.runs[0].bold).toBe(true);
    expect(first.runs.map((r) => r.text).join("")).toBe("ACT DE PRIMIRE PREDARE");

    const table = parsed.blocks[2];
    if (table.kind !== "table") throw new Error("al treilea bloc trebuie să fie tabel");
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].map((c) => c.text)).toEqual(["Serviciu", "Preț"]);
    expect(table.rows[0][0].bold).toBe(true);
    expect(table.rows[1].map((c) => c.text)).toEqual(["Consultanță", "7000 MDL"]);
    expect(table.colWidths).toEqual([6000, 3000]);
  });

  it("nu sparge cuvintele tăiate de Word în rulări separate", async () => {
    const body =
      "<w:p><w:r><w:t>Presta</w:t></w:r><w:r><w:t>torul</w:t></w:r>" +
      '<w:r><w:t xml:space="preserve"> a predat</w:t></w:r></w:p>';
    expect(await pdfTextOf(await renderDocxAsPdf(await docxFrom(body)))).toContain(
      "Prestatorul a predat",
    );
  });

  it("aruncă pe o arhivă care nu e document Word", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("xl/workbook.xml", "<workbook/>");
    const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
    await expect(parseDocx(bytes)).rejects.toThrow();
  });
});

describe("buildDocxDefinition — celulele întinse nu rup randarea", () => {
  it("completează rândurile scurte până la numărul de coloane (pdfmake aruncă altfel)", async () => {
    const body =
      "<w:tbl>" +
      '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Total</w:t></w:r></w:p></w:tc></w:tr>' +
      "<w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>";
    const def = buildDocxDefinition(await parseDocx(await docxFrom(body)));
    const table = def.content.find((n: Record<string, unknown>) => n.table) as {
      table: { body: unknown[][]; widths: unknown[] };
    };
    expect(table.table.widths).toHaveLength(2);
    for (const row of table.table.body) expect(row).toHaveLength(2);
  });
});

describe("renderDocxAsPdf — conținutul ajunge ÎN dosar", () => {
  it("[blocant] textul actului se regăsește în PDF-ul produs", async () => {
    const body =
      p("ACT DE PRIMIRE PREDARE", { bold: true, center: true }) +
      p("Beneficiar: ATIC, IDNO 1002600012345") +
      p("Suma totală: 7000 MDL");
    const bytes = await renderDocxAsPdf(await docxFrom(body), {
      fileName: "ACT DE PRIMIRE PREDARE.docx",
    });
    const text = await pdfTextOf(bytes);

    expect(text).toContain("ACT DE PRIMIRE PREDARE");
    expect(text).toContain("IDNO 1002600012345");
    expect(text).toContain("7000 MDL");
    // Antetul spune onest că e o conversie, nu originalul semnat.
    expect(text).toContain("convertit automat din DOCX");
  });

  it("[blocant] diacriticele rămân ÎNTREGI (Tinos, nu fontul standard WinAnsi)", async () => {
    const body =
      p("Recepția serviciilor de consultanță — obligații îndeplinite", { bold: true }) +
      p("Ștefan Țurcanu, Chișinău");
    const text = await pdfTextOf(await renderDocxAsPdf(await docxFrom(body)));
    expect(text).toContain("Recepția serviciilor de consultanță");
    expect(text).toContain("Ștefan Țurcanu, Chișinău");
  });

  it("documentele lungi se pagineaza singure", async () => {
    const rows = Array.from(
      { length: 40 },
      (_, i) =>
        `<w:tr><w:tc><w:p><w:r><w:t>Poziția ${i + 1}</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>${(i + 1) * 100} MDL</w:t></w:r></w:p></w:tc></w:tr>`,
    ).join("");
    const bytes = await renderDocxAsPdf(await docxFrom(`<w:tbl>${rows}</w:tbl>`));

    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
    const text = await pdfTextOf(bytes);
    expect(text).toContain("Poziția 1");
    expect(text).toContain("Poziția 40");
    expect(text).toContain("4000 MDL");
  });

  it("încorporează imaginile inline (ștampile/semnături scanate)", async () => {
    // PNG 1×1 valid, minim.
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const body =
      p("Semnătura beneficiarului:") +
      '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1143000" cy="571500"/>' +
      '<a:graphic><a:graphicData><a:blip r:embed="rId7"/></a:graphicData></a:graphic>' +
      "</wp:inline></w:drawing></w:r></w:p>";
    const rels =
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId7" Type="image" Target="media/image1.png"/></Relationships>';

    const docx = await docxFrom(body, { rels, media: { "word/media/image1.png": png } });
    const parsed = await parseDocx(docx);
    expect(parsed.images.get("rId7")).toBeTruthy();

    const bytes = await renderDocxAsPdf(docx, { fileName: "act.docx" });
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(await pdfTextOf(bytes)).toContain("Semnătura beneficiarului");
  });
});
