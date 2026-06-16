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

// pdfjs-dist se importă LAZY în interiorul funcției (vezi mai jos), NU la top-level.
// Motiv: la încărcarea modulului, pdfjs-dist atinge `DOMMatrix`/`ImageData` (API-uri de
// browser). În bundle-ul serverless (Vercel) acestea nu există → `ReferenceError: DOMMatrix
// is not defined` la load, ceea ce crapă ÎNTREAGA funcție (toate rutele 500, inclusiv login).
// Importul dinamic amână evaluarea până la primul apel real, iar try/catch-ul de mai jos
// transformă orice eșec în "" (text gol) — apelantul cade pe fallback-ul existent.
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
    // Legacy build = fără DOM/worker; importat aici (lazy) — vezi nota de sus.
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
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
