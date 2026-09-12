/**
 * VM5-19: „când se trece pragul pentru necesar de achiziții, să știm că trebuie achiziții".
 *
 * Regula, așa cum a dat-o owner-ul (12.09.2026):
 *   „dacă un prestator într-un an trece de suma X, nu contează euro, usd, mdl, să apară un semn al
 *    exclamării când faci PAR că trebuie de făcut tender. Și finance manager poate după să bifeze
 *    că s-a făcut și după să nu apară pentru acel an."
 *
 * Trei lucruri de care depinde corectitudinea:
 *
 * 1. **Se numără pe prestator, nu pe cerere.** Zece plăți mici către același furnizor trec pragul
 *    la fel de bine ca una mare — de fapt, ele sunt exact ceea ce procedura de achiziție caută să
 *    prindă (fracționarea).
 * 2. **Moneda nu contează.** Cererile în EUR/USD se compară pe echivalentul în lei înghețat la
 *    depunere (`total_mdl_cents`, curs BNM), ca în rapoarte. Altfel trei plăți de 5.000 EUR ar
 *    părea mai mici decât una de 100.000 MDL.
 * 3. **Cererea curentă intră în calcul.** Avertismentul trebuie să apară CÂND FACI cererea care
 *    trece pragul, nu la următoarea — altfel ajunge mereu cu o cerere întârziere.
 */

/** Ce se numără: cererile care angajează bani. Ciornele, respinsele și anulatele nu. */
export const TENDER_COUNTED_STATUSES = [
  "pending_approval",
  "changes_requested",
  "approved",
  "in_finance",
  "reapproval_required",
  "paid",
] as const;

export interface VendorIdentity {
  vendorId?: string | null;
  payeeIdnp?: string | null;
  payeeName?: string | null;
}

/**
 * Identitatea după care se adună sumele. Prestatorul din registru primește id-ul lui; unul
 * nesalvat, dar identificat fiscal, codul lui; abia la urmă numele, normalizat.
 *
 * De ce în ordinea asta: numele se scrie de zece feluri („SRL Alfa", "Alfa S.R.L."), iar dacă am
 * număra după el, aceeași firmă ar apărea ca trei prestatori diferiți și nimeni n-ar trece pragul.
 */
export function vendorKey(v: VendorIdentity): string | null {
  if (v.vendorId) return `v:${v.vendorId}`;
  const idnp = (v.payeeIdnp ?? "").replace(/\D/g, "");
  if (idnp.length >= 6) return `i:${idnp}`;
  const name = (v.payeeName ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ro");
  return name ? `n:${name}` : null;
}

export interface TenderEvaluation {
  /** Regula e activă (prag configurat) și se aplică acestei cereri. */
  applies: boolean;
  /** Pragul configurat, în bani (MDL). */
  thresholdCents: number;
  /** Cât s-a angajat deja către prestator anul acesta, fără cererea curentă. */
  yearToDateCents: number;
  /** Totalul anului INCLUSIV cererea curentă. */
  projectedCents: number;
  /** Cu cât se depășește pragul (0 dacă nu se depășește). */
  overByCents: number;
  /** Pragul e depășit de cererea asta (sau era deja depășit). */
  exceeds: boolean;
  /** Finanțele au bifat deja procedura pentru prestatorul ăsta, anul ăsta. */
  cleared: boolean;
  /** Se arată semnul exclamării: pragul e depășit ȘI nimeni n-a bifat procedura. */
  warn: boolean;
}

/**
 * Pur: primește cifrele, întoarce verdictul. Interogările (cât s-a plătit anul ăsta, există bifă)
 * rămân în rută, ca regula să poată fi verificată fără bază de date.
 */
export function evaluateTenderThreshold(input: {
  thresholdCents: number;
  yearToDateCents: number;
  currentParCents: number;
  cleared: boolean;
  hasVendor: boolean;
}): TenderEvaluation {
  const thresholdCents = Math.max(0, Math.trunc(input.thresholdCents || 0));
  const yearToDateCents = Math.max(0, Math.trunc(input.yearToDateCents || 0));
  const currentParCents = Math.max(0, Math.trunc(input.currentParCents || 0));
  const projectedCents = yearToDateCents + currentParCents;
  // Fără prag configurat sau fără un prestator identificabil nu avem ce compara.
  const applies = thresholdCents > 0 && input.hasVendor;
  const exceeds = applies && projectedCents > thresholdCents;
  return {
    applies,
    thresholdCents,
    yearToDateCents,
    projectedCents,
    overByCents: exceeds ? projectedCents - thresholdCents : 0,
    exceeds,
    cleared: input.cleared,
    warn: exceeds && !input.cleared,
  };
}

/** Anul calendaristic în care se numără o cerere, citit în fusul organizației. */
export function tenderYear(date: Date | string | null | undefined, timeZone = "Europe/Chisinau"): number {
  const d = date ? new Date(date) : new Date();
  const safe = isNaN(d.getTime()) ? new Date() : d;
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(safe));
}
