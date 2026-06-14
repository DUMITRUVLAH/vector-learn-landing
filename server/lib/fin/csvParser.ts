/**
 * CASH-002: Parser extras bancar CSV
 *
 * Format așteptat (header auto-detectat, delimiter virgulă sau punct și virgulă):
 *   date, amount, currency, reference, counterparty, direction
 *
 * Alternative denumiri de coloane recunoscute:
 *   date:        date, data, tx_date, tranzactie_data, value_date
 *   amount:      amount, suma, valoare, debit_credit
 *   currency:    currency, valuta, ccy
 *   reference:   reference, referinta, descriere, narativ, details, memo
 *   counterparty: counterparty, partener, beneficiar, platitor, name
 *   direction:   direction, tip, debit_credit (debit=out, credit=in)
 *
 * FIN-CORE regula #4: parsarea este deterministă — fără AI.
 * FIN-CORE regula #10: banii în cenți (integer).
 */

export interface CsvTxRow {
  txDate: string;        // YYYY-MM-DD
  amountCents: number;   // positive integer
  currency: string;      // ISO 4217
  reference: string | null;
  counterparty: string | null;
  direction: "in" | "out";
}

export interface CsvParseResult {
  rows: CsvTxRow[];
  errors: string[];
}

// ─── Column name aliases ──────────────────────────────────────────────────────

const DATE_ALIASES = ["date", "data", "tx_date", "tranzactie_data", "value_date", "dat"];
const AMOUNT_ALIASES = ["amount", "suma", "valoare", "sum", "amount_cents", "debit_credit"];
const CURRENCY_ALIASES = ["currency", "valuta", "ccy", "cur"];
const REFERENCE_ALIASES = ["reference", "referinta", "ref", "descriere", "narativ", "details", "memo", "description"];
const COUNTERPARTY_ALIASES = ["counterparty", "partener", "beneficiar", "platitor", "name", "cp", "contra"];
const DIRECTION_ALIASES = ["direction", "tip", "dir", "type", "debit_credit"];

function findCol(header: string[], aliases: string[]): number {
  const lower = header.map((h) => h.toLowerCase().trim().replace(/[^a-z_]/g, "_"));
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx !== -1) return idx;
  }
  // Partial match
  for (const alias of aliases) {
    const idx = lower.findIndex((h) => h.includes(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

function parseDate(raw: string): string | null {
  raw = raw.trim();
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD/MM/YYYY or DD.MM.YYYY
  const dmy = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  // Try JS Date
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// ─── Amount parsing ───────────────────────────────────────────────────────────

function parseAmountCents(raw: string): number | null {
  // Remove thousands separators (space, dot if followed by 3 digits at end)
  let cleaned = raw.trim().replace(/\s/g, "");
  // Handle "1.234,56" (European) → "1234.56"
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Handle "1,234.56" (American) → "1234.56"
    cleaned = cleaned.replace(/,(?=\d{3})/g, "").replace(",", ".");
  }
  // Remove trailing currency codes
  cleaned = cleaned.replace(/[A-Z]{3}$/i, "").trim();
  // Negative amounts = out direction (we take absolute value)
  const negative = cleaned.startsWith("-");
  if (negative) cleaned = cleaned.slice(1);

  const num = parseFloat(cleaned);
  if (isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

// ─── Direction parsing ────────────────────────────────────────────────────────

function parseDirection(raw: string | undefined, amount?: number): "in" | "out" {
  if (!raw) return amount != null && amount < 0 ? "out" : "in";
  const v = raw.toLowerCase().trim();
  if (["out", "debit", "d", "iesite", "iesire", "cheltuiala", "-"].includes(v)) return "out";
  if (["in", "credit", "c", "intrare", "incasare", "+"].includes(v)) return "in";
  return "in"; // default
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseCsv(raw: string): CsvParseResult {
  const rows: CsvTxRow[] = [];
  const errors: string[] = [];

  // Detect delimiter
  const firstLine = raw.split("\n")[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    errors.push("CSV trebuie să aibă cel puțin un header și un rând de date.");
    return { rows, errors };
  }

  // Parse header
  const header = lines[0].split(delimiter).map((h) => h.replace(/^"|"$/g, "").trim());

  const dateIdx = findCol(header, DATE_ALIASES);
  const amountIdx = findCol(header, AMOUNT_ALIASES);
  const currencyIdx = findCol(header, CURRENCY_ALIASES);
  const referenceIdx = findCol(header, REFERENCE_ALIASES);
  const counterpartyIdx = findCol(header, COUNTERPARTY_ALIASES);
  const directionIdx = findCol(header, DIRECTION_ALIASES);

  if (dateIdx === -1) errors.push("Coloana 'date' nu a fost găsită în header.");
  if (amountIdx === -1) errors.push("Coloana 'amount' nu a fost găsită în header.");

  if (dateIdx === -1 || amountIdx === -1) return { rows, errors };

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map((c) => c.replace(/^"|"$/g, "").trim());
    const rawDate = cells[dateIdx] ?? "";
    const rawAmount = cells[amountIdx] ?? "";

    const txDate = parseDate(rawDate);
    if (!txDate) {
      errors.push(`Rândul ${i + 1}: data '${rawDate}' nu a putut fi parsată.`);
      continue;
    }

    const amountCents = parseAmountCents(rawAmount);
    if (amountCents === null) {
      errors.push(`Rândul ${i + 1}: suma '${rawAmount}' nu a putut fi parsată.`);
      continue;
    }

    const rawDir = directionIdx !== -1 ? cells[directionIdx] : undefined;
    const direction = parseDirection(rawDir);
    const currency = currencyIdx !== -1 && cells[currencyIdx] ? cells[currencyIdx].toUpperCase() : "MDL";
    const reference = referenceIdx !== -1 ? (cells[referenceIdx] ?? null) || null : null;
    const counterparty = counterpartyIdx !== -1 ? (cells[counterpartyIdx] ?? null) || null : null;

    rows.push({ txDate, amountCents, currency, reference, counterparty, direction });
  }

  return { rows, errors };
}
