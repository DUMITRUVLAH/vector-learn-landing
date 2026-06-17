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

import { parseAmount } from "./money";

export function matchInvoiceToLines(
  inv: InvoiceForMatch,
  lines: LineCandidate[],
): { lineId: string; confidence: number } | null {
  let best: { lineId: string; score: number } | null = null;
  const vendor = (inv.vendorName ?? "").toLowerCase();
  const vendorTokens = vendor.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);

  for (const l of lines) {
    let score = 0;

    // 1) Amount — the strongest signal. We don't capture the invoice's currency, and the AI
    //    may read either the foreign-currency total ("250.35 EUR") OR an MDL total off the
    //    document. So we accept a close match against EITHER the line's foreign-currency amount
    //    (from "250.35 EUR") OR its MDL account amount. This is what makes a Meta/DigitalOcean
    //    invoice actually map to its transaction (the old code only checked the foreign amount
    //    and then penalised the hardcoded "MDL" currency, so almost nothing matched).
    if (inv.amountMajor != null) {
      let amountHit = false;

      // a) foreign-currency amount, e.g. line.origAmount = "250.35 EUR"
      if (l.origAmount) {
        const m = l.origAmount.match(/([\d.,]+)\s*([A-Z]{3})/);
        if (m) {
          const foreignAmt = parseAmount(m[1]);
          if (Number.isFinite(foreignAmt) && Math.abs(foreignAmt - inv.amountMajor) <= 0.02) {
            amountHit = true;
          }
        }
      }
      // b) MDL account amount (covers native-MDL invoices and MDL-only transactions)
      if (!amountHit) {
        const mdlAmt = l.amountCents / 100;
        if (Math.abs(mdlAmt - inv.amountMajor) <= Math.max(1, mdlAmt * 0.01)) amountHit = true;
      }

      if (amountHit) score += 0.6;
    }

    // 2) Vendor-name overlap (invoice vendor vs the line's counterparty/description).
    if (vendorTokens.length) {
      const hay = `${l.counterparty ?? ""} ${l.description}`.toLowerCase();
      if (vendorTokens.some((t) => hay.includes(t))) score += 0.3;
    }
    // 3) Date proximity (±5 days).
    if (inv.date && l.txDate) {
      const diff = Math.abs((new Date(inv.date).getTime() - new Date(l.txDate).getTime()) / 86400000);
      if (Number.isFinite(diff) && diff <= 5) score += 0.1;
    }
    if (!best || score > best.score) best = { lineId: l.id, score };
  }

  if (best && best.score >= 0.5) return { lineId: best.lineId, confidence: Math.min(1, best.score) };
  return null;
}
