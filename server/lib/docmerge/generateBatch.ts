/**
 * DOCMERGE-003: Batch PDF generation orchestrator.
 *
 * Given a template bodyHtml, a placeholder→column mapping, and an array of
 * data rows (from the Excel import), produces one PDF per row by:
 *   1. Building a per-row substitution context from the mapping.
 *   2. Calling renderWithContext to fill the template.
 *   3. Rasterizing the HTML to PDF via a single shared Playwright browser.
 *
 * Single browser reuse (AC5): BatchPdfRenderer opens Chromium ONCE and reuses
 * it across all rows, then closes it. This is more efficient than launching
 * one browser per row and avoids hitting OS file-descriptor limits on large batches.
 *
 * XSS prevention (AC2 / T-DOCMERGE-003-2): renderWithContext delegates to
 * renderTemplate, which in turn calls escapeHtml on every value before
 * substitution (see server/db/schema/templates.ts). Values containing
 * <script> or other HTML are thus entity-encoded in the output.
 */

import { renderWithContext } from "./placeholders";
import { BatchPdfRenderer } from "./htmlToPdf";
import { buildDocFileName } from "./zipPdfs";

export interface BatchInput {
  /** Rendered HTML body of the template (full HTML document or fragment). */
  bodyHtml: string;
  /** Map: placeholder name → Excel column header. */
  mapping: Record<string, string>;
  /** Data rows from the Excel file (header → value strings). */
  rows: Record<string, string>[];
  /**
   * Optional: name of the Excel column whose value is used as the
   * human-readable label in the filename (e.g. the recipient's name).
   * Falls back to the row index if not provided or empty.
   */
  fileNameColumn?: string;
  /** Optional filename prefix (default: "Doc"). */
  fileNamePrefix?: string;
}

export interface GeneratedFile {
  name: string;
  pdf: Uint8Array;
}

/**
 * Generate one PDF per row in `rows`, substituting placeholders from `mapping`.
 *
 * Returns an array of { name, pdf } — same length as rows.
 *
 * NOTE: if Playwright/Chromium is unavailable (serverless / no binary), the
 * renderer returns a 0-byte placeholder. Callers MUST check pdf.length > 0
 * or use the "single" delivery mode which falls back to the HTML route.
 */
export async function generateBatch(input: BatchInput): Promise<GeneratedFile[]> {
  const {
    bodyHtml,
    mapping,
    rows,
    fileNameColumn,
    fileNamePrefix = "Doc",
  } = input;

  const renderer = await BatchPdfRenderer.create();

  const results: GeneratedFile[] = [];

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Build substitution context: placeholder → value from this row
      const context: Record<string, string> = {};
      for (const [placeholder, column] of Object.entries(mapping)) {
        context[placeholder] = row[column] ?? "";
      }

      // Substitute placeholders (renderWithContext escapes HTML entities)
      const filledHtml = renderWithContext(bodyHtml, context);

      // Determine PDF filename
      const labelValue =
        fileNameColumn && row[fileNameColumn] ? row[fileNameColumn] : "";
      const fileName = buildDocFileName(i, labelValue, fileNamePrefix);

      if (renderer) {
        const pdf = await renderer.render(filledHtml);
        results.push({ name: fileName, pdf });
      } else {
        // Playwright unavailable — return empty buffer so caller can fallback
        results.push({ name: fileName, pdf: new Uint8Array(0) });
      }
    }
  } finally {
    if (renderer) {
      await renderer.close();
    }
  }

  return results;
}
