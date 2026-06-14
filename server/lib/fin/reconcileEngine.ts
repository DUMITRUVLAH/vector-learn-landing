/**
 * CASH-002: Motor de reconciliere automată (determinist, fără AI)
 *
 * Potrivește tranzacțiile bancare importate (`fin_bank_transactions`) cu
 * plățile înregistrate (`fin_payments`) și facturile existente (`fin_invoices`).
 *
 * FIN-CORE regula #4: calculele sunt deterministe în COD. AI DOAR extrage și
 * narrează — NU reconciliează.
 * FIN-CORE regula #5: motorul produce PROPUNERI; utilizatorul confirmă manual
 * din coada `unmatched`.
 *
 * Algoritm de matching (în ordine, primul match câștigă):
 *   1. Sumă exactă + dată ±3 zile + referință substring → matched, scor 1.0
 *   2. Sumă exactă + dată ±7 zile → matched, scor 0.85
 *   3. Referință substring (fără sumă) → candidat, scor 0.6, status rămâne unmatched
 *   4. Niciun match → unmatched, scor 0.0
 *
 * Scor stocat ca basis points (0..10000) pentru compatibilitate PGlite (integer).
 */

export interface InvoiceCandidate {
  id: string;
  totalCents: number;
  dueDate: string | null;
  invoiceNumber: string | null;
}

export interface PaymentCandidate {
  id: string;
  amountCents: number;
  receivedDate: string;
  notes: string | null;
}

export interface TxForReconcile {
  id: string;
  amountCents: number;
  txDate: string; // YYYY-MM-DD
  reference: string | null;
  direction: "in" | "out";
}

export interface ReconcileResult {
  txId: string;
  matchStatus: "matched" | "unmatched";
  matchScoreBp: number; // 0..10000
  matchedPaymentId: string | null;
  matchedInvoiceId: string | null;
}

// ─── Date arithmetic ──────────────────────────────────────────────────────────

function dateDiffDays(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.abs((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Reference matching ───────────────────────────────────────────────────────

function refContains(txRef: string | null, candidateRef: string | null): boolean {
  if (!txRef || !candidateRef) return false;
  const tx = txRef.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cand = candidateRef.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!tx || !cand) return false;
  return tx.includes(cand) || cand.includes(tx);
}

// ─── Main reconcile function ──────────────────────────────────────────────────

/**
 * Reconciliează un set de tranzacții față de plăți și facturi candidate.
 *
 * @param transactions  Tranzacțiile de reconciliat (toate `unmatched`)
 * @param payments      Plățile înregistrate din același tenant
 * @param invoices      Facturile emise din același tenant (pentru matching direct)
 * @returns             Rezultate per tranzacție cu match status și scor
 */
export function reconcile(
  transactions: TxForReconcile[],
  payments: PaymentCandidate[],
  invoices: InvoiceCandidate[]
): ReconcileResult[] {
  return transactions.map((tx) => {
    // Doar tranzacțiile `in` se potrivesc cu plăți/facturi (încasări)
    // Tranzacțiile `out` (cheltuieli) sunt gestionare de SPEND module
    if (tx.direction === "out") {
      return {
        txId: tx.id,
        matchStatus: "unmatched",
        matchScoreBp: 0,
        matchedPaymentId: null,
        matchedInvoiceId: null,
      };
    }

    // ─── Regula 1: Sumă exactă + dată ±3 zile + referință substring ─────────
    for (const inv of invoices) {
      if (
        inv.totalCents === tx.amountCents &&
        inv.dueDate &&
        dateDiffDays(tx.txDate, inv.dueDate) <= 3 &&
        refContains(tx.reference, inv.invoiceNumber)
      ) {
        return {
          txId: tx.id,
          matchStatus: "matched",
          matchScoreBp: 10000, // 1.0
          matchedPaymentId: null,
          matchedInvoiceId: inv.id,
        };
      }
    }

    // ─── Regula 1b: Sumă exactă + dată ±3 zile + ref → cu payment ──────────
    for (const pay of payments) {
      if (
        pay.amountCents === tx.amountCents &&
        dateDiffDays(tx.txDate, pay.receivedDate) <= 3 &&
        refContains(tx.reference, pay.notes)
      ) {
        return {
          txId: tx.id,
          matchStatus: "matched",
          matchScoreBp: 10000,
          matchedPaymentId: pay.id,
          matchedInvoiceId: null,
        };
      }
    }

    // ─── Regula 2: Sumă exactă + dată ±7 zile (fără ref) ───────────────────
    for (const inv of invoices) {
      if (
        inv.totalCents === tx.amountCents &&
        inv.dueDate &&
        dateDiffDays(tx.txDate, inv.dueDate) <= 7
      ) {
        return {
          txId: tx.id,
          matchStatus: "matched",
          matchScoreBp: 8500, // 0.85
          matchedPaymentId: null,
          matchedInvoiceId: inv.id,
        };
      }
    }

    for (const pay of payments) {
      if (
        pay.amountCents === tx.amountCents &&
        dateDiffDays(tx.txDate, pay.receivedDate) <= 7
      ) {
        return {
          txId: tx.id,
          matchStatus: "matched",
          matchScoreBp: 8500,
          matchedPaymentId: pay.id,
          matchedInvoiceId: null,
        };
      }
    }

    // ─── Regula 3: Ref substring (fără sumă) → candidat, rămâne unmatched ───
    for (const inv of invoices) {
      if (refContains(tx.reference, inv.invoiceNumber)) {
        return {
          txId: tx.id,
          matchStatus: "unmatched", // nu-l marcăm matched fără sumă confirmată
          matchScoreBp: 6000, // 0.6 — candidat propus
          matchedPaymentId: null,
          matchedInvoiceId: inv.id,
        };
      }
    }

    // ─── Niciun match ────────────────────────────────────────────────────────
    return {
      txId: tx.id,
      matchStatus: "unmatched",
      matchScoreBp: 0,
      matchedPaymentId: null,
      matchedInvoiceId: null,
    };
  });
}

// ─── Duplicate detection helper ───────────────────────────────────────────────

export interface TxSignature {
  accountLabel: string;
  txDate: string;
  amountCents: number;
  reference: string | null;
}

/**
 * Detectează dacă o tranzacție este duplicat față de o listă existentă.
 * Criterii: (accountLabel, txDate, amountCents, reference) toate egale.
 */
export function isDuplicate(tx: TxSignature, existing: TxSignature[]): boolean {
  return existing.some(
    (e) =>
      e.accountLabel === tx.accountLabel &&
      e.txDate === tx.txDate &&
      e.amountCents === tx.amountCents &&
      e.reference === tx.reference
  );
}
