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
  /** Titularul rândului, când există (un rând bazat pe rol nu are). */
  approverUserId?: string | null;
  /** Ce s-a scris în caseta de semnătură. */
  signatureName?: string | null;
  /** Numele titularului, rezolvat din cont. */
  approverName?: string | null;
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

const normName = (v: string | null | undefined) =>
  (v ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ro");

/** Numele sub care apare rândul: ce s-a semnat pe el și/sau titularul rezolvat din cont. */
function namesOf(a: SignatureSlotInput): string[] {
  return [normName(a.signatureName), normName(a.approverName)].filter((v) => v.length > 0);
}

/**
 * Aceeași persoană pe două rânduri?
 *
 * Când AMBELE rânduri au titular, decid doar id-urile — două conturi diferite sunt doi oameni,
 * oricât de asemănător ar fi semnat. Când unul e bazat pe rol (fără titular), singurul indiciu e
 * numele: exact cazul din producție, unde rândul de rol poartă „Irina Oriol", iar cel fixat pe ea
 * poartă același nume. Fără nici un indiciu (casetă complet goală), rândurile NU se contopesc —
 * două semnături care încă lipsesc rămân două casete.
 */
function samePerson(a: SignatureSlotInput, b: SignatureSlotInput): boolean {
  if (a.approverUserId && b.approverUserId) return a.approverUserId === b.approverUserId;
  const an = namesOf(a);
  const bn = namesOf(b);
  return an.some((n) => bn.includes(n));
}

/**
 * Împarte aprobările în caseta solicitantului (pasul 0) și casetele aprobatorilor (pașii > 0),
 * ordonate determinist. Un lanț cu trei aprobatori dă trei casete — formularul le randează pe
 * toate, în loc să tacă a treia semnătură.
 *
 * Pe pasul lui, ACELAȘI om apare o singură dată. Verificat pe producție (ATIC, PAR-2026-0024):
 * pasul 1 are două rânduri pentru Irina Oriol — cel fixat pe ea plus unul bazat pe rol, rămas din
 * driftul reparat pe 10 septembrie. Fără regula asta, formularul o tipărea semnând de două ori, ca
 * și cum ar fi fost doi aprobatori. Din duplicate rămâne cel mai „tare" rând, adică primul după
 * ordinea de mai sus: o decizie bate un rând în așteptare, iar la egalitate câștigă semnătura dată
 * prima. Doi oameni DIFERIȚI pe același pas (nivel paralel real, Ana + Irina) rămân două casete.
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

  const approvers: T[] = [];
  for (const row of sorted) {
    if (row.step <= 0) continue;
    if (approvers.some((kept) => kept.step === row.step && samePerson(kept, row))) continue;
    approvers.push(row);
  }

  return { requestor: sorted.find((a) => a.step === 0) ?? null, approvers };
}
