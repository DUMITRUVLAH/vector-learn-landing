/**
 * i18n RO/EN pentru FinFlow — punctul unic de import: `@/lib/i18n`.
 *
 * În componente:
 *
 * ```tsx
 * const { t } = useT();
 * <h1>{t("par.inbox.title")}</h1>
 * ```
 *
 * Ce trebuie știut înainte de a adăuga text:
 *
 * - **RO e sursa de adevăr.** Adaugi cheia în `dictionaries/<modul>.ts` la `ro`,
 *   iar `Translated<typeof ro>` te obligă să o adaugi și la `en`. O cheie fără
 *   pereche e o eroare de compilare, nu o surpriză în producție.
 * - **Cheile sunt prefixate pe modul**: `common.*`, `landing.*`, `par.*`.
 * - **Datele din baza de date nu se traduc** — nume de proiecte, furnizori,
 *   departamente. Doar chrome-ul de interfață.
 * - **Sumele și datele** se afișează prin `useFormat()`, nu prin `toLocaleString`
 *   cu locale scris de mână: separatorii diferă între limbi.
 *
 * `npm run i18n:check` verifică paritatea și scoate lista de text rămas netradus.
 */
export {
  getLang,
  getLocale,
  interpolate,
  isLang,
  onLangChange,
  plural,
  setLang,
  syncDocumentLang,
  t,
  type TranslationKey,
} from "./core";

export {
  formatAmount,
  formatDate,
  formatMoney,
  formatNumber,
  formatRelative,
  type DateInput,
} from "./format";

export { useFormat, useLang, useT, type UseFormatResult, type UseTResult } from "./react";

export {
  LANGS,
  LANG_LABELS,
  LANG_LOCALES,
  LANG_SHORT,
  type Dict,
  type Lang,
  type Translated,
  type TVars,
} from "./types";

export { DICTS, EN, NAMESPACES, RO } from "./dictionaries";
