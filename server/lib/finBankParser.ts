/**
 * BANKLINK-001: OFX/MT940 bank statement file parsers
 *
 * parseOFX(text) — parses OFX 1.x SGML format (used by most MD/RO banks' online portals)
 * parseMT940(text) — parses SWIFT MT940 bank statement format
 *
 * Both return ParsedBankTransaction[] ready for DB insert.
 *
 * OFX 1.x format reference: https://financialdataexchange.org/
 * MT940 format: SWIFT Field Sequences B/C, :60F: opening balance, :61: statement line, :86: info
 */

import type { ParsedBankTransaction } from "../db/schema/finBankLink";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert OFX date string (YYYYMMDD or YYYYMMDDHHMMSS or YYYYMMDD[+-]hhmm) to YYYY-MM-DD.
 */
function parseOFXDate(raw: string): string {
  const digits = raw.replace(/[-\s\[\]TZ+:.]/g, "").slice(0, 8);
  if (digits.length < 8) return new Date().toISOString().slice(0, 10);
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * Convert MT940 date string (YYMMDD) to YYYY-MM-DD.
 */
function parseMT940Date(raw: string): string {
  const y = raw.slice(0, 2);
  const m = raw.slice(2, 4);
  const d = raw.slice(4, 6);
  // MT940 uses 2-digit years; assume 2000s for 00-29, 1900s for 30-99
  const fullYear = parseInt(y, 10) < 30 ? `20${y}` : `19${y}`;
  return `${fullYear}-${m}-${d}`;
}

/**
 * Convert OFX amount string ("1234.56" or "-1234.56") to cents (integer).
 * Positive = credit (inflow), Negative = debit (outflow).
 */
function parseAmountCents(raw: string): number {
  const normalized = raw.replace(",", ".").trim();
  const dollars = parseFloat(normalized);
  if (isNaN(dollars)) return 0;
  return Math.round(dollars * 100);
}

/**
 * Extract OFX tag value: given `<TAGNAME>VALUE`, returns `VALUE`.
 * Handles optional closing tag `</TAGNAME>` and inline whitespace.
 */
function ofxTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\r\n]+)`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

// ─── OFX Parser ───────────────────────────────────────────────────────────────

/**
 * Parse an OFX 1.x SGML bank statement.
 *
 * The OFX 1.x format (as exported by most Moldovan/Romanian banks) looks like:
 *   <OFX>
 *     <BANKMSGSRSV1>
 *       <STMTTRNRS>
 *         <STMTRS>
 *           <BANKTRANLIST>
 *             <STMTTRN>
 *               <TRNTYPE>CREDIT
 *               <DTPOSTED>20260601
 *               <TRNAMT>150000.00
 *               <FITID>202606011234
 *               <NAME>Plata student Maria
 *               <MEMO>Ref 12345
 *             </STMTTRN>
 *           </BANKTRANLIST>
 */
export function parseOFX(text: string): ParsedBankTransaction[] {
  const transactions: ParsedBankTransaction[] = [];

  // Find all STMTTRN blocks
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = trnRegex.exec(text)) !== null) {
    const block = match[1];

    const fitid = ofxTag(block, "FITID");
    const dtposted = ofxTag(block, "DTPOSTED");
    const dtavail = ofxTag(block, "DTAVAIL");
    const trnamt = ofxTag(block, "TRNAMT");
    const name = ofxTag(block, "NAME");
    const memo = ofxTag(block, "MEMO");
    const checknum = ofxTag(block, "CHECKNUM");

    if (!fitid || !trnamt) continue; // Skip malformed transactions

    const amountCents = parseAmountCents(trnamt);

    transactions.push({
      externalId: fitid,
      transactionDate: dtposted ? parseOFXDate(dtposted) : new Date().toISOString().slice(0, 10),
      valueDate: dtavail ? parseOFXDate(dtavail) : null,
      amountCents,
      description: memo ?? name ?? null,
      counterpartyName: name ?? null,
      reference: checknum ?? memo ?? null,
    });
  }

  return transactions;
}

// ─── MT940 Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a SWIFT MT940 bank statement.
 *
 * MT940 structure (relevant lines):
 *   :20: Transaction reference number
 *   :25: Account identification
 *   :28C: Statement number/sequence
 *   :60F: Opening balance (D/C YYMMDD CURRENCY AMOUNT)
 *   :61: Statement line (YYMMDD[YYDDMM] D/RD/C/RC AMOUNT[S/N/F/...] <REF> //<COUNTERPARTY REF>)
 *   :86: Information to account owner (counterparty details, reference, etc.)
 *
 * Each :61: line is one transaction. The immediately following :86: line provides details.
 */
export function parseMT940(text: string): ParsedBankTransaction[] {
  const transactions: ParsedBankTransaction[] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  let currentTxn: Partial<ParsedBankTransaction> | null = null;
  let info86Lines: string[] = [];

  function flush() {
    if (currentTxn?.externalId && currentTxn?.transactionDate) {
      // Merge :86: info lines into description
      const info = info86Lines.join(" ").trim() || null;
      transactions.push({
        externalId: currentTxn.externalId,
        transactionDate: currentTxn.transactionDate,
        valueDate: currentTxn.valueDate ?? null,
        amountCents: currentTxn.amountCents ?? 0,
        description: info ?? currentTxn.description ?? null,
        counterpartyName: currentTxn.counterpartyName ?? null,
        reference: currentTxn.reference ?? null,
      });
    }
    currentTxn = null;
    info86Lines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // :61: — Statement line (transaction)
    // Format: :61:VDVD[VDVD]DCAmountFType[Reference]CRLF[//<Counterparty>]
    // VD = value date (YYMMDD), VD2 = entry date (MMDD optional), D/C = debit/credit indicator,
    // Amount in decimal with comma, F/N/S = account servicing reference type, Reference.
    if (line.startsWith(":61:")) {
      flush(); // save previous

      const body = line.slice(4);
      // Parse: YYMMDD[MMDD]D/C[R]Amount<SwiftCode><Ref>
      // Flexible regex: date(6) optional-date(4) dc-indicator amount-with-comma optional-ref
      const m61 = body.match(
        /^(\d{6})(\d{4})?([DC]R?)([A-Z]?)([0-9,]+)([A-Z]{4})?(.*)$/
      );

      if (!m61) {
        // Fallback: treat as unknown transaction
        currentTxn = {
          externalId: `MT940-${Date.now()}-${i}`,
          transactionDate: new Date().toISOString().slice(0, 10),
          amountCents: 0,
        };
        continue;
      }

      const [, vd, , dcIndicator, , amountRaw, , refRaw] = m61;

      const valueDate = parseMT940Date(vd);
      // Credit indicators: C, CR → positive. Debit indicators: D, DR → negative.
      const isDebit = dcIndicator.startsWith("D");
      const amountAbs = parseAmountCents(amountRaw.replace(",", "."));
      const amountCents = isDebit ? -amountAbs : amountAbs;

      // Reference: after Swift code, up to 16 chars, then optional //<counterparty>
      const refMatch = refRaw?.match(/^([^\n/]{0,16})?(?:\/\/(.*))?$/);
      const reference = refMatch?.[1]?.trim() || null;
      const counterpartyRef = refMatch?.[2]?.trim() || null;

      // Generate a unique external ID: combine value date + amount + index
      const externalId = `MT940-${valueDate}-${amountCents}-${i}`;

      currentTxn = {
        externalId,
        transactionDate: valueDate,
        valueDate,
        amountCents,
        description: null,
        counterpartyName: counterpartyRef,
        reference,
      };
      info86Lines = [];
      continue;
    }

    // :86: — Information to account owner (narrative about the preceding :61: line)
    if (line.startsWith(":86:")) {
      if (currentTxn) {
        info86Lines.push(line.slice(4));
      }
      continue;
    }

    // Multi-line :86: continuation (lines starting with spaces after :86:)
    if (currentTxn && info86Lines.length > 0 && line && !line.startsWith(":")) {
      info86Lines.push(line);
      continue;
    }

    // Other MT940 tags: flush when we see a new record marker
    if (line.startsWith(":20:") || line.startsWith(":25:") || line === "-}") {
      if (currentTxn) flush();
    }
  }

  flush(); // flush last transaction

  return transactions;
}
