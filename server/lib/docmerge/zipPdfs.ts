/**
 * DOCMERGE-003: ZIP packaging for batch-generated PDFs.
 *
 * Uses jszip (already a dependency — server uses it lazily to avoid
 * top-level import issues in serverless environments).
 *
 * Naming logic mirrors buildCertificateFileName from src/lib/certificateZip.ts
 * but adapted for docmerge output (prefix "Doc_", zero-padded index).
 */

/** Invalid filename characters on Windows / macOS / Linux */
const INVALID_CHARS = /[/:*?"<>|\\]/g;

/**
 * Build a safe PDF filename for a batch-generated document.
 *
 * @param index    0-based position in the batch
 * @param rowLabel Human-readable label from the fileNameColumn (may be empty)
 * @param prefix   Optional prefix (default: "Doc")
 */
export function buildDocFileName(
  index: number,
  rowLabel: string,
  prefix = "Doc"
): string {
  const n = String(index + 1).padStart(3, "0");
  const safeLabel = rowLabel
    .replace(INVALID_CHARS, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return safeLabel
    ? `${prefix}_${n}_${safeLabel}.pdf`
    : `${prefix}_${n}.pdf`;
}

export interface PdfEntry {
  name: string;
  pdf: Buffer | Uint8Array;
}

/**
 * Pack an array of PDFs into a ZIP archive.
 * Returns the ZIP as a Node.js Buffer.
 *
 * jszip is dynamically imported to avoid breaking serverless bundles
 * (same pattern as server/lib/par/excelExport.ts).
 */
export async function buildPdfZip(files: PdfEntry[]): Promise<Buffer> {
  const { default: JSZip } = (await import("jszip")) as {
    default: typeof import("jszip");
  };
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.name, f.pdf);
  }
  const buffer = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;
  return buffer;
}
