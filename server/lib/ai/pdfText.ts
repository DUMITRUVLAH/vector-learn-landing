/**
 * CAPTURE: extragere text din PDF pe server.
 *
 * PDF-urile „digitale" (exportate din Word / generate de programe) au un strat
 * de text real — îl extragem cu pdfjs-dist (deja în deps, fără pachet nou) și-l
 * dăm fluxului AI text existent, ca utilizatorul să NU mai lipească manual textul.
 *
 * PDF scanat (poză) nu are strat de text → întoarce string gol; apelantul cade
 * pe fallback-ul existent (rawText lipit sau nimic). Nu rasterizăm aici (vision
 * pe poze acoperă deja cazul scanat, iar render-ul pe server cere canvas).
 */

// Legacy build = fără DOM/worker; potrivit pentru Node.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { DocumentInitParameters } from "pdfjs-dist/types/src/display/api";

// `disableWorker` rulează pdfjs pe firul principal (necesar în Node, fără worker
// thread), dar nu e în tipul public DocumentInitParameters — îl declarăm explicit
// aici ca să rămânem fără `any`.
type NodeDocParams = DocumentInitParameters & { disableWorker?: boolean };

/** Câte pagini citim cel mult (facturile au 1-3; extrasele pot avea zeci). */
const MAX_PAGES = 20;

/**
 * Extrage textul dintr-un PDF. Întoarce text gol dacă PDF-ul nu are strat de
 * text (scanat) sau dacă parsarea eșuează — niciodată nu aruncă.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const data = new Uint8Array(buffer);
    const params: NodeDocParams = {
      data,
      // În Node rulăm fără worker thread — altfel pdfjs cere un workerSrc.
      disableWorker: true,
      // Fonturile sistemului sunt suficiente pentru extragerea textului.
      useSystemFonts: true,
    };
    const doc = await getDocument(params).promise;

    const pageCount = Math.min(doc.numPages, MAX_PAGES);
    const parts: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) parts.push(line);
    }

    await doc.cleanup();
    return parts.join("\n").trim();
  } catch {
    return "";
  }
}
