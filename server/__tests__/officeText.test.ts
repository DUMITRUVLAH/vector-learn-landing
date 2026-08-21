/**
 * @vitest-environment node
 *
 * `extractOfficeText` — actele care NU sunt PDF sau poză.
 *
 * Regresia blocată: ruta de prefill făcea `buf.toString("utf8")` pe orice fișier non-PDF.
 * Un .docx sau .xlsx e o arhivă ZIP, deci ieșea binar — extractorul „vedea" un document gol
 * și utilizatorul primea câmpuri necompletate, fără nicio explicație.
 */
import { describe, it, expect } from "vitest";
import { extractOfficeText, extractDocxText, extractXlsxText } from "../lib/ai/officeText";

async function docxBuffer(paragraphs: string[], footer?: string): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const body = paragraphs.map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join("");
  zip.file("word/document.xml", `<w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`);
  if (footer) {
    zip.file(
      "word/footer1.xml",
      `<w:ftr xmlns:w="x"><w:p><w:r><w:t>${footer}</w:t></w:r></w:p></w:ftr>`,
    );
  }
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

async function xlsxBuffer(rows: Array<Array<string | number>>): Promise<Buffer> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Deviz");
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("docx", () => {
  it("[blocant] întoarce textul paragrafelor, nu binar", async () => {
    const buf = await docxBuffer([
      "ACT de primire-predare a serviciilor",
      "Prestator: Viorica Bordei, cod personal 4841021002234",
    ]);
    const text = await extractDocxText(buf);
    expect(text).toContain("ACT de primire-predare a serviciilor");
    expect(text).toContain("4841021002234");
  });

  it("citește și subsolul — rechizitele sunt adesea tipărite acolo", async () => {
    const buf = await docxBuffer(["Contract de prestări servicii"], "IBAN MD69ML000000022519094129");
    const text = await extractDocxText(buf);
    expect(text).toContain("MD69ML000000022519094129");
  });

  it("decodează entitățile XML (&amp; în denumiri de firmă)", async () => {
    const buf = await docxBuffer(["Prestator: Alfa &amp; Beta SRL"]);
    expect(await extractDocxText(buf)).toContain("Alfa & Beta SRL");
  });
});

describe("xlsx", () => {
  it("[blocant] întoarce rândurile ca text tab-separat", async () => {
    const buf = await xlsxBuffer([
      ["Denumire", "Cantitate", "Preț"],
      ["Servicii de comunicare", 1, 471.45],
    ]);
    const text = await extractXlsxText(buf);
    expect(text).toContain("Servicii de comunicare");
    expect(text).toContain("471.45");
    expect(text).toContain("Deviz"); // numele foii
  });
});

describe("extractOfficeText — dispecerul", () => {
  it("recunoaște docx-ul chiar dacă browserul trimite 'application/octet-stream'", async () => {
    const buf = await docxBuffer(["IBAN MD69ML000000022519094129"]);
    const text = await extractOfficeText(buf, "act", "application/octet-stream");
    expect(text).toContain("MD69ML000000022519094129");
  });

  it("csv/txt rămân text simplu", async () => {
    const buf = Buffer.from("nume;iban\nBordei;MD69ML000000022519094129\n", "utf8");
    const text = await extractOfficeText(buf, "lista.csv", "text/csv");
    expect(text).toContain("MD69ML000000022519094129");
  });

  it("[blocant] un binar necunoscut întoarce '' — nu zgomot pentru model", async () => {
    const noise = Buffer.from([0x00, 0xff, 0xfe, 0x01, 0x80, 0x90, 0xaa, 0xbb, 0xcc, 0xdd]);
    expect(await extractOfficeText(noise, "ceva.bin", "application/octet-stream")).toBe("");
  });

  it("nu aruncă niciodată pe un fișier corupt", async () => {
    const brokenZip = Buffer.concat([Buffer.from("PK"), Buffer.alloc(64, 7)]);
    await expect(extractOfficeText(brokenZip, "act.docx", "")).resolves.toBe("");
  });
});
