/**
 * CRM — segmentarea bazei de leaduri (cerința 4 din caietul de sarcini).
 *
 * Caietul cere segmentare „după industrie, regiune, mărime, consum, produs, sursă". Sursa și
 * produsul stau pe lead; firmografia stă pe FIRMĂ (`crm_companies`), fiindcă acolo are coloane
 * reale — pe lead ar fi fost text liber și s-ar fi contrazis între două oportunități ale
 * aceleiași firme. Până acum asta însemna că filtrarea pe consum/mărime se putea face doar din
 * modulul Clienți; aici se închide golul: tabla de leaduri filtrează prin firma leadului.
 *
 * De ce `IN (subinterogare)` și nu `JOIN`: un join ar fi putut dubla rânduri la orice relație
 * viitoare firmă↔lead și ar fi cerut rescrierea numărătorilor (`count(*)`) și a sumelor pe
 * pâlnie. Subinterogarea lasă interogarea principală neatinsă — se adaugă doar o condiție.
 *
 * Regula de tenant e dublă, intenționat: subinterogarea filtrează ea însăși pe `tenant_id`,
 * deși leadul e deja al tenantului. Fără asta, un `company_id` scurs din alt workspace (import
 * greșit, migrare veche) ar fi devenit un canal de citire între clienți.
 *
 * Un lead FĂRĂ firmă nu intră în niciun filtru firmografic — și e corect: „arată-mi leadurile
 * din industria energetică" nu înseamnă „arată-mi și pe cele despre care nu știu nimic".
 */
import { and, asc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { db } from "../../db/client";
import { crmCompanies } from "../../db/schema/crmCompanies";
import { crmProducts } from "../../db/schema/crmProducts";
import { leads, leadTags, customFields, leadFieldValues } from "../../db/schema/leads";

export interface LeadSegmentFilters {
  /** Produsul din catalog (`crm_products`) — pe lead, nu pe firmă. */
  productId?: string;
  industry?: string;
  region?: string;
  companySize?: string;
  /** Consum anual (kWh) al firmei — pragurile sunt inclusive. */
  minConsumptionKwh?: number;
  maxConsumptionKwh?: number;
  /** Eticheta de pe lead (`lead_tags`) — inclusiv cele venite din import. */
  tag?: string;
  /**
   * Câmpurile personalizate: cheie → valoare exactă. Vin din query string ca `cf_<cheie>=valoare`.
   *
   * Astea sunt filtrele care fac coloanele importate utile: fără ele, „Cod CAEN" se scrie în bază
   * și nu mai poate fi întrebat nimic despre el. Firmografia fixă de mai sus (industrie, regiune,
   * mărime, consum) acoperă doar vocabularul unui singur client.
   */
  customFields?: Record<string, string>;
}

/** Cheile pe care le citim din query string — o singură listă, folosită și de client. */
export const SEGMENT_QUERY_KEYS = [
  "productId",
  "industry",
  "region",
  "companySize",
  "minConsumptionKwh",
  "maxConsumptionKwh",
  "tag",
] as const;

/** Prefixul sub care vin filtrele de câmp personalizat în query string: `cf_cod_caen=4711`. */
export const CUSTOM_FIELD_QUERY_PREFIX = "cf_";

function trimmed(value: string | undefined, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v || v === "all") return undefined;
  return v.slice(0, max);
}

function positiveNumber(value: string | undefined): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const n = Number(value);
  // `Number("")` e 0, iar `Number("abc")` e NaN: ambele ar fi praguri false. Un prag negativ nu
  // există în consum, deci îl citim ca „nespecificat", nu ca eroare — filtrul nu trebuie să
  // dea 400 pentru o tastare greșită într-un câmp de filtrare.
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** Citește filtrele de segmentare dintr-un query string, ignorând tăcut valorile fără sens. */
export function parseSegmentFilters(q: Record<string, string | undefined>): LeadSegmentFilters {
  const f: LeadSegmentFilters = {};
  const productId = trimmed(q.productId, 36);
  // Doar un UUID poate fi un id de produs; altceva ar întoarce oricum zero rânduri, dar
  // preferăm să nu trimitem gunoi în interogare.
  if (productId && /^[0-9a-f-]{36}$/i.test(productId)) f.productId = productId;
  f.industry = trimmed(q.industry, 120);
  f.region = trimmed(q.region, 120);
  f.companySize = trimmed(q.companySize, 40);
  f.minConsumptionKwh = positiveNumber(q.minConsumptionKwh);
  f.maxConsumptionKwh = positiveNumber(q.maxConsumptionKwh);
  f.tag = trimmed(q.tag, 100);

  const custom: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(q)) {
    if (!rawKey.startsWith(CUSTOM_FIELD_QUERY_PREFIX)) continue;
    const key = rawKey.slice(CUSTOM_FIELD_QUERY_PREFIX.length);
    // Aceeași regulă de cheie ca la definirea câmpului; orice altceva e gunoi din query string.
    if (!/^[a-z0-9_]{1,64}$/.test(key)) continue;
    const value = trimmed(rawValue, 1000);
    if (value !== undefined) custom[key] = value;
  }
  if (Object.keys(custom).length > 0) f.customFields = custom;

  return f;
}

