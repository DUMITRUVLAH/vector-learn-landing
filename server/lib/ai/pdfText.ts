/**
 * CAPTURE: extragere text din PDF pe server.
 *
 * PDF-urile „digitale" (exportate din Word / generate de programe, ex. extrasele MAIB)
 * au un strat de text real — îl extragem cu `unpdf` și-l dăm fluxului AI, ca utilizatorul
 * să NU mai lipească manual textul.
 *
 * De ce `unpdf` și nu `pdfjs-dist` direct: pdfjs-dist atinge API-uri de browser
 * (DOMMatrix/ImageData) și, când e împachetat de esbuild în bundle-ul serverless (Vercel),
 * importul `legacy/build/pdf.mjs` se rupe → extractPdfText întorcea "" → extrasele bancare
 * extrăgeau 0 tranzacții. `unpdf` e o distribuție serverless-first a pdfjs (fără globale de
 * browser) care se împachetează curat pe Vercel/edge. Vezi backlog/specs/INVOICE-REPORTING.md.
 *
 * PDF scanat (poză) nu are strat de text → întoarce string gol; apelantul cade pe fallback
 * (vision pe poze / rawText lipit). Nu aruncă niciodată.
 */

/** Câte pagini citim cel mult (facturile au 1-3; extrasele pot avea zeci). */
const MAX_PAGES = 20;

/**
 * Extrage textul dintr-un PDF. Întoarce text gol dacă PDF-ul nu are strat de
 * text (scanat) sau dacă parsarea eșuează — niciodată nu aruncă.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Lazy import keeps module load cheap and avoids any top-level evaluation cost.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const full = Array.isArray(text) ? text.join("\n") : String(text ?? "");
    // Cap to a sane size (very long statements) and normalize whitespace.
    return full.split("\n").slice(0, MAX_PAGES * 200).join("\n").replace(/[ \t]+/g, " ").trim();
  } catch (err) {
    console.error("[extractPdfText] failed:", err instanceof Error ? err.message : String(err));
    return "";
  }
}
