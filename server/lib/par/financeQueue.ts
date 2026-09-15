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

// ─── VM4-05: arhiva cozii de finanțe ─────────────────────────────────────────
//
// O cerere refuzată de finanțe pe care solicitantul o abandonează rămâne în coadă la nesfârșit:
// nimeni n-o mai mișcă, dar ocupă primul rând (mai ales dacă e „urgentă") și acoperă lucrul real.
// Ștergerea nu e o opțiune — jurnalul unei cereri de plată nu se rupe. Deci: se ARHIVEAZĂ, adică
// iese din lista de lucru și intră într-o listă separată, de unde poate fi oricând restaurată.
//
// Starea de arhivă NU e o coloană nouă pe `par_requests`, ci ultimul eveniment de audit
// `finance_archived` / `finance_unarchived` — același tipar ca `finance_returned` (VM4-02b), fără
// migrare și cu urma „cine, când, de ce" primită gratis.

/** Evenimentul scris de POST /api/par/:id/finance-archive. */
export const FINANCE_ARCHIVE_EVENT = "finance_archived";

/** Evenimentul scris de POST /api/par/:id/finance-unarchive. */
export const FINANCE_UNARCHIVE_EVENT = "finance_unarchived";

/** Ultimul eveniment de arhivare/restaurare al unei cereri, așa cum vine din `par_audit`. */
export interface FinanceArchiveEvent {
  event: string;
  /** `par_audit.diff` — JSON cu statusul de la momentul arhivării. */
  diff?: string | null;
}

/**
 * Statusul cererii în clipa arhivării, citit din `par_audit.diff`.
 * `null` pentru evenimentele vechi sau stricate — vezi `isArchivedFromFinanceQueue`.
 */
export function financeArchiveStatus(diff: string | null | undefined): string | null {
  if (!diff) return null;
  try {
    const parsed: unknown = JSON.parse(diff);
    if (parsed && typeof parsed === "object" && "statusAtArchive" in parsed) {
      const v = (parsed as { statusAtArchive: unknown }).statusAtArchive;
      return typeof v === "string" && v ? v : null;
    }
  } catch {
    // Un diff nevalid nu e motiv să ascundem o cerere: cade pe `null` = arhivă necondiționată.
  }
  return null;
}

/** `par_audit.diff` scris la arhivare — statusul de atunci, ca să știm dacă cererea s-a mișcat. */
export function financeArchiveDiff(statusAtArchive: string): string {
  return JSON.stringify({ statusAtArchive });
}

/**
 * E cererea arhivată ACUM?
 *
 * `latest` = cel mai recent eveniment `finance_archived` / `finance_unarchived` al cererii.
 *
 * Arhivarea ține doar cât timp cererea stă pe loc. Dacă solicitantul a corectat-o și a retrimis-o,
 * iar ea a fost aprobată din nou, statusul curent diferă de cel de la arhivare → cererea revine
 * singură în lista de lucru. Altfel o plată reală ar rămâne ascunsă într-o arhivă pe care nimeni
 * nu o deschide.
 */
export function isArchivedFromFinanceQueue(
  currentStatus: string,
  latest: FinanceArchiveEvent | null | undefined
): boolean {
  if (!latest || latest.event !== FINANCE_ARCHIVE_EVENT) return false;
  const at = financeArchiveStatus(latest.diff);
  return at === null || at === currentStatus;
}

/** Motivul/nota din detaliul evenimentului de arhivare (poate lipsi — nota e opțională). */
export function financeArchiveNote(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const marker = "Notă:";
  const at = detail.lastIndexOf(marker);
  if (at < 0) return null;
  const note = detail.slice(at + marker.length).trim();
  return note || null;
}
