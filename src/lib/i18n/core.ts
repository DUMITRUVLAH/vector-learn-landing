/**
 * i18n — nucleul: detectarea limbii, persistența, traducerea.
 *
 * Fără dependențe. Trei lucruri pe care le face și pe care un `t()` naiv nu le face:
 *
 * 1. **Detectare în cascadă**, ca link-ul partajat să deschidă limba potrivită:
 *    `?lang=` (și în hash, fiindcă ruterul e pe hash) → localStorage → RO.
 *    Parametrul din URL se și persistă: dacă cineva ți-a trimis `?lang=en`, restul
 *    navigării rămâne în engleză.
 *
 *    **Limba browserului NU intră în cascadă, intenționat.** Ar fi fost tentant:
 *    un vizitator cu Chrome pe engleză primește engleză de la sine. Dar produsul e
 *    românesc, iar în Moldova o bună parte dintre utilizatorii care vorbesc română
 *    au sistemul și browserul în engleză — auto-detecția le-ar fi schimbat singură
 *    interfața, fără să fi cerut nimeni. Româna rămâne implicită; engleza se ia
 *    dintr-un click pe comutator sau dintr-un `?lang=en`. Dacă vrem vreodată
 *    invers, e o linie în `getLang()`.
 * 2. **Sincronizare între taburi** (`storage`) plus un eveniment intern, ca toate
 *    componentele montate să se redeseneze odată, nu doar cea care a schimbat.
 * 3. **`<html lang>`** ținut la zi — de el depind cititoarele de ecran, corectorul
 *    ortografic al browserului și despărțirea în silabe.
 *
 * Cheia lipsă nu aruncă niciodată: cade pe RO, apoi pe cheia însăși, și avertizează
 * o singură dată în dev. O pagină cu o etichetă neîngrijită e un bug; o pagină albă
 * fiindcă a lipsit o cheie e un incident.
 */
import { DICTS, RO, type TranslationKey } from "./dictionaries";
import { LANGS, LANG_LOCALES, type Lang, type TVars } from "./types";

export type { TranslationKey };

const STORAGE_KEY = "vf.lang";
const CHANGE_EVENT = "vf-lang-change";
const QUERY_PARAM = "lang";

/** `true` pentru orice string care e o limbă pe care o servim. */
export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/* ───────────────────────── detectare ───────────────────────── */

/**
 * Caută `?lang=` atât în query-ul real, cât și în cel de după `#` — aplicația
 * rulează pe hash routing, deci `/business?lang=en` și `/#/business?lang=en` sunt
 * amândouă legături pe care le poate trimite cineva.
 */
function langFromUrl(): Lang | null {
  if (typeof window === "undefined") return null;
  const spots = [window.location.search, window.location.hash.split("?")[1] ?? ""];
  for (const spot of spots) {
    if (!spot) continue;
    const value = new URLSearchParams(spot.startsWith("?") ? spot.slice(1) : spot).get(QUERY_PARAM);
    if (isLang(value)) return value;
  }
  return null;
}

function langFromStorage(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLang(value) ? value : null;
  } catch {
    // Safari în navigare privată aruncă la simpla citire. Nu e un motiv să cadă pagina.
    return null;
  }
}

/**
 * Limba în vigoare. Memorată după prima rezolvare, ca sutele de `t()` dintr-un
 * render să nu recitească `localStorage` de fiecare dată.
 */
let current: Lang | null = null;

export function getLang(): Lang {
  if (current) return current;
  const fromUrl = langFromUrl();
  if (fromUrl) {
    // Link partajat cu limbă explicită: o ținem minte, altfel primul click o pierde.
    persist(fromUrl);
    current = fromUrl;
    return current;
  }
  current = langFromStorage() ?? "ro";
  return current;
}

/** Locale-ul BCP-47 al limbii curente, pentru `Intl.*`. */
export function getLocale(lang: Lang = getLang()): string {
  return LANG_LOCALES[lang];
}

/* ───────────────────────── schimbare ───────────────────────── */

function persist(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* stocare indisponibilă — limba rămâne validă pentru sesiunea curentă */
  }
}

/** Ține `<html lang>` sincron: de el depind cititoarele de ecran și corectorul browserului. */
export function syncDocumentLang(lang: Lang = getLang()): void {
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export function setLang(lang: Lang): void {
  if (!isLang(lang) || lang === getLang()) return;
  current = lang;
  persist(lang);
  syncDocumentLang(lang);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

/**
 * Abonare la schimbarea limbii. Ascultă și `storage`, ca al doilea tab deschis să
 * comute odată cu primul, nu la următorul refresh.
 */
export function onLangChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    const next = isLang(event.newValue) ? event.newValue : null;
    if (!next || next === current) return;
    current = next;
    syncDocumentLang(next);
    listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/* ───────────────────────── traducere ───────────────────────── */

const warned = new Set<string>();

function warnMissing(key: string, lang: Lang): void {
  if (!import.meta.env.DEV) return;
  const id = `${lang}:${key}`;
  if (warned.has(id)) return;
  warned.add(id);
  // eslint-disable-next-line no-console -- semnal de dezvoltare; nu ajunge în build-ul de producție
  console.warn(`[i18n] cheie lipsă „${key}" pentru limba „${lang}"`);
}

/** Înlocuiește `{nume}` cu valorile din `vars`. Ce nu are pereche rămâne pe loc, vizibil. */
export function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * Textul pentru `key` în `lang`. Cade pe RO, apoi pe cheie — niciodată pe gol,
 * fiindcă un buton fără etichetă e mai rău decât unul cu eticheta în altă limbă.
 */
export function t(key: TranslationKey, vars?: TVars, lang: Lang = getLang()): string {
  const exact = DICTS[lang][key];
  if (exact !== undefined) return interpolate(exact, vars);
  warnMissing(key, lang);
  const fallback = RO[key];
  return fallback === undefined ? key : interpolate(fallback, vars);
}

/* ───────────────────────── plural ───────────────────────── */

const pluralRules = new Map<Lang, Intl.PluralRules>();

function rulesFor(lang: Lang): Intl.PluralRules {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(getLocale(lang));
    pluralRules.set(lang, rules);
  }
  return rules;
}

/**
 * Forma de plural potrivită pentru `count`, dintre cheile surori `<base>_one`,
 * `<base>_few`, `<base>_other`.
 *
 * Româna are trei forme, nu două — „1 rezultat", „3 rezultate", „21 **de** rezultate" —
 * iar regula (care e a lui `n % 100`, nu a lui `n`) nu se poate ghici cu un `count === 1`.
 * O luăm de la `Intl.PluralRules`, care o știe pentru orice limbă adăugăm mai târziu.
 */
export function plural(
  base: string,
  count: number,
  vars?: TVars,
  lang: Lang = getLang(),
): string {
  const category = rulesFor(lang).select(count);
  const candidates = [`${base}_${category}`, `${base}_other`, base] as TranslationKey[];
  const key = candidates.find(
    (candidate) => DICTS[lang][candidate] !== undefined || RO[candidate] !== undefined,
  );
  return t(key ?? candidates[0], { count, ...vars }, lang);
}
