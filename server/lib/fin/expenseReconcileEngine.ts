/**
 * Team Docs reconciliation: match OUTGOING bank transactions (money spent) to the
 * invoices/documents teams uploaded (fin_captures). The accountant presses
 * "Synchronize" and sees which bank transactions are MISSING a supporting invoice.
 *
 * This is the expense-side counterpart of reconcileEngine.ts (which handles incoming
 * payments). Matching is deterministic (amount + date + vendor/reference); an optional
 * AI tiebreaker (resolveAmbiguous) only chooses between already amount-equal candidates
 * — it never invents a match (FIN-CORE #4/#5).
 *
 * Scores are basis points (0..10000).
 */

export interface TxToReconcile {
  id: string;
  amountCents: number; // positive magnitude
  txDate: string; // YYYY-MM-DD
  reference: string | null;
  counterparty: string | null;
}

export interface DocCandidate {
  id: string;
  amountCents: number | null;
  expenseDate: string | null; // YYYY-MM-DD
  vendorName: string | null;
  reference: string | null;
}

export interface ExpenseMatch {
  txId: string;
  matchedDocId: string | null;
  matchScoreBp: number;
  status: "matched" | "missing_invoice";
}

function dateDiffDays(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - db) / 86_400_000;
}

function norm(s: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Loose substring match between two free-text fields (vendor/reference). */
function softContains(a: string | null, b: string | null): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y || x.length < 3 || y.length < 3) return false;
  return x.includes(y) || y.includes(x);
}

/**
 * Match each outgoing transaction to the best uploaded document.
 *
 * Rules (first decisive match wins, highest score kept):
 *   - exact amount + date ±3d + vendor/ref overlap  → 1.00
 *   - exact amount + date ±7d                        → 0.85
 *   - exact amount only                              → 0.70
 * A transaction with no amount-equal doc → "missing_invoice".
 * Each doc can only be consumed once (greedy, best score first).
 */
export function reconcileExpenses(
  transactions: TxToReconcile[],
  docs: DocCandidate[],
): ExpenseMatch[] {
  const usedDoc = new Set<string>();

  // Score every (tx, doc) pair, then assign greedily by descending score so the
  // strongest matches claim their document first.
  type Scored = { txId: string; docId: string; score: number };
  const scored: Scored[] = [];

  for (const tx of transactions) {
    for (const doc of docs) {
      if (doc.amountCents == null || doc.amountCents !== tx.amountCents) continue;
      let score = 7000; // exact amount baseline
      const overlap =
        softContains(tx.counterparty, doc.vendorName) ||
        softContains(tx.reference, doc.reference) ||
        softContains(tx.counterparty, doc.reference) ||
        softContains(tx.reference, doc.vendorName);
      const near3 = doc.expenseDate != null && dateDiffDays(tx.txDate, doc.expenseDate) <= 3;
      const near7 = doc.expenseDate != null && dateDiffDays(tx.txDate, doc.expenseDate) <= 7;
      if (near3 && overlap) score = 10000;
      else if (near7) score = 8500;
      scored.push({ txId: tx.id, docId: doc.id, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const txMatch = new Map<string, { docId: string; score: number }>();
  for (const s of scored) {
    if (txMatch.has(s.txId) || usedDoc.has(s.docId)) continue;
    txMatch.set(s.txId, { docId: s.docId, score: s.score });
    usedDoc.add(s.docId);
  }

  return transactions.map((tx) => {
    const m = txMatch.get(tx.id);
    return m
      ? { txId: tx.id, matchedDocId: m.docId, matchScoreBp: m.score, status: "matched" as const }
      : { txId: tx.id, matchedDocId: null, matchScoreBp: 0, status: "missing_invoice" as const };
  });
}

/** Indices of transactions still missing an invoice (the accountant's chase list). */
export function missingInvoiceTxIds(matches: ExpenseMatch[]): string[] {
  return matches.filter((m) => m.status === "missing_invoice").map((m) => m.txId);
}
