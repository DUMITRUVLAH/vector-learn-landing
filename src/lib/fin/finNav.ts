/**
 * NAV-01: harta FinDesk — o singură sursă pentru meniul lateral și pentru ecranul de start.
 *
 * Înainte, meniul avea 26 de rânduri plate, iar ecranul de start își ținea propria listă (cu 13
 * carduri marcate „În curând", deși modulele existau). Două liste despărțite derivă: ce adăugai
 * într-una lipsea din cealaltă. Acum ambele citesc de aici. Grupele urmează munca, nu tabelele:
 * ce emiți, ce cheltui, ce vine din bancă, ce datorezi statului, ce raportezi.
 *
 * Decizia completă: backlog/findesk/NAV-REORG.md.
 */
import {
  Banknote,
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileSignature,
  FileSpreadsheet,
  Home,
  Landmark,
  ListChecks,
  Receipt,
  RefreshCw,
  Settings,
  Shield,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ChipTone } from "@/components/ds";

export interface FinNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  tone: ChipTone;
  /** O propoziție pentru cardul de pe ecranul de start. */
  description: string;
  /**
   * Alte rute care aprind același rând. Un modul cu file (Facturare, Extrase) are o rută per filă,
   * dar în meniu e un singur rând — care trebuie să rămână aprins pe oricare filă.
   */
  alsoActive?: string[];
  /** Rândul e ascuns când CRM-ul e pornit: locul lui e acolo (vezi `CRM_FIN_ITEMS`). */
  movesToCrm?: boolean;
  /** Rândul aparține unui modul separat din catalog — apare doar când acel modul e pornit. */
  requiresModule?: "itpark";
}

export interface FinNavGroup {
  /** null = rândurile de sus, fără titlu de grupă. */
  section: string | null;
  items: FinNavItem[];
}

/** Rutele modulului Facturare — o rută per filă. */
export const FIN_INVOICING_ROUTES = {
  invoices: "/business/fin/invoices",
  document: "/business/fin/invoices/document",
  einvoices: "/business/fin/einvoices",
} as const;

/** Aceleași file, montate în CRM — același ecran, cu meniul CRM în jur. */
export const CRM_INVOICING_ROUTES = {
  invoices: "/business/crm/facturi",
  document: "/business/crm/facturi/cont-de-plata",
  einvoices: "/business/crm/facturi/efactura",
} as const;

export const CRM_CONTRACTS_ROUTE = "/business/crm/contracte";

