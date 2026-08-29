/**
 * Legătura cu React. `useSyncExternalStore` în loc de `useState` + `useEffect`:
 * limba e o stare din afara React (localStorage + un eveniment de fereastră), iar
 * `useSyncExternalStore` e exact unealta pentru asta — fără randare intermediară
 * cu limba veche la montare și fără rupturi la randarea concurentă.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  getLang,
  getLocale,
  onLangChange,
  plural as pluralRaw,
  setLang,
  t as translate,
  type TranslationKey,
} from "./core";
import {
  formatAmount,
  formatDate,
  formatMoney,
  formatNumber,
  formatRelative,
  type DateInput,
} from "./format";
import type { Lang, TVars } from "./types";

/** Limba curentă, reactivă. Se redesenează la orice schimbare, inclusiv din alt tab. */
export function useLang(): Lang {
  return useSyncExternalStore(onLangChange, getLang, () => "ro" as const);
}

export interface UseTResult {
  /** Textul pentru cheie, cu interpolare opțională: `t("common.lang.switchTo", { lang: "English" })`. */
  t: (key: TranslationKey, vars?: TVars) => string;
  /** Forma de plural potrivită pentru `count` (`<base>_one` / `_few` / `_other`). */
  plural: (base: string, count: number, vars?: TVars) => string;
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
}

/**
 * Hook-ul principal. `const { t } = useT();` apoi `t("par.inbox.title")`.
 *
 * Funcțiile sunt memorate pe limbă, ca un `t` primit ca prop să nu invalideze
 * fiecare `memo()` din arbore la fiecare randare.
 */
export function useT(): UseTResult {
  const lang = useLang();
  const t = useCallback(
    (key: TranslationKey, vars?: TVars) => translate(key, vars, lang),
    [lang],
  );
  const plural = useCallback(
    (base: string, count: number, vars?: TVars) => pluralRaw(base, count, vars, lang),
    [lang],
  );
  return useMemo(
    () => ({ t, plural, lang, locale: getLocale(lang), setLang }),
    [t, plural, lang],
  );
}

export interface UseFormatResult {
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** Sumă din unități minore (bani/cenți) — cum vin din API. */
  money: (minorUnits: number, currency: string) => string;
  /** Sumă deja în unități majore. */
  amount: (value: number, currency: string) => string;
  date: (value: DateInput | null | undefined, preset?: "short" | "long" | "dateTime") => string;
  relative: (value: DateInput) => string;
  lang: Lang;
}

/** Formatoare legate de limba curentă — sume, date, enumerări. */
export function useFormat(): UseFormatResult {
  const lang = useLang();
  return useMemo(
    () => ({
      number: (value: number, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, lang, options),
      money: (minorUnits: number, currency: string) => formatMoney(minorUnits, currency, lang),
      amount: (value: number, currency: string) => formatAmount(value, currency, lang),
      date: (value: DateInput | null | undefined, preset?: "short" | "long" | "dateTime") =>
        formatDate(value, lang, preset),
      relative: (value: DateInput) => formatRelative(value, lang),
      lang,
    }),
    [lang],
  );
}
