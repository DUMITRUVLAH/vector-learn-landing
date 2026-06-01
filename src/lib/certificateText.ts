/**
 * DIPLOMA-802 — Certificate text utilities
 *
 * Ported from copy-roas src/pages/DiplomaGenerator.tsx:
 *   - normalizeCertificateText: trims + collapses whitespace, NFC normalizes for diacritics
 *   - wrapText: canvas word-wrap at maxWidth
 */

/**
 * Normalize text pasted from Excel: NFC diacritics, trim, collapse internal whitespace.
 */
export function normalizeCertificateText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Minimal interface for text measurement — subset of CanvasRenderingContext2D.measureText */
export interface TextMeasurer {
  measureText(text: string): { width: number };
}

/**
 * Break `text` into lines that fit within `maxWidth` pixels using the given canvas context.
 * Returns an array of line strings.
 */
export function wrapText(
  ctx: TextMeasurer,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}
