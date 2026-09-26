/**
 * CONTPLATA-faza-1 — cine emite contul și cum arată.
 *
 * Două surse, fiecare cu treaba ei:
 *  - REchizitele (denumire, IDNO, IBAN, bancă, administrator…) vin din „Datele firmei"
 *    (`fin_org_profile`) — aceeași fișă din care își iau rechizitele ofertele și contractele CRM.
 *    Scrise o dată, apar peste tot; nu le mai cerem a doua oară aici.
 *  - DESIGNUL și NUMEROTAREA (machetă, culoare, logo, serie, format) stau în `seller_profiles`,
 *    tabela care exista deja pentru conturile de plată.
 *
 * Câmpurile vechi de rechizite din `seller_profiles` și IBAN-ul de pe tenant rămân doar rezervă:
 * un workspace care le completase înainte nu vede conturile ieșind brusc goale.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { finOrgProfile } from "../../db/schema/finCore";
import { sellerProfiles } from "../../db/schema/sellerProfiles";
import { tenants } from "../../db/schema/tenants";
import { parSettings } from "../../db/schema/par";
import { knownOrgDefaults } from "../../routes/crmCompanyProfile";
import { logoDataUrl } from "../par/orgLogo";
import {
  DEFAULT_ACCENT,
  PAYMENT_ACCOUNT_LAYOUTS,
  safeAccent,
  type PaymentAccountBranding,
  type PaymentAccountLang,
  type PaymentAccountLayout,
} from "./paymentAccountPdf";
import { DEFAULT_NUMBER_PATTERN, type NumberingSettings } from "./numbering";

export interface PaymentAccountSettings {
  series: string;
  numberPattern: string;
  numberPad: number;
  numberStart: number;
  defaultVatRate: number;
  defaultDueDays: number;
  defaultLang: PaymentAccountLang;
  defaultNotes: string | null;
  layout: PaymentAccountLayout;
  accentColor: string;
  logoUrl: string | null;
  showLogo: boolean;
  showAmountWords: boolean;
  showSignature: boolean;
  showStamp: boolean;
  footerText: string | null;
}

export const DEFAULT_SETTINGS: PaymentAccountSettings = {
  series: "CP",
  numberPattern: DEFAULT_NUMBER_PATTERN,
  numberPad: 4,
  numberStart: 1,
  defaultVatRate: 0,
  defaultDueDays: 5,
  defaultLang: "ro",
  defaultNotes: null,
  layout: "modern",
  accentColor: DEFAULT_ACCENT,
  logoUrl: null,
  showLogo: true,
  showAmountWords: true,
  showSignature: true,
  showStamp: false,
  footerText: null,
};

export interface Issuer {
  name: string;
  idno: string | null;
  vatCode: string | null;
  address: string | null;
  iban: string | null;
  bankName: string | null;
  bic: string | null;
  phone: string | null;
  email: string | null;
  administrator: string | null;
  administratorTitle: string | null;
  /** Logoul organizației, dacă cel din setările contului lipsește (Datele firmei / setările PAR). */
  orgLogoUrl: string | null;
}

const LANGS: PaymentAccountLang[] = ["ro", "ru", "en"];

type SellerRow = typeof sellerProfiles.$inferSelect;

export function settingsFromRow(row: SellerRow | undefined): PaymentAccountSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    series: row.defaultSeries || DEFAULT_SETTINGS.series,
    numberPattern: row.numberPattern || DEFAULT_NUMBER_PATTERN,
    numberPad: row.numberPad ?? 4,
    numberStart: row.numberStart ?? 1,
    defaultVatRate: row.defaultVatRate ?? 0,
    defaultDueDays: row.defaultDueDays ?? 5,
    defaultLang: LANGS.includes(row.defaultLang as PaymentAccountLang) ? (row.defaultLang as PaymentAccountLang) : "ro",
    defaultNotes: row.defaultNotes ?? null,
    layout: PAYMENT_ACCOUNT_LAYOUTS.includes(row.layout as PaymentAccountLayout) ? (row.layout as PaymentAccountLayout) : "modern",
    accentColor: safeAccent(row.accentColor),
    logoUrl: row.logoUrl ?? null,
    showLogo: row.showLogo ?? true,
    showAmountWords: row.showAmountWords ?? true,
    showSignature: row.showSignature ?? true,
    showStamp: row.showStamp ?? false,
    footerText: row.footerText ?? null,
  };
}

