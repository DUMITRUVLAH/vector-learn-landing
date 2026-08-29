/**
 * i18n — tipurile de bază.
 *
 * Regula care ține sistemul onest: **RO e sursa de adevăr**, EN se declară ca
 * `Translated<typeof ro>`. Dacă cineva adaugă o cheie în RO și uită EN, `tsc`
 * pică — nu ajungem la un ecran jumătate tradus în producție.
 */

/** Limbile pe care le servește produsul. RO e implicit. */
export type Lang = "ro" | "en";

export const LANGS: readonly Lang[] = ["ro", "en"] as const;

/** Eticheta afișată în comutator (în limba ei proprie, nu tradusă). */
export const LANG_LABELS: Record<Lang, string> = { ro: "Română", en: "English" };

/** Eticheta scurtă pentru comutatorul compact. */
export const LANG_SHORT: Record<Lang, string> = { ro: "RO", en: "EN" };

/** Locale BCP-47 pentru `Intl.*`. RO-ul produsului e cel din Moldova. */
export const LANG_LOCALES: Record<Lang, string> = { ro: "ro-MD", en: "en-US" };

/** Valorile pe care le poate lua o intrare din dicționar. */
export type DictValue = string;

/** Un dicționar plat: chei punctate (`"par.inbox.title"`) → text. */
export type Dict = Readonly<Record<string, DictValue>>;

/**
 * Oglinda EN a unui dicționar RO: exact aceleași chei, nici una în plus.
 * Folosită ca `const en: Translated<typeof ro> = { … }`.
 */
export type Translated<T extends Dict> = { readonly [K in keyof T]: DictValue };

/** Variabilele interpolate în `t("x", { name: "Ana" })` → `{name}`. */
export type TVars = Readonly<Record<string, string | number>>;
