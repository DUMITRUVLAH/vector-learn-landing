/**
 * VM4-02b — ce vede coada de finanțe, ca regulă pură (ruta și testele citesc din același loc,
 * nu din două copii care pot să divergă).
 *
 * Regula:
 *   - doar `execute_payment` (obtain_quotations / provide_estimate se închid la 'approved');
 *   - statusurile de lucru: approved | in_finance | reapproval_required;
 *   - o cerere întoarsă la solicitant (`changes_requested`) rămâne vizibilă DOAR dacă FINANȚELE
 *     sunt cele care au refuzat plata (eveniment de audit `finance_returned`). O cerere întoarsă
 *     de un aprobator n-a ajuns niciodată la finanțe și în coadă ar fi doar zgomot.
 *
 * CORE: backlog/par/PAR-CORE.md §0.16, §4
 */

/** Statusurile în care o cerere așteaptă lucru din partea finanțelor. */
export const FINANCE_QUEUE_ACTIVE_STATUSES = [
  "approved",
  "in_finance",
  "reapproval_required",
] as const;

/** Statusul în care ajunge o cerere după ce finanțele au refuzat plata (POST /:id/finance-return). */
export const FINANCE_RETURNED_STATUSES = ["changes_requested"] as const;

/** Statusurile interogate de coadă, înainte de filtrul „cine a refuzat". */
export const FINANCE_QUEUE_STATUSES = [
  ...FINANCE_QUEUE_ACTIVE_STATUSES,
  ...FINANCE_RETURNED_STATUSES,
] as const;

/** Evenimentul de audit scris de POST /api/par/:id/finance-return. */
export const FINANCE_RETURN_EVENT = "finance_returned";

export interface FinanceQueueCandidate {
  purpose: string;
  status: string;
}

/** True dacă statusul e cel al unei cereri întoarse la solicitant. */
export function isFinanceReturnedStatus(status: string): boolean {
  return (FINANCE_RETURNED_STATUSES as readonly string[]).includes(status);
}

/**
 * Apare cererea în coada de finanțe?
 * `returnedByFinance` = există un eveniment de audit `finance_returned` pentru ea.
 */
export function belongsInFinanceQueue(
  par: FinanceQueueCandidate,
  opts: { returnedByFinance: boolean } = { returnedByFinance: false }
): boolean {
  if (par.purpose !== "execute_payment") return false;
  if ((FINANCE_QUEUE_ACTIVE_STATUSES as readonly string[]).includes(par.status)) return true;
  return isFinanceReturnedStatus(par.status) && opts.returnedByFinance;
}

/**
 * Motivul curat din detaliul evenimentului de audit. Ruta îl scrie ca frază completă
 * („Finanțele au refuzat plata … Motiv: X"); în coadă e loc doar pentru X.
 */
export function financeReturnReason(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const marker = "Motiv:";
  const at = detail.lastIndexOf(marker);
  const reason = (at >= 0 ? detail.slice(at + marker.length) : detail).trim();
  return reason || null;
}
