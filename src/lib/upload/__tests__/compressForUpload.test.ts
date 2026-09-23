// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compressForUpload, describeCompression, extensionOf, formatBytes, withExtension } from "../compressForUpload";
import { pdfWithUncompressedStream, withTrailingJunk } from "./fixtures";

function file(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

function payload(size: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = 65 + (i % 26);
  return out;
}

describe("compressForUpload — poarta dinaintea Storage-ului", () => {
  it("micșorează un PDF cu stream-uri necomprimate și păstrează numele și tipul", async () => {
    const pdf = await pdfWithUncompressedStream(payload(400_000));
    const result = await compressForUpload(file(pdf, "Chitanta Meta.pdf", "application/pdf"));

    expect(result.method).toBe("pdf-streams");
    expect(result.bytes).toBeLessThan(result.originalBytes / 2);
    expect(result.file.name).toBe("Chitanta Meta.pdf");
    expect(result.file.type).toBe("application/pdf");
    expect(result.file.size).toBe(result.bytes);
  });

  it("NU atinge un act semnat electronic, oricât de mare ar fi", async () => {
    // Un PDF care ar fi micșorabil, dar poartă `/ByteRange`: rescrierea i-ar muta octeții și
    // i-ar invalida semnătura. Spațiul câștigat nu valorează cât un act fără valoare juridică.
    const pdf = await pdfWithUncompressedStream(payload(400_000));
    const signed = new Uint8Array(pdf.length + 40);
    signed.set(pdf, 0);
    signed.set(new TextEncoder().encode("\n/ByteRange [0 840 12345 1500]\n"), pdf.length);

    const result = await compressForUpload(file(signed, "factura.pdf", "application/pdf"));

    expect(result.method).toBe("original");
    expect(result.reason).toBe("semnat");
    expect(result.file.size).toBe(signed.length);
  });

  it("NU atinge un fișier al cărui nume spune că e semnat (e-Factura SFS)", async () => {
    const pdf = await pdfWithUncompressedStream(payload(400_000));
    const result = await compressForUpload(file(pdf, "2026_MM8710246.signed.pdf", "application/pdf"));
    expect(result.method).toBe("original");
    expect(result.reason).toBe("semnat");
  });

  it("lasă în pace fișierele mici — 116 din cele 235 de obiecte din storage sunt sub 100 KB", async () => {
    const result = await compressForUpload(file(payload(50_000), "nota.pdf", "application/pdf"));
    expect(result.method).toBe("original");
    expect(result.reason).toBe("deja_mic");
  });

  it("nu pierde vremea cu formate care sunt deja arhive (Word, Excel, ZIP)", async () => {
    const result = await compressForUpload(
      file(payload(500_000), "oferta.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    );
    expect(result.method).toBe("original");
    expect(result.reason).toBe("tip_necomprimabil");
  });

  it("aruncă gunoiul de după `%%EOF` — cazul „Patenta AB 282679…pdf”, 1,3 MB de umplutură", async () => {
    const clean = await pdfWithUncompressedStream(payload(2_000));
    const padded = withTrailingJunk(clean, 1_300_000);
    const result = await compressForUpload(file(padded, "Patenta AB 282679 Vlah Dumitru.pdf", "application/pdf"));

    expect(result.method).toBe("pdf-streams");
    expect(result.bytes).toBeLessThan(result.originalBytes / 10);
  });

  it("întoarce originalul, nu o excepție, pe un fișier stricat", async () => {
    const result = await compressForUpload(file(payload(400_000), "stricat.pdf", "application/pdf"));
    expect(result.method).toBe("original");
    expect(result.file.size).toBe(400_000);
  });

  it("recunoaște PDF-ul și după extensie, când browserul nu trimite tipul", async () => {
    const pdf = await pdfWithUncompressedStream(payload(400_000));
    const result = await compressForUpload(file(pdf, "scan.PDF", ""));
    expect(result.method).toBe("pdf-streams");
  });
});

describe("ajutoarele de nume și mărime", () => {
  it("schimbă extensia când formatul se schimbă", () => {
    expect(withExtension("factura.png", "jpg")).toBe("factura.jpg");
    expect(withExtension("Dovada plata 2026", "jpg")).toBe("Dovada plata 2026.jpg");
    expect(withExtension("act.v2.png", "jpg")).toBe("act.v2.jpg");
  });

  it("citește extensia unui fișier", () => {
    expect(extensionOf("factura.PDF")).toBe("PDF");
    expect(extensionOf("fara-extensie")).toBe("");
  });

  it("scrie mărimile pe înțelesul omului", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(1_500)).toBe("1 KB");
    expect(formatBytes(3_200_000)).toBe("3,1 MB");
  });

  it("nu raportează nimic când fișierul a rămas neatins", () => {
    expect(describeCompression({ file: new File([], "x"), originalBytes: 10, bytes: 10, method: "original" })).toBeNull();
  });
});
