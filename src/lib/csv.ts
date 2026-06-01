/**
 * CRM-150: Minimal RFC-4180 compliant CSV parser.
 *
 * Handles:
 *  - Quoted fields (double-quote delimited)
 *  - Escaped double-quotes inside quoted fields (`""` → `"`)
 *  - Commas inside quoted fields
 *  - Newlines (CRLF and LF) inside quoted fields
 *  - Trailing CRLF on last row
 *
 * Returns an array of rows, each row being an array of string fields.
 * Empty trailing rows (blank lines) are dropped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Look ahead: `""` is an escaped quote
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        // Closing quote
        inQuotes = false;
        i++;
        continue;
      }
      // Any other character (including commas and newlines) is part of the field
      field += ch;
      i++;
      continue;
    }

    // Not in quotes
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }

    if (ch === "\r") {
      // CRLF or lone CR → end of row
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      if (text[i + 1] === "\n") i++; // consume LF
      i++;
      continue;
    }

    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Push the last field/row if anything remains
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop trailing empty rows (blank lines at EOF)
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === "") {
      rows.pop();
    } else {
      break;
    }
  }

  return rows;
}

/**
 * Parse a string like "360" or "360,50" or "360.50" into integer cents.
 *
 * Rules:
 *  - If string contains both "." and "," treat "." as thousand-separator and "," as decimal separator (European format).
 *  - If string contains only ",", treat it as decimal separator.
 *  - Otherwise treat "." as decimal separator.
 *  - Strips currency symbols, spaces, and "lei"/"RON"/"EUR"/"€" prefixes.
 *
 * Returns 0 on parse failure.
 */
export function parseCurrencyToCents(raw: string): number {
  if (!raw || !raw.trim()) return 0;

  // Strip known currency symbols / words
  let cleaned = raw.trim().replace(/[€$£lei\s]/gi, "").replace(/RON|EUR/gi, "").trim();
  if (!cleaned) return 0;

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasDot && hasComma) {
    // e.g. "1.360,50" — dot = thousand-sep, comma = decimal
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // e.g. "360,50" — comma = decimal
    cleaned = cleaned.replace(",", ".");
  }
  // else dot already is the decimal separator

  const value = parseFloat(cleaned);
  if (isNaN(value)) return 0;
  return Math.round(value * 100);
}

/**
 * Split a tag string on either ";" or "," and return trimmed, non-empty tags.
 */
export function parseTags(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
