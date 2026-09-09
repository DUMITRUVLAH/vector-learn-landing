/**
 * @vitest-environment node
 *
 * `readUploadedDoc` — citirea unică a fișierului încărcat, folosită și de prefill, și de
 * reconcilierea atașamentelor (`parAttachments.ts`).
 *
 * Regresia blocată (raportată 2026-09-09): un act de primire-predare .docx cu „6000 MDL" atașat
 * la dosar dădea în verificarea AI „sumă: document 0 · PAR 600000". Cauză: reconcilierea avea
 * propria citire, cu `toString("utf8")` pe tot ce nu era PDF sau imagine — iar .docx e un ZIP,
 * deci extractorul primea gunoi binar. Prefill-ul citea deja corect; cele două s-au unit aici.
 */
import { describe, it, expect } from "vitest";
import { readUploadedDoc } from "../lib/ai/readUploadedDoc";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function docxBuffer(paragraphs: string[]): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const body = paragraphs.map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join("");
  zip.file("word/document.xml", `<w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("readUploadedDoc", () => {
  it("[blocant] scoate suma dintr-un act .docx, nu binar", async () => {
    const buf = await docxBuffer([
      "ACT de Primire – Predare a serviciilor",
      "Prestator: BULBAȘ GEORGETA, IDNP 2002500149379",
      "Pretul serviciilor constituie 6000 MDL.",
    ]);
    const { rawText, imageDataUrl, fileDataUrl } = await readUploadedDoc(buf, "act.docx", DOCX_MIME);
    expect(rawText).toContain("6000 MDL");
    expect(rawText).toContain("2002500149379");
    expect(imageDataUrl).toBeUndefined();
    expect(fileDataUrl).toBeUndefined();
  });

  it("citește .docx și când browserul trimite octet-stream", async () => {
    const buf = await docxBuffer(["Pretul serviciilor constituie 6000 MDL."]);
    const { rawText } = await readUploadedDoc(buf, "act.docx", "application/octet-stream");
    expect(rawText).toContain("6000 MDL");
  });

  it("o imagine merge la model ca imagine, fără text", async () => {
    const { rawText, imageDataUrl } = await readUploadedDoc(Buffer.from([0xff, 0xd8, 0xff]), "poza.jpg", "image/jpeg");
    expect(rawText).toBe("");
    expect(imageDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("un PDF fără strat de text ajunge la model ca fișier", async () => {
    const { rawText, fileDataUrl } = await readUploadedDoc(Buffer.from("%PDF-1.4 scan"), "scan.pdf", "application/pdf");
    expect(rawText.trim().length).toBeLessThan(200);
    expect(fileDataUrl).toMatch(/^data:application\/pdf;base64,/);
  });

  it("csv/txt rămân text simplu", async () => {
    const { rawText } = await readUploadedDoc(Buffer.from("nume,suma\nBULBAS,6000"), "deviz.csv", "text/csv");
    expect(rawText).toContain("6000");
  });
});
