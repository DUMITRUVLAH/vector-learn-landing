/**
 * TRUST-001: PII Anonymizer for FinDesk AI prompts (FIN-CORE §1.16)
 *
 * Replaces sensitive personal data with placeholder tokens before any text
 * is included in an LLM prompt. This is the GDPR-compliance layer for AI.
 *
 * Tokens used:
 *   [EMAIL]    — e-mail addresses
 *   [PHONE]    — phone numbers (international or local format)
 *   [IBAN]     — IBAN bank account numbers
 *   [IDNO]     — IDNO fiscal codes (13 consecutive digits)
 *   [PERSOANA] — Capitalized full names (2+ consecutive Title Case words)
 *   [CUI]      — Romanian VAT codes (RO + 2-10 digits)
 *
 * Design principles:
 * - Pure function: no side effects, no DB calls, no external dependencies.
 * - Order matters: longer/more specific patterns run first to avoid partial matches.
 * - Each replacement is idempotent: running twice returns the same result.
 * - Conservative: prefer false positives (extra tokens) over false negatives (leaked PII).
 */

// ─── Regex patterns ────────────────────────────────────────────────────────────

/** Standard e-mail addresses */
const EMAIL_RE =
  /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;

/**
 * IBAN — Romanian format: RO + 2 check digits + 4 bank code letters + 16 digits.
 * Also matches IBANs from other countries (2 letters + 2 digits + up to 30 chars).
 */
const IBAN_RE =
  /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g;

/**
 * IDNO — Moldovan/Romanian fiscal identifier: exactly 13 consecutive digits.
 * Preceded and followed by a non-digit or string boundary.
 */
const IDNO_RE = /(?<!\d)\d{13}(?!\d)/g;

/**
 * Phone numbers — international (+373 …) or local (0xxx) formats.
 * Accepts spaces, dashes, and parentheses as separators.
 * Minimum 7 digits.
 */
const PHONE_RE =
  /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{2,4}[\s\-.]?\d{2,9}/g;

/**
 * Romanian VAT code (CUI): RO + 2–10 digits, optionally space-separated.
 */
const CUI_RE = /\bRO\s?\d{2,10}\b/g;

/**
 * Full name detection: 2 or more consecutive capitalized words (Title Case).
 * Deliberately conservative to avoid false positives on German nouns etc.
 * Minimum word length 2 characters.
 */
const FULL_NAME_RE = /\b(?:[A-ZĂÂÎȘȚ][a-zăâîșț]{1,}\s+){1,}[A-ZĂÂÎȘȚ][a-zăâîșț]{1,}\b/g;

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Anonymize PII in a text string by replacing sensitive patterns with tokens.
 *
 * @param text  The raw text to sanitize (may include names, emails, IBANs, etc.)
 * @returns     A copy of the text with PII replaced by safe tokens.
 *
 * @example
 * anonymizePii("Ion Popescu, ion@example.com, IBAN: RO49AAAA1B31007593840000")
 * // → "[PERSOANA], [EMAIL], IBAN: [IBAN]"
 */
export function anonymizePii(text: string): string {
  if (!text) return text;

  let result = text;

  // 1. IBAN first (before phone, since IBANs contain digit sequences)
  result = result.replace(IBAN_RE, "[IBAN]");

  // 2. Email (before phone, emails contain dots/hyphens that could partially match phone)
  result = result.replace(EMAIL_RE, "[EMAIL]");

  // 3. CUI (RO + digits — before IDNO to avoid partial overlap)
  result = result.replace(CUI_RE, "[CUI]");

  // 4. IDNO (13 consecutive digits — after IBAN/CUI to avoid eating their digits)
  result = result.replace(IDNO_RE, "[IDNO]");

  // 5. Phone numbers (after IBAN/IDNO/CUI)
  result = result.replace(PHONE_RE, "[PHONE]");

  // 6. Full names (last, after structural tokens, to avoid matching token text)
  result = result.replace(FULL_NAME_RE, "[PERSOANA]");

  return result;
}

/**
 * Anonymize a structured object's string fields recursively.
 * Useful for anonymizing entire data payloads before logging.
 *
 * @param obj  Any JSON-serializable object.
 * @returns    A deep copy with all string values anonymized.
 */
export function anonymizeObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return anonymizePii(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(anonymizeObject);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k,
        anonymizeObject(v),
      ])
    );
  }
  return obj;
}
