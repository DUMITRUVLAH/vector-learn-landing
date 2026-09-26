/**
 * Locale-ul `date-fns` pentru limba interfeței. Produsul servește RO și EN; orice altceva cade
 * pe română, limba implicită a produsului.
 */
import { enUS, ro } from "date-fns/locale";
import type { Locale } from "date-fns";

export function getDateFnsLocale(lang?: string | null): Locale {
  return lang?.startsWith("en") ? enUS : ro;
}
