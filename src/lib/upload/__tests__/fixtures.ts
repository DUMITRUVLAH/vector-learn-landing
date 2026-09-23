/**
 * PDF-uri construite în test, ca să nu ținem în repo fișiere de câțiva MB.
 *
 * Fiecare fixture imită un caz REAL găsit în storage-ul proiectului pe 23.09.2026 — de asta au
 * formele astea, nu altele: chitanțele Meta Ads cu fonturi încorporate necomprimate, „Patenta
 * AB 282679…pdf" cu 1,3 MB de umplutură după `%%EOF`, contractele scanate cu o singură imagine
 * JPEG pe pagină.
 */
import { PDFDocument, PDFName, PDFRawStream, StandardFonts } from "pdf-lib";

/** Un JPEG real de 16×16 (generat cu canvas), destul cât `embedJpg` să-l poată citi. */
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAABwD/xAAXEAEAAwAAAAAAAAAAAAAAAAAFACIy/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AGB9nVoavs6tJ9nVoavs6tA//9k=";

export function tinyJpeg(): Uint8Array {
  const bin = atob(TINY_JPEG_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Același JPEG, umflat cu segmente de comentariu (marcajul `FFFE`) până la `padBytes` octeți.
 * Rămâne un JPEG perfect valid, dar mare — exact ce ne trebuie ca să măsurăm un câștig real
 * fără să cărăm un scan adevărat în repo.
 *
 * Segmentele se taie la 65 533 de octeți fiindcă lungimea unui segment JPEG se scrie pe DOI
 * octeți; un singur comentariu de 200 KB ar scrie o lungime trunchiată, iar decodorul ar sări
 * în mijlocul umpluturii și ar declara fișierul stricat (exact ce ne-a picat prima oară).
 */
export function paddedJpeg(padBytes: number): Uint8Array {
  const base = tinyJpeg();
  const MAX_SEGMENT = 65_533; // 65 535 minus cei 2 octeți ai câmpului de lungime
  const segments: Uint8Array[] = [];
  let left = padBytes;
  while (left > 0) {
    const size = Math.min(left, MAX_SEGMENT);
    const seg = new Uint8Array(size + 4);
    seg[0] = 0xff;
    seg[1] = 0xfe; // COM
    seg[2] = ((size + 2) >> 8) & 0xff;
    seg[3] = (size + 2) & 0xff;
    // Umplutură pseudo-aleatoare, nu octeți identici: un JPEG real e deja de mare entropie, iar
    // un comentariu plin de spații s-ar comprima la nimic cu Flate — testul lanțului
    // `[/FlateDecode /DCTDecode]` ar măsura atunci altceva decât realitatea.
    let seed = size;
    for (let i = 4; i < seg.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      seg[i] = (seed >> 16) & 0xff;
    }
    segments.push(seg);
    left -= size;
  }
  const padding = segments.reduce((sum, s) => sum + s.length, 0);
  const out = new Uint8Array(base.length + padding);
  out.set(base.subarray(0, 2), 0); // SOI
  let at = 2;
  for (const seg of segments) {
    out.set(seg, at);
    at += seg.length;
  }
  out.set(base.subarray(2), at);
  return out;
}

/** Cheia sub care fixture-ul își ascunde stream-ul necomprimat, ca testul să-l regăsească. */
export const RAW_STREAM_KEY = "VLTestRawData";

/**
 * Un PDF cu text ȘI cu un stream necomprimat mare — forma chitanțelor Meta Ads, unde fonturile
 * încorporate ajung în fișier fără niciun filtru.
 */
export async function pdfWithUncompressedStream(payload: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText("Chitanta 24440991 - Vector Academy", { x: 50, y: 780, size: 14, font });
  page.drawText("Suma: 1 234,56 MDL", { x: 50, y: 756, size: 14, font });

  const stream = doc.context.stream(payload); // fără `/Filter` — asta e tot rostul fixture-ului
  const ref = doc.context.register(stream);
  doc.catalog.set(PDFName.of(RAW_STREAM_KEY), ref);
  return doc.save({ useObjectStreams: false });
}

/** Citește înapoi stream-ul ascuns de `pdfWithUncompressedStream`, decomprimat dacă e nevoie. */
export async function readRawStream(pdf: Uint8Array): Promise<{ bytes: Uint8Array; filter: string }> {
  const doc = await PDFDocument.load(pdf);
  const ref = doc.catalog.get(PDFName.of(RAW_STREAM_KEY));
  const stream = doc.context.lookup(ref!);
  if (!(stream instanceof PDFRawStream)) throw new Error("stream-ul fixture-ului a dispărut din fișier");
  const filter = String(stream.dict.get(PDFName.of("Filter")) ?? "");
  if (!filter.includes("FlateDecode")) return { bytes: stream.contents, filter };
  const inflated = new Uint8Array(
    await new Response(new Blob([stream.contents as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer(),
  );
  return { bytes: inflated, filter };
}

/** Un PDF-scan: pagini fără niciun font, cu o singură imagine JPEG fiecare. */
export async function scannedPdf(pageCount: number, jpeg: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const image = await doc.embedJpg(jpeg);
    const page = doc.addPage([595, 842]);
    page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  }
  return doc.save({ useObjectStreams: false });
}

/** Un PDF cu text ȘI imagine — cazul în care rasterizarea ar distruge stratul de text. */
export async function pdfWithTextAndImage(jpeg: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const image = await doc.embedJpg(jpeg);
  const page = doc.addPage([595, 842]);
  page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  page.drawText("Factura fiscala seria AA nr. 123", { x: 50, y: 780, size: 12, font });
  return doc.save({ useObjectStreams: false });
}

/** Adaugă gunoi după `%%EOF` — forma exactă a „Patenta AB 282679…pdf" din storage. */
export function withTrailingJunk(pdf: Uint8Array, junkBytes: number): Uint8Array {
  const junk = new Uint8Array(junkBytes);
  junk.fill(0x25); // '%' — comentarii PDF, deci fișierul rămâne valid
  const out = new Uint8Array(pdf.length + junk.length);
  out.set(pdf, 0);
  out.set(junk, pdf.length);
  return out;
}

/**
 * O pagină cu o adnotare (un link) — ce nu se vede nici în text, nici în imagini, dar care e
 * conținut: un câmp de formular sau un link dispărut face documentul altul.
 */
export async function pdfWithAnnotation(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText("Vezi anexa", { x: 50, y: 780, size: 12, font });
  const annot = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [50, 770, 200, 795],
    Border: [0, 0, 0],
    A: doc.context.obj({ Type: "Action", S: "URI", URI: "https://finflow.best" }),
  });
  page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(annot)]));
  return doc.save({ useObjectStreams: false });
}