/** Adevărat dacă măcar un filtru e activ (altfel nu atingem deloc `crm_companies`). */
export function hasSegmentFilters(f: LeadSegmentFilters): boolean {
  return (
    f.productId !== undefined ||
    f.industry !== undefined ||
    f.region !== undefined ||
    f.companySize !== undefined ||
    f.minConsumptionKwh !== undefined ||
    f.maxConsumptionKwh !== undefined ||
    f.tag !== undefined ||
    (f.customFields !== undefined && Object.keys(f.customFields).length > 0)
  );
}

/** Adevărat dacă e nevoie de firma leadului (deci de tabela `crm_companies`). */
export function hasFirmographicFilters(f: LeadSegmentFilters): boolean {
  return (
    f.industry !== undefined ||
    f.region !== undefined ||
    f.companySize !== undefined ||
    f.minConsumptionKwh !== undefined ||
    f.maxConsumptionKwh !== undefined
  );
}

/**
 * Condițiile SQL corespunzătoare filtrelor. Se adaugă peste `where`-ul existent al apelantului
 * (care are deja `tenant_id` și pâlnia) — nu înlocuiesc nimic.
 */
export function segmentConditions(tenantId: string, f: LeadSegmentFilters): SQL[] {
  const conditions: SQL[] = [];

  if (f.productId) conditions.push(eq(leads.productId, f.productId));

  // Eticheta: subinterogare, nu join — un lead cu trei etichete ar apărea de trei ori într-un
  // join, iar numărătoarea din ecranul de repartizare ar promite mai multe contacte decât există.
  if (f.tag) {
    const tagged = db
      .select({ id: leadTags.leadId })
      .from(leadTags)
      .where(and(eq(leadTags.tenantId, tenantId), eq(leadTags.tag, f.tag)));
    conditions.push(inArray(leads.id, tagged));
  }

  // Câmpurile personalizate: câte o subinterogare per câmp, deci condițiile se adună cu ȘI —
  // „CAEN 4711 ȘI Regiune Nord", nu „oricare dintre ele".
  for (const [key, value] of Object.entries(f.customFields ?? {})) {
    const matching = db
      .select({ id: leadFieldValues.leadId })
      .from(leadFieldValues)
      .innerJoin(customFields, eq(customFields.id, leadFieldValues.fieldId))
      .where(
        and(
          eq(leadFieldValues.tenantId, tenantId),
          eq(customFields.tenantId, tenantId),
          eq(customFields.key, key),
          eq(leadFieldValues.value, value)
        )
      );
    conditions.push(inArray(leads.id, matching));
  }

  if (!hasFirmographicFilters(f)) return conditions;

  const companyWhere: SQL[] = [eq(crmCompanies.tenantId, tenantId)];
  if (f.industry) companyWhere.push(eq(crmCompanies.industry, f.industry));
  if (f.region) companyWhere.push(eq(crmCompanies.region, f.region));
  if (f.companySize) companyWhere.push(eq(crmCompanies.companySize, f.companySize));
  // `annual_consumption_kwh` e `numeric`: drizzle îl citește ca string, dar comparația se face în
  // baza de date, pe tipul numeric — deci „900" nu e mai mare decât „1000", cum ar fi fost dacă
  // am fi comparat textul.
  if (f.minConsumptionKwh !== undefined) {
    companyWhere.push(gte(crmCompanies.annualConsumptionKwh, String(f.minConsumptionKwh)));
  }
  if (f.maxConsumptionKwh !== undefined) {
    companyWhere.push(lte(crmCompanies.annualConsumptionKwh, String(f.maxConsumptionKwh)));
  }

  const matching = db
    .select({ id: crmCompanies.id })
    .from(crmCompanies)
    .where(and(...companyWhere));

  conditions.push(inArray(leads.companyId, matching));
  return conditions;
}