export const FIN_NAV_GROUPS: FinNavGroup[] = [
  {
    section: null,
    items: [
      { label: "Acasă FinDesk", href: "/business/fin/", icon: Home, tone: "violet", description: "Ce e de făcut azi și toate modulele." },
      { label: "Compania mea", href: "/business/fin/company", icon: Building2, tone: "indigo", description: "Profil fiscal, serii de facturare, conturi." },
      { label: "Parteneri", href: "/business/fin/parties", icon: Users, tone: "amber", description: "Clienți și furnizori, IDNO, IBAN, sold." },
    ],
  },
  {
    section: "Facturare",
    items: [
      {
        label: "Facturi",
        href: FIN_INVOICING_ROUTES.invoices,
        icon: Receipt,
        tone: "blue",
        description: "Facturi emise, cont de plată și e-Factura SFS — un singur loc.",
        alsoActive: [FIN_INVOICING_ROUTES.einvoices],
      },
      { label: "Încasări", href: "/business/fin/payments", icon: CreditCard, tone: "emerald", description: "Plățile primite și alocarea lor pe facturi." },
      {
        label: "Contracte",
        href: "/business/fin/agreements",
        icon: FileSignature,
        tone: "violet",
        description: "Contracte recurente cu facturare automată.",
        movesToCrm: true,
      },
    ],
  },
  {
    section: "Cheltuieli",
    items: [
      { label: "Cheltuieli", href: "/business/fin/expenses", icon: DollarSign, tone: "rose", description: "Cheltuieli pe categorii, TVA deductibil." },
      { label: "Invoice Reporting", href: "/business/fin/captures", icon: Zap, tone: "amber", description: "Facturi primite, citite automat din PDF." },
      { label: "Mijloace fixe", href: "/business/fin/assets", icon: Building2, tone: "teal", description: "Registru, amortizare lunară, casare." },
      { label: "Stocuri", href: "/business/fin/inventory", icon: BookOpen, tone: "sky", description: "Intrări, ieșiri și sold pe articole." },
    ],
  },
  {
    section: "Bancă",
    items: [
      {
        label: "Extrase bancare",
        href: "/business/fin/statement",
        icon: FileSpreadsheet,
        tone: "blue",
        description: "Încarcă extrasul și vezi istoricul importurilor.",
      },
      { label: "Conturi bancare", href: "/business/fin/banklink", icon: Banknote, tone: "emerald", description: "Conturile legate și tranzacțiile lor." },
    ],
  },
  {
    section: "Fiscal & conformitate",
    items: [
      { label: "TVA & declarații", href: "/business/fin/tax", icon: ClipboardList, tone: "orange", description: "Calculul TVA și declarațiile lunare." },
      { label: "Reconciliere & TVA import", href: "/business/fin/reconcile", icon: RefreshCw, tone: "teal", description: "Potrivirea extrasului cu facturile, TVA la import." },
      { label: "Salarizare", href: "/business/fin/payroll", icon: Wallet, tone: "emerald", description: "State de plată, brut↔net, contribuții." },
      { label: "Calendar fiscal", href: "/business/fin/calendar", icon: Calendar, tone: "orange", description: "Termene fiscale, plăți datorate, închidere de lună." },
      {
        label: "Rezidenți IT Park",
        href: "/business/fin/itpark",
        icon: Landmark,
        tone: "violet",
        description: "Contracte MITP, declarații și raportare anuală.",
        requiresModule: "itpark",
      },
    ],
  },
  {
    section: "Contabilitate & rapoarte",
    items: [
      { label: "Registru general", href: "/business/fin/ledger", icon: Landmark, tone: "indigo", description: "Venituri, cheltuieli, profit și cashflow." },
      { label: "Buget", href: "/business/fin/budget", icon: BarChart3, tone: "violet", description: "Planificat față de realizat." },
      { label: "Export & rapoarte", href: "/business/fin/export", icon: BarChart3, tone: "sky", description: "Exporturi pentru contabil și rapoarte." },
      { label: "Operațiuni în masă", href: "/business/fin/mass", icon: ListChecks, tone: "rose", description: "Facturi recurente în bloc, import CSV." },
    ],
  },
  {
    section: "Setări",
    items: [
      { label: "Securitate", href: "/business/fin/settings/security", icon: Shield, tone: "rose", description: "GDPR, export de date, retenție." },
      { label: "Audit AI", href: "/business/fin/settings/ai-audit", icon: Settings, tone: "amber", description: "Ce a făcut AI-ul și pe ce date." },
    ],
  },
];

/** Rândurile FinDesk care stau în meniul CRM (grupa „Contracte & facturare"). */
export const CRM_FIN_ITEMS: FinNavItem[] = [
  {
    label: "Contracte",
    href: CRM_CONTRACTS_ROUTE,
    icon: FileSignature,
    tone: "violet",
    description: "Contracte recurente cu facturare automată.",
  },
  {
    label: "Facturi",
    href: CRM_INVOICING_ROUTES.invoices,
    icon: Receipt,
    tone: "blue",
    description: "Facturi emise, cont de plată și e-Factura SFS.",
    alsoActive: [CRM_INVOICING_ROUTES.einvoices],
  },
];

/**
 * Filtrează harta după modulele pornite. O grupă rămasă fără rânduri dispare cu totul — un titlu
 * de grupă fără nimic sub el arată ca un meniu stricat.
 */
export function visibleFinNavGroups(opts: { crmEnabled: boolean; itparkEnabled: boolean }): FinNavGroup[] {
  return FIN_NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => {
      if (it.movesToCrm && opts.crmEnabled) return false;
      if (it.requiresModule === "itpark" && !opts.itparkEnabled) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);
}