/** Aceeași pagină, fără adnotare — perechea de comparat. */
export async function pdfWithoutAnnotation(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText("Vezi anexa", { x: 50, y: 780, size: 12, font });
  return doc.save({ useObjectStreams: false });
}

/**
 * Un scan în care imaginea e JPEG comprimat ÎNCĂ o dată cu Flate — lanțul de filtre
 * `[/FlateDecode /DCTDecode]`, exact cum scriu scanerele de birou (copia patentei din storage
 * vine de pe un Xerox VersaLink B7035). Octeții imaginii NU sunt un JPEG până nu-i decomprimi,
 * iar asta a făcut prima versiune să renunțe la fișier cu „reincodare_esuata".
 */
export async function scannedPdfFlateJpeg(pageCount: number, jpeg: Uint8Array): Promise<Uint8Array> {
  const plain = await scannedPdf(pageCount, jpeg);
  const doc = await PDFDocument.load(plain);
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (obj.dict.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
    const deflated = new Uint8Array(
      await new Response(
        new Blob([obj.contents as unknown as BlobPart]).stream().pipeThrough(new CompressionStream("deflate")),
      ).arrayBuffer(),
    );
    obj.dict.set(PDFName.of("Filter"), doc.context.obj([PDFName.of("FlateDecode"), PDFName.of("DCTDecode")]));
    doc.context.assign(ref, PDFRawStream.of(obj.dict, deflated));
  }
  return doc.save({ useObjectStreams: false });
}
