/**
 * Traducerea în modulul de task-uri: `const { t, i18n } = useTasksT();` apoi `t("board.nav.myTasks")`.
 *
 * Forma apelului e aceeași cu cea din HR365 (`useTranslation("tasks")`), ca componentele portate
 * să rămână citibile față de sursă: `t(cheie, { count })` alege singur forma de plural, iar
 * `{ defaultValue }` acoperă cheile dinamice (`status.${value}`) pentru valori necunoscute.
 * Dedesubt e i18n-ul produsului — aceeași limbă curentă, aceeași interpolare `{nume}`.
 */
import { useCallback, useMemo } from "react";
import { getLocale, interpolate, useLang } from "@/lib/i18n";
import type { Lang, TVars } from "@/lib/i18n/types";
import { en, ro } from "./i18n";

type Dictionary = Readonly<Record<string, string>>;

const DICTS: Record<Lang, Dictionary> = { ro, en };
const RO: Dictionary = ro;

export interface TasksTOptions {
  count?: number;
  /** Textul folosit când cheia nu există (valori noi dintr-o cheie dinamică). */
  defaultValue?: string;
  [name: string]: string | number | undefined;
}

export type TasksT = (key: string, options?: TasksTOptions) => string;

const pluralRules = new Map<Lang, Intl.PluralRules>();

function rulesFor(lang: Lang): Intl.PluralRules {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(getLocale(lang));
    pluralRules.set(lang, rules);
  }
  return rules;
}

function varsOf(options: TasksTOptions | undefined): TVars | undefined {
  if (!options) return undefined;
  const vars: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(options)) {
    if (name === "defaultValue" || value === undefined) continue;
    vars[name] = value;
  }
  return vars;
}

/** Varianta fără React, pentru funcții pure care primesc limba (ex. mesaje de eroare). */
export function translateTasks(lang: Lang, key: string, options?: TasksTOptions): string {
  const dict = DICTS[lang];
  let resolved = key;
  if (typeof options?.count === "number") {
    const category = rulesFor(lang).select(options.count);
    const candidates = [`${key}_${category}`, `${key}_other`, key];
    resolved = candidates.find((c) => dict[c] !== undefined || RO[c] !== undefined) ?? key;
  }
  const template = dict[resolved] ?? RO[resolved] ?? options?.defaultValue ?? key;
  return interpolate(template, varsOf(options));
}

export function useTasksT(): { t: TasksT; i18n: { language: Lang } } {
  const lang = useLang();
  const t = useCallback<TasksT>((key, options) => translateTasks(lang, key, options), [lang]);
  return useMemo(() => ({ t, i18n: { language: lang } }), [t, lang]);
}
