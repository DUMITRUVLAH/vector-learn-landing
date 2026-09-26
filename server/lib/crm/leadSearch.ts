/**
 * CRM — căutarea liberă în leaduri și neutralizarea formulelor la export.
 *
 * Scoase din `server/routes/crmLeads.ts` ca partea pură (escapare, pliere de diacritice, cifrele
 * telefonului, prefixul anti-formulă) să poată fi testată fără bază de date.
 *
 * Trei probleme pe care le închide căutarea:
 *
 * 1. **`%` și `_` erau wildcard-uri.** Căutarea „%" întorcea toată baza, iar „_" orice lead cu
 *    măcar un caracter. Omul caută textul, nu un tipar SQL — deci `\`, `%` și `_` se escapează
 *    (backslash e caracterul de escape implicit al lui LIKE, atât în Postgres cât și în PGlite).
 * 2. **Diacriticele.** „Stefan Turcanu" nu găsea „Ștefan Țurcanu" — jumătate din oameni tastează
 *    fără diacritice. Plierea se face cu `translate()` pe AMBELE părți (coloană și căutare), fără
 *    extensii (`unaccent` nu există în PGlite și nici garantat pe Supabase). Includem și formele
 *    mari și pe cele cu sedilă (ş/ţ), fiindcă `lower()` pe colația C nu atinge non-ASCII.
 * 3. **Telefonul în alt format.** „069123456" nu găsea „+373 69 123 456". Căutarea care arată a
 *    număr se compară și cu `phone_normalized` (ultimele 8 cifre, vezi `normalize.ts`).
 */
import { ilike, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { leads } from "../../db/schema/leads";
import { normalizePhone } from "./normalize";

/** Literele românești (mici și mari, cu virgulă și cu sedilă) și echivalentul lor fără diacritice. */
export const DIACRITICS_FROM = "ăâîșşțţĂÂÎȘŞȚŢ";
export const DIACRITICS_TO = "aaissttaaisstt";

/** Escapează caracterele speciale ale lui LIKE, ca textul căutat să fie potrivit literal. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Aceeași pliere ca `translate(lower(col), FROM, TO)` din SQL, pentru partea de căutare. */
export function foldDiacritics(text: string): string {
  const lowered = text.normalize("NFC").toLowerCase();
  let out = "";
  for (const ch of lowered) {
    const i = DIACRITICS_FROM.indexOf(ch);
    out += i >= 0 ? DIACRITICS_TO[i] : ch;
  }
  return out;
}

/**
 * Cifrele de comparat cu `phone_normalized`, dacă textul căutat arată a număr de telefon (doar
 * cifre și separatori obișnuiți, minim 4 cifre). `null` altfel — „Elev 12" nu e un telefon.
 */
export function phoneSearchDigits(search: string): string | null {
  const trimmed = search.trim();
  if (!/^[\d\s+\-().\/]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D+/g, "");
  if (digits.length < 4) return null;
  // Aceeași normalizare ca la salvare: „069123456" și „+37369123456" → „69123456".
  return normalizePhone(digits);
}

/** Condiția de căutare liberă pe lead: nume, companie, email (pliate), telefon (brut și normalizat). */
export function buildLeadSearchCondition(search: string): SQL | undefined {
  const folded = `%${escapeLike(foldDiacritics(search))}%`;
  const raw = `%${escapeLike(search)}%`;
  const foldedCol = (col: AnyColumn) =>
    sql`translate(lower(coalesce(${col}, '')), ${DIACRITICS_FROM}, ${DIACRITICS_TO}) like ${folded}`;

  const parts: SQL[] = [
    foldedCol(leads.fullName),
    foldedCol(leads.company),
    foldedCol(leads.email),
    ilike(leads.phone, raw),
  ];
  const digits = phoneSearchDigits(search);
  if (digits) parts.push(ilike(leads.phoneNormalized, `%${escapeLike(digits)}%`));
  return or(...parts);
}

/**
 * O celulă CSV care începe cu `=`, `+`, `-`, `@`, TAB sau CR e interpretată de Excel ca formulă
 * („=HYPERLINK(...)" într-un nume de lead devine un link executabil în fișierul exportat).
 * Prefixul `'` o face text — convenția recomandată de OWASP pentru CSV injection.
 */
export function neutralizeCsvFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
