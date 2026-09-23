// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shrinkIncomingBytes } from "../shrinkIncoming";
import { pdfWithUncompressedStream } from "../../../../src/lib/upload/__tests__/fixtures";

function payload(size: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = 65 + (i % 26);
  return out;
}

describe("shrinkIncomingBytes — drumurile pe care fișierul trece prin server", () => {
  it("micșorează un PDF cu stream-uri necomprimate", async () => {
    const pdf = Buffer.from(await pdfWithUncompressedStream(payload(400_000)));
    const out = await shrinkIncomingBytes(pdf, "chitanta.pdf", "application/pdf");
    expect(out.byteLength).toBeLessThan(pdf.byteLength / 2);
  });

  it("NU atinge un act semnat electronic", async () => {
    const pdf = await pdfWithUncompressedStream(payload(400_000));
    const signed = Buffer.concat([Buffer.from(pdf), Buffer.from("\n/ByteRange [0 840 12345 1500]\n")]);
    const out = await shrinkIncomingBytes(signed, "factura.pdf", "application/pdf");
    expect(out.byteLength).toBe(signed.byteLength);
  });

  it("lasă în pace ce nu e PDF — pe server nu există canvas, deci nu ne atingem de imagini", async () => {
    const image = Buffer.from(payload(500_000));
    const out = await shrinkIncomingBytes(image, "scan.jpg", "image/jpeg");
    expect(out.byteLength).toBe(image.byteLength);
  });

  it("întoarce octeții primiți, nu o excepție, pe un fișier stricat", async () => {
    const broken = Buffer.from(payload(400_000));
    const out = await shrinkIncomingBytes(broken, "stricat.pdf", "application/pdf");
    expect(out.byteLength).toBe(broken.byteLength);
  });
});
