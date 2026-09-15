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
import { leads } from "../../db/schema/leads";

export interface LeadSegmentFilters {
  /** Produsul din catalog (`crm_products`) — pe lead, nu pe firmă. */
  productId?: string;
  industry?: string;
  region?: string;
  companySize?: string;
  /** Consum anual (kWh) al firmei — pragurile sunt inclusive. */
  minConsumptionKwh?: number;
  maxConsumptionKwh?: number;
}

/** Cheile pe care le citim din query string — o singură listă, folosită și de client. */
export const SEGMENT_QUERY_KEYS = [
  "productId",
  "industry",
  "region",
  "companySize",
  "minConsumptionKwh",
  "maxConsumptionKwh",
] as const;

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
    f.maxConsumptionKwh !== undefined
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
  const [rows, productRows] = await Promise.all([
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
  return {
    industries: [...industries].sort(collator.compare),
    regions: [...regions].sort(collator.compare),
    sizes: [...sizes].sort(collator.compare),
    products: productRows,
    consumption: min === null || max === null ? null : { min, max },
  };
}
