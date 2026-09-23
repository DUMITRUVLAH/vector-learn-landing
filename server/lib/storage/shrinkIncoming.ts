/**
 * Micșorarea octeților care ajung la noi PRIN server, înainte de a-i pune în Storage.
 *
 * Cele mai multe încărcări nu trec pe aici: browserul urcă binarul direct în Storage printr-un
 * URL semnat, iar micșorarea se face la el, în `src/lib/upload/compressForUpload.ts`. Rămân însă
 * câteva drumuri pe care conținutul chiar ajunge la funcția noastră (portalul clientului, calea
 * veche cu data-URL), iar dacă ele n-ar comprima nimic, regula „ce intră în Storage e micșorat"
 * ar fi adevărată doar „de obicei" — adică n-ar fi o regulă.
 *
 * Aici se face DOAR trecerea fără pierderi: Node nu are canvas, deci reîncodarea scanurilor
 * (care e treaba browserului) nu se poate face pe server. Actele semnate electronic nu se ating
 * niciodată — vezi `src/lib/upload/signedDocs.ts`.
 *
 * Nimic din ce e aici nu are voie să strice o încărcare: orice eroare întoarce octeții primiți.
 */
import { isSignedPdf } from "../../../src/lib/upload/signedDocs";

/** Sub atât nu merită efortul — aceeași cifră ca la micșorarea din browser. */
const MIN_BYTES = 300 * 1024;
const MIN_GAIN = 0.15;

export async function shrinkIncomingBytes(bytes: Buffer, fileName: string, mime: string): Promise<Buffer> {
  try {
    if (mime !== "application/pdf" && !/\.pdf$/i.test(fileName)) return bytes;
    if (bytes.byteLength < MIN_BYTES) return bytes;
    const view = new Uint8Array(bytes);
    if (isSignedPdf(view, fileName)) return bytes;

    // Import dinamic: `pdf-lib` n-are ce căuta în graful de pornire al funcției serverless
    // (lecția exceljs din CLAUDE.md §3.5.1 — un import static a scos toată API-ul din priză).
    const { shrinkPdfStreams } = await import("../../../src/lib/upload/pdfShrink");
    const result = await shrinkPdfStreams(view);
    if (!result.bytes || result.bytes.length > bytes.byteLength * (1 - MIN_GAIN)) return bytes;
    return Buffer.from(result.bytes);
  } catch {
    return bytes;
  }
}
