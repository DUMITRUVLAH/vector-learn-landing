/**
 * VF-304: lightweight i18n (RO/EN). No dependency.
 *
 * - Dictionary keyed by `namespace.key`.
 * - `t(key)` returns the string for the current language, falling back to RO, then the key itself.
 * - `setLang(lang)` persists to localStorage and broadcasts a `vf-lang-change` event.
 * - `useT()` subscribes to that event so components re-render on language change.
 *
 * DB data (department names, etc.) is never translated — only UI chrome.
 */
import { useEffect, useState } from "react";

export type Lang = "ro" | "en";
const STORAGE_KEY = "vf.lang";
const CHANGE_EVENT = "vf-lang-change";

type Dict = Record<string, string>;

const ro: Dict = {
  // nav
  "nav.requests": "Cereri PAR",
  "nav.new": "Cerere nouă",
  "nav.inbox": "Inbox aprobare",
  "nav.finance": "Finanțe",
  "nav.reports": "Rapoarte",
  "nav.admin": "Admin",
  "nav.logout": "Deconectare",
  // common
  "common.loading": "Se încarcă…",
  "common.search": "Caută…",
  "common.reset": "Resetează",
  "common.cancel": "Anulează",
  "common.all": "Toate",
  "common.language": "Limbă",
  // dashboard
  "dashboard.title": "Cereri de plată (PAR)",
  "dashboard.subtitle": "Gestionează cererile de plată ale organizației",
  "dashboard.new": "Cerere nouă",
  "dashboard.total": "Total cereri",
  "dashboard.active": "Activ (estimat)",
  "dashboard.paid": "Total plătit",
  "dashboard.searchPlaceholder": "Caută după număr…",
  "dashboard.moreFilters": "Mai multe filtre",
  // login
  "login.subtitle": "Conectează-te pentru a accesa fluxul de aprobări financiare",
  "login.email": "Email",
  "login.password": "Parolă",
  "login.submit": "Conectare",
  "login.withEmail": "sau cu email",
  "login.google": "Continuă cu Google",
  // create
  "create.title": "Cerere nouă de plată",
  "create.totalEstimated": "TOTAL ESTIMAT",
  "create.submit": "Trimite pentru aprobare",
  "create.saveDraft": "Salvează ciornă",
  // inbox
  "inbox.title": "Inbox aprobatori",
  "inbox.subtitle": "Cereri PAR care așteaptă decizia dvs.",
  "inbox.empty": "Nicio cerere în așteptare.",
  // status
  "status.draft": "Ciornă",
  "status.pending_approval": "În aprobare",
  "status.changes_requested": "Modificări solicitate",
  "status.rejected": "Respinsă",
  "status.approved": "Aprobată",
  "status.in_finance": "La finanțe",
  "status.reapproval_required": "Reaprobare necesară",
  "status.paid": "Plătită",
  "status.cancelled": "Anulată",
};

const en: Dict = {
  // nav
  "nav.requests": "PAR Requests",
  "nav.new": "New request",
  "nav.inbox": "Approval inbox",
  "nav.finance": "Finance",
  "nav.reports": "Reports",
  "nav.admin": "Admin",
  "nav.logout": "Log out",
  // common
  "common.loading": "Loading…",
  "common.search": "Search…",
  "common.reset": "Reset",
  "common.cancel": "Cancel",
  "common.all": "All",
  "common.language": "Language",
  // dashboard
  "dashboard.title": "Payment requests (PAR)",
  "dashboard.subtitle": "Manage your organization's payment requests",
  "dashboard.new": "New request",
  "dashboard.total": "Total requests",
  "dashboard.active": "Active (estimated)",
  "dashboard.paid": "Total paid",
  "dashboard.searchPlaceholder": "Search by number…",
  "dashboard.moreFilters": "More filters",
  // login
  "login.subtitle": "Sign in to access the financial approval flow",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.withEmail": "or with email",
  "login.google": "Continue with Google",
  // create
  "create.title": "New payment request",
  "create.totalEstimated": "ESTIMATED TOTAL",
  "create.submit": "Submit for approval",
  "create.saveDraft": "Save draft",
  // inbox
  "inbox.title": "Approver inbox",
  "inbox.subtitle": "PAR requests awaiting your decision.",
  "inbox.empty": "No requests pending.",
  // status
  "status.draft": "Draft",
  "status.pending_approval": "Pending approval",
  "status.changes_requested": "Changes requested",
  "status.rejected": "Rejected",
  "status.approved": "Approved",
  "status.in_finance": "In finance",
  "status.reapproval_required": "Reapproval required",
  "status.paid": "Paid",
  "status.cancelled": "Cancelled",
};

const DICTS: Record<Lang, Dict> = { ro, en };

export function getLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "en" ? "en" : "ro";
  } catch {
    return "ro";
  }
}

export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Translate `key` for `lang` (default: current). Falls back to RO, then the key. */
export function t(key: string, lang: Lang = getLang()): string {
  return DICTS[lang][key] ?? DICTS.ro[key] ?? key;
}

/**
 * Hook returning a bound `t` for the current language; re-renders when the language changes.
 */
export function useT(): { t: (key: string) => string; lang: Lang; setLang: (l: Lang) => void } {
  const [lang, setLangState] = useState<Lang>(getLang());
  useEffect(() => {
    const onChange = () => setLangState(getLang());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);
  return {
    t: (key: string) => t(key, lang),
    lang,
    setLang,
  };
}
