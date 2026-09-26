/**
 * CRM-U06 — ce arată un cartonaș din pipeline, ales de fiecare om.
 *
 * Ownerul: „fiecare cartonaș să-l poți personaliza". Titlul (firma / persoana / ce se vinde) era o
 * decizie luată o dată pentru toți; acum fiecare alege ce citește dintr-o privire. Preferința e a
 * omului pe acest browser (localStorage) — nu e o setare a workspace-ului și nu schimbă date.
 */
import type { CrmLead } from "@/lib/api/crm";
import { leadCardLines } from "@/components/crm/format";

export type CardTitleMode = "auto" | "company" | "person" | "deal";

export interface CardPrefs {
  title: CardTitleMode;
  value: boolean;
  subtitle: boolean;
  nextTask: boolean;
  owner: boolean;
  source: boolean;
  createdAt: boolean;
  phone: boolean;
}

export const DEFAULT_CARD_PREFS: CardPrefs = {
  title: "auto",
  value: true,
  subtitle: true,
  nextTask: true,
  owner: true,
  source: false,
  createdAt: false,
  phone: false,
};

const KEY = "crm_card_prefs_v1";

export function loadCardPrefs(): CardPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CARD_PREFS;
    const parsed = JSON.parse(raw) as Partial<CardPrefs>;
    return { ...DEFAULT_CARD_PREFS, ...parsed };
  } catch {
    return DEFAULT_CARD_PREFS;
  }
}

export function saveCardPrefs(prefs: CardPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* navigare privată / stocare blocată — preferința rămâne doar pe sesiunea asta */
  }
}

type CardLead = Pick<CrmLead, "fullName" | "company" | "dealName" | "interestCourse">;

/** Titlul și rândul de sub el, după alegerea omului. */
export function cardLines(lead: CardLead, mode: CardTitleMode): { title: string; subtitle: string | null } {
  const company = lead.company?.trim() || null;
  // Oamenii scriu numele afacerii „Firma SRL — ce vinzi"; sub titlul „Firma" asta ar repeta firma.
  const rawDeal = lead.dealName?.trim() || lead.interestCourse?.trim() || null;
  const deal =
    rawDeal && company && rawDeal.toLowerCase().startsWith(company.toLowerCase())
      ? rawDeal.slice(company.length).replace(/^[\s—–\-·|:]+/, "").trim() || null
      : rawDeal;
  switch (mode) {
    case "company":
      return { title: company ?? lead.fullName, subtitle: deal };
    case "person":
      return { title: lead.fullName, subtitle: company ?? deal };
    case "deal":
      return { title: deal ?? company ?? lead.fullName, subtitle: company ?? (deal ? lead.fullName : null) };
    default:
      return leadCardLines(lead);
  }
}

export const CARD_TITLE_LABELS: Record<CardTitleMode, string> = {
  auto: "Automat",
  company: "Firma",
  person: "Persoana",
  deal: "Ce se vinde",
};

export const CARD_FIELD_LABELS: Record<Exclude<keyof CardPrefs, "title">, string> = {
  value: "Valoarea",
  subtitle: "Rândul de sub titlu",
  nextTask: "Următorul task",
  owner: "Responsabilul",
  source: "Sursa",
  createdAt: "Data intrării",
  phone: "Telefonul",
};
