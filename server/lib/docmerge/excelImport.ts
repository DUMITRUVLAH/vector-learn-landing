/**
 * DOCMERGE-002: Excel workbook parser for Document Merge.
 *
 * CRITICAL: exceljs MUST be imported dynamically (lazy) — a top-level import
 * caused a prod outage (whole API down). See docs/solutions/par-port-and-exceljs-lazy.md.
 *
 * Uses the same lazy-import pattern as server/lib/par/excelExport.ts.
 */
import type ExcelJS from "exceljs";

const MAX_ROWS = 5000;

export interface ParsedWorkbook {
  headers: string[];
  /** Up to 5 sample rows (first 5) for the UI preview. */
  sample: Record<string, string>[];
  /** First 200 rows for the row-preview step. */
  previewRows: Record<string, string>[];
  rowCount: number;
}

/**
 * Parse the first worksheet of an Excel buffer.
 * Row 1 = headers; rows 2-N = data.
 * All values are coerced to strings.
 * Throws if rowCount > MAX_ROWS.
 */
export async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const { default: ExcelJSRuntime } = (await import("exceljs")) as {
    default: typeof ExcelJS;
  };

  const wb = new ExcelJSRuntime.Workbook();
  await wb.xlsx.load(buffer);

  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Niciun worksheet găsit în fișierul Excel.");

  const allRows: ExcelJS.Row[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    allRows.push(row);
  });

  if (allRows.length === 0) {
    return { headers: [], sample: [], previewRows: [], rowCount: 0 };
  }

  // Extract headers from first row
  const headerRow = allRows[0];
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    headers.push(String(cell.value ?? "").trim());
  });

  const dataRows = allRows.slice(1);
  if (dataRows.length > MAX_ROWS) {
    throw new Error(
      `Fișierul conține ${dataRows.length} rânduri. Limita maximă este ${MAX_ROWS} rânduri per import.`
    );
  }

  const rowCount = dataRows.length;
  const allDataObjects = dataRows.map((row) => rowToObject(row, headers));
  const sample = allDataObjects.slice(0, 5);
  const previewRows = allDataObjects.slice(0, 200);

  return { headers, sample, previewRows, rowCount };
}

/**
 * Auto-map placeholder names to Excel column headers by name similarity.
 * Case-insensitive, diacritics-stripped comparison.
 * Returns partial mapping (only confirmed matches; unmatched placeholders are omitted).
 */
export function autoMap(
  headers: string[],
  placeholders: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const ph of placeholders) {
    const normalPh = normalizeKey(ph);
    const match = headers.find((h) => normalizeKey(h) === normalPh);
    if (match) {
      mapping[ph] = match;
    }
  }
  return mapping;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToObject(row: ExcelJS.Row, headers: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((header, idx) => {
    const cell = row.getCell(idx + 1);
    obj[header] = cellToString(cell);
  });
  return obj;
}

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    // Date
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    // RichText
    if ("richText" in v) {
      return (v as { richText: { text: string }[] }).richText
        .map((rt) => rt.text)
        .join("");
    }
    // Formula result
    if ("result" in v) {
      const r = (v as { result: unknown }).result;
      return r !== null && r !== undefined ? String(r) : "";
    }
  }
  return String(v);
}

/** Normalize a key for comparison: lowercase, strip diacritics, remove spaces */
function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "");
}
