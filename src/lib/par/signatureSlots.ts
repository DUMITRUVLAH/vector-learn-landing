/**
 * Ce se tipărește în casetele de semnătură ale formularului PAR (secțiunile 14–15).
 *
 * De ce există: constructorul PDF-ului lua pur și simplu `approvals.filter(step > 0)[0]` și `[1]`.
 * Pe un nivel PARALEL (mai multe rânduri cu ACELAȘI `step`) ordinea dintre ele e ordinea în care
 * le-a returnat baza de date — care nu e garantată între două cereri. Consecința, raportată de
 * Iulian (ATIC) și confirmată în producție pe PAR-2026-0024/0025: prima descărcare arăta ambele
 * semnături, a doua una singură. Pe PAR-2026-0025 pasul 1 are TREI rânduri (două aprobate + unul
 * în așteptare), deci un rând nedecis putea ocupa o casetă și aceasta ieșea goală pe hârtie.
 *
 * Regula de aici, deterministă și fără surprize:
 *   1. `step` crescător — ordinea reală a lanțului;
 *   2. în interiorul pasului, DECIZIILE înaintea celor în așteptare — o semnătură dată nu poate fi
 *      împinsă de pe hârtie de un rând nedecis;
 *   3. apoi momentul deciziei (cel mai vechi primul), ca ordinea tipărită să fie ordinea semnării;
 *   4. apoi `id` — ultimul criteriu, care garantează că două randări ale acelorași date dau exact
 *      același rezultat, indiferent cum au venit rândurile din API.
 *
 * Modul pur: fără DOM, fără rețea. Formularul îl folosește prin `buildParHtml`.
 */

export interface SignatureSlotInput {
  id: string;
  step: number;
  decision: "pending" | "approved" | "rejected" | "changes_requested";
  decidedAt: string | null;
}

/** 0 = decis (a semnat ceva), 1 = încă în așteptare. Deciziile se tipăresc primele. */
function decidedRank(a: SignatureSlotInput): number {
  return a.decision === "pending" ? 1 : 0;
}

/** Momentul deciziei ca număr sortabil; rândurile nedecise ajung la coadă. */
function decidedTime(a: SignatureSlotInput): number {
  if (!a.decidedAt) return Number.POSITIVE_INFINITY;
  const t = new Date(a.decidedAt).getTime();
  return isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Împarte aprobările în caseta solicitantului (pasul 0) și casetele aprobatorilor (pașii > 0),
 * ordonate determinist. NU aruncă și nu taie nimic: dacă lanțul are trei aprobatori, ies trei
 * casete — formularul le randează pe toate, în loc să tacă a treia semnătură.
 */
export function orderSignatureSlots<T extends SignatureSlotInput>(
  approvals: readonly T[]
): { requestor: T | null; approvers: T[] } {
  const sorted = [...approvals].sort(
    (a, b) =>
      a.step - b.step ||
      decidedRank(a) - decidedRank(b) ||
      decidedTime(a) - decidedTime(b) ||
      a.id.localeCompare(b.id)
  );
  return {
    requestor: sorted.find((a) => a.step === 0) ?? null,
    approvers: sorted.filter((a) => a.step > 0),
  };
}
