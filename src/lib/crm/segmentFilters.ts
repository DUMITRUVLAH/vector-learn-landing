/**
 * CRM — filtrele de segmentare, partea PURĂ (cerința 4 din caietul de sarcini).
 *
 * De ce stau separat de `src/lib/api/crm.ts`, deși sunt despre aceleași filtre: acolo trăiesc
 * cererile către server, iar ecranele care se testează îl înlocuiesc cu un dublu (`vi.mock`).
 * O funcție pură ajunsă în modulul de rețea obligă fiecare test de CRM să știe de ea — s-a
 * întâmplat exact asta: adăugarea contorului de segmente a picat opt suite care doar randau
 * pipeline-ul. Regula rămâne: în `api/` doar ce vorbește cu serverul.
 */

/**
 * Filtrele de segmentare. Firmografia (industrie/regiune/mărime/consum) se citește prin firma
 * leadului (`crm_companies`), unde are coloane reale; produsul stă pe lead.
 *
 * Aceleași câmpuri se trimit în ambele vederi (tablă și listă) — un filtru care ar însemna
 * altceva în kanban decât în listă ar fi o capcană, nu o funcție.
 */
export interface CrmSegmentFilters {
  productId?: string;
  industry?: string;
  region?: string;
  companySize?: string;
  minConsumptionKwh?: number;
  maxConsumptionKwh?: number;
  /** Eticheta de pe lead — inclusiv cele venite din import. */
  tag?: string;
  /**
   * Câmpurile personalizate: cheie → valoare. Se serializează ca `cf_<cheie>=valoare`.
   *
   * Astea sunt filtrele care fac utile coloanele importate dintr-un Excel: firmografia fixă de
   * mai sus acoperă doar vocabularul unui singur client („consum kWh"), nu „Cod CAEN" sau
   * „Sursa listei".
   */
  customFields?: Record<string, string>;
}

/** Cheile care SUNT segmentare. Orice altceva (căutare, sortare, vedere) nu intră aici. */
export const CRM_SEGMENT_KEYS = [
  "productId",
  "industry",
  "region",
  "companySize",
  "minConsumptionKwh",
  "maxConsumptionKwh",
  "tag",
] as const satisfies readonly (keyof CrmSegmentFilters)[];

/** Prefixul sub care pleacă spre server filtrele de câmp personalizat. Aceeași constantă,
 *  cuvânt cu cuvânt, ca `CUSTOM_FIELD_QUERY_PREFIX` din `server/lib/crm/segments.ts`. */
export const CUSTOM_FIELD_QUERY_PREFIX = "cf_";

/**
 * Scoate cheile goale ȘI pe cele care nu sunt segmentare — un `?industry=` gol ar fi însemnat pe
 * server „filtrează pe nimic", iar o vizualizare salvată (care poartă și `view`, `sort`, `dir`)
 * și-ar fi trimis toată structura în query string-ul de segment.
 */
export function cleanCrmSegments(segments: CrmSegmentFilters): CrmSegmentFilters {
  const cleaned: CrmSegmentFilters = {};
  for (const key of CRM_SEGMENT_KEYS) {
    const value = segments[key];
    if (value !== undefined && value !== null && (value as unknown) !== "") {
      (cleaned as Record<string, unknown>)[key] = value;
    }
  }
  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(segments.customFields ?? {})) {
    if (typeof value === "string" && value !== "") custom[key] = value;
  }
  if (Object.keys(custom).length > 0) cleaned.customFields = custom;
  return cleaned;
}

/**
 * Filtrele în forma în care le înțelege serverul: chei plate de query string. Folosită și la
 * serializarea în URL, și la trimiterea lor în corpul cererii de repartizare — ca ecranele să nu
 * aibă două gramatici pentru același filtru.
 */
export function crmSegmentParams(segments?: CrmSegmentFilters): Record<string, string> {
  const out: Record<string, string> = {};
  const cleaned = cleanCrmSegments(segments ?? {});
  for (const [key, value] of Object.entries(cleaned)) {
    if (key === "customFields") continue;
    out[key] = String(value);
  }
  for (const [key, value] of Object.entries(cleaned.customFields ?? {})) {
    out[`${CUSTOM_FIELD_QUERY_PREFIX}${key}`] = value;
  }
  return out;
}

/** Serializează filtrele active într-un query string (sare peste cele goale). */
export function crmSegmentQuery(segments?: CrmSegmentFilters): string {
  return new URLSearchParams(crmSegmentParams(segments)).toString();
}

/** Câte filtre de segmentare sunt active — pentru insigna de pe butonul „Segmentare". */
export function crmSegmentCount(segments?: CrmSegmentFilters): number {
  // `customFields` e UN obiect, dar poate ține mai multe filtre: insigna trebuie să le numere pe
  // toate, altfel „3 filtre active" ar scrie „1" și omul n-ar înțelege de ce vede atât de puține
  // rânduri.
  return Object.keys(crmSegmentParams(segments)).length;
}
