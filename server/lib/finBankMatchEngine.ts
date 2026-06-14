/**
 * BANKLINK-003: Motor minimal de potrivire tranzacții bancare cu plăți/facturi
 *
 * Reuse-first: dacă server/lib/fin/reconcileEngine.ts este disponibil (importat din feat/FIN-cash)
 * se folosește acela. Altfel, acest motor minimal acoperă cazurile esențiale:
 *
 * Algoritm (determinist, fără AI — FIN-CORE regula #4):
 *   1. Sumă exactă + dată ±7 zile → scor 10000 bp (100%)
 *   2. Sumă exactă + dată ±14 zile → scor 8500 bp (85%)
 *   3. Referință substring (fără sumă exactă) → scor 6000 bp (60%), status rămâne unmatched
 *   4. Niciun match → scor 0
 *
 * Output: propuneri — utilizatorul confirmă manual (FIN-CORE regula #5).
 * Scor în basis points (0..10000) pentru compatibilitate PGlite (integer).
 */

export interface InvoiceCandidate {
  id: string;
  amountCents: number;
  dueDate: string | null; // YYYY-MM-DD
  invoiceNumber: string | null;
  tenantId: string;
}

export interface PaymentCandidate {
  id: string;
  amountCents: number;
  paidAt: string | null; // ISO timestamp
  notes: string | null;
  tenantId: string;
}

export interface BankTxForMatch {
  id: string;
  amountCents: number; // signed: positive=credit, negative=debit
  transactionDate: string; // YYYY-MM-DD
  description: string | null;
  reference: string | null;
}

export interface MatchResult {
  txId: string;
  /** 'matched' if score ≥ 8500 bp (high confidence); 'unmatched' otherwise */
  status: "matched" | "unmatched";
  scoreBp: number; // 0..10000
  sourceType: "invoice" | "payment" | null;
  sourceId: string | null;
}

export interface MatchCandidate {
  id: string;
  type: "invoice" | "payment";
  scoreBp: number;
  scorePercent: number;
  description: string;
  amountCents: number;
  dueDate: string | null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dateDiffDays(a: string, b: string | null): number {
  if (!b) return 9999;
  const da = new Date(a);
  const db = new Date(b);
  return Math.abs((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
}

function isoDatePart(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreInvoice(tx: BankTxForMatch, inv: InvoiceCandidate): number {
  const absTxCents = Math.abs(tx.amountCents);
  const amountMatch = absTxCents === inv.amountCents;
  const dateDiff = dateDiffDays(tx.transactionDate, isoDatePart(inv.dueDate));

  if (amountMatch && dateDiff <= 7) return 10000;
  if (amountMatch && dateDiff <= 14) return 8500;

  // Reference match (loose — description contains invoice number)
  if (
    inv.invoiceNumber &&
    (tx.description?.toLowerCase().includes(inv.invoiceNumber.toLowerCase()) ||
      tx.reference?.toLowerCase().includes(inv.invoiceNumber.toLowerCase()))
  ) {
    return 6000;
  }

  return 0;
}

function scorePayment(tx: BankTxForMatch, pay: PaymentCandidate): number {
  const absTxCents = Math.abs(tx.amountCents);
  const amountMatch = absTxCents === pay.amountCents;
  const payDate = isoDatePart(pay.paidAt);
  const dateDiff = dateDiffDays(tx.transactionDate, payDate);

  if (amountMatch && dateDiff <= 7) return 10000;
  if (amountMatch && dateDiff <= 14) return 8500;

  // Notes match
  if (
    pay.notes &&
    (tx.description?.toLowerCase().includes(pay.notes.toLowerCase()) ||
      tx.reference?.toLowerCase().includes(pay.notes.toLowerCase()))
  ) {
    return 5500;
  }

  return 0;
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export function matchTransaction(
  tx: BankTxForMatch,
  invoices: InvoiceCandidate[],
  payments: PaymentCandidate[]
): MatchResult {
  // Only try to match credit transactions (positive = money received = potential payment)
  if (tx.amountCents <= 0) {
    return { txId: tx.id, status: "unmatched", scoreBp: 0, sourceType: null, sourceId: null };
  }

  let bestScore = 0;
  let bestSourceType: "invoice" | "payment" | null = null;
  let bestSourceId: string | null = null;

  for (const inv of invoices) {
    const score = scoreInvoice(tx, inv);
    if (score > bestScore) {
      bestScore = score;
      bestSourceType = "invoice";
      bestSourceId = inv.id;
    }
  }

  for (const pay of payments) {
    const score = scorePayment(tx, pay);
    if (score > bestScore) {
      bestScore = score;
      bestSourceType = "payment";
      bestSourceId = pay.id;
    }
  }

  // High confidence: auto-mark as matched. Low confidence: leave unmatched but score it.
  const autoMatch = bestScore >= 8500;

  return {
    txId: tx.id,
    status: autoMatch ? "matched" : "unmatched",
    scoreBp: bestScore,
    sourceType: autoMatch ? bestSourceType : null,
    sourceId: autoMatch ? bestSourceId : null,
  };
}

/** Build top-3 candidates for a transaction (for the reconciliation queue UI). */
export function getCandidates(
  tx: BankTxForMatch,
  invoices: InvoiceCandidate[],
  payments: PaymentCandidate[]
): MatchCandidate[] {
  const scored: MatchCandidate[] = [];

  for (const inv of invoices) {
    const scoreBp = scoreInvoice(tx, inv);
    if (scoreBp > 0) {
      scored.push({
        id: inv.id,
        type: "invoice",
        scoreBp,
        scorePercent: Math.round(scoreBp / 100),
        description: inv.invoiceNumber ? `Factură ${inv.invoiceNumber}` : "Factură",
        amountCents: inv.amountCents,
        dueDate: isoDatePart(inv.dueDate),
      });
    }
  }

  for (const pay of payments) {
    const scoreBp = scorePayment(tx, pay);
    if (scoreBp > 0) {
      scored.push({
        id: pay.id,
        type: "payment",
        scoreBp,
        scorePercent: Math.round(scoreBp / 100),
        description: pay.notes ? `Plată: ${pay.notes}` : "Plată înregistrată",
        amountCents: pay.amountCents,
        dueDate: null,
      });
    }
  }

  // Sort by score DESC, take top 3
  return scored.sort((a, b) => b.scoreBp - a.scoreBp).slice(0, 3);
}
