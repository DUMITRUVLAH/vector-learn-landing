/**
 * DC-102 — proba că actul chiar iese ca PDF de act.
 *
 * Testul care ar fi prins problema veche: PDF-ul produs de html2canvas era o imagine, deci
 * `extractText` nu scotea niciun cuvânt din el. Aici cerem explicit textul înapoi — dacă cineva
 * întoarce vreodată calea „fotografiem pagina", aserțiunile astea devin roșii.
 */
import { describe, it, expect } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { renderDocumentPdfBuffer, buildDocDefinition } from "../pdfDocument";
import { fontDir } from "../pdfFonts";

const BODY = `
<h1>Act de primire-predare</h1>
<p>Încheiat astăzi, <strong>31 august 2026</strong>, între „Vector Academy" S.R.L. (IDNO 1234567890123)
și Prestatorul, având IBAN MD24AG000225100013104168.</p>
<h2>Obiectul actului</h2>
<ul><li>Servicii de instruire</li><li>Materiale didactice</li></ul>
<table>
  <thead><tr><th>Denumire</th><th>UM</th><th>Cant.</th><th>Sumă</th></tr></thead>
  <tbody>
    <tr><td>Curs de programare</td><td>ore</td><td>40</td><td>18 000,00</td></tr>
    <tr><td>Închiriere sală</td><td>zile</td><td>5</td><td>6 500,00</td></tr>
  </tbody>
</table>
<p><strong>Total: 24 500,00 MDL</strong></p>
`;

const META = {
  docNumber: "ACT-2026-0007",
  title: "Act de primire-predare",
  docDate: new Date("2026-08-31T00:00:00Z"),
  bodyHash: "a1b2c3d4e5f60718abcdef0123456789",
  orgName: "Asociația Obștească Exemplu",
};

async function textOf(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: Array.isArray(text) ? text.join("\n") : text, pages: totalPages };
}

describe("DC-102 — PDF-ul actului", () => {
  it("[blocant] fonturile actului sunt livrate cu aplicația", () => {
    expect(fontDir()).not.toBeNull();
  });

  it("[blocant] produce un PDF adevărat, cu text care se poate extrage", async () => {
    const buffer = await renderDocumentPdfBuffer(BODY, META);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(2000);

    const { text } = await textOf(buffer);
    // Dacă PDF-ul ar fi o poză (calea html2canvas), aici n-ar veni niciun cuvânt.
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain("ACT DE PRIMIRE-PREDARE"); // titlul, cu majuscule ca în fișierul Word
    expect(text).toContain("Obiectul actului");
    expect(text).toContain("Curs de programare");
    expect(text).toContain("18 000,00");
    expect(text).toContain("Total: 24 500,00 MDL");
  });

  it("[blocant] diacriticele românești ajung întregi în fișier", async () => {
    const buffer = await renderDocumentPdfBuffer(
      "<p>Încheiat între părți: șantier, țeavă, măsură, în București.</p>",
      META
    );
    const { text } = await textOf(buffer);
    expect(text).toContain("șantier");
    expect(text).toContain("țeavă");
    expect(text).toContain("măsură");
    expect(text).toContain("Încheiat");
  });

  it("[blocant] numărul actului și paginația stau în subsol", async () => {
    const buffer = await renderDocumentPdfBuffer(BODY, META);
    const { text } = await textOf(buffer);
    expect(text).toContain("ACT-2026-0007");
    expect(text).toMatch(/pagina 1 din 1/);
    expect(text).toContain("Asociația Obștească Exemplu"); // antetul organizației
  });

  it("[blocant] un act lung se rupe în pagini, cu antetul tabelului repetat", async () => {
    const rows = Array.from(
      { length: 60 },
      (_, i) => `<tr><td>Poziția ${i + 1} — serviciu prestat</td><td>buc</td><td>1</td><td>100,00</td></tr>`
    ).join("");
    const buffer = await renderDocumentPdfBuffer(
      `<h1>Act cu multe poziții</h1><table><thead><tr><th>Denumire</th><th>UM</th><th>Cant.</th><th>Sumă</th></tr></thead><tbody>${rows}</tbody></table>`,
      META
    );
    const { text, pages } = await textOf(buffer);
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain("Poziția 60");
    // Antetul se repetă: apare de cel puțin câte ori sunt paginile cu tabel.
    expect((text.match(/Denumire/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(text).toMatch(new RegExp(`pagina ${pages} din ${pages}`));
  });

  it("întreruperea de pagină din editor chiar rupe pagina", async () => {
    const buffer = await renderDocumentPdfBuffer(
      `<p>Prima pagină</p><div data-page-break="1"></div><p>A doua pagină</p>`,
      META
    );
    const { pages } = await textOf(buffer);
    expect(pages).toBe(2);
  });

  it("definiția documentului păstrează marginile foii și familia de font", () => {
    const def = buildDocDefinition("<p>text</p>", META) as {
      pageMargins: number[];
      defaultStyle: { font: string };
    };
    expect(def.defaultStyle.font).toBe("Tinos");
    // 16 mm stânga/dreapta, în puncte.
    expect(def.pageMargins[0]).toBeCloseTo(45.35, 1);
    expect(def.pageMargins[2]).toBeCloseTo(45.35, 1);
  });
});
