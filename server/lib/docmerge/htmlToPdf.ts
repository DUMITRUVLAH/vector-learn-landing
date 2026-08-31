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
/**
 * Opțiuni de tipărire. Implicit rămân cele de dinainte (fără antet/subsol, marje zero), ca
 * generarea în masă să nu-și schimbe rezultatul; actele (DG-112) cer antet, subsol cu numerotare
 * și marje reale de document oficial.
 */
export interface HtmlToPdfOptions {
  headerTemplate?: string;
  footerTemplate?: string;
  displayHeaderFooter?: boolean;
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
}


/**
 * SECURITY (audit 2026-08-29) — SSRF / citire de fișiere locale prin șabloanele de acte.
 *
 * `page.setContent(html)` randează HTML scris de utilizator (`docmergeTemplates.bodyHtml`) într-un
 * Chromium pornit cu `--no-sandbox`. Fără filtru, un `<img src="file:///etc/passwd">` sau un fetch
 * către `http://169.254.169.254/` (metadatele instanței) pleacă din server, cu rețeaua lui. Pe
 * Vercel Chromium lipsește, deci acolo nu se exploata; pe self-host/Docker/dev, da.
 *
 * Regula: pagina are voie să încarce DOAR `data:` și `https:` către internetul public. Orice
 * `file:`, orice IP privat/loopback/link-local și orice schemă exotică sunt refuzate în `route`.
 */
const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|metadata\.google\.internal)/i;

export function isAllowedResourceUrl(rawUrl: string): boolean {
  if (rawUrl.startsWith("data:")) return true;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol === "about:" || u.protocol === "blob:") return true;
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (PRIVATE_HOST.test(u.hostname)) return false;
  return true;
}

/** Aplică filtrul de mai sus pe o pagină Playwright. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lockDownPage(page: any): Promise<void> {
  await page.route("**/*", (route: any) => {
    const url = route.request().url();
    if (isAllowedResourceUrl(url)) return route.continue();
    console.warn("[htmlToPdf] resursă blocată:", url.slice(0, 120));
    return route.abort();
  });
}

export async function htmlToPdfBuffer(
  html: string,
  options: HtmlToPdfOptions = {}
): Promise<HtmlToPdfResult> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await lockDownPage(page);
      await page.setContent(html, { waitUntil: "networkidle" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: options.displayHeaderFooter ?? false,
        ...(options.headerTemplate ? { headerTemplate: options.headerTemplate } : {}),
        ...(options.footerTemplate ? { footerTemplate: options.footerTemplate } : {}),
        margin: options.margin ?? { top: "0", right: "0", bottom: "0", left: "0" },
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
      // Același filtru ca în `htmlToPdfBuffer` — șablonul e HTML scris de utilizator.
      await lockDownPage(page);
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
