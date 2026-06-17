/**
 * INVOICE-REPORTING (matching) — pure invoice ↔ statement-line matcher.
 *
 * The accountant uploads a bank statement (each transaction → a fin_capture_lines row) and the
 * invoices into the same Invoice Reporting inbox. This scores each candidate line against an
 * uploaded invoice by original-currency amount (strongest signal), vendor-name overlap, and date
 * proximity, returning the best line id + confidence (0..1), or null if no decent match.
 *
 * Kept in its own module (no AI/db imports) so it can be unit-tested without booting PGlite or the
 * AI client. Re-exported from `../ai/statementExtractor` for existing call sites.
 */

export interface LineCandidate {
  id: string;
  origAmount: string | null; // "15.99 EUR"
  amountCents: number; // account-currency cents
  counterparty: string | null;
  description: string;
  txDate: string | null;
}

export interface InvoiceForMatch {
  vendorName: string | null;
  amountMajor: number | null; // invoice total in its own currency, major units (15.99)
  currency: string | null; // "EUR"
  date: string | null; // YYYY-MM-DD
}

export function matchInvoiceToLines(
  inv: InvoiceForMatch,
  lines: LineCandidate[],
): { lineId: string; confidence: number } | null {
  let best: { lineId: string; score: number } | null = null;
  const vendor = (inv.vendorName ?? "").toLowerCase();

  for (const l of lines) {
    let score = 0;
    // 1) Amount + currency from the line's original-currency string ("15.99 EUR").
    if (inv.amountMajor != null && l.origAmount) {
      const m = l.origAmount.match(/([\d.,]+)\s*([A-Z]{3})/);
      if (m) {
        const lineAmt = parseFloat(m[1].replace(",", "."));
        const lineCur = m[2];
        const amtClose = Math.abs(lineAmt - inv.amountMajor) <= 0.02;
        const curOk = !inv.currency || inv.currency.toUpperCase() === lineCur;
        if (amtClose && curOk) score += 0.6;
        else if (amtClose) score += 0.35;
      }
    }
    // 2) Vendor-name overlap (invoice vendor vs the line's counterparty/description).
    const hay = `${l.counterparty ?? ""} ${l.description}`.toLowerCase();
    if (vendor) {
      const tokens = vendor.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
      if (tokens.some((t) => hay.includes(t))) score += 0.3;
    }
    // 3) Date proximity (±5 days).
    if (inv.date && l.txDate) {
      const diff = Math.abs((new Date(inv.date).getTime() - new Date(l.txDate).getTime()) / 86400000);
      if (diff <= 5) score += 0.1;
    }
    if (!best || score > best.score) best = { lineId: l.id, score };
  }

  if (best && best.score >= 0.5) return { lineId: best.lineId, confidence: Math.min(1, best.score) };
  return null;
}