export interface LeadSegmentOptions {
  industries: string[];
  regions: string[];
  sizes: string[];
  products: { id: string; name: string }[];
  /** Etichetele folosite efectiv în workspace. */
  tags: string[];
  /** Câmpurile personalizate, fiecare cu valorile care există deja în bază. */
  customFields: { key: string; label: string; values: string[] }[];
  /** Intervalul real de consum din baza tenantului — `null` când nicio firmă n-are cifra. */
  consumption: { min: number; max: number } | null;
}

/**
 * Valorile care CHIAR există în baza tenantului, pentru select-urile din interfață.
 *
 * De ce nu o listă fixă de industrii: nomenclatorul diferă de la un client la altul (energie,
 * educație, servicii), iar o listă de produs ar fi obligat pe toată lumea la vocabularul
 * altcuiva. Se citesc valorile distincte introduse deja — un filtru nu trebuie să ofere
 * niciodată o opțiune care întoarce zero rânduri.
 */
export async function leadSegmentOptions(tenantId: string): Promise<LeadSegmentOptions> {
  const [rows, productRows, tagRows, fieldValueRows] = await Promise.all([
    db
      .select({
        industry: crmCompanies.industry,
        region: crmCompanies.region,
        companySize: crmCompanies.companySize,
        consumption: crmCompanies.annualConsumptionKwh,
      })
      .from(crmCompanies)
      .where(eq(crmCompanies.tenantId, tenantId)),
    // Produsele intră în aceeași cerere ca firmografia: bara de filtre le cere pe toate
    // deodată, iar pool-ul de conexiuni de pe serverless are `max: 3`.
    db
      .select({ id: crmProducts.id, name: crmProducts.name })
      .from(crmProducts)
      .where(and(eq(crmProducts.tenantId, tenantId), eq(crmProducts.isActive, true)))
      .orderBy(asc(crmProducts.orderIndex), asc(crmProducts.name)),
    // Etichetele și valorile personalizate FOLOSITE, nu cele definite: un filtru nu trebuie să
    // ofere niciodată o opțiune care întoarce zero rânduri.
    db
      .selectDistinct({ tag: leadTags.tag })
      .from(leadTags)
      .where(eq(leadTags.tenantId, tenantId)),
    db
      .selectDistinct({ key: customFields.key, label: customFields.label, value: leadFieldValues.value })
      .from(leadFieldValues)
      .innerJoin(customFields, eq(customFields.id, leadFieldValues.fieldId))
      .where(and(eq(leadFieldValues.tenantId, tenantId), eq(customFields.tenantId, tenantId))),
  ]);

  const industries = new Set<string>();
  const regions = new Set<string>();
  const sizes = new Set<string>();
  let min: number | null = null;
  let max: number | null = null;

  for (const row of rows) {
    if (row.industry?.trim()) industries.add(row.industry.trim());
    if (row.region?.trim()) regions.add(row.region.trim());
    if (row.companySize?.trim()) sizes.add(row.companySize.trim());
    const kwh = row.consumption === null || row.consumption === undefined ? null : Number(row.consumption);
    if (kwh !== null && Number.isFinite(kwh)) {
      min = min === null ? kwh : Math.min(min, kwh);
      max = max === null ? kwh : Math.max(max, kwh);
    }
  }

  const collator = new Intl.Collator("ro");

  const byKey = new Map<string, { key: string; label: string; values: Set<string> }>();
  for (const row of fieldValueRows) {
    if (!row.value?.trim()) continue;
    const entry = byKey.get(row.key) ?? { key: row.key, label: row.label, values: new Set<string>() };
    entry.values.add(row.value.trim());
    byKey.set(row.key, entry);
  }

  return {
    industries: [...industries].sort(collator.compare),
    regions: [...regions].sort(collator.compare),
    sizes: [...sizes].sort(collator.compare),
    products: productRows,
    consumption: min === null || max === null ? null : { min, max },
    tags: tagRows
      .map((t) => t.tag)
      .filter((t): t is string => Boolean(t?.trim()))
      .sort(collator.compare),
    customFields: [...byKey.values()]
      .map((f) => ({ key: f.key, label: f.label, values: [...f.values].sort(collator.compare) }))
      .sort((a, b) => collator.compare(a.label, b.label)),
  };
}
