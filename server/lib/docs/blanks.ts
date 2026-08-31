/**
 * DC-103 — pe hârtie nu apar niciodată acolade.
 *
 * Un câmp fără sursă rămânea în document ca `{{contraparte.iban}}`. Pe un act dus la semnat asta nu
 * arată a „câmp necompletat", ci a produs stricat — owner-ul a cerut explicit să dispară. În locul
 * lui se tipărește un rând de completat cu pixul, exact ca pe orice formular tipizat.
 *
 * Aceeași funcție e folosită de TOATE ieșirile (PDF, Word, previzualizare, corpul sigilat la
 * finalizare): dacă ar fi aplicată doar pe unele, actul ar arăta diferit în funcție de butonul apăsat.
 */

/** Acoladele acceptate în șabloane: `{{grup.camp}}`, cu diacritice și cratime. */
const PLACEHOLDER_RE = /\{\{\s*([\w.\-ăâîșțĂÂÎȘȚ]+)\s*\}\}/gi;

/** Rândul de completat cu pixul. Lungimea e aleasă cât o semnătură scurtă, nu cât un rând întreg. */
export const BLANK_LINE = "__________";

export function blankUnresolved(html: string): string {
  return html.replace(PLACEHOLDER_RE, BLANK_LINE);
}

/**
 * Câmpurile rămase necompletate în corpul actului, în ordinea apariției și fără repetări.
 * De aici se compune întrebarea „chiar vrei să scoți actul așa?" înainte de export.
 */
export function unresolvedFields(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(PLACEHOLDER_RE)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}
