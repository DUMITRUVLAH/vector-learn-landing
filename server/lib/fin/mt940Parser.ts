/**
 * CASH-002: Parser MT940 (SWIFT format)
 *
 * MT940 este formatul standard SWIFT pentru extrase bancare.
 * Structura minimă per tranzacție:
 *   :60F: — sold inițial
 *   :61: YYYYMMDD[MMDD]<debit/credit><amount>N<ref>\n<subfield>
 *   :86: <narativ/descriere>
 *   :62F: — sold final
 *
 * Parsăm:
 *   - :61: → dată, sumă, direcție (C=credit/in, D=debit/out), referință
 *   - :86: → narativ (counterparty + reference)
 *
 * Specificație simplificată — acoperim 95% din MT940-urile românești/moldovenești.
 * Câmpuri nerecunoscute sunt ignorate (robust la variații de format).
 *
 * FIN-CORE regula #4: parsare deterministă, fără AI.
 */

import type { CsvTxRow } from "./csvParser";

export type Mt940TxRow = CsvTxRow; // aceeași structură, refolosim tipul

export interface Mt940ParseResult {
  rows: Mt940TxRow[];
  errors: string[];
}

// ─── :61: field parser ────────────────────────────────────────────────────────
//
// Format: :61: YYYYMMDD[MMDD]<D/C/RD/RC><Amt>N<code>\n<refClient>
// Example: :61:2606010601D500,00NONREF\nPlata chirie
//
// Date: 6 or 8 digits (YYMMDD or YYYYMMDD)
// D/C indicator: C = credit (in), D = debit (out), RD = reversal debit, RC = reversal credit
// Amount: e.g. 500,00 (comma as decimal separator in MT940)

const LINE61_RE = /^:61:(\d{6,8})(?:\d{4})?([DC]|R[DC])([\d,]+)N(\S*)/;

function parseAmount61(raw: string): number {
  // MT940 uses comma as decimal separator
  return Math.round(parseFloat(raw.replace(",", ".")) * 100);
}

function parseDate61(raw: string): string {
  if (raw.length === 6) {
    // YYMMDD → 20YYMMDD
    const year = parseInt(raw.slice(0, 2), 10);
    const fullYear = year >= 0 && year <= 50 ? 2000 + year : 1900 + year;
    return `${fullYear}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;
  } else if (raw.length === 8) {
    // YYYYMMDD
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}

// ─── :86: field parser ────────────────────────────────────────────────────────
//
// No standard sub-fields for :86:; banks use proprietary formats.
// We extract the full text as narativ and try to identify counterparty.

function parseNarativ86(raw: string): { counterparty: string | null; reference: string | null } {
  // Try common patterns: "Platitor: X" or "Beneficiar: X"
  const platitorMatch = raw.match(/(?:platitor|pl\.?|beneficiar|ben\.?)[\s:]+([^/\n]+)/i);
  const counterparty = platitorMatch ? platitorMatch[1].trim().slice(0, 200) : null;

  // Try to extract a reference/order number
  const refMatch = raw.match(/(?:ordin|ord\.?|ref\.?|factura|inv\.?)[\s:#]+([^\s/\n]+)/i);
  const reference = refMatch ? refMatch[1].trim().slice(0, 100) : raw.slice(0, 100) || null;

  return { counterparty, reference };
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseMt940(raw: string): Mt940ParseResult {
  const rows: Mt940TxRow[] = [];
  const errors: string[] = [];

  // Split into lines, normalize CRLF
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  let currentRow: Partial<Mt940TxRow> | null = null;
  let narativLines: string[] = [];

  const flush = () => {
    if (!currentRow) return;

    // Parse narativ accumulated so far
    const narativ = narativLines.join(" ").trim();
    if (narativ) {
      const { counterparty, reference } = parseNarativ86(narativ);
      currentRow.counterparty = counterparty;
      if (!currentRow.reference) currentRow.reference = reference;
    }

    // Validate required fields
    if (
      currentRow.txDate &&
      currentRow.amountCents !== undefined &&
      currentRow.direction
    ) {
      rows.push({
        txDate: currentRow.txDate,
        amountCents: currentRow.amountCents,
        currency: currentRow.currency ?? "MDL",
        reference: currentRow.reference ?? null,
        counterparty: currentRow.counterparty ?? null,
        direction: currentRow.direction,
      });
    }

    currentRow = null;
    narativLines = [];
  };

  for (const line of lines) {
    if (line.startsWith(":61:")) {
      flush();
      const match = line.match(LINE61_RE);
      if (match) {
        const [, dateRaw, dcIndicator, amountRaw, refRaw] = match;
        const direction: "in" | "out" = dcIndicator === "C" || dcIndicator === "RC" ? "in" : "out";
        const amountCents = parseAmount61(amountRaw);
        currentRow = {
          txDate: parseDate61(dateRaw),
          amountCents,
          direction,
          reference: refRaw && refRaw !== "NONREF" ? refRaw : null,
          currency: "MDL",
        };
      } else {
        errors.push(`Rândul :61: nu a putut fi parsat: ${line.slice(0, 60)}`);
      }
    } else if (line.startsWith(":86:") && currentRow) {
      narativLines.push(line.slice(4));
    } else if (currentRow && !line.startsWith(":") && line.trim() && narativLines.length > 0) {
      // Continuation line for :86:
      narativLines.push(line.trim());
    } else if (line.startsWith(":62") || line.startsWith(":60")) {
      // Balance tags — flush current row if any
      flush();
    } else if (line.startsWith(":25:") || line.startsWith(":28")) {
      // Account/statement tags — ignore
    }
  }

  // Flush last row
  flush();

  if (rows.length === 0 && errors.length === 0) {
    errors.push("Nu s-a găsit nicio tranzacție în fișierul MT940.");
  }

  return { rows, errors };
}
