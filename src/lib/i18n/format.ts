/**
 * Formatare sensibilă la limbă: numere, sume, date.
 *
 * Traducerea etichetelor nu e de ajuns. „1.500,00 MDL · 29.08.2026" citit de un
 * vorbitor de engleză înseamnă altceva decât vrea să însemne — punctul e separator
 * de mii într-o limbă și de zecimale în cealaltă, iar `29.08` poate fi o zi sau o
 * lună. Toate afișările de sumă și dată trec pe aici.
 *
 * Sumele sosesc din API în **unități minore** (bani/cenți), ca peste tot în FinFlow.
 */
import { getLocale } from "./core";
import type { Lang } from "./types";

/** Cache pe (locale, opțiuni): un `Intl.NumberFormat` nou per rând de tabel e scump. */
const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const id = locale + JSON.stringify(options);
  let formatter = numberCache.get(id);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberCache.set(id, formatter);
  }
  return formatter;
}

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const id = locale + JSON.stringify(options);
  let formatter = dateCache.get(id);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateCache.set(id, formatter);
  }
  return formatter;
}

export function formatNumber(
  value: number,
  lang: Lang,
  options: Intl.NumberFormatOptions = {},
): string {
  return numberFormatter(getLocale(lang), options).format(value);
}

/**
 * Sumă dintr-un întreg în unități minore. `formatMoney(150000, "MDL", "ro")` → „1.500,00 MDL".
 *
 * Împărțirea la 100 se face aici, o singură dată: dacă o face și apelantul, suma
 * apare de o sută de ori mai mică și nimeni nu observă până la o factură reală.
 */
export function formatMoney(minorUnits: number, currency: string, lang: Lang): string {
  return formatNumber(minorUnits / 100, lang, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Sumă deja în unități majore (ce vine din inputurile formularului). */
export function formatAmount(value: number, currency: string, lang: Lang): string {
  return formatNumber(value, lang, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Acceptă tot ce circulă prin aplicație ca dată: `Date`, ISO, sau timestamp. */
export type DateInput = Date | string | number;

function toDate(input: DateInput): Date | null {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

const DATE_PRESETS: Record<"short" | "long" | "dateTime", Intl.DateTimeFormatOptions> = {
  short: { day: "2-digit", month: "2-digit", year: "numeric" },
  long: { day: "numeric", month: "long", year: "numeric" },
  dateTime: { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" },
};

/** Dată formatată; o valoare invalidă dă „—", nu „Invalid Date" în interfață. */
export function formatDate(
  input: DateInput | null | undefined,
  lang: Lang,
  preset: keyof typeof DATE_PRESETS = "short",
): string {
  if (input === null || input === undefined) return "—";
  const date = toDate(input);
  if (!date) return "—";
  return dateFormatter(getLocale(lang), DATE_PRESETS[preset]).format(date);
}

/** „acum 3 zile" / „3 days ago" — pentru cronologii și liste de activitate. */
export function formatRelative(input: DateInput, lang: Lang, now: Date = new Date()): string {
  const date = toDate(input);
  if (!date) return "—";
  const seconds = (date.getTime() - now.getTime()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  const relative = new Intl.RelativeTimeFormat(getLocale(lang), { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return relative.format(Math.round(seconds), "second");
}
