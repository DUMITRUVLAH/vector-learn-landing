/**
 * Regression for the 2026-08-25 owner report: a real contract PDF prefilled a PAR with the
 * payer's requisites garbled ("iciară: VictoriaBank…" in the Bancă field) and an amount of
 * 2 224 217 675 lei instead of 8 000.
 *
 * Root cause lived HERE, not in the parsers: `unpdf`'s extractText builds each page from the
 * PDF's own end-of-line markers, but its `mergePages: true` branch then runs `.replace(/\s+/g,
 * " ")` over the joined pages — collapsing every newline. Every consumer therefore received one
 * single-line blob, so all line-based parsing downstream (payee bank/address windows and the
 * 2-column requisites table in stubPartyParser, every `split(/\r?\n/)` in statementExtractor)
 * silently degraded to "scan the whole document as one line".
 */

import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfText } from "../pdfText";

async function pdfWithLines(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  lines.forEach((line, i) => {
    page.drawText(line, { x: 40, y: 800 - i * 16, size: 11, font });
  });
  return Buffer.from(await doc.save());
}

describe("extractPdfText — the PDF's line structure must survive", () => {
  it("keeps each printed line on its own line", async () => {
    const text = await extractPdfText(
      await pdfWithLines([
        "Cod fiscal: 1010620008129",
        "Banca Beneficiara: VictoriaBank S.A. fil. Nr. 17",
        "Codul IBAN: MD80VI000002224217675MDL",
      ]),
    );

    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines).toContain("Cod fiscal: 1010620008129");
    expect(lines).toContain("Banca Beneficiara: VictoriaBank S.A. fil. Nr. 17");
    expect(lines).toContain("Codul IBAN: MD80VI000002224217675MDL");
  });

  it("returns empty text (never throws) for a page with no text layer", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    expect(await extractPdfText(Buffer.from(await doc.save()))).toBe("");
  });
});
