// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rasterizeScannedPdf, shrinkPdfStreams, verifyStructurallyEqual } from "../pdfShrink";
import { hasSignatureMarkers } from "../signedDocs";
import {
  paddedJpeg,
  pdfWithAnnotation,
  pdfWithHiddenSignatureField,
  pdfWithoutAnnotation,
  pdfWithTextAndImage,
  pdfWithUncompressedStream,
  readRawStream,
  scannedPdf,
  scannedPdfFlateJpeg,
  tinyJpeg,
  withTrailingJunk,
} from "./fixtures";

/** Conținut compresibil, cum e un fișier de font: multă repetiție. */
function fontLikePayload(size: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = 65 + (i % 26);
  return out;
}

describe("shrinkPdfStreams — micșorare FĂRĂ pierderi", () => {
  it("comprimă stream-urile lăsate necomprimate și păstrează conținutul lor octet cu octet", async () => {
    const payload = fontLikePayload(300_000);
    const original = await pdfWithUncompressedStream(payload);

    const result = await shrinkPdfStreams(original);

    expect(result.method).toBe("pdf-streams");
    expect(result.bytes!.length).toBeLessThan(original.length / 2);

    // Nu ne mulțumim că fișierul e mai mic: îl citim înapoi și cerem EXACT octeții de la intrare.
    const after = await readRawStream(result.bytes!);
    expect(after.filter).toContain("FlateDecode");
    expect(Array.from(after.bytes)).toEqual(Array.from(payload));
  });

  it("aruncă din fișier gunoiul de după `%%EOF` fără să piardă pagina", async () => {
    const clean = await pdfWithUncompressedStream(fontLikePayload(2_000));
    const padded = withTrailingJunk(clean, 1_300_000); // cazul „Patenta AB 282679…pdf"

    const result = await shrinkPdfStreams(padded);

    expect(result.bytes).not.toBeNull();
    expect(result.bytes!.length).toBeLessThan(padded.length / 10);
    expect(await verifyStructurallyEqual(padded, result.bytes!)).toBe(true);
  });

  it("nu atinge un fișier în care nu are ce câștiga", async () => {
    const original = await pdfWithUncompressedStream(fontLikePayload(2_000));
    const once = await shrinkPdfStreams(original);
    // A doua trecere peste rezultat nu mai are ce comprima — fără asta, o re-rulare ar putea
    // rescrie la nesfârșit același fișier, degradându-l de fiecare dată.
    const twice = await shrinkPdfStreams(once.bytes ?? original);
    expect(twice.bytes).toBeNull();
    expect(twice.reason).toBe("castig_prea_mic");
  });

  it("se oprește la un câmp de semnătură ascuns în structură, nu doar la marcajele din octeți", async () => {
    const pdf = await pdfWithHiddenSignatureField(fontLikePayload(300_000));
    // Plasa pe octeți bruți nu are ce vedea aici — dicționarele sunt comprimate.
    expect(hasSignatureMarkers(pdf)).toBe(false);

    const result = await shrinkPdfStreams(pdf);

    expect(result.bytes).toBeNull();
    expect(result.reason).toBe("semnat");
  });

  it("răspunde cu un motiv, nu cu o excepție, pe un fișier care nu e PDF", async () => {
    const result = await shrinkPdfStreams(new TextEncoder().encode("nu sunt un pdf"));
    expect(result.bytes).toBeNull();
    expect(result.reason).toBe("pdf_illizibil");
  });
});

describe("rasterizeScannedPdf — doar pagini care sunt deja o fotografie", () => {
  const halveJpeg = async (jpeg: Uint8Array) =>
    // Ține locul canvasului din browser: întoarce un JPEG valid, mai mic.
    jpeg.length > 20_000 ? paddedJpeg(5_000) : tinyJpeg();

  it("reconstruiește un scan din imagini mai mici, păstrând numărul și mărimea paginilor", async () => {
    const original = await scannedPdf(3, paddedJpeg(200_000));

    const result = await rasterizeScannedPdf(original, halveJpeg);

    expect(result.method).toBe("pdf-scan");
    expect(result.bytes!.length).toBeLessThan(original.length / 2);
    expect(await verifyStructurallyEqual(original, result.bytes!, { skipTextOps: true })).toBe(true);
  });

  it("decomprimă lanțul `[/FlateDecode /DCTDecode]` scris de scanere, în loc să renunțe", async () => {
    // Fără pasul de inflate, decodorul nu recunoaște un JPEG în octeții comprimați și întregul
    // fișier rămâne neatins — exact ce a pățit copia patentei de pe Xerox (1241 KB → 497 KB).
    const original = await scannedPdfFlateJpeg(2, paddedJpeg(200_000));

    const result = await rasterizeScannedPdf(original, halveJpeg);

    expect(result.reason).toBeUndefined();
    expect(result.method).toBe("pdf-scan");
    expect(result.bytes!.length).toBeLessThan(original.length / 2);
  });

  it("REFUZĂ o pagină cu text — stratul din care se extrag suma și IBAN-ul nu se sacrifică pentru spațiu", async () => {
    const original = await pdfWithTextAndImage(paddedJpeg(200_000));

    const result = await rasterizeScannedPdf(original, halveJpeg);

    expect(result.bytes).toBeNull();
    expect(result.reason).toBe("pagina_are_text");
  });

  it("renunță dacă reîncodarea nu reușește, în loc să livreze un document incomplet", async () => {
    const original = await scannedPdf(2, paddedJpeg(200_000));
    const result = await rasterizeScannedPdf(original, async () => null);
    expect(result.bytes).toBeNull();
    expect(result.reason).toBe("reincodare_esuata");
  });
});

describe("verifyStructurallyEqual — poarta care poate chiar să pice", () => {
  it("respinge un document din care a dispărut o pagină", async () => {
    const three = await scannedPdf(3, tinyJpeg());
    const two = await scannedPdf(2, tinyJpeg());
    expect(await verifyStructurallyEqual(three, two, { skipTextOps: true })).toBe(false);
  });

  it("respinge un document din care a dispărut textul", async () => {
    const withText = await pdfWithUncompressedStream(fontLikePayload(1_000));
    const withoutText = await scannedPdf(1, tinyJpeg());
    expect(await verifyStructurallyEqual(withText, withoutText)).toBe(false);
  });

  it("respinge un document din care a dispărut o adnotare (link, câmp de formular)", async () => {
    // Textul și imaginile rămân identice, deci doar numărătoarea de adnotări poate prinde asta.
    expect(await verifyStructurallyEqual(await pdfWithAnnotation(), await pdfWithoutAnnotation())).toBe(false);
  });

  it("acceptă același document salvat din nou", async () => {
    const original = await pdfWithUncompressedStream(fontLikePayload(50_000));
    const shrunk = await shrinkPdfStreams(original);
    expect(await verifyStructurallyEqual(original, shrunk.bytes!)).toBe(true);
  });
});