export async function loadSellerRow(tenantId: string): Promise<SellerRow | undefined> {
  const [row] = await db.select().from(sellerProfiles).where(eq(sellerProfiles.tenantId, tenantId)).limit(1);
  return row;
}

/** Plătitor de TVA (are cod TVA) → 20%; altfel 0%. Doar punctul de pornire — se schimbă în setări. */
export function defaultVatFor(i: Pick<Issuer, "vatCode">): number {
  return i.vatCode ? 20 : 0;
}

export async function loadSettings(tenantId: string): Promise<PaymentAccountSettings> {
  const row = await loadSellerRow(tenantId);
  if (row) return settingsFromRow(row);
  // Fără setări salvate: același TVA implicit pe care l-ar primi rândul la prima salvare.
  const issuer = await loadIssuer(tenantId);
  return { ...DEFAULT_SETTINGS, defaultVatRate: defaultVatFor(issuer) };
}

export function numberingOf(s: PaymentAccountSettings, series?: string | null): NumberingSettings {
  return { series: series || s.series, pattern: s.numberPattern, pad: s.numberPad, start: s.numberStart };
}

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export async function loadIssuer(tenantId: string): Promise<Issuer> {
  const safeFirst = async <T>(q: Promise<T[]>): Promise<T | undefined> => {
    try {
      return (await q)[0];
    } catch {
      return undefined; // tabelă lipsă pe un workspace vechi — contul iese, doar mai gol
    }
  };
  const [org, legacy, tenant, par] = await Promise.all([
    safeFirst(db.select().from(finOrgProfile).where(eq(finOrgProfile.tenantId, tenantId)).limit(1)),
    loadSellerRow(tenantId).catch(() => undefined),
    safeFirst(db.select({ name: tenants.name, iban: tenants.iban, bic: tenants.bic }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)),
    safeFirst(db.select({ logo: parSettings.orgLogoUrl }).from(parSettings).where(eq(parSettings.tenantId, tenantId)).limit(1)),
  ]);
  const known = org ? undefined : await knownOrgDefaults(tenantId).catch(() => undefined);

  return {
    name: blank(org?.legalName) ?? blank(legacy?.name) ?? blank(known?.legalName) ?? tenant?.name ?? "",
    idno: blank(org?.idno) ?? blank(legacy?.idno) ?? blank(known?.idno),
    vatCode: blank(org?.vatNumber) ?? blank(legacy?.vatCode),
    address: blank(org?.address) ?? blank([legacy?.address, legacy?.city].filter(Boolean).join(", ")),
    iban: blank(org?.iban) ?? blank(legacy?.iban) ?? blank(tenant?.iban),
    bankName: blank(org?.bankName) ?? blank(legacy?.bankName),
    bic: blank(org?.bic) ?? blank(legacy?.bankCode) ?? blank(tenant?.bic),
    phone: blank(org?.phone) ?? blank(legacy?.contactPhone),
    email: blank(org?.email) ?? blank(legacy?.contactEmail),
    administrator: blank(org?.administratorName),
    administratorTitle: blank(org?.administratorTitle),
    orgLogoUrl: blank(org?.logoUrl) ?? blank(par?.logo),
  };
}

/** Ce lipsește ca un client să poată plăti din cont — spus pe nume, pentru avertismentul din editor. */
export function missingIssuerFields(i: Issuer): string[] {
  const out: string[] = [];
  if (!i.name) out.push("Denumirea");
  if (!i.idno) out.push("IDNO");
  if (!i.iban) out.push("IBAN");
  if (!i.bankName) out.push("Banca");
  return out;
}

/** Logoul efectiv: cel pus în setările contului, altfel cel al organizației. */
export function effectiveLogoUrl(s: PaymentAccountSettings, i: Issuer): string | null {
  return s.logoUrl || i.orgLogoUrl || null;
}

export async function brandingFor(
  s: PaymentAccountSettings,
  i: Issuer,
  lang: PaymentAccountLang,
): Promise<PaymentAccountBranding> {
  const logo = s.showLogo ? await logoDataUrl(effectiveLogoUrl(s, i)).catch(() => null) : null;
  return {
    layout: s.layout,
    accentColor: s.accentColor,
    logo,
    showAmountWords: s.showAmountWords,
    showSignature: s.showSignature,
    showStamp: s.showStamp,
    footerText: s.footerText,
    lang,
  };
}
