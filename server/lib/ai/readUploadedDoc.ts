import { extractPdfText } from "./pdfText";
import { extractOfficeText } from "./officeText";

/**
 * Below this many characters a PDF's text layer is treated as absent (a scan often yields a few
 * stray glyphs from a watermark or page number, not content).
 */
export const MIN_USABLE_TEXT_CHARS = 200;

/**
 * Scoate din fișier ce poate citi modelul — ORICE format în care omul are actul.
 *   imagine      → trimisă modelului ca imagine (vision)
 *   PDF          → stratul de text; un PDF SCANAT nu are, deci se trimite PDF-ul însuși
 *   docx / xlsx  → extragere reală de text (sunt ZIP-uri: toString("utf8") dădea gunoi)
 *   csv / txt    → text simplu
 * Un fișier pe care nu-l putem citi ca text tot ajunge la model ca atașament, în loc să eșueze
 * — asta înseamnă „orice tip de act" în practică.
 *
 * Trăiește aici, nu în ruta de prefill, pentru că reconcilierea atașamentelor
 * (`parAttachments.ts`) are nevoie de EXACT aceeași citire: cât timp avea propria variantă cu
 * `toString("utf8")`, un .docx încărcat la dosar era citit ca gunoi binar și verificarea AI
 * raporta „sumă: document 0" pe un act care scria 6000 MDL.
 */
export async function readUploadedDoc(
  buf: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ rawText: string; imageDataUrl?: string; fileDataUrl?: string }> {
  let rawText = "";
  let imageDataUrl: string | undefined;
  let fileDataUrl: string | undefined;
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(fileName);
  try {
    if (mimeType.startsWith("image/")) {
      imageDataUrl = `data:${mimeType};base64,${buf.toString("base64")}`;
    } else if (isPdf) {
      rawText = await extractPdfText(buf);
      if (rawText.trim().length < MIN_USABLE_TEXT_CHARS) {
        fileDataUrl = `data:application/pdf;base64,${buf.toString("base64")}`;
      }
    } else {
      rawText = await extractOfficeText(buf, fileName, mimeType);
    }
  } catch {
    rawText = "";
  }
  return { rawText, imageDataUrl, fileDataUrl };
}
