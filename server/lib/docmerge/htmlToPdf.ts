/**
 * DOCMERGE-003: HTML → PDF rasterizer (shared lib).
 *
 * Extracted from server/routes/finInvoiceDoc.ts so both finInvoiceDoc
 * and docmerge batch generation reuse the same Playwright logic without
 * duplication.
 *
 * Key design decisions:
 * - Browser is lazily imported (playwright marked external in build-vercel.mjs
 *   so serverless bundles never try to resolve chromium-bidi).
 * - For batch generation, callers should use the BatchRenderer helper to
 *   launch a single browser for the whole batch instead of one per row.
 * - Falls back gracefully when Playwright / Chromium is unavailable
 *   (returns null; caller decides what to do — finInvoiceDoc falls back to HTML).
 */

export type HtmlToPdfResult = Uint8Array | null;

/**
 * Rasterize a single HTML string to an A4 PDF.
 * Launches a NEW browser instance — suitable for one-off conversions.
 * For batch generation (N rows), use BatchPdfRenderer instead.
 *
 * Returns null if Playwright/Chromium is unavailable (caller handles gracefully).
 */
export async function htmlToPdfBuffer(html: string): Promise<HtmlToPdfResult> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      return pdf;
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

/**
 * A reusable browser handle for converting multiple HTML strings to PDFs.
 *
 * Usage:
 *   const renderer = await BatchPdfRenderer.create();
 *   if (!renderer) { handle unavailable } else {
 *     for (const html of htmlPages) { results.push(await renderer.render(html)); }
 *     await renderer.close();
 *   }
 *
 * Keeps a single browser open across the whole batch (Playwright limitation:
 * dozens of parallel launches would exhaust memory/file-descriptors).
 */
export class BatchPdfRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private browser: any;

  private constructor(browser: unknown) {
    this.browser = browser;
  }

  static async create(): Promise<BatchPdfRenderer | null> {
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ args: ["--no-sandbox"] });
      return new BatchPdfRenderer(browser);
    } catch {
      return null;
    }
  }

  async render(html: string): Promise<Uint8Array> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const page = await this.browser.newPage();
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await page.setContent(html, { waitUntil: "networkidle" });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const pdf = (await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      })) as Uint8Array;
      return pdf;
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await page.close();
    }
  }

  async close(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.browser.close();
  }
}
