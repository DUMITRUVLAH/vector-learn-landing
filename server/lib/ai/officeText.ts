/**
 * Text extraction for the NON-PDF office formats a user may upload as a supporting act:
 * .docx (Word), .xlsx (Excel) and .csv/.txt.
 *
 * Why: the PAR prefill route used to `buf.toString("utf8")` everything that was not a PDF or an
 * image. For a .docx or .xlsx (both ZIP containers) that yields binary garbage, so the extractor
 * saw no parties, no IBAN and no amount — the user's "am încărcat un act și nu funcționează".
 *
 * Both readers are LAZY (`await import`): `exceljs` at module top-level once took the whole API
 * down on Vercel. See docs/solutions/par-port-and-exceljs-lazy.md.
 *
 * Never throws — an unreadable file returns "" and the caller falls back to the AI file path.
 */

/** Max characters returned; the AI text budget is 14k, so a hard cap keeps payloads sane. */
const MAX_CHARS = 40_000;

function cap(s: string): string {
  return s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) : s;
}

/** True for the ZIP-container Office formats (docx/xlsx) — they start with "PK". */
export function looksLikeZip(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

/** Extract the visible text of a .docx (paragraphs + table cells, in document order). */
export async function extractDocxText(buf: Buffer): Promise<string> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    const parts: string[] = [];
    // The body plus headers/footers (requisites are often printed in a footer).
    const names = Object.keys(zip.files).filter((n) =>
      /^word\/(document|header\d*|footer\d*)\.xml$/.test(n),
    );
    for (const name of names.sort()) {
      const xml = await zip.files[name].async("string");
      parts.push(xmlToText(xml));
    }
    return cap(parts.join("\n").replace(/[ \t]+/g, " ").trim());
  } catch {
    return "";
  }
}

/**
 * Turn WordprocessingML into plain text: `<w:t>` runs are the text, `<w:p>`/`<w:br>`/`<w:tr>`
 * are line breaks, `<w:tab>` and cell ends are spaces. Everything else is dropped.
 */
function xmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/?>/g, " ")
    .replace(/<\/w:tc>/g, " ")
    .replace(/<\/w:p>|<w:br\b[^>]*\/?>|<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n");
}

/** Extract every sheet of an .xlsx as tab-separated rows (headers included). */
export async function extractXlsxText(buf: Buffer): Promise<string> {
  try {
    const { default: ExcelJS } = (await import("exceljs")) as {
      default: typeof import("exceljs");
    };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const lines: string[] = [];
    wb.eachSheet((sheet) => {
      lines.push(`--- ${sheet.name} ---`);
      sheet.eachRow((row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell) => {
          const t = cellText(cell.value);
          if (t) cells.push(t);
        });
        if (cells.length) lines.push(cells.join("\t"));
      });
    });
    return cap(lines.join("\n").trim());
  } catch {
    return "";
  }
}

/** exceljs cell values are unions (richText / formula / hyperlink / date) — flatten to text. */
function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("").trim();
    }
    if (typeof v.text === "string") return v.text.trim();
    if (v.result != null) return cellText(v.result);
    if (typeof v.formula === "string") return "";
  }
  return "";
}

/**
 * Best-effort text for ANY uploaded file that is not a PDF or an image.
 * Recognizes docx/xlsx by extension AND by ZIP magic bytes (browsers sometimes send
 * "application/octet-stream"), and treats everything else as UTF-8 text.
 */
export async function extractOfficeText(
  buf: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const name = fileName.toLowerCase();
  const isDocx =
    /\.docx$/.test(name) ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isXlsx =
    /\.xlsx$/.test(name) ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  if (isDocx) return extractDocxText(buf);
  if (isXlsx) return extractXlsxText(buf);

  if (looksLikeZip(buf)) {
    // Unlabelled ZIP container: try Word first, then Excel.
    const docx = await extractDocxText(buf);
    if (docx.trim().length > 0) return docx;
    return extractXlsxText(buf);
  }

  const text = buf.toString("utf8");
  // Binary files decoded as UTF-8 are mostly replacement chars — reject them so the caller
  // falls back to sending the raw file to the model instead of feeding it noise.
  const replacementRatio =
    text.length === 0 ? 1 : (text.match(/�/g)?.length ?? 0) / text.length;
  return replacementRatio > 0.05 ? "" : cap(text);
}
