/**
 * PAR-SEC-001 — pattern-based PII redaction for AI prompts.
 *
 * The name-based `pseudonymize.ts` masks identifiers you ALREADY know. For OCR
 * extraction we don't know them yet (we're extracting them), so we redact by
 * PATTERN: Moldova IBANs and 13-digit IDNP/IDNO numbers are replaced with a
 * placeholder before the text is sent to an external LLM. The model can still
 * read the vendor name, amount and date (which don't need the IBAN), and the
 * sensitive account/ID numbers never leave the server.
 *
 * Gated by the tenant's `fin_data_settings.pseudonymizeAiPrompts` (default true).
 */

/** Moldova IBAN: MD + 2 digits + 20 alphanumerics. Also catches spaced groups. */
const IBAN_RE = /\bMD\d{2}[A-Z0-9]{20}\b/gi;

/**
 * IDNP / IDNO: a standalone run of exactly 13 digits. Bounded by non-digits so
 * we don't clip a longer number. Amounts rarely have 13 contiguous digits, so
 * this is safe for financial OCR text.
 */
const ID13_RE = /(?<!\d)\d{13}(?!\d)/g;

export interface RedactResult {
  text: string;
  redactedCount: number;
}

/**
 * Replace IBAN and 13-digit ID patterns with tokens. Returns the redacted text
 * and how many spans were masked (for the audit trail / UI note).
 */
export function redactPii(text: string): RedactResult {
  let count = 0;
  let out = text.replace(IBAN_RE, () => {
    count++;
    return "[IBAN_REDACTED]";
  });
  out = out.replace(ID13_RE, () => {
    count++;
    return "[ID_REDACTED]";
  });
  return { text: out, redactedCount: count };
}
