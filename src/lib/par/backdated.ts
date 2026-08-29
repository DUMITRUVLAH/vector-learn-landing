/**
 * „Cerere cu dată din trecut" — o cerere întocmită cu o dată anterioară zilei în care a fost
 * efectiv depusă (owner, 2026-08-29: „dacă pune cu dată anterioară… atenționezi și finanțe și
 * aprobator, tot să vadă că e cu data din trecut").
 *
 * De ce contează: data cererii ajunge pe documentul tipărit și în raportări. O cerere scrisă azi
 * dar datată luna trecută poate fi o regularizare legitimă — sau o cheltuială împinsă înapoi
 * într-o perioadă bugetară deja închisă. Nu o blocăm (există motive reale), dar nu o lăsăm nici
 * să treacă tăcut: cine aprobă și cine plătește vede semnul, nu doar cine îl scrie.
 *
 * Nu e nevoie de nicio coloană nouă — decalajul se citește din datele care există deja:
 * `dateOfRequest` față de ziua depunerii (`submittedAt`, sau ziua curentă cât timp e ciornă).
 */

/** Ziua calendaristică UTC a unei valori ISO („2026-08-29T00:00:00Z" → „2026-08-29"). */
function dayOf(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Câte zile în urmă e data cererii față de ziua depunerii. 0 = aceeași zi sau în viitor.
 *
 * Ambele capete se reduc la ziua UTC înainte de scădere, deci o diferență de fus orar nu poate
 * inventa o zi de decalaj: o depunere la 01:00 ora Chișinăului cade pe ziua UTC precedentă, iar
 * rezultatul e −1 → 0, nu un fals „retroactiv". Prețul e că exact acea fereastră de câteva ore
 * nu semnalează un decalaj de o zi; e compromisul corect — mai bine tăcem decât să acuzăm greșit.
 */
export function backdatedDays(
  dateOfRequest: string | Date | null | undefined,
  submittedAt?: string | Date | null,
  now: Date = new Date()
): number {
  const requested = dayOf(dateOfRequest);
  const reference = dayOf(submittedAt) ?? dayOf(now);
  if (!requested || !reference) return 0;
  const diff = Date.parse(`${reference}T00:00:00Z`) - Date.parse(`${requested}T00:00:00Z`);
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.round(diff / 86_400_000);
}

export function isBackdated(
  dateOfRequest: string | Date | null | undefined,
  submittedAt?: string | Date | null,
  now: Date = new Date()
): boolean {
  return backdatedDays(dateOfRequest, submittedAt, now) > 0;
}

/** Eticheta scurtă de pe listă/detaliu. Zilele sunt informația care spune cât de vechi e decalajul. */
export function backdatedLabel(days: number): string {
  if (days <= 0) return "";
  return days === 1 ? "Dată retroactivă · 1 zi" : `Dată retroactivă · ${days} zile`;
}
