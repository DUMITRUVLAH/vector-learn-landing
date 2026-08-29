/**
 * Dicționar `common.*` — text de interfață folosit în tot produsul: acțiuni,
 * stări generice, comutatorul de limbă. Ce e specific unui modul stă în
 * dicționarul modulului (`par.ts`), nu aici.
 *
 * Convenție de chei: `common.<grup>.<nume>`, camelCase la ultimul segment.
 * Plural: trei chei surori `…_one` / `…_few` / `…_other` (vezi `plural()` din core).
 */
import type { Dict, Translated } from "../types";

export const ro = {
  // ── acțiuni ────────────────────────────────────────────────────────────────
  "common.action.save": "Salvează",
  "common.action.cancel": "Anulează",
  "common.action.close": "Închide",
  "common.action.delete": "Șterge",
  "common.action.edit": "Editează",
  "common.action.add": "Adaugă",
  "common.action.back": "Înapoi",
  "common.action.next": "Înainte",
  "common.action.confirm": "Confirmă",
  "common.action.retry": "Reîncearcă",
  "common.action.search": "Caută",
  "common.action.reset": "Resetează",
  "common.action.export": "Exportă",
  "common.action.download": "Descarcă",
  "common.action.upload": "Încarcă",
  "common.action.copy": "Copiază",
  "common.action.copied": "Copiat",
  "common.action.viewAll": "Vezi toate",
  "common.action.logout": "Deconectare",
  "common.action.login": "Autentificare",

  // ── stări ──────────────────────────────────────────────────────────────────
  "common.state.loading": "Se încarcă…",
  "common.state.saving": "Se salvează…",
  "common.state.empty": "Nimic de afișat.",
  "common.state.error": "Ceva n-a mers. Reîncearcă.",
  "common.state.offline": "Ești offline.",
  "common.state.none": "—",

  // ── câmpuri și filtre ──────────────────────────────────────────────────────
  "common.field.searchPlaceholder": "Caută…",
  "common.field.required": "Obligatoriu",
  "common.field.optional": "Opțional",
  "common.filter.all": "Toate",
  "common.filter.moreFilters": "Mai multe filtre",

  // ── comutatorul de limbă ───────────────────────────────────────────────────
  "common.lang.label": "Limbă",
  "common.lang.switchTo": "Schimbă limba în {lang}",
  "common.lang.current": "Limba curentă: {lang}",

  // ── numărători (plural) ────────────────────────────────────────────────────
  "common.count.results_one": "{count} rezultat",
  "common.count.results_few": "{count} rezultate",
  "common.count.results_other": "{count} de rezultate",
} as const satisfies Dict;

export const en: Translated<typeof ro> = {
  // ── actions ────────────────────────────────────────────────────────────────
  "common.action.save": "Save",
  "common.action.cancel": "Cancel",
  "common.action.close": "Close",
  "common.action.delete": "Delete",
  "common.action.edit": "Edit",
  "common.action.add": "Add",
  "common.action.back": "Back",
  "common.action.next": "Next",
  "common.action.confirm": "Confirm",
  "common.action.retry": "Try again",
  "common.action.search": "Search",
  "common.action.reset": "Reset",
  "common.action.export": "Export",
  "common.action.download": "Download",
  "common.action.upload": "Upload",
  "common.action.copy": "Copy",
  "common.action.copied": "Copied",
  "common.action.viewAll": "View all",
  "common.action.logout": "Log out",
  "common.action.login": "Sign in",

  // ── states ─────────────────────────────────────────────────────────────────
  "common.state.loading": "Loading…",
  "common.state.saving": "Saving…",
  "common.state.empty": "Nothing to show.",
  "common.state.error": "Something went wrong. Try again.",
  "common.state.offline": "You are offline.",
  "common.state.none": "—",

  // ── fields and filters ─────────────────────────────────────────────────────
  "common.field.searchPlaceholder": "Search…",
  "common.field.required": "Required",
  "common.field.optional": "Optional",
  "common.filter.all": "All",
  "common.filter.moreFilters": "More filters",

  // ── language switcher ──────────────────────────────────────────────────────
  "common.lang.label": "Language",
  "common.lang.switchTo": "Switch language to {lang}",
  "common.lang.current": "Current language: {lang}",

  // ── counts (plural) ────────────────────────────────────────────────────────
  "common.count.results_one": "{count} result",
  "common.count.results_few": "{count} results",
  "common.count.results_other": "{count} results",
};
