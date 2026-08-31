/**
 * DC-102 — declarația minimă pentru `pdfmake/src/printer.js`.
 *
 * Pachetul publică tipuri doar pentru varianta de browser; varianta de Node (cea care scrie
 * fișierul pe server) e JavaScript curat. Shim-ul descrie exact cât folosim: constructorul cu
 * familiile de font și documentul PDFKit rezultat, care e un flux de octeți.
 */
declare module "pdfmake/src/printer.js" {
  import type { Readable } from "node:stream";

  interface PdfKitDocument extends Readable {
    end(): void;
  }

  export default class PdfPrinter {
    constructor(fontDescriptors: Record<string, Record<string, string>>);
    createPdfKitDocument(
      docDefinition: Record<string, unknown>,
      options?: Record<string, unknown>
    ): PdfKitDocument;
  }
}
