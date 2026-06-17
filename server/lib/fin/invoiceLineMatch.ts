/**
 * INVOICE-REPORTING (matching) — pure invoice ↔ statement-line matcher.
 *
 * The accountant uploads a bank statement (each transaction → a fin_capture_lines row) and the
 * invoices/payment-confirmations into the same Invoice Reporting inbox. We must attribute each
 * invoice to the transaction it pays, tolerant of real-world noise: the invoice date can be a
 * few days off the statement date, the currency may differ (invoice in EUR, statement in MDL),
 * and vendor names vary. The strongest signal is a shared reference/transaction id (e.g. a MAIB
 * confirmation filename "…Transaction #2472…" or a card ref "FACEBK *5KBSL2RWA2"); then amount;
 * then vendor; then date proximity.
 *
 * `scoreInvoiceLine` is the pure per-pair score (0..~1.4, capped at 1 by callers). The match
 * endpoint uses it to build a global best-first 1:1 assignment so each invoice lands on its
 * closest free transaction. Kept free of AI/db imports so it's unit-testable without PGlite.
 */
import { parseAmount } from "./money";

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
  currency: string | null; // "EUR" (advisory only — we match amount currency-agnostically)
  date: string | null; // YYYY-MM-DD
  /** fileName + reference + rawText (lowercased), scanned for a shared transaction id/ref. */
  haystack?: string | null;
}

/** Score at/above which we consider an invoice attributable to a transaction line. */
export const MATCH_THRESHOLD = 0.5;

/**
 * Distinctive reference tokens: alphanumeric runs that mix letters+digits (card refs like
 * "5kbsl2rwa2") or long pure-digit ids (>=10, e.g. a 17-digit MAIB transaction id). Short pure
 * numbers (amounts, dates) are deliberately excluded so they can't create false reference hits.
 */
export function extractRefTokens(text: string): Set<string> {
  const out = new Set<string>();
  const tokens = text.toLowerCase().match(/[a-z0-9]{6,}/g) ?? [];
  for (const t of tokens) {
    const hasLetter = /[a-z]/.test(t);
    const hasDigit = /[0-9]/.test(t);
    if ((hasLetter && hasDigit) || (!hasLetter && t.length >= 10)) out.add(t);
  }
  return out;
}

function daysBetween(a: string, b: string): number {
  const diff = Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
  return Number.isFinite(diff) ? diff : Infinity;
}

/** Pure score for one (invoice, line) pair. Higher = more confident it's the same payment. */
export function scoreInvoiceLine(inv: InvoiceForMatch, l: LineCandidate): number {
  let score = 0;
  const lineHay = `${l.counterparty ?? ""} ${l.description}`;

  // 1) Shared reference / transaction id — near-deterministic. A MAIB confirmation's filename or
  //    text carries the same card ref / transaction id that appears in the statement line.
  if (inv.haystack) {
    const lineRefs = extractRefTokens(lineHay);
    if (lineRefs.size) {
      const invRefs = extractRefTokens(inv.haystack);
      for (const r of lineRefs) {
        if (invRefs.has(r)) {
          score += 0.7;
          break;
        }
      }
    }
  }

  // 2) Amount — currency-agnostic: the AI may read the foreign total ("250.35 EUR") OR an MDL
  //    total off the document, so we accept a close match against EITHER the line's foreign
  //    amount OR its MDL account amount.
  if (inv.amountMajor != null) {
    let amountHit = false;
    if (l.origAmount) {
      const m = l.origAmount.match(/([\d.,]+)\s*([A-Z]{3})/);
      if (m) {
        const foreignAmt = parseAmount(m[1]);
        if (Number.isFinite(foreignAmt) && Math.abs(foreignAmt - inv.amountMajor) <= Math.max(0.02, foreignAmt * 0.01)) {
          amountHit = true;
        }
      }
    }
    if (!amountHit) {
      const mdlAmt = l.amountCents / 100;
      if (Math.abs(mdlAmt - inv.amountMajor) <= Math.max(1, mdlAmt * 0.01)) amountHit = true;
    }
    if (amountHit) score += 0.5;
  }

  // 3) Vendor-name overlap (invoice vendor vs the line's counterparty/description).
  const vendorTokens = (inv.vendorName ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  if (vendorTokens.length) {
    const hay = lineHay.toLowerCase();
    if (vendorTokens.some((t) => hay.includes(t))) score += 0.25;
  }

  // 4) Date proximity — graduated. Statement settlement date often trails the invoice by a few
  //    days, so ±3 days is a strong signal and ±7 a weak one.
  if (inv.date && l.txDate) {
    const d = daysBetween(inv.date, l.txDate);
    if (d <= 3) score += 0.2;
    else if (d <= 7) score += 0.1;
  }

  return score;
}

export function matchInvoiceToLines(
  inv: InvoiceForMatch,
  lines: LineCandidate[],
): { lineId: string; confidence: number } | null {
  let best: { lineId: string; score: number } | null = null;
  for (const l of lines) {
    const score = scoreInvoiceLine(inv, l);
    if (!best || score > best.score) best = { lineId: l.id, score };
  }
  if (best && best.score >= MATCH_THRESHOLD) {
    return { lineId: best.lineId, confidence: Math.min(1, best.score) };
  }
  return null;
}

/**
 * Globally assign invoices to lines best-first, 1:1. Each invoice lands on its highest-scoring
 * free line; a line already taken by a better pair pushes the loser to its next-best free line.
 * This maximises how many invoices map (the goal: every uploaded document finds its transaction).
 * Returns a map of lineId → { invoiceId, confidence }.
 */
export function assignInvoicesToLines<I extends { id: string }>(
  invoices: Array<{ invoice: I; fields: InvoiceForMatch }>,
  lines: LineCandidate[],
): Map<string, { invoiceId: string; confidence: number }> {
  const pairs: Array<{ invoiceId: string; lineId: string; score: number }> = [];
  for (const { invoice, fields } of invoices) {
    for (const l of lines) {
      const score = scoreInvoiceLine(fields, l);
      if (score >= MATCH_THRESHOLD) pairs.push({ invoiceId: invoice.id, lineId: l.id, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const byLine = new Map<string, { invoiceId: string; confidence: number }>();
  const usedInvoices = new Set<string>();
  for (const p of pairs) {
    if (byLine.has(p.lineId) || usedInvoices.has(p.invoiceId)) continue;
    byLine.set(p.lineId, { invoiceId: p.invoiceId, confidence: Math.min(1, p.score) });
    usedInvoices.add(p.invoiceId);
  }
  return byLine;
}
